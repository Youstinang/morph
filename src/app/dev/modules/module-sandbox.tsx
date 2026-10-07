"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Chamber } from "@/visualization/world/scene/chamber";
import { IntentCore } from "@/visualization/world/scene/intent-core";
import { Station } from "@/visualization/world/scene/station";
import { applyModuleChange, moduleStatus, stepModules } from "@/visualization/world/sim/modules";
import { MODULE_CATALOG } from "@/visualization/world/sim/script";
import type { ModuleChange, ModuleEmphasis, ModuleGroup, ModuleStation, World } from "@/visualization/world/sim/types";
import { createWorld } from "@/visualization/world/sim/world";

const STATIONS: Record<ModuleGroup, ModuleStation> = { research: "console", analysis: "hologram", decision: "platform" };
const COLORS: Record<ModuleGroup, string> = { research: "#8fd0ff", analysis: "#ffc27a", decision: "#b98cff" };

interface Row {
  id: string;
  label: string;
  emphasis: ModuleEmphasis;
  collapsed: boolean;
  size: number;
}

function rows(world: World): Row[] {
  return world.moduleOrder.map((id) => {
    const mod = world.modules[id]!;
    return {
      id,
      label: `${mod.spec.title} · ${moduleStatus(world, id)} · size ${mod.size.toFixed(2)} · crowd ${mod.layoutScale.toFixed(2)}`,
      emphasis: mod.emphasis,
      collapsed: mod.collapsed,
      size: mod.size,
    };
  });
}

function Driver({ worldRef }: { worldRef: RefObject<World> }) {
  useFrame((_, delta) => {
    worldRef.current.time += Math.min(delta, 0.1);
    stepModules(worldRef.current);
  });
  return null;
}

/** Development-only: exercise module creation, removal, emphasis, collapse and resizing on the real deck. */
export default function ModuleSandbox() {
  const worldRef = useRef<World>(createWorld());
  const counter = useRef(0);
  const [listed, setListed] = useState<Row[]>([]);
  useEffect(() => {
    const timer = window.setInterval(() => setListed(rows(worldRef.current)), 250);
    return () => window.clearInterval(timer);
  }, []);

  const apply = (change: ModuleChange) => {
    applyModuleChange(worldRef.current, change);
    setListed(rows(worldRef.current));
  };
  const add = (group: ModuleGroup) => {
    counter.current += 1;
    const id = `${group}-${counter.current}`;
    apply({
      op: "create",
      spec: { id, title: `${group[0]!.toUpperCase()}${group.slice(1)} ${counter.current}`, group, station: STATIONS[group], surface: "panel", color: COLORS[group] },
    });
  };
  const loadDemo = () => Object.values(MODULE_CATALOG).forEach((spec) => apply({ op: "create", spec }));
  const clear = () => worldRef.current.moduleOrder.forEach((id) => apply({ op: "remove", id }));
  const button = "rounded border border-white/20 px-2 py-0.5 hover:bg-white/10";
  return (
    <div className="fixed inset-0 bg-black text-xs text-white">
      <Canvas camera={{ position: [1.5, 14, 22], fov: 42, near: 0.1, far: 400 }} gl={{ antialias: false }}>
        <Driver worldRef={worldRef} />
        <Chamber />
        <Station worldRef={worldRef} reflections={false} />
        <IntentCore worldRef={worldRef} />
        <OrbitControls target={[0, 1.6, -2.5]} makeDefault />
        <EffectComposer>
          <Bloom intensity={1.05} luminanceThreshold={0.72} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      </Canvas>
      <div className="absolute left-3 top-3 flex w-80 flex-col gap-2 rounded-lg bg-black/70 p-3">
        <div className="flex flex-wrap gap-1">
          {(["research", "analysis", "decision"] as const).map((group) => (
            <button key={group} type="button" className={button} onClick={() => add(group)}>
              + {group}
            </button>
          ))}
          <button type="button" className={button} onClick={loadDemo}>
            Demo set
          </button>
          <button type="button" className={button} onClick={clear}>
            Clear
          </button>
        </div>
        {listed.map((mod) => {
          const { id } = mod;
          return (
            <div key={id} className="flex flex-wrap items-center gap-1 border-t border-white/10 pt-1">
              <span className="w-full">{mod.label}</span>
              <button type="button" className={button} onClick={() => apply({ op: "emphasize", id, emphasis: mod.emphasis === "emphasized" ? "normal" : "emphasized" })}>
                {mod.emphasis === "emphasized" ? "Unemphasize" : "Emphasize"}
              </button>
              <button type="button" className={button} onClick={() => apply({ op: "emphasize", id, emphasis: mod.emphasis === "muted" ? "normal" : "muted" })}>
                {mod.emphasis === "muted" ? "Unmute" : "Mute"}
              </button>
              <button type="button" className={button} onClick={() => apply({ op: "collapse", id, collapsed: !mod.collapsed })}>
                {mod.collapsed ? "Expand" : "Collapse"}
              </button>
              <button type="button" className={button} onClick={() => apply({ op: "resize", id, size: mod.size - 0.15 })}>
                −
              </button>
              <button type="button" className={button} onClick={() => apply({ op: "resize", id, size: mod.size + 0.15 })}>
                +
              </button>
              <button type="button" className={button} onClick={() => apply({ op: "remove", id })}>
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
