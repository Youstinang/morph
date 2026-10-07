import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { CanvasTexture, Color, MathUtils, MeshBasicMaterial, SRGBColorSpace, type Group, type Mesh } from "three";
import type { ModuleId, ModuleRuntime, ModuleSpec, World } from "../sim/types";
import { geo } from "./geometry";
import { useDisposable, type StationMaterials } from "./station-layout";

/** Bay and arm live in the bay frame (behind the module); the track lives in the module frame. Local +Z points at the Intent Core. */
interface FixtureProps {
  id: ModuleId;
  spec: ModuleSpec;
  worldRef: RefObject<World>;
  m: StationMaterials;
}

const TRACK_START = 3.1;
const TRACK_END = 2.4;

export function isPresent(mod: ModuleRuntime | undefined): mod is ModuleRuntime {
  return mod !== undefined && mod.visible && mod.removedAt === null;
}

function drawBayLabel(index: number, title: string, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0b1118";
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 64);
  ctx.font = "600 28px ui-monospace, Menlo, monospace";
  ctx.fillText(`BAY ${String(index + 1).padStart(2, "0")}`, 26, 42);
  ctx.fillStyle = "#c9d6e3";
  ctx.font = "500 26px ui-sans-serif, system-ui, Helvetica, Arial";
  ctx.fillText(title.toUpperCase(), 170, 42);
  return canvas;
}

/** Docking bay behind the module; doors open while it exists and close as it dissolves. */
export function Bay({ id, spec, index, worldRef, m }: FixtureProps & { index: number }) {
  const left = useRef<Mesh>(null);
  const right = useRef<Mesh>(null);
  const open = useRef(0);
  const resources = useMemo(() => {
    const texture = new CanvasTexture(drawBayLabel(index, spec.title, spec.color));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return {
      texture,
      label: new MeshBasicMaterial({ map: texture, toneMapped: false }),
      glow: new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0, toneMapped: false }),
      edge: new MeshBasicMaterial({ color: new Color(spec.color).multiplyScalar(0.55), toneMapped: false }),
    };
  }, [index, spec.color, spec.title]);
  useDisposable(useMemo(() => Object.values(resources), [resources]));

  useFrame((_, delta) => {
    const mod = worldRef.current.modules[id];
    open.current = MathUtils.damp(open.current, isPresent(mod) ? 1 : 0, 2.4, Math.min(delta, 0.05));
    const shift = open.current * 1.15;
    if (left.current) left.current.position.x = -0.62 - shift;
    if (right.current) right.current.position.x = 0.62 + shift;
    resources.glow.opacity = open.current * (0.32 + Math.min(mod?.activity ?? 0, 2) * 0.12);
  });

  return (
    <group>
      <mesh geometry={geo.box(3.6, 0.1, 1.6)} material={m.panel} position={[0, 0.05, 0.3]} />
      <mesh geometry={geo.box(3.2, 0.012, 0.05)} material={resources.edge} position={[0, 0.105, 1.08]} />
      {[-1.72, 1.72].map((px) => (
        <group key={px} position={[px, 0, 0]}>
          <mesh geometry={geo.box(0.36, 4, 0.6)} material={m.hull} position={[0, 2, 0]} />
          <mesh geometry={geo.box(0.05, 3.2, 0.02)} material={resources.edge} position={[px > 0 ? -0.19 : 0.19, 2, 0.31]} />
        </group>
      ))}
      <mesh geometry={geo.box(3.8, 0.55, 0.7)} material={m.hull} position={[0, 4.2, 0]} />
      <mesh geometry={geo.plane(2.6, 0.32)} material={resources.label} position={[0, 4.2, 0.36]} />
      <mesh geometry={geo.plane(3.08, 3.7)} material={resources.glow} position={[0, 1.95, -0.2]} />
      <mesh ref={left} geometry={geo.box(1.24, 3.7, 0.12)} material={m.panel} position={[-0.62, 1.95, 0]} />
      <mesh ref={right} geometry={geo.box(1.24, 3.7, 0.12)} material={m.panel} position={[0.62, 1.95, 0]} />
    </group>
  );
}

/** Service arm beside the bay; unfolds while the module materializes, then tends it while it is worked. */
export function ServiceArm({ id, spec, worldRef, m }: FixtureProps) {
  const turret = useRef<Group>(null);
  const shoulder = useRef<Group>(null);
  const elbow = useRef<Group>(null);
  const pose = useRef({ turret: 0, shoulder: -0.2, elbow: 2.3, glow: 0 });
  const tip = useMemo(() => new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.2, toneMapped: false }), [spec.color]);
  useDisposable(useMemo(() => [tip], [tip]));
  const facing = Math.atan2(-2.35, 2.4);

  useFrame((frame, delta) => {
    const world = worldRef.current;
    const mod = world.modules[id];
    const present = isPresent(mod);
    const dt = Math.min(delta, 0.05);
    const t = frame.clock.elapsedTime;
    const p = pose.current;
    const activity = Math.min(mod?.activity ?? 0, 2) / 2;
    const building = present ? Math.max(0, 1 - (world.time - mod.appearedAt) / 1.8) : 0;
    const targetTurret = present ? facing + Math.sin(t * 1.4) * 0.18 * activity : 0;
    const targetShoulder = present ? 0.45 + building * 0.35 + Math.sin(t * 1.1) * 0.08 * activity : -0.2;
    const targetElbow = present ? 0.95 - building * 0.4 + Math.sin(t * 1.7) * 0.15 * activity : 2.3;
    p.turret = MathUtils.damp(p.turret, targetTurret, 3, dt);
    p.shoulder = MathUtils.damp(p.shoulder, targetShoulder, 3, dt);
    p.elbow = MathUtils.damp(p.elbow, targetElbow, 3, dt);
    p.glow = MathUtils.damp(p.glow, present ? 0.35 + activity * 0.65 + building : 0.15, 4, dt);
    if (turret.current) turret.current.rotation.y = p.turret;
    if (shoulder.current) shoulder.current.rotation.x = p.shoulder;
    if (elbow.current) elbow.current.rotation.x = p.elbow;
    tip.opacity = Math.min(p.glow, 1);
  });

  return (
    <group position={[2.4, 0, 0.7]}>
      <mesh geometry={geo.cylinder(0.36, 0.44, 0.3, 16)} material={m.trim} position={[0, 0.15, 0]} />
      <group ref={turret} position={[0, 0.3, 0]}>
        <mesh geometry={geo.cylinder(0.24, 0.28, 0.3, 14)} material={m.hull} position={[0, 0.15, 0]} />
        <group ref={shoulder} position={[0, 0.32, 0]}>
          <mesh geometry={geo.sphere(0.14, 12)} material={m.trim} />
          <mesh geometry={geo.box(0.16, 1.3, 0.16)} material={m.panel} position={[0, 0.65, 0]} />
          <group ref={elbow} position={[0, 1.3, 0]}>
            <mesh geometry={geo.sphere(0.11, 12)} material={m.trim} />
            <mesh geometry={geo.box(0.12, 1, 0.12)} material={m.panel} position={[0, 0.5, 0]} />
            <mesh geometry={geo.box(0.24, 0.16, 0.3)} material={m.hull} position={[0, 1.05, 0]} />
            <mesh geometry={geo.sphere(0.06, 10)} material={tip} position={[0, 1.15, 0.12]} />
          </group>
        </group>
      </group>
    </group>
  );
}

/** Twin floor light-tracks linking the module to the Intent Core; lit while it exists, brighter while worked. */
export function CoreTrack({ id, spec, worldRef, distance }: Omit<FixtureProps, "m"> & { distance: RefObject<number> }) {
  const lanes = useRef<Group>(null);
  const resources = useMemo(
    () => ({
      light: new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      groove: new MeshBasicMaterial({ color: "#121a24", toneMapped: false }),
    }),
    [spec.color],
  );
  useDisposable(useMemo(() => Object.values(resources), [resources]));

  useFrame((_, delta) => {
    const mod = worldRef.current.modules[id];
    const target = isPresent(mod) ? 0.28 + Math.min(mod.activity, 2) * 0.3 : 0;
    const light = resources.light;
    light.opacity = MathUtils.damp(light.opacity, target, 3, Math.min(delta, 0.05));
    if (!lanes.current) return;
    const length = Math.max(0.01, distance.current - TRACK_START - TRACK_END);
    lanes.current.visible = light.opacity > 0.01;
    lanes.current.position.z = TRACK_END + length / 2;
    lanes.current.scale.set(1, 1, length);
  });

  return (
    <group ref={lanes} visible={false}>
      {[-0.34, 0.34].map((px) => (
        <group key={px} position={[px, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh geometry={geo.plane(0.14, 1)} material={resources.groove} position={[0, 0, 0.004]} />
          <mesh geometry={geo.plane(0.05, 1)} material={resources.light} position={[0, 0, 0.007]} />
        </group>
      ))}
    </group>
  );
}
