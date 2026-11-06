/**
 * The bottom-bar year timeline (src/glacier/layout.js): its readout never
 * calls an undated year measured, and the ticks sit where the years are.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { yearReadout, tickAt, YEAR_MIN, YEAR_TODAY } from '../../src/glacier/layout.js';
const anchors = JSON.parse(readFileSync('content/modules.json', 'utf8')).anchors;
describe('year timeline', () => {
  it('runs from 1941 to the ground-image year', () => {
    expect(YEAR_MIN).toBe(1941);
    expect(YEAR_TODAY).toBe(2024);
    expect(tickAt(1941)).toBe(0);
    expect(tickAt(2024)).toBe(1);
    expect(tickAt(1950)).toBeCloseTo(9 / 83, 6);
  });
  it('labels dated, between and after-2004 years honestly', () => {
    for (const a of anchors) expect(yearReadout(a.year, anchors).kind).toBe('dated');
    const mid = yearReadout(1975, anchors);
    expect(mid.kind).toBe('between');
    expect(mid.long).toMatch(/illustrative, not measured/);
    const today = yearReadout(2024, anchors);
    expect(today.kind).toBe('after');
    expect(today.short).toMatch(/^Today/);
    expect(today.long).toMatch(/No dated photo after 2004/);
    expect(yearReadout(2010, anchors).short).toBe('2010 · front as 2004');
  });
});
