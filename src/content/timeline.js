import { KEY } from '../core/constants.js';
import { write, read } from '../core/storage.js';
import { normalizeLang } from '../core/languages.js';
import { lang as uiLang } from '../core/i18n.js';
import { judge } from './verdict.js';
import * as dom from './dom.js';
import * as surface from './surface.js';
import * as plaque from './plaque.js';
import * as stack from './stack.js';
import * as looks from './looks.js';
import * as fold from './fold.js';
import * as ledger from './ledger.js';
import * as zone from './zone.js';
import * as translator from './translate.js';
import * as clutter from './clutter.js';
import * as quickbar from './quickbar.js';
import * as viewer from './viewer.js';
import * as followers from './followers.js';
import * as videos from './videos.js';

const RECHECK_MS = 30_000;
const LANGS_FLUSH_MS = 10_000;

const SWEEP_THROTTLE_MS = 200;

const PASS = { hidden: false, kind: null, reason: null };

let settings = null;
let observer = null;
let pending = false;
let urgent = false;
let lastSweep = 0;
let curating = false;
let frozen = false;
let wasCurating = false;
let arrivals = 0;

function noticeMedia(event) {
  if (event.target?.closest?.(dom.SEL.cell)) arrivals += 1;
}
let where = surface.SURFACE.other;
let listeners = new Set();

const hiddenHere = new Set();

const forced = new Set();
let forceAll = false;

const seenLangs = new Map();
let langsDirty = false;
let langsTimer = null;

export function onStats(handler) {
  listeners.add(handler);
  handler(stats());
  return () => listeners.delete(handler);
}

function stats() {
  return {
    hidden: hiddenHere.size,
    curating,
    surface: where,
    langs: [...seenLangs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count })),
  };
}

function emit() {
  const snapshot = stats();
  listeners.forEach((handler) => handler(snapshot));
}

function look() {
  where = surface.current().kind;
  curating = surface.curates(where);
}

function noteLang(id, code) {
  if (ledger.get(id)?.counted) return;
  ledger.note(id, { counted: true });
  seenLangs.set(code, (seenLangs.get(code) || 0) + 1);
  langsDirty = true;
  if (!langsTimer) {
    langsTimer = setTimeout(flushLangs, LANGS_FLUSH_MS);
  }
}

async function flushLangs() {
  langsTimer = null;
  if (!langsDirty) return;
  langsDirty = false;
  await write(KEY.seenLangs, Object.fromEntries(seenLangs));
}

async function restoreLangs() {
  const saved = await read(KEY.seenLangs, {});
  for (const [code, count] of Object.entries(saved)) {
    seenLangs.set(code, Math.min(count, 999));
  }
}

function readCell(cell, curate) {
  const box = cell.getBoundingClientRect();
  const article = cell.querySelector(dom.SEL.tweet);
  const current = looks.read(cell);
  const where = zone.of(box);
  const still = where === 'seen' && !forced.has(cell) && !zone.fresh(cell);

  const id = article && dom.tweetIdOf(article);
  if (!id) {
    const clear = !article && (cell.hasAttribute('data-tempo-junk') || box.height < 1);
    return { cell, where, desc: { key: null, kind: clear ? 'clear' : 'wall', look: current } };
  }

  const lang = normalizeLang(dom.langOf(article));
  if (dom.textElOf(article)) noteLang(id, lang);
  const verdict = curate ? judge({ createdAt: dom.createdAtOf(article), lang }, settings) : PASS;
  const memo = ledger.get(id) || {};
  const reached = Boolean(memo.reached) || zone.of(box) !== 'ahead';
  if (reached && !memo.reached) ledger.note(id, { reached: true });

  return {
    cell,
    where,
    article,
    id,
    verdict,
    desc: {
      key: id,
      kind: 'tweet',
      look: current,
      hide: verdict.hidden,
      hand: Boolean(memo.hand),
      reached,
      still,
      group: memo.group ?? null,
    },
  };
}

function plaqueData(row) {
  const memo = ledger.get(row.id);
  const reason = row.verdict.hidden ? row.verdict.reason : memo?.plaque?.reason;
  if (memo?.plaque && memo.plaque.reason === reason) return memo.plaque;
  return { reason: reason || '', ...dom.previewOf(row.article) };
}

function paintCell(row, placed) {
  const { cell } = row;
  if (placed.look === fold.LOOK.full) {
    looks.paint(cell, placed.look);
  } else {
    const data = plaqueData(row);
    plaque.ensure(cell, data, () => toggleCell(cell));
    ledger.note(row.id, { plaque: data });
    looks.paint(cell, placed.look);
  }
  ledger.note(row.id, { look: placed.look, group: placed.group ?? null });
  if (fold.folded(placed.look)) hiddenHere.add(row.id);
  else hiddenHere.delete(row.id);
}

function commonReason(rows) {
  let one = null;
  for (const row of rows) {
    const reason = ledger.get(row.id)?.plaque?.reason ?? '';
    if (one === null) one = reason;
    else if (one !== reason) return null;
  }
  return one;
}

function nameOf(row) {
  return dom.nameOf(row.article) || dom.handleOf(row.article) || '';
}

function paintRow(head, placed, rows) {
  const members = placed.members.map((index) => rows[index]);
  const reason = commonReason(members);
  const shown = members.slice(0, stack.NAMES_SHOWN);
  const signature = `${uiLang()}:${placed.count}:${reason ?? '*'}:${shown.map((row) => row.id).join(',')}`;
  const content = () => ({ count: placed.count, names: shown.map(nameOf).filter(Boolean), reason });
  stack.mount(head.cell, signature, content, () => toggleStack(head.cell));
  ledger.note(head.id, { row: { signature, ...content() } });
}

function toggleCell(cell) {
  const article = cell.querySelector(dom.SEL.tweet);
  const id = article && dom.tweetIdOf(article);
  if (!id) return;
  ledger.note(id, { hand: !ledger.get(id)?.hand });
  forced.add(cell);
  sweep();
}

function toggleStack(head) {
  const article = head.querySelector(dom.SEL.tweet);
  const group = article && ledger.get(dom.tweetIdOf(article))?.group;
  if (!group) return;
  ledger.toggle(group);
  for (const cell of document.querySelectorAll(dom.SEL.cell)) {
    const inner = cell.querySelector(dom.SEL.tweet);
    if (inner && ledger.get(dom.tweetIdOf(inner))?.group === group) forced.add(cell);
  }
  sweep();
}

function sweep() {
  pending = false;
  urgent = false;
  lastSweep = Date.now();
  if (!settings) return;

  const view = surface.current();
  frozen = view.frozen;
  const curate = surface.curates(view.kind) && !frozen;

  const cells = [...document.querySelectorAll(dom.SEL.cell)];

  const beneath = surface.curates(view.kind);
  if (frozen) {
    for (const cell of cells) {
      const article = cell.querySelector(dom.SEL.tweet);
      if (!article) continue;
      queueTranslation(article);
      quickbar.attach(article, { curate: beneath && !viewer.inPanel(article) });
    }
    quickbar.attachViewer({ curate: beneath });
    report(view.kind);
    return;
  }
  quickbar.attachViewer();

  if (wasCurating && !curate) forceAll = true;
  wasCurating = curate;

  const forcing = forceAll;
  if (forceAll) {
    cells.forEach((cell) => forced.add(cell));
    forceAll = false;
  }

  const rows = cells.map((cell) => readCell(cell, curate));
  const descs = rows.map((row) => row.desc);
  const options = { isOpen: ledger.isOpen };
  const placed = fold.plan(descs, options);

  const paced = fold.pace(descs, placed, rows.map((row) => row.where === 'passed'), { busy: arrivals > 0 });
  arrivals = 0;
  const shown = placed.map((out, index) => {
    const row = rows[index];
    if (row.desc.kind !== 'tweet' || !row.id) return row.desc.look;
    if (fold.reshapes(row.desc.look, out.look) && !paced.now.has(index)) return row.desc.look;
    paintCell(row, out);
    return out.look;
  });
  rows.forEach((row, index) => {
    const out = placed[index];
    if (out.members && out.look === shown[index] &&
      (out.look === fold.LOOK.head || out.look === fold.LOOK.headOpen)) {
      paintRow(row, out, rows);
    }
  });

  const aboveBusy = [...paced.now].some((index) => rows[index].where === 'passed');
  const junkHeld = clutter.apply({ force: forcing, calm: aboveBusy });

  for (const index of fold.deferred(descs, placed, options)) zone.awaitLeave(rows[index].cell);
  for (const row of rows) {
    if (row.desc.hide && !row.desc.reached) zone.awaitReach(row.cell);
  }

  rows.forEach((row, index) => {
    if (!row.article) return;
    if (shown[index] !== fold.LOOK.full && shown[index] !== fold.LOOK.open) return;
    queueTranslation(row.article);
    quickbar.attach(row.article, { curate });
  });

  rows.forEach((row, index) => {
    if (shown[index] === placed[index].look) forced.delete(row.cell);
  });
  for (const cell of forced) if (!cell.isConnected) forced.delete(cell);
  if (paced.held || junkHeld) scheduleSoon();
  report(view.kind);
}

let reported = -1;

function report(kind) {
  if (reported === hiddenHere.size && kind === where) return;
  reported = hiddenHere.size;
  where = kind;
  curating = surface.curates(kind);
  emit();
}

function queueTranslation(article) {
  for (const textEl of dom.textElsOf(article)) translator.watch(textEl);
}

function schedule({ soon = false } = {}) {
  if (pending && (!soon || urgent)) return;
  if (soon) urgent = true;
  pending = true;
  const due = urgent ? 0 : Math.max(0, SWEEP_THROTTLE_MS - (Date.now() - lastSweep));
  const run = () => requestAnimationFrame(() => {
    if (pending) sweep();
  });
  if (due) setTimeout(run, due);
  else run();
}

const scheduleSoon = () => schedule({ soon: true });

function arrive(cell) {
  arrivals += 1;
  const view = surface.current();
  if (view.frozen || !surface.curates(view.kind)) return;
  const article = cell.querySelector(dom.SEL.tweet);
  if (!article) {
    clutter.claim(cell);
    return;
  }
  const id = dom.tweetIdOf(article);
  if (!id) return;
  zone.restored(cell);
  const memo = ledger.get(id);
  if (memo?.look) {
    if (memo.look === fold.LOOK.full) return;
    if (memo.plaque) plaque.ensure(cell, memo.plaque, () => toggleCell(cell));
    if ((memo.look === fold.LOOK.head || memo.look === fold.LOOK.headOpen) && memo.row) {
      const { signature, ...content } = memo.row;
      stack.mount(cell, signature, () => content, () => toggleStack(cell));
    }
    looks.paint(cell, memo.look);
    return;
  }
  if (memo?.hand || !settings) return;
  if (zone.of(cell.getBoundingClientRect()) === 'ahead') return;
  const lang = normalizeLang(dom.langOf(article));
  const verdict = judge({ createdAt: dom.createdAtOf(article), lang }, settings);
  if (!verdict.hidden) return;
  const data = { reason: verdict.reason, ...dom.previewOf(article) };
  plaque.ensure(cell, data, () => toggleCell(cell));
  looks.paint(cell, fold.LOOK.plaque);
  ledger.note(id, { look: fold.LOOK.plaque, plaque: data, reached: true, group: null });
  hiddenHere.add(id);
}

function noticeCells(node) {
  if (node.matches(dom.SEL.cell)) {
    arrive(node);
    return true;
  }
  const inside = node.querySelectorAll(dom.SEL.cell);
  if (inside.length) {
    inside.forEach(arrive);
    return true;
  }
  if (node.matches(dom.SEL.tweet) || node.querySelector(dom.SEL.tweet)) {
    const cell = node.closest(dom.SEL.cell);
    if (cell) {
      arrive(cell);
      return true;
    }
  }
  return false;
}

export async function start(initialSettings) {
  settings = initialSettings;
  look();
  await restoreLangs();
  plaque.ensurePageStyles();
  translator.configure(settings);
  clutter.configure(settings);
  quickbar.configure(settings);
  quickbar.onNeedsSweep(schedule);
  followers.onUpdate(schedule);
  videos.onUpdate(schedule);
  zone.onChange(scheduleSoon);

  document.querySelectorAll(dom.SEL.cell).forEach((cell) => zone.mounted(cell));

  observer = new MutationObserver((records) => {
    let cellsCame = false;
    let other = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.hasAttribute?.('data-tempo')) continue;
        if (noticeCells(node)) cellsCame = true;
        else other = true;
      }
    }
    if (cellsCame) scheduleSoon();
    else if (other) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('load', noticeMedia, true);
  document.addEventListener('loadedmetadata', noticeMedia, true);

  setInterval(schedule, RECHECK_MS);
  scheduleSoon();
}

export function update(nextSettings) {
  const before = settings;
  settings = nextSettings;

  const translationChanged = translator.configure(settings);
  const clutterChanged = clutter.configure(settings);
  const quickChanged = quickbar.configure(settings);
  const filtersChanged =
    JSON.stringify(before?.age) !== JSON.stringify(settings.age) ||
    JSON.stringify(before?.langs) !== JSON.stringify(settings.langs);

  if (filtersChanged) {
    ledger.forgetLooks();
    forceAll = true;
  }
  if (clutterChanged) forceAll = true;
  if (filtersChanged || translationChanged || clutterChanged || quickChanged) scheduleSoon();
}

export function resetForNavigation({ full = false } = {}) {
  if (full) {
    quickbar.release();
  }
  quickbar.forgetLayout();
  hiddenHere.clear();
  reported = -1;
  look();
  emit();
  scheduleSoon();
}
