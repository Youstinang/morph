"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventBus } from "@/events/bus";
import { createCuePlanner } from "./cues";
import { createSynth, type Synth } from "./synth";

/** Sound starts muted; the first click on the toggle creates the audio engine, as browsers require. */
export function useSound(bus: EventBus) {
  const synth = useRef<Synth | null>(null);
  const [on, setOn] = useState(false);

  const toggle = useCallback(() => {
    synth.current ??= createSynth();
    setOn((value) => !value);
  }, []);

  useEffect(() => {
    if (!on) return;
    const planner = createCuePlanner();
    return bus.subscribe((event) => {
      if (document.visibilityState !== "visible") return;
      const cue = planner.plan(event, performance.now());
      if (cue) synth.current?.play(cue);
    });
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
