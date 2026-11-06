/**
 * Glacier Time Machine v3 — entry point (plan 10, scene-first revamp).
 * The v3 template shell (src/v3/, synced with _tools/sync-v3-core.mjs) runs the
 * living Muir Inlet (src/glacier/world.js), the five modules
 * (src/glacier/lessons.js), the object catalog (content/objects.json) and one
 * "Go to" menu for the places (src/glacier/goto.js).
 */
import './v3/layers.css';
import './v3/type.css';
import './v3/shell.css';
import './styles/case-fonts.css';
import './styles/glacier-v3.css';
import { createSceneApp } from './v3/app.js';
import catalog from '../content/objects.json';
import modules from '../content/modules.json';
import items from '../content/items.json';
import cards from '../content/evidence-cards.json';
import flowline from '../content/flowline.json';
import cinematics from '../content/cinematics.json';
import { Lessons } from './glacier/lessons.js';
import { MuirWorld } from './glacier/world.js';
import { mountGoTo } from './glacier/goto.js';

const SLUG = window.__SLUG__ || 'glacier-time-machine';
window.__SLUG__ = SLUG;

const content = { modules, items, cards, flowline, cinematics };
const lessons = new Lessons({ slug: SLUG, content });
const mods = lessons.modules();

const LEGEND = [
  { label: 'Year tag on a survey flag', text: 'An orange tag with a year (1941, 1950, 2004) stands beside each dated ice front. The fronts come from the published minimum retreat.' },
  { label: 'Orange measuring path', text: 'In Module 3: a valley path computed from the elevation model. It is a ruler, not a record of where the ice front was.' },
  { label: 'Measuring marker A and B', text: 'The two ends of your measurement on the orange path.' },
  { label: 'Blue or sand tint', text: 'A landform (trimline, nunataks, snowfields, ridge) tints while the pointer is over it or its card is open.' },
  { label: 'Photo held up', text: 'In Module 2 and 4: the historic photo in front of the view, wiped against today\'s 3D scene. The station is approximate.' },
  { label: 'Year in the top corner', text: 'The year the 3D view shows. Only 1941, 1950 and 2004 are dated photos; in between is illustrative.' },
];

const app = await createSceneApp({
  slug: SLUG,
  title: 'Glacier Time Machine',
  shortTitle: 'Glacier',
  modules: mods,
  catalog,
  home: { target: [0, 300, -3000], radius: 30000, theta: 0.35, phi: 1.0 },
  walkable: true,
  titleScreen: { kicker: 'Muir Inlet, Alaska · real elevation data and USGS photos', oneLiner: 'Stand where the 1941 photo was taken, watch the ice front move, and measure how far Muir Glacier has retreated.' },
  practiceObject: 'muir-terminus',
  lut: `${import.meta.env.BASE_URL}lut/muir-cool-33.png`,
  limits: { minRadius: 0.8, maxRadius: 70000, minPhi: 0.12, maxPhi: 1.52, minEye: 1.2, eyeHeight: 1.7 },
  buildScene: async (a) => {
    const world = new MuirWorld(a, content);
    await world.build();
    a.scene = world;
    a.world = world;
    lessons.bind(a, world);
    const site = world.site;
    const m1 = lessons.views().m1;
    a.rig.setHome(m1);
    a.rig.flyTo(m1, 0);
    // Stream the 30 m heightfield and the terrain tiles after the first interaction (plan §7 download budget).
    const first = () => { site.startStreaming(); for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, first, true); };
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, first, true);
    return {
      groundHeight: (x, z) => site.ground(x, z),
      bounds: [-site.halfX, site.halfX, -site.halfZ, site.halfZ],
      legend: LEGEND,
      update: (dt) => world.update(dt),
    };
  },
});

if (app.sceneless) {
  lessons.bind(app, null);
} else {
  app.goto = mountGoTo(app, app.world, lessons);
  app.shell.setControlsHelp([['Go to a place', 'Go to (top bar) lists the places in Muir Inlet.'], ['Credits', app.world.credits()]]);
}
if (__TEST_HOOKS__ && window.__TEST__) Object.assign(window.__TEST__, { lessons, world: app.world, scene: app.world, goto: app.goto });
window.__app = app;
