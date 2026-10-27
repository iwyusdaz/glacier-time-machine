import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { decodeGrayPNG, sampleElevation } from '../../src/core/png.js';

// Validates the committed Copernicus GLO-30 heightfield produced by
// scripts/process-dem.sh against its metadata and the logged landmark spot checks.
const meta = JSON.parse(readFileSync('public/data/terrain-meta.json', 'utf8'));
const enc = meta.encoding;

async function loadLod(i) {
  const lod = meta.lods[i];
  const png = await decodeGrayPNG(readFileSync(`public/data/${lod.file}`));
  const data = new Float32Array(lod.width * lod.height);
  const span = enc.elevMax - enc.elevMin;
  for (let p = 0; p < data.length; p++) {
    const v = (png.data[p * 2] << 8) | png.data[p * 2 + 1];
    data[p] = enc.elevMin + (v / 65535) * span;
  }
  return { png, grid: { width: lod.width, height: lod.height, mPerPx: lod.mPerPx, data } };
}

describe('Muir Inlet heightfield (public/data)', () => {
  it('metadata is metric UTM 8N with consistent bounds', () => {
    expect(meta.crs).toBe('EPSG:32608');
    for (const lod of meta.lods) {
      const b = lod.bounds;
      expect((b.east - b.west) / lod.mPerPx).toBeCloseTo(lod.width, 6);
      expect((b.north - b.south) / lod.mPerPx).toBeCloseTo(lod.height, 6);
    }
    expect(meta.attribution).toMatch(/Copernicus WorldDEM-30/);
  });

  it('files are 16-bit grayscale PNGs matching meta and well under budget', async () => {
    for (let i = 0; i < meta.lods.length; i++) {
      const { png } = await loadLod(i);
      expect(png.bitDepth).toBe(16);
      expect(png.colorType).toBe(0);
      expect(png.width).toBe(meta.lods[i].width);
      expect(statSync(`public/data/${meta.lods[i].file}`).size).toBeLessThan(5 * 1024 * 1024);
    }
  });

  it('decoded range matches the recorded stats (real scale, no exaggeration)', async () => {
    const { grid } = await loadLod(0);
    let lo = Infinity, hi = -Infinity;
    for (const v of grid.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
    expect(lo).toBeCloseTo(meta.stats.min, 0);
    expect(hi).toBeCloseTo(meta.stats.max, 0);
  });

  it('reproduces the landmark spot checks within 1 m', async () => {
    const { grid } = await loadLod(0);
    for (const lm of meta.landmarks) {
      // gdallocationinfo samples the containing pixel; compare at the pixel centre
      const px = Math.floor(lm.localX / grid.mPerPx), py = Math.floor(lm.localY / grid.mPerPx);
      const z = sampleElevation(grid, px * grid.mPerPx, py * grid.mPerPx);
      expect(Math.abs(z - lm.demElevM), lm.name).toBeLessThan(1);
    }
  });

  it('Muir Inlet water surface sits at sea level', () => {
    const inlet = meta.landmarks.find((l) => l.name.startsWith('Muir Inlet'));
    expect(Math.abs(inlet.demElevM)).toBeLessThan(5);
  });
});
