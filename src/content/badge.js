import { compactCount } from '../core/text.js';
import { t } from '../core/i18n.js';
import * as dom from './dom.js';
import { pageColor } from './theme.js';
import * as gutter from './gutter.js';
import { followersOf } from './followers.js';

const BADGE = 'data-tempo-badge';

let enabled = false;
let placed = 0;

export function attach(article, host = gutter.mount(article)) {
  if (!enabled) return;
  if (gutter.isQuote(article)) return;

  const handle = dom.handleOf(article);
  const text = compactCount(followersOf(handle));
  const standing = host.querySelector(`:scope > [${BADGE}]`);

  if (!text) {
    if (standing) {
      standing.remove();
      placed -= 1;
    }
    return;
  }

  const box = gutter.avatarBox(article);
  const origin = gutter.boxOf(host);
  if (!box || !origin) return;

  const size = Math.min(box.width, box.height);
  const left = Math.round(box.left - origin.left + box.width / 2);
  const top = Math.round(box.top - origin.top + size);

  const badge = standing || build();
  if (badge.dataset.count !== text) {
    badge.dataset.count = text;
    badge.textContent = text;
    badge.title = t('badge.followers', { count: text, handle });
  }
  badge.style.left = `${left}px`;
  badge.style.top = `${top}px`;
  badge.style.setProperty('--tempo-page', pageColor());

  if (!standing) {
    gutter.anchor(host);
    gutter.attend(host);
    host.append(badge);
    placed += 1;
  }
}

function build() {
  const badge = document.createElement('span');
  badge.className = 'tempo-badge';
  badge.setAttribute('data-tempo', '');
  badge.setAttribute(BADGE, '');
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

export function release() {
  if (!placed) return;
  placed = 0;
  for (const badge of document.querySelectorAll(`[${BADGE}]`)) badge.remove();
  gutter.releaseAnchors();
}

export function configure(settings) {
  const next = Boolean(settings.quick?.enabled);
  if (next === enabled) return false;
  enabled = next;
  if (!enabled) release();
  return true;
}
