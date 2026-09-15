import type { Story } from "@/data/stories";

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

function ping(ctx: AudioContext, freq: number, start: number, duration: number, gainValue: number, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function rustle(ctx: AudioContext, start: number, duration: number, gainValue: number, frequency: number) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(start);
  src.stop(start + duration);
}

export function playPictureSfx(tone: Story["tone"]) {
  const ctx = audioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  switch (tone) {
    case "bell":
      ping(ctx, 784, t0, 0.42, 0.07);
      ping(ctx, 1176, t0 + 0.02, 0.32, 0.045);
      break;
    case "bamboo":
      ping(ctx, 196, t0, 0.08, 0.06, "triangle");
      ping(ctx, 262, t0 + 0.07, 0.09, 0.05, "triangle");
      break;
    case "wheat":
      rustle(ctx, t0, 0.16, 0.05, 1400);
      break;
    case "pasture":
      ping(ctx, 988, t0, 0.12, 0.05);
      ping(ctx, 1318, t0 + 0.08, 0.1, 0.04);
      break;
    case "well":
      ping(ctx, 392, t0, 0.22, 0.06);
      ping(ctx, 196, t0 + 0.04, 0.28, 0.05);
      break;
    case "temple":
      ping(ctx, 196, t0, 0.18, 0.06, "triangle");
      ping(ctx, 392, t0 + 0.03, 0.3, 0.035);
      break;
  }
}

export function playTurnSfx() {
  const ctx = audioContext();
  if (!ctx) return;
  rustle(ctx, ctx.currentTime + 0.01, 0.09, 0.035, 1700);
}
