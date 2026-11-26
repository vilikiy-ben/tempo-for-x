import * as dom from './dom.js';
import * as gutter from './gutter.js';

const LIFT = 'data-tempo-lift';
export const WINDOW = 'data-tempo-window';

const GAP = 8;
const ROOM_BELOW = 180;

export function hostOf(article, button) {
  return button?.closest?.('[data-tempo-quick]')?.parentElement || gutter.mount(article);
}

export function place(box, host, button) {
  const card = host.getBoundingClientRect();
  const seat = button.getBoundingClientRect();
  const left = seat.left - card.left;
  const top = seat.top - card.top;

  const toLeft = seat.left + seat.width / 2 > card.left + card.width / 2;
  if (toLeft) {
    box.style.right = `${left >= card.width ? 0 : Math.max(0, card.width - left + GAP)}px`;
    box.style.left = 'auto';
    box.style.maxWidth = `${Math.max(220, Math.min(left - GAP, card.width) - 12)}px`;
  } else {
    box.style.left = `${Math.max(0, left + seat.width + GAP)}px`;
    box.style.right = 'auto';
    box.style.maxWidth = `${Math.max(220, card.width - left - seat.width - GAP - 12)}px`;
  }
  box.dataset.from = toLeft ? 'right' : 'left';

  const docked = button.closest?.('[data-tempo-quick]')?.dataset.side === 'stage';
  const flip = docked
    ? seat.top > window.innerHeight - seat.bottom
    : window.innerHeight - seat.top < ROOM_BELOW;
  if (flip) {
    box.style.bottom = `${host.offsetHeight - top - seat.height}px`;
    box.style.top = 'auto';
    box.dataset.grow = 'up';
  } else {
    box.style.top = `${top}px`;
    box.style.bottom = 'auto';
    box.dataset.grow = 'down';
  }
}

export function lift(article) {
  const cell = dom.cellOf(article);
  if (!cell || cell.hasAttribute(LIFT)) return;
  cell.setAttribute(LIFT, `${cell.style.zIndex}|${cell.style.position}`);
  cell.style.zIndex = '1';
  if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
}

export function unlift(node) {
  const cell = node?.hasAttribute?.(LIFT) ? node : dom.cellOf(node || document.body);
  if (!cell?.hasAttribute?.(LIFT)) return;
  if (cell.querySelector(`[${WINDOW}]:not([data-closing])`)) return;
  const [zIndex, position] = cell.getAttribute(LIFT).split('|');
  cell.style.zIndex = zIndex;
  cell.style.position = position;
  cell.removeAttribute(LIFT);
}

export function unliftAll() {
  for (const cell of document.querySelectorAll(`[${LIFT}]`)) unlift(cell);
}

export function fade(box) {
  box.dataset.closing = 'true';
  const done = () => box.remove();
  box.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 260);
}
