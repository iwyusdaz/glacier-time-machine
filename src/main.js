/**
 * App entry point: engine -> shell -> settings -> record -> content -> course.
 * Each module is rendered by ONE shared renderer (src/learning/course.js) into
 * either the 3D task panel or text mode, so both modes cover the same objectives
 * and assessment decisions.
 */
import { Engine } from './core/engine.js';
import { hasWebGL2 } from './core/assets.js';
import { Shell } from './ui/shell.js';
import { Settings } from './ui/settings.js';
import { ProgressPage } from './ui/progress.js';
import { LearningRecord } from './learning/record.js';
import { TextMode } from './a11y/text-mode.js';
import { MotionPrefs } from './a11y/motion.js';
import { ShotPlayer } from './cinematics/shot-player.js';
import { announce } from './a11y/announcer.js';
import { MuirInletScene } from './scenes/muir-inlet.js';
import { MuirWorld } from './scenes/muir-world.js';
import { renderModule } from './learning/course.js';
import { applyCaseGrade, initFloatingHud } from './v2/cinematic-grade.js';
import './styles/site.css';
import './styles/case-fonts.css';
import './v2/hud-shell.css';
import './styles/case-hud.css';

export const SLUG = window.__SLUG__ || 'glacier-time-machine';
window.__SLUG__ = SLUG;
const TITLE = 'Glacier Time Machine';
const BASE = import.meta.env.BASE_URL || './';
const MODULE_VIEW = ['inlet', 'overview', 'overview', 'muir', 'overview'];

async function loadContent() {
  const get = async (f) => (await fetch(`${BASE}content/${f}`)).json();
  const [modules, items, cards, flowline, cinematics] = await Promise.all(
    ['modules.json', 'items.json', 'evidence-cards.json', 'flowline.json', 'cinematics.json'].map(get));
  return { modules, items, cards, flowline, cinematics };
}

async function main() {
  document.body.insertAdjacentHTML('afterbegin', '<dialog id="settings-dialog" aria-labelledby="settings-h"></dialog><dialog id="progress-dialog" aria-labelledby="progress-h"></dialog>');
  // Accessibility review A4: the skip link targeted the hidden text-mode region
  // and moved nothing. It now opens the matching region and focuses it.
  document.querySelector('.skip-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const tm = document.getElementById('textmode');
    if (tm && !tm.hidden) tm.focus();
    else document.getElementById('task-panel')?.focus();
  });
  const content = await loadContent();
  const state = { module: 0, assessing: false };

  const shell = new Shell({
    slug: SLUG,
    title: TITLE,
    moduleLabels: content.modules.modules.map((m) => m.title),
    onModuleChange: (i) => goModule(i),
  });
  const stage = document.getElementById('stage');
  stage.insertAdjacentHTML('beforeend', '<aside id="task-panel" class="task-panel" aria-label="Module tasks" tabindex="-1"></aside>');
  const panel = document.getElementById('task-panel');
  initFloatingHud({ slug: SLUG, panel });

  if (!hasWebGL2()) {
    stage.insertAdjacentHTML('beforeend',
      '<div data-webgl-fallback role="alert"><p>WebGL is not available in this browser. ' +
      'You can still complete every objective here or in <strong>Text mode</strong>.</p></div>');
  } else {
    try {
      window.__engine = new Engine(document.getElementById('app'));
      // v2 grade: AgX + case exposure + CSS theme tokens (fog is set by the scene).
      applyCaseGrade(SLUG, { renderer: window.__engine.renderer, addSkyDome: false });
      // Restore the saved quality preset before the scene loads, so the terrain
      // is built at the right LOD from the first frame (visual review V3: the
      // saved preset was silently ignored and Ultra was unreachable).
      window.__engine.quality.restore();
    } catch (err) {
      console.warn('WebGL engine failed to start; text mode remains available.', err);
    }
  }

  const motion = new MotionPrefs(SLUG);
  const record = new LearningRecord(SLUG);
  const settings = new Settings({ slug: SLUG, dialog: document.getElementById('settings-dialog'), quality: window.__engine?.quality, motion });
  shell.on('settings', (btn) => settings.open(btn));
  const progress = new ProgressPage({ slug: SLUG, dialog: document.getElementById('progress-dialog'), record });
  shell.on('progress', (btn) => progress.open(btn));

  let terrain = null;
  let world = null;
  const syncCalm = () => world?.setCalm(Boolean(state.assessing || world.tool || state.module === 2));
  let player = null;
  const textModeEl = document.getElementById('textmode');
  const textMode = new TextMode({ root: textModeEl, slug: SLUG, onDecision: () => {} });

  const ctxFor = (mode) => ({
    content, record, mode,
    playCinematic: mode === '3d' && player ? playCinematic : null,
    onMarkers: (m) => terrain?.setMarkers(m),
    // v2: the Module 3 time slider drives the living transition in the 3D view.
    onYear: mode === '3d' ? (year) => world?.goYear(year) : null,
    setAssessing: (flag) => { state.assessing = flag; syncCalm(); },
  });

  textMode.register('module', (body, { setTitle }) => {
    setTitle(`Text mode: ${content.modules.modules[state.module].title}`);
    body.append(Object.assign(document.createElement('p'), { className: 'note', textContent: 'Text mode has every task and question from the 3D view. Use the module buttons above to move between modules.' }));
    const host = document.createElement('div');
    body.append(host);
    renderModule(state.module, host, ctxFor('text'));
  });

  function goModule(i) {
    state.module = i;
    window.__glacierModule = i;
    state.assessing = false;
    if (player?.playing) player.skip();
    shell.setModule(i);
    if (!textModeEl.hidden) {
      panel.replaceChildren();
      textMode.show('module');
      textModeEl.focus();
    } else {
      renderModule(i, panel, ctxFor('3d'));
      panel.querySelector('.module-title')?.focus();
    }
    terrain?.setPathVisible(i === 2);
    if (i !== 2) terrain?.setMarkers(null);
    terrain?.setViewpoint(MODULE_VIEW[i]);
    if (world) {
      world.closePhotoSpot();
      if (world.tool === 'measure') world.setMeasureTool(false);
      if (i !== 2) { world.dressing.setYear(2004); world.yearAnim = null; world.hideLabel(); }
      syncCalm();
      document.querySelector('[data-action="measure-tool"]')?.setAttribute('aria-pressed', 'false');
    }
    announce(`Module ${content.modules.modules[i].title}`);
  }

  function playCinematic(id, trigger) {
    if (state.assessing) {
      // Reviews A3/T2/P4: the refusal was only in the (hidden) live region, so
      // the button looked dead. Announce AND show a visible inline message.
      const msg = 'Cinematics never play during a graded assessment. Finish the questions first.';
      announce(msg, { assertive: true });
      const anchor = trigger?.closest('p, section, .task-panel, .textmode-body') || panel;
      anchor.parentElement?.querySelectorAll('.cinematic-guard').forEach((n) => n.remove());
      const note = document.createElement('p');
      note.className = 'feedback not-yet cinematic-guard';
      note.setAttribute('role', 'status');
      note.textContent = msg;
      anchor.insertAdjacentElement('afterend', note);
      return false;
    }
    const def = content.cinematics.cinematics.find((c) => c.id === id);
    if (!player || !def) return false;
    if (id === 's3-path') terrain?.setPathVisible(true);
    // Dim the chrome during playback (visual review V9); visibility:hidden keeps
    // it out of the tab order and the accessibility tree. Skip stays reachable.
    document.body.classList.add('cinematic-playing');
    player.onDone = () => {
      document.body.classList.remove('cinematic-playing');
      terrain?.setViewpoint(MODULE_VIEW[state.module]);
      terrain?.setPathVisible(state.module === 2);
      panel.hidden = false;
      record.log('experienced', { id: `cinematic/${id}`, name: def.title });
    };
    player.onSkip = () => {
      document.body.classList.remove('cinematic-playing');
      record.log('experienced', { id: `cinematic/${id}`, name: `${def.title} (skipped)` });
    };
    panel.hidden = true;
    player.load({ ...def, shots: def.shots.map((s) => ({ ...s, purpose: s.purpose || def.purpose })) });
    player.play();
    player.root.querySelector('.cinematic-skip')?.focus();
    return true;
  }

  shell.on('textmode', () => {
    if (!textModeEl.hidden) {
      panel.replaceChildren();
      panel.hidden = true;
      textMode.show('module');
      window.__engine?.pause();
      textModeEl.focus();
    } else {
      // Empty text mode so its ids/labels never duplicate the panel's.
      textModeEl.replaceChildren();
      panel.hidden = false;
      renderModule(state.module, panel, ctxFor('3d'));
      window.__engine?.resume();
    }
  });
  shell.on('restart', () => { goModule(state.module); });

  if (window.__engine) {
    player = new ShotPlayer({ container: document.getElementById('cinematic-host'), camera: window.__engine.camera, motion });
    window.__player = player;
    window.__engine.start();
  }

  const hooks = { shell, record, textMode, settings, engine: window.__engine, scene: null, content, state, goModule, playCinematic, panel };
  renderModule(0, panel, ctxFor('3d'));

  if (window.__engine) {
    terrain = new MuirInletScene(window.__engine);
    terrain.load().then(() => {
      hooks.scene = terrain;
      terrain.setPath(content.flowline.points);
      terrain.setPathVisible(state.module === 2);
      terrain.setViewpoint(MODULE_VIEW[state.module]);
      return terrain.buildLiving(content, { reducedMotion: motion.reduced }).then((dressing) => {
        world = new MuirWorld({ engine: window.__engine, site: terrain, dressing, content, motion, stage });
        hooks.world = world;
        hooks.dressing = dressing;
        window.__engine.onUpdate((dt) => { dressing.update(dt, window.__engine.camera); world.update(dt); });
        if (state.module !== 2) dressing.setYear(2004);
        syncCalm();
        mountSceneBar(shell, terrain, world, syncCalm);
      });
    }).catch((err) => {
      console.error(err);
      stage.insertAdjacentHTML('beforeend',
        '<div role="alert" class="load-error"><p>The terrain failed to load. Every task still works in the panel and in text mode.</p></div>');
    });
  }

  if (__TEST_HOOKS__) {
    window.__TEST__ = hooks;
  }
}

/** Scene control strip: preset viewpoints, camera rotate/zoom buttons + credits.
 * Lives in the shell's bottom strip (in normal flow) so it can never overlap the
 * module panel (visual review V1 / heuristics H6). Camera buttons are the pointer
 * alternative required by standards §5.4 / WCAG 2.5.1 and give keyboard users
 * orbit + zoom (accessibility review A2). */
function mountSceneBar(shell, terrain, world, syncCalm) {
  const bar = document.createElement('div');
  bar.className = 'scene-bar';
  const viewpoints = document.createElement('div');
  viewpoints.className = 'viewpoint-bar';
  viewpoints.setAttribute('role', 'group');
  viewpoints.setAttribute('aria-label', 'Viewpoints');
  for (const [id, vp] of Object.entries(terrain.viewpoints)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = vp.label;
    b.setAttribute('aria-pressed', String(terrain.current === id));
    b.addEventListener('click', () => {
      terrain.setViewpoint(id);
      for (const o of viewpoints.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
      announce(`View: ${vp.label}`);
    });
    viewpoints.appendChild(b);
  }
  // v2 in-world ring equivalents (keyboard / pointer alternative to clicking the rings).
  const ring = document.createElement('button');
  ring.type = 'button';
  ring.className = 'btn';
  ring.textContent = 'Photo spot (1941 print)';
  ring.addEventListener('click', () => world.goRing('photo'));
  viewpoints.appendChild(ring);
  const tools = document.createElement('div');
  tools.className = 'tool-bar';
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Terrain tools');
  const mBtn = document.createElement('button');
  mBtn.type = 'button';
  mBtn.dataset.action = 'measure-tool';
  mBtn.setAttribute('aria-pressed', 'false');
  mBtn.textContent = 'Measuring line on the terrain';
  const mOut = document.createElement('p');
  mOut.className = 'terrain-measure-out';
  mOut.setAttribute('aria-live', 'polite');
  mBtn.addEventListener('click', () => {
    const on = mBtn.getAttribute('aria-pressed') !== 'true';
    mBtn.setAttribute('aria-pressed', String(on));
    world.setMeasureTool(on, mOut);
    mOut.textContent = on ? 'Drag along the valley on the terrain to draw the line (it snaps to the orange path). Keyboard: use the measurement sliders in Module 3 or text mode.' : '';
    if (!on) terrain.setPathVisible(window.__glacierModule === 2);
    syncCalm();
  });
  tools.append(mBtn, mOut);
  const cam = document.createElement('div');
  cam.className = 'camera-bar';
  cam.setAttribute('role', 'group');
  cam.setAttribute('aria-label', 'Camera rotate and zoom');
  const step = (label, opts) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => terrain.step(opts));
    return b;
  };
  cam.append(
    step('Rotate left', { rotX: -1 }),
    step('Rotate right', { rotX: 1 }),
    step('Tilt up', { rotY: -1 }),
    step('Tilt down', { rotY: 1 }),
    step('Zoom in', { zoom: -1 }),
    step('Zoom out', { zoom: 1 }),
  );
  const hint = document.createElement('p');
  hint.className = 'scene-hint';
  hint.textContent = 'Camera: arrow keys rotate, + / − zoom, W A S D move (outside form fields). Click a blue ring to glide there.';
  const credits = document.createElement('details');
  credits.className = 'credits-disclosure';
  const sum = document.createElement('summary');
  sum.textContent = 'Terrain, imagery and sky credits';
  const p = document.createElement('p');
  p.className = 'scene-credits';
  p.textContent = terrain.getCredits();
  credits.append(sum, p);
  bar.append(viewpoints, tools, cam, hint, credits);
  shell.hud.replaceChildren(bar);
  shell.hud.hidden = false;
}

main();
