/**
 * Revision regression tests from the agent reviews (evaluation/reviews/).
 * These pin the exact bugs the reviewer found so they cannot silently return.
 * @module tests/unit/revision-contract
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const read = (p) => readFileSync(join(root, p), 'utf8');

describe('review A1 — text-mode flyover description', () => {
  it('cinematics.json gives every shot a non-empty description and captions', () => {
    const cine = JSON.parse(read('content/cinematics.json'));
    for (const c of cine.cinematics) {
      for (const shot of c.shots) {
        expect(shot.description?.length, `${c.id} shot description`).toBeGreaterThan(10);
        expect(shot.captions?.length, `${c.id} captions`).toBeGreaterThan(0);
      }
    }
  });

  it('no renderer reads the non-existent audioDescription field any more', () => {
    for (const f of readdirSync(join(root, 'src/learning'))) {
      expect(read(`src/learning/${f}`)).not.toContain('audioDescription');
    }
  });
});

describe('review A3/T2/P4 — ungraded pre-check must not block the flyover', () => {
  it('itemSet only sets assessment state for graded sets (setId !== "pre")', () => {
    const src = read('src/learning/course.js');
    expect(src).toContain("if (setId !== 'pre') ctx.setAssessing?.(true);");
  });
});

describe('review G5 — shipped terrain meta must not assert an unverified datum', () => {
  it('verticalDatum says the datum is not verified', () => {
    const meta = JSON.parse(read('public/data/terrain-meta.json'));
    expect(meta.verticalDatum.toLowerCase()).toContain('not verified');
  });
});

describe('review T1 — in-app citations resolve to a shipped register', () => {
  it('public/sources.html covers every row number cited in content/*.json', () => {
    const html = read('public/sources.html');
    const have = new Set([...html.matchAll(/id="row-(\d+)"/g)].map((m) => Number(m[1])));
    expect(have.size).toBeGreaterThanOrEqual(40);
    const refs = new Set();
    for (const f of readdirSync(join(root, 'content'))) {
      if (!f.endsWith('.json')) continue;
      const src = read(`content/${f}`);
      for (const m of src.matchAll(/"sources"\s*:\s*\[([0-9,\s]*)\]/g)) {
        for (const n of m[1].match(/\d+/g) || []) refs.add(Number(n));
      }
    }
    expect(refs.size).toBeGreaterThan(10);
    expect([...refs].filter((n) => !have.has(n))).toEqual([]);
  });
});
