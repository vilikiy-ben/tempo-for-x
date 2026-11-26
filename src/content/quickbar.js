import { t } from '../core/i18n.js';
import { ACTIONS, OUTCOME, perform } from './actions.js';
import * as gutter from './gutter.js';
import * as explain from './explain.js';
import * as junk from './junk.js';
import * as copy from './copy.js';
import * as shot from './shot.js';
import * as download from './download.js';
import * as badge from './badge.js';
import * as dom from './dom.js';
import * as viewer from './viewer.js';

const BAR = 'data-tempo-quick';

const SAY_MS = { done: 1600, fail: 2800, armed: 3000 };

const SVG_NS = 'http://www.w3.org/2000/svg';

let enabled = false;
let placed = 0;
let onRelayout = null;
let resizeTimer = null;

window.addEventListener('resize', () => {
  if (!placed) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    gutter.forgetEdge();
    for (const bar of document.querySelectorAll(`[${BAR}]`)) bar.remove();
    placed = 0;
    onRelayout?.();
  }, 250);
});

export function onNeedsSweep(handler) {
  onRelayout = handler;
  gutter.onWake(handler);
  junk.onNeedsSweep(handler);
}

export function forgetLayout() {
  gutter.forgetEdge();
}

const worthy = new WeakMap();

function worthExplain(article) {
  const id = dom.tweetIdOf(article);
  const seen = worthy.get(article);
  if (seen && seen.id === id) return true;
  const worth = explain.worth(article);
  if (worth) worthy.set(article, { id });
  else worthy.delete(article);
  return worth;
}

function slots(article, curate) {
  const list = [];
  if (junk.isEnabled() && junk.worth(article)) list.push(junk.ACTION);
  if (explain.isEnabled() && worthExplain(article)) list.push(explain.ACTION);
  if (enabled) {
    if (copy.worth(article)) list.push(copy.ACTION);
    if (shot.worth(article)) list.push(shot.ACTION);
    if (download.worth(article)) list.push(download.ACTION);
  }
  if (enabled && curate) list.push(...ACTIONS);
  return list;
}

let armed = null;
let armedTimer = null;

function glyph(path) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

function buildButton(action, article, announce) {
  const button = document.createElement('button');
  button.className = 'tempo-quick__btn';
  button.type = 'button';
  button.dataset.act = action.id;
  button.dataset.state = 'idle';
  button.setAttribute('data-tempo', '');
  button.setAttribute('aria-label', t(action.title));
  button.style.setProperty('--tempo-act', action.color);

  const tip = document.createElement('span');
  tip.className = 'tempo-quick__tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.textContent = t(action.title);

  button.append(glyph(action.path), tip);

  const say = (text, state, ms) => {
    tip.textContent = text;
    button.dataset.state = state;
    announce(state === 'working' ? '' : text, ms);
    if (!ms) return;
    setTimeout(() => {
      if (button.dataset.state !== state) return;
      reset(button, tip, action);
    }, ms);
  };

  const swallow = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  button.addEventListener('pointerdown', swallow);
  button.addEventListener('mousedown', swallow);

  button.addEventListener('click', async (event) => {
    swallow(event);
    if (button.dataset.state === 'working') return;

    if (action.own) {
      disarm();
      if (action.open) {
        action.open(article, button);
        return;
      }
      say('…', 'working');
      let report = null;
      try {
        report = await action.press(article, event);
      } catch {
        report = null;
      }
      const good = Boolean(report?.ok);
      say(report ? t(report.say, report) : t('quick.take.fail'),
        good ? 'done' : 'fail',
        good ? SAY_MS.done : SAY_MS.fail);
      return;
    }

    if (action.confirm && armed !== button) {
      disarm();
      armed = button;
      say(t(action.armed), 'armed', SAY_MS.armed);
      armedTimer = setTimeout(() => {
        if (armed === button) armed = null;
      }, SAY_MS.armed);
      return;
    }
    disarm();

    say('…', 'working');
    let outcome = OUTCOME.noMenu;
    try {
      outcome = await perform(article, action);
    } catch {
      outcome = OUTCOME.noMenu;
    }

    if (outcome === OUTCOME.done) say(t(action.done), 'done', SAY_MS.done);
    else if (outcome === OUTCOME.handOver) say(t('quick.handover'), 'fail', SAY_MS.fail);
    else if (outcome === OUTCOME.busy) say(t('quick.busy'), 'fail', SAY_MS.fail);
    else say(t('quick.nomenu'), 'fail', SAY_MS.fail);
  });

  return button;
}

function reset(button, tip, action) {
  tip.textContent = t(action.title);
  button.dataset.state = 'idle';
}

function disarm() {
  clearTimeout(armedTimer);
  if (!armed) return;
  const button = armed;
  armed = null;
  if (button.dataset.state !== 'armed') return;
  const action = ACTIONS.find((item) => item.id === button.dataset.act);
  const tip = button.querySelector('.tempo-quick__tip');
  if (action && tip) reset(button, tip, action);
}

document.addEventListener('pointerdown', (event) => {
  if (armed && !event.composedPath?.().includes(armed)) disarm();
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') disarm();
});

function buildBar(article, wanted) {
  const bar = document.createElement('div');
  bar.className = 'tempo-quick';
  bar.setAttribute('data-tempo', '');
  bar.setAttribute(BAR, '');

  const paper = document.createElement('span');
  paper.className = 'tempo-quick__paper';
  paper.setAttribute('aria-hidden', 'true');

  const live = document.createElement('span');
  live.className = 'tempo-quick__live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  let quiet = null;
  const announce = (text, ms = SAY_MS.fail) => {
    if (text) live.textContent = text;
    bar.dataset.busy = 'true';
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      delete bar.dataset.busy;
      live.textContent = '';
    }, ms);
  };

  bar.append(paper, live, ...wanted.map((action) => buildButton(action, article, announce)));
  return bar;
}

function settle(bar, article, host) {
  const spot = gutter.place(article, host);
  if (!spot) return false;

  gutter.anchor(host);
  gutter.attend(host);
  bar.dataset.side = spot.side;
  bar.style.left = `${spot.left}px`;
  bar.style.top = `${spot.top}px`;
  return true;
}

const LIFT_FLOOR = 4;

function fit(bar, article) {
  if (bar.dataset.side !== 'right') return;
  const card = gutter.boxOf(article);
  const box = bar.getBoundingClientRect();
  if (!card || !box.height) return;
  const over = box.bottom - card.bottom;
  const room = box.top - (card.top + LIFT_FLOOR);
  if (over <= 0 || room <= 0) return;
  bar.style.top = `${parseFloat(bar.style.top) - Math.min(over, room)}px`;
}

export function attach(article, { curate = false } = {}) {
  const host = gutter.mount(article);
  const standing = host.querySelector(`:scope > [${BAR}]`);

  explain.recheck(article);
  junk.recheck(article);

  if (!gutter.drawn(article)) {
    gutter.withdraw(host);
    return;
  }

  const returned = gutter.arrive(host);

  badge.attach(article, host);

  const wanted = viewer.isFocal(article) ? [] : slots(article, curate);
  const signature = wanted.map((action) => action.id).join(',');

  if (standing) {
    if (standing.dataset.slots === signature) {
      if (returned && settle(standing, article, host)) fit(standing, article);
      junk.paint(standing, article);
      return;
    }
    standing.remove();
    placed -= 1;
  }

  if (!wanted.length) {
    if (standing) gutter.releaseAnchors();
    return;
  }
  if (gutter.isQuote(article)) return;

  const bar = buildBar(article, wanted);
  bar.dataset.slots = signature;
  if (!settle(bar, article, host)) return;
  junk.paint(bar, article);
  host.append(bar);
  fit(bar, article);
  placed += 1;
}

const served = new WeakMap();
let staged = false;

export function attachViewer({ curate = false } = {}) {
  const view = viewer.open();
  if (!view && !staged) return;
  const post = view ? viewer.postOf(view.id) : null;
  const article = post?.article || null;
  const wanted = article ? slots(article, curate && post.beneath) : [];
  const signature = wanted.length ? `${view.id}:${wanted.map((action) => action.id).join(',')}` : '';

  for (const standing of document.querySelectorAll(`[${BAR}][data-side='stage']`)) {
    const same = standing.dataset.slots === signature &&
      served.get(standing) === article &&
      standing.parentElement === view?.stage;
    if (same) {
      junk.paint(standing, article);
      viewer.seat(standing, view.stage);
      return;
    }
    standing.remove();
    placed -= 1;
  }
  staged = false;
  if (!signature) return;

  const bar = buildBar(article, wanted);
  bar.dataset.slots = signature;
  bar.dataset.side = 'stage';
  served.set(bar, article);
  junk.paint(bar, article);
  view.stage.append(bar);
  viewer.seat(bar, view.stage);
  placed += 1;
  staged = true;
}

export function release() {
  explain.release();
  junk.release();
  badge.release();
  gutter.releaseWatch();
  if (!placed) return;
  placed = 0;
  staged = false;
  disarm();
  for (const bar of document.querySelectorAll(`[${BAR}]`)) bar.remove();
  gutter.releaseAnchors();
}

export function configure(settings) {
  const next = Boolean(settings.quick?.enabled);
  const changed = next !== enabled;
  enabled = next;
  const agentChanged = explain.configure(settings);
  shot.configure(settings);
  badge.configure(settings);
  junk.configure(settings).then((junkChanged) => {
    if (!junkChanged) return;
    if (!enabled && !explain.isEnabled() && !junk.isEnabled()) release();
    onRelayout?.();
  });
  if (!enabled && !explain.isEnabled() && !junk.isEnabled()) release();
  return changed || agentChanged;
}
