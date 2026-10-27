/**
 * Pure scoring and calculation logic shared by 3D mode and text mode.
 * No DOM, no three.js: unit-tested in tests/unit/logic.test.js.
 * @module learning/logic
 */

/**
 * Lower-bound average rate from a "more than X km over Y years" statement.
 * Returns { rate, kind: 'lower bound' }; rate in km/yr.
 */
export function lowerBoundRate(minKm, fromYear, toYear) {
  const years = toYear - fromYear;
  if (!(years > 0) || !Number.isFinite(minKm)) throw new Error('need a positive time span and a finite distance');
  return { rate: minKm / years, years, kind: 'lower bound' };
}

/** Parse a learner's numeric answer ("0.33", "0,33", " .33 km/yr"). NaN if none. */
export function parseNumber(text) {
  const m = String(text ?? '').replace(',', '.').match(/-?\d*\.?\d+/);
  return m ? parseFloat(m[0]) : NaN;
}

/** Check a numeric answer against { answer, tolerance }. */
export function checkNumeric(value, { answer, tolerance }) {
  const v = typeof value === 'number' ? value : parseNumber(value);
  return { value: v, correct: Number.isFinite(v) && Math.abs(v - answer) <= tolerance };
}

/**
 * Rate table from dated anchors. Each anchor: { year, retreatSince1941: { value, kind } }.
 * Returns one row per interval from the first anchor, all as lower bounds
 * (the published values are minimums), and NEVER any interpolated rows.
 */
export function anchorRates(anchors) {
  const base = anchors[0];
  return anchors.slice(1).map((a) => ({
    period: `${base.year}-${a.year}`,
    years: a.year - base.year,
    minKm: a.retreatSince1941.value,
    minRate: a.retreatSince1941.value / (a.year - base.year),
    kind: 'lower bound',
  }));
}

/**
 * Score change tags: selected = Set/array of tag ids.
 * Returns { hits, misses (true tags not chosen), falseAlarms, total, perTag }.
 */
export function scoreChangeTags(tags, selected) {
  const sel = new Set(selected);
  const perTag = tags.map((t) => ({ id: t.id, chosen: sel.has(t.id), correct: t.correct, right: sel.has(t.id) === t.correct }));
  return {
    hits: perTag.filter((p) => p.chosen && p.correct).length,
    misses: perTag.filter((p) => !p.chosen && p.correct).length,
    falseAlarms: perTag.filter((p) => p.chosen && !p.correct).length,
    total: tags.filter((t) => t.correct).length,
    perTag,
  };
}

/** Score an evidence sort: answers = { cardId: categoryId }. */
export function scoreEvidenceSort(cards, answers) {
  const perCard = cards.map((c) => ({ id: c.id, chosen: answers[c.id] ?? null, right: answers[c.id] === c.category }));
  return { correct: perCard.filter((p) => p.right).length, total: cards.length, unanswered: perCard.filter((p) => p.chosen == null).length, perCard };
}

/**
 * Score a sequence order: order = array of stage ids as arranged by the learner.
 * Returns { correctPositions, total, exact }.
 */
export function scoreSequence(stages, order) {
  const expected = stages.map((s) => s.id);
  const correctPositions = expected.filter((id, i) => order[i] === id).length;
  return { correctPositions, total: expected.length, exact: correctPositions === expected.length };
}

/** Move item at index i by delta (-1 up, +1 down) in a copy of arr. */
export function moveItem(arr, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return arr.slice();
  const out = arr.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Deterministic shuffle (seeded) so text mode and 3D mode show the same order. */
export function seededShuffle(arr, seed = 7) {
  const out = arr.slice();
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Total and per-shot duration check for a cinematics.json document. */
export function cinematicBudget(doc, { maxShot = 25, maxTotal = 90 } = {}) {
  const shots = doc.cinematics.flatMap((c) => c.shots || []);
  const total = shots.reduce((s, x) => s + (x.duration || 0), 0);
  return { total, ok: total <= maxTotal && shots.every((x) => x.duration <= maxShot), shots: shots.length };
}
