import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import { Color, MathUtils, MeshStandardMaterial, type Mesh, type Object3D } from "three";
import type { World, ZoneId } from "../sim/types";

export type StationKind = "console" | "table" | "hologram";

export interface StationShape {
  url: string;
  /** Uniform scale applied to the 1-unit-tall source model. */
  scale: number;
  /** World-space height of the top of the model, used to float the panel and shards above it. */
  top: number;
}

export const STATION_SHAPES: Record<StationKind, StationShape> = {
  console: { url: "/models/stations/operator-console.glb", scale: 1.15, top: 1.15 },
  table: { url: "/models/stations/war-table.glb", scale: 1.6, top: 1.6 },
  hologram: { url: "/models/stations/hologram-core.glb", scale: 1.9, top: 1.9 },
};

export const ZONE_STATIONS: Partial<Record<ZoneId, StationKind>> = {
  market: "console",
  regulation: "console",
  competition: "table",
  risk: "table",
  economics: "hologram",
};

export function preloadStationModels() {
  for (const shape of Object.values(STATION_SHAPES)) useGLTF.preload(shape.url);
}

/** Screens glow brighter while agents work at the zone; baked texture doubles as the emissive map. */
const IDLE_GLOW = 0.08;
const ACTIVE_GLOW = 0.32;

export function ZoneStation({ id, kind, worldRef }: { id: ZoneId; kind: StationKind; worldRef: RefObject<World> }) {
  const shape = STATION_SHAPES[kind];
  const { scene } = useGLTF(shape.url);
  const { model, materials } = useMemo(() => {
    const copy = scene.clone(true);
    const owned: MeshStandardMaterial[] = [];
    copy.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as MeshStandardMaterial).clone();
      material.emissive = new Color("#ffffff");
      material.emissiveMap = material.map;
      material.emissiveIntensity = IDLE_GLOW;
      mesh.material = material;
      owned.push(material);
    });
    return { model: copy, materials: owned };
  }, [scene]);

  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);

  useFrame((_, delta) => {
    const activity = Math.min(worldRef.current.zones[id].activity, 1);
    const target = IDLE_GLOW + activity * (ACTIVE_GLOW - IDLE_GLOW);
    for (const material of materials) {
      material.emissiveIntensity = MathUtils.damp(material.emissiveIntensity, target, 4, Math.min(delta, 0.05));
    }
  });

  return <primitive object={model} scale={shape.scale} />;
}
