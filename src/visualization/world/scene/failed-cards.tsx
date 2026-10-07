import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Color, LineBasicMaterial, type Group } from "three";
import type { World } from "../sim/types";
import { CARD_FADE_SECONDS } from "../sim/world";
import { DataCard, cardMaterials, disposeCardMaterials, paintCard } from "./data-card";

const POOL = 3;
const GREY = new Color("#7d8794");
const RETRY = new Color("#ffc27a");

/**
 * The work an agent was doing when its task failed: a grey, cracked card left hovering at the station. It
 * glows amber while the agent retries and fades once the work is finished. Calm: no motion, no flashing.
 */
export function FailedCards({ worldRef }: { worldRef: RefObject<World> }) {
  const slots = useRef<(Group | null)[]>([]);
  const materials = useMemo(() => Array.from({ length: POOL }, () => cardMaterials(false)), []);
  const cracks = useMemo(() => Array.from({ length: POOL }, () => new LineBasicMaterial({ color: "#ff5a5f", transparent: true, toneMapped: false })), []);
  useEffect(
    () => () => {
      materials.forEach(disposeCardMaterials);
      cracks.forEach((material) => material.dispose());
    },
    [materials, cracks],
  );
  const color = useMemo(() => new Color(), []);

  useFrame(({ camera }) => {
    const world = worldRef.current;
    for (let i = 0; i < POOL; i += 1) {
      const slot = slots.current[i];
      const card = world.failedCards[i];
      if (!slot) continue;
      slot.visible = Boolean(card);
      if (!card) continue;
      const appear = Math.min((world.time - card.failedAt) / 0.4, 1);
      const fade = card.clearedAt === null ? 1 : Math.max(0, 1 - (world.time - card.clearedAt) / CARD_FADE_SECONDS);
      const retrying = world.agents[card.agentId].state === "retrying";
      color.copy(GREY).lerp(RETRY, retrying ? 0.55 : 0);
      paintCard(materials[i]!, color, appear * fade * 0.9, 1.1);
      cracks[i]!.opacity = appear * fade;
      slot.position.set(card.position[0], 1.3 - (1 - appear) * 0.25, card.position[1]);
      slot.quaternion.copy(camera.quaternion);
      slot.rotateZ(-0.18);
    }
  });

  return (
    <>
      {materials.map((material, i) => (
        <group key={i} ref={(node) => { slots.current[i] = node; }} visible={false}>
          <DataCard materials={material} cracked crackMaterial={cracks[i]} />
        </group>
      ))}
    </>
  );
}
