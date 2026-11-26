const KEY = 'tempo:lead';

const WRITE_GAP_MS = 1000;

let written = 0;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function claim(owner, at = Date.now()) {
  if (at - written < WRITE_GAP_MS) return;
  written = at;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ owner, at }));
  } catch {
  }
}

export function elsewhere(owner, since) {
  const store = storage();
  if (!store) return false;
  try {
    const lead = JSON.parse(store.getItem(KEY) || 'null');
    return Boolean(lead && lead.owner !== owner && Number.isFinite(lead.at) && lead.at > since);
  } catch {
    return false;
  }
}
