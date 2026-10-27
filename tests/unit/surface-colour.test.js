/**
 * Procedural surface colour rules (src/scenes/muir-inlet.js surfaceColour).
 * Pins the review fixes: the present-day glacier tongue must read as ice, not
 * vegetation (G1/V6), and elevation bands must be smooth, not hard contour
 * steps (V5).
 * @module tests/unit/surface-colour
 */
import { describe, it, expect } from 'vitest';
import { surfaceColour } from '../../src/scenes/muir-inlet.js';
import { Color } from 'three';

const out = () => new Color();

describe('surfaceColour', () => {
  it('colours the low, flat present-day terminus as ice (blue > green), not vegetation', () => {
    // Landmark: Muir Glacier coordinate sits on DEM elevation 28.2 m, flat ice.
    const c = surfaceColour(28, 0.02, out());
    expect(c.b).toBeGreaterThan(c.g);
    expect(c.b).toBeGreaterThan(0.55);
  });

  it('colours mid-slopes as vegetation/till (green >= blue) away from the tongue', () => {
    const c = surfaceColour(500, 0.2, out());
    expect(c.g).toBeGreaterThanOrEqual(c.b);
  });

  it('colours high flat terrain as snow', () => {
    const c = surfaceColour(1500, 0.05, out());
    expect(c.r).toBeGreaterThan(0.75);
    expect(c.g).toBeGreaterThan(0.8);
  });

  it('keeps steep slopes rocky at any elevation', () => {
    const a = surfaceColour(300, 0.5, out());
    const b = surfaceColour(1400, 0.5, out());
    expect(a.getHex()).toBe(b.getHex());
  });

  it('has no hard contour-band steps across the old 650/1100 m thresholds (V5)', () => {
    const prev = surfaceColour(1095, 0.1, out());
    const next = surfaceColour(1105, 0.1, out());
    const step = Math.max(Math.abs(prev.r - next.r), Math.abs(prev.g - next.g), Math.abs(prev.b - next.b));
    expect(step).toBeLessThan(0.05);
  });

  it('keeps the shoreline band below 4 m', () => {
    const c = surfaceColour(2, 0.0, out());
    expect(c.getHex()).toBe(new Color(0x6e675c).getHex());
  });
});
