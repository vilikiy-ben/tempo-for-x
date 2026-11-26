import { fromOrigin, fromX } from '../core/twimg.js';

const LIMIT = 4;
const PER_IMAGE_BYTES = 900_000;
const TOTAL_BYTES = 2_000_000;
const TIMEOUT_MS = 6000;

const SUPPORTED = /^image\/(png|jpeg|jpg|webp|gif)$/i;

export async function inline(images, origin) {
  const trusted = (src) =>
    typeof src === 'string' && (src.startsWith('data:') || fromX(src) || fromOrigin(src, origin));
  const wanted = (Array.isArray(images) ? images : []).filter((image) => trusted(image?.src)).slice(0, LIMIT);
  if (!wanted.length) return [];

  const loaded = await Promise.all(wanted.map((image) => load(image.src)));
  const ready = [];
  let budget = TOTAL_BYTES;
  for (const [index, url] of loaded.entries()) {
    if (!url) continue;
    const weight = Math.round((url.length * 3) / 4);
    if (weight > budget) continue;
    budget -= weight;
    const { src, ...rest } = wanted[index];
    ready.push({ ...rest, url });
  }
  return ready;
}

async function load(src) {
  if (typeof src !== 'string' || !src) return null;
  if (src.startsWith('data:')) return SUPPORTED.test(src.slice(5).split(';')[0]) ? src : null;
  const blob = await fetchImage(src);
  return blob && blob.size <= PER_IMAGE_BYTES ? dataUrl(blob).catch(() => null) : null;
}

export async function fetchImage(src, { timeout = TIMEOUT_MS } = {}) {
  if (typeof src !== 'string' || !/^https?:\/\//i.test(src)) return null;

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeout);
  try {
    const response = await fetch(src, { signal: control.signal, credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return SUPPORTED.test(blob.type) ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function base64Of(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = '';
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary);
}

const dataUrl = async (blob) => `data:${blob.type};base64,${await base64Of(blob)}`;
