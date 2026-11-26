import { h } from '../dom.js';
import { AGE_STOP_MAX, AGE_STOPS } from '../../core/constants.js';
import { ageStopLabel } from '../../core/time.js';

const ANCHORS = [
  { index: AGE_STOPS.indexOf(5 * 60), key: 'feed.age.mark.min', n: 5 },
  { index: AGE_STOPS.indexOf(3600), key: 'feed.age.mark.hour', n: 1 },
  { index: AGE_STOPS.indexOf(86400), key: 'feed.age.mark.day', n: 1 },
  { index: AGE_STOPS.indexOf(30 * 86400), key: 'feed.age.mark.day', n: 30 },
];

export function createRange({ onChange }) {
  let minIndex = 0;
  let maxIndex = AGE_STOP_MAX;
  let dragging = null;

  const fill = h('div', { class: 'range__fill' });
  const thumbMin = makeThumb('min', 'feed.age.min');
  const thumbMax = makeThumb('max', 'feed.age.max');
  const track = h('div', { class: 'range__track' }, fill, thumbMin, thumbMax);
  const scale = h(
    'div',
    { class: 'range__scale', 'aria-hidden': 'true' },
    ANCHORS.map((anchor) =>
      h('span', {
        class: 'range__mark',
        i18n: anchor.key,
        i18nParams: { n: anchor.n },
        style: { left: `${(anchor.index / AGE_STOP_MAX) * 100}%` },
      }),
    ),
  );
  const el = h('div', { class: 'range', role: 'group', i18nLabel: 'feed.age.range' }, track, scale);

  function makeThumb(side, label) {
    return h('button', {
      class: 'range__thumb',
      type: 'button',
      role: 'slider',
      dataset: { side },
      i18nLabel: label,
      'aria-valuemin': 0,
      'aria-valuemax': AGE_STOP_MAX,
      'aria-valuenow': 0,
    });
  }

  function paint() {
    const toPercent = (index) => (index / AGE_STOP_MAX) * 100;
    const a = toPercent(minIndex);
    const b = toPercent(maxIndex);
    fill.style.left = `${a}%`;
    fill.style.width = `${b - a}%`;
    thumbMin.style.left = `${a}%`;
    thumbMax.style.left = `${b}%`;
    thumbMin.setAttribute('aria-valuenow', minIndex);
    thumbMin.setAttribute('aria-valuetext', ageStopLabel(minIndex));
    thumbMax.setAttribute('aria-valuenow', maxIndex);
    thumbMax.setAttribute('aria-valuetext', ageStopLabel(maxIndex));
  }

  function commit(next) {
    const changed = next.min !== minIndex || next.max !== maxIndex;
    minIndex = next.min;
    maxIndex = next.max;
    paint();
    if (changed) onChange({ min: minIndex, max: maxIndex });
  }

  function indexFromEvent(event) {
    const box = track.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / Math.max(1, box.width);
    return Math.round(Math.max(0, Math.min(1, ratio)) * AGE_STOP_MAX);
  }

  function move(side, index) {
    if (side === 'min') commit({ min: Math.min(index, maxIndex - 1), max: maxIndex });
    else commit({ min: minIndex, max: Math.max(index, minIndex + 1) });
  }

  function beginDrag(side, thumb, event) {
    dragging = side;
    thumb.dataset.active = 'true';
    thumb.setPointerCapture(event.pointerId);
  }

  for (const [side, thumb] of [['min', thumbMin], ['max', thumbMax]]) {
    thumb.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginDrag(side, thumb, event);
    });
    thumb.addEventListener('pointermove', (event) => {
      if (dragging !== side) return;
      move(side, indexFromEvent(event));
    });
    const end = () => {
      if (dragging !== side) return;
      dragging = null;
      delete thumb.dataset.active;
    };
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
    thumb.addEventListener('keydown', (event) => {
      const current = side === 'min' ? minIndex : maxIndex;
      const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
      if (step) {
        event.preventDefault();
        move(side, current + step);
      } else if (event.key === 'Home') {
        event.preventDefault();
        move(side, 0);
      } else if (event.key === 'End') {
        event.preventDefault();
        move(side, AGE_STOP_MAX);
      }
    });
  }

  track.addEventListener('pointerdown', (event) => {
    const index = indexFromEvent(event);
    const side = Math.abs(index - minIndex) <= Math.abs(index - maxIndex) ? 'min' : 'max';
    move(side, index);
  });

  paint();

  return {
    el,
    set({ min, max }) {
      minIndex = Math.max(0, Math.min(AGE_STOP_MAX - 1, min ?? 0));
      maxIndex = Math.max(minIndex + 1, Math.min(AGE_STOP_MAX, max ?? AGE_STOP_MAX));
      paint();
    },
  };
}
