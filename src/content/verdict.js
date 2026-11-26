import { AGE_STOPS } from '../core/constants.js';
import { t } from '../core/i18n.js';
import { ageStopLabel } from '../core/time.js';
import { langName, UNKNOWN_LANG } from '../core/languages.js';

export function judge(tweet, settings, now = Date.now()) {
  const age = settings.age;
  if (age?.enabled && tweet.createdAt) {
    const seconds = Math.max(0, (now - tweet.createdAt) / 1000);
    const min = AGE_STOPS[age.min] ?? 0;
    const max = AGE_STOPS[age.max] ?? Infinity;
    if (seconds > max) {
      return { hidden: true, kind: 'age', reason: t('plaque.reason.older', { age: ageStopLabel(age.max) }) };
    }
    if (seconds < min) {
      return { hidden: true, kind: 'age', reason: t('plaque.reason.fresher', { age: ageStopLabel(age.min) }) };
    }
  }

  const langs = settings.langs;
  if (langs?.enabled && langs.allow?.length) {
    const lang = tweet.lang || UNKNOWN_LANG;
    const unknown = lang === UNKNOWN_LANG;
    const allowed = unknown ? langs.allowUnknown : langs.allow.includes(lang);
    if (!allowed) {
      return { hidden: true, kind: 'lang', reason: langName(lang) };
    }
  }

  return { hidden: false, kind: null, reason: null };
}
