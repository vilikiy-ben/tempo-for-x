import { h } from '../dom.js';
import { pixelIcon } from '../pixel.js';
import { createBar } from './bar.js';
import { clockDuration, compactDuration, humanDuration } from '../../core/time.js';
import { t } from '../../core/i18n.js';

export function createPebble() {
  const mark = h('span', { class: 'pebble__mark' });
  const time = h('span', { class: 'pebble__time', text: '0:00' });
  const bar = createBar({ className: 'bar bar--rail' });
  const pulse = h('span', { class: 'pebble__pulse', 'aria-hidden': 'true' });

  const el = h(
    'button',
    {
      class: 'pebble',
      type: 'button',
      i18nLabel: 'hud.pebble',
      'aria-expanded': 'false',
      dataset: { tone: 'idle', running: 'false', counting: 'false' },
    },
    mark,
    time,
    bar.el,
    pulse,
  );

  let glyph = null;

  function setGlyph(name) {
    if (name === glyph) return;
    const first = glyph === null;
    glyph = name;
    mark.replaceChildren(pixelIcon(name, { scale: 1 }));
    if (first) return;
    mark.classList.remove('is-new');
    void mark.offsetWidth;
    mark.classList.add('is-new');
  }

  return {
    el,

    set(timer, { todaySeconds, counting }) {
      el.dataset.tone = timer.tone;
      el.dataset.running = String(!timer.idle);
      el.dataset.counting = String(counting);
      setGlyph(timer.glyph);

      if (timer.idle) {
        time.textContent = compactDuration(todaySeconds);
        el.setAttribute('aria-label', t('hud.pebble.idle', { time: humanDuration(todaySeconds) }));
        return;
      }

      time.textContent = clockDuration(timer.leftSeconds);
      bar.set(timer.progress);
      el.setAttribute(
        'aria-label',
        t('hud.pebble.phase', {
          phase: timer.title,
          state: t(timer.paused ? 'hud.pebble.paused' : 'hud.pebble.running'),
          left: clockDuration(timer.leftSeconds),
        }),
      );
    },

    announce() {
      el.classList.remove('is-turning');
      void el.offsetWidth;
      el.classList.add('is-turning');
    },
  };
}
