import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/icons');
const SIZES = [16, 32, 48, 128];

const BLACK = [0x00, 0x00, 0x00];
const WHITE = [0xff, 0xff, 0xff];
const BLUE = [0x17, 0x17, 0xff];
const BLUE_DEEP = [0x00, 0x00, 0xc8];
const BLUE_WASH = [0xdc, 0xdc, 0xff];

const MARKS = {
  idle: [
    'bbbbbbbbbbbb',
    'obbbbbbbbbbo',
    'oobbbbbbbboo',
    'ooobbbbbbooo',
    'oooobbbboooo',
    'ooobbbbbbooo',
    'oobbbooobboo',
    'obbbboobbbbo',
    'bbbbbbbbbbbb',
  ],
  focus: [
    'oooobbbboooo',
    'oobboooobboo',
    'oboooooooobo',
    'obooobbooobo',
    'obooobbooobo',
    'obooobbooobo',
    'oboooooooobo',
    'oobboooobboo',
    'oooobbbboooo',
  ],
  rest: [
    'oooboobooboo',
    'oobooboobooo',
    'oooooooooooo',
    'bbbbbbbbbooo',
    'bbbbbbbbbooo',
    'booooooobbbb',
    'boooooooboob',
    'booooooobbbb',
    'obbbbbbbbooo',
  ],
  long: [
    'oooobbbboooo',
    'oobbbboobboo',
    'obbbbbooobbo',
    'bbbbbooooooo',
    'bbbbbooooooo',
    'bbbbbooooooo',
    'obbbbbooobbo',
    'oobbbboobboo',
    'oooobbbboooo',
  ],
};

const SKINS = {
  idle: { paper: WHITE, ink: BLUE, title: BLUE },
  focus: { paper: BLUE, ink: WHITE, title: BLUE_DEEP },
  rest: { paper: BLUE_WASH, ink: BLUE, title: BLUE },
  long: { paper: BLUE_WASH, ink: BLUE, title: BLUE },
};

function windowArt(mark) {
  const inner = MARKS[mark];
  return [
    '################',
    '#tttttttttttttt#',
    '#tttttttttttttt#',
    '################',
    '#oooooooooooooo#',
    ...inner.map((row) => `#o${row}o#`),
    '#oooooooooooooo#',
    '################',
  ];
}

function renderIcon(size, mark) {
  const art = windowArt(mark);
  const skin = SKINS[mark];
  const colors = { '#': BLACK, o: skin.paper, b: skin.ink, t: skin.title };
  const cell = size / art.length;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const symbol = art[Math.floor(y / cell)][Math.floor(x / cell)];
      const color = colors[symbol];
      if (!color) continue;
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function writeIcons(dir) {
  await mkdir(dir, { recursive: true });
  let written = 0;
  for (const size of SIZES) {
    await writeFile(path.join(dir, `${size}.png`), encodePng(size, renderIcon(size, 'idle')));
    written += 1;
    for (const mark of ['focus', 'rest', 'long']) {
      await writeFile(
        path.join(dir, `${mark}-${size}.png`),
        encodePng(size, renderIcon(size, mark)),
      );
      written += 1;
    }
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeIcons(OUT);
  console.log(`tempo: иконки собраны — 4 состояния × ${SIZES.length} размера`);
}
