import { fileName, fromOrigin, fromX } from '../core/twimg.js';
import { base64Of, fetchImage } from './media.js';
import { originOf } from './download.js';

const LIMIT = 8;
const PER_IMAGE_BYTES = 6_000_000;
const TOTAL_BYTES = 20_000_000;
const TIMEOUT_MS = 8000;

const MAX_PNG_CHARS = 40_000_000;
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

export async function shotImages(payload, sender) {
  const origin = sender?.origin || originOf(sender?.url);
  const asked = (Array.isArray(payload?.images) ? payload.images : [])
    .filter((item) => typeof item?.key === 'string' && typeof item?.src === 'string')
    .filter((item) => fromX(item.src) || fromOrigin(item.src, origin))
    .slice(0, LIMIT);

  const blobs = await Promise.all(asked.map((item) => fetchImage(item.src, { timeout: TIMEOUT_MS })));
  const images = {};
  let budget = TOTAL_BYTES;
  for (const [index, blob] of blobs.entries()) {
    if (!blob || blob.size > PER_IMAGE_BYTES || blob.size > budget) continue;
    budget -= blob.size;
    images[asked[index].key] = `data:${blob.type};base64,${await base64Of(blob)}`;
  }
  return { images };
}

export async function saveShot(payload) {
  const png = payload?.png;
  if (typeof png !== 'string' || png.length > MAX_PNG_CHARS || !PNG.test(png)) return { saved: false };
  const filename = fileName({ handle: payload.handle, id: payload.id, url: 'shot.png' }).replace(/\.png$/, '-shot.png');
  try {
    const id = await chrome.downloads.download({ url: png, filename, saveAs: false, conflictAction: 'uniquify' });
    return { saved: Boolean(id) };
  } catch {
    return { saved: false };
  }
}
