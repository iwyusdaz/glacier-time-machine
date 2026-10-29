/**
 * Muir Inlet terrain scene: the real Copernicus GLO-30 surface model at true
 * scale (1 unit = 1 m, no vertical exaggeration), lit by a Poly Haven CC0
 * overcast-sky HDRI plus a soft sun, ACES tone mapping (engine), sea-level water
 * plane, light haze.
 *
 * Surface colour is a PROCEDURAL approximation (elevation + slope rules), not
 * imagery: the per-date imagery drape is Phase B. The app labels this in the
 * credits line (getCredits()).
 * @module scenes/muir-inlet
 */
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitController } from '../core/input.js';
import { decodeTerrain, heightAt, utmToScene } from '../systems/terrain-data.js';
import { MuirDressing } from './muir-dressing.js';
import { gradeAt } from './muir-grade.js';

export const DRAPE_FILE = 'data/muir-s2-20240806.jpg';

const BASE = import.meta.env.BASE_URL || './';
const url = (p) => `${BASE}${p}`;

// Procedural PBR palette (linear sRGB values, applied as vertex colours).
const C_ROCK = new THREE.Color(0x5b5650);
const C_TILL = new THREE.Color(0x7d7468);
const C_VEG = new THREE.Color(0x3c4a2c);
const C_SNOW = new THREE.Color(0xe9eef2);
const C_ICE = new THREE.Color(0xb9c9d3);
const C_SHORE = new THREE.Color(0x6e675c);

/** Preset -> LOD index (0 = 30 m, 1 = 60 m). Only Ultra uses the 30 m grid. */
export function lodForPreset(name) {
  return name === 'ultra' ? 0 : 1;
}

/**
 * Preset -> mesh vertex stride over the chosen LOD.
 * Low 180 m (~88k triangles), Medium 120 m (~198k), High 60 m (~790k), Ultra 30 m.
 */
export function strideForPreset(name) {
  return { low: 3, medium: 2 }[name] || 1;
}

/**
 * Mesh layout for a grid sampled every `stride` pixels: vertex counts, plane
 * size and the offset that puts vertex (0,0) on the centre of pixel (0,0)
 * (scene origin = grid centre, see systems/terrain-data.js).
 */
export function meshLayout(width, height, mPerPx, stride) {
  const nx = Math.floor((width - 1) / stride) + 1;
  const nz = Math.floor((height - 1) / stride) + 1;
  const sizeX = (nx - 1) * stride * mPerPx;
  const sizeZ = (nz - 1) * stride * mPerPx;
  const first = (n) => (0.5 - n / 2) * mPerPx; // pixel-0 centre relative to grid centre
  return { nx, nz, sizeX, sizeZ, offsetX: first(width) + sizeX / 2, offsetZ: first(height) + sizeZ / 2 };
}

export class MuirInletScene {
  /** @param {import('../core/engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.grid = null;
    this.meta = null;
    this.viewpoints = {};
    this.camera.near = 10;
    this.camera.far = 150000;
    this.camera.updateProjectionMatrix();
  }

  async load() {
    const preset = this.engine.quality.name;
    this.meta = await (await fetch(url('data/terrain-meta.json'))).json();
    const lodIndex = lodForPreset(preset);
    const lod = this.meta.lods[lodIndex];
    const bytes = new Uint8Array(await (await fetch(url(`data/${lod.file}`))).arrayBuffer());
    this.grid = await decodeTerrain(bytes, this.meta, lodIndex);
    this._builtLod = lodIndex;
    this._builtStride = strideForPreset(preset);

    this._buildLights(preset);
    await this._loadDrape();
    this._buildTerrain();
    this._buildSkirt();
    this._buildWater();
    this._buildViewpoints();
    await this._loadSky();
    this._bindControls();
    this.engine.initPost?.(this.scene, this.camera);
    // Quality preset change: re-apply shadows AND rebuild the terrain mesh when
    // the LOD/stride differs, so UI-reachable presets actually differ (visual
    // review V3 / heuristics H1: previously only shadows changed).
    this.engine.quality.onChange?.((def, name) => this._onQualityChange(def, name));
    this.setViewpoint('overview');
    return this;
  }

  _onQualityChange(def, name) {
    this._applyShadows(def);
    if (!this.grid || !this.terrain) return;
    const lod = lodForPreset(name);
    const stride = strideForPreset(name);
    if (lod === this._builtLod && stride === this._builtStride) {
      this.engine.initPost?.(this.scene, this.camera);
      return;
    }
    this._rebuildTerrain(lod, stride);
  }

  /** Rebuild the terrain mesh (and measurement path) for a new LOD/stride. */
  async _rebuildTerrain(lodIndex, stride) {
    if (this._rebuilding) { this._pendingRebuild = [lodIndex, stride]; return; }
    this._rebuilding = true;
    try {
      if (lodIndex !== this._builtLod) {
        const lod = this.meta.lods[lodIndex];
        const bytes = new Uint8Array(await (await fetch(url(`data/${lod.file}`))).arrayBuffer());
        this.grid = await decodeTerrain(bytes, this.meta, lodIndex);
      }
      const old = this.terrain;
      const oldSkirt = this.skirt;
      this._buildTerrain();
      this._buildSkirt();
      this._builtLod = lodIndex;
      this._builtStride = stride;
      if (old) { old.removeFromParent(); old.geometry.dispose(); }
      if (this.dressing) this.dressing.applyCloudShadows(this.terrain.material);
      if (this.grade) this.applyGrade(this.grade.past);
      if (oldSkirt) { oldSkirt.removeFromParent(); oldSkirt.geometry.dispose(); }
      if (this._pathPoints) {
        const wasVisible = this.pathGroup?.visible !== false;
        this.setPath(this._pathPoints);
        this.setPathVisible(wasVisible);
        this.setMarkers(null);
      }
      this.engine.initPost?.(this.scene, this.camera);
    } finally {
      this._rebuilding = false;
      if (this._pendingRebuild) {
        const p = this._pendingRebuild;
        this._pendingRebuild = null;
        this._rebuildTerrain(...p);
      }
    }
  }

  /** Real Sentinel-2 L2A true-colour drape (2024-08-06). Procedural colours stay as the fallback. */
  async _loadDrape() {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(url(DRAPE_FILE));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, this.engine.renderer.capabilities.getMaxAnisotropy?.() || 1);
      this.drape = tex;
    } catch (err) {
      console.warn('Sentinel-2 drape failed to load; using procedural colours.', err);
      this.drape = null;
    }
  }

  /**
   * v2 living dressing (ice, bergs, trees, clouds, snow, birds, calving) +
   * time-of-year grade. Built after load() so the terrain sampler exists.
   */
  async buildLiving(content, { reducedMotion = false } = {}) {
    this.dressing = new MuirDressing(this, content, { reducedMotion });
    this.dressing.onGrade = (past) => this.applyGrade(past);
    if (this.terrain) this.dressing.applyCloudShadows(this.terrain.material);
    await this.dressing.build();
    this.applyGrade(this.dressing.past ?? 0);
    return this.dressing;
  }

  /** Cool modern (0) to warm sepia archive (1) grade: fog, exposure, sun and terrain tint. */
  applyGrade(past) {
    const g = gradeAt(past);
    this.grade = { past, ...g };
    if (this.scene.fog) this.scene.fog.color.setHex(g.fog);
    this.engine.renderer.toneMappingExposure = g.exposure;
    this.sun?.color.setHex(g.sun);
    this.terrain?.material.color.setHex(g.tint);
    this.scene.backgroundIntensity = g.sky;
  }

  _buildLights(preset) {
    // Overcast HDRI carries most of the light; a low sun from the south-west gives relief.
    this.sun = new THREE.DirectionalLight(0xfff1df, 1.6);
    this.sun.position.set(-30000, 22000, 26000);
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun, this.sun.target);
    const s = this.sun.shadow;
    s.camera.left = -26000; s.camera.right = 26000;
    s.camera.top = 26000; s.camera.bottom = -26000;
    s.camera.near = 1000; s.camera.far = 90000;
    s.bias = -0.0004; s.normalBias = 40;
    this._applyShadows(this.engine.quality.presetDef);
    // v2: cool exponential haze (art bible §3); density tuned for 30-50 km views.
    this.scene.fog = new THREE.FogExp2(0xb8cfe0, 0.000011);
  }

  _applyShadows(def) {
    const size = def?.shadowMapSize || 0;
    // Static terrain + fixed sun: render the shadow map once per change, not per frame.
    const sm = this.engine.renderer.shadowMap;
    sm.autoUpdate = false;
    sm.needsUpdate = true;
    this.sun.castShadow = size > 0;
    if (size > 0) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.terrain) { this.terrain.castShadow = size > 0; this.terrain.receiveShadow = size > 0; }
  }

  _buildTerrain() {
    const g = this.grid;
    const stride = strideForPreset(this.engine.quality.name);
    const L = meshLayout(g.width, g.height, g.mPerPx, stride);    // Vertices at pixel centres (every `stride` pixels).
    const geo = new THREE.PlaneGeometry(L.sizeX, L.sizeZ, L.nx - 1, L.nz - 1);
    geo.rotateX(-Math.PI / 2); // plane now in x/z, rows run north (-z) -> south (+z)
    geo.translate(L.offsetX, 0, L.offsetZ);
    const pos = geo.attributes.position;
    const heights = new Float32Array(pos.count);
    for (let j = 0; j < L.nz; j++) {
      for (let i = 0; i < L.nx; i++) heights[j * L.nx + i] = g.data[(j * stride) * g.width + i * stride];
    }
    for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const nrm = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = heights[i];
      const slope = 1 - nrm.getY(i); // 0 flat .. 1 vertical
      surfaceColour(h, slope, c);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Exact drape UVs from the DEM bounds (the image covers the same UTM window).
    const fx = (g.bounds.east - g.bounds.west), fz = (g.bounds.north - g.bounds.south);
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + fx / 2) / fx, 1 - (pos.getZ(i) + fz / 2) / fz);
    uv.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
      map: this.drape || null,
      vertexColors: !this.drape,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.9,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.name = 'terrain-copernicus-glo30';
    this.terrain.castShadow = this.sun.castShadow;
    this.terrain.receiveShadow = this.sun.castShadow;
    this.scene.add(this.terrain);
  }

  /**
   * Perimeter skirt: drops the DEM edge below sea level and fades to deep-water
   * dark, so the heightfield does not read as a paper-thin floating slab at the
   * close viewpoints (visual review V4; same approach as lunar-field-expedition).
   * The water plane stays clamped to the DEM footprint and meets the skirt, so
   * there is no visible water cutoff at the boundary either.
   */
  _buildSkirt() {
    const g = this.grid;
    const stride = this._builtStride || strideForPreset(this.engine.quality.name);
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
    const BOT = -400;
    const pos = new Float32Array(n * 2 * 3);
    const col = new Float32Array(n * 2 * 3);
    const idx = [];
    const cTop = new THREE.Color();
    const cBot = new THREE.Color(0x0e1a20); // deep-water dark
    for (let k = 0; k < n; k++) {
      const [i, j] = ring[k];
      const h = hAt(i, j);
      const x = vx(i);
      const z = vz(j);
      pos.set([x, h, z], k * 6);
      pos.set([x, BOT, z], k * 6 + 3);
      surfaceColour(Math.max(h, 0), 0.5, cTop).lerp(cBot, 0.35);
      col.set([cTop.r, cTop.g, cTop.b], k * 6);
      col.set([cBot.r, cBot.g, cBot.b], k * 6 + 3);
      const a = k * 2;
      const b = ((k + 1) % n) * 2;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.skirt = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.4,
    }));
    this.skirt.name = 'terrain-skirt';
    this.scene.add(this.skirt);
  }

  _buildWater() {
    // Sea level. The DSM records the inlet as ~0 m; the plane sits 1.5 m above
    // it to hide DEM noise at the shoreline. Calm, no decorative waves.
    const g = this.grid;
    // Clamped to the DEM footprint so no water slab shows beyond the terrain edge.
    const geo = new THREE.PlaneGeometry((g.width - 1) * g.mPerPx, (g.height - 1) * g.mPerPx);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x1d4a5a,
      roughness: 0.12,
      metalness: 0.0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.0,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = 1.5;
    this.water.receiveShadow = true;
    this.water.name = 'water-sea-level';
    this.scene.add(this.water);
  }

  async _loadSky() {
    try {
      const tex = await new HDRLoader().loadAsync(url('assets/kloofendal_overcast_puresky_1k.hdr'));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = tex;
      this.scene.background = tex;
      this.scene.environmentIntensity = 1.0;
      this.scene.backgroundIntensity = 0.9;
    } catch (err) {
      // HDRI missing -> neutral overcast colour so the app still works.
      console.warn('HDRI failed to load; using a flat sky colour.', err);
      this.scene.background = new THREE.Color(0xc4ccd2);
    }
  }

  _buildViewpoints() {
    // Only landmarks with published coordinates (research/sources.md rows 23-25).
    // The White Thunder Ridge camera station is NOT here yet: it must come from
    // the Phase B camera solve, with its error reported.
    const lm = (prefix) => this.meta.landmarks.find((l) => l.name.startsWith(prefix));
    const toScene = (l) => utmToScene(this.grid, l.utmE, l.utmN);
    const inlet = toScene(lm('Muir Inlet'));
    const muir = toScene(lm('Muir Glacier'));
    const riggs = toScene(lm('Riggs Glacier'));
    this.landmarks = { inlet, muir, riggs };
    this.viewpoints = {
      overview: { target: [0, 300, 0], radius: 52000, theta: 0.35, phi: 0.95, label: 'Overview of Muir Inlet from the south' },
      inlet: { target: [inlet.x, 0, inlet.z], radius: 9000, theta: 0.2, phi: 1.2, label: 'Lower Muir Inlet' },
      muir: { target: [muir.x, 100, muir.z], radius: 8000, theta: 2.3, phi: 1.15, label: 'Muir Glacier (published coordinate)' },
      riggs: { target: [riggs.x, 600, riggs.z], radius: 7000, theta: 2.8, phi: 1.1, label: 'Riggs Glacier (published coordinate)' },
    };
  }

  /** Preset camera views (tasks use these; free orbit only in exploration). */
  setViewpoint(name) {
    const vp = this.viewpoints[name];
    if (!vp) return;
    this.orbit.target.set(...vp.target);
    Object.assign(this.orbit.spherical, { radius: vp.radius, theta: vp.theta, phi: vp.phi });
    this.orbit.update();
    this.current = name;
  }

  _bindControls() {
    this.orbit = new OrbitController(this.camera, this.engine.canvas);
    this.orbit.minRadius = 1500;
    this.orbit.maxRadius = 70000;
    this.orbit.maxPhi = 1.45;
    const el = this.engine.canvas;
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      // A v2 tool (terrain measuring line) owns the pointer: no orbit drag.
      if (this.toolOwnsPointer) return;
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.orbit.drag(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
      this._keepAboveGround();
    });
    const end = () => { drag = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.zoom(Math.sign(e.deltaY) * 0.1);
      this._keepAboveGround();
    }, { passive: false });
    // Keyboard camera (accessibility review A2): arrows rotate, +/− zoom.
    // Inert while focus is in a form field or an open dialog, so sliders and
    // dialogs keep their keys.
    this._onKeyCam = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.closest('dialog'))) return;
      const steps = {
        ArrowLeft: { rotX: -1 }, ArrowRight: { rotX: 1 },
        ArrowUp: { rotY: -1 }, ArrowDown: { rotY: 1 },
        Equal: { zoom: -1 }, NumpadAdd: { zoom: -1 },
        Minus: { zoom: 1 }, NumpadSubtract: { zoom: 1 },
      }[e.code];
      if (!steps) return;
      e.preventDefault();
      this.orbit.steps(steps);
      this._keepAboveGround();
    };
    window.addEventListener('keydown', this._onKeyCam);
  }

  /** Keyboard / button steps (bound by the UI layer). */
  step(opts) { this.orbit.steps(opts); this._keepAboveGround(); }

  _keepAboveGround() {
    const p = this.camera.position;
    const h = heightAt(this.grid, p.x, p.z);
    const floor = (Number.isFinite(h) ? Math.max(h, 0) : 0) + 150;
    if (p.y < floor) { p.y = floor; this.camera.lookAt(this.orbit.target); }
  }

  /**
   * Draw the DEM-derived measurement path (content/flowline.json) as an orange
   * tube slightly above the surface. A measurement ruler, not data about
   * terminus positions (labelled in the UI).
   */
  setPath(points) {
    this._pathPoints = points;
    this.pathGroup?.removeFromParent();
    this.pathGroup = new THREE.Group();
    this.pathGroup.name = 'measurement-path';
    const lift = (p) => new THREE.Vector3(p.x, Math.max(this.heightAt(p.x, p.z) || 0, 0) + 30, p.z);
    const curve = new THREE.CatmullRomCurve3(points.map(lift), false, 'centripetal');
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(64, points.length * 4), 60, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, fog: false }),
    );
    this.pathGroup.add(tube);
    const mkMarker = (color) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 900, 16), new THREE.MeshBasicMaterial({ color, fog: false }));
      m.visible = false;
      this.pathGroup.add(m);
      return m;
    };
    this.markerA = mkMarker(0xffd166);
    this.markerB = mkMarker(0x7fb4ff);
    this.scene.add(this.pathGroup);
  }

  setPathVisible(flag) { if (this.pathGroup) this.pathGroup.visible = !!flag; }

  /** Place markers from a measureBetween() result; null hides them. */
  setMarkers(m) {
    if (!this.markerA) return;
    for (const [mk, p] of [[this.markerA, m?.a], [this.markerB, m?.b]]) {
      mk.visible = !!p;
      if (p) mk.position.set(p.x, Math.max(this.heightAt(p.x, p.z) || 0, 0) + 450, p.z);
    }
  }

  /** Elevation (m) at scene x/z, for tools (measurement, profiles). */
  heightAt(x, z) { return heightAt(this.grid, x, z); }

  /** In-app credit line (must stay in sync with ATTRIBUTION.md). */
  getCredits() {
    return 'Terrain: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. ' +
      'Shown at true scale, no vertical exaggeration. ' +
      (this.drape
        ? 'Surface imagery: Sentinel-2 L2A true colour, 6 August 2024 (contains modified Copernicus Sentinel data 2024), via AWS Open Data. '
        : 'Surface colours are a procedural approximation (elevation and slope), not imagery (the Sentinel-2 image failed to load). ') +
      'Ice tongue, ice cliff, icebergs, trees, shrubs, clouds and birds are illustrative; the ice front is placed only at the three dated photo years, from the published minimum retreat. ' +
      'Rocks and shrub models: Poly Haven, CC0. ' +
      'Sky: Kloofendal Overcast (Pure Sky) by Greg Zaal, Poly Haven, CC0.';
  }
}

/**
 * Procedural surface colour from elevation (m) and slope (0..1). Labelled in-app
 * as an approximation; it is a reading aid, not evidence of land cover.
 * Changes from review (G1/V5/V6): bands are smoothed over ±75 m instead of hard
 * contour steps, and the present-day glacier tongue now reads as ice — the
 * Copernicus DSM is the 2011–2015 surface and the surviving Muir Glacier tongue
 * sits near sea level (landmark elevation 28 m), so flat, low terrain is coloured
 * ice instead of vegetation. Still approximate by design; correction logged in
 * DECISIONS.md and design/realism-matrix.md.
 * @param {number} h
 * @param {number} slope
 * @param {THREE.Color} out
 */
export function surfaceColour(h, slope, out) {
  if (h < 4) return out.copy(C_SHORE);
  if (slope > 0.35) return out.copy(C_ROCK);
  const band = (v, lo, hi) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  out.copy(C_VEG).lerp(C_TILL, Math.min(1, slope * 2.5));
  // High valley ice (smoothed replacement of the old hard 650 m step).
  const highIce = band(h, 575, 725) * (1 - Math.min(1, slope * 1.5));
  // Present-day low, flat glacier tongue near sea level: ice, not vegetation.
  const tongue = (1 - band(h, 40, 240)) * (1 - band(slope, 0.08, 0.15));
  out.lerp(C_ICE, Math.max(highIce, tongue * 0.9));
  // Snow line (smoothed replacement of the old hard 1100 m step).
  out.lerp(C_SNOW, band(h, 1025, 1175) * (1 - Math.min(1, slope * 2)));
  return out;
}
