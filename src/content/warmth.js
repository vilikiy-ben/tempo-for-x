import * as agent from './agent.js';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'];

const WARM_EVERY_MS = 4 * 60_000;
const ACTIVE_WINDOW_MS = 5 * 60_000;
const TICK_MS = 30_000;

const HARD_FAIL = new Set(['no-host', 'forbidden', 'auth', 'stale']);

let enabled = false;
let model = null;
let lang = null;
let web = true;
let timer = null;
let lastInput = 0;
let lastWarm = 0;
let blocked = false;
let listening = false;

const markInput = () => {
  lastInput = Date.now();
};

function reading() {
  return (
    document.visibilityState === 'visible' &&
    document.hasFocus() &&
    Date.now() - lastInput < ACTIVE_WINDOW_MS
  );
}

async function tick() {
  if (!enabled || blocked || !reading()) return;
  if (Date.now() - lastWarm < WARM_EVERY_MS) return;
  lastWarm = Date.now();
  const state = await agent.wake(model, { warm: true, lang, web });
  if (HARD_FAIL.has(state?.code)) blocked = true;
}

function start() {
  if (!listening) {
    listening = true;
    ACTIVITY_EVENTS.forEach((name) =>
      window.addEventListener(name, markInput, { passive: true, capture: true }),
    );
  }
  lastInput = Date.now();
  lastWarm = 0;
  clearInterval(timer);
  timer = setInterval(tick, TICK_MS);
  tick();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

export function configure(settings) {
  const next = Boolean(settings.agent?.enabled);
  const before = `${model}|${lang}|${web}`;
  model = settings.agent?.model || null;
  lang = settings.ui?.lang || null;
  web = settings.agent?.web !== false;
  blocked = false;
  if (next === enabled) {
    if (enabled && `${model}|${lang}|${web}` !== before) {
      lastWarm = 0;
      tick();
    }
    return;
  }
  enabled = next;
  if (enabled) start();
  else stop();
}
