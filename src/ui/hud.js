import tokensCss from './tokens.css';
import hudCss from './hud.css';
import { applyI18n, h } from './dom.js';
import { pixelIcon } from './pixel.js';
import { createAgentPanel } from './components/agent-panel.js';
import { createJevPanel } from './components/jev-panel.js';
import { createCheckbox } from './components/checkbox.js';
import { createRange } from './components/range.js';
import { createLanguages } from './components/languages.js';
import { createSegment } from './components/segment.js';
import { createStats } from './components/stats.js';
import { createPebble } from './components/pebble.js';
import { createTimer } from './components/timer.js';
import { JEV_CONSOLE, KEY, MSG } from '../core/constants.js';
import { FIXABLE, describeAgent } from '../core/agent.js';
import { UI_LANGS, has, setLang, t } from '../core/i18n.js';
import { THEMES } from '../core/theme.js';
import { SHOT_THEMES } from '../core/shot.js';
import { TINTS } from '../core/tints.js';
import { describeTimer, idleState, lengthsFor } from '../core/phase.js';
import { subscribe } from '../core/storage.js';
import { humanDuration, dayDuration, clockDuration, ageRangeLabel } from '../core/time.js';

const MARGIN = 20;
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function send(type, payload) {
  return chrome.runtime.sendMessage({ type, payload }).catch(() => null);
}

export function mountHud({ settings, onPatch, heartbeat, timeline, translator, agent, theme }) {
  const host = document.createElement('div');
  host.id = 'tempo-host';
  host.setAttribute('data-tempo', '');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${tokensCss}\n${hudCss}`;
  root.append(style);

  let state = settings;
  host.dataset.theme = theme?.current?.() || 'light';
  theme?.onChange?.((next) => {
    host.dataset.theme = next;
  });
  let corner = state.hud.corner;
  let open = false;
  let pomodoro = null;
  let todaySeconds = 0;
  let counting = false;
  let pauseReason = null;
  let pomodoroToday = 0;
  let translateFailing = false;
  let agentState = null;
  let hiddenTweets = 0;
  let curating = false;
  let where = '';

  const pebbleUi = createPebble();
  const pebble = pebbleUi.el;

  const live = h('p', { class: 'sr', role: 'status', 'aria-live': 'polite' });

  const todayText = h('p', { class: 'display' });
  const todayNote = h('p', { class: 'head__note', hidden: true });
  const spark = h('div', { class: 'spark', i18nTitle: 'hud.spark' });
  const head = h(
    'header',
    { class: 'head' },
    h(
      'div',
      { class: 'head__today' },
      h('p', { class: 'label', i18n: 'hud.today' }),
      todayText,
      todayNote,
    ),
    spark,
  );

  function noteText() {
    return pauseReason === 'elsewhere' ? t('hud.today.paused.elsewhere') : '';
  }

  const timer = createTimer({
    onStart: () => send(MSG.pomodoroStart, { phase: 'focus' }),
    onPause: () => send(MSG.pomodoroPause),
    onResume: () => send(MSG.pomodoroResume),
    onStop: () => send(MSG.pomodoroStop),
    onSkip: () => send(MSG.pomodoroSkip),
    onLength: (seconds) => {
      send(MSG.pomodoroSetLength, { phase: 'focus', seconds });
      state = { ...state, pomodoro: { ...state.pomodoro, ...lengthsFor(seconds) } };
      paintTime();
    },
  });

  const themes = createSegment({
    items: THEMES.map((id) => ({ id, key: `settings.theme.${id}` })),
    label: 'settings.theme.group',
    wide: true,
    onPick: (next) => patch({ ui: { ...state.ui, theme: next } }),
  });
  const themeBlock = h(
    'section',
    { class: 'block', dataset: { block: 'theme' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('contrast')),
      h('div', { class: 'row__text' }, h('span', { class: 'title', i18n: 'settings.theme.title' })),
    ),
    h('div', { class: 'block__body' }, h('div', {}, themes.el)),
  );

  const langs = createSegment({
    items: UI_LANGS.map((item) => ({ id: item.id, key: `settings.lang.${item.id}` })),
    label: 'settings.lang.group',
    wide: true,
    onPick: (next) => {
      if (next === state.ui.lang) return;
      patch({ ui: { ...state.ui, lang: next } });
    },
  });
  const uiLangBlock = h(
    'section',
    { class: 'block', dataset: { block: 'lang' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('letters')),
      h('div', { class: 'row__text' }, h('span', { class: 'title', i18n: 'settings.lang.title' })),
    ),
    h('div', { class: 'block__body' }, h('div', {}, langs.el)),
  );

  const enableAgent = (extra = {}) =>
    patch({
      agent: { ...state.agent, ...extra, enabled: true },
      quick: { ...state.quick, enabled: true },
    });

  const agentPanel = createAgentPanel({
    onModel: (model) => {
      if (model === state.agent.model) return;
      enableAgent({ model });
      refreshAgent({ wake: true, warm: true });
    },
    onWeb: (web) => {
      if (web === state.agent.web) return;
      enableAgent({ web });
      refreshAgent({ wake: true, warm: true });
    },
    onEnable: () => {
      enableAgent();
      refreshAgent({ wake: true, warm: true });
    },
    onRecheck: () => refreshAgent({ wake: true }),
    onOpenUrl: (url) => agent?.openTab(url),
    onLogin: (start = true) => (start ? beginLogin() : cancelLogin()),
    onLogout: () => finishLogout(),
  });

  let loginRequest = null;

  async function beginLogin() {
    if (!agent || loginRequest) return;
    agentPanel.setStage('starting');
    const request = agent.login({
      onStage: (stage) => {
        if (stage.stage === 'url') agentPanel.setStage('waiting', { url: stage.url });
      },
    });
    loginRequest = request;
    try {
      const answer = await request.promise;
      agentState = answer?.state || agentState;
      agentPanel.setStage('idle', { note: t('agent.login.done') });
      if (!state.agent.enabled) enableAgent();
      refreshAgent({ wake: true, warm: true });
    } catch (error) {
      if (error?.code === 'cancelled') agentPanel.setStage('idle');
      else agentPanel.setStage('idle', { note: t('agent.login.failed', { message: error?.message || '' }), warn: true });
    } finally {
      loginRequest = null;
      paintSettings();
    }
  }

  function cancelLogin() {
    loginRequest?.cancel();
    loginRequest = null;
    agentPanel.setStage('idle');
  }

  async function finishLogout() {
    if (!agent) return;
    agentPanel.setStage('working');
    try {
      const answer = await agent.logout().promise;
      agentState = answer?.state || { code: 'auth' };
      agentPanel.setStage('idle', { note: t('agent.logout.done') });
    } catch (error) {
      agentPanel.setStage('idle', { note: error?.message || '', warn: true });
    }
    paintSettings();
  }

  let jevState = null;

  async function refreshJev() {
    const reply = await send(MSG.jevState);
    if (!reply?.ok) return;
    jevState = reply.data;
    paintSettings();
  }

  const enableJev = () =>
    patch({ jev: { ...state.jev, enabled: true }, quick: { ...state.quick, enabled: true } });

  const jevPanel = createJevPanel({
    onEnable: () => enableJev(),
    onSave: async (raw) => {
      jevPanel.setBusy(true);
      const reply = await send(MSG.jevSetKey, { key: raw });
      const result = reply?.ok ? reply.data : { ok: false, code: 'offline' };
      if (result.ok) jevState = result.state;
      jevPanel.saved(result);
      if (result.ok && !(state.jev.enabled && state.quick.enabled)) enableJev();
    },
    onRemove: async () => {
      const reply = await send(MSG.jevClearKey);
      if (reply?.ok) jevState = reply.data;
      paintSettings();
    },
    onGetKey: () => send(MSG.openTab, { url: JEV_CONSOLE }),
    onImages: (images) => patch({ jev: { ...state.jev, images } }),
  });

  const soundCheck = createCheckbox({
    label: 'settings.sound.check',
    onChange: (enabled) => patch({ pomodoro: { ...state.pomodoro, sound: enabled } }),
  });
  const soundBlock = h(
    'section',
    { class: 'block', dataset: { block: 'sound' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('bell')),
      h('div', { class: 'row__text' }, h('span', { class: 'title', i18n: 'settings.sound.title' })),
      soundCheck.el,
    ),
  );

  const signInput = h('input', {
    class: 'keyfield__input',
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    maxLength: 60,
    i18nPlaceholder: 'settings.shot.placeholder',
    i18nLabel: 'settings.shot.label',
  });
  let signTimer = null;
  const saveSign = () => {
    clearTimeout(signTimer);
    const sign = signInput.value.trim();
    if (sign === (state.shot?.sign || '')) return;
    patch({ shot: { ...state.shot, sign } });
  };
  signInput.addEventListener('input', () => {
    clearTimeout(signTimer);
    signTimer = setTimeout(saveSign, 600);
  });
  signInput.addEventListener('change', saveSign);
  signInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveSign();
  });
  const shotThemes = createSegment({
    items: SHOT_THEMES.map((id) => ({ id, key: `settings.shot.theme.${id}` })),
    label: 'settings.shot.theme.group',
    wide: true,
    onPick: (next) => patch({ shot: { ...state.shot, theme: next } }),
  });

  const tintStrip = h(
    'div',
    { class: 'tints', hidden: true },
    h('span', { class: 'tints__deck', 'aria-hidden': 'true' },
      ...TINTS.map((tint) => h('span', { class: 'tints__dot', style: { background: tint.paper } }))),
    h('span', { class: 'meta', i18n: 'settings.shot.theme.hint' }),
  );

  const shotBlock = h(
    'section',
    { class: 'block', dataset: { block: 'shot' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('frame')),
      h('div', { class: 'row__text' }, h('span', { class: 'title', i18n: 'settings.shot.title' })),
    ),
    h('div', { class: 'block__body' }, h('div', {},
      h('div', { class: 'field' }, shotThemes.el, tintStrip, h('div', { class: 'keyfield' }, signInput)))),
  );

  const ageValue = h('span', { class: 'row__value' });
  const ageCheck = createCheckbox({
    label: 'feed.age.check',
    onChange: (enabled) => patch({ age: { ...state.age, enabled } }),
  });
  const range = createRange({
    onChange: ({ min, max }) => patch({ age: { ...state.age, min, max, enabled: true } }),
  });
  const ageBlock = h(
    'section',
    { class: 'block', dataset: { block: 'age' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('hourglass')),
      h(
        'div',
        { class: 'row__text' },
        h('span', { class: 'title', i18n: 'feed.age.title' }),
        ageValue,
      ),
      ageCheck.el,
    ),
    h('div', { class: 'block__body' }, h('div', {}, range.el)),
  );

  const langValue = h('span', { class: 'row__value' });
  const langCheck = createCheckbox({
    label: 'feed.langs.check',
    onChange: (enabled) => patch({ langs: { ...state.langs, enabled } }),
  });
  const languages = createLanguages({
    onChange: ({ allow, allowUnknown }) =>
      patch({ langs: { ...state.langs, allow, allowUnknown, enabled: true } }),
    onOpen: () => goTo('langs'),
  });
  const langBlock = h(
    'section',
    { class: 'block', dataset: { block: 'langs' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('letters')),
      h('div', { class: 'row__text' }, h('span', { class: 'title', i18n: 'feed.langs.title' }), langValue),
      langCheck.el,
    ),
    h('div', { class: 'block__body' }, h('div', {}, languages.chips)),
  );

  const translateCheck = createCheckbox({
    label: 'feed.translate.check',
    onChange: (enabled) => patch({ translate: { ...state.translate, enabled } }),
  });
  const translateValue = h('span', { class: 'row__value' });
  const translateBlock = h(
    'section',
    { class: 'block', dataset: { block: 'translate' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('translate')),
      h(
        'div',
        { class: 'row__text' },
        h('span', { class: 'title', i18n: 'feed.translate.title' }),
        translateValue,
      ),
      translateCheck.el,
    ),
  );

  const clutterValue = h('span', { class: 'row__value' });
  const clutterCheck = createCheckbox({
    label: 'feed.clutter.check',
    onChange: (enabled) => patch({ clutter: { ...state.clutter, enabled } }),
  });
  const clutterBlock = h(
    'section',
    { class: 'block', dataset: { block: 'clutter' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('trash')),
      h(
        'div',
        { class: 'row__text' },
        h('span', { class: 'title', i18n: 'feed.clutter.title' }),
        clutterValue,
      ),
      clutterCheck.el,
    ),
  );

  const quickValue = h('button', {
    class: 'row__value agent__say agent__say--link hit hit--tall',
    type: 'button',
    onclick: () => goTo('settings'),
  });
  const quickCheck = createCheckbox({
    label: 'feed.quick.check',
    onChange: (enabled) => {
      patch({ quick: { ...state.quick, enabled }, agent: { ...state.agent, enabled }, jev: { ...state.jev, enabled } });
      if (enabled) refreshAgent({ wake: true, warm: true });
      else agent?.sleep();
    },
  });
  const quickBlock = h(
    'section',
    { class: 'block', dataset: { block: 'quick' } },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__glyph' }, pixelIcon('bolt')),
      h(
        'div',
        { class: 'row__text' },
        h('span', { class: 'title', i18n: 'feed.quick.title' }),
        quickValue,
      ),
      quickCheck.el,
    ),
  );

  async function refreshAgent({ wake = false, warm = false } = {}) {
    if (!agent) return;
    const next = wake || warm
      ? await agent.wake(state.agent?.model, { warm, lang: state.ui.lang, web: state.agent?.web !== false })
      : await agent.state();
    if (!next) return;
    agentState = next;
    paintSettings();
  }

  const hiddenNote = h('span', { class: 'meta' });
  const foot = h('footer', { class: 'foot' }, hiddenNote);

  const TABS = [
    { id: 'time', glyph: 'clock', key: 'hud.tab.time' },
    { id: 'feed', glyph: 'sliders', key: 'hud.tab.feed' },
    { id: 'stats', glyph: 'chart', key: 'hud.tab.stats' },
    { id: 'settings', glyph: 'gear', key: 'hud.tab.settings', end: true },
  ];

  const stats = createStats({ onLoaded: () => {} });

  const tabTime = h('div', { class: 'tab', dataset: { tab: 'time' } }, head, timer.el);

  const tabFeed = h(
    'div',
    { class: 'tab', dataset: { tab: 'feed' } },
    ageBlock,
    langBlock,
    clutterBlock,
    quickBlock,
    h('hr', { class: 'rule' }),
    translateBlock,
    foot,
  );

  const tabStats = h('div', { class: 'tab', dataset: { tab: 'stats' } }, stats.el);

  const tabSettings = h(
    'div',
    { class: 'tab tab--settings', dataset: { tab: 'settings' } },
    themeBlock,
    uiLangBlock,
    soundBlock,
    shotBlock,
    h('hr', { class: 'rule' }),
    agentPanel.el,
    h('hr', { class: 'rule' }),
    jevPanel.el,
  );

  const tabLangs = h(
    'div',
    { class: 'tab tab--langs', dataset: { tab: 'langs' } },
    h(
      'header',
      { class: 'tab__head' },
      h(
        'button',
        {
          class: 'back hit',
          type: 'button',
          i18nLabel: 'langs.back',
          onclick: () => goTo('feed'),
        },
        h('span', { class: 'back__glyph' }, pixelIcon('chevronLeft')),
        h('span', { i18n: 'feed.langs.title' }),
      ),
    ),
    languages.picker,
  );

  const TAB_NODES = { time: tabTime, feed: tabFeed, stats: tabStats, settings: tabSettings, langs: tabLangs };
  const railButtons = new Map();

  const railButton = (item) => {
    const button = h(
      'button',
      {
        class: 'rail__btn hit',
        type: 'button',
        role: 'tab',
        'aria-selected': 'false',
        dataset: { tab: item.id },
        i18nLabel: item.key,
        i18nTitle: item.key,
        onclick: () => goTo(item.id),
      },
      pixelIcon(item.glyph, { scale: 2 }),
    );
    railButtons.set(item.id, button);
    return button;
  };

  const rail = h(
    'nav',
    { class: 'rail', role: 'tablist', i18nLabel: 'hud.rail', 'aria-orientation': 'vertical' },
    TABS.filter((item) => !item.end).map(railButton),
    h(
      'div',
      { class: 'rail__end' },
      h('hr', { class: 'rail__rule' }),
      TABS.filter((item) => item.end).map(railButton),
    ),
  );

  const tabs = h('div', { class: 'tabs' }, tabTime, tabFeed, tabStats, tabSettings, tabLangs);

  const panel = h(
    'section',
    { class: 'panel', role: 'dialog', i18nLabel: 'hud.pebble', 'aria-modal': 'false' },
    rail,
    tabs,
  );

  let page = 'time';

  function goTo(next) {
    if (page === next) return;
    if (next === 'stats') stats.load();

    for (const [id, node] of Object.entries(TAB_NODES)) {
      const active = id === next;
      node.dataset.active = String(active);
      if (active) node.removeAttribute('inert');
      else node.setAttribute('inert', '');
    }
    for (const [id, button] of railButtons) {
      const on = id === next || (next === 'langs' && id === 'feed');
      button.setAttribute('aria-selected', String(on));
    }
    page = next;

    if (next === 'langs') {
      languages.resetSearch();
      setTimeout(() => languages.focusSearch(), 120);
    }
    TAB_NODES[next].scrollTop = 0;
  }

  rail.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const order = TABS.map((item) => item.id);
    const at = order.indexOf(page === 'langs' ? 'feed' : page);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = order[(at + step + order.length) % order.length];
    event.preventDefault();
    goTo(next);
    railButtons.get(next).focus();
  });

  for (const [id, node] of Object.entries(TAB_NODES)) {
    const active = id === page;
    node.dataset.active = String(active);
    if (!active) node.setAttribute('inert', '');
  }
  railButtons.get(page).setAttribute('aria-selected', 'true');

  const hud = h('div', { class: 'hud', dataset: { corner, open: 'false' } }, panel, pebble, live);
  root.append(hud);
  document.documentElement.append(host);

  const EASE = 'cubic-bezier(0.32,0.72,0,1)';
  const MOVE_MS = { none: 0, grow: 260, snap: 420 };

  function place(mode = 'none') {
    const box = pebble.getBoundingClientRect();
    const width = box.width || 96;
    const height = box.height || 36;
    const left = corner.endsWith('right') ? window.innerWidth - width - MARGIN : MARGIN;
    const top = corner.startsWith('bottom') ? window.innerHeight - height - MARGIN : MARGIN;
    const ms = MOVE_MS[mode] ?? 0;
    host.style.transition = ms ? `left ${ms}ms ${EASE}, top ${ms}ms ${EASE}` : 'none';
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    hud.dataset.corner = corner;
  }

  function nearestCorner(x, y) {
    const box = pebble.getBoundingClientRect();
    const cx = x + box.width / 2;
    const cy = y + box.height / 2;
    const vertical = cy < window.innerHeight / 2 ? 'top' : 'bottom';
    const horizontal = cx < window.innerWidth / 2 ? 'left' : 'right';
    const found = `${vertical}-${horizontal}`;
    return CORNERS.includes(found) ? found : 'bottom-right';
  }

  let drag = null;

  pebble.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const box = host.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      moved: false,
    };
    pebble.setPointerCapture(event.pointerId);
  });

  pebble.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const x = event.clientX - drag.dx;
    const y = event.clientY - drag.dy;
    if (!drag.moved && Math.hypot(x - host.offsetLeft, y - host.offsetTop) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      hud.dataset.dragging = 'true';
      setOpen(false);
    }
    host.style.transition = 'none';
    host.style.left = `${Math.max(0, Math.min(window.innerWidth - 40, x))}px`;
    host.style.top = `${Math.max(0, Math.min(window.innerHeight - 36, y))}px`;
  });

  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const wasDrag = drag.moved;
    drag = null;
    delete hud.dataset.dragging;
    if (!wasDrag) {
      setOpen(!open);
      return;
    }
    corner = nearestCorner(host.offsetLeft, host.offsetTop);
    place('snap');
    patch({ hud: { ...state.hud, corner } });
  }

  pebble.addEventListener('pointerup', endDrag);
  pebble.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => place());

  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (!lastWidth) {
      lastWidth = width;
      return;
    }
    if (width === lastWidth || drag) return;
    lastWidth = width;
    place('grow');
  }).observe(pebble);

  function setOpen(next) {
    if (open === next) return;
    open = next;
    hud.dataset.open = String(open);
    pebble.setAttribute('aria-expanded', String(open));
    if (open) {
      refreshSpark();
      stats.load();
      if (state.agent.enabled) refreshAgent({ warm: true });
      refreshJev();
    } else {
      if (page === 'langs') setTimeout(() => goTo('feed'), 260);
    }
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!open) return;
      if (event.composedPath?.().includes(host) || event.target === host) return;
      setOpen(false);
    },
    true,
  );

  window.addEventListener('keydown', (event) => {
    if (!event.isTrusted) return;
    if (event.key !== 'Escape' || !open) return;
    if (page === 'langs') {
      goTo('feed');
      return;
    }
    setOpen(false);
    pebble.focus();
  });

  function relabel() {
    applyI18n(root);
    languages.repaint();
    stats.repaint();
    agentPanel.repaint();
    jevPanel.repaint();
    paintSettings();
    paintTime();
  }

  function patch(partial) {
    const wasLang = state.ui.lang;
    state = { ...state, ...partial };
    if (state.ui.lang !== wasLang) {
      setLang(state.ui.lang);
      relabel();
    }
    paintSettings();
    onPatch(partial);
  }

  function setBlockEnabled(block, enabled) {
    block.dataset.enabled = String(enabled);
    const body = block.querySelector('.block__body');
    if (!body) return;
    if (enabled) body.removeAttribute('inert');
    else body.setAttribute('inert', '');
  }

  function paintFooter() {
    const curates = state.age.enabled || state.langs.enabled || state.quick.enabled;
    if (!curating) {
      const named = `feed.silent.${where}`;
      hiddenNote.textContent = curates ? t(has(named) ? named : 'feed.silent') : '';
    } else {
      hiddenNote.textContent = hiddenTweets ? t('feed.hidden', { n: hiddenTweets }) : '';
    }
    foot.hidden = !hiddenNote.textContent;
  }

  function paintSettings() {
    soundCheck.set(state.pomodoro.sound);
    if (signInput.getRootNode().activeElement !== signInput) signInput.value = state.shot?.sign || '';
    shotThemes.set(state.shot?.theme || 'auto');
    tintStrip.hidden = state.shot?.theme !== 'random';

    themes.set(state.ui.theme);
    langs.set(state.ui.lang);

    ageCheck.set(state.age.enabled);
    setBlockEnabled(ageBlock, state.age.enabled);
    range.set({ min: state.age.min, max: state.age.max });
    ageValue.textContent = state.age.enabled ? ageRangeLabel(state.age.min, state.age.max) : '';

    langCheck.set(state.langs.enabled);
    setBlockEnabled(langBlock, state.langs.enabled);
    languages.set({ allow: state.langs.allow, allowUnknown: state.langs.allowUnknown });
    langValue.textContent = state.langs.enabled ? languages.summary() : '';
    if (!state.langs.enabled && page === 'langs') goTo('feed');

    clutterCheck.set(state.clutter.enabled);
    clutterValue.textContent = state.clutter.enabled ? t('feed.clutter.value') : '';

    quickCheck.set(state.quick.enabled);
    const agentSay = describeAgent(agentState, state.agent);
    const trouble = state.quick.enabled && agentSay.warn ? agentSay.text : '';
    const fixable = Boolean(trouble) && FIXABLE.has(agentState?.code);
    quickValue.textContent = trouble
      ? (fixable ? `${trouble} · ${t('feed.quick.settings')}` : trouble)
      : (state.quick.enabled ? t('feed.quick.value') : '');
    quickValue.title = quickValue.textContent;
    quickValue.hidden = !quickValue.textContent;
    quickValue.dataset.link = String(fixable);
    quickValue.disabled = !fixable;
    quickValue.setAttribute('aria-label', quickValue.textContent || t('feed.quick.title'));
    quickBlock.dataset.warn = String(Boolean(trouble));

    agentPanel.set({ state: agentState, settings: state.agent });
    jevPanel.set({ state: jevState, enabled: state.jev.enabled && state.quick.enabled, images: state.jev.images === true });

    translateCheck.set(state.translate.enabled);
    translateValue.textContent = !state.translate.enabled
      ? ''
      : t(translateFailing ? 'feed.translate.failing' : `feed.translate.value.${state.translate.target}`);
    translateBlock.dataset.warn = String(state.translate.enabled && translateFailing);
    paintFooter();
  }

  function paintTime({ turned = false, from = null } = {}) {
    todayText.textContent = dayDuration(todaySeconds);
    todayNote.textContent = noteText();
    todayNote.hidden = !todayNote.textContent;
    const now = describeTimer(pomodoro || idleState(), state.pomodoro);
    timer.set(now, { pomodoro: state.pomodoro, sessions: pomodoroToday, turned });
    pebbleUi.set(now, { todaySeconds, counting });
    if (!turned) return;
    pebbleUi.announce();
    const rested = from === 'short' || from === 'long';
    live.textContent = !now.idle
      ? `${now.title}, ${clockDuration(now.leftSeconds)}`
      : t(rested ? 'timer.turned.rested' : 'timer.turned.stopped');
  }

  function adopt(next, { live: fresh } = {}) {
    const before = pomodoro?.phase;
    pomodoro = next || idleState();
    const turned = Boolean(fresh && before && before !== pomodoro.phase);
    paintTime({ turned, from: before });
    if (turned) refreshSessions();
  }

  async function refreshSessions() {
    const response = await send(MSG.activityToday);
    if (!response?.ok) return;
    if (response.data.pomodoros === pomodoroToday) return;
    pomodoroToday = response.data.pomodoros;
    paintTime();
  }

  async function refreshSpark() {
    const response = await send(MSG.activityRange, { days: 7 });
    const rows = response?.data;
    if (!Array.isArray(rows)) return;
    if (!rows.some((row) => row.s >= 300)) {
      spark.replaceChildren();
      return;
    }
    const max = Math.max(60, ...rows.map((row) => row.s));
    spark.replaceChildren(
      ...rows.map((row, index) =>
        h('div', {
          class: 'spark__bar',
          style: { height: `${Math.max(2, Math.round((row.s / max) * 26))}px` },
          dataset: { today: String(index === rows.length - 1) },
          title: `${humanDuration(row.s)}`,
        }),
      ),
    );
  }

  heartbeat.onTick(({ seconds, counting: ticking, reason }) => {
    todaySeconds = seconds;
    counting = ticking;
    pauseReason = reason || null;
    paintTime();
  });

  translator.onStatus(({ failing }) => {
    if (failing === translateFailing) return;
    translateFailing = failing;
    paintSettings();
  });

  timeline.onStats(({ hidden, langs, curating: feed, surface }) => {
    hiddenTweets = hidden;
    curating = feed;
    where = surface || '';
    paintFooter();
    languages.set({ allow: state.langs.allow, allowUnknown: state.langs.allowUnknown, seen: langs });
  });

  subscribe(KEY.pomodoro, (next) => adopt(next, { live: true }));

  send(MSG.pomodoroState).then((response) => {
    adopt(response?.ok ? response.data : null);
  });

  refreshSessions();

  setInterval(() => {
    if (pomodoro?.endsAt) paintTime();
  }, 1000);

  setInterval(refreshSpark, 5 * 60_000);

  paintSettings();
  paintTime();
  if (state.agent.enabled) {
    refreshAgent().then(() => {
      if (!agentState || agentState.code === 'unknown') refreshAgent({ wake: true });
    });
  }
  refreshJev();
  place();
  requestAnimationFrame(() => place());

  if (!state.hud.greeted) {
    setTimeout(() => {
      setOpen(true);
      patch({ hud: { ...state.hud, greeted: true } });
    }, 900);
  }

  return {
    toggle: () => setOpen(!open),
    update(nextSettings) {
      const wasOn = state.agent.enabled;
      const wasLang = state.ui.lang;
      state = nextSettings;
      if (wasLang !== state.ui.lang) relabel();
      if (!wasOn && state.agent.enabled) refreshAgent({ wake: true, warm: true });
      if (wasOn && !state.agent.enabled) agent?.sleep();
      if (state.hud.corner !== corner) {
        corner = state.hud.corner;
        place('snap');
      }
      paintSettings();
      paintTime();
    },
  };
}
