import type { Cue, Mood } from "./cues";

interface Note {
  /** Hz; `glideTo` slides the pitch over the note. */
  pitch: number;
  glideTo?: number;
  /** Seconds after the cue starts. */
  at: number;
  /** Seconds to fade in and the total length. */
  attack: number;
  length: number;
  gain: number;
  wave: OscillatorType;
}

const D3 = 146.83;
const A3 = 220;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const FS4 = 369.99;
const A4 = 440;
const D5 = 587.33;
const FS5 = 739.99;

const soft = (pitch: number, at: number, length: number, gain: number, attack = 0.02): Note => ({ pitch, at, attack, length, gain, wave: "sine" });

/** Every cue is a few soft notes in D major, under two seconds, with slow fades; no clicks or alarms. */
const VOICES: Record<Cue, Note[]> = {
  core: [soft(D4, 0, 1.4, 0.5, 0.08), soft(A4, 0.12, 1.3, 0.35, 0.08)],
  dispatch: [{ ...soft(FS5, 0, 0.3, 0.2), wave: "triangle" }],
  transfer: [soft(A4, 0, 0.35, 0.28), soft(D5, 0.14, 0.45, 0.28)],
  materialize: [soft(D3, 0, 1.2, 0.4, 0.25), soft(A3, 0.05, 1.1, 0.28, 0.25)],
  challenge: [{ ...soft(A3, 0, 0.6, 0.32, 0.03), wave: "triangle" }, { ...soft(C4, 0.04, 0.6, 0.26, 0.03), wave: "triangle" }],
  shift: [{ ...soft(E4, 0, 0.7, 0.3, 0.05), glideTo: A4 }],
  converge: [soft(D4, 0, 2, 0.32, 0.06), soft(FS4, 0.07, 1.9, 0.28, 0.06), soft(A4, 0.14, 1.8, 0.26, 0.06), soft(D5, 0.21, 1.7, 0.2, 0.06)],
};

/** Overall loudness; the cues stay well under speech level. */
const MASTER_GAIN = 0.16;
/** The background hum sits under the cues. */
const AMBIENT_GAIN = 0.025;
/** Seconds for the hum to ease from one mood to the next. */
const MOOD_EASE = 1.6;

/** Hum (a soft drone), shimmer (only while the team works) and pad (the settled answer chord). */
const MOOD_LEVELS: Record<Mood, { hum: number; brightness: number; shimmer: number; pad: number }> = {
  waiting: { hum: 0.35, brightness: 420, shimmer: 0, pad: 0 },
  working: { hum: 0.6, brightness: 950, shimmer: 0.2, pad: 0 },
  settled: { hum: 0.4, brightness: 650, shimmer: 0, pad: 0.32 },
};

export interface Synth {
  play(cue: Cue): void;
  /** Starts the background hum on first use and eases it to the team's mood. */
  setMood(mood: Mood): void;
  resume(): void;
  /** Lets the audio engine idle while muted; the next cue wakes it. */
  pause(): void;
  dispose(): void;
}

/** Must be created from a user's click: browsers only allow sound to start after one. */
export function createSynth(): Synth | null {
  const AudioContextClass = typeof window === "undefined" ? undefined : window.AudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  const tone = context.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  const limiter = context.createDynamicsCompressor();
  master.connect(tone).connect(limiter).connect(context.destination);

  let ambient: ReturnType<typeof createAmbient> | null = null;

  return {
    play(cue) {
      if (context.state === "suspended") void context.resume();
      const start = context.currentTime + 0.02;
      for (const note of VOICES[cue]) {
        const begin = start + note.at;
        const end = begin + note.length;
        const oscillator = context.createOscillator();
        oscillator.type = note.wave;
        oscillator.frequency.setValueAtTime(note.pitch, begin);
        if (note.glideTo) oscillator.frequency.exponentialRampToValueAtTime(note.glideTo, end);
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, begin);
        envelope.gain.exponentialRampToValueAtTime(note.gain, begin + note.attack);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(envelope).connect(master);
        oscillator.onended = () => {
          oscillator.disconnect();
          envelope.disconnect();
        };
        oscillator.start(begin);
        oscillator.stop(end + 0.05);
      }
    },
    setMood(mood) {
      ambient ??= createAmbient(context, limiter);
      const level = MOOD_LEVELS[mood];
      const now = context.currentTime;
      ambient.hum.gain.setTargetAtTime(level.hum, now, MOOD_EASE / 3);
      ambient.brightness.frequency.setTargetAtTime(level.brightness, now, MOOD_EASE / 3);
      ambient.shimmer.gain.setTargetAtTime(level.shimmer, now, MOOD_EASE / 3);
      ambient.pad.gain.setTargetAtTime(level.pad, now, MOOD_EASE / 3);
    },
    resume() {
      if (context.state === "suspended") void context.resume();
    },
    pause() {
      if (context.state === "running") void context.suspend();
    },
    dispose() {
      void context.close();
    },
  };
}

/** Endless soft oscillators; the mood only changes their levels, so nothing clicks or restarts. */
function createAmbient(context: AudioContext, output: AudioNode) {
  const ambient = context.createGain();
  ambient.gain.value = AMBIENT_GAIN;
  ambient.connect(output);

  const oscillator = (pitch: number, wave: OscillatorType, into: AudioNode) => {
    const node = context.createOscillator();
    node.type = wave;
    node.frequency.value = pitch;
    node.connect(into);
    node.start();
  };
  /** A layer silent until its mood calls for it, swelling slowly by `breath` so it never drones flat. */
  const layer = (breathRate: number, breath: number) => {
    const level = context.createGain();
    level.gain.value = 0;
    level.connect(ambient);
    const breathing = context.createGain();
    breathing.connect(level);
    const depth = context.createGain();
    depth.gain.value = breath;
    depth.connect(breathing.gain);
    oscillator(breathRate, "sine", depth);
    return { level, input: breathing };
  };

  const hum = layer(0.07, 0.2);
  const brightness = context.createBiquadFilter();
  brightness.type = "lowpass";
  brightness.frequency.value = MOOD_LEVELS.waiting.brightness;
  brightness.Q.value = 0.7;
  brightness.connect(hum.input);
  oscillator(D3, "triangle", brightness);
  oscillator(A3, "sine", brightness);
  oscillator(A3 * 1.003, "sine", brightness);

  const shimmer = layer(0.3, 0.5);
  oscillator(FS4, "sine", shimmer.input);
  oscillator(A4 * 1.002, "sine", shimmer.input);

  const pad = layer(0.05, 0.15);
  for (const pitch of [D4, FS4, A4]) oscillator(pitch, "sine", pad.input);

  return { hum: hum.level, brightness, shimmer: shimmer.level, pad: pad.level };
}
