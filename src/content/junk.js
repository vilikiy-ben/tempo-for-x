import { MSG, KEY } from '../core/constants.js';
import { PACKAGING, RETRYABLE_JUNK, SHOWN_FROM, current, readable } from '../core/junk.js';
import { SEL } from './dom.js';
import { has, locale, t } from '../core/i18n.js';
import * as context from './context.js';
import * as dom from './dom.js';
import * as gutter from './gutter.js';
import * as popover from './popover.js';

const WINDOW = 'data-tempo-rating';

const ANSWER_MS = 30000;

const GAUGE =
  'M2.5 15a9.5 9.5 0 0 1 19 0h-3a6.5 6.5 0 0 0-13 0h-3zM11.12 14.34 16.8 8.6l-3.92 7.06zM14.2 15a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z';

const TONE_COLOR = {
  good: 'var(--tempo-blue-lift)',
  meh: 'var(--tempo-ink-soft)',
  junk: 'var(--tempo-red)',
};

export const ACTION = {
  id: 'junk',
  title: 'junk.action',
  color: TONE_COLOR.good,
  path: GAUGE,
  own: true,
  open: press,
};

let enabled = false;
let hasKey = false;
let wanted = false;
let pictures = false;

let verdicts = new Map();
let listening = false;
let onChanged = null;

let open = null;

function adoptScores(raw) {
  verdicts = new Map(Object.entries(raw || {}).filter(([, verdict]) => current(verdict)));
}

async function refreshKey() {
  try {
    const reply = await chrome.runtime.sendMessage({ type: MSG.jevState });
    hasKey = Boolean(reply?.ok && reply.data?.hasKey);
  } catch {
    hasKey = false;
  }
  enabled = wanted && hasKey;
}

function listen() {
  if (listening) return;
  listening = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEY.junkScores]) {
      adoptScores(changes[KEY.junkScores].newValue);
      onChanged?.();
    }
    if (changes[KEY.jevKey]) {
      const before = enabled;
      refreshKey().then(() => {
        if (before !== enabled) onChanged?.();
      });
    }
  });
}

export function onNeedsSweep(handler) {
  onChanged = handler;
}

export function isEnabled() {
  return enabled;
}

export function worth(article) {
  if (verdicts.has(dom.tweetIdOf(article))) return true;
  if (dom.textElOf(article)?.textContent?.trim()) return true;
  if (dom.quoteRootOf(article)) return true;
  return pictures && Boolean(article.querySelector(SEL.media));
}

function glyph() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', GAUGE);
  svg.append(shape);
  return svg;
}

export function paint(bar, article) {
  const button = bar.querySelector(':scope > [data-act="junk"]');
  if (!button) return;
  const verdict = verdicts.get(dom.tweetIdOf(article));
  const mark = verdict ? `${verdict.score}|${verdict.tone}` : '';
  if (button.dataset.mark === mark && button.dataset.lang === locale()) return;
  button.dataset.mark = mark;
  button.dataset.lang = locale();

  const tip = button.querySelector('.tempo-quick__tip');
  const face = button.querySelector(':scope > svg, :scope > .tempo-quick__score');
  if (verdict) {
    const score = document.createElement('span');
    score.className = 'tempo-quick__score';
    score.setAttribute('aria-hidden', 'true');
    score.textContent = String(verdict.score);
    face?.replaceWith(score);
    button.dataset.tone = verdict.tone;
    button.style.setProperty('--tempo-act', TONE_COLOR[verdict.tone] || TONE_COLOR.meh);
    const says = `${t(verdict.level)} · ${t('junk.scored', { n: verdict.score })}`;
    button.setAttribute('aria-label', says);
    if (tip) tip.textContent = says;
  } else {
    face?.replaceWith(glyph());
    delete button.dataset.tone;
    button.style.setProperty('--tempo-act', TONE_COLOR.good);
    button.setAttribute('aria-label', t(ACTION.title));
    if (tip) tip.textContent = t(ACTION.title);
  }
}

const points = (value) =>
  `−${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1, minimumFractionDigits: value < 10 ? 1 : 0 }).format(value)}`;

function build() {
  const box = document.createElement('div');
  box.className = 'tempo-junk';
  box.setAttribute('data-tempo', '');
  box.setAttribute(WINDOW, '');
  box.setAttribute(popover.WINDOW, '');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', t('junk.window'));

  const body = document.createElement('div');
  body.className = 'tempo-junk__body';

  const live = document.createElement('span');
  live.className = 'tempo-junk__live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  box.append(body, live);
  const swallow = (event) => event.stopPropagation();
  box.addEventListener('pointerdown', swallow);
  box.addEventListener('click', swallow);
  return { box, body, live };
}

function meter(score) {
  const row = document.createElement('div');
  row.className = 'tempo-junk__meter';
  row.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= 10; i += 1) {
    const cell = document.createElement('i');
    cell.style.setProperty('--i', String(i));
    if (i <= score) cell.dataset.on = 'true';
    row.append(cell);
  }
  return row;
}

function part(key) {
  const head = document.createElement('div');
  head.className = 'tempo-junk__part';
  head.textContent = t(key);
  return head;
}

function row(key, fill, value, tone) {
  const item = document.createElement('li');
  item.className = 'tempo-junk__signal';
  item.dataset.key = key;
  item.dataset.tone = tone;

  const name = document.createElement('span');
  name.className = 'tempo-junk__name';
  name.textContent = t(`junk.signal.${key}`);
  const track = document.createElement('span');
  track.className = 'tempo-junk__track';
  const bar = document.createElement('i');
  bar.style.setProperty('--p', String(Math.round(fill * 100) / 100));
  track.append(bar);
  const share = document.createElement('span');
  share.className = 'tempo-junk__share';
  share.textContent = value;

  item.append(name, track, share);
  return item;
}

function list(rows) {
  const node = document.createElement('ul');
  node.className = 'tempo-junk__signals';
  node.append(...rows);
  return node;
}

function paintVerdict(view, verdict) {
  const { box, body, live } = view;
  box.dataset.state = 'done';
  box.dataset.tone = verdict.tone;
  body.replaceChildren();

  const head = document.createElement('div');
  head.className = 'tempo-junk__head';
  const score = document.createElement('span');
  score.className = 'tempo-junk__score';
  score.textContent = String(verdict.score);
  const of = document.createElement('span');
  of.className = 'tempo-junk__of';
  of.textContent = t('junk.of');
  const word = document.createElement('span');
  word.className = 'tempo-junk__word';
  word.textContent = t(verdict.level);
  head.append(score, of, word);

  const value = verdict.value || {};
  const useful = list([
    row('info', value.info ?? 0, t(`junk.info.${value.infoLevel ?? 0}`), 'good'),
    row('insight', value.insight ?? 0, t(`junk.insight.${value.insightLevel ?? 0}`), 'good'),
  ]);

  const losses = verdict.losses || {};
  const costly = PACKAGING.filter((key) => (losses[key] ?? 0) >= SHOWN_FROM).sort((a, b) => losses[b] - losses[a]);
  const cost = costly.length
    ? list(costly.map((key) => row(key, verdict.signals?.[key] ?? 0, points(losses[key]), verdict.reasons.includes(key) ? 'hot' : 'quiet')))
    : Object.assign(document.createElement('p'), { className: 'tempo-junk__clean', textContent: t('junk.clean') });

  body.append(head, meter(verdict.score), part('junk.part.value'), useful, part('junk.part.cost'), cost);
  if (verdict.noted) {
    const noted = document.createElement('p');
    noted.className = 'tempo-junk__noted';
    noted.textContent = t('junk.noted');
    body.append(noted);
  }
  body.append(...seenLine(verdict, view.again));

  const why = verdict.reasons.map((key) => t(`junk.signal.${key}`).toLowerCase());
  live.textContent = `${t(verdict.level)}, ${t('junk.scored', { n: verdict.score })}${why.length ? `: ${why.join(', ')}` : ''}`;
}

function seenLine(verdict, again) {
  const note = verdict.pictures;
  if (!note?.total) return [];
  const line = document.createElement('p');
  line.className = 'tempo-junk__seen';
  line.dataset.why = note.why;
  line.textContent = t(`junk.seen.${note.why}`, { n: note.seen || note.total, total: note.total });
  if (!(pictures && note.seen === 0 && again)) return [line];
  const look = document.createElement('button');
  look.className = 'tempo-junk__again tempo-junk__look';
  look.type = 'button';
  look.textContent = t('junk.seen.look');
  look.addEventListener('click', again);
  return [line, look];
}

function paintError(view, code, retry) {
  const { box, body, live } = view;
  box.dataset.state = 'error';
  const text = document.createElement('p');
  text.className = 'tempo-junk__error';
  const key = `junk.error.${code}`;
  text.textContent = t(has(key) ? key : 'junk.error.failed');
  body.replaceChildren(text);
  live.textContent = text.textContent;
  if (!RETRYABLE_JUNK.has(code)) return;
  const again = document.createElement('button');
  again.className = 'tempo-junk__again';
  again.type = 'button';
  again.textContent = t('explain.again');
  again.addEventListener('click', retry);
  body.append(again);
}

function closeWindow({ silent = false } = {}) {
  if (!open) return;
  const { box, button, article } = open;
  open = null;
  button.setAttribute('aria-expanded', 'false');
  button.dataset.state = 'idle';
  if (silent) box.remove();
  else popover.fade(box);
  popover.unlift(article);
}

function ask(payload) {
  return Promise.race([
    chrome.runtime.sendMessage({ type: MSG.junkScore, payload }).then(
      (reply) => (reply?.ok ? reply.data : { ok: false, code: 'failed' }),
      () => ({ ok: false, code: 'offline' }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, code: 'offline' }), ANSWER_MS)),
  ]);
}

async function run(article, id, button, { fresh = false } = {}) {
  const view = build();
  popover.lift(article);
  const host = popover.hostOf(article, button);
  gutter.anchor(host);
  popover.place(view.box, host, button);
  host.append(view.box);
  requestAnimationFrame(() => {
    view.box.dataset.shown = 'true';
  });
  button.setAttribute('aria-expanded', 'true');
  button.dataset.state = 'busy';
  open = { box: view.box, button, article, id };

  view.again = () => {
    closeWindow({ silent: true });
    run(article, id, button, { fresh: true });
  };

  const known = !fresh && verdicts.get(id);
  if (known) {
    paintVerdict(view, known);
    return;
  }

  view.box.dataset.state = 'waiting';
  view.live.textContent = t('junk.weighing');
  view.body.replaceChildren(meter(0));

  const { post } = await context.readPost(article);
  if (open?.box !== view.box) return;
  if (!readable(post, { pictures })) {
    paintError(view, 'unreadable');
    return;
  }

  const reply = await ask({ id, post, fresh });
  if (open?.box !== view.box) return;
  if (!reply.ok) {
    paintError(view, reply.code || 'failed', view.again);
    return;
  }
  verdicts.set(id, reply.verdict);
  const bar = button.closest('[data-tempo-quick]');
  if (bar) paint(bar, article);
  paintVerdict(view, reply.verdict);
}

export function press(article, button) {
  if (open?.button === button) {
    closeWindow();
    return;
  }
  closeWindow();
  const id = dom.tweetIdOf(article);
  if (!id) return;
  run(article, id, button);
}

export function recheck(article) {
  if (open?.article !== article) return;
  if (open.id !== dom.tweetIdOf(article) || !gutter.drawn(article) || !open.box.isConnected) {
    closeWindow({ silent: true });
  }
}

export function release() {
  closeWindow({ silent: true });
  for (const box of document.querySelectorAll(`[${WINDOW}]`)) box.remove();
  popover.unliftAll();
}

export async function configure(settings) {
  const next = Boolean(settings.quick?.enabled && settings.jev?.enabled);
  const before = enabled;
  const looked = pictures;
  wanted = next;
  pictures = settings.jev?.images === true;
  if (next) {
    listen();
    const [bag] = await Promise.all([
      chrome.storage.local.get(KEY.junkScores).catch(() => ({})),
      refreshKey(),
    ]);
    adoptScores(bag[KEY.junkScores]);
  } else {
    enabled = false;
  }
  if (!enabled) release();
  return before !== enabled || (enabled && looked !== pictures);
}

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!open) return;
    const path = event.composedPath?.() || [];
    if (path.includes(open.box) || path.includes(open.button)) return;
    closeWindow();
  },
  true,
);

document.addEventListener('keydown', (event) => {
  if (!event.isTrusted || event.key !== 'Escape' || !open) return;
  const button = open.button;
  closeWindow();
  button.focus();
});
