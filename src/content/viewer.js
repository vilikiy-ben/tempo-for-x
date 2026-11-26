import { SEL, tweetIdOf } from './dom.js';
import { viewedPost } from './surface.js';
import * as gutter from './gutter.js';

const STAGE = '[data-testid="swipe-to-dismiss"]';

const PAGE = '[data-testid="primaryColumn"]';

export function open(loc = location) {
  const id = viewedPost(loc.pathname);
  if (!id) return null;
  const stage = document.querySelector(STAGE);
  return stage && gutter.drawn(stage) ? { id, stage } : null;
}

export function inPanel(article) {
  return !article.closest(PAGE) && Boolean(document.querySelector(STAGE));
}

export function isFocal(article, view = open()) {
  return Boolean(view && inPanel(article) && tweetIdOf(article) === view.id);
}

export function postOf(id) {
  let fallback = null;
  for (const article of document.querySelectorAll(SEL.tweet)) {
    if (gutter.isQuote(article) || tweetIdOf(article) !== id || !gutter.drawn(article)) continue;
    if (!inPanel(article)) return { article, beneath: true };
    fallback ??= article;
  }
  return fallback ? { article: fallback, beneath: false } : null;
}

const AXIS = 30;
const AIR = 8;
const EDGE = 12;
const STEP = 8;

function taken(box) {
  const x = box.right - AXIS;
  const spans = [];
  for (let y = box.top + 1; y < box.bottom; y += STEP) {
    const hit = document.elementsFromPoint(x, y).find((node) => !node.closest('[data-tempo]'));
    const control = hit?.closest('button, [role="button"]');
    if (!control) continue;
    const r = control.getBoundingClientRect();
    if (!spans.some((span) => span.top === r.top && span.bottom === r.bottom)) {
      spans.push({ top: r.top, bottom: r.bottom });
    }
  }
  return spans;
}

export function seat(bar, stage) {
  const box = gutter.boxOf(stage);
  const height = bar.offsetHeight;
  if (!box || !height) return;
  const low = box.top + EDGE;
  const high = box.bottom - EDGE - height;
  const ideal = box.top + (box.height - height) / 2;
  const spans = taken(box);
  const clear = (top) => top >= low && top <= high &&
    spans.every((span) => top + height + AIR <= span.top || top >= span.bottom + AIR);
  const options = [ideal, ...spans.flatMap((span) => [span.bottom + AIR, span.top - AIR - height])];
  const fits = options.filter(clear).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
  const top = Math.round((fits[0] ?? Math.min(Math.max(ideal, low), Math.max(low, high))) - box.top);
  if (bar.style.top !== `${top}px`) bar.style.top = `${top}px`;
}
