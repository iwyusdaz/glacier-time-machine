/**
 * life.js — the moving parts of Muir Inlet (plan 10 §5): icebergs, soft cloud
 * billboards (v3 carry-over; the Takram clouds stay out of Medium per the S2
 * spike) with the matching cloud-shadow field, snow blowing off the summits,
 * gulls, the sea kayak (carry-over "kayak travel"), meltwater streams and the
 * milky plume, and the survey flags at the dated fronts (carry-over "survey
 * markers"). Speeds are real where a real speed exists (a paddler at about
 * 1.4 m/s, wingbeats about 3 per second, wind on the order of 8 m/s); paths,
 * counts and frequencies are illustrative and the cards say so.
 * @module glacier/life
 */
import * as THREE from 'three';
import { loadKTX2, loadGLB, mulberry32, BASE } from './loaders.js';
import { radialTexture } from './ice.js';
import { WATER_Y } from './site.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Year tag sprite (an orange survey tag with the year), constant size on screen. */
export function yearTag(year) {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 72;
  const g = c.getContext('2d');
  g.fillStyle = '#0f1924'; g.beginPath(); g.roundRect(2, 2, 156, 56, 10); g.fill();
  g.fillStyle = '#ff8a2a'; g.beginPath(); g.roundRect(6, 6, 148, 48, 8); g.fill();
  g.fillStyle = '#0f1924'; g.beginPath(); g.moveTo(70, 58); g.lineTo(80, 70); g.lineTo(90, 58); g.fill();
  g.fillStyle = '#160b02'; g.font = '700 34px "Atkinson Hyperlegible", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(year), 80, 31);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
  s.center.set(0.5, 0);
  s.scale.set(0.05, 0.0225, 1);
  s.renderOrder = 8;
  s.userData.marker = { label: 'Year tag on a survey flag' };
  return s;
}

/** A gull at real size (wingspan 1.0 m, length 0.5 m). Wing vertices carry `wing` (0 body, 1 tip) for flapping. */
export function gullGeometry() {
  const P = [], W = [], I = [];
  const v = (x, y, z, w) => { P.push(x, y, z); W.push(w); return P.length / 3 - 1; };
  // body: a slim diamond 0.5 m long, 0.1 m tall
  const nose = v(0, 0.01, 0.27, 0), tail = v(0, 0.02, -0.23, 0), top = v(0, 0.05, 0.02, 0), bot = v(0, -0.05, 0.02, 0), l = v(-0.05, 0, 0.02, 0), r = v(0.05, 0, 0.02, 0);
  I.push(nose, l, top, nose, top, r, nose, bot, l, nose, r, bot, tail, top, l, tail, r, top, tail, l, bot, tail, bot, r);
  // wings: inner and outer panels each side
  for (const sx of [-1, 1]) {
    const root0 = v(sx * 0.04, 0.02, 0.07, 0), root1 = v(sx * 0.04, 0.02, -0.06, 0);
    const mid0 = v(sx * 0.26, 0.025, 0.06, 0.5), mid1 = v(sx * 0.26, 0.025, -0.07, 0.5);
    const tip = v(sx * 0.5, 0.03, -0.1, 1);
    const tri = sx > 0 ? [root0, mid0, root1, root1, mid0, mid1, mid0, tip, mid1] : [root0, root1, mid0, root1, mid1, mid0, mid0, mid1, tip];
    I.push(...tri);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('wing', new THREE.Float32BufferAttribute(W, 1));
  geo.setIndex(I);
  geo.computeVertexNormals();
  return geo;
}

function gullMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xeef1f3, roughness: 0.8, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wing;\nuniform float uTime;\nvarying float vWing;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = 0.0;
        #ifdef USE_INSTANCING
          ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
        #endif
        float beat = sin(uTime * 19.0 + ph); // about 3 wingbeats per second
        float glide = step(0.0, sin(uTime * 0.6 + ph * 2.0)); // glide half the time
        transformed.y += wing * abs(position.x) * beat * 0.9 * (1.0 - 0.8 * glide);
        vWing = wing;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWing;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.3, 0.33), smoothstep(0.82, 0.95, vWing));');
  };
  m.customProgramCacheKey = () => 'muir-gull';
  return m;
}

export class InletLife {
  constructor(site, ice) {
    this.site = site;
    this.ice = ice;
    this.group = new THREE.Group();
    this.group.name = 'life';
    this.U = { uTime: { value: 0 } };
    this.counts = {};
  }

  async build(renderer) {
    await Promise.all([this._bergs(renderer), this._clouds(renderer), this._kayak(renderer), this._flags(renderer)]);
    this._snow();
    this._gulls();
    this._meltwater();
    return this;
  }

  // ---------------------------------------------------------------- icebergs
  async _bergs(renderer) {
    const names = ['iceberg-dome', 'iceberg-pinnacle', 'iceberg-block'];
    const glbs = await Promise.all(names.map((n) => loadGLB(renderer, `assets/models/v3/${n}.glb`).catch(() => null)));
    const mat = new THREE.MeshStandardMaterial({ color: 0xeef7fb, roughness: 0.45, emissive: 0x0d3f5c, emissiveIntensity: 0.2, envMapIntensity: 1.1, map: this.ice.iceMat?.map || null });
    const r = mulberry32(2004);
    this.bergSets = [];
    this.bergRoots = [];
    const site = this.site;
    glbs.forEach((g, k) => {
      if (!g) return;
      let geo = null;
      g.scene.traverse((m) => { if (m.isMesh && !geo) geo = m.geometry; });
      if (!geo) return;
      if (k === 0) {
        // Catalog scale reference (12 x 6 x 9 m) drifting near the lower inlet; measured in its own axes.
        const one = new THREE.Mesh(geo, mat);
        one.name = 'iceberg-reference';
        one.castShadow = true;
        one.userData.scaleFrame = 'local';
        one.userData.drift = { s: site.L * 0.42, off: 120, rot: 0.7, speed: 0.25, spin: 0.002, k: 1, ph: 0.3 };
        this.group.add(one);
        this.bergOne = one;
        this.bergRoots.push(one);
      }
      const n = 18;
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.name = `${names[k]}-drift`;
      im.castShadow = true;
      im.frustumCulled = false;
      im.userData.slots = Array.from({ length: n }, () => ({ s: site.L * (0.15 + 0.62 * r()), off: (r() - 0.5) * 1500, rot: r() * 6.28, speed: 0.15 + r() * 0.35, spin: (r() - 0.5) * 0.004, k: 0.7 + (r() ** 2) * 3.2, ph: r() * 6.28 }));
      this.group.add(im);
      this.bergSets.push(im);
      this.bergRoots.push(im);
    });
    this.bergT = 0;
    this._placeBergs(0);
  }

  /** Drift down-inlet on the outgoing water (illustrative speed, a few tenths of a metre per second). */
  stepBergs(dt) {
    this.bergT += dt;
    const limit = (this.ice.front?.s ?? this.site.L) - 400;
    const step = (b) => { b.s -= b.speed * dt; b.rot += b.spin * dt; if (b.s < this.site.L * 0.08) b.s = Math.min(limit, this.site.L * 0.78); if (b.s > limit) b.s = limit - 50; };
    if (this.bergOne) step(this.bergOne.userData.drift);
    for (const im of this.bergSets) for (const b of im.userData.slots) step(b);
    this._placeBergs();
  }

  _placeBergs() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const t = this.bergT;
    const put = (b) => {
      const f = this.site.frame(b.s);
      const x = f.x + f.nx * b.off, z = f.z + f.nz * b.off;
      const water = this.site.ground(x, z) < 1;
      e.set(Math.sin(t * 0.4 + b.ph) * 0.02, b.rot, Math.cos(t * 0.33 + b.ph) * 0.02);
      q.setFromEuler(e);
      v.set(x, WATER_Y - 0.4 + Math.sin(t * 0.5 + b.ph) * 0.15, z);
      sc.setScalar(water ? b.k : 0.0001);
      return m4.compose(v, q, sc);
    };
    if (this.bergOne) { put(this.bergOne.userData.drift); this.bergOne.position.copy(v); this.bergOne.quaternion.copy(q); this.bergOne.scale.setScalar(1); }
    for (const im of this.bergSets) { im.userData.slots.forEach((b, i) => im.setMatrixAt(i, put(b))); im.instanceMatrix.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- clouds (soft billboards) + shadows
  async _clouds(renderer) {
    const atlas = await loadKTX2(renderer, 'assets/textures/cloud_atlas.ktx2').catch(() => null);
    const r = mulberry32(59);
    const site = this.site;
    const peaks = [];
    for (let t = 0; t < 6000 && peaks.length < 46; t++) {
      const x = (r() * 2 - 1) * site.halfX * 0.95, z = (r() * 2 - 1) * site.halfZ * 0.95;
      const h = site.ground(x, z);
      if (h > 900) peaks.push({ x, z, h });
    }
    const per = 3;
    const n = peaks.length * per + 14;
    const geo = new THREE.PlaneGeometry(1, 1);
    const im = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas }, uSun: { value: site.sunDir }, uOpacity: { value: 0.85 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
      vertexShader: `
        attribute vec3 cloud; // x: atlas cell 0..7, y: width (m), z: height (m)
        varying vec2 vUv; varying float vFogDepth; varying float vShade;
        void main() {
          vec3 c = instanceMatrix[3].xyz;
          vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam);
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          vec3 world = c + right * position.x * cloud.y + vec3(0.0, 1.0, 0.0) * position.y * cloud.z;
          float cell = cloud.x;
          vec2 o = vec2(mod(cell, 4.0), floor(cell / 4.0));
          vUv = (uv + o) / vec2(4.0, 2.0);
          vShade = 0.82 + 0.18 * position.y * 2.0;
          vec4 mv = viewMatrix * vec4(world, 1.0);
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas; uniform float uOpacity; uniform vec3 fogColor; uniform float fogDensity;
        varying vec2 vUv; varying float vFogDepth; varying float vShade;
        void main() {
          vec4 t = texture2D(uAtlas, vec2(vUv.x, 1.0 - vUv.y));
          float a = t.a * uOpacity;
          if (a < 0.02) discard;
          vec3 col = t.rgb * vec3(0.98, 0.99, 1.0) * vShade * 1.15;
          float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          col = mix(col, fogColor, f * 0.8);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    }), n);
    im.name = 'cloud-billboards';
    im.frustumCulled = false;
    im.renderOrder = 4;
    const cloudAttr = new Float32Array(n * 3);
    this.cloudData = [];
    let i = 0;
    for (const p of peaks) for (let k = 0; k < per; k++, i++) {
      const bank = r() < 0.45;
      const w = bank ? 2200 + r() * 2600 : 900 + r() * 1300;
      this.cloudData.push({ x: p.x + (r() - 0.5) * 3000, z: p.z + (r() - 0.5) * 3000, y: p.h + 150 + r() * 380, w });
      cloudAttr.set([bank ? 4 + Math.floor(r() * 4) : Math.floor(r() * 4), w, bank ? w * 0.32 : w * 0.55], i * 3);
    }
    for (; i < n; i++) {
      // A few low banks over the inlet itself (they cast the shadows the learner sees on the water side).
      const f = site.frame(site.L * (0.2 + 0.7 * r()));
      const w = 2400 + r() * 2400;
      this.cloudData.push({ x: f.x + (r() - 0.5) * 6000, z: f.z + (r() - 0.5) * 6000, y: 900 + r() * 500, w });
      cloudAttr.set([4 + Math.floor(r() * 4), w, w * 0.3], i * 3);
    }
    geo.setAttribute('cloud', new THREE.InstancedBufferAttribute(cloudAttr, 3));
    this.clouds = im;
    this.cloudDrift = 0;
    this.group.add(im);
    this._placeClouds();
    this.counts.clouds = n;
  }

  /** Wind from the west-south-west, about 8 m/s (illustrative); the shadow field moves with it. */
  stepClouds(dt) {
    this.cloudDrift += dt * 8;
    this._placeClouds();
    this.site.U.uCloudOffset.value.set(this.cloudDrift, this.cloudDrift * 0.35);
  }

  _placeClouds() {
    if (!this.clouds) return;
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    const wrapX = this.site.halfX * 2.2;
    const fog = this.site.scene.fog;
    this.clouds.material.uniforms.fogColor.value.copy(fog.color);
    this.clouds.material.uniforms.fogDensity.value = fog.density;
    this.cloudData.forEach((c, i) => {
      let x = c.x + this.cloudDrift;
      x = ((x + wrapX / 2) % wrapX + wrapX) % wrapX - wrapX / 2;
      v.set(x, c.y, c.z + this.cloudDrift * 0.35 % 3000);
      m4.makeTranslation(v.x, v.y, v.z);
      this.clouds.setMatrixAt(i, m4);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- snow off the summits
  _snow() {
    const r = mulberry32(1100);
    const site = this.site;
    let best = { x: 0, z: 0, h: 0 };
    for (let t = 0; t < 4000; t++) {
      const x = (r() * 2 - 1) * site.halfX * 0.8, z = (r() * 2 - 1) * site.halfZ * 0.8;
      const h = site.ground(x, z);
      if (h > best.h && z < -8000) best = { x, z, h };
    }
    const N = 1400, ext = [7000, 700, 7000];
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([best.x + (r() - 0.5) * ext[0], best.h - 200 + r() * ext[1], best.z + (r() - 0.5) * ext[2]], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 22, map: radialTexture(), transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
    this.snow.name = 'snow-drift';
    this.snow.frustumCulled = false;
    this.snowBox = { c: best, ext };
    this.group.add(this.snow);
  }
  stepSnow(dt) {
    const p = this.snow.geometry.attributes.position;
    const { c, ext } = this.snowBox;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + 9 * dt, y = p.getY(i) - 1.2 * dt, z = p.getZ(i) + 4 * dt;
      if (x > c.x + ext[0] / 2) x -= ext[0];
      if (z > c.z + ext[2] / 2) z -= ext[2];
      if (y < c.h - 260) y += ext[1];
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  // ---------------------------------------------------------------- gulls
  _gulls() {
    const geo = gullGeometry();
    const mat = gullMaterial(this.U);
    const r = mulberry32(77);
    const site = this.site;
    this.gullFlocks = [];
    // First in the scene graph: the catalog scale reference: one gull outside the instancing (rest pose 1.0 x 0.1 x 0.5 m).
    this.gullOne = new THREE.Mesh(geo, mat);
    this.gullOne.name = 'gull-reference';
    geo.computeBoundingBox();
    const s = geo.boundingBox.getSize(new THREE.Vector3());
    this.gullOne.userData.restSize = [s.x, s.y, s.z].map((x) => +x.toFixed(3));
    this.group.add(this.gullOne);
    // Flock near the photo station (seen up close), flock over the icebergs and the front.
    const station = this.stationAt || { x: -5000, z: -9900 };
    const front = this.ice.front || site.frame(site.L - 7000);
    const flocks = [
      { c: { x: station.x + 60, z: station.z + 90 }, n: 7, rad: [20, 70], h: [14, 40], ground: true },
      { c: { x: front.x - front.tx * 700, z: front.z - front.tz * 700 }, n: 16, rad: [150, 600], h: [25, 90], follow: 'front' },
      { c: site.frame(site.L * 0.4), n: 9, rad: [60, 260], h: [12, 50], follow: 'kayak' },
    ];
    for (const F of flocks) {
      const im = new THREE.InstancedMesh(geo, mat, F.n);
      im.name = 'gulls';
      im.frustumCulled = false;
      im.userData.flock = F;
      F.birds = Array.from({ length: F.n }, () => ({ rad: F.rad[0] + r() * (F.rad[1] - F.rad[0]), ph: r() * 6.28, h: F.h[0] + r() * (F.h[1] - F.h[0]), w: (8 + r() * 4) / (F.rad[0] + r() * (F.rad[1] - F.rad[0])) }));
      this.group.add(im);
      this.gullFlocks.push(im);
    }
    this.gullT = 0;
    this.stepGulls(0);
  }

  /** Gulls circle at about 8-12 m/s (real gull flight speeds), flapping and gliding. */
  stepGulls(dt) {
    this.gullT += dt;
    this.U.uTime.value = this.gullT;
    const t = this.gullT;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
    for (const im of this.gullFlocks) {
      const F = im.userData.flock;
      if (F.follow === 'front' && this.ice.front) { const f = this.ice.front; F.c = { x: f.x - f.tx * 700, z: f.z - f.tz * 700 }; }
      if (F.follow === 'kayak' && this.kayak) F.c = { x: this.kayak.position.x, z: this.kayak.position.z };
      const base = F.ground ? this.site.ground(F.c.x, F.c.z) : WATER_Y;
      F.birds.forEach((b, i) => {
        const a = b.ph + t * b.w;
        v.set(F.c.x + Math.cos(a) * b.rad, base + b.h + Math.sin(t * 0.5 + b.ph) * 4, F.c.z + Math.sin(a) * b.rad);
        e.set(0, -a, Math.sin(a * 2) * 0.15);
        q.setFromEuler(e);
        m4.compose(v, q, sc);
        im.setMatrixAt(i, m4);
        if (F.ground && i === 0 && this.gullOne) { this.gullOne.position.copy(v); this.gullOne.quaternion.copy(q); }
      });
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- kayak
  async _kayak(renderer) {
    const g = await loadGLB(renderer, 'assets/models/v3/kayak.glb').catch(() => null);
    if (!g) return;
    const k = g.scene.clone(true);
    k.name = 'kayak';
    k.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    this.kayak = k;
    this.kayakHull = k.getObjectByName('kayak-hull');
    this.kayakPaddle = k.getObjectByName('paddle');
    this.kayakPaddler = k.getObjectByName('paddler');
    if (this.kayakHull) this.kayakHull.userData.scaleFrame = 'local';
    // Route: up the east side of the lower and middle inlet, 250 m off the shore line of the path (illustrative).
    this.kayakS = this.site.L * 0.36;
    this.kayakDir = 1;
    this.group.add(k);
    this.stepKayak(0);
  }

  /** About 1.4 m/s (a steady touring pace), one stroke a second; turns back at the ends of its route. */
  stepKayak(dt) {
    if (!this.kayak) return;
    const site = this.site;
    this.kayakS += this.kayakDir * 1.4 * dt;
    const lo = site.L * 0.3, hi = site.L * 0.55;
    if (this.kayakS > hi) this.kayakDir = -1;
    if (this.kayakS < lo) this.kayakDir = 1;
    const f = site.frame(this.kayakS);
    let off = 260;
    for (let k = 0; k < 8 && site.ground(f.x + f.nx * off, f.z + f.nz * off) > 0.5; k++) off -= 60;
    const x = f.x + f.nx * off, z = f.z + f.nz * off;
    this.kayak.position.set(x, WATER_Y - 0.1, z);
    this.kayak.rotation.set(0, Math.atan2(f.tx * this.kayakDir, f.tz * this.kayakDir), 0);
    const t = (this.kayakT = (this.kayakT || 0) + dt);
    if (this.kayakPaddle) this.kayakPaddle.rotation.z = Math.sin(t * Math.PI * 2 * 0.5) * 0.55;
    if (this.kayakPaddler) this.kayakPaddler.rotation.y = Math.sin(t * Math.PI * 2 * 0.5) * 0.12;
    this.kayak.position.y += Math.sin(t * 1.3) * 0.04;
  }

  // ---------------------------------------------------------------- meltwater streams + plume
  _meltwater() {
    const site = this.site;
    const g = new THREE.Group();
    g.name = 'meltwater';
    // Flow texture: pale streaks along v, scrolled by the motion system.
    const c = document.createElement('canvas');
    c.width = 32; c.height = 128;
    const x = c.getContext('2d');
    const r = mulberry32(31);
    x.fillStyle = 'rgb(120,150,150)'; x.fillRect(0, 0, 32, 128);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(225,236,232,${0.25 + r() * 0.5})`; x.fillRect(r() * 32, r() * 128, 2 + r() * 6, 6 + r() * 22); }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.meltTex = tex;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, color: 0xc8dcdc, polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 1.1 });
    // Streams: steepest descent from points along the drawn ice edge (re-traced when the year changes).
    this.streamMat = mat;
    this.streams = g;
    this.group.add(g);
    // Milky plume of rock flour spreading from the front over the fjord.
    this.plumeTex = radialTexture([[0, 'rgba(206,222,214,0.85)'], [0.5, 'rgba(176,204,198,0.45)'], [1, 'rgba(150,190,186,0)']]);
    this.plumeTex.wrapS = this.plumeTex.wrapT = THREE.ClampToEdgeWrapping;
    this.plume = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.plumeTex, transparent: true, depthWrite: false, roughness: 0.3, color: 0xffffff, opacity: 0.85 }));
    this.plume.name = 'meltwater-plume';
    this.plume.renderOrder = 1;
    this.group.add(this.plume);
    this.retraceMeltwater();
  }

  /** Streams and plume for the current front (illustrative paths, traced down the real DEM). */
  retraceMeltwater() {
    const site = this.site;
    const fr = this.ice.front;
    if (!fr) return;
    for (const m of [...this.streams.children]) { m.geometry.dispose(); this.streams.remove(m); }
    const starts = [];
    for (const ds of [400, 1500, 2800, 4200]) for (const side of [-1, 1]) {
      const f = site.frame(fr.s + ds);
      starts.push({ x: f.x + f.nx * side * 1250, z: f.z + f.nz * side * 1250 });
    }
    // Two streams out of the front onto the outwash (land-terminating years).
    for (const k of [-0.4, 0.35]) { const f = site.frame(fr.s - 30); starts.push({ x: f.x + f.nx * k * 1100, z: f.z + f.nz * k * 1100 }); }
    for (const s0 of starts) {
      const pts = [];
      let x = s0.x, z = s0.z;
      for (let i = 0; i < 90; i++) {
        const h = site.ground(x, z);
        pts.push(new THREE.Vector3(x, h + 1.2, z));
        if (h < 1) break;
        let bx = 0, bz = 0, bh = h;
        for (let a = 0; a < 8; a++) { const ax = x + Math.cos(a * 0.785) * 60, az = z + Math.sin(a * 0.785) * 60; const ah = site.ground(ax, az); if (ah < bh) { bh = ah; bx = ax; bz = az; } }
        if (bh >= h) break;
        x = bx; z = bz;
      }
      if (pts.length < 4) continue;
      const curve = new THREE.CatmullRomCurve3(pts);
      const n = Math.min(160, pts.length * 4);
      const P = [], UV = [], I = [];
      let len = 0;
      for (let i = 0; i <= n; i++) {
        const p = curve.getPoint(i / n), tg = curve.getTangent(i / n);
        const side = new THREE.Vector3(-tg.z, 0, tg.x).normalize().multiplyScalar(9);
        if (i) len += p.distanceTo(curve.getPoint((i - 1) / n));
        for (const sgn of [-1, 1]) { const q = p.clone().addScaledVector(side, sgn); q.y = site.ground(q.x, q.z) + 1.2; P.push(q.x, q.y, q.z); UV.push(sgn < 0 ? 0 : 1, len / 40); }
        if (i) { const a = (i - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      geo.setIndex(I);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.streamMat);
      m.name = 'meltwater-stream';
      m.userData.noOutline = true;
      m.receiveShadow = true;
      this.streams.add(m);
    }
    const f = site.frame(fr.s - 1400);
    this.plume.position.set(f.x, WATER_Y + 0.25, f.z);
    this.plume.scale.set(1500, 1, 1500);
    this.plume.visible = site.ground(f.x, f.z) < 1 || fr.onWater;
  }

  stepMeltwater(dt) {
    this.meltTex.offset.y -= dt * 0.08;
    this.plume.rotation.y += dt * 0.004;
  }

  // ---------------------------------------------------------------- survey flags at the dated fronts
  async _flags(renderer) {
    const g = await loadGLB(renderer, 'assets/models/v3/survey-flag.glb').catch(() => null);
    this.flags = [];
    this.flagTags = [];
    if (!g) return;
    for (const a of this.ice.anchors) {
      const flag = g.scene.clone(true);
      flag.name = `survey-flag-${a.year}`;
      flag.userData.year = a.year;
      const cloth = flag.getObjectByName('flag-cloth');
      const panel = flag.getObjectByName('flag-panel');
      if (panel) {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 64;
        const x = c.getContext('2d');
        x.fillStyle = '#fff4e8'; x.fillRect(0, 0, 128, 64);
        x.fillStyle = '#160b02'; x.font = '700 40px "Atkinson Hyperlegible", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(a.year), 64, 34);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        panel.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.map = t; m.material.needsUpdate = true; } });
      }
      flag.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      if (cloth) cloth.userData.rest = cloth.rotation.clone();
      flag.userData.cloth = cloth;
      flag.userData.restSize = [0.308, 1.5, 0.03];
      const tag = yearTag(a.year);
      tag.name = `year-tag-${a.year}`;
      tag.userData.year = a.year;
      this.group.add(flag);
      this.flags.push(flag);
      this.flagTags.push(tag);
    }
    for (const tag of this.flagTags) this.group.add(tag); // tags after the flags: a flag is the first root in the graph
    this.placeFlags();
  }

  /** Each flag stands on the shore beside the dated front, along the valley path (lower bounds). */
  placeFlags(frontAt = (y) => this.ice.frontAt(y)) {
    const site = this.site;
    this.flags.forEach((flag, i) => {
      const fr = frontAt(flag.userData.year);
      let off = 0;
      for (let k = 0; k < 40 && site.ground(fr.x + fr.nx * off, fr.z + fr.nz * off) < 2.5; k++) off += 40;
      const x = fr.x + fr.nx * (off + 8), z = fr.z + fr.nz * (off + 8);
      const y = site.surfaceY(x, z);
      flag.position.set(x, y, z);
      flag.rotation.y = Math.atan2(fr.tx, fr.tz);
      this.flagTags[i].position.set(x, y + 1.6, z);
    });
  }

  /** Wind on the flag cloth (illustrative gusts). */
  stepFlags(dt) {
    const t = (this.flagT = (this.flagT || 0) + dt);
    this.flags.forEach((f, i) => {
      const c = f.userData.cloth;
      if (!c?.userData.rest) return;
      c.rotation.y = c.userData.rest.y + Math.sin(t * 5.2 + i) * 0.22 + Math.sin(t * 1.3 + i * 2) * 0.12;
      c.rotation.x = c.userData.rest.x + Math.sin(t * 7.1 + i) * 0.05;
    });
  }
}

export { BASE, UP };
