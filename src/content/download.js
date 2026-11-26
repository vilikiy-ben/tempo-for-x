import { MSG } from '../core/constants.js';
import { original } from '../core/twimg.js';
import { SEL } from './dom.js';
import * as dom from './dom.js';
import * as videos from './videos.js';
import { postOf } from './posts.js';
import * as viewer from './viewer.js';

const ARROW =
  'M11.25 3.25h1.5V14h-1.5z' +
  'M7.06 11.19L12 16.13l4.94-4.94-1.06-1.06L12 14l-3.88-3.87z' +
  'M3 15.5v3.75c0 1.52 1.23 2.75 2.75 2.75h12.5c1.52 0 2.75-1.23 2.75-2.75V15.5h-1.5v3.75c0 ' +
  '.69-.56 1.25-1.25 1.25H5.75c-.69 0-1.25-.56-1.25-1.25V15.5H3z';

const LIMIT = 4;

export const ACTION = {
  id: 'download',
  title: 'quick.download',
  color: '#5B5BFF',
  path: ARROW,
  own: true,
  press: download,
};

function sameShot(src) {
  try {
    const url = new URL(src);
    return `${url.origin}${url.pathname}`;
  } catch {
    return src;
  }
}

function scan(scope, { skip = null, id = null } = {}) {
  const mine = (node) => !skip?.contains(node);
  const players = [...scope.querySelectorAll(SEL.video)].filter(mine);
  const photos = [...scope.querySelectorAll(SEL.photo)].filter(mine);
  const found = [];
  const frames = new Set();
  const add = (url, kind) => {
    if (!url || !/^https?:/i.test(url)) return;
    if (found.some((item) => item.url === url)) return;
    found.push({ url, kind });
  };

  for (const video of players) if (video.poster) frames.add(sameShot(video.poster));

  if (players.length) {
    const told = videos.videoOf(id);
    if (told) add(told, 'video');
    else {
      for (const video of players) {
        const src = video.currentSrc || video.src;
        if (src && !src.startsWith('blob:')) add(src, 'video');
      }
    }
  }

  for (const image of photos) {
    const raw = image.currentSrc || image.src;
    if (!raw || frames.has(sameShot(raw))) continue;
    add(original(raw), 'photo');
  }

  return { found: found.slice(0, LIMIT), shown: players.length + photos.length > 0 };
}

function told(id) {
  const found = [];
  const clip = videos.videoOf(id);
  if (clip) found.push({ url: clip, kind: 'video' });
  for (const item of postOf(id)?.media || []) {
    if (item.kind !== 'photo' || !/^https:/i.test(item.src)) continue;
    found.push({ url: original(item.src), kind: 'photo' });
  }
  return found.slice(0, LIMIT);
}

function takeable(article) {
  const id = dom.tweetIdOf(article);
  const handle = dom.handleOf(article);
  const quote = dom.quoteRootOf(article);

  const own = scan(article, { skip: quote, id });
  if (own.shown) return { items: own.found, handle, id };

  if (viewer.inPanel(article)) {
    const items = told(id);
    if (items.length) return { items, handle, id };
  }

  if (!quote) return { items: [], handle, id };
  const theirs = dom.tweetIdOf(quote) || postOf(id)?.quoteId || null;
  return { items: scan(quote, { id: theirs }).found, handle: dom.handleOf(quote), id: theirs };
}

export function worth(article) {
  const image = article.querySelector(SEL.photo);
  if (image && !article.querySelector(SEL.video) && !dom.quoteRootOf(article)) return true;
  return takeable(article).items.length > 0;
}

async function download(article) {
  const { items, handle, id } = takeable(article);
  if (!items.length) return { ok: false, say: 'quick.download.empty' };

  const response = await chrome.runtime
    .sendMessage({ type: MSG.download, payload: { handle, id, items } })
    .catch(() => null);

  const saved = Number(response?.data?.saved) || 0;
  if (!saved) return { ok: false, say: 'quick.download.fail' };
  if (saved < items.length) {
    return { ok: true, say: 'quick.download.some', n: saved, total: items.length };
  }
  return { ok: true, say: 'quick.download.done', n: saved };
}
