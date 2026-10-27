import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decodeTerrain, utmToScene, sceneToUtm, heightAt, gridFrame, horizontalDistance,
} from '../../src/systems/terrain-data.js';

const meta = JSON.parse(readFileSync('public/data/terrain-meta.json', 'utf8'));

describe('terrain-data scene frame', () => {
  it('round-trips UTM <-> scene coordinates', async () => {
    const grid = await decodeTerrain(readFileSync('public/data/muir-height-l1.png'), meta, 1);
    const p = utmToScene(grid, 420833, 6552532.5);
    const back = sceneToUtm(grid, p.x, p.z);
    expect(back.easting).toBeCloseTo(420833, 6);
    expect(back.northing).toBeCloseTo(6552532.5, 6);
    // centre maps to origin; north is -z
    const f = gridFrame(grid);
    expect(utmToScene(grid, f.centreE, f.centreN)).toEqual({ x: 0, z: 0 });
    expect(utmToScene(grid, f.centreE, f.centreN + 1000).z).toBe(-1000);
  });

  it('LOD0 and LOD1 agree on landmark heights (within a few tens of metres)', async () => {
    const g0 = await decodeTerrain(readFileSync('public/data/muir-height-l0.png'), meta, 0);
    const g1 = await decodeTerrain(readFileSync('public/data/muir-height-l1.png'), meta, 1);
    for (const lm of meta.landmarks) {
      const p = utmToScene(g0, lm.utmE, lm.utmN);
      const h0 = heightAt(g0, p.x, p.z);
      const h1 = heightAt(g1, p.x, p.z);
      expect(Number.isFinite(h0), lm.name).toBe(true);
      expect(Math.abs(h0 - lm.demElevM), lm.name).toBeLessThan(40);
      expect(Math.abs(h1 - h0), lm.name).toBeLessThan(80);
    }
  });

  it('returns NaN outside the grid', async () => {
    const g1 = await decodeTerrain(readFileSync('public/data/muir-height-l1.png'), meta, 1);
    expect(Number.isNaN(heightAt(g1, 1e6, 0))).toBe(true);
  });

  it('measures horizontal distance in metres', () => {
    expect(horizontalDistance({ x: 0, z: 0 }, { x: 3000, z: 4000 })).toBe(5000);
  });
});
