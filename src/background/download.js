import { fileName, fromOrigin, fromX } from '../core/twimg.js';

const LIMIT = 4;

export async function saveMedia(payload, sender) {
  const asked = Array.isArray(payload?.items) ? payload.items.slice(0, LIMIT) : [];
  const origin = sender?.origin || originOf(sender?.url);
  const allowed = asked.filter(
    (item) => typeof item?.url === 'string' && (fromX(item.url) || fromOrigin(item.url, origin)),
  );
  if (!allowed.length) return { saved: 0, total: asked.length };

  const results = await Promise.all(
    allowed.map((item, index) =>
      save({
        url: item.url,
        filename: fileName({
          handle: payload.handle,
          id: payload.id,
          index,
          total: allowed.length,
          url: item.url,
          kind: item.kind,
        }),
      }),
    ),
  );
  return { saved: results.filter(Boolean).length, total: asked.length };
}

export function originOf(url) {
  try {
    return new URL(String(url)).origin;
  } catch {
    return null;
  }
}

async function save({ url, filename }) {
  try {
    const id = await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    return Boolean(id);
  } catch {
    return false;
  }
}
