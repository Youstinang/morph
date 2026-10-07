"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createEventBus } from "@/events/bus";
import type { EventDraft } from "@/events/schema";
import { createUaeWorkspace } from "@/state/fixtures/uae-market";
import { createOperationGate } from "@/state/gate";
import type { OperationResult } from "@/state/operations";
import { createWorkspaceStore } from "@/state/store";
import { ReducedMotionContext, usePrefersReducedMotion } from "@/visualization/world/motion";
import { Chamber } from "@/visualization/world/scene/chamber";
import { IntentCore } from "@/visualization/world/scene/intent-core";
import { MorphSweep } from "@/visualization/world/scene/morph-sweep";
import { Station } from "@/visualization/world/scene/station";
import { moduleStatus } from "@/visualization/world/sim/modules";
import type { ModuleEmphasis, ModuleGroup, World } from "@/visualization/world/sim/types";
import { createWorld, reactToEvent, stepWorld } from "@/visualization/world/sim/world";

const GROUPS: readonly ModuleGroup[] = ["research", "analysis", "decision"];
const why = { reason: "Sent from the module sandbox." };

type Proposal = Record<string, unknown> & { operation: string };
type MorphStep = { morph: "start"; reason: string } | { morph: "end" };
type Step = Proposal | MorphStep;
const isMorphStep = (step: Step): step is MorphStep => !("operation" in step);

const mod = (id: string, title: string, group: ModuleGroup, kind = id) => ({ id, title, kind, group });
const add = (id: string, title: string, group: ModuleGroup, kind?: string): Proposal => ({ operation: "add_module", module: mod(id, title, group, kind), why });
const morph = (reason: string, ...steps: Proposal[]): Step[] => [{ morph: "start", reason }, ...steps, { morph: "end" }];

/** Sample reshuffles of the kind an AI planner would propose, sent as real operations. */
const PRESETS: { label: string; steps: () => Step[] }[] = [
  {
    label: "Opening plan",
    steps: () => morph("Plan the first checks.", add("market", "Market demand", "research"), add("competition", "Competitors", "research"), add("regulation", "Rules", "research")),
  },
  {
    label: "New discovery",
    steps: () => morph("Budget and buying cycle matter.", add("economics", "Costs", "analysis"), add("risk", "Risks", "analysis"), add("possibility", "Options", "decision")),
  },
  {
    label: "Priority shift",
    steps: () =>
      morph(
        "Slow buying makes costs and risks decisive.",
        ...["economics", "risk", "possibility"].map((moduleId): Proposal => ({ operation: "emphasize_module", moduleId, why })),
        ...["market", "competition"].map((moduleId): Proposal => ({ operation: "deemphasize_module", moduleId, why })),
        { operation: "update_module", moduleId: "regulation", changes: { collapsed: true } },
      ),
  },
  {
    label: "Rebuild: buy a competitor",
    steps: () =>
      morph(
        "The question changed to acquiring a local competitor.",
        { operation: "add_module", module: mod("targets", "Acquisition targets", "research", "targets"), replaces: "competition", why },
        add("valuation", "Valuation", "analysis"),
        add("integration", "Integration risk", "analysis"),
        { operation: "move_module", moduleId: "risk", group: "decision", why },
        { operation: "remove_module", moduleId: "economics", why },
      ),
  },
  {
    label: "Crowd analysis",
    steps: () => morph("Stress test.", add("synergy", "Synergies", "analysis"), add("pricing", "Pricing", "analysis"), add("talent", "Talent", "analysis")),
  },
];

interface Row {
  id: string;
  label: string;
  group: ModuleGroup;
  emphasis: ModuleEmphasis;
  collapsed: boolean;
  size: number;
}

function rows(world: World): Row[] {
  return world.moduleOrder
    .filter((id) => world.modules[id]!.replacedBy === null && world.modules[id]!.removedAt === null)
    .map((id) => {
      const m = world.modules[id]!;
      return {
        id,
        label: `${m.spec.title} · ${moduleStatus(world, id)} · ${m.spec.group} · size ${m.size.toFixed(2)} · crowd ${m.layoutScale.toFixed(2)}`,
        group: m.spec.group,
        emphasis: m.emphasis,
        collapsed: m.collapsed,
        size: m.size,
      };
    });
}

function createSandbox() {
  const bus = createEventBus({ clock: () => ({ at: world.time, cycle: 0 }) });
  const store = createWorkspaceStore(createUaeWorkspace());
  let world = createWorld();
  const gate = createOperationGate(store, bus, () => world.time);
  const report = (draft: EventDraft) => bus.publish(draft, "world");
  bus.subscribe((event) => reactToEvent(world, event, report));
  return {
    bus,
    gate,
    get world() {
      return world;
    },
    reset() {
      world = createWorld();
      store.getState().reset(createUaeWorkspace());
    },
    step(dt: number) {
      world.time += dt;
      stepWorld(world, dt, report);
    },
  };
}
type Sandbox = ReturnType<typeof createSandbox>;

function Driver({ sandbox, worldRef }: { sandbox: Sandbox; worldRef: RefObject<World> }) {
  useFrame((_, delta) => {
    sandbox.step(Math.min(delta, 0.1));
    worldRef.current = sandbox.world;
  });
  return null;
}

/** Development-only: reshape the real deck by sending MorphOperations through the operation gate. */
export default function ModuleSandbox() {
  const [sandbox] = useState(createSandbox);
  const worldRef = useRef<World>(sandbox.world);
  const counter = useRef(0);
  const [listed, setListed] = useState<Row[]>([]);
  const [last, setLast] = useState<string>("Send a preset or change a station.");
  const [calm, setCalm] = useState(false);
  const prefersCalm = usePrefersReducedMotion();
  useEffect(() => {
    const timer = window.setInterval(() => setListed(rows(sandbox.world)), 250);
    return () => window.clearInterval(timer);
  }, [sandbox]);

  const send = (steps: Step[]) => {
    const results: OperationResult[] = [];
    for (const step of steps) {
      if (isMorphStep(step)) {
        sandbox.bus.publish(step.morph === "start" ? { type: "workspace_morph_started", reason: step.reason } : { type: "workspace_morph_completed" }, "demo");
        continue;
      }
      counter.current += 1;
      results.push(sandbox.gate.submit({ ...step, id: `sandbox-${counter.current}` }, { as: { kind: "model", label: "Sandbox" } }));
    }
    const refused = results.filter((result) => !result.ok);
    setLast(
      refused.length === 0
        ? `Accepted ${results.length} change${results.length === 1 ? "" : "s"}.`
        : `Refused ${refused.length} of ${results.length}: ${refused.map((result) => (result.ok ? "" : result.reason)).join("; ")}`,
    );
    setListed(rows(sandbox.world));
  };
  const one = (proposal: Proposal) => send([proposal]);
  const nextGroup = (group: ModuleGroup) => GROUPS[(GROUPS.indexOf(group) + 1) % GROUPS.length]!;
  const addNew = (group: ModuleGroup) => {
    counter.current += 1;
    const id = `${group}-${counter.current}`;
    one(add(id, `${group[0]!.toUpperCase()}${group.slice(1)} ${counter.current}`, group, "custom"));
  };
  const clear = () => send(morph("Clear the deck.", ...rows(sandbox.world).map((row): Proposal => ({ operation: "remove_module", moduleId: row.id, why }))));
  const reset = () => {
    sandbox.reset();
    worldRef.current = sandbox.world;
    setListed([]);
    setLast("Fresh deck.");
  };

  const button = "rounded border border-white/20 px-2 py-0.5 hover:bg-white/10";
  return (
    <ReducedMotionContext.Provider value={calm || prefersCalm}>
      <div className="fixed inset-0 bg-black text-xs text-white">
        <Canvas camera={{ position: [-3, 25, 25], fov: 42, near: 0.1, far: 400 }} gl={{ antialias: false }}>
          <Driver sandbox={sandbox} worldRef={worldRef} />
          <Chamber />
          <Station worldRef={worldRef} reflections={false} />
          <IntentCore worldRef={worldRef} />
          <MorphSweep worldRef={worldRef} />
          <OrbitControls target={[-3, 0, 0]} makeDefault />
          <EffectComposer>
            <Bloom intensity={1.05} luminanceThreshold={0.72} luminanceSmoothing={0.2} mipmapBlur />
          </EffectComposer>
        </Canvas>
        <div className="absolute left-3 top-3 flex max-h-[calc(100vh-24px)] w-96 flex-col gap-2 overflow-y-auto rounded-lg bg-black/75 p-3">
          <div className="font-semibold">Reshape the deck (sent through the operation checker)</div>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((preset) => (
              <button key={preset.label} type="button" className={button} onClick={() => send(preset.steps())}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {GROUPS.map((group) => (
              <button key={group} type="button" className={button} onClick={() => addNew(group)}>
                + {group}
              </button>
            ))}
            <button type="button" className={button} onClick={clear}>
              Clear
            </button>
            <button type="button" className={button} onClick={reset}>
              Reset
            </button>
            <label className="flex items-center gap-1 px-1">
              <input type="checkbox" checked={calm || prefersCalm} disabled={prefersCalm} onChange={(event) => setCalm(event.target.checked)} />
              Calm mode
            </label>
          </div>
          <div role="status" className="text-white/70">
            {last}
          </div>
          {listed.map((row) => {
            const { id } = row;
            return (
              <div key={id} className="flex flex-wrap items-center gap-1 border-t border-white/10 pt-1">
                <span className="w-full">{row.label}</span>
                <button type="button" className={button} onClick={() => one({ operation: "emphasize_module", moduleId: id, why })}>
                  More important
                </button>
                <button type="button" className={button} onClick={() => one({ operation: "deemphasize_module", moduleId: id, why })}>
                  Less important
                </button>
                <button type="button" className={button} onClick={() => one({ operation: "update_module", moduleId: id, changes: { collapsed: !row.collapsed } })}>
                  {row.collapsed ? "Expand" : "Collapse"}
                </button>
                <button type="button" className={button} onClick={() => one({ operation: "resize_module", moduleId: id, size: Math.max(0.7, row.size - 0.15) })}>
                  −
                </button>
                <button type="button" className={button} onClick={() => one({ operation: "resize_module", moduleId: id, size: Math.min(1.15, row.size + 0.15) })}>
                  +
                </button>
                <button type="button" className={button} onClick={() => one({ operation: "move_module", moduleId: id, group: nextGroup(row.group), why })}>
                  Move to {nextGroup(row.group)}
                </button>
                <button type="button" className={button} onClick={() => one({ operation: "remove_module", moduleId: id, why })}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ReducedMotionContext.Provider>
  );
}
