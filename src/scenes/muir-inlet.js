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

const BASE = import.meta.env.BASE_URL || './';
const url = (p) => `${BASE}${p}`;

// Procedural PBR palette (linear sRGB values, applied as vertex colours).
const C_ROCK = new THREE.Color(0x5b5650);
const C_TILL = new THREE.Color(0x7d7468);
const C_VEG = new THREE.Color(0x3c4a2c);
const C_SNOW = new THREE.Color(0xe9eef2);
const C_ICE = new THREE.Color(0xb9c9d3);
const C_SHORE = new THREE.Color(0x6e675c);

/** Preset -> LOD index (0 = 30 m, 1 = 60 m). */
export function lodForPreset(name) {
  return name === 'high' || name === 'ultra' ? 0 : 1;
}

/** Preset -> mesh vertex stride over the chosen LOD (Low: 120 m mesh, ~200k triangles). */
export function strideForPreset(name) {
  return name === 'low' ? 2 : 1;
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

    this._buildLights(preset);
    this._buildTerrain();
    this._buildWater();
    this._buildViewpoints();
    await this._loadSky();
    this._bindControls();
    this.engine.quality.onChange?.((def) => this._applyShadows(def));
    this.setViewpoint('overview');
    return this;
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
    this.scene.fog = new THREE.Fog(0xc4ccd2, 30000, 140000);
  }

  _applyShadows(def) {
    const size = def?.shadowMapSize || 0;
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
    const L = meshLayout(g.width, g.height, g.mPerPx, stride);
    // Vertices at pixel centres (every `stride` pixels).
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

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
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
    el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture?.(e.pointerId); });
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
  }

  /** Keyboard / button steps (bound by the UI layer). */
  step(opts) { this.orbit.steps(opts); this._keepAboveGround(); }

  _keepAboveGround() {
    const p = this.camera.position;
    const h = heightAt(this.grid, p.x, p.z);
    const floor = (Number.isFinite(h) ? Math.max(h, 0) : 0) + 150;
    if (p.y < floor) { p.y = floor; this.camera.lookAt(this.orbit.target); }
  }

  /** Elevation (m) at scene x/z, for tools (measurement, profiles). */
  heightAt(x, z) { return heightAt(this.grid, x, z); }

  /** In-app credit line (must stay in sync with ATTRIBUTION.md). */
  getCredits() {
    return 'Terrain: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. ' +
      'Shown at true scale, no vertical exaggeration. Surface colours are a procedural approximation (elevation and slope), not imagery. ' +
      'Sky: Kloofendal Overcast (Pure Sky) by Greg Zaal, Poly Haven, CC0.';
  }
}

/**
 * Procedural surface colour from elevation (m) and slope (0..1). Labelled in-app
 * as an approximation; it is a reading aid, not evidence of land cover.
 * @param {number} h
 * @param {number} slope
 * @param {THREE.Color} out
 */
export function surfaceColour(h, slope, out) {
  if (h < 4) return out.copy(C_SHORE);
  if (slope > 0.35) return out.copy(C_ROCK);
  if (h > 1100) return out.copy(C_SNOW).lerp(C_ROCK, Math.min(1, slope * 2));
  if (h > 650) return out.copy(C_ICE).lerp(C_TILL, Math.min(1, slope * 2.5));
  if (h < 450) return out.copy(C_VEG).lerp(C_TILL, Math.min(1, slope * 2.5));
  return out.copy(C_TILL).lerp(C_ROCK, Math.min(1, slope * 2));
}
