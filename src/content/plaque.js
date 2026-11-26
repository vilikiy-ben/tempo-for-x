import pageCss from './page.css';
import { t } from '../core/i18n.js';
import { pixelIcon } from '../ui/pixel.js';

const STYLE_ID = 'tempo-page-style';

const labels = new WeakMap();

export function ensurePageStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = pageCss;
  (document.head || document.documentElement).append(style);
}

function part(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function buildPlaque(onToggle) {
  const button = document.createElement('button');
  button.className = 'tempo-plaque';
  button.setAttribute('data-tempo-plaque', '');
  button.setAttribute('data-tempo', '');
  button.setAttribute('type', 'button');
  button.setAttribute('aria-expanded', 'false');

  const glyph = part('span', 'tempo-plaque__glyph');
  glyph.append(pixelIcon('alert'));

  const thumb = part('img', 'tempo-plaque__thumb');
  thumb.alt = '';
  thumb.loading = 'lazy';
  thumb.decoding = 'async';
  thumb.addEventListener('error', () => {
    thumb.hidden = true;
  });

  const chevron = part('span', 'tempo-plaque__chevron');
  chevron.append(pixelIcon('chevronRight'));

  button.append(
    thumb,
    part('span', 'tempo-plaque__who'),
    part('span', 'tempo-plaque__dot'),
    part('span', 'tempo-plaque__line'),
    glyph,
    part('span', 'tempo-plaque__reason'),
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

function fill(plaque, { reason, name, handle, line, thumb }) {
  setText(plaque.querySelector('.tempo-plaque__reason'), reason);

  const who = name || handle || '';
  setText(plaque.querySelector('.tempo-plaque__who'), who);
  setText(plaque.querySelector('.tempo-plaque__line'), line || '');
  setText(plaque.querySelector('.tempo-plaque__dot'), who && line ? '·' : '');

  const image = plaque.querySelector('.tempo-plaque__thumb');
  if (thumb) {
    if (image.getAttribute('src') !== thumb) image.setAttribute('src', thumb);
    image.hidden = false;
  } else {
    image.removeAttribute('src');
    image.hidden = true;
  }

  labels.set(plaque, [t('plaque.hidden', { reason }), who, line].filter(Boolean).join('. '));
  if (plaque.getAttribute('aria-expanded') !== 'true') speak(plaque, false);
}

function speak(plaque, expanded) {
  plaque.setAttribute(
    'aria-label',
    expanded
      ? t('plaque.collapse')
      : `${labels.get(plaque) || t('plaque.unknown')}. ${t('plaque.expand')}`,
  );
}

export function ensure(cell, data, onToggle) {
  let plaque = cell.querySelector(':scope > [data-tempo-plaque]');
  if (!plaque) {
    plaque = buildPlaque(onToggle);
    cell.prepend(plaque);
  }
  fill(plaque, data);
  return plaque;
}

export function speakExpanded(cell, expanded) {
  const plaque = cell.querySelector(':scope > [data-tempo-plaque]');
  if (!plaque) return;
  if (plaque.getAttribute('aria-expanded') !== String(expanded)) {
    plaque.setAttribute('aria-expanded', String(expanded));
  }
  speak(plaque, expanded);
}

export function remove(cell) {
  cell.querySelector(':scope > [data-tempo-plaque]')?.remove();
}
