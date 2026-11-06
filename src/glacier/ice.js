/**
 * ice.js — the drawn ice of Muir Glacier (v3 carry-over "ice tongue").
 *
 * HONESTY RULE (design/art-bible.md §7): the front is placed ONLY at the three
 * dated anchors along the DEM valley path (systems/time-front.js); between
 * anchors the shape is interpolated for the animation and labelled
 * illustrative. Thickness, width and surface are approximate.
 *
 * Parts (separate meshes so each catalog object has its own root):
 *  - ice tongue: crevassed surface (S4 crevasse texture set, 200 m tiles, v = flow),
 *    with side walls down to the valley floor so the edges never float;
 *  - calving cliff: the vertical front face down to below the water line;
 *  - terminus and crevasse field: invisible pick shapes over the last ~900 m
 *    and over the fast-flowing middle, which tint while hovered or open;
 *  - séracs at the front (S4 seracs.glb, the 1941 caption's terminus séracs);
 *  - calving (time-lapse: far more often than a real front), splash and spray;
 *  - brash ice in front of a calving face.
 * @module glacier/ice
 */
import * as THREE from 'three';
import { frontForYear, thicknessForYear } from '../systems/time-front.js';
import { loadKTX2, loadGLB, mulberry32, bakedNodeGeometry } from './loaders.js';

export const ICE_HALF_WIDTH = 1100;
const ROWS = 64, COLS = 13;

/** A soft radial texture (splash ring, plume, glints): textured, so never an abstract marker. */
export function radialTexture(stops = [[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']], ring = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, ring ? 40 : 2, 64, 64, 63);
  for (const [k, col] of stops) grd.addColorStop(k, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Highlight material for invisible pick shapes: drawn only while hovered, focused or open. */
export function proxyMaterial(color = 0x7fb7d6) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true, side: THREE.DoubleSide });
  m.visible = false;
  return m;
}

export class GlacierIce {
  constructor(site, anchors) {
    this.site = site;
    this.anchors = anchors;
    this.group = new THREE.Group();
    this.group.name = 'ice';
    this.rng = mulberry32(1941);
    this.calving = { t: 0, next: 6, active: null, events: 0 };
    this.year = null;
  }

  async build(renderer) {
    const tex = await Promise.all([
      loadKTX2(renderer, 'assets/textures/crevasse_field_diff.ktx2', { repeat: true }),
      loadKTX2(renderer, 'assets/textures/crevasse_field_nor.ktx2', { repeat: true, srgb: false }),
      loadKTX2(renderer, 'assets/textures/crevasse_field_arm.ktx2', { repeat: true, srgb: false }),
    ]).catch((e) => { console.warn('crevasse textures not loaded:', e.message); return [null, null, null]; });
    const [diff, nor, arm] = tex;
    this.iceMat = new THREE.MeshStandardMaterial({
      color: 0xe4f1f8, map: diff, normalMap: nor, normalScale: new THREE.Vector2(1.6, 1.6), roughnessMap: arm, aoMap: arm,
      roughness: 0.55, metalness: 0, emissive: 0x0b3550, emissiveIntensity: 0.16, envMapIntensity: 1.1, side: THREE.DoubleSide,
    });
    this.cliffMat = this.iceMat.clone();
    this.cliffMat.color.set(0xcfe6f2);
    this.cliffMat.emissive.set(0x0e4a6c);
    this.cliffMat.emissiveIntensity = 0.3;
    this.cliffMat.normalScale.set(2.4, 2.4);

    const mk = (n, name, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    // Surface grid + two side walls (bottom row per edge) share one mesh.
    this.tongue = mk(ROWS * COLS + ROWS * 2, 'ice-tongue-illustrative', this.iceMat);
    this.tongue.castShadow = this.tongue.receiveShadow = true;
    this.tongue.userData.noOutline = true;
    const idx = [];
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) { const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1; idx.push(a, d, b, b, d, e); }
    const W0 = ROWS * COLS; // side-wall bottom vertices: W0 + r*2 (left), +1 (right)
    for (let r = 0; r < ROWS - 1; r++) {
      const tl = r * COLS, tl2 = (r + 1) * COLS, bl = W0 + r * 2, bl2 = W0 + (r + 1) * 2;
      idx.push(tl, bl, tl2, tl2, bl, bl2);
      const tr = r * COLS + COLS - 1, tr2 = (r + 1) * COLS + COLS - 1, br = bl + 1, br2 = bl2 + 1;
      idx.push(tr, tr2, br, br, tr2, br2);
    }
    this.tongue.geometry.setIndex(idx);
    // Cliff: top row = the first surface row, bottom row under the water line.
    this.cliff = mk(COLS * 2, 'calving-cliff', this.cliffMat);
    this.cliff.castShadow = true;
    const ci = [];
    for (let c = 0; c < COLS - 1; c++) { const a = c, b = c + 1, d = COLS + c, e = d + 1; ci.push(a, d, b, b, d, e); }
    this.cliff.geometry.setIndex(ci);
    // Pick shapes (terminus band and crevasse field), lifted 3 m over the surface.
    const band = (rows, name) => {
      const m = mk(rows * COLS, name, proxyMaterial());
      const bi = [];
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < COLS - 1; c++) { const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1; bi.push(a, d, b, b, d, e); }
      m.geometry.setIndex(bi);
      m.userData.noOutline = true;
      m.userData.proxy = true;
      m.renderOrder = 3;
      return m;
    };
    this.terminusBand = band(10, 'muir-terminus-band');
    this.crevasseBand = band(16, 'crevasse-field-band');

    await this._seracs(renderer);
    this._calvingParts();
    await this._brash(renderer);
    return this;
  }

  /** Along-path distance of the front for a year, the frame there, and the thickness factor. */
  frontAt(year) {
    const f = frontForYear(year, this.anchors, this.site.L);
    const thick = Math.max(0.12, thicknessForYear(year, this.anchors));
    return { ...this.site.frame(f.s), between: f.between, thick };
  }

  /** Surface height of the drawn ice at along-path s and lateral a (-1..1). */
  _surfaceY(s, a, s0, thick) {
    const site = this.site;
    const f = site.frame(s);
    const x = f.x + f.nx * a * ICE_HALF_WIDTH, z = f.z + f.nz * a * ICE_HALF_WIDTH;
    const base = site.ground(f.x, f.z);
    const rise = Math.min(1, (s - s0) / 3000);
    const cliffTop = base + 25 + 45 * thick;
    const T = 320 * thick;
    let y = cliffTop + (T - 45 * thick) * rise * (1 - 0.35 * a * a);
    y = Math.max(y, site.ground(x, z) + 4);
    return { x, y, z };
  }

  /** Reshape every part for `year` (front from the dated anchors only). */
  setYear(year) {
    this.year = year;
    const site = this.site;
    const fr = this.frontAt(year);
    const s0 = fr.s, s1 = site.L + 4000;
    const sAt = (r) => s0 + (s1 - s0) * (r / (ROWS - 1)) ** 2;
    const pos = this.tongue.geometry.attributes.position, uv = this.tongue.geometry.attributes.uv;
    for (let r = 0; r < ROWS; r++) {
      const s = sAt(r);
      for (let c = 0; c < COLS; c++) {
        const a = (c / (COLS - 1)) * 2 - 1;
        const p = this._surfaceY(s, a, s0, fr.thick);
        pos.setXYZ(r * COLS + c, p.x, p.y, p.z);
        uv.setXY(r * COLS + c, (a * ICE_HALF_WIDTH) / 200, (s - s0) / 200);
        if (c === 0 || c === COLS - 1) {
          const k = ROWS * COLS + r * 2 + (c === 0 ? 0 : 1);
          pos.setXYZ(k, p.x, site.ground(p.x, p.z) - 8, p.z);
          uv.setXY(k, (a * ICE_HALF_WIDTH) / 200 + (c === 0 ? -0.3 : 0.3), (s - s0) / 200);
        }
      }
    }
    pos.needsUpdate = uv.needsUpdate = true;
    this.tongue.geometry.computeVertexNormals();
    this.tongue.geometry.computeBoundingBox();
    this.tongue.geometry.computeBoundingSphere();
    // Cliff face
    const cp = this.cliff.geometry.attributes.position, cu = this.cliff.geometry.attributes.uv;
    for (let c = 0; c < COLS; c++) {
      const top = new THREE.Vector3().fromBufferAttribute(pos, c);
      const a = (c / (COLS - 1)) * 2 - 1;
      const g = site.ground(top.x, top.z);
      const bot = Math.min(site.heightAt(top.x, top.z) || 0, 0) - 25;
      cp.setXYZ(c, top.x, top.y, top.z);
      cp.setXYZ(COLS + c, top.x - fr.tx * 6, Math.min(bot, g - 4), top.z - fr.tz * 6);
      cu.setXY(c, (a * ICE_HALF_WIDTH) / 120, top.y / 120);
      cu.setXY(COLS + c, (a * ICE_HALF_WIDTH) / 120, bot / 120);
    }
    cp.needsUpdate = cu.needsUpdate = true;
    this.cliff.geometry.computeVertexNormals();
    this.cliff.geometry.computeBoundingBox();
    this.cliff.geometry.computeBoundingSphere();
    // Pick bands
    const fillBand = (mesh, rows, sFrom, sTo) => {
      const bp = mesh.geometry.attributes.position;
      for (let r = 0; r < rows; r++) {
        const s = sFrom + (sTo - sFrom) * (r / (rows - 1));
        for (let c = 0; c < COLS; c++) {
          const a = ((c / (COLS - 1)) * 2 - 1) * 1.02;
          const p = this._surfaceY(s, a, s0, fr.thick);
          bp.setXYZ(r * COLS + c, p.x, p.y + 3, p.z);
        }
      }
      bp.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    };
    fillBand(this.terminusBand, 10, s0, s0 + 900);
    fillBand(this.crevasseBand, 16, s0 + 1400, s0 + 5200);
    this.front = { ...fr, s: s0, onWater: site.ground(fr.x, fr.z) < 15, top: new THREE.Vector3().fromBufferAttribute(pos, (COLS - 1) / 2) };
    this._placeSeracs();
    this._placeBrash();
  }

  // ---------------------------------------------------------------- séracs
  async _seracs(renderer) {
    const gltf = await loadGLB(renderer, 'assets/models/v3/seracs.glb').catch(() => null);
    this.seracSets = [];
    this.seracRoots = [];
    if (!gltf) return;
    const meshes = [];
    gltf.scene.traverse((m) => { if (m.isMesh) meshes.push(m); });
    const mat = this.iceMat.clone();
    mat.map = null; mat.color.set(0xeaf5fb); mat.emissiveIntensity = 0.22; mat.normalScale.set(0.8, 0.8);
    const r = mulberry32(17);
    // One plain serac (catalog scale reference, serac-1: 9 x 17 x 7 m) plus instanced rows.
    const ref = meshes.find((m) => m.name === 'serac-1') || meshes[0];
    const one = new THREE.Mesh(bakedNodeGeometry(ref), mat);
    one.name = 'serac-reference';
    one.castShadow = true;
    one.userData.scaleFrame = 'local';
    this.group.add(one);
    this.seracOne = one;
    this.seracRoots.push(one);
    for (const m of meshes) {
      const n = 14;
      const im = new THREE.InstancedMesh(bakedNodeGeometry(m), mat, n);
      im.name = `seracs-${m.name}`;
      im.castShadow = true;
      im.frustumCulled = false;
      im.userData.slots = Array.from({ length: n }, () => ({ a: (r() * 2 - 1) * 0.9, ds: 15 + r() * 220, yaw: r() * 6.28, k: 0.7 + r() * 0.9 }));
      this.group.add(im);
      this.seracSets.push(im);
      this.seracRoots.push(im);
    }
  }

  _placeSeracs() {
    if (!this.seracOne || !this.front) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const fr = this.front;
    const place = (a, ds, yaw, k) => {
      const p = this._surfaceY(fr.s + ds, a, fr.s, fr.thick);
      v.set(p.x, p.y - 2, p.z);
      q.setFromAxisAngle(up, yaw);
      sc.setScalar(k);
      return m4.compose(v, q, sc);
    };
    place(0.12, 40, 0.4, 1);
    this.seracOne.matrix.copy(m4);
    this.seracOne.matrix.decompose(this.seracOne.position, this.seracOne.quaternion, this.seracOne.scale);
    for (const im of this.seracSets) {
      im.userData.slots.forEach((s, i) => im.setMatrixAt(i, place(s.a, s.ds, s.yaw, s.k * (0.5 + 0.5 * fr.thick))));
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- calving (time-lapse)
  _calvingParts() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(140, 70, 36, 6, 4, 2), this.cliffMat);
    const p = slab.geometry.attributes.position;
    const r = mulberry32(5);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + r() * 0.2), p.getY(i) * (0.92 + r() * 0.16), p.getZ(i) * (0.85 + r() * 0.3));
    slab.geometry.computeVertexNormals();
    slab.name = 'calving-slab';
    slab.visible = false;
    slab.castShadow = true;
    const splash = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(240,248,252,0.25)'], [0.8, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']], true),
      transparent: true, opacity: 0, depthWrite: false, fog: true,
    }));
    splash.name = 'calving-splash';
    splash.visible = false;
    splash.renderOrder = 2;
    const sprayGeo = new THREE.BufferGeometry();
    const N = 220;
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this._sprayVel = new Float32Array(N * 3);
    const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xf2f8fb, size: 9, map: radialTexture(), transparent: true, depthWrite: false, opacity: 0.9, fog: true }));
    spray.name = 'calving-spray';
    spray.visible = false;
    spray.frustumCulled = false;
    this.group.add(slab, splash, spray);
    Object.assign(this.calving, { slab, splash, spray });
  }

  /** Start a calving event now (also used by tests). Only where the front meets the water. */
  triggerCalving() {
    const f = this.front;
    if (!f || !f.onWater) return false;
    const c = this.calving;
    const r = this.rng;
    const a = (r() * 2 - 1) * 0.6;
    const top = this._surfaceY(f.s, a, f.s, f.thick);
    c.active = { t: 0, x: top.x - f.tx * 22, z: top.z - f.tz * 22, y0: top.y - 30, tx: f.tx, tz: f.tz };
    c.slab.visible = true;
    c.slab.position.set(c.active.x, c.active.y0, c.active.z);
    c.slab.rotation.set(0, Math.atan2(f.nx, f.nz), 0);
    c.splash.position.set(c.active.x - f.tx * 70, 1.6, c.active.z - f.tz * 70);
    const sp = c.spray.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      sp.setXYZ(i, c.splash.position.x + (r() - 0.5) * 120, 2, c.splash.position.z + (r() - 0.5) * 120);
      this._sprayVel.set([(r() - 0.5) * 18 - f.tx * 10, 18 + r() * 34, (r() - 0.5) * 18 - f.tz * 10], i * 3);
    }
    sp.needsUpdate = true;
    c.events++;
    return true;
  }

  /** Motion system step (scene time). Ballistic fall (g = 9.81) and spray; frequency is time-lapse. */
  stepCalving(dt) {
    const c = this.calving;
    if (!c.active) {
      c.t += dt;
      if (c.t >= c.next) { c.t = 0; c.next = 22 + this.rng() * 18; this.triggerCalving(); }
      return;
    }
    const a = c.active;
    a.t += dt;
    const fallT = Math.sqrt((2 * (a.y0 + 20)) / 9.81); // free fall to the water line
    const k = Math.min(1, a.t / fallT);
    c.slab.position.y = a.y0 - 0.5 * 9.81 * Math.min(a.t, fallT) ** 2;
    c.slab.position.x = a.x - a.tx * k * 55;
    c.slab.position.z = a.z - a.tz * k * 55;
    c.slab.rotation.x = -k * 1.1;
    if (a.t > fallT) {
      const u = Math.min(1, (a.t - fallT) / 4.5);
      c.splash.visible = true;
      c.splash.scale.setScalar(30 + u * 380);
      c.splash.material.opacity = 0.85 * (1 - u);
      c.spray.visible = u < 1;
      c.spray.material.opacity = 0.9 * (1 - u);
      const sp = c.spray.geometry.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const vy = this._sprayVel[i * 3 + 1] -= 9.81 * dt;
        sp.setXYZ(i, sp.getX(i) + this._sprayVel[i * 3] * dt, Math.max(1.5, sp.getY(i) + vy * dt), sp.getZ(i) + this._sprayVel[i * 3 + 2] * dt);
      }
      sp.needsUpdate = true;
      c.slab.position.y = Math.max(-30, -20 - (a.t - fallT) * 3);
    }
    if (a.t > fallT + 6) { c.active = null; c.slab.visible = false; c.splash.visible = false; c.spray.visible = false; }
  }

  // ---------------------------------------------------------------- brash ice
  async _brash(renderer) {
    const gltf = await loadGLB(renderer, 'assets/models/v3/brash-ice.glb').catch(() => null);
    this.brashSets = [];
    if (!gltf) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xeef6fa, roughness: 0.4, emissive: 0x0b3a55, emissiveIntensity: 0.18, map: this.iceMat.map });
    const r = mulberry32(23);
    const meshes = [];
    gltf.scene.traverse((m) => { if (m.isMesh) meshes.push(m); });
    // The catalog reference piece (brash-2: about 1.2 x 0.45 x 1.1 m) comes first in the scene graph.
    const ref = meshes.find((m) => m.name === 'brash-2') || meshes[0];
    this.brashOne = new THREE.Mesh(bakedNodeGeometry(ref), mat);
    this.brashOne.name = 'brash-reference';
    this.brashOne.userData.scaleFrame = 'local';
    this.group.add(this.brashOne);
    for (const m of meshes) {
      const n = 90;
      const im = new THREE.InstancedMesh(bakedNodeGeometry(m), mat, n);
      im.name = `brash-${m.name}`;
      im.frustumCulled = false;
      im.userData.slots = Array.from({ length: n }, () => ({ d: 20 + (r() ** 1.6) * 900, a: (r() * 2 - 1) * 1.05, yaw: r() * 6.28, k: 0.6 + r() * 2.2, ph: r() * 6.28 }));
      this.group.add(im);
      this.brashSets.push(im);
    }
    this.brashT = 0;
  }

  /** Brash ice sits only in front of a calving (water) front; it bobs on the swell. */
  _placeBrash() {
    if (!this.brashOne || !this.front) return;
    const fr = this.front;
    const show = fr.onWater;
    this.brashOne.visible = show;
    for (const im of this.brashSets) im.visible = show;
    if (!show) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const t = this.brashT;
    const put = (s) => {
      const f = this.site.frame(fr.s - s.d);
      const x = f.x + f.nx * s.a * ICE_HALF_WIDTH, z = f.z + f.nz * s.a * ICE_HALF_WIDTH;
      const water = this.site.ground(x, z) < 1;
      e.set(Math.sin(t * 0.9 + s.ph) * 0.05, s.yaw + t * 0.01, Math.cos(t * 0.7 + s.ph) * 0.05);
      q.setFromEuler(e);
      v.set(x, 1.0 + Math.sin(t * 1.1 + s.ph) * 0.12, z);
      sc.setScalar(water ? s.k : 0.0001);
      return m4.compose(v, q, sc);
    };
    put({ d: 60, a: 0.05, yaw: 0.3, k: 1, ph: 0 });
    this.brashOne.position.copy(v); this.brashOne.quaternion.copy(q); this.brashOne.scale.setScalar(1);
    for (const im of this.brashSets) {
      im.userData.slots.forEach((s, i) => im.setMatrixAt(i, put(s)));
      im.instanceMatrix.needsUpdate = true;
    }
  }

  stepBrash(dt) { this.brashT += dt; if (this.front?.onWater) this._placeBrash(); }
}
