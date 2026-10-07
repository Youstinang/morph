import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
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

// Usage: npm install && SRC=<folder> TRIS=50000 node convert.mjs [folder-name-filter]
// Static (unrigged) conversion used for the station models in public/models/stations/.
const TARGET_TRIS = Number(process.env.TRIS ?? 60000);
const COLOR_SIZE = Number(process.env.COLOR ?? 2048);
const NORMAL_SIZE = Number(process.env.NORMAL ?? 1024);
const root = process.env.SRC ?? process.env.HOME + "/Downloads/3d Model ";
const out = process.env.OUT ?? fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(out, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const only = process.argv[2];
for (const dir of readdirSync(root).filter((d) => d.startsWith("Meshy"))) {
  const name = dir.split("_")[2].toLowerCase();
  if (only && name !== only) continue;
  const files = readdirSync(join(root, dir));
  const fbx = files.find((f) => f.endsWith(".fbx"));
  const colorFile = files.find((f) => f.endsWith("texture.png"));
  const normalFile = files.find((f) => f.endsWith("_normal.png"));
  const buffer = readFileSync(join(root, dir, fbx));
  const group = new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "");
  let source;
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (o.isMesh && !source) source = o;
  });
  const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const height = box.max.y - box.min.y;
  // Normalise: feet at y = 0, centred on x/z, 1 unit tall.
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.scale(1 / height, 1 / height, 1 / height);

  const doc = new Document();
  const buf = doc.createBuffer();
  const prim = doc.createPrimitive();
  const attr = (key, array, type) => doc.createAccessor().setArray(array).setType(type).setBuffer(buf);
  prim.setAttribute("POSITION", attr("p", new Float32Array(geometry.attributes.position.array), "VEC3"));
  prim.setAttribute("NORMAL", attr("n", new Float32Array(geometry.attributes.normal.array), "VEC3"));
  const uv = new Float32Array(geometry.attributes.uv.array);
  for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i];
  prim.setAttribute("TEXCOORD_0", attr("u", uv, "VEC2"));
  if (geometry.index) prim.setIndices(attr("i", new Uint32Array(geometry.index.array), "SCALAR"));

  const color = await sharp(join(root, dir, colorFile)).resize(COLOR_SIZE, COLOR_SIZE).webp({ quality: 88 }).toBuffer();
  const normal = await sharp(join(root, dir, normalFile)).resize(NORMAL_SIZE, NORMAL_SIZE).webp({ quality: 90 }).toBuffer();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const material = doc
    .createMaterial(name)
    .setBaseColorTexture(doc.createTexture("color").setImage(color).setMimeType("image/webp"))
    .setNormalTexture(doc.createTexture("normal").setImage(normal).setMimeType("image/webp"))
    .setRoughnessFactor(0.62)
    .setMetallicFactor(0.05);
  prim.setMaterial(material);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  doc.createScene().addChild(doc.createNode(name).setMesh(mesh));

  const before = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, TARGET_TRIS / before), error: 0.01, lockBorder: false }),
    dedup(),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const path = join(out, `${name}.glb`);
  await io.write(path, doc);
  const after = doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
  console.log(name, { before: Math.round(before), after: Math.round(after), mb: (statSync(path).size / 1e6).toFixed(2) });
}
