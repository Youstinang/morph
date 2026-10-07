"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useMemo, useRef, type ComponentRef, type RefObject } from "react";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { hudInsets, type HudInsets } from "./hud-layout";
import { useReducedMotion } from "./motion";
import { sectorFramePoints } from "./sim/layout";
import { AGENT_ORDER, homePosition } from "./sim/roster";
import type { AgentId, World } from "./sim/types";
import { Artifacts } from "./scene/artifacts";
import { Chamber } from "./scene/chamber";
import { Character } from "./scene/character";
import { IntentCore } from "./scene/intent-core";
import { MorphSweep } from "./scene/morph-sweep";
import { Station } from "./scene/station";
import { TagProjector } from "./scene/tag-projector";
import type { TagRegistry } from "./agent-tags";

const FIXED_STEP = 1 / 60;
const SNAPSHOT_INTERVAL = 0.14;
const OVERVIEW_TARGET = new Vector3(0, 1.6, -2.5);
const CAMERA_START = new Vector3(1.5, 10, 18);
const OVERVIEW_DIRECTION = CAMERA_START.clone().sub(OVERVIEW_TARGET).normalize();
const FIT_MARGIN = 12;
const ZONE_REACH = 2.3;
const ZONE_TOP = 3.6;
const CORE_TOP = 4.2;
const AGENT_TOP = 2.6;
const CLOSE_UP_DISTANCE = 3.6;
const PORTRAIT_HEIGHT = 2.1;
const PORTRAIT_SWING = 0.45;
/** Near a zone, the front view would sit inside the station model, so frame from the Core side instead. */
const STATION_CLEARANCE = 3.4;
const STATION_SWING = 0.9;

interface DriverProps {
  worldRef: RefObject<World>;
  paused: boolean;
  speed: number;
  /** Advances the demo session one fixed step and returns the world to render. */
  step: (dt: number) => World;
  onSnapshot: (world: World) => void;
}

function SimulationDriver({ worldRef, paused, speed, step, onSnapshot }: DriverProps) {
  const clock = useRef({ accumulator: 0, sinceSnapshot: 0 });
  useFrame((_, delta) => {
    const c = clock.current;
    if (!paused) {
      c.accumulator += Math.min(delta, 0.1) * speed;
      while (c.accumulator >= FIXED_STEP) {
        worldRef.current = step(FIXED_STEP);
        c.accumulator -= FIXED_STEP;
      }
    }
    c.sinceSnapshot += delta;
    if (c.sinceSnapshot >= SNAPSHOT_INTERVAL) {
      c.sinceSnapshot = 0;
      onSnapshot(worldRef.current);
    }
  });
  return null;
}

function moduleFitPoints(x: number, z: number): Vector3[] {
  return [
    new Vector3(x - ZONE_REACH, 0, z),
    new Vector3(x + ZONE_REACH, 0, z),
    new Vector3(x, 0, z - ZONE_REACH),
    new Vector3(x, 0, z + ZONE_REACH),
    new Vector3(x, ZONE_TOP, z),
  ];
}

/** Always in the overview: each deck neighborhood's framed arc, the Core, and agent homes. */
const BASE_FIT_POINTS: Vector3[] = [
  ...sectorFramePoints().flatMap(([x, z]) => moduleFitPoints(x, z)),
  new Vector3(0, 0, 0),
  new Vector3(0, CORE_TOP, 0),
  ...AGENT_ORDER.flatMap((id) => {
    const [x, z] = homePosition(id);
    return [new Vector3(x, 0, z), new Vector3(x, AGENT_TOP, z)];
  }),
];

/** The base points plus any module the layout has pushed beyond the framed arcs. */
function fitPoints(world: World): { points: Vector3[]; key: string } {
  const points = [...BASE_FIT_POINTS];
  const key: string[] = [];
  for (const id of world.moduleOrder) {
    const [x, z] = world.modules[id]!.position;
    points.push(...moduleFitPoints(x, z));
    key.push(`${x.toFixed(1)},${z.toFixed(1)}`);
  }
  return { points, key: key.join(";") };
}

interface Framing {
  distance: number;
  /** Extra pixel shift that centers the overview's footprint in the free area. */
  shiftX: number;
  shiftY: number;
}

/**
 * Shift the projection so the orbit target lands in the middle of the space the HUD leaves free,
 * plus an optional extra shift in pixels.
 */
function applyViewOffset(camera: PerspectiveCamera, width: number, height: number, insets: HudInsets, shiftX = 0, shiftY = 0) {
  const cx = insets.left + (width - insets.left - insets.right) / 2 + shiftX;
  const cy = insets.top + (height - insets.top - insets.bottom) / 2 + shiftY;
  camera.setViewOffset(width, height, width / 2 - cx, height / 2 - cy, width, height);
}

/** Closest overview at which every fit point lands inside the free area, centered there. */
function frameOverview(probe: PerspectiveCamera, width: number, height: number, insets: HudInsets, fit: Vector3[]): Framing {
  const point = new Vector3();
  const free = {
    left: insets.left + FIT_MARGIN,
    right: width - insets.right - FIT_MARGIN,
    top: insets.top + FIT_MARGIN,
    bottom: height - insets.bottom - FIT_MARGIN,
  };
  const bounds = (distance: number) => {
    probe.position.copy(OVERVIEW_TARGET).addScaledVector(OVERVIEW_DIRECTION, distance);
    probe.lookAt(OVERVIEW_TARGET);
    probe.updateMatrixWorld();
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const p of fit) {
      point.copy(p).project(probe);
      const x = ((point.x + 1) / 2) * width;
      const y = ((1 - point.y) / 2) * height;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
    return box;
  };
  const framing: Framing = { distance: 30, shiftX: 0, shiftY: 0 };
  for (let pass = 0; pass < 4; pass += 1) {
    applyViewOffset(probe, width, height, insets, framing.shiftX, framing.shiftY);
    let low = 6;
    let high = 90;
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      const box = bounds(mid);
      const fits = box.left >= free.left && box.right <= free.right && box.top >= free.top && box.bottom <= free.bottom;
      if (fits) high = mid;
      else low = mid;
    }
    framing.distance = high;
    const box = bounds(high);
    framing.shiftX += (free.left + free.right) / 2 - (box.left + box.right) / 2;
    framing.shiftY += (free.top + free.bottom) / 2 - (box.top + box.bottom) / 2;
  }
  return framing;
}

function CameraFocus({ worldRef, selected }: { worldRef: RefObject<World>; selected: AgentId | null }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const goal = useRef(new Vector3());
  const offset = useRef(new Vector3());
  const portrait = useRef(new Vector3());
  const facing = useRef(Number.NaN);
  const dolly = useRef({ settling: false, last: null as AgentId | null });
  const size = useThree((state) => state.size);
  const reduced = useReducedMotion();
  const probe = useMemo(() => new PerspectiveCamera(), []);
  const fit = useRef({
    key: "",
    layoutKey: "",
    layoutVersion: -1,
    world: null as World | null,
    insets: hudInsets(0),
    framing: null as Framing | null,
    shiftX: 0,
    shiftY: 0,
  });
  useFrame(({ camera }, delta) => {
    if (!controls.current) return;
    const d = dolly.current;
    const dt = Math.min(delta, 0.05);
    const f = fit.current;
    const perspective = camera as PerspectiveCamera;
    const world = worldRef.current;
    const layout = f.layoutVersion === world.layoutVersion && f.world === world ? null : fitPoints(world);
    f.world = world;
    f.layoutVersion = world.layoutVersion;
    const key = `${size.width}x${size.height}|${layout ? layout.key : f.layoutKey}`;
    if (layout) f.layoutKey = layout.key;
    if (f.key !== key) {
      const first = f.key === "";
      f.key = key;
      f.insets = hudInsets(size.width);
      probe.copy(perspective);
      const previous = f.framing;
      f.framing = frameOverview(probe, size.width, size.height, f.insets, (layout ?? fitPoints(world)).points);
      if (first) {
        camera.position.copy(OVERVIEW_TARGET).addScaledVector(OVERVIEW_DIRECTION, f.framing.distance);
        f.shiftX = f.framing.shiftX;
        f.shiftY = f.framing.shiftY;
      } else if (!selected && (!previous || Math.abs(previous.distance - f.framing.distance) > 0.3)) d.settling = true;
    }
    const framing = f.framing!;
    const ease = (rate: number) => (reduced ? 1 : 1 - Math.exp(-dt * rate));
    const shiftK = ease(2.4);
    f.shiftX = MathUtils.lerp(f.shiftX, selected ? 0 : framing.shiftX, shiftK);
    f.shiftY = MathUtils.lerp(f.shiftY, selected ? 0 : framing.shiftY, shiftK);
    applyViewOffset(perspective, size.width, size.height, f.insets, f.shiftX, f.shiftY);
    if (selected !== d.last) {
      d.last = selected;
      d.settling = !selected;
      facing.current = Number.NaN;
    }
    const target = controls.current.target;
    if (selected) {
      const agent = world.agents[selected];
      const [x, z] = agent.position;
      goal.current.set(x, PORTRAIT_HEIGHT, z);
      if (Number.isNaN(facing.current)) facing.current = agent.facing;
      const turn = Math.atan2(Math.sin(agent.facing - facing.current), Math.cos(agent.facing - facing.current));
      facing.current += turn * ease(1.6);
      const atStation = world.moduleOrder.some((id) => {
        const [mx, mz] = world.modules[id]!.position;
        return Math.hypot(mx - x, mz - z) < STATION_CLEARANCE;
      });
      const angle = atStation ? Math.atan2(-x, -z) + STATION_SWING : facing.current + PORTRAIT_SWING;
      portrait.current.set(x + Math.sin(angle) * CLOSE_UP_DISTANCE, PORTRAIT_HEIGHT + 0.7, z + Math.cos(angle) * CLOSE_UP_DISTANCE);
      const k = ease(2.4);
      target.lerp(goal.current, k);
      camera.position.lerp(portrait.current, k);
    } else {
      const k = ease(2.2);
      target.lerp(OVERVIEW_TARGET, k);
      if (d.settling) {
        offset.current.subVectors(camera.position, target);
        const length = MathUtils.lerp(offset.current.length(), framing.distance, k);
        camera.position.copy(target).add(offset.current.setLength(length));
        if (Math.abs(length - framing.distance) < 0.05) d.settling = false;
      }
    }
    controls.current.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={!reduced}
      dampingFactor={0.08}
      minDistance={3}
      maxDistance={90}
      maxPolarAngle={MathUtils.degToRad(82)}
      minPolarAngle={MathUtils.degToRad(18)}
      target={OVERVIEW_TARGET.toArray()}
    />
  );
}

interface LabSceneProps extends DriverProps {
  selected: AgentId | null;
  onSelect: (id: AgentId | null) => void;
  quality: "high" | "balanced";
  tags: RefObject<TagRegistry>;
}

export default function LabScene({
  worldRef,
  paused,
  speed,
  step,
  onSnapshot,
  selected,
  onSelect,
  quality,
  tags,
}: LabSceneProps) {
  return (
    <Canvas
      dpr={quality === "high" ? [1, 1.75] : [1, 1.25]}
      camera={{ position: CAMERA_START.toArray(), fov: 42, near: 0.1, far: 400 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      onPointerMissed={() => onSelect(null)}
    >
      <SimulationDriver worldRef={worldRef} paused={paused} speed={speed} step={step} onSnapshot={onSnapshot} />
      <Chamber />
      <Station worldRef={worldRef} reflections={quality === "high"} />
      <IntentCore worldRef={worldRef} />
      <MorphSweep worldRef={worldRef} />
      {AGENT_ORDER.map((id) => (
        <Character key={id} id={id} worldRef={worldRef} selected={selected === id} onSelect={onSelect} />
      ))}
      <Artifacts worldRef={worldRef} />
      <TagProjector worldRef={worldRef} registry={tags} />
      <CameraFocus worldRef={worldRef} selected={selected} />
      <EffectComposer multisampling={quality === "high" ? 4 : 0}>
        <Bloom intensity={1.05} luminanceThreshold={0.72} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette offset={0.28} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}
