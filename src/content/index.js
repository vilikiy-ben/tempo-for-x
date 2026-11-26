import { MSG } from '../core/constants.js';
import { loadSettings, onSettingsChange, patchSettings } from '../core/settings.js';
import * as heartbeat from './heartbeat.js';
import * as timeline from './timeline.js';
import * as warmth from './warmth.js';
import * as translator from './translate.js';
import * as agent from './agent.js';
import * as chime from './chime.js';
import * as theme from './theme.js';
import { mountHud } from '../ui/hud.js';

function domReady() {
  if (document.body) return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
}

function watchNavigation(onChange) {
  let previous = location.href;
  const check = () => {
    if (location.href === previous) return;
    previous = location.href;
    onChange();
  };
  window.addEventListener('popstate', check);
  setInterval(check, 700);
}

async function boot() {
  if (window.__tempoBooted) return;
  window.__tempoBooted = true;

  await domReady();
  let settings = await loadSettings();

  await heartbeat.start();
  theme.start(settings);
  await timeline.start(settings);
  warmth.configure(settings);

  const hud = mountHud({
    settings,
    onPatch: (partial) => patchSettings(partial),
    heartbeat,
    timeline,
    translator,
    agent,
    theme: { current: theme.theme, onChange: theme.onChange },
  });

  onSettingsChange((next) => {
    const langChanged = settings.ui.lang !== next.ui.lang;
    settings = next;
    theme.configure(next);
    timeline.update(next);
    warmth.configure(next);
    hud.update(next);
    if (langChanged) timeline.resetForNavigation({ full: true });
  });

  chime.listenForGesture(() => settings.pomodoro.sound);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === MSG.togglePanel) hud.toggle();
    if (message?.type === MSG.chime) {
      chime.play(message.payload?.kind).then((played) => sendResponse({ played }));
      return true;
    }
    return false;
  });

  watchNavigation(() => timeline.resetForNavigation());
}

boot();
