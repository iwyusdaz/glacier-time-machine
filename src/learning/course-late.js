/**
 * Modules 4 (predict-observe-explain + succession) and 5 (evidence sort,
 * confidence statement, rubric self-check, post-check and transfer).
 * Shared by 3D mode and text mode (see course.js).
 * @module learning/course-late
 */
import { h, sourceLine, sourceInline, feedback } from '../ui/dom.js';
import { announce } from '../a11y/announcer.js';
import { rubricSelfCheck } from './assess.js';
import { scoreSequence, moveItem, seededShuffle, scoreEvidenceSort } from './logic.js';
import { itemSet } from './course.js';

const BASE = () => import.meta.env.BASE_URL || './';

export function renderM4(c, mod, ctx) {
  const anchors = ctx.content.modules.anchors;
  const obsAnchor = anchors.find((a) => a.id === mod.observe.anchor);
  const before = anchors.find((a) => a.id === 'y1950');
  // PREDICT
  const p = h('section', { class: 'poe', 'aria-labelledby': 'poe-p' }, h('h3', { id: 'poe-p' }, 'Predict'));
  p.append(h('figure', {}, h('img', { src: `${BASE()}${before.photo}`, alt: before.alt, width: '1600', height: '1060' }), h('figcaption', {}, `1950 (W. O. Field, USGS). ${before.caption}`)));
  const fs = h('fieldset', {}, h('legend', {}, mod.predict.prompt), mod.predict.options.map((o) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'poe-predict', value: o.id }), ` ${o.text}`)));
  const why = h('textarea', { id: 'poe-why', rows: '3', cols: '50' });
  const lock = h('button', { type: 'button', class: 'primary' }, 'Lock in my prediction');
  const observe = h('section', { class: 'poe-observe', 'aria-labelledby': 'poe-o', hidden: true });
  let predictWarn = null;
  p.append(fs, h('label', { for: 'poe-why' }, 'Why do you think so? (optional, not graded)'), why, lock);
  lock.addEventListener('click', () => {
    const sel = fs.querySelector('input:checked');
    if (!sel) {
      // Visible inline feedback (cognitive walkthrough step 13): the refusal was
      // previously announce-only, so sighted users saw a dead button.
      announce('Choose a prediction first');
      predictWarn?.remove();
      predictWarn = h('p', { class: 'feedback not-yet', role: 'status' }, 'Choose a prediction first, then lock it in.');
      fs.insertAdjacentElement('afterend', predictWarn);
      return;
    }
    predictWarn?.remove();
    ctx.record.log('answered', { id: 'task/m4-predict', name: mod.predict.prompt }, { response: sel.value, success: sel.value === mod.predict.observed });
    for (const i of fs.querySelectorAll('input')) i.disabled = true;
    lock.disabled = true;
    observe.hidden = false;
    const match = sel.value === mod.predict.observed;
    observe.querySelector('.poe-result').replaceChildren(feedback(match ? 'Your prediction matches the 2004 photo.' : `The 2004 photo shows: ${mod.predict.options.find((o) => o.id === mod.predict.observed).text.toLowerCase()}. Compare that with your prediction.`, match));
    observe.querySelector('h3').focus();
  });
  // OBSERVE
  observe.append(h('h3', { id: 'poe-o', tabindex: '-1' }, 'Observe'),
    h('figure', {}, h('img', { src: `${BASE()}${obsAnchor.photo}`, alt: obsAnchor.alt, width: '1600', height: '1060' }), h('figcaption', {}, `2004 (Bruce F. Molnia, USGS). ${mod.observe.text}`)),
    h('div', { class: 'poe-result' }), sourceLine(mod.observe.sources));
  // Succession sequencing (keyboard: move up/down buttons)
  const S = mod.succession;
  let order = seededShuffle(S.stages.map((s) => s.id), 11);
  const list = h('ol', { class: 'seq-list', 'aria-label': 'Succession stages, your order' });
  const seqOut = h('div', {});
  const draw = (focusId) => {
    list.replaceChildren(...order.map((id, i) => {
      const st = S.stages.find((s) => s.id === id);
      return h('li', { 'data-stage': id }, h('span', {}, st.text), ' ',
        h('button', { type: 'button', 'aria-label': `Move "${st.text}" earlier`, disabled: i === 0, 'data-dir': 'up', onclick: () => { order = moveItem(order, i, -1); draw(id); announce(`${st.text} moved to position ${i}`); } }, 'Earlier'),
        h('button', { type: 'button', 'aria-label': `Move "${st.text}" later`, disabled: i === order.length - 1, 'data-dir': 'down', onclick: () => { order = moveItem(order, i, 1); draw(id); announce(`${st.text} moved to position ${i + 2}`); } }, 'Later'));
    }));
    if (focusId) list.querySelector(`[data-stage="${focusId}"] button:not([disabled])`)?.focus();
  };
  draw();
  const seqBtn = h('button', { type: 'button' }, 'Check order');
  seqBtn.addEventListener('click', () => {
    const r = scoreSequence(S.stages, order);
    seqOut.replaceChildren(feedback(r.exact ? 'That is the order NPS describes.' : `${r.correctPositions} of ${r.total} in the NPS order. NPS order: ${S.stages.map((s) => s.text).join(' → ')}.`, r.exact));
    ctx.record.log('answered', { id: 'task/m4-sequence', name: 'Succession order' }, { response: order.join(','), success: r.exact });
  });
  observe.append(h('h4', {}, 'What grows first? Put the stages in order'), h('p', {}, S.intro), list, seqBtn, seqOut,
    h('p', { class: 'note' }, S.timingNote), sourceLine(S.sources));
  // EXPLAIN
  const ex = h('textarea', { id: 'poe-explain', rows: '4', cols: '50' });
  const save = h('button', { type: 'button' }, 'Save my explanation');
  const saved = h('p', { role: 'status' });
  save.addEventListener('click', () => {
    ctx.record.log('answered', { id: 'task/m4-explain', name: mod.explainPrompt }, { response: ex.value.slice(0, 2000) });
    saved.textContent = 'Saved on this device only. Explanations are not auto-graded.';
  });
  observe.append(h('h4', {}, 'Explain'), h('label', { for: 'poe-explain' }, mod.explainPrompt), ex, save, saved);
  c.append(p, observe);
}

export function renderM5(c, mod, ctx) {
  const { categories, cards } = ctx.content.cards;
  const sort = h('section', { class: 'evidence-sort', 'aria-labelledby': 'es-h' }, h('h3', { id: 'es-h' }, 'Sort the cards: claim or evidence?'));
  const answers = {};
  const grid = h('ul', { class: 'card-list' });
  for (const card of seededShuffle(cards, 5)) {
    const fs = h('fieldset', { class: 'card', 'data-card': card.id }, h('legend', {}, card.text),
      categories.map((cat) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: `card-${card.id}`, value: cat.id, onchange: () => { answers[card.id] = cat.id; } }), ` ${cat.label}`)));
    grid.append(h('li', {}, fs));
  }
  const out = h('div', {});
  const btn = h('button', { type: 'button', class: 'primary' }, 'Check my sort');
  btn.addEventListener('click', () => {
    const r = scoreEvidenceSort(cards, answers);
    out.replaceChildren(feedback(`${r.correct} of ${r.total} sorted as intended${r.unanswered ? ` (${r.unanswered} not sorted yet)` : ''}.`, r.correct === r.total),
      h('ul', {}, r.perCard.map((p) => { const cd = cards.find((x) => x.id === p.id); return h('li', {}, h('strong', {}, `${p.right ? 'Yes' : 'Look again'}: `), cd.text, ' — ', cd.why, ' ', sourceInline(cd.sources)); })));
    ctx.record.log('answered', { id: 'task/m5-evidence-sort', name: 'Evidence sort' }, { response: JSON.stringify(answers), success: r.correct === r.total, score: { raw: r.correct, max: r.total } });
  });
  sort.append(h('p', { class: 'note constructed' }, 'Claim cards are statements written for this activity (constructed for teaching purposes). Evidence cards quote or summarize the cited sources.'), grid, btn, out);
  // Confidence statement + rubric
  const cs = h('section', { 'aria-labelledby': 'cs-h' }, h('h3', { id: 'cs-h' }, 'Your confidence statement'), h('p', { class: 'note' }, mod.gaps));
  const ta = h('textarea', { id: 'cs-text', rows: '5', cols: '50' });
  cs.append(h('label', { for: 'cs-text' }, 'What caused the retreat, how sure are you, and what would you need to be more sure?'), ta);
  const exemplar = h('details', {}, h('summary', {}, 'Show an example answer'), h('p', {}, mod.exemplar));
  rubricSelfCheck({ criteria: mod.rubric, container: cs, onComplete: (ratings) => {
    ctx.record.log('answered', { id: 'task/m5-confidence', name: 'Confidence statement' }, { response: ta.value.slice(0, 2000), extensions: { selfCheck: ratings } });
    announce('Self-check saved');
  } });
  cs.append(exemplar);
  c.append(sort, cs);
  // Post-check + transfer
  itemSet({ items: ctx.content.items.post, container: c, ctx, setId: 'post', heading: 'Post-check (5 questions)' });
  const tr = ctx.content.items.transfer;
  c.append(h('p', {}, h('strong', {}, 'Transfer scenario: '), tr.scenario));
  itemSet({ items: tr.items, container: c, ctx, setId: 'transfer', heading: 'Transfer: a different glacier', label: tr.label });
  // End-of-course completion state (cognitive walkthrough step 20: the course
  // previously ended on the transfer items with no wrap-up).
  const OBJECTIVES = [
    'Explain how glaciers move and how a terminus advances or retreats.',
    'Identify landscape changes in repeat photography.',
    'Measure retreat and calculate a lower-bound rate with stated uncertainty.',
    'Explain change with multiple causes and say what the evidence cannot show.',
    'Predict a future state and justify it with evidence.',
  ];
  c.append(h('section', { class: 'course-complete', 'aria-labelledby': 'cc-h' },
    h('h3', { id: 'cc-h' }, 'Course complete — what you can do now'),
    h('ul', {}, OBJECTIVES.map((o) => h('li', {}, o))),
    h('p', { class: 'note' }, 'Your answers and scores are saved only on this device. Review or download them any time from Menu → My progress.')));
  ctx.record.log('completed', { id: 'course/glacier-time-machine', name: 'Glacier Time Machine (Module 5 reached the wrap-up)' });
}
