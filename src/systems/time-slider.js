/**
 * Time slider across the VERIFIED photo years only (1941, 1950, 2004), plus a
 * same-viewpoint swipe compare. Keyboard: arrow keys step by date; the slider
 * announces the date and the published retreat figure (aria-valuetext).
 * No intermediate dates or terminus positions are shown (none are verified).
 * @module systems/time-slider
 */
import { h, sourceLine } from '../ui/dom.js';
import { announce } from '../a11y/announcer.js';

const BASE = () => import.meta.env.BASE_URL || './';
const fmtDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** Text read out by screen readers for an anchor. */
export function anchorValueText(a) {
  return `${fmtDate(a.date)}. Retreat since 1941: ${a.retreatSince1941.text}.`;
}

/**
 * @param {object} opts
 * @param {object[]} opts.anchors   modules.json anchors
 * @param {string} opts.conflictNote
 * @param {string} opts.terrainNote
 * @param {(a:object)=>void} [opts.onChange]
 */
export function timeSlider({ anchors, conflictNote, terrainNote, onChange }) {
  const wrap = h('section', { class: 'time-slider', 'aria-labelledby': 'ts-h' });
  wrap.append(h('h3', { id: 'ts-h' }, 'Time slider: photo years'));
  const input = h('input', { type: 'range', id: 'ts-range', min: '0', max: String(anchors.length - 1), step: '1', value: '0' });
  const label = h('label', { for: 'ts-range' }, 'Year (use arrow keys to step by date)');
  const ticks = h('ol', { class: 'ts-ticks', 'aria-hidden': 'true' }, anchors.map((a) => h('li', {}, String(a.year))));
  const img = h('img', { class: 'ts-photo', width: '1600', height: '1060', alt: '' });
  const cap = h('figcaption', {});
  const fig = h('figure', { class: 'ts-figure' }, img, cap);
  const stat = h('p', { class: 'ts-stat', 'aria-live': 'polite' });
  const srcEl = h('div', {});

  const render = (i) => {
    const a = anchors[i];
    img.src = `${BASE()}${a.photo}`;
    img.alt = a.alt;
    cap.textContent = `${fmtDate(a.date)}. Photograph by ${a.photographer} (USGS, public domain). ${a.caption}`;
    stat.textContent = `Retreat of Muir Glacier since 1941: ${a.retreatSince1941.text}${a.retreatSince1941.kind === 'lower bound' ? ' (a minimum, from the USGS caption)' : ''}.`;
    srcEl.replaceChildren(sourceLine(a.sources) || '');
    input.setAttribute('aria-valuetext', anchorValueText(a));
    onChange?.(a, i);
  };
  input.addEventListener('input', () => { render(+input.value); announce(anchorValueText(anchors[+input.value])); });
  wrap.append(label, input, ticks, stat, fig, srcEl,
    h('p', { class: 'note' }, 'Only these three dates are used: they are the dated USGS repeat photographs. No terminus positions in between have been verified, so none are shown.'),
    h('p', { class: 'note' }, terrainNote),
    h('p', { class: 'note conflict' }, h('strong', {}, 'Date conflict: '), conflictNote));
  render(0);
  wrap.setYear = (i) => { input.value = String(i); render(i); };
  return wrap;
}

/**
 * Same-viewpoint swipe compare of two anchors. Range input sets the split
 * (preset steps 0 / 50 / 100 via buttons, 10 % steps via arrow keys).
 */
export function swipeCompare(a, b) {
  const wrap = h('section', { class: 'swipe', 'aria-labelledby': 'sw-h' });
  wrap.append(h('h3', { id: 'sw-h' }, `Compare ${a.year} and ${b.year} (same viewpoint)`));
  const under = h('img', { src: `${BASE()}${b.photo}`, alt: `${b.year}: ${b.alt}`, width: '1600', height: '1060' });
  const over = h('img', { src: `${BASE()}${a.photo}`, alt: `${a.year}: ${a.alt}`, width: '1600', height: '1060', class: 'swipe-over' });
  const stack = h('div', { class: 'swipe-stack' }, under, over);
  const range = h('input', { type: 'range', id: 'sw-range', min: '0', max: '100', step: '10', value: '50' });
  const set = (v) => {
    range.value = String(v);
    over.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    range.setAttribute('aria-valuetext', `${v}% of the view shows ${a.year}, ${100 - v}% shows ${b.year}`);
  };
  range.addEventListener('input', () => set(+range.value));
  const presets = h('div', { class: 'btn-row', role: 'group', 'aria-label': 'Swipe presets' },
    h('button', { type: 'button', onclick: () => { set(100); announce(`Showing ${a.year}`); } }, `All ${a.year}`),
    h('button', { type: 'button', onclick: () => { set(50); announce('Half and half'); } }, 'Half'),
    h('button', { type: 'button', onclick: () => { set(0); announce(`Showing ${b.year}`); } }, `All ${b.year}`));
  wrap.append(stack, h('label', { for: 'sw-range' }, `Swipe: left part ${a.year}, right part ${b.year}`), range, presets,
    h('p', { class: 'caption-pair' }, `${fmtDate(a.date)}, ${a.photographer}. ${fmtDate(b.date)}, ${b.photographer}. Both USGS, public domain.`));
  set(50);
  return wrap;
}
