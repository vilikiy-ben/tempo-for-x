import { KEY, MSG } from '../core/constants.js';
import { pageTabs } from './pages.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/storage.js';
import { loadSettings, patchSettings } from '../core/settings.js';
import { advance, idleState, lengthField, lengthsFor, phaseLength, phaseTitle,
  reconcile } from '../core/phase.js';
import { recordPomodoro } from './activity-store.js';
import { NOTE_ICON, paintToolbar, scheduleTick } from './toolbar.js';

const ALARM = 'tempo:pomodoro';

export function readState() {
  return read(KEY.pomodoro, idleState());
}

async function commit(state, pomodoro) {
  await write(KEY.pomodoro, state);
  await chrome.alarms.clear(ALARM);
  if (state.endsAt) await chrome.alarms.create(ALARM, { when: state.endsAt });
  const settings = pomodoro || (await loadSettings()).pomodoro;
  await scheduleTick(state);
  await paintToolbar(state, settings);
  return state;
}

export async function start(phase = 'focus') {
  const { pomodoro } = await loadSettings();
  const previous = await readState();
  return commit(
    {
      phase,
      endsAt: Date.now() + phaseLength(phase, pomodoro) * 1000,
      leftMs: null,
      cyclesDone: previous.cyclesDone || 0,
    },
    pomodoro,
  );
}

export async function pause() {
  const state = await readState();
  if (!state.endsAt) return state;
  return commit({ ...state, endsAt: null, leftMs: Math.max(0, state.endsAt - Date.now()) });
}

export async function resume() {
  const state = await readState();
  if (state.endsAt || state.leftMs == null) return state;
  return commit({ ...state, endsAt: Date.now() + state.leftMs, leftMs: null });
}

export async function stop() {
  return commit(idleState());
}

export async function skip() {
  const state = await readState();
  if (state.phase !== 'short' && state.phase !== 'long') return state;
  return start('focus');
}

export async function setLength(phase, seconds) {
  await patchSettings({
    pomodoro: phase === 'focus' ? lengthsFor(seconds) : { [lengthField(phase)]: seconds },
  });
  const state = await readState();
  if (state.phase !== phase) return state;
  if (state.endsAt) return commit({ ...state, endsAt: Date.now() + seconds * 1000 });
  if (state.leftMs != null) return commit({ ...state, leftMs: seconds * 1000 });
  return state;
}

async function chime(kind) {
  const tabs = await pageTabs();
  const ordered = [...tabs].sort((a, b) => Number(b.active) - Number(a.active));
  for (const tab of ordered) {
    if (!tab.id) continue;
    const answer = await chrome.tabs
      .sendMessage(tab.id, { type: MSG.chime, payload: { kind } })
      .catch(() => null);
    if (answer?.played) return true;
  }
  return false;
}

async function notify(move, { silent }) {
  await loadSettings();
  const rest = move.to === 'short' || move.to === 'long';
  const minutes = Math.round(move.length / 60);
  const body = rest
    ? {
        id: `tempo:skip:${Date.now()}`,
        title: t('notify.break.title', { phase: phaseTitle(move.to), n: minutes }),
        message: t('notify.break.message'),
        button: t('notify.break.button'),
        icon: NOTE_ICON[move.to],
      }
    : {
        id: `tempo:focus:${Date.now()}`,
        title: t('notify.done.title'),
        message: t('notify.done.message'),
        button: t('notify.done.button'),
        icon: NOTE_ICON.focus,
      };

  try {
    await chrome.notifications.create(body.id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(body.icon),
      title: body.title,
      message: body.message,
      buttons: [{ title: body.button }],
      silent,
    });
  } catch {
  }
}

async function announce(move, pomodoro) {
  const kind = move.to === 'focus' || move.to === 'idle' ? 'work' : 'rest';
  const played = pomodoro.sound ? await chime(kind) : false;
  await notify(move, { silent: played });
}

export async function onAlarm() {
  const state = await readState();
  const { pomodoro } = await loadSettings();
  const move = advance(state, pomodoro);
  if (!move) return;

  if (move.counted) await recordPomodoro(state.endsAt || Date.now());
  await commit(move.state, pomodoro);
  await announce({ ...move, length: phaseLength(move.to, pomodoro) }, pomodoro);
}

export async function catchUp() {
  const state = await readState();
  const { pomodoro } = await loadSettings();
  const caught = reconcile(state, pomodoro);
  if (!caught.changed) {
    await paintToolbar(state, pomodoro);
    return state;
  }
  for (const finishedAt of caught.completed) await recordPomodoro(finishedAt);
  return commit(caught.state, pomodoro);
}

export async function toggle() {
  const state = await readState();
  if (state.endsAt) return pause();
  if (state.leftMs != null) return resume();
  return start('focus');
}

export const POMODORO_ALARM = ALARM;
