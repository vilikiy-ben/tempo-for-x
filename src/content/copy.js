import { expand } from './context.js';
import * as dom from './dom.js';

const SHEETS =
  'M15.5 2.75H6.5c-1.24 0-2.25 1.01-2.25 2.25v11h1.5V5c0-.41.34-.75.75-.75h9v-1.5z' +
  'M10.25 7h7.5A3.25 3.25 0 0 1 21 10.25v7.5A3.25 3.25 0 0 1 17.75 21h-7.5A3.25 3.25 0 0 1 7 ' +
  '17.75v-7.5A3.25 3.25 0 0 1 10.25 7z' +
  'M10.25 8.5A1.75 1.75 0 0 0 8.5 10.25v7.5c0 .97.78 1.75 1.75 1.75h7.5a1.75 1.75 0 0 0 ' +
  '1.75-1.75v-7.5a1.75 1.75 0 0 0-1.75-1.75h-7.5z';

export const ACTION = {
  id: 'copy',
  title: 'quick.copy',
  color: '#5B5BFF',
  path: SHEETS,
  own: true,
  press: copy,
};

export function worth(article) {
  return Boolean(dom.textElOf(article));
}

const CUT = /[…]|\.\.\.$/;

const BLOCK = new Set(['DIV', 'P']);

function readable(root) {
  let out = '';
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (child.tagName === 'IMG') {
        out += child.getAttribute('alt') || '';
        continue;
      }
      if (child.tagName === 'BR') {
        out += '\n';
        continue;
      }
      if (child.tagName === 'A') {
        out += anchor(child);
        continue;
      }
      if (BLOCK.has(child.tagName) && out && !out.endsWith('\n')) out += '\n';
      walk(child);
    }
  };
  walk(root);
  return out;
}

function anchor(node) {
  const shown = dom.visibleText(node);
  const href = node.getAttribute('href') || '';
  if (!/^https?:/i.test(href)) return shown;
  if (!CUT.test(shown)) return shown;
  const told = (node.getAttribute('title') || '').trim();
  return /^https?:\/\/\S+$/i.test(told) ? told : href;
}

async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
  }
  const was = document.activeElement;
  const field = document.createElement('textarea');
  field.setAttribute('data-tempo', '');
  field.value = text;
  field.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
  document.body.append(field);
  field.select();
  let done = false;
  try {
    done = document.execCommand('copy');
  } catch {
    done = false;
  }
  field.remove();
  was?.focus?.();
  return done;
}

async function copy(article) {
  const truncated = await expand(article);
  const node = dom.textElOf(article);
  const text = node ? readable(node).trim() : '';
  if (!text) return { ok: false, say: 'quick.copy.empty' };

  const done = await toClipboard(text);
  if (!done) return { ok: false, say: 'quick.copy.fail' };
  const cut = truncated || /[…]\s*$/.test(text);
  return { ok: true, say: cut ? 'quick.copy.cut' : 'quick.copy.done' };
}
