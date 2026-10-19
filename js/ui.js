'use strict';
/* =====================================================================
   TIDEBREAKERS — HUD, build menu, panels, markers, minimap
   All icons come from TB.Skin.icon(key) and every frame carries an
   sk-<frame> class, so the whole interface can be re-skinned with sprites.
   ===================================================================== */
(() => {
const D = TB.D, U = TB.U;
const { clamp, dist2, fmt, esc } = U;
const $ = id => document.getElementById(id);
const I = (k, c) => TB.Skin.icon(k, c);
const UI = TB.UI = {};
const build = { on: false, tab: 'build', sel: null, hover: null, inspect: null, touchArm: null };
let panelName = null, panelT = 0, textT = 0, mmT = 0;
const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ------------------------------------------------------------ setup
const TOP = ['wood', 'plastic', 'metal', 'electronics', 'food', 'water', 'fuel', 'coins'];
function init() {
  const top = $('topbar');
  top.innerHTML = TOP.map(k => `<div class="res" data-res="${k}" title="${D.RES[k].name}">${I(k)}<div class="stack"><b>0</b><small></small></div></div>`).join('') +
    `<div class="res" data-res="pop" title="Settlers / beds">${I('people')}<div class="stack"><b>0</b><small></small></div></div>` +
    `<div class="res" data-res="power" title="Power made / used">${I('power')}<div class="stack"><b>0</b><small></small></div></div>` +
    `<div class="res" data-res="mood" title="Town attractiveness — click for details">${I('mood')}<div class="stack"><b>50%</b><small></small></div></div>`;
  top.querySelectorAll('[data-res="pop"],[data-res="mood"],[data-res="power"]').forEach(el => { el.style.cursor = 'pointer'; el.addEventListener('click', () => openPanel('town')); });
  TB.Skin.hydrate();
  document.querySelectorAll('#leftbar [data-panel]').forEach(b => b.addEventListener('click', () => { TB.Snd.play('click'); openPanel(b.dataset.panel); }));
  $('buildBtn').addEventListener('click', () => { TB.Snd.play('click'); toggleBuild(); });
  $('buildClose').addEventListener('click', () => exitBuild());
  $('panelClose').addEventListener('click', () => closePanel());
  $('panel').addEventListener('pointerdown', e => { if (e.target === $('panel')) closePanel(); });
  $('pauseBtn').addEventListener('click', () => TB.Game.pause(true));
  $('objective').addEventListener('click', () => openPanel('quests'));
  $('minimap').addEventListener('click', toggleMinimap);
  $('minimap').style.cursor = 'pointer';
  $('buildTabs').innerHTML = D.CATS.map(c => `<button type="button" class="sk-tab" data-tab="${c.key}" role="tab">${I(c.icon)}${c.name}</button>`).join('');
  $('buildTabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { TB.Snd.play('click'); build.tab = b.dataset.tab; build.sel = null; TB.Town.overlay(null); TB.Town.clearPreview(); renderBuild(); }));
  if (isTouch()) document.body.classList.add('touch-ui');
}
// building thumbnails rendered from the actual 3D models (a sprite in skin.json overrides them)
function renderThumbs() {
  for (const k of Object.keys(D.B)) {
    if (TB.Skin.has('bld_' + k)) continue;
    try {
      const o = TB.Models.make(k === 'platform' ? 'platform' : 'bld_' + k);
      if (k !== 'platform' && k !== 'hall') { const p = TB.Models.make('platform'); p.position.y = 0; o.add(p); }
      TB.Skin.setDefault('bld_' + k, TB.Gfx.thumbnail(o, 128, k === 'platform' ? 1.1 : 1));
    } catch (e) { console.warn('thumbnail', k, e); }
  }
  try { const b = TB.Models.make('boat_player'); const url = TB.Gfx.thumbnail(b, 128, 1.05); for (const k of Object.keys(D.UPG)) if (!TB.Skin.has('upg_' + k)) TB.Skin.setDefault('upg_' + k, url); } catch (e) { /* keep vector icon */ }
  TB.Gfx.disposeThumbs();
}

function showHUD(on) {
  $('hud').hidden = !on;
  const touch = on && (TB.Game.settings.touch === 'on' || (TB.Game.settings.touch === 'auto' && isTouch()));
  $('touch').hidden = !touch;
  document.body.classList.toggle('touch-ui', touch);
}

// ------------------------------------------------------------ messages
const toasts = [];
function toast(msg, type = 'info', dur = 4.2) {
  const now = performance.now();
  if (toasts.some(t => t.msg === msg && now - t.at < 2500)) return;
  const icon = { good: 'check', info: 'objective', warn: 'warning', danger: 'raider' }[type] || 'objective';
  const el = document.createElement('div');
  el.className = 'toast ' + type + ' ' + (type === 'danger' ? 'sk-toast_danger' : 'sk-toast');
  el.innerHTML = I(icon) + '<span>' + esc(msg) + '</span>';
  $('toasts').prepend(el);
  const t = { el, msg, at: now, life: dur };
  toasts.push(t);
  while (toasts.length > 4) { const o = toasts.shift(); o.el.remove(); }
}
let bannerT = 0;
function banner(title, sub = '', icon = '') {
  const b = $('banner');
  b.className = 'sk-banner' + (icon === 'danger' || icon === 'raider' ? ' danger' : '');
  b.innerHTML = (icon && icon !== 'danger' ? I(icon) : '') + `<h2>${esc(title)}</h2>` + (sub ? `<p>${esc(sub)}</p>` : '');
  b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  bannerT = 3.2;
}

// floating text in the 3D world
const floats = [];
function floatText(x, y, z, text, color = '#fff') {
  const el = document.createElement('div'); el.className = 'float'; el.textContent = text; el.style.color = color;
  $('floaters').appendChild(el); floats.push({ el, x, y, z, t: 0, life: 1.4 });
  if (floats.length > 30) { const f = floats.shift(); f.el.remove(); }
}
function floatGive(x, y, z, give) {
  const parts = Object.entries(give || {}).filter(([, v]) => v > 0);
  if (!parts.length) return;
  const el = document.createElement('div'); el.className = 'float'; el.style.color = '#fff';
  el.innerHTML = parts.map(([k, v]) => `+${v}${I(k)}`).join(' ');
  $('floaters').appendChild(el); floats.push({ el, x, y, z, t: 0, life: 1.6 });
}

// ------------------------------------------------------------ frame update
const hpPool = [], mkPool = [];
function update(dt) {
  const G = TB.G; if (!G) return;
  // toasts & banner
  for (let i = toasts.length - 1; i >= 0; i--) { const t = toasts[i]; t.life -= dt; if (t.life < 0.35 && !t.el.classList.contains('out')) t.el.classList.add('out'); if (t.life <= 0) { t.el.remove(); toasts.splice(i, 1); } }
  if (bannerT > 0) { bannerT -= dt; if (bannerT < 0.6) $('banner').classList.add('out'); if (bannerT <= 0) $('banner').hidden = true; }
  // floaters
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt;
    if (f.t >= f.life) { f.el.remove(); floats.splice(i, 1); continue; }
    const p = TB.Gfx.project(f.x, f.y, f.z);
    f.el.style.left = p.x + 'px'; f.el.style.top = (p.y - f.t * 34) + 'px'; f.el.style.opacity = Math.min(1, (f.life - f.t) * 2.5);
  }
  hpBars(); markers();
  textT -= dt; if (textT <= 0) { textT = 0.12; texts(); }
  mmT -= dt; if (mmT <= 0) { mmT = 0.1; minimap(); }
  if (panelName && (panelT -= dt) <= 0) { panelT = 1; if (panelName === 'town') renderPanel(); }
}

function texts() {
  const G = TB.G, E = TB.Town.econ, P = TB.Boat.P;
  const top = $('topbar');
  for (const k of TOP) {
    const el = top.querySelector(`[data-res="${k}"]`), v = G.stock[k], r = E.rates[k] || 0;
    el.querySelector('b').textContent = fmt(v);
    const s = el.querySelector('small');
    s.textContent = Math.abs(r) >= 0.05 ? (r > 0 ? '+' : '') + r.toFixed(r % 1 && Math.abs(r) < 10 ? 1 : 0) + '/day' : '';
    s.classList.toggle('neg', r < 0);
    el.classList.toggle('full', k !== 'coins' && v >= TB.Town.cap(k) - 0.5);
    el.classList.toggle('empty', (k === 'food' || k === 'water') && v < 1);
  }
  const pop = top.querySelector('[data-res="pop"]');
  pop.querySelector('b').textContent = G.pop + '/' + E.beds;
  pop.querySelector('small').textContent = E.idle ? E.idle + ' idle' : 'all working';
  pop.querySelector('small').classList.toggle('neg', G.pop > E.beds);
  const pw = top.querySelector('[data-res="power"]');
  pw.querySelector('b').textContent = E.power + '/' + E.use;
  pw.querySelector('small').textContent = E.use > E.power ? 'shortage' : 'ok';
  pw.querySelector('small').classList.toggle('neg', E.use > E.power);
  const md = top.querySelector('[data-res="mood"]');
  md.querySelector('b').textContent = E.attract + '%';
  md.querySelector('small').textContent = E.attract >= 80 ? 'thriving' : E.attract >= 60 ? 'welcoming' : E.attract >= 40 ? 'getting by' : 'unhappy';
  md.querySelector('small').classList.toggle('neg', E.attract < 40);
  // clock
  const night = G.dayT > 0.76 && G.dayT < 0.97;
  const hours = (6 + G.dayT * 24) % 24, hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60 / 10) * 10;
  $('dayNum').textContent = 'Day ' + G.day;
  $('dayTime').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + (G.mode === 'endless' ? ' · Endless' : '');
  const di = document.querySelector('#clock .day-ico'); const want = night ? 'night' : 'day';
  if (di.dataset.ico !== want) { di.dataset.ico = want; const tmp = document.createElement('div'); tmp.innerHTML = I(want); di.innerHTML = tmp.firstChild.innerHTML; }
  // boat
  if (P) {
    const V = TB.Boat.V;
    $('hullBar').style.width = clamp(P.hp / V('hull') * 100, 0, 100) + '%';
    $('fuelBar').style.width = clamp(P.fuel / V('tank') * 100, 0, 100) + '%';
    const ct = $('cargoTxt'); ct.textContent = P.load + '/' + V('cargo'); ct.classList.toggle('full', P.load >= V('cargo'));
    $('seatTxt').textContent = P.passengers + '/' + V('seats');
    $('harpTxt').textContent = P.harpoons + '/' + V('harpoon');
    $('dockChip').hidden = !P.docked;
    $('zoneName').textContent = TB.World.zone(P.x, P.z);
    document.body.classList.toggle('hurt', P.hurtT > 0);
  }
  // raid timer
  const R = G.raid, rt = $('raidTimer');
  if (R.state === 'warning') { rt.hidden = false; rt.innerHTML = `${I('raider')}<span>Raid from the ${TB.Actors.dirName(R.dir)} in</span><b>${Math.max(0, Math.ceil(R.next - G.t))}s</b>`; }
  else if (R.state === 'active') { const n = TB.Actors.aliveCount(e => e.raid); rt.hidden = false; rt.innerHTML = `${I('raider')}<span>Raiders left</span><b>${n}</b>`; }
  else rt.hidden = true;
  // trade button
  const m = TB.Actors.merchant();
  $('tradeBtn').hidden = !m; $('tradeBtn').classList.toggle('glow', !!m && !G.stats.trades);
  // context hint + touch action button
  hint();
  renderObjective();
}

function hint() {
  const P = TB.Boat.P, h = $('actionHint');
  let txt = '';
  const touch = !$('touch').hidden;
  let act = P && P.net ? 'NET ON' : 'NET', ico = 'net';
  if (P && P.alive && !build.on) {
    const site = TB.Boat.nearDive(P);
    if (P.dive) { txt = `<kbd>E</kbd>Call the diver back`; act = 'STOP'; ico = 'dive'; }
    else if (site) { txt = P.spd > 3 ? 'Slow down to dive this wreck' : `<kbd>E</kbd>Send the diver down`; act = 'DIVE'; ico = 'dive'; }
    else if (P.load >= TB.Boat.V('cargo') && !P.docked) txt = 'Hold full — sail into the dock to unload';
  }
  h.hidden = !txt || build.on;
  if (txt) h.innerHTML = touch ? txt.replace(/<kbd>E<\/kbd>/, '') : txt;
  const ab = $('actBtn');
  if (ab.dataset.mode !== act) { ab.dataset.mode = act; ab.innerHTML = I(ico) + `<em>${act}</em>`; }
  ab.classList.toggle('on', !!(P && P.net));
  const dv = $('diveBar');
  dv.hidden = !(P && P.dive);
  if (P && P.dive) $('diveFill').style.width = clamp(P.dive.t / P.dive.dur * 100, 0, 100) + '%';
}

function renderObjective() {
  const box = $('objective'), q = TB.Game.quest();
  if (!q) { box.hidden = true; return; }
  box.hidden = false;
  const html = `<div class="ch">${esc(q.label)}</div><h3>${esc(q.title)}</h3><ul>` +
    q.goals.map(g => `<li class="${g.done ? 'done' : ''}">${I(g.done ? 'check' : 'objective')}<span>${esc(g.t)}</span>${g.n > 1 ? `<span class="n">${Math.min(g.cur, g.n)}/${g.n}</span>` : ''}</li>`).join('') + '</ul>';
  if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
}

// health bars over damaged enemies and buildings
function hpBars() {
  const G = TB.G; let n = 0;
  const put = (x, y, z, f, town) => {
    const p = TB.Gfx.project(x, y, z); if (!p.on) return;
    let el = hpPool[n]; if (!el) { el = document.createElement('div'); el.className = 'hpbar'; el.innerHTML = '<i></i>'; $('floaters').appendChild(el); hpPool[n] = el; }
    el.style.display = ''; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.classList.toggle('town', !!town);
    el.firstChild.style.width = clamp(f * 100, 0, 100) + '%';
    n++;
  };
  for (const e of TB.Actors.list) if (e.alive && !e.hidden && (e.hp < e.max || e.d.boss) && n < 40) put(e.x, (e.y || 0) + 2.4 + e.d.r * 0.4, e.z, e.hp / e.max);
  for (const c of TB.Town.cells.values()) if (c.b && !c.ruined && c.hp < c.max && n < 60) { const p = TB.Town.world(c.i, c.j); put(p.x, D.DECK + 5, p.z, c.hp / c.max, true); }
  for (let i = n; i < hpPool.length; i++) hpPool[i].style.display = 'none';
  void G;
}

// edge-of-screen arrows for things off camera
function markers() {
  const G = TB.G, P = TB.Boat.P, W = TB.World;
  const list = [];
  if (P && !build.on) {
    list.push({ x: D.DOCK.x, z: D.DOCK.z, ico: 'home', label: 'Home', always: false, col: '#79dfc1' });
    for (const e of TB.Actors.list) if (e.alive && !e.hidden && (e.raid || e.d.boss) && e.type !== 'boarder') list.push({ x: e.x, z: e.z, ico: 'raider', col: '#ff6a5a' });
    const m = TB.Actors.merchant(); if (m) list.push({ x: m.x, z: m.z, ico: 'trader', col: '#f8c55b' });
    const near = (arr, n) => arr.slice().sort((a, b) => dist2(a.x, a.z, P.x, P.z) - dist2(b.x, b.z, P.x, P.z)).slice(0, n);
    if (P.passengers < TB.Boat.V('seats')) for (const c of near(W.castaways, 2)) list.push({ x: c.x, z: c.z, ico: 'castaway', col: '#79dfc1' });
    for (const d of near(W.dives, P.sonarT > 0 ? 5 : 1)) list.push({ x: d.x, z: d.z, ico: 'dive', col: '#3aa8f0' });
    if (G.mode === 'campaign' && G.chapter === 6) for (const op of W.outposts) if (!op.cleared) { list.push({ x: op.x, z: op.z, ico: 'objective', col: '#ff6a5a', label: 'Outpost' }); break; }
  }
  // keep arrows inside a frame that clears the HUD panels
  const vw = TB.Gfx.view.w, vh = TB.Gfx.view.h;
  const touch = document.body.classList.contains('touch-ui');
  const portrait = touch && vh > vw;
  const L = touch ? 70 : 96, R = vw - (touch ? (portrait ? 110 : 140) : 70), T = portrait ? 200 : touch ? 110 : 92, B = vh - (portrait ? 230 : touch ? 70 : 64);
  const cx = (L + R) / 2, cy = (T + B) / 2;
  let n = 0;
  for (const it of list) {
    const p = TB.Gfx.project(it.x, 1, it.z);
    if (p.x > 30 && p.x < vw - 30 && p.y > 60 && p.y < vh - 30) continue;
    const dx = p.x - cx, dy = p.y - cy;
    const k = Math.min((R - cx) / Math.max(1, Math.abs(dx)), (B - cy) / Math.max(1, Math.abs(dy)));
    const x = cx + dx * k, y = cy + dy * k;
    let el = mkPool[n];
    if (!el) { el = document.createElement('div'); el.className = 'marker sk-marker'; $('markers').appendChild(el); mkPool[n] = el; }
    if (el.dataset.ico !== it.ico) { el.dataset.ico = it.ico; el.innerHTML = `<span class="arrow">${I('arrow')}</span>${I(it.ico)}<small></small>`; }
    el.style.display = ''; el.style.left = x + 'px'; el.style.top = y + 'px';
    el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    const dist = P ? Math.round(Math.sqrt(dist2(it.x, it.z, P.x, P.z))) : 0;
    el.lastChild.textContent = (it.label ? it.label + ' ' : '') + dist + 'm';
    n++;
    if (n >= 12) break;
  }
  for (let i = n; i < mkPool.length; i++) mkPool[i].style.display = 'none';
}

// ------------------------------------------------------------ minimap
// Centred on the player's boat and turned with the camera ("up" on the map is "up" on screen).
// Tap it to switch between the close view and the whole sea.
const MM_RANGES = [110, 310];
let mmZoom = 0;
try { mmZoom = +localStorage.getItem('tb.mmZoom') || 0; } catch (e) { /* storage blocked */ }
function toggleMinimap() {
  mmZoom = (mmZoom + 1) % MM_RANGES.length;
  try { localStorage.setItem('tb.mmZoom', mmZoom); } catch (e) { /* storage blocked */ }
  TB.Snd.play('click'); mmT = 0;
}
function minimap() {
  const cv = $('mmCanvas'), c = cv.getContext('2d'), S = cv.width, P = TB.Boat.P;
  const range = MM_RANGES[mmZoom], R = S / 2 - 4, k = R / range;
  const yaw = TB.Gfx.cam.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const cx = P ? P.x : 0, cz = P ? P.z : 0;
  // world point → canvas point (same rotation the canvas transform applies)
  const toMap = (x, z) => { const dx = (x - cx) * k, dz = (z - cz) * k; return { x: S / 2 + dx * cs - dz * sn, y: S / 2 + dx * sn + dz * cs, d: Math.hypot(dx, dz) }; };
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, S, S);
  c.save();
  c.beginPath(); c.arc(S / 2, S / 2, R, 0, Math.PI * 2); c.clip();
  const g = c.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, R);
  g.addColorStop(0, '#1a8fb0'); g.addColorStop(1, '#0b4a66');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  c.translate(S / 2, S / 2); c.rotate(yaw); c.scale(k, k); c.translate(-cx, -cz);
  const dot = (x, z, r, col, ring) => {
    if (Math.abs(x - cx) > range + 10 || Math.abs(z - cz) > range + 10) return;
    c.fillStyle = col; c.beginPath(); c.arc(x, z, r / k, 0, Math.PI * 2); c.fill();
    if (ring) { c.lineWidth = 2.5 / k; c.strokeStyle = '#0b1820'; c.stroke(); }
  };
  // edge of the sailable sea
  c.beginPath(); c.arc(0, 0, D.WORLD_R, 0, Math.PI * 2); c.lineWidth = 3 / k; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([10 / k, 8 / k]); c.stroke(); c.setLineDash([]);
  for (const r of TB.World.ruins) {
    if (Math.abs(r.x - cx) > range + 20 || Math.abs(r.z - cz) > range + 20) continue;
    c.save(); c.translate(r.x, r.z); c.rotate(-r.rot);
    c.fillStyle = r.outpost ? '#d4485a' : r.top > 0 ? 'rgba(232,226,208,0.9)' : 'rgba(150,210,220,0.28)';
    c.fillRect(-r.w / 2, -r.d / 2, r.w, r.d); c.restore();
  }
  for (const cell of TB.Town.cells.values()) {
    const p = TB.Town.world(cell.i, cell.j);
    c.fillStyle = cell.kind === 'pier' ? '#9a6b43' : cell.b ? '#f8c55b' : '#d9a46a';
    c.fillRect(p.x - D.TILE / 2, p.z - D.TILE / 2, D.TILE, D.TILE);
  }
  for (const it of TB.World.items) dot(it.x, it.z, it.life ? 4 : 3, it.life ? '#ffd24a' : 'rgba(255,236,200,0.8)');
  for (const d of TB.World.dives) dot(d.x, d.z, 7, '#ff9a3a', true);
  for (const ca of TB.World.castaways) dot(ca.x, ca.z, 7, '#79ffc8', true);
  for (const n of TB.Actors.npcs) dot(n.x, n.z, 8, n.kind === 'merchant' ? '#ffd24a' : '#ffffff', true);
  for (const e of TB.Actors.list) if (e.alive && !e.hidden) dot(e.x, e.z, e.d.boss ? 12 : e.type === 'boarder' ? 4 : 7, e.type === 'shark' ? '#c4d4dc' : '#ff4a4a', true);
  c.restore();
  // things beyond the map edge: home, raiders, the merchant
  c.setTransform(1, 0, 0, 1, 0, 0);
  const edge = (x, z, col, label) => {
    const p = toMap(x, z); if (p.d <= R - 8) return;
    const a = Math.atan2(p.y - S / 2, p.x - S / 2), ex = S / 2 + Math.cos(a) * (R - 12), ey = S / 2 + Math.sin(a) * (R - 12);
    c.fillStyle = col; c.strokeStyle = '#0b1820'; c.lineWidth = 3;
    c.beginPath(); c.arc(ex, ey, 10, 0, Math.PI * 2); c.fill(); c.stroke();
    if (label) { c.fillStyle = '#0b1820'; c.font = 'bold 14px Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, ex, ey + 1); }
  };
  edge(D.DOCK.x, D.DOCK.z, '#79dfc1', 'H');
  const m = TB.Actors.merchant(); if (m) edge(m.x, m.z, '#ffd24a', '$');
  for (const e of TB.Actors.list) if (e.alive && !e.hidden && (e.raid || e.d.boss) && e.type !== 'boarder') edge(e.x, e.z, '#ff4a4a', '!');
  // the player's boat: a big arrow in the middle
  if (P) {
    c.save(); c.translate(S / 2, S / 2); c.rotate(yaw - P.h);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.strokeStyle = '#0b1820'; c.lineWidth = 4; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, 22); c.lineTo(15, -14); c.lineTo(0, -6); c.lineTo(-15, -14); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  // compass letters
  c.font = 'bold 22px Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const rr = R - 14;
  for (const [l, wx, wz] of [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]]) {
    const px = S / 2 + (wx * cs - wz * sn) * rr, py = S / 2 + (wx * sn + wz * cs) * rr;
    c.fillStyle = l === 'N' ? '#ff8a7a' : '#f4f1ea'; c.strokeStyle = '#0b1820'; c.lineWidth = 4;
    c.strokeText(l, px, py); c.fillText(l, px, py);
  }
  $('mmLabel').textContent = (mmZoom ? 'Whole sea' : range + ' m') + ' · tap';
}

// ------------------------------------------------------------ build mode
function toggleBuild() { if (build.on) exitBuild(); else enterBuild(); }
function enterBuild(tab) {
  if (!TB.G || TB.Game.state !== 'play') return;
  if (panelName) closePanel();
  build.on = true; build.sel = null; build.inspect = null;
  if (tab) build.tab = tab;
  document.body.classList.add('build-mode');
  $('buildbar').hidden = false;
  TB.Game.focusTown();
  renderBuild();
}
function exitBuild() {
  if (!build.on) return;
  build.on = false; build.sel = null; build.inspect = null;
  document.body.classList.remove('build-mode');
  $('buildbar').hidden = true; $('buildHint').hidden = true;
  TB.Town.clearPreview(); TB.Town.overlay(null);
  TB.Game.focusBoat();
}
function costHTML(cost, mult = 1) {
  const s = TB.G.stock;
  return Object.entries(cost).map(([k, v]) => { const n = Math.ceil(v * mult); return `<span class="${(s[k] || 0) < n ? 'short' : ''}">${I(k)}${n}</span>`; }).join('');
}
function renderBuild() {
  const G = TB.G;
  $('buildTabs').querySelectorAll('button').forEach(b => { const on = b.dataset.tab === build.tab; b.className = on ? 'sk-tab_active' : 'sk-tab'; b.setAttribute('aria-selected', on); });
  const cards = $('buildCards');
  if (build.tab === 'boats') {
    const ws = TB.Town.count('workshop') > 0, P = TB.Boat.P;
    cards.innerHTML = Object.entries(D.UPG).map(([k, u]) => {
      const lv = G.upg[k], max = lv >= u.vals.length - 1;
      return `<button type="button" class="card ${max ? 'sk-slot_selected' : 'sk-slot'}" data-upg="${k}" title="${esc(u.desc)}">
        <div class="thumb">${I('upg_' + k)}</div><div class="nm">${esc(u.name)}</div>
        <div class="lvl">${u.fmt(u.vals[lv])}${max ? ' · MAX' : ' → ' + u.fmt(u.vals[lv + 1])}</div>
        <div class="cost">${max ? '' : costHTML(u.cost[lv])}</div></button>`;
    }).join('');
    cards.querySelectorAll('[data-upg]').forEach(b => b.addEventListener('click', () => buyUpgrade(b.dataset.upg)));
    $('buildInfo').innerHTML = !ws ? `${I('lock')} <b>Build a Workshop</b> (Production tab) to upgrade your boat.` : !(P && P.docked) ? `${I('dock')} Dock your boat at the pier to install upgrades.` : `${I('upgrade')} Boat docked at the Workshop — pick an upgrade.`;
    return;
  }
  const keys = D.BUILD_ORDER.filter(k => D.B[k].cat === build.tab);
  cards.innerHTML = keys.map(k => {
    const d = D.B[k], locked = d.bp && !G.unlocked.includes(k), sel = build.sel === k;
    return `<button type="button" class="card ${sel ? 'sk-slot_selected' : 'sk-slot'} ${locked ? 'locked' : ''}" data-b="${k}" title="${esc(d.desc)}">
      ${locked ? `<span class="lock">${I('lock')}</span>` : ''}
      <div class="thumb">${I('bld_' + k)}</div><div class="nm">${esc(d.name)}</div><div class="cost">${costHTML(d.cost)}</div></button>`;
  }).join('');
  cards.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => selectBuild(b.dataset.b)));
  buildInfo();
}
function selectBuild(k) {
  TB.Snd.play('click');
  build.inspect = null;
  build.sel = build.sel === k ? null : k;
  const d = D.B[k];
  if (build.sel && d.bp && !TB.G.unlocked.includes(k)) { toast(d.name + ' needs a blueprint. Dive wrecks or buy one from a merchant.', 'warn'); build.sel = null; }
  TB.Town.overlay(build.sel); TB.Town.clearPreview();
  renderBuild();
}
function buildInfo() {
  const el = $('buildInfo');
  if (build.inspect) {
    const c = build.inspect, d = c.b ? D.B[c.b] : null;
    if (!c.b) { el.innerHTML = `<b>Empty raft platform</b><span>Pick a building above, or</span><button type="button" class="sk-button" data-act="demolish">${I('demolish')} Remove (refund half)</button>`; }
    else if (c.ruined) el.innerHTML = `<b>${esc(d.name)} — destroyed</b><span>Rebuild for half price:</span><span class="cost">${costHTML(d.cost, 0.5)}</span><button type="button" class="sk-button_primary" data-act="rebuild">${I('repair')} Rebuild</button>${c.b !== 'hall' ? `<button type="button" class="sk-button" data-act="demolish">${I('demolish')} Clear</button>` : ''}`;
    else {
      const staffed = d.workers ? (c.staffed >= 1 ? 'staffed' : c.staffed > 0 ? 'short of workers' : 'no workers') : '';
      el.innerHTML = `<b>${esc(d.name)}</b><span>${Math.ceil(c.hp)}/${c.max} hp</span>${staffed ? `<span>${staffed}</span>` : ''}${d.prod ? `<span>output ${Math.round(c.eff * 100)}%</span>` : ''}<span>${esc(d.desc)}</span>` +
        (c.b !== 'hall' ? `<button type="button" class="sk-button_danger" data-act="demolish">${I('demolish')} Demolish (refund half)</button>` : '');
    }
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.act === 'demolish') { if (!TB.Town.demolish(c)) toast('That would cut part of the town off', 'warn'); }
      else { const r = TB.Town.rebuild(c); if (!r.ok) toast(r.reason || 'Cannot rebuild', 'warn'); }
      build.inspect = null; renderBuild();
    }));
    return;
  }
  if (build.sel) { const d = D.B[build.sel]; el.innerHTML = `<b>${esc(d.name)}</b><span>${esc(d.desc)}</span><span>${isTouch() ? 'Tap a highlighted tile, tap again to build.' : 'Click a highlighted tile. Right-click to cancel.'}</span>`; }
  else el.innerHTML = `<span>${I('build')} Pick something to build, or ${isTouch() ? 'tap' : 'click'} a building to inspect it. Building pauses the action.</span>`;
}
function cellFromScreen(x, y) {
  const p = TB.Gfx.screenToSea(x, y, D.DECK);
  return p ? TB.Town.ij(p.x, p.z) : null;
}
function buildHover(x, y) {
  if (!build.on || !build.sel) { $('buildHint').hidden = true; return; }
  const c = cellFromScreen(x, y); if (!c) return;
  build.hover = c;
  const chk = TB.Town.preview(build.sel, c.i, c.j);
  const h = $('buildHint'); h.hidden = false; h.style.left = x + 'px'; h.style.top = y + 'px';
  h.textContent = chk.ok ? (isTouch() ? 'Tap again to build ' : 'Build ') + D.B[build.sel].name : chk.reason;
  h.classList.toggle('bad', !chk.ok);
}
function buildTap(x, y, touch) {
  if (!build.on) return;
  const c = cellFromScreen(x, y); if (!c) return;
  if (build.sel) {
    if (touch && (!build.touchArm || build.touchArm.i !== c.i || build.touchArm.j !== c.j)) { build.touchArm = c; buildHover(x, y); return; }
    build.touchArm = null;
    const r = TB.Town.place(build.sel, c.i, c.j);
    if (!r.ok) { TB.Snd.play('deny'); toast(r.reason, 'warn', 2.5); }
    TB.Town.overlay(build.sel);
    renderBuild(); buildHover(x, y);
    return;
  }
  const cell = TB.Town.get(c.i, c.j);
  build.inspect = cell && cell.kind === 'platform' ? cell : null;
  if (cell) TB.Snd.play('click');
  buildInfo();
}
function buildCancel() { if (build.sel) { build.sel = null; TB.Town.overlay(null); TB.Town.clearPreview(); $('buildHint').hidden = true; renderBuild(); return true; } return false; }

function buyUpgrade(k) {
  const G = TB.G, u = D.UPG[k], lv = G.upg[k];
  if (lv >= u.vals.length - 1) return;
  if (!TB.Town.count('workshop')) { toast('Build a Workshop first', 'warn'); TB.Snd.play('deny'); return; }
  if (!TB.Boat.P.docked) { toast('Dock your boat at the pier to install upgrades', 'warn'); TB.Snd.play('deny'); return; }
  if (!TB.Town.canAfford(u.cost[lv])) { toast('Need ' + TB.Town.missing(u.cost[lv]).join(', '), 'warn'); TB.Snd.play('deny'); return; }
  for (const [r, v] of Object.entries(u.cost[lv])) G.stock[r] -= v;
  G.upg[k]++;
  const P = TB.Boat.P;
  if (k === 'hull') P.hp = TB.Boat.V('hull');
  if (k === 'harpoon') P.harpoons = TB.Boat.V('harpoon');
  G.stats.upgrades = (G.stats.upgrades || 0) + 1;
  TB.Snd.play('levelUp');
  toast(`${u.name} upgraded: ${u.fmt(u.vals[G.upg[k]])}`, 'good');
  TB.emit('upgrade', k);
  renderBuild();
}

// ------------------------------------------------------------ panels
function openPanel(name) {
  if (!TB.G) return;
  if (build.on) exitBuild();
  if (name === 'trade' && !TB.Actors.merchant()) { toast('No merchant in port. Build a Trader Pier and wait for a ship.', 'info'); return; }
  panelName = name; panelT = 1;
  $('panel').classList.add('show');
  renderPanel();
}
function closePanel() { panelName = null; $('panel').classList.remove('show'); }
function tradeOpen() { return panelName === 'trade'; }
function isOpen() { return !!panelName; }
const PANEL_META = { town: ['Town', 'town'], trade: ['Trade', 'trader'], quests: ['Quests', 'quests'], settings: ['Settings', 'settings'] };
function renderPanel() {
  const name = panelName; if (!name) return;
  const [title, ico] = PANEL_META[name];
  $('panelTitle').textContent = name === 'trade' && TB.Actors.merchant() ? TB.Actors.merchant().name : title;
  $('panelIco').innerHTML = I(ico);
  const body = $('panelBody');
  const scroll = body.scrollTop;
  body.innerHTML = ({ town: townHTML, trade: tradeHTML, quests: questsHTML, settings: settingsHTML })[name]();
  body.scrollTop = scroll;
  if (name === 'trade') body.querySelectorAll('[data-offer]').forEach(b => b.addEventListener('click', () => doTrade(+b.dataset.offer)));
  if (name === 'settings') wireSettings(body);
}
function townHTML() {
  const G = TB.G, E = TB.Town.econ;
  const P = E.parts;
  const tips = {
    housing: G.pop >= E.beds ? 'Build Scrap Shacks — settlers need free beds to move in.' : '',
    essentials: (E.rates.food < 0 || E.rates.water < 0) ? 'Food or water is running down. Build Fishing Nets, Rain Catchers or a Desalinator.' : '',
    safety: P.safety < 50 ? 'Watchtowers, harpoon turrets and lanterns make settlers feel safe.' : '',
    jobs: P.jobs < 60 ? 'Production buildings give settlers something to do.' : '',
    amenities: P.amenities < 50 ? 'Lantern posts, a Market Stall or a Clinic brighten the town.' : '',
    reputation: P.reputation < 60 ? 'Rescue castaways, trade with merchants and repel raids.' : '',
  };
  const meter = (k, label) => `<div class="meter"><span>${label}</span><div class="bar sk-bar_track"><i class="sk-bar_progress" style="width:${Math.round(P[k])}%"></i></div><b>${Math.round(P[k])}</b></div>${tips[k] ? `<div class="tip-line">${esc(tips[k])}</div>` : ''}`;
  const res = D.RES_KEYS.map(k => { const r = E.rates[k] || 0; return `<div class="kv sk-slot">${I(k)}<span>${D.RES[k].name}<br><small>${r ? (r > 0 ? '+' : '') + r.toFixed(1) + ' a day' : 'no change'}</small></span><b>${fmt(G.stock[k])}${k !== 'coins' ? ' / ' + TB.Town.cap(k) : ''}</b></div>`; }).join('');
  const band = E.attract >= 80 ? 'Settlers flock here (and raiders notice).' : E.attract >= 60 ? 'Steady arrivals of new settlers.' : E.attract >= 40 ? 'A few settlers trickle in.' : 'Almost nobody wants to move here, and some may leave.';
  return `<h4>Attractiveness ${E.attract}%</h4><p style="margin:0 0 8px;color:var(--muted)">${band}</p>
    ${meter('housing', 'Housing')}${meter('essentials', 'Food & water')}${meter('safety', 'Safety')}${meter('jobs', 'Jobs')}${meter('amenities', 'Amenities')}${meter('reputation', 'Reputation')}
    <h4>People</h4><div class="grid2">
      <div class="kv sk-slot">${I('people')}<span>Settlers</span><b>${G.pop}</b></div>
      <div class="kv sk-slot">${I('beds')}<span>Beds</span><b>${E.beds}</b></div>
      <div class="kv sk-slot">${I('build')}<span>Workers / jobs</span><b>${E.workers} / ${E.jobs}</b></div>
      <div class="kv sk-slot">${I('power')}<span>Power made / used</span><b>${E.power} / ${E.use}</b></div>
    </div>
    <h4>Stores</h4><div class="grid2">${res}</div>`;
}
function tradeHTML() {
  const G = TB.G, m = TB.Actors.merchant(), offers = G.merchant.offers || [];
  if (!m) return '<p>No merchant in port.</p>';
  const row = (o, i) => {
    let what, price, can;
    if (o.kind === 'sell') { const [k, v] = Object.entries(o.give)[0]; what = `${I(k)}<span>Buy ${v} ${esc(D.RES[k].name.toLowerCase())}</span>`; price = `<span class="price">${I('coins')}${o.price}</span>`; can = G.stock.coins >= o.price && o.stock > 0; }
    else if (o.kind === 'buy') { const [k, v] = Object.entries(o.take)[0]; what = `${I(k)}<span>Sell ${v} ${esc(D.RES[k].name.toLowerCase())}</span>`; price = `<span class="price">+${I('coins')}${o.price}</span>`; can = G.stock[k] >= v && o.stock > 0; }
    else { what = `${I('blueprint')}<span>Blueprint: ${esc(D.B[o.b].name)}</span>`; price = `<span class="price">${I('coins')}${o.price}</span>`; can = G.stock.coins >= o.price && o.stock > 0 && !G.unlocked.includes(o.b); }
    return `<div class="offer sk-slot"><span class="what">${what}</span>${price}<span class="left">${o.stock} left</span><button type="button" class="sk-button_primary" data-offer="${i}" ${can ? '' : 'disabled'}>${o.kind === 'buy' ? 'Sell' : 'Buy'}</button></div>`;
  };
  return `<p style="margin:0 0 10px;color:var(--muted)">"Fine goods from the open sea!" You have ${I('coins')} <b style="color:var(--sun)">${fmt(G.stock.coins)}</b> trade tokens. The ship leaves soon after you close this window.</p>
    <div class="stack">${offers.map(row).join('')}</div>`;
}
function doTrade(i) {
  const G = TB.G, o = G.merchant.offers[i]; if (!o || o.stock <= 0) return;
  if (o.kind === 'sell') { if (G.stock.coins < o.price) return; G.stock.coins -= o.price; for (const [k, v] of Object.entries(o.give)) G.stock[k] = Math.min(TB.Town.cap(k), G.stock[k] + v); }
  else if (o.kind === 'buy') { for (const [k, v] of Object.entries(o.take)) { if (G.stock[k] < v) return; } for (const [k, v] of Object.entries(o.take)) G.stock[k] -= v; G.stock.coins += o.price; }
  else { if (G.stock.coins < o.price) return; G.stock.coins -= o.price; G.unlocked.push(o.b); banner('Blueprint bought', D.B[o.b].name + ' can now be built', 'blueprint'); }
  o.stock--;
  G.stats.trades = (G.stats.trades || 0) + 1; G.rep += 1;
  TB.Snd.play('coin');
  TB.emit('trade', o);
  renderPanel();
}
function questsHTML() {
  const G = TB.G;
  if (G.mode === 'endless') {
    return `<h4>Endless tides</h4><p style="margin:0 0 10px;color:var(--muted)">There is no end: keep building, scavenging and holding off raids that grow stronger every day. An Iron Fleet flagship comes every 10 days.</p>` +
      D.MILESTONES.map((m, i) => `<div class="chapter sk-slot ${G.milestones.includes(i) ? 'done' : ''}">${I(G.milestones.includes(i) ? 'check' : 'star')} <b>${esc(m.t)}</b></div>`).join('') + statsHTML();
  }
  return D.CHAPTERS.map((c, i) => {
    const done = i < G.chapter || G.campaignDone, cur = i === G.chapter && !G.campaignDone;
    const goals = cur ? TB.Game.quest().goals : c.goals.map(g => ({ t: g.t, done }));
    return `<div class="chapter sk-slot ${cur ? 'cur' : ''} ${done ? 'done' : ''}">${I(done ? 'check' : cur ? 'objective' : 'lock')} <b>Chapter ${i + 1}: ${esc(c.title)}</b>
      ${i <= G.chapter ? `<div style="color:var(--muted);font-size:13px;margin-top:2px">${esc(c.text)}</div><ul>${goals.map(g => `<li>${g.done ? '✓ ' : ''}${esc(g.t)}${g.n > 1 ? ` (${Math.min(g.cur, g.n)}/${g.n})` : ''}</li>`).join('')}</ul>` : ''}</div>`;
  }).join('') + (G.campaignDone ? '<p class="tip-line">Campaign complete! The town is yours to grow forever — raids keep coming.</p>' : '') + statsHTML();
}
function statsHTML() {
  const s = TB.G.stats;
  return `<h4>Log</h4><div class="grid2">
    <div class="kv sk-slot">${I('castaway')}<span>Castaways rescued</span><b>${s.rescued || 0}</b></div>
    <div class="kv sk-slot">${I('raider')}<span>Raiders sunk</span><b>${s.kills || 0}</b></div>
    <div class="kv sk-slot">${I('star')}<span>Raids repelled</span><b>${s.raids_repelled || 0}</b></div>
    <div class="kv sk-slot">${I('dive')}<span>Wrecks dived</span><b>${s.dives || 0}</b></div></div>`;
}
function settingsHTML() {
  const st = TB.Game.settings, q = TB.Gfx.quality;
  const opt = (name, val, cur, label) => `<button type="button" class="chip sk-chip ${cur === val ? 'sel' : ''}" data-set="${name}" data-val="${val}">${label}</button>`;
  return `<div class="setrow"><span>Graphics</span>${opt('quality', 'low', q, 'Low')}${opt('quality', 'medium', q, 'Medium')}${opt('quality', 'high', q, 'High')}</div>
    <div class="setrow"><span>Sound</span>${opt('sound', 'on', TB.Snd.enabled ? 'on' : 'off', 'On')}${opt('sound', 'off', TB.Snd.enabled ? 'on' : 'off', 'Off')}</div>
    <div class="setrow"><span>Touch controls</span>${opt('touch', 'auto', st.touch, 'Auto')}${opt('touch', 'on', st.touch, 'Always')}${opt('touch', 'off', st.touch, 'Never')}</div>
    <div class="setrow"><span>Camera</span>${opt('cam', 'rotate', '', 'Rotate 90°')}${opt('cam', 'reset', '', 'Reset view')}</div>
    <p style="color:var(--muted);font-size:12.5px;line-height:1.5">Low graphics turns off outlines and shadows for older phones. Swap any model with a .glb file (docs/GLB-MODELS.md) and any icon or frame with a sprite (docs/UI-SPRITES.md).</p>
    ${TB.Game.hasSave() ? `<div class="setrow"><span>Saved game</span><button type="button" class="sk-button_danger ghost" data-set="wipe" data-val="1">Delete save</button></div>` : ''}`;
}
function wireSettings(body) {
  body.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.set, v = b.dataset.val, st = TB.Game.settings;
    TB.Snd.play('click');
    if (k === 'quality') TB.Gfx.setQuality(v);
    else if (k === 'sound') TB.Snd.setEnabled(v === 'on');
    else if (k === 'touch') { st.touch = v; TB.Game.saveSettings(); if (TB.Game.state === 'play') showHUD(true); }
    else if (k === 'cam') { if (v === 'rotate') TB.Gfx.cam.yawT += Math.PI / 2; else { TB.Gfx.cam.yawT = Math.PI / 4; TB.Gfx.cam.zoomT = 48; } }
    else if (k === 'wipe') {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; return; }
      TB.Game.wipeSave(); toast('Save deleted', 'info');
    }
    renderPanel();
  }));
}

// ------------------------------------------------------------ joystick / touch
function setJoy(active, bx, by, dx, dy) {
  const j = $('joy'), k = $('joyKnob');
  if (active) { j.style.left = (bx - 65) + 'px'; j.style.top = (by - 65) + 'px'; j.style.bottom = 'auto'; }
  else { j.style.left = ''; j.style.top = ''; j.style.bottom = ''; }
  k.style.transform = `translate(${dx * 42}px, ${dy * 42}px)`;
  j.style.opacity = active ? 1 : 0.6;
}
function loading(p, text) { $('loadFill').style.width = Math.round(p * 100) + '%'; if (text) $('loadText').textContent = text; }

TB.U.extend(UI, { init, renderThumbs, showHUD, toast, banner, floatText, floatGive, update, enterBuild, exitBuild, toggleBuild, buildHover, buildTap, buildCancel,
  openPanel, closePanel, tradeOpen, isOpen, renderPanel, setJoy, loading, renderBuild,
  get building() { return build.on; }, get panel() { return panelName; } });
})();
