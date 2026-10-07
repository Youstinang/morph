import { useEffect, useMemo } from "react";
import { Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { ZONES } from "../sim/roster";
import type { ZoneId } from "../sim/types";

export const CENTER_X = 0.6;
export const CENTER_Z = -3.6;
export const FLOOR_RADIUS = 18.8;
export const WALL_RADIUS = 18.5;
export const RAIL_RADIUS = 18.2;
export const WALL_FROM = Math.PI * 0.9;
export const WALL_TO = Math.PI * 2.1;
export const WALL_HEIGHT = 10.4;
export const BAY_OFFSET = 3.1;

export const NEON = {
  cyan: "#21e4ff",
  pink: "#ff2fa8",
  amber: "#ffb13b",
  violet: "#8b5cff",
} as const;

export function polar(radius: number, angle: number): [number, number] {
  return [CENTER_X + Math.cos(angle) * radius, CENTER_Z + Math.sin(angle) * radius];
}

/** Yaw that points a group's local +Z at the deck centre. */
export function faceCenter(angle: number): number {
  return Math.atan2(-Math.cos(angle), -Math.sin(angle));
}

export interface BayPlacement {
  x: number;
  z: number;
  /** Yaw that points the bay's local +Z at the Intent Core. */
  yaw: number;
  /** Polar angle around the deck centre, normalised to [0.5π, 2.5π). */
  angle: number;
}

export function bayPlacement(id: ZoneId): BayPlacement {
  const [zx, zz] = ZONES[id].position;
  const distance = Math.hypot(zx, zz);
  const x = zx + (zx / distance) * BAY_OFFSET;
  const z = zz + (zz / distance) * BAY_OFFSET;
  let angle = Math.atan2(z - CENTER_Z, x - CENTER_X);
  while (angle < Math.PI * 0.5) angle += Math.PI * 2;
  return { x, z, yaw: Math.atan2(-zx, -zz), angle };
}

export function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export function useDisposable<T extends { dispose: () => void }>(items: T[]) {
  useEffect(() => () => items.forEach((item) => item.dispose()), [items]);
}

export function useStationMaterials() {
  const materials = useMemo(
    () => ({
      hull: new MeshStandardMaterial({ color: "#1a1a26", roughness: 0.38, metalness: 0.85 }),
      panel: new MeshStandardMaterial({ color: "#232233", roughness: 0.5, metalness: 0.65 }),
      trim: new MeshStandardMaterial({ color: "#3b3a52", roughness: 0.28, metalness: 0.9 }),
      dark: new MeshStandardMaterial({ color: "#0b0a12", roughness: 0.8, metalness: 0.4 }),
      strip: new MeshBasicMaterial({ color: new Color(NEON.cyan).multiplyScalar(1.4), toneMapped: false }),
      pink: new MeshBasicMaterial({ color: new Color(NEON.pink).multiplyScalar(1.4), toneMapped: false }),
      amber: new MeshBasicMaterial({ color: new Color(NEON.amber).multiplyScalar(1.3), toneMapped: false }),
      lamp: new MeshBasicMaterial({ color: new Color("#bff6ff").multiplyScalar(1.6), toneMapped: false }),
      seam: new MeshBasicMaterial({ color: "#1e1b2e", toneMapped: false }),
      glass: new MeshBasicMaterial({
        color: "#9a7bff",
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
        side: DoubleSide,
      }),
    }),
    [],
  );
  useDisposable(useMemo(() => Object.values(materials), [materials]));
  return materials;
}

export type StationMaterials = ReturnType<typeof useStationMaterials>;
