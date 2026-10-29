/**
 * v2 living dressing for the Muir Inlet terrain (design/art-bible.md §5-7).
 *
 * Everything here is ILLUSTRATIVE and sits on top of the real data (Copernicus
 * terrain + Sentinel-2 drape): the ice tongue and calving cliff (front placed
 * only from the dated anchors, systems/time-front.js), icebergs, conifers,
 * Poly Haven shrubs/rocks at the photo spot, low cloud, snow drift, birds and
 * an occasional calving slab. Static dressing is instanced or merged to keep
 * Medium far below the draw-call budget.
 * @module scenes/muir-dressing
 */
import * as THREE from 'three';
import { AmbientLifeManager } from '../v2/ambient-life.js';
import { ModelLibrary } from '../v2/model-placer.js';
import { mergeStaticGroup } from '../v2/cinematic-grade.js';
import { pointAtDistance, pathLength } from '../systems/flowline.js';
import { frontForYear, thicknessForYear, forestForYear, pastAmount } from '../systems/time-front.js';

/** Review V5: the sea-level plane spans this multiple of the DEM footprint. */
export const WATER_SCALE = 4;

/** Seeded RNG (never Math.random: the security hook flags it). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tangent-space normal map (DataTexture) from a height function h(u, v) in [0,1]^2. */
export function normalMapFrom(size, heightFn, strength = 2) {
  const hgt = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) hgt[j * size + i] = heightFn(i / size, j / size);
  const data = new Uint8Array(size * size * 4);
  const at = (i, j) => hgt[((j + size) % size) * size + ((i + size) % size)];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * strength;
      const dy = (at(i, j + 1) - at(i, j - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const k = (j * size + i) * 4;
      data[k] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[k + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Crevasse field: transverse cracks (across the flow, along u) with jitter. */
function crevasseHeight(seed) {
  const r = mulberry32(seed);
  const cracks = Array.from({ length: 18 }, () => ({ v: r(), w: 0.004 + r() * 0.01, a: r() * 6.28, f: 1 + Math.floor(r() * 3) }));
  return (u, v) => {
    let h = 0;
    for (const c of cracks) {
      const vv = c.v + 0.03 * Math.sin(u * 6.283 * c.f + c.a);
      const d = Math.abs(((v - vv + 1.5) % 1) - 0.5);
      h -= Math.exp(-((d / c.w) ** 2));
    }
    return h;
  };
}

/** Soft swell: a few crossing waves (tileable). */
function swellHeight(u, v) {
  const t = 6.283185;
  return 0.5 * Math.sin(t * (3 * u + 2 * v)) + 0.35 * Math.sin(t * (-5 * u + 4 * v)) + 0.2 * Math.sin(t * (7 * u - 9 * v));
}

function softDiscTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MuirDressing {
  /**
   * @param {import('./muir-inlet.js').MuirInletScene} site
   * @param {object} content  app content (modules.anchors, flowline.points)
   * @param {object} [opts]
   * @param {boolean} [opts.reducedMotion]
   */
  constructor(site, content, opts = {}) {
    this.site = site;
    this.anchors = content.modules.anchors;
    this.points = content.flowline.points;
    this.L = pathLength(this.points);
    this.group = new THREE.Group();
    this.group.name = 'v2-dressing';
    site.scene.add(this.group);
    this.rng = mulberry32(1941);
    this.life = new AmbientLifeManager(this.group, { reducedMotion: Boolean(opts.reducedMotion), seed: 2004 });
    this.year = 2004;
    this.calving = { t: 0, next: 9, active: null };
    this.counts = {};
    // Review M2: Low builds the life systems at reduced counts.
    this.low = site.engine?.quality?.name === 'low';
    this.lifeScale = this.low ? 0.5 : 1;
  }

  /** Height of the terrain (>= sea level) at scene x/z. */
  ground(x, z) {
    const h = this.site.heightAt(x, z);
    return Number.isFinite(h) ? Math.max(h, 0) : 0;
  }

  /** Point + unit tangent + unit normal (in the ground plane) at along-path s. */
  frame(s) {
    const p = pointAtDistance(this.points, s);
    const q = pointAtDistance(this.points, Math.min(this.L, s + 200));
    const o = pointAtDistance(this.points, Math.max(0, s - 200));
    let tx = q.x - o.x, tz = q.z - o.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    return { x: p.x, z: p.z, tx, tz, nx: -tz, nz: tx };
  }

  /** Along-path frame that also extends past the upper end (ice upstream). */
  frameExt(s) {
    if (s <= this.L) return this.frame(s);
    const f = this.frame(this.L);
    const d = s - this.L;
    return { ...f, x: f.x + f.tx * d, z: f.z + f.tz * d };
  }

  async build() {
    this._buildIce();
    this._buildBergs();
    this._buildForest();
    this._buildClouds();
    this._buildSnow();
    this._buildBirds();
    this._buildCalving();
    this._buildWaterSwell();
    await this._buildPhotoSpotDressing().catch((err) => console.warn('Photo-spot models failed to load; continuing without them.', err));
    this.setYear(this.year);
    return this;
  }

  // ---------- ice tongue + calving cliff (front from the dated anchors only) ----------
  _buildIce() {
    this.iceRows = 64;
    this.iceCols = 13;
    const n = this.iceRows * this.iceCols + this.iceCols; // + one cliff-foot row
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    const idx = [];
    const C = this.iceCols;
    const rowOf = (r) => r * C;
    // row 0 = cliff foot (below water), rows 1.. = surface from front to upstream
    for (let r = 0; r <= this.iceRows; r++) {
      for (let c = 0; c < C; c++) {
        uv[(r * C + c) * 2] = c / (C - 1) * 3;
        uv[(r * C + c) * 2 + 1] = r * 0.6;
        if (r < this.iceRows && c < C - 1) {
          const a = rowOf(r) + c, b = a + 1, d = rowOf(r + 1) + c, e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const normalMap = normalMapFrom(128, crevasseHeight(1941), 3);
    this.iceMat = new THREE.MeshPhysicalMaterial({
      color: 0xd6e9f3, roughness: 0.38, metalness: 0, normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4), clearcoat: 0.3, clearcoatRoughness: 0.5,
      emissive: 0x0d3550, emissiveIntensity: 0.22, side: THREE.DoubleSide, envMapIntensity: 1.1,
    });
    this.ice = new THREE.Mesh(geo, this.iceMat);
    this.ice.name = 'v2-ice-tongue-illustrative';
    this.ice.frustumCulled = false;
    this.group.add(this.ice);
    this._iceYear = null;
  }

  /** Rebuild the ice ribbon for `year`: front at frontForYear, thickness by thicknessForYear. */
  _shapeIce(year) {
    const front = frontForYear(year, this.anchors, this.L);
    const thick = Math.max(0.12, thicknessForYear(year, this.anchors));
    const s0 = front.s;
    const s1 = this.L + 4000; // ice continues upstream past the place-name coordinate
    const pos = this.ice.geometry.attributes.position;
    const C = this.iceCols;
    const halfW = 1100;
    const T = 320 * thick; // illustrative centre thickness above the valley floor (m)
    for (let r = 0; r <= this.iceRows; r++) {
      const surfRow = Math.max(0, r - 1);
      const u = surfRow / (this.iceRows - 1);
      const s = s0 + (s1 - s0) * u * u; // denser rows near the front
      const f = this.frameExt(s);
      const base = this.ground(f.x, f.z);
      // surface rises from the cliff top to the full thickness ~3 km upstream
      const rise = Math.min(1, (s - s0) / 3000);
      const cliffTop = base + 25 + 45 * thick;
      for (let c = 0; c < C; c++) {
        const a = (c / (C - 1)) * 2 - 1;
        const x = f.x + f.nx * a * halfW;
        const z = f.z + f.nz * a * halfW;
        const g = this.ground(x, z);
        let y = cliffTop + (T - 45 * thick) * rise * (1 - 0.35 * a * a);
        y = Math.max(y, g + 4);
        if (r === 0) y = Math.min(g, 0) - 25; // cliff foot under the water line
        pos.setXYZ(r * C + c, x, y, z);
      }
    }
    pos.needsUpdate = true;
    this.ice.geometry.computeVertexNormals();
    this.front = { ...this.frame(Math.min(this.L, s0)), s: s0, between: front.between, thick };
    this._iceYear = year;
  }

  // ---------- icebergs (instanced; drift down the inlet) ----------
  _buildBergs() {
    const r = this.rng;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + r() * 0.5;
      p.setXYZ(i, p.getX(i) * k, Math.max(-0.6, p.getY(i)) * k * 0.55, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8f3f8, roughness: 0.55, emissive: 0x123f5a, emissiveIntensity: 0.18, flatShading: true });
    const count = 14;
    this.bergs = new THREE.InstancedMesh(geo, mat, count);
    this.bergs.name = 'v2-icebergs-illustrative';
    this.bergState = [];
    for (let i = 0; i < count; i++) {
      this.bergState.push({ s: this.L * (0.05 + 0.55 * r()), off: (r() - 0.5) * 700, size: 12 + r() * 45, rot: r() * 6.28, speed: 1.2 + r() * 1.8, spin: (r() - 0.5) * 0.01 });
    }
    this.bergs.frustumCulled = false;
    this.group.add(this.bergs);
    this._placeBergs();
    this.life.addUpdater((dt) => {
      for (const b of this.bergState) {
        b.s -= b.speed * dt * 6; // drift toward the inlet mouth (time-compressed)
        b.rot += b.spin * dt * 6;
        if (b.s < this.L * 0.03) b.s = this.L * 0.6;
      }
      this._placeBergs();
    });
    this.counts.bergs = count;
  }

  _placeBergs() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const limit = this.front ? this.front.s - 300 : this.L * 0.6;
    this.bergState.forEach((b, i) => {
      if (b.s > limit) b.s = Math.max(this.L * 0.03, limit - 200);
      const f = this.frame(b.s);
      const x = f.x + f.nx * b.off, z = f.z + f.nz * b.off;
      const onWater = this.ground(x, z) < 2;
      v.set(x, 1.5, z);
      e.set(0, b.rot, 0); q.setFromEuler(e);
      sc.setScalar(onWater ? b.size : 0.0001);
      m.compose(v, q, sc);
      this.bergs.setMatrixAt(i, m);
    });
    this.bergs.instanceMatrix.needsUpdate = true;
  }

  // ---------- forest (older ground) + pioneer shrubs (newer ground), instanced ----------
  _buildForest() {
    const r = mulberry32(1794);
    const site = this.site;
    const g = site.grid;
    const halfX = ((g.width - 1) * g.mPerPx) / 2, halfZ = ((g.height - 1) * g.mPerPx) / 2;
    const slopeAt = (x, z) => {
      const d = 60;
      const hx = this.ground(x + d, z) - this.ground(x - d, z);
      const hz = this.ground(x, z + d) - this.ground(x, z - d);
      return Math.hypot(hx, hz) / (2 * d);
    };
    const trees = [], shrubs = [];
    // nearest along-path distance -> how long ago the ground was uncovered (rank 0 = oldest)
    const sNear = (x, z) => {
      let best = Infinity, bs = 0, acc = 0;
      for (let i = 0; i < this.points.length; i++) {
        if (i) acc += Math.hypot(this.points[i].x - this.points[i - 1].x, this.points[i].z - this.points[i - 1].z);
        const d = Math.hypot(this.points[i].x - x, this.points[i].z - z);
        if (d < best) { best = d; bs = acc; }
      }
      return { d: best, s: bs };
    };
    const nTrees = Math.round(1400 * this.lifeScale), nShrubs = Math.round(900 * this.lifeScale);
    for (let tries = 0; tries < 26000 && (trees.length < nTrees || shrubs.length < nShrubs); tries++) {
      const x = (r() * 2 - 1) * halfX, z = (r() * 2 - 1) * halfZ;
      const h = this.ground(x, z);
      if (h < 12 || h > 520) continue;
      const sl = slopeAt(x, z);
      if (sl > 0.55) continue;
      const near = sNear(x, z);
      if (near.d > 6000) continue;
      const rank = Math.min(1, Math.max(0, near.s / this.L)); // 0 = down-valley (uncovered first)
      if (rank < 0.72 && trees.length < nTrees) trees.push({ x, z, h, rank: rank / 0.72, k: 0.7 + r() * 0.6, rot: r() * 6.28 });
      else if (rank >= 0.45 && shrubs.length < nShrubs) shrubs.push({ x, z, h, rank: (rank - 0.45) / 0.55, k: 0.6 + r() * 0.8, rot: r() * 6.28 });
    }
    const crownGeo = new THREE.ConeGeometry(4.2, 18, 7, 1);
    crownGeo.translate(0, 13, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 6, 5);
    trunkGeo.translate(0, 3, 0);
    const shrubGeo = new THREE.SphereGeometry(2.2, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    this.crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x2f4f3a, roughness: 0.9, flatShading: true }), trees.length);
    this.trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }), trees.length);
    this.shrubMesh = new THREE.InstancedMesh(shrubGeo, new THREE.MeshStandardMaterial({ color: 0x5d7a3e, roughness: 0.95, flatShading: true }), shrubs.length);
    this.crowns.name = 'v2-conifers-illustrative';
    this.shrubMesh.name = 'v2-shrubs-illustrative';
    for (const im of [this.crowns, this.trunks, this.shrubMesh]) { im.frustumCulled = false; this.group.add(im); }
    this.treeData = trees;
    this.shrubData = shrubs;
    this.counts.trees = trees.length;
    this.counts.shrubs = shrubs.length;
  }

  _applyVegetation(year) {
    const cover = forestForYear(year, this.anchors); // 0.15 (1941) .. 1 (2004)
    const shrubCover = Math.min(1, 0.05 + 0.95 * (1 - pastAmount(year, this.anchors)) * 1.3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    let shown = 0;
    this.treeData.forEach((t, i) => {
      const vis = t.rank < cover;
      shown += vis ? 1 : 0;
      e.set(0, t.rot, 0); q.setFromEuler(e);
      v.set(t.x, t.h - 0.5, t.z);
      sc.setScalar(vis ? t.k : 0.0001);
      m.compose(v, q, sc);
      this.crowns.setMatrixAt(i, m);
      this.trunks.setMatrixAt(i, m);
    });
    this.shrubData.forEach((t, i) => {
      const vis = t.rank < shrubCover;
      e.set(0, t.rot, 0); q.setFromEuler(e);
      v.set(t.x, t.h - 0.3, t.z);
      sc.set(vis ? t.k * 1.4 : 0.0001, vis ? t.k : 0.0001, vis ? t.k * 1.4 : 0.0001);
      m.compose(v, q, sc);
      this.shrubMesh.setMatrixAt(i, m);
    });
    for (const im of [this.crowns, this.trunks, this.shrubMesh]) im.instanceMatrix.needsUpdate = true;
    this.visibleTrees = shown;
  }

  // ---------- low cloud on the peaks (instanced soft puffs, drifting) ----------
  _buildClouds() {
    const r = mulberry32(59);
    const g = this.site.grid;
    const halfX = ((g.width - 1) * g.mPerPx) / 2, halfZ = ((g.height - 1) * g.mPerPx) / 2;
    const peaks = [];
    for (let t = 0; t < 4000 && peaks.length < 40; t++) {
      const x = (r() * 2 - 1) * halfX * 0.9, z = (r() * 2 - 1) * halfZ * 0.9;
      const h = this.ground(x, z);
      if (h > 1100) peaks.push({ x, z, h });
    }
    const geo = new THREE.SphereGeometry(1, 10, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
    const per = this.low ? 2 : 4;
    this.clouds = new THREE.InstancedMesh(geo, mat, peaks.length * per);
    this.clouds.name = 'v2-low-cloud';
    this.clouds.frustumCulled = false;
    this.cloudData = [];
    peaks.forEach((p) => {
      for (let k = 0; k < per; k++) {
        this.cloudData.push({ x: p.x + (r() - 0.5) * 2400, z: p.z + (r() - 0.5) * 2400, y: p.h + 150 + r() * 250, sx: 900 + r() * 1300, sy: 140 + r() * 120, sz: 600 + r() * 900 });
      }
    });
    this.cloudBase = cloudsOpacity(1);
    this.group.add(this.clouds);
    this.cloudDrift = 0;
    this._placeClouds();
    this.life.addUpdater((dt, _t, calm = 1) => {
      this.cloudDrift += dt * 18; // m/s, wind from the west
      mat.opacity = cloudsOpacity(calm);
      this._placeClouds();
      if (this.cloudShadow) this.cloudShadow.value.set(this.cloudDrift, this.cloudDrift * 0.35);
    });
    this.counts.clouds = this.cloudData.length;
  }

  _placeClouds() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const wrap = 6000;
    this.cloudData.forEach((c, i) => {
      const dx = ((this.cloudDrift + wrap) % (2 * wrap)) - wrap;
      v.set(c.x + dx * 0.5, c.y, c.z + dx * 0.15);
      sc.set(c.sx, c.sy, c.sz);
      m.compose(v, q, sc);
      this.clouds.setMatrixAt(i, m);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  /**
   * Cloud shadows crossing the peaks: a moving world-space noise darkens the
   * terrain material (shader injection, no extra draw call).
   */
  applyCloudShadows(material) {
    const uOffset = { value: new THREE.Vector2() };
    this.cloudShadow = uOffset;
    // Reviews V3/H3: the drape is the 2024 image at every year. For past years
    // its green (vegetated) pixels are muted toward moraine brown #7A6A55 by
    // `past` (1 = 1941, 0 = 2004), so modern forest is not shown as 1941 ground.
    // Illustrative: it mutes all 2024 vegetation, not a mapped 1941 cover.
    const uVegMute = { value: this.past ?? 0 };
    this.vegMute = uVegMute;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCloudOffset = uOffset;
      shader.uniforms.uVegMute = uVegMute;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCloudXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;\nuniform vec2 uCloudOffset;\nuniform float uVegMute;')
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float vg = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);',
          'float vegK = uVegMute * smoothstep(0.004, 0.03, vg);',
          'float vl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
          'vec3 moraine = vec3(0.195, 0.144, 0.091) * clamp(vl / 0.12, 0.6, 1.6);',
          'diffuseColor.rgb = mix(diffuseColor.rgb, moraine, 0.9 * vegK);',
          'vec2 cq = (vCloudXZ - uCloudOffset) / 5200.0;',
          'float cn = sin(cq.x * 1.7 + sin(cq.y * 1.3)) * cos(cq.y * 1.1 - cq.x * 0.4);',
          'diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.35, 0.85, cn);',
        ].join('\n'));
    };
    material.needsUpdate = true;
  }

  // ---------- snow drifting off the high ground ----------
  _buildSnow() {
    const r = mulberry32(1100);
    const g = this.site.grid;
    const halfX = ((g.width - 1) * g.mPerPx) / 2, halfZ = ((g.height - 1) * g.mPerPx) / 2;
    let best = { x: 0, z: 0, h: 0 };
    for (let t = 0; t < 3000; t++) {
      const x = (r() * 2 - 1) * halfX * 0.8, z = (r() * 2 - 1) * halfZ * 0.8;
      const h = this.ground(x, z);
      if (h > best.h && Math.hypot(x - 2000, z + 9000) < 16000) best = { x, z, h };
    }
    this.snowCentre = best;
    this.snow = this.life.addParticleVolume({
      name: 'v2-snow-drift', center: [best.x, best.h + 250, best.z], extents: [9000, 700, 9000], count: Math.round(900 * this.lifeScale),
      color: 0xffffff, size: 26, opacity: 0.7, drift: [60, -25, 40],
    });
    this.snow.material.sizeAttenuation = true;
    this.snow.material.blending = THREE.NormalBlending;
  }

  // ---------- birds over the water (instanced gull silhouettes, flapping) ----------
  _buildBirds() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, 0.6, -1, 0.25, -0.2, 0, 0, -0.4,
      0, 0, 0.6, 0, 0, -0.4, 1, 0.25, -0.2,
    ]), 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x24303a, side: THREE.DoubleSide, fog: true });
    const n = 18;
    this.birds = new THREE.InstancedMesh(geo, mat, n);
    this.birds.name = 'v2-birds';
    this.birds.frustumCulled = false;
    const r = mulberry32(77);
    this.birdData = Array.from({ length: n }, (_, i) => ({ s: this.L * (0.1 + 0.4 * r()), rad: 250 + r() * 600, ph: r() * 6.28, h: 60 + r() * 120, w: 0.15 + r() * 0.1, flap: 5 + r() * 3, i }));
    this.group.add(this.birds);
    this.birdT = 0;
    this._placeBirds();
    this.life.addUpdater((dt) => { this.birdT += dt; this._placeBirds(); });
    this.counts.birds = n;
  }

  _placeBirds() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    for (const b of this.birdData) {
      const f = this.frame(b.s);
      const a = b.ph + this.birdT * b.w;
      v.set(f.x + Math.cos(a) * b.rad, b.h + Math.sin(this.birdT * 0.7 + b.ph) * 8, f.z + Math.sin(a) * b.rad);
      e.set(0, -a, 0); q.setFromEuler(e);
      const flap = 0.4 + 0.6 * Math.abs(Math.sin(this.birdT * b.flap + b.ph));
      sc.set(9, 9 * flap, 9);
      m.compose(v, q, sc);
      this.birds.setMatrixAt(b.i, m);
    }
    this.birds.instanceMatrix.needsUpdate = true;
  }

  // ---------- occasional calving event at the ice cliff (visual only) ----------
  _buildCalving() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(160, 70, 40), this.iceMat);
    slab.name = 'v2-calving-slab';
    slab.visible = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.name = 'v2-calving-splash';
    ring.visible = false;
    this.group.add(slab, ring);
    this.calving.slab = slab;
    this.calving.ring = ring;
    this.calving.events = 0;
    this.life.addUpdater((dt) => this._stepCalving(dt));
  }

  /** Start a calving event now (also used by tests). */
  triggerCalving() {
    const f = this.front;
    // Calving only where the drawn front meets the water (1941/1950 placements).
    if (!f || this.ground(f.x, f.z) > 15) return false;
    const c = this.calving;
    const y = this.ground(f.x, f.z) + 25 + 45 * f.thick;
    c.active = { t: 0, x: f.x - f.tx * 30, z: f.z - f.tz * 30, y0: y + 20, rx: f.tx, rz: f.tz };
    c.slab.visible = true;
    c.slab.position.set(c.active.x, c.active.y0, c.active.z);
    c.slab.rotation.set(0, Math.atan2(f.nx, f.nz), 0);
    c.ring.position.set(c.active.x - f.tx * 60, 2, c.active.z - f.tz * 60);
    c.events++;
    return true;
  }

  _stepCalving(dt) {
    const c = this.calving;
    if (!c.active) {
      c.t += dt;
      if (c.t >= c.next) { c.t = 0; c.next = 18 + this.rng() * 20; this.triggerCalving(); }
      return;
    }
    const a = c.active;
    a.t += dt;
    const fall = Math.min(1, a.t / 2.2);
    c.slab.position.y = a.y0 - fall * fall * (a.y0 + 30);
    c.slab.position.x = a.x - a.rx * fall * 60;
    c.slab.position.z = a.z - a.rz * fall * 60;
    c.slab.rotation.x = -fall * 1.2;
    if (a.t > 1.9) {
      const u = Math.min(1, (a.t - 1.9) / 3.5);
      c.ring.visible = true;
      c.ring.scale.setScalar(40 + u * 420);
      c.ring.material.opacity = 0.7 * (1 - u);
    }
    if (a.t > 5.6) { c.active = null; c.slab.visible = false; c.ring.visible = false; }
  }

  // ---------- water swell (scrolling normal map on the existing sea-level plane) ----------
  _buildWaterSwell() {
    const w = this.site.water;
    if (!w) return;
    const nm = normalMapFrom(128, swellHeight, 1.2);
    nm.repeat.set(90 * WATER_SCALE, 120 * WATER_SCALE);
    w.material.normalMap = nm;
    w.material.normalScale = new THREE.Vector2(0.18, 0.18);
    w.material.color.set(0x3f6b6f);
    w.material.needsUpdate = true;
    this.swell = nm;
    this.life.addUpdater((dt) => { nm.offset.x += dt * 0.004; nm.offset.y += dt * 0.0025; });
  }

  // ---------- photo spot: Poly Haven boulders, shrubs, driftwood (merged per model) ----------
  async _buildPhotoSpotDressing() {
    const P = this.photoSpot();
    const lib = new ModelLibrary();
    const r = mulberry32(13);
    const props = new THREE.Group();
    props.name = 'v2-photo-spot-props';
    this.group.add(props);
    const put = async (id, h, n, spread) => {
      for (let i = 0; i < n; i++) {
        const a = r() * 6.28, d = 8 + r() * spread;
        const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
        await lib.place(props, id, { position: [x, this.ground(x, z) - 0.2, z], rotationY: r() * 6.28, targetHeight: h * (0.7 + r() * 0.6), contactShadow: false, castShadow: false });
      }
    };
    await put('boulder_01', 3.2, 3, 50);
    await put('rock_07', 1.2, 4, 40);
    await put('rock_09', 0.9, 4, 40);
    await put('wild_rooibos_bush', 1.1, 6, 45);
    await put('dry_branches_medium_01', 0.6, 2, 30);
    mergeStaticGroup(props);
    this.photoProps = props;
    this.counts.photoProps = props.children.length;
  }

  /**
   * The photo spot. The real White Thunder Ridge camera station is UNVERIFIED
   * (research/sources.md row 26), so this is an approximate stand-in on the
   * ridge east of the inlet, labelled as approximate in the UI.
   */
  photoSpot() {
    if (this._photoSpot) return this._photoSpot;
    // Highest ground below 450 m within 3 km of a ridge point south-west of the
    // Riggs junction, looking north-east up the valley (the photos look NE).
    let best = { x: -5000, z: -9000, y: this.ground(-5000, -9000) };
    for (let i = -10; i <= 10; i++) {
      for (let j = -10; j <= 10; j++) {
        const x = -5000 + i * 300, z = -9000 + j * 300;
        const y = this.ground(x, z);
        if (y <= 450 && y > best.y) best = { x, z, y };
      }
    }
    this._photoSpot = { ...best, lookAt: [-2000, 400, -14000] };
    return this._photoSpot;
  }

  // ---------- time: ice front, vegetation, grade ----------
  setYear(year) {
    this.year = year;
    this._shapeIce(year);
    this._applyVegetation(year);
    this._placeBergs();
    this.past = pastAmount(year, this.anchors);
    if (this.vegMute) this.vegMute.value = this.past;
    this.onGrade?.(this.past);
  }

  setCalmMode(on) { this.life.setCalmMode(on); }
  setReducedMotion(on) { this.life.setReducedMotion(on); }
  update(dt, camera) {
    this.life.update(dt, camera);
    // Reviews M2/V12: the photo-spot props (~506 k triangles) are sub-pixel from
    // the overview; draw them only when the camera is within 3 km of the spot.
    if (this.photoProps && camera) {
      const P = this.photoSpot();
      this.photoProps.visible = Math.hypot(camera.position.x - P.x, camera.position.y - P.y, camera.position.z - P.z) < 3000;
    }
  }

  /** State summary for tests and the STATUS life checklist. */
  lifeSystems() {
    return ['iceberg-drift', 'water-swell', 'cloud-drift-and-shadows', 'snow-drift', 'birds', 'calving'];
  }
}

function cloudsOpacity(calm) { return 0.38 + 0.17 * calm; }
