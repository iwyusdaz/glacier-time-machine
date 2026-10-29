/**
 * Time-slider transition logic for the v2 living scene (pure, no three.js).
 *
 * HONESTY RULE (design/art-bible.md §7): the ice front is placed ONLY from the
 * three dated anchors (USGS repeat photographs). Each anchor carries a published
 * minimum retreat since 1941 (0, >3 km, >7 km). The front is drawn along the
 * DEM valley path (content/flowline.json), measured back from the path's upper
 * end (the Muir Glacier place-name coordinate, NOT a dated terminus):
 *   s(anchor) = L - (maxRetreat - retreat(anchor)) * 1000
 * so 2004 sits at the path end, 1950 4 km down-valley, 1941 7 km down-valley.
 * These are illustrative placements from lower bounds, not surveyed positions.
 * Any year between two anchors is interpolated for the animation only and is
 * labelled "Between dated anchors: illustrative, not measured".
 * @module systems/time-front
 */

export const BETWEEN_LABEL = 'Between dated anchors: illustrative, not measured';

/** Sorted anchor list [{year, retreatKm}] from modules.json anchors. */
export function anchorTable(anchors) {
  return anchors
    .map((a) => ({ year: a.year, retreatKm: a.retreatSince1941.value, id: a.id }))
    .sort((a, b) => a.year - b.year);
}

/** Is `year` exactly one of the dated anchors? */
export function isAnchorYear(year, anchors) {
  return anchorTable(anchors).some((a) => a.year === year);
}

/**
 * Along-path distance (m) of the illustrative ice front for `year`.
 * Returns { s, measured: false, anchor: boolean, between: boolean }.
 * `measured` is always false: no position here is a surveyed terminus.
 */
export function frontForYear(year, anchors, pathLengthM) {
  const t = anchorTable(anchors);
  const maxR = t[t.length - 1].retreatKm;
  const sOf = (r) => pathLengthM - (maxR - r) * 1000;
  if (year <= t[0].year) return { s: sOf(t[0].retreatKm), measured: false, anchor: year === t[0].year, between: false };
  if (year >= t[t.length - 1].year) {
    return { s: sOf(maxR), measured: false, anchor: year === t[t.length - 1].year, between: false };
  }
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], b = t[i];
    if (year <= b.year) {
      if (year === b.year) return { s: sOf(b.retreatKm), measured: false, anchor: true, between: false };
      const f = (year - a.year) / (b.year - a.year);
      const r = a.retreatKm + (b.retreatKm - a.retreatKm) * f;
      return { s: sOf(r), measured: false, anchor: false, between: true };
    }
  }
  return { s: sOf(maxR), measured: false, anchor: false, between: false };
}

/**
 * Relative ice thickness for the drawn tongue: 1 in 1941, thinner by 1950
 * (the 1950 caption: thinned more than 100 m), 0 by 2004 (out of view).
 * Illustrative shape factor, not a measured thickness.
 */
export function thicknessForYear(year, anchors) {
  const t = anchorTable(anchors);
  const y0 = t[0].year, y1 = t[t.length - 1].year;
  if (year <= y0) return 1;
  if (year >= y1) return 0;
  const mid = t[1]?.year ?? (y0 + y1) / 2;
  if (year <= mid) return 1 - 0.4 * ((year - y0) / (mid - y0));
  return 0.6 * (1 - (year - mid) / (y1 - mid));
}

/** Grade amount: 1 = warm sepia archive (oldest anchor), 0 = cool modern. */
export function pastAmount(year, anchors) {
  const t = anchorTable(anchors);
  const y0 = t[0].year, y1 = t[t.length - 1].year;
  return Math.min(1, Math.max(0, (y1 - year) / (y1 - y0)));
}

/** Illustrative forest cover factor (succession): sparse in 1941, full by 2004. */
export function forestForYear(year, anchors) {
  return 0.15 + 0.85 * (1 - pastAmount(year, anchors));
}

/** On-screen label text for the 3D view at `year`. */
export function timeLabel(year, anchors) {
  const y = Math.round(year);
  if (isAnchorYear(y, anchors)) {
    return `${y}: dated anchor (USGS repeat photograph). Ice front drawn from the published minimum retreat; position illustrative, not surveyed.`;
  }
  return `${y}. ${BETWEEN_LABEL}.`;
}

/**
 * Animation from one year to another: returns year(t) for t in [0, duration].
 * Reduced motion (duration 0) snaps.
 */
export function transitionYear(fromYear, toYear, t, duration) {
  if (!(duration > 0) || t >= duration) return toYear;
  const u = Math.max(0, t / duration);
  const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  return fromYear + (toYear - fromYear) * k;
}
