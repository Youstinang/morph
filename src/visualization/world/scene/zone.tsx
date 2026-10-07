import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
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
import { ZONES } from "../sim/roster";
import type { ScenarioWeights, World, ZoneId } from "../sim/types";
import { SCENARIO_LABELS, type ZoneHeadline } from "../sim/script";
import { scenarioWeights, zoneHeadline } from "../sim/world";
import { geo } from "./geometry";
import { preloadStationModels, STATION_SHAPES, ZONE_STATIONS, ZoneStation } from "./zone-station";

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
function drawPanel(canvas: HTMLCanvasElement, title: string, color: string, finding: ZoneHeadline | null) {
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

interface ZoneProps {
  id: ZoneId;
  worldRef: RefObject<World>;
}

export function Zone({ id, worldRef }: ZoneProps) {
  const profile = ZONES[id];
  const [x, z] = profile.position;
  const facing = Math.atan2(-x, -z);
  const station = ZONE_STATIONS[id];
  const top = station ? STATION_SHAPES[station].top : 0;
  const panelY = station ? top + 1.05 : 1.75;
  const panelZ = station ? -0.9 : -0.55;
  const shardLift = station ? top - 0.2 : 0;

  const group = useRef<Group>(null);
  const column = useRef<Mesh>(null);
  const panel = useRef<Group>(null);
  const shards = useRef<Group>(null);
  const branches = useRef<Group>(null);
  const state = useRef({ scale: 0, activity: 0, headline: null as ZoneHeadline | null });
  const viewer = useRef(new Vector3());

  const resources = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = PANEL_W;
    canvas.height = PANEL_H;
    drawPanel(canvas, profile.title, profile.color, null);
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
        color: profile.color,
        emissive: new Color(profile.color),
        emissiveIntensity: 1.2,
        toneMapped: false,
      }),
      platform: new MeshStandardMaterial({ color: "#151a21", roughness: 0.35, metalness: 0.8 }),
      column: new MeshBasicMaterial({
        color: profile.color,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    };
  }, [profile.color, profile.title]);

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
    const zone = world.zones[id];
    const s = state.current;
    const dt = Math.min(delta, 0.05);
    const t = frame.clock.elapsedTime;
    if (!group.current) return;

    const age = world.time - zone.appearedAt;
    const target = zone.visible ? MathUtils.smoothstep(age, 0, 1.3) : 0;
    s.scale = zone.visible ? target : MathUtils.damp(s.scale, 0, 6, dt);
    const eased = s.scale < 1 ? 1 - (1 - s.scale) ** 3 : 1;
    group.current.visible = s.scale > 0.002;
    group.current.scale.set(eased, Math.max(eased, 0.001), eased);

    if (column.current) {
      const flash = zone.visible ? Math.max(0, 1 - age / 1.6) : 0;
      resources.column.opacity = flash * 0.55;
      column.current.visible = flash > 0.01;
      column.current.scale.set(1 + (1 - flash) * 0.6, 1, 1 + (1 - flash) * 0.6);
    }

    const headline = zoneHeadline(world, id);
    if (headline !== s.headline) {
      s.headline = headline;
      drawPanel(resources.texture.image as HTMLCanvasElement, profile.title, profile.color, headline);
      resources.texture.needsUpdate = true;
    }

    s.activity = MathUtils.damp(s.activity, Math.min(zone.activity, 2), 4, dt);
    resources.edge.emissiveIntensity = 0.9 + s.activity * 1.4 + Math.sin(t * 4) * 0.15 * s.activity;
    resources.panel.opacity = 0.82 + s.activity * 0.12;
    if (panel.current) panel.current.position.y = panelY + Math.sin(t * 0.8 + x) * 0.04;

    if (shards.current) {
      shards.current.rotation.y += dt * (0.25 + s.activity * 0.6);
      shards.current.children.forEach((child, i) => {
        child.visible = i < zone.evidence;
        child.position.y = 0.5 + Math.sin(t * 1.3 + i) * 0.08 + (i % 3) * 0.18;
        child.rotation.x += dt * 1.2;
      });
    }

    if (branches.current) {
      const weights = scenarioWeights(world);
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
    <group position={[x, 0, z]} rotation={[0, facing, 0]}>
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
        {id === "possibility" && (
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
