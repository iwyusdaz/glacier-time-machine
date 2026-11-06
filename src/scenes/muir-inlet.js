/**
 * Pure terrain-mesh helpers for the Muir Inlet heightfield (Copernicus GLO-30,
 * true scale, 1 unit = 1 m, no vertical exaggeration). v3 builds the first-load
 * terrain from these (src/glacier/site.js); the streamed 3D Tiles replace it
 * after the first interaction. Kept here, unchanged since v2, so the unit tests
 * keep pinning the layout and the colour rules.
 * @module scenes/muir-inlet
 */
import * as THREE from 'three';

// Procedural PBR palette (linear sRGB values, applied as vertex colours).
const C_ROCK = new THREE.Color(0x5b5650);
const C_TILL = new THREE.Color(0x7d7468);
const C_VEG = new THREE.Color(0x3c4a2c);
const C_SNOW = new THREE.Color(0xe9eef2);
const C_ICE = new THREE.Color(0xb9c9d3);
const C_SHORE = new THREE.Color(0x6e675c);

/** Preset -> LOD index (0 = 30 m, 1 = 60 m). Only Ultra uses the 30 m grid for the first-load mesh. */
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

/**
 * Procedural surface colour from elevation (m) and slope (0..1): the fallback
 * when the Sentinel-2 image fails to load. A reading aid, not land cover.
 * Bands are smoothed over ±75 m (v1 review G1/V5/V6); the low, flat present-day
 * tongue near sea level reads as ice, not vegetation.
 * @param {number} h
 * @param {number} slope
 * @param {THREE.Color} out
 */
export function surfaceColour(h, slope, out) {
  if (h < 4) return out.copy(C_SHORE);
  if (slope > 0.35) return out.copy(C_ROCK);
  const band = (v, lo, hi) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  out.copy(C_VEG).lerp(C_TILL, Math.min(1, slope * 2.5));
  const highIce = band(h, 575, 725) * (1 - Math.min(1, slope * 1.5));
  const tongue = (1 - band(h, 40, 240)) * (1 - band(slope, 0.08, 0.15));
  out.lerp(C_ICE, Math.max(highIce, tongue * 0.9));
  out.lerp(C_SNOW, band(h, 1025, 1175) * (1 - Math.min(1, slope * 2)));
  return out;
}
