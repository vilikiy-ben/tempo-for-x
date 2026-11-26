const LIMIT = 2000;

const counts = new Map();
const listeners = new Set();

document.addEventListener('tempo:followers', (event) => {
  const rows = Array.isArray(event.detail) ? event.detail : [];
  let added = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 2) continue;
    const [handle, followers] = row;
    if (typeof handle !== 'string' || !/^[a-z0-9_]{1,20}$/i.test(handle)) continue;
    if (typeof followers !== 'number' || !Number.isFinite(followers) || followers < 0) continue;
    const key = handle.toLowerCase();
    if (counts.get(key) === followers) continue;
    counts.set(key, followers);
    added += 1;
  }
  while (counts.size > LIMIT) counts.delete(counts.keys().next().value);
  if (added) listeners.forEach((handler) => handler(added));
});

export function followersOf(handle) {
  if (!handle) return null;
  const key = handle.replace(/^@/, '').toLowerCase();
  return counts.has(key) ? counts.get(key) : null;
}

export function onUpdate(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}
