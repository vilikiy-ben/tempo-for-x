import { fromOrigin, fromX } from '../core/twimg.js';

const LIMIT = 500;

const clips = new Map();
const listeners = new Set();

document.addEventListener('tempo:media', (event) => {
  const rows = Array.isArray(event.detail) ? event.detail : [];
  let added = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 2) continue;
    const [id, raw] = row;
    if (typeof id !== 'string' || !/^\d{1,25}$/.test(id)) continue;
    const url = absolute(raw);
    if (!url) continue;
    if (clips.get(id) === url) continue;
    clips.set(id, url);
    added += 1;
  }
  while (clips.size > LIMIT) clips.delete(clips.keys().next().value);
  if (added) listeners.forEach((handler) => handler(added));
});

function absolute(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let url;
  try {
    url = new URL(raw, location.href).toString();
  } catch {
    return null;
  }
  return fromX(url) || fromOrigin(url, location.origin) ? url : null;
}

export function videoOf(id) {
  return id && clips.has(id) ? clips.get(id) : null;
}

export function onUpdate(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}
