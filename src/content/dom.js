import { firstLine } from '../core/text.js';

export const SEL = {
  tweet: 'article[data-testid="tweet"]',
  cell: '[data-testid="cellInnerDiv"]',
  text: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  time: 'time[datetime]',
  sidebar: '[data-testid="sidebarColumn"]',
  trend: '[data-testid="trend"]',
  userCell: '[data-testid="UserCell"]',
  news: '[data-testid="news_sidebar"]',
  media: '[data-testid="tweetPhoto"] img, [data-testid="card.wrapper"] img, video[poster]',
  photo: '[data-testid="tweetPhoto"] img',
  poster: 'video[poster]',
  video: 'video',
  card: '[data-testid="card.wrapper"]',
  social: '[data-testid="socialContext"]',
  more: '[data-testid="tweet-text-show-more-link"]',
};

export function cellOf(article) {
  return article.closest(SEL.cell) || article.parentElement;
}

export function tweetIdOf(root) {
  const links = root.querySelectorAll('a[href*="/status/"]');
  let link = links[0];
  for (const candidate of links) {
    const quote = candidate.closest('div[role="link"]');
    if (quote && quote !== root && root.contains(quote)) continue;
    link = candidate;
    break;
  }
  const match = link?.getAttribute('href')?.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

export function handleOf(root) {
  const block = root.querySelector(SEL.userName);
  if (!block) return null;
  const path = block.querySelector('a[href^="/"]')?.getAttribute('href');
  const handle = path?.split('/').filter(Boolean)[0];
  if (handle) return `@${handle}`;
  const written = (block.textContent || '').match(/@[A-Za-z0-9_]{1,15}/);
  return written ? written[0] : null;
}

export function textElOf(article) {
  return article.querySelector(SEL.text);
}

export function textElsOf(article) {
  return article.querySelectorAll(SEL.text);
}

export function langOf(article) {
  return textElOf(article)?.getAttribute('lang') || null;
}

export function socialContextOf(article) {
  const own = article.querySelector(SEL.social)?.textContent?.trim();
  if (own) return own;
  const near = cellOf(article)?.querySelector(SEL.social)?.textContent?.trim();
  return near || null;
}

export function quoteRootOf(article) {
  const names = article.querySelectorAll(SEL.userName);
  if (names.length < 2) return null;
  const [own, quoted] = names;
  const marked = quoted.closest('div[role="link"], div[tabindex="0"]');
  if (marked && marked !== article && !marked.contains(own)) return marked;
  let node = quoted;
  while (node.parentElement && node.parentElement !== article && !node.parentElement.contains(own)) {
    node = node.parentElement;
  }
  return node === quoted ? null : node;
}

export function createdAtOf(article) {
  const stamp = article.querySelector(SEL.time)?.getAttribute('datetime');
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}

export function nameOf(root) {
  const block = root.querySelector(SEL.userName);
  if (!block) return null;
  const linked = block.querySelector('a span')?.textContent?.trim();
  if (linked) return linked;
  const written = (block.textContent || '').trim().split('@')[0].trim();
  return written || null;
}

function thumbOf(article) {
  const node = article.querySelector(SEL.media);
  if (!node) return null;
  const src = node.tagName === 'VIDEO' ? node.getAttribute('poster') : node.getAttribute('src');
  return src && !src.startsWith('blob:') ? src : null;
}

export function previewOf(article) {
  return {
    name: nameOf(article),
    handle: handleOf(article),
    line: firstLine(textElOf(article)?.textContent || ''),
    thumb: thumbOf(article),
  };
}

export function visibleText(link) {
  let text = '';
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.data;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (child.tagName === 'IMG') {
        text += child.getAttribute('alt') || '';
        continue;
      }
      const style = getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (child.getAttribute('aria-hidden') === 'true' && (style.opacity === '0' || Number.parseFloat(style.fontSize) < 1)) {
        continue;
      }
      walk(child);
    }
  };
  walk(link);
  return text.replace(/\s+/g, ' ').trim();
}
