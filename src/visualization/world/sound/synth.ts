import type { Cue } from "./cues";

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

export interface Synth {
  play(cue: Cue): void;
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
    pause() {
      if (context.state === "running") void context.suspend();
    },
    dispose() {
      void context.close();
    },
  };
}
