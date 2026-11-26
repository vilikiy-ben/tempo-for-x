import { clamp, ellipsize, wrap } from './wrap.js';
import { luminanceOf } from './theme.js';
import { t } from './i18n.js';
import { tintById } from './tints.js';

export const WIDTH = 1000;
export const SCALE = 2;

export const TELEGRAM = '#229ED9';

const TELEGRAM_SIGN = { fill: TELEGRAM, ink: '#FFFFFF' };

export const PALETTES = {
  light: { paper: '#FFFFFF', ink: '#0F1419', soft: '#536471', rule: '#CFD9DE', well: '#EFF3F4', link: '#1D9BF0', sign: TELEGRAM_SIGN },
  dim: { paper: '#15202B', ink: '#F7F9F9', soft: '#8B98A5', rule: '#38444D', well: '#1E2732', link: '#1D9BF0', sign: TELEGRAM_SIGN },
  dark: { paper: '#000000', ink: '#E7E9EA', soft: '#71767B', rule: '#2F3336', well: '#16181C', link: '#1D9BF0', sign: TELEGRAM_SIGN },
};

export function paletteOf(theme) {
  return PALETTES[theme] || tintById(theme) || PALETTES.dark;
}

export const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const M = {
  margin: 40,
  pad: 30,
  radius: 32,
  ring: 1.5,
  avatar: 64,
  headGap: 16,
  name: 25,
  handle: 22,
  badge: 25,
  badgeGap: 5,
  bodyTop: 22,
  leading: 1.32,
  mediaTop: 22,
  mediaRadius: 18,
  mediaGap: 3,
  foot: 21,
  footTop: 24,
  signTop: 12,
  signGap: 24,
  pill: { size: 19, padX: 15, height: 38 },
  quote: {
    top: 20, pad: 16, radius: 18, avatar: 26, name: 19, body: 21, lines: 8, mediaTop: 20,
    tallest: 510 / 564,
  },
  maxHeight: 7600,
};

function channels(color) {
  const text = String(color || '').trim();
  const hex = text.match(/^#([0-9a-f]{6})$/i);
  if (hex) return hex[1].match(/../g).map((part) => parseInt(part, 16));
  const numbers = (text.match(/[\d.]+/g) || []).map(Number);
  return numbers.length >= 3 ? numbers.slice(0, 3) : null;
}

export function themeOf(color) {
  const light = luminanceOf(color);
  if (light === null || light >= 0.5) return 'light';
  const rgb = channels(color);
  return rgb && rgb[2] - rgb[0] > 12 ? 'dim' : 'dark';
}

export const SHOT_THEMES = ['auto', 'dark', 'light', 'random'];

export function themeFor(choice, page, draw) {
  if (choice === 'dark' || choice === 'light') return choice;
  if (choice === 'random') return draw();
  return page;
}

export function stampOf(at, locale) {
  if (!Number.isFinite(at)) return null;
  const when = new Date(at);
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(when);
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(when);
  return { time, date };
}

export function shortDateOf(at, locale, now = Date.now()) {
  if (!Number.isFinite(at)) return null;
  const when = new Date(at);
  const sameYear = when.getFullYear() === new Date(now).getFullYear();
  const options = sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, options).format(when);
}

export function viewsOf(count, locale) {
  if (!Number.isFinite(count) || count < 0) return null;
  if (count < 10_000) {
    return { text: new Intl.NumberFormat(locale).format(count), n: count };
  }
  const text = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(count);
  return { text, n: 1000 };
}

const fit = (value, low, high) => Math.min(high, Math.max(low, value));

export function mediaGrid(aspects, width, {
  gap = M.mediaGap, radius = M.mediaRadius, square = 1, center = false, corners = null,
} = {}) {
  const count = Math.min(aspects.length, 4);
  if (!count) return null;
  const round = corners || [radius, radius, radius, radius];

  const cellsIn = (boxes, gridW, gridH) => boxes.map(([x, y, w, h]) => {
    const left = x < 0.5;
    const top = y < 0.5;
    const rightEdge = Math.abs(x + w - gridW) < 0.5;
    const bottom = Math.abs(y + h - gridH) < 0.5;
    return {
      x, y, w, h,
      radii: [left && top ? round[0] : 0, rightEdge && top ? round[1] : 0,
        rightEdge && bottom ? round[2] : 0, left && bottom ? round[3] : 0],
    };
  });

  if (count === 1) {
    const aspect = fit(Number(aspects[0]) || 16 / 9, 0.75, 3);
    let w = width;
    let h = width / aspect;
    const tallest = width * square;
    if (h > tallest) {
      h = tallest;
      w = h * aspect;
    }
    w = Math.round(w);
    h = Math.round(h);
    const gridW = center ? width : w;
    const x = center ? Math.round((width - w) / 2) : 0;
    return { width: gridW, height: h, cells: cellsIn([[x, 0, w, h]], gridW, h) };
  }

  const height = Math.round((width * 9) / 16);
  const half = (width - gap) / 2;
  const halfH = (height - gap) / 2;
  const right = half + gap;
  const boxes = {
    2: [[0, 0, half, height], [right, 0, half, height]],
    3: [[0, 0, half, height], [right, 0, half, halfH], [right, halfH + gap, half, halfH]],
    4: [[0, 0, half, halfH], [right, 0, half, halfH], [0, halfH + gap, half, halfH], [right, halfH + gap, half, halfH]],
  }[count];
  return { width, height, cells: cellsIn(boxes, width, height) };
}

const fontOf = (weight, size, family) => `${weight} ${size}px ${family}`;

export function bodySize(length) {
  if (length <= 160) return 32;
  if (length <= 320) return 29;
  if (length <= 700) return 26;
  return 23;
}

const lengthOf = (runs) => (runs || []).reduce((sum, run) => sum + String(run.text || '').length, 0);

function lineOp(line, x, y, font, palette) {
  return {
    op: 'runs',
    font,
    y,
    parts: line.parts.map((part) => ({
      text: part.text,
      x: x + part.x,
      color: part.kind === 'link' ? palette.link : palette.ink,
    })),
  };
}

const aspectOf = (sizes, key) => {
  const size = key && sizes?.[key];
  return size && size.w > 0 && size.h > 0 ? size.w / size.h : 16 / 9;
};

function mediaOps(media, x, y, width, env, options = {}) {
  const grid = mediaGrid(media.map((item) => aspectOf(env.sizes, item.key)), width, options);
  if (!grid) return { ops: [], height: 0 };
  const { palette, family } = env;
  const ops = [];
  grid.cells.forEach((cell, index) => {
    const item = media[index];
    const box = { x: x + cell.x, y: y + cell.y, w: cell.w, h: cell.h };
    ops.push({ op: 'image', key: item.key, ...box, radii: cell.radii, fill: palette.well });
    if (item.kind === 'video') {
      const r = Math.max(18, Math.min(34, Math.min(box.w, box.h) * 0.12));
      ops.push({ op: 'play', cx: box.x + box.w / 2, cy: box.y + box.h / 2, r });
    }
    if (item.kind === 'gif') {
      const size = Math.max(13, Math.round(Math.min(box.w, box.h) * 0.045));
      ops.push({ op: 'chip', text: 'GIF', x: box.x + 12, y: box.y + box.h - 12, font: fontOf(700, size, family) });
    }
  });
  if (options.frame !== false) {
    ops.push({ op: 'frame', x, y, w: grid.width, h: grid.height, r: options.radius ?? M.mediaRadius, stroke: palette.rule });
  }
  return { ops, height: grid.height };
}

function cardOps(card, x, y, width, env) {
  const { palette, family, measure } = env;
  const ops = [];
  let height = 0;
  if (card.key) {
    height = Math.round(width / 1.91);
    ops.push({ op: 'image', key: card.key, x, y, w: width, h: height, radii: [M.mediaRadius, M.mediaRadius, M.mediaRadius, M.mediaRadius], fill: palette.well });
    const label = card.title || card.domain;
    if (label) {
      const font = fontOf(400, 19, family);
      const text = ellipsize(label, width - 60, (value) => measure(value, font));
      ops.push({ op: 'chip', text, x: x + 14, y: y + height - 14, font, soft: true });
    }
    ops.push({ op: 'frame', x, y, w: width, h: height, r: M.mediaRadius, stroke: palette.rule });
    if (card.domain && card.title) {
      const font = fontOf(400, 19, family);
      ops.push({ op: 'text', text: card.domain, x, y: y + height + 20, font, color: palette.soft });
      height += 34;
    }
    return { ops, height };
  }
  const lines = [card.domain, card.title].filter(Boolean);
  if (!lines.length) return { ops, height: 0 };
  height = 24 + lines.length * 28;
  ops.push({ op: 'frame', x, y, w: width, h: height, r: M.mediaRadius, stroke: palette.rule });
  lines.forEach((line, index) => {
    const font = fontOf(index === 0 ? 400 : 700, 19, family);
    ops.push({ op: 'text', text: ellipsize(line, width - 36, (value) => measure(value, font)), x: x + 18, y: y + 26 + index * 28, font, color: index === 0 ? palette.soft : palette.ink });
  });
  return { ops, height };
}

function quoteOps(quote, x, y, width, env) {
  const { palette, family, measure } = env;
  const Q = M.quote;
  const ops = [];
  const inner = width - Q.pad * 2;
  let cursor = y + Q.pad;

  const mid = cursor + Q.avatar / 2;
  ops.push({ op: 'avatar', key: quote.avatar, x: x + Q.pad, y: cursor, size: Q.avatar, initial: initialOf(quote.name || quote.handle), font: fontOf(700, 12, family), fill: palette.well, ink: palette.soft });
  let at = x + Q.pad + Q.avatar + 8;
  const nameFont = fontOf(700, Q.name, family);
  const softFont = fontOf(400, Q.name, family);
  const tail = [quote.handle ? `@${quote.handle}` : '', quote.date].filter(Boolean).join(' · ');
  const tailWidth = tail ? measure(tail, softFont) : 0;
  const room = Math.max(60, inner - Q.avatar - 8 - (quote.badge ? Q.name + 4 : 0) - (tail ? Math.min(tailWidth, inner * 0.45) + 8 : 0));
  const name = ellipsize(quote.name || '', room, (value) => measure(value, nameFont));
  if (name) {
    ops.push({ op: 'text', text: name, x: at, y: mid, font: nameFont, color: palette.ink });
    at += measure(name, nameFont) + 4;
  }
  if (quote.badge) {
    ops.push({ op: 'badge', key: quote.badge, x: at, y: mid - Q.name / 2, size: Q.name });
    at += Q.name + 4;
  }
  if (tail) {
    const left = x + width - Q.pad - at - 4;
    ops.push({ op: 'text', text: ellipsize(tail, left, (value) => measure(value, softFont)), x: at + 4, y: mid, font: softFont, color: palette.soft });
  }
  cursor += Q.avatar;

  if (lengthOf(quote.runs)) {
    const font = fontOf(400, Q.body, family);
    const lead = Math.round(Q.body * M.leading);
    const gauge = (text) => measure(text, font);
    const { lines } = clamp(wrap(quote.runs, inner, gauge), Q.lines, inner, gauge);
    cursor += 10;
    for (const line of lines) {
      ops.push(lineOp(line, x + Q.pad, cursor + lead / 2, font, palette));
      cursor += lead;
    }
  }

  if (quote.media?.length) {
    cursor += Q.mediaTop;
    const ring = 1;
    const block = mediaOps(quote.media, x + ring, cursor, width - ring * 2, env, {
      center: true,
      frame: false,
      square: Q.tallest,
      corners: [0, 0, Q.radius - ring, Q.radius - ring],
    });
    ops.push(...block.ops);
    cursor += block.height + ring;
  } else {
    cursor += Q.pad;
  }

  ops.unshift({ op: 'frame', x, y, w: width, h: cursor - y, r: Q.radius, stroke: palette.rule });
  return { ops, height: cursor - y };
}

export function initialOf(name) {
  const letter = Array.from(String(name || '').replace(/^@/, '').trim())[0];
  return letter ? letter.toLocaleUpperCase() : '';
}

export function compose(post, env) {
  const palette = paletteOf(env.theme);
  const family = env.family;
  const measure = env.measure;
  const ctx = { ...env, palette };
  const ops = [];

  const x0 = M.margin + M.pad;
  const width = WIDTH - x0 * 2;
  let y = M.margin + M.pad;

  ops.push({ op: 'avatar', key: post.avatar, x: x0, y, size: M.avatar, initial: initialOf(post.name || post.handle), font: fontOf(700, 28, family), fill: palette.well, ink: palette.soft });

  let pillWidth = 0;
  if (post.translated) {
    const font = fontOf(400, M.pill.size, family);
    const { from, to } = post.translated;
    const text = from ? `${from} → ${to}` : `→ ${to}`;
    pillWidth = Math.round(measure(text, font) + M.pill.padX * 2);
    const top = y + (M.avatar - M.pill.height) / 2;
    ops.push({ op: 'pill', x: x0 + width - pillWidth, y: top, w: pillWidth, h: M.pill.height, text, font, color: palette.soft });
  }

  const textX = x0 + M.avatar + M.headGap;
  const nameFont = fontOf(700, M.name, family);
  const handleFont = fontOf(400, M.handle, family);
  const room = width - M.avatar - M.headGap - (pillWidth ? pillWidth + 16 : 0);
  const nameMid = y + 17;
  const handleMid = y + 47;
  const name = ellipsize(post.name || post.handle || '', room - (post.badge ? M.badge + M.badgeGap : 0), (value) => measure(value, nameFont));
  ops.push({ op: 'text', text: name, x: textX, y: nameMid, font: nameFont, color: palette.ink });
  if (post.badge) {
    ops.push({ op: 'badge', key: post.badge, x: textX + measure(name, nameFont) + M.badgeGap, y: nameMid - M.badge / 2 + 1, size: M.badge });
  }
  if (post.handle) {
    const handle = ellipsize(`@${post.handle}`, room, (value) => measure(value, handleFont));
    ops.push({ op: 'text', text: handle, x: textX, y: handleMid, font: handleFont, color: palette.soft });
  }
  y += M.avatar;

  if (lengthOf(post.runs)) {
    const size = bodySize(lengthOf(post.runs));
    const font = fontOf(400, size, family);
    const lead = Math.round(size * M.leading);
    const gauge = (text) => measure(text, font);
    const most = Math.max(4, Math.floor((M.maxHeight - 600) / lead));
    const { lines } = clamp(wrap(post.runs, width, gauge), most, width, gauge);
    y += M.bodyTop - 4;
    for (const line of lines) {
      ops.push(lineOp(line, x0, y + lead / 2, font, palette));
      y += lead;
    }
  }

  if (post.media?.length) {
    y += M.mediaTop;
    const block = mediaOps(post.media, x0, y, width, ctx);
    ops.push(...block.ops);
    y += block.height;
  } else if (post.card) {
    const block = cardOps(post.card, x0, y + M.mediaTop, width, ctx);
    if (block.height) {
      ops.push(...block.ops);
      y += M.mediaTop + block.height;
    }
  }
  if (post.quote) {
    const date = shortDateOf(post.quote.at, env.locale, env.now);
    const block = quoteOps({ ...post.quote, date }, x0, y + M.quote.top, width, ctx);
    ops.push(...block.ops);
    y += M.quote.top + block.height;
  }

  const stamp = stampOf(post.at, env.locale);
  const views = viewsOf(post.views, env.locale);
  const soft = fontOf(400, M.foot, family);
  const strong = fontOf(700, M.foot, family);
  const parts = [];
  if (stamp) parts.push({ text: `${stamp.time} · ${stamp.date}`, font: soft, color: palette.soft });
  if (views) {
    if (parts.length) parts.push({ text: ' · ', font: soft, color: palette.soft });
    parts.push({ text: views.text, font: strong, color: palette.ink });
    parts.push({ text: ` ${t('shot.views', { n: views.n })}`, font: soft, color: palette.soft });
  }
  const footWidth = parts.reduce((sum, part) => sum + measure(part.text, part.font), 0);

  const sign = String(post.sign || '').trim();
  let pill = null;
  if (sign) {
    const font = fontOf(400, M.pill.size, family);
    const text = ellipsize(sign, width - M.pill.padX * 2, (value) => measure(value, font));
    pill = { text, font, w: Math.round(measure(text, font) + M.pill.padX * 2) };
  }
  const together = Boolean(pill && parts.length && footWidth + M.signGap + pill.w <= width);
  const putPill = (top) => ops.push({
    op: 'pill', x: x0 + width - pill.w, y: top, w: pill.w, h: M.pill.height,
    text: pill.text, font: pill.font, color: palette.sign.ink, fill: palette.sign.fill,
  });

  if (parts.length) {
    y += M.footTop;
    const row = together ? Math.max(Math.round(M.foot * 1.3), M.pill.height) : Math.round(M.foot * 1.3);
    const mid = y + row / 2;
    let x = x0;
    for (const part of parts) {
      ops.push({ op: 'text', text: part.text, x, y: mid, font: part.font, color: part.color });
      x += measure(part.text, part.font);
    }
    if (together) putPill(mid - M.pill.height / 2);
    y += row;
  }
  if (pill && !together) {
    y += parts.length ? M.signTop : M.footTop;
    putPill(y);
    y += M.pill.height;
  }

  y += M.pad;
  const height = Math.round(y + M.margin);
  ops.unshift({ op: 'card', x: M.margin, y: M.margin, w: WIDTH - M.margin * 2, h: y - M.margin, r: M.radius, fill: palette.paper, stroke: palette.rule, line: M.ring });

  return { width: WIDTH, height, scale: SCALE, paper: palette.paper, ops };
}
