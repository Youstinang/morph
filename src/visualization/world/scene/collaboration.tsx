import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Line, LineBasicMaterial, MathUtils, MeshBasicMaterial, type Group, type Mesh } from "three";
import { useReducedMotion } from "../motion";
import { AGENTS } from "../sim/roster";
import type { AgentId, Vec2, World } from "../sim/types";
import { collaborations } from "../sim/world";
import { geo } from "./geometry";

const GROUPS = 2;
const MEMBERS = 4;
const DOTS = 6;
const HUB_HEIGHT = 2.1;
/** The Intent Core's centre height; at the Core, streams flow into its shell instead of a hologram. */
const CORE_HEIGHT = 2.3;
const CHEST = 1.45;

const additive = () => new MeshBasicMaterial({ transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

interface Slot {
  strength: number;
  hub: Vec2;
  members: AgentId[];
  atCore: boolean;
}

/**
 * Agents working together share a temporary hologram: a small rotating structure floats between them and
 * each agent's data stream flows into it. At the Core their streams flow into the Core itself. It appears
 * only while the world shows them collaborating.
 */
export function Collaborations({ worldRef }: { worldRef: RefObject<World> }) {
  const calm = useReducedMotion();
  const hubs = useRef<(Group | null)[]>([]);
  const spinners = useRef<(Group | null)[]>([]);
  const floors = useRef<(Mesh | null)[]>([]);
  const dots = useRef<(Mesh | null)[][][]>(Array.from({ length: GROUPS }, () => Array.from({ length: MEMBERS }, () => [])));
  const slots = useRef<Slot[]>(Array.from({ length: GROUPS }, () => ({ strength: 0, hub: [0, 0], members: [], atCore: false })));

  const hubMaterials = useMemo(() => Array.from({ length: GROUPS }, additive), []);
  const wireMaterials = useMemo(() => Array.from({ length: GROUPS }, () => Object.assign(additive(), { wireframe: true })), []);
  const floorMaterials = useMemo(() => Array.from({ length: GROUPS }, additive), []);
  const dotMaterials = useMemo(() => Array.from({ length: GROUPS }, () => Array.from({ length: MEMBERS }, additive)), []);
  const streams = useMemo(
    () =>
      Array.from({ length: GROUPS }, () =>
        Array.from({ length: MEMBERS }, () => {
          const geometry = new BufferGeometry();
          geometry.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
          const line = new Line(geometry, new LineBasicMaterial({ transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
          line.frustumCulled = false;
          return line;
        }),
      ),
    [],
  );
  useEffect(
    () => () => {
      [...hubMaterials, ...wireMaterials, ...floorMaterials, ...dotMaterials.flat()].forEach((material) => material.dispose());
      streams.flat().forEach((line) => {
        line.geometry.dispose();
        (line.material as LineBasicMaterial).dispose();
      });
    },
    [hubMaterials, wireMaterials, floorMaterials, dotMaterials, streams],
  );
  const mix = useMemo(() => new Color(), []);
  const tint = useMemo(() => new Color(), []);

  useFrame((frame, delta) => {
    const world = worldRef.current;
    const t = frame.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    const groups = collaborations(world).slice(0, GROUPS);
    for (let g = 0; g < GROUPS; g += 1) {
      const slot = slots.current[g]!;
      const group = groups[g];
      if (group) {
        slot.hub = group.hub;
        slot.members = group.agents.slice(0, MEMBERS);
        slot.atCore = group.atCore;
      }
      slot.strength = MathUtils.damp(slot.strength, group ? 1 : 0, group ? 4 : 6, dt);
      const s = slot.strength;
      const hub = hubs.current[g];
      if (!hub) continue;
      hub.visible = s > 0.01 && !slot.atCore;
      if (floors.current[g]) floors.current[g]!.visible = s > 0.01 && !slot.atCore;
      if (s <= 0.01) {
        streams[g]!.forEach((line) => (line.visible = false));
        continue;
      }

      mix.setRGB(0, 0, 0);
      for (const id of slot.members) mix.add(tint.set(AGENTS[id].look.accent).multiplyScalar(1 / slot.members.length));
      hub.position.set(slot.hub[0], slot.atCore ? CORE_HEIGHT : HUB_HEIGHT + (calm ? 0 : Math.sin(t * 1.6) * 0.06), slot.hub[1]);
      hub.scale.setScalar(0.6 + s * 0.4);
      if (!calm && spinners.current[g]) spinners.current[g]!.rotation.set(t * 0.5, t * 0.9, 0);
      hubMaterials[g]!.color.copy(mix).multiplyScalar(2);
      hubMaterials[g]!.opacity = 0.8 * s;
      wireMaterials[g]!.color.copy(mix).multiplyScalar(2.4);
      wireMaterials[g]!.opacity = 0.9 * s;
      floors.current[g]!.position.set(slot.hub[0], 0.035, slot.hub[1]);
      floorMaterials[g]!.color.copy(mix).multiplyScalar(1.4);
      floorMaterials[g]!.opacity = 0.45 * s;

      for (let m = 0; m < MEMBERS; m += 1) {
        const line = streams[g]![m]!;
        const id = slot.members[m];
        line.visible = Boolean(id);
        dots.current[g]![m]!.forEach((dot) => dot && (dot.visible = Boolean(id)));
        if (!id) continue;
        const agent = world.agents[id];
        const from = [agent.position[0], CHEST, agent.position[1]] as const;
        const to = [hub.position.x, hub.position.y, hub.position.z] as const;
        const positions = line.geometry.getAttribute("position") as BufferAttribute;
        positions.setXYZ(0, ...from);
        positions.setXYZ(1, ...to);
        positions.needsUpdate = true;
        const color = tint.set(AGENTS[id].look.accent);
        (line.material as LineBasicMaterial).color.copy(color).multiplyScalar(1.6);
        (line.material as LineBasicMaterial).opacity = 0.45 * s;
        dotMaterials[g]![m]!.color.copy(color).multiplyScalar(2.2);
        dotMaterials[g]![m]!.opacity = s;
        dots.current[g]![m]!.forEach((dot, k) => {
          if (!dot) return;
          const p = calm ? (k + 0.5) / DOTS : (t * 0.7 + k / DOTS) % 1;
          dot.position.set(from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p, from[2] + (to[2] - from[2]) * p);
          dot.scale.setScalar(0.6 + Math.sin(Math.PI * p) * 0.6);
        });
      }
    }
  });

  return (
    <>
      {hubMaterials.map((material, g) => (
        <group key={g}>
          <group ref={(node) => { hubs.current[g] = node; }} visible={false}>
            <mesh geometry={geo.ring(0.56, 0.62)} material={material} rotation={[-Math.PI / 2, 0, 0]} />
            <group ref={(node) => { spinners.current[g] = node; }}>
              <mesh geometry={geo.ico(0.36, 1)} material={wireMaterials[g]} />
              <mesh geometry={geo.arc(0.48, 0.014, Math.PI * 1.3)} material={material} rotation={[0.6, 0, 0]} />
            </group>
          </group>
          <mesh ref={(node) => { floors.current[g] = node; }} geometry={geo.ring(0.9, 0.98)} material={floorMaterials[g]} rotation={[-Math.PI / 2, 0, 0]} visible={false} />
          {streams[g]!.map((line, m) => (
            <group key={m}>
              <primitive object={line} />
              {Array.from({ length: DOTS }, (_, k) => (
                <mesh key={k} ref={(node) => { dots.current[g]![m]![k] = node; }} geometry={geo.octa(0.075)} material={dotMaterials[g]![m]} visible={false} />
              ))}
            </group>
          ))}
        </group>
      ))}
    </>
  );
}
