import { languageName, t } from './i18n.js';

const KNOWN = [
  'ru', 'en', 'uk', 'be', 'ja', 'ko', 'zh', 'zh-Hans', 'zh-Hant',
  'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'cs', 'sv', 'no', 'da', 'fi',
  'tr', 'ar', 'fa', 'he', 'hi', 'bn', 'ta', 'th', 'vi', 'id', 'ms', 'tl',
  'el', 'ro', 'hu', 'bg', 'sr', 'hr', 'sk', 'lt', 'lv', 'et', 'ka', 'hy',
  'kk', 'az', 'ur', 'mr', 'te', 'ne', 'si', 'my', 'km', 'am', 'sw',
  'ca', 'eu', 'gl', 'is', 'sl', 'mk', 'sq', 'bs',
];

const NAMES = new Set(KNOWN);

const UNDETERMINED = new Set(['und', 'zxx', 'qam', 'qct', 'qht', 'qme', 'qst', 'art']);

export const UNKNOWN_LANG = 'und';

export function normalizeLang(raw) {
  if (!raw) return UNKNOWN_LANG;
  const value = String(raw).trim();
  if (UNDETERMINED.has(value)) return UNKNOWN_LANG;
  if (NAMES.has(value)) return value;
  const base = value.split('-')[0].toLowerCase();
  if (UNDETERMINED.has(base)) return UNKNOWN_LANG;
  return NAMES.has(base) ? base : base || UNKNOWN_LANG;
}

export function langName(code) {
  if (code === UNKNOWN_LANG) return t('langs.unknown');
  return languageName(code);
}

export function langBadge(code) {
  if (code === UNKNOWN_LANG) return '—';
  return code.slice(0, 2).toUpperCase();
}

export function allLangs() {
  return KNOWN.slice();
}

export const STARTER_LANGS = ['ru', 'en', 'uk', 'ja', 'es', 'de', 'fr'];
