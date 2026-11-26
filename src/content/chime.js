const TUNES = {
  rest: [880.0, 659.25],
  work: [659.25, 880.0],
};

const STEP = 0.16;
const HOLD = 0.5;
const PEAK = 0.16;

let context = null;

export function prime() {
  if (context) {
    if (context.state === 'suspended') context.resume().catch(() => {});
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
}

export function listenForGesture(wanted) {
  const wake = () => {
    if (wanted()) prime();
  };
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, wake, { capture: true, passive: true });
  }
}

function note(at, frequency) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(PEAK, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + HOLD);
  gain.connect(context.destination);

  for (const [ratio, level] of [[1, 1], [2, 0.22]]) {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency * ratio, at);
    const mix = context.createGain();
    mix.gain.setValueAtTime(level, at);
    osc.connect(mix).connect(gain);
    osc.start(at);
    osc.stop(at + HOLD + 0.05);
  }
}

export async function play(kind) {
  prime();
  if (!context) return false;
  if (context.state === 'suspended') {
    await context.resume().catch(() => {});
  }
  if (context.state !== 'running') return false;

  const tune = TUNES[kind] || TUNES.work;
  const at = context.currentTime + 0.02;
  tune.forEach((frequency, index) => note(at + index * STEP, frequency));
  return true;
}
