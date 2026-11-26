import { MSG } from '../core/constants.js';
import { t } from '../core/i18n.js';
import { normalizeLang } from '../core/languages.js';

const TOKEN = /(https?:\/\/[^\s]+|(?<![\w@])@[A-Za-z0-9_]{1,15}|(?<![\w#])#[\p{L}\p{N}_]+)/gu;

const memory = new WeakMap();

const RETRY_MS = 90_000;

const RECHECK_MS = 180;

let viewport = null;
let content = null;
let currentTarget = 'ru';
let enabled = false;
let retryAt = 0;
let retryTimer = null;
let recheckTimer = null;
const dirty = new Set();
const statusListeners = new Set();

export function onStatus(handler) {
  statusListeners.add(handler);
  handler(status());
  return () => statusListeners.delete(handler);
}

export function status() {
  return { failing: retryAt > Date.now(), retryInMs: Math.max(0, retryAt - Date.now()) };
}

function emitStatus() {
  const snapshot = status();
  statusListeners.forEach((handler) => handler(snapshot));
}

function scheduleRetry(delay) {
  retryAt = Date.now() + delay;
  emitStatus();
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryAt = 0;
    for (const el of document.querySelectorAll('[data-tempo-tr="failed"]')) {
      delete el.dataset.tempoTr;
    }
    emitStatus();
  }, delay);
}

function serialize(root) {
  let out = '';
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.data;
      } else if (child.nodeName === 'IMG') {
        out += child.getAttribute('alt') || '';
      } else if (child.nodeName === 'BR') {
        out += '\n';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.hasAttribute('data-tempo-mark')) continue;
        walk(child);
      }
    }
  };
  walk(root);
  return out;
}

function linkFor(token) {
  if (token.startsWith('http')) return token;
  if (token.startsWith('@')) return `https://x.com/${token.slice(1)}`;
  return `https://x.com/hashtag/${encodeURIComponent(token.slice(1))}`;
}

function buildNodes(text) {
  const fragment = document.createDocumentFragment();
  const lines = text.split('\n');
  lines.forEach((line, lineIndex) => {
    if (lineIndex) fragment.append(document.createElement('br'));
    let cursor = 0;
    for (const match of line.matchAll(TOKEN)) {
      if (match.index > cursor) {
        fragment.append(document.createTextNode(line.slice(cursor, match.index)));
      }
      const anchor = document.createElement('a');
      anchor.href = linkFor(match[0]);
      anchor.textContent = match[0];
      anchor.style.color = 'rgb(29, 155, 240)';
      anchor.style.textDecoration = 'none';
      if (match[0].startsWith('http')) anchor.rel = 'noopener noreferrer';
      fragment.append(anchor);
      cursor = match.index + match[0].length;
    }
    if (cursor < line.length) fragment.append(document.createTextNode(line.slice(cursor)));
  });
  return fragment;
}

function buildMark(el) {
  const mark = document.createElement('button');
  mark.className = 'tempo-translated-mark';
  mark.setAttribute('data-tempo-mark', '');
  mark.setAttribute('data-tempo', '');
  mark.type = 'button';
  mark.textContent = currentTarget.toUpperCase();
  mark.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const state = memory.get(el);
    if (state) setMode(el, state.mode === 'translated' ? 'original' : 'translated');
  });
  return mark;
}

function ensureNode(el) {
  const state = memory.get(el);
  if (state?.node?.isConnected && state.node.parentElement === el.parentElement) {
    return state.node;
  }
  const node = document.createElement('div');
  node.setAttribute('data-tempo-translation', '');
  node.setAttribute('data-tempo', '');
  node.className = el.className;
  node.setAttribute('lang', currentTarget);
  const dir = el.getAttribute('dir');
  if (dir) node.setAttribute('dir', dir);

  const body = document.createElement('span');
  body.setAttribute('data-tempo-body', '');
  node.append(body, buildMark(el));
  el.after(node);
  return node;
}

function setMode(el, mode) {
  const state = memory.get(el);
  if (!state) return;
  state.mode = mode;
  state.node.dataset.tempoMode = mode;
  el.dataset.tempoTr = mode === 'translated' ? 'translated' : 'original';
  const mark = state.node.querySelector('[data-tempo-mark]');
  if (mark) {
    mark.title = t(mode === 'translated' ? 'translate.show.original' : 'translate.show.translation');
    mark.setAttribute(
      'aria-label',
      t(mode === 'translated' ? 'translate.done.original' : 'translate.show.translation'),
    );
    mark.setAttribute('aria-pressed', String(mode === 'translated'));
  }
}

function render(el) {
  const state = memory.get(el);
  if (!state) return;
  const node = ensureNode(el);
  state.node = node;
  node.classList.remove('tempo-translating');
  node.querySelector('[data-tempo-body]').replaceChildren(buildNodes(state.translated));
  setMode(el, state.mode);
}

async function fetchTranslation(text, lang) {
  const response = await chrome.runtime
    .sendMessage({
      type: MSG.translate,
      payload: { items: [{ text, lang }], target: currentTarget },
    })
    .catch(() => null);
  return { payload: response?.data, result: response?.data?.results?.[0] };
}

async function translateElement(el) {
  if (!enabled || el.dataset.tempoTr) return;
  const declared = normalizeLang(el.getAttribute('lang'));
  if (declared === currentTarget) {
    el.dataset.tempoTr = 'skip';
    observeContent(el);
    return;
  }

  const source = serialize(el).trim();
  if (source.length < 2) return;

  el.dataset.tempoTr = 'pending';
  el.classList.add('tempo-translating');
  const target = currentTarget;
  const { payload, result } = await fetchTranslation(source, declared);
  el.classList.remove('tempo-translating');
  if (!enabled || target !== currentTarget || el.dataset.tempoTr !== 'pending') return;

  if (!result || !result.text) {
    el.dataset.tempoTr = 'failed';
    if (payload?.degraded) scheduleRetry(Math.max(payload.retryInMs || 0, RETRY_MS));
    else scheduleRetry(RETRY_MS);
    return;
  }
  if (retryAt) {
    retryAt = 0;
    clearTimeout(retryTimer);
    emitStatus();
  }
  if (normalizeLang(result.source) === currentTarget || result.text.trim() === source) {
    el.dataset.tempoTr = 'skip';
    observeContent(el);
    return;
  }

  memory.set(el, { source, translated: result.text, mode: 'translated', node: null });
  render(el);
  observeContent(el);
}

async function refresh(el) {
  const state = memory.get(el);
  const source = serialize(el).trim();
  const declared = normalizeLang(el.getAttribute('lang'));

  if (!state) {
    if (el.dataset.tempoTr === 'skip' && declared !== currentTarget) {
      delete el.dataset.tempoTr;
      translateElement(el);
    }
    return;
  }
  if (source === state.source || source.length < 2) return;
  if (declared === currentTarget) {
    state.node?.remove();
    memory.delete(el);
    el.dataset.tempoTr = 'skip';
    return;
  }

  state.source = source;
  state.node?.classList.add('tempo-translating');
  const target = currentTarget;
  const { result } = await fetchTranslation(source, declared);
  state.node?.classList.remove('tempo-translating');
  if (!enabled || target !== currentTarget) return;
  if (!result?.text || memory.get(el) !== state || state.source !== source) return;

  state.translated = result.text;
  render(el);
}

function ensureViewport() {
  if (viewport) return viewport;
  viewport = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        viewport.unobserve(entry.target);
        translateElement(entry.target);
      }
    },
    { rootMargin: '400px 0px' },
  );
  return viewport;
}

function observeContent(el) {
  if (!content) {
    content = new MutationObserver((records) => {
      for (const record of records) {
        const owner = ownerOf(record.target);
        if (owner) dirty.add(owner);
      }
      if (!dirty.size || recheckTimer) return;
      recheckTimer = setTimeout(() => {
        recheckTimer = null;
        const batch = [...dirty];
        dirty.clear();
        for (const el2 of batch) if (el2.isConnected) refresh(el2);
      }, RECHECK_MS);
    });
  }
  content.observe(el, { childList: true, subtree: true, characterData: true });
}

function ownerOf(node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return el?.closest?.('[data-tempo-tr]') || null;
}

export function watch(textEl) {
  if (!enabled || !textEl) return;
  const state = memory.get(textEl);
  if (state) {
    if (!state.node?.isConnected || state.node.parentElement !== textEl.parentElement) render(textEl);
    return;
  }
  if (textEl.dataset.tempoTr) return;
  ensureViewport().observe(textEl);
}

export function revertAll(root = document) {
  viewport?.disconnect();
  viewport = null;
  content?.disconnect();
  content = null;
  clearTimeout(recheckTimer);
  recheckTimer = null;
  dirty.clear();
  for (const node of root.querySelectorAll('[data-tempo-translation]')) node.remove();
  for (const el of root.querySelectorAll('[data-tempo-tr]')) {
    memory.delete(el);
    delete el.dataset.tempoTr;
    el.classList.remove('tempo-translating');
  }
}

export function configure(settings) {
  const next = Boolean(settings.translate?.enabled);
  const target = settings.translate?.target || 'ru';
  const changed = next !== enabled || target !== currentTarget;
  if (!changed) return false;
  if (enabled) revertAll();
  clearTimeout(retryTimer);
  retryAt = 0;
  emitStatus();
  if (next) chrome.runtime.sendMessage({ type: MSG.translateReset }).catch(() => {});
  enabled = next;
  currentTarget = target;
  return true;
}
