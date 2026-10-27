/**
 * Course renderers: ONE renderer per module, used by both the 3D task panel and
 * text mode, so every objective and assessment decision is identical in both
 * (parity by construction). 3D-only extras (path drawn on terrain, cinematics)
 * come through ctx hooks and are optional.
 * @module learning/course
 */
import { h, sourceLine, feedback } from '../ui/dom.js';
import { announce } from '../a11y/announcer.js';
import { mcItem } from './assess.js';
import { lowerBoundRate, checkNumeric, scoreChangeTags } from './logic.js';
import { timeSlider, swipeCompare } from '../systems/time-slider.js';
import { measureWidget, rateChart } from '../systems/measure-terminus.js';
import { renderM4, renderM5 } from './course-late.js';

/**
 * @typedef {object} CourseCtx
 * @property {object} content   { modules, items, cards, flowline, cinematics }
 * @property {import('./record.js').LearningRecord} record
 * @property {'3d'|'text'} mode
 * @property {(id:string)=>void} [playCinematic]
 * @property {(m:object|null)=>void} [onMarkers]
 * @property {(flag:boolean)=>void} [setAssessing]
 */

/** Render module `index` (0-4) into `container`. */
export function renderModule(index, container, ctx) {
  const mod = ctx.content.modules.modules[index];
  container.replaceChildren();
  container.append(h('h2', { class: 'module-title', tabindex: '-1' }, mod.title), h('p', { class: 'objective' }, `Objective ${mod.objective}: ${OBJECTIVES[mod.objective]}`), h('p', {}, mod.intro));
  const fns = [renderM1, renderM2, renderM3, renderM4, renderM5];
  fns[index](container, mod, ctx);
  ctx.record.log('experienced', { id: `module/${mod.id}`, name: mod.title });
}

export const OBJECTIVES = {
  1: 'Explain how glaciers move and how a terminus advances or retreats.',
  2: 'Use repeat photography to identify specific landscape changes (ice loss, exposed rock, vegetation, water).',
  3: 'Measure retreat and calculate a rate with stated uncertainty.',
  4: 'Explain the change using multiple causes and say what the evidence can and cannot show.',
  5: 'Predict a future landscape state and justify the prediction with evidence.',
};

/** Item set (pre/post/transfer) with per-item feedback and a summary. Marks assessment state. */
export function itemSet({ items, container, ctx, setId, heading, label }) {
  const sec = h('section', { class: 'item-set', 'data-set': setId, 'aria-labelledby': `${setId}-h` }, h('h3', { id: `${setId}-h` }, heading));
  if (label) sec.append(h('p', { class: 'note constructed' }, label));
  const summary = h('p', { class: 'set-summary', role: 'status' });
  const answers = new Map();
  ctx.setAssessing?.(true);
  for (const item of items) {
    mcItem({
      item, container: sec,
      onAnswered: (r) => {
        answers.set(item.id, r);
        ctx.record.log('answered', { id: `item/${item.id}`, name: item.prompt }, { response: r.chosen, success: r.correct });
        if (answers.size === items.length) {
          const correct = [...answers.values()].filter((a) => a.correct).length;
          summary.textContent = `${heading}: ${correct} of ${items.length} correct. Every answer shows why, right or wrong.`;
          ctx.record.log('completed', { id: `set/${setId}`, name: heading }, { score: { raw: correct, max: items.length } });
          ctx.setAssessing?.(false);
          announce(summary.textContent);
        }
      },
    });
    const last = sec.lastElementChild;
    last.dataset.itemId = item.id;
    const src = sourceLine(item.sources);
    if (src) last.append(src);
  }
  sec.append(summary);
  container.append(sec);
  return sec;
}

function renderM1(c, mod, ctx) {
  itemSet({ items: ctx.content.items.pre, container: c, ctx, setId: 'pre', heading: 'Pre-check (5 questions, not graded)' });
  const learn = h('section', { 'aria-labelledby': 'm1-learn' }, h('h3', { id: 'm1-learn' }, 'How a glacier moves'));
  if (ctx.mode === '3d' && ctx.playCinematic) {
    learn.append(h('p', {}, h('button', { type: 'button', class: 'primary', 'data-cinematic': 's1-flyover', onclick: () => ctx.playCinematic('s1-flyover') }, 'Play the flyover up Muir Inlet (25 s, captioned, skippable)')));
  } else {
    const shot = ctx.content.cinematics.cinematics[0].shots[0];
    learn.append(h('p', { class: 'note' }, `Flyover description: ${shot.audioDescription}`));
  }
  learn.append(h('ul', {}, mod.facts.map((f) => h('li', {}, f.text, ' ', h('span', { class: 'source-inline' }, `(sources ${f.sources.join(', ')})`)))));
  c.append(learn);
  const item = ctx.content.items.post.find((i) => i.objective === 1);
  const check = h('section', { 'aria-labelledby': 'm1-check' }, h('h3', { id: 'm1-check' }, 'Check your understanding'));
  mcItem({ item, container: check, onAnswered: (r) => ctx.record.log('answered', { id: `item/${item.id}-m1`, name: item.prompt }, { response: r.chosen, success: r.correct }) });
  c.append(check);
}

function renderM2(c, mod, ctx) {
  const anchors = ctx.content.modules.anchors;
  const [a, b] = mod.pair.map((id) => anchors.find((x) => x.id === id));
  c.append(h('p', { class: 'note' }, mod.alignmentNote), swipeCompare(a, b));
  const sec = h('section', { class: 'change-tags', 'aria-labelledby': 'tags-h' }, h('h3', { id: 'tags-h' }, 'Tag the changes you can see (choose all that apply)'));
  const fs = h('fieldset', {}, h('legend', {}, 'Which of these changed between 1941 and 2004?'));
  for (const t of mod.changeTags) {
    fs.append(h('label', { class: 'choice' }, h('input', { type: 'checkbox', name: 'change-tag', value: t.id }), ` ${t.label}`));
  }
  const out = h('div', {});
  const btn = h('button', { type: 'button', class: 'primary' }, 'Check my tags');
  btn.addEventListener('click', () => {
    const chosen = [...fs.querySelectorAll('input:checked')].map((i) => i.value);
    const s = scoreChangeTags(mod.changeTags, chosen);
    const list = h('ul', { class: 'tag-feedback' }, s.perTag.map((p) => {
      const t = mod.changeTags.find((x) => x.id === p.id);
      return h('li', {}, h('strong', {}, `${t.label}: `), t.correct ? (p.chosen ? 'found. ' : 'missed. ') : (p.chosen ? 'not supported. ' : 'correctly left out. '), t.why, t.sources ? ` (sources ${t.sources.join(', ')})` : '');
    }));
    const ok = s.hits === s.total && s.falseAlarms === 0;
    out.replaceChildren(feedback(`You found ${s.hits} of ${s.total} supported changes, with ${s.falseAlarms} unsupported tag${s.falseAlarms === 1 ? '' : 's'}.`, ok), list);
    ctx.record.log('answered', { id: 'task/m2-change-tags', name: 'Change tagging' }, { response: chosen.join(','), success: ok, score: { raw: s.hits, max: s.total } });
  });
  sec.append(fs, btn, out);
  c.append(sec);
}

function renderM3(c, mod, ctx) {
  const anchors = ctx.content.modules.anchors;
  c.append(timeSlider({ anchors, conflictNote: ctx.content.modules.conflictNote, terrainNote: ctx.content.modules.terrainNote }));
  c.append(h('p', { class: 'note' }, mod.noInterpolation));
  for (const task of mod.measureTasks) {
    c.append(measureWidget({
      flowline: ctx.content.flowline, task, onMarkers: ctx.onMarkers,
      onResult: (r) => ctx.record.log('answered', { id: `task/${task.id}`, name: task.prompt }, { response: String(r.measuredM), success: r.correct }),
    }));
  }
  const rates = h('section', { class: 'rate-tasks', 'aria-labelledby': 'rate-h' }, h('h3', { id: 'rate-h' }, 'Calculate a rate'));
  for (const t of mod.rateTasks) {
    const id = `${t.id}-in`;
    const input = h('input', { type: 'text', id, inputmode: 'decimal', autocomplete: 'off', size: '8' });
    const out = h('div', {});
    const btn = h('button', { type: 'button' }, 'Check');
    btn.addEventListener('click', () => {
      const r = checkNumeric(input.value, t);
      const msg = r.correct
        ? `About ${t.answer.toFixed(2)} ${t.unit}. Because the source says "more than", this is a lower bound: the real average was at least this fast.`
        : `Divide distance by years. The answer is about ${t.answer.toFixed(2)} ${t.unit}, and it is a minimum.`;
      out.replaceChildren(feedback(msg, r.correct));
      ctx.record.log('answered', { id: `task/${t.id}`, name: t.prompt }, { response: input.value, success: r.correct });
    });
    rates.append(h('div', { class: 'rate-task' }, h('label', { for: id }, `${t.prompt} (${t.unit})`), input, btn, out));
  }
  const lb = lowerBoundRate(3, 1941, 1950), lb2 = lowerBoundRate(7, 1941, 2004);
  rates.append(h('p', { class: 'note' }, `Uncertainty: both rates are lower bounds (${lb.rate.toFixed(2)} and ${lb2.rate.toFixed(2)} km/yr at least). The faster 1941–1950 minimum shows the rate was not constant, but how it varied between the dates is not measured here.`));
  c.append(rates, rateChart(anchors));
  const bound = h('section', { 'aria-labelledby': 'm3-check' }, h('h3', { id: 'm3-check' }, 'Check your understanding'));
  const item = ctx.content.items.post.find((i) => i.objective === 3);
  mcItem({ item, container: bound, onAnswered: (r) => ctx.record.log('answered', { id: `item/${item.id}-m3`, name: item.prompt }, { response: r.chosen, success: r.correct }) });
  c.append(bound);
}
