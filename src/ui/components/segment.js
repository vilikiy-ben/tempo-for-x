import { h } from '../dom.js';

export function createSegment({ items, label, onPick, wide = false }) {
  const buttons = new Map();
  let active = items[0]?.id;

  const el = h('div', {
    class: `seg${wide ? ' seg--wide' : ''}`,
    role: 'radiogroup',
    i18nLabel: label,
  });

  function focusTo(id) {
    onPick(id);
    buttons.get(id)?.focus();
  }

  function step(from, delta) {
    const order = items.map((item) => item.id);
    const at = order.indexOf(from);
    return order[(at + delta + order.length) % order.length];
  }

  for (const item of items) {
    const button = h('button', {
      class: 'seg__item hit',
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      tabindex: '-1',
      i18n: item.key,
      i18nParams: item.params,
      onclick: () => onPick(item.id),
      onkeydown: (event) => {
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (delta) {
          event.preventDefault();
          focusTo(step(item.id, delta));
          return;
        }
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          focusTo(event.key === 'Home' ? items[0].id : items[items.length - 1].id);
        }
      },
    });
    buttons.set(item.id, button);
    el.append(button);
  }

  return {
    el,
    set(next) {
      active = buttons.has(next) ? next : active;
      for (const [id, button] of buttons) {
        const on = id === active;
        button.setAttribute('aria-checked', String(on));
        button.tabIndex = on ? 0 : -1;
      }
    },
  };
}
