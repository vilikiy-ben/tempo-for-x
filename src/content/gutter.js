const ANCHOR = 'data-tempo-anchor';

const AVATAR_FALLBACK = 40;

const GAP = 8;

const AVATAR_GAP = 6;

const BAR_WIDTH = 28;

const AIR = 1;

let edgeCache = null;

export function forgetEdge() {
  edgeCache = null;
}

function paints(node, style) {
  if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') return true;
  if (style.borderLeftWidth !== '0px' || style.borderTopWidth !== '0px') return true;
  if (/^(IMG|SVG|INPUT|TEXTAREA|VIDEO|CANVAS)$/.test(node.tagName)) return true;
  return [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim());
}

function rightEdge() {
  if (edgeCache !== null) return edgeCache;
  const width = document.documentElement.clientWidth;
  const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
  if (!sidebar) {
    edgeCache = width;
    return edgeCache;
  }
  let edge = width;
  for (const node of sidebar.querySelectorAll('*')) {
    const box = node.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    if (box.left >= edge) continue;
    if (paints(node, getComputedStyle(node))) edge = box.left;
  }
  edgeCache = edge;
  return edge;
}

const DWELLERS = '[data-tempo-quick], [data-tempo-badge]';

const AWAY = 'data-tempo-away';

export function boxOf(node) {
  if (!node?.isConnected || !node.checkVisibility()) return null;
  const box = node.getBoundingClientRect();
  return box.width >= 1 && box.height >= 1 ? box : null;
}

export function drawn(node) {
  return boxOf(node) !== null;
}

const watched = new Set();
let wake = null;
const sentry = new ResizeObserver(() => wake?.());

export function onWake(handler) {
  wake = handler;
}

export function attend(host) {
  if (watched.has(host)) return;
  for (const gone of [...watched]) {
    if (!gone.isConnected) unattend(gone);
  }
  watched.add(host);
  sentry.observe(host);
}

function unattend(host) {
  if (watched.delete(host)) sentry.unobserve(host);
}

export function withdraw(host) {
  for (const node of host.querySelectorAll(`:scope > ${DWELLERS}`)) node.setAttribute(AWAY, '');
}

export function arrive(host) {
  const hidden = host.querySelectorAll(`:scope > [${AWAY}]`);
  for (const node of hidden) node.removeAttribute(AWAY);
  return hidden.length > 0;
}

export function releaseWatch() {
  for (const host of watched) sentry.unobserve(host);
  watched.clear();
}

export function avatarBox(article) {
  const avatar = article.querySelector('[data-testid="Tweet-User-Avatar"]');
  return avatar ? boxOf(avatar) : null;
}

export function place(article, host = article) {
  const card = boxOf(article);
  const origin = boxOf(host);
  if (!card || !origin) return null;

  const room = rightEdge() - card.right;
  if (room >= BAR_WIDTH + AIR * 2) {
    const left =
      room >= BAR_WIDTH + GAP + AIR
        ? card.right + GAP
        : card.right + (room - BAR_WIDTH) / 2;
    return { side: 'right', left: left - origin.left, top: card.top - origin.top + GAP };
  }

  const box = avatarBox(article);
  if (!box) return null;

  const text = boxOf(article.querySelector('[data-testid="tweetText"]'));
  if (text && text.left < box.right) {
    const span = room + Math.max(0, card.right - text.right);
    if (span >= BAR_WIDTH + AIR * 2) {
      const left = card.right - (span - room) + (span - BAR_WIDTH) / 2;
      return { side: 'right', left: left - origin.left, top: card.top - origin.top + GAP };
    }
  }
  const size = Math.min(box.width, box.height) || AVATAR_FALLBACK;
  return {
    side: 'gutter',
    left: box.left - origin.left + box.width / 2,
    top: box.top - origin.top + size + AVATAR_GAP,
  };
}

export function mount(article) {
  let node = article;
  for (let step = 0; step < 2; step += 1) {
    if (getComputedStyle(node).overflow === 'visible') return node;
    const parent = node.parentElement;
    if (!parent || parent === document.body) break;
    node = parent;
  }
  return node;
}

export function anchor(node) {
  if (getComputedStyle(node).position !== 'static') return;
  node.style.position = 'relative';
  node.setAttribute(ANCHOR, '');
}

export function releaseAnchors() {
  for (const host of document.querySelectorAll(`[${ANCHOR}]`)) {
    if (host.querySelector(DWELLERS)) continue;
    host.style.position = '';
    host.removeAttribute(ANCHOR);
  }
  for (const host of [...watched]) {
    if (!host.isConnected || !host.querySelector(DWELLERS)) unattend(host);
  }
}

export function isQuote(article) {
  return Boolean(article.parentElement?.closest('article[data-testid="tweet"]'));
}
