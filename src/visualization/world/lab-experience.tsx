"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { AgentTags, type TagRegistry } from "./agent-tags";
import { HUD_CSS_VARS } from "./hud-layout";
import { LabHud } from "./lab-hud";
import type { AgentId, World } from "./sim/types";
import { confirmBudget, createWorld } from "./sim/world";
import { takeSnapshot, type LabSnapshot } from "./snapshot";
import "./lab.css";

const LabScene = dynamic(() => import("./lab-scene"), {
  ssr: false,
  loading: () => <div className="lab-loading">Initializing chamber…</div>,
});

const SPEEDS = [1, 2] as const;

export function LabExperience() {
  const [initialWorld] = useState(createWorld);
  const worldRef = useRef<World>(initialWorld);
  const tags = useRef<TagRegistry>({});
  const [snapshot, setSnapshot] = useState<LabSnapshot>(() => takeSnapshot(initialWorld));
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [labels, setLabels] = useState(true);
  const [quality, setQuality] = useState<"high" | "balanced">("high");
  const [selected, setSelected] = useState<AgentId | null>(null);

  const handleSnapshot = useCallback((world: World) => setSnapshot(takeSnapshot(world)), []);
  const restart = useCallback(() => {
    worldRef.current = createWorld(worldRef.current.cycle + 1);
    setSnapshot(takeSnapshot(worldRef.current));
    setPaused(false);
  }, []);

  return (
    <main className={`lab-root ${labels ? "" : "lab-root--no-labels"}`} style={HUD_CSS_VARS}>
      <div className="lab-canvas">
        <LabScene
          worldRef={worldRef}
          paused={paused}
          speed={SPEEDS[speedIndex] ?? 1}
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
        onConfirmBudget={() => {
          confirmBudget(worldRef.current);
          setSnapshot(takeSnapshot(worldRef.current));
        }}
      />
    </main>
  );
}
