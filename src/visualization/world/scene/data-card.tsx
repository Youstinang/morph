import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineLoop, LineSegments, MeshBasicMaterial } from "three";
import { geo } from "./geometry";

/** Readable from the default overview, where an agent is about 2.4 units tall. */
export const CARD_WIDTH = 0.84;
export const CARD_HEIGHT = 0.56;
const WIDTH = CARD_WIDTH;
const HEIGHT = CARD_HEIGHT;

export interface CardMaterials {
  body: MeshBasicMaterial;
  bars: MeshBasicMaterial;
  frame: LineBasicMaterial;
}

export function cardMaterials(additive = true): CardMaterials {
  const blending = additive ? AdditiveBlending : undefined;
  return {
    body: new MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false, ...(blending ? { blending } : {}) }),
    bars: new MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, ...(blending ? { blending } : {}) }),
    frame: new LineBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, toneMapped: false, ...(blending ? { blending } : {}) }),
  };
}

export function disposeCardMaterials(materials: CardMaterials) {
  materials.body.dispose();
  materials.bars.dispose();
  materials.frame.dispose();
}

/** Colors a card; `strength` scales brightness and opacity together (0 hides it). */
export function paintCard(materials: CardMaterials, color: Color, strength: number, glow = 1.8) {
  materials.body.color.copy(color).multiplyScalar(glow * 0.6);
  materials.bars.color.copy(color).multiplyScalar(glow);
  materials.frame.color.copy(color).multiplyScalar(glow * 1.2);
  materials.body.opacity = 0.32 * strength;
  materials.bars.opacity = 0.85 * strength;
  materials.frame.opacity = strength;
}

function rectangle() {
  const geometry = new BufferGeometry();
  const w = WIDTH / 2;
  const h = HEIGHT / 2;
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([-w, -h, 0, w, -h, 0, w, h, 0, -w, h, 0]), 3));
  return geometry;
}

function crackLines() {
  const geometry = new BufferGeometry();
  const points = [-0.2, 0.13, -0.06, 0.02, -0.06, 0.02, 0.02, 0.06, 0.02, 0.06, 0.09, -0.05, 0.09, -0.05, 0.2, -0.12, -0.06, 0.02, -0.1, -0.14].map((v) => v * 1.9);
  const positions = new Float32Array((points.length / 2) * 3);
  for (let i = 0; i < points.length / 2; i += 1) positions.set([points[i * 2]!, points[i * 2 + 1]!, 0.002], i * 3);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return geometry;
}

/**
 * A data card: a glass panel with a bright frame and three lines of "content". A cracked card marks work
 * that failed.
 */
export function DataCard({ materials, cracked, crackMaterial }: { materials: CardMaterials; cracked?: boolean; crackMaterial?: LineBasicMaterial }) {
  const frame = useMemo(() => new LineLoop(rectangle(), materials.frame), [materials.frame]);
  const crack = useMemo(() => (cracked && crackMaterial ? new LineSegments(crackLines(), crackMaterial) : null), [cracked, crackMaterial]);
  useEffect(() => () => frame.geometry.dispose(), [frame]);
  useEffect(() => () => crack?.geometry.dispose(), [crack]);
  return (
    <>
      <mesh geometry={geo.plane(WIDTH, HEIGHT)} material={materials.body} />
      <primitive object={frame} />
      {[0.13, 0, -0.13].map((y, i) => (
        <mesh key={i} geometry={geo.plane(i === 0 ? 0.56 : i === 1 ? 0.46 : 0.32, 0.045)} material={materials.bars} position={[-0.07 + (i === 0 ? 0.05 : 0), y, 0.001]} />
      ))}
      {crack ? <primitive object={crack} /> : null}
    </>
  );
}
