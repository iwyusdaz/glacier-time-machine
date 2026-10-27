/**
 * Distance measurement along the DEM-derived valley path (content/flowline.json)
 * and the rate chart built ONLY from the verified anchors.
 *
 * Measurement widget: two markers (A, B) stepped along the path by keyboard
 * (sliders, 100 m steps; Page Up/Down = 1 km) or buttons. In 3D mode the
 * scene draws the path and markers on the terrain (onMarkers callback).
 * @module systems/measure-terminus
 */
import { h, sourceLine, feedback } from '../ui/dom.js';
import { announce } from '../a11y/announcer.js';
import { measureBetween, pathLength, withinTolerance, km } from './flowline.js';
import { anchorRates } from '../learning/logic.js';

/**
 * @param {object} opts
 * @param {object} opts.flowline   content/flowline.json
 * @param {object} opts.task       modules.json measureTasks[i]
 * @param {(m:object)=>void} [opts.onMarkers]  3D hook: receives measureBetween() result
 * @param {(r:object)=>void} [opts.onResult]
 */
export function measureWidget({ flowline, task, onMarkers, onResult }) {
  const pts = flowline.points;
  const total = pathLength(pts);
  const maxV = Math.round(total);
  const wrap = h('section', { class: 'measure', 'aria-labelledby': `${task.id}-h` });
  wrap.append(h('h3', { id: `${task.id}-h` }, 'Measure on the terrain'), h('p', {}, task.prompt));
  const mk = (id, name, value) => {
    const input = h('input', { type: 'range', id, min: '0', max: String(maxV), step: '100', value: String(value) });
    return { input, label: h('label', { for: id }, `${name} position along the path (100 m steps; Page Up and Page Down move 1 km)`) };
  };
  const A = mk(`${task.id}-a`, 'Marker A', 0);
  const B = mk(`${task.id}-b`, 'Marker B', Math.round(maxV / 2 / 100) * 100);
  const readout = h('p', { class: 'measure-readout', 'aria-live': 'polite' });
  const out = h('div', {});

  const update = (say) => {
    const m = measureBetween(pts, +A.input.value, +B.input.value);
    A.input.setAttribute('aria-valuetext', `Marker A at ${km(m.a.s)} along the path`);
    B.input.setAttribute('aria-valuetext', `Marker B at ${km(m.b.s)} along the path`);
    readout.textContent = `Distance between markers: ${km(m.along, 2)} along the path (${km(m.straight, 2)} in a straight line).`;
    onMarkers?.(m);
    if (say) announce(readout.textContent);
    return m;
  };
  for (const x of [A, B]) {
    x.input.addEventListener('input', () => update(false));
    x.input.addEventListener('change', () => update(true));
  }
  const ends = h('div', { class: 'btn-row', role: 'group', 'aria-label': 'Marker shortcuts' },
    h('button', { type: 'button', onclick: () => { A.input.value = '0'; update(true); } }, 'A to path start (Muir Inlet)'),
    h('button', { type: 'button', onclick: () => { B.input.value = String(maxV); update(true); } }, 'B to path end (Muir Glacier coordinate)'));
  const check = h('button', { type: 'button', class: 'primary' }, 'Check measurement');
  check.addEventListener('click', () => {
    const m = update(false);
    const ref = task.reference === 'pathLength' ? total : task.targetM;
    const ok = withinTolerance(m.along, ref, task.toleranceM);
    const msg = ok
      ? `${km(m.along, 2)} is within ${task.toleranceM} m of ${km(ref, 2)}. ${task.note}`
      : `You measured ${km(m.along, 2)}; aim for about ${km(ref, 1)} (within ${task.toleranceM} m). ${task.note}`;
    out.replaceChildren(feedback(msg, ok), sourceLine(task.sources) || '');
    onResult?.({ taskId: task.id, measuredM: Math.round(m.along), referenceM: Math.round(ref), correct: ok });
  });
  wrap.append(A.label, A.input, B.label, B.input, ends, readout, check, out,
    h('p', { class: 'note' }, flowline.label));
  update(false);
  wrap.setMarkers = (a, b) => { A.input.value = String(a); B.input.value = String(b); return update(false); };
  return wrap;
}

/**
 * Rate chart (SVG) + data table from the verified anchors. Points are
 * minimums; each is drawn as a dot with an upward arrow ("at least"). No line
 * joins the points, because nothing between them is measured.
 */
export function rateChart(anchors) {
  const W = 520, H = 260, L = 56, R = 16, T = 18, B = 40;
  const x = (yr) => L + ((yr - 1935) / (2010 - 1935)) * (W - L - R);
  const y = (kmv) => T + (1 - kmv / 10) * (H - T - B);
  const svgNS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, text) => {
    const el = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text != null) el.textContent = text;
    return el;
  };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'rc-title rc-desc', class: 'rate-chart' });
  svg.append(s('title', { id: 'rc-title' }, 'Muir Glacier retreat since 1941, minimum values'),
    s('desc', { id: 'rc-desc' }, 'Three points: 1941 at 0 km, 1950 at least 3 km, 2004 at least 7 km. Arrows show each value is a minimum. No line joins them because nothing in between was measured. The same values are in the table below.'));
  svg.append(s('line', { x1: L, y1: y(0), x2: W - R, y2: y(0), class: 'axis' }), s('line', { x1: L, y1: T, x2: L, y2: y(0), class: 'axis' }));
  for (const k of [0, 2, 4, 6, 8, 10]) svg.append(s('text', { x: L - 8, y: y(k) + 4, 'text-anchor': 'end', class: 'tick' }, `${k}`));
  for (const yr of [1940, 1960, 1980, 2000]) svg.append(s('text', { x: x(yr), y: H - B + 18, 'text-anchor': 'middle', class: 'tick' }, `${yr}`));
  svg.append(s('text', { x: 14, y: T + 70, transform: `rotate(-90 14 ${T + 70})`, class: 'axis-label' }, 'km since 1941'));
  anchors.forEach((a, i) => {
    const v = a.retreatSince1941.value;
    const cx = x(a.year), cy = y(v);
    if (a.retreatSince1941.kind === 'lower bound') {
      svg.append(s('line', { x1: cx, y1: cy, x2: cx, y2: y(Math.min(10, v + 1.6)), class: 'bound' }),
        s('path', { d: `M${cx - 6},${y(Math.min(10, v + 1.6)) + 8} L${cx},${y(Math.min(10, v + 1.6))} L${cx + 6},${y(Math.min(10, v + 1.6)) + 8}`, class: 'bound' }));
    }
    // Last point's label would clip at the viewBox edge (visual review V7):
    // anchor it to the left of the dot instead of the right.
    const last = i === anchors.length - 1;
    svg.append(s('circle', { cx, cy, r: 5, class: 'pt' }), s('text', {
      x: last ? cx - 9 : cx + 9, y: cy - 6, class: 'pt-label',
      'text-anchor': last ? 'end' : 'start',
    }, `${a.year}: ${v === 0 ? '0' : '>' + v} km`));
  });
  const rows = anchorRates(anchors);
  const table = h('table', {},
    h('caption', {}, 'Published minimum retreat and the lower-bound average rate'),
    h('thead', {}, h('tr', {}, ['Period', 'Years', 'Retreat (USGS caption)', 'Average rate (lower bound)'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.period), h('td', {}, String(r.years)), h('td', {}, `more than ${r.minKm} km`), h('td', {}, `at least ${r.minRate.toFixed(2)} km/yr`)))));
  return h('section', { class: 'rate', 'aria-labelledby': 'rc-h' },
    h('h3', { id: 'rc-h' }, 'Rate chart (verified anchors only)'),
    h('figure', {}, svg, h('figcaption', {}, 'Dots are published minimums; arrows mean "at least". Uncertainty: the true retreat could be larger, and the year-to-year rate is unknown between dates.')),
    table, sourceLine([9, 11]));
}
