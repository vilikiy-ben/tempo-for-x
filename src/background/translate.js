const CONCURRENCY = 3;
const CACHE_LIMIT = 600;
const FAILURES_TO_COOLDOWN = 3;
const COOLDOWN_MS = 10 * 60 * 1000;

const cache = new Map();
let active = 0;
const queue = [];

async function readJson(response) {
  if (!response.ok) throw new Error(`http ${response.status}`);
  const body = await response.text();
  if (!body.startsWith('[') && !body.startsWith('{')) throw new Error('not json');
  return JSON.parse(body);
}

async function google(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&dj=0`;
  const data = await readJson(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: `q=${encodeURIComponent(text)}`,
    }),
  );
  const chunks = Array.isArray(data?.[0]) ? data[0] : [];
  const translated = chunks.map((chunk) => chunk?.[0] ?? '').join('');
  if (!translated) throw new Error('empty');
  return { text: translated, source: typeof data?.[2] === 'string' ? data[2] : '' };
}

async function myMemory(text, target, hint) {
  const from = hint && hint !== 'und' ? hint : 'Autodetect';
  const url =
    'https://api.mymemory.translated.net/get' +
    `?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${from}|${target}`)}`;
  const data = await readJson(await fetch(url));
  const translated = data?.responseData?.translatedText;
  if (!translated || data.responseStatus !== 200) throw new Error('empty');
  if (data.quotaFinished || /^MYMEMORY WARNING/i.test(translated)) {
    throw new Error('quota');
  }
  return { text: translated, source: data.responseData.detectedLanguage || from };
}

const providers = [
  { name: 'google', call: google, failures: 0, coolUntil: 0 },
  { name: 'mymemory', call: myMemory, failures: 0, coolUntil: 0 },
];

const COOL_KEY = 'tempo:translate:cool';
let hydrating = null;

function hydrate() {
  if (!chrome.storage?.session) return Promise.resolve();
  hydrating ??= chrome.storage.session
    .get(COOL_KEY)
    .then((data) => {
      const saved = data?.[COOL_KEY] || {};
      for (const provider of providers) {
        provider.coolUntil = Math.max(provider.coolUntil, Number(saved[provider.name]) || 0);
      }
    })
    .catch(() => {});
  return hydrating;
}

function persistCool() {
  if (!chrome.storage?.session) return;
  const value = Object.fromEntries(providers.map((provider) => [provider.name, provider.coolUntil]));
  chrome.storage.session.set({ [COOL_KEY]: value }).catch(() => {});
}

export function resetProviders() {
  for (const provider of providers) {
    provider.failures = 0;
    provider.coolUntil = 0;
  }
  hydrating = Promise.resolve();
  persistCool();
}

function allCooled(now = Date.now()) {
  return providers.every((provider) => provider.coolUntil > now);
}

function nextTry(now = Date.now()) {
  return Math.max(0, Math.min(...providers.map((p) => p.coolUntil)) - now);
}

async function translateOne(text, target, hint) {
  const now = Date.now();
  let lastError = null;
  for (const provider of providers) {
    if (provider.coolUntil > now) continue;
    try {
      const result = await provider.call(text, target, hint);
      provider.failures = 0;
      return result;
    } catch (error) {
      lastError = error;
      provider.failures += 1;
      if (provider.failures >= FAILURES_TO_COOLDOWN) {
        provider.coolUntil = Date.now() + COOLDOWN_MS;
        provider.failures = 0;
        persistCool();
      }
    }
  }
  throw lastError || new Error('нет доступного переводчика');
}

function remember(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const job = queue.shift();
    active += 1;
    job().finally(() => {
      active -= 1;
      pump();
    });
  }
}

function schedule(task) {
  return new Promise((resolve) => {
    queue.push(() => task().then(resolve, () => resolve(null)));
    pump();
  });
}

export async function translateBatch({ items, target }) {
  await hydrate();
  const results = await Promise.all(
    (items || []).map(async (item) => {
      const text = (item?.text || '').trim();
      if (!text) return null;
      const key = `${target} ${text}`;
      if (cache.has(key)) return cache.get(key);

      const result = await schedule(() => translateOne(text, target, item.lang));
      if (result) remember(key, result);
      return result;
    }),
  );

  const asked = results.length > 0;
  const degraded = asked && results.every((row) => row === null) && allCooled();
  return { results, degraded, retryInMs: degraded ? nextTry() : 0 };
}
