import { SEL } from './dom.js';
import { isPeopleSurface } from './surface.js';
import * as zone from './zone.js';

const MARK = 'tempoJunk';

let enabled = false;

const DOCK_SELECTORS = [
  '[data-testid="chat-drawer-main"]',
  '[data-testid="GrokDrawerHeader"]',
  '[data-testid="DMDrawer"]',
  '[data-testid="DMDrawerHeader"]',
  '[data-testid="AudioDock"]',
  '[data-testid="audioSpaceBarPlayButton"]',
  '[data-testid="PlayerDock"]',
];

const KEEPERS = 'input, form, nav, [role="search"]';

const SEARCH = 'form, [role="search"]';

const MAX_CLIMB = 6;

const SIDE_MODULES = [SEL.trend, SEL.userCell, SEL.news];

function moduleRoot(item, ownSelector, stopAt) {
  const others = SIDE_MODULES.filter((selector) => selector !== ownSelector).join(', ');
  const foreign = `${others}, ${KEEPERS}`;
  let node = item;
  for (let depth = 0; depth < MAX_CLIMB; depth += 1) {
    const parent = node.parentElement;
    if (!parent || parent === stopAt || parent === document.body) break;
    if (parent.querySelector(foreign)) break;
    node = parent;
  }
  return node;
}

function mark(node) {
  if (!node.dataset[MARK]) node.dataset[MARK] = '';
}

function junkCell(cell) {
  if (cell.querySelector(SEL.tweet)) return false;
  return Boolean(cell.querySelector(SEL.trend) || cell.querySelector(SEL.userCell));
}

function tidy(cell, force, pace) {
  const where = zone.of(cell.getBoundingClientRect());
  if (where === 'passed') {
    if (pace && (pace.calm || pace.spent)) {
      pace.held = true;
      return;
    }
    if (pace) pace.spent = true;
    mark(cell);
    return;
  }
  if (force || zone.fresh(cell) || where === 'near') mark(cell);
  else if (where === 'ahead') zone.awaitReach(cell);
  else zone.awaitLeave(cell);
}

export function claim(cell) {
  if (!enabled || isPeopleSurface() || cell.dataset[MARK] !== undefined) return;
  if (junkCell(cell)) tidy(cell, false, null);
}

export function apply({ force = false, calm = false } = {}) {
  if (!enabled || isPeopleSurface()) return false;
  const pace = { calm, spent: false, held: false };

  for (const cell of document.querySelectorAll(SEL.cell)) {
    if (cell.dataset[MARK] !== undefined || !junkCell(cell)) continue;
    tidy(cell, force, pace);
  }

  applyDocks();

  const sidebar = document.querySelector(SEL.sidebar);
  if (sidebar) {
    for (const selector of SIDE_MODULES) {
      for (const item of sidebar.querySelectorAll(selector)) {
        if (item.closest('[data-tempo-junk]') || item.closest(SEARCH)) continue;
        mark(moduleRoot(item, selector, sidebar));
      }
    }
    sweepTail(sidebar);
  }

  return pace.held;
}

const TAIL_MAX_HEIGHT = 40;

function showsSomething(node) {
  if (node.querySelector('img, svg, video, canvas, input, textarea, [role="button"] svg')) return true;
  const box = node.getBoundingClientRect();
  if (box.height < 12) return false;
  return Boolean(node.textContent?.trim());
}

const SPEAKS = 'input, textarea, form, [role="search"], img, svg, video, canvas';

function tailRoot(node, stopAt) {
  let out = node;
  const own = out.textContent.trim();
  for (let depth = 0; depth < MAX_CLIMB; depth += 1) {
    const parent = out.parentElement;
    if (!parent || parent === stopAt || parent === document.body) break;
    if (parent.textContent.trim() !== own) break;
    if ([...parent.querySelectorAll(SPEAKS)].some((node2) => !out.contains(node2))) break;
    out = parent;
  }
  return out;
}

function sweepTail(sidebar) {
  const footer = sidebar.querySelector('nav');
  if (footer && !footer.closest('[data-tempo-junk]')) mark(tailRoot(footer, sidebar));

  for (const node of sidebar.querySelectorAll('div, section, aside')) {
    if (node.closest('[data-tempo-junk]') || node.closest(SEARCH)) continue;
    const box = node.getBoundingClientRect();
    if (!box.height || box.height > TAIL_MAX_HEIGHT) continue;
    if (showsSomething(node)) continue;
    const style = getComputedStyle(node);
    const bordered = ['Top', 'Bottom', 'Left', 'Right'].some(
      (side) => Number.parseFloat(style[`border${side}Width`]) > 0,
    );
    if (!bordered && style.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
    mark(node);
  }
}

const ANCHORS = new Set(['fixed', 'sticky']);

const DOCK_EDGE = 96;

const NOT_JUNK = 'a[href*="/compose/"], [data-testid*="NewTweet"], [data-testid*="FloatingAction"]';

const MAX_DOCK_CLIMB = 12;

const TRANSIENT = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="menuitem"], [role="alert"]';

function fitsDock(node, box = node.getBoundingClientRect()) {
  if (!box.width || !box.height) return false;
  if (box.height > window.innerHeight * 0.6) return false;
  if (box.width > window.innerWidth * 0.6) return false;
  if (box.bottom < window.innerHeight - DOCK_EDGE) return false;
  if (box.right < window.innerWidth * 0.5) return false;
  if (node.matches(TRANSIENT) || node.querySelector(TRANSIENT)) return false;
  if (node.matches(NOT_JUNK) || node.querySelector(NOT_JUNK)) return false;
  return true;
}

function isOverlay(box) {
  return box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.9;
}

function dockRoot(node) {
  let current = node;
  let best = null;
  let anchored = false;

  for (let depth = 0; depth < MAX_DOCK_CLIMB; depth += 1) {
    if (!current || current === document.body || current === document.documentElement) break;
    if (current.hasAttribute?.('data-tempo')) return null;

    const box = current.getBoundingClientRect();
    const fits = fitsDock(current, box);
    if (ANCHORS.has(getComputedStyle(current).position) && (fits || isOverlay(box))) {
      anchored = true;
    }
    if (fits) best = current;
    else if (best) break;

    current = current.parentElement;
  }

  return anchored ? best : null;
}

const PROBE_ROWS = [12, 40, 72, 108];
const PROBE_STEP = 48;

const PROBE_THROTTLE_MS = 1000;
let lastProbe = 0;
let probeDue = true;

window.addEventListener('resize', () => {
  probeDue = true;
});

function firstDockAt(x, y) {
  for (const node of document.elementsFromPoint(x, y)) {
    const root = dockRoot(node);
    if (root) return root;
  }
  return null;
}

function probeDocks() {
  const roots = new Set();
  const limit = window.innerWidth * 0.5;

  for (const bottom of PROBE_ROWS) {
    const y = window.innerHeight - bottom;
    let x = window.innerWidth - 24;
    let guard = 0;
    while (x > limit && guard < 40) {
      guard += 1;
      const root = firstDockAt(x, y);
      if (!root) {
        x -= PROBE_STEP;
        continue;
      }
      roots.add(root);
      x = Math.min(x - PROBE_STEP, root.getBoundingClientRect().left - 12);
    }
  }
  return roots;
}

function applyDocks() {
  if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;

  for (const selector of DOCK_SELECTORS) {
    for (const node of document.querySelectorAll(selector)) {
      if (node.closest('[data-tempo-junk]')) continue;
      const root = dockRoot(node);
      if (root) mark(root);
    }
  }

  const now = Date.now();
  if (!probeDue && now - lastProbe < PROBE_THROTTLE_MS) return;
  probeDue = false;
  lastProbe = now;

  for (const root of probeDocks()) {
    if (root.closest('[data-tempo-junk]')) continue;
    mark(root);
  }
}

export function release() {
  for (const node of document.querySelectorAll('[data-tempo-junk]')) {
    delete node.dataset[MARK];
  }
}

export function configure(settings) {
  const next = Boolean(settings.clutter?.enabled);
  if (next === enabled) return false;
  enabled = next;
  probeDue = true;
  if (!enabled) release();
  return true;
}
