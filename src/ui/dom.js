/**
 * Tiny DOM helpers for the course renderers (no framework).
 * @module ui/dom
 */

/** h('p', { class: 'x', 'aria-live': 'polite' }, 'text', childNode) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** "Sources: rows 9, 11" line linking to the in-repo register by row number. */
export function sourceLine(sources) {
  const list = [].concat(sources || []).filter((x) => x != null);
  if (!list.length) return null;
  return h('p', { class: 'source-line' }, `Source: research/sources.md row${list.length > 1 ? 's' : ''} ${list.join(', ')}`);
}

/** Feedback box that is also announced politely. */
export function feedback(text, ok) {
  return h('div', { class: `feedback ${ok === true ? 'ok' : ok === false ? 'not-yet' : ''}`, role: 'status' },
    h('p', {}, ok === true ? h('strong', {}, 'Correct. ') : ok === false ? h('strong', {}, 'Not yet. ') : null, text));
}
