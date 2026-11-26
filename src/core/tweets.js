const DIGITS = /^\d{1,25}$/;
const HANDLE = /^[A-Za-z0-9_]{1,20}$/;

export const LIMITS = {
  text: 12000,
  name: 80,
  card: 300,
  alt: 400,
  note: 1200,
  media: 4,
};

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39);/g, (match) => ENTITIES[match]);

const str = (value) => (typeof value === 'string' ? value : '');
const count = (value) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export function unwrap(node) {
  if (node?.__typename === 'TweetWithVisibilityResults') return node.tweet || null;
  return node || null;
}

function idOf(node) {
  if (DIGITS.test(str(node.rest_id))) return node.rest_id;
  const legacy = str(node.legacy?.id_str);
  return DIGITS.test(legacy) ? legacy : null;
}

function authorOf(node) {
  const user = node.core?.user_results?.result;
  const handle = str(user?.core?.screen_name) || str(user?.legacy?.screen_name);
  const name = str(user?.core?.name) || str(user?.legacy?.name);
  return { handle: HANDLE.test(handle) ? handle : null, name: name.slice(0, LIMITS.name) || null };
}

function expandLinks(text, urls) {
  let out = text;
  for (const link of Array.isArray(urls) ? urls : []) {
    const short = str(link?.url);
    const long = str(link?.expanded_url);
    if (short && long) out = out.split(short).join(long);
  }
  return out;
}

function textOf(node) {
  const note = node.note_tweet?.note_tweet_results?.result;
  if (str(note?.text)) return decode(expandLinks(note.text, note.entity_set?.urls)).trim();
  const legacy = node.legacy || {};
  let text = decode(str(legacy.full_text));
  const range = legacy.display_text_range;
  if (Array.isArray(range) && range.length === 2 && range.every(Number.isInteger)) {
    text = Array.from(text).slice(range[0], range[1]).join('');
  }
  for (const media of legacy.entities?.media || []) {
    const short = str(media?.url);
    if (short) text = text.split(short).join('');
  }
  return expandLinks(text, legacy.entities?.urls).trim();
}

function cardOf(node) {
  const values = node.card?.legacy?.binding_values;
  if (!Array.isArray(values)) return null;
  const get = (key) => str(values.find((item) => item?.key === key)?.value?.string_value).trim();
  const title = get('title');
  const description = get('description');
  const domain = get('vanity_url') || get('domain');
  if (!title && !description && !domain) return null;
  return {
    title: title.slice(0, LIMITS.card),
    description: description.slice(0, LIMITS.card),
    domain: domain.slice(0, 80),
  };
}

function mediaOf(node) {
  const list = node.legacy?.extended_entities?.media || node.legacy?.entities?.media;
  if (!Array.isArray(list)) return [];
  return list.slice(0, LIMITS.media).map((item) => ({
    kind: item?.type === 'video' ? 'video' : item?.type === 'animated_gif' ? 'gif' : 'photo',
    alt: str(item?.ext_alt_text).slice(0, LIMITS.alt),
    src: str(item?.media_url_https),
  }));
}

function noteOf(node) {
  const subtitle = node.birdwatch_pivot?.subtitle;
  let text = str(subtitle?.text);
  const links = (Array.isArray(subtitle?.entities) ? subtitle.entities : [])
    .filter((item) => Number.isInteger(item?.fromIndex) && Number.isInteger(item?.toIndex) && /^https?:\/\//.test(str(item?.ref?.expandedUrl)))
    .sort((a, b) => b.fromIndex - a.fromIndex);
  for (const link of links) {
    if (link.fromIndex < 0 || link.toIndex > text.length || link.fromIndex >= link.toIndex) continue;
    text = text.slice(0, link.fromIndex) + link.ref.expandedUrl + text.slice(link.toIndex);
  }
  text = text.trim();
  return text ? text.slice(0, LIMITS.note) : null;
}

function articleOf(node) {
  const article = node.article?.article_results?.result;
  const title = str(article?.title).trim();
  if (!title) return null;
  return { title: title.slice(0, LIMITS.card), preview: str(article?.preview_text).trim().slice(0, 1200) };
}

export function recordOf(raw) {
  const node = unwrap(raw);
  if (node?.__typename !== 'Tweet' || !node.legacy) return null;
  const id = idOf(node);
  if (!id) return null;
  const legacy = node.legacy;

  const parent = str(legacy.in_reply_to_status_id_str);
  const replyHandle = str(legacy.in_reply_to_screen_name);
  const quoted = unwrap(node.quoted_status_result?.result);
  const quoteId = str(legacy.quoted_status_id_str) || (quoted ? idOf(quoted) : '') || '';
  const reposted = unwrap(legacy.retweeted_status_result?.result);
  const at = Date.parse(str(legacy.created_at));

  return {
    id,
    ...authorOf(node),
    text: textOf(node).slice(0, LIMITS.text),
    lang: /^[a-z]{2,3}(-[A-Za-z]+)?$/.test(str(legacy.lang)) && legacy.lang !== 'und' ? legacy.lang : null,
    at: Number.isFinite(at) ? at : null,
    conversation: DIGITS.test(str(legacy.conversation_id_str)) ? legacy.conversation_id_str : null,
    replyTo: parent || replyHandle
      ? { id: DIGITS.test(parent) ? parent : null, handle: HANDLE.test(replyHandle) ? replyHandle : null }
      : null,
    quoteId: DIGITS.test(quoteId) ? quoteId : null,
    repostOf: reposted ? idOf(reposted) : null,
    card: cardOf(node),
    media: mediaOf(node),
    note: noteOf(node),
    article: articleOf(node),
    counts: {
      likes: count(legacy.favorite_count),
      reposts: count(legacy.retweet_count),
      replies: count(legacy.reply_count),
      quotes: count(legacy.quote_count),
      views: count(node.views?.count),
    },
  };
}

export function recordsIn(data) {
  const found = new Map();
  const seen = new WeakSet();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const record = node.__typename === 'Tweet' ? recordOf(node) : null;
    if (record) found.set(record.id, merge(found.get(record.id), record));
    for (const value of Object.values(node)) walk(value);
  };
  walk(data);
  return [...found.values()];
}

export function merge(older, newer) {
  if (!older) return newer;
  if (!newer) return older;
  const base = newer.text.length >= older.text.length ? newer : older;
  const other = base === newer ? older : newer;
  const out = { ...base };
  for (const [key, value] of Object.entries(other)) {
    if (out[key] == null || (Array.isArray(out[key]) && !out[key].length)) out[key] = value;
  }
  return out;
}

const clip = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');
const optional = (value, test) => (typeof value === 'string' && test.test(value) ? value : null);

export function accept(raw, trusted) {
  if (!raw || typeof raw !== 'object' || !DIGITS.test(String(raw.id))) return null;
  const card = raw.card && typeof raw.card === 'object'
    ? { title: clip(raw.card.title, LIMITS.card), description: clip(raw.card.description, LIMITS.card), domain: clip(raw.card.domain, 80) }
    : null;
  const article = raw.article && typeof raw.article === 'object' && typeof raw.article.title === 'string'
    ? { title: clip(raw.article.title, LIMITS.card), preview: clip(raw.article.preview, 1200) }
    : null;
  const counts = {};
  for (const key of ['likes', 'reposts', 'replies', 'quotes', 'views']) counts[key] = count(raw.counts?.[key]);
  return {
    id: String(raw.id),
    handle: optional(raw.handle, HANDLE),
    name: clip(raw.name, LIMITS.name) || null,
    text: clip(raw.text, LIMITS.text),
    lang: optional(raw.lang, /^[a-z]{2,3}(-[A-Za-z]+)?$/),
    at: Number.isFinite(raw.at) ? raw.at : null,
    conversation: optional(raw.conversation, DIGITS),
    replyTo: raw.replyTo && typeof raw.replyTo === 'object'
      ? { id: optional(raw.replyTo.id, DIGITS), handle: optional(raw.replyTo.handle, HANDLE) }
      : null,
    quoteId: optional(raw.quoteId, DIGITS),
    repostOf: optional(raw.repostOf, DIGITS),
    card: card && (card.title || card.description || card.domain) ? card : null,
    media: (Array.isArray(raw.media) ? raw.media : []).slice(0, LIMITS.media).map((item) => ({
      kind: ['photo', 'video', 'gif'].includes(item?.kind) ? item.kind : 'photo',
      alt: clip(item?.alt, LIMITS.alt),
      src: typeof item?.src === 'string' && trusted(item.src) ? item.src : '',
    })),
    note: clip(raw.note, LIMITS.note) || null,
    article,
    counts,
  };
}
