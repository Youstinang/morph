"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { WorkspaceProvider } from "@/state/react";
import { AgentTags, type TagRegistry } from "./agent-tags";
import { HUD_CSS_VARS } from "./hud-layout";
import { LabHud } from "./lab-hud";
import { ReducedMotionContext, usePrefersReducedMotion } from "./motion";
import type { LabSession } from "./sim/session";
import type { AgentId, World } from "./sim/types";
import { takeSnapshot, type LabSnapshot } from "./snapshot";
import "./lab.css";

const LabScene = dynamic(() => import("./lab-scene"), {
  ssr: false,
  loading: () => <div className="lab-loading">Initializing chamber…</div>,
});

const SPEEDS = [1, 2] as const;

export function LabExperience({ createSession }: { createSession: () => LabSession }) {
  const [session] = useState(createSession);
  const worldRef = useRef<World>(session.world);
  const tags = useRef<TagRegistry>({});
  const inputAnchor = useRef<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<LabSnapshot>(() => takeSnapshot(session.world, session.bus.history()));
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [labels, setLabels] = useState(true);
  const [quality, setQuality] = useState<"high" | "balanced">("high");
  const [autoCamera, setAutoCamera] = useState(true);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const handleSnapshot = useCallback(
    (world: World) => setSnapshot(takeSnapshot(world, session.bus.history())),
    [session],
  );
  const advance = useCallback((realSeconds: number, speed: number) => session.advance(realSeconds, speed), [session]);
  const restart = useCallback(() => {
    session.restart();
    worldRef.current = session.world;
    handleSnapshot(session.world);
    setPaused(false);
  }, [session, handleSnapshot]);
  const ask = useCallback(
    (objective: string) => {
      session.startLive(objective);
      worldRef.current = session.world;
      setSelected(null);
      handleSnapshot(session.world);
      setPaused(false);
    },
    [session, handleSnapshot],
  );

  return (
    <WorkspaceProvider store={session.store}>
      <ReducedMotionContext.Provider value={reducedMotion}>
        <main className={`lab-root ${labels ? "" : "lab-root--no-labels"}`} style={HUD_CSS_VARS}>
          <div className="lab-canvas">
            <LabScene
              worldRef={worldRef}
              paused={paused}
              speed={SPEEDS[speedIndex] ?? 1}
              advance={advance}
              onSnapshot={handleSnapshot}
              selected={selected}
              onSelect={setSelected}
              quality={quality}
              tags={tags}
              inputAnchor={inputAnchor}
              directed={autoCamera && !reducedMotion}
            />
          </div>
          <AgentTags registry={tags} selected={selected} />
          <LabHud
            snapshot={snapshot}
            paused={paused}
            speed={SPEEDS[speedIndex] ?? 1}
            labels={labels}
            quality={quality}
            autoCamera={autoCamera && !reducedMotion}
            onToggleCamera={reducedMotion ? null : () => setAutoCamera((value) => !value)}
            selected={selected}
            onTogglePause={() => setPaused((value) => !value)}
            onRestart={restart}
            onSpeed={() => setSpeedIndex((index) => (index + 1) % SPEEDS.length)}
            onToggleLabels={() => setLabels((value) => !value)}
            onToggleQuality={() => setQuality((value) => (value === "high" ? "balanced" : "high"))}
            onSelect={setSelected}
            onAsk={ask}
            onBackToDemo={restart}
            inputAnchor={inputAnchor}
            onAnswer={(requestId, value) => {
              session.answerInput(requestId, value);
              handleSnapshot(session.world);
            }}
            onSkip={(requestId) => {
              session.skipInput(requestId);
              handleSnapshot(session.world);
            }}
            onEngageInput={() => session.holdInput()}
          />
        </main>
      </ReducedMotionContext.Provider>
    </WorkspaceProvider>
  );
}
