import { h } from '../dom.js';
import { pixelIcon } from '../pixel.js';
import { createCheckbox } from './checkbox.js';
import { t } from '../../core/i18n.js';

const ARMED_MS = 3000;

export function createJevPanel({ onEnable, onSave, onRemove, onGetKey, onImages }) {
  let state = null;
  let enabled = false;
  let images = false;
  let editing = false;
  let busy = false;
  let problem = '';
  let armed = false;
  let armedTimer = null;

  const input = h('input', {
    class: 'keyfield__input',
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
    i18nPlaceholder: 'junk.key.placeholder',
    i18nLabel: 'junk.key.label',
  });
  const save = h('button', { class: 'btn keyfield__save hit hit--tall', type: 'button', i18n: 'junk.key.save' });
  const entry = h('div', { class: 'keyfield__row' }, h('div', { class: 'keyfield' }, input), save);

  const submit = () => {
    if (!input.value.trim() || busy) return;
    onSave(input.value);
  };
  save.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape' && editing) {
      event.stopPropagation();
      stopEditing();
    }
  });
  input.addEventListener('paste', () => setTimeout(submit, 0));
  input.addEventListener('input', () => {
    if (!problem) return;
    problem = '';
    paint();
  });

  function stopEditing() {
    editing = false;
    problem = '';
    input.value = '';
    paint();
  }

  const tail = h('code', { class: 'keyline__tail' });
  const health = h('span', { class: 'keyline__health' });
  const replace = h('button', {
    class: 'link hit hit--tall',
    type: 'button',
    i18n: 'junk.key.replace',
    onclick: () => {
      editing = true;
      problem = '';
      paint();
      input.focus();
    },
  });
  const keyline = h('div', { class: 'keyline' }, h('span', { class: 'keyline__text' }, tail, health), replace);

  const enableButton = h('button', {
    class: 'btn hit hit--tall',
    type: 'button',
    i18n: 'junk.enable',
    onclick: () => onEnable(),
  });

  const imagesCheck = createCheckbox({ label: 'junk.images.title', onChange: (next) => onImages?.(next) });
  const imagesRow = h(
    'div',
    { class: 'agent__web jev__images' },
    h(
      'div',
      { class: 'agent__web-text' },
      h('span', { class: 'agent__web-title', i18n: 'junk.images.title' }),
      h('span', { class: 'row__value', i18n: 'junk.images.hint' }),
    ),
    imagesCheck.el,
  );

  const note = h('p', { class: 'row__value note' });
  const hint = h('p', { class: 'row__value hint' });
  const getKey = h('button', {
    class: 'link hit hit--tall',
    type: 'button',
    i18n: 'junk.key.get',
    onclick: () => onGetKey(),
  });
  const cancel = h('button', {
    class: 'link hit hit--tall',
    type: 'button',
    i18n: 'junk.key.cancel',
    onclick: () => stopEditing(),
  });

  const remove = h('button', {
    class: 'agent__cut hit',
    type: 'button',
    onclick: () => {
      if (!armed) {
        armed = true;
        clearTimeout(armedTimer);
        armedTimer = setTimeout(() => {
          armed = false;
          paint();
        }, ARMED_MS);
        paint();
        return;
      }
      armed = false;
      clearTimeout(armedTimer);
      onRemove();
    },
  });
  const foot = h('div', { class: 'agent__foot keyfoot' }, getKey, cancel, remove);

  const body = h('div', { class: 'agent__body jev__body' }, keyline, entry, enableButton, imagesRow, note, hint, foot);

  const el = h(
    'section',
    { class: 'block', dataset: { block: 'jev', enabled: 'true' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('gauge')),
      h('div', { class: 'row__text' }, h('span', { class: 'title', i18n: 'junk.title' })),
    ),
    h('div', { class: 'block__body' }, h('div', {}, body)),
  );

  function face() {
    if (!state?.hasKey || editing) return 'ask';
    return enabled ? 'ready' : 'off';
  }

  function paint() {
    const shown = face();
    el.dataset.face = shown;

    keyline.hidden = shown === 'ask';
    entry.hidden = shown !== 'ask';
    enableButton.hidden = shown !== 'off';
    imagesRow.hidden = shown !== 'ready';
    imagesCheck.set(images);
    hint.hidden = shown === 'off';
    hint.textContent = t(images ? 'junk.key.hint.images' : 'junk.key.hint');

    getKey.hidden = shown !== 'ask' || editing;
    cancel.hidden = !editing;
    remove.hidden = shown !== 'ready';
    foot.hidden = getKey.hidden && cancel.hidden && remove.hidden;

    input.disabled = busy;
    save.disabled = busy;
    save.textContent = t(busy ? 'junk.key.checking' : 'junk.key.save');

    tail.textContent = state?.tail || '';
    const status = state?.status;
    health.textContent = t(status === 'bad' ? 'junk.key.bad' : status === 'ok' ? 'junk.key.ok' : 'junk.key.unchecked');
    health.dataset.warn = String(status === 'bad');

    remove.textContent = t(armed ? 'junk.key.armed' : 'junk.key.remove');
    remove.dataset.armed = String(armed);

    note.textContent = problem;
    note.hidden = !problem;
    note.dataset.warn = String(Boolean(problem));
  }

  paint();

  return {
    el,
    set({ state: nextState = state, enabled: nextEnabled = enabled, images: nextImages = images } = {}) {
      state = nextState;
      enabled = nextEnabled;
      images = nextImages;
      paint();
    },
    setBusy(next) {
      busy = next;
      paint();
    },
    saved({ ok, code, state: nextState }) {
      busy = false;
      if (ok) {
        input.value = '';
        editing = false;
        problem = '';
        state = nextState || state;
      } else {
        const key = { malformed: 'junk.key.malformed', offline: 'junk.key.offline', bad: 'junk.key.bad' }[code];
        problem = t(key || `junk.error.${code}`);
      }
      paint();
      if (!ok) input.focus();
    },
    repaint: paint,
  };
}
