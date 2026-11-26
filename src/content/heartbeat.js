import {
  MSG, FLUSH_INTERVAL_MS, SYNC_INTERVAL_MS, PENDING_LIMIT, TICK_GAP_LIMIT_MS,
} from '../core/constants.js';
import { dayKey, hourStart } from '../core/time.js';
import * as vault from './pending-store.js';
import * as lead from './lead.js';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'];

export const PAUSE = Object.freeze({ hidden: 'hidden', elsewhere: 'elsewhere' });

let ticking = null;
let flushing = null;
let syncing = null;
let offset = null;

const pending = new Map();
let confirmed = { key: null, seconds: 0 };
let flushInFlight = false;

const owner = vault.newOwner();

let lastLife = Date.now();
let lastTick = Date.now();
let carry = 0;

const listeners = new Set();
let awake = false;
let reason = PAUSE.hidden;
let shown = null;

function markLife() {
  lastLife = Date.now();
  lead.claim(owner, lastLife);
}

function whyPaused() {
  if (document.visibilityState !== 'visible') return PAUSE.hidden;
  if (lead.elsewhere(owner, lastLife)) return PAUSE.elsewhere;
  return null;
}

function pendingOn(key) {
  let sum = 0;
  for (const [at, seconds] of pending) {
    if (dayKey(new Date(at)) === key) sum += seconds;
  }
  return sum;
}

function accept(snapshot) {
  if (!snapshot?.key) return;
  if (confirmed.key === snapshot.key && snapshot.seconds < confirmed.seconds) return;
  confirmed = { key: snapshot.key, seconds: snapshot.seconds };
}

export function today() {
  const key = dayKey();
  const base = confirmed.key === key ? confirmed.seconds : 0;
  return base + pendingOn(key);
}

function snapshotOf() {
  return { seconds: today(), counting: awake, reason: awake ? null : reason };
}

function emit({ force = false } = {}) {
  const snapshot = snapshotOf();
  const same = shown
    && shown.seconds === snapshot.seconds
    && shown.counting === snapshot.counting
    && shown.reason === snapshot.reason;
  if (!force && same) return;
  shown = snapshot;
  listeners.forEach((handler) => handler(snapshot));
}

function bucketList() {
  return [...pending.entries()].map(([at, seconds]) => ({ at, seconds }));
}

function bump(seconds) {
  const at = hourStart();
  pending.set(at, (pending.get(at) || 0) + seconds);
  while (pending.size > PENDING_LIMIT) {
    pending.delete(pending.keys().next().value);
  }
}

function credit(ms) {
  carry += ms;
  const whole = Math.floor(carry / 1000);
  if (!whole) return;
  carry -= whole * 1000;
  bump(whole);
}

function tick() {
  const now = Date.now();
  const elapsed = Math.min(Math.max(now - lastTick, 0), TICK_GAP_LIMIT_MS);
  lastTick = now;

  const why = whyPaused();
  if (!why) credit(elapsed);
  awake = !why;
  reason = why;
  emit();
}

async function flush() {
  if (!pending.size || flushInFlight) return;
  const sent = bucketList();
  vault.keep(owner, sent);
  flushInFlight = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.activityTick,
      payload: { buckets: sent },
    });
    if (!response?.ok) return;
    for (const { at, seconds } of sent) {
      const left = (pending.get(at) || 0) - seconds;
      if (left > 0) pending.set(at, left);
      else pending.delete(at);
    }
    accept(response.data);
    vault.keep(owner, bucketList());
    emit();
  } catch {
    vault.keep(owner, bucketList());
  } finally {
    flushInFlight = false;
  }
}

function inherit() {
  const found = vault.take(owner);
  if (!found.length) return;
  for (const bucket of found) {
    pending.set(bucket.at, (pending.get(bucket.at) || 0) + bucket.seconds);
  }
  emit();
  flush();
}

async function sync() {
  if (document.visibilityState !== 'visible') return;
  inherit();
  try {
    const response = await chrome.runtime.sendMessage({ type: MSG.activityToday });
    if (response?.ok) {
      accept(response.data);
      emit();
    }
  } catch {
  }
}

export function onTick(handler) {
  listeners.add(handler);
  handler(snapshotOf());
  return () => listeners.delete(handler);
}

export function pendingSeconds() {
  let sum = 0;
  for (const seconds of pending.values()) sum += seconds;
  return sum;
}

export async function start() {
  inherit();
  await sync();
  ACTIVITY_EVENTS.forEach((name) =>
    window.addEventListener(name, markLife, { passive: true, capture: true }),
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush();
      return;
    }
    markLife();
    lastTick = Date.now();
    sync();
  });
  window.addEventListener('focus', markLife);
  window.addEventListener('pagehide', () => {
    vault.keep(owner, bucketList());
    flush();
  });

  lastTick = Date.now();
  ticking = setInterval(tick, 1000);
  flushing = setInterval(flush, FLUSH_INTERVAL_MS);
  offset = setTimeout(() => {
    syncing = setInterval(sync, SYNC_INTERVAL_MS);
    sync();
  }, FLUSH_INTERVAL_MS / 2);
  emit({ force: true });
}

export function stop() {
  clearInterval(ticking);
  clearInterval(flushing);
  clearInterval(syncing);
  clearTimeout(offset);
  flush();
}
