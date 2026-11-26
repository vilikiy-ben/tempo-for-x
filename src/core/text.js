import { locale } from './i18n.js';

const LIMIT = 140;

export function plural(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function firstLine(raw, limit = LIMIT) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;

  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  const head = space > limit / 2 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s,.;:—-]+$/, '')}…`;
}

export function compactCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  const number = value;
  if (number < 1000) return String(Math.round(number));

  const short = (divider, unit) => {
    const scaled = number / divider;
    const text =
      scaled < 100
        ? new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(Number(scaled.toFixed(1)))
        : String(Math.round(scaled));
    return `${text}${unit}`;
  };
  if (number < 999_500) return short(1000, 'K');
  return short(1_000_000, 'M');
}
