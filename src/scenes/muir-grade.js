/**
 * Grade end-points for the glacier case (design/art-bible.md §3): the "LUT" is
 * a pair of parameter sets lerped by `past` (0 = cool modern, 1 = warm sepia
 * archive for 1941). Pure: no three.js, unit-tested.
 * @module scenes/muir-grade
 */
export const GRADE_MODERN = { fog: 0xb8cfe0, sun: 0xf4f8ff, tint: 0xffffff, exposure: 1.12, sky: 0.9 };
export const GRADE_ARCHIVE = { fog: 0xcdbb9c, sun: 0xffdcae, tint: 0xf0dcc0, exposure: 1.04, sky: 0.75 };

function lerpHex(a, b, t) {
  const ch = (v, s) => (v >> s) & 255;
  let out = 0;
  for (const s of [16, 8, 0]) out |= Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return out;
}

/** Grade parameters at `past` in [0, 1]. */
export function gradeAt(past) {
  const t = Math.min(1, Math.max(0, Number(past) || 0));
  return {
    fog: lerpHex(GRADE_MODERN.fog, GRADE_ARCHIVE.fog, t),
    sun: lerpHex(GRADE_MODERN.sun, GRADE_ARCHIVE.sun, t),
    tint: lerpHex(GRADE_MODERN.tint, GRADE_ARCHIVE.tint, t),
    exposure: GRADE_MODERN.exposure + (GRADE_ARCHIVE.exposure - GRADE_MODERN.exposure) * t,
    sky: GRADE_MODERN.sky + (GRADE_ARCHIVE.sky - GRADE_MODERN.sky) * t,
  };
}
