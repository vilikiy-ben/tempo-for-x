const GATE_MARGIN = 500;

const PASSED_MARGIN = 160;

const FRESH_MS = 400;

const mountedAt = new WeakMap();

let listener = null;
let near = null;
let view = null;
const waitingNear = new Set();
const waitingLeave = new Set();
const PRUNE_AT = 300;

function now() {
  return performance.now();
}

export function of(box) {
  const height = window.innerHeight || 0;
  if (box.height > 0 ? box.bottom <= -PASSED_MARGIN : box.top < -PASSED_MARGIN) return 'passed';
  if (box.top < height) return 'seen';
  if (box.top < height + GATE_MARGIN) return 'near';
  return 'ahead';
}

export function mounted(cell) {
  if (!mountedAt.has(cell)) mountedAt.set(cell, now());
}

export function restored(cell) {
  mountedAt.set(cell, -Infinity);
}

export function fresh(cell) {
  const at = mountedAt.get(cell);
  return at !== undefined && now() - at < FRESH_MS;
}

export function onChange(handler) {
  listener = handler;
}

function prune(set, observer) {
  if (set.size < PRUNE_AT) return;
  for (const cell of set) {
    if (cell.isConnected) continue;
    set.delete(cell);
    observer.unobserve(cell);
  }
}

export function awaitReach(cell) {
  if (waitingNear.has(cell)) return;
  near ??= new IntersectionObserver(
    (entries) => {
      let news = false;
      for (const entry of entries) {
        const above = entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
        if (!entry.isIntersecting && !above) continue;
        near.unobserve(entry.target);
        waitingNear.delete(entry.target);
        news = true;
      }
      if (news) listener?.();
    },
    { rootMargin: `0px 0px ${GATE_MARGIN}px 0px` },
  );
  prune(waitingNear, near);
  waitingNear.add(cell);
  near.observe(cell);
}

export function awaitLeave(cell) {
  if (waitingLeave.has(cell)) return;
  view ??= new IntersectionObserver((entries) => {
    let news = false;
    for (const entry of entries) {
      if (entry.isIntersecting) continue;
      view.unobserve(entry.target);
      waitingLeave.delete(entry.target);
      news = true;
    }
    if (news) listener?.();
  }, { rootMargin: `${PASSED_MARGIN}px 0px 0px 0px` });
  prune(waitingLeave, view);
  waitingLeave.add(cell);
  view.observe(cell);
}
