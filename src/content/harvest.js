import { recordsIn } from '../core/tweets.js';

const FOLLOWERS = 'tempo:followers';
const MEDIA = 'tempo:media';
const TWEETS = 'tempo:tweets';
const GRAPHQL = /\/graphql\//i;
const DIGITS = /^\d{1,25}$/;

function tweetIdOf(node) {
  if (node.__typename === 'Tweet' && DIGITS.test(String(node.rest_id ?? ''))) return node.rest_id;
  const legacy = String(node.legacy?.id_str ?? '');
  return DIGITS.test(legacy) ? legacy : null;
}

function idFromUrl(url) {
  const found = typeof url === 'string' ? url.match(/\/status\/(\d{1,25})/) : null;
  return found ? found[1] : null;
}

function bestVariant(variants) {
  let best = null;
  for (const variant of variants) {
    if (variant?.content_type !== 'video/mp4') continue;
    if (typeof variant.url !== 'string' || !variant.url) continue;
    const rate = Number(variant.bitrate) || 0;
    if (!best || rate > best.rate) best = { rate, url: variant.url };
  }
  return best;
}

function harvest(text) {
  if (!text || text.length < 64) return;
  const hasUsers = text.includes('relationship_counts');
  const hasMedia = text.includes('video_info');
  const hasTweets = text.includes('full_text');
  if (!hasUsers && !hasMedia && !hasTweets) return;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return;
  }

  const people = [];
  const clips = [];
  const seen = new Set();
  const shown = new Set();

  const walk = (node, tweetId) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, tweetId);
      return;
    }
    if (node.__typename === 'User') {
      const handle = node.core?.screen_name;
      const followers = node.relationship_counts?.followers;
      if (handle && Number.isFinite(followers) && !seen.has(handle)) {
        seen.add(handle);
        people.push([handle.toLowerCase(), followers]);
      }
    }

    const id = tweetIdOf(node) || tweetId;
    const variants = node.video_info?.variants;
    if (Array.isArray(variants)) {
      const best = bestVariant(variants);
      const owners = new Set([id, idFromUrl(node.expanded_url)].filter(Boolean));
      for (const owner of owners) {
        if (!best || shown.has(owner)) continue;
        shown.add(owner);
        clips.push([owner, best.url]);
      }
    }

    for (const value of Object.values(node)) walk(value, id);
  };
  walk(data, null);

  if (people.length) document.dispatchEvent(new CustomEvent(FOLLOWERS, { detail: people }));
  if (clips.length) document.dispatchEvent(new CustomEvent(MEDIA, { detail: clips }));

  if (hasTweets) {
    const records = recordsIn(data);
    if (records.length) document.dispatchEvent(new CustomEvent(TWEETS, { detail: JSON.stringify(records) }));
  }
}

const nativeFetch = window.fetch;
if (typeof nativeFetch === 'function') {
  window.fetch = function (...args) {
    const answer = nativeFetch.apply(this, args);
    try {
      const url = String(args[0]?.url ?? args[0] ?? '');
      if (GRAPHQL.test(url)) {
        answer.then((response) => {
          response.clone().text().then(harvest).catch(() => {});
        }).catch(() => {});
      }
    } catch {
    }
    return answer;
  };
}

const open = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url, ...rest) {
  try {
    if (GRAPHQL.test(String(url))) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') harvest(this.responseText);
        } catch {
        }
      });
    }
  } catch {
  }
  return open.call(this, method, url, ...rest);
};
