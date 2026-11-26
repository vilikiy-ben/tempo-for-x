export async function read(key, fallback) {
  const bag = await chrome.storage.local.get(key);
  return key in bag && bag[key] !== undefined ? bag[key] : fallback;
}

export async function write(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function update(key, fallback, mutate) {
  const current = await read(key, fallback);
  const next = mutate(current);
  await write(key, next);
  return next;
}

export function subscribe(key, handler) {
  const listener = (changes, area) => {
    if (area !== 'local' || !(key in changes)) return;
    handler(changes[key].newValue, changes[key].oldValue);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
