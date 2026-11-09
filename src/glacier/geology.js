/**
 * geology.js — the ground around the photo station (G2 owner feedback
 * 2026-11-07: "plain grey-green foreground terrain"). The 30 m elevation model
 * and the 10 m image cannot show anything a person standing there would see,
 * so the near ground gets the deposits a recently deglaciated ridge in Glacier
 * Bay is made of (illustrative placement, real kinds of landform):
 *  - ice-smoothed bedrock outcrops (roches moutonnées): smooth on the side the
 *    ice came from, plucked and blocky on the down-glacier side, long axis
 *    along the former ice flow;
 *  - glacial erratics (boulders the ice dropped), subrounded, half buried;
 *  - till: cobbles and gravel strewn over the ground, densest near the station,
 *    and scree aprons below the plucked faces;
 *  - pioneer plants that grow where they do on new till: moss cushions in the
 *    lee of boulders, Dryas mats and fireweed on open gravel. They appear in
 *    their documented order (moss, then Dryas and fireweed; timing
 *    illustrative) and never in 1941 or 1950, when the ridge was bare.
 * The near-ground texture (till and rock detail with detail normals) is the
 * terrain shader patch in site.js.
 *
 * Rocks are generated here (own work, no download): displaced icosahedra cut
 * by fracture planes, drawn instanced with a world-space triplanar rock
 * texture (Poly Haven rock_face, CC0) and moss on the tops in later years
 * (Poly Haven mossy_rock, CC0). Each rock has a soft contact shadow on the
 * ground (the 52 km sun shadow map is far too coarse for rocks).
 * @module glacier/geology
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, loadGLB, loadKTX2, bakedNodeGeometry } from './loaders.js';
import { radialTexture } from './ice.js';
import { nearestAlong } from '../systems/flowline.js';

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function hash3(x, y, z) { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); }
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const h = (i, j, k) => hash3(ix + i, iy + j, iz + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const fbm = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.1;

/**
 * A rock: a unit icosahedron displaced by noise and cut by fracture planes.
 * `cuts` planes (angular, fractured faces); `pluckedX` > 0 keeps the cuts on
 * the +x half only (a roche moutonnée: smooth stoss side at -x, plucked lee at +x);
 * `squash` flattens it; the base is flat (it sits in the ground). Pure.
 */
export function rockGeometry(seed, { detail = 2, cuts = 5, rough = 0.22, squash = 0.75, pluckedX = 0, stretch = 1 } = {}) {
  const r = mulberry32(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const planes = Array.from({ length: cuts }, () => {
    const n = new THREE.Vector3(r() * 2 - 1, (r() * 2 - 1) * 0.7, r() * 2 - 1).normalize();
    if (pluckedX > 0) n.x = Math.abs(n.x) + 0.6;
    return { n: n.normalize(), d: 0.62 + r() * 0.3 };
  });
  const p = g.attributes.position, v = new THREE.Vector3(), o = seed * 3.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let len = 1 + rough * (fbm(v.x * 1.6 + o, v.y * 1.6, v.z * 1.6) - 0.5) * 2 + 0.1 * (noise3(v.x * 6 + o, v.y * 6, v.z * 6) - 0.5);
    for (const pl of planes) { const k = v.dot(pl.n); if (k > 0.05) len = Math.min(len, pl.d / k); }
    v.multiplyScalar(len);
    v.x *= stretch;
    v.y *= squash;
    if (v.y < -0.35 * squash) v.y = -0.35 * squash - (v.y + 0.35 * squash) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // A plain BufferGeometry: after displacement and the fracture cuts this is no longer an icosahedron.
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2)); // unused: the material is triplanar
  out.setIndex(g.index);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** World-space triplanar rock material (no UVs needed), darker at the base, moss on the tops with `uMoss` (0..1). */
export function rockMaterial(tex) {
  const U = { uRockN: { value: tex.rockN }, uMossMap: { value: tex.moss }, uMoss: { value: 0 } };
  // `map` is the rock photo, sampled triplanar below (map_fragment is replaced), so the material is textured like any other.
  const mat = new THREE.MeshStandardMaterial({ color: 0xa6a6a2, map: tex.rock, roughness: 0.92, metalness: 0, envMapIntensity: 0.8 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpW;\nvarying vec3 vTpN;\nvarying float vTpY;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vec4 tpw = vec4(transformed, 1.0);',
        '#ifdef USE_INSTANCING',
        'tpw = instanceMatrix * tpw;',
        'vTpN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);',
        '#else',
        'vTpN = normalize(mat3(modelMatrix) * objectNormal);',
        '#endif',
        'vTpW = (modelMatrix * tpw).xyz;',
        'vTpY = position.y;',
      ].join('\n'));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpW;\nvarying vec3 vTpN;\nvarying float vTpY;\nuniform sampler2D uRockN;\nuniform sampler2D uMossMap;\nuniform float uMoss;\nvec3 tpW3;')
      .replace('#include <map_fragment>', [
        'vec3 tpn = normalize(vTpN);',
        'tpW3 = pow(abs(tpn), vec3(4.0)); tpW3 /= (tpW3.x + tpW3.y + tpW3.z);',
        'vec3 tq = vTpW / 2.4;',
        'vec3 rc = texture2D(map, tq.zy).rgb * tpW3.x + texture2D(map, tq.xz).rgb * tpW3.y + texture2D(map, tq.xy).rgb * tpW3.z;',
        // Glacier Bay bedrock and erratics are grey (granodiorite, greywacke): the warm photo texture is mostly desaturated.
        'rc = mix(vec3(dot(rc, vec3(0.2126, 0.7152, 0.0722))), rc, 0.3);',
        'diffuseColor.rgb *= rc * 2.3;',
        // Moss on the upward-facing tops (later years only), patchy.
        'float mk = uMoss * smoothstep(0.55, 0.9, tpn.y) * smoothstep(0.35, 0.65, texture2D(uMossMap, vTpW.xz / 3.1).g * 1.6);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uMossMap, vTpW.xz / 3.0).rgb * 1.1, clamp(mk, 0.0, 0.85));',
        // Ambient occlusion where the rock meets the ground.
        'diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(-0.32, 0.25, vTpY));',
      ].join('\n'))
      .replace('#include <normal_fragment_maps>', [
        '#include <normal_fragment_maps>',
        'vec3 nx = texture2D(uRockN, tq.zy).xyz * 2.0 - 1.0;',
        'vec3 ny = texture2D(uRockN, tq.xz).xyz * 2.0 - 1.0;',
        'vec3 nz = texture2D(uRockN, tq.xy).xyz * 2.0 - 1.0;',
        // Whiteout-style blend of the three projections into a world normal.
        'vec3 wn = normalize((vec3(0.0, nx.y, nx.x) * tpW3.x + vec3(ny.x, 0.0, ny.y) * tpW3.y + vec3(nz.x, nz.y, 0.0) * tpW3.z) * 1.6 + tpn);',
        'normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'gtm-rock-triplanar';
  mat.userData.U = U;
  return mat;
}

export class StationGeology {
  /**
   * @param {import('./site.js').MuirSite} site
   * @param {{x:number,z:number,y:number,look:THREE.Vector3}} station
   * @param {{x:number,z:number,yaw:number}} transectAt
   */
  constructor(site, station, transectAt) {
    this.site = site;
    this.station = station;
    this.at = transectAt;
    this.group = new THREE.Group();
    this.group.name = 'station-geology';
    this.group.visible = false; // until the rock textures have streamed in
    this.sets = [];
    this.year = 1941;
    this.dirty = true;
    this._k = 0;
  }

  /** Keep rocks off the photo stations, the camera spot and the plant transect. */
  _free(x, z, rad) {
    const S = this.station, A = this.at;
    if (Math.hypot(x - S.x, z - S.z) < 5 + rad) return false;
    const ex = S.x - S.look.x * 2.5, ez = S.z - S.look.z * 2.5;
    if (Math.hypot(x - ex, z - ez) < 2.5 + rad) return false;
    const dx = Math.cos(A.yaw), dz = Math.sin(A.yaw);
    const u = (x - A.x) * dx + (z - A.z) * dz, w = Math.abs(-(x - A.x) * dz + (z - A.z) * dx);
    if (u > -2 - rad && u < 24 + rad && w < 3.6 + rad) return false;
    // Keep the view from the station to the inlet open (no boulder right in front of the lens).
    const lu = (x - ex) * S.look.x + (z - ez) * S.look.z, lw = Math.abs(-(x - ex) * S.look.z + (z - ez) * S.look.x);
    if (lu > 0 && lu < 40 && lw < 2 + lu * 0.25 + rad) return false;
    return this.site.ground(x, z) > 3;
  }

  async build(renderer) {
    const site = this.site, S = this.station;
    const r = mulberry32(1950);
    // Former ice flow at the station: down the valley path (the ridge was overridden by Muir Glacier ice).
    const n = nearestAlong(site.points, S.x, S.z);
    const f = site.frame(n.s);
    this.flowYaw = Math.atan2(f.tz, -f.tx); // rotation.y that turns an outcrop's +x (its plucked lee) down-glacier
    this.kinds = {
      outcrop: [rockGeometry(11, { detail: 4, cuts: 7, rough: 0.2, squash: 0.55, pluckedX: 1, stretch: 1.6 }), rockGeometry(12, { detail: 4, cuts: 8, rough: 0.24, squash: 0.62, pluckedX: 1, stretch: 1.3 })],
      boulder: [rockGeometry(21, { detail: 3, cuts: 8, rough: 0.28, squash: 0.74 }), rockGeometry(22, { detail: 3, cuts: 10, rough: 0.24, squash: 0.62 }), rockGeometry(23, { detail: 3, cuts: 7, rough: 0.32, squash: 0.85 })],
      cobble: [rockGeometry(31, { detail: 1, cuts: 5, rough: 0.2, squash: 0.6 }), rockGeometry(32, { detail: 1, cuts: 6, rough: 0.15, squash: 0.5 })],
    };
    const items = { outcrop: [], boulder: [], cobble: [] };
    const tryPlace = (kind, radius, size, n, test = () => true) => {
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
        const x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
        const s = size(d);
        if (!this._free(x, z, s * 0.6) || !test(x, z, s)) continue;
        items[kind].push({ x, z, s, v: Math.floor(r() * this.kinds[kind].length), yaw: r() * 6.28, tilt: (r() - 0.5) * 0.25, ph: r() });
        i++;
      }
    };
    const slope = (x, z) => site.slopeAt(x, z, 15);
    // Outcrops on the steeper, convex ground (where the bedrock comes to the surface).
    // Three outcrops in the station's view, beside (not in front of) the lens.
    for (const [ahead, side, sz] of [[34, -16, 7], [58, 24, 10], [22, 13, 4.5]]) {
      const ex = S.x - S.look.x * 2.5, ez = S.z - S.look.z * 2.5;
      const x = ex + S.look.x * ahead - S.look.z * side, z = ez + S.look.z * ahead + S.look.x * side;
      if (this._free(x, z, sz * 0.6)) items.outcrop.push({ x, z, s: sz, v: items.outcrop.length % 2, yaw: 0, tilt: 0, ph: r() });
    }
    tryPlace('outcrop', 140, () => 4 + r() ** 1.5 * 8, 9);
    tryPlace('outcrop', 380, () => 5 + r() ** 1.5 * 11, 24, (x, z) => slope(x, z) > 0.12 || r() < 0.25);
    for (const o of items.outcrop) o.yaw = this.flowYaw + (r() - 0.5) * 0.5;
    // Erratics: log-uniform 0.5-3.4 m, a few right by the station.
    tryPlace('boulder', 40, () => 0.5 * Math.exp(r() * 1.6), 30);
    tryPlace('boulder', 280, () => 0.5 * Math.exp(r() * 1.9), 150);
    // Till: cobbles and gravel near the station.
    tryPlace('cobble', 14, () => 0.08 + r() ** 2 * 0.3, 260);
    tryPlace('cobble', 55, () => 0.1 + r() ** 2 * 0.4, 560);
    // Scree aprons below each outcrop's plucked (down-glacier) face.
    for (const o of items.outcrop) {
      const dx = Math.cos(o.yaw), dz = -Math.sin(o.yaw);
      for (let k = 0; k < 16; k++) {
        const t = o.s * (0.55 + r() * 0.9), w = (r() - 0.5) * o.s * 0.9;
        const x = o.x + dx * t - dz * w, z = o.z + dz * t + dx * w;
        if (this._free(x, z, 0.3)) items.cobble.push({ x, z, s: 0.15 + r() ** 1.5 * 0.7, v: k & 1, yaw: r() * 6.28, tilt: (r() - 0.5) * 0.6, ph: r() });
      }
    }
    this.items = items;
    // Shared textures (Poly Haven CC0, already credited: ATTRIBUTION rows 23 and 25).
    const [rock, rockN, moss] = await Promise.all([
      loadKTX2(renderer, 'assets/textures/rock_face_diff.ktx2', { repeat: true }),
      loadKTX2(renderer, 'assets/textures/rock_face_nor.ktx2', { repeat: true, srgb: false }),
      loadKTX2(renderer, 'assets/textures/mossy_rock_diff.ktx2', { repeat: true }),
    ]);
    this.mat = rockMaterial({ rock, rockN, moss });
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, color: 0x000000, fog: true });
    shadowMat.color.set(0xffffff);
    for (const [kind, geos] of Object.entries(this.kinds)) {
      geos.forEach((geo, v) => {
        const list = items[kind].filter((it) => it.v === v);
        if (!list.length) return;
        const im = new THREE.InstancedMesh(geo, this.mat, list.length);
        im.name = `geology-${kind}-${v}`;
        im.receiveShadow = true;
        im.userData.noOutline = true;
        im.userData.list = list;
        im.userData.kind = kind;
        this.group.add(im);
        this.sets.push(im);
      });
    }
    const big = [...items.outcrop, ...items.boulder];
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMat, big.length);
    this.shadows.name = 'geology-contact-shadows';
    this.shadows.userData.list = big;
    this.shadows.userData.noOutline = true;
    this.shadows.renderOrder = 1;
    this.shadows.raycast = () => {};
    this.group.add(this.shadows);
    await this._plants(renderer);
    this.reground(true);
    this.group.visible = true;
    return this;
  }

  /** Pioneer plants on the till around the station (illustrative placement; they grow from 1956 on). */
  async _plants(renderer) {
    const site = this.site, S = this.station, r = mulberry32(2004);
    const [dr, fw] = await Promise.all([loadGLB(renderer, 'assets/models/v3/dryas-mat.glb'), loadGLB(renderer, 'assets/models/v3/fireweed.glb')]);
    const inst = (gltf, name, spots) => {
      const out = [];
      gltf.scene.traverse((m) => {
        if (!m.isMesh) return;
        const im = new THREE.InstancedMesh(bakedNodeGeometry(m), m.material, spots.length);
        im.name = name;
        im.receiveShadow = true;
        im.userData.noOutline = true;
        im.userData.list = spots;
        im.userData.plant = true;
        out.push(im);
      });
      return out;
    };
    // Moss in the lee of boulders (north side, out of the drying sun), Dryas and fireweed on open till.
    const moss = [], dryas = [], fire = [];
    for (const b of this.items.boulder) if (r() < 0.8) {
      const a = Math.PI * 0.5 + (r() - 0.5) * 1.6; // toward -z (north) in scene coordinates
      const d = b.s * (0.55 + r() * 0.3);
      moss.push({ x: b.x + Math.cos(a) * d, z: b.z - Math.abs(Math.sin(a)) * d, s: b.s * (0.5 + r() * 0.5), yaw: r() * 6.28, ph: r() });
    }
    for (let i = 0, t = 0; i < 260 && t < 4000; t++) {
      const a = r() * 6.28, d = 6 + Math.sqrt(r()) * 120;
      const x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
      if (!this._free(x, z, 0.5)) continue;
      // Clumped: plants follow wetter hollows (a low-frequency field).
      if (noise3(x / 28, 0.5, z / 28) < 0.45) continue;
      (r() < 0.62 ? dryas : fire).push({ x, z, s: 0.7 + r() * 0.8, yaw: r() * 6.28, ph: r() });
      i++;
    }
    this.mossMat = new THREE.MeshStandardMaterial({ map: this._mossTexture(), roughness: 1, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.moss = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mossMat, moss.length);
    this.moss.name = 'geology-moss-cushions';
    this.moss.receiveShadow = true;
    this.moss.userData.list = moss;
    this.moss.userData.flat = true;
    this.moss.userData.noOutline = true;
    this.dryas = inst(dr, 'geology-dryas-mats', dryas);
    this.fireweed = inst(fw, 'geology-fireweed', fire);
    this.plantRoots = { moss: [this.moss], dryas: this.dryas, fireweed: this.fireweed };
    for (const m of [this.moss, ...this.dryas, ...this.fireweed]) this.group.add(m);
    void site;
  }

  _mossTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const r = mulberry32(57);
    for (let i = 0; i < 46; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 44;
      const g = 72 + r() * 60;
      x.fillStyle = `rgb(${42 + r() * 26},${g},${30 + r() * 18})`;
      x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 6 + r() * 14, 0, 6.28); x.fill();
    }
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${90 + r() * 60},${130 + r() * 60},${60 + r() * 30},0.9)`; x.fillRect(r() * 128, r() * 128, 1.5, 1.5); }
    x.globalCompositeOperation = 'destination-in';
    const grd = x.createRadialGradient(64, 64, 20, 64, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Ground normal from the elevation model (for tilting flat things to the slope). */
  _normal(x, z, out) {
    const s = this.site, d = 6;
    const hx = s.heightAt(x + d, z) - s.heightAt(x - d, z), hz = s.heightAt(x, z + d) - s.heightAt(x, z - d);
    return out.set(-hx / (2 * d), 1, -hz / (2 * d)).normalize();
  }

  /** Recompute instance matrices (all at once, or in slices per frame while streaming tiles settle). */
  reground(all = false) {
    const site = this.site;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), n = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const sun = site.sunDir || new THREE.Vector3(-0.6, 0.5, 0.6);
    const lists = [...this.sets, this.shadows, this.moss, ...(this.dryas || []), ...(this.fireweed || [])].filter(Boolean);
    const budget = all ? Infinity : 220;
    let used = 0;
    for (const im of lists) {
      const L = im.userData.list;
      im.userData.done ??= 0;
      if (all) im.userData.done = 0;
      for (let i = im.userData.done; i < L.length && used < budget; i++, used++) {
        const it = L[i];
        const y = site.surfaceY(it.x, it.z);
        if (im === this.shadows) {
          const kind = this.items.outcrop.includes(it) ? 'outcrop' : 'boulder';
          const w = it.s * (kind === 'outcrop' ? 1.5 : 1.35);
          v.set(it.x - sun.x * it.s * 0.25, y + 0.03, it.z - sun.z * it.s * 0.25);
          q.setFromUnitVectors(up, this._normal(it.x, it.z, n));
          sc.set(w * (kind === 'outcrop' ? 1.5 : 1), 1, w);
          q2.setFromAxisAngle(up, kind === 'outcrop' ? it.yaw : 0);
          q.multiply(q2);
        } else if (im.userData.flat) {
          v.set(it.x, y + 0.025, it.z);
          q.setFromUnitVectors(up, this._normal(it.x, it.z, n));
          q2.setFromAxisAngle(up, it.yaw); q.multiply(q2);
          sc.set(it.s, 1, it.s);
        } else if (im.userData.plant) {
          v.set(it.x, y - 0.03, it.z);
          q.setFromAxisAngle(up, it.yaw);
          sc.setScalar(it.s);
        } else {
          const kind = im.userData.kind;
          const half = it.s / 2;
          const sink = kind === 'outcrop' ? 0.25 : kind === 'boulder' ? 0.3 : 0.35;
          const bb = im.geometry.boundingBox;
          e.set(it.tilt, it.yaw, it.tilt * 0.5, 'YXZ');
          q.setFromEuler(e);
          if (kind === 'outcrop') { q.setFromUnitVectors(up, this._normal(it.x, it.z, n).lerp(up, 0.5).normalize()); q2.setFromAxisAngle(up, it.yaw); q.multiply(q2); }
          // Set into the ground by `sink` of its height (half buried erratics, outcrops rising out of the till).
          v.set(it.x, y - (bb.min.y + sink * (bb.max.y - bb.min.y)) * half, it.z);
          sc.setScalar(half);
        }
        im.setMatrixAt(i, m4.compose(v, q, sc));
        im.userData.done = i + 1;
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingBox?.(); im.computeBoundingSphere();
    }
    if (lists.every((im) => im.userData.done >= im.userData.list.length)) this.dirty = false;
  }

  /** Tiles changed under the station: re-seat everything (in slices, near the station only). */
  markDirty() { this.dirty = true; for (const im of [...this.sets, this.shadows, this.moss, ...(this.dryas || []), ...(this.fireweed || [])]) if (im) im.userData.done = 0; }

  /** Pioneer plants by year (illustrative timing; none in 1941 or 1950). */
  setYear(year) {
    this.year = year;
    if (!this.moss) return;
    const k = (y0, y1) => smooth(y0, y1, year);
    const show = (list, frac) => { for (const im of list) { im.count = Math.round(im.userData.list.length * frac); im.visible = im.count > 0; } };
    show([this.moss], k(1955, 1990));
    show(this.dryas, k(1961, 2000));
    show(this.fireweed, k(1965, 1995));
    if (this.mat) this.mat.userData.U.uMoss.value = 0.85 * k(1960, 2004);
  }

  update(camera) {
    if (!this.items) return;
    const S = this.station;
    const d = Math.hypot(camera.position.x - S.x, camera.position.z - S.z);
    // Sub-pixel from further away: not drawn.
    this.group.visible = d < 2500 && camera.position.y - S.y < 1800;
    if (this.dirty && this.group.visible) this.reground(false);
  }
}
