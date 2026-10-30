/**
 * build-procedural-textures.mjs — own-work textures for v3 (plan 10 S4). All of
 * them are illustrative surface detail, generated from seeded tileable noise
 * (no source image, CC BY 4.0 like the rest of the repo's own work):
 *
 *   public/assets/textures/crevasse_field_{diff,nor,arm}.ktx2
 *       Tileable 1024 px glacier surface meant to cover 200 x 200 m: transverse
 *       crevasses (v axis = flow direction) with blue ice in the slots, white
 *       weathered ice between, faint dirt specks. ARM = AO / roughness / metal.
 *   public/assets/textures/water_normal.ktx2
 *       Tileable 512 px swell + chop normal map (OpenGL convention).
 *   public/assets/textures/cloud_atlas.ktx2
 *       2048 x 1024 RGBA atlas, 4 x 2 soft cloud billboards (512 px each); the
 *       alpha also serves as the cloud-shadow mask. White RGB, base shading in RGB.
 *
 * Encoding: toktx 4.4.2 (TOOLS.md). Colour ETC1S sRGB; data maps linear; normals
 * and the cloud atlas UASTC + zstd (smooth gradients band in ETC1S).
 * Writes public/assets/textures/procedural-manifest.json.
 * Usage: node scripts/build-procedural-textures.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertLicence } from './lib/licence.mjs';

const TOKTX = process.env.TOKTX || join(homedir(), 'ktx-software/bin/toktx');
const OUT = 'public/assets/textures';
const TMP = 'tmp/procedural-textures';
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
assertLicence('own-procedural-textures', 'CC BY 4.0');

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Periodic gradient noise: period `p` lattice cells over [0,1). Returns ~[-1,1]. */
function makeNoise(seed) {
  const r = mulberry32(seed);
  const G = new Float32Array(512 * 2);
  for (let i = 0; i < 512; i++) { const a = r() * Math.PI * 2; G[i * 2] = Math.cos(a); G[i * 2 + 1] = Math.sin(a); }
  const perm = new Uint16Array(512); for (let i = 0; i < 512; i++) perm[i] = i;
  for (let i = 511; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const h = (x, y) => perm[(perm[x & 511] + y) & 511];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (u, v, p) => {
    const x = u * p, y = v * p;
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const w = (ix, iy, dx, dy) => { const k = h(((ix % p) + p) % p, ((iy % p) + p) % p) * 2; return G[k] * dx + G[k + 1] * dy; };
    const a = w(xi, yi, xf, yf), b = w(xi + 1, yi, xf - 1, yf), c = w(xi, yi + 1, xf, yf - 1), d = w(xi + 1, yi + 1, xf - 1, yf - 1);
    const s = fade(xf), t = fade(yf);
    return 1.414 * ((a + (b - a) * s) + ((c + (d - c) * s) - (a + (b - a) * s)) * t);
  };
}
function fbm(noise, u, v, p0, oct, gain = 0.5) {
  let s = 0, amp = 1, norm = 0, p = p0;
  for (let o = 0; o < oct; o++) { s += amp * noise(u, v, p); norm += amp; amp *= gain; p *= 2; }
  return s / norm;
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function writeRaw(name, w, h, ch, data) {
  const raw = join(TMP, `${name}.raw`);
  const png = join(TMP, `${name}.png`);
  writeFileSync(raw, data);
  execFileSync('magick', ['-size', `${w}x${h}`, '-depth', '8', `${ch === 4 ? 'rgba' : 'rgb'}:${raw}`, png]);
  return png;
}
function ktx(png, out, kind) {
  const args = ['--t2', '--genmipmap'];
  if (kind === 'srgb') args.push('--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--assign_oetf', 'srgb');
  if (kind === 'linear') args.push('--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--assign_oetf', 'linear');
  if (kind === 'normal') args.push('--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '4', '--zcmp', '18', '--assign_oetf', 'linear');
  if (kind === 'rgba') args.push('--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '2', '--zcmp', '18', '--assign_oetf', 'srgb');
  execFileSync(TOKTX, [...args, out, png]);
  return { file: out.replace(/^public\//, ''), bytes: statSync(out).size };
}
/** Tileable normal map (OpenGL, +Y up in texture space) from a height field. */
function normalsFrom(hgt, n, strength) {
  const out = Buffer.alloc(n * n * 3);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const hx = hgt[y * n + ((x + 1) % n)] - hgt[y * n + ((x - 1 + n) % n)];
    const hy = hgt[((y - 1 + n) % n) * n + x] - hgt[((y + 1) % n) * n + x];
    let nx = -hx * strength, ny = -hy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * n + x) * 3;
    out[o] = (nx * 0.5 + 0.5) * 255; out[o + 1] = (ny * 0.5 + 0.5) * 255; out[o + 2] = (nz * 0.5 + 0.5) * 255;
  }
  return out;
}

const manifest = {};

// ---------- crevasse field (1024 px = 200 m, so ~0.2 m/px) ----------
{
  const n = 1024;
  const nA = makeNoise(1941), nB = makeNoise(1950), nC = makeNoise(2004);
  const hgt = new Float32Array(n * n);
  const depth = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    // Transverse crevasses: bands across the flow (v) every ~25 m (8 per tile), warped and broken.
    const warp = 0.06 * fbm(nA, u, v, 3, 3) + 0.015 * fbm(nB, u, v, 12, 2);
    const phase = (v + warp) * 8 + 0.35 * fbm(nC, u, v, 2, 2);
    const d = Math.abs(phase - Math.round(phase)); // 0 at a crack centre
    const open = smooth(-0.15, 0.35, fbm(nB, u, v * 0.5, 4, 3)); // cracks pinch out along their length
    const width = 0.035 + 0.05 * open;
    const slot = open * (1 - smooth(width * 0.4, width, d)); // 0..1 inside the slot
    const lip = open * Math.exp(-((d - width) ** 2) / 0.0008) * 0.15; // raised, weathered lips
    const swell = 0.25 * fbm(nA, u, v, 6, 4) + 0.06 * fbm(nC, u, v, 48, 3);
    hgt[y * n + x] = swell + lip - 1.6 * slot;
    depth[y * n + x] = slot;
  }
  const diff = Buffer.alloc(n * n * 3), arm = Buffer.alloc(n * n * 3);
  const nD = makeNoise(77);
  for (let i = 0; i < n * n; i++) {
    const u = (i % n) / n, v = Math.floor(i / n) / n;
    const s = depth[i];
    const grain = fbm(nD, u, v, 64, 3);
    const dirt = smooth(0.55, 0.75, fbm(nD, u, v, 24, 4)) * 0.35;
    // weathered surface ice ~#E6EEF2, blue slot ice ~#2C6E91 (art bible "deep ice").
    let r = 230 - 18 * grain, g = 238 - 14 * grain, b = 242 - 8 * grain;
    r = r * (1 - dirt) + 122 * dirt; g = g * (1 - dirt) + 106 * dirt; b = b * (1 - dirt) + 85 * dirt;
    // Faint foliation streaks along the flow, then blue slot ice: pale at the lip, deep at the centre.
    const fol = 6 * fbm(nD, u * 0.25, v, 16, 2);
    r -= fol; g -= fol * 0.6;
    const k = smooth(0, 0.35, s), deep = smooth(0.4, 1, s);
    const sr = 120 - 92 * deep, sg = 172 - 92 * deep, sb = 198 - 78 * deep;
    diff[i * 3] = r * (1 - k) + sr * k; diff[i * 3 + 1] = g * (1 - k) + sg * k; diff[i * 3 + 2] = b * (1 - k) + sb * k;
    arm[i * 3] = 255 * (1 - 0.75 * k); // AO
    arm[i * 3 + 1] = 255 * clamp(0.55 + 0.25 * grain + 0.2 * dirt - 0.35 * k); // rough
    arm[i * 3 + 2] = 0;
  }
  manifest.crevasse_field = {
    use: 'crevassed ice tongue surface (illustrative); v axis = flow direction',
    tileSizeM: [200, 200],
    license: 'CC BY 4.0 (own work, this repository)',
    files: {
      diff: ktx(writeRaw('crevasse_diff', n, n, 3, diff), join(OUT, 'crevasse_field_diff.ktx2'), 'srgb'),
      nor: ktx(writeRaw('crevasse_nor', n, n, 3, normalsFrom(hgt, n, 6)), join(OUT, 'crevasse_field_nor.ktx2'), 'normal'),
      arm: ktx(writeRaw('crevasse_arm', n, n, 3, arm), join(OUT, 'crevasse_field_arm.ktx2'), 'linear'),
    },
  };
}

// ---------- water normal (512 px, tileable) ----------
{
  const n = 512;
  const nA = makeNoise(5), nB = makeNoise(6);
  const hgt = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    const swell = 0.6 * Math.sin(2 * Math.PI * (2 * u + 3 * v + 0.3 * fbm(nA, u, v, 2, 2)));
    hgt[y * n + x] = swell + 0.5 * fbm(nA, u, v, 8, 4) + 0.2 * fbm(nB, u, v, 32, 3);
  }
  manifest.water_normal = {
    use: 'fjord swell and chop (illustrative); scroll two copies at different scales',
    license: 'CC BY 4.0 (own work, this repository)',
    files: { nor: ktx(writeRaw('water_nor', n, n, 3, normalsFrom(hgt, n, 3)), join(OUT, 'water_normal.ktx2'), 'normal') },
  };
}

// ---------- cloud billboard atlas (4 x 2 sprites of 512 px) ----------
{
  const S = 512, cols = 4, rows = 2, w = S * cols, h = S * rows;
  const img = Buffer.alloc(w * h * 4);
  for (let k = 0; k < cols * rows; k++) {
    const nz = makeNoise(100 + k), r = mulberry32(200 + k);
    const flat = k >= 4; // second row: flatter stratocumulus banks
    // A few large lobes plus many small ones on their upper rims (cauliflower tops).
    const big = Array.from({ length: flat ? 5 : 3 }, () => ({ x: 0.25 + 0.5 * r(), y: flat ? 0.5 + 0.06 * r() : 0.52 + 0.1 * r(), rx: flat ? 0.18 + 0.08 * r() : 0.15 + 0.08 * r(), ry: flat ? 0.07 + 0.03 * r() : 0.12 + 0.06 * r() }));
    const small = [];
    for (const b of big) for (let s = 0; s < (flat ? 3 : 6); s++) {
      const a = Math.PI * (1.05 + 0.9 * r());
      small.push({ x: b.x + Math.cos(a) * b.rx * 0.8, y: b.y + Math.sin(a) * b.ry * 0.8, rx: b.rx * (0.3 + 0.25 * r()), ry: b.ry * (0.35 + 0.3 * r()) });
    }
    const lobes = [...big, ...small];
    const ox = (k % cols) * S, oy = Math.floor(k / cols) * S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let dens = 0;
      for (const l of lobes) { const q = ((u - l.x) / l.rx) ** 2 + ((v - l.y) / l.ry) ** 2; dens += Math.exp(-2.2 * q) * (l.rx > 0.1 ? 1 : 0.6); }
      dens = 1 - Math.exp(-1.6 * dens) - 0.12; // soft union of gaussian lobes (no disc outlines)
      const edge = Math.min(u, 1 - u, v, 1 - v) * 8;
      // Noise erodes the edges only near the lobes (no stray specks in clear sky).
      dens = (dens + 0.45 * fbm(nz, u, v, 6, 5) * smooth(-0.2, 0.2, dens)) * clamp(edge);
      const a = smooth(0.08, 0.75, dens);
      // Self-shadowed base: darker toward the lower part of each lobe stack.
      const shade = 1 - 0.32 * smooth(0.35, 0.75, v) * (0.6 + 0.4 * fbm(nz, u, v, 8, 2));
      const o = ((oy + y) * w + ox + x) * 4;
      img[o] = 250 * shade; img[o + 1] = 252 * shade; img[o + 2] = 255 * shade; img[o + 3] = 255 * a;
    }
  }
  manifest.cloud_atlas = {
    use: 'soft cloud billboards over the peaks (Medium/High fallback for Takram clouds, RESULTS.md); alpha doubles as the cloud-shadow mask. Row 0: cumulus puffs, row 1: flat banks',
    grid: [4, 2],
    spritePx: 512,
    license: 'CC BY 4.0 (own work, this repository)',
    files: { rgba: ktx(writeRaw('cloud_atlas', w, h, 4, img), join(OUT, 'cloud_atlas.ktx2'), 'rgba') },
  };
  execFileSync('magick', [join(TMP, 'cloud_atlas.png'), '-background', '#456', '-flatten', '-resize', '1024x', 'tmp/cloud-atlas-preview.png']);
}
execFileSync('magick', [join(TMP, 'crevasse_diff.png'), '-resize', '512x', 'tmp/crevasse-preview.png']);

writeFileSync(join(OUT, 'procedural-manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(JSON.stringify(manifest, null, 1));
