import { t } from '../core/i18n.js';
import { compactDuration } from '../core/time.js';
import { describeTimer } from '../core/phase.js';
import { today } from './activity-store.js';

export const TICK_ALARM = 'tempo:pomodoro:tick';

const ICONS = {
  idle: { 16: 'icons/16.png', 32: 'icons/32.png' },
  focus: { 16: 'icons/focus-16.png', 32: 'icons/focus-32.png' },
  short: { 16: 'icons/rest-16.png', 32: 'icons/rest-32.png' },
  long: { 16: 'icons/long-16.png', 32: 'icons/long-32.png' },
};

export const NOTE_ICON = {
  idle: 'icons/128.png',
  focus: 'icons/focus-128.png',
  short: 'icons/rest-128.png',
  long: 'icons/long-128.png',
};

const BADGE = {
  idle: { background: '#14141C', text: '#FFFFFF' },
  focus: { background: '#1717FF', text: '#FFFFFF' },
  rest: { background: '#DCDCFF', text: '#0000C8' },
  paused: { background: '#5A5A72', text: '#FFFFFF' },
};

async function apply({ icon, text, background, color, title }) {
  await chrome.action.setIcon({ path: ICONS[icon] || ICONS.idle }).catch(() => {});
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: background });
  await chrome.action.setBadgeTextColor?.({ color });
  await chrome.action.setTitle({ title });
}

export async function paintToolbar(state, pomodoro) {
  const timer = describeTimer(state, pomodoro);

  if (timer.idle) {
    const { seconds } = await today();
    const skin = BADGE.idle;
    await apply({
      icon: 'idle',
      text: seconds >= 60 ? compactDuration(seconds) : '',
      background: skin.background,
      color: skin.text,
      title: seconds ? t('toolbar.idle', { time: compactDuration(seconds) }) : 'Tempo',
    });
    return;
  }

  const minutes = Math.max(1, Math.ceil(timer.leftSeconds / 60));
  const skin = BADGE[timer.tone] || BADGE.focus;
  await apply({
    icon: timer.id,
    text: String(minutes),
    background: skin.background,
    color: skin.text,
    title: t('toolbar.phase', {
      phase: timer.title,
      paused: timer.paused ? t('toolbar.paused') : '',
      n: minutes,
    }),
  });
}

export async function scheduleTick(state) {
  await chrome.alarms.clear(TICK_ALARM);
  if (state?.endsAt) await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
}
