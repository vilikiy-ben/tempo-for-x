const BULLET = /^\s*(?:[-–—•*]|\d{1,2}[.)])\s+/;
const BULLET_ALONE = /^\s*(?:[-–—•*]|\d{1,2}[.)])\s*$/;

export const SECTIONS = {
  gist: ['Суть', 'Gist'],
  context: ['Контекст', 'Context'],
  how: ['Как работает', 'How it works'],
  why: ['Зачем', 'Why'],
  terms: ['Термины', 'Terms'],
  caveat: ['Осторожно', 'Caveat'],
};

const LABELS = new Map(
  Object.entries(SECTIONS).flatMap(([key, names]) => names.map((name) => [name.toLowerCase(), key])),
);
const SECTION_LINE = new RegExp(
  `^(${[...LABELS.keys()].map((name) => name.replace(/ /g, '\\s+')).join('|')})\\s*:\\s*(.*)$`,
  'i',
);

const SOURCES = 'SOURCES:';
const isSourcesLine = (line, last) =>
  line.startsWith(SOURCES) || /^Источники\s*:/.test(line) || (last && line.length >= 2 && SOURCES.startsWith(line));

export function parseAnswer(raw) {
  const blocks = [];
  let paragraph = [];
  let list = null;

  const closeParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'text', text: paragraph.join(' ') });
    paragraph = [];
  };
  const closeList = () => {
    if (list?.items.length) blocks.push(list);
    list = null;
  };

  const lines = String(raw || '').replace(/\r/g, '').split('\n');
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed && isSourcesLine(trimmed, index === lines.length - 1)) continue;
    const section = SECTION_LINE.exec(trimmed);
    if (section) {
      closeParagraph();
      closeList();
      const name = section[1].toLowerCase().replace(/\s+/g, ' ');
      const key = LABELS.get(name);
      const text = SECTIONS[key].find((item) => item.toLowerCase() === name) || section[1];
      blocks.push({ type: 'label', key, text });
      const tail = section[2].trim();
      const rest = tail && !BULLET.test(tail) ? tail[0].toUpperCase() + tail.slice(1) : tail;
      if (rest && BULLET.test(rest)) {
        list = { type: 'list', items: [rest.replace(BULLET, '').trim()] };
      } else if (rest) {
        paragraph.push(rest);
      }
      continue;
    }
    if (!trimmed) {
      closeParagraph();
      closeList();
      continue;
    }
    if (BULLET_ALONE.test(trimmed)) {
      closeParagraph();
      if (!list) list = { type: 'list', items: [] };
      continue;
    }
    if (BULLET.test(trimmed)) {
      closeParagraph();
      if (!list) list = { type: 'list', items: [] };
      list.items.push(trimmed.replace(BULLET, '').trim());
      continue;
    }
    if (list?.items.length) {
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }
  closeParagraph();
  closeList();
  return blocks;
}

export function speakAnswer(raw) {
  return parseAnswer(raw)
    .map((block) => {
      if (block.type === 'list') return `${block.items.join('; ')}.`;
      if (block.type === 'label') return `${block.text}:`;
      return block.text;
    })
    .join(' ')
    .trim();
}
