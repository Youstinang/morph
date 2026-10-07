"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventBus } from "@/events/bus";
import { createCuePlanner, type Mood, moodAfter } from "./cues";
import { createSynth, type Synth } from "./synth";

/**
 * Sound starts muted; the first click on the toggle creates the audio engine, as browsers require. Once on, the background
 * music follows the team (waiting, at work, settled on the answer) under the short event cues.
 */
export function useSound(bus: EventBus) {
  const synth = useRef<Synth | null>(null);
  const [on, setOn] = useState(false);

  /** Turning sound on answers with a short tone, so a quiet deck doesn't look broken. */
  const toggle = useCallback(() => {
    synth.current ??= createSynth();
    if (!on) synth.current?.play("transfer");
    setOn(!on);
  }, [on]);

  const mood = useRef<Mood>("waiting");
  useEffect(
    () =>
      bus.subscribe((event) => {
        const next = moodAfter(mood.current, event);
        if (next === mood.current) return;
        mood.current = next;
        if (on) synth.current?.setMood(next);
      }),
    [on, bus],
  );

  useEffect(() => {
    if (!on) {
      synth.current?.pause();
      return;
    }
    synth.current?.resume();
    synth.current?.setMood(mood.current);
    const planner = createCuePlanner();
    const unsubscribe = bus.subscribe((event) => {
      if (document.visibilityState !== "visible") return;
      const cue = planner.plan(event, performance.now());
      if (cue) synth.current?.play(cue);
    });
    const onVisibility = () => (document.visibilityState === "visible" ? synth.current?.resume() : synth.current?.pause());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [on, bus]);

  useEffect(() => {
    const engine = synth;
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  return { on, toggle };
}
