import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  lowerBoundRate, parseNumber, checkNumeric, anchorRates, scoreChangeTags,
  scoreEvidenceSort, scoreSequence, moveItem, seededShuffle, cinematicBudget,
} from '../../src/learning/logic.js';
import { pathLength, pointAtDistance, measureBetween, withinTolerance, cumulative } from '../../src/systems/flowline.js';

const read = (f) => JSON.parse(readFileSync(`content/${f}`, 'utf8'));
const modules = read('modules.json');
const items = read('items.json');
const cards = read('evidence-cards.json');
const flowline = read('flowline.json');
const cinematics = read('cinematics.json');
const sourcesMd = readFileSync('research/sources.md', 'utf8');

describe('rates from verified anchors', () => {
  it('lower-bound rates match the caption arithmetic', () => {
    expect(lowerBoundRate(3, 1941, 1950).rate).toBeCloseTo(0.3333, 3);
    expect(lowerBoundRate(7, 1941, 2004).rate).toBeCloseTo(0.1111, 3);
    expect(lowerBoundRate(7, 1941, 2004).kind).toBe('lower bound');
    expect(() => lowerBoundRate(3, 1950, 1941)).toThrow();
  });
  it('anchorRates uses only the anchors given (no interpolation)', () => {
    const rows = anchorRates(modules.anchors);
    expect(rows).toHaveLength(modules.anchors.length - 1);
    expect(rows.map((r) => r.period)).toEqual(['1941-1950', '1941-2004']);
    expect(rows.every((r) => r.kind === 'lower bound')).toBe(true);
  });
  it('anchors are exactly the three dated USGS photos', () => {
    expect(modules.anchors.map((a) => a.date)).toEqual(['1941-08-13', '1950-08-04', '2004-08-31']);
    expect(modules.anchors.map((a) => a.retreatSince1941.value)).toEqual([0, 3, 7]);
  });
  it('rate task answers agree with lowerBoundRate', () => {
    const [t1, t2] = modules.modules[2].rateTasks;
    expect(Math.abs(t1.answer - lowerBoundRate(3, 1941, 1950).rate)).toBeLessThan(0.001);
    expect(Math.abs(t2.answer - lowerBoundRate(7, 1941, 2004).rate)).toBeLessThan(0.001);
  });
  it('parses learner numbers', () => {
    expect(parseNumber('0,33 km/yr')).toBeCloseTo(0.33);
    expect(parseNumber(' .11')).toBeCloseTo(0.11);
    expect(Number.isNaN(parseNumber('about a third'))).toBe(true);
    expect(checkNumeric('0.33', { answer: 0.333, tolerance: 0.02 }).correct).toBe(true);
    expect(checkNumeric('0.5', { answer: 0.333, tolerance: 0.02 }).correct).toBe(false);
  });
});

describe('measurement path', () => {
  it('flowline.json length matches its points and is labelled as not a terminus record', () => {
    expect(Math.abs(pathLength(flowline.points) - flowline.lengthM)).toBeLessThan(2);
    expect(flowline.label).toMatch(/Not a surveyed glacier flowline/);
    expect(flowline.points.length).toBeGreaterThan(10);
  });
  it('pointAtDistance clamps and interpolates', () => {
    const pts = [{ x: 0, z: 0, elev: 0 }, { x: 300, z: 400, elev: 10 }];
    expect(pathLength(pts)).toBe(500);
    expect(pointAtDistance(pts, 250)).toMatchObject({ x: 150, z: 200, elev: 5 });
    expect(pointAtDistance(pts, -5).s).toBe(0);
    expect(pointAtDistance(pts, 9e9).s).toBe(500);
    expect(cumulative(pts)).toEqual([0, 500]);
  });
  it('measureBetween gives along-path and straight distances', () => {
    const pts = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }];
    const m = measureBetween(pts, 0, 2000);
    expect(m.along).toBe(2000);
    expect(m.straight).toBeCloseTo(Math.SQRT2 * 1000);
    expect(withinTolerance(1950, 2000, 100)).toBe(true);
    expect(withinTolerance(NaN, 2000, 100)).toBe(false);
  });
  it('full-path measurement is within the task tolerance of the path length', () => {
    const task = modules.modules[2].measureTasks[0];
    const m = measureBetween(flowline.points, 0, Math.round(flowline.lengthM));
    expect(withinTolerance(m.along, pathLength(flowline.points), task.toleranceM)).toBe(true);
  });
});

describe('scoring', () => {
  it('change tags: all true tags and no false ones is a full score', () => {
    const tags = modules.modules[1].changeTags;
    const good = tags.filter((t) => t.correct).map((t) => t.id);
    expect(scoreChangeTags(tags, good)).toMatchObject({ hits: 5, misses: 0, falseAlarms: 0, total: 5 });
    expect(scoreChangeTags(tags, ['taller', 'ice-loss'])).toMatchObject({ hits: 1, falseAlarms: 1 });
  });
  it('evidence sort counts correct and unanswered cards', () => {
    const all = Object.fromEntries(cards.cards.map((c) => [c.id, c.category]));
    expect(scoreEvidenceSort(cards.cards, all).correct).toBe(cards.cards.length);
    expect(scoreEvidenceSort(cards.cards, {}).unanswered).toBe(cards.cards.length);
  });
  it('sequence scoring and moves', () => {
    const stages = modules.modules[3].succession.stages;
    const ids = stages.map((s) => s.id);
    expect(scoreSequence(stages, ids).exact).toBe(true);
    expect(scoreSequence(stages, moveItem(ids, 0, 1)).correctPositions).toBe(ids.length - 2);
    expect(moveItem(ids, 0, -1)).toEqual(ids);
    const sh = seededShuffle(ids, 11);
    expect([...sh].sort()).toEqual([...ids].sort());
    expect(seededShuffle(ids, 11)).toEqual(sh);
  });
});

describe('content rules', () => {
  it('cinematics: each shot <= 25 s, total <= 90 s, captioned, purpose-tagged, reduced-motion version', () => {
    const b = cinematicBudget(cinematics);
    expect(b.ok).toBe(true);
    expect(b.total).toBeLessThanOrEqual(90);
    for (const c of cinematics.cinematics) {
      for (const s of c.shots) {
        expect(s.captions.length).toBeGreaterThan(0);
        expect(s.purpose).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(s.reducedMotion?.kind).toBe('stills');
      }
    }
  });
  it('pre and post items cover all five objectives with valid keys', () => {
    for (const set of [items.pre, items.post]) {
      expect(new Set(set.map((i) => i.objective))).toEqual(new Set([1, 2, 3, 4, 5]));
      for (const i of set) expect(i.options.map((o) => o.id)).toContain(i.correct);
    }
    expect(items.transfer.constructed).toBe(true);
    expect(items.transfer.label).toMatch(/Constructed for teaching purposes/);
  });
  it('every cited source row exists in research/sources.md and is not UNVERIFIED', () => {
    const rows = new Map();
    for (const line of sourcesMd.split('\n')) {
      const m = line.match(/^\| (\d+) \|(.*)\|\s*$/);
      if (m) rows.set(+m[1], m[2]);
    }
    const cited = new Set();
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          if (k === 'sources' && Array.isArray(v)) v.forEach((n) => cited.add(n));
          else if (k === 'source' && typeof v === 'number') cited.add(v);
          else walk(v);
        }
      }
    };
    [modules, items, cards].forEach(walk);
    expect(cited.size).toBeGreaterThan(15);
    for (const n of cited) {
      expect(rows.has(n), `row ${n}`).toBe(true);
      expect(rows.get(n), `row ${n}`).not.toMatch(/\| UNVERIFIED|\| CONFLICT/);
    }
  });
  it('the conflicting Field1950 file is flagged and never an anchor', () => {
    expect(modules.conflictNote).toMatch(/Field - 1950/);
    expect(modules.anchors.some((a) => /Field1950/i.test(a.photo))).toBe(false);
  });
});
