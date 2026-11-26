import { EXPLAIN_MIN_CHARS } from '../core/constants.js';
import { RETRYABLE, explainAgent, modelTitle, sawLabel } from '../core/agent.js';
import { t } from '../core/i18n.js';
import { parseAnswer, speakAnswer } from '../core/answer.js';
import * as context from './context.js';
import * as dom from './dom.js';
import * as gutter from './gutter.js';
import * as agent from './agent.js';
import * as popover from './popover.js';

const WINDOW = 'data-tempo-explain';
const PATIENCE_MS = 4000;

let enabled = false;
let model = null;
let lang = 'ru';
let web = true;

let open = null;

const SPARKLE =
  'M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10z';

export const ACTION = {
  id: 'explain',
  title: 'explain.action',
  color: '#5B5BFF',
  path: SPARKLE,
  own: true,
  open: press,
};

export function isEnabled() {
  return enabled;
}

function buildWindow() {
  const box = document.createElement('div');
  box.className = 'tempo-explain';
  box.setAttribute('data-tempo', '');
  box.setAttribute(WINDOW, '');
  box.setAttribute(popover.WINDOW, '');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', t('explain.window'));

  const kicker = document.createElement('div');
  kicker.className = 'tempo-explain__kicker';

  const label = document.createElement('span');
  label.className = 'tempo-explain__label';
  label.textContent = t('explain.label');

  const status = document.createElement('span');
  status.className = 'tempo-explain__status';

  const body = document.createElement('div');
  body.className = 'tempo-explain__body';

  const live = document.createElement('span');
  live.className = 'tempo-explain__live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  const sources = document.createElement('div');
  sources.className = 'tempo-explain__sources';
  sources.hidden = true;

  kicker.append(label, status);
  box.append(kicker, body, sources, live);

  const swallow = (event) => event.stopPropagation();
  box.addEventListener('pointerdown', swallow);
  box.addEventListener('click', swallow);

  return { box, status, body, sources, live };
}

function paintSources(node, urls) {
  const links = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    let host;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      host = parsed.hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    const link = document.createElement('a');
    link.className = 'tempo-explain__source';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = host;
    link.title = url;
    links.push(link);
  }
  node.hidden = !links.length;
  if (!links.length) return;
  const head = document.createElement('span');
  head.className = 'tempo-explain__sources-head';
  head.textContent = t('explain.sources');
  node.replaceChildren(head, ...links);
}

function paint(body, raw) {
  const blocks = parseAnswer(raw);
  const kids = body.children;
  blocks.forEach((block, index) => {
    const wanted = block.type === 'list' ? 'UL' : block.type === 'label' ? 'DIV' : 'P';
    let node = kids[index];
    if (!node || node.tagName !== wanted) {
      const fresh = document.createElement(wanted.toLowerCase());
      if (node) node.replaceWith(fresh);
      else body.append(fresh);
      node = fresh;
    }
    if (block.type === 'list') paintItems(node, block.items);
    else if (node.textContent !== block.text) node.textContent = block.text;
    if (block.type === 'label') {
      node.className = 'tempo-explain__section';
      node.dataset.key = block.key;
    }
  });
  while (kids.length > blocks.length) kids[kids.length - 1].remove();
  if (!kids.length) body.append(document.createElement('p'));
}

function paintItems(list, items) {
  const kids = list.children;
  items.forEach((text, index) => {
    const item = kids[index] || list.appendChild(document.createElement('li'));
    if (item.textContent !== text) item.textContent = text;
  });
  while (kids.length > items.length) kids[kids.length - 1].remove();
}

function closeWindow({ silent = false } = {}) {
  if (!open) return;
  const { box, drop, article, request, timers } = open;
  open = null;
  for (const timer of timers) clearTimeout(timer);
  request?.cancel();
  drop.setAttribute('aria-expanded', 'false');
  drop.dataset.state = 'idle';
  if (silent) box.remove();
  else popover.fade(box);
  popover.unlift(article);
}

async function run(article, id, button) {
  const { box, status, body, sources, live } = buildWindow();
  popover.lift(article);
  const host = popover.hostOf(article, button);
  gutter.anchor(host);
  popover.place(box, host, button);
  host.append(box);
  requestAnimationFrame(() => {
    box.dataset.shown = 'true';
  });

  button.setAttribute('aria-expanded', 'true');
  button.dataset.state = 'busy';

  const timers = [];
  open = { box, drop: button, article, id, request: null, timers };

  const { post, truncated } = await context.readPost(article);
  if (open?.box !== box) return;
  box.dataset.state = 'waiting';
  status.textContent = t(post.images.length ? 'explain.looking' : 'explain.thinking');
  delete box.dataset.searching;
  paint(body, '');

  timers.push(
    setTimeout(() => {
      if (box.dataset.state === 'waiting') status.textContent = t('explain.patience');
    }, PATIENCE_MS),
  );

  let raw = '';
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      paint(body, raw);
    });
  };

  const request = agent.ask({
    id,
    post,
    model,
    lang,
    web,
    onQueued: (place) => {
      if (box.dataset.state !== 'waiting') return;
      status.textContent = place > 1 ? t('explain.queued.place', { n: place }) : t('explain.queued');
    },
    onSearch: (query) => {
      if (box.dataset.state === 'done') return;
      status.textContent = t('explain.searching');
      status.title = query || '';
      box.dataset.searching = 'true';
    },
    onReset: () => {
      raw = '';
      schedule();
    },
    onDelta: (delta) => {
      if (box.dataset.state === 'done') return;
      box.dataset.state = 'streaming';
      status.textContent = t('explain.writing');
      raw += delta;
      schedule();
    },
  });
  open.request = request;

  try {
    const answer = await request.promise;
    if (open?.box !== box) return;
    cancelAnimationFrame(frame);
    box.dataset.state = 'done';
    paint(body, answer.text.trim());
    status.textContent = [modelTitle(answer.model), sawLabel(answer.saw)]
      .filter(Boolean)
      .join(' · ');
    status.title = '';
    delete box.dataset.searching;
    paintSources(sources, answer.sources);
    if (truncated) {
      status.textContent = `${status.textContent} · ${t('explain.truncated')}`;
      status.title = t('explain.truncated.hint');
    }
    live.textContent = speakAnswer(answer.text);
  } catch (error) {
    if (open?.box !== box || error?.code === 'cancelled') return;
    cancelAnimationFrame(frame);
    box.dataset.state = 'error';
    status.textContent = '';
    paint(body, explainAgent(error?.code));
    live.textContent = body.textContent;
    if (RETRYABLE.has(error?.code)) {
      const again = document.createElement('button');
      again.className = 'tempo-explain__again';
      again.type = 'button';
      again.textContent = t('explain.again');
      again.addEventListener('click', () => {
        closeWindow({ silent: true });
        run(article, id, button);
      });
      box.append(again);
    }
  }
}

export function press(article, button) {
  if (open?.drop === button) {
    closeWindow();
    return;
  }
  closeWindow();
  run(article, dom.tweetIdOf(article), button);
}

export function worth(article) {
  return context.worthExplaining(article, EXPLAIN_MIN_CHARS);
}

export function release() {
  closeWindow({ silent: true });
  for (const box of document.querySelectorAll(`[${WINDOW}]`)) box.remove();
  popover.unliftAll();
}

export function recheck(article) {
  if (open?.article !== article) return;
  if (open.id !== dom.tweetIdOf(article) || !gutter.drawn(article) || !open.box.isConnected) {
    closeWindow({ silent: true });
  }
}

export function configure(settings) {
  const next = Boolean(settings.quick?.enabled && settings.agent?.enabled);
  model = settings.agent?.model || null;
  lang = settings.ui?.lang || 'ru';
  web = settings.agent?.web !== false;
  if (next === enabled) return false;
  enabled = next;
  if (!enabled) release();
  return true;
}

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!open) return;
    const path = event.composedPath?.() || [];
    if (path.includes(open.box) || path.includes(open.drop)) return;
    closeWindow();
  },
  true,
);

document.addEventListener('keydown', (event) => {
  if (!event.isTrusted || event.key !== 'Escape' || !open) return;
  const drop = open.drop;
  closeWindow();
  drop.focus();
});
