/**
 * layout.js — glacier-time-machine's own navigation and callouts (owner
 * direction 2026-11-06: a distinct UI per repo; the template's top-bar shell is
 * not reused). Styles: src/styles/glacier-nav.css.
 *
 * - The template's one bar moves to the bottom edge and is built around the
 *   year timeline (1941 → today): module stepper and Go to at the left, the
 *   timeline in the middle, Discovered and Menu at the right. Still one bar,
 *   <= 56 px tall (ui-audit navBar "bottom", evaluation/ui-audit.config.json).
 *   The DOM order inside the bar follows the visual order, so Tab runs left to
 *   right.
 * - The timeline is a range input over the years the 3D view can show. Only
 *   1941, 1950 and 2004 are dated photos; years between are illustrative and
 *   years after 2004 keep the 2004 front (the readout and aria-valuetext say so).
 * - Info cards become translucent map callouts with a thin leader line from the
 *   card to the object (an aria-hidden SVG in the card layer, pointer-events none).
 * The template core (src/v3/) is not edited: the shell's top-bar height and
 * reserved rectangles are adapted here, on the instance.
 * @module glacier/layout
 */
import { isAnchorYear } from '../systems/time-front.js';

export const YEAR_MIN = 1941;
/** "Today" on the timeline: the date of the Sentinel-2 ground image (2024-08-06) the 3D view drapes for every year. */
export const YEAR_TODAY = 2024;

/** Short readout and full spoken text for a timeline year. Pure (unit-tested). */
export function yearReadout(year, anchors) {
  const y = Math.round(year);
  const last = Math.max(...anchors.map((a) => a.year));
  const name = y >= YEAR_TODAY ? 'Today' : String(y);
  if (isAnchorYear(y, anchors)) return { short: `${y} · dated photo`, long: `${y}, a dated photo year. The ice front is drawn from the published minimum retreat.`, kind: 'dated' };
  if (y > last) return { short: `${name} · front as ${last}`, long: `${y >= YEAR_TODAY ? `Today (${YEAR_TODAY} ground image)` : y}. No dated photo after ${last}: the ice front stays at its ${last} position.`, kind: 'after' };
  return { short: `${y} · illustrative`, long: `${y}, between dated photo years: illustrative, not measured.`, kind: 'between' };
}

/** Where a tick sits along the track, 0..1. */
export const tickAt = (year) => (year - YEAR_MIN) / (YEAR_TODAY - YEAR_MIN);

export function mountBottomBar(app, world) {
  const shell = app.shell;
  const bar = shell.topBar;
  bar.classList.add('gtm-bar');
  shell.root.dataset.nav = 'bottom';
  // The bar is at the bottom: nothing is reserved at the top for card and label placement.
  shell.topBarHeight = () => 0;
  const reserved = shell.reservedRects.bind(shell);
  shell.reservedRects = (o) => {
    const out = reserved(o);
    if (bar.offsetParent) { const r = bar.getBoundingClientRect(); out.push({ left: r.left, top: r.top - 8, right: r.right, bottom: r.bottom }); }
    return out;
  };

  // Bar order: stepper, Go to | timeline | Discovered, Menu.
  const left = document.createElement('div');
  left.className = 'gtm-bar-left';
  const right = document.createElement('div');
  right.className = 'gtm-bar-right';
  const stepper = bar.querySelector('.v3-stepper');
  const goto = bar.querySelector('[data-action="goto"]');
  left.append(stepper);
  if (goto) left.append(goto);
  right.append(bar.querySelector('[data-ui="discovered"]'), bar.querySelector('[data-action="menu"]'));

  const tl = document.createElement('div');
  tl.className = 'gtm-timeline';
  tl.dataset.ui = 'year-timeline';
  const anchors = world ? world.anchors : [];
  const ticks = [...anchors.map((a) => ({ year: a.year, text: String(a.year), dated: true })), { year: YEAR_TODAY, text: 'Today', dated: false }];
  tl.innerHTML = `
    <label class="visually-hidden" for="gtm-year-range">Year shown in the 3D view</label>
    <div class="gtm-track">
      <ol class="gtm-ticks" aria-hidden="true">${ticks.map((t) => `<li data-dated="${t.dated}" style="--at:${tickAt(t.year).toFixed(4)}"><span>${t.text}</span></li>`).join('')}</ol>
      <input id="gtm-year-range" type="range" min="${YEAR_MIN}" max="${YEAR_TODAY}" step="1" value="${YEAR_MIN}">
    </div>
    <output class="gtm-readout" for="gtm-year-range" aria-hidden="true"></output>`;
  bar.replaceChildren(left, tl, right);
  const range = tl.querySelector('input');
  const out = tl.querySelector('output');

  const show = (year) => {
    const r = yearReadout(year, anchors);
    range.value = String(Math.round(year));
    range.setAttribute('aria-valuetext', r.long);
    const [y, note] = r.short.split(' · ');
    out.innerHTML = '<b></b><span class="gtm-readout-note"></span>';
    out.firstChild.textContent = y;
    out.lastChild.textContent = ` · ${note}`;
    out.dataset.kind = r.kind;
    tl.title = r.long;
  };
  if (world) {
    // Follow every year change (lessons, year buttons, animation frames).
    const chip = world._chipText.bind(world);
    world._chipText = (y) => { chip(y); show(y); };
    show(world.year);
    // Dragging previews the frames; letting go (or a key press) sets the year, which announces it.
    range.addEventListener('input', () => world._applyYear(+range.value, false));
    range.addEventListener('change', () => world.setYear(+range.value, { animate: false }));
  }
  const sync = () => { tl.hidden = !world || app.sceneless || !shell.textModeRoot.hidden; };
  shell.on('action:textmode', () => setTimeout(sync, 0));
  sync();

  // ---- leader line from the open callout to its object ----
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'gtm-leader');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<line /><circle r="4" />';
  const line = svg.querySelector('line');
  const dot = svg.querySelector('circle');
  // After the card: the shell reserves the card layer's first child for label placement.
  shell.cardLayer.append(svg);
  const inspect = app.inspect;
  const tick = () => {
    requestAnimationFrame(tick);
    const card = inspect?.card;
    const it = inspect?.selected && inspect.items.get(inspect.selected);
    const s = it && card && !card.hidden && card.offsetParent ? inspect._screenBox(it) : null;
    if (!s) { svg.dataset.on = 'false'; return; }
    const c = card.getBoundingClientRect();
    const ox = (s.left + s.right) / 2, oy = (s.top + s.bottom) / 2;
    if (ox > c.left && ox < c.right && oy > c.top && oy < c.bottom) { svg.dataset.on = 'false'; return; }
    // Nearest point on the card's edge.
    const cx = Math.min(Math.max(ox, c.left), c.right), cy = Math.min(Math.max(oy, c.top), c.bottom);
    line.setAttribute('x1', cx.toFixed(1)); line.setAttribute('y1', cy.toFixed(1));
    line.setAttribute('x2', ox.toFixed(1)); line.setAttribute('y2', oy.toFixed(1));
    dot.setAttribute('cx', ox.toFixed(1)); dot.setAttribute('cy', oy.toFixed(1));
    svg.dataset.on = 'true';
  };
  if (inspect) requestAnimationFrame(tick);
  return { bar, timeline: tl, range, readout: out, leader: svg, show };
}
