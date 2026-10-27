/**
 * Terrain data: decode the committed Copernicus GLO-30 heightfield
 * (public/data/muir-height-l*.png + terrain-meta.json, produced by
 * scripts/process-dem.sh) and map between UTM 8N metres and scene coordinates.
 *
 * Scene frame (1 unit = 1 m, no vertical exaggeration):
 *   x = east  (UTM easting  - centre easting)
 *   y = up    (elevation, metres above the DEM vertical datum)
 *   z = south (centre northing - UTM northing)
 * so the grid's row index (north -> south) increases with +z, like three.js
 * PlaneGeometry rotated flat.
 * @module systems/terrain-data
 */
import { decodeGrayPNG, sampleElevation } from '../core/png.js';

/**
 * Decode a 16-bit heightfield PNG with the meta's linear encoding.
 * @param {Uint8Array|ArrayBuffer} bytes PNG bytes
 * @param {object} meta terrain-meta.json
 * @param {number} lodIndex
 */
export async function decodeTerrain(bytes, meta, lodIndex) {
  const lod = meta.lods[lodIndex];
  const png = await decodeGrayPNG(bytes);
  if (png.width !== lod.width || png.height !== lod.height || png.bitDepth !== 16) {
    throw new Error(`heightfield ${lod.file}: expected ${lod.width}x${lod.height} 16-bit`);
  }
  const { elevMin, elevMax } = meta.encoding;
  const span = elevMax - elevMin;
  const data = new Float32Array(lod.width * lod.height);
  for (let i = 0; i < data.length; i++) {
    const v = (png.data[i * 2] << 8) | png.data[i * 2 + 1];
    data[i] = elevMin + (v / 65535) * span;
  }
  return { width: lod.width, height: lod.height, mPerPx: lod.mPerPx, bounds: lod.bounds, data };
}

/** Grid extent in metres and its centre in UTM. */
export function gridFrame(grid) {
  const b = grid.bounds;
  return {
    sizeX: b.east - b.west,
    sizeZ: b.north - b.south,
    centreE: (b.west + b.east) / 2,
    centreN: (b.north + b.south) / 2,
  };
}

/** UTM 8N (easting, northing) -> scene (x, z). */
export function utmToScene(grid, easting, northing) {
  const f = gridFrame(grid);
  return { x: easting - f.centreE, z: f.centreN - northing };
}

/** Scene (x, z) -> UTM 8N (easting, northing). */
export function sceneToUtm(grid, x, z) {
  const f = gridFrame(grid);
  return { easting: x + f.centreE, northing: f.centreN - z };
}

/**
 * Elevation (m) at scene (x, z), bilinear between pixel centres; NaN outside.
 * Pixel (i, j) centre sits at west + (i + 0.5) * mPerPx.
 */
export function heightAt(grid, x, z) {
  const b = grid.bounds;
  const { easting, northing } = sceneToUtm(grid, x, z);
  const gx = easting - b.west - grid.mPerPx / 2;
  const gy = b.north - northing - grid.mPerPx / 2;
  return sampleElevation(grid, gx, gy);
}

/** Straight-line horizontal distance (m) between two scene points. */
export function horizontalDistance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}
