const KEY = 'tempo:pending';

const COLD_MS = 30_000;

const STALE_MS = 36 * 60 * 60 * 1000;

const MAX_SECTIONS = 8;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readShelf(store) {
  try {
    const parsed = JSON.parse(store.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeShelf(store, shelf) {
  const names = Object.keys(shelf);
  if (!names.length) {
    store.removeItem(KEY);
    return;
  }
  let trimmed = shelf;
  if (names.length > MAX_SECTIONS) {
    const fresh = names
      .sort((a, b) => (shelf[b].saved || 0) - (shelf[a].saved || 0))
      .slice(0, MAX_SECTIONS);
    trimmed = Object.fromEntries(fresh.map((name) => [name, shelf[name]]));
  }
  store.setItem(KEY, JSON.stringify(trimmed));
}

function sane(buckets) {
  return (Array.isArray(buckets) ? buckets : []).filter(
    (bucket) => Number.isFinite(bucket?.at) && Number.isFinite(bucket?.seconds) && bucket.seconds > 0,
  );
}

export function newOwner() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function keep(owner, buckets) {
  const store = storage();
  if (!store) return;
  try {
    const shelf = readShelf(store);
    const clean = sane(buckets);
    if (clean.length) shelf[owner] = { saved: Date.now(), buckets: clean };
    else delete shelf[owner];
    writeShelf(store, shelf);
  } catch {
  }
}

export function take(owner) {
  const store = storage();
  if (!store) return [];
  try {
    const shelf = readShelf(store);
    const now = Date.now();
    const taken = [];
    let changed = false;

    for (const [name, section] of Object.entries(shelf)) {
      if (name === owner) continue;
      const age = now - (section?.saved || 0);
      if (age < COLD_MS) continue;
      delete shelf[name];
      changed = true;
      if (age <= STALE_MS) taken.push(...sane(section.buckets));
    }

    if (changed) writeShelf(store, shelf);
    return taken;
  } catch {
    return [];
  }
}
