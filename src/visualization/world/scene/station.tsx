import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointsMaterial,
  SRGBColorSpace,
  type Mesh,
} from "three";
import { ZONES, ZONE_ORDER } from "../sim/roster";
import type { World, ZoneId } from "../sim/types";
import { geo } from "./geometry";
import { Machinery } from "./station-machinery";
import {
  CENTER_X,
  CENTER_Z,
  FLOOR_RADIUS,
  NEON,
  RAIL_RADIUS,
  WALL_FROM,
  WALL_HEIGHT,
  WALL_RADIUS,
  WALL_TO,
  bayPlacement,
  faceCenter,
  polar,
  seeded,
  useDisposable,
  useStationMaterials,
  type StationMaterials,
} from "./station-layout";

const RIBS = 24;
const TRACK_START = 3.1;
const EVIDENCE_FOR_FULL_ARCHIVE = 22;

const TOWER_ANGLES = [0.97, 1.12, 1.3, 1.44, 1.58, 1.71, 1.88, 2.03].map((k) => k * Math.PI);
const CONSOLE_ANGLES = [1.05, 1.2, 1.37, 1.64, 1.8, 1.95].map((k) => k * Math.PI);

function DeckFloor({ reflections, m }: { reflections: boolean; m: StationMaterials }) {
  const radialSeams = useMemo(() => Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTER_X, 0, CENTER_Z]} geometry={geo.circle(FLOOR_RADIUS)}>
        {reflections ? (
          <MeshReflectorMaterial
            resolution={512}
            mixBlur={1}
            mixStrength={3.2}
            blur={[180, 50]}
            mirror={0.8}
            roughness={0.55}
            metalness={0.6}
            depthScale={0.6}
            minDepthThreshold={0.35}
            maxDepthThreshold={1.4}
            color="#0a0912"
          />
        ) : (
          <meshStandardMaterial color="#0a0912" roughness={0.35} metalness={0.6} />
        )}
      </mesh>
      {[6.5, 12.6, 15.8].map((radius) => (
        <mesh
          key={radius}
          geometry={geo.ring(radius, radius + 0.035, 128)}
          material={m.seam}
          position={[CENTER_X, 0.004, CENTER_Z]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}
      <mesh
        geometry={geo.ring(17.4, 17.55, 128)}
        material={m.pink}
        position={[CENTER_X, 0.005, CENTER_Z]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {radialSeams.map((angle) => {
        const [x, z] = polar(11.2, angle);
        return (
          <mesh
            key={angle}
            geometry={geo.box(0.035, 0.002, 12.6)}
            material={m.seam}
            position={[x, 0.004, z]}
            rotation={[0, faceCenter(angle), 0]}
          />
        );
      })}
      {/* Core dais: recessed disc with a soft double edge. */}
      <mesh geometry={geo.circle(3.3)} material={m.dark} position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.ring(3.3, 3.36, 96)} material={m.strip} position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.ring(3.62, 3.66, 96)} material={m.pink} position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.ring(16.9, 16.94, 128)} material={m.strip} position={[CENTER_X, 0.005, CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}

function WallSegment({ angle, width, index, m }: { angle: number; width: number; index: number; m: StationMaterials }) {
  const [x, z] = polar(WALL_RADIUS, angle);
  const band = index % 3 === 0 ? m.pink : m.strip;
  return (
    <group position={[x, 0, z]} rotation={[0, faceCenter(angle), 0]}>
      <mesh geometry={geo.box(width, 2.3, 0.5)} material={m.panel} position={[0, 1.15, 0]} />
      <mesh geometry={geo.box(width * 0.7, 0.9, 0.06)} material={m.dark} position={[0, 1.05, 0.26]} />
      {[-0.22, 0, 0.22].map((dy) => (
        <mesh key={dy} geometry={geo.box(width * 0.62, 0.05, 0.02)} material={m.hull} position={[0, 1.05 + dy, 0.3]} />
      ))}
      <mesh geometry={geo.box(width, 0.07, 0.08)} material={band} position={[0, 2.34, 0.24]} />
      <mesh geometry={geo.box(width * 0.5, 0.03, 0.04)} material={m.amber} position={[0, 0.3, 0.27]} />
      <mesh geometry={geo.plane(width, 5.9)} material={m.glass} position={[0, 5.35, 0]} />
      <mesh geometry={geo.box(width, 0.06, 0.12)} material={m.trim} position={[0, 5.35, 0]} />
      <mesh geometry={geo.box(width, 1.9, 0.6)} material={m.panel} position={[0, WALL_HEIGHT - 0.95, 0]} />
      <mesh geometry={geo.box(width, 0.06, 0.08)} material={index % 2 === 0 ? m.strip : m.pink} position={[0, WALL_HEIGHT - 1.95, 0.3]} />
    </group>
  );
}

function Rib({ angle, index, m }: { angle: number; index: number; m: StationMaterials }) {
  const [x, z] = polar(WALL_RADIUS - 0.15, angle);
  return (
    <group position={[x, 0, z]} rotation={[0, faceCenter(angle), 0]}>
      <mesh geometry={geo.box(0.55, WALL_HEIGHT + 0.6, 0.8)} material={m.hull} position={[0, (WALL_HEIGHT + 0.6) / 2, 0]} />
      <mesh geometry={geo.box(0.7, 0.5, 1.2)} material={m.trim} position={[0, 0.25, 0.1]} />
      <mesh geometry={geo.box(0.07, 6.2, 0.04)} material={index % 2 === 0 ? m.pink : m.strip} position={[0, 5.2, 0.42]} />
      <mesh geometry={geo.box(0.3, 0.04, 0.04)} material={m.amber} position={[0, 1.6, 0.42]} />
      <mesh geometry={geo.box(0.42, 0.55, 5.2)} material={m.hull} position={[0, WALL_HEIGHT + 0.6, 2.4]} />
    </group>
  );
}

function Shell({ m }: { m: StationMaterials }) {
  const step = (WALL_TO - WALL_FROM) / (RIBS - 1);
  const width = 2 * WALL_RADIUS * Math.sin(step / 2);
  const ribs = Array.from({ length: RIBS }, (_, i) => WALL_FROM + i * step);
  const railArc = Math.PI * 2 - (WALL_TO - WALL_FROM);
  const posts = Array.from({ length: 14 }, (_, i) => WALL_TO + ((i + 0.5) / 14) * railArc);
  return (
    <group>
      {ribs.map((angle, i) => (
        <Rib key={angle} angle={angle} index={i} m={m} />
      ))}
      {ribs.slice(1).map((angle, i) => (
        <WallSegment key={angle} angle={angle - step / 2} width={width} index={i} m={m} />
      ))}
      <group position={[CENTER_X, 0, CENTER_Z]} rotation={[0, -WALL_TO, 0]}>
        {[0.55, 1.05].map((y) => (
          <mesh key={y} geometry={geo.arc(RAIL_RADIUS, 0.035, railArc)} material={y > 1 ? m.trim : m.hull} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
        ))}
        <mesh geometry={geo.arc(RAIL_RADIUS - 0.1, 0.02, railArc)} material={m.pink} position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={geo.arc(RAIL_RADIUS, 0.012, railArc)} material={m.strip} position={[0, 1.1, 0]} rotation={[Math.PI / 2, 0, 0]} />
      </group>
      {posts.map((angle) => {
        const [x, z] = polar(RAIL_RADIUS, angle);
        return <mesh key={angle} geometry={geo.box(0.07, 1.1, 0.07)} material={m.trim} position={[x, 0.55, z]} />;
      })}
    </group>
  );
}

function drawConsole(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#08111b";
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = "rgba(120,170,220,0.5)";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 504, 280);
  const random = seeded(7);
  ctx.fillStyle = "rgba(150,195,240,0.75)";
  ctx.font = "500 22px ui-monospace, Menlo, monospace";
  ctx.fillText("DECK SYSTEMS", 22, 40);
  for (let row = 0; row < 6; row += 1) {
    ctx.globalAlpha = 0.25 + random() * 0.4;
    ctx.fillRect(22, 66 + row * 30, 120 + random() * 200, 10);
  }
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = "#7fb6e8";
  ctx.beginPath();
  ctx.arc(420, 150, 54, -Math.PI / 2, Math.PI * (0.4 + random()));
  ctx.stroke();
  ctx.globalAlpha = 1;
  return canvas;
}

function Consoles({ m }: { m: StationMaterials }) {
  const screen = useMemo(() => {
    const texture = new CanvasTexture(drawConsole());
    texture.colorSpace = SRGBColorSpace;
    return { texture, material: new MeshBasicMaterial({ map: texture, toneMapped: false }) };
  }, []);
  useDisposable(useMemo(() => [screen.texture, screen.material], [screen]));
  return (
    <group>
      {CONSOLE_ANGLES.map((angle) => {
        const [x, z] = polar(16.4, angle);
        return (
          <group key={angle} position={[x, 0, z]} rotation={[0, faceCenter(angle), 0]}>
            <mesh geometry={geo.box(1.6, 0.95, 0.7)} material={m.panel} position={[0, 0.475, 0]} />
            <mesh geometry={geo.box(1.7, 0.06, 0.85)} material={m.trim} position={[0, 0.98, 0.05]} />
            <mesh geometry={geo.box(1.5, 0.02, 0.05)} material={m.strip} position={[0, 0.2, 0.36]} />
            <group position={[0, 1.42, -0.12]} rotation={[-0.38, 0, 0]}>
              <mesh geometry={geo.box(1.46, 0.84, 0.05)} material={m.dark} />
              <mesh geometry={geo.plane(1.36, 0.76)} material={screen.material} position={[0, 0, 0.03]} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** Archive towers fill with the total evidence gathered across all zones. */
function ArchiveTowers({ worldRef, m }: { worldRef: RefObject<World>; m: StationMaterials }) {
  const fills = useRef<(Mesh | null)[]>([]);
  const level = useRef(0);
  const fill = useMemo(() => new MeshBasicMaterial({ color: "#8fd0ff", toneMapped: false }), []);
  useDisposable(useMemo(() => [fill], [fill]));

  useFrame((_, delta) => {
    const world = worldRef.current;
    let evidence = 0;
    for (const id of ZONE_ORDER) evidence += world.zones[id].evidence;
    level.current = MathUtils.damp(level.current, Math.min(evidence / EVIDENCE_FOR_FULL_ARCHIVE, 1), 2, Math.min(delta, 0.05));
    fills.current.forEach((mesh, i) => {
      if (!mesh) return;
      const share = MathUtils.clamp(level.current * TOWER_ANGLES.length - i * 0.55, 0, 1);
      mesh.visible = share > 0.01;
      mesh.scale.y = Math.max(share, 0.001);
      mesh.position.y = 0.6 + (4.4 * share) / 2;
    });
  });

  return (
    <group>
      {TOWER_ANGLES.map((angle, i) => {
        const [x, z] = polar(17.1, angle);
        return (
          <group key={angle} position={[x, 0, z]} rotation={[0, faceCenter(angle), 0]}>
            <mesh geometry={geo.box(1, 5.8, 0.9)} material={m.hull} position={[0, 2.9, 0]} />
            <mesh geometry={geo.box(1.1, 0.25, 1)} material={m.trim} position={[0, 5.85, 0]} />
            <mesh geometry={geo.box(0.22, 4.4, 0.02)} material={m.dark} position={[0, 2.8, 0.46]} />
            <mesh
              ref={(mesh) => {
                fills.current[i] = mesh;
              }}
              geometry={geo.box(0.16, 4.4, 0.02)}
              material={fill}
              position={[0, 0.6, 0.475]}
              visible={false}
            />
            {[-0.33, 0.33].map((px) => (
              <mesh key={px} geometry={geo.box(0.05, 4.8, 0.02)} material={m.seam} position={[px, 2.9, 0.46]} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

function drawBayLabel(index: number, title: string, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0b1118";
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 64);
  ctx.font = "600 28px ui-monospace, Menlo, monospace";
  ctx.fillText(`BAY ${String(index + 1).padStart(2, "0")}`, 26, 42);
  ctx.fillStyle = "#c9d6e3";
  ctx.font = "500 26px ui-sans-serif, system-ui, Helvetica, Arial";
  ctx.fillText(title.toUpperCase(), 170, 42);
  return canvas;
}

/** Docking bay behind each zone; doors open when the zone materializes. */
function Bay({ id, index, worldRef, m }: { id: ZoneId; index: number; worldRef: RefObject<World>; m: StationMaterials }) {
  const profile = ZONES[id];
  const { x, z, yaw } = bayPlacement(id);

  const left = useRef<Mesh>(null);
  const right = useRef<Mesh>(null);
  const open = useRef(0);
  const resources = useMemo(() => {
    const texture = new CanvasTexture(drawBayLabel(index, profile.title, profile.color));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return {
      texture,
      label: new MeshBasicMaterial({ map: texture, toneMapped: false }),
      glow: new MeshBasicMaterial({ color: profile.color, transparent: true, opacity: 0, toneMapped: false }),
      edge: new MeshBasicMaterial({ color: new Color(profile.color).multiplyScalar(0.55), toneMapped: false }),
    };
  }, [index, profile.color, profile.title]);
  useDisposable(useMemo(() => Object.values(resources), [resources]));

  useFrame((_, delta) => {
    const zone = worldRef.current.zones[id];
    open.current = MathUtils.damp(open.current, zone.visible ? 1 : 0, 2.4, Math.min(delta, 0.05));
    const shift = open.current * 1.15;
    if (left.current) left.current.position.x = -0.62 - shift;
    if (right.current) right.current.position.x = 0.62 + shift;
    resources.glow.opacity = open.current * (0.32 + Math.min(zone.activity, 2) * 0.12);
  });

  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <mesh geometry={geo.box(3.6, 0.1, 1.6)} material={m.panel} position={[0, 0.05, 0.3]} />
      <mesh geometry={geo.box(3.2, 0.012, 0.05)} material={resources.edge} position={[0, 0.105, 1.08]} />
      {[-1.72, 1.72].map((px) => (
        <group key={px} position={[px, 0, 0]}>
          <mesh geometry={geo.box(0.36, 4, 0.6)} material={m.hull} position={[0, 2, 0]} />
          <mesh geometry={geo.box(0.05, 3.2, 0.02)} material={resources.edge} position={[px > 0 ? -0.19 : 0.19, 2, 0.31]} />
        </group>
      ))}
      <mesh geometry={geo.box(3.8, 0.55, 0.7)} material={m.hull} position={[0, 4.2, 0]} />
      <mesh geometry={geo.plane(2.6, 0.32)} material={resources.label} position={[0, 4.2, 0.36]} />
      <mesh geometry={geo.plane(3.08, 3.7)} material={resources.glow} position={[0, 1.95, -0.2]} />
      <mesh ref={left} geometry={geo.box(1.24, 3.7, 0.12)} material={m.panel} position={[-0.62, 1.95, 0]} />
      <mesh ref={right} geometry={geo.box(1.24, 3.7, 0.12)} material={m.panel} position={[0.62, 1.95, 0]} />
    </group>
  );
}

/** Floor light-tracks from the Core to each zone; lit while the zone exists, brighter while it is worked. */
function LightTracks({ worldRef }: { worldRef: RefObject<World> }) {
  const materials = useMemo(
    () =>
      Object.fromEntries(
        ZONE_ORDER.map((id) => [
          id,
          new MeshBasicMaterial({
            color: ZONES[id].color,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          }),
        ]),
      ) as Record<ZoneId, MeshBasicMaterial>,
    [],
  );
  const groove = useMemo(() => new MeshBasicMaterial({ color: "#121a24", toneMapped: false }), []);
  useDisposable(useMemo(() => [...Object.values(materials), groove], [materials, groove]));

  useFrame((_, delta) => {
    const world = worldRef.current;
    const dt = Math.min(delta, 0.05);
    for (const id of ZONE_ORDER) {
      const zone = world.zones[id];
      const target = zone.visible ? 0.28 + Math.min(zone.activity, 2) * 0.3 : 0;
      const material = materials[id];
      material.opacity = MathUtils.damp(material.opacity, target, 3, dt);
      material.visible = material.opacity > 0.01;
    }
  });

  return (
    <group>
      {ZONE_ORDER.map((id) => {
        const [zx, zz] = ZONES[id].position;
        const length = Math.hypot(zx, zz) - TRACK_START - 2.4;
        return (
          <group key={id} rotation={[0, Math.atan2(zx, zz), 0]}>
            {[-0.34, 0.34].map((px) => (
              <group key={px} position={[px, 0, TRACK_START + length / 2]} rotation={[-Math.PI / 2, 0, 0]}>
                <mesh geometry={geo.plane(0.14, length)} material={groove} position={[0, 0, 0.004]} />
                <mesh geometry={geo.plane(0.05, length)} material={materials[id]} position={[0, 0, 0.007]} />
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function drawPlanet(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const ocean = ctx.createLinearGradient(0, 0, 0, 512);
  ocean.addColorStop(0, "#1a3f66");
  ocean.addColorStop(0.5, "#21507f");
  ocean.addColorStop(1, "#163a5e");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, 1024, 512);
  const random = seeded(31);
  for (let i = 0; i < 70; i += 1) {
    const x = random() * 1024;
    const y = 90 + random() * 330;
    const r = 18 + random() * 70;
    ctx.fillStyle = `rgba(${70 + random() * 30}, ${88 + random() * 30}, ${100 + random() * 30}, 0.5)`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = "rgba(225,238,252,0.22)";
    ctx.fillRect(0, random() * 512, 1024, 2 + random() * 9);
  }
  return canvas;
}

function drawCityLights(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 1024, 512);
  const random = seeded(57);
  for (let cluster = 0; cluster < 40; cluster += 1) {
    const cx = random() * 1024;
    const cy = 110 + random() * 300;
    const color = random() > 0.6 ? "rgba(90,230,255,0.9)" : random() > 0.4 ? "rgba(255,80,190,0.85)" : "rgba(255,190,90,0.9)";
    ctx.fillStyle = color;
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect(cx + (random() - 0.5) * 60, cy + (random() - 0.5) * 30, 1.6, 1.6);
    }
  }
  return canvas;
}

function drawNebula(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#04030a";
  ctx.fillRect(0, 0, 1024, 512);
  const random = seeded(73);
  const tints = ["255,47,168", "139,92,255", "33,228,255", "120,40,200"];
  for (let i = 0; i < 26; i += 1) {
    const x = random() * 1024;
    const y = 120 + random() * 220;
    const r = 60 + random() * 180;
    const tint = tints[i % tints.length]!;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, `rgba(${tint},${0.16 + random() * 0.14})`);
    cloud.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = cloud;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvas;
}

/** The view through the panoramic window: nebula, a lit planet limb and a fixed starfield. */
function Space() {
  const resources = useMemo(() => {
    const random = seeded(101);
    const positions: number[] = [];
    while (positions.length < 2200 * 3) {
      const theta = random() * Math.PI * 2;
      const y = random() * 1.1 - 0.15;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const px = Math.cos(theta) * r;
      const pz = Math.sin(theta) * r;
      if (pz > 0.35) continue;
      positions.push(px * 130, y * 130, pz * 130);
    }
    const stars = new BufferGeometry();
    stars.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const texture = new CanvasTexture(drawPlanet());
    texture.colorSpace = SRGBColorSpace;
    const lights = new CanvasTexture(drawCityLights());
    lights.colorSpace = SRGBColorSpace;
    const nebulaTexture = new CanvasTexture(drawNebula());
    nebulaTexture.colorSpace = SRGBColorSpace;
    return {
      stars,
      starMaterial: new PointsMaterial({ color: "#d4e2ff", size: 0.32, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85 }),
      texture,
      lights,
      nebulaTexture,
      nebula: new MeshBasicMaterial({ map: nebulaTexture, side: BackSide, fog: false, depthWrite: false }),
      planet: new MeshStandardMaterial({
        map: texture,
        emissiveMap: lights,
        emissive: new Color("#ffffff"),
        emissiveIntensity: 1.4,
        roughness: 1,
        metalness: 0,
        fog: false,
      }),
      atmosphere: new MeshBasicMaterial({
        color: "#7a6bff",
        transparent: true,
        opacity: 0.4,
        side: BackSide,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    };
  }, []);
  useDisposable(useMemo(() => Object.values(resources), [resources]));

  return (
    <group>
      <mesh geometry={geo.sphere(145, 48)} material={resources.nebula} position={[CENTER_X, 0, CENTER_Z]} renderOrder={-1} />
      <points geometry={resources.stars} material={resources.starMaterial} />
      <group position={[-22, -66, -150]} rotation={[0.3, 0.6, 0.2]}>
        <mesh geometry={geo.sphere(70, 64)} material={resources.planet} />
        <mesh geometry={geo.sphere(73.5, 64)} material={resources.atmosphere} />
      </group>
    </group>
  );
}

const SIGNS: { rib: number; text: string; color: string }[] = [
  { rib: 3, text: "MORPH", color: NEON.pink },
  { rib: 8, text: "DECK07", color: NEON.cyan },
  { rib: 15, text: "INTEL", color: NEON.amber },
  { rib: 20, text: "LIVE", color: NEON.pink },
];

function drawSign(text: string, color: string, vertical: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = vertical ? 128 : 1024;
  canvas.height = vertical ? 512 : 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(8,6,16,0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (vertical) {
    ctx.font = "800 62px ui-sans-serif, system-ui, Helvetica, Arial";
    const letters = [...text];
    const gap = 460 / letters.length;
    letters.forEach((letter, i) => ctx.fillText(letter, 64, 30 + gap * (i + 0.5)));
  } else {
    ctx.font = "700 44px ui-monospace, Menlo, monospace";
    ctx.fillText(text, 512, 68);
  }
  return canvas;
}

function NeonSign({ text, color, vertical, width, height }: { text: string; color: string; vertical: boolean; width: number; height: number }) {
  const resources = useMemo(() => {
    const texture = new CanvasTexture(drawSign(text, color, vertical));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
    material.color.setScalar(1.6);
    return { texture, material };
  }, [text, color, vertical]);
  useDisposable(useMemo(() => Object.values(resources), [resources]));
  return <mesh geometry={geo.plane(width, height)} material={resources.material} />;
}

function NeonSigns() {
  const step = (WALL_TO - WALL_FROM) / (RIBS - 1);
  const [bx, bz] = polar(17.4, Math.PI * 1.36);
  return (
    <group>
      {SIGNS.map((sign) => {
        const angle = WALL_FROM + sign.rib * step;
        const [x, z] = polar(WALL_RADIUS - 0.62, angle);
        return (
          <group key={sign.rib} position={[x, 4.3, z]} rotation={[0, faceCenter(angle), 0]}>
            <NeonSign text={sign.text} color={sign.color} vertical width={0.62} height={2.5} />
          </group>
        );
      })}
      <group position={[bx, 6.6, bz]} rotation={[0, faceCenter(Math.PI * 1.36), 0]}>
        <NeonSign text="MORPH // ORBITAL INTELLIGENCE DECK" color={NEON.cyan} vertical={false} width={6.4} height={0.8} />
      </group>
    </group>
  );
}

interface StationProps {
  worldRef: RefObject<World>;
  reflections: boolean;
}

export function Station({ worldRef, reflections }: StationProps) {
  const m = useStationMaterials();
  return (
    <group>
      <Space />
      <DeckFloor reflections={reflections} m={m} />
      <Shell m={m} />
      <NeonSigns />
      <ArchiveTowers worldRef={worldRef} m={m} />
      <Consoles m={m} />
      <LightTracks worldRef={worldRef} />
      <Machinery worldRef={worldRef} m={m} />
      {ZONE_ORDER.map((id, index) => (
        <Bay key={id} id={id} index={index} worldRef={worldRef} m={m} />
      ))}
    </group>
  );
}
