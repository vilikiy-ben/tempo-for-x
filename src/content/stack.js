import { t } from '../core/i18n.js';
import { pixelIcon } from '../ui/pixel.js';

const labels = new WeakMap();
const signatures = new WeakMap();

function part(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function build(onToggle) {
  const button = document.createElement('button');
  button.className = 'tempo-stack';
  button.setAttribute('data-tempo-stack', '');
  button.setAttribute('data-tempo', '');
  button.setAttribute('type', 'button');
  button.setAttribute('aria-expanded', 'false');

  const glyph = part('span', 'tempo-stack__glyph');
  glyph.append(pixelIcon('stack'));

  const chevron = part('span', 'tempo-stack__chevron');
  chevron.append(pixelIcon('chevronRight'));

  button.append(
    glyph,
    part('span', 'tempo-stack__count'),
    part('span', 'tempo-stack__dot'),
    part('span', 'tempo-stack__who'),
    part('span', 'tempo-stack__reason'),
    chevron,
  );

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  });
  return button;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

export const NAMES_SHOWN = 3;

export function whoLine(names, count) {
  const shown = names.slice(0, NAMES_SHOWN);
  const rest = count - shown.length;
  const tail = rest > 0 ? t('stack.more', { n: rest }) : '';
  return [shown.join(', '), tail].filter(Boolean).join(' ');
}

function fill(node, { count, names, reason }) {
  const who = whoLine(names, count);
  setText(node.querySelector('.tempo-stack__count'), t('stack.count', { n: count }));
  setText(node.querySelector('.tempo-stack__who'), who);
  setText(node.querySelector('.tempo-stack__dot'), who ? '·' : '');
  const said = reason ?? t('stack.mixed');
  setText(node.querySelector('.tempo-stack__reason'), said);

  labels.set(node, [t('stack.count', { n: count }), said, who].filter(Boolean).join('. '));
  if (node.getAttribute('aria-expanded') !== 'true') speak(node, false);
}

function speak(node, open) {
  const said = `${labels.get(node) || t('stack.count', { n: 0 })}. ${open ? t('stack.collapse') : t('stack.expand')}`;
  if (node.getAttribute('aria-label') !== said) node.setAttribute('aria-label', said);
}

export function mount(head, signature, collect, onToggle) {
  let node = head.querySelector(':scope > [data-tempo-stack]');
  if (!node) {
    node = build(onToggle);
    head.prepend(node);
  }
  if (signatures.get(node) !== signature) {
    signatures.set(node, signature);
    fill(node, collect());
  }
  return node;
}

export function speakOpen(head, open) {
  const node = head.querySelector(':scope > [data-tempo-stack]');
  if (!node) return;
  if (node.getAttribute('aria-expanded') !== String(open)) {
    node.setAttribute('aria-expanded', String(open));
  }
  speak(node, open);
}

export function release(head) {
  head.querySelector(':scope > [data-tempo-stack]')?.remove();
}

export function has(head) {
  return Boolean(head.querySelector(':scope > [data-tempo-stack]'));
}
