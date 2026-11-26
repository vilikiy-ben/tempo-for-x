import { LOOK } from './fold.js';
import * as plaque from './plaque.js';
import * as stack from './stack.js';

const STATE = {
  [LOOK.full]: null,
  [LOOK.open]: 'expanded',
  [LOOK.plaque]: 'collapsed',
  [LOOK.head]: 'collapsed',
  [LOOK.headOpen]: 'collapsed',
  [LOOK.hidden]: 'stacked',
};

const HEAD = { [LOOK.head]: 'closed', [LOOK.headOpen]: 'open' };

export function read(cell) {
  const state = cell.dataset.tempoState;
  if (!state) return LOOK.full;
  if (state === 'expanded') return LOOK.open;
  if (state === 'stacked') return LOOK.hidden;
  if (cell.dataset.tempoHead && stack.has(cell)) {
    return cell.dataset.tempoHead === 'open' ? LOOK.headOpen : LOOK.head;
  }
  return LOOK.plaque;
}

function set(cell, key, value) {
  if (value === null) {
    if (key in cell.dataset) delete cell.dataset[key];
  } else if (cell.dataset[key] !== value) {
    cell.dataset[key] = value;
  }
}

export function paint(cell, look) {
  set(cell, 'tempoState', STATE[look]);
  set(cell, 'tempoHead', HEAD[look] ?? null);
  if (look === LOOK.full) plaque.remove(cell);
  if (look !== LOOK.head && look !== LOOK.headOpen) stack.release(cell);
  plaque.speakExpanded(cell, look === LOOK.open);
  if (HEAD[look]) stack.speakOpen(cell, look === LOOK.headOpen);
}
