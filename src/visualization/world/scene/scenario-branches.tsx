import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
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
  type Sprite,
} from "three";
import { useReducedMotion } from "../motion";
import type { ModuleId, World } from "../sim/types";
import { leadingScenario } from "../sim/world";
import { geo } from "./geometry";
import { isPresent } from "./module-fixtures";

const MAX_PATHS = 4;
const BEADS = 3;
const BASE = new Color("#b98cff");
const LEAD = new Color("#f1e6ff");
const RISK = "#ff8f6b";
const SHIFT_SECONDS = 1.4;
const LABEL_W = 640;
const LABEL_H = 128;

function drawLabel(canvas: HTMLCanvasElement, text: string, lead: boolean) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, LABEL_W, LABEL_H);
  ctx.fillStyle = lead ? "rgba(36,22,58,0.86)" : "rgba(14,10,24,0.72)";
  ctx.beginPath();
  ctx.roundRect(4, 4, LABEL_W - 8, LABEL_H - 8, 22);
  ctx.fill();
  ctx.strokeStyle = lead ? "rgba(241,230,255,0.95)" : "rgba(185,140,255,0.5)";
  ctx.lineWidth = lead ? 5 : 3;
  ctx.stroke();
  ctx.fillStyle = lead ? "#ffffff" : "#ddd2f5";
  ctx.font = `${lead ? 650 : 500} 50px ui-sans-serif, system-ui, -apple-system, Helvetica, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let label = text;
  while (ctx.measureText(label).width > LABEL_W - 60 && label.length > 4) label = `${label.slice(0, -2).trimEnd()}…`;
  ctx.fillText(label, LABEL_W / 2, LABEL_H / 2 + 2);
}

/**
 * The Possibility Engine's branches: one per path the team laid out, growing from a shared root. A branch's
 * length and thickness follow the team's assessment, beads along it count the findings it rests on, an
 * amber marker shows it has a named risk, and the path rated highest is lit brighter with a halo. When the
 * assessments shift, the branches flare briefly while they regrow. Calm: no spin or flare, just the change.
 */
export function ScenarioBranches({ id, worldRef }: { id: ModuleId; worldRef: RefObject<World> }) {
  const reduced = useReducedMotion();
  const root = useRef<Group>(null);
  const slots = useRef<(Group | null)[]>([]);
  const viewer = useRef(new Vector3());
  const color = useMemo(() => new Color(), []);
  const branches = useMemo(
    () =>
      Array.from({ length: MAX_PATHS }, () => {
        const canvas = document.createElement("canvas");
        canvas.width = LABEL_W;
        canvas.height = LABEL_H;
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        return {
          canvas,
          texture,
          drawn: "",
          weight: 0,
          stem: new MeshStandardMaterial({ color: BASE, emissive: BASE.clone(), emissiveIntensity: 1, toneMapped: false }),
          label: new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
        };
      }),
    [],
  );
  const shared = useMemo(
    () => ({
      root: new MeshStandardMaterial({ color: LEAD, emissive: BASE.clone(), emissiveIntensity: 1.6, toneMapped: false }),
      risk: new MeshStandardMaterial({ color: RISK, emissive: new Color(RISK), emissiveIntensity: 1.6, toneMapped: false }),
      halo: new MeshBasicMaterial({ color: LEAD, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const branch of branches) {
        branch.texture.dispose();
        branch.stem.dispose();
        branch.label.dispose();
      }
      Object.values(shared).forEach((material) => material.dispose());
    },
    [branches, shared],
  );

  useFrame((frame, delta) => {
    const world = worldRef.current;
    const group = root.current;
    if (!group) return;
    const mod = world.modules[id];
    const paths = mod && isPresent(mod) && !mod.collapsed ? world.story.scenarios.slice(0, MAX_PATHS) : [];
    group.visible = paths.length > 0;
    if (paths.length === 0) {
      for (const branch of branches) branch.weight = 0;
      return;
    }
    const dt = Math.min(delta, 0.05);
    if (group.parent) {
      const eye = group.parent.worldToLocal(viewer.current.copy(frame.camera.position));
      group.rotation.y = Math.atan2(eye.x, eye.z);
    }
    const lead = leadingScenario(world);
    const shift = world.story.scenarioShiftAt;
    const flare = reduced || shift === null ? 0 : Math.max(0, 1 - (world.time - shift) / SHIFT_SECONDS);
    const step = paths.length > 1 ? Math.min(0.75, 1.5 / (paths.length - 1)) : 0;
    const half = (step * (paths.length - 1)) / 2;
    const t = frame.clock.elapsedTime;

    for (let i = 0; i < MAX_PATHS; i += 1) {
      const slot = slots.current[i];
      const branch = branches[i]!;
      const path = paths[i];
      if (!slot) continue;
      slot.visible = Boolean(path);
      if (!path) continue;
      const leading = lead === path.id;
      slot.rotation.z = half - i * step;
      branch.weight = MathUtils.damp(branch.weight, path.weight, 2.5, dt);
      const w = branch.weight;
      const length = 0.8 + w * 3.2;
      const [stem, node, risk, halo, label, ...beads] = slot.children as [Mesh, Mesh, Mesh, Mesh, Sprite, ...Mesh[]];
      stem.scale.set(0.6 + w * 1.6, length, 0.6 + w * 1.6);
      stem.position.y = length / 2;
      const nodeSize = 0.6 + w * 2.2;
      node.position.y = length;
      node.scale.setScalar(nodeSize);
      risk.visible = path.risk !== null;
      risk.position.set(0.16 + nodeSize * 0.1, length - 0.08, 0);
      if (!reduced) risk.rotation.y = t * 1.4;
      halo.visible = leading;
      halo.position.y = length;
      halo.scale.setScalar(nodeSize);
      if (!reduced) halo.rotation.z = t * 0.6;
      label.position.y = length + 0.5;
      beads.forEach((bead, b) => {
        bead.visible = b < path.evidence;
        bead.position.y = length * (0.3 + b * 0.18);
      });
      const key = `${path.label}|${leading}`;
      if (branch.drawn !== key) {
        branch.drawn = key;
        drawLabel(branch.canvas, path.label, leading);
        branch.texture.needsUpdate = true;
      }
      color.copy(BASE).lerp(LEAD, leading ? 0.6 : 0);
      branch.stem.color.copy(color);
      branch.stem.emissive.copy(color);
      branch.stem.emissiveIntensity = (lead === null ? 1 : leading ? 2 : 0.55) + flare * 1.4;
      branch.label.opacity = lead === null || leading ? 1 : 0.72;
    }
  });

  return (
    <group ref={root} position={[0, 0.15, 0.2]} scale={1.3} visible={false}>
      <mesh geometry={geo.octa(0.16)} material={shared.root} />
      {branches.map((branch, i) => (
        <group key={i} ref={(node) => { slots.current[i] = node; }} visible={false}>
          <mesh geometry={geo.cylinder(0.025, 0.04, 1, 10)} material={branch.stem} />
          <mesh geometry={geo.ico(0.1, 1)} material={branch.stem} />
          <mesh geometry={geo.octa(0.07)} material={shared.risk} scale={[0.8, 1.3, 0.8]} />
          <mesh geometry={geo.torus(0.17, 0.008, 40)} material={shared.halo} />
          <sprite material={branch.label} scale={[1.75, 0.35, 1]} renderOrder={10 + i} />
          {Array.from({ length: BEADS }, (_, b) => (
            <mesh key={b} geometry={geo.octa(0.06)} material={shared.root} />
          ))}
        </group>
      ))}
    </group>
  );
}
