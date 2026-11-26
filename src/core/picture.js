export const MAX_SIDE = 1568;
export const MIN_SIDE = 256;
export const MIN_AREA = 78_400;

export function fit(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0 && h > 0)) return null;

  const down = Math.min(1, MAX_SIDE / w, MAX_SIDE / h);
  const dw = w * down;
  const dh = h * down;

  const wanted = Math.max(1, MIN_SIDE / Math.min(dw, dh), Math.sqrt(MIN_AREA / (dw * dh)));
  const up = Math.min(wanted, MAX_SIDE / Math.max(dw, dh));
  const round = (x) => Math.min(MAX_SIDE, Math.max(1, Math.round(x)));
  const drawnW = round(dw * up);
  const drawnH = round(dh * up);

  let canvasWidth = Math.max(drawnW, MIN_SIDE);
  let canvasHeight = Math.max(drawnH, MIN_SIDE);
  if (canvasWidth * canvasHeight < MIN_AREA) {
    if (canvasWidth <= canvasHeight) canvasWidth = Math.min(MAX_SIDE, Math.ceil(MIN_AREA / canvasHeight));
    else canvasHeight = Math.min(MAX_SIDE, Math.ceil(MIN_AREA / canvasWidth));
  }

  return {
    width: drawnW,
    height: drawnH,
    canvasWidth,
    canvasHeight,
    x: Math.floor((canvasWidth - drawnW) / 2),
    y: Math.floor((canvasHeight - drawnH) / 2),
  };
}

export function acceptable(width, height) {
  return (
    width >= MIN_SIDE && height >= MIN_SIDE &&
    width <= MAX_SIDE && height <= MAX_SIDE &&
    width * height >= MIN_AREA
  );
}

export function jpegSize(bytes) {
  if (!(bytes?.[0] === 0xff && bytes[1] === 0xd8)) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: (bytes[at + 5] << 8) | bytes[at + 6],
        width: (bytes[at + 7] << 8) | bytes[at + 8],
        progressive: marker === 0xc2,
      };
    }
    at += 2 + length;
  }
  return null;
}
