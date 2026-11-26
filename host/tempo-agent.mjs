#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { DISABLED_FEATURES, PROTOCOL, classifyError, composeInput, decodeFrames, encodeFrame,
  extractLoginUrl, instructionsFor, sawOf, tidyAnswer } from './protocol.mjs';

const CODEX_BIN = process.env.TEMPO_CODEX_BIN || 'codex';
const CODEX_HOME = process.env.TEMPO_CODEX_HOME || path.join(homedir(), '.tempo', 'codex');
const LOG = process.env.TEMPO_AGENT_LOG || '';
const DEFAULT_MODEL = process.env.TEMPO_MODEL || 'gpt-5.6-luna';

const TURNS_PER_THREAD = 8;
const TURN_TIMEOUT_MS = 150_000;
const IDLE_SHUTDOWN_MS = 10 * 60_000;

const log = (...parts) => {
  if (!LOG) return;
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${parts.join(' ')}\n`);
  } catch {
  }
};

let inbox = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inbox = Buffer.concat([inbox, chunk]);
  const { messages, rest } = decodeFrames(inbox);
  inbox = rest;
  for (const message of messages) {
    handle(message).catch((error) => {
      log('необработанное:', error?.stack || error);
      reply(message.id, { kind: 'error', code: 'host', message: String(error?.message || error) });
    });
  }
});

process.stdin.on('end', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

function reply(id, payload) {
  process.stdout.write(encodeFrame({ id, ...payload }));
}

let codex = null;
let starting = null;
let rpcId = 1;
const pending = new Map();
let listeners = [];
let idleTimer = null;

let thread = null;
let threadTurns = 0;
let threadLang = null;
let threadPrimed = false;
let model = DEFAULT_MODEL;
let answerLang = 'ru';
let webSearch = true;
let threadWeb = null;

function adoptLang(next) {
  if (next !== 'ru' && next !== 'en') return;
  answerLang = next;
}

function adoptWeb(next) {
  if (typeof next === 'boolean') webSearch = next;
}

const threadFits = () =>
  thread && threadTurns < TURNS_PER_THREAD && threadLang === answerLang && threadWeb === webSearch;

function loggedIn() {
  return existsSync(path.join(CODEX_HOME, 'auth.json'));
}

function accountOf() {
  try {
    const auth = JSON.parse(readFileSync(path.join(CODEX_HOME, 'auth.json'), 'utf8'));
    return { mode: auth.auth_mode || 'chatgpt' };
  } catch {
    return null;
  }
}

async function ensureCodex() {
  if (codex) return;
  if (starting) return starting;
  starting = start().finally(() => {
    starting = null;
  });
  return starting;
}

async function start() {
  if (!loggedIn()) {
    const error = new Error('нет входа в Codex');
    error.code = 'auth';
    throw error;
  }

  const child = spawn(
    CODEX_BIN,
    [
      'app-server',
      '--stdio',
      '-c', 'model_reasoning_effort=low',
      '-c', 'model_reasoning_summary=none',
      '-c', 'web_search="disabled"',
      ...DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_HOME },
    },
  );

  child.on('error', (error) => {
    log('codex не запустился:', error.message);
    failAll('codex', `не удалось запустить ${CODEX_BIN}: ${error.message}`);
    codex = null;
  });
  child.stderr.on('data', (chunk) => log('codex stderr:', chunk.toString().trim().slice(0, 400)));
  child.on('exit', (code) => {
    log('codex вышел с кодом', code);
    codex = null;
    thread = null;
    failAll('codex', 'codex завершился');
  });

  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (!waiter) return;
      if (message.error) waiter.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of [...listeners]) listener(message);
  });

  codex = child;
  const init = await rpc('initialize', {
    clientInfo: { name: 'tempo', title: 'Tempo', version: '1.0.0' },
  });
  notify('initialized', {});
  log('codex поднят:', init?.userAgent || '');
  return init;
}

function rpc(method, params) {
  if (!codex) return Promise.reject(new Error('codex не запущен'));
  const id = rpcId++;
  codex.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params) {
  codex?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

function failAll(code, message) {
  for (const waiter of pending.values()) waiter.reject(new Error(message));
  pending.clear();
  for (const listener of [...listeners]) listener({ method: 'error', params: { message, code } });
  listeners = [];
}

function touchIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!codex) return;
    log('codex гасится по простою');
    codex.kill();
    codex = null;
    thread = null;
  }, IDLE_SHUTDOWN_MS);
}

async function ensureThread() {
  if (threadFits()) return thread;
  const started = await rpc('thread/start', {
    model,
    ephemeral: true,
    sandbox: 'read-only',
    approvalPolicy: 'never',
    cwd: CODEX_HOME,
    baseInstructions: instructionsFor(answerLang),
    config: { web_search: webSearch ? 'live' : 'disabled' },
  });
  thread = started.thread.id;
  threadTurns = 0;
  threadPrimed = false;
  threadLang = answerLang;
  threadWeb = webSearch;
  return thread;
}

const PRIME_TEXT = {
  ru: 'Прогрев соединения. Ответь одним словом: готово.',
  en: 'Connection warm-up. Answer with one word: ready.',
};
const PRIME_TIMEOUT_MS = 30_000;

async function primeThread() {
  if (threadPrimed && threadFits()) return;
  await ensureCodex();
  const threadId = await ensureThread();
  const finished = new Promise((resolve) => {
    const timer = setTimeout(() => done(false), PRIME_TIMEOUT_MS);
    const listener = (event) => {
      if (event.params?.threadId && event.params.threadId !== threadId) return;
      if (event.method === 'turn/completed') done(true);
      else if (event.method === 'error') done(false);
    };
    const done = (ok) => {
      clearTimeout(timer);
      listeners = listeners.filter((item) => item !== listener);
      resolve(ok);
    };
    listeners.push(listener);
  });
  await rpc('turn/start', {
    threadId, model, effort: 'low',
    input: [{ type: 'text', text: PRIME_TEXT[answerLang] || PRIME_TEXT.ru }],
  });
  threadTurns += 1;
  if (await finished) threadPrimed = true;
  else thread = null;
}

function primeSoon() {
  if (queue.some((job) => job.prime)) return;
  queue.push({
    id: null,
    prime: true,
    run: async () => {
      if (queue.length) return;
      await primeThread();
    },
  });
  pump();
}

const queue = [];
let working = false;
let workingJob = null;
let current = null;

function enqueue(job) {
  queue.push(job);
  const place = queue.filter((item) => !item.prime).length;
  if (place > 1 || (working && !workingJob?.prime)) reply(job.id, { kind: 'queued', place });
  pump();
}

async function pump() {
  if (working) return;
  const job = queue.shift();
  if (!job) return;
  working = true;
  workingJob = job;
  try {
    await job.run();
  } catch (error) {
    const message = String(error?.message || error);
    if (job.id != null) reply(job.id, { kind: 'error', code: error?.code || classifyError(message), message });
    else log('прогрев не удался:', message);
  } finally {
    working = false;
    workingJob = null;
    current = null;
    touchIdle();
    pump();
  }
}

function drop(id) {
  if (login?.id === id) {
    endLogin({ cancelled: true });
    return true;
  }
  const index = queue.findIndex((job) => job.id === id);
  if (index >= 0) {
    queue.splice(index, 1);
    return true;
  }
  if (current?.id !== id) return false;
  current.cancelled = true;
  if (current.turnId) rpc('turn/interrupt', { threadId: thread, turnId: current.turnId }).catch(() => {});
  thread = null;
  current.abort?.();
  primeSoon();
  return true;
}

async function handle(message) {
  const { id, kind } = message || {};
  if (kind === 'hello') return hello(id, message);
  if (kind === 'limits') return limits(id);
  if (kind === 'login') return void startLogin(id);
  if (kind === 'logout') return void doLogout(id);
  if (kind === 'cancel') return void drop(message.ref);
  if (kind === 'prime') {
    enqueue({
      id,
      prime: true,
      run: async () => {
        await primeThread();
        reply(id, { kind: 'prime', ok: threadPrimed });
      },
    });
    return;
  }
  if (kind === 'explain') {
    if (message.model) model = message.model;
    adoptLang(message.lang);
    adoptWeb(message.web);
    enqueue({ id, run: () => explain(id, message) });
    return;
  }
  reply(id, { kind: 'error', code: 'host', message: `неизвестная просьба ${kind}` });
}

async function hello(id, message) {
  if (message?.model) model = message.model;
  adoptLang(message?.lang);
  adoptWeb(message?.web);
  const account = accountOf();
  if (!account) {
    reply(id, { kind: 'hello', ok: false, code: 'auth', home: CODEX_HOME });
    return;
  }
  if (message?.warm) {
    try {
      await ensureCodex();
      touchIdle();
      reply(id, {
        kind: 'hello', ok: true, protocol: PROTOCOL, home: CODEX_HOME, model,
        auth: account.mode, limits: await readLimits(),
      });
      primeSoon();
    } catch (error) {
      const text = String(error?.message || error);
      reply(id, { kind: 'hello', ok: false, code: error?.code || classifyError(text), message: text });
    }
    return;
  }
  reply(id, {
    kind: 'hello',
    ok: true,
    protocol: PROTOCOL,
    home: CODEX_HOME,
    model,
    auth: account.mode,
    limits: codex ? await readLimits() : null,
  });
}

const LOGIN_TIMEOUT_MS = 5 * 60_000;

let login = null;

function endLogin({ cancelled = false } = {}) {
  if (!login) return;
  if (cancelled) login.cancelled = true;
  clearTimeout(login.timer);
  try {
    login.child.kill();
  } catch {
  }
  if (!cancelled) login = null;
}

function forgetCodex() {
  try {
    codex?.kill();
  } catch {
  }
  codex = null;
  thread = null;
  threadPrimed = false;
}

const LOGIN_SAYS = {
  busy: { ru: 'вход уже идёт', en: 'sign-in is already running' },
  missing: { ru: 'не нашёл', en: 'not found:' },
  timeout: { ru: 'вход не завершился за пять минут', en: 'sign-in did not finish in five minutes' },
  unfinished: { ru: 'вход не завершён', en: 'sign-in did not finish' },
};
const loginSay = (what) => LOGIN_SAYS[what][answerLang] || LOGIN_SAYS[what].ru;

function startLogin(id) {
  if (login) {
    reply(id, { kind: 'error', code: 'login', message: loginSay('busy') });
    return;
  }

  const child = spawn(CODEX_BIN, ['login'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CODEX_HOME },
  });

  let sent = false;
  let noise = '';

  const watch = (chunk) => {
    const text = chunk.toString();
    noise = `${noise}${text}`.slice(-2000);
    if (sent) return;
    const url = extractLoginUrl(text);
    if (!url) return;
    sent = true;
    reply(id, { kind: 'login', stage: 'url', url });
  };

  child.stdout.on('data', watch);
  child.stderr.on('data', watch);

  child.on('error', (error) => {
    endLogin();
    reply(id, { kind: 'error', code: 'login', message: `${loginSay('missing')} ${CODEX_BIN}: ${error.message}` });
  });

  child.on('exit', () => {
    const timedOut = login?.timedOut;
    const cancelled = login?.cancelled;
    login = null;
    if (cancelled) return;
    if (loggedIn()) {
      forgetCodex();
      reply(id, { kind: 'login', ok: true, auth: accountOf()?.mode || 'chatgpt' });
      return;
    }
    reply(id, {
      kind: 'error',
      code: 'login',
      message: timedOut ? loginSay('timeout') : lastLine(noise) || loginSay('unfinished'),
    });
  });

  const timer = setTimeout(() => {
    if (!login) return;
    login.timedOut = true;
    try {
      login.child.kill();
    } catch {
    }
  }, LOGIN_TIMEOUT_MS);

  login = { id, child, timer, timedOut: false };
}

function lastLine(text) {
  const clean = String(text || '').replace(/\[[0-9;]*m/g, '');
  const lines = clean.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] || '';
}

function doLogout(id) {
  endLogin();
  const child = spawn(CODEX_BIN, ['logout'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, CODEX_HOME },
  });
  child.on('error', (error) => {
    reply(id, { kind: 'error', code: 'login', message: String(error.message) });
  });
  child.on('exit', () => {
    forgetCodex();
    reply(id, { kind: 'logout', ok: !loggedIn() });
  });
}

async function readLimits() {
  try {
    const data = await rpc('account/rateLimits/read', {});
    const primary = data?.rateLimits?.primary;
    if (!primary) return null;
    return {
      usedPercent: primary.usedPercent ?? null,
      resetsAt: primary.resetsAt ?? null,
      plan: data.rateLimits.planType ?? null,
      reached: Boolean(data.rateLimits.rateLimitReachedType),
    };
  } catch {
    return null;
  }
}

async function limits(id) {
  try {
    await ensureCodex();
    touchIdle();
    reply(id, { kind: 'limits', limits: await readLimits() });
  } catch (error) {
    reply(id, { kind: 'limits', limits: null, message: String(error?.message || error) });
  }
}

async function explain(id, message) {
  await ensureCodex();
  const threadId = await ensureThread();
  const post = message.post || {};
  const input = composeInput(post, answerLang);
  if (!input) {
    reply(id, { kind: 'error', code: 'empty', message: 'в посте нечего объяснять' });
    return;
  }

  current = { id, turnId: null, cancelled: false, abort: null };
  let usage = null;
  let searches = 0;
  const queries = new Set();
  const opened = [];
  const messages = new Map();
  let shown = null;

  const announce = (query) => {
    const text = String(query || '').trim();
    if (!text || queries.has(text)) return;
    queries.add(text);
    reply(id, { kind: 'search', query: text.slice(0, 160) });
  };

  const own = (params) => !params?.threadId || params.threadId === threadId;

  const finished = new Promise((resolve) => {
    current.abort = () => {
      listeners = listeners.filter((item) => item !== listener);
      resolve({ ok: false, cancelled: true });
    };
    const listener = (event) => {
      const { method, params } = event;
      if (!own(params)) return;
      const item = params?.item;
      if (method === 'item/started' && item?.type === 'agentMessage') {
        messages.set(item.id, { phase: item.phase ?? null, text: '' });
      } else if (method === 'item/started' && item?.type === 'webSearch') {
        searches += 1;
        announce(item.query);
      } else if (method === 'item/completed' && item?.type === 'webSearch') {
        announce(item.query || item.action?.query);
        const url = item.action?.url;
        if (typeof url === 'string' && /^https?:\/\//.test(url)) opened.push(url);
      } else if (method === 'item/agentMessage/delta') {
        const entry = messages.get(params.itemId) || { phase: null, text: '' };
        messages.set(params.itemId, entry);
        entry.text += params.delta;
        if (entry.phase === 'commentary') return;
        if (shown !== params.itemId) {
          if (shown !== null) reply(id, { kind: 'reset' });
          shown = params.itemId;
        }
        reply(id, { kind: 'delta', delta: params.delta });
      } else if (method === 'item/completed' && item?.type === 'agentMessage') {
        const entry = messages.get(item.id) || { phase: item.phase ?? null, text: '' };
        entry.phase = item.phase ?? entry.phase;
        if (typeof item.text === 'string' && item.text) entry.text = item.text;
        messages.set(item.id, entry);
      } else if (method === 'thread/tokenUsage/updated') {
        usage = params.tokenUsage?.last ?? null;
      } else if (method === 'turn/completed') {
        listeners = listeners.filter((entry) => entry !== listener);
        resolve({ ok: true });
      } else if (method === 'error') {
        listeners = listeners.filter((entry) => entry !== listener);
        resolve({ ok: false, message: params?.message || 'codex вернул ошибку' });
      }
    };
    listeners.push(listener);
  });

  const turn = await rpc('turn/start', {
    threadId,
    model,
    effort: 'low',
    input,
  });
  current.turnId = turn?.turn?.id ?? null;
  threadTurns += 1;

  let timer = null;
  const outcome = await Promise.race([
    finished,
    new Promise((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, timeout: true, message: 'ответа нет дольше двух с половиной минут' }),
        TURN_TIMEOUT_MS,
      );
    }),
  ]);
  clearTimeout(timer);
  if (outcome.timeout) {
    current.abort?.();
    if (current.turnId) rpc('turn/interrupt', { threadId, turnId: current.turnId }).catch(() => {});
  }

  if (outcome.cancelled) return;
  if (!outcome.ok) {
    thread = null;
    const code = outcome.timeout ? 'silent' : classifyError(outcome.message);
    reply(id, { kind: 'error', code, message: outcome.message });
    return;
  }
  const answers = [...messages.values()].filter((entry) => entry.phase !== 'commentary' && entry.text.trim());
  const raw = answers.at(-1)?.text || '';
  const { text, sources } = tidyAnswer(raw, answerLang);
  const saw = { ...sawOf(post, input), searches };
  reply(id, {
    kind: 'done', text, model, usage, saw,
    sources: sources.length ? sources : [...new Set(opened)].slice(0, 3),
  });
  threadPrimed = true;
  if (threadTurns >= TURNS_PER_THREAD) {
    thread = null;
    primeSoon();
  }
}

function shutdown(code) {
  endLogin();
  try {
    codex?.kill();
  } catch {
  }
  process.exit(code);
}

process.on('uncaughtException', (error) => {
  log('исключение:', error?.stack || error);
});

log('хост запущен, codex home =', CODEX_HOME);
