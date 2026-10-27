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
  shell.on('textmode', () => shell.toggleTextMode());

  if (window.__engine) {
    const player = new ShotPlayer({
      container: document.getElementById('cinematic-host'),
      camera: window.__engine.camera,
      motion,
    });
    window.__player = player;
  }

  window.__engine?.start();

  if (__TEST_HOOKS__) {
    window.__TEST__ = { engine: window.__engine, shell, record, textMode, settings };
  }
}

main();
