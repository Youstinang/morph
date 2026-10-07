"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { WorkspaceProvider } from "@/state/react";
import { AgentTags, type TagRegistry } from "./agent-tags";
import { HUD_CSS_VARS } from "./hud-layout";
import { LabHud } from "./lab-hud";
import { ReducedMotionContext, usePrefersReducedMotion } from "./motion";
import { requestPlan } from "./plan-client";
import { createDemoSession } from "./sim/session";
import type { AgentId, World } from "./sim/types";
import { takeSnapshot, type LabSnapshot } from "./snapshot";
import "./lab.css";

const LabScene = dynamic(() => import("./lab-scene"), {
  ssr: false,
  loading: () => <div className="lab-loading">Initializing chamber…</div>,
});

const SPEEDS = [1, 2] as const;

export function LabExperience() {
  const [session] = useState(createDemoSession);
  const worldRef = useRef<World>(session.world);
  const tags = useRef<TagRegistry>({});
  const [snapshot, setSnapshot] = useState<LabSnapshot>(() => takeSnapshot(session.world, session.bus.history()));
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [labels, setLabels] = useState(true);
  const [quality, setQuality] = useState<"high" | "balanced">("high");
  const [selected, setSelected] = useState<AgentId | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const handleSnapshot = useCallback(
    (world: World) => setSnapshot(takeSnapshot(world, session.bus.history())),
    [session],
  );
  const step = useCallback(
    (dt: number) => {
      session.step(dt);
      return session.world;
    },
    [session],
  );
  const restart = useCallback(() => {
    session.restart();
    worldRef.current = session.world;
    handleSnapshot(session.world);
    setPaused(false);
  }, [session, handleSnapshot]);
  const ask = useCallback(
    (objective: string) => {
      session.startLive(objective, requestPlan);
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
              step={step}
              onSnapshot={handleSnapshot}
              selected={selected}
              onSelect={setSelected}
              quality={quality}
              tags={tags}
            />
          </div>
          <AgentTags registry={tags} selected={selected} />
          <LabHud
            snapshot={snapshot}
            paused={paused}
            speed={SPEEDS[speedIndex] ?? 1}
            labels={labels}
            quality={quality}
            selected={selected}
            onTogglePause={() => setPaused((value) => !value)}
            onRestart={restart}
            onSpeed={() => setSpeedIndex((index) => (index + 1) % SPEEDS.length)}
            onToggleLabels={() => setLabels((value) => !value)}
            onToggleQuality={() => setQuality((value) => (value === "high" ? "balanced" : "high"))}
            onSelect={setSelected}
            onAsk={ask}
            onBackToDemo={restart}
            onConfirmBudget={() => {
              session.answerBudget();
              handleSnapshot(session.world);
            }}
          />
        </main>
      </ReducedMotionContext.Provider>
    </WorkspaceProvider>
  );
}
