#!/usr/bin/env node
/**
 * Compute the measurement path used by Module 3: the lowest-cost route over the
 * committed Copernicus GLO-30 heightfield (60 m LOD) between two PUBLISHED
 * coordinates (Muir Inlet and Muir Glacier, research/sources.md rows 23 and 25).
 *
 * This is a valley-floor path derived from the DEM, NOT a surveyed glacier
 * flowline and NOT a set of terminus positions. The app labels it that way.
 *
 * Cost per step = horizontal metres x (1 + max(elevation, 0) / 25), so the route
 * follows the water / low valley floor. Output: content/flowline.json (scene
 * metres, x east, z south) with cumulative distance along the path.
 *
 * Usage: node scripts/compute-flowline.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeTerrain, utmToScene, sceneToUtm, heightAt } from '../src/systems/terrain-data.js';
import { pathLength } from '../src/systems/flowline.js';

const meta = JSON.parse(readFileSync('public/data/terrain-meta.json', 'utf8'));
const grid = await decodeTerrain(readFileSync('public/data/muir-height-l1.png'), meta, 1);
const { width: W, height: H, mPerPx: M, data } = grid;

const lm = (p) => meta.landmarks.find((l) => l.name.startsWith(p));
const toPx = (l) => {
  const b = grid.bounds;
  return { i: Math.round((l.utmE - b.west) / M - 0.5), j: Math.round((b.north - l.utmN) / M - 0.5) };
};
const start = toPx(lm('Muir Inlet'));
const goal = toPx(lm('Muir Glacier'));

// Dijkstra with a binary heap on the 8-connected grid.
const N = W * H;
const dist = new Float64Array(N).fill(Infinity);
const prev = new Int32Array(N).fill(-1);
const heap = [];
const push = (d, n) => {
  heap.push([d, n]);
  let k = heap.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heap[p][0] <= heap[k][0]) break;
    [heap[p], heap[k]] = [heap[k], heap[p]];
    k = p;
  }
};
const pop = () => {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === k) break;
      [heap[m], heap[k]] = [heap[k], heap[m]];
      k = m;
    }
  }
  return top;
};
const s0 = start.j * W + start.i;
const g0 = goal.j * W + goal.i;
dist[s0] = 0;
push(0, s0);
while (heap.length) {
  const [d, n] = pop();
  if (d > dist[n]) continue;
  if (n === g0) break;
  const i = n % W, j = (n / W) | 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nn = nj * W + ni;
      const step = Math.hypot(di, dj) * M * (1 + Math.max(data[nn], 0) / 25);
      if (d + step < dist[nn]) { dist[nn] = d + step; prev[nn] = n; push(d + step, nn); }
    }
  }
}

// Walk back, convert pixel centres to scene coordinates.
const px = [];
for (let n = g0; n !== -1; n = prev[n]) px.push(n);
px.reverse();
const b = grid.bounds;
const raw = px.map((n) => {
  const i = n % W, j = (n / W) | 0;
  const e = b.west + (i + 0.5) * M, nn = b.north - (j + 0.5) * M;
  return utmToScene(grid, e, nn);
});

// Simplify: keep a vertex every ~600 m of path, plus the end point.
const pts = [raw[0]];
let acc = 0;
for (let k = 1; k < raw.length; k++) {
  acc += Math.hypot(raw[k].x - raw[k - 1].x, raw[k].z - raw[k - 1].z);
  if (acc >= 600 || k === raw.length - 1) { pts.push(raw[k]); acc = 0; }
}
const points = pts.map((p) => {
  const u = sceneToUtm(grid, p.x, p.z);
  return { x: Math.round(p.x), z: Math.round(p.z), elev: Math.round(heightAt(grid, p.x, p.z)), utmE: Math.round(u.easting), utmN: Math.round(u.northing) };
});

const out = {
  status: 'Computed by scripts/compute-flowline.mjs from public/data/muir-height-l1.png (Copernicus GLO-30, 60 m).',
  label: 'Valley-floor path computed from the elevation model (lowest-cost route between two published coordinates). Not a surveyed glacier flowline and not measured terminus positions.',
  from: 'Muir Inlet (published coordinate, research/sources.md row 25)',
  to: 'Muir Glacier (published coordinate, research/sources.md row 23; a place-name coordinate, not a dated terminus)',
  crs: 'scene metres: x east, z south, origin at DEM grid centre (UTM 8N); utmE/utmN in EPSG:32608',
  lengthM: Math.round(pathLength(points)),
  points,
};
writeFileSync('content/flowline.json', JSON.stringify(out, null, 2) + '\n');
console.log(`flowline: ${points.length} vertices, ${(out.lengthM / 1000).toFixed(2)} km, max elev ${Math.max(...points.map((p) => p.elev))} m`);
