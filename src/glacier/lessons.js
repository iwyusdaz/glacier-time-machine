/**
 * lessons.js — the five glacier modules in the v3 scene-first shell (plan 10 §2).
 *
 * Each module is a short run of steps. A step shows in the Now card: the goal,
 * one action, a control hint and one primary button (at most 60 words, plain
 * words). Tools that need room (the change list, the plant order, the card
 * sort, the confidence statement) open in the drawer on demand. Pre- and
 * post-checks run one question at a time in the card.
 *
 * Text mode renders the v2 module renderers (src/learning/course.js), which
 * use the same content, the same scoring functions and the same record ids, so
 * both modes reach the same decisions (text-mode parity). Their record calls
 * also complete the matching v3 steps here.
 * @module glacier/lessons
 */
import { AppState } from '../systems/state.js';
import { scoreAnswers, rubricSelfCheck } from '../learning/assess.js';
import { lowerBoundRate, checkNumeric, scoreChangeTags, scoreSequence, moveItem, seededShuffle, scoreEvidenceSort } from '../learning/logic.js';
import { renderModule } from '../learning/course.js';
import { rateChart } from '../systems/measure-terminus.js';
import { measureBetween, pathLength, withinTolerance, km } from '../systems/flowline.js';
import { announce } from '../a11y/announcer.js';
import { lookView } from './world.js';

const BASE = import.meta.env?.BASE_URL || './';
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const btn = (label, onClick, cls = 'v3-btn') => { const b = el('button', { type: 'button', className: cls, textContent: label }); b.addEventListener('click', onClick); return b; };
const para = (parent, text, cls) => parent.appendChild(el('p', { textContent: text, className: cls || '' }));
/** The first sentence of an explanation (cards stay short; "Why?" opens the rest). */
export function short(text) { const m = String(text || '').match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(text || '')).trim(); }

/** Module ids, stepper labels and step ids (saved progress uses the step ids). */
export const MODULES = [
  { id: 'm1', label: 'River of ice', steps: ['m1-look', 'm1-precheck', 'm1-facts', 'm1-check'] },
  { id: 'm2', label: 'Then and now', steps: ['m2-station', 'm2-compare', 'm2-tags'] },
  { id: 'm3', label: 'Measure it', steps: ['m3-years', 'm3-measure', 'm3-scale', 'm3-rate1', 'm3-rate2', 'm3-check'] },
  { id: 'm4', label: 'What came next', steps: ['m4-predict', 'm4-observe', 'm4-order', 'm4-explain'] },
  { id: 'm5', label: 'Why, how sure?', steps: ['m5-sort', 'm5-confidence', 'm5-post', 'm5-transfer'] },
];

/** v2 record ids (text mode and 3D log the same ids) -> the v3 step they finish. */
export const RECORD_TO_STEP = {
  'set/pre': 'm1-precheck', 'task/m2-change-tags': 'm2-tags', 'task/m3-inlet': 'm3-measure', 'task/m3-scale': 'm3-scale',
  'task/m3-rate-4150': 'm3-rate1', 'task/m3-rate-4104': 'm3-rate2', 'task/m4-predict': 'm4-predict', 'task/m4-sequence': 'm4-order',
  'task/m4-explain': 'm4-explain', 'task/m5-evidence-sort': 'm5-sort', 'task/m5-confidence': 'm5-confidence', 'set/post': 'm5-post', 'set/transfer': 'm5-transfer',
};

const FACTS = [
  { cue: 'accumulation-zone', name: 'snowfields up high', text: 'A glacier starts high up, where more snow falls than melts. Year after year the snow piles up and turns to ice.' },
  { cue: 'ice-tongue', name: 'ice tongue', text: 'The ice flows downhill under its own weight, like a very slow river. Meltwater under it helps it slide.' },
  { cue: 'muir-terminus', name: 'glacier front', text: 'Lower down it is warmer, so the ice melts. When more ice melts than flows in, the front moves back.' },
  { cue: 'calving-cliff', name: 'ice cliff', text: 'In 1941 Muir Glacier ended in the sea. Blocks broke off its front as icebergs. It was a tidewater glacier.' },
];

export class Lessons {
  constructor({ slug, content }) {
    this.slug = slug;
    this.content = content;
    this.state = new AppState(slug, MODULES.map((m) => m.id));
    this.step = {};
    this.answers = {};
    this.app = null;
    this.world = null;
    this.fact = 0;
    this.yearsSeen = new Set();
  }

  bind(app, world) {
    this.app = app;
    this.world = world;
    this.record = app.record;
    app.rig?.on('tap', (x, y) => this._onTap(x, y));
    if (world) world.onYear = (y) => { if (this._active?.id === 'm3-years') { this.yearsSeen.add(Math.round(y)); this.refresh(); } };
  }

  // ------------------------------------------------------------ helpers
  done(id) { return this.state.isComplete(id); }
  complete(id, payload) { this.state.completeStep(id, payload); }
  // Before bind() (step texts built by modules()) the same test the shell uses.
  touch() { return this.app ? this.app.shell.touch : typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0); }
  hint(desktop, touch) { return this.touch() ? touch : desktop; }
  click() { return this.touch() ? 'Tap' : 'Click'; }
  get anchors() { return this.content.modules.anchors; }
  mod(i) { return this.content.modules.modules[i]; }
  fly(v, d = 1.4) { if (this.app.rig && v) this.app.rig.flyTo(v, d); }
  log(verb, id, name, extra) { this.record.log(verb, { id, name }, extra); }
  nowBtn(which = 'primary') { return this.app.shell.now.querySelector(`[data-action="now-${which}"]`); }

  /** Rig views of the module places (the camera rig flies there; nothing is a fixed stop). */
  views() {
    const w = this.world;
    if (!w) return null;
    const site = w.site;
    const P = (x, z, up = 0) => [x, site.ground(x, z) + up, z];
    const f41 = w.ice.frontAt(1941);
    const cam1 = site.frame(f41.s - 6200);
    const S = w.station;
    const T = w.transectAt;
    const frontsMid = site.frame(site.L - 3500), down = site.frame(site.L - 15000);
    const lower = site.frame(site.L * 0.12);
    return {
      m1: lookView(P(cam1.x - cam1.nx * 1500, cam1.z - cam1.nz * 1500, 1400), P(f41.x, f41.z, 180)),
      station: lookView([S.x - S.look.x * 2.5, S.y + 1.75, S.z - S.look.z * 2.5], [S.x + S.look.x * 60, S.y + 1.0, S.z + S.look.z * 60]),
      m3: lookView(P(down.x - down.nx * 2500, down.z - down.nz * 2500, 5200), P(frontsMid.x, frontsMid.z, 150)),
      ridge: lookView([S.x - S.look.x * 5 - Math.cos(T.yaw) * 6, S.y + 3.2, S.z - S.look.z * 5 - Math.sin(T.yaw) * 6], [T.x + Math.cos(T.yaw) * 12, site.surfaceY(T.x, T.z) + 0.6, T.z + Math.sin(T.yaw) * 12]),
      m5: lookView(P(lower.x - lower.nx * 3500, lower.z - lower.nz * 3500, 3800), P(site.frame(site.L * 0.55).x, site.frame(site.L * 0.55).z, 200)),
    };
  }

  // ------------------------------------------------------------ module definitions for createSceneApp
  modules() {
    const L = this;
    const use = (app) => { if (!L.app && app) { L.app = app; L.record = app.record; } };
    this.steps = [this._m1(), this._m2(), this._m3(), this._m4(), this._m5()];
    const viewKey = ['m1', 'station', 'm3', 'ridge', 'm5'];
    return MODULES.map((m, i) => ({
      id: m.id, label: m.label,
      get view() { return L.views()?.[viewKey[i]] || { target: [0, 300, 0], radius: 30000, theta: 0.35, phi: 1.0 }; },
      enter: (app) => { use(app); L.enterModule(i); },
      now: (app) => { use(app); return L.nowFor(i); },
      text: (body, app) => { use(app); L.textFor(i, body); },
    }));
  }

  enterModule(i) {
    this.state.goToModule(MODULES[i].id);
    const w = this.world;
    if (w) {
      w.setPathVisible(i === 2);
      if (i !== 2) w.clearMeasure();
      w.print.hide();
      w.followKayak(false);
      const yr = [1941, 2004, null, 1950, 2004][i];
      if (yr != null) w.setYear(yr);
      else if (!this.yearsSeen.size) w.setYear(1941);
    }
    const steps = this.steps[i];
    let k = steps.findIndex((s) => !s.done());
    if (k < 0) k = steps.length;
    this.step[i] = k;
    this._enterStep(i);
  }

  _enterStep(i) {
    this._active?.leave?.();
    const s = this.steps[i][this.step[i]];
    this._active = s || null;
    const a = this.app;
    if (a.engine) {
      a.inspect.setEnabled(!s?.noInspect);
      a.motion.setCalm(Boolean(s?.calm));
      a.inspect.setCue(null);
    }
    s?.enter?.();
  }

  refresh() { if (this.app?.module >= 0 && !this.app.onboarding?.active) this.app.shell.setNow(this.nowFor(this.app.module)); }

  next(i = this.app.module) {
    this.step[i] = (this.step[i] ?? 0) + 1;
    if (this.step[i] >= this.steps[i].length) { this._finishModule(i); return; }
    this._enterStep(i);
    this.refresh();
  }

  _finishModule(i) {
    this._active?.leave?.();
    this._active = null;
    this.log('completed', `module/${MODULES[i].id}`, MODULES[i].label);
    if (i + 1 < MODULES.length) this.app.completeModule(i);
    else {
      this.app.shell.setModuleDone(i, true);
      this.log('completed', 'course/glacier-time-machine', 'Glacier Time Machine');
      this.refresh();
      this.app.shell.toast('Course complete. Your answers stay in this browser.', 5000);
    }
  }

  nowFor(i) {
    const steps = this.steps[i];
    const k = this.step[i] ?? 0;
    if (k >= steps.length) return this._doneCard(i);
    return { step: k + 1, total: steps.length, ...steps[k].now() };
  }

  _doneCard(i) {
    const last = i === MODULES.length - 1;
    return {
      kicker: 'Module complete',
      goal: last ? 'Course complete' : `${MODULES[i].label}: done`,
      action: last ? 'You can now explain, measure and argue about the retreat. Keep exploring, or redo a module.' : 'Go on to the next module, or redo this one.',
      primary: last ? { label: 'Open my progress', onClick: () => this.app.shell.root.querySelector('[data-action="progress"]')?.click() } : { label: 'Next module', onClick: () => this.app.goModule(i + 1) },
      secondary: { label: 'Redo this module', onClick: () => this.redo(i) },
    };
  }

  redo(i) {
    const m = MODULES[i];
    this.state.state.completed = this.state.state.completed.filter((id) => !m.steps.includes(id));
    this.state.save();
    if (i === 0) delete this.answers.pre;
    if (i === 4) { delete this.answers.post; delete this.answers.transfer; }
    if (i === 0) this.fact = 0;
    if (i === 2) this.yearsSeen.clear();
    this.app.shell.setModuleDone(i, false);
    this.log('experienced', `module/${m.id}-redo`, `Redo: ${m.label}`);
    this.app.goModule(i);
  }

  // ------------------------------------------------------------ question sets (one at a time)
  _setStep(set, stepId, moduleIndex, { label, graded, items: itemsFn, extra } = {}) {
    const L = this;
    const items = () => itemsFn?.() || L.content.items[set];
    const st = () => (L.answers[set] ||= { k: 0, res: new Map() });
    return {
      id: stepId, done: () => L.done(stepId), calm: true,
      enter: () => { const s = st(); s.k = Math.min(s.k, items().length - 1); if (graded) L.app.motion?.setCalm(true); },
      now: () => {
        const list = items();
        const s = st();
        const item = list[s.k];
        const answered = s.res.get(item.id);
        const chosen = answered && item.options.find((o) => o.id === answered.chosen);
        return {
          kicker: `${label} · ${s.k + 1} of ${list.length}`,
          goal: answered ? `Your answer: ${chosen.text}` : item.prompt,
          question: answered ? undefined : {
            prompt: 'Choose one answer.',
            choices: item.options.map((o) => ({ id: o.id, text: o.text })),
            onAnswer: (choice) => {
              if (s.res.has(item.id)) return {};
              const correct = choice === item.correct;
              s.res.set(item.id, { itemId: item.id, chosen: choice, correct });
              L.log('answered', `item/${item.id}`, item.prompt, { response: choice, success: correct });
              setTimeout(() => L.refresh(), 0);
              return { correct, feedback: '' };
            },
          },
          action: answered ? `${answered.correct ? 'Correct.' : 'Not quite.'} ${short(chosen?.why)} Press ${s.k + 1 < list.length ? 'Next question' : 'Finish'}.` : undefined,
          primary: answered ? {
            label: s.k + 1 < list.length ? 'Next question' : 'Finish',
            onClick: () => {
              if (s.k + 1 < list.length) { s.k++; L.refresh(); return; }
              const score = scoreAnswers([...s.res.values()]);
              L.log('completed', `set/${set}`, label, { score: { raw: score.correct, max: score.total } });
              L.complete(stepId, { correct: score.correct, total: score.total });
              L.app.shell.toast(`${label}: ${score.correct} of ${score.total} correct.`, 3500);
              L.next(moduleIndex);
            },
          } : undefined,
          readMore: answered ? { label: 'Why?', title: item.prompt, render: (b) => { for (const o of item.options) para(b, `${o.text}: ${o.why}`); } } : extra?.(),
        };
      },
    };
  }

  /** One check question (the v2 module checks), answered in the card. */
  _checkStep(stepId, objective, moduleIndex, suffix) {
    const L = this;
    const item = L.content.items.post.find((x) => x.objective === objective);
    return {
      id: stepId, done: () => L.done(stepId), calm: true,
      now: () => {
        const ans = L.state.state.decisions[stepId];
        const opt = ans && item.options.find((o) => o.id === ans);
        return {
          kicker: 'Check your understanding',
          goal: ans ? `Your answer: ${opt.text}` : item.prompt,
          question: ans ? undefined : {
            prompt: 'Choose one answer.',
            choices: item.options.map((o) => ({ id: o.id, text: o.text })),
            onAnswer: (id) => {
              const correct = id === item.correct;
              L.log('answered', `item/${item.id}-${suffix}`, item.prompt, { response: id, success: correct });
              L.complete(stepId, id);
              setTimeout(() => L.refresh(), 0);
              return { correct, feedback: '' };
            },
          },
          action: ans ? `${ans === item.correct ? 'Correct.' : 'Not quite.'} ${short(opt.why)} Press Next module.` : undefined,
          primary: ans ? { label: 'Next module', onClick: () => L.next(moduleIndex) } : undefined,
          readMore: ans ? { label: 'Why?', title: item.prompt, render: (b) => { for (const o of item.options) para(b, `${o.text}: ${o.why}`); } } : undefined,
        };
      },
    };
  }

  // ------------------------------------------------------------ Module 1: River of ice
  _m1() {
    const L = this;
    const mod = () => L.mod(0);
    return [
      {
        id: 'm1-look', done: () => L.done('m1-look'),
        now: () => ({
          goal: 'Look at Muir Glacier in 1941',
          action: 'Drag to look around. Find the ice front, where the glacier meets the sea.',
          hint: L.hint(`${L.click()} anything to learn what it is. Press ? for all controls.`, 'Tap anything to learn what it is.'),
          primary: { label: 'Next step', onClick: () => { L.complete('m1-look'); L.next(0); } },
          secondary: L.app.engine ? { label: 'Watch the flyover', play: true, onClick: () => L.play('s1-flyover') } : undefined,
          readMore: { label: 'About this place', title: 'Muir Inlet, Alaska', render: (b) => { para(b, mod().intro); para(b, L.content.modules.terrainNote); para(b, 'The 3D view starts in 1941, the year of the oldest photo. The ice is drawn from the photo captions; its shape is approximate.'); } },
        }),
      },
      L._setStep('pre', 'm1-precheck', 0, { label: 'Pre-check (not graded)' }),
      {
        id: 'm1-facts', done: () => L.done('m1-facts'),
        enter: () => L._cueFact(),
        leave: () => L.app.inspect?.setCue(null),
        now: () => {
          const f = FACTS[L.fact];
          const opened = L.app.journal.has(f.cue);
          const last = L.fact === FACTS.length - 1;
          return {
            kicker: `How a glacier moves · ${L.fact + 1} of ${FACTS.length}`,
            goal: f.text,
            action: L.app.engine ? `${L.click()} the outlined ${f.name} to read its card. Then press ${last ? 'Next step' : 'Next fact'}.` : `Press ${last ? 'Next step' : 'Next fact'}.`,
            result: opened ? `You opened the ${f.name} card.` : undefined,
            primary: { label: last ? 'Next step' : 'Next fact', onClick: () => { if (!last) { L.fact++; L._cueFact(); L.refresh(); return; } L.complete('m1-facts'); L.next(0); } },
            readMore: { label: 'Read the sources', title: 'How a glacier moves', render: (b) => { for (const x of mod().facts) para(b, x.text); para(b, 'Sources: rows 29 to 34 of the source register (National Park Service and USGS pages).'); b.append(el('a', { href: `${BASE}sources.html`, target: '_blank', rel: 'noopener', textContent: 'Open the source register' })); } },
          };
        },
      },
      L._checkStep('m1-check', 1, 0, 'm1'),
    ];
  }

  _cueFact() {
    const f = FACTS[this.fact];
    if (!this.app.engine) return;
    this.app.inspect.setCue(f.cue);
    if (!this._factHook) this._factHook = this.app.inspect.on('open', (id) => { if (this._active?.id === 'm1-facts' && id === FACTS[this.fact].cue) setTimeout(() => this.refresh(), 0); });
  }

  /** Play a cinematic (never during a graded set). */
  play(id) {
    const def = this.content.cinematics.cinematics.find((c) => c.id === id);
    if (!def || !this.app.player) return;
    if (id === 's3-path') this.world.setPathVisible(true);
    this.app.player.onFinish = () => this.log('experienced', `cinematic/${id}`, def.title);
    this.app.playCinematic({ ...def, shots: def.shots.map((s) => ({ ...s, purpose: s.purpose || def.purpose })) });
  }

  // ------------------------------------------------------------ Module 2: Then and now
  _m2() {
    const L = this;
    const [a1941, a1950, a2004] = L.anchors;
    let shown = a1941;
    let split = 0.5;
    return [
      {
        id: 'm2-station', done: () => L.done('m2-station'),
        now: () => ({
          goal: 'Stand at the photo station',
          action: 'Press Go to the station. You stand where the old photos were taken, looking north-east.',
          hint: 'The spot is approximate. The exact camera place was never published.',
          primary: { label: 'Go to the station', onClick: () => { if (L.app.engine) L.fly(L.views().station, 1.4); L.complete('m2-station'); L.log('experienced', 'task/m2-station', 'Stood at the photo station'); L.next(1); } },
          secondary: L.app.engine ? { label: 'Watch: fly to the station', play: true, onClick: () => { L.play('s2-then-now'); L.complete('m2-station'); L.next(1); } } : undefined,
        }),
      },
      {
        id: 'm2-compare', done: () => L.done('m2-compare'),
        enter: () => { if (!L.app.engine) return; L.world.setYear(2004, { animate: false }); L.world.print.show(shown).then(() => L.world.print.setSplit(split)); },
        leave: () => L.world?.print.hide(),
        now: () => ({
          goal: `Compare ${shown.year} with today`,
          action: `Drag the slider. It wipes the ${shown.year} photo across today's 3D view. Look for ice, plants and water.`,
          tool: (box) => {
            const id = 'gtm-wipe';
            const lab = el('label', { htmlFor: id, className: 'gtm-tool-label', textContent: `Photo wipe: ${Math.round(split * 100)}% photo` });
            const r = el('input', { type: 'range', id, min: '0', max: '100', step: '10', value: String(Math.round(split * 100)) });
            r.setAttribute('aria-valuetext', `${Math.round(split * 100)}% of the view shows the ${shown.year} photo`);
            r.addEventListener('input', () => { split = +r.value / 100; L.world?.print.setSplit(split); lab.textContent = `Photo wipe: ${r.value}% photo`; r.setAttribute('aria-valuetext', `${r.value}% of the view shows the ${shown.year} photo`); });
            const row = el('div', { className: 'gtm-tool-row' });
            for (const a of [a1941, a1950]) {
              const b = btn(`${a.year} photo`, () => { shown = a; L.world?.print.show(a).then(() => L.world.print.setSplit(split)); L.refresh(); });
              b.setAttribute('aria-pressed', String(a === shown));
              row.append(b);
            }
            box.append(lab, r, row);
          },
          hint: 'The photo and the 3D view do not line up exactly.',
          primary: { label: 'Next step', onClick: () => { L.complete('m2-compare'); L.log('experienced', 'task/m2-compare', `Photo wipe ${shown.year}`); L.next(1); } },
          readMore: { label: 'About the photos', title: 'The repeat photographs', render: (b) => { for (const a of [a1941, a1950, a2004]) para(b, `${a.year}, ${a.photographer} (USGS, public domain): ${a.caption}`); para(b, L.mod(1).alignmentNote); } },
        }),
      },
      {
        id: 'm2-tags', done: () => L.done('m2-tags'),
        enter: () => { if (L.app.engine) L.world.setYear(2004, { animate: false }); },
        now: () => {
          const done = L.done('m2-tags');
          return {
            goal: done ? 'Changes tagged' : 'Tag the changes you can see',
            action: done ? 'Press Next module. You can open the change list again to look back.' : 'Open the change list. Tick every change the photos show. Then press Check my tags.',
            result: done ? L.state.state.decisions['m2-tags']?.summary : undefined,
            primary: done ? { label: 'Next module', onClick: () => L.next(1) } : { label: 'Open the change list', onClick: () => L._openTags(L.nowBtn()) },
            secondary: done ? { label: 'Open the change list', onClick: () => L._openTags(L.nowBtn('secondary')) } : undefined,
          };
        },
      },
    ];
  }

  _openTags(trigger) {
    const L = this, mod = L.mod(1);
    const [a, , b] = L.anchors;
    L.app.shell.openDrawer({
      title: 'Change list', key: 'tags', trigger, render: (body) => {
        para(body, mod.intro);
        const pair = el('div', { className: 'gtm-photo-pair' });
        for (const x of [a, b]) pair.append(el('figure', {}, el('img', { src: `${BASE}${x.photo}`, alt: `${x.year}: ${x.alt}`, width: 800, height: 530 }), el('figcaption', { textContent: `${x.year}, ${x.photographer} (USGS)` })));
        body.append(pair);
        const fs = el('fieldset', {}, el('legend', { textContent: 'Which of these changed between 1941 and 2004?' }));
        const prev = new Set(L.state.state.decisions['m2-tags']?.chosen || []);
        for (const t of mod.changeTags) fs.append(el('label', { className: 'gtm-check' }, el('input', { type: 'checkbox', value: t.id, checked: prev.has(t.id) }), el('span', { textContent: t.label })));
        const out = el('div', { className: 'gtm-feedback', role: 'status' });
        body.append(fs, btn('Check my tags', () => {
          const chosen = [...fs.querySelectorAll('input:checked')].map((i) => i.value);
          const s = scoreChangeTags(mod.changeTags, chosen);
          const ok = s.hits === s.total && s.falseAlarms === 0;
          out.replaceChildren(el('p', { textContent: `You found ${s.hits} of ${s.total} supported changes, with ${s.falseAlarms} unsupported tag${s.falseAlarms === 1 ? '' : 's'}.` }),
            el('ul', {}, ...s.perTag.map((p) => { const t = mod.changeTags.find((x) => x.id === p.id); return el('li', {}, el('strong', { textContent: `${t.label}: ` }), `${t.correct ? (p.chosen ? 'found. ' : 'missed. ') : (p.chosen ? 'not supported. ' : 'correctly left out. ')}${t.why}`); })));
          L.log('answered', 'task/m2-change-tags', 'Change tagging', { response: chosen.join(','), success: ok, score: { raw: s.hits, max: s.total } });
          L.complete('m2-tags', { chosen, summary: `Found ${s.hits} of ${s.total} changes, ${s.falseAlarms} unsupported.` });
          L.app.shell.revealInDrawer(out);
          L.refresh();
        }, 'v3-btn v3-primary'), out);
      },
    });
  }

  // ------------------------------------------------------------ Module 3: Measure it
  _m3() {
    const L = this;
    const mod = () => L.mod(2);
    const tasks = () => mod().measureTasks;
    return [
      {
        id: 'm3-years', done: () => L.done('m3-years'),
        enter: () => { if (L.app.engine) L.world.setPathVisible(true); },
        now: () => {
          const all = L.anchors.every((a) => L.yearsSeen.has(a.year)) || L.done('m3-years');
          const cur = L.world ? Math.round(L.world.year) : null;
          const a = L.anchors.find((x) => x.year === cur);
          return {
            goal: 'Step through the photo years',
            action: all ? 'Press Next step to measure the retreat.' : 'Press each year. Watch the ice front move. Orange year tags mark the dated fronts.',
            result: a ? (a.retreatSince1941.value ? `${a.year}: retreat since 1941 ${a.retreatSince1941.text}.` : `${a.year}: the reference year, 0 km by definition.`) : undefined,
            tool: (box) => {
              const row = el('div', { className: 'gtm-tool-row', role: 'group' });
              row.setAttribute('aria-label', 'Photo years');
              for (const x of L.anchors) {
                const b = btn(String(x.year), () => { if (L.world) L.world.setYear(x.year); else { L.yearsSeen.add(x.year); L.refresh(); } L.log('attempted', 'task/m3-time-slider', 'Time slider', { response: String(x.year) }); });
                b.setAttribute('aria-pressed', String(x.year === cur));
                row.append(b);
              }
              box.append(row);
            },
            hint: 'In between the years the view is illustrative, not measured.',
            primary: { label: 'Next step', disabled: !all, onClick: () => { L.complete('m3-years'); L.next(2); } },
            secondary: L.app.engine ? { label: 'Watch the path from above', play: true, onClick: () => L.play('s3-path') } : undefined,
            readMore: { label: 'About the dates', title: 'Three dated photos', render: (b) => { para(b, mod().noInterpolation); para(b, L.content.modules.terrainNote); para(b, L.content.modules.conflictNote); } },
          };
        },
      },
      L._measureStep('m3-measure', tasks()[0], 'Measure the valley path', `${L.hint('Click', 'Tap')} the start of the orange path, then its end, or move the sliders. Press Check.`),
      L._measureStep('m3-scale', tasks()[1], 'See how far 7 km is', `Put marker B 7 km from marker A (${L.hint('click', 'tap')} the path or use the sliders). Press Check.`),
      L._rateStep('m3-rate1', mod().rateTasks[0], 'more than 3 km in 9 years (1941 to 1950)'),
      L._rateStep('m3-rate2', mod().rateTasks[1], 'more than 7 km in 63 years (1941 to 2004)'),
      L._checkStep('m3-check', 3, 2, 'm3'),
    ];
  }

  _measureStep(id, task, goal, action) {
    const L = this;
    const total = pathLength(L.content.flowline.points);
    const maxV = Math.round(total / 100) * 100;
    const st = (L._meas ||= {});
    const s = () => (st[id] ||= { a: 0, b: Math.round(maxV / 2 / 100) * 100, result: null, pick: 0 });
    return {
      id, done: () => L.done(id), calm: true, noInspect: true,
      enter: () => { if (L.app.engine) { L.world.setPathVisible(true); L.world.setMeasure(s().a, s().b); L.fly(L.views().m3, 1.2); } },
      now: () => {
        const v = s();
        const m = measureBetween(L.content.flowline.points, v.a, v.b);
        return {
          goal,
          action,
          result: v.result || `Distance: ${km(m.along, 2)} along the path.`,
          tool: (box) => {
            for (const [k, name] of [['a', 'Marker A'], ['b', 'Marker B']]) {
              const iid = `${id}-${k}`;
              const lab = el('label', { htmlFor: iid, className: 'gtm-tool-label', textContent: `${name}: ${km(v[k])}` });
              const r = el('input', { type: 'range', id: iid, min: '0', max: String(maxV), step: '100', value: String(v[k]) });
              r.setAttribute('aria-valuetext', `${name} at ${km(v[k])} along the path`);
              r.addEventListener('input', () => { v[k] = +r.value; v.result = null; L.world?.setMeasure(v.a, v.b); lab.textContent = `${name}: ${km(v[k])}`; r.setAttribute('aria-valuetext', `${name} at ${km(v[k])} along the path`); const res = L.app.shell.now.querySelector('.v3-now-result'); if (res) res.textContent = `Distance: ${km(measureBetween(L.content.flowline.points, v.a, v.b).along, 2)} along the path.`; });
              r.addEventListener('change', () => announce(`Distance ${km(measureBetween(L.content.flowline.points, v.a, v.b).along, 2)}`));
              box.append(lab, r);
            }
            box.append(btn('Check', () => L._checkMeasure(id, task, v), 'v3-btn'));
          },
          hint: 'Start: inlet mouth (0 km). End: Muir Glacier name point.',
          primary: { label: 'Next step', disabled: !L.done(id), onClick: () => L.next(2) },
          readMore: { label: 'About this task', title: 'Measuring on the terrain', render: (b) => { para(b, task.prompt); para(b, task.note); para(b, L.content.flowline.label); } },
        };
      },
    };
  }

  _checkMeasure(id, task, v) {
    const total = pathLength(this.content.flowline.points);
    const m = measureBetween(this.content.flowline.points, v.a, v.b);
    const ref = task.reference === 'pathLength' ? total : task.targetM;
    const ok = withinTolerance(m.along, ref, task.toleranceM);
    v.result = ok ? `Correct: ${km(m.along, 2)}, within ${task.toleranceM} m of ${km(ref, 1)}.` : `Not yet: ${km(m.along, 2)}. Aim for about ${km(ref, 1)}.`;
    this.log('answered', `task/${task.id}`, task.prompt, { response: String(Math.round(m.along)), success: ok });
    this.complete(id, { measuredM: Math.round(m.along), correct: ok });
    announce(v.result);
    this.refresh();
  }

  /** Terrain taps while measuring: the first sets marker A, the second marker B (snapped to the path). */
  _onTap(x, y) {
    const s = this._active;
    if (!s || !['m3-measure', 'm3-scale'].includes(s.id) || !this.world) return;
    const n = this.world.pickAlong(x, y);
    if (!n) { this.app.shell.toast('Tap near the orange path.'); return; }
    const v = this._meas[s.id];
    const step = Math.round(n.s / 100) * 100;
    if (v.pick % 2 === 0) v.a = step; else v.b = step;
    v.pick++;
    v.result = null;
    this.world.setMeasure(v.a, v.b);
    this.app.shell.toast(v.pick % 2 ? `Marker A at ${km(v.a)}. Now the end.` : `Marker B at ${km(v.b)}.`);
    this.refresh();
  }

  _rateStep(id, task, text) {
    const L = this;
    let msg = null;
    return {
      id, done: () => L.done(id), calm: true,
      enter: () => { if (L.app.engine) L.world.setPathVisible(true); },
      now: () => ({
        goal: 'Work out a rate',
        action: `Muir Glacier moved back ${text}. Type the average rate in km per year. Then press Check.`,
        result: msg || undefined,
        tool: (box) => {
          const iid = `${id}-in`;
          const input = el('input', { type: 'text', id: iid, inputMode: 'decimal', autocomplete: 'off', value: L.state.state.decisions[id]?.value ?? '' });
          const row = el('div', { className: 'gtm-tool-row' }, el('label', { htmlFor: iid, className: 'gtm-tool-label', textContent: 'km per year' }), input, btn('Check', () => {
            const r = checkNumeric(input.value, task);
            msg = r.correct ? `Correct: about ${task.answer.toFixed(2)} km/yr. It is a minimum, because the source says "more than".` : `Not yet. Divide the distance by the years. Try again.`;
            L.log('answered', `task/${task.id}`, task.prompt, { response: input.value, success: r.correct });
            if (r.correct || L.done(id)) L.complete(id, { value: input.value });
            else L.state.state.decisions[id] = { value: input.value };
            announce(msg);
            L.refresh();
          }));
          box.append(row);
        },
        hint: 'Divide the distance by the number of years.',
        primary: { label: 'Next step', disabled: !L.done(id), onClick: () => L.next(2) },
        secondary: L.done(id) ? { label: 'Open the rate chart', onClick: () => L._rateChart(L.nowBtn('secondary')) } : undefined,
      }),
    };
  }

  _rateChart(trigger) {
    const lb = lowerBoundRate(3, 1941, 1950), lb2 = lowerBoundRate(7, 1941, 2004);
    this.app.shell.openDrawer({ title: 'Rate chart', key: 'rates', trigger, render: (b) => { b.append(rateChart(this.anchors)); para(b, `Both rates are lower bounds (${lb.rate.toFixed(2)} and ${lb2.rate.toFixed(2)} km/yr at least). The faster 1941 to 1950 minimum shows the rate was not constant.`); } });
  }

  // ------------------------------------------------------------ Module 4: What came next
  _m4() {
    const L = this;
    const mod = () => L.mod(3);
    return [
      {
        id: 'm4-predict', done: () => L.done('m4-predict'),
        enter: () => { if (L.app.engine) L.world.setYear(1950); },
        now: () => {
          const P = mod().predict;
          return {
            goal: 'Predict the ridge in 2004',
            question: { prompt: 'In 1950 this ridge was bare rock. What will it look like in 2004?', choices: P.options.map((o) => ({ id: o.id, text: o.text })), onAnswer: (id) => {
              L.log('answered', 'task/m4-predict', P.prompt, { response: id, success: id === P.observed });
              L.complete('m4-predict', id);
              setTimeout(() => L.next(3), 900);
              return { correct: true, feedback: 'Prediction saved. Now look at 2004.' };
            } },
            hint: 'The 3D view shows 1950. Its plants are muted: the ridge was bare.',
          };
        },
      },
      {
        id: 'm4-observe', done: () => L.done('m4-observe'),
        enter: () => { if (L.app.engine) L.world.setYear(2004); },
        leave: () => L.world?.print.hide(),
        now: () => {
          const P = mod().predict;
          const pick = L.state.state.decisions['m4-predict'];
          const match = pick === P.observed;
          const obs = P.options.find((o) => o.id === P.observed).text.toLowerCase();
          return {
            goal: 'Observe 2004',
            action: 'Look at the ridge and its plants now. Then press Next step.',
            result: pick ? (match ? 'Your prediction matches the 2004 photo.' : `The 2004 photo shows ${obs}. Compare it with your prediction.`) : undefined,
            tool: L.app.engine ? (box) => { const on = L.world.print.mesh.visible; const b = btn(on ? 'Hide the 2004 photo' : 'Hold up the 2004 photo', () => { if (L.world.print.mesh.visible) L.world.print.hide(); else L.world.print.show(L.anchors[2]).then(() => L.world.print.setSplit(1)); L.refresh(); }); b.setAttribute('aria-pressed', String(on)); box.append(b); } : undefined,
            primary: { label: 'Next step', onClick: () => { L.complete('m4-observe'); L.log('experienced', 'task/m4-observe', 'Observed 2004'); L.next(3); } },
            readMore: { label: 'What the photo shows', title: 'The 2004 photograph', render: (b) => { para(b, mod().observe.text); para(b, L.anchors[2].caption); } },
          };
        },
      },
      {
        id: 'm4-order', done: () => L.done('m4-order'),
        now: () => {
          const done = L.done('m4-order');
          return {
            goal: done ? 'Plant order checked' : 'What grows first?',
            action: done ? 'Press Next step.' : 'Open the plant order. Put the five stages in order. Then press Check order.',
            result: done ? L.state.state.decisions['m4-order']?.summary : undefined,
            hint: done ? undefined : `The plants beside the station show the stages. ${L.click()} them to learn more.`,
            primary: done ? { label: 'Next step', onClick: () => L.next(3) } : { label: 'Open the plant order', onClick: () => L._openOrder(L.nowBtn()) },
            secondary: done ? { label: 'Open the plant order', onClick: () => L._openOrder(L.nowBtn('secondary')) } : undefined,
          };
        },
      },
      {
        id: 'm4-explain', done: () => L.done('m4-explain'),
        now: () => {
          const done = L.done('m4-explain');
          return {
            goal: done ? 'Explanation saved' : 'Explain your prediction',
            action: done ? 'Press Next module.' : 'Open the explanation box. Write what the photos and the plant order show, and where the evidence runs out.',
            result: done ? 'Saved on this device only. It is not graded.' : undefined,
            primary: done ? { label: 'Next module', onClick: () => L.next(3) } : { label: 'Open the explanation box', onClick: () => L._openExplain(L.nowBtn()) },
            secondary: done ? { label: 'Open the explanation box', onClick: () => L._openExplain(L.nowBtn('secondary')) } : undefined,
          };
        },
      },
    ];
  }

  _openOrder(trigger) {
    const L = this, S = L.mod(3).succession;
    let order = L.state.state.decisions['m4-order']?.order || seededShuffle(S.stages.map((s) => s.id), 11);
    L.app.shell.openDrawer({
      title: 'Plant order', key: 'order', trigger, render: (body) => {
        para(body, S.intro);
        const list = el('ol', { className: 'gtm-seq' });
        list.setAttribute('aria-label', 'Succession stages, your order');
        const out = el('div', { className: 'gtm-feedback', role: 'status' });
        const draw = (focusId, dir) => {
          list.replaceChildren(...order.map((id, i) => {
            const st = S.stages.find((s) => s.id === id);
            const up = btn('Earlier', () => { order = moveItem(order, i, -1); draw(id, 'up'); announce(`${st.text} moved to position ${i}`); });
            const dn = btn('Later', () => { order = moveItem(order, i, 1); draw(id, 'down'); announce(`${st.text} moved to position ${i + 2}`); });
            up.disabled = i === 0; dn.disabled = i === order.length - 1;
            up.setAttribute('aria-label', `Move "${st.text}" earlier`); dn.setAttribute('aria-label', `Move "${st.text}" later`);
            up.dataset.dir = 'up'; dn.dataset.dir = 'down';
            const li = el('li', {}, el('span', { textContent: st.text }), el('span', { className: 'gtm-seq-btns' }, up, dn));
            li.dataset.stage = id;
            return li;
          }));
          if (focusId) { const li = [...list.children].find((x) => x.dataset.stage === focusId); (li?.querySelector(`[data-dir="${dir}"]:not([disabled])`) || li?.querySelector('button:not([disabled])'))?.focus(); }
        };
        draw();
        body.append(list, btn('Check order', () => {
          const r = scoreSequence(S.stages, order);
          const summary = r.exact ? 'That is the order the Park Service describes.' : `${r.correctPositions} of ${r.total} in the Park Service order.`;
          out.replaceChildren(el('p', { textContent: summary }), el('p', { textContent: `Park Service order: ${S.stages.map((s) => s.text).join(' → ')}.` }), el('p', { textContent: S.timingNote }));
          L.log('answered', 'task/m4-sequence', 'Succession order', { response: order.join(','), success: r.exact });
          L.complete('m4-order', { order, summary });
          L.app.shell.revealInDrawer(out);
          L.refresh();
        }, 'v3-btn v3-primary'), out);
      },
    });
  }

  _openExplain(trigger) {
    const L = this, mod = L.mod(3);
    L.app.shell.openDrawer({
      title: 'Explanation box', key: 'explain', trigger, render: (body) => {
        const ta = el('textarea', { id: 'gtm-explain', rows: 6, value: L.state.state.decisions['m4-explain']?.text || '' });
        const msg = el('p', { role: 'status' });
        body.append(el('label', { htmlFor: 'gtm-explain', textContent: mod.explainPrompt }), ta, btn('Save my explanation', () => {
          L.log('answered', 'task/m4-explain', mod.explainPrompt, { response: ta.value.slice(0, 2000) });
          L.complete('m4-explain', { text: ta.value.slice(0, 2000) });
          msg.textContent = 'Saved on this device only. Explanations are not graded.';
          L.refresh();
          setTimeout(() => { L.app.shell.closeDrawer(); L.nowBtn()?.focus(); }, 1200);
        }, 'v3-btn v3-primary'), msg);
      },
    });
  }

  // ------------------------------------------------------------ Module 5: Why, and how sure?
  _m5() {
    const L = this;
    const mod = () => L.mod(4);
    const drawerStep = (id, goal, action, openLabel, title, render) => ({
      id, done: () => L.done(id),
      now: () => {
        const done = L.done(id);
        const open = (which) => () => L.app.shell.openDrawer({ title, key: id, trigger: L.nowBtn(which), render });
        return {
          goal: done ? `${goal}: done` : goal,
          action: done ? 'Press Next step.' : action,
          result: done ? L.state.state.decisions[id]?.summary || 'Saved.' : undefined,
          primary: done ? { label: 'Next step', onClick: () => L.next(4) } : { label: openLabel, onClick: open('primary') },
          secondary: done ? { label: openLabel, onClick: open('secondary') } : undefined,
        };
      },
    });
    const tr = () => L.content.items.transfer;
    return [
      drawerStep('m5-sort', 'Sort claims and evidence', 'Open the card sort. Mark each card as a claim or as evidence. Then press Check my sort.', 'Open the card sort', 'Card sort', (b) => L._sort(b)),
      drawerStep('m5-confidence', 'Say how sure you are', 'Open the confidence statement. Write what caused the retreat and how sure you are. Then rate it.', 'Open the confidence statement', 'Confidence statement', (b) => L._confidence(b)),
      { ...L._setStep('post', 'm5-post', 4, { label: 'Post-check', graded: true }) },
      { ...L._setStep('transfer', 'm5-transfer', 4, { label: 'Transfer: Glacier X', graded: true, items: () => tr().items, extra: () => ({ label: 'Read the scenario', title: 'Glacier X (constructed)', render: (b) => { para(b, tr().scenario); para(b, tr().label); } }) }) },
    ];
  }

  _sort(body) {
    const L = this;
    const { categories, cards } = L.content.cards;
    const answers = { ...(L.state.state.decisions['m5-sort']?.answers || {}) };
    para(body, 'Claim cards are statements written for this activity (constructed for teaching). Evidence cards quote or summarise the cited sources.');
    const list = el('ul', { className: 'gtm-cards' });
    for (const card of seededShuffle(cards, 5)) {
      const fs = el('fieldset', { className: 'gtm-card' }, el('legend', { textContent: card.text }));
      for (const cat of categories) {
        const r = el('input', { type: 'radio', name: `card-${card.id}`, value: cat.id, checked: answers[card.id] === cat.id });
        r.addEventListener('change', () => { answers[card.id] = cat.id; });
        fs.append(el('label', { className: 'gtm-check' }, r, el('span', { textContent: cat.label.split(' (')[0] })));
      }
      list.append(el('li', {}, fs));
    }
    const out = el('div', { className: 'gtm-feedback', role: 'status' });
    body.append(list, btn('Check my sort', () => {
      const r = scoreEvidenceSort(cards, answers);
      const summary = `${r.correct} of ${r.total} sorted as intended${r.unanswered ? ` (${r.unanswered} not sorted yet)` : ''}.`;
      out.replaceChildren(el('p', { textContent: summary }), el('ul', {}, ...r.perCard.map((p) => { const cd = cards.find((x) => x.id === p.id); return el('li', {}, el('strong', { textContent: `${p.right ? 'Yes' : 'Look again'}: ` }), `${cd.text} — ${cd.why}`); })));
      L.log('answered', 'task/m5-evidence-sort', 'Evidence sort', { response: JSON.stringify(answers), success: r.correct === r.total, score: { raw: r.correct, max: r.total } });
      L.complete('m5-sort', { answers, summary });
      L.app.shell.revealInDrawer(out);
      L.refresh();
    }, 'v3-btn v3-primary'), out);
  }

  _confidence(body) {
    const L = this, mod = L.mod(4);
    para(body, mod.gaps);
    const ta = el('textarea', { id: 'gtm-cs', rows: 6, value: L.state.state.decisions['m5-confidence']?.text || '' });
    body.append(el('label', { htmlFor: 'gtm-cs', textContent: 'What caused the retreat, how sure are you, and what would you need to be more sure?' }), ta);
    const det = el('details', {}, el('summary', { textContent: 'Show an example answer' }), el('p', { textContent: mod.exemplar }));
    rubricSelfCheck({
      criteria: mod.rubric, container: body, onComplete: (ratings) => {
        L.log('answered', 'task/m5-confidence', 'Confidence statement', { response: ta.value.slice(0, 2000), extensions: { selfCheck: ratings } });
        L.complete('m5-confidence', { text: ta.value.slice(0, 2000), ratings, summary: 'Saved with your self-check. Not graded.' });
        announce('Self-check saved');
        L.refresh();
        L.app.shell.closeDrawer();
        L.nowBtn()?.focus();
      },
    });
    body.querySelector('.rubric-selfcheck button')?.classList.add('v3-btn', 'v3-primary');
    body.append(det);
  }

  // ------------------------------------------------------------ text mode (the v2 renderers)
  textFor(i, body) {
    const L = this;
    const record = {
      log: (verb, obj, extra) => {
        L.record.log(verb, obj, extra);
        const step = RECORD_TO_STEP[obj?.id] || (obj?.id?.startsWith('item/') && obj.id.endsWith('-m1') ? 'm1-check' : obj?.id?.endsWith('-m3') && obj.id.startsWith('item/') ? 'm3-check' : null);
        if (step && (verb === 'answered' || verb === 'completed')) L._textDone(step, extra);
      },
    };
    // Reading the module in text mode covers its viewing steps.
    for (const id of { 0: ['m1-look', 'm1-facts'], 1: ['m2-station', 'm2-compare'], 2: ['m3-years'], 3: ['m4-observe'], 4: [] }[i]) L.state.completeStep(id);
    const host = el('div', { className: 'gtm-v2-text' });
    body.append(host);
    renderModule(i, host, { content: L.content, record, mode: 'text', setAssessing: () => {} });
  }

  _textDone(stepId, extra) {
    if (stepId === 'm1-check' || stepId === 'm3-check') this.state.completeStep(stepId, extra?.response);
    else this.state.completeStep(stepId, extra?.response !== undefined ? { value: extra.response } : undefined);
    const i = MODULES.findIndex((m) => m.steps.includes(stepId));
    if (MODULES[i].steps.every((id) => this.done(id))) {
      this.log('completed', `module/${MODULES[i].id}`, `${MODULES[i].label} (text mode)`);
      this.app.shell.setModuleDone(i, true);
    }
  }

  /** Every step's Now card, for the word-count test (tests/unit/now-cards.test.js). */
  allCards() {
    const out = [];
    this.steps.forEach((steps, i) => steps.forEach((s, k) => { this.step[i] = k; out.push({ module: i, id: s.id, card: this.nowFor(i) }); }));
    return out;
  }
}
