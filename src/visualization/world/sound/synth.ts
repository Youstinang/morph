import type { Cue, Mood } from "./cues";

/**
 * Room tone of the US lab on the International Space Station, recorded by Cmdr Chris Hadfield (CC0, freesound.org
 * sound 172547), trimmed and crossfaded into a seamless loop.
 */
export const DECK_AMBIENCE_URL = "/sound/deck-ambience.m4a";

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
/** The room sound sits under the event sounds. */
const AMBIENT_GAIN = 0.3;
/** Seconds for the room to ease from one mood to the next. */
const MOOD_EASE = 1.6;

/** The room, how bright it sounds, and a deeper machinery layer that only runs while the team works. */
const MOOD_LEVELS: Record<Mood, { room: number; brightness: number; machinery: number }> = {
  waiting: { room: 0.6, brightness: 2600, machinery: 0 },
  working: { room: 0.8, brightness: 4500, machinery: 0.45 },
  settled: { room: 0.55, brightness: 2200, machinery: 0 },
};

export interface Synth {
  play(cue: Cue): void;
  /** Starts the room sound on first use and eases it to the team's mood. */
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
  let ambient: Ambient | null = null;
  let loading = false;
  let mood: Mood = "waiting";

  const easeTo = (target: Ambient, next: Mood) => {
    const level = MOOD_LEVELS[next];
    const now = context.currentTime;
    target.room.gain.setTargetAtTime(level.room, now, MOOD_EASE / 3);
    target.brightness.frequency.setTargetAtTime(level.brightness, now, MOOD_EASE / 3);
    target.machinery.gain.setTargetAtTime(level.machinery, now, MOOD_EASE / 3);
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
      if (ambient) easeTo(ambient, next);
      else if (!loading) {
        loading = true;
        void loadAmbient(context, limiter)
          .then((loaded) => {
            ambient = loaded;
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

interface Ambient {
  room: GainNode;
  brightness: BiquadFilterNode;
  machinery: GainNode;
}

/** The recorded room loops forever; a slowed, darker copy of it is the machinery that picks up while the team works. */
async function loadAmbient(context: AudioContext, output: AudioNode): Promise<Ambient | null> {
  const response = await fetch(DECK_AMBIENCE_URL);
  if (!response.ok) return null;
  const recording = await context.decodeAudioData(await response.arrayBuffer());
  if (context.state === "closed") return null;

  const ambient = context.createGain();
  ambient.gain.value = AMBIENT_GAIN;
  ambient.connect(output);

  const loop = (rate: number, offset: number, into: AudioNode) => {
    const source = context.createBufferSource();
    source.buffer = recording;
    source.loop = true;
    source.playbackRate.value = rate;
    source.connect(into);
    source.start(0, offset);
  };

  const room = context.createGain();
  room.gain.value = 0;
  const brightness = context.createBiquadFilter();
  brightness.type = "lowpass";
  brightness.frequency.value = MOOD_LEVELS.waiting.brightness;
  brightness.connect(room).connect(ambient);
  loop(1, 0, brightness);

  const machinery = context.createGain();
  machinery.gain.value = 0;
  const rumble = context.createBiquadFilter();
  rumble.type = "lowpass";
  rumble.frequency.value = 520;
  rumble.connect(machinery).connect(ambient);
  loop(0.62, recording.duration / 2, rumble);

  return { room, brightness, machinery };
}
