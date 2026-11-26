export const JEV_MODEL = 'jev-latest';

export const VERDICT_VERSION = 2;

const TEXT_LIMIT = 6000;
const CONTEXT_LIMIT = 1200;

const score = (instructions, criteria) => ({ type: 'score', instructions, criteria });

export const QUESTIONS = {
  info: score('How much concrete, usable information does the post itself give the reader?', [
    'None: only emotion, hype, opinion, a joke, or a call to action',
    'Little: one concrete detail, the rest is impression',
    'Solid: says clearly what happened, what changed, or how to do something',
    'Rich: specific facts, numbers, steps, examples, or sources the reader can use or check',
  ]),
  insight: score('How much of an idea worth thinking about does the post itself offer?', [
    'None: no idea of its own; a reaction, a slogan, or a repeat of what everyone says',
    'A bare opinion or reaction with no reason given',
    'A clear point of view, argument, or first-hand experience with a reason or an example',
    'A non-obvious insight or lesson the reader can learn from',
  ]),
  hype: score('How much of the post is excited praise (insane, game-changer, mind-blowing, 🤯, 🚀) instead of description?', [
    'None: the tone is calm and descriptive',
    'A touch: one or two enthusiastic words next to concrete content',
    'A lot: excited praise and superlatives take up much of the post',
    'All of it: the post is excitement and superlatives with nothing concrete',
  ]),
  joke: score('How much does the post rely on humor?', [
    'Not a joke',
    'A light joke or wit inside a post that has a real point',
    'Mostly a joke, but it also carries a real fact or argument the reader can take away',
    'Only a joke or meme with nothing beyond the laugh',
  ]),
  claims: score('How far do the claims in the post go beyond what it shows?', [
    'No bold claims: a plain account of what happened or how something works, or claims backed by facts, sources, data, or a demo',
    "An opinion or prediction openly framed as the author's view",
    'Sweeping or extraordinary claims (changes everything, X is dead, 10x, guaranteed) with no support',
    'Sensational or dubious claims stated as fact, or contradicted by a community note',
  ]),
  bait: score('How much does the post push readers to like, repost, reply, follow, or bookmark?', [
    'No request to engage',
    'A soft ask at the end of a post that stands on its own',
    'Engagement is a main purpose: like, repost, follow, or comment a keyword to get something',
  ]),
  rage: score('How hostile is the post?', [
    'Calm, or disagreement argued with reasons',
    'Sharp or sarcastic, but aimed at ideas and with some argument',
    'Mocks or insults people or groups',
    'Written mainly to make readers angry, with no argument',
  ]),
  promo: score('How much is the post selling something to the reader?', [
    'Nothing is being sold',
    'The author mentions their own product, project, or link in passing; the post stands on its own',
    'An announcement or ad for a product that gives concrete facts about it',
    'A sales pitch: urgency, discounts, income promises, or "link in bio", little else',
  ]),
  clickbait: score('How much does the post hold back its point to make readers click or open a thread?', [
    'The post states its point itself',
    'It teases more in a thread or a link, but already gives the main point',
    'It hides the main point behind a teaser, a thread, or a link',
  ]),
};

export const VALUE = ['info', 'insight'];

export const SEVERITY = {
  bait: [0, 0.2, 1],
  rage: [0, 0.1, 0.7, 1],
  claims: [0, 0.1, 0.5, 1],
  clickbait: [0, 0.25, 1],
  promo: [0, 0.05, 0.2, 1],
  hype: [0, 0.1, 0.6, 1],
  joke: [0, 0, 0.3, 1],
};

export const WEIGHTS = {
  bait: 0.8,
  rage: 0.7,
  claims: 0.6,
  promo: 0.6,
  clickbait: 0.55,
  hype: 0.5,
  joke: 0.85,
};

export const SHIELD = {
  bait: 0.35,
  rage: 0.4,
  claims: 0.4,
  promo: 0.6,
  clickbait: 0.6,
  hype: 0.85,
  joke: 0.9,
};

export const PACKAGING = Object.keys(WEIGHTS);
export const SIGNALS = [...VALUE, ...PACKAGING];

export const LEVELS = [
  { from: 9, key: 'junk.level.solid', tone: 'good' },
  { from: 7, key: 'junk.level.decent', tone: 'good' },
  { from: 5, key: 'junk.level.meh', tone: 'meh' },
  { from: 3, key: 'junk.level.mostly', tone: 'junk' },
  { from: 0, key: 'junk.level.junk', tone: 'junk' },
];

export const UNSURE_BELOW = 0.35;

const REASON_FROM = 0.8;
const REASON_SHARE = 0.3;
export const SHOWN_FROM = 0.25;

const at = (handle) => `@${String(handle || 'unknown').replace(/^@+/, '')}`;

const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
const cut = (text, limit) => String(text || '').slice(0, limit);

export const PICTURE_LIMIT = 4;

export function picturesOf(post) {
  return (post?.images || []).filter((image) => image?.from !== 'parent').slice(0, PICTURE_LIMIT);
}

function kindOf(image, seen) {
  if (image.kind === 'video') return seen ? 'still frame from a video' : 'video';
  if (image.kind === 'card') return 'link preview image';
  return 'image';
}

export function stateOf(post, refs = []) {
  const own = {
    author: post.name ? `${at(post.handle)} (${post.name})` : at(post.handle),
    text: cut(post.text, TEXT_LIMIT),
  };
  if (post.truncated) own.note = 'The post text is cut off; only its beginning is shown.';
  if (post.card) own.link_card = post.card;
  if (post.article?.title) own.article = { title: post.article.title, preview: cut(post.article.preview, CONTEXT_LIMIT) };
  const media = picturesOf(post).map((image, index) => {
    const ref = refs[index];
    const kind = kindOf(image, Boolean(ref));
    if (ref) {
      const seen = { kind, picture: ref };
      if (image.from === 'quote') seen.in = 'the quoted post';
      if (image.alt) seen.described_as = image.alt;
      return seen;
    }
    const whose = image.from === 'quote' ? ' in the quoted post' : '';
    return image.alt ? `${kind}${whose}, described as: ${image.alt}` : `${kind}${whose}, not visible to you`;
  });
  if (media.length) own.attached_media = media;

  const context = {};
  const parent = post.parents?.[0];
  if (parent) context.replying_to = { author: at(parent.handle), text: cut(parent.text, CONTEXT_LIMIT) };
  else if (post.replyTo?.handle) context.replying_to = { author: at(post.replyTo.handle), text: '(not loaded)' };
  if (post.quote?.text || post.quote?.handle) {
    context.quoted_post = { author: at(post.quote.handle), text: cut(post.quote.text, CONTEXT_LIMIT) };
  }
  if (post.note) context.community_note_on_post = cut(post.note, 800);

  return Object.keys(context).length ? { post: own, context } : { post: own };
}

export const PICTURES_HEADER = 'TypeSafe-Danger-Zone-Images';

export function requestOf(post, pictures = []) {
  const refs = picturesOf(post).map((_, index) => pictures[index]?.ref || null);
  const body = { state: stateOf(post, refs), model: JEV_MODEL, questions: QUESTIONS };
  const assets = {};
  for (const picture of pictures) {
    if (picture?.ref && picture.base64) assets[picture.ref] = { type: 'image', format: 'jpg', data_base64: picture.base64 };
  }
  if (!Object.keys(assets).length) return { body, headers: {}, seen: 0 };
  body.assets = assets;
  return { body, headers: { [PICTURES_HEADER]: 'true' }, seen: Object.keys(assets).length };
}

export function readable(post, { pictures = false } = {}) {
  if (post?.text?.trim() || post?.quote?.text?.trim() || post?.images?.some((image) => image.alt)) return true;
  return pictures && picturesOf(post).length > 0;
}

function distribution(answer, levels) {
  const out = new Array(levels).fill(0);
  const raw = answer?.probabilities;
  let total = 0;
  if (raw && typeof raw === 'object') {
    for (let i = 0; i < levels; i += 1) {
      const p = Number(raw[i] ?? raw[String(i)]);
      out[i] = Number.isFinite(p) && p > 0 ? p : 0;
      total += out[i];
    }
  }
  if (total > 0) return out.map((p) => p / total);
  const position = Math.round(Math.min(levels - 1, Math.max(0, Number(answer?.score) || 0)));
  out[position] = 1;
  return out;
}

function share(answer, levels) {
  return clamp01((Number(answer?.score) || 0) / (levels - 1));
}

function levelOf(probabilities) {
  return probabilities.reduce((best, p, i, all) => (p > all[best] ? i : best), 0);
}

const confidenceOf = (answer) => (Number.isFinite(answer?.confidence) ? clamp01(answer.confidence) : 1);

export function verdictOf(answers) {
  const levelsOf = (key) => QUESTIONS[key].criteria.length;

  const infoDist = distribution(answers?.info, levelsOf('info'));
  const insightDist = distribution(answers?.insight, levelsOf('insight'));
  const info = share(answers?.info, levelsOf('info'));
  const insight = share(answers?.insight, levelsOf('insight'));
  const value = 1 - (1 - info) * (1 - 0.7 * insight);
  const base = 0.15 + 0.8 * value ** 1.2;

  const signals = {};
  const levels = {};
  const penalties = {};
  for (const key of PACKAGING) {
    const dist = distribution(answers?.[key], levelsOf(key));
    const severity = dist.reduce((sum, p, i) => sum + p * SEVERITY[key][i], 0);
    signals[key] = clamp01(severity);
    levels[key] = levelOf(dist);
    const doubt = 0.6 + 0.4 * confidenceOf(answers?.[key]);
    penalties[key] = clamp01(WEIGHTS[key] * signals[key] * (1 - SHIELD[key] * value) * doubt);
  }

  const kept = PACKAGING.reduce((product, key) => product * (1 - penalties[key]), 1);
  const exact = 10 * base * kept;
  const score = Math.max(0, Math.min(10, Math.round(exact)));

  const lost = 10 * base - exact;
  const logs = Object.fromEntries(PACKAGING.map((key) => [key, -Math.log(1 - Math.min(penalties[key], 0.999))]));
  const logSum = Object.values(logs).reduce((sum, x) => sum + x, 0);
  const losses = { value: round1(10 - 10 * base) };
  for (const key of PACKAGING) losses[key] = logSum > 0 ? round1((lost * logs[key]) / logSum) : 0;

  const level = LEVELS.find((item) => score >= item.from) || LEVELS[LEVELS.length - 1];
  const reasons = PACKAGING.filter((key) => losses[key] >= REASON_FROM || penalties[key] >= REASON_SHARE)
    .sort((a, b) => penalties[b] - penalties[a]);
  if (!reasons.length && value < 0.2) reasons.push(levels.joke === 3 ? 'joke' : 'empty');

  return {
    score,
    level: level.key,
    tone: level.tone,
    reasons,
    value: { info, insight, infoLevel: levelOf(infoDist), insightLevel: levelOf(insightDist) },
    signals,
    levels,
    losses,
    unsure: Math.max(confidenceOf(answers?.info), confidenceOf(answers?.insight)) < UNSURE_BELOW,
    confidence: Object.fromEntries(SIGNALS.map((key) => [key, round2(confidenceOf(answers?.[key]))])),
    version: VERDICT_VERSION,
  };
}

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

export const current = (verdict) => verdict?.version === VERDICT_VERSION;

export function errorCodeOf(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'billing';
  if (status === 422 || status === 400 || status === 413 || status === 415) return 'rejected';
  if (status === 429 || status === 529 || status === 503) return 'busy';
  return 'failed';
}

export const RETRYABLE_JUNK = new Set(['busy', 'offline', 'failed']);

export function jevTitle(model) {
  const match = /^jev-(\d+)\.(\d+)/.exec(String(model || ''));
  return match ? `Jev ${match[1]}.${match[2]}` : 'Jev';
}

export function maskKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  if (raw.length <= 12) return `…${raw.slice(-4)}`;
  const head = raw.startsWith('apikey_') ? 'apikey_' : raw.slice(0, 4);
  return `${head}…${raw.slice(-4)}`;
}

export function cleanKey(input) {
  return String(input || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^TYPESAFE_API_KEY\s*=\s*/, '')
    .trim();
}

export function plausibleKey(key) {
  return /^[\w-]{20,}$/.test(key);
}

export function remember(entries, id, entry, limit) {
  const next = new Map(entries);
  next.delete(id);
  next.set(id, entry);
  while (next.size > limit) next.delete(next.keys().next().value);
  return next;
}
