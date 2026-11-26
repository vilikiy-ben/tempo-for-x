const GAP = /[^\S\n]+/;

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function graphemes(text) {
  if (segmenter) return Array.from(segmenter.segment(text), (item) => item.segment);
  return Array.from(text);
}

function atomize(runs) {
  const atoms = [];
  for (const run of runs) {
    const kind = run.kind || 'text';
    const text = String(run.text ?? '');
    for (const piece of text.split(/(\n|[^\S\n]+)/)) {
      if (!piece) continue;
      if (piece === '\n') {
        atoms.push({ type: 'break' });
      } else if (GAP.test(piece) && !piece.trim()) {
        atoms.push({ type: 'space', text: piece, kind });
      } else {
        const last = atoms[atoms.length - 1];
        if (last?.type === 'word') last.parts.push({ text: piece, kind });
        else atoms.push({ type: 'word', parts: [{ text: piece, kind }] });
      }
    }
  }
  return atoms;
}

export function wrap(runs, width, measure) {
  const lines = [];
  let parts = [];
  let used = 0;
  let pending = null;

  const push = (text, kind) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ text, kind });
  };
  const close = () => {
    lines.push(place(parts, measure));
    parts = [];
    used = 0;
    pending = null;
  };

  for (const atom of atomize(runs)) {
    if (atom.type === 'break') {
      close();
      continue;
    }
    if (atom.type === 'space') {
      if (parts.length) pending = atom;
      continue;
    }

    const wordWidth = atom.parts.reduce((sum, part) => sum + measure(part.text), 0);
    const gap = pending ? measure(pending.text) : 0;

    if (parts.length && used + gap + wordWidth <= width) {
      if (pending) push(pending.text, pending.kind);
      for (const part of atom.parts) push(part.text, part.kind);
      used += gap + wordWidth;
      pending = null;
      continue;
    }

    if (parts.length) close();
    pending = null;

    if (wordWidth <= width) {
      for (const part of atom.parts) push(part.text, part.kind);
      used = wordWidth;
      continue;
    }

    for (const part of atom.parts) {
      for (const glyph of graphemes(part.text)) {
        const step = measure(glyph);
        if (parts.length && used + step > width) close();
        push(glyph, part.kind);
        used += step;
      }
    }
  }
  close();

  while (lines.length > 1 && !lines[lines.length - 1].parts.length) lines.pop();
  return lines;
}

function place(parts, measure) {
  let x = 0;
  const placed = parts.map((part) => {
    const at = x;
    x += measure(part.text);
    return { text: part.text, kind: part.kind, x: at };
  });
  return { parts: placed, width: x };
}

export function ellipsize(text, width, measure) {
  if (measure(text) <= width) return text;
  const glyphs = graphemes(text);
  while (glyphs.length) {
    glyphs.pop();
    const candidate = `${glyphs.join('').trimEnd()}…`;
    if (measure(candidate) <= width) return candidate;
  }
  return '…';
}

export function clamp(lines, max, width, measure) {
  if (lines.length <= max) return { lines, cut: false };
  const kept = lines.slice(0, max);
  const last = kept[max - 1];
  const tail = last.parts[last.parts.length - 1];
  if (!tail) {
    kept[max - 1] = place([{ text: '…', kind: 'text' }], measure);
    return { lines: kept, cut: true };
  }
  const room = width - tail.x;
  const parts = last.parts.slice(0, -1).map(({ text, kind }) => ({ text, kind }));
  parts.push({ text: ellipsize(`${tail.text}…`, room, measure).replace(/……$/, '…'), kind: tail.kind });
  kept[max - 1] = place(parts, measure);
  return { lines: kept, cut: true };
}
