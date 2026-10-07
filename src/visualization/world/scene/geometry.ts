import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";

// Geometries are shared across every character and zone for the lifetime of the page.
const cache = new Map<string, BufferGeometry>();

function cached<T extends BufferGeometry>(key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing) return existing as T;
  const geometry = create();
  cache.set(key, geometry);
  return geometry;
}

export const geo = {
  capsule: (radius: number, length: number) =>
    cached(`capsule:${radius}:${length}`, () => new CapsuleGeometry(radius, length, 8, 20)),
  sphere: (radius: number, segments = 20) =>
    cached(`sphere:${radius}:${segments}`, () => new SphereGeometry(radius, segments, Math.round(segments * 0.75))),
  box: (x: number, y: number, z: number) =>
    cached(`box:${x}:${y}:${z}`, () => new BoxGeometry(x, y, z)),
  cone: (radius: number, height: number, segments = 6) =>
    cached(`cone:${radius}:${height}:${segments}`, () => new ConeGeometry(radius, height, segments)),
  tube: (top: number, bottom: number, height: number, thetaStart = 0, thetaLength = Math.PI * 2) =>
    cached(
      `tube:${top}:${bottom}:${height}:${thetaStart}:${thetaLength}`,
      () => new CylinderGeometry(top, bottom, height, 24, 4, true, thetaStart, thetaLength),
    ),
  cylinder: (top: number, bottom: number, height: number, segments = 20) =>
    cached(`cyl:${top}:${bottom}:${height}:${segments}`, () => new CylinderGeometry(top, bottom, height, segments)),
  torus: (radius: number, tube: number, segments = 48) =>
    cached(`torus:${radius}:${tube}:${segments}`, () => new TorusGeometry(radius, tube, 8, segments)),
  ring: (inner: number, outer: number, segments = 64) =>
    cached(`ring:${inner}:${outer}:${segments}`, () => new RingGeometry(inner, outer, segments)),
  arc: (radius: number, tube: number, arc: number) =>
    cached(`arc:${radius}:${tube}:${arc}`, () => new TorusGeometry(radius, tube, 6, 96, arc)),
  plane: (width: number, height: number) =>
    cached(`plane:${width}:${height}`, () => new PlaneGeometry(width, height)),
  circle: (radius: number) => cached(`circle:${radius}`, () => new CircleGeometry(radius, 96)),
  octa: (radius: number) => cached(`octa:${radius}`, () => new OctahedronGeometry(radius, 0)),
  ico: (radius: number, detail: number) =>
    cached(`ico:${radius}:${detail}`, () => new IcosahedronGeometry(radius, detail)),
  hood: () =>
    cached(
      "hood",
      () => new SphereGeometry(0.175, 20, 14, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.72),
    ),
};
