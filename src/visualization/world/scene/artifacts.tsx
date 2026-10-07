import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, Color, MeshBasicMaterial, type Group } from "three";
import { AGENTS } from "../sim/roster";
import type { ArtifactFlight, World } from "../sim/types";
import { geo } from "./geometry";

const POOL = 4;
const TRAIL = 7;

function flightPoint(world: World, flight: ArtifactFlight, progress: number) {
  const target = world.agents[flight.to].position;
  const p = Math.min(Math.max(progress, 0), 1);
  const eased = p * p * (3 - 2 * p);
  const x = flight.start[0] + (target[0] - flight.start[0]) * eased;
  const z = flight.start[1] + (target[1] - flight.start[1]) * eased;
  const distance = Math.hypot(target[0] - flight.start[0], target[1] - flight.start[1]);
  const y = 1.25 + Math.sin(Math.PI * p) * (0.8 + distance * 0.18);
  return [x, y, z] as const;
}

export function Artifacts({ worldRef }: { worldRef: RefObject<World> }) {
  const slots = useRef<(Group | null)[]>([]);
  const materials = useMemo(
    () =>
      Array.from(
        { length: POOL },
        () =>
          new MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [],
  );
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  const color = useMemo(() => new Color(), []);

  useFrame((frame) => {
    const world = worldRef.current;
    const t = frame.clock.elapsedTime;
    slots.current.forEach((slot, i) => {
      if (!slot) return;
      const flight = world.artifacts[i];
      slot.visible = Boolean(flight);
      if (!flight) return;
      const progress = (world.time - flight.startedAt) / flight.duration;
      color.set(flight.kind === "flag" ? "#ff4757" : AGENTS[flight.from].look.accent);
      materials[i]!.color.copy(color).multiplyScalar(2.2);
      slot.children.forEach((child, k) => {
        const [x, y, z] = flightPoint(world, flight, progress - k * 0.035);
        child.position.set(x, y, z);
        const scale = k === 0 ? 1 : (1 - k / TRAIL) * 0.7;
        child.scale.setScalar(scale);
        child.rotation.set(t * 3, t * 2.3, 0);
        child.visible = progress - k * 0.035 > 0;
      });
    });
  });

  return (
    <>
      {materials.map((material, i) => (
        <group key={i} ref={(node) => { slots.current[i] = node; }} visible={false}>
          {Array.from({ length: TRAIL }, (_, k) => (
            <mesh key={k} geometry={k === 0 ? geo.octa(0.13) : geo.octa(0.07)} material={material} />
          ))}
        </group>
      ))}
    </>
  );
}
