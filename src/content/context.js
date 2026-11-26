import { sized } from '../core/twimg.js';
import { SEL } from './dom.js';
import * as dom from './dom.js';
import * as posts from './posts.js';

const IMAGE_LIMIT = 4;
const IMAGE_TOTAL = 4;
const ANCESTORS = 2;
const REPLIES = 6;
const REPLY_CHARS = 280;

const EMPTY_ALT = /^(image|изображение|photo|фото|gif|video|видео|embedded video)$/i;

export const smaller = (src) => sized(src, 'small');

function altOf(node) {
  const alt = node.getAttribute('alt')?.trim() || '';
  return alt && !EMPTY_ALT.test(alt) ? alt : '';
}

function imagesIn(root, { from, skip = null } = {}) {
  const found = [];
  const take = (node, kind) => {
    if (skip && skip.contains(node)) return;
    const raw = kind === 'video' ? node.poster : node.currentSrc || node.src;
    if (!raw || raw.startsWith('blob:')) return;
    const src = smaller(raw);
    if (found.some((image) => image.src === src)) return;
    found.push({ src, kind, from, alt: altOf(node) });
  };
  for (const node of root.querySelectorAll(SEL.poster)) take(node, 'video');
  for (const node of root.querySelectorAll(SEL.photo)) take(node, 'photo');
  for (const node of root.querySelectorAll(`${SEL.card} img`)) take(node, 'card');
  return found.slice(0, IMAGE_LIMIT);
}

function cardOf(root, skip) {
  const node = root.querySelector(SEL.card);
  if (!node || (skip && skip.contains(node))) return '';
  const lines = (node.innerText || node.textContent || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 3).join(' · ').slice(0, 200);
}

const textOf = (article) => dom.textElOf(article)?.textContent?.trim() || '';

function grown(article, before) {
  return new Promise((resolve) => {
    const deadline = Date.now() + 400;
    const look = () => {
      if (textOf(article).length > before || Date.now() > deadline) resolve();
      else requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

export async function expand(article) {
  const more = article.querySelector(SEL.more);
  if (!more) return false;
  if (more.tagName === 'A') return true;
  const before = textOf(article).length;
  more.click();
  await grown(article, before);
  return false;
}

export function worthExplaining(article, minChars) {
  if (article.querySelector(SEL.more)) return true;
  if (article.querySelector(SEL.media) || article.querySelector(SEL.card)) return true;
  if (dom.quoteRootOf(article)) return true;
  const record = posts.postOf(dom.tweetIdOf(article));
  if (record?.replyTo || record?.note || record?.article) return true;
  if ((record?.text?.length || 0) >= minChars) return true;
  return textOf(article).length >= minChars;
}

function imagesOf(record, from) {
  return (record?.media || [])
    .filter((item) => item.src)
    .map((item) => ({ src: smaller(item.src), kind: item.kind === 'photo' ? 'photo' : 'video', from, alt: item.alt || '' }));
}

function cardText(record, article, quoteRoot) {
  const card = record?.card;
  if (card) return [card.domain, card.title, card.description].filter(Boolean).join(' · ').slice(0, 300);
  return cardOf(article, quoteRoot);
}

function neighbour(record) {
  return {
    name: record.name,
    handle: record.handle ? `@${record.handle}` : null,
    text: record.text,
    at: record.at,
    card: record.card ? [record.card.domain, record.card.title].filter(Boolean).join(' · ') : '',
    media: record.media.map((item) => item.alt || item.kind),
  };
}

function ancestorsOf(record) {
  const chain = [];
  let link = record?.replyTo;
  const seen = new Set([record?.id]);
  while (link?.id && chain.length < ANCESTORS && !seen.has(link.id)) {
    seen.add(link.id);
    const parent = posts.postOf(link.id);
    if (!parent) break;
    chain.push(parent);
    link = parent.replyTo;
  }
  return chain;
}

export async function readPost(article) {
  const id = dom.tweetIdOf(article);
  const record = posts.postOf(id);
  const truncatedInDom = record?.text ? false : await expand(article);
  const quoteRoot = dom.quoteRootOf(article);

  const seen = textOf(article);
  const text = record?.text && record.text.length >= Math.min(seen.length, 40) ? record.text : seen;
  const cut = text === record?.text ? false : truncatedInDom || /[…]\s*$/.test(text);

  const quoteRecord = posts.postOf(record?.quoteId);
  const quote = quoteRoot || quoteRecord ? readQuote(quoteRoot, quoteRecord) : null;

  const ancestors = ancestorsOf(record);
  const images = imagesIn(article, { from: 'post', skip: quoteRoot });
  if (!images.length && record) images.push(...imagesOf(record, 'post'));
  if (quote) images.push(...quote.images);
  if (ancestors[0]) images.push(...imagesOf(ancestors[0], 'parent'));

  const replies = posts.repliesTo(id, REPLIES).map((reply) => ({
    handle: reply.handle ? `@${reply.handle}` : null,
    text: reply.text.slice(0, REPLY_CHARS),
    likes: reply.counts?.likes ?? null,
  }));

  return {
    post: {
      id,
      name: dom.nameOf(article) || record?.name || null,
      handle: dom.handleOf(article) || (record?.handle ? `@${record.handle}` : null),
      lang: record?.lang || dom.langOf(article),
      text,
      truncated: cut,
      at: record?.at ?? dom.createdAtOf(article),
      social: dom.socialContextOf(article),
      card: cardText(record, article, quoteRoot),
      quote: quote && { name: quote.name, handle: quote.handle, text: quote.text, note: quote.note },
      parents: ancestors.map(neighbour),
      replyTo: record?.replyTo && !ancestors.length ? { handle: record.replyTo.handle ? `@${record.replyTo.handle}` : null } : null,
      replies,
      note: record?.note || null,
      article: record?.article || null,
      images: images.slice(0, IMAGE_TOTAL),
    },
    truncated: cut,
  };
}

function readQuote(root, record) {
  const node = root?.querySelector(SEL.text);
  const seen = node?.textContent?.trim() || '';
  const text = record?.text && record.text.length >= seen.length ? record.text : seen;
  const images = root ? imagesIn(root, { from: 'quote' }) : [];
  return {
    name: (root && dom.nameOf(root)) || record?.name || null,
    handle: (root && dom.handleOf(root)) || (record?.handle ? `@${record.handle}` : null),
    text,
    note: record?.note || null,
    images: images.length ? images : imagesOf(record, 'quote'),
  };
}
