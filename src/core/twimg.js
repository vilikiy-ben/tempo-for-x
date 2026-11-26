const HOSTS = /^(pbs|video)\.twimg\.com$/i;

export function sized(src, name) {
  if (!/^https?:/i.test(src)) return src;
  try {
    const url = new URL(src);
    if (!/(^|\.)twimg\.com$/i.test(url.hostname)) return src;
    if (url.searchParams.has('name') || url.searchParams.has('format')) {
      url.searchParams.set('name', name);
    }
    return url.toString();
  } catch {
    return src;
  }
}

export const original = (src) => sized(src, 'orig');

export function avatarSized(src) {
  if (!/^https:\/\/pbs\.twimg\.com\/profile_images\//i.test(String(src || ''))) return src;
  return src.replace(/_(normal|bigger|mini|x96|reasonably_small)(\.[a-z]+)(\?.*)?$/i, '_200x200$2$3');
}

export function fromX(src) {
  try {
    const url = new URL(String(src));
    return url.protocol === 'https:' && HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

export function fromOrigin(src, origin) {
  if (!origin) return false;
  try {
    return new URL(String(src)).origin === origin;
  } catch {
    return false;
  }
}

function extensionOf(src, kind) {
  try {
    const url = new URL(String(src), 'https://x.com');
    const told = url.searchParams.get('format');
    if (told && /^[a-z0-9]{2,4}$/i.test(told)) return told.toLowerCase();
    const guessed = url.pathname.match(/\.([a-z0-9]{2,4})$/i);
    if (guessed) return guessed[1].toLowerCase();
  } catch {
  }
  return kind === 'video' ? 'mp4' : 'jpg';
}

export function fileName({ handle, id, index = 0, total = 1, url, kind } = {}) {
  const who = String(handle || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20) || 'x';
  const which = String(id || '').replace(/\D/g, '').slice(0, 25);
  const nth = total > 1 ? `-${index + 1}` : '';
  const stem = which ? `${who}-${which}${nth}` : `${who}${nth}`;
  return `${stem}.${extensionOf(url, kind)}`;
}
