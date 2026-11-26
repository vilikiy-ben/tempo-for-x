export const TINTS = [
  { id: 'ruby', paper: '#A50E2D', ink: '#FFF1F3', soft: '#F9C8D1' },
  { id: 'orange', paper: '#C2410C', ink: '#FFFFFF', soft: '#FFE4D6', bright: true },
  { id: 'amber', paper: '#C27803', ink: '#FFFFFF', soft: '#FFF4E0', bright: true },
  { id: 'emerald', paper: '#0F3A2E', ink: '#EAF4EE', soft: '#A3C8B6' },
  { id: 'teal', paper: '#0E7490', ink: '#FFFFFF', soft: '#CFEFF5', bright: true },
  { id: 'violet', paper: '#5B21B6', ink: '#F6F0FF', soft: '#D3C2F5' },
];

const channelsOf = (hex) => hex.slice(1).match(/../g).map((part) => parseInt(part, 16));
const hexOf = (rgb) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

export function mix(a, b, amount) {
  const from = channelsOf(a);
  const to = channelsOf(b);
  return hexOf(from.map((value, at) => value + (to[at] - value) * amount));
}

export function luminance(hex) {
  const [r, g, b] = channelsOf(hex).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function tintPalette(tint) {
  return {
    paper: tint.paper,
    ink: tint.ink,
    soft: tint.soft,
    link: toneOf(tint.paper, linkFloor(tint)),
    rule: mix(tint.paper, tint.ink, tint.bright ? 0.4 : 0.2),
    well: mix(tint.paper, tint.ink, 0.08),
    sign: { fill: tint.ink, ink: tint.paper },
  };
}

export const linkFloor = (tint) => (tint.bright ? 3 : 4.5);

function toneOf(paper, floor) {
  const hue = hueOf(paper);
  for (let light = 0.75; light < 0.97; light += 0.01) {
    const tone = fromHsl(hue, 0.6, light);
    if (contrast(tone, paper) >= floor) return tone;
  }
  return '#FFFFFF';
}

function hueOf(hex) {
  const [r, g, b] = channelsOf(hex).map((value) => value / 255);
  const high = Math.max(r, g, b);
  const span = high - Math.min(r, g, b);
  if (!span) return 0;
  const sector = high === r ? ((g - b) / span) % 6 : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return (sector * 60 + 360) % 360;
}

function fromHsl(hue, saturation, light) {
  const chroma = (1 - Math.abs(2 * light - 1)) * saturation;
  const at = (n) => {
    const k = (n + hue / 30) % 12;
    return light - chroma / 2 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return hexOf([at(0), at(8), at(4)].map((value) => value * 255));
}

const BY_ID = new Map(TINTS.map((tint) => [tint.id, tint]));

export function tintById(id) {
  const tint = BY_ID.get(id);
  return tint ? tintPalette(tint) : null;
}

export function createDeck(ids, random = Math.random) {
  let bag = [];
  let last = null;
  return {
    next() {
      if (!bag.length) {
        bag = ids.slice();
        for (let at = bag.length - 1; at > 0; at -= 1) {
          const pick = Math.floor(random() * (at + 1));
          [bag[at], bag[pick]] = [bag[pick], bag[at]];
        }
        if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
      last = bag.pop();
      return last;
    },
  };
}
