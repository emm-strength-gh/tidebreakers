'use strict';
/* =====================================================================
   TIDEBREAKERS — game flow: boot, main loop, input, quests, saving
   ===================================================================== */
(() => {
const D = TB.D, U = TB.U;
const { clamp, rand, damp } = U;
const $ = id => document.getElementById(id);
const SAVE_KEY = 'tidebreakers.save.v1';
const SET_KEY = 'tidebreakers.settings';
const Game = TB.Game = { state: 'boot', settings: { touch: 'auto' } };
let G = null;
let simT = 0, menuT = 0, last = 0, questT = 0, saveT = 0, menuMode = 'campaign', menuDiff = 'normal';
const IN = { mx: 0, mz: 0, fire: false, harpoon: false, action: false, sonar: false };
const keys = new Set();
const btn = { fire: false, harpoon: false };
const joy = { on: false, id: null, bx: 0, by: 0, dx: 0, dy: 0 };

try { Object.assign(Game.settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { /* defaults */ }
Game.saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(Game.settings)); } catch (e) { /* storage blocked */ } };

// ================================================================ state
function newState(mode, diff, peaceful) {
  const st = D.DIFF[diff].start, stock = {};
  for (const k of D.RES_KEYS) stock[k] = Math.round(D.START[k] * (k === 'coins' ? 1 : st));
  const upg = {}; for (const k of Object.keys(D.UPG)) upg[k] = 0;
  return {
    v: 1, mode, diff, peaceful: !!peaceful, seed: (Math.random() * 1e9) | 0, t: 0, day: 1, dayT: 0.08,
    stock, pop: D.START_POP, unlocked: [], upg, stats: {}, chapter: 0, goalBase: {}, campaignDone: false, milestones: [],
    rep: 40, raidPenalty: 0, raid: { state: 'idle', next: 0 }, merchant: { next: 0, offers: [] }, migrantT: D.DAY_LEN * 0.5, score: 0,
  };
}
function buildWorld(save) {
  TB.Fx.clear();
  TB.Actors.init();
  TB.World.generate(G.seed);
  if (save) TB.Town.load(save.town); else TB.Town.newTown();
  if (save && save.boat) TB.Boat.load(save.boat); else TB.Boat.spawn(true);
  TB.World.start();
  if (save && save.outposts) save.outposts.forEach((c, i) => { const op = TB.World.outposts[i]; if (op && c) { for (const g of op.guns) TB.Actors.remove(g); op.guns = []; op.cleared = true; op.respawnT = G.t + D.DAY_LEN; if (op.cage) { op.cage.obj.removeFromParent(); op.cage = null; } } });
  TB.Town.alarm = false;
  const P = TB.Boat.P; TB.Gfx.cam.tx = P.x; TB.Gfx.cam.tz = P.z;
}
function startNew(mode, diff, peaceful) {
  G = TB.G = newState(mode, diff, peaceful);
  buildWorld(null);
  if (mode === 'campaign') beginChapter(0, true);
  else { G.stock.wood += 10; G.stock.plastic += 6; }
  play();
  setTimeout(() => {
    if (Game.state !== 'play') return;
    if (mode === 'campaign') TB.UI.banner('Chapter 1: The First Float', D.CHAPTERS[0].text, 'objective');
    else TB.UI.banner('Endless tides', 'Build, scavenge and survive — forever', 'star');
  }, 400);
  tutorial();
}
function play() {
  Game.state = 'play';
  $('menu').classList.remove('show'); $('pause').classList.remove('show'); $('end').classList.remove('show');
  TB.UI.showHUD(true);
  TB.Snd.init();
  TB.Gfx.cam.zoomT = 36;
}
function tutorial() {
  const touch = !$('touch').hidden;
  const tips = G.mode === 'campaign' ? [
    [3, touch ? 'Steer with your left thumb. The camera follows your boat.' : 'Steer with WASD or the arrow keys. The camera follows your boat.'],
    [9, touch ? 'Tap NET to lower the salvage net, then sail through the floating planks.' : 'Press E to lower the salvage net, then sail through the floating planks.'],
    [17, 'Sail back into the dock by the pier to unload what you caught.'],
  ] : [
    [3, 'Endless mode: raids start around day 3 and grow every day. Build defenses early!'],
    [10, touch ? 'NET lowers the salvage net. Unload at the dock, then tap Build.' : 'E lowers the salvage net. Unload at the dock, then press B to build.'],
  ];
  for (const [t, msg] of tips) setTimeout(() => { if (Game.state === 'play' && G && G.t < t + 30) TB.UI.toast(msg, 'info', 6.5); }, t * 1000);
}

// ================================================================ quests
function beginChapter(i, silent) {
  G.chapter = i; G.goalBase = {};
  const c = D.CHAPTERS[i]; if (!c) return;
  for (const g of c.goals) if (g.k === 'count') G.goalBase[g.s] = G.stats[g.s] || 0;
  if (!silent) { TB.UI.banner(`Chapter ${i + 1}: ${c.title}`, c.text, 'objective'); TB.Snd.play('chapter'); }
  // chapter set-pieces
  if (i === 3 && TB.Town.count('trader')) G.merchant.next = G.t + 12;
  if (i === 6) TB.UI.toast('Red Wake outposts are marked on your screen edge. Bring harpoons!', 'info', 6);
}
function goalValue(g) {
  if (g.k === 'count') return (G.stats[g.s] || 0) - (G.goalBase[g.s] || 0);
  if (g.s === 'pop') return G.pop;
  if (g.s.startsWith('b_')) return TB.Town.count(g.s.slice(2));
  return 0;
}
function msValue(m) { if (m.s === 'pop') return G.pop; if (m.s === 'days') return G.day - 1; return G.stats[m.s] || 0; }
function quest() {
  if (!G) return null;
  if (G.mode === 'endless' || G.campaignDone) {
    const next = D.MILESTONES.map((m, i) => ({ m, i })).filter(x => !G.milestones.includes(x.i)).slice(0, 3);
    return { label: G.mode === 'endless' ? 'Endless tides · day ' + G.day : 'Free play', title: next.length ? 'Milestones' : 'Legend of the tides', goals: next.map(({ m }) => ({ t: m.t, cur: msValue(m), n: m.n, done: false })) };
  }
  const c = D.CHAPTERS[G.chapter];
  return { label: `Chapter ${G.chapter + 1} of ${D.CHAPTERS.length}`, title: c.title, goals: c.goals.map(g => { const cur = goalValue(g); return { t: g.t, cur, n: g.n, done: cur >= g.n }; }) };
}
function checkQuests() {
  if (G.mode === 'campaign' && !G.campaignDone) {
    const q = quest();
    if (q.goals.every(g => g.done)) {
      const c = D.CHAPTERS[G.chapter];
      for (const [k, v] of Object.entries(c.reward)) G.stock[k] = Math.min(TB.Town.cap(k) + (k === 'coins' ? 9999 : 0), G.stock[k] + v);
      TB.UI.toast('Chapter reward: ' + Object.entries(c.reward).map(([k, v]) => `+${v} ${D.RES[k].name.toLowerCase()}`).join(', '), 'good', 6);
      if (G.chapter + 1 < D.CHAPTERS.length) beginChapter(G.chapter + 1);
      else {
        G.campaignDone = true;
        TB.UI.banner('Campaign complete!', 'Tidebreak Harbor stands. Keep building — the tides never stop.', 'star');
        TB.Snd.play('chapter');
      }
      autosave(true);
    }
    return;
  }
  D.MILESTONES.forEach((m, i) => {
    if (G.milestones.includes(i) || msValue(m) < m.n) return;
    G.milestones.push(i);
    TB.UI.banner('Milestone', m.t, 'star'); TB.Snd.play('levelUp');
    G.stock.coins += 10 + i * 5;
  });
}

// ================================================================ days
function newDay() {
  G.day++;
  G.stats.days = G.day - 1;
  let leave = 0;
  const starving = G.stock.food < 0.5, thirsty = G.stock.water < 0.5;
  if (starving) leave++;
  if (thirsty) leave++;
  const att = TB.Town.econ.attract;
  if (!leave && att < 25 && Math.random() < (TB.Town.count('clinic') ? 0.25 : 0.5)) leave = 1;
  if (leave && G.pop > 0) {
    leave = Math.min(leave, G.pop);
    G.pop -= leave;
    TB.UI.toast(`${leave} settler${leave > 1 ? 's' : ''} left the town` + (starving || thirsty ? ` — not enough ${starving && thirsty ? 'food and water' : starving ? 'food' : 'water'}` : ' — morale is too low'), 'danger', 6);
    TB.Town.recompute();
  }
  if (G.pop <= 0) { gameOver('Everyone has left', 'Without food, water and hope, the last settlers rowed away.'); return; }
  TB.UI.toast(`Day ${G.day} — ${G.pop} settlers, mood ${att}%`, 'info');
  G.rep = clamp(G.rep + (att >= 60 ? 1 : att < 35 ? -1 : 0), 0, 100);
  autosave(true);
}

// ================================================================ save / load
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } $('continueBtn').hidden = true; }
function autosave(force) {
  if (!G || Game.state !== 'play' && Game.state !== 'paused') return;
  if (!force && performance.now() - saveT < 8000) return;
  saveT = performance.now();
  const P = TB.Boat.P; if (!P || !P.alive) return;
  try {
    const data = { G: Object.assign({}, G, { raid: { state: 'idle', next: G.raid.state === 'idle' ? G.raid.next : G.t + 60, lastBossDay: G.raid.lastBossDay }, merchant: { next: G.t + 30, offers: [] } }),
      town: TB.Town.save(), boat: TB.Boat.save(), outposts: TB.World.outposts.map(o => o.cleared), at: Date.now() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('save failed', e); }
}
function loadSave() {
  let data;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
  if (!data || !data.G) { TB.UI.toast('No saved game found', 'warn'); return false; }
  G = TB.G = data.G;
  const base = newState(G.mode, G.diff, G.peaceful);
  for (const k of Object.keys(base)) if (G[k] === undefined) G[k] = base[k];
  for (const k of Object.keys(base.upg)) if (G.upg[k] === undefined) G.upg[k] = 0;
  buildWorld(data);
  play();
  TB.UI.toast(`Welcome back — day ${G.day}, ${G.pop} settlers`, 'good');
  return true;
}
Game.autosave = autosave; Game.hasSave = hasSave; Game.wipeSave = wipeSave;

function gameOver(title, text) {
  Game.state = 'end';
  TB.UI.exitBuild(); TB.UI.closePanel();
  $('endTitle').textContent = title;
  $('endText').textContent = text;
  const s = G.stats;
  $('endStats').innerHTML = [['Days survived', G.day], ['Peak settlers', Math.max(G.pop, s.peak || 0)], ['Castaways rescued', s.rescued || 0], ['Raiders sunk', s.kills || 0], ['Raids repelled', s.raids_repelled || 0], ['Wrecks dived', s.dives || 0]]
    .map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  $('endLoad').hidden = !hasSave();
  $('end').classList.add('show');
  TB.Snd.play('boom');
}
// losing the hall is fatal only on the hardest difficulty; otherwise it must be rebuilt
TB.on('hallDestroyed', () => {
  if (G.diff === 'hard') { setTimeout(() => gameOver('The Town Hall has fallen', 'The raiders burned the heart of your town. The survivors scatter across the sea.'), 1200); return; }
  G.raidPenalty = (G.raidPenalty || 0) + 25;
  TB.UI.banner('Town Hall wrecked!', 'Rebuild it from the Build menu before morale collapses', 'danger');
});
TB.on('outpost', () => { G.stats.outposts = (G.stats.outposts || 0) + 1; G.rep += 8; TB.UI.banner('Outpost destroyed!', 'Prisoners are swimming free — pick them up', 'star'); TB.Snd.play('chapter'); });
TB.on('built', ({ b }) => {
  if (b === 'trader' && G.mode === 'campaign' && G.chapter <= 3) G.merchant.next = G.t + 12;
  if (b === 'trader' && !G.merchant.next) G.merchant.next = G.t + 20;
  if (b === 'watchtower' && G.chapter === 5 && G.raid.state === 'idle' && !(G.stats.raids_repelled > 0)) { G.raid.next = G.t + 70; G.raid.state = 'idle'; }
});
TB.on('merchantArrived', n => { TB.UI.toast(`${n.name} has moored at your Trader Pier. Open Trade!`, 'good', 6); TB.Snd.play('horn'); });
TB.on('docked', () => { if (G.mode === 'campaign' && G.chapter === 0 && !(G.stats.built_platform > 0)) setTimeout(() => TB.UI.toast(!$('touch').hidden ? 'Tap Build to add raft platforms to your town.' : 'Press B (or the Build button) to add raft platforms.', 'info', 6), 1500); });

// ================================================================ input
function readInput() {
  let sx = 0, sy = 0;
  if (!TB.UI.building) {
    if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) sy += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) sy -= 1;
  }
  if (joy.on) { sx += joy.dx; sy -= joy.dy; }
  const l = Math.hypot(sx, sy); if (l > 1) { sx /= l; sy /= l; }
  const ax = TB.Gfx.screenAxes();
  IN.mx = ax.rightX * sx + ax.upX * sy;
  IN.mz = ax.rightZ * sx + ax.upZ * sy;
  IN.fire = keys.has('Space') || keys.has('KeyJ') || btn.fire;
  IN.harpoon = keys.has('KeyK') || btn.harpoon;
}
function edge(name) { IN[name] = true; }

window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  TB.Snd.init();
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (Game.state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) { pause(false); return; }
  if (Game.state !== 'play') return;
  const ui = TB.UI;
  switch (e.code) {
    case 'Escape': if (ui.building) { if (!ui.buildCancel()) ui.exitBuild(); } else if (ui.isOpen()) ui.closePanel(); else pause(true); break;
    case 'KeyP': pause(true); break;
    case 'KeyE': if (!ui.building && !ui.isOpen()) edge('action'); break;
    case 'KeyQ': if (!ui.building && !ui.isOpen()) edge('sonar'); break;
    case 'KeyB': if (ui.isOpen()) ui.closePanel(); ui.toggleBuild(); break;
    case 'KeyU': if (ui.isOpen()) ui.closePanel(); ui.enterBuild('boats'); break;
    case 'KeyI': ui.panel === 'town' ? ui.closePanel() : ui.openPanel('town'); break;
    case 'KeyT': ui.panel === 'trade' ? ui.closePanel() : ui.openPanel('trade'); break;
    case 'KeyL': ui.panel === 'quests' ? ui.closePanel() : ui.openPanel('quests'); break;
    case 'KeyZ': TB.Gfx.cam.yawT -= Math.PI / 2; break;
    case 'KeyC': TB.Gfx.cam.yawT += Math.PI / 2; break;
    case 'Equal': case 'NumpadAdd': zoom(-1); break;
    case 'Minus': case 'NumpadSubtract': zoom(1); break;
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); btn.fire = btn.harpoon = false; joy.on = false; TB.UI.setJoy(false, 0, 0, 0, 0); if (Game.state === 'play' && !TB.UI.building) pause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { autosave(true); if (Game.state === 'play') pause(true); } });

function zoom(dir, amount = 1.15) {
  const c = TB.Gfx.cam, max = TB.UI.building ? 110 : 90;
  c.zoomT = clamp(c.zoomT * (dir > 0 ? amount : 1 / amount), 20, max);
}

// ---- pointer: joystick, build mode taps/drags, pinch zoom
const canvas = $('game');
const pointers = new Map();
let pinch = null;
canvas.addEventListener('wheel', e => { e.preventDefault(); if (Game.state === 'play' || Game.state === 'menu') zoom(Math.sign(e.deltaY), 1.1); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  TB.Snd.init();
  if (Game.state !== 'play') return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
  const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, drag: false, role: null, button: e.button };
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    if (a.role !== 'joy' && b.role !== 'joy') pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: TB.Gfx.cam.zoomT };
    return;
  }
  if (TB.UI.building) { if (e.button === 2) { TB.UI.buildCancel(); p.role = 'none'; } else p.role = 'build'; return; }
  if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.6 && !joy.on) {
    p.role = 'joy'; joy.on = true; joy.id = e.pointerId; joy.bx = e.clientX; joy.by = e.clientY; joy.dx = joy.dy = 0;
    TB.UI.setJoy(true, joy.bx, joy.by, 0, 0);
  }
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) { if (TB.UI.building && e.pointerType !== 'touch') TB.UI.buildHover(e.clientX, e.clientY); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    TB.Gfx.cam.zoomT = clamp(pinch.z * pinch.d / Math.max(20, d), 20, TB.UI.building ? 110 : 90);
    return;
  }
  if (p.role === 'joy') {
    let jx = (p.x - joy.bx) / 55, jy = (p.y - joy.by) / 55;
    const l = Math.hypot(jx, jy); if (l > 1) { joy.bx += (p.x - joy.bx) * (1 - 1 / l) ; joy.by += (p.y - joy.by) * (1 - 1 / l); jx /= l; jy /= l; }
    joy.dx = Math.abs(jx) < 0.12 ? 0 : jx; joy.dy = Math.abs(jy) < 0.12 ? 0 : jy;
    TB.UI.setJoy(true, joy.bx, joy.by, jx, jy);
  } else if (p.role === 'build') {
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) p.drag = true;
    if (p.drag) panCamera(dx, dy);
    else if (p.type !== 'touch') TB.UI.buildHover(p.x, p.y);
  }
});
function endPointer(e) {
  const p = pointers.get(e.pointerId); if (!p) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (p.role === 'joy') { joy.on = false; joy.id = null; joy.dx = joy.dy = 0; TB.UI.setJoy(false, 0, 0, 0, 0); }
  if (p.role === 'build' && !p.drag && e.type === 'pointerup' && !pinch) TB.UI.buildTap(p.x, p.y, p.type === 'touch');
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
function panCamera(dx, dy) {
  const c = TB.Gfx.cam, ax = TB.Gfx.screenAxes(), k = (TB.Gfx.view.span || c.zoom) / TB.Gfx.view.h;
  const sinP = Math.sin(c.pitch);
  c.tx -= (ax.rightX * dx - ax.upX * dy / sinP) * k;
  c.tz -= (ax.rightZ * dx - ax.upZ * dy / sinP) * k;
  const lim = TB.Town.bounds() + 30;
  const l = Math.hypot(c.tx, c.tz); if (l > lim) { c.tx *= lim / l; c.tz *= lim / l; }
}

// ---- touch buttons
document.querySelectorAll('#touch [data-btn]').forEach(b => {
  const name = b.dataset.btn;
  const down = e => {
    e.preventDefault(); e.stopPropagation(); TB.Snd.init();
    b.classList.add('sk-touch_button_pressed');
    if (name === 'fire' || name === 'harpoon') btn[name] = true;
    else if (name === 'action') edge('action');
    else if (name === 'sonar') edge('sonar');
    else if (name === 'zoomin') zoom(-1, 1.25);
    else if (name === 'zoomout') zoom(1, 1.25);
    else if (name === 'rotate') TB.Gfx.cam.yawT += Math.PI / 2;
  };
  const up = e => { e.preventDefault(); b.classList.remove('sk-touch_button_pressed'); if (name === 'fire' || name === 'harpoon') btn[name] = false; };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
});

// ================================================================ camera
let focus = 'boat';
Game.focusTown = () => { focus = 'town'; const c = TB.Gfx.cam; c.prevZoom = c.zoomT; c.zoomT = Math.max(38, Math.min(80, TB.Town.bounds() * 1.7)); };
Game.focusBoat = () => { focus = 'boat'; const c = TB.Gfx.cam; if (c.prevZoom) c.zoomT = c.prevZoom; };
function updateCamera(dt) {
  const c = TB.Gfx.cam;
  if (Game.state === 'menu') {
    menuT += dt;
    c.yawT = Math.PI / 4 + menuT * 0.05; c.yaw = c.yawT;
    c.tx = U.damp(c.tx, 2, 2, dt); c.tz = U.damp(c.tz, 6, 2, dt);
    c.zoomT = 58;
  } else if (focus === 'town' && TB.UI.building) {
    // WASD pans while building
    let sx = 0, sy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) sy += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) sy -= 1;
    if (sx || sy) panCamera(-sx * 600 * dt, sy * 600 * dt);
    if (!c.panned) { c.tx = U.damp(c.tx, 0, 3, dt); c.tz = U.damp(c.tz, 3, 3, dt); if (Math.hypot(c.tx, c.tz - 3) < 1) c.panned = true; }
  } else {
    const P = TB.Boat.P;
    if (P) { c.tx = U.damp(c.tx, P.x + P.vx * 0.55, 4, dt); c.tz = U.damp(c.tz, P.z + P.vz * 0.55, 4, dt); }
    c.panned = false;
  }
  TB.Gfx.updateCamera(dt);
}

// ================================================================ pause & menus
function pause(on) {
  if (on && Game.state === 'play') { Game.state = 'paused'; $('pause').classList.add('show'); autosave(true); }
  else if (!on && Game.state === 'paused') { Game.state = 'play'; $('pause').classList.remove('show'); }
}
Game.pause = pause;
function toMenu() {
  autosave(true);
  TB.UI.exitBuild(); TB.UI.closePanel();
  $('pause').classList.remove('show'); $('end').classList.remove('show');
  TB.UI.showHUD(false);
  demo();
  $('continueBtn').hidden = !hasSave();
  $('menu').classList.add('show');
}
function wireMenus() {
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { menuMode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('sel', x === b)); TB.Snd.init(); TB.Snd.play('click'); }));
  document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => { menuDiff = b.dataset.diff; document.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('sel', x === b)); TB.Snd.init(); TB.Snd.play('click'); }));
  // the "All games" link only makes sense next to the Pocket Arcade page, not on GitHub Pages
  if (/github\.io$/.test(location.hostname)) { const a = document.querySelector('a[href="../index.html"]'); if (a) a.remove(); }
  let armT = 0;
  $('startBtn').addEventListener('click', () => {
    const b = $('startBtn');
    // with a save on disk, the first click asks for confirmation on the button itself
    if (hasSave() && performance.now() - armT > 4000) { armT = performance.now(); b.textContent = 'Replace save?'; TB.Snd.init(); TB.Snd.play('deny'); setTimeout(() => { if (Game.state === 'menu') b.textContent = 'New game'; }, 4000); return; }
    b.textContent = hasSave() ? 'New game' : 'Set sail';
    startNew(menuMode, menuDiff, $('peaceful').checked);
  });
  $('continueBtn').addEventListener('click', () => loadSave());
  $('menuSettings').addEventListener('click', () => { const was = Game.state; Game.state = 'play'; TB.UI.openPanel('settings'); Game.state = was; });
  $('resumeBtn').addEventListener('click', () => pause(false));
  $('pauseSettings').addEventListener('click', () => { pause(false); TB.UI.openPanel('settings'); });
  $('saveQuitBtn').addEventListener('click', toMenu);
  $('endLoad').addEventListener('click', () => { $('end').classList.remove('show'); loadSave(); });
  $('endMenu').addEventListener('click', () => { $('end').classList.remove('show'); toMenu(); });
}

// a pretty town behind the main menu
function demo() {
  G = TB.G = newState('campaign', 'normal', true);
  G.seed = 4242;
  buildWorld(null);
  for (const k of D.RES_KEYS) G.stock[k] = 999;
  G.unlocked = D.BLUEPRINTS.slice();
  const plan = [[-1, -1], [1, -1], [0, -1], [-2, 0], [2, 0], [1, 1], [-1, 1], [-2, -1], [2, -1], [0, -2], [-1, -2], [1, -2], [2, 1], [-2, 1], [3, 0], [3, -1]];
  for (const [i, j] of plan) TB.Town.place('platform', i, j);
  const blds = [['house', -1, -1], ['house', 1, -1], ['watchtower', 2, 1], ['rain', 0, -1], ['fishing', -2, 1], ['windmill', -2, -1], ['market', 1, 1], ['storage', -1, 1], ['purifier', 2, -1], ['house', 0, -2], ['lanterns', -1, 0], ['solar', 1, -2], ['garden', -1, -2], ['trader', 3, 0], ['radio', -2, 0], ['harpoon', 3, -1], ['clinic', 2, 0], ['workshop', 1, 0]];
  for (const [b, i, j] of blds) TB.Town.place(b, i, j);
  G.pop = 22; G.dayT = 0.6;
  TB.Town.recompute();
  Game.state = 'menu';
  TB.Gfx.cam.tx = 2; TB.Gfx.cam.tz = 6;
}

// ================================================================ main loop
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 0.016;
  tick(Math.min(dt, 0.05));
}
// one simulation + render step (also used by automated tests: TB.Game.tick(1/60))
function tick(dt) {
  const running = Game.state === 'play' && !TB.UI.building && !TB.UI.isOpen();
  if (running) {
    readInput();
    simT += dt;
    G.t += dt;
    G.dayT += dt / D.DAY_LEN;
    if (G.dayT >= 1) { G.dayT -= 1; newDay(); }
    TB.Boat.update(dt, IN, simT);
    TB.World.update(dt, simT);
    TB.Town.update(dt, simT);
    TB.Actors.update(dt, simT);
    TB.Fx.update(dt);
    G.stats.peak = Math.max(G.stats.peak || 0, G.pop);
    if ((questT -= dt) <= 0) { questT = 0.4; checkQuests(); }
    autosave();
  } else if (Game.state === 'menu') {
    simT += dt;
    TB.World.update(dt, simT);
    TB.Town.update(dt, simT);
    TB.Fx.update(dt);
    const P = TB.Boat.P; if (P) { P.obj.position.y = U.wave(P.x, P.z, simT); }
  }
  IN.action = false; IN.sonar = false;
  TB.Models.tick(running || Game.state === 'menu' ? dt : 0);
  updateCamera(dt);
  if (G) TB.Gfx.setTimeOfDay(G.dayT);
  TB.Gfx.render(simT);
  if (Game.state === 'play' || Game.state === 'paused') TB.UI.update(running ? dt : dt * 0.5);
}

// ================================================================ boot
async function boot() {
  clearTimeout(window.__threeFail);
  const canvas = $('game');
  TB.UI.loading(0.15, 'Lighting the lanterns…');
  TB.Gfx.init(canvas);
  TB.Models.init();
  await TB.Skin.load();      // before the HUD is built, so skinned icons are used everywhere
  TB.UI.init();
  TB.Skin.hydrate();
  TB.UI.loading(0.3, 'Hauling models aboard…');
  await TB.Models.loadGLBs((d, n) => TB.UI.loading(0.3 + 0.4 * d / n, `Loading models ${d}/${n}…`));
  TB.UI.loading(0.75, 'Painting the build menu…');
  await new Promise(r => setTimeout(r, 0));
  TB.UI.renderThumbs();
  TB.UI.loading(0.9, 'Flooding the city…');
  await new Promise(r => setTimeout(r, 0));
  demo();
  wireMenus();
  $('continueBtn').hidden = !hasSave();
  if (hasSave()) $('startBtn').textContent = 'New game';
  TB.UI.loading(1, 'Ready');
  last = performance.now();
  requestAnimationFrame(frame);
  setTimeout(() => $('loading').classList.remove('show'), 150);
  pwa();
}

// ================================================================ PWA
function pwa() {
  if (window.TB_ARTIFACT) return;   // the claude.ai artifact build runs without a service worker or install prompt
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker', e));
  let prompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', async () => { if (!prompt) return; prompt.prompt(); await prompt.userChoice; prompt = null; $('installBtn').hidden = true; });
  window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });
}

TB.U.extend(Game, { quest, startNew, loadSave, toMenu, tick, IN, keys, get G() { return G; } });
if (window.THREE) boot(); else window.addEventListener('three-ready', boot, { once: true });
})();
