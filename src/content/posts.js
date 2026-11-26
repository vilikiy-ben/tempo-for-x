import { accept, merge } from '../core/tweets.js';
import { fromOrigin, fromX } from '../core/twimg.js';

const LIMIT = 1500;

const posts = new Map();
const children = new Map();

const trusted = (src) => fromX(src) || fromOrigin(src, location.origin);

globalThis.document?.addEventListener('tempo:tweets', (event) => {
  let rows;
  try {
    rows = JSON.parse(typeof event.detail === 'string' ? event.detail : '[]');
  } catch {
    return;
  }
  if (!Array.isArray(rows)) return;
  for (const raw of rows) {
    const record = accept(raw, trusted);
    if (!record) continue;
    const known = posts.get(record.id);
    posts.delete(record.id);
    posts.set(record.id, merge(known, record));
    const parent = record.replyTo?.id;
    if (parent) {
      if (!children.has(parent)) children.set(parent, new Set());
      children.get(parent).add(record.id);
    }
  }
  while (posts.size > LIMIT) {
    const oldest = posts.keys().next().value;
    posts.delete(oldest);
    children.delete(oldest);
  }
  while (children.size > LIMIT) children.delete(children.keys().next().value);
});

export function postOf(id) {
  return (id && posts.get(id)) || null;
}

export function repliesTo(id, limit = 8) {
  const ids = children.get(id);
  if (!ids) return [];
  return [...ids]
    .map((child) => posts.get(child))
    .filter((post) => post?.text)
    .sort((a, b) => (b.counts?.likes ?? 0) - (a.counts?.likes ?? 0))
    .slice(0, limit);
}
