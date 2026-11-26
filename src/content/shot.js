import { MSG } from '../core/constants.js';
import { locale } from '../core/i18n.js';
import { compose, themeFor, themeOf } from '../core/shot.js';
import { TINTS, createDeck } from '../core/tints.js';
import { expand } from './context.js';
import * as dom from './dom.js';
import { decode, fontsReady, measure, paint, sizesOf, toPng } from './shot-paint.js';
import { read, translationOf } from './shot-read.js';
import { pageColor } from './theme.js';

const FRAME =
  'M3 8V5.75A2.75 2.75 0 0 1 5.75 3H8v1.5H5.75c-.69 0-1.25.56-1.25 1.25V8H3z' +
  'M16 3h2.25A2.75 2.75 0 0 1 21 5.75V8h-1.5V5.75c0-.69-.56-1.25-1.25-1.25H16V3z' +
  'M21 16v2.25A2.75 2.75 0 0 1 18.25 21H16v-1.5h2.25c.69 0 1.25-.56 1.25-1.25V16H21z' +
  'M8 21H5.75A2.75 2.75 0 0 1 3 18.25V16h1.5v2.25c0 .69.56 1.25 1.25 1.25H8V21z' +
  'M9 7.75a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z' +
  'M11.75 8.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5z' +
  'M8 13h8a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 8 13z' +
  'M8 16h5a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 8 16z';

export const ACTION = {
  id: 'shot',
  title: 'quick.shot',
  color: '#5B5BFF',
  path: FRAME,
  own: true,
  press: shoot,
};

let sign = '';
let theme = 'auto';

const deck = createDeck(TINTS.map((tint) => tint.id));

export function configure(settings) {
  sign = String(settings.shot?.sign || '').trim().slice(0, 60);
  theme = settings.shot?.theme || 'auto';
}

export function worth(article) {
  return Boolean(article.querySelector(dom.SEL.userName));
}

async function translationSettled(article, before) {
  const textEl = dom.textElOf(article);
  const node = translationOf(textEl);
  if (!node) return;
  const deadline = Date.now() + 4000;
  await new Promise((resolve) => setTimeout(resolve, 350));
  while (Date.now() < deadline) {
    const busy = node.classList.contains('tempo-translating');
    if (!busy && node.textContent !== before) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

async function render(article) {
  const look = themeFor(theme, themeOf(pageColor()), deck.next);
  const translated = translationOf(dom.textElOf(article));
  const before = translated?.textContent;
  const hadMore = Boolean(article.querySelector(dom.SEL.more));
  await expand(article);
  if (hadMore && translated) await translationSettled(article, before);

  const { post, sources, local, family } = read(article);
  post.sign = sign;

  const sample = post.runs.map((run) => run.text).join('').slice(0, 200) || post.name || 'Aa';
  const [fetched] = await Promise.all([
    sources.length
      ? chrome.runtime.sendMessage({ type: MSG.shotImages, payload: { images: sources } }).catch(() => null)
      : null,
    fontsReady(family, sample),
  ]);
  const images = await decode({ ...(fetched?.data?.images || {}), ...local });

  const scene = compose(post, {
    measure,
    family,
    theme: look,
    locale: locale(),
    sizes: sizesOf(images),
  });
  return toPng(paint(scene, images));
}

function dataUrlOf(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function toFile(blob, article) {
  const png = await dataUrlOf(blob);
  const reply = await chrome.runtime
    .sendMessage({
      type: MSG.shotSave,
      payload: { png, handle: dom.handleOf(article), id: dom.tweetIdOf(article) },
    })
    .catch(() => null);
  return Boolean(reply?.data?.saved);
}

function shoot(article, gesture) {
  const png = render(article);
  png.catch(() => {});

  if (gesture?.shiftKey) {
    return png
      .then((blob) => toFile(blob, article))
      .then((saved) => (saved ? { ok: true, say: 'quick.shot.file' } : { ok: false, say: 'quick.shot.fail' }))
      .catch(() => ({ ok: false, say: 'quick.shot.fail' }));
  }

  let written;
  try {
    written = navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } catch (error) {
    written = Promise.reject(error);
  }

  return written.then(
    () => ({ ok: true, say: 'quick.shot.done' }),
    async () => {
      const blob = await png.catch(() => null);
      if (!blob) return { ok: false, say: 'quick.shot.fail' };
      const saved = await toFile(blob, article).catch(() => false);
      return saved ? { ok: true, say: 'quick.shot.saved' } : { ok: false, say: 'quick.shot.fail' };
    },
  );
}
