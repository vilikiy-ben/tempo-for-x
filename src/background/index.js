import { MSG } from '../core/constants.js';
import { pageTabs } from './pages.js';
import { loadSettings } from '../core/settings.js';
import * as activity from './activity-store.js';
import * as pomodoro from './pomodoro.js';
import * as agent from './agent.js';
import * as jev from './jev.js';
import { saveMedia } from './download.js';
import { saveShot, shotImages } from './shot.js';
import { paintToolbar, TICK_ALARM } from './toolbar.js';
import { translateBatch, resetProviders } from './translate.js';

const X_ORIGINS = ['https://x.com/', 'https://twitter.com/'];

let toolbarTimer = null;

async function repaintToolbar() {
  const [state, settings] = await Promise.all([pomodoro.readState(), loadSettings()]);
  await paintToolbar(state, settings.pomodoro);
}

function scheduleToolbar() {
  if (toolbarTimer) return;
  toolbarTimer = setTimeout(() => {
    toolbarTimer = null;
    repaintToolbar();
  }, 20_000);
}

const handlers = {
  async [MSG.activityTick]({ buckets }) {
    const result = await activity.recordBuckets(buckets);
    scheduleToolbar();
    return result;
  },
  [MSG.activityToday]: () => activity.today(),
  [MSG.activityRange]: ({ days }) => activity.range(days || 30),
  [MSG.pomodoroState]: () => pomodoro.readState(),
  [MSG.pomodoroStart]: ({ phase }) => pomodoro.start(phase),
  [MSG.pomodoroPause]: () => pomodoro.pause(),
  [MSG.pomodoroResume]: () => pomodoro.resume(),
  [MSG.pomodoroStop]: () => pomodoro.stop(),
  [MSG.pomodoroSkip]: () => pomodoro.skip(),
  [MSG.pomodoroSetLength]: ({ phase, seconds }) => pomodoro.setLength(phase, seconds),
  [MSG.agentState]: () => agent.readState(),
  [MSG.agentWake]: (payload) => agent.wake(payload),
  [MSG.agentSleep]: () => {
    agent.shutdown();
    return { ok: true };
  },
  [MSG.openTab]: async ({ url }) => {
    const safe = /^https:\/\//.test(String(url || ''));
    if (!safe) return { ok: false };
    await chrome.tabs.create({ url, active: true });
    return { ok: true };
  },
  [MSG.download]: (payload, sender) => saveMedia(payload, sender),
  [MSG.shotImages]: (payload, sender) => shotImages(payload, sender),
  [MSG.shotSave]: (payload) => saveShot(payload),
  [MSG.translate]: (payload) => translateBatch(payload),
  [MSG.jevState]: () => jev.readState(),
  [MSG.jevSetKey]: (payload) => jev.setKey(payload),
  [MSG.jevClearKey]: () => jev.clearKey(),
  [MSG.junkScore]: (payload, sender) => jev.score(payload, sender),
  [MSG.translateReset]: () => {
    resetProviders();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  Promise.resolve(handler(message.payload || {}, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === pomodoro.POMODORO_ALARM) pomodoro.onAlarm();
  if (alarm.name === TICK_ALARM) repaintToolbar();
});

async function togglePanelIn(tab) {
  if (!tab?.id) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: MSG.togglePanel });
    return true;
  } catch {
    return false;
  }
}

async function openX() {
  const [tab] = await pageTabs();
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: X_ORIGINS[0] });
}

chrome.action.onClicked.addListener(async (tab) => {
  const onX = X_ORIGINS.some((origin) => tab?.url?.startsWith(origin));
  if (onX && (await togglePanelIn(tab))) return;
  await openX();
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'toggle-focus') {
    await pomodoro.toggle();
    return;
  }
  if (command !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await togglePanelIn(tab);
});

chrome.notifications?.onButtonClicked.addListener(async (id) => {
  if (id.startsWith('tempo:skip:')) await pomodoro.skip();
  else if (id.startsWith('tempo:focus:')) await pomodoro.start('focus');
  else return;
  await chrome.notifications.clear(id);
});

chrome.notifications?.onClicked.addListener(async (id) => {
  if (!id.startsWith('tempo:')) return;
  await chrome.notifications.clear(id);
  await openX();
});

chrome.runtime.onInstalled.addListener(() => pomodoro.catchUp());
chrome.runtime.onStartup.addListener(() => pomodoro.catchUp());
pomodoro.catchUp();
