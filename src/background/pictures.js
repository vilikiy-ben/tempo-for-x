import { fit } from '../core/picture.js';
import { fromOrigin, fromX } from '../core/twimg.js';
import { base64Of, fetchImage } from './media.js';

const TIMEOUT_MS = 4000;
const MAX_BYTES = 5_000_000;
const QUALITY = 0.85;

export async function prepare(images, origin) {
  return Promise.all((images || []).map((image) => one(image?.src, origin).catch(() => null)));
}

async function one(src, origin) {
  if (typeof src !== 'string' || !(fromX(src) || fromOrigin(src, origin))) return null;
  const blob = await fetchImage(src, { timeout: TIMEOUT_MS });
  if (!blob || blob.size > MAX_BYTES) return null;

  const bitmap = await createImageBitmap(blob);
  try {
    const box = fit(bitmap.width, bitmap.height);
    if (!box) return null;
    const canvas = new OffscreenCanvas(box.canvasWidth, box.canvasHeight);
    const paint = canvas.getContext('2d');
    paint.fillStyle = '#fff';
    paint.fillRect(0, 0, box.canvasWidth, box.canvasHeight);
    paint.imageSmoothingQuality = 'high';
    paint.drawImage(bitmap, box.x, box.y, box.width, box.height);
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
    return {
      ref: crypto.randomUUID(),
      base64: await base64Of(jpeg),
      width: box.canvasWidth,
      height: box.canvasHeight,
    };
  } finally {
    bitmap.close();
  }
}
