/**
 * landforms.js — clickable landforms on the real DEM (plan 10 §4: a clickable
 * world) without changing the data: each landform is an invisible pick shape
 * draped 6 m over the Copernicus surface, tinted glacier blue only while it is
 * hovered, focused or its card is open. Where a shape comes from the drawn
 * (illustrative) ice, the card says so (trimline: its height follows the drawn
 * 1941 ice surface).
 *
 * Also here: the visible moraine bands on the drawn ice (lateral moraines on
 * both edges and a medial moraine from the Riggs side), and the coarse terrain
 * pick shape (picking every streamed tile triangle on each hover would cost
 * several milliseconds a frame).
 * @module glacier/landforms
 */
import * as THREE from 'three';
import { nearestAlong } from '../systems/flowline.js';
import { proxyMaterial, ICE_HALF_WIDTH } from './ice.js';
import { mulberry32 } from './loaders.js';
import { WATER_Y } from './site.js';

/**
 * A mesh of grid cells (spacing `step` m) whose centre passes `test(x, z, h)`,
 * draped `lift` m over the ground (or flat at `flatY`).
 */
export function cellMesh(site, { x0, x1, z0, z1, step = 120, lift = 6, flatY = null, test, name, color, maxCells = 6000 }) {
  const P = [];
  let cells = 0;
  const y = (x, z) => (flatY != null ? flatY : site.ground(x, z) + lift);
  for (let z = z0; z < z1 && cells < maxCells; z += step) {
    for (let x = x0; x < x1 && cells < maxCells; x += step) {
      const cx = x + step / 2, cz = z + step / 2;
      const h = site.heightAt(cx, cz);
      if (!Number.isFinite(h) || !test(cx, cz, h)) continue;
      const a = [x, y(x, z), z], b = [x + step, y(x + step, z), z], c = [x, y(x, z + step), z + step], d = [x + step, y(x + step, z + step), z + step];
      P.push(...a, ...c, ...b, ...b, ...c, ...d);
      cells++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, proxyMaterial(color));
  m.name = name;
  m.userData.proxy = true;
  m.userData.noOutline = true;
  m.userData.cells = cells;
  m.renderOrder = 3;
  return m;
}

export class Landforms {
  constructor(site, ice) {
    this.site = site;
    this.ice = ice;
    this.group = new THREE.Group();
    this.group.name = 'landforms';
    this.proxies = {};
  }

  build({ station }) {
    const site = this.site;
    const pts = site.points;
    const ice = this.ice;
    const f41 = ice.frontAt(1941);
    const along = (x, z) => nearestAlong(pts, x, z);
    const pathBox = { x0: -site.halfX, x1: site.halfX, z0: -site.halfZ, z1: site.halfZ };
    // 1941 ice surface height near a valley point (centre line of the drawn tongue).
    const surf41 = (s) => ice._surfaceY(Math.max(s, f41.s), 0, f41.s, 1).y;

    // Trimline: valley walls where the ground meets the drawn 1941 ice surface.
    this.proxies.trimline = cellMesh(site, {
      ...pathBox, step: 90, name: 'trimline-band', color: 0xffd9a0,
      test: (x, z, h) => {
        const n = along(x, z);
        if (n.s < f41.s + 600 || n.s > site.L + 1500 || n.d < ICE_HALF_WIDTH * 0.8 || n.d > 3200) return false;
        return Math.abs(h - surf41(n.s)) < 30 && site.slopeAt(x, z) > 0.12;
      },
    });
    // Bare bedrock: steep valley walls near the 1941 ice (bare in 1941; vegetated lower down today).
    this.proxies.bedrock = cellMesh(site, {
      ...pathBox, step: 120, name: 'bare-bedrock', color: 0xd7c7b0,
      test: (x, z, h) => {
        const n = along(x, z);
        if (n.s < f41.s - 4000 || n.s > site.L - 500 || n.d < ICE_HALF_WIDTH || n.d > 3800) return false;
        if (h < 60 || h > 1000 || site.slopeAt(x, z) < 0.5) return false;
        return Math.abs(h - surf41(n.s)) > 45;
      },
    });
    // Nunataks: the three highest summits of the upper basin, where rock stands above the snow.
    const peaks = [];
    for (let z = -site.halfZ + 600; z < -13000; z += 300) for (let x = -site.halfX + 600; x < site.halfX - 600; x += 300) {
      const h = site.heightAt(x, z);
      if (h > 1650 && !peaks.some((p) => Math.hypot(p.x - x, p.z - z) < 3500 && p.h >= h)) {
        for (let i = peaks.length - 1; i >= 0; i--) if (Math.hypot(peaks[i].x - x, peaks[i].z - z) < 3500) peaks.splice(i, 1);
        peaks.push({ x, z, h });
      }
    }
    peaks.sort((a, b) => b.h - a.h);
    this.peaks = peaks.slice(0, 3);
    this.proxies.nunatak = cellMesh(site, {
      ...pathBox, z1: -12000, step: 90, name: 'nunataks', color: 0xd7c7b0,
      test: (x, z, h) => this.peaks.some((p) => Math.hypot(p.x - x, p.z - z) < 1300 && h > p.h - 220),
    });
    // Accumulation zone: gentle high ground above about 1,150 m in the upper basin.
    this.proxies.accumulation = cellMesh(site, {
      ...pathBox, z1: -11000, step: 180, name: 'snowfields', color: 0xffffff,
      test: (x, z, h) => h > 1150 && site.slopeAt(x, z, 90) < 0.38 && !this.peaks.some((p) => Math.hypot(p.x - x, p.z - z) < 1300 && h > p.h - 220),
    });
    // White Thunder Ridge: the ridge around the (approximate) photo station.
    this.proxies.ridge = cellMesh(site, {
      x0: station.x - 2600, x1: station.x + 2600, z0: station.z - 2600, z1: station.z + 2600, step: 120, name: 'white-thunder-ridge', color: 0xc9e3c0,
      test: (x, z, h) => h > 160 && Math.hypot(x - station.x, z - station.z) < 2400 && Math.hypot(x - station.x, z - station.z) > 60,
    });
    // Muir Inlet: the water of the upper inlet that ice filled within the last century.
    this.proxies.inlet = cellMesh(site, {
      ...pathBox, step: 150, flatY: WATER_Y + 0.6, name: 'muir-inlet-water', color: 0x9fd3e6,
      test: (x, z, h) => { if (h > 0.5) return false; const n = along(x, z); return n.s > 15000 && n.s < f41.s - 200 && n.d < 2600; },
    });
    // Riggs Glacier: its valley above the confluence (ice on the 2024 image).
    const R = site.landmarks.riggs;
    const toward = { x: (site.landmarks.muir.x - R.x), z: (site.landmarks.muir.z - R.z) };
    const tl = Math.hypot(toward.x, toward.z);
    toward.x /= tl; toward.z /= tl;
    this.proxies.riggs = cellMesh(site, {
      x0: R.x - 6000, x1: R.x + 6000, z0: R.z - 6000, z1: R.z + 6000, step: 120, name: 'riggs-glacier', color: 0x9fd3e6,
      test: (x, z, h) => {
        const dx = x - R.x, dz = z - R.z;
        const t = dx * toward.x + dz * toward.z;
        const off = Math.abs(dx * toward.z - dz * toward.x);
        return t > -3500 && t < 2500 && off < 900 && h > 60 && site.slopeAt(x, z) < 0.45;
      },
    });
    for (const m of Object.values(this.proxies)) this.group.add(m);
    this._terrainPick();
    this._moraineBands();
    return this;
  }

  /** Coarse terrain pick shape (360 m cells), 40 m under the ground so every object and landform on it wins the pick. */
  _terrainPick() {
    const site = this.site, g = site.grid, stride = 6;
    const nx = Math.floor((g.width - 1) / stride) + 1, nz = Math.floor((g.height - 1) / stride) + 1;
    const geo = new THREE.PlaneGeometry((nx - 1) * stride * g.mPerPx, (nz - 1) * stride * g.mPerPx, nx - 1, nz - 1).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(site.ground(p.getX(i), p.getZ(i)), 0) - 40);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, proxyMaterial(0xffffff));
    m.name = 'terrain-pick';
    m.userData.noOutline = true;
    m.userData.proxy = true;
    m.userData.noHighlight = true;
    this.terrainPick = m;
    this.group.add(m);
  }

  /** Dark debris bands on the drawn ice: lateral moraines on both edges, a medial moraine on the Riggs side. */
  _moraineBands() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    const r = mulberry32(12);
    x.fillStyle = '#5d564d'; x.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 900; i++) { const v = 50 + r() * 90; x.fillStyle = `rgba(${v},${v * 0.95},${v * 0.88},${0.4 + r() * 0.6})`; x.fillRect(r() * 64, r() * 256, 1 + r() * 4, 1 + r() * 4); }
    const grd = x.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, 'rgba(200,215,222,0.9)'); grd.addColorStop(0.25, 'rgba(200,215,222,0)'); grd.addColorStop(0.75, 'rgba(200,215,222,0)'); grd.addColorStop(1, 'rgba(200,215,222,0.9)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.moraineMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.moraine = new THREE.Group();
    this.moraine.name = 'moraine-bands';
    this.bands = [[-0.97, -0.82, 0], [0.82, 0.97, 0], [0.3, 0.42, 2500]].map(([a0, a1, from]) => {
      const rows = 40;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rows * 2 * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(rows * 2 * 2), 2));
      const I = [];
      for (let i = 0; i < rows - 1; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      geo.setIndex(I);
      const m = new THREE.Mesh(geo, this.moraineMat);
      m.name = 'moraine-band';
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.userData.noOutline = true;
      m.userData.band = { a0, a1, from, rows };
      this.moraine.add(m);
      return m;
    });
    this.group.add(this.moraine);
  }

  /** Follow the drawn ice for a year. */
  setYear() {
    const ice = this.ice, fr = ice.front;
    if (!fr || !this.bands) return;
    const s1 = this.site.L + 4000;
    for (const m of this.bands) {
      const { a0, a1, from, rows } = m.userData.band;
      const p = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
      const sFrom = Math.max(fr.s + 250, this.site.L - 7000 + from);
      for (let i = 0; i < rows; i++) {
        const s = sFrom + (s1 - sFrom) * (i / (rows - 1));
        const A = ice._surfaceY(s, a0, fr.s, fr.thick), B = ice._surfaceY(s, a1, fr.s, fr.thick);
        p.setXYZ(i * 2, A.x, A.y + 1.5, A.z);
        p.setXYZ(i * 2 + 1, B.x, B.y + 1.5, B.z);
        uv.setXY(i * 2, 0, (s - sFrom) / 160); uv.setXY(i * 2 + 1, 1, (s - sFrom) / 160);
      }
      p.needsUpdate = uv.needsUpdate = true;
      m.geometry.computeVertexNormals();
      m.geometry.computeBoundingSphere();
      m.visible = sFrom < s1 - 500;
    }
  }
}
