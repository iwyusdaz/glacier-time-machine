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
// G2 (owner 2026-11-07: "flat slabs"): the surface is sampled finely enough to carry its relief:
// 12 m rows over the broken lower 2.4 km (crevasses, séracs), then wider rows up to the basin; 31 m columns.
const NEAR_ROWS = 200, NEAR_LEN = 2400, FAR_ROWS = 70, ROWS = NEAR_ROWS + FAR_ROWS, COLS = 73;
const CLIFF_ROWS = 14;

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** Hash and value noise (deterministic; never Math.random). */
export function hash2(x, y) { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); }
export function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/**
 * Surface relief of the drawn ice (m) at distance d up-glacier from the front
 * and lateral a (-1..1). Illustrative, from the textbook forms (Benn & Evans,
 * Glaciers and Glaciation, ch. 4): arcuate transverse crevasses, convex down
 * the valley, deepest in the broken lower ice; a sérac field of tilted blocks
 * just behind the calving front; chevron crevasses at the margins, where the
 * ice drags past the valley walls; low wave ogives. Pure (unit-tested).
 */
export function iceRelief(d, a) {
  if (d < 0) return 0;
  const A = Math.abs(a);
  const edge = 1 - 0.75 * smooth(0.8, 1.0, A);
  const lower = Math.exp(-d / 1600);
  // Transverse crevasses: sharp troughs between rounded crests.
  const ph = (d + 240 * a * a) / 46;
  const crest = Math.abs(Math.sin(ph * Math.PI)) ** 0.3;
  const crev = (crest - 0.78) * (2.5 + 11 * lower) * (0.55 + 0.9 * noise2(d / 95, a * 7));
  // Séracs: blocks of broken ice in the first ~500 m behind the front.
  const cs = 34, ci = Math.floor(d / cs), cj = Math.floor((a * ICE_HALF_WIDTH) / cs);
  const blk = (hash2(ci, cj) - 0.35) * 16 * Math.exp(-d / 380);
  // Chevron crevasses near the margins.
  const marg = A > 0.55 ? -3.2 * Math.abs(Math.sin(((d + (A - 0.55) * ICE_HALF_WIDTH * 0.9) / 30) * Math.PI)) ** 6 * smooth(0.55, 0.85, A) : 0;
  // Wave ogives below the icefall (low swells).
  const og = 2.6 * Math.sin((2 * Math.PI * (d + 300 * a * a)) / 130) * Math.exp(-d / 6000);
  return (crev + blk + marg + og) * edge;
}

/** Ice shader: blue in the crevasse troughs and on fresh faces, dirt bands (ogives), debris near the margins and the front. */
function patchIceMaterial(mat, { cliff = false } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iceData;\nvarying vec3 vIce;\nvarying vec3 vIceN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIce = iceData;\nvIceN = normalize(mat3(modelMatrix) * objectNormal);');
    const common = '#include <common>\nvarying vec3 vIce;\nvarying vec3 vIceN;';
    const tongue = [
      '#include <color_fragment>',
      // vIce: x lateral (-1..1), y metres up-glacier from the front, z relief (-1 trough .. 1 crest)
      'float iceUp = clamp(vIceN.y, 0.0, 1.0);',
      'vec3 deepBlue = vec3(0.30, 0.56, 0.78);',
      'float fresh = smoothstep(-0.25, -0.9, vIce.z) * 0.75 + 0.6 * (1.0 - smoothstep(0.55, 0.9, iceUp));',
      'diffuseColor.rgb *= mix(vec3(1.0), deepBlue, clamp(fresh, 0.0, 0.8));',
      'diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(-0.7, -1.0, vIce.z);',
      // Crevasses drawn per pixel along the same arcs as the relief troughs (iceRelief), so they read from
      // kilometres away: narrow, broken, blue-black lines, densest near the front; chevrons at the margins.
      'float cph = (vIce.y + 240.0 * vIce.x * vIce.x) / 46.0;',
      'float cs = abs(sin(cph * 3.14159));',
      'float cw = 0.06 + fwidth(cph) * 3.2;',
      'float seg = fract(sin(dot(vec2(floor(cph), floor(vIce.x * 1100.0 / 70.0 + 0.5 * sin(cph))), vec2(127.1, 311.7))) * 43758.5453);',
      'float lower = exp(-vIce.y / 1600.0);',
      'float crevK = (1.0 - smoothstep(0.0, cw, cs)) * step(0.32 - 0.25 * lower, seg) * (0.45 + 0.55 * lower);',
      'float ax = abs(vIce.x);',
      'float mph = (vIce.y + (ax - 0.55) * 990.0) / 30.0;',
      'crevK = max(crevK, (1.0 - smoothstep(0.0, 0.05 + fwidth(mph) * 3.0, abs(sin(mph * 3.14159)))) * smoothstep(0.6, 0.85, ax) * (1.0 - smoothstep(0.93, 1.0, ax)) * 0.8);',
      'crevK *= 1.0 - smoothstep(9000.0, 16000.0, vIce.y);',
      'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.27, 0.42), clamp(crevK, 0.0, 0.85));',
      // Séracs: broken blocks behind the front, each a slightly different white, with blue fractured sides.
      'vec2 cell = floor(vec2(vIce.y, vIce.x * 1100.0) / 34.0);',
      'float ch = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);',
      'diffuseColor.rgb *= mix(1.0, 0.82 + 0.3 * ch, exp(-vIce.y / 380.0));',
      'float ogv = sin(6.2832 * (vIce.y + 300.0 * vIce.x * vIce.x) / 130.0);',
      'float dirt = smoothstep(0.5, 0.97, ogv) * exp(-vIce.y / 7000.0) * 0.6;',
      'dirt += smoothstep(0.72, 0.97, abs(vIce.x)) * (0.3 + 0.2 * sin(vIce.x * 160.0 + vIce.y * 0.013));',
      'dirt += 0.22 * exp(-vIce.y / 900.0);',
      'dirt *= smoothstep(-0.2, 0.6, vIce.z) * iceUp;',
      'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.31, 0.27), clamp(dirt, 0.0, 0.7));',
      'float mv = sin(vIce.y / 310.0 + vIce.x * 4.0) * sin(vIce.y / 170.0 - vIce.x * 7.0);',
      'diffuseColor.rgb *= 0.93 + 0.07 * mv;',
    ].join('\n');
    const face = [
      '#include <color_fragment>',
      // Cliff: vIce.x lateral metres, y height (m) above sea level, z depth of the fracture (0 proud .. 1 deep)
      'float streak = 0.5 + 0.5 * sin(vIce.x * 0.21 + sin(vIce.x * 0.05) * 3.0);',
      'vec3 fresh = vec3(0.42, 0.70, 0.88);',
      'diffuseColor.rgb *= mix(vec3(0.97, 0.99, 1.0), fresh, clamp(0.25 + 0.6 * vIce.z + 0.15 * streak, 0.0, 0.9));',
      // Debris-rich basal ice near the water line, thin dark layers in the face.
      'float layer = smoothstep(0.82, 0.98, sin(vIce.y * 0.55 + sin(vIce.x * 0.02) * 2.0));',
      'float basal = (1.0 - smoothstep(2.0, 14.0, vIce.y)) * 0.55 + layer * 0.25 * (1.0 - smoothstep(10.0, 60.0, vIce.y));',
      'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.28, 0.25), clamp(basal, 0.0, 0.6));',
    ].join('\n');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', common).replace('#include <color_fragment>', cliff ? face : tongue);
  };
  mat.customProgramCacheKey = () => (cliff ? 'gtm-ice-cliff' : 'gtm-ice-tongue');
  return mat;
}

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
      // No colour map (G2): the 200 m crevasse photo repeated as rows of dark dashes. The relief, the shader
      // below and a faint normal map carry the surface.
      color: 0xeef3f5, normalMap: nor, normalScale: new THREE.Vector2(0.45, 0.45), roughnessMap: arm,
      roughness: 0.6, metalness: 0, emissive: 0x0b3550, emissiveIntensity: 0.04, envMapIntensity: 0.9, side: THREE.DoubleSide,
    });
    // Plain ice (séracs, the calving slab): no textures (their models have no UVs, so a normal or AO map read one texel).
    this.plainIceMat = new THREE.MeshStandardMaterial({ color: 0xdcebf3, roughness: 0.32, metalness: 0, emissive: 0x0b3a58, emissiveIntensity: 0.2, envMapIntensity: 1.15 });
    this.cliffMat = this.iceMat.clone();
    this.cliffMat.color.set(0xd5e9f4);
    this.cliffMat.emissive.set(0x0e4a6c);
    this.cliffMat.emissiveIntensity = 0.22;
    this.cliffMat.normalMap = null; this.cliffMat.roughnessMap = null;
    this.cliffMat.roughness = 0.4;
    patchIceMaterial(this.iceMat);
    patchIceMaterial(this.cliffMat, { cliff: true });

    const mk = (n, name, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      geo.setAttribute('iceData', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
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
    // Cliff: a grid from the jagged top edge down to below the water line, fractured into columns.
    this.cliff = mk(COLS * CLIFF_ROWS, 'calving-cliff', this.cliffMat);
    this.cliff.castShadow = true;
    const ci = [];
    for (let r = 0; r < CLIFF_ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) { const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1; ci.push(a, d, b, b, d, e); }
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
  _surfaceY(s, a, s0, thick, relief = false) {
    const site = this.site;
    const f = site.frame(s);
    const x = f.x + f.nx * a * ICE_HALF_WIDTH, z = f.z + f.nz * a * ICE_HALF_WIDTH;
    const base = site.ground(f.x, f.z);
    const rise = Math.min(1, (s - s0) / 3000);
    const cliffTop = base + 25 + 45 * thick;
    const T = 320 * thick;
    let y = cliffTop + (T - 45 * thick) * rise * (1 - 0.35 * a * a);
    if (relief) y += iceRelief(s - s0, a);
    y = Math.max(y, site.ground(x, z) + 4);
    return { x, y, z };
  }

  /** Reshape every part for `year` (front from the dated anchors only). */
  setYear(year) {
    this.year = year;
    const site = this.site;
    const fr = this.frontAt(year);
    const s0 = fr.s, s1 = site.L + 4000;
    const near = Math.min(NEAR_LEN, (s1 - s0) * 0.5);
    const sAt = (r) => (r < NEAR_ROWS ? s0 + near * (r / NEAR_ROWS) : s0 + near + (s1 - s0 - near) * ((r - NEAR_ROWS) / (FAR_ROWS - 1)) ** 1.6);
    const pos = this.tongue.geometry.attributes.position, uv = this.tongue.geometry.attributes.uv, dat = this.tongue.geometry.attributes.iceData;
    for (let r = 0; r < ROWS; r++) {
      const s = sAt(r);
      for (let c = 0; c < COLS; c++) {
        const a = (c / (COLS - 1)) * 2 - 1;
        const p = this._surfaceY(s, a, s0, fr.thick, true);
        const rel = iceRelief(s - s0, a);
        pos.setXYZ(r * COLS + c, p.x, p.y, p.z);
        uv.setXY(r * COLS + c, (a * ICE_HALF_WIDTH) / 200, (s - s0) / 200);
        dat.setXYZ(r * COLS + c, a, s - s0, Math.max(-1, Math.min(1, rel / 6)));
        if (c === 0 || c === COLS - 1) {
          const k = ROWS * COLS + r * 2 + (c === 0 ? 0 : 1);
          pos.setXYZ(k, p.x, site.ground(p.x, p.z) - 8, p.z);
          uv.setXY(k, (a * ICE_HALF_WIDTH) / 200 + (c === 0 ? -0.3 : 0.3), (s - s0) / 200);
          dat.setXYZ(k, a, s - s0, -1);
        }
      }
    }
    pos.needsUpdate = uv.needsUpdate = dat.needsUpdate = true;
    this.tongue.geometry.computeVertexNormals();
    this.tongue.geometry.computeBoundingBox();
    this.tongue.geometry.computeBoundingSphere();
    // Cliff face
    // Fractured calving face: columns set back by different depths along fracture planes, an undercut
    // notch at the water line, a jagged top edge, and the face leaning slightly out at the top (illustrative).
    const cp = this.cliff.geometry.attributes.position, cu = this.cliff.geometry.attributes.uv, cd = this.cliff.geometry.attributes.iceData;
    for (let c = 0; c < COLS; c++) {
      const top = new THREE.Vector3().fromBufferAttribute(pos, c);
      const a = (c / (COLS - 1)) * 2 - 1;
      const lat = a * ICE_HALF_WIDTH;
      const g = site.ground(top.x, top.z);
      const bot = Math.min(Math.min(site.heightAt(top.x, top.z) || 0, 0) - 25, g - 4);
      const col = hash2(Math.floor(lat / 26), 7);
      const tooth = (hash2(Math.floor(lat / 13), 3) - 0.4) * 9;
      for (let r = 0; r < CLIFF_ROWS; r++) {
        const k = r / (CLIFF_ROWS - 1);
        const yTop = top.y + (r === 0 ? Math.max(0, tooth) : 0);
        const y = yTop + (bot - yTop) * k;
        const above = y - 1.2;
        let back = col * 16 + noise2(lat / 9, y / 7) * 5;
        if (above > -1 && above < 7) back += 7 * (1 - Math.abs(above - 3) / 4); // wave-cut notch
        back -= 4 * (1 - k); // the upper face leans out a little
        if (r === 0) back = 0; // the top edge meets the surface
        const x = top.x + fr.tx * back, z = top.z + fr.tz * back;
        cp.setXYZ(r * COLS + c, x, y, z);
        cu.setXY(r * COLS + c, lat / 90, y / 90);
        cd.setXYZ(r * COLS + c, lat, y, Math.max(0, Math.min(1, back / 20)));
      }
    }
    cp.needsUpdate = cu.needsUpdate = cd.needsUpdate = true;
    this.cliff.geometry.computeVertexNormals();
    this.cliff.geometry.computeBoundingBox();
    this.cliff.geometry.computeBoundingSphere();
    // Pick bands
    // The crevasse field stops short of the margins, so the lateral moraines on the edges stay pickable (G2).
    const fillBand = (mesh, rows, sFrom, sTo, width = 1.02) => {
      const bp = mesh.geometry.attributes.position;
      for (let r = 0; r < rows; r++) {
        const s = sFrom + (sTo - sFrom) * (r / (rows - 1));
        for (let c = 0; c < COLS; c++) {
          const a = ((c / (COLS - 1)) * 2 - 1) * width;
          const p = this._surfaceY(s, a, s0, fr.thick, true);
          bp.setXYZ(r * COLS + c, p.x, p.y + 3, p.z);
        }
      }
      bp.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    };
    fillBand(this.terminusBand, 10, s0, s0 + 900);
    fillBand(this.crevasseBand, 16, s0 + 1400, s0 + 5200, 0.76);
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
    // The serac models have no UVs: the textured ice material read one texel of its normal and AO maps,
    // which drew them as dark flat shards (G2 owner screenshot). Plain ice instead.
    const mat = this.plainIceMat;
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
      im.userData.slots = Array.from({ length: n }, () => ({ a: (r() * 2 - 1) * 0.85, ds: 20 + r() * 380, yaw: r() * 6.28, k: 0.45 + r() * 0.6, tilt: (r() - 0.5) * 0.5 }));
      this.group.add(im);
      this.seracSets.push(im);
      this.seracRoots.push(im);
    }
  }

  _placeSeracs() {
    if (!this.seracOne || !this.front) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const fr = this.front;
    const e = new THREE.Euler();
    // Séracs stand in the broken ice behind the front, set into the surface and tilted (blocks toppling forward).
    const place = (a, ds, yaw, k, tilt = 0) => {
      const p = this._surfaceY(fr.s + ds, a, fr.s, fr.thick, true);
      v.set(p.x, p.y - 6 * k, p.z);
      e.set(tilt, yaw, tilt * 0.6);
      q.setFromEuler(e);
      sc.setScalar(k);
      return m4.compose(v, q, sc);
    };
    void up;
    place(0.12, 40, 0.4, 1);
    this.seracOne.matrix.copy(m4);
    this.seracOne.matrix.decompose(this.seracOne.position, this.seracOne.quaternion, this.seracOne.scale);
    for (const im of this.seracSets) {
      im.userData.slots.forEach((s, i) => im.setMatrixAt(i, place(s.a, s.ds, s.yaw, s.k * (0.5 + 0.5 * fr.thick), s.tilt)));
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- calving (time-lapse)
  _calvingParts() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(140, 70, 36, 6, 4, 2), this.plainIceMat);
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
    const mat = new THREE.MeshStandardMaterial({ color: 0xeef6fa, roughness: 0.4, emissive: 0x0b3a55, emissiveIntensity: 0.18 }); // no UVs in the model: no map
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
