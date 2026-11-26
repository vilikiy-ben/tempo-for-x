import { h } from '../dom.js';
import { pixelIcon } from '../pixel.js';
import { createSegment } from './segment.js';
import { createCheckbox } from './checkbox.js';
import { AGENT_MODELS } from '../../core/constants.js';
import { describeAgent, REINSTALLABLE } from '../../core/agent.js';
import { t } from '../../core/i18n.js';

const INSTALL = 'npm run agent:install';

const SETUP_LEAD = {
  'no-host': 'agent.setup.lead',
  stale: 'agent.setup.lead.stale',
  forbidden: 'agent.setup.lead.forbidden',
};

const COPIED_MS = 2000;

const ARMED_MS = 3000;

export function createAgentPanel({ onModel, onWeb, onEnable, onLogin, onLogout, onOpenUrl, onRecheck }) {
  let stage = 'idle';
  let url = '';
  let note = '';
  let noteWarn = false;
  let armedOut = false;
  let armedTimer = null;
  let copiedTimer = null;
  let state = null;
  let settings = { enabled: false, model: AGENT_MODELS[0].id, web: true };

  const modes = createSegment({
    items: AGENT_MODELS.map((model) => ({ id: model.id, key: model.hint })),
    label: 'agent.title',
    wide: true,
    onPick: (id) => onModel(id),
  });

  const quota = h('p', { class: 'row__value agent__quota' });

  const copyButton = h(
    'button',
    { class: 'code__copy hit', type: 'button', i18nLabel: 'agent.setup.copy', onclick: copy },
    pixelIcon('copy'),
  );
  const copyMark = h('span', { class: 'code__mark', i18n: 'agent.setup.copied' });

  const recheckButton = h('button', {
    class: 'btn btn--quiet hit hit--tall',
    type: 'button',
    i18n: 'agent.recheck',
    onclick: () => onRecheck(),
  });

  const setupLead = h('p', { class: 'row__value setup__lead' });
  const setup = h(
    'div',
    { class: 'setup' },
    setupLead,
    h(
      'ol',
      { class: 'steps' },
      h(
        'li',
        { class: 'steps__item' },
        h('span', { class: 'steps__text', i18n: 'agent.setup.step1' }),
        h('div', { class: 'code' }, h('code', { class: 'code__text', text: INSTALL }), copyMark, copyButton),
      ),
      h(
        'li',
        { class: 'steps__item' },
        h('span', { class: 'steps__text', i18n: 'agent.setup.step2' }),
        h('span', { class: 'steps__note', i18n: 'agent.setup.step2.note' }),
      ),
      h('li', { class: 'steps__item' }, h('span', { class: 'steps__text', i18n: 'agent.setup.step3' })),
    ),
  );

  function copy() {
    navigator.clipboard?.writeText?.(INSTALL).catch(() => {});
    clearTimeout(copiedTimer);
    setup.dataset.copied = 'true';
    copiedTimer = setTimeout(() => {
      delete setup.dataset.copied;
    }, COPIED_MS);
  }

  const loginButton = h('button', {
    class: 'btn hit hit--tall',
    type: 'button',
    i18n: 'agent.login',
    onclick: () => onLogin(),
  });
  const openButton = h('button', {
    class: 'btn btn--quiet hit hit--tall',
    type: 'button',
    i18n: 'agent.login.again',
    onclick: () => onOpenUrl(url),
  });
  const cancelButton = h('button', {
    class: 'link hit hit--tall',
    type: 'button',
    i18n: 'agent.login.cancel',
    onclick: () => onLogin(false),
  });
  const hint = h('p', { class: 'row__value hint' });
  const auth = h(
    'div',
    { class: 'auth' },
    h('div', { class: 'auth__row' }, loginButton, openButton, cancelButton),
    hint,
  );

  const logoutButton = h('button', {
    class: 'agent__cut hit',
    type: 'button',
    i18nLabel: 'agent.logout.label',
    onclick: () => {
      if (!armedOut) {
        armedOut = true;
        clearTimeout(armedTimer);
        armedTimer = setTimeout(() => {
          armedOut = false;
          paint();
        }, ARMED_MS);
        paint();
        return;
      }
      armedOut = false;
      clearTimeout(armedTimer);
      onLogout();
    },
  });

  const webCheck = createCheckbox({ label: 'agent.web.title', onChange: (next) => onWeb?.(next) });
  const web = h(
    'div',
    { class: 'agent__web' },
    h(
      'div',
      { class: 'agent__web-text' },
      h('span', { class: 'agent__web-title', i18n: 'agent.web.title' }),
      h('span', { class: 'row__value', i18n: 'agent.web.hint' }),
    ),
    webCheck.el,
  );

  const foot = h('div', { class: 'agent__foot' }, quota, logoutButton);
  const mode = h('div', { class: 'field' }, modes.el, web, foot);

  const enableButton = h('button', {
    class: 'btn hit hit--tall',
    type: 'button',
    i18n: 'agent.enable',
    onclick: () => onEnable(),
  });

  const statusLine = h('p', { class: 'row__value agent__state' });

  const noteLine = h('p', { class: 'row__value note' });

  const body = h(
    'div',
    { class: 'agent__body' },
    enableButton, mode, auth, setup, statusLine, recheckButton, noteLine,
  );

  const el = h(
    'section',
    { class: 'block', dataset: { block: 'agent', enabled: 'false' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('explain')),
      h('div', { class: 'row__text' }, h('span', { class: 'title', i18n: 'agent.title' })),
    ),
    h('div', { class: 'block__body' }, h('div', {}, body)),
  );

  function face() {
    const code = state?.code || 'unknown';
    if (!settings.enabled) return 'off';
    if (stage === 'starting' || stage === 'waiting' || stage === 'working') return 'login';
    if (code === 'auth' || code === 'login') return 'login';
    if (code === 'ready') return 'ready';
    if (code === 'unknown') return 'waiting';
    return REINSTALLABLE.has(code) ? 'setup' : 'trouble';
  }

  function paint() {
    const shown = face();
    el.dataset.face = shown;
    el.dataset.enabled = 'true';
    el.dataset.warn = String(note ? noteWarn : shown === 'trouble');

    const say = describeAgent(state, settings);

    enableButton.hidden = shown !== 'off';

    mode.hidden = shown !== 'ready';
    modes.set(settings.model);
    webCheck.set(settings.web !== false);
    quota.textContent = say.quota;
    quota.hidden = !say.quota;

    auth.hidden = shown !== 'login';
    loginButton.hidden = stage !== 'idle';
    openButton.hidden = !(stage === 'waiting' && url);
    cancelButton.hidden = stage === 'idle';
    hint.textContent = t(stage === 'waiting' ? 'agent.login.waiting.hint' : 'agent.login.hint');
    hint.hidden = stage === 'starting' || stage === 'working';

    setup.hidden = shown !== 'setup';
    setupLead.textContent = t(SETUP_LEAD[state?.code] || 'agent.setup.lead');

    const troubled = shown === 'trouble' || shown === 'waiting';
    statusLine.hidden = !troubled;
    statusLine.textContent = troubled ? say.text : '';
    statusLine.dataset.warn = String(shown === 'trouble');

    recheckButton.hidden = shown !== 'setup' && shown !== 'trouble';

    noteLine.hidden = !note || shown === 'off';
    noteLine.textContent = note;
    noteLine.dataset.warn = String(noteWarn);

    logoutButton.textContent = t(armedOut ? 'agent.logout.confirm' : 'agent.logout');
    logoutButton.dataset.armed = String(armedOut);
  }

  return {
    el,

    set({ state: next, settings: nextSettings }) {
      state = next ?? state;
      settings = nextSettings ?? settings;
      paint();
    },

    setStage(nextStage, { url: nextUrl = '', note: nextNote = '', warn = false } = {}) {
      stage = nextStage;
      url = nextUrl || (nextStage === 'waiting' ? url : '');
      note = nextNote;
      noteWarn = warn;
      paint();
    },

    repaint: paint,
  };
}
