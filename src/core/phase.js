import { t } from './i18n.js';

export const PHASE = {
  idle: {
    id: 'idle',
    key: 'phase.idle',
    glyph: 'hourglass',
    tone: 'idle',
  },
  focus: {
    id: 'focus',
    key: 'phase.focus',
    glyph: 'target',
    tone: 'focus',
  },
  short: {
    id: 'short',
    key: 'phase.short',
    glyph: 'cup',
    tone: 'rest',
  },
  long: {
    id: 'long',
    key: 'phase.long',
    glyph: 'moon',
    tone: 'rest',
  },
};

export function phaseTitle(id) {
  return t(phaseOf(id).key);
}

export function idleState() {
  return { phase: 'idle', endsAt: null, leftMs: null, cyclesDone: 0 };
}

export function phaseOf(id) {
  return PHASE[id] || PHASE.idle;
}

export function phaseLength(id, pomodoro) {
  if (id === 'focus') return pomodoro.focus;
  if (id === 'long') return pomodoro.longBreak;
  if (id === 'short') return pomodoro.shortBreak;
  return 0;
}

export function lengthField(id) {
  if (id === 'focus') return 'focus';
  if (id === 'long') return 'longBreak';
  return 'shortBreak';
}

export function lengthsFor(focusSeconds) {
  const minutes = Math.max(1, Math.round(focusSeconds / 60));
  return {
    focus: minutes * 60,
    shortBreak: Math.max(1, Math.round(minutes / 5)) * 60,
    longBreak: Math.max(5, Math.round((minutes * 3) / 5)) * 60,
  };
}

export function breakAfter(cyclesDone, cycle) {
  const size = Math.max(1, cycle || 1);
  return cyclesDone % size === 0 ? 'long' : 'short';
}

export function advance(state, pomodoro) {
  const from = state.phase;
  const at = state.endsAt || Date.now();

  if (from === 'focus') {
    const cyclesDone = (state.cyclesDone || 0) + 1;
    const to = breakAfter(cyclesDone, pomodoro.cycle);
    return {
      from,
      to,
      counted: true,
      state: {
        phase: to,
        endsAt: at + phaseLength(to, pomodoro) * 1000,
        leftMs: null,
        cyclesDone,
      },
    };
  }

  if (from === 'short' || from === 'long') {
    return {
      from,
      to: 'idle',
      counted: false,
      state: { ...idleState(), cyclesDone: from === 'long' ? 0 : state.cyclesDone || 0 },
    };
  }

  return null;
}

export function reconcile(state, pomodoro, now = Date.now()) {
  let current = state;
  const completed = [];
  let changed = false;

  for (let step = 0; step < 100; step += 1) {
    if (!current.endsAt || current.endsAt > now) break;
    const finishedAt = current.endsAt;
    const move = advance(current, pomodoro);
    if (!move) break;
    current = move.state;
    if (move.counted) completed.push(finishedAt);
    changed = true;
  }

  return { state: current, completed, changed };
}

export function describeTimer(state, pomodoro, now = Date.now()) {
  const id = state?.phase && PHASE[state.phase] ? state.phase : 'idle';
  const phase = PHASE[id];
  const running = Boolean(state?.endsAt);
  const paused = !running && state?.leftMs != null;
  const idle = id === 'idle';

  const totalSeconds = phaseLength(id, pomodoro);
  const leftMs = running ? Math.max(0, state.endsAt - now) : Math.max(0, state?.leftMs || 0);
  const leftSeconds = idle ? 0 : leftMs / 1000;
  const progress = idle || !totalSeconds ? 0 : Math.min(1, 1 - leftSeconds / totalSeconds);

  const size = Math.max(1, pomodoro.cycle || 1);
  const done = id === 'long' ? size : (state?.cyclesDone || 0) % size;

  return {
    id,
    title: t(phase.key),
    glyph: paused ? 'hold' : phase.glyph,
    tone: paused ? 'paused' : phase.tone,
    running,
    paused,
    idle,
    leftMs,
    leftSeconds,
    totalSeconds,
    progress,
    cycle: { done, size, running: id === 'focus' },
  };
}
