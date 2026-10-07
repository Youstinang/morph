import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  MeshBasicMaterial,
  type Group,
  type Mesh,
} from "three";
import { AGENTS } from "../sim/roster";
import type { ArtifactFlight, ArtifactKind, World } from "../sim/types";
import { CATCH_SECONDS } from "../sim/world";
import { CARD_HEIGHT, CARD_WIDTH, DataCard, cardMaterials, disposeCardMaterials, paintCard, type CardMaterials } from "./data-card";
import { geo } from "./geometry";

const POOL = 4;
const TRAIL = 4;
const BEAM_POINTS = 28;
const FLAG_COLOR = "#ff5a4a";
const HAND_HEIGHT = 1.6;

export const cardColor = (kind: ArtifactKind, from: keyof typeof AGENTS) => (kind === "flag" ? FLAG_COLOR : AGENTS[from].look.accent);

/** Where a card is along its flight: an arc from the giver's hands to the receiver's, wherever they now stand. */
function flightPoint(world: World, flight: ArtifactFlight, progress: number) {
  const target = world.agents[flight.to].position;
  const p = Math.min(Math.max(progress, 0), 1);
  const eased = p * p * (3 - 2 * p);
  const x = flight.start[0] + (target[0] - flight.start[0]) * eased;
  const z = flight.start[1] + (target[1] - flight.start[1]) * eased;
  const distance = Math.hypot(target[0] - flight.start[0], target[1] - flight.start[1]);
  const y = HAND_HEIGHT + Math.sin(Math.PI * p) * (0.7 + distance * 0.16);
  return [x, y, z] as const;
}

/**
 * Handoffs as physical data cards: a card leaves the giver, flies along a faint beam to the receiver, and
 * a pulse at the receiver's feet shows the catch. Flagged work (a critic sending something back) is red.
 */
export function Artifacts({ worldRef }: { worldRef: RefObject<World> }) {
  const slots = useRef<(Group | null)[]>([]);
  const trails = useRef<(Mesh | null)[][]>(Array.from({ length: POOL }, () => []));
  const pulses = useRef<(Mesh | null)[]>([]);

  const cards = useMemo(() => Array.from({ length: POOL }, () => cardMaterials()), []);
  const ghosts = useMemo(
    () => Array.from({ length: POOL }, () => new MeshBasicMaterial({ transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, toneMapped: false })),
    [],
  );
  const beams = useMemo(
    () =>
      Array.from({ length: POOL }, () => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array(BEAM_POINTS * 3), 3));
        const line = new Line(geometry, new LineBasicMaterial({ transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
        line.frustumCulled = false;
        return line;
      }),
    [],
  );
  const pulseMaterials = useMemo(
    () => Array.from({ length: POOL }, () => new MeshBasicMaterial({ transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false })),
    [],
  );
  useEffect(
    () => () => {
      cards.forEach(disposeCardMaterials);
      ghosts.forEach((material) => material.dispose());
      beams.forEach((beam) => {
        beam.geometry.dispose();
        (beam.material as LineBasicMaterial).dispose();
      });
      pulseMaterials.forEach((material) => material.dispose());
    },
    [cards, ghosts, beams, pulseMaterials],
  );
  const color = useMemo(() => new Color(), []);

  useFrame(({ camera }) => {
    const world = worldRef.current;
    for (let i = 0; i < POOL; i += 1) {
      const slot = slots.current[i];
      const beam = beams[i]!;
      const flight = world.artifacts[i];
      if (slot) slot.visible = Boolean(flight);
      beam.visible = Boolean(flight);
      if (!slot || !flight) continue;
      const progress = (world.time - flight.startedAt) / flight.duration;
      color.set(cardColor(flight.kind, flight.from));
      paintCard(cards[i] as CardMaterials, color, 1);
      ghosts[i]!.color.copy(color).multiplyScalar(1.4);

      const [x, y, z] = flightPoint(world, flight, progress);
      slot.position.set(x, y, z);
      slot.quaternion.copy(camera.quaternion);
      slot.scale.setScalar(0.75 + Math.min(progress * 4, 1) * 0.25);
      trails.current[i]!.forEach((ghost, k) => {
        if (!ghost) return;
        const behind = progress - (k + 1) * 0.06;
        ghost.visible = behind > 0;
        const [gx, gy, gz] = flightPoint(world, flight, behind);
        ghost.position.set(gx, gy, gz);
        ghost.quaternion.copy(camera.quaternion);
        ghost.scale.setScalar(1 - (k + 1) / (TRAIL + 1));
      });

      const positions = beam.geometry.getAttribute("position") as BufferAttribute;
      for (let k = 0; k < BEAM_POINTS; k += 1) {
        const [bx, by, bz] = flightPoint(world, flight, k / (BEAM_POINTS - 1));
        positions.setXYZ(k, bx, by, bz);
      }
      positions.needsUpdate = true;
      const material = beam.material as LineBasicMaterial;
      material.color.copy(color);
      material.opacity = 0.12 + Math.sin(Math.PI * Math.min(Math.max(progress, 0), 1)) * 0.4;
    }

    for (let i = 0; i < POOL; i += 1) {
      const pulse = pulses.current[i];
      const caught = world.catches[i];
      if (!pulse) continue;
      pulse.visible = Boolean(caught);
      if (!caught) continue;
      const age = (world.time - caught.at) / CATCH_SECONDS;
      const receiver = world.agents[caught.agentId];
      pulse.position.set(receiver.position[0], 0.04, receiver.position[1]);
      pulse.scale.setScalar(1 + age * 1.6);
      pulseMaterials[i]!.color.set(cardColor(caught.kind, caught.from)).multiplyScalar(1.8);
      pulseMaterials[i]!.opacity = (1 - age) * 0.9;
    }
  });

  return (
    <>
      {beams.map((beam, i) => (
        <primitive key={`beam-${i}`} object={beam} />
      ))}
      {cards.map((materials, i) => (
        <group key={`card-${i}`}>
          <group ref={(node) => { slots.current[i] = node; }} visible={false}>
            <DataCard materials={materials} />
          </group>
          {Array.from({ length: TRAIL }, (_, k) => (
            <mesh
              key={k}
              ref={(node) => { trails.current[i]![k] = node; }}
              geometry={geo.plane(CARD_WIDTH, CARD_HEIGHT)}
              material={ghosts[i]}
              visible={false}
            />
          ))}
        </group>
      ))}
      {pulseMaterials.map((material, i) => (
        <mesh
          key={`pulse-${i}`}
          ref={(node) => { pulses.current[i] = node; }}
          geometry={geo.ring(0.55, 0.68)}
          material={material}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        />
      ))}
    </>
  );
}
