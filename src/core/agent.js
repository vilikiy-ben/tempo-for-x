import { AGENT_MODELS } from './constants.js';
import { t } from './i18n.js';

const TROUBLE = {
  'no-host': { warn: true },
  forbidden: { warn: true },
  auth: { warn: true },
  quota: { warn: true },
  network: { warn: true },
  crash: { warn: true },
  silent: { warn: true },
  restart: { warn: true },
  empty: { warn: true },
  stale: { warn: true },
  codex: { warn: true },
  login: { warn: true },
  error: { warn: true },
  unknown: { warn: false },
};

function troubleOf(code) {
  const known = TROUBLE[code] ? code : 'error';
  return { text: t(`trouble.${known}`), warn: TROUBLE[known].warn, code: known };
}

export const FIXABLE = new Set(['auth', 'login']);

export const REINSTALLABLE = new Set(['no-host', 'forbidden', 'stale']);

export function explainAgent(code) {
  return troubleOf(code).text;
}

export const RETRYABLE = new Set(['network', 'crash', 'silent', 'restart', 'codex']);

export function modelTitle(id) {
  return AGENT_MODELS.find((model) => model.id === id)?.title || AGENT_MODELS[0].title;
}

export function sawLabel(saw) {
  if (!saw) return '';
  const parts = [];
  if (saw.images === 1) parts.push(t('explain.saw.image'));
  else if (saw.images > 1) parts.push(t('explain.saw.images', { n: saw.images }));
  if (saw.quote) parts.push(t('explain.saw.quote'));
  if (saw.parent) parts.push(t('explain.saw.parent'));
  if (saw.replies > 0) parts.push(t('explain.saw.replies', { n: saw.replies }));
  if (saw.note) parts.push(t('explain.saw.note'));
  if (saw.searches > 0) parts.push(t('explain.saw.search'));
  return parts.length > 2 ? parts.join(', ') : parts.join(t('explain.saw.join'));
}

export function quotaLabel(limits) {
  if (!limits || limits.usedPercent == null) return '';
  const left = Math.max(0, Math.round(100 - limits.usedPercent));
  return t('agent.quota', { n: left });
}

export function describeAgent(state, settings) {
  if (!settings?.enabled) return { text: '', warn: false, model: '', quota: '' };
  const code = state?.code || 'unknown';
  if (code !== 'ready') {
    const trouble = troubleOf(code);
    return { text: trouble.text, warn: trouble.warn, model: '', quota: '' };
  }

  const quota = quotaLabel(state.limits);
  const name = modelTitle(state.model || settings.model);
  return { text: quota ? `${name} · ${quota}` : name, warn: false, model: name, quota };
}
