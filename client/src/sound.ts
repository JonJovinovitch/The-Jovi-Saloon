/**
 * Synthesised table sounds.
 *
 * Generated with WebAudio rather than shipped as files: an activity that is
 * one HTML bundle loads instantly, and there is nothing to 404 behind
 * Discord's proxy.
 */

let ctx: AudioContext | null = null;
let enabled = localStorage.getItem('poker.sound') !== 'off';

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Browsers only allow audio after a gesture; call this from the first click. */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.state === 'suspended') void a.resume();
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  localStorage.setItem('poker.sound', on ? 'on' : 'off');
}

export function soundEnabled(): boolean {
  return enabled;
}

/** Short filtered noise burst — card slides, chip clicks. */
function noise(duration: number, freq: number, q: number, gain: number, delay = 0): void {
  const a = audio();
  if (!a) return;
  const frames = Math.max(1, Math.floor(a.sampleRate * duration));
  const buf = a.createBuffer(1, frames, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(a.currentTime + delay);
}

function tone(freq: number, duration: number, gain = 0.08, delay = 0, type: OscillatorType = 'sine'): void {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + delay;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sfx = {
  deal(): void {
    noise(0.09, 2600, 0.9, 0.18);
  },
  shuffle(): void {
    for (let i = 0; i < 7; i++) noise(0.05, 1800 + Math.random() * 1600, 1.2, 0.07, i * 0.035);
  },
  chips(): void {
    for (let i = 0; i < 3; i++) noise(0.05, 4200 + Math.random() * 1800, 6, 0.09, i * 0.035);
  },
  check(): void {
    noise(0.06, 320, 2, 0.22);
  },
  fold(): void {
    noise(0.16, 900, 0.6, 0.12);
  },
  win(): void {
    tone(660, 0.22, 0.06, 0);
    tone(880, 0.28, 0.055, 0.09);
    tone(1320, 0.4, 0.04, 0.18);
  },
  turn(): void {
    tone(880, 0.12, 0.05);
    tone(1180, 0.14, 0.04, 0.1);
  },
};
