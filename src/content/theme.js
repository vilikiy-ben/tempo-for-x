import { isDarkColor, resolveTheme } from '../core/theme.js';

const ATTR = 'data-tempo-theme';

const FRESH_MS = 1000;

let setting = 'auto';
let current = 'light';
let paper = '';
let paperAt = 0;
const listeners = new Set();

export function pageColor() {
  const now = Date.now();
  if (paper && now - paperAt < FRESH_MS) return paper;
  paperAt = now;
  const body = document.body ? getComputedStyle(document.body).backgroundColor : '';
  const seen = !body || body === 'rgba(0, 0, 0, 0)'
    ? getComputedStyle(document.documentElement).backgroundColor
    : body;
  paper = !seen || seen === 'rgba(0, 0, 0, 0)' ? '#fff' : seen;
  return paper;
}

function systemDark() {
  return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
}

function refresh() {
  const next = resolveTheme(setting, { page: isDarkColor(pageColor()), system: systemDark() });
  if (next === current && document.documentElement.getAttribute(ATTR) === next) return current;
  current = next;
  document.documentElement.setAttribute(ATTR, next);
  for (const listener of listeners) listener(next);
  return current;
}

export function theme() {
  return current;
}

export function onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function configure(settings) {
  const next = settings.ui?.theme || 'auto';
  if (next === setting) return current;
  setting = next;
  paper = '';
  return refresh();
}

let watching = false;

export function start(settings) {
  configure(settings);
  refresh();
  if (watching) return current;
  watching = true;

  const observer = new MutationObserver(() => {
    paper = '';
    refresh();
  });
  for (const node of [document.documentElement, document.body]) {
    if (node) observer.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
    paper = '';
    refresh();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    paper = '';
    refresh();
  });

  return current;
}
