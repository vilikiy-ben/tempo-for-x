export const THEMES = ['auto', 'light', 'dark'];

const DARK_BELOW = 0.5;

export function luminanceOf(color) {
  const text = String(color || '').trim();
  if (!text) return null;

  let rgb = null;
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? [...hex[1]].map((c) => c + c) : hex[1].match(/../g);
    rgb = raw.map((part) => parseInt(part, 16));
  } else {
    const numbers = (text.match(/[\d.]+/g) || []).map(Number);
    if (numbers.length >= 3) {
      if (numbers.length >= 4 && numbers[3] === 0) return null;
      const scale = Math.max(numbers[0], numbers[1], numbers[2]) > 1 ? 255 : 1;
      rgb = numbers.slice(0, 3).map((value) => (value / scale) * 255);
    }
  }
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function isDarkColor(color) {
  const light = luminanceOf(color);
  return light === null ? null : light < DARK_BELOW;
}

export function resolveTheme(setting, { page = null, system = false } = {}) {
  if (setting === 'light' || setting === 'dark') return setting;
  if (page !== null) return page ? 'dark' : 'light';
  return system ? 'dark' : 'light';
}
