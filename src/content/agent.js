import { AGENT_PORT, MSG } from '../core/constants.js';

const IDLE_MS = 90_000;

let port = null;
let idleTimer = null;
let nextRef = 1;
const live = new Map();

function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (live.size) return touch();
    close();
  }, IDLE_MS);
}

function close() {
  clearTimeout(idleTimer);
  if (!port) return;
  const closing = port;
  port = null;
  try {
    closing.disconnect();
  } catch {
  }
}

function open() {
  if (port) return port;
  port = chrome.runtime.connect({ name: AGENT_PORT });
  port.onMessage.addListener((message) => {
    const request = live.get(message?.ref);
    if (!request) return;
    if (message.t === 'delta') {
      request.onDelta?.(message.delta);
      return;
    }
    if (message.t === 'queued') {
      request.onQueued?.(message.place);
      return;
    }
    if (message.t === 'search') {
      request.onSearch?.(message.query);
      return;
    }
    if (message.t === 'reset') {
      request.onReset?.();
      return;
    }
    if (message.t === 'stage') {
      request.onStage?.(message);
      return;
    }
    live.delete(message.ref);
    if (message.t === 'done') {
      request.resolve({
        text: message.text, model: message.model, saw: message.saw, cached: message.cached,
        sources: Array.isArray(message.sources) ? message.sources : [],
        ok: message.ok, state: message.state,
      });
    } else {
      request.reject({ code: message.code || 'error', message: message.message || '' });
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
    for (const request of live.values()) request.reject({ code: 'restart', message: 'канал закрылся' });
    live.clear();
  });
  return port;
}

export function ask({ id, post, model, lang, web, onDelta, onQueued, onSearch, onReset }) {
  return talk({ t: 'explain', id, post, model, lang, web }, { onDelta, onQueued, onSearch, onReset });
}

export function login({ onStage }) {
  return talk({ t: 'login' }, { onStage });
}

export function logout() {
  return talk({ t: 'logout' }, {});
}

function talk(payload, { onDelta, onQueued, onStage, onSearch, onReset }) {
  const ref = nextRef++;
  const channel = open();
  touch();
  let settle;
  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
    live.set(ref, { resolve, reject, onDelta, onQueued, onStage, onSearch, onReset });
  });
  channel.postMessage({ ...payload, ref });
  return {
    promise,
    cancel() {
      if (!live.has(ref)) return;
      live.delete(ref);
      try {
        port?.postMessage({ t: 'cancel', ref });
      } catch {
      }
      settle.reject({ code: 'cancelled', message: '' });
    },
  };
}

export function sleep() {
  close();
  return chrome.runtime.sendMessage({ type: MSG.agentSleep }).catch(() => null);
}

export function openTab(url) {
  return chrome.runtime.sendMessage({ type: MSG.openTab, payload: { url } }).catch(() => null);
}

export function state() {
  return chrome.runtime.sendMessage({ type: MSG.agentState }).then((r) => r?.data ?? null).catch(() => null);
}

export function wake(model, { warm = false, lang, web } = {}) {
  return chrome.runtime
    .sendMessage({ type: MSG.agentWake, payload: { model, warm, lang, web } })
    .then((r) => r?.data ?? null)
    .catch(() => null);
}
