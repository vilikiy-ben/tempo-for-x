import { HISTORY_DAYS } from './constants.js';
import { dayKey, lastDayKeys, hourKey } from './time.js';

export const SECONDS_IN_HOUR = 3600;

export function emptyDay() {
  return { s: 0, h: {}, p: 0 };
}

function touch(journal, key) {
  return journal[key]
    ? { ...journal[key], h: { ...journal[key].h } }
    : emptyDay();
}

export function addBuckets(journal, buckets) {
  let out = journal;
  for (const bucket of buckets) {
    const seconds = Math.round(bucket?.seconds || 0);
    if (!(seconds > 0)) continue;
    const at = new Date(bucket.at);
    if (Number.isNaN(at.getTime())) continue;

    const key = dayKey(at);
    const hour = hourKey(at);
    const day = touch(out, key);
    const room = Math.max(0, SECONDS_IN_HOUR - (day.h[hour] || 0));
    const amount = Math.min(seconds, room);
    if (!amount) continue;

    day.s += amount;
    day.h[hour] = (day.h[hour] || 0) + amount;
    out = { ...out, [key]: day };
  }
  return out;
}

export function addPomodoro(journal, at = new Date()) {
  const key = dayKey(at);
  const day = touch(journal, key);
  day.p += 1;
  return { ...journal, [key]: day };
}

export function prune(journal, days = HISTORY_DAYS) {
  const keys = Object.keys(journal).sort();
  if (keys.length <= days) return journal;
  const keep = new Set(keys.slice(-days));
  const out = {};
  for (const key of keys) {
    if (keep.has(key)) out[key] = journal[key];
  }
  return out;
}

export function series(journal, days, now = new Date()) {
  return lastDayKeys(days, now).map((key) => ({
    key,
    ...(journal[key] || emptyDay()),
  }));
}

export function totalSeconds(rows) {
  return rows.reduce((sum, row) => sum + row.s, 0);
}

export function streak(rows) {
  let index = rows.length - 1;
  if (index >= 0 && rows[index].s <= 0) index -= 1;
  let count = 0;
  for (; index >= 0; index -= 1) {
    if (rows[index].s <= 0) break;
    count += 1;
  }
  return count;
}
