/**
 * Polyline helpers for the Module 3 measurement path (content/flowline.json).
 * Pure functions, no three.js, so unit tests and text mode share them.
 * Points are scene metres { x, z } (x east, z south).
 * @module systems/flowline
 */

/** Total horizontal length (m) of a polyline. */
export function pathLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return d;
}

/** Cumulative distance (m) at each vertex. */
export function cumulative(points) {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return out;
}

/**
 * Point at distance `s` (m) along the polyline, clamped to [0, length].
 * Returns { x, z, elev, s } with elev linearly interpolated when vertices carry it.
 */
export function pointAtDistance(points, s) {
  const cum = cumulative(points);
  const total = cum[cum.length - 1];
  const t = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < t) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const f = (t - cum[i - 1]) / seg;
  const a = points[i - 1], b = points[i];
  const lerp = (u, v) => u + (v - u) * f;
  return {
    x: lerp(a.x, b.x),
    z: lerp(a.z, b.z),
    elev: a.elev != null && b.elev != null ? lerp(a.elev, b.elev) : null,
    s: t,
  };
}

/**
 * Measurement between two markers placed at along-path distances sA and sB.
 * along = |sB - sA| (distance following the valley path);
 * straight = straight-line horizontal distance between the two points.
 */
export function measureBetween(points, sA, sB) {
  const a = pointAtDistance(points, sA);
  const b = pointAtDistance(points, sB);
  return { a, b, along: Math.abs(b.s - a.s), straight: Math.hypot(b.x - a.x, b.z - a.z) };
}

/** Is a measured value within an absolute tolerance of a reference? */
export function withinTolerance(value, reference, tolerance) {
  return Number.isFinite(value) && Math.abs(value - reference) <= tolerance;
}

/** Format metres as km with one decimal (en-US). */
export function km(m, digits = 1) {
  return `${(m / 1000).toFixed(digits)} km`;
}
