import { describe, it, expect } from 'vitest';
import { meshLayout, strideForPreset, lodForPreset, surfaceColour } from '../../src/scenes/muir-inlet.js';
import { Color } from 'three';

describe('terrain mesh layout', () => {
  it('stride 1 is centred on the grid (vertex 0 on pixel-0 centre)', () => {
    const L = meshLayout(540, 734, 60, 1);
    expect(L.nx).toBe(540);
    expect(L.nz).toBe(734);
    expect(L.offsetX).toBeCloseTo(0, 9);
    expect(L.offsetZ).toBeCloseTo(0, 9);
    // first vertex x = -sizeX/2 + offset = pixel-0 centre = (0.5 - 540/2) * 60
    expect(-L.sizeX / 2 + L.offsetX).toBeCloseTo((0.5 - 270) * 60, 9);
  });

  it('stride 2 keeps vertex 0 on pixel-0 centre and true metric spacing', () => {
    const L = meshLayout(540, 734, 60, 2);
    expect(L.nx).toBe(270);
    expect(L.nz).toBe(367);
    expect(L.sizeX / (L.nx - 1)).toBe(120);
    expect(-L.sizeX / 2 + L.offsetX).toBeCloseTo((0.5 - 270) * 60, 9);
    expect(-L.sizeZ / 2 + L.offsetZ).toBeCloseTo((0.5 - 367) * 60, 9);
  });

  it('presets pick LOD and stride', () => {
    expect(lodForPreset('low')).toBe(1);
    expect(lodForPreset('high')).toBe(1);
    expect(lodForPreset('ultra')).toBe(0);
    expect(strideForPreset('low')).toBe(3);
    expect(strideForPreset('medium')).toBe(2);
    expect(strideForPreset('high')).toBe(1);
  });

  it('procedural colour rules: sea level shore, steep rock, high snow', () => {
    const c = new Color();
    const shore = surfaceColour(0, 0, c.clone());
    const rock = surfaceColour(500, 0.6, c.clone());
    const snow = surfaceColour(1500, 0, c.clone());
    expect(snow.r).toBeGreaterThan(rock.r);
    expect(shore.equals(rock)).toBe(false);
  });
});
