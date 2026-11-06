/**
 * forest.js — clustered conifer forest with impostors (v3 carry-over "forest
 * clustering"; S2 spike "Impostor forest": LOD0 < 60 m, LOD1 < 250 m, impostor
 * beyond) and the succession plants near the photo station.
 *
 * Placement is the S4 file public/data/forest-instances.bin: 30,177 Sitka
 * spruce, western hemlock and Sitka alder in 260 stands, only where the 2024
 * Sentinel-2 image shows vegetation (illustrative: species mix, density and
 * stand shapes are not mapped). Each record carries `s`, the distance along the
 * valley path, so ground uncovered earlier (down-inlet) gets its forest first
 * when the year slider moves (the v2 rule; illustrative timing).
 *
 * Every frame the CPU sorts the trees in view into LOD0 / LOD1 / impostor
 * instanced meshes, but only after the camera moved or the year changed.
 * @module glacier/forest
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { forestForYear, pastAmount } from '../systems/time-front.js';
import { BASE, loadGLB, mulberry32, floatGeometry } from './loaders.js';

const FRAMES = 8;
const KINDS = ['sitka-spruce', 'western-hemlock', 'sitka-alder'];

/** One geometry with the material base colours baked into the vertex colours (one draw call per LOD). */
export function bakeGeometry(scene) {
  const parts = [];
  scene.updateMatrixWorld(true);
  scene.traverse((m) => {
    if (!m.isMesh) return;
    const g = floatGeometry(m.geometry).applyMatrix4(m.matrixWorld);
    const base = m.material?.color || new THREE.Color(1, 1, 1);
    const n = g.attributes.position.count;
    const src = g.attributes.color;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = src ? src.getX(i) : 1, gg = src ? src.getY(i) : 1, b = src ? src.getZ(i) : 1;
      col.set([r * base.r, gg * base.g, b * base.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    parts.push(g);
  });
  const out = mergeGeometries(parts, false);
  out.computeBoundingBox();
  return out;
}

function bakeImpostor(renderer, geometry) {
  const W = 128, H = 256;
  const box = geometry.boundingBox;
  const R = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) * 1.05, top = box.max.y * 1.02;
  const albedo = new THREE.WebGLRenderTarget(W * FRAMES, H);
  const normal = new THREE.WebGLRenderTarget(W * FRAMES, H);
  albedo.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry);
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-R, R, top, 0, 0.1, 200);
  const albedoMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const normalMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vN; void main(){ vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 vN; void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n*0.5+0.5, 1.); }',
    side: THREE.DoubleSide,
  });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  for (const [rt, mat] of [[albedo, albedoMat], [normal, normalMat]]) {
    mesh.material = mat;
    renderer.setRenderTarget(rt);
    renderer.clear();
    for (let i = 0; i < FRAMES; i++) {
      const a = (i / FRAMES) * Math.PI * 2;
      cam.position.set(Math.sin(a) * 60, 0, Math.cos(a) * 60);
      cam.lookAt(0, 0, 0);
      rt.viewport.set(i * W, 0, W, H); rt.scissor.set(i * W, 0, W, H); rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
    }
    rt.scissorTest = false;
  }
  renderer.setRenderTarget(prevTarget);
  renderer.toneMapping = prevTone;
  renderer.setClearColor(prevClear, prevAlpha);
  return { albedo: albedo.texture, normal: normal.texture, size: new THREE.Vector2(R * 2, top) };
}

function impostorMaterial(atlas, sunDir, tint) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { albedoMap: { value: null }, normalMap: { value: null }, sunDir: { value: new THREE.Vector3() }, size: { value: new THREE.Vector2() }, tint: { value: new THREE.Color() } }]),
    fog: true,
    vertexShader: `
      uniform vec2 size; varying vec2 vUv; varying float vYaw;
      #include <fog_pars_vertex>
      void main() {
        vec3 pos = instanceMatrix[3].xyz;
        float s = length(instanceMatrix[0].xyz);
        float yaw = atan(-instanceMatrix[0].z, instanceMatrix[0].x);
        vec2 d = normalize(cameraPosition.xz - pos.xz);
        vec3 right = vec3(d.y, 0.0, -d.x);
        vec3 world = pos + right * position.x * size.x * s + vec3(0.0, 1.0, 0.0) * (position.y + 0.5) * size.y * s;
        vec2 dl = vec2(d.x * cos(yaw) - d.y * sin(yaw), d.x * sin(yaw) + d.y * cos(yaw));
        float a = atan(dl.x, dl.y);
        float frame = mod(floor(a / (6.2831853 / ${FRAMES}.0) + 0.5), ${FRAMES}.0);
        vUv = vec2((frame + uv.x) / ${FRAMES}.0, uv.y);
        vYaw = yaw;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D albedoMap, normalMap; uniform vec3 sunDir; uniform vec3 tint; varying vec2 vUv; varying float vYaw;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec4 c = texture2D(albedoMap, vUv);
        if (c.a < 0.5) discard;
        vec3 n = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
        vec3 nw = vec3(n.x * cos(vYaw) + n.z * sin(vYaw), n.y, -n.x * sin(vYaw) + n.z * cos(vYaw));
        vec3 lit = c.rgb * tint * (0.55 + 1.9 * max(dot(normalize(nw), sunDir), 0.0));
        gl_FragColor = vec4(lit, 1.0);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class MuirForest {
  constructor(site) {
    this.site = site;
    this.group = new THREE.Group();
    this.group.name = 'forest';
    this.year = 2004;
    this._last = { p: new THREE.Vector3(1e9, 0, 0), d: new THREE.Vector3(), year: -1 };
    this.meshes = [];
    this.stats = { lod0: 0, lod1: 0, impostor: 0 };
  }

  async build(renderer, { impostorFar = 250 } = {}) {
    const meta = await (await fetch(`${BASE}data/forest-instances.json`)).json();
    const bin = await (await fetch(`${BASE}data/forest-instances.bin`)).arrayBuffer();
    const dv = new DataView(bin);
    const n = meta.count;
    this.sMax = meta.sMaxM;
    // Per-kind arrays: x, y, z, s, yaw, scale
    this.kinds = KINDS.map(() => ({ rec: [], }));
    for (let i = 0; i < n; i++) {
      const o = i * meta.recordBytes;
      const ks = dv.getUint8(o + 15);
      const kind = ks >> 6;
      this.kinds[kind].rec.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true), dv.getUint16(o + 12, true), (dv.getUint8(o + 14) / 256) * Math.PI * 2, 0.65 + ((ks & 63) / 63) * 0.6]);
    }
    const sunDir = this.site.sunDir;
    this.d1 = impostorFar;
    for (const [k, name] of KINDS.entries()) {
      const [g0, g1] = await Promise.all([loadGLB(renderer, `assets/models/v3/${name}-lod0.glb`), loadGLB(renderer, `assets/models/v3/${name}-lod1.glb`)]);
      const geo0 = bakeGeometry(g0.scene), geo1 = bakeGeometry(g1.scene);
      const atlas = bakeImpostor(renderer, geo0);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide, envMapIntensity: 0.7 });
      const imat = impostorMaterial(atlas, sunDir);
      imat.uniforms.albedoMap.value = atlas.albedo;
      imat.uniforms.normalMap.value = atlas.normal;
      imat.uniforms.sunDir.value = sunDir;
      imat.uniforms.size.value = atlas.size;
      imat.uniforms.tint.value = new THREE.Color(1, 1, 1);
      const N = this.kinds[k].rec.length;
      const mk = (geo, m, nm) => { const im = new THREE.InstancedMesh(geo, m, N); im.name = nm; im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.userData.noOutline = true; this.group.add(im); this.meshes.push(im); return im; };
      const K = this.kinds[k];
      K.geo0 = geo0; K.mat = mat;
      K.lod0 = mk(geo0, mat, `${name}-lod0`);
      K.lod1 = mk(geo1, mat, `${name}-lod1`);
      K.imp = mk(new THREE.PlaneGeometry(1, 1), imat, `${name}-impostor`);
      K.lod0.castShadow = K.lod1.castShadow = true;
      K.lod0.receiveShadow = K.lod1.receiveShadow = true;
      K.imat = imat;
      // Matrices once.
      K.m = new Float32Array(N * 16);
      K.pos = new Float32Array(N * 2);
      K.s = new Float32Array(N);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      K.rec.forEach((r, i) => {
        p.set(r[0], r[1] - 0.4, r[2]);
        q.setFromAxisAngle(up, r[4]);
        sc.setScalar(r[5]);
        m4.compose(p, q, sc).toArray(K.m, i * 16);
        K.pos[i * 2] = r[0]; K.pos[i * 2 + 1] = r[2];
        K.s[i] = r[3];
      });
    }
    this.mat = this.kinds[0].mat;
    return this;
  }

  /** A single full-size tree (LOD0, scale 1) for the catalog card and its scale check. */
  showcaseTree(kind = 0) {
    const K = this.kinds[kind];
    // The instance nearest the lower inlet's east shore in a closed stand.
    let best = 0, bd = Infinity;
    const site = this.site;
    const target = site.frame(site.L * 0.17);
    for (let i = 0; i < K.rec.length; i++) { const d = Math.hypot(K.pos[i * 2] - target.x, K.pos[i * 2 + 1] - target.z); if (d < bd) { bd = d; best = i; } }
    const r = K.rec[best];
    const tree = new THREE.Mesh(K.geo0, K.mat);
    tree.name = 'forest-showcase-tree';
    tree.position.set(r[0], site.surfaceY(r[0], r[2]) - 0.4, r[2]);
    tree.castShadow = tree.receiveShadow = true;
    tree.userData.scaleFrame = 'local';
    K.skip = best; // drawn as this mesh, not as an instance
    this.showcase = tree;
    return tree;
  }

  /** Which trees exist in `year`: older ground (lower s) first (illustrative succession). */
  setYear(year) {
    this.year = year;
    this.cover = forestForYear(year, this.anchors);
    this.alderCover = Math.min(1, 0.1 + 0.9 * (1 - pastAmount(year, this.anchors)) * 1.2);
    this._last.year = -1;
    const tint = new THREE.Color(this.site.grade?.tint ?? 0xffffff);
    for (const K of this.kinds || []) { K.imat.uniforms.tint.value.copy(tint); K.mat.color.copy(tint); }
  }

  /** Re-bucket the trees by distance and view cone (only when the camera moved or the year changed). */
  update(camera) {
    if (!this.kinds) return;
    const cp = camera.position;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    if (this._last.year === this.year && cp.distanceToSquared(this._last.p) < 4 && dir.dot(this._last.d) > 0.99995) return;
    this._last.p.copy(cp); this._last.d.copy(dir); this._last.year = this.year;
    const fl = Math.hypot(dir.x, dir.z) || 1, fx = dir.x / fl, fz = dir.z / fl;
    const halfFov = THREE.MathUtils.degToRad(camera.fov * Math.max(1, camera.aspect) * 0.5 + 14);
    const cosLimit = Math.cos(Math.min(Math.PI * 0.95, halfFov));
    const steep = Math.abs(dir.y) > 0.6; // looking down: no cone culling
    const d0s = 60 * 60, d1s = this.d1 * this.d1;
    const sLimit = this.cover * this.sMax;
    const tot = { lod0: 0, lod1: 0, impostor: 0 };
    this.kinds.forEach((K, k) => {
      const limit = k === 2 ? this.alderCover * this.sMax + 0.25 * this.sMax : sLimit;
      const a0 = K.lod0.instanceMatrix.array, a1 = K.lod1.instanceMatrix.array, a2 = K.imp.instanceMatrix.array;
      let n0 = 0, n1 = 0, n2 = 0;
      const N = K.s.length;
      for (let i = 0; i < N; i++) {
        if (K.s[i] > limit || i === K.skip) continue;
        const dx = K.pos[i * 2] - cp.x, dz = K.pos[i * 2 + 1] - cp.z;
        const d2 = dx * dx + dz * dz;
        if (!steep && d2 > 900 && (dx * fx + dz * fz) < cosLimit * Math.sqrt(d2)) continue;
        const src = K.m.subarray(i * 16, i * 16 + 16);
        if (d2 < d0s) a0.set(src, 16 * n0++);
        else if (d2 < d1s) a1.set(src, 16 * n1++);
        else a2.set(src, 16 * n2++);
      }
      for (const [m, c] of [[K.lod0, n0], [K.lod1, n1], [K.imp, n2]]) {
        m.count = c;
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, Math.max(1, c) * 16);
        m.instanceMatrix.needsUpdate = true;
      }
      tot.lod0 += n0; tot.lod1 += n1; tot.impostor += n2;
    });
    this.stats = tot;
  }
}

/** The succession transect beside the photo station: moss, Dryas, fireweed, alder (illustrative). */
export async function buildTransect(renderer, site, at, forest) {
  const g = new THREE.Group();
  g.name = 'succession-transect';
  const [fw, dr, al] = await Promise.all([
    loadGLB(renderer, 'assets/models/v3/fireweed.glb'), loadGLB(renderer, 'assets/models/v3/dryas-mat.glb'), loadGLB(renderer, 'assets/models/v3/sitka-alder-lod0.glb'),
  ]);
  const r = mulberry32(88);
  const dir = { x: Math.cos(at.yaw), z: Math.sin(at.yaw) };
  const side = { x: -dir.z, z: dir.x };
  const place = (src, d, o, name) => {
    const m = src.scene.clone(true);
    m.name = name;
    const x = at.x + dir.x * d + side.x * o, z = at.z + dir.z * d + side.z * o;
    m.position.set(x, site.surfaceY(x, z) - 0.03, z);
    m.rotation.y = r() * 6.28;
    m.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    m.userData.scaleFrame = 'local';
    m.userData.ground = [x, z];
    g.add(m);
    return m;
  };
  // Order along the transect (metres from the station): moss 4-8, Dryas 8-12, fireweed 11-15, alder 16-22.
  const out = { moss: null, dryas: [], fireweed: [], alder: [] };
  for (const [d, o] of [[8.5, -1.2], [9.6, 1.0], [10.8, -0.2], [11.5, 1.6]]) out.dryas.push(place(dr, d, o, 'dryas-mat'));
  for (const [d, o] of [[12.2, 0.6], [12.8, -1.4], [13.6, 0.1], [14.1, 1.7], [14.8, -0.7], [13.1, 2.4]]) out.fireweed.push(place(fw, d, o, 'fireweed'));
  for (const [d, o] of [[18, -0.8], [20.5, 2.2]]) out.alder.push(place(al, d, o, 'alder-thicket'));
  // Moss: a draped patch of short green cover on the till (no model; a ground texture).
  out.moss = mossPatch(site, at.x + dir.x * 5.5, at.z + dir.z * 5.5, at.yaw);
  g.add(out.moss);
  out.group = g;
  out.reground = () => {
    for (const m of [...out.dryas, ...out.fireweed, ...out.alder]) { const [x, z] = m.userData.ground; m.position.y = site.surfaceY(x, z) - 0.03; }
    out.moss.userData.reground?.();
  };
  void forest;
  return out;
}

/** Moss on glacial till: a 5 x 3 m draped patch with a procedural moss texture. */
export function mossPatch(site, cx, cz, yaw) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const r = mulberry32(101);
  x.fillStyle = '#6b6457'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const g = 70 + r() * 70;
    x.fillStyle = `rgba(${40 + r() * 30},${g},${30 + r() * 20},${0.5 + r() * 0.5})`;
    x.beginPath(); x.arc(r() * 256, r() * 256, 2 + r() * 7, 0, 6.28); x.fill();
  }
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(150,140,125,${0.6 + r() * 0.4})`; x.beginPath(); x.arc(r() * 256, r() * 256, 1 + r() * 4, 0, 6.28); x.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const nx = 10, nz = 6, W = 5, D = 3;
  const geo = new THREE.PlaneGeometry(W, D, nx, nz).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.name = 'moss-patch';
  m.position.set(cx, 0, cz);
  m.rotation.y = -yaw;
  m.receiveShadow = true;
  m.userData.noOutline = true;
  const drape = () => {
    m.updateMatrixWorld(true);
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), 0, p.getZ(i)).applyMatrix4(m.matrixWorld);
      p.setY(i, site.surfaceY(v.x, v.z) + 0.04);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingBox(); geo.computeBoundingSphere();
  };
  m.userData.reground = drape;
  drape();
  return m;
}
