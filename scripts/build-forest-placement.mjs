/**
 * build-forest-placement.mjs — clustered forest and alder instances for v3
 * (plan 10 S4, carry-over "forest clustering"; format from RESULTS.md: instance
 * transforms in a small binary, trees drawn with LOD0/LOD1/impostor at runtime).
 *
 * Where trees go: only on ground the 2024 Sentinel-2 image shows as vegetated
 * (green-excess test on the 20 m true-colour window), above the shore and on
 * slopes the DEM allows, within 6 km of the valley path (content/flowline.json),
 * where the camera travels. Trees are grouped in clusters (stands) seeded on the
 * darkest green (closed conifer canopy); alder goes on the brighter green of young
 * vegetation. Density, species mix and stand shapes are ILLUSTRATIVE: the image
 * shows where vegetation is, not which trees or how many.
 *
 * `s` per instance = distance along the valley path from the inlet mouth (m) at
 * the nearest path point, so the app can keep the v2 rule "forest on older ground
 * fades in with time" (art bible §7); no stage durations are claimed (sources.md row 40).
 *
 * Inputs: data/raw/sentinel2/S2B_8VML_20240806_0_L2A-muir-20m.tif (scripts/fetch-sentinel2.sh),
 *         data/work/dem-l0-f32.tif (npm run data:dem), content/flowline.json
 * Output: public/data/forest-instances.bin + public/data/forest-instances.json
 * Record (16 bytes, little-endian): f32 x, f32 y, f32 z (scene frame, m),
 *   u16 s (m), u8 yaw (0..255 -> 0..2 pi), u8 kindScale (bits 7-6 kind:
 *   0 Sitka spruce, 1 western hemlock, 2 Sitka alder; bits 5-0 scale: 0.65 + v / 63 * 0.6).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const S2 = 'data/raw/sentinel2/S2B_8VML_20240806_0_L2A-muir-20m.tif';
const DEM = 'data/work/dem-l0-f32.tif';
const TMP = 'tmp/forest';
for (const [f, how] of [[S2, 'bash scripts/fetch-sentinel2.sh'], [DEM, 'npm run data:dem']]) {
  if (!existsSync(f)) { console.error(`missing ${f}: run ${how}`); process.exit(1); }
}
mkdirSync(TMP, { recursive: true });
const N_TREES = 24000;
const N_ALDER = 6000;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry32(1916); // Cooper's study plots, sources.md row 37
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

const info = (f) => JSON.parse(execFileSync('gdalinfo', ['-json', f], { maxBuffer: 1 << 26 }).toString());
const di = info(DEM);
const [W, H] = di.size;
const [WEST, RES, , NORTH] = di.geoTransform;
execFileSync('gdal_translate', ['-q', '-of', 'ENVI', '-ot', 'Float32', DEM, join(TMP, 'dem.f32')]);
const dem = new Float32Array(readFileSync(join(TMP, 'dem.f32')).buffer.slice(0));
const si = info(S2);
const [SW, SH] = si.size;
const SRES = si.geoTransform[1];
if (si.geoTransform[0] !== WEST || si.geoTransform[3] !== NORTH) throw new Error('S2 window and DEM differ');
execFileSync('gdal_translate', ['-q', '-of', 'ENVI', '-co', 'INTERLEAVE=BIP', S2, join(TMP, 's2.rgb')]);
const img = new Uint8Array(readFileSync(join(TMP, 's2.rgb')).buffer.slice(0));
const centreE = WEST + (W * RES) / 2, centreN = NORTH - (H * RES) / 2;

function elev(e, n) {
  const gx = Math.min(W - 1, Math.max(0, (e - WEST) / RES - 0.5));
  const gy = Math.min(H - 1, Math.max(0, (NORTH - n) / RES - 0.5));
  const i = Math.min(W - 2, Math.floor(gx)), j = Math.min(H - 2, Math.floor(gy));
  const a = gx - i, b = gy - j, p = j * W + i;
  return (dem[p] * (1 - a) + dem[p + 1] * a) * (1 - b) + (dem[p + W] * (1 - a) + dem[p + W + 1] * a) * b;
}
const slope = (e, n) => Math.hypot(elev(e + RES, n) - elev(e - RES, n), elev(e, n + RES) - elev(e, n - RES)) / (2 * RES);

// Vegetation classes per 20 m pixel: 2 = closed dark-green canopy, 1 = brighter young green, 0 = none.
const veg = new Uint8Array(SW * SH);
let nC = 0, nY = 0;
for (let i = 0; i < SW * SH; i++) {
  const r = img[i * 3], g = img[i * 3 + 1], b = img[i * 3 + 2];
  if (!r && !g && !b) continue;
  const exg = 2 * g - r - b, lum = (r + g + b) / 3;
  if (g < b + 4 || b - r > 18) continue; // silty turquoise water and blue ice: G <= B or B well above R
  if (exg > 14 && lum < 70) { veg[i] = 2; nC++; } else if (exg > 18 && lum < 120) { veg[i] = 1; nY++; }
}
const vegAt = (e, n) => {
  const c = Math.floor((e - WEST) / SRES), r = Math.floor((NORTH - n) / SRES);
  return c < 0 || r < 0 || c >= SW || r >= SH ? 0 : veg[r * SW + c];
};

// Valley path (scene x/z) -> along-path distance for the nearest point.
const flow = JSON.parse(readFileSync('content/flowline.json', 'utf8'));
const pts = flow.points.map((p) => ({ e: p.utmE, n: p.utmN }));
const acc = [0];
for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].e - pts[i - 1].e, pts[i].n - pts[i - 1].n));
function nearPath(e, n) {
  let best = Infinity, s = 0;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i].e - e, pts[i].n - n); if (d < best) { best = d; s = acc[i]; } }
  return { d: best, s };
}
const okGround = (e, n) => { const h = elev(e, n); return h > 4 && h < 700 && slope(e, n) < 0.75; };

// Stand centres: rejection-sample closed-canopy pixels near the valley.
const stands = [];
for (let tries = 0; tries < 400000 && stands.length < 260; tries++) {
  const e = WEST + rand() * W * RES, n = NORTH - rand() * H * RES;
  if (vegAt(e, n) !== 2 || !okGround(e, n)) continue;
  const np = nearPath(e, n);
  if (np.d > 6000) continue;
  if (stands.some((s) => Math.hypot(s.e - e, s.n - n) < 350)) continue;
  stands.push({ e, n, sigma: 60 + 140 * rand(), hemlock: 0.25 + 0.3 * rand() });
}
const out = [];
const counts = { spruce: 0, hemlock: 0, alder: 0 };
const perStand = Math.ceil(N_TREES / stands.length);
for (const st of stands) {
  let placed = 0;
  for (let k = 0; k < perStand * 6 && placed < perStand; k++) {
    const e = st.e + gauss() * st.sigma, n = st.n + gauss() * st.sigma * (0.6 + 0.8 * rand());
    if (vegAt(e, n) === 0 || !okGround(e, n)) continue;
    if (vegAt(e, n) === 1 && rand() < 0.7) continue; // open young ground: fewer trees
    const kind = rand() < st.hemlock ? 1 : 0;
    out.push({ e, n, kind, scale: 0.55 + 0.45 * rand() + (vegAt(e, n) === 2 ? 0.1 : -0.1) });
    counts[kind ? 'hemlock' : 'spruce']++;
    placed++;
  }
}
for (let tries = 0; tries < 600000 && counts.alder < N_ALDER; tries++) {
  const e = WEST + rand() * W * RES, n = NORTH - rand() * H * RES;
  if (vegAt(e, n) !== 1 || !okGround(e, n)) continue;
  if (nearPath(e, n).d > 5000) continue;
  // thickets: drop a few shrubs around each accepted point
  for (let k = 0; k < 4 && counts.alder < N_ALDER; k++) {
    const e2 = e + gauss() * 8, n2 = n + gauss() * 8;
    if (vegAt(e2, n2) === 0 || !okGround(e2, n2)) continue;
    out.push({ e: e2, n: n2, kind: 2, scale: 0.65 + 0.6 * rand() });
    counts.alder++;
  }
}

const buf = Buffer.alloc(out.length * 16);
let sMax = 0;
out.forEach((t, i) => {
  const o = i * 16;
  const s = Math.min(65535, Math.round(nearPath(t.e, t.n).s));
  sMax = Math.max(sMax, s);
  buf.writeFloatLE(t.e - centreE, o);
  buf.writeFloatLE(elev(t.e, t.n), o + 4);
  buf.writeFloatLE(centreN - t.n, o + 8);
  buf.writeUInt16LE(s, o + 12);
  buf.writeUInt8(Math.floor(rand() * 256), o + 14);
  const sc = Math.max(0, Math.min(63, Math.round(((Math.min(1.25, Math.max(0.65, t.scale)) - 0.65) / 0.6) * 63)));
  buf.writeUInt8((t.kind << 6) | sc, o + 15);
});
writeFileSync('public/data/forest-instances.bin', buf);
const meta = {
  file: 'data/forest-instances.bin',
  generatedBy: 'scripts/build-forest-placement.mjs',
  honesty: 'illustrative: placed only where the 2024 Sentinel-2 image shows vegetation; species mix, density and stand shapes are not mapped',
  recordBytes: 16,
  layout: 'f32 x, f32 y, f32 z (scene m: x east, y elevation, z south, origin DEM grid centre); u16 s (m along the valley path from the inlet mouth); u8 yaw (v/256*2pi); u8 kindScale (kind = v >> 6: 0 sitka-spruce, 1 western-hemlock, 2 sitka-alder; scale = 0.65 + (v & 63) / 63 * 0.6)',
  models: { 0: 'assets/models/v3/sitka-spruce-lod0.glb + -lod1.glb', 1: 'assets/models/v3/western-hemlock-lod0.glb + -lod1.glb', 2: 'assets/models/v3/sitka-alder-lod0.glb + -lod1.glb' },
  lod: 'RESULTS.md: LOD0 < 60 m, LOD1 < 250 m, impostor beyond',
  count: out.length,
  counts,
  stands: stands.length,
  vegetatedPixels20m: { closedCanopy: nC, youngGreen: nY },
  sMaxM: sMax,
  pathLengthM: Math.round(acc[acc.length - 1]),
  bytes: buf.length,
};
writeFileSync('public/data/forest-instances.json', JSON.stringify(meta, null, 1) + '\n');
// Preview: vegetation classes over the image, stands in red (tmp only).
const prev = Buffer.from(img);
for (let i = 0; i < SW * SH; i++) if (veg[i] === 2) { prev[i * 3] = 255; prev[i * 3 + 1] = 0; prev[i * 3 + 2] = 255; } else if (veg[i] === 1) { prev[i * 3] = 255; prev[i * 3 + 1] = 255; prev[i * 3 + 2] = 0; }
for (const t of out) { const c = Math.floor((t.e - WEST) / SRES), r = Math.floor((NORTH - t.n) / SRES); const q = (r * SW + c) * 3; prev[q] = 255; prev[q + 1] = 0; prev[q + 2] = 0; }
execFileSync('magick', ['-size', `${SW}x${SH}`, '-depth', '8', 'rgb:-', '-resize', '800x', 'tmp/forest-preview.png'], { input: prev });
console.log(meta, statSync('public/data/forest-instances.bin').size);
