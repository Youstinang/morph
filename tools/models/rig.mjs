import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from "@gltf-transform/extensions";
import { quantize, reorder, simplify, weld, dedup, prune } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

globalThis.document = {
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {} }),
};
globalThis.window = globalThis;
globalThis.self = globalThis;
const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");

// Usage: npm install && node rig.mjs [folder-name-filter]
// Reads one Meshy FBX per sub-folder of SRC and writes rigged GLBs to OUT; copy results to public/models/.
const TARGET_TRIS = Number(process.env.TRIS ?? 60000);
const root = process.env.SRC ?? process.env.HOME + "/Downloads/3d Model ";
const out = process.env.OUT ?? fileURLToPath(new URL("./rigged/", import.meta.url));
mkdirSync(out, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

// ---------- landmark estimation (model space: 1 unit tall, feet at y=0, facing +Z, +X = character's left)
function landmarks(pos) {
  const n = pos.length / 3;
  const band = (y0, y1, filter = () => true) => {
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const y = pos[i * 3 + 1];
      if (y >= y0 && y <= y1 && filter(pos[i * 3], y, pos[i * 3 + 2])) pts.push([pos[i * 3], y, pos[i * 3 + 2]]);
    }
    return pts;
  };
  const mean = (pts) => pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / Math.max(pts.length, 1));
  const pct = (values, q) => {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  };

  const chestBand = band(0.74, 0.8);
  const chestHalf = pct(chestBand.map((p) => Math.abs(p[0])), 0.97);
  const torsoZ = (y) => mean(band(y - 0.02, y + 0.02, (x) => Math.abs(x) < 0.06))[2];

  const hand = (side) => {
    const pts = band(0.44, 0.58, (x) => x * side > 0);
    const extreme = Math.max(...pts.map((p) => p[0] * side));
    const cluster = pts.filter((p) => p[0] * side > extreme - 0.045);
    return mean(cluster);
  };
  const foot = (side) => mean(band(0.01, 0.09, (x) => x * side > 0.012));

  const shoulderY = 0.805;
  const joints = {};
  joints.hips = [0, 0.53, torsoZ(0.53)];
  joints.spine = [0, 0.62, torsoZ(0.62)];
  joints.chest = [0, 0.71, torsoZ(0.71)];
  joints.neck = [0, 0.84, torsoZ(0.84)];
  joints.head = [0, 0.885, torsoZ(0.885)];
  joints.headEnd = [0, 1.0, torsoZ(0.885)];
  for (const [suffix, side] of [["L", 1], ["R", -1]]) {
    const shoulder = [side * chestHalf * 0.72, shoulderY, torsoZ(0.78)];
    const wrist = hand(side);
    const elbow = [(shoulder[0] + wrist[0]) / 2 + side * 0.012, (shoulder[1] + wrist[1]) / 2, (shoulder[2] + wrist[2]) / 2 - 0.02];
    const dir = [wrist[0] - elbow[0], wrist[1] - elbow[1], wrist[2] - elbow[2]];
    const len = Math.hypot(...dir);
    joints[`upperArm${suffix}`] = shoulder;
    joints[`forearm${suffix}`] = elbow;
    joints[`hand${suffix}`] = wrist;
    joints[`handEnd${suffix}`] = wrist.map((v, i) => v + (dir[i] / len) * 0.075);
    const f = foot(side);
    joints[`thigh${suffix}`] = [f[0] * 0.92, 0.5, joints.hips[2]];
    joints[`shin${suffix}`] = [f[0], 0.275, (joints.hips[2] + f[2]) / 2 + 0.01];
    joints[`foot${suffix}`] = [f[0], 0.065, f[2] - 0.02];
    joints[`toe${suffix}`] = [f[0], 0.015, f[2] + 0.06];
  }
  return joints;
}

// Bones: name, parent, head joint, tail joint, radius, allowed region
const BONES = [
  ["hips", null, "hips", "spine", 0.15],
  ["spine", "hips", "spine", "chest", 0.13],
  ["chest", "spine", "chest", "neck", 0.13],
  ["neck", "chest", "neck", "head", 0.05],
  ["head", "neck", "head", "headEnd", 0.09],
  ["upperArmL", "chest", "upperArmL", "forearmL", 0.045],
  ["forearmL", "upperArmL", "forearmL", "handL", 0.04],
  ["handL", "forearmL", "handL", "handEndL", 0.035],
  ["upperArmR", "chest", "upperArmR", "forearmR", 0.045],
  ["forearmR", "upperArmR", "forearmR", "handR", 0.04],
  ["handR", "forearmR", "handR", "handEndR", 0.035],
  ["thighL", "hips", "thighL", "shinL", 0.06],
  ["shinL", "thighL", "shinL", "footL", 0.05],
  ["footL", "shinL", "footL", "toeL", 0.04],
  ["thighR", "hips", "thighR", "shinR", 0.06],
  ["shinR", "thighR", "shinR", "footR", 0.05],
  ["footR", "shinR", "footR", "toeR", 0.04],
];

function segmentDistance(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
}

function allowed(name, p, joints) {
  const y = p[1];
  if (name.startsWith("thigh") || name.startsWith("shin") || name.startsWith("foot")) {
    const side = name.endsWith("L") ? 1 : -1;
    return y < 0.56 && p[0] * side > -0.015;
  }
  if (name.startsWith("upperArm") || name.startsWith("forearm") || name.startsWith("hand")) {
    const side = name.endsWith("L") ? 1 : -1;
    return p[0] * side > Math.abs(joints[`upperArm${name.endsWith("L") ? "L" : "R"}`][0]) * 0.55 && y > 0.36;
  }
  if (name === "head") return y > 0.82;
  if (name === "neck") return y > 0.78;
  return true;
}

function computeWeights(pos, indices, joints) {
  const n = pos.length / 3;
  const B = BONES.length;
  const w = new Float32Array(n * B);
  for (let i = 0; i < n; i += 1) {
    const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    let total = 0;
    for (let b = 0; b < B; b += 1) {
      const [name, , head, tail, radius] = BONES[b];
      if (!allowed(name, p, joints)) continue;
      const d = segmentDistance(p, joints[head], joints[tail]) / radius;
      const v = 1 / (d ** 6 + 1e-4);
      w[i * B + b] = v;
      total += v;
    }
    if (total === 0) w[i * B] = total = 1;
    for (let b = 0; b < B; b += 1) w[i * B + b] /= total;
  }
  // Laplacian smoothing over mesh adjacency to soften seams.
  const neighbors = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const next = new Float32Array(w.length);
    for (let i = 0; i < n; i += 1) {
      const list = [...neighbors[i]];
      for (let b = 0; b < B; b += 1) {
        let s = w[i * B + b] * 2;
        for (const j of list) s += w[j * B + b];
        next[i * B + b] = s / (list.length + 2);
      }
    }
    w.set(next);
  }
  const joints4 = new Uint16Array(n * 4);
  const weights4 = new Float32Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const order = [...Array(B).keys()].sort((a, b) => w[i * B + b] - w[i * B + a]).slice(0, 4);
    const sum = order.reduce((s, b) => s + w[i * B + b], 0) || 1;
    order.forEach((b, k) => {
      joints4[i * 4 + k] = b;
      weights4[i * 4 + k] = w[i * B + b] / sum;
    });
  }
  return { joints4, weights4 };
}

const only = process.argv[2];
for (const dir of readdirSync(root).filter((d) => d.startsWith("Meshy"))) {
  const name = dir.split("_")[2].toLowerCase();
  if (only && name !== only) continue;
  const files = readdirSync(join(root, dir));
  const buffer = readFileSync(join(root, dir, files.find((f) => f.endsWith(".fbx"))));
  const group = new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "");
  group.updateMatrixWorld(true);
  let source;
  group.traverse((o) => {
    if (o.isMesh && !source) source = o;
  });
  const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const height = box.max.y - box.min.y;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.scale(1 / height, 1 / height, 1 / height);

  const doc = new Document();
  const buf = doc.createBuffer();
  const prim = doc.createPrimitive();
  const accessor = (array, type) => doc.createAccessor().setArray(array).setType(type).setBuffer(buf);
  const uv = new Float32Array(geometry.attributes.uv.array);
  for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i];
  prim.setAttribute("POSITION", accessor(new Float32Array(geometry.attributes.position.array), "VEC3"));
  prim.setAttribute("NORMAL", accessor(new Float32Array(geometry.attributes.normal.array), "VEC3"));
  prim.setAttribute("TEXCOORD_0", accessor(uv, "VEC2"));
  const before = geometry.attributes.position.count / 3;
  const mesh = doc.createMesh(name).addPrimitive(prim);
  const meshNode = doc.createNode(`${name}-body`).setMesh(mesh);
  const scene = doc.createScene().addChild(meshNode);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_TRIS / before, error: 0.01 }));

  const pos = prim.getAttribute("POSITION").getArray();
  const indices = prim.getIndices().getArray();
  const joints = landmarks(pos);
  const { joints4, weights4 } = computeWeights(pos, indices, joints);
  prim.setAttribute("JOINTS_0", accessor(joints4, "VEC4"));
  prim.setAttribute("WEIGHTS_0", accessor(weights4, "VEC4"));

  const nodes = {};
  const inverse = [];
  for (const [bone, parent, head] of BONES) {
    const world = joints[head];
    const parentWorld = parent ? joints[BONES.find((b) => b[0] === parent)[2]] : [0, 0, 0];
    const node = doc.createNode(bone).setTranslation(world.map((v, i) => v - parentWorld[i]));
    nodes[bone] = node;
    if (parent) nodes[parent].addChild(node);
    else scene.addChild(node);
    inverse.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -world[0], -world[1], -world[2], 1);
  }
  const skin = doc.createSkin(`${name}-skin`).setSkeleton(nodes.hips).setInverseBindMatrices(accessor(new Float32Array(inverse), "MAT4"));
  for (const [bone] of BONES) skin.addJoint(nodes[bone]);
  meshNode.setSkin(skin);

  const colorFile = files.find((f) => f.endsWith("texture.png"));
  const normalFile = files.find((f) => f.endsWith("_normal.png"));
  const color = await sharp(join(root, dir, colorFile)).resize(2048, 2048).webp({ quality: 88 }).toBuffer();
  const normal = await sharp(join(root, dir, normalFile)).resize(1024, 1024).webp({ quality: 90 }).toBuffer();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  prim.setMaterial(
    doc
      .createMaterial(name)
      .setBaseColorTexture(doc.createTexture("color").setImage(color).setMimeType("image/webp"))
      .setNormalTexture(doc.createTexture("normal").setImage(normal).setMimeType("image/webp"))
      .setRoughnessFactor(0.62)
      .setMetallicFactor(0.05),
  );

  await doc.transform(dedup(), prune({ keepLeaves: true }), reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const path = join(out, `${name}.glb`);
  await io.write(path, doc);
  writeFileSync(join(out, `${name}.joints.json`), JSON.stringify(joints, null, 1));
  console.log(name, { tris: indices.length / 3, mb: (statSync(path).size / 1e6).toFixed(2) });
}
