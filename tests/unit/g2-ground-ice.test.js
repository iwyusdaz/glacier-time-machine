/**
 * G2 owner feedback (2026-11-07): the historic ice has relief (not a flat slab),
 * the station rocks are real rock shapes sitting in the ground, and the station
 * plants are drawn in the years they grew (never in 1941 or 1950).
 */
import { describe, it, expect } from 'vitest';
import { iceRelief } from '../../src/glacier/ice.js';
import { rockGeometry } from '../../src/glacier/geology.js';
import { PLANT_YEARS } from '../../src/glacier/world.js';

describe('ice relief', () => {
  it('is zero below the front and strongest in the broken ice just behind it', () => {
    expect(iceRelief(-10, 0)).toBe(0);
    const span = (d0, d1) => { let lo = Infinity, hi = -Infinity; for (let d = d0; d < d1; d += 3) for (let a = -0.7; a <= 0.7; a += 0.05) { const v = iceRelief(d, a); lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
    const near = span(0, 400), far = span(8000, 8400);
    expect(near).toBeGreaterThan(15); // crevasses and séracs: metres to tens of metres
    expect(near).toBeLessThan(45);
    expect(far).toBeGreaterThan(2);   // crevasses and ogives continue up the glacier
    expect(far).toBeLessThan(near);
  });
  it('is quieter at the margins, where the moraine bands lie', () => {
    let mid = 0, edge = 0;
    for (let d = 300; d < 3000; d += 7) { mid += Math.abs(iceRelief(d, 0.3)); edge += Math.abs(iceRelief(d, 0.97)); }
    expect(edge).toBeLessThan(mid);
  });
});

describe('station rocks', () => {
  it('have a flat base, stay within their unit size and are not spheres', () => {
    for (const opts of [{ detail: 1 }, { detail: 3, cuts: 8, rough: 0.28, squash: 0.74 }, { detail: 4, cuts: 7, squash: 0.55, pluckedX: 1, stretch: 1.6 }]) {
      const g = rockGeometry(7, opts);
      const bb = g.boundingBox;
      expect(bb.max.y - bb.min.y).toBeLessThan(2 * (opts.squash ?? 0.75) + 0.05);
      expect(bb.min.y).toBeGreaterThan(-0.4 * (opts.squash ?? 0.75));
      const p = g.attributes.position;
      let lo = Infinity, hi = 0;
      for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i) / (opts.stretch ?? 1), p.getY(i) / (opts.squash ?? 0.75), p.getZ(i)); lo = Math.min(lo, r); hi = Math.max(hi, r); }
      expect(hi - lo).toBeGreaterThan(0.2); // fracture faces and noise, not a smooth ball
    }
  });
  it('a roche moutonnée is plucked on its down-glacier (+x) side only', () => {
    const g = rockGeometry(11, { detail: 4, cuts: 7, rough: 0, squash: 1, pluckedX: 1, stretch: 1 });
    const p = g.attributes.position;
    let plus = 0, minus = 0;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), r = Math.hypot(x, p.getY(i), p.getZ(i)); if (x > 0.5) plus = Math.max(plus, r); if (x < -0.5) minus = Math.max(minus, r); }
    expect(plus).toBeLessThan(minus);
  });
});

describe('station plants', () => {
  it('grow in the documented order and after 1950 (the ridge was bare in the 1950 photo)', () => {
    expect(PLANT_YEARS.moss).toBeLessThan(PLANT_YEARS.dryas);
    expect(PLANT_YEARS.dryas).toBeLessThan(PLANT_YEARS.fireweed);
    expect(PLANT_YEARS.fireweed).toBeLessThan(PLANT_YEARS.alder);
    expect(PLANT_YEARS.moss).toBeGreaterThan(1950);
    expect(PLANT_YEARS.alder).toBeLessThan(2004);
  });
});
