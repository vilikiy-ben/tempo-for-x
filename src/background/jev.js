import { JEV_API, JUNK_CACHE_LIMIT, KEY } from '../core/constants.js';
import {
  cleanKey, current, errorCodeOf, maskKey, picturesOf, plausibleKey, readable, remember, requestOf, verdictOf,
} from '../core/junk.js';
import { loadSettings } from '../core/settings.js';
import { prepare } from './pictures.js';
import { originOf } from './download.js';

const TIMEOUT_MS = 15000;
const CHECK_TIMEOUT_MS = 8000;

const inflight = new Map();

class JevError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

async function call(path, { key, body, headers = {}, timeout = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetch(`${JEV_API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new JevError('offline');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.json())?.detail?.message || '';
    } catch { }
    throw new JevError(errorCodeOf(response.status), detail || `http ${response.status}`);
  }
  return response.json();
}

async function readKey() {
  const bag = await chrome.storage.local.get(KEY.jevKey);
  return bag[KEY.jevKey] || null;
}

export async function readState() {
  const stored = await readKey();
  if (!stored?.key) return { hasKey: false };
  return { hasKey: true, tail: maskKey(stored.key), status: stored.status || 'unchecked', at: stored.at || 0 };
}

async function markKey(status) {
  const stored = await readKey();
  if (!stored?.key || stored.status === status) return;
  await chrome.storage.local.set({ [KEY.jevKey]: { ...stored, status, at: Date.now() } });
}

export async function setKey({ key: raw }) {
  const key = cleanKey(raw);
  if (!plausibleKey(key)) return { ok: false, code: 'malformed' };
  try {
    await call('/models', { key, timeout: CHECK_TIMEOUT_MS });
  } catch (error) {
    if (error.code === 'offline') {
      await chrome.storage.local.set({ [KEY.jevKey]: { key, status: 'unchecked', at: Date.now() } });
      return { ok: true, state: await readState() };
    }
    return { ok: false, code: error.code === 'auth' ? 'bad' : error.code };
  }
  await chrome.storage.local.set({ [KEY.jevKey]: { key, status: 'ok', at: Date.now() } });
  return { ok: true, state: await readState() };
}

export async function clearKey() {
  await chrome.storage.local.remove(KEY.jevKey);
  return readState();
}

async function readScores() {
  const bag = await chrome.storage.local.get(KEY.junkScores);
  return new Map(Object.entries(bag[KEY.junkScores] || {}));
}

let writing = Promise.resolve();
function store(id, entry) {
  writing = writing.then(async () => {
    const next = remember(await readScores(), id, entry, JUNK_CACHE_LIMIT);
    await chrome.storage.local.set({ [KEY.junkScores]: Object.fromEntries(next) });
  });
  return writing;
}

function picturesNote({ total, seen, allowed, refused }) {
  if (!total) return undefined;
  const why = !allowed ? 'off' : refused ? 'refused' : seen === total ? 'all' : seen ? 'some' : 'failed';
  return { total, seen, why };
}

async function evaluate(id, post, origin) {
  const stored = await readKey();
  if (!stored?.key) throw new JevError('nokey');

  const wanted = picturesOf(post);
  const allowed = wanted.length > 0 && (await loadSettings()).jev?.images === true;
  const pictures = allowed ? await prepare(wanted, origin) : [];
  if (!readable(post) && !pictures.some(Boolean)) throw new JevError(allowed ? 'nopictures' : 'unreadable');

  const started = Date.now();
  let request = requestOf(post, pictures);
  let refused = false;
  let answer;
  try {
    answer = await ask(stored.key, request);
  } catch (error) {
    if (error.code !== 'rejected' || !request.seen || !readable(post)) throw error;
    refused = true;
    request = requestOf(post);
    answer = await ask(stored.key, request);
  }
  await markKey('ok');
  const entry = {
    ...verdictOf(answer.answers),
    noted: Boolean(request.body.state?.context?.community_note_on_post),
    pictures: picturesNote({ total: wanted.length, seen: request.seen, allowed, refused }),
    model: answer.model,
    tokens: answer.usage?.input_tokens ?? null,
    ms: Date.now() - started,
    at: Date.now(),
  };
  await store(id, entry);
  return entry;
}

async function ask(key, { body, headers }) {
  try {
    return await call('/systemone', { key, body, headers });
  } catch (error) {
    if (error.code === 'auth') await markKey('bad');
    throw error;
  }
}

export async function score({ id, post, fresh = false }, sender) {
  const key = String(id || '');
  if (!/^\d{1,25}$/.test(key) || !post || typeof post !== 'object') return { ok: false, code: 'rejected' };
  if (!fresh) {
    const known = (await readScores()).get(key);
    if (current(known)) return { ok: true, verdict: known, cached: true };
  }
  if (!inflight.has(key)) {
    const origin = sender?.origin || originOf(sender?.url);
    inflight.set(key, evaluate(key, post, origin).finally(() => inflight.delete(key)));
  }
  try {
    return { ok: true, verdict: await inflight.get(key) };
  } catch (error) {
    return { ok: false, code: error.code || 'failed' };
  }
}
