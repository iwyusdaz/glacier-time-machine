/**
 * v2 in-world interaction for Muir Inlet (design/art-bible.md §8):
 *  - glacier-blue viewpoint rings (inlet, photo spot, Muir, Riggs) with camera
 *    glide, hover tooltips, WASD pan (arrows/+/- keep the v1 orbit keys);
 *  - photo spot: the 1941 print held up in the view, swiped against the live 3D;
 *  - measuring line dragged along the valley on the terrain (snaps to the DEM path);
 *  - living time transition with the on-screen "illustrative, not measured" label.
 * Every action has a button/keyboard path; text mode keeps the v1 widgets.
 * The shared manager is disabled whenever a tool owns the pointer.
 * @module scenes/muir-world
 */
import * as THREE from 'three';
import { InWorldInteractionManager } from '../v2/in-world-interaction.js';
import { cumulative, measureBetween, km } from '../systems/flowline.js';
import { timeLabel, transitionYear, frontForYear } from '../systems/time-front.js';
import { announce } from '../a11y/announcer.js';

const BLUE = 0x7fb7d6;
const HALO = 0x0f1924;
const BASE = import.meta.env.BASE_URL || './';

/** Along-path distance (m) of the path vertex nearest to scene (x, z). */
export function nearestAlong(points, x, z) {
  const cum = cumulative(points);
  let best = Infinity, s = 0;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - x, points[i].z - z);
    if (d < best) { best = d; s = cum[i]; }
  }
  return { s, d: best };
}

export class MuirWorld {
  constructor({ engine, site, dressing, content, motion, stage }) {
    this.engine = engine;
    this.site = site;
    this.dressing = dressing;
    this.content = content;
    this.motion = motion;
    this.stage = stage;
    this.points = content.flowline.points;
    this.tool = null;
    this.yearAnim = null;
    this._build();
  }

  _build() {
    const { engine, site } = this;
    const world = new InWorldInteractionManager({
      canvas: engine.canvas, camera: engine.camera, scene: this.dressing.group,
      bounds: [-1e7, 1e7, -1e7, 1e7], reducedMotion: this.motion.reduced,
    });
    // The v1 OrbitController owns drag-look and arrow keys; the manager does hover, rings, glides.
    world._applyLookAngles = () => {};
    world.keys = new Set();
    world.keys.add = function add() { return this; };
    const glideTo = world.glideTo.bind(world);
    world.glideTo = (...args) => { glideTo(...args); if (!world.glide) this._syncOrbit(); };
    this.world = world;

    const lm = site.landmarks;
    const P = this.dressing.photoSpot();
    // Review A3: a dark #0F1924 halo under each light ring keeps it >= 3:1
    // against both water and snow (one shared geometry/material, +1 call per ring).
    const haloGeo = new THREE.RingGeometry(0.2, 0.46, 32).rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({ color: HALO, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const ringAt = (id, label, x, z, cam, hint = 'Click to glide here', scale = 900) => {
      const y = this.dressing.ground(x, z) + 8;
      const r = world.addHotspotRing([x, y, z], { id, label, hint, color: BLUE, ...cam });
      r.scale.setScalar(scale);
      for (const m of r.children) { m.material.depthTest = false; m.renderOrder = 5; }
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = 0.01;
      halo.renderOrder = 4;
      halo.raycast = () => {};
      r.add(halo);
      return r;
    };
    const view = (tx, tz, ux, uz, h, d) => {
      const ty = this.dressing.ground(tx, tz);
      const cx = tx + ux * d, cz = tz + uz * d;
      return { cameraPos: [cx, Math.max(ty, this.dressing.ground(cx, cz)) + h, cz], cameraTarget: [tx, ty, tz] };
    };
    this.rings = {
      inlet: ringAt('vp-inlet', 'Viewpoint: lower Muir Inlet', lm.inlet.x, lm.inlet.z, view(lm.inlet.x, lm.inlet.z - 4000, 0.3, 0.95, 2200, 7000)),
      photo: ringAt('vp-photo', 'Photo spot (approximate): hold up the 1941 print', P.x, P.z,
        { cameraPos: [P.x, P.y + 120, P.z], cameraTarget: P.lookAt, onClick: () => setTimeout(() => this.openPhotoSpot(), 50) }, 'Click to stand here'),
      muir: ringAt('vp-muir', 'Viewpoint: Muir Glacier (published coordinate)', lm.muir.x, lm.muir.z, view(lm.muir.x, lm.muir.z, 0.55, 0.85, 1800, 6500)),
      riggs: ringAt('vp-riggs', 'Viewpoint: Riggs Glacier (published coordinate)', lm.riggs.x, lm.riggs.z, view(lm.riggs.x, lm.riggs.z, -0.3, 0.95, 1500, 5500)),
    };
    // Review I3/V1: in-world year control. One ring at each dated front (the
    // placements come from frontForYear: published minimum retreat, illustrative,
    // not surveyed). Clicking glides to the "fronts" framing and drives the same
    // Module 3 time slider (onYearPick); the slider stays the keyboard equivalent.
    const vpF = site.viewpoints.front;
    const frontCam = vpF ? {
      cameraTarget: vpF.target,
      cameraPos: [
        vpF.target[0] + vpF.radius * Math.sin(vpF.phi) * Math.sin(vpF.theta),
        vpF.target[1] + vpF.radius * Math.cos(vpF.phi),
        vpF.target[2] + vpF.radius * Math.sin(vpF.phi) * Math.cos(vpF.theta),
      ],
    } : {};
    this.yearRings = this.content.modules.anchors.map((a, i) => {
      const f = this.dressing.frame(frontForYear(a.year, this.content.modules.anchors, this.dressing.L).s);
      return ringAt(`yr-${a.year}`, `${a.year} ice front (dated anchor; placement from the published minimum retreat, illustrative, not surveyed)`, f.x, f.z,
        { ...frontCam, onClick: () => this.onYearPick?.(i) }, `Click to set the 3D view to ${a.year} (keyboard: the time slider in Module 3)`, 650);
    });
    this.setYearRingsVisible(false);
    world.registerInteractive(this.dressing.ice, { id: 'ice', label: 'Glacier ice (illustrative tongue; front placed only at dated photo years)', hint: 'In Module 3, click a year ring at a dated front, or use the time slider', highlightColor: BLUE });
    world.registerInteractive(this.dressing.bergs, { id: 'bergs', label: 'Icebergs (illustrative)', hint: 'Calved ice drifting down the inlet', highlightColor: BLUE });
    world.registerInteractive(this.dressing.crowns, { id: 'forest', label: 'Spruce forest (illustrative succession, not mapped)', hint: 'Older ground was uncovered first', highlightColor: BLUE });

    // WASD pans the orbit target across the ground (arrows keep rotating the view).
    const keys = new Set();
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.closest('dialog'))) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
    this.keys = keys;

    // Review A2: the visual label is rewritten every frame of a transition, so it
    // is not a live region; its text is announced once when a transition ends.
    this.label = Object.assign(document.createElement('p'), { className: 'time-label', hidden: true });
    this.label.setAttribute('aria-hidden', 'true');
    this.stage.append(this.label);
    this.motion.onChange?.((reduced) => { world.reducedMotion = reduced; this.dressing.setReducedMotion(reduced); });
  }

  /** After a glide, hand the camera back to the OrbitController without a jump. */
  _syncOrbit() {
    const orbit = this.site.orbit;
    const cam = this.engine.camera;
    const t = this.world.target;
    orbit.target.copy(t);
    const off = cam.position.clone().sub(t);
    const r = THREE.MathUtils.clamp(off.length(), orbit.minRadius, orbit.maxRadius);
    orbit.spherical = { radius: r, theta: Math.atan2(off.x, off.z), phi: THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(off.y / off.length(), -1, 1)), orbit.minPhi, orbit.maxPhi) };
    orbit.update();
  }

  /** Glide to a ring by key (button / keyboard path). */
  goRing(key) {
    const h = this.world.items.get(`vp-${key}`);
    if (!h) return;
    this.world.glideTo(h.cameraPos, h.cameraTarget, 1.6);
    h.onClick?.(h);
  }

  update(dt) {
    const { world, site } = this;
    const gliding = Boolean(world.glide);
    world.update(dt, this.engine.clock.elapsedTime);
    if (gliding && !world.glide) this._syncOrbit();
    if (this.yearAnim) {
      const a = this.yearAnim;
      a.t += dt;
      const y = transitionYear(a.from, a.to, a.t, a.dur);
      this.dressing.setYear(y);
      this._showLabel(y);
      if (a.t >= a.dur) { this.yearAnim = null; this._announceLabel(); }
    }
    if (world.enabled && !world.glide && this.keys.size && !document.querySelector('dialog[open]')) {
      const orbit = site.orbit;
      let fx = 0, fz = 0;
      if (this.keys.has('KeyW')) fz -= 1;
      if (this.keys.has('KeyS')) fz += 1;
      if (this.keys.has('KeyA')) fx -= 1;
      if (this.keys.has('KeyD')) fx += 1;
      const th = orbit.spherical.theta;
      const sp = Math.max(300, orbit.spherical.radius * 0.5) * dt;
      orbit.target.x += (-Math.sin(th) * -fz + Math.cos(th) * fx) * sp;
      orbit.target.z += (-Math.cos(th) * -fz - Math.sin(th) * fx) * sp;
      orbit.target.y = this.dressing.ground(orbit.target.x, orbit.target.z);
      orbit.update();
      site._keepAboveGround();
    }
  }

  // ---------------- time transition ----------------
  /** Animate the living scene to `year` (snaps under reduced motion). */
  goYear(year) {
    // While the photo spot holds the 3D at today's ice, remember the requested
    // year (restored on close) and keep the label honest about the 3D state.
    if (this._photoPrev && this.tool === 'photo') {
      this._photoPrev.year = year;
      this._photoPrev.labelShown = true;
      this._showPhotoLabel();
      return;
    }
    const from = this.dressing.year;
    const dur = this.motion.reduced ? 0 : Math.min(4, 0.8 + Math.abs(year - from) / 20);
    if (dur === 0) { this.dressing.setYear(year); this._showLabel(year); this.yearAnim = null; this._announceLabel(); return; }
    this.yearAnim = { from, to: year, t: 0, dur };
  }

  /** One polite announcement of the 3D view's year label (transition end only). */
  _announceLabel() {
    if (!this.label.hidden && this.label.textContent) announce(`3D view: ${this.label.textContent}`);
  }

  _showLabel(year) {
    const a = this.content.modules.anchors;
    this.label.hidden = false;
    this.label.replaceChildren();
    const txt = timeLabel(year, a);
    const strong = document.createElement('strong');
    strong.textContent = String(Math.round(year));
    this.label.append(strong, document.createTextNode(txt.slice(String(Math.round(year)).length)));
  }

  hideLabel() { this.label.hidden = true; }

  /** Year rings exist only in Module 3. Layers hide them from both render and picking. */
  setYearRingsVisible(on) {
    for (const r of this.yearRings || []) r.traverse((o) => o.layers.set(on ? 0 : 1));
    this.yearRingsOn = Boolean(on);
  }

  // ---------------- photo spot: the 1941 print against today's view ----------------
  openPhotoSpot() {
    const a = this.content.modules.anchors[0];
    if (!this.photoEl) {
      const el = document.createElement('section');
      el.className = 'photo-spot';
      el.setAttribute('aria-labelledby', 'ps-h');
      el.innerHTML = `
        <h3 id="ps-h">Photo spot: 1941 print against today's view</h3>
        <div class="photo-spot-print"><img class="live" alt="Today's view from the photo spot (live 3D render)"><img class="print" alt=""></div>
        <p class="photo-spot-caption"></p>
        <label for="ps-range">Swipe: left part 1941 print, right part today's 3D view</label>
        <input type="range" id="ps-range" min="0" max="100" step="10" value="50">
        <div class="btn-row" role="group" aria-label="Photo spot presets">
          <button type="button" data-ps="100">All 1941</button><button type="button" data-ps="50">Half</button><button type="button" data-ps="0">All today</button>
          <button type="button" data-ps="close">Put the print away</button>
        </div>
        <p class="note">The photo spot is approximate: the exact White Thunder Ridge camera station is not published (unverified), so the print and the 3D view will not line up exactly. The 3D view shows the 2024 Sentinel-2 image on the real terrain.</p>`;
      this.stage.append(el);
      const range = el.querySelector('#ps-range');
      const print = el.querySelector('img.print');
      const set = (v) => {
        range.value = String(v);
        print.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
        range.setAttribute('aria-valuetext', `${v}% shows the 1941 print, ${100 - v}% shows today's view`);
      };
      range.addEventListener('input', () => set(+range.value));
      for (const b of el.querySelectorAll('[data-ps]')) {
        b.addEventListener('click', () => {
          if (b.dataset.ps === 'close') { this.closePhotoSpot(); return; }
          set(+b.dataset.ps); announce(b.textContent);
        });
      }
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closePhotoSpot(); });
      this.photoEl = el;
      this.photoSet = set;
    }
    const el = this.photoEl;
    const print = el.querySelector('img.print');
    print.src = `${BASE}${a.photo}`;
    print.alt = `1941 print: ${a.alt}`;
    el.querySelector('.photo-spot-caption').textContent = `13 August 1941. Photograph by ${a.photographer} (USGS, public domain), held up at the photo spot.`;
    // Reviews I4/H1: the 3D is set to today's ice (2004 anchor) for the
    // comparison, the on-screen label says so, and close restores the year.
    if (el.hidden !== false || this.tool !== 'photo') {
      this._photoPrev = { year: this.yearAnim ? this.yearAnim.to : this.dressing.year, labelShown: !this.label.hidden };
      const ae = document.activeElement;
      this._photoInvoker = ae instanceof HTMLElement && ae !== document.body && !el.contains(ae) ? ae : null;
    }
    this.yearAnim = null;
    this.dressing.setYear(2004);
    if (this._photoPrev?.labelShown) this._showPhotoLabel();
    this._snapshotLive();
    // Re-capture once the glide to the photo spot has settled.
    clearTimeout(this._snapT);
    this._snapT = setTimeout(() => { if (!this.photoEl.hidden) this._snapshotLive(); }, this.motion.reduced ? 50 : 1800);
    el.hidden = false;
    this.photoSet(50);
    this.tool = 'photo';
    this.onToolChange?.(this.tool); // review M1: the photo comparison is calm
    el.querySelector('#ps-range').focus();
    announce('Photo spot: the 1941 print is held up against today\'s view. Use the swipe slider.');
  }

  /** Render one frame from the current camera into the live <img> under the print. */
  _snapshotLive() {
    const { renderer } = this.engine;
    renderer.render(this.engine.scene, this.engine.camera);
    try { this.photoEl.querySelector('img.live').src = renderer.domElement.toDataURL('image/jpeg', 0.8); } catch { /* ignore */ }
  }

  closePhotoSpot({ restoreFocus = true } = {}) {
    if (!this.photoEl || this.photoEl.hidden) return;
    this.photoEl.hidden = true;
    this.tool = null;
    clearTimeout(this._snapT);
    const prev = this._photoPrev;
    this._photoPrev = null;
    if (prev && !this.yearAnim) {
      this.dressing.setYear(prev.year);
      if (prev.labelShown) this._showLabel(prev.year); else this.hideLabel();
    }
    this.onToolChange?.(this.tool);
    // Review I5/A6: return focus to the control that opened the photo spot.
    const back = (this._photoInvoker?.isConnected && this._photoInvoker) || document.querySelector('[data-action="photo-spot"]');
    this._photoInvoker = null;
    if (restoreFocus) back?.focus?.();
    announce(prev && prev.year !== 2004 ? `Print put away. 3D view back to ${Math.round(prev.year)}.` : 'Print put away.');
  }

  /** Label while the photo spot holds the 3D at today's ice. */
  _showPhotoLabel() {
    this.label.hidden = false;
    this.label.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = '2004';
    this.label.append(strong, document.createTextNode(`: photo spot open, 3D view set to today's ice (dated anchor; ground imagery 2024). Put the print away to return to ${Math.round(this._photoPrev?.year ?? 2004)}.`));
  }

  // ---------------- measuring line dragged along the valley ----------------
  /** Turn the terrain measuring tool on/off. While on, it owns the pointer. */
  setMeasureTool(on, outEl) {
    const canvas = this.engine.canvas;
    this.measureOut = outEl || this.measureOut;
    if (!on) {
      this.tool = this.tool === 'measure' ? null : this.tool;
      this.site.toolOwnsPointer = false;
      this.world.setEnabled(true);
      canvas.style.cursor = '';
      this._unbindMeasure?.();
      this._unbindMeasure = null;
      return;
    }
    this.tool = 'measure';
    this.site.toolOwnsPointer = true;
    this.world.setEnabled(false);
    this.site.setPathVisible(true);
    canvas.style.cursor = 'crosshair';
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = (e) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.engine.camera);
      const h = ray.intersectObjects([this.site.terrain, this.site.water], false)[0];
      return h ? nearestAlong(this.points, h.point.x, h.point.z) : null;
    };
    let dragging = false;
    const down = (e) => {
      const n = hit(e);
      if (!n || n.d > 4000) { this._measureMsg('Start the line on the valley floor, near the orange path.'); return; }
      dragging = true;
      this.measureA = n.s;
      this.setMeasure(n.s, n.s);
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => { if (dragging) { const n = hit(e); if (n) this.setMeasure(this.measureA, n.s); } };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      this.onMeasureEnd?.(this.measure);
      announce(this.measureOut?.textContent || '');
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this._unbindMeasure = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  /** Set the measuring line between along-path distances (used by pointer, keys and tests). */
  setMeasure(sA, sB) {
    const m = measureBetween(this.points, sA, sB);
    this.measure = m;
    this.site.setMarkers(m);
    // Review I1: the drawn line feeds the same marker sliders "Check measurement" grades.
    const fed = this.onMeasure?.(sA, sB);
    this._measureMsg(`Measuring line along the valley path: ${km(m.along)} (straight line ${km(m.straight)}). Along-path distance ${km(Math.min(sA, sB))} to ${km(Math.max(sA, sB))} from the inlet.${fed ? ' The Module 3 marker sliders now hold this line; press "Check measurement" to grade it.' : ''}`);
    return m;
  }

  _measureMsg(t) { if (this.measureOut) this.measureOut.textContent = t; }

  /** Calm mode during focused tasks (assessment items or a tool owning the pointer). */
  setCalm(on) {
    this.dressing.setCalmMode(on);
    this.world.setCalmMode(on);
  }
}
