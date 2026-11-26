import { KEY, AGE_STOPS } from './constants.js';
import { UI_LANGS, detectLang, setLang } from './i18n.js';
import { read, write, subscribe } from './storage.js';

export const SETTINGS_VERSION = 2;

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    age: {
      enabled: false,
      min: 0,
      max: AGE_STOPS.indexOf(86400),
    },
    langs: {
      enabled: false,
      allow: ['ru', 'en'],
      allowUnknown: true,
    },
    ui: {
      lang: detectLang(),
      theme: 'auto',
    },
    translate: {
      enabled: false,
      target: detectLang(),
    },
    clutter: {
      enabled: false,
    },
    quick: {
      enabled: false,
    },
    shot: {
      sign: '',
      theme: 'auto',
    },
    agent: {
      enabled: false,
      model: 'gpt-5.6-luna',
      web: true,
    },
    jev: {
      enabled: false,
      images: false,
    },
    pomodoro: {
      focus: 25 * 60,
      shortBreak: 5 * 60,
      longBreak: 15 * 60,
      cycle: 4,
      sound: true,
    },
    hud: {
      corner: 'bottom-right',
      greeted: false,
    },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(saved)) {
    if (!(k in out)) continue;
    const current = out[k];
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      out[k] = merge(current, v);
    } else if (v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out;
}

function adopt(settings, saved) {
  if (saved && !saved.ui && saved.translate?.target) {
    const known = UI_LANGS.some((item) => item.id === saved.translate.target);
    if (known) settings.ui.lang = saved.translate.target;
  }
  if (settings.agent.enabled && !settings.quick.enabled) settings.quick.enabled = true;
  setLang(settings.ui.lang);
  return settings;
}

export async function loadSettings() {
  const saved = await read(KEY.settings, null);
  return adopt(merge(defaultSettings(), saved), saved);
}

export async function saveSettings(next) {
  await write(KEY.settings, next);
}

export async function patchSettings(patch) {
  const current = await loadSettings();
  const next = adopt(typeof patch === 'function' ? patch(current) : merge(current, patch));
  await saveSettings(next);
  return next;
}

export function onSettingsChange(handler) {
  return subscribe(KEY.settings, (raw) => handler(adopt(merge(defaultSettings(), raw), raw)));
}
