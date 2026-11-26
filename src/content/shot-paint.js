let probe = null;
let probeFont = '';
const widths = new Map();

export function measure(text, font) {
  const key = `${font}\u0000${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  probe ||= document.createElement('canvas').getContext('2d');
  if (probeFont !== font) {
    probe.font = font;
    probeFont = font;
  }
  const width = probe.measureText(text).width;
  if (widths.size > 20_000) widths.clear();
  widths.set(key, width);
  return width;
}

export async function fontsReady(family, sample) {
  if (!document.fonts?.load) return;
  const loads = [400, 700].map((weight) => document.fonts.load(`${weight} 20px ${family}`, sample || 'Aa'));
  const timeout = new Promise((resolve) => setTimeout(resolve, 1000));
  await Promise.race([Promise.allSettled(loads), timeout]);
  widths.clear();
}

export async function decode(urls) {
  const entries = await Promise.all(Object.entries(urls).map(async ([key, url]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    try {
      await image.decode();
      return image.naturalWidth > 0 ? [key, image] : null;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(entries.filter(Boolean));
}

export function sizesOf(images) {
  const sizes = {};
  for (const [key, image] of Object.entries(images)) sizes[key] = { w: image.naturalWidth, h: image.naturalHeight };
  return sizes;
}

function rounded(ctx, x, y, w, h, radii) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radii);
}

function cover(ctx, image, x, y, w, h) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) * (ih / iw > h / w ? 0.3 : 0.5);
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

function play(ctx, { cx, cy, r }) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = r * 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1D9BF0';
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  const side = r * 0.62;
  ctx.beginPath();
  ctx.moveTo(cx - side * 0.42, cy - side * 0.6);
  ctx.lineTo(cx + side * 0.62, cy);
  ctx.lineTo(cx - side * 0.42, cy + side * 0.6);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

function chip(ctx, { text, x, y, font }) {
  ctx.font = font;
  const size = Number(font.match(/(\d+)px/)?.[1] || 14);
  const padX = size * 0.4;
  const h = size * 1.45;
  const w = ctx.measureText(text).width + padX * 2;
  rounded(ctx, x, y - h, w, h, size * 0.3);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + padX, y - h / 2);
}

export function paint(scene, images) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.width * scene.scale);
  canvas.height = Math.round(scene.height * scene.scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scene.scale, scene.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = scene.paper;
  ctx.fillRect(0, 0, scene.width, scene.height);

  for (const op of scene.ops) {
    switch (op.op) {
      case 'card': {
        rounded(ctx, op.x, op.y, op.w, op.h, op.r);
        ctx.fillStyle = op.fill;
        ctx.fill();
        const half = op.line / 2;
        rounded(ctx, op.x + half, op.y + half, op.w - op.line, op.h - op.line, op.r - half);
        ctx.lineWidth = op.line;
        ctx.strokeStyle = op.stroke;
        ctx.stroke();
        break;
      }
      case 'avatar': {
        const r = op.size / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(op.x + r, op.y + r, r, 0, Math.PI * 2);
        ctx.clip();
        const image = op.key && images[op.key];
        if (image) {
          cover(ctx, image, op.x, op.y, op.size, op.size);
        } else {
          ctx.fillStyle = op.fill;
          ctx.fillRect(op.x, op.y, op.size, op.size);
          if (op.initial) {
            ctx.font = op.font;
            ctx.fillStyle = op.ink;
            ctx.textAlign = 'center';
            ctx.fillText(op.initial, op.x + r, op.y + r + 1);
          }
        }
        ctx.restore();
        break;
      }
      case 'image': {
        ctx.save();
        rounded(ctx, op.x, op.y, op.w, op.h, op.radii);
        ctx.clip();
        const image = op.key && images[op.key];
        if (image) cover(ctx, image, op.x, op.y, op.w, op.h);
        else {
          ctx.fillStyle = op.fill;
          ctx.fillRect(op.x, op.y, op.w, op.h);
        }
        ctx.restore();
        break;
      }
      case 'frame': {
        rounded(ctx, op.x + 0.5, op.y + 0.5, op.w - 1, op.h - 1, Math.max(0, op.r - 0.5));
        ctx.lineWidth = 1;
        ctx.strokeStyle = op.stroke;
        ctx.stroke();
        break;
      }
      case 'play':
        play(ctx, op);
        break;
      case 'chip':
        chip(ctx, op);
        break;
      case 'badge': {
        const image = images[op.key];
        if (image) ctx.drawImage(image, op.x, op.y, op.size, op.size);
        break;
      }
      case 'pill': {
        if (op.fill) {
          rounded(ctx, op.x, op.y, op.w, op.h, op.h / 2);
          ctx.fillStyle = op.fill;
          ctx.fill();
        }
        ctx.font = op.font;
        ctx.fillStyle = op.color;
        ctx.textAlign = 'center';
        ctx.fillText(op.text, op.x + op.w / 2, op.y + op.h / 2 + 1);
        break;
      }
      case 'text': {
        ctx.font = op.font;
        ctx.fillStyle = op.color;
        ctx.textAlign = op.align || 'left';
        ctx.fillText(op.text, op.x, op.y);
        break;
      }
      case 'runs': {
        ctx.font = op.font;
        ctx.textAlign = 'left';
        for (const part of op.parts) {
          ctx.fillStyle = part.color;
          ctx.fillText(part.text, part.x, op.y);
        }
        break;
      }
      default:
        break;
    }
  }
  return canvas;
}

export function toPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png');
  });
}
