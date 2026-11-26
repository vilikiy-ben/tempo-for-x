import { AGENT_HOST, AGENT_PORT, AGENT_PROTOCOL } from '../core/constants.js';
import * as media from './media.js';
import { originOf } from './download.js';

const CACHE_LIMIT = 300;
const IDLE_MS = 5 * 60_000;
const HELLO_TIMEOUT_MS = 20_000;
const LOGIN_TIMEOUT_MS = 5.5 * 60_000;

const cache = new Map();

const STORE_KEY = 'tempo:explainCache';
let hydrating = null;

function hydrate() {
  if (!chrome.storage?.session) return Promise.resolve();
  hydrating ??= chrome.storage.session
    .get(STORE_KEY)
    .then((data) => {
      for (const [id, value] of data?.[STORE_KEY] || []) {
        if (!cache.has(id)) cache.set(id, value);
      }
    })
    .catch(() => {});
  return hydrating;
}

function persist() {
  chrome.storage?.session?.set({ [STORE_KEY]: [...cache.entries()] }).catch(() => {});
}

let port = null;
let nextId = 1;
const waiting = new Map();
let idleTimer = null;
let helloOnce = null;

let state = { code: 'unknown', model: null, limits: null, message: '' };

function reasonFor(message) {
  const text = String(message || '');
  if (/not found/i.test(text)) return 'no-host';
  if (/forbidden|not allowed/i.test(text)) return 'forbidden';
  return 'crash';
}

function open() {
  if (port) return port;
  try {
    port = chrome.runtime.connectNative(AGENT_HOST);
  } catch (error) {
    setState({ code: 'no-host', message: String(error?.message || error) });
    throw error;
  }
  port.onMessage.addListener(receive);
  port.onDisconnect.addListener(() => {
    const code = reasonFor(chrome.runtime.lastError?.message);
    port = null;
    helloOnce = null;
    const message = chrome.runtime.lastError?.message || 'мост закрылся';
    for (const waiter of waiting.values()) waiter.reject({ code, message });
    waiting.clear();
    setState({ code, message });
  });
  return port;
}

function close({ force = false } = {}) {
  clearTimeout(idleTimer);
  idleTimer = null;
  if (!port) return;
  if (waiting.size && !force) {
    touch();
    return;
  }
  const closing = port;
  port = null;
  helloOnce = null;
  for (const waiter of waiting.values()) waiter.reject({ code: 'cancelled', message: 'агент выключен' });
  waiting.clear();
  try {
    closing.disconnect();
  } catch {
  }
}

function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(close, IDLE_MS);
}

function receive(message) {
  const waiter = waiting.get(message?.id);
  if (!waiter) return;
  if (message.kind === 'delta') {
    waiter.onDelta?.(message.delta);
    return;
  }
  if (message.kind === 'queued') {
    waiter.onQueued?.(message.place);
    return;
  }
  if (message.kind === 'search' || message.kind === 'reset') {
    waiter.onEvent?.(message);
    return;
  }
  if (message.kind === 'login' && message.stage) {
    waiter.onStage?.(message);
    return;
  }
  waiting.delete(message.id);
  if (message.kind === 'error') waiter.reject({ code: message.code || 'codex', message: message.message });
  else waiter.resolve(message);
}

function send(payload, { onDelta, onQueued, onStage, onEvent, timeout, onSent } = {}) {
  const id = nextId++;
  const channel = open();
  touch();
  onSent?.(id);
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, onDelta, onQueued, onStage, onEvent });
    if (timeout) {
      setTimeout(() => {
        if (!waiting.has(id)) return;
        waiting.delete(id);
        reject({ code: 'silent', message: 'мост молчит' });
      }, timeout);
    }
    channel.postMessage({ id, ...payload });
  });
}

function setState(next) {
  state = { ...state, ...next };
}

function hello(model, warm = false, lang, web) {
  if (helloOnce && !warm) return helloOnce;
  helloOnce = send({ kind: 'hello', model, warm, lang, web }, { timeout: HELLO_TIMEOUT_MS })
    .then((answer) => {
      if (!answer.ok) {
        setState({ code: answer.code || 'error', message: answer.message || '', limits: null });
        throw { code: answer.code || 'error', message: answer.message || '' };
      }
      if (answer.protocol !== AGENT_PROTOCOL) {
        const trouble = { code: 'stale', message: `мост версии ${answer.protocol ?? 1}` };
        setState({ ...trouble, limits: null });
        throw trouble;
      }
      setState({ code: 'ready', model: answer.model, limits: answer.limits || null, message: '' });
      return answer;
    })
    .catch((error) => {
      helloOnce = null;
      setState({ code: error?.code || 'crash', message: error?.message || '' });
      throw error;
    });
  return helloOnce;
}

export function readState() {
  return state;
}

export async function wake({ model, warm = false, lang, web } = {}) {
  try {
    await hello(model, warm, lang, web);
  } catch {
  }
  return state;
}

const cacheKey = (id, lang) => `${id}|${lang || ''}`;

function remember(key, value) {
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  persist();
}

async function cached(id, lang) {
  if (!id) return null;
  await hydrate();
  return cache.get(cacheKey(id, lang)) || null;
}

chrome.runtime.onConnect.addListener((channel) => {
  if (channel.name !== AGENT_PORT) return;
  const live = new Set();
  const sent = new Map();

  channel.onMessage.addListener(async (message) => {
    if (message?.t === 'cancel') {
      const hostId = sent.get(message.ref);
      if (port && hostId) port.postMessage({ kind: 'cancel', ref: hostId });
      sent.delete(message.ref);
      live.delete(message.ref);
      return;
    }
    if (message?.t === 'login' || message?.t === 'logout') {
      await handleAccount(channel, message, { live, sent });
      return;
    }
    if (message?.t !== 'explain') return;

    const { ref, id, post, model, lang, web } = message;
    live.add(ref);

    const known = await cached(id, lang);
    if (known) {
      if (live.has(ref)) {
        channel.postMessage({
          t: 'done', ref, text: known.text, model: known.model, saw: known.saw, sources: known.sources || [], cached: true,
        });
      }
      return;
    }

    try {
      await hello(model, false, lang, web);
      const origin = channel.sender?.origin || originOf(channel.sender?.url);
      const seen = { ...post, images: await media.inline(post?.images, origin) };
      if (!live.has(ref)) return;
      const answer = await send(
        { kind: 'explain', post: seen, model, lang, web },
        {
          onSent: (hostId) => sent.set(ref, hostId),
          onDelta: (delta) => live.has(ref) && channel.postMessage({ t: 'delta', ref, delta }),
          onQueued: (place) => live.has(ref) && channel.postMessage({ t: 'queued', ref, place }),
          onEvent: (event) => live.has(ref) && channel.postMessage({ t: event.kind, ref, query: event.query }),
        },
      );
      touch();
      const sources = (Array.isArray(answer.sources) ? answer.sources : [])
        .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
        .slice(0, 3);
      const done = { text: answer.text, model: answer.model, saw: answer.saw || null, sources };
      if (answer.text && id) remember(cacheKey(id, lang), done);
      if (live.has(ref)) channel.postMessage({ t: 'done', ref, ...done });
    } catch (error) {
      if (live.has(ref)) {
        channel.postMessage({ t: 'error', ref, code: error?.code || 'error', message: error?.message || '' });
      }
    } finally {
      live.delete(ref);
      sent.delete(ref);
    }
  });

  channel.onDisconnect.addListener(() => {
    for (const hostId of sent.values()) port?.postMessage({ kind: 'cancel', ref: hostId });
    sent.clear();
    live.clear();
  });
});

async function handleAccount(channel, message, { live, sent }) {
  const { ref, t: kind } = message;
  live.add(ref);
  try {
    const answer = await send(
      { kind },
      {
        onSent: (hostId) => sent.set(ref, hostId),
        onStage: (stage) => live.has(ref) && channel.postMessage({ t: 'stage', ref, ...stage }),
        timeout: kind === 'login' ? LOGIN_TIMEOUT_MS : HELLO_TIMEOUT_MS,
      },
    );
    helloOnce = null;
    setState({ code: 'unknown', limits: null, message: '' });
    if (kind === 'login' && answer?.ok) await hello(undefined, true).catch(() => {});
    else await hello().catch(() => {});
    if (live.has(ref)) channel.postMessage({ t: 'done', ref, ok: Boolean(answer?.ok), state });
  } catch (error) {
    if (live.has(ref)) {
      channel.postMessage({ t: 'error', ref, code: error?.code || 'login', message: error?.message || '' });
    }
  } finally {
    live.delete(ref);
    sent.delete(ref);
  }
}

export function shutdown() {
  close({ force: true });
  setState({ code: 'unknown', limits: null, message: '' });
}
