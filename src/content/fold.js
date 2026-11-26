export const LOOK = Object.freeze({
  full: 'full',
  open: 'open',
  plaque: 'plaque',
  head: 'head',
  headOpen: 'headOpen',
  hidden: 'hidden',
});

const TIER = {
  full: 'post',
  open: 'post+1',
  plaque: 1,
  head: 1,
  headOpen: 2,
  hidden: 0,
};

const FOLDED = new Set([LOOK.plaque, LOOK.head, LOOK.headOpen, LOOK.hidden]);

export function folded(look) {
  return FOLDED.has(look);
}

export function reshapes(from, to) {
  return TIER[from] !== TIER[to];
}

export const STACK_MIN = 5;

export function plan(cells, { isOpen = () => false, min = STACK_MIN } = {}) {
  const out = cells.map((cell) => ({ look: cell.look, group: cell.kind === 'tweet' ? cell.group ?? null : null }));
  const can = (cell, look) => !cell.still || !reshapes(cell.look, look);

  const intent = cells.map((cell) => {
    if (cell.kind !== 'tweet') return cell.kind;
    return intentOf(cell, can);
  });

  for (let i = 0; i < cells.length; i += 1) {
    if (intent[i] === LOOK.full || intent[i] === LOOK.open) {
      out[i] = { look: can(cells[i], intent[i]) ? intent[i] : cells[i].look, group: null };
    }
  }

  for (const run of runsOf(intent)) {
    let at = 0;
    while (at < run.length) at = segment(run, at, { cells, out, can, isOpen, min });
  }
  return out;
}

function intentOf(cell, can) {
  const keep = () => (folded(cell.look) ? 'fold' : cell.look);
  if (!cell.hide) return can(cell, LOOK.full) ? LOOK.full : keep();
  if (cell.hand) return can(cell, LOOK.open) ? LOOK.open : keep();
  if (!cell.reached && !folded(cell.look)) return cell.look;
  if (folded(cell.look)) return 'fold';
  return can(cell, LOOK.plaque) ? 'fold' : cell.look;
}

function runsOf(intent) {
  const runs = [];
  let run = [];
  intent.forEach((what, index) => {
    if (what === 'fold') {
      run.push(index);
      return;
    }
    if (what === 'clear') return;
    if (run.length) runs.push(run);
    run = [];
  });
  if (run.length) runs.push(run);
  return runs;
}

function segment(run, at, { cells, out, can, isOpen, min }) {
  const headIndex = run[at];
  const head = cells[headIndex];

  if (head.look === LOOK.hidden && head.still) {
    let end = at;
    while (end < run.length && cells[run[end]].look === LOOK.hidden && cells[run[end]].still) {
      out[run[end]] = { look: LOOK.hidden, group: cells[run[end]].group ?? null };
      end += 1;
    }
    return end;
  }

  const gather = (look) => {
    const found = [];
    for (let next = at + 1; next < run.length; next += 1) {
      if (!can(cells[run[next]], look)) break;
      found.push(run[next]);
    }
    return found;
  };

  let group = head.group ?? null;
  let members = gather(LOOK.hidden);
  if (!group) group = members.map((index) => cells[index].group).find(Boolean) ?? null;
  const open = Boolean(group) && isOpen(group);
  const memberLook = open ? LOOK.plaque : LOOK.hidden;
  if (open) members = gather(memberLook);
  const whole = [headIndex, ...members];

  const kept = Boolean(group) && members.length > 0 &&
    members.every((index) => cells[index].look === memberLook) &&
    (!open || head.look === LOOK.headOpen);
  const stacked = whole.length >= min || kept;

  if (!stacked) {
    const blocked = whole.findIndex((index) => !can(cells[index], LOOK.plaque));
    const loose = blocked < 0 ? whole : whole.slice(0, Math.max(1, blocked));
    for (const index of loose) {
      const cell = cells[index];
      out[index] = { look: can(cell, LOOK.plaque) ? LOOK.plaque : cell.look, group: cell.group ?? null };
    }
    return at + loose.length;
  }

  group = group ?? head.key;
  const headLook = open ? LOOK.headOpen : LOOK.head;
  out[headIndex] = {
    look: can(head, headLook) ? headLook : head.look,
    group,
    count: whole.length,
    members: whole,
  };
  for (const index of members) out[index] = { look: memberLook, group };
  return at + whole.length;
}

export function deferred(cells, placed, options) {
  const ideal = plan(cells.map((cell) => ({ ...cell, still: false })), options);
  const waiting = [];
  ideal.forEach((want, index) => {
    if (want.look !== placed[index].look) waiting.push(index);
  });
  return waiting;
}

export function pace(cells, placed, above, { busy = false } = {}) {
  const reshaping = [];
  cells.forEach((cell, index) => {
    if (cell.kind === 'tweet' && reshapes(cell.look, placed[index].look)) reshaping.push(index);
  });
  const up = reshaping.filter((index) => above[index]);
  let now;
  if (!up.length) now = reshaping;
  else if (busy) now = reshaping.filter((index) => !above[index]);
  else now = [up[up.length - 1]];
  return { now: new Set(now), held: reshaping.length - now.length };
}
