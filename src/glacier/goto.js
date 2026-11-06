/**
 * goto.js — one "Go to" menu for the places in Muir Inlet (plan 10 §6.6: the
 * v2 rows of location buttons become a single menu; the camera buttons live in
 * the template's control cluster). It sits in the top bar next to Menu. Each
 * place eases the camera there; the learner can always look and move on from
 * it. "Ride with the kayak" follows the kayak until the learner moves away.
 * @module glacier/goto
 */
import { openDialog, closeDialog } from '../a11y/focus.js';
import { announce } from '../a11y/announcer.js';
import { lookView } from './world.js';

/** Places: label, short description (shown under the label) and a rig view (or an action). */
export function places(world, lessons) {
  const site = world.site;
  const P = (x, z, up = 0) => [x, site.ground(x, z) + up, z];
  const fr = () => world.ice.front;
  const at = (ds, a, up) => { const f = site.frame(fr().s + ds); return P(f.x + f.nx * a * 1100, f.z + f.nz * a * 1100, up); };
  const lm = site.landmarks;
  const peak = world.land.peaks[0] || { x: 0, z: -18000 };
  const tree = world.showcase.position;
  return [
    { id: 'front', label: 'The ice front', note: 'The calving cliff in the year the 3D view shows.', view: () => lookView(at(-1100, -0.3, 160), at(80, 0, 40)) },
    { id: 'station', label: 'Photo station (approximate)', note: 'Where the 1941, 1950 and 2004 photos were taken.', view: () => lessons.views().station },
    { id: 'plants', label: 'Plants beside the station', note: 'Moss, Dryas, fireweed and alder.', view: () => lessons.views().ridge },
    { id: 'fronts', label: 'Ice fronts 1941 to 2004', note: 'The dated fronts and their orange year tags.', view: () => lessons.views().m3 },
    { id: 'inlet', label: 'Lower Muir Inlet', note: 'The fjord near its mouth.', view: () => lookView(P(lm.inlet.x + 2100, lm.inlet.z + 6200, 1800), P(lm.inlet.x, lm.inlet.z - 5000, 0)) },
    { id: 'muir', label: 'Muir Glacier name point', note: 'The published coordinate at the head of the inlet.', view: () => lookView(P(lm.muir.x + 3600, lm.muir.z + 4800, 1900), P(lm.muir.x, lm.muir.z, 80)) },
    { id: 'riggs', label: 'Riggs Glacier', note: 'The side glacier that once joined Muir Glacier.', view: () => lookView(P(lm.riggs.x - 4200, lm.riggs.z + 3600, 1300), P(lm.riggs.x, lm.riggs.z, 0)) },
    { id: 'summits', label: 'Snowfields and summits', note: 'Where the glacier is fed.', view: () => lookView(P(peak.x + 5200, peak.z + 7800, 2300), P(peak.x, peak.z, -200)) },
    { id: 'forest', label: 'Old forest near the inlet mouth', note: 'Sitka spruce and western hemlock.', view: () => lookView([tree.x + 34, tree.y + 7, tree.z + 30], [tree.x, tree.y + 12, tree.z]) },
    { id: 'kayak', label: 'Ride with the kayak', note: 'Follow a sea kayak up the inlet.', act: () => world.followKayak(true) },
    { id: 'overview', label: 'Overview of the inlet', note: 'The whole elevation model from the south.', view: () => lookView([16000, 15000, 34000], [0, 300, -3000]) },
  ];
}

export function mountGoTo(app, world, lessons) {
  const shell = app.shell;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'v3-btn gtm-goto-btn';
  btn.dataset.action = 'goto';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.textContent = 'Go to';
  shell.root.querySelector('[data-action="menu"]').before(btn);
  const dlg = document.createElement('dialog');
  dlg.className = 'v3-menu gtm-goto';
  dlg.setAttribute('aria-labelledby', 'gtm-goto-h');
  dlg.innerHTML = '<div class="v3-dialog-head"><h2 id="gtm-goto-h">Go to</h2><button type="button" class="v3-icon-btn" data-goto-close aria-label="Close Go to">✕</button></div><ul class="v3-menu-list"></ul>';
  shell.root.appendChild(dlg);
  const list = dlg.querySelector('ul');
  const all = places(world, lessons);
  for (const p of all) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'v3-btn gtm-place';
    b.dataset.place = p.id;
    b.innerHTML = '<span class="gtm-place-name"></span><span class="gtm-place-note"></span>';
    b.querySelector('.gtm-place-name').textContent = p.label;
    b.querySelector('.gtm-place-note').textContent = p.note;
    b.addEventListener('click', () => { closeDialog(dlg); go(p.id); });
    li.appendChild(b);
    list.appendChild(li);
  }
  const go = (id) => {
    const p = all.find((x) => x.id === id);
    if (!p) return;
    app.inspect.close({ restore: false });
    world.followKayak(false);
    if (p.act) p.act(); else app.rig.flyTo(p.view(), 1.6);
    announce(`Going to ${p.label}`);
  };
  btn.addEventListener('click', () => openDialog(dlg, btn));
  dlg.querySelector('[data-goto-close]').addEventListener('click', () => closeDialog(dlg));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); });
  // The Go to button is part of the 3D view: hidden in text mode and in a sceneless start.
  const sync = () => { btn.hidden = app.sceneless || !shell.textModeRoot.hidden; };
  shell.on('action:textmode', () => setTimeout(sync, 0));
  sync();
  return { button: btn, dialog: dlg, go, places: all };
}
