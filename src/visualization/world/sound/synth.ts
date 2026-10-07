import type { Cue, Mood } from "./cues";

/**
 * "Cyberpunk Technology" (short version) by alexzavesa, from Pixabay; 15 bars from its steady middle, cut on the
 * beat and crossfaded into a seamless 45 s loop, levelled to sit under the event sounds.
 */
export const DECK_MUSIC_URL = "/sound/deck-music.m4a";

/** A short console tone; `glideTo` slides the pitch over its length. */
interface Beep {
  kind: "beep";
  pitch: number;
  glideTo?: number;
  at: number;
  attack: number;
  length: number;
  gain: number;
  wave: OscillatorType;
}

/** A burst of filtered air, like a hatch or a vent; `bandTo` sweeps the filter. */
interface Hiss {
  kind: "hiss";
  band: number;
  bandTo?: number;
  at: number;
  attack: number;
  length: number;
  gain: number;
}

const beep = (pitch: number, at: number, length: number, gain: number, more: Partial<Beep> = {}): Beep => ({
  kind: "beep",
  pitch,
  at,
  attack: 0.006,
  length,
  gain,
  wave: "sine",
  ...more,
});

/** Console sounds: soft blips, air hisses and one low chime; all short, none alarming. */
const VOICES: Record<Cue, (Beep | Hiss)[]> = {
  core: [
    { kind: "hiss", band: 400, bandTo: 2200, at: 0, attack: 0.25, length: 0.9, gain: 0.35 },
    beep(440, 0.1, 0.7, 0.18, { glideTo: 880, attack: 0.2 }),
  ],
  dispatch: [beep(1320, 0, 0.08, 0.22)],
  transfer: [beep(990, 0, 0.06, 0.2), beep(1320, 0.09, 0.07, 0.2)],
  materialize: [{ kind: "hiss", band: 3200, bandTo: 1400, at: 0, attack: 0.04, length: 0.75, gain: 0.4 }],
  challenge: [beep(220, 0, 0.1, 0.3, { wave: "triangle" }), beep(220, 0.16, 0.1, 0.3, { wave: "triangle" })],
  shift: [beep(620, 0, 0.28, 0.16, { glideTo: 930, attack: 0.03 })],
  converge: [beep(293.66, 0, 1.8, 0.32), beep(587.33, 0, 1.4, 0.14), beep(880, 0, 1, 0.06)],
};

/** Overall loudness of the event sounds; they stay well under speech level. */
const MASTER_GAIN = 0.16;
/** The music sits under the event sounds. */
const MUSIC_GAIN = 0.3;
/** Seconds for the music to ease from one mood to the next. */
const MOOD_EASE = 1.6;

/** Waiting, the music is quiet and muffled, as if from the next room; while the team works it opens up fully. */
const MOOD_LEVELS: Record<Mood, { level: number; brightness: number }> = {
  waiting: { level: 0.55, brightness: 900 },
  working: { level: 0.85, brightness: 12000 },
  settled: { level: 0.6, brightness: 2600 },
};

export interface Synth {
  play(cue: Cue): void;
  /** Starts the music on first use and eases it to the team's mood. */
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
  tone.frequency.value = 5000;
  const limiter = context.createDynamicsCompressor();
  master.connect(tone).connect(limiter).connect(context.destination);

  const air = noiseBuffer(context);
  let music: Music | null = null;
  let loading = false;
  let mood: Mood = "waiting";

  const easeTo = (target: Music, next: Mood) => {
    const level = MOOD_LEVELS[next];
    const now = context.currentTime;
    target.level.gain.setTargetAtTime(level.level, now, MOOD_EASE / 3);
    target.brightness.frequency.setTargetAtTime(level.brightness, now, MOOD_EASE / 3);
  };

  return {
    play(cue) {
      if (context.state === "suspended") void context.resume();
      const start = context.currentTime + 0.02;
      for (const voice of VOICES[cue]) {
        const begin = start + voice.at;
        const end = begin + voice.length;
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, begin);
        envelope.gain.exponentialRampToValueAtTime(voice.gain, begin + voice.attack);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        envelope.connect(master);
        const source = voice.kind === "beep" ? beepSource(context, voice, begin, end) : hissSource(context, air, voice, begin, end);
        source.output.connect(envelope);
        source.node.onended = () => {
          source.output.disconnect();
          envelope.disconnect();
        };
        source.node.start(begin);
        source.node.stop(end + 0.05);
      }
    },
    setMood(next) {
      mood = next;
      if (music) easeTo(music, next);
      else if (!loading) {
        loading = true;
        void loadMusic(context, limiter)
          .then((loaded) => {
            music = loaded;
            if (loaded) easeTo(loaded, mood);
          })
          .catch(() => undefined)
          .finally(() => (loading = false));
      }
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

function beepSource(context: AudioContext, voice: Beep, begin: number, end: number) {
  const oscillator = context.createOscillator();
  oscillator.type = voice.wave;
  oscillator.frequency.setValueAtTime(voice.pitch, begin);
  if (voice.glideTo) oscillator.frequency.exponentialRampToValueAtTime(voice.glideTo, end);
  return { node: oscillator, output: oscillator as AudioNode };
}

function hissSource(context: AudioContext, air: AudioBuffer, voice: Hiss, begin: number, end: number) {
  const source = context.createBufferSource();
  source.buffer = air;
  source.loop = true;
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(voice.band, begin);
  if (voice.bandTo) band.frequency.exponentialRampToValueAtTime(voice.bandTo, end);
  source.connect(band);
  return { node: source, output: band as AudioNode };
}

function noiseBuffer(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

interface Music {
  level: GainNode;
  brightness: BiquadFilterNode;
}

/** Below this a sample counts as silence; encoders pad the start and end of a file with a little of it. */
const SILENCE = 1e-4;

/** Where the sound really starts and ends, so the loop doesn't hiccup on the encoder's padding. */
function audibleSpan(buffer: AudioBuffer): { start: number; end: number } {
  const samples = buffer.getChannelData(0);
  let first = 0;
  let last = samples.length - 1;
  while (first < last && Math.abs(samples[first]!) < SILENCE) first += 1;
  while (last > first && Math.abs(samples[last]!) < SILENCE) last -= 1;
  return { start: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate };
}

/** The music loops forever; the mood only changes its level and how muffled it sounds. */
async function loadMusic(context: AudioContext, output: AudioNode): Promise<Music | null> {
  const response = await fetch(DECK_MUSIC_URL);
  if (!response.ok) return null;
  const track = await context.decodeAudioData(await response.arrayBuffer());
  if (context.state === "closed") return null;

  const level = context.createGain();
  level.gain.value = 0;
  const brightness = context.createBiquadFilter();
  brightness.type = "lowpass";
  brightness.frequency.value = MOOD_LEVELS.waiting.brightness;
  const master = context.createGain();
  master.gain.value = MUSIC_GAIN;
  brightness.connect(level).connect(master).connect(output);

  const span = audibleSpan(track);
  const source = context.createBufferSource();
  source.buffer = track;
  source.loop = true;
  source.loopStart = span.start;
  source.loopEnd = span.end;
  source.connect(brightness);
  source.start(0, span.start);

  return { level, brightness };
}
