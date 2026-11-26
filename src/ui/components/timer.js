import { h } from '../dom.js';
import { pixelIcon } from '../pixel.js';
import { createBar } from './bar.js';
import { clockDuration } from '../../core/time.js';
import { lengthsFor } from '../../core/phase.js';
import { t } from '../../core/i18n.js';

const FOCUS_LENGTHS = [15, 25, 45, 60];

function createDots() {
  const el = h('div', { class: 'dots' });
  let size = 0;

  return {
    el,
    set({ done, size: next, running }) {
      if (next !== size) {
        size = next;
        el.replaceChildren(...Array.from({ length: size }, () => h('i', { class: 'dots__dot' })));
      }
      [...el.children].forEach((dot, index) => {
        dot.dataset.state =
          index < done ? 'done' : index === done && running ? 'current' : 'todo';
      });
      const left = size - done;
      el.title = left ? t('timer.dots', { n: left }) : '';
    },
  };
}

export function createTimer({ onStart, onPause, onResume, onStop, onSkip, onLength }) {
  const glyph = h('span', { class: 'timer__glyph' });
  const title = h('span', { class: 'timer__title' });
  const count = h('span', { class: 'timer__count' });
  const length = h('button', {
    class: 'timer__length hit',
    type: 'button',
    onclick: () => {
      const minutes = Number(length.dataset.minutes) || 25;
      const at = FOCUS_LENGTHS.indexOf(minutes);
      onLength(FOCUS_LENGTHS[(at + 1) % FOCUS_LENGTHS.length] * 60);
    },
  });

  const bar = createBar({ className: 'bar bar--wide', label: 'timer.bar' });
  const dots = createDots();
  const note = h('span', { class: 'timer__note' });

  const iconButton = (act, name, label, onclick) =>
    h(
      'button',
      { class: 'icon-btn hit', type: 'button', i18nLabel: label, dataset: { act }, onclick },
      pixelIcon(name),
    );

  const textButton = (act, key, onclick) =>
    h('button', { class: 'btn hit hit--tall', type: 'button', i18n: key, dataset: { act }, onclick });

  const start = textButton('start', 'timer.start', onStart);
  const resume = textButton('resume', 'timer.resume', onResume);
  const skip = iconButton('skip', 'skip', 'timer.skip', onSkip);
  const pause = iconButton('pause', 'pause', 'timer.pause', onPause);
  const stop = iconButton('stop', 'stop', 'timer.stop', onStop);
  const actions = h('div', { class: 'timer__actions' }, skip, pause, resume, start, stop);

  const el = h(
    'section',
    { class: 'timer', dataset: { tone: 'idle' } },
    h('div', { class: 'timer__head' }, glyph, title, length, count),
    bar.el,
    h('div', { class: 'timer__foot' }, dots.el, note, actions),
  );

  let drawn = null;

  return {
    el,

    set(timer, { pomodoro, sessions, turned = false }) {
      el.dataset.tone = timer.tone;
      el.dataset.running = String(!timer.idle);

      if (timer.glyph !== drawn) {
        drawn = timer.glyph;
        glyph.replaceChildren(pixelIcon(timer.glyph));
      }
      title.textContent = timer.title;

      const minutes = Math.round(pomodoro.focus / 60);
      length.dataset.minutes = String(minutes);
      length.textContent = t('timer.length', { n: minutes });
      length.hidden = !timer.idle;
      const ritm = lengthsFor(pomodoro.focus);
      const say = t('timer.rhythm', {
        focus: minutes,
        short: ritm.shortBreak / 60,
        long: ritm.longBreak / 60,
      });
      length.setAttribute('aria-label', say);
      length.title = say;

      count.textContent = timer.idle ? '' : clockDuration(timer.leftSeconds);
      count.hidden = timer.idle;

      bar.el.hidden = timer.idle;
      bar.el.setAttribute('aria-label', timer.title);
      if (!timer.idle) bar.set(timer.progress, { jump: turned });

      const showDots = timer.cycle.done > 0 || !timer.idle;
      dots.el.hidden = !showDots;
      if (showDots) dots.set(timer.cycle);

      note.textContent = timer.paused
        ? t('timer.paused')
        : sessions
          ? t('timer.sessions', { n: sessions })
          : '';
      note.hidden = !note.textContent;

      start.hidden = !timer.idle;
      resume.hidden = !timer.paused;
      pause.hidden = timer.idle || timer.paused;
      stop.hidden = timer.idle;
      skip.hidden = timer.idle || timer.paused || timer.id === 'focus';
    },
  };
}
