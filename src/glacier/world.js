/**
 * world.js — builds the living Muir Inlet for the v3 shell: the real terrain
 * (site.js), the drawn ice (ice.js), the forest (forest.js), the landforms
 * (landforms.js) and the moving parts (life.js); registers every catalog
 * object (content/objects.json) with the inspect system and every motion
 * system with the motion layers; owns the year (time slider), the 1941 print
 * held up at the photo station, the measuring line, and following the kayak.
 * @module glacier/world
 */
import * as THREE from 'three';
import { MuirSite, WATER_Y } from './site.js';
import { GlacierIce } from './ice.js';
import { InletLife } from './life.js';
import { MuirForest, buildTransect } from './forest.js';
import { Landforms } from './landforms.js';
import { BASE, loadGLB } from './loaders.js';
import { measureBetween, nearestAlong, km } from '../systems/flowline.js';
import { pastAmount, transitionYear, timeLabel, isAnchorYear, GROUND_LABEL } from '../systems/time-front.js';
import { announce } from '../a11y/announcer.js';

/** A rig view with the camera at `eye` looking at `center` (both [x, y, z]). */
export function lookView(eye, center) {
  const dx = eye[0] - center[0], dy = eye[1] - center[1], dz = eye[2] - center[2];
  const r = Math.hypot(dx, dy, dz) || 1;
  return { target: [...center], radius: r, theta: Math.atan2(dx, dz), phi: Math.acos(THREE.MathUtils.clamp(dy / r, -1, 1)) };
}

export class MuirWorld {
  constructor(app, content) {
    this.app = app;
    this.content = content;
    this.anchors = content.modules.anchors;
    this.year = 1941;
    this.yearAnim = null;
    this.follow = null;
  }

  async build() {
    const app = this.app;
    const r = app.engine.renderer;
    const site = (this.site = new MuirSite(app));
    await site.load(this.content);
    this.station = this._station();
    const ice = (this.ice = new GlacierIce(site, this.anchors));
    await ice.build(r);
    ice.setYear(this.year);
    const life = (this.life = new InletLife(site, ice));
    life.stationAt = this.station;
    await life.build(r);
    const forest = (this.forest = new MuirForest(site));
    forest.anchors = this.anchors;
    await forest.build(r, { impostorFar: app.engine.quality.presetDef.features?.impostorFar ?? 250 });
    this.showcase = forest.showcaseTree(0);
    const land = (this.land = new Landforms(site, ice));
    land.build({ station: this.station });
    this.transect = await buildTransect(r, site, this.transectAt, forest);
    await this._stations();
    this._pathLine();
    // Pick shapes go last in the scene graph: a catalog object's first root (its scale reference) comes before them.
    this.pickGroup = new THREE.Group();
    this.pickGroup.name = 'pick-shapes';
    this._forestPicks();
    this._cloudPicks();
    this.print = new PhotoPrint(app.engine.camera);
    const scene = app.engine.scene;
    for (const g of [ice.group, land.group, life.group, forest.group, this.showcase, this.transect.group, this.stationGroup, this.pathGroup, this.print.mesh, this.pickGroup]) scene.add(g);
    this._yearChip();
    this.setYear(this.year, { animate: false });
    site.onTilesSettled = () => this._reground();
    site.onFineGrid = () => this._reground();
    this._register();
    this._motion();
    return this;
  }

  // ------------------------------------------------------------ places
  /** The photo station: approximate (the White Thunder Ridge camera station is not published). */
  _station() {
    const site = this.site;
    let best = { x: -5000, z: -9000, y: site.ground(-5000, -9000) };
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
      const x = -5000 + i * 300, z = -9000 + j * 300;
      const y = site.ground(x, z);
      if (y <= 450 && y > best.y) best = { x, z, y };
    }
    const look = new THREE.Vector3(-2000 - best.x, 0, -14000 - best.z).normalize();
    // The transect runs from the station along the gentlest of eight directions (away from the view).
    let yaw = 0, bestD = Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      if (dx * look.x + dz * look.z > 0.2) continue;
      const d = Math.abs(site.heightAt(best.x + dx * 24, best.z + dz * 24) - best.y) + Math.abs(site.heightAt(best.x + dx * 12, best.z + dz * 12) - best.y);
      if (d < bestD) { bestD = d; yaw = a; }
    }
    this.transectAt = { x: best.x + Math.cos(yaw) * 3, z: best.z + Math.sin(yaw) * 3, yaw };
    return { ...best, look };
  }

  async _stations() {
    const g = await loadGLB(this.app.engine.renderer, 'assets/models/v3/photo-station.glb').catch(() => null);
    this.stationGroup = new THREE.Group();
    this.stationGroup.name = 'photo-stations';
    this.stations = {};
    if (!g) return;
    const S = this.station;
    const side = new THREE.Vector3(-S.look.z, 0, S.look.x);
    ['1941', '1950', '2004'].forEach((y, i) => {
      const m = g.scene.clone(true);
      m.name = `photo-station-${y}`;
      const x = S.x + side.x * (i - 1) * 1.6, z = S.z + side.z * (i - 1) * 1.6;
      m.position.set(x, this.site.surfaceY(x, z), z);
      m.rotation.y = Math.atan2(S.look.x, S.look.z);
      m.userData.ground = [x, z];
      m.userData.scaleFrame = 'local';
      m.traverse((c) => { if (c.isMesh) c.castShadow = true; });
      this.stationGroup.add(m);
      this.stations[y] = m;
    });
  }

  /** Props on the ground follow the finest loaded surface (streamed tiles, then the 30 m grid). */
  _reground() {
    const site = this.site;
    for (const m of Object.values(this.stations || {})) { const [x, z] = m.userData.ground; m.position.y = site.surfaceY(x, z); }
    this.transect?.reground();
    this.life.placeFlags();
    if (this.showcase) this.showcase.position.y = site.surfaceY(this.showcase.position.x, this.showcase.position.z) - 0.4;
  }

  // ------------------------------------------------------------ measuring path (Module 3)
  _pathLine() {
    const site = this.site;
    this.pathGroup = new THREE.Group();
    this.pathGroup.name = 'measuring-path';
    const lift = (p) => new THREE.Vector3(p.x, Math.max(site.ground(p.x, p.z), 0) + 30, p.z);
    const curve = new THREE.CatmullRomCurve3(site.points.map(lift), false, 'centripetal');
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 45, 6, false), new THREE.MeshBasicMaterial({ color: 0xff8a2a, fog: false }));
    tube.name = 'measuring-path-line';
    tube.userData.marker = { label: 'Orange measuring path' };
    tube.raycast = () => {};
    this.pathGroup.add(tube);
    const marker = (letter, color) => {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 120;
      const x = c.getContext('2d');
      x.fillStyle = '#0f1924'; x.beginPath(); x.arc(48, 46, 44, 0, 6.28); x.fill();
      x.fillStyle = color; x.beginPath(); x.arc(48, 46, 38, 0, 6.28); x.fill();
      x.fillStyle = '#0f1924'; x.beginPath(); x.moveTo(34, 86); x.lineTo(48, 118); x.lineTo(62, 86); x.fill();
      x.fillStyle = '#0f1924'; x.font = '700 48px "Atkinson Hyperlegible", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, 48, 48);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true }));
      s.center.set(0.5, 0);
      s.scale.set(0.036, 0.045, 1);
      s.renderOrder = 9;
      s.visible = false;
      s.userData.marker = { label: `Measuring marker ${letter}` };
      s.raycast = () => {};
      this.pathGroup.add(s);
      return s;
    };
    this.markerA = marker('A', '#ffd166');
    this.markerB = marker('B', '#7fb4ff');
    this.pathGroup.visible = false;
  }

  setPathVisible(on) { this.pathGroup.visible = Boolean(on); }

  /** Markers at along-path distances (m); returns the measurement. */
  setMeasure(sA, sB) {
    const m = measureBetween(this.site.points, sA, sB);
    this.measure = { sA, sB, ...m };
    for (const [mk, p] of [[this.markerA, m.a], [this.markerB, m.b]]) { mk.visible = true; mk.position.set(p.x, this.site.ground(p.x, p.z) + 60, p.z); }
    return this.measure;
  }
  clearMeasure() { this.measure = null; this.markerA.visible = this.markerB.visible = false; }

  /** A terrain point under a screen point, snapped to the measuring path (or null when far from it). */
  pickAlong(clientX, clientY) {
    const cam = this.app.engine.camera;
    const r = this.app.shell.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), cam);
    const targets = [this.site.water, ...(this.site.tilesReady ? [...this.site.leaves] : [this.site.base])];
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const n = nearestAlong(this.site.points, hit.point.x, hit.point.z);
    return n.d > 5000 ? null : n;
  }

  // ------------------------------------------------------------ pick shapes for the forest and clouds
  _forestPicks() {
    const forest = this.forest, site = this.site;
    const cell = 300;
    const build = (kinds, name) => {
      const map = new Map();
      for (const k of kinds) {
        const K = forest.kinds[k];
        for (let i = 0; i < K.s.length; i++) {
          const key = `${Math.floor(K.pos[i * 2] / cell)},${Math.floor(K.pos[i * 2 + 1] / cell)}`;
          const c = map.get(key) || { n: 0, s: Infinity, top: 0 };
          c.n++; c.s = Math.min(c.s, K.s[i]); c.top = Math.max(c.top, k === 2 ? 3 : 24);
          map.set(key, c);
        }
      }
      const cells = [...map.entries()].filter(([, c]) => c.n >= 4).map(([key, c]) => { const [i, j] = key.split(',').map(Number); return { x: (i + 0.5) * cell, z: (j + 0.5) * cell, ...c }; });
      const geo = new THREE.BoxGeometry(cell * 0.9, 1, cell * 0.9);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ visible: false }), cells.length);
      im.name = name;
      im.userData.cells = cells;
      im.userData.noOutline = true;
      im.userData.proxy = true;
      im.frustumCulled = false;
      this.pickGroup.add(im);
      return im;
    };
    this.forestPick = build([0, 1], 'forest-pick');
    this.alderPick = build([2], 'alder-pick');
    this._placeForestPicks();
    void site;
  }

  _placeForestPicks() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const f = this.forest;
    for (const [im, alder] of [[this.forestPick, false], [this.alderPick, true]]) {
      const limit = alder ? f.alderCover * f.sMax + 0.25 * f.sMax : f.cover * f.sMax;
      im.userData.cells.forEach((c, i) => {
        const on = c.s <= limit;
        const g = this.site.ground(c.x, c.z);
        v.set(c.x, g + c.top * 0.5, c.z);
        sc.set(1, on ? c.top : 0.0001, 1);
        im.setMatrixAt(i, m4.compose(v, q, sc));
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.computeBoundingBox();
    }
  }

  _cloudPicks() {
    const L = this.life;
    if (!L.clouds) return;
    const n = L.cloudData.length;
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 6), new THREE.MeshBasicMaterial({ visible: false }), n);
    im.name = 'cloud-pick';
    im.frustumCulled = false;
    im.userData.noOutline = true;
    im.userData.proxy = true;
    this.cloudPick = im;
    this.pickGroup.add(im);
    this._placeCloudPicks();
  }
  _placeCloudPicks() {
    if (!this.cloudPick) return;
    const L = this.life, m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const attr = L.clouds.geometry.attributes.cloud;
    for (let i = 0; i < L.cloudData.length; i++) {
      L.clouds.getMatrixAt(i, m4);
      v.setFromMatrixPosition(m4);
      sc.set(attr.getY(i) * 0.75, attr.getZ(i) * 0.8, attr.getY(i) * 0.75);
      v.y += attr.getZ(i) * 0.1;
      this.cloudPick.setMatrixAt(i, m4.compose(v, q, sc));
    }
    this.cloudPick.instanceMatrix.needsUpdate = true;
    this.cloudPick.computeBoundingSphere();
  }

  // ------------------------------------------------------------ year (time slider)
  /** Set the 3D year. Anchor years are dated; years between are illustrative (labelled). */
  setYear(year, { animate = true } = {}) {
    const reduced = this.app.motionPrefs?.reduced;
    if (animate && !reduced && Math.abs(year - this.year) > 0.5) {
      this.yearAnim = { from: this.year, to: year, t: 0, dur: Math.min(4, 0.8 + Math.abs(year - this.year) / 20) };
      return;
    }
    this.yearAnim = null;
    this._applyYear(year, true);
  }

  _applyYear(year, final) {
    this.year = year;
    const past = pastAmount(year, this.anchors);
    this.site.applyGrade(past);
    this.ice.setYear(year);
    this.land.setYear(year);
    this.forest.setYear(year);
    this._placeForestPicks();
    if (final) { this.life.retraceMeltwater(); this.site.shadowsDirty(); this._transectYear(year); }
    this._chipText(year);
    if (final) { announce(`3D view: ${this._chip.textContent}`); this.onYear?.(year); }
  }

  /** Succession plants appear on the ridge in their documented order (timing illustrative; the ridge was bare in 1950). */
  _transectYear(year) {
    const t = this.transect;
    if (!t) return;
    t.moss.visible = year >= 1956;
    for (const m of t.dryas) m.visible = year >= 1962;
    for (const m of t.fireweed) m.visible = year >= 1966;
    for (const m of t.alder) m.visible = year >= 1976;
  }

  _yearChip() {
    const el = document.createElement('p');
    el.className = 'gtm-year';
    el.dataset.ui = 'year-chip';
    el.setAttribute('aria-hidden', 'true');
    this.app.shell.root.appendChild(el);
    this._chip = el;
  }
  _chipText(year) {
    const y = Math.round(year);
    const dated = isAnchorYear(y, this.anchors);
    const last = Math.max(...this.anchors.map((a) => a.year));
    // After the last dated photo (the bottom-bar timeline runs to today): no dated front, so it stays at the 2004 position.
    const after = !dated && y > last;
    this._chip.textContent = dated ? `3D view: ${y} · dated photo year` : after ? `3D view: ${y} · after the ${last} photo: front kept at its ${last} position (not dated)` : `3D view: ${y} · between dated years: illustrative`;
    this._chip.title = after ? `${y}. No dated photo after ${last}: the ice front stays where the ${last} photo puts it. ${GROUND_LABEL}.` : timeLabel(year, this.anchors);
    this._chip.dataset.dated = String(dated);
  }

  // ------------------------------------------------------------ follow the kayak (carry-over "kayak travel")
  followKayak(on) {
    this.follow = on ? 'kayak' : null;
    if (on) {
      const k = this.life.kayak.position;
      this.app.rig.flyTo({ target: [k.x, k.y + 1, k.z], radius: 16, theta: this.life.kayak.rotation.y + Math.PI + 0.5, phi: 1.32 }, 1.2);
      const stop = this.app.rig.on('interact', (kind) => { if (kind === 'move' || kind === 'pan' || kind === 'reset') { this.follow = null; stop(); } });
    }
  }

  // ------------------------------------------------------------ catalog
  _register() {
    const I = this.app.inspect;
    const site = this.site, ice = this.ice, life = this.life, land = this.land;
    const front = () => ice.front;
    const v = (eye, center) => lookView(eye, center);
    const P = (x, z, up = 0) => [x, site.ground(x, z) + up, z];
    const fr = (ds, a, up) => { const f = site.frame(front().s + ds); return P(f.x + f.nx * a * 1100, f.z + f.nz * a * 1100, up); };
    I.register('muir-terminus', [ice.terminusBand], { frame: { view: () => v(fr(-2600, 0.3, 520), fr(350, 0, 60)) } });
    I.register('calving-cliff', [ice.cliff, ice.calving.slab], { frame: { view: () => v(fr(-1000, -0.35, 120), fr(0, 0, 40)) } });
    I.register('seracs', ice.seracRoots, { frame: { view: () => { const p = ice.seracOne.position; return v([p.x - front().tx * 140 + front().nx * 90, p.y + 45, p.z - front().tz * 140 + front().nz * 90], [p.x, p.y + 8, p.z]); } } });
    I.register('icebergs', life.bergRoots, { frame: { view: () => { const p = life.bergOne.position; return v([p.x + 40, p.y + 14, p.z + 46], [p.x, p.y + 2, p.z]); } } });
    I.register('brash-ice', [ice.brashOne, ...ice.brashSets], { frame: { view: () => { const p = ice.brashOne.position; return v([p.x + 3.2, p.y + 2.2, p.z + 3.6], [p.x, p.y + 0.2, p.z]); } } });
    I.register('crevasses', [ice.crevasseBand], { frame: { view: () => v(fr(1800, 0.9, 900), fr(3200, 0, 200)) } });
    I.register('ice-tongue', [ice.tongue], { frame: { view: () => v(fr(2500, 3.6, 2200), fr(4200, 0, 300)) } });
    I.register('accumulation-zone', [land.proxies.accumulation], { frame: { view: () => { const p = land.peaks[0]; return v(P(p.x + 6500, p.z + 9000, 2600), P(p.x, p.z, -300)); } } });
    I.register('trimline', [land.proxies.trimline], { frame: { view: () => v(fr(4000, -2.2, 520), fr(4600, 1.9, 0)) } });
    I.register('moraine', [land.moraine], { frame: { view: () => v(fr(1200, 1.9, 380), fr(2600, 0.9, 0)) } });
    I.register('nunatak', [land.proxies.nunatak], { frame: { view: () => { const p = land.peaks[0]; return v(P(p.x + 2600, p.z + 3400, 500), P(p.x, p.z, -150)); } } });
    I.register('bare-bedrock', [land.proxies.bedrock], { frame: { view: () => v(fr(-1500, -2.6, 260), fr(-800, 2.4, 0)) } });
    I.register('muir-inlet', [land.proxies.inlet], { frame: { view: () => { const a = site.frame(site.L * 0.48), b = site.frame(site.L * 0.72); return v([a.x - a.nx * 400, 900, a.z - a.nz * 400], [b.x, 0, b.z]); } } });
    I.register('water-swell', [site.water], { frame: { view: () => { const k = life.kayak.position; return v([k.x + 22, WATER_Y + 7, k.z + 18], [k.x - 10, WATER_Y, k.z - 8]); } } });
    I.register('meltwater', [life.streams, life.plume], { frame: { view: () => v(fr(-3200, -1.6, 900), fr(-900, 0, 0)) } });
    const R = site.landmarks.riggs;
    I.register('riggs-glacier', [land.proxies.riggs], { frame: { view: () => v(P(R.x - 5200, R.z + 3800, 1400), P(R.x, R.z, 0)) } });
    const S = this.station;
    I.register('white-thunder-ridge', [land.proxies.ridge], { frame: { view: () => v(P(S.x + S.look.x * -1800 + 1500, S.z - S.look.z * 1800 + 900, 700), P(S.x, S.z, 0)) } });
    for (const y of ['1941', '1950', '2004']) if (this.stations[y]) I.register(`photo-${y}`, [this.stations[y]]);
    const flagRoots = [...life.flags, ...life.flagTags];
    I.register('survey-marker', flagRoots, {
      frame: {
        view: () => {
          const it = I.items.get('survey-marker');
          const yr = it?.active?.userData?.year ?? 1941;
          const f = life.flags.find((x) => x.userData.year === yr) || life.flags[0];
          const p = f.position, d = new THREE.Vector3(Math.sin(f.rotation.y), 0, Math.cos(f.rotation.y));
          return v([p.x - d.x * 3.2 + d.z * 1.2, p.y + 1.9, p.z - d.z * 3.2 - d.x * 1.2], [p.x, p.y + 0.9, p.z]);
        },
      },
    });
    I.register('moss', [this.transect.moss], { frame: { view: () => { const m = this.transect.moss.position; return v([m.x + 3.2, site.surfaceY(m.x, m.z) + 2.4, m.z + 2.2], [m.x, site.surfaceY(m.x, m.z), m.z]); } } });
    I.register('fireweed', this.transect.fireweed);
    I.register('dryas', this.transect.dryas);
    I.register('alder', [...this.transect.alder, this.alderPick], { frame: { view: () => { const p = this.transect.alder[0].position; return v([p.x + 5.5, p.y + 2.6, p.z + 4.5], [p.x, p.y + 1.3, p.z]); } } });
    I.register('forest', [this.showcase, this.forestPick], { frame: { view: () => { const p = this.showcase.position; return v([p.x + 30, p.y + 9, p.z + 26], [p.x, p.y + 13, p.z]); } } });
    if (this.cloudPick) I.register('clouds', [this.cloudPick], { frame: { view: () => { const c = life.cloudData[0]; const m4 = new THREE.Matrix4(); life.clouds.getMatrixAt(0, m4); const p = new THREE.Vector3().setFromMatrixPosition(m4); void c; return v([p.x + 4200, p.y - 300, p.z + 5200], [p.x, p.y, p.z]); } } });
    I.register('seabirds', [life.gullOne, ...life.gullFlocks], { frame: { view: () => { const p = life.gullOne.position; return v([p.x + 4, p.y + 1.2, p.z + 4.5], [p.x, p.y, p.z]); } } });
    if (life.kayakHull) I.register('kayak', [life.kayakHull, life.kayakPaddler, life.kayakPaddle].filter(Boolean), { frame: { view: () => { const p = life.kayak.position; return v([p.x + 7, p.y + 3, p.z + 8], [p.x, p.y + 0.4, p.z]); } } });
    I.register('terrain', [land.terrainPick], { frame: { view: () => v([14000, 14000, 30000], [0, 300, -2000]) } });
  }

  /** Pick shapes tint while hovered, focused or open (they are invisible at rest). */
  _highlight() {
    const I = this.app.inspect;
    const on = new Set([I.hovered, I.focused, I.selected, I.cued].filter(Boolean));
    for (const [id, it] of I.items) {
      for (const root of it.roots) {
        if (!root.userData.proxy || root.userData.noHighlight || root.isInstancedMesh) continue;
        root.material.visible = on.has(id);
      }
    }
  }

  // ------------------------------------------------------------ motion systems (plan 10 §5)
  _motion() {
    const M = this.app.motion, life = this.life, ice = this.ice, site = this.site;
    M.add({ id: 'clouds', layer: 'sky', label: 'illustrative', objects: ['clouds'], description: 'Soft cloud banks drift over the peaks with the wind (speed illustrative).', update: (dt) => { life.stepClouds(dt); this._placeCloudPicks(); } });
    const shadowOff = new THREE.Vector2();
    M.add({ id: 'cloud-shadows', layer: 'sky', label: 'illustrative', objects: ['clouds'], description: 'Cloud shadows cross the mountains and the water.', update: (dt) => { shadowOff.x += dt * 8; shadowOff.y += dt * 2.8; site.U.uCloudOffset.value.copy(shadowOff); } });
    M.add({ id: 'water-swell', layer: 'environment', label: 'illustrative', objects: ['water-swell'], description: 'Swell and chop scroll across the fjord.', update: (dt) => { if (site.swell) { site.swell.offset.x += dt * 0.0016; site.swell.offset.y += dt * 0.0011; site.chop.offset.x -= dt * 0.012; site.chop.offset.y += dt * 0.017; } } });
    M.add({ id: 'icebergs', layer: 'environment', label: 'illustrative', objects: ['icebergs'], description: 'Icebergs drift down the inlet, turn and bob.', update: (dt) => life.stepBergs(dt) });
    M.add({ id: 'brash-ice', layer: 'environment', label: 'illustrative', objects: ['brash-ice'], description: 'Brash ice bobs in front of a calving front.', update: (dt) => ice.stepBrash(dt) });
    M.add({ id: 'snow-drift', layer: 'environment', label: 'illustrative', objects: ['clouds'], description: 'Snow blows off the high ridges.', update: (dt) => life.stepSnow(dt) });
    M.add({ id: 'meltwater', layer: 'environment', label: 'illustrative', objects: ['meltwater'], description: 'Meltwater runs down the streams; the milky plume turns slowly.', update: (dt) => life.stepMeltwater(dt) });
    M.add({ id: 'gulls', layer: 'agents', label: 'illustrative', objects: ['seabirds'], description: 'Gulls circle, flap and glide.', update: (dt) => life.stepGulls(dt) });
    M.add({ id: 'kayak', layer: 'agents', label: 'illustrative', objects: ['kayak'], description: 'A sea kayak paddles up and down the inlet at a touring pace.', update: (dt) => life.stepKayak(dt) });
    M.add({ id: 'calving', layer: 'objects', label: 'time-lapse', objects: ['calving-cliff'], holdWithCard: false, description: 'Blocks of ice break off the front and fall into the water (far more often than at a real front).', update: (dt) => ice.stepCalving(dt) });
    M.add({ id: 'flags', layer: 'objects', label: 'illustrative', objects: ['survey-marker'], description: 'Wind moves the survey flag cloth.', update: (dt) => life.stepFlags(dt) });
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const app = this.app, cam = app.engine.camera, rig = app.rig;
    if (this.yearAnim) {
      const a = this.yearAnim;
      a.t += dt;
      const y = transitionYear(a.from, a.to, a.t, a.dur);
      const done = a.t >= a.dur;
      if (done) this.yearAnim = null;
      this._applyYear(y, done);
    }
    if (this.follow === 'kayak' && this.life.kayak && !rig.anim) {
      const k = this.life.kayak.position;
      rig.state.target.set(k.x, k.y + 1, k.z);
    }
    // Walking scales with the view: a few metres a second near the ground, faster from the air.
    rig.walkSpeed = THREE.MathUtils.clamp(rig.state.radius * 0.6, 3.2, 3000);
    this.site.update();
    this.forest.update(cam);
    this.print.update(cam);
    this._highlight();
  }

  credits() { return this.site.credits(); }
}

/** The historic print held up in front of the camera, wiped against the live 3D view (in-world, no panel). */
export class PhotoPrint {
  constructor(camera) {
    this.camera = camera;
    this.split = 0.5;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, split: { value: 0.5 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D map; uniform float split; varying vec2 vUv;
        void main() {
          if (vUv.x > split) discard;
          vec4 c = texture2D(map, vUv);
          float edge = smoothstep(split - 0.004, split, vUv.x);
          vec3 col = mix(c.rgb * vec3(1.0, 0.97, 0.9), vec3(1.0, 0.82, 0.4), edge);
          float border = step(vUv.x, 0.012) + step(0.988, vUv.y) + step(vUv.y, 0.012);
          col = mix(col, vec3(0.96, 0.94, 0.9), clamp(border, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1060 / 1600), mat);
    this.mesh.name = 'photo-print-held-up';
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
    this.mesh.userData.noOutline = true;
    this._tex = {};
  }
  async show(anchor) {
    if (!this._tex[anchor.id]) this._tex[anchor.id] = await new THREE.TextureLoader().loadAsync(`${BASE}${anchor.photo}`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; return t; });
    this.mesh.material.uniforms.map.value = this._tex[anchor.id];
    this.anchor = anchor;
    this.mesh.visible = true;
  }
  hide() { this.mesh.visible = false; this.anchor = null; }
  setSplit(v) { this.split = v; this.mesh.material.uniforms.split.value = v; }
  update(cam) {
    if (!this.mesh.visible) return;
    const d = Math.max(cam.near * 3, 0.6);
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.62;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(dir, cam.up).normalize();
    this.mesh.position.copy(cam.position).addScaledVector(dir, d).addScaledVector(right, -h * 0.12);
    this.mesh.quaternion.copy(cam.quaternion);
    const w = h * 1600 / 1060;
    this.mesh.scale.set(w, w, 1);
  }
}

export { km };
