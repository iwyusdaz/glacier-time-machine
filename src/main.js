/**
 * App entry point (Phase A starter): engine -> shell -> settings -> record ->
 * text mode -> cinematics -> scenes, per the template structure.
 * Phase B replaces the module wiring with the full course (content/*.json).
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
import './styles/site.css';

export const SLUG = window.__SLUG__ || 'glacier-time-machine';
window.__SLUG__ = SLUG;
const TITLE = 'Glacier Time Machine';

function main() {
  document.body.insertAdjacentHTML('afterbegin', '<dialog id="settings-dialog" aria-labelledby="settings-h"></dialog><dialog id="progress-dialog" aria-labelledby="progress-h"></dialog>');

  const shell = new Shell({
    slug: SLUG,
    title: TITLE,
    moduleLabels: ['1. River of ice', '2. Same place, different time', '3. Measure it', '4. What came next', '5. Why, and how sure?'],
    onModuleChange: () => {},
  });

  if (!hasWebGL2()) {
    document.getElementById('stage')?.insertAdjacentHTML(
      'beforeend',
      '<div data-webgl-fallback role="alert"><p>WebGL is not available in this browser. ' +
      'You can still complete every objective in <strong>Text mode</strong>.</p></div>',
    );
  } else {
    try {
      window.__engine = new Engine(document.getElementById('app'));
    } catch (err) {
      console.warn('WebGL engine failed to start; text mode remains available.', err);
    }
  }

  const motion = new MotionPrefs(SLUG);
  const record = new LearningRecord(SLUG);
  const settingsDialog = document.getElementById('settings-dialog');
  const settings = new Settings({ slug: SLUG, dialog: settingsDialog, quality: window.__engine?.quality, motion });
  shell.on('settings', (btn) => settings.open(btn));

  const progress = new ProgressPage({ slug: SLUG, dialog: document.getElementById('progress-dialog'), record });
  shell.on('progress', (btn) => progress.open(btn));

  const textMode = new TextMode({ root: document.getElementById('textmode'), slug: SLUG, onDecision: () => {} });
  textMode.register('intro', renderTextIntro);
  // Shell already toggles #textmode visibility for data-action="textmode";
  // here we only fill it and pause the 3D loop while it is showing.
  shell.on('textmode', () => {
    const tm = document.getElementById('textmode');
    if (!tm.hidden) {
      textMode.show('intro');
      tm.hidden = false;
      window.__engine?.pause();
    } else {
      window.__engine?.resume();
    }
  });

  if (window.__engine) {
    const player = new ShotPlayer({
      container: document.getElementById('cinematic-host'),
      camera: window.__engine.camera,
      motion,
    });
    window.__player = player;
  }

  window.__engine?.start();

  const hooks = { shell, record, textMode, settings, engine: window.__engine, scene: null };
  if (window.__engine) {
    const terrain = new MuirInletScene(window.__engine);
    terrain.load().then(() => {
      hooks.scene = terrain;
      mountViewpointBar(shell, terrain);
    }).catch((err) => {
      console.error(err);
      document.getElementById('stage')?.insertAdjacentHTML('beforeend',
        '<div role="alert" class="load-error"><p>The terrain failed to load. Text mode still has every task.</p></div>');
    });
  }

  if (__TEST_HOOKS__) {
    window.__TEST__ = hooks;
  }
}

/**
 * Phase A text-mode starter: verified facts only (research/sources.md rows 1-14).
 * Phase B replaces this with the full module parity from content/.
 */
function renderTextIntro(body, { setTitle }) {
  const base = import.meta.env.BASE_URL || './';
  setTitle('Glacier Time Machine: text mode');
  body.innerHTML = `
      <p>Muir Inlet, Glacier Bay, Alaska. Two photographs taken from the same spot on the
      southeastern side of White Thunder Ridge, looking northeast (USGS).</p>
      <figure>
        <img src="${base}photos/muir-1941-hd.jpg" width="960" height="537" style="max-width:100%;height:auto"
          alt="August 1941, black and white. A wide glacier fills the valley from side to side, its surface broken into crevasses and séracs. Bare rock slopes on both sides with no vegetation.">
        <figcaption>August 13, 1941. Photograph by W. O. Field (USGS, public domain).</figcaption>
      </figure>
      <figure>
        <img src="${base}photos/muir-2004-hd.jpg" width="960" height="537" style="max-width:100%;height:auto"
          alt="August 2004, colour, same viewpoint. The glacier is gone from view. Blue-green water fills the inlet, and dense green shrubs cover the slope in the foreground.">
        <figcaption>August 31, 2004. Photograph by Bruce F. Molnia (USGS, public domain).</figcaption>
      </figure>
      <p>USGS caption for 2004: Muir Glacier "has retreated out of the field of view and is now more than
      7 kilometers northwest." Riggs Glacier "has retreated as much as 600 meters and thinned more than 250 meters."</p>
      <p>Context from the 1941 caption: Muir Glacier had been retreating since the mid-eighteenth century,
      so the change shown here continues a much longer retreat.</p>`;
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
