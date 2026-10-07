import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  SpriteMaterial,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import { useReducedMotion } from "../motion";
import { MATERIALIZE_SECONDS, moduleGrowth, modulePose, moduleScale } from "../sim/modules";
import { SCENARIO_LABELS } from "../sim/presentation";
import type { ModuleEmphasis, ModuleHeadline, ModuleId, ModuleSpec, ScenarioWeights, Vec2, World } from "../sim/types";
import { moduleHeadline, scenarioWeights } from "../sim/world";
import { geo } from "./geometry";
import { Bay, CoreTrack, ServiceArm, isPresent } from "./module-fixtures";
import { BAY_OFFSET, type StationMaterials } from "./station-layout";
import { preloadStationModels, STATION_SHAPES, ZoneStation } from "./zone-station";

preloadStationModels();

const MAX_SHARDS = 8;
const SCENARIOS: { key: keyof ScenarioWeights; angle: number }[] = [
  { key: "direct", angle: -0.75 },
  { key: "partnership", angle: 0 },
  { key: "delay", angle: 0.75 },
];

const PANEL_W = 1024;
const PANEL_H = 600;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The zone's name plus, once the team has learned something there, a plain headline. */
function drawPanel(canvas: HTMLCanvasElement, title: string, color: string, finding: ModuleHeadline | null) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, PANEL_W, PANEL_H);
  const gradient = ctx.createLinearGradient(0, 0, 0, PANEL_H);
  gradient.addColorStop(0, "rgba(16,22,34,0.86)");
  gradient.addColorStop(1, "rgba(8,10,18,0.7)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(4, 4, PANEL_W - 8, PANEL_H - 8, 28);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = finding ? 0.9 : 0.35;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = color;
  ctx.font = "600 44px ui-sans-serif, system-ui, -apple-system, Helvetica, Arial";
  ctx.fillText(title, 60, 104);

  if (!finding) {
    ctx.fillStyle = "rgba(220,228,240,0.45)";
    ctx.font = "500 56px ui-sans-serif, system-ui, -apple-system, Helvetica, Arial";
    ctx.fillText("Looking into it…", 60, 330);
    return;
  }
  ctx.fillStyle = "#f2f5fa";
  ctx.font = "650 84px ui-sans-serif, system-ui, -apple-system, Helvetica, Arial";
  const lines = wrapLines(ctx, finding.headline, PANEL_W - 120).slice(0, 2);
  lines.forEach((line, index) => ctx.fillText(line, 60, 250 + index * 96));
  ctx.fillStyle = "rgba(220,228,240,0.78)";
  ctx.font = "500 46px ui-sans-serif, system-ui, -apple-system, Helvetica, Arial";
  wrapLines(ctx, finding.detail, PANEL_W - 120)
    .slice(0, 2)
    .forEach((line, index) => ctx.fillText(line, 60, 250 + lines.length * 96 + 30 + index * 58));
}

function BranchLabel({ text, index }: { text: string; index: number }) {
  const material = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(14,10,24,0.72)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 88, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(185,140,255,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#ece4ff";
    ctx.font = "500 44px ui-sans-serif, system-ui, -apple-system, Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 50);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  }, [text]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  return <sprite material={material} scale={[1.9, 0.36, 1]} position={[0, 1, 0]} renderOrder={10 + index} />;
}

interface ModuleEntry {
  key: string;
  id: ModuleId;
  spec: ModuleSpec;
  start: Vec2;
  startSize: number;
  startCrowd: number;
  bayIndex: number;
}

interface ModuleRigProps {
  entry: ModuleEntry;
  worldRef: RefObject<World>;
  m: StationMaterials;
}

/**
 * One spatial module: its workstation, live panel, evidence shards and optional scenario branches, plus the
 * bay, service arm and Core track that belong to it. The rig is drawn wherever the module's move puts it.
 */
function ModuleRig({ entry, worldRef, m }: ModuleRigProps) {
  const { id, spec, start } = entry;
  const reduced = useReducedMotion();
  const station = spec.station === "platform" ? null : spec.station;
  const top = station ? STATION_SHAPES[station].top : 0;
  const panelY = station ? top + 1.05 : 1.75;
  const panelZ = station ? -0.9 : -0.55;
  const shardLift = station ? top - 0.2 : 0;

  const rig = useRef<Group>(null);
  const fixtures = useRef<Group>(null);
  const group = useRef<Group>(null);
  const column = useRef<Mesh>(null);
  const panel = useRef<Group>(null);
  const shards = useRef<Group>(null);
  const branches = useRef<Group>(null);
  const distance = useRef(Math.hypot(start[0], start[1]));
  const state = useRef({
    x: start[0],
    z: start[1],
    fold: 0,
    activity: 0,
    headline: null as ModuleHeadline | null,
    title: spec.title,
    emphasis: "normal" as ModuleEmphasis,
    pulseAt: -Infinity,
  });
  const viewer = useRef(new Vector3());

  const resources = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = PANEL_W;
    canvas.height = PANEL_H;
    drawPanel(canvas, spec.title, spec.color, null);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return {
      texture,
      panel: new MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
      edge: new MeshStandardMaterial({
        color: spec.color,
        emissive: new Color(spec.color),
        emissiveIntensity: 1.2,
        toneMapped: false,
      }),
      platform: new MeshStandardMaterial({ color: "#151a21", roughness: 0.35, metalness: 0.8 }),
      column: new MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    };
  }, [spec.color, spec.title]);

  useEffect(
    () => () => {
      resources.texture.dispose();
      resources.panel.dispose();
      resources.edge.dispose();
      resources.platform.dispose();
      resources.column.dispose();
    },
    [resources],
  );

  useFrame((frame, delta) => {
    const world = worldRef.current;
    const mod = world.modules[id];
    const s = state.current;
    const dt = Math.min(delta, 0.05);
    const t = frame.clock.elapsedTime;
    if (!rig.current || !group.current) return;
    if (!mod) {
      rig.current.visible = false;
      return;
    }

    const pose = modulePose(mod, world.time);
    let [x, z] = pose.position;
    let lift = pose.lift;
    let carry = pose.carry;
    let footprint = pose.scale;
    let crowd = pose.crowd;
    if (reduced && mod.transit && pose.progress < 1) {
      const leaving = pose.progress < 0.5;
      [x, z] = leaving ? mod.transit.from : mod.position;
      lift = 0;
      carry = leaving ? 1 - pose.progress * 2 : pose.progress * 2 - 1;
      footprint = leaving ? mod.transit.fromScale : mod.restScale;
      crowd = leaving ? mod.transit.fromCrowd : mod.layoutScale;
    }
    s.x = x;
    s.z = z;
    distance.current = Math.hypot(s.x, s.z);
    rig.current.visible = true;
    rig.current.position.set(s.x, lift, s.z);
    rig.current.rotation.y = Math.atan2(-s.x, -s.z);

    const age = world.time - mod.appearedAt;
    const dissolving = mod.removedAt !== null;
    const growth = moduleGrowth(mod, world.time);
    s.fold = MathUtils.damp(s.fold, mod.collapsed ? 1 : 0, 4, dt);
    fixtures.current?.scale.setScalar(Math.max(0.001, crowd * carry));
    const size = growth * footprint * carry;
    group.current.visible = growth > 0.002;
    group.current.scale.set(size, Math.max(size, 0.001), size);

    if (mod.emphasis !== s.emphasis) {
      if (mod.visible && age > MATERIALIZE_SECONDS) s.pulseAt = world.time;
      s.emphasis = mod.emphasis;
    }
    if (column.current) {
      const since = dissolving ? world.time - mod.removedAt! : age;
      const pulse = mod.emphasis === "muted" ? 0.35 : 0.8;
      const flash = mod.visible && since >= 0 ? Math.max(0, 1 - since / 1.6, pulse * (1 - (world.time - s.pulseAt) / 1.2)) : 0;
      resources.column.opacity = flash * 0.55;
      column.current.visible = flash > 0.01;
      column.current.scale.set(1 + (1 - flash) * 0.6, 1, 1 + (1 - flash) * 0.6);
    }

    const headline = moduleHeadline(world, id);
    if (headline !== s.headline || mod.spec.title !== s.title) {
      s.headline = headline;
      s.title = mod.spec.title;
      drawPanel(resources.texture.image as HTMLCanvasElement, s.title, spec.color, headline);
      resources.texture.needsUpdate = true;
    }

    const emphasis = mod.emphasis === "emphasized" ? 0.8 : mod.emphasis === "muted" ? -0.5 : 0;
    s.activity = MathUtils.damp(s.activity, Math.min(mod.activity, 2), 4, dt);
    resources.edge.emissiveIntensity = Math.max(0.3, 0.9 + emphasis + s.activity * 1.4 + Math.sin(t * 4) * 0.15 * s.activity);
    resources.panel.opacity = (0.82 + s.activity * 0.12) * (mod.emphasis === "muted" ? 0.6 : 1) * (1 - s.fold);
    if (panel.current) {
      panel.current.visible = s.fold < 0.98;
      panel.current.position.y = panelY + (reduced ? 0 : Math.sin(t * 0.8 + s.x) * 0.04);
      panel.current.scale.setScalar(Math.max(0.001, 1 - s.fold));
    }

    if (shards.current) {
      const drift = reduced ? 0 : 1;
      shards.current.rotation.y += dt * (0.25 + s.activity * 0.6) * drift;
      shards.current.children.forEach((child, i) => {
        child.visible = i < mod.evidence;
        child.position.y = 0.5 + Math.sin(t * 1.3 + i) * 0.08 * drift + (i % 3) * 0.18;
        child.rotation.x += dt * 1.2 * drift;
      });
    }

    if (branches.current) {
      const weights = isPresent(mod) && !mod.collapsed ? scenarioWeights(world) : null;
      branches.current.visible = weights !== null;
      if (weights && branches.current.parent) {
        const eye = branches.current.parent.worldToLocal(viewer.current.copy(frame.camera.position));
        branches.current.rotation.y = Math.atan2(eye.x, eye.z);
        branches.current.children.forEach((branch, i) => {
          const scenario = SCENARIOS[i];
          const [stem, node] = branch.children as Mesh[];
          if (!scenario || !stem || !node) return;
          const current: number = branch.userData.weight ?? 0;
          const next = MathUtils.damp(current, weights[scenario.key], 2.5, dt);
          branch.userData.weight = next;
          const length = 0.8 + next * 3.2;
          stem.scale.set(0.6 + next * 1.6, length, 0.6 + next * 1.6);
          stem.position.y = length / 2;
          node.position.y = length;
          node.scale.setScalar(0.6 + next * 2.2);
          const label = branch.children[2];
          if (label) label.position.y = length + 0.45;
        });
      }
    }
  });

  return (
    <group ref={rig} position={[start[0], 0, start[1]]}>
      <CoreTrack id={id} spec={spec} worldRef={worldRef} distance={distance} />
      <group ref={fixtures} position={[0, 0, -BAY_OFFSET]} scale={entry.startCrowd}>
        <Bay id={id} spec={spec} index={entry.bayIndex} worldRef={worldRef} m={m} />
        <ServiceArm id={id} spec={spec} worldRef={worldRef} m={m} />
      </group>
      <mesh ref={column} position={[0, 3, 0]} material={resources.column} geometry={geo.tube(1.4, 1.6, 6)} />
      <group ref={group}>
        {station ? (
          <Suspense fallback={null}>
            <ZoneStation id={id} kind={station} worldRef={worldRef} />
          </Suspense>
        ) : (
          <>
            <mesh geometry={geo.cylinder(1.5, 1.62, 0.12, 6)} material={resources.platform} position={[0, 0.06, 0]} />
            <mesh geometry={geo.torus(1.52, 0.018, 6)} material={resources.edge} position={[0, 0.125, 0]} rotation={[Math.PI / 2, 0, Math.PI / 6]} />
            {[-1.2, 1.2].map((px) => (
              <mesh key={px} geometry={geo.box(0.05, 2.3, 0.05)} material={resources.edge} position={[px, 1.2, -0.55]} />
            ))}
          </>
        )}
        <mesh geometry={geo.ring(2.2, 2.24)} material={resources.edge} position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        <group ref={panel} position={[0, panelY, panelZ]}>
          <mesh material={resources.panel} geometry={geo.plane(2.3, 1.35)} />
          <mesh material={resources.platform} geometry={geo.box(2.3, 1.35, 0.03)} position={[0, 0, -0.03]} />
        </group>
        <group ref={shards} position={[0, shardLift, 0.2]}>
          {Array.from({ length: MAX_SHARDS }, (_, i) => {
            const angle = (i / MAX_SHARDS) * Math.PI * 2;
            return (
              <mesh key={i} geometry={geo.octa(0.07)} material={resources.edge} position={[Math.cos(angle) * 0.9, 0.6, Math.sin(angle) * 0.9]} scale={[0.7, 1.3, 0.7]} />
            );
          })}
        </group>
        {spec.surface === "scenarios" && (
          <group ref={branches} position={[0, 0.15, 0.2]} visible={false}>
            {SCENARIOS.map((scenario, i) => (
              <group key={scenario.key} rotation={[0, 0, scenario.angle]}>
                <mesh geometry={geo.cylinder(0.025, 0.04, 1, 10)} material={resources.edge} />
                <mesh geometry={geo.ico(0.1, 1)} material={resources.edge} />
                <BranchLabel text={SCENARIO_LABELS[scenario.key]} index={i} />
              </group>
            ))}
          </group>
        )}
      </group>
    </group>
  );
}

/** Mounts a rig for every module in the world, following creation and removal as they happen. */
export function Modules({ worldRef, m }: { worldRef: RefObject<World>; m: StationMaterials }) {
  const [entries, setEntries] = useState<ModuleEntry[]>([]);
  const seen = useRef<{ world: World | null; version: number }>({ world: null, version: -1 });
  useFrame(() => {
    const world = worldRef.current;
    const last = seen.current;
    if (last.world === world && last.version === world.layoutVersion) return;
    last.world = world;
    last.version = world.layoutVersion;
    setEntries((current) => {
      const keys = world.moduleOrder.map((id) => `${world.cycle}:${id}`);
      if (keys.join("|") === current.map((entry) => entry.key).join("|")) return current;
      return world.moduleOrder.map((id, index) => {
        const existing = current.find((entry) => entry.key === keys[index]);
        if (existing) return existing;
        const mod = world.modules[id]!;
        return {
          key: keys[index]!,
          id,
          spec: mod.spec,
          start: mod.position,
          startSize: moduleScale(mod) * mod.layoutScale,
          startCrowd: mod.layoutScale,
          bayIndex: index,
        };
      });
    });
  });
  return (
    <group>
      {entries.map((entry) => (
        <ModuleRig key={entry.key} entry={entry} worldRef={worldRef} m={m} />
      ))}
    </group>
  );
}
