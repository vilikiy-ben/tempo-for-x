import { EMOJI_FONTS } from '../core/shot.js';
import { avatarSized, sized } from '../core/twimg.js';
import * as dom from './dom.js';
import { SEL } from './dom.js';
import { postOf } from './posts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const BLOCK = new Set(['DIV', 'P']);

function breaks(node) {
  return BLOCK.has(node.tagName) && !getComputedStyle(node).display.startsWith('inline');
}

const BADGE = { blue: '#1D9BF0', grey: '#829AAB' };

const SHOW_ORIGINAL = /^(показать оригинал|show original)/i;

const NOT_A_LANGUAGE = new Set(['und', 'zxx', 'qme', 'qam', 'qct', 'qht', 'qst']);

function own(root, quote, selector) {
  return [...root.querySelectorAll(selector)].filter((node) => !quote?.contains(node));
}

export function runsOf(root) {
  const runs = [];
  const add = (text, kind = 'text') => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.text += text;
    else runs.push({ text, kind });
  };
  const ends = () => (runs[runs.length - 1]?.text || '').endsWith('\n');

  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        add(child.data);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (child.hasAttribute('data-tempo-mark')) continue;
      if (child.tagName === 'IMG') {
        add(child.getAttribute('alt') || '');
        continue;
      }
      if (child.tagName === 'BR') {
        add('\n');
        continue;
      }
      if (child.tagName === 'A') {
        add(dom.visibleText(child), 'link');
        continue;
      }
      if (breaks(child) && runs.length && !ends()) add('\n');
      walk(child);
    }
  };
  walk(root);

  if (runs.length) runs[0].text = runs[0].text.replace(/^\s+/, '');
  if (runs.length) runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
  return runs.filter((run) => run.text);
}

export function translationOf(textEl) {
  if (textEl?.dataset.tempoTr !== 'translated') return null;
  const node = textEl.nextElementSibling;
  return node?.hasAttribute('data-tempo-translation') ? node : null;
}

function langCode(value) {
  const code = String(value || '').toLowerCase().split('-')[0];
  return /^[a-z]{2,3}$/.test(code) && !NOT_A_LANGUAGE.has(code) ? code : null;
}

function translatedByX(textEl, record, buttons) {
  const shown = langCode(textEl?.getAttribute('lang'));
  const source = langCode(record?.lang);
  if (shown && source && shown !== source) return { from: source, to: shown };
  const marked = buttons.some((button) => SHOW_ORIGINAL.test(button.getAttribute('aria-label') || button.textContent || ''));
  return marked && shown ? { from: source && source !== shown ? source : null, to: shown } : null;
}

function textOf(textEl, byX = null) {
  if (!textEl) return { runs: [], translated: null };
  const translation = translationOf(textEl);
  const body = translation?.querySelector('[data-tempo-body]');
  if (body) {
    const runs = runsOf(body);
    if (runs.length) {
      return {
        runs,
        translated: { from: langCode(textEl.getAttribute('lang')), to: langCode(translation.getAttribute('lang')) || '?' },
      };
    }
  }
  return { runs: runsOf(textEl), translated: byX };
}

function greyish(color) {
  const [r, g, b] = (String(color).match(/\d+/g) || []).map(Number);
  if (![r, g, b].every(Number.isFinite)) return false;
  return Math.max(r, g, b) - Math.min(r, g, b) < 24 && Math.max(r, g, b) < 230;
}

export function badgeOf(nameBlock) {
  const svg = nameBlock?.querySelector('svg[data-testid="icon-verified"]');
  if (!svg) return null;
  const copy = svg.cloneNode(true);
  copy.removeAttribute('class');
  copy.setAttribute('xmlns', SVG_NS);
  copy.setAttribute('width', '88');
  copy.setAttribute('height', '88');
  const color = greyish(getComputedStyle(svg).color) ? BADGE.grey : BADGE.blue;
  copy.setAttribute('fill', color);
  copy.setAttribute('color', color);
  const markup = new XMLSerializer().serializeToString(copy);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function mediaOf(root, quote) {
  const nodes = own(root, quote, '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], video')
    .filter((node) => !node.parentElement?.closest('[data-testid="videoPlayer"]'));
  const found = [];
  const seen = new Set();
  for (const node of nodes) {
    let src = '';
    let kind = 'photo';
    const video = node.tagName === 'VIDEO' ? node : node.querySelector('video');
    if (video) {
      const still = node.querySelector('img');
      src = video.poster || still?.currentSrc || still?.src || '';
      const played = video.currentSrc || video.src || '';
      kind = played && !played.startsWith('blob:') ? 'gif' : 'video';
    } else {
      const img = node.querySelector('img');
      src = img?.currentSrc || img?.src || '';
    }
    if (!src || src.startsWith('blob:') || seen.has(src)) continue;
    seen.add(src);
    found.push({ src, kind });
    if (found.length === 4) break;
  }
  const size = found.length === 1 ? 'large' : 'medium';
  return found.map((item) => ({ ...item, src: sized(item.src, size) }));
}

export function viewsFromLabel(label) {
  const lead = String(label || '').match(/^\s*([\d\s  .,]+)/)?.[1] || '';
  const digits = lead.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

function quoteRunsOf(quoteRoot, record) {
  const runs = textOf(quoteRoot.querySelector(SEL.text)).runs;
  const whole = postOf(record?.quoteId)?.text || '';
  const shown = runs.reduce((sum, run) => sum + run.text.length, 0);
  if (runs.length && whole.length > shown * 1.3 + 20) {
    const last = runs[runs.length - 1];
    if (!/[….!?]$/.test(last.text)) runs.push({ text: '…', kind: 'text' });
  }
  return runs;
}

function familyOf(node) {
  const family = node ? getComputedStyle(node).fontFamily : '';
  return `${family || '-apple-system, "Segoe UI", Roboto, Helvetica, Arial'}, ${EMOJI_FONTS}`;
}

const bare = (handle) => (handle ? handle.replace(/^@/, '') : null);

export function read(article) {
  const quoteRoot = dom.quoteRootOf(article);
  const sources = [];
  const local = {};
  const remote = (key, src) => {
    if (!src) return null;
    sources.push({ key, src });
    return key;
  };

  const nameBlock = own(article, quoteRoot, SEL.userName)[0] || null;
  const textEl = own(article, quoteRoot, SEL.text)[0] || null;
  const record = postOf(dom.tweetIdOf(article));

  const avatarImg = own(article, quoteRoot, '[data-testid="Tweet-User-Avatar"] img')[0];
  const badge = badgeOf(nameBlock);
  if (badge) local.badge = badge;

  const media = mediaOf(article, quoteRoot).map((item, index) => ({
    key: remote(`media${index}`, item.src),
    kind: item.kind,
  }));

  let card = null;
  const cardEl = media.length ? null : own(article, quoteRoot, SEL.card)[0];
  if (cardEl) {
    const img = cardEl.querySelector('img');
    card = {
      key: remote('card', img?.currentSrc || img?.src || ''),
      title: record?.card?.title || '',
      domain: record?.card?.domain || '',
    };
  }

  let quote = null;
  if (quoteRoot) {
    const quoteName = quoteRoot.querySelector(SEL.userName);
    const quoteBadge = badgeOf(quoteName);
    if (quoteBadge) local.quoteBadge = quoteBadge;
    const quoteAvatar = quoteRoot.querySelector('[data-testid="Tweet-User-Avatar"] img');
    const stamp = quoteRoot.querySelector(SEL.time)?.getAttribute('datetime');
    quote = {
      name: dom.nameOf(quoteRoot),
      handle: bare(dom.handleOf(quoteRoot)),
      avatar: remote('quoteAvatar', avatarSized(quoteAvatar?.currentSrc || quoteAvatar?.src || '')),
      badge: quoteBadge ? 'quoteBadge' : null,
      runs: quoteRunsOf(quoteRoot, record),
      at: stamp ? Date.parse(stamp) : null,
      media: mediaOf(quoteRoot, null).map((item, index) => ({ key: remote(`quoteMedia${index}`, item.src), kind: item.kind })),
    };
  }

  const byX = translatedByX(textEl, record, own(article, quoteRoot, 'button'));
  const { runs, translated } = textOf(textEl, byX);
  const label = own(article, quoteRoot, 'a[href$="/analytics"]')[0]?.getAttribute('aria-label');

  const post = {
    name: dom.nameOf(article),
    handle: bare(dom.handleOf(article)),
    avatar: remote('avatar', avatarSized(avatarImg?.currentSrc || avatarImg?.src || '')),
    badge: badge ? 'badge' : null,
    runs,
    translated,
    media,
    card,
    quote,
    at: record?.at ?? dom.createdAtOf(article),
    views: record?.counts?.views ?? viewsFromLabel(label),
  };

  return { post, sources, local, family: familyOf(textEl || nameBlock) };
}
