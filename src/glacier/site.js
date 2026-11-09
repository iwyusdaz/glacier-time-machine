/**
 * site.js — the Muir Inlet ground truth for v3: the real Copernicus GLO-30
 * surface at true scale (1 unit = 1 m, no vertical exaggeration) with the real
 * Sentinel-2 2024 image, the sea, the sky and the sun.
 *
 * Download tiers (plan 10 §7): the first load is the 60 m heightfield
 * (0.57 MB) with the 20 m drape (0.87 MB). After the learner's first
 * interaction the 30 m heightfield (tools, prop placement) and the 3D Tiles
 * quadtree (S4: 341 tiles, ~30 m leaves with the 10 m image inside each tile,
 * public/tiles/muir/) stream in; only the tiles in view load. When the tiles
 * for the view have loaded, the first-load mesh is hidden.
 *
 * Every terrain material shares one shader patch: moving cloud shadows and the
 * past-year muting of the 2024 vegetation (illustrative, v2 reviews V3/H3).
 * @module glacier/site
 */
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { decodeTerrain, heightAt, utmToScene } from '../systems/terrain-data.js';
import { pathLength, pointAtDistance } from '../systems/flowline.js';
import { meshLayout, strideForPreset, surfaceColour } from '../scenes/muir-inlet.js';
import { gradeAt } from '../scenes/muir-grade.js';
import { BASE, loadKTX2 } from './loaders.js';

/** The sea-level plane spans this multiple of the DEM footprint (v2 review V5). */
export const WATER_SCALE = 4;
export const WATER_Y = 1.2;
export const DRAPE_FILE = 'data/muir-s2-20240806.jpg';
const SUN_DIR = new THREE.Vector3(-30000, 22000, 26000).normalize(); // low afternoon sun from the south-west

/** Shared terrain shader patch (cloud shadows + past-year vegetation muting). */
export function terrainUniforms() {
  return {
    uCloudOffset: { value: new THREE.Vector2() }, uVegMute: { value: 0 }, uCloudShade: { value: 0.26 },
    // Near-ground detail (G2): till and rock textures with detail normals within uDetailFar of the camera.
    uDetailOn: { value: 0 }, uDetailFar: { value: 420 },
    uTillMap: { value: null }, uTillNor: { value: null }, uRockMap: { value: null }, uRockNor: { value: null },
  };
}
export function patchTerrainMaterial(material, U) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;')
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDetW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCloudXZ = vDetW.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;\nvarying vec3 vDetW;\nuniform vec2 uCloudOffset;\nuniform float uVegMute;\nuniform float uCloudShade;\nuniform float uDetailOn;\nuniform float uDetailFar;\nuniform sampler2D uTillMap;\nuniform sampler2D uTillNor;\nuniform sampler2D uRockMap;\nuniform sampler2D uRockNor;\nfloat detFade;\nfloat detRock;\nvec2 detTq;\nvec2 detRq;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        // Past years: the 2024 image's green pixels are muted toward moraine brown (illustrative).
        'float vg = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);',
        'float vegK = uVegMute * smoothstep(0.004, 0.03, vg);',
        'float vl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
        // Fresh till in Glacier Bay is grey (the 1941/1950 photos), not brown (G2).
        'vec3 moraine = vec3(0.17, 0.158, 0.14) * clamp(vl / 0.12, 0.6, 1.6);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, moraine, 0.9 * vegK);',
        // Near ground (G2): the 10 m image is a blur at a person's feet. Glacial till (3 m gravel texture,
        // sampled at two scales so it does not repeat) and, on steep or convex ground, scraped rock (2.4 m),
        // both modulating the image's own colour, so far and near ground stay the same hue. Fades out by uDetailFar.
        'detFade = uDetailOn * (1.0 - smoothstep(uDetailFar * 0.3, uDetailFar, distance(vDetW, cameraPosition)));',
        'detRock = 0.0;',
        'if (detFade > 0.001) {',
        '  vec3 gN = normalize(cross(dFdx(vDetW), dFdy(vDetW)));',
        '  float slope = 1.0 - abs(gN.y);',
        '  float rn = sin(vDetW.x * 0.045 + sin(vDetW.z * 0.031) * 2.0) * sin(vDetW.z * 0.052 - vDetW.x * 0.017);',
        '  detRock = smoothstep(0.26, 0.52, slope + 0.32 * rn);',
        '  detTq = vDetW.xz / 3.0;',
        '  detRq = (slope > 0.45 ? (abs(gN.x) > abs(gN.z) ? vDetW.zy : vDetW.xy) : vDetW.xz) / 2.4;',
        '  vec3 till = mix(texture2D(uTillMap, detTq).rgb, texture2D(uTillMap, vDetW.zx / 11.3 + 0.37).rgb, 0.4);',
        '  vec3 det = mix(till, texture2D(uRockMap, detRq).rgb, detRock);',
        '  float green = smoothstep(0.004, 0.03, vg) * (1.0 - uVegMute);',
        '  vec3 textured = diffuseColor.rgb * clamp(det / 0.3, 0.25, 2.4);',
        '  vec3 own = mix(vec3(dot(det, vec3(0.2126, 0.7152, 0.0722))), det, 0.45) * diffuse * 1.15;',
        // Patches of coarser, darker and paler till (wetter hollows, lichen) break up the ground at 10-40 m.
        '  float pn = sin(vDetW.x * 0.21 + sin(vDetW.z * 0.17) * 1.7) * sin(vDetW.z * 0.19 + sin(vDetW.x * 0.13) * 1.9);',
        '  own *= 0.88 + 0.16 * pn;',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, mix(textured, own, 0.5 * (1.0 - green)), detFade * (1.0 - 0.45 * green));',
        '}',
        // Cloud shadows: the same soft field the cloud billboards drift with.
        'vec2 cq = (vCloudXZ - uCloudOffset) / 5200.0;',
        'float cn = sin(cq.x * 1.7 + sin(cq.y * 1.3)) * cos(cq.y * 1.1 - cq.x * 0.4);',
        'diffuseColor.rgb *= 1.0 - uCloudShade * smoothstep(0.35, 0.85, cn);',
      ].join('\n'))
      .replace('#include <normal_fragment_maps>', [
        '#include <normal_fragment_maps>',
        'if (detFade > 0.001) {',
        '  vec3 n1 = texture2D(uTillNor, detTq).xyz * 2.0 - 1.0;',
        '  vec3 n2 = texture2D(uRockNor, detRq).xyz * 2.0 - 1.0;',
        '  vec3 tn = mix(n1, n2, detRock);',
        '  normal = normalize(normal + (viewMatrix * vec4(tn.x, 0.0, tn.y, 0.0)).xyz * 0.9 * detFade);',
        '}',
      ].join('\n'));
  };
  material.customProgramCacheKey = () => `muir-terrain-${material.map ? 'map' : 'vc'}`;
  material.userData.surfaceDetail = true;
  return material;
}

export class MuirSite {
  /** @param {object} app  v3 app (engine, motion) */
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.scene = app.engine.scene;
    this.camera = app.engine.camera;
    this.renderer = app.engine.renderer;
    this.U = terrainUniforms();
    this.terrainMaterials = new Set();
    this.root = new THREE.Group();
    this.root.name = 'terrain-root';
    this.scene.add(this.root);
    this.leaves = new Set();
    this._ray = new THREE.Raycaster();
    this._ray.firstHitOnly = true;
    this._down = new THREE.Vector3(0, -1, 0);
    this._o = new THREE.Vector3();
    this._yCache = new Map();
    this.streaming = false;
    this.tilesReady = false;
    this.onTilesSettled = null;
  }

  async load(content) {
    this.meta = await (await fetch(`${BASE}data/terrain-meta.json`)).json();
    this.grid = await this._grid(1);
    this.points = content.flowline.points;
    this.L = pathLength(this.points);
    const lm = (p) => this.meta.landmarks.find((l) => l.name.startsWith(p));
    const toScene = (l) => utmToScene(this.grid, l.utmE, l.utmN);
    this.landmarks = { inlet: toScene(lm('Muir Inlet')), muir: toScene(lm('Muir Glacier')), riggs: toScene(lm('Riggs Glacier')) };
    this._lights();
    await this._drape();
    this._buildBase();
    this._buildSkirt();
    await this._buildWater();
    await this._sky();
    this.engine.quality.onChange?.((def) => this._applyShadows(def));
    this.applyGrade(0);
    return this;
  }

  async _grid(lodIndex) {
    const lod = this.meta.lods[lodIndex];
    const bytes = new Uint8Array(await (await fetch(`${BASE}data/${lod.file}`)).arrayBuffer());
    return decodeTerrain(bytes, this.meta, lodIndex);
  }

  // ---------------------------------------------------------------- sampling
  /** DEM elevation (m) at scene x/z (30 m grid once streamed, else 60 m); NaN outside. */
  heightAt(x, z) { return heightAt(this.fine || this.grid, x, z); }
  /** Ground or sea surface (never below sea level). */
  ground(x, z) { const h = this.heightAt(x, z); return Number.isFinite(h) ? Math.max(h, 0) : 0; }
  /** The rendered surface under (x, z): the finest loaded tile, else the DEM. Cached until the next tile load. */
  surfaceY(x, z) {
    const key = `${Math.round(x)},${Math.round(z)}`;
    const c = this._yCache.get(key);
    if (c !== undefined) return c;
    let y = NaN;
    if (this.leaves.size && this.tilesReady) {
      this._o.set(x, 4000, z);
      this._ray.set(this._o, this._down);
      this._ray.far = 8000;
      for (const m of this.leaves) {
        if (!m.visible) continue;
        const hit = this._ray.intersectObject(m, false)[0];
        if (hit && !(hit.point.y < y)) y = hit.point.y;
      }
    }
    if (!Number.isFinite(y)) y = this.heightAt(x, z);
    if (!Number.isFinite(y)) y = 0;
    if (this._yCache.size > 20000) this._yCache.clear();
    this._yCache.set(key, y);
    return y;
  }
  slopeAt(x, z, d = 45) {
    const hx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
    const hz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
    return Math.hypot(hx, hz) / (2 * d);
  }
  /** Point + unit tangent + unit normal (ground plane) at along-path s; extends past the upper end. */
  frame(s) {
    const cl = Math.min(this.L, Math.max(0, s));
    const p = pointAtDistance(this.points, cl);
    const q = pointAtDistance(this.points, Math.min(this.L, cl + 200));
    const o = pointAtDistance(this.points, Math.max(0, cl - 200));
    let tx = q.x - o.x, tz = q.z - o.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    const extra = s - cl;
    return { x: p.x + tx * extra, z: p.z + tz * extra, tx, tz, nx: -tz, nz: tx, s };
  }
  get halfX() { return ((this.grid.width - 1) * this.grid.mPerPx) / 2; }
  get halfZ() { return ((this.grid.height - 1) * this.grid.mPerPx) / 2; }

  // ---------------------------------------------------------------- build
  _lights() {
    this.sun = new THREE.DirectionalLight(0xfff1df, 2.4);
    this.sun.position.copy(SUN_DIR).multiplyScalar(60000);
    this.sun.target.position.set(0, 0, 0);
    this.sunDir = SUN_DIR.clone();
    this.scene.add(this.sun, this.sun.target);
    const s = this.sun.shadow;
    s.camera.left = -26000; s.camera.right = 26000; s.camera.top = 26000; s.camera.bottom = -26000;
    s.camera.near = 1000; s.camera.far = 120000;
    s.bias = -0.0004; s.normalBias = 40;
    this._applyShadows(this.engine.quality.presetDef);
    this.scene.fog = new THREE.FogExp2(0xb8cfe0, 0.000011);
  }

  /** Static terrain + fixed sun: the shadow map renders once per change (tiles, year), not per frame. */
  _applyShadows(def) {
    const size = def?.shadowMapSize || 0;
    const sm = this.renderer.shadowMap;
    sm.autoUpdate = false;
    sm.needsUpdate = true;
    this.sun.castShadow = size > 0;
    if (size > 0) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
  }
  shadowsDirty() { this.renderer.shadowMap.needsUpdate = true; }

  async _drape() {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(`${BASE}${DRAPE_FILE}`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy?.() || 1);
      this.drape = tex;
    } catch (err) {
      console.warn('Sentinel-2 drape failed to load; using procedural colours.', err);
      this.drape = null;
    }
  }

  _buildBase() {
    const g = this.grid;
    const stride = strideForPreset(this.engine.quality.name);
    const L = meshLayout(g.width, g.height, g.mPerPx, stride);
    const geo = new THREE.PlaneGeometry(L.sizeX, L.sizeZ, L.nx - 1, L.nz - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(L.offsetX, 0, L.offsetZ);
    const pos = geo.attributes.position;
    for (let j = 0; j < L.nz; j++) for (let i = 0; i < L.nx; i++) pos.setY(j * L.nx + i, g.data[(j * stride) * g.width + i * stride]);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { surfaceColour(pos.getY(i), 1 - nrm.getY(i), c); colors.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const fx = g.bounds.east - g.bounds.west, fz = g.bounds.north - g.bounds.south;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + fx / 2) / fx, 1 - (pos.getZ(i) + fz / 2) / fz);
    const mat = patchTerrainMaterial(new THREE.MeshStandardMaterial({ map: this.drape, vertexColors: !this.drape, roughness: 0.95, metalness: 0, envMapIntensity: 0.85 }), this.U);
    this.terrainMaterials.add(mat);
    this.base = new THREE.Mesh(geo, mat);
    this.base.name = 'terrain-copernicus-glo30';
    this.base.castShadow = this.base.receiveShadow = true;
    this.base.userData.noOutline = true;
    this.root.add(this.base);
  }

  /** Perimeter skirt down to below sea level (v2 review V4): the DEM never reads as a paper-thin slab. */
  _buildSkirt() {
    const g = this.grid;
    const stride = strideForPreset(this.engine.quality.name);
    const L = meshLayout(g.width, g.height, g.mPerPx, stride);
    const vx = (i) => L.offsetX - L.sizeX / 2 + i * stride * g.mPerPx;
    const vz = (j) => L.offsetZ - L.sizeZ / 2 + j * stride * g.mPerPx;
    const hAt = (i, j) => g.data[(j * stride) * g.width + i * stride];
    const ring = [];
    for (let i = 0; i < L.nx; i++) ring.push([i, 0]);
    for (let j = 1; j < L.nz; j++) ring.push([L.nx - 1, j]);
    for (let i = L.nx - 2; i >= 0; i--) ring.push([i, L.nz - 1]);
    for (let j = L.nz - 2; j >= 1; j--) ring.push([0, j]);
    const n = ring.length;
    const pos = new Float32Array(n * 6), col = new Float32Array(n * 6), idx = [];
    const cTop = new THREE.Color(), cBot = new THREE.Color(0x0e1a20);
    for (let k = 0; k < n; k++) {
      const [i, j] = ring[k];
      const h = hAt(i, j);
      pos.set([vx(i), h, vz(j), vx(i), -400, vz(j)], k * 6);
      surfaceColour(Math.max(h, 0), 0.5, cTop).lerp(cBot, 0.35);
      col.set([cTop.r, cTop.g, cTop.b, cBot.r, cBot.g, cBot.b], k * 6);
      const a = k * 2, b = ((k + 1) % n) * 2;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.skirt = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.4 }));
    this.skirt.name = 'terrain-skirt';
    this.skirt.userData.noOutline = true;
    this.skirt.userData.surfaceDetail = true;
    this.root.add(this.skirt);
  }

  /** The sea: two scrolling layers of the S4 water normal map (swell and chop, illustrative). */
  async _buildWater() {
    const g = this.grid;
    const W = (g.width - 1) * g.mPerPx * WATER_SCALE, H = (g.height - 1) * g.mPerPx * WATER_SCALE;
    const geo = new THREE.PlaneGeometry(W, H);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x2f5a62, roughness: 0.1, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 1.05,
    });
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    this.water.name = 'water-sea-level';
    this.water.userData.noOutline = true;
    this.water.userData.surfaceDetail = true;
    this.scene.add(this.water);
    try {
      const swell = await loadKTX2(this.renderer, 'assets/textures/water_normal.ktx2', { srgb: false, repeat: true });
      const chop = swell.clone();
      chop.needsUpdate = true;
      swell.repeat.set(W / 320, H / 320); // ~320 m swell tiles
      chop.repeat.set(W / 24, H / 24);    // ~24 m chop tiles (close views, the kayak)
      this.waterMat.normalMap = swell;
      this.waterMat.normalScale.set(0.35, 0.35);
      this.waterMat.clearcoatNormalMap = chop;
      this.waterMat.clearcoatNormalScale.set(0.55, 0.55);
      this.waterMat.needsUpdate = true;
      this.swell = swell; this.chop = chop;
    } catch (e) { console.warn('water normal map not loaded:', e.message); }
  }

  async _sky() {
    try {
      const tex = await new HDRLoader().loadAsync(`${BASE}assets/kloofendal_overcast_puresky_1k.hdr`);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = tex;
      this.scene.background = tex;
      this.scene.environmentIntensity = 1.0;
      this.scene.backgroundIntensity = 0.9;
    } catch (err) {
      console.warn('HDRI failed to load; using a flat sky colour.', err);
      this.scene.background = new THREE.Color(0xc4ccd2);
    }
  }

  // ---------------------------------------------------------------- grade
  /** Cool modern (0) to warm sepia archive (1): fog, sun, terrain tint, sky, vegetation muting. */
  applyGrade(past) {
    const g = gradeAt(past);
    this.grade = { past, ...g };
    this.scene.fog.color.setHex(g.fog);
    const k = g.exposure / 1.12;
    this.sun.color.setHex(g.sun);
    this.sun.intensity = 2.4 * k;
    this.scene.environmentIntensity = 1.0 * k;
    this.scene.backgroundIntensity = g.sky;
    for (const m of this.terrainMaterials) m.color.setHex(g.tint);
    this.U.uVegMute.value = past;
  }

  // ---------------------------------------------------------------- streaming
  /** After the first interaction: the 30 m heightfield and the 3D Tiles quadtree. */
  startStreaming() {
    if (this.streaming) return;
    this.streaming = true;
    this._loadDetail();
    this._grid(0).then((g) => { this.fine = g; this._yCache.clear(); this.onFineGrid?.(); }).catch((e) => console.warn('30 m heightfield not loaded:', e.message));
    const tiles = new TilesRenderer(`${BASE}tiles/muir/tileset.json`);
    tiles.registerPlugin(new GLTFExtensionsPlugin({ meshoptDecoder: MeshoptDecoder }));
    tiles.errorTarget = this.engine.quality.name === 'low' ? 16 : 10;
    tiles.group.rotation.x = -Math.PI / 2; // tileset is Z-up (S4 build-terrain-tiles.mjs)
    tiles.setCamera(this.camera);
    tiles.setResolutionFromRenderer(this.camera, this.renderer);
    tiles.addEventListener('load-model', ({ scene, tile }) => {
      scene.traverse((m) => {
        if (!m.isMesh) return;
        const map = m.material?.map || null;
        m.material?.dispose?.();
        const mat = patchTerrainMaterial(new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, envMapIntensity: 0.85, color: this.grade?.tint ?? 0xffffff }), this.U);
        this.terrainMaterials.add(mat);
        m.material = mat;
        m.castShadow = m.receiveShadow = true;
        m.userData.noOutline = true;
        m.userData.terrain = true;
        if (!tile.children?.length) this.leaves.add(m);
      });
      this._yCache.clear();
    });
    tiles.addEventListener('dispose-model', ({ scene }) => {
      scene.traverse((m) => { if (m.isMesh) { this.leaves.delete(m); this.terrainMaterials.delete(m.material); } });
      this._yCache.clear();
    });
    tiles.addEventListener('tiles-load-end', () => {
      this._yCache.clear();
      if (!this.tilesReady) { this.tilesReady = true; this.base.visible = false; }
      this.shadowsDirty();
      this.onTilesSettled?.();
    });
    this.tiles = tiles;
    this.root.add(tiles.group);
    addEventListener('resize', () => tiles.setResolutionFromRenderer(this.camera, this.renderer));
  }

  /** Near-ground detail textures (Poly Haven CC0, ATTRIBUTION rows 23-24), streamed after the first interaction. */
  async _loadDetail() {
    try {
      const r = this.renderer, U = this.U;
      const [till, tillN, rock, rockN] = await Promise.all([
        loadKTX2(r, 'assets/textures/gravel_ground_01_diff.ktx2', { repeat: true }),
        loadKTX2(r, 'assets/textures/gravel_ground_01_nor.ktx2', { repeat: true, srgb: false }),
        loadKTX2(r, 'assets/textures/rock_face_diff.ktx2', { repeat: true }),
        loadKTX2(r, 'assets/textures/rock_face_nor.ktx2', { repeat: true, srgb: false }),
      ]);
      U.uTillMap.value = till; U.uTillNor.value = tillN; U.uRockMap.value = rock; U.uRockNor.value = rockN;
      U.uDetailOn.value = 1;
      this.onDetail?.();
    } catch (e) { console.warn('near-ground detail textures not loaded:', e.message); }
  }

  /** Per frame: tiles, near plane from the height above ground, water scroll (driven by motion). */
  update() {
    const cam = this.camera;
    if (this.tiles) { cam.updateMatrixWorld(); this.tiles.update(); }
    const gy = this.ground(cam.position.x, cam.position.z);
    const h = Math.max(0.5, cam.position.y - gy);
    const r = this.app.rig ? this.app.rig.state.radius : h;
    const near = THREE.MathUtils.clamp(Math.min(h * 0.25, r * 0.15), 0.1, 60);
    if (Math.abs(cam.near - near) > near * 0.1 || cam.far !== 160000) { cam.near = near; cam.far = 160000; cam.updateProjectionMatrix(); }
  }

  /** In-app credit line (must stay in sync with ATTRIBUTION.md). */
  credits() {
    return 'Terrain: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. True scale, no vertical exaggeration. '
      + 'Ground image: Sentinel-2 L2A true colour, 6 August 2024 (contains modified Copernicus Sentinel data 2024), shown for every year. '
      + 'Beyond the edge of the elevation model the sea continues as a plain backdrop. Ice, icebergs, trees, plants, clouds, birds and the kayak are illustrative; the ice front is placed only at the three dated photo years. '
      + 'Sky: Kloofendal Overcast (Pure Sky) by Greg Zaal, Poly Haven, CC0. Detail textures: Poly Haven, CC0.';
  }
}
