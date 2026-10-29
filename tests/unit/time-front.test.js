/**
 * v2 living time transition: the ice front comes ONLY from the dated anchors;
 * in-between years are flagged as illustrative; the grade warms for the past.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { frontForYear, isAnchorYear, timeLabel, BETWEEN_LABEL, pastAmount, forestForYear, thicknessForYear, transitionYear } from '../../src/systems/time-front.js';
import { gradeAt, GRADE_MODERN, GRADE_ARCHIVE } from '../../src/scenes/muir-grade.js';
import { nearestAlong } from '../../src/scenes/muir-world.js';
import { pathLength } from '../../src/systems/flowline.js';

const modules = JSON.parse(readFileSync('content/modules.json', 'utf8'));
const flow = JSON.parse(readFileSync('content/flowline.json', 'utf8'));
const anchors = modules.anchors;
const L = pathLength(flow.points);

describe('ice front from dated anchors only', () => {
  it('anchor years place the front from the published minimum retreat', () => {
    const f41 = frontForYear(1941, anchors, L);
    const f50 = frontForYear(1950, anchors, L);
    const f04 = frontForYear(2004, anchors, L);
    expect(f04.s).toBeCloseTo(L, 6);
    expect(f04.s - f50.s).toBeCloseTo(4000, 6); // 7 km - 3 km
    expect(f04.s - f41.s).toBeCloseTo(7000, 6);
    for (const f of [f41, f50, f04]) { expect(f.anchor).toBe(true); expect(f.between).toBe(false); }
  });

  it('nothing is ever flagged as measured', () => {
    for (let y = 1930; y <= 2030; y += 3) expect(frontForYear(y, anchors, L).measured).toBe(false);
  });

  it('years between anchors are flagged and labelled illustrative', () => {
    const f = frontForYear(1975, anchors, L);
    expect(f.between).toBe(true);
    expect(f.anchor).toBe(false);
    expect(timeLabel(1975, anchors)).toContain(BETWEEN_LABEL);
    expect(BETWEEN_LABEL).toBe('Between dated anchors: illustrative, not measured');
    expect(isAnchorYear(1950, anchors)).toBe(true);
    expect(timeLabel(1950, anchors)).toMatch(/dated anchor/);
    expect(timeLabel(1950, anchors)).toMatch(/not surveyed/);
  });

  it('every 3D label names the 2024 ground imagery (reviews V3/H3)', () => {
    for (const y of [1941, 1950, 1975, 2004]) expect(timeLabel(y, anchors)).toContain("Ground imagery: Sentinel-2, 2024 (today's surface, shown for every year)");
  });

  it('front retreats monotonically up-valley with time', () => {
    let prev = -Infinity;
    for (let y = 1941; y <= 2004; y++) {
      const s = frontForYear(y, anchors, L).s;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('thickness, forest cover and past-grade amounts behave', () => {
    expect(thicknessForYear(1941, anchors)).toBe(1);
    expect(thicknessForYear(2004, anchors)).toBe(0);
    expect(pastAmount(1941, anchors)).toBe(1);
    expect(pastAmount(2004, anchors)).toBe(0);
    expect(forestForYear(1941, anchors)).toBeLessThan(forestForYear(2004, anchors));
  });

  it('transition snaps when duration is 0 (reduced motion) and eases otherwise', () => {
    expect(transitionYear(2004, 1941, 0, 0)).toBe(1941);
    const mid = transitionYear(2004, 1941, 1, 2);
    expect(mid).toBeLessThan(2004);
    expect(mid).toBeGreaterThan(1941);
    expect(transitionYear(2004, 1941, 5, 2)).toBe(1941);
  });
});

describe('grade end-points (cool modern, warm sepia archive)', () => {
  it('lerps between the two end-points', () => {
    expect(gradeAt(0).fog).toBe(GRADE_MODERN.fog);
    expect(gradeAt(1).fog).toBe(GRADE_ARCHIVE.fog);
    const warm = (hex) => ((hex >> 16) & 255) - (hex & 255);
    expect(warm(gradeAt(1).fog)).toBeGreaterThan(warm(gradeAt(0).fog));
    expect(gradeAt(0.5).exposure).toBeCloseTo((GRADE_MODERN.exposure + GRADE_ARCHIVE.exposure) / 2, 6);
    expect(gradeAt(-3)).toEqual(gradeAt(0));
  });
});

describe('measuring line snaps to the DEM path', () => {
  it('nearestAlong returns the path vertex distance', () => {
    const p = flow.points[10];
    const n = nearestAlong(flow.points, p.x + 5, p.z - 5);
    expect(n.d).toBeLessThan(10);
    expect(n.s).toBeGreaterThan(0);
  });
});
