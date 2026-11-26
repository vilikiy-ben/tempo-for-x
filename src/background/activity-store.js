import { KEY, HISTORY_DAYS } from '../core/constants.js';
import { read, write } from '../core/storage.js';
import { addBuckets, addPomodoro, prune, series } from '../core/activity.js';
import { dayKey } from '../core/time.js';

let chain = Promise.resolve();

function enqueue(task) {
  chain = chain.then(task, task);
  return chain;
}

const AHEAD_LIMIT_MS = 60 * 60 * 1000;

function sane(buckets, now = Date.now()) {
  if (!Array.isArray(buckets)) return [];
  return buckets
    .filter((bucket) => bucket && Number.isFinite(bucket.at) && Number.isFinite(bucket.seconds))
    .filter((bucket) => bucket.seconds > 0 && bucket.at <= now + AHEAD_LIMIT_MS)
    .map((bucket) => ({ at: bucket.at, seconds: Math.round(bucket.seconds) }));
}

function snapshot(journal) {
  const key = dayKey();
  const day = journal[key] || { s: 0, h: {}, p: 0 };
  return { key, seconds: day.s, pomodoros: day.p };
}

export function recordBuckets(buckets) {
  const clean = sane(buckets);
  if (!clean.length) return today().then((day) => ({ written: 0, ...day }));
  return enqueue(async () => {
    const journal = await read(KEY.activity, {});
    const next = prune(addBuckets(journal, clean), HISTORY_DAYS);
    await write(KEY.activity, next);
    return {
      written: clean.reduce((sum, bucket) => sum + bucket.seconds, 0),
      ...snapshot(next),
    };
  });
}

export function recordPomodoro(at = Date.now()) {
  return enqueue(async () => {
    const journal = await read(KEY.activity, {});
    await write(KEY.activity, prune(addPomodoro(journal, new Date(at)), HISTORY_DAYS));
  });
}

export function today() {
  return enqueue(async () => snapshot(await read(KEY.activity, {})));
}

export function range(days) {
  return enqueue(async () => {
    const journal = await read(KEY.activity, {});
    return series(journal, days);
  });
}
