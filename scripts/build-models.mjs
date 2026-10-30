/**
 * build-models.mjs — own-work procedural GLB models for v3 (plan 10 S4).
 *
 * Every model is built from seeded geometry in this script (no source asset,
 * CC BY 4.0 like the repo's other own work), at real size (1 unit = 1 m,
 * +Y up, pivot at the base centre on the ground or the waterline). Shapes are
 * illustrative; the sizes come from the catalog (content/objects.json realSize)
 * and research/sources.md where a source gives one.
 *
 * Format (_templates/spikes/RESULTS.md): GLB, KHR_mesh_quantization +
 * EXT_meshopt_compression, PBR factors + vertex colours (COLOR_0), no textures.
 * Trees and shrubs ship two LODs with the same pivot (LOD0 <= ~8k triangles,
 * LOD1 <= ~150); impostors are baked at runtime from LOD0 (RESULTS.md).
 *
 * Output: public/assets/models/v3/<id>.glb + public/assets/models/v3/manifest.json
 * (triangles, bounding box, bytes, licence, node names the app can animate).
 * Usage: node scripts/build-models.mjs
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document, Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { assertLicence } from './lib/licence.mjs';

const OUT = 'public/assets/models/v3';
const LICENCE = 'CC BY 4.0 (own work, this repository)';
assertLicence('own-procedural-models', LICENCE);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- helpers
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const C = (hex) => new THREE.Color(hex); // sRGB hex -> linear (three ColorManagement)
const mixC = (a, b, t) => a.clone().lerp(b, t);

/** Paint a geometry with a per-vertex colour function (x, y, z, i) -> THREE.Color. */
function paint(geo, fn) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = typeof fn === 'function' ? fn(p.getX(i), p.getY(i), p.getZ(i), i) : fn;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
/** Keep only position/normal/color, indexed, so parts merge cleanly. */
function clean(geo) {
  let g = geo.index ? geo : mergeVertices(geo);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) g = mergeVertices(g);
  return g;
}
/** Faceted copy (flat normals), for ice and rock-like shapes. */
function facet(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'color'].includes(k)) g.deleteAttribute(k);
  g.computeVertexNormals();
  const idx = new Uint32Array(g.attributes.position.count).map((_, i) => i);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
function triangles(geo) { return (geo.index ? geo.index.count : geo.attributes.position.count) / 3; }

/** One strip "frond" along +X: centre ridge and two drooping edges, `seg` segments. */
function frond(len, width, droop, seg, rand, cBase, cTip) {
  const pos = [], col = [], idx = [];
  for (let s = 0; s <= seg; s++) {
    const t = s / seg;
    const x = len * t;
    const y = -droop * t * t * len;
    const w = width * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) * (0.85 + 0.3 * rand());
    const cc = mixC(cBase, cTip, t);
    pos.push(x, y + 0.05 * w, 0, x, y - 0.25 * w, w, x, y - 0.25 * w, -w);
    for (let k = 0; k < 3; k++) col.push(cc.r * (k ? 0.9 : 1), cc.g * (k ? 0.9 : 1), cc.b * (k ? 0.9 : 1));
    if (s < seg) {
      const a = s * 3, b = a + 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a, a + 2, b, a + 2, b + 2, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Star-shaped open cone (apex up) with a jagged rim, for LOD1 crowns. */
function starCone(rBase, height, yBase, points, rand, cIn, cOut, tiltX = 0) {
  const pos = [0, yBase + height, 0], col = [cOut.r, cOut.g, cOut.b], idx = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = rBase * (i % 2 ? 0.72 : 1) * (0.9 + 0.2 * rand());
    pos.push(Math.cos(a) * r, yBase - (i % 2 ? 0 : 0.12 * height), Math.sin(a) * r);
    const cc = mixC(cIn, cOut, i % 2 ? 0.4 : 1);
    col.push(cc.r, cc.g, cc.b);
  }
  pos.push(0, yBase + height * 0.15, 0); col.push(cIn.r, cIn.g, cIn.b); // underside centre
  const n = points * 2, under = n + 1;
  for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + ((i + 1) % n); idx.push(0, b, a, under, a, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  if (tiltX) g.rotateX(tiltX);
  g.computeVertexNormals();
  return g;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
const manifest = {};

/**
 * Write a GLB. `nodes`: [{ name, parts: [{ geo, mat }], translation?, extras? }]
 * mat: { name, color (hex, multiplies COLOR_0), roughness, metalness, doubleSided }
 */
async function writeModel(id, meta, nodes) {
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  const buffer = doc.createBuffer();
  const scene = doc.createScene(id);
  const mats = new Map();
  let tris = 0;
  const box = new THREE.Box3();
  const nodeBoxes = {};
  for (const n of nodes) {
    const mesh = doc.createMesh(n.name);
    const byMat = new Map();
    for (const p of n.parts) {
      const key = p.mat.name;
      if (!byMat.has(key)) byMat.set(key, { mat: p.mat, geos: [] });
      byMat.get(key).geos.push(clean(p.geo));
    }
    const nb = new THREE.Box3();
    for (const { mat, geos } of byMat.values()) {
      const g = geos.length > 1 ? mergeGeometries(geos) : geos[0];
      if (!g) throw new Error(`${id}/${n.name}: merge failed (${mat.name})`);
      g.computeBoundingBox();
      const t = n.translation || [0, 0, 0];
      nb.union(g.boundingBox.clone().translate(new THREE.Vector3(...t)));
      tris += triangles(g);
      if (!mats.has(mat.name)) {
        const m = doc.createMaterial(mat.name)
          .setBaseColorFactor([...C(mat.color ?? 0xffffff).toArray(), 1])
          .setRoughnessFactor(mat.roughness ?? 0.9)
          .setMetallicFactor(mat.metalness ?? 0)
          .setDoubleSided(!!mat.doubleSided);
        mats.set(mat.name, m);
      }
      const prim = doc.createPrimitive().setMaterial(mats.get(mat.name))
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.position.array)).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.normal.array)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(g.attributes.position.count > 65535 ? new Uint32Array(g.index.array) : new Uint16Array(g.index.array)).setBuffer(buffer));
      if (g.attributes.color) prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.color.array)).setBuffer(buffer));
      mesh.addPrimitive(prim);
    }
    const node = doc.createNode(n.name).setMesh(mesh);
    if (n.translation) node.setTranslation(n.translation);
    if (n.extras) node.setExtras(n.extras);
    scene.addChild(node);
    box.union(nb);
    nodeBoxes[n.name] = nb.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
  }
  doc.getRoot().setDefaultScene(scene);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high', quantizeNormal: 8, quantizeColor: 8 }));
  const glb = await io.writeBinary(doc);
  const file = join(OUT, `${id}.glb`);
  writeFileSync(file, glb);
  const size = box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
  manifest[id] = { file: file.replace(/^public\//, ''), ...meta, triangles: tris, bboxM: size, nodeBboxM: nodeBoxes, nodes: nodes.map((n) => n.name), bytes: statSync(file).size, license: LICENCE };
  console.log(id.padEnd(24), String(tris).padStart(6), 'tris', size.join(' x '), 'm', statSync(file).size, 'B');
}

// ---------------------------------------------------------------- conifers
const BARK_SPRUCE = { name: 'bark-spruce', color: 0x6a5848, roughness: 0.95 };
const BARK_HEMLOCK = { name: 'bark-hemlock', color: 0x6e4c38, roughness: 0.95 };
const NEEDLES = { name: 'needles', color: 0xffffff, roughness: 0.85, doubleSided: true };

function trunk(h, r0, mat, radial = 10) {
  const g = new THREE.CylinderGeometry(r0 * 0.12, r0, h, radial, 6, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const flare = 1 + 0.5 * Math.exp(-y / 0.6); p.setX(i, p.getX(i) * flare); p.setZ(i, p.getZ(i) * flare); }
  g.computeVertexNormals();
  return { geo: paint(g, (x, y) => mixC(C(0x3b2f26), C(0x8a7765), Math.min(1, y / h + 0.2))), mat };
}

/**
 * Sitka spruce (Picea sitchensis) or western hemlock (Tsuga heterophylla): the two
 * trees of the mature forest (NPS succession page, sources.md row 39).
 * Spruce: narrow cone, stiff upturned upper branches, blue-green. Hemlock: wider,
 * soft drooping sprays and the drooping leader that identifies it at a distance.
 */
function conifer(kind, seed) {
  const r = mulberry32(seed);
  const spruce = kind === 'spruce';
  const H = spruce ? 28 : 25;
  const R = spruce ? 3.8 : 4.0;
  const crownBase = spruce ? 0.18 * H : 0.22 * H;
  const cIn = spruce ? C(0x1f3328) : C(0x1c2a18);
  const cTip = spruce ? C(0x5f8270) : C(0x5f7c3e);
  const parts = [trunk(H * 0.96, spruce ? 0.42 : 0.4, spruce ? BARK_SPRUCE : BARK_HEMLOCK)];
  const whorls = spruce ? 34 : 30;
  const fronds = [];
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = lerp(crownBase, H * (spruce ? 0.97 : 0.9), t);
    const rad = R * Math.pow(1 - (y - crownBase) / (H - crownBase), spruce ? 0.95 : 0.7) + 0.25;
    const n = Math.max(5, Math.round((spruce ? 14 : 12) * (0.6 + 0.4 * (1 - t))));
    for (let b = 0; b < n; b++) {
      const len = rad * (0.85 + 0.3 * r());
      const droop = spruce ? lerp(0.32, -0.12, t) : lerp(0.55, 0.3, t);
      const f = frond(len, len * (spruce ? 0.28 : 0.24), droop, 3, r, cIn, mixC(cTip, C(0xffffff), 0.05 * r()));
      f.rotateY((b / n) * Math.PI * 2 + r() * 0.6 + w * 1.7);
      f.translate(0, y + (r() - 0.5) * 0.3, 0);
      fronds.push(f);
    }
  }
  if (!spruce) {
    // Drooping leader: a thin curved tip bending over by ~90 degrees.
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, H * 0.9, 0), new THREE.Vector3(0, H * 0.96, 0.15), new THREE.Vector3(0, H, 0.7), new THREE.Vector3(0, H * 0.985, 1.4)]);
    const tip = new THREE.TubeGeometry(curve, 10, 0.06, 4, false);
    parts.push({ geo: paint(tip, cTip), mat: NEEDLES });
    for (let k = 0; k < 8; k++) {
      const pt = curve.getPoint(0.2 + 0.1 * k);
      const f = frond(0.6 - 0.05 * k, 0.12, 0.4, 2, r, cIn, cTip);
      f.rotateY(k % 2 ? 1.3 : -1.3 + Math.PI);
      f.translate(pt.x, pt.y, pt.z);
      fronds.push(f);
    }
  }
  // Dark inner fill so the crown is not see-through between whorls.
  const fill = new THREE.ConeGeometry(R * 0.55, H - crownBase, 12, 1, true);
  fill.translate(0, crownBase + (H - crownBase) / 2, 0);
  parts.push({ geo: paint(fill, cIn), mat: NEEDLES });
  parts.push({ geo: mergeGeometries(fronds.map((g) => clean(g))), mat: NEEDLES });
  const lod1 = [];
  const tr = new THREE.CylinderGeometry(0.1, 0.4, crownBase + 1, 5, 1, true).translate(0, (crownBase + 1) / 2, 0);
  lod1.push({ geo: paint(tr, C(0x4a3b2f)), mat: spruce ? BARK_SPRUCE : BARK_HEMLOCK });
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const yb = lerp(crownBase, H * 0.62, k / tiers);
    const top = k === tiers - 1 ? H : lerp(crownBase, H * 0.62, (k + 1.6) / tiers) + 2;
    const rb = R * Math.pow(1 - (yb - crownBase) / (H - crownBase), spruce ? 0.95 : 0.7) + 0.3;
    lod1.push({ geo: starCone(rb, top - yb, yb, 5, r, cIn, cTip, !spruce && k === tiers - 1 ? 0.04 : 0), mat: NEEDLES });
  }
  return { lod0: parts, lod1 };
}

for (const [kind, id, seed] of [['spruce', 'sitka-spruce', 11], ['hemlock', 'western-hemlock', 23]]) {
  const t = conifer(kind, seed);
  await writeModel(`${id}-lod0`, { use: `${id} LOD0 (< 60 m from the camera); bake the impostor atlas from this`, honesty: 'illustrative', catalogId: 'forest' }, [{ name: `${id}-lod0`, parts: t.lod0 }]);
  await writeModel(`${id}-lod1`, { use: `${id} LOD1 (60-250 m)`, honesty: 'illustrative', catalogId: 'forest' }, [{ name: `${id}-lod1`, parts: t.lod1 }]);
}

// ---------------------------------------------------------------- shrubs and plants
const LEAF = { name: 'leaf', color: 0xffffff, roughness: 0.8, doubleSided: true };
const STEM = { name: 'stem', color: 0xffffff, roughness: 0.9 };

/** Sitka alder thicket: multi-stemmed, ~3 m, rounded leafy clumps (sources.md row 39). */
{
  const r = mulberry32(31);
  const lod0 = [], lod1 = [];
  for (let s = 0; s < 7; s++) {
    const a = (s / 7) * Math.PI * 2 + r() * 0.5, lean = 0.5 + 0.4 * r();
    const end = new THREE.Vector3(Math.cos(a) * lean * 1.0, 2.2 + 0.5 * r(), Math.sin(a) * lean * 1.0);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08), new THREE.Vector3(Math.cos(a) * 0.15, 1.2, Math.sin(a) * 0.15), end);
    lod0.push({ geo: paint(new THREE.TubeGeometry(curve, 6, 0.035, 5, false), C(0x6d6a60)), mat: STEM });
  }
  for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 1.05, y = 0.9 + r() * 1.55;
    const s = 0.32 + 0.3 * r() * (1 - y / 3.2);
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const f = 0.8 + 0.4 * r(); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.75, p.getZ(i) * f); }
    g.scale(s, s, s).translate(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const base = mixC(C(0x3c5f2c), C(0x6a8f45), r());
    lod0.push({ geo: paint(facet(g), (x, yy) => mixC(base.clone().multiplyScalar(0.6), base, Math.min(1, (yy - y + s) / (2 * s)))), mat: LEAF });
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, y = k === 4 ? 2.2 : 1.3;
    const g = new THREE.IcosahedronGeometry(k === 4 ? 0.9 : 0.95, 0).scale(1, 0.8, 1).translate(k === 4 ? 0 : Math.cos(a) * 0.7, y, k === 4 ? 0 : Math.sin(a) * 0.7);
    lod1.push({ geo: paint(facet(g), C(0x4f7638)), mat: LEAF });
  }
  await writeModel('sitka-alder-lod0', { use: 'alder thicket LOD0', honesty: 'illustrative', catalogId: 'alder' }, [{ name: 'sitka-alder-lod0', parts: lod0 }]);
  await writeModel('sitka-alder-lod1', { use: 'alder thicket LOD1', honesty: 'illustrative', catalogId: 'alder' }, [{ name: 'sitka-alder-lod1', parts: lod1 }]);
}

/** Fireweed clump: tall stems, narrow leaves, pink flower spikes, ~1.2 m (sources.md row 38). */
{
  const r = mulberry32(41);
  const parts = [];
  const PETAL = { name: 'petal', color: 0xffffff, roughness: 0.7, doubleSided: true };
  for (let s = 0; s < 6; s++) {
    const a = r() * Math.PI * 2, rr = 0.03 + 0.06 * r();
    const h = 0.95 + 0.25 * r();
    const x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr;
    parts.push({ geo: paint(new THREE.CylinderGeometry(0.004, 0.006, h, 4, 1, true).translate(x0, h / 2, z0), C(0x6b4a4a)), mat: STEM });
    for (let l = 0; l < 12; l++) {
      const y = 0.12 + (h * 0.62) * (l / 12);
      const len = 0.12 - 0.05 * (l / 12);
      const f = frond(len, 0.018, 0.3, 2, r, C(0x2f4d2a), C(0x4f6f3a));
      f.rotateZ(0.35).rotateY(l * 2.4 + a);
      f.translate(x0, y, z0);
      parts.push({ geo: f, mat: LEAF });
    }
    for (let k = 0; k < 14; k++) {
      const t = k / 14, y = h * (0.74 + 0.26 * t);
      const open = t < 0.65; // open flowers below, buds toward the tip
      const g = open ? new THREE.CircleGeometry(0.022, 4) : new THREE.ConeGeometry(0.006, 0.02, 4);
      if (open) g.rotateX(-Math.PI / 2 + 0.6).rotateY(k * 2.4);
      const ang = k * 2.4, off = open ? 0.025 : 0.008;
      g.translate(x0 + Math.cos(ang) * off, y, z0 + Math.sin(ang) * off);
      parts.push({ geo: paint(g, open ? C(0xd04a92) : C(0x8a2c5e)), mat: PETAL });
    }
  }
  await writeModel('fireweed', { use: 'fireweed clump on newly exposed ground', honesty: 'illustrative', catalogId: 'fireweed' }, [{ name: 'fireweed', parts }]);
}

/** Dryas mat: low evergreen mat with small nodding flowers, ~1 m across, ~0.1 m tall (sources.md row 38). */
{
  const r = mulberry32(53);
  const parts = [];
  const rings = 7, seg = 28;
  const pos = [0, 0.07, 0], idx = [];
  for (let i = 1; i <= rings; i++) for (let j = 0; j < seg; j++) {
    const rad = 0.5 * (i / rings) * (0.88 + 0.12 * Math.sin(j * 1.7 + i));
    const a = (j / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * rad, Math.max(0.004, 0.07 * Math.sqrt(1 - (i / rings) ** 2) + 0.012 * (r() - 0.5)), Math.sin(a) * rad);
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let i = 1; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = 1 + (i - 1) * seg + j, b = 1 + (i - 1) * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const mat = new THREE.BufferGeometry();
  mat.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  mat.setIndex(idx);
  mat.computeVertexNormals();
  parts.push({ geo: paint(mat, () => mixC(C(0x2e4426), C(0x56683e), r())), mat: LEAF });
  for (let k = 0; k < 16; k++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.4;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y0 = 0.06 * Math.sqrt(1 - (rr / 0.5) ** 2);
    parts.push({ geo: paint(new THREE.CylinderGeometry(0.002, 0.002, 0.035, 3, 1, true).translate(x, y0 + 0.017, z), C(0x5a4a3a)), mat: STEM });
    const cup = new THREE.ConeGeometry(0.012, 0.012, 6, 1, true).rotateX(Math.PI).translate(x, y0 + 0.032, z); // nodding cup
    parts.push({ geo: paint(cup, C(0xe8d36a)), mat: { name: 'petal', color: 0xffffff, roughness: 0.7, doubleSided: true } });
  }
  await writeModel('dryas-mat', { use: 'Dryas mat on young ground', honesty: 'illustrative', catalogId: 'dryas' }, [{ name: 'dryas-mat', parts }]);
}

// ---------------------------------------------------------------- ice
const ICE = { name: 'glacier-ice', color: 0xffffff, roughness: 0.35 };

/**
 * Ice block: displaced icosphere cut by random planes (fresh calving faces), white
 * weathered top, blue in hollows and toward the waterline. `size` = [x, height above
 * water, z]; `below` m of the hull continue under the waterline (most of an iceberg is
 * under water, sources.md row 47; the rest of the hull is not modelled because the
 * silty water hides it).
 */
function iceBlock(size, below, seed, detail, cuts, spire = 0) {
  const r = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const planes = Array.from({ length: cuts }, () => { const n = new THREE.Vector3(r() - 0.5, (r() - 0.3) * 0.8, r() - 0.5).normalize(); return { n, d: 0.55 + 0.3 * r() }; });
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const nrm = v.clone().normalize();
    v.multiplyScalar(1 + 0.12 * Math.sin(5 * nrm.x + 3 * nrm.z + seed) * Math.cos(4 * nrm.y + seed));
    for (const pl of planes) { const k = v.dot(pl.n) - pl.d; if (k > 0) v.addScaledVector(pl.n, -k); }
    if (spire && v.y > 0.2) { const t = (v.y - 0.2) / 0.8; v.x *= 1 - 0.6 * t; v.z *= 1 - 0.6 * t; v.y += spire * t * t; }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingBox();
  const bb = g.boundingBox;
  // Map: y in [0, max] -> [0, height]; y < 0 -> [-below, 0]; xz -> size.
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const ny = y >= 0 ? (y / bb.max.y) * size[1] : (y / -bb.min.y) * below;
    p.setXYZ(i, ((p.getX(i) - (bb.min.x + bb.max.x) / 2) / (bb.max.x - bb.min.x)) * size[0], ny, ((p.getZ(i) - (bb.min.z + bb.max.z) / 2) / (bb.max.z - bb.min.z)) * size[2]);
  }
  const f = facet(g);
  const top = C(0xeef5f8), mid = C(0xb9dcea), deep = C(0x4f9cc4);
  return paint(f, (x, y, z, i) => {
    const ny = f.attributes.normal.getY(i);
    const wl = Math.exp(-Math.max(0, y) / 1.2); // blue band near the waterline (wave-washed ice)
    const hollow = Math.max(0, -ny) * 0.6;
    return mixC(mixC(top, mid, Math.min(1, hollow + 0.25 * r())), deep, Math.min(1, wl * 0.7 + hollow * 0.5));
  });
}

await writeModel('iceberg-dome', { use: 'drifting iceberg, rounded (non-tabular) shape', honesty: 'illustrative', catalogId: 'icebergs', waterline: 'y = 0' }, [{ name: 'iceberg-dome', parts: [{ geo: iceBlock([12, 4, 9], 2, 7, 7, 4), mat: ICE }] }]);
await writeModel('iceberg-pinnacle', { use: 'drifting iceberg with a spire (non-tabular)', honesty: 'illustrative', catalogId: 'icebergs', waterline: 'y = 0' }, [{ name: 'iceberg-pinnacle', parts: [{ geo: iceBlock([10, 7, 8], 2, 13, 7, 5, 0.9), mat: ICE }] }]);
await writeModel('iceberg-block', { use: 'freshly calved block with flat faces', honesty: 'illustrative', catalogId: 'icebergs', waterline: 'y = 0' }, [{ name: 'iceberg-block', parts: [{ geo: iceBlock([8, 3.5, 6], 1.5, 19, 5, 8), mat: ICE }] }]);
{
  const nodes = [];
  for (let k = 0; k < 4; k++) {
    const s = [0.9 + 0.5 * k / 3, 0.25 + 0.1 * (k % 2), 0.7 + 0.4 * ((k + 1) % 4) / 3];
    nodes.push({ name: `brash-${k}`, parts: [{ geo: iceBlock(s, 0.2, 100 + k, 2, 5), mat: ICE }], translation: [k * 2 - 3, 0, 0] });
  }
  await writeModel('brash-ice', { use: 'four small floating pieces for instancing near the front (instance each node, not the whole file)', honesty: 'illustrative', catalogId: 'brash-ice', waterline: 'y = 0' }, nodes);
}
{
  const nodes = [];
  for (let k = 0; k < 3; k++) {
    const s = [7 + 2 * k, 14 + 3 * k, 6 + k];
    nodes.push({ name: `serac-${k}`, parts: [{ geo: iceBlock(s, 0, 300 + k, 4, 7, 0.6), mat: ICE }], translation: [k * 14 - 14, 0, 0] });
  }
  await writeModel('seracs', { use: 'ice towers on the crevassed tongue and at the 1941 terminus (USGS 1941 caption: seracs mark the terminus); instance each node', honesty: 'illustrative', catalogId: 'crevasses' }, nodes);
}

// ---------------------------------------------------------------- kayak with paddler
{
  const HULL = { name: 'hull', color: 0xffffff, roughness: 0.45 };
  const L = 5.0, B = 0.6, D = 0.35;
  const st = 24, ring = 14;
  const pos = [], idx = [];
  for (let s = 0; s <= st; s++) {
    const z = -L / 2 + (L * s) / st;
    const t = Math.abs(z) / (L / 2);
    const w = (B / 2) * Math.pow(Math.max(0, 1 - t * t), 0.55) + 0.004;
    const keel = -0.2 * Math.pow(Math.max(0, 1 - t * t), 0.4) + 0.06 * t * t; // rocker at the ends
    const deck = 0.15 * Math.pow(Math.max(0, 1 - t * t), 0.5) + 0.02;
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const y = sn < 0 ? keel * Math.pow(-sn, 0.7) : deck * Math.pow(sn, 0.6);
      pos.push(w * Math.sign(c) * Math.pow(Math.abs(c), 0.7), y + 0.2, z);
    }
  }
  for (let s = 0; s < st; s++) for (let k = 0; k < ring; k++) {
    const a = s * ring + k, b = s * ring + ((k + 1) % ring), c = a + ring, d = b + ring;
    idx.push(a, c, b, b, c, d);
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const parts = [{ geo: paint(hull, (x, y) => (y > 0.2 ? C(0xe2b22d) : C(0xd9a520))), mat: HULL }];
  const coaming = new THREE.TorusGeometry(0.3, 0.025, 5, 18).rotateX(Math.PI / 2).scale(0.75, 1, 1.4).translate(0, 0.37, 0.15);
  parts.push({ geo: paint(coaming, C(0x222222)), mat: { name: 'rubber', color: 0xffffff, roughness: 0.8 } });
  // Paddler seated in the cockpit.
  const SKIN = { name: 'skin', color: 0xffffff, roughness: 0.6 };
  const CLOTH = { name: 'cloth', color: 0xffffff, roughness: 0.85 };
  const body = [];
  body.push({ geo: paint(new THREE.CapsuleGeometry(0.17, 0.32, 4, 10).scale(1, 1, 0.75).translate(0, 0.62, 0.2), C(0x2f4a6b)), mat: CLOTH }); // jacket
  body.push({ geo: paint(new THREE.CapsuleGeometry(0.19, 0.2, 4, 10).scale(1, 1, 0.8).translate(0, 0.66, 0.2), C(0xd9532b)), mat: CLOTH }); // buoyancy aid
  body.push({ geo: paint(new THREE.SphereGeometry(0.1, 12, 10).translate(0, 1.0, 0.2), C(0xc69a7e)), mat: SKIN });
  body.push({ geo: paint(new THREE.CylinderGeometry(0.105, 0.11, 0.07, 12).translate(0, 1.07, 0.2), C(0x3a3f44)), mat: CLOTH }); // hat
  body.push({ geo: paint(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 16).translate(0, 1.04, 0.2), C(0x3a3f44)), mat: CLOTH }); // brim
  for (const sx of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.045, 0.36, 3, 6);
    arm.rotateZ(sx * 1.1).rotateX(-0.6).translate(sx * 0.27, 0.74, -0.02);
    body.push({ geo: paint(arm, C(0x2f4a6b)), mat: CLOTH });
  }
  const paddle = [];
  paddle.push({ geo: paint(new THREE.CylinderGeometry(0.016, 0.016, 2.2, 6).rotateZ(Math.PI / 2), C(0x30343a)), mat: { name: 'shaft', color: 0xffffff, roughness: 0.4, metalness: 0.3 } });
  for (const sx of [-1, 1]) {
    const blade = new THREE.SphereGeometry(1, 10, 6).scale(0.22, 0.008, 0.08).rotateX(sx * 0.6).translate(sx * 1.0, 0, 0);
    paddle.push({ geo: paint(blade, C(0xe9e9e4)), mat: { name: 'blade', color: 0xffffff, roughness: 0.5 } });
  }
  await writeModel('kayak', { use: 'sea kayak for scale on the inlet; animate node "paddle" (rotate about its local X/Z for strokes) and "paddler" (sway); realSize applies to node "kayak-hull"', honesty: 'illustrative', catalogId: 'kayak', waterline: 'y = 0 (hull keel ~0 m)', realSizeNode: 'kayak-hull' }, [
    { name: 'kayak-hull', parts },
    { name: 'paddler', parts: body },
    { name: 'paddle', parts: paddle, translation: [0, 0.78, -0.3] },
  ]);
}

// ---------------------------------------------------------------- survey flag
{
  const WOOD = { name: 'wood', color: 0xffffff, roughness: 0.9 };
  const stake = new THREE.CylinderGeometry(0.012, 0.015, 1.5, 6).translate(0, 0.75, 0);
  const band = new THREE.CylinderGeometry(0.0135, 0.0135, 0.12, 6, 1, true).translate(0, 1.2, 0);
  const cloth = new THREE.PlaneGeometry(0.28, 0.2, 10, 6).translate(0.155, 1.38, 0);
  const cp = cloth.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i) - 0.015; cp.setZ(i, 0.018 * Math.sin(x * 22) * (x / 0.28)); }
  cloth.computeVertexNormals();
  const panel = new THREE.PlaneGeometry(0.17, 0.1).translate(0.16, 1.38, 0);
  const pp = panel.attributes.position;
  for (let i = 0; i < pp.count; i++) { const x = pp.getX(i) - 0.015; pp.setZ(i, 0.018 * Math.sin(x * 22) * (x / 0.28) + 0.002); }
  const panelBack = panel.clone().rotateY(Math.PI).translate(0.32, 0, 0);
  await writeModel('survey-flag', { use: 'numbered survey flag at a dated ice-front position; write the year on node "flag-panel" (front and back faces have their own UV-free planes: use a CanvasTexture via planar mapping in x/y)', honesty: 'illustrative', catalogId: 'survey-marker' }, [
    { name: 'flag-stake', parts: [{ geo: paint(stake, C(0x8a6a45)), mat: WOOD }, { geo: paint(band, C(0xff8a2a)), mat: { name: 'paint', color: 0xffffff, roughness: 0.6 } }] },
    { name: 'flag-cloth', parts: [{ geo: paint(cloth, C(0xff8a2a)), mat: { name: 'flag', color: 0xffffff, roughness: 0.8, doubleSided: true } }] },
    { name: 'flag-panel', parts: [{ geo: paint(mergeGeometries([clean(panel), clean(panelBack)]), C(0xf4f2ea)), mat: { name: 'flag-panel', color: 0xffffff, roughness: 0.8 } }] },
  ]);
}

// ---------------------------------------------------------------- photo station
{
  const WOOD = { name: 'camera-wood', color: 0xffffff, roughness: 0.6 };
  const BRASS = { name: 'brass', color: 0xffffff, roughness: 0.35, metalness: 0.85 };
  const BLACK = { name: 'bellows', color: 0xffffff, roughness: 0.75 };
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = new THREE.CylinderGeometry(0.014, 0.02, 1.42, 6).translate(0, -0.71, 0).rotateZ(0.32).rotateY(a).translate(0, 1.36, 0);
    parts.push({ geo: paint(leg, C(0x7a5a3a)), mat: WOOD });
  }
  parts.push({ geo: paint(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12).translate(0, 1.38, 0), C(0x5a4028)), mat: WOOD });
  parts.push({ geo: paint(new THREE.BoxGeometry(0.24, 0.03, 0.34).translate(0, 1.415, 0), C(0x7a5230)), mat: WOOD }); // bed
  parts.push({ geo: paint(new THREE.BoxGeometry(0.22, 0.24, 0.05).translate(0, 1.55, -0.12), C(0x8a6038)), mat: WOOD }); // rear standard (ground glass)
  parts.push({ geo: paint(new THREE.PlaneGeometry(0.17, 0.19).translate(0, 1.55, -0.146).rotateY(0), C(0x9aa3a6)), mat: { name: 'glass', color: 0xffffff, roughness: 0.15 } });
  for (let k = 0; k < 6; k++) { // bellows folds
    const s = 1 - k * 0.07;
    parts.push({ geo: paint(new THREE.BoxGeometry(0.2 * s, 0.21 * s, 0.03).translate(0, 1.55, -0.085 + k * 0.03), C(k % 2 ? 0x1b1b1b : 0x262626)), mat: BLACK });
  }
  parts.push({ geo: paint(new THREE.BoxGeometry(0.15, 0.16, 0.025).translate(0, 1.55, 0.1), C(0x8a6038)), mat: WOOD }); // lens board
  parts.push({ geo: paint(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 16).rotateX(Math.PI / 2).translate(0, 1.55, 0.145), C(0xb08d57)), mat: BRASS });
  await writeModel('photo-station', { use: 'historic photo station marker: a field camera on a tripod, standing where the app places the station (position approximate, sources.md row 26)', honesty: 'illustrative', catalogId: 'photo-1941' }, [{ name: 'photo-station', parts }]);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
