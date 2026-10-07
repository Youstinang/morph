import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Euler,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
} from "three";
import type { AgentState, ModuleId, World } from "../sim/types";
import { coreState } from "../sim/world";
import { geo } from "./geometry";
import { LOOKS } from "./intent-core";
import {
  CENTER_X,
  CENTER_Z,
  NEON,
  WALL_FROM,
  WALL_RADIUS,
  WALL_TO,
  GENERATOR_ANGLES,
  GENERATOR_RADIUS,
  bayAngle,
  faceCenter,
  polar,
  useDisposable,
  type StationMaterials,
} from "./station-layout";

const TRUSS_RADIUS = 14.6;
const TRUSS_FROM = Math.PI * 0.85;
const TRUSS_TO = Math.PI * 2.25;
const TRUSS_LOW = 7.6;
const TRUSS_HIGH = 8.3;
const RAIL_Y = 7.45;
const POD_SPEED = 0.7;
const POD_DWELL = 0.9;
const LAMP_ANGLES = Array.from({ length: 12 }, (_, i) => Math.PI * (0.96 + (i / 11) * 1.08));
const BUSY_STATES: ReadonlySet<AgentState> = new Set(["working", "evaluating", "collaborating", "handoff"]);

interface StationPartProps {
  worldRef: RefObject<World>;
  m: StationMaterials;
}

function useInstances(geometry: BufferGeometry, material: Material, transforms: Matrix4[]) {
  const mesh = useMemo(() => {
    const instanced = new InstancedMesh(geometry, material, transforms.length);
    transforms.forEach((matrix, i) => instanced.setMatrixAt(i, matrix));
    instanced.instanceMatrix.needsUpdate = true;
    return instanced;
  }, [geometry, material, transforms]);
  useDisposable(useMemo(() => [mesh], [mesh]));
  return mesh;
}

function compose(x: number, y: number, z: number, yaw: number, roll = 0, scaleY = 1): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(0, yaw, roll, "YXZ")),
    new Vector3(1, scaleY, 1),
  );
}

/** Ring truss under the ceiling, tied back into the wall ribs. */
function OverheadTruss({ m }: { m: StationMaterials }) {
  const transforms = useMemo(() => {
    const verticals: Matrix4[] = [];
    const diagonals: Matrix4[] = [];
    const ties: Matrix4[] = [];
    const steps = 40;
    const height = TRUSS_HIGH - TRUSS_LOW;
    const pitch = ((TRUSS_TO - TRUSS_FROM) / steps) * TRUSS_RADIUS;
    for (let i = 0; i <= steps; i += 1) {
      const angle = TRUSS_FROM + (i / steps) * (TRUSS_TO - TRUSS_FROM);
      const [x, z] = polar(TRUSS_RADIUS, angle);
      const yaw = faceCenter(angle);
      verticals.push(compose(x, (TRUSS_LOW + TRUSS_HIGH) / 2, z, yaw));
      if (i < steps) {
        const mid = angle + (TRUSS_TO - TRUSS_FROM) / steps / 2;
        const [mx, mz] = polar(TRUSS_RADIUS, mid);
        const lean = Math.atan2(pitch, height) * (i % 2 === 0 ? 1 : -1);
        diagonals.push(compose(mx, (TRUSS_LOW + TRUSS_HIGH) / 2, mz, faceCenter(mid), lean, Math.hypot(pitch, height) / height));
      }
      if (i % 4 === 0 && angle >= WALL_FROM && angle <= WALL_TO) {
        const reach = WALL_RADIUS - TRUSS_RADIUS;
        const [tx, tz] = polar(TRUSS_RADIUS + reach / 2, angle);
        ties.push(compose(tx, TRUSS_HIGH, tz, yaw));
      }
    }
    return { verticals, diagonals, ties };
  }, []);
  const height = TRUSS_HIGH - TRUSS_LOW;
  const verticals = useInstances(geo.box(0.09, height, 0.09), m.trim, transforms.verticals);
  const diagonals = useInstances(geo.box(0.05, height, 0.05), m.hull, transforms.diagonals);
  const ties = useInstances(geo.box(0.22, 0.28, WALL_RADIUS - TRUSS_RADIUS), m.hull, transforms.ties);
  const arc = TRUSS_TO - TRUSS_FROM;
  return (
    <group>
      <group position={[CENTER_X, 0, CENTER_Z]} rotation={[0, -TRUSS_FROM, 0]}>
        {[TRUSS_LOW, TRUSS_HIGH].map((y) => (
          <mesh key={y} geometry={geo.arc(TRUSS_RADIUS, 0.07, arc)} material={m.trim} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
        ))}
        <mesh geometry={geo.arc(TRUSS_RADIUS, 0.06, arc)} material={m.hull} position={[0, RAIL_Y, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={geo.arc(TRUSS_RADIUS - 0.12, 0.018, arc)} material={m.strip} position={[0, TRUSS_LOW - 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} />
      </group>
      <primitive object={verticals} />
      <primitive object={diagonals} />
      <primitive object={ties} />
    </group>
  );
}

function HangingLamps({ m }: { m: StationMaterials }) {
  const shafts = useMemo(
    () =>
      [NEON.cyan, NEON.pink].map(
        (color) =>
          new MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.045,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
            toneMapped: false,
            fog: false,
          }),
      ),
    [],
  );
  useDisposable(shafts);
  const shaftHeight = TRUSS_LOW - 1;
  return (
    <group>
      {LAMP_ANGLES.map((angle, i) => {
        const [x, z] = polar(TRUSS_RADIUS - 0.6, angle);
        const pink = i % 2 === 1;
        return (
          <group key={angle} position={[x, 0, z]} rotation={[0, faceCenter(angle), 0]}>
            {[-0.6, 0.6].map((px) => (
              <mesh key={px} geometry={geo.box(0.02, 0.85, 0.02)} material={m.trim} position={[px, TRUSS_LOW - 0.42, 0]} />
            ))}
            <mesh geometry={geo.box(1.6, 0.14, 0.36)} material={m.hull} position={[0, TRUSS_LOW - 0.9, 0]} />
            <mesh geometry={geo.box(1.46, 0.025, 0.22)} material={pink ? m.pink : m.lamp} position={[0, TRUSS_LOW - 0.98, 0]} />
            <mesh
              geometry={geo.tube(0.45, 1.5, shaftHeight)}
              material={shafts[pink ? 1 : 0]}
              position={[0, shaftHeight / 2, 0]}
              scale={[1.4, 1, 0.6]}
            />
          </group>
        );
      })}
    </group>
  );
}

/** A cargo pod runs along the truss rail to whichever bay just received evidence. */
function CargoRail({ worldRef, m }: StationPartProps) {
  const pivot = useRef<Group>(null);
  const strip = useMemo(() => new MeshBasicMaterial({ color: "#2a3a4c", toneMapped: false }), []);
  useDisposable(useMemo(() => [strip], [strip]));
  const run = useRef({
    angle: Math.PI * 1.5,
    queue: [] as ModuleId[],
    current: null as ModuleId | null,
    dwell: 0,
    seen: {} as Partial<Record<ModuleId, number>>,
    color: new Color("#2a3a4c"),
    goal: new Color(),
  });

  useFrame((_, delta) => {
    const world = worldRef.current;
    const r = run.current;
    const dt = Math.min(delta, 0.05);
    for (const id of world.moduleOrder) {
      const evidence = world.modules[id]!.evidence;
      const seen = r.seen[id] ?? 0;
      if (evidence > seen && !r.queue.includes(id) && r.current !== id) r.queue.push(id);
      r.seen[id] = evidence;
    }
    if (!r.current && r.queue.length > 0) {
      r.current = r.queue.shift() ?? null;
      r.dwell = 0;
    }
    const destination = r.current ? world.modules[r.current] : undefined;
    if (r.current && !destination) r.current = null;
    if (destination) {
      const target = bayAngle(destination.position[0], destination.position[1]);
      const gap = target - r.angle;
      const step = POD_SPEED * dt;
      if (Math.abs(gap) > step) {
        r.angle += Math.sign(gap) * step;
      } else {
        r.angle = target;
        r.dwell += dt;
        if (r.dwell >= POD_DWELL) r.current = null;
      }
      r.goal.set(destination.spec.color);
    } else {
      r.goal.set("#2a3a4c");
    }
    r.color.lerp(r.goal, 1 - Math.exp(-dt * 4));
    strip.color.copy(r.color);
    if (pivot.current) pivot.current.rotation.y = -r.angle;
  });

  return (
    <group ref={pivot} position={[CENTER_X, 0, CENTER_Z]}>
      <group position={[TRUSS_RADIUS, 0, 0]}>
        <mesh geometry={geo.box(0.45, 0.24, 0.6)} material={m.trim} position={[0, RAIL_Y - 0.12, 0]} />
        <mesh geometry={geo.box(0.05, 0.5, 0.05)} material={m.trim} position={[0, RAIL_Y - 0.5, 0]} />
        <mesh geometry={geo.box(0.8, 0.62, 1.15)} material={m.panel} position={[0, RAIL_Y - 1.05, 0]} />
        <mesh geometry={geo.box(0.82, 0.07, 1.17)} material={strip} position={[0, RAIL_Y - 0.95, 0]} />
        <mesh geometry={geo.box(0.6, 0.04, 0.9)} material={m.dark} position={[0, RAIL_Y - 1.38, 0]} />
      </group>
    </group>
  );
}

/** Emitter suspended above the Intent Core; its ring and beam follow the Core state. */
function CoreEmitter({ worldRef, m }: StationPartProps) {
  const resources = useMemo(
    () => ({
      ring: new MeshBasicMaterial({ color: "#3b4a5c", toneMapped: false }),
      beam: new MeshBasicMaterial({
        color: "#3b4a5c",
        transparent: true,
        opacity: 0.02,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
      target: new Color(),
    }),
    [],
  );
  useDisposable(useMemo(() => [resources.ring, resources.beam], [resources]));

  useFrame((_, delta) => {
    const look = LOOKS[coreState(worldRef.current)];
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 2.5);
    resources.target.set(look.color);
    resources.ring.color.lerp(resources.target, k);
    resources.beam.color.lerp(resources.target, k);
    resources.beam.opacity = MathUtils.lerp(resources.beam.opacity, 0.008 + look.energy * 0.018, k);
  });

  return (
    <group position={[0, 1.1, 0]}>
      <mesh geometry={geo.cylinder(0.16, 0.16, 6, 10)} material={m.hull} position={[0, 12, 0]} />
      <mesh geometry={geo.cylinder(0.75, 1.05, 0.9, 24)} material={m.panel} position={[0, 8.45, 0]} />
      <mesh geometry={geo.cylinder(1.12, 1.12, 0.12, 32)} material={m.trim} position={[0, 7.98, 0]} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          geometry={geo.box(0.08, 0.7, 0.5)}
          material={m.hull}
          position={[Math.cos((i / 6) * Math.PI * 2) * 0.95, 8.55, Math.sin((i / 6) * Math.PI * 2) * 0.95]}
          rotation={[0, -(i / 6) * Math.PI * 2, 0]}
        />
      ))}
      <mesh geometry={geo.torus(1.16, 0.045, 64)} material={resources.ring} position={[0, 7.9, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.tube(0.95, 1.7, 4.2)} material={resources.beam} position={[0, 5.8, 0]} />
    </group>
  );
}

function Conduits({ m }: { m: StationMaterials }) {
  const arc = WALL_TO - WALL_FROM;
  const boxes = useMemo(() => Array.from({ length: 9 }, (_, i) => WALL_FROM + ((i + 0.5) / 9) * arc), [arc]);
  return (
    <group>
      <group position={[CENTER_X, 0, CENTER_Z]} rotation={[0, -WALL_FROM, 0]}>
        <mesh geometry={geo.arc(17.75, 0.085, arc)} material={m.trim} position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={geo.arc(17.75, 0.06, arc)} material={m.hull} position={[0, 0.58, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={geo.arc(17.85, 0.04, arc)} material={m.hull} position={[0, 2.75, 0]} rotation={[Math.PI / 2, 0, 0]} />
      </group>
      {boxes.map((angle) => {
        const [x, z] = polar(17.7, angle);
        return (
          <group key={angle} position={[x, 0, z]} rotation={[0, faceCenter(angle), 0]}>
            <mesh geometry={geo.box(0.55, 0.7, 0.32)} material={m.panel} position={[0, 0.45, 0]} />
            <mesh geometry={geo.box(0.3, 0.04, 0.02)} material={m.strip} position={[0, 0.66, 0.17]} />
          </group>
        );
      })}
    </group>
  );
}

/** Power units at either end of the hall; their bands show how many agents are actively working. */
function Generators({ worldRef, m }: StationPartProps) {
  const band = useMemo(() => new MeshBasicMaterial({ color: "#22323f", toneMapped: false }), []);
  useDisposable(useMemo(() => [band], [band]));
  const load = useRef(0);
  const colors = useMemo(() => ({ idle: new Color("#22323f"), busy: new Color("#9fd6ff") }), []);

  useFrame((_, delta) => {
    const world = worldRef.current;
    let busy = 0;
    for (const agent of Object.values(world.agents)) if (BUSY_STATES.has(agent.state)) busy += 1;
    load.current = MathUtils.damp(load.current, Math.min(busy / 3, 1), 2.5, Math.min(delta, 0.05));
    band.color.lerpColors(colors.idle, colors.busy, load.current);
  });

  return (
    <group>
      {GENERATOR_ANGLES.map((angle) => {
        const [x, z] = polar(GENERATOR_RADIUS, angle);
        return (
          <group key={angle} position={[x, 0, z]} rotation={[0, faceCenter(angle), 0]}>
            <mesh geometry={geo.cylinder(1.25, 1.35, 0.3, 28)} material={m.trim} position={[0, 0.15, 0]} />
            <mesh geometry={geo.cylinder(1, 1.05, 3.4, 28)} material={m.hull} position={[0, 1.95, 0]} />
            {[0.75, 1.35, 2.55, 3.15].map((y) => (
              <mesh key={y} geometry={geo.torus(1.06, 0.06, 40)} material={m.trim} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
            ))}
            <mesh geometry={geo.tube(1.075, 1.075, 0.3)} material={band} position={[0, 1.95, 0]} />
            <mesh geometry={geo.cylinder(0.55, 0.9, 0.55, 24)} material={m.panel} position={[0, 3.92, 0]} />
            <mesh geometry={geo.cylinder(0.14, 0.14, 5.2, 10)} material={m.trim} position={[0, 6.8, 0]} />
            <mesh geometry={geo.box(0.3, 0.3, 2.3)} material={m.hull} position={[0, 0.45, -1.9]} />
          </group>
        );
      })}
    </group>
  );
}

export function Machinery({ worldRef, m }: StationPartProps) {
  return (
    <group>
      <OverheadTruss m={m} />
      <HangingLamps m={m} />
      <CargoRail worldRef={worldRef} m={m} />
      <CoreEmitter worldRef={worldRef} m={m} />
      <Conduits m={m} />
      <Generators worldRef={worldRef} m={m} />
    </group>
  );
}
