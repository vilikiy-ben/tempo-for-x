import { AGE_STOPS } from './constants.js';
import { locale, t } from './i18n.js';

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function hourKey(date = new Date()) {
  return String(date.getHours()).padStart(2, '0');
}

export function hourStart(ms = Date.now()) {
  const date = new Date(ms);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

export function lastDayKeys(days, end = new Date()) {
  const out = [];
  const cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const formatters = new Map();

function formatter(options) {
  const key = `${locale()}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(locale(), options));
  return formatters.get(key);
}

export function weekdayShort(date) {
  return formatter({ weekday: 'short' }).format(date).replace(/\.$/, '');
}

export function dayLabel(date) {
  return formatter({ day: 'numeric', month: 'long' }).format(date);
}

export function humanDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return t('time.sec', { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.min', { n: m });
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? t('time.hour.min', { n: h, m: rest }) : t('time.hour', { n: h });
}

export function dayDuration(seconds) {
  return seconds < 60 ? t('time.min', { n: 0 }) : humanDuration(seconds);
}

export function compactDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function clockDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function ageStopLabel(index) {
  const value = AGE_STOPS[index];
  if (value === 0) return t('age.now');
  if (value === Infinity) return t('age.any');
  if (value < 3600) return t('time.min', { n: value / 60 });
  if (value < 86400) return t('time.hour', { n: value / 3600 });
  return t('time.day', { n: value / 86400 });
}

export function ageRangeLabel(minIndex, maxIndex) {
  if (minIndex === 0 && AGE_STOPS[maxIndex] === Infinity) return t('age.range.any');
  if (minIndex === 0) return t('age.range.upto', { age: ageStopLabel(maxIndex) });
  if (AGE_STOPS[maxIndex] === Infinity) return t('age.range.from', { age: ageStopLabel(minIndex) });
  return t('age.range.between', { from: ageStopLabel(minIndex), to: ageStopLabel(maxIndex) });
}
