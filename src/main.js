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
import { renderModule } from './learning/course.js';
import './styles/site.css';

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

  if (!hasWebGL2()) {
    stage.insertAdjacentHTML('beforeend',
      '<div data-webgl-fallback role="alert"><p>WebGL is not available in this browser. ' +
      'You can still complete every objective here or in <strong>Text mode</strong>.</p></div>');
  } else {
    try {
      window.__engine = new Engine(document.getElementById('app'));
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
  let player = null;
  const textModeEl = document.getElementById('textmode');
  const textMode = new TextMode({ root: textModeEl, slug: SLUG, onDecision: () => {} });

  const ctxFor = (mode) => ({
    content, record, mode,
    playCinematic: mode === '3d' && player ? playCinematic : null,
    onMarkers: (m) => terrain?.setMarkers(m),
    setAssessing: (flag) => { state.assessing = flag; },
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
    announce(`Module ${content.modules.modules[i].title}`);
  }

  function playCinematic(id) {
    if (state.assessing) {
      announce('Finish the questions first. Cinematics never play during an assessment.', { assertive: true });
      return false;
    }
    const def = content.cinematics.cinematics.find((c) => c.id === id);
    if (!player || !def) return false;
    if (id === 's3-path') terrain?.setPathVisible(true);
    player.onDone = () => {
      terrain?.setViewpoint(MODULE_VIEW[state.module]);
      terrain?.setPathVisible(state.module === 2);
      panel.hidden = false;
      record.log('experienced', { id: `cinematic/${id}`, name: def.title });
    };
    player.onSkip = () => record.log('experienced', { id: `cinematic/${id}`, name: `${def.title} (skipped)` });
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
      mountViewpointBar(shell, terrain);
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

/** Preset viewpoint buttons + credits line in the HUD (keyboard operable). */
function mountViewpointBar(shell, terrain) {
  const bar = document.createElement('div');
  bar.className = 'viewpoint-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Viewpoints');
  for (const [id, vp] of Object.entries(terrain.viewpoints)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = vp.label;
    b.setAttribute('aria-pressed', String(terrain.current === id));
    b.addEventListener('click', () => {
      terrain.setViewpoint(id);
      for (const o of bar.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
      announce(`View: ${vp.label}`);
    });
    bar.appendChild(b);
  }
  const credits = document.createElement('p');
  credits.className = 'scene-credits';
  credits.textContent = terrain.getCredits();
  shell.hud.append(bar, credits);
}

main();
