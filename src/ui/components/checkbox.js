import { h } from '../dom.js';
import { pixelIcon } from '../pixel.js';

export function createCheckbox({ label, onChange }) {
  const mark = pixelIcon('check', { scale: 2, className: 'check__mark' });
  const el = h(
    'button',
    {
      class: 'check hit',
      type: 'button',
      role: 'checkbox',
      'aria-checked': 'false',
      i18nLabel: label,
    },
    mark,
  );

  el.addEventListener('click', () => {
    const next = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(next));
    onChange(next);
  });

  return {
    el,
    set(checked) {
      el.setAttribute('aria-checked', String(Boolean(checked)));
    },
  };
}
