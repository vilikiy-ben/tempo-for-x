import { h } from '../dom.js';
import { t } from '../../core/i18n.js';

export function createBar({ label = '', className = 'bar' } = {}) {
  const fill = h('i', { class: 'bar__fill' });
  const el = h('div', { class: className }, fill);
  if (label) {
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-label', t(label));
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
  } else {
    el.setAttribute('aria-hidden', 'true');
  }

  let last = 0;

  return {
    el,
    set(progress, { jump = false } = {}) {
      const value = Math.max(0, Math.min(1, progress || 0));
      const instant = jump || value < last;
      el.dataset.jump = String(instant);
      fill.style.transform = `scaleX(${value})`;
      if (label) el.setAttribute('aria-valuenow', String(Math.round(value * 100)));
      last = value;
    },
  };
}
