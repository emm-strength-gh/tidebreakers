'use strict';
/* =====================================================================
   TIDEBREAKERS — the floating town
   Square grid of 4 m raft tiles. Buildings sit one per tile.
   Economy runs continuously: per-day rates are applied every frame.
   ===================================================================== */
(() => {
const D = TB.D, U = TB.U;
const { clamp, rand, dist2, wave } = U;
let THREE, root, overlayMesh, ghostObj = null, ghostKey = '';
const cells = new Map();
const key = (i, j) => i + ',' + j;
const T = TB.Town = {
  cells,
  econ: { beds: 0, power: 0, use: 0, store: D.STORE_BASE, rates: {}, jobs: 0, workers: 0, idle: 0, amen: 0, safety: 0, attract: 50, parts: {}, pr: 1, eat: 0 },
  walkers: [],
  alarm: false,
};

function init() {
  THREE = window.THREE;
  if (root) root.removeFromParent();
  root = new THREE.Group(); root.name = 'town';
  TB.Gfx.scene.add(root);
  cells.clear();
  for (const w of T.walkers) TB.Models.release(w.obj);
  T.walkers.length = 0;
  ghostObj = null; ghostKey = '';
  const og = new THREE.PlaneGeometry(D.TILE * 0.92, D.TILE * 0.92); og.rotateX(-Math.PI / 2);
  overlayMesh = new THREE.InstancedMesh(og, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, depthWrite: false }), 400);
  overlayMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);
  overlayMesh.layers.set(1); overlayMesh.count = 0; overlayMesh.renderOrder = 4; overlayMesh.frustumCulled = false;
  root.add(overlayMesh);
}
function world(i, j) { return { x: i * D.TILE, z: j * D.TILE }; }
function ij(x, z) { return { i: Math.round(x / D.TILE), j: Math.round(z / D.TILE) }; }
function cellAt(x, z) { const p = ij(x, z); return cells.get(key(p.i, p.j)) || null; }
function get(i, j) { return cells.get(key(i, j)) || null; }

// ------------------------------------------------------------ layout
function newTown() {
  init();
  addCell(0, 0, 'platform'); setBuilding(get(0, 0), 'hall');
  addCell(-1, 0, 'platform'); addCell(1, 0, 'platform'); addCell(0, 1, 'platform');
  addCell(0, 2, 'pier');
  changed();
}
function addCell(i, j, kind) {
  const c = { i, j, kind, b: null, hp: 0, max: 0, ruined: false, obj: null, bobj: null, staffed: 1, eff: 1, cd: 0, smokeT: 0, rot: 0, ph: rand(0, 6) };
  const p = world(i, j);
  c.obj = TB.Models.make(kind === 'pier' ? 'pier' : 'platform');
  c.obj.position.set(p.x, D.DECK, p.z);
  if (kind === 'platform') c.obj.rotation.y = U.randi(0, 3) * Math.PI / 2;
  root.add(c.obj);
  cells.set(key(i, j), c);
  return c;
}
function setBuilding(c, b, hp) {
  if (c.bobj) { TB.Models.release(c.bobj); c.bobj.removeFromParent(); }
  c.b = b; c.ruined = false;
  const d = D.B[b];
  c.max = Math.round(d.hp * (b === 'hall' ? 1 : 1)); c.hp = hp != null ? hp : c.max;
  c.bobj = TB.Models.make('bld_' + b);
  const p = world(c.i, c.j);
  c.bobj.position.set(p.x, D.DECK, p.z);
  c.bobj.rotation.y = c.rot;
  root.add(c.bobj);
}
function setRuin(c) {
  if (c.bobj) { TB.Models.release(c.bobj); c.bobj.removeFromParent(); }
  c.ruined = true; c.hp = 0;
  c.bobj = TB.Models.make('rubble');
  const p = world(c.i, c.j); c.bobj.position.set(p.x, D.DECK, p.z);
  root.add(c.bobj);
}

function inChannel(i, j) { const ch = D.CHANNEL; return i >= ch.i0 && i <= ch.i1 && j >= ch.j0 && j <= ch.j1; }
function hasNeighbour(i, j) { return !!(get(i + 1, j) || get(i - 1, j) || get(i, j + 1) || get(i, j - 1)); }
function canAfford(cost, mult = 1) { const s = TB.G.stock; for (const [k, v] of Object.entries(cost)) if ((s[k] || 0) < Math.ceil(v * mult)) return false; return true; }
function pay(cost, mult = 1) { const s = TB.G.stock; for (const [k, v] of Object.entries(cost)) s[k] -= Math.ceil(v * mult); }
function missing(cost, mult = 1) { const s = TB.G.stock, out = []; for (const [k, v] of Object.entries(cost)) { const n = Math.ceil(v * mult) - Math.floor(s[k] || 0); if (n > 0) out.push(n + ' ' + D.RES[k].name.toLowerCase()); } return out; }

function canPlace(b, i, j) {
  const d = D.B[b];
  if (!d) return { ok: false, reason: 'Unknown building' };
  if (Math.abs(i) > D.GRID || Math.abs(j) > D.GRID) return { ok: false, reason: 'Too far from the town' };
  if (d.bp && !TB.G.unlocked.includes(b)) return { ok: false, reason: 'Needs a blueprint (dive wrecks or buy one)' };
  const c = get(i, j);
  if (b === 'platform') {
    if (c) return { ok: false, reason: 'Already built here' };
    if (inChannel(i, j)) return { ok: false, reason: 'Keep the harbour channel clear for boats' };
    if (!hasNeighbour(i, j)) return { ok: false, reason: 'Must connect to the town' };
    const p = world(i, j);
    for (const o of TB.World.obstacles) if (dist2(p.x, p.z, o.x, o.z) < (o.r + 3) ** 2) return { ok: false, reason: 'Something is in the way' };
    if (TB.Boat.P && dist2(p.x, p.z, TB.Boat.P.x, TB.Boat.P.z) < 4.5 * 4.5) return { ok: false, reason: 'Your boat is in the way' };
  } else {
    if (!c) return { ok: false, reason: 'Build a raft platform here first' };
    if (c.kind !== 'platform') return { ok: false, reason: 'Nothing can be built on the pier' };
    if (c.b && !c.ruined) return { ok: false, reason: 'This platform is taken' };
    if (c.ruined) return { ok: false, reason: 'Clear or rebuild the rubble first' };
    if (d.unique && count(b) > 0) return { ok: false, reason: 'You can only have one ' + d.name };
  }
  if (!canAfford(d.cost)) return { ok: false, reason: 'Need ' + missing(d.cost).join(', '), cost: true };
  return { ok: true };
}
function place(b, i, j) {
  const chk = canPlace(b, i, j);
  if (!chk.ok) return chk;
  pay(D.B[b].cost);
  if (b === 'platform') addCell(i, j, 'platform');
  else setBuilding(get(i, j), b);
  const p = world(i, j);
  TB.Fx.splash(p.x, p.z, 0.8);
  for (let k = 0; k < 8; k++) TB.Fx.puff(p.x + rand(-1.8, 1.8), D.DECK + 0.3, p.z + rand(-1.8, 1.8), { vy: 2, life: 0.8, size: 0.5, end: 0.05, color: '#e8d6b0', drag: 2 });
  TB.Snd.play('build');
  TB.G.stats['built_' + b] = (TB.G.stats['built_' + b] || 0) + 1;
  TB.emit('built', { b, i, j });
  changed();
  return { ok: true };
}
function demolish(c) {
  if (!c || c.b === 'hall') return false;
  const p = world(c.i, c.j);
  if (c.b) {
    if (!c.ruined) { const cost = D.B[c.b].cost; for (const [k, v] of Object.entries(cost)) TB.G.stock[k] += Math.floor(v * 0.5); }
    TB.Models.release(c.bobj); c.bobj.removeFromParent(); c.bobj = null; c.b = null; c.ruined = false;
  } else if (c.kind === 'platform') {
    // only remove a platform if the town stays connected to the hall
    cells.delete(key(c.i, c.j));
    if (!connected()) { cells.set(key(c.i, c.j), c); return false; }
    c.obj.removeFromParent();
    const cost = D.B.platform.cost; for (const [k, v] of Object.entries(cost)) TB.G.stock[k] += Math.floor(v * 0.5);
  } else return false;
  TB.Fx.explode(p.x, D.DECK + 0.5, p.z, 0.4); TB.Snd.play('smallBoom');
  changed();
  return true;
}
function rebuild(c) {
  if (!c || !c.ruined) return { ok: false };
  const cost = D.B[c.b].cost;
  if (!canAfford(cost, 0.5)) return { ok: false, reason: 'Need ' + missing(cost, 0.5).join(', ') };
  pay(cost, 0.5);
  setBuilding(c, c.b);
  TB.Snd.play('build');
  changed();
  return { ok: true };
}
function connected() {
  const seen = new Set([key(0, 0)]), q = [[0, 0]];
  while (q.length) { const [i, j] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = key(i + a, j + b); if (cells.has(k) && !seen.has(k)) { seen.add(k); q.push([i + a, j + b]); } } }
  return seen.size === cells.size;
}
function count(b) { let n = 0; for (const c of cells.values()) if (c.b === b && !c.ruined) n++; return n; }
function buildings() { const out = []; for (const c of cells.values()) if (c.b && !c.ruined) out.push(c); return out; }

let dirty = true;
function changed() { dirty = true; buildLattice(); TB.World.repaint(); recompute(); }

// ------------------------------------------------------------ economy
function recompute() {
  const G = TB.G, E = T.econ, diff = D.DIFF[G.diff];
  E.beds = 0; E.power = 0; E.use = 0; E.store = D.STORE_BASE; E.amen = 0; E.safety = 0; E.jobs = 0;
  const rates = {}; for (const k of D.RES_KEYS) rates[k] = 0;
  const jobs = [];
  let lanterns = 0;
  for (const c of cells.values()) {
    if (!c.b || c.ruined) continue;
    const d = D.B[c.b];
    E.beds += d.beds || 0;
    if (d.power > 0) E.power += d.power; else if (d.power < 0) E.use -= d.power;
    if (d.store) E.store += D.STORE_PER;
    E.amen += d.amen || 0; E.safety += d.safety || 0;
    if (c.b === 'lanterns') lanterns++;
    if (d.workers) { jobs.push(c); E.jobs += d.workers; }
  }
  jobs.sort((a, b) => D.JOB_PRIORITY.indexOf(a.b) - D.JOB_PRIORITY.indexOf(b.b));
  let avail = G.pop;
  for (const c of jobs) { const need = D.B[c.b].workers; const n = Math.min(avail, need); c.staffed = n / need; avail -= n; }
  E.workers = G.pop - avail; E.idle = avail;
  E.pr = E.use > 0 ? Math.min(1, E.power / E.use) : 1;
  E.eat = G.pop * diff.eat;
  rates.food -= E.eat; rates.water -= E.eat;
  for (const c of cells.values()) {
    if (!c.b || c.ruined) continue;
    const d = D.B[c.b];
    c.eff = (d.workers ? c.staffed : 1) * (d.power < 0 ? E.pr : 1) * (c.hp < c.max * 0.35 ? 0.5 : 1);
    if (d.prod) for (const [k, v] of Object.entries(d.prod)) rates[k] += v * c.eff;
    if (d.use) for (const [k, v] of Object.entries(d.use)) rates[k] -= v * c.eff;
  }
  E.rates = rates;
  // attractiveness (GDD formula): housing, essentials, safety, jobs, amenities, reputation
  const free = E.beds - G.pop;
  const housing = G.pop > E.beds ? clamp(100 * E.beds / Math.max(1, G.pop) - 45, 0, 60) : 55 + 45 * Math.min(1, free / 4);
  const days = (res) => { const use = Math.max(0.1, -Math.min(0, rates[res]) + (rates[res] < 0 ? 0 : 0)); return rates[res] >= 0 ? 9 : G.stock[res] / use; };
  const ess = Math.min(clamp(days('food') / 3, 0, 1) * 80 + (rates.food >= 0 ? 20 : 0), clamp(days('water') / 3, 0, 1) * 80 + (rates.water >= 0 ? 20 : 0));
  const safety = clamp(30 + E.safety + lanterns * 2 - (G.raidPenalty || 0), 0, 100);
  const jobsS = clamp(45 + 55 * Math.min(1, E.jobs / Math.max(1, G.pop * 0.5)), 0, 100);
  const amen = clamp(20 + E.amen, 0, 100);
  const rep = clamp(G.rep, 0, 100);
  E.parts = { housing, essentials: ess, safety, jobs: jobsS, amenities: amen, reputation: rep };
  E.attract = Math.round(0.22 * housing + 0.20 * ess + 0.18 * safety + 0.15 * jobsS + 0.15 * amen + 0.10 * rep);
  dirty = false;
}
function cap(res) { return res === 'coins' ? 9999 : T.econ.store; }

// ------------------------------------------------------------ damage
function damage(c, dmg) {
  if (!c || !c.b || c.ruined) return;
  c.hp -= dmg;
  const p = world(c.i, c.j);
  TB.Fx.sparks(p.x, D.DECK + 1.5, p.z);
  if (c.hp <= 0) {
    TB.Fx.explode(p.x, D.DECK + 1, p.z, 1.3); TB.Snd.play('boom'); TB.Gfx.cam.shake = Math.max(TB.Gfx.cam.shake, 0.6);
    const wasHall = c.b === 'hall';
    setRuin(c);
    TB.G.raidPenalty = (TB.G.raidPenalty || 0) + 10;
    TB.emit('buildingLost', c);
    if (wasHall) TB.emit('hallDestroyed');
    changed();
  }
}
// nearest standing building to a point (raider targets)
function nearestBuilding(x, z, filter) {
  let best = null, bd = 1e12;
  for (const c of cells.values()) {
    if (!c.b || c.ruined || (filter && !filter(c))) continue;
    const p = world(c.i, c.j), d = dist2(x, z, p.x, p.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestCell(x, z) {
  let best = null, bd = 1e12;
  for (const c of cells.values()) { const p = world(c.i, c.j), d = dist2(x, z, p.x, p.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
// pushes a boat (circle) out of the deck squares
function collideBoat(e, r) {
  const p = ij(e.x, e.z), n = Math.ceil((r + 2.5) / D.TILE);
  let hit = false;
  for (let i = p.i - n; i <= p.i + n; i++) for (let j = p.j - n; j <= p.j + n; j++) {
    const c = get(i, j); if (!c) continue;
    const w = world(i, j), hx = c.kind === 'pier' ? 1.35 : D.TILE / 2, hz = D.TILE / 2;
    const cx = clamp(e.x, w.x - hx, w.x + hx), cz = clamp(e.z, w.z - hz, w.z + hz);
    const dx = e.x - cx, dz = e.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 1e-6) { e.x += r; continue; }
      const d = Math.sqrt(d2), k = (r - d) / d; e.x += dx * k; e.z += dz * k; hit = true;
    }
  }
  return hit;
}
function bounds() {
  let r = 0; for (const c of cells.values()) r = Math.max(r, Math.hypot(c.i, c.j) * D.TILE + 3);
  return r;
}

// ------------------------------------------------------------ residents
// they wander the seams between tiles (a lattice of tile corners)
let lattice = new Map();
function buildLattice() {
  lattice = new Map();
  const link = (a, b) => { if (!lattice.has(a)) lattice.set(a, new Set()); if (!lattice.has(b)) lattice.set(b, new Set()); lattice.get(a).add(b); lattice.get(b).add(a); };
  for (const c of cells.values()) {
    const i = c.i * 2, j = c.j * 2;
    const k00 = (i - 1) + ',' + (j - 1), k10 = (i + 1) + ',' + (j - 1), k01 = (i - 1) + ',' + (j + 1), k11 = (i + 1) + ',' + (j + 1);
    link(k00, k10); link(k10, k11); link(k11, k01); link(k01, k00);
  }
}
function nodePos(k) { const [a, b] = k.split(',').map(Number); return { x: a / 2 * D.TILE, z: b / 2 * D.TILE }; }
function randomNode() { const keys = [...lattice.keys()]; return keys[Math.floor(Math.random() * keys.length)]; }
function deckY(x, z, t) { return D.DECK + wave(x, z, t) * 0.22; }

function updateWalkers(dt, t) {
  const G = TB.G;
  const want = Math.min(G.pop, 36);
  while (T.walkers.length < want && lattice.size) {
    const n = randomNode(), p = nodePos(n);
    const obj = TB.Models.make('person', { variant: T.walkers.length % TB.Models.PERSON_VARIANTS });
    root.add(obj);
    T.walkers.push({ obj, from: n, to: n, x: p.x, z: p.z, t: 1, spd: rand(1.1, 1.7), wait: rand(0, 2), ph: rand(0, 6), prev: null });
  }
  while (T.walkers.length > want) { const w = T.walkers.pop(); TB.Models.release(w.obj); w.obj.removeFromParent(); }
  const hall = nodePos('1,1');
  for (const w of T.walkers) {
    if (!lattice.has(w.to)) { w.to = w.from = randomNode(); const p = nodePos(w.to); w.x = p.x; w.z = p.z; }
    const target = nodePos(w.to);
    const dx = target.x - w.x, dz = target.z - w.z, d = Math.hypot(dx, dz);
    let moving = false;
    if (d > 0.05) {
      const s = Math.min(d, w.spd * (T.alarm ? 1.8 : 1) * dt);
      w.x += dx / d * s; w.z += dz / d * s; moving = true;
      w.obj.rotation.y = U.damp(w.obj.rotation.y, w.obj.rotation.y + U.angDiff(w.obj.rotation.y, Math.atan2(dx, dz)), 10, dt);
    } else if ((w.wait -= dt) <= 0) {
      const nb = lattice.get(w.to); if (!nb || !nb.size) continue;
      let opts = [...nb].filter(k => k !== w.prev); if (!opts.length) opts = [...nb];
      let next;
      if (T.alarm) { next = opts.reduce((a, b) => { const pa = nodePos(a), pb = nodePos(b); return dist2(pa.x, pa.z, hall.x, hall.z) < dist2(pb.x, pb.z, hall.x, hall.z) ? a : b; }); }
      else next = opts[Math.floor(Math.random() * opts.length)];
      w.prev = w.to; w.from = w.to; w.to = next; w.wait = T.alarm ? 0 : (Math.random() < 0.3 ? rand(0.5, 3) : 0);
    }
    const sheltered = T.alarm && dist2(w.x, w.z, hall.x, hall.z) < 9;
    w.obj.visible = !sheltered;
    w.ph += dt * (moving ? 9 : 2);
    w.obj.position.set(w.x, deckY(w.x, w.z, t) + (moving ? Math.abs(Math.sin(w.ph)) * 0.08 : 0), w.z);
    if (!w.obj.userData.glb) w.obj.rotation.z = moving ? Math.sin(w.ph) * 0.1 : 0;
    else TB.Models.play(w.obj, moving ? (T.alarm ? 'run' : 'walk') : 'idle');
  }
}

// ------------------------------------------------------------ turrets
const _v = { a: null };
function updateTurrets(dt) {
  const v = _v.a || (_v.a = new THREE.Vector3());
  for (const c of cells.values()) {
    if (!c.b || c.ruined) continue;
    const tdef = D.B[c.b].turret; if (!tdef) continue;
    const p = world(c.i, c.j);
    c.cd -= dt;
    const eff = c.staffed * (D.B[c.b].power < 0 ? T.econ.pr : 1);
    if (eff <= 0) continue;
    const tgt = TB.Actors.nearestEnemy(p.x, p.z, tdef.range, e => !e.hidden && (tdef.kind === 'harpoon' ? !e.d.onDeck : true));
    const node = c.bobj.userData.nodes.turret;
    if (!tgt) continue;
    const yaw = Math.atan2(tgt.x - p.x, tgt.z - p.z);
    if (node) node.rotation.y = U.damp(node.rotation.y, node.rotation.y + U.angDiff(node.rotation.y, yaw - c.bobj.rotation.y), 8, dt);
    if (c.cd <= 0) {
      c.cd = 1 / (tdef.rate * eff);
      const m = c.bobj.userData.nodes.muzzle;
      if (m) m.getWorldPosition(v); else v.set(p.x, D.DECK + 3, p.z);
      TB.Actors.fire({ team: 'town', kind: tdef.kind, x: v.x, y: v.y, z: v.z, tgt, dmg: tdef.dmg, speed: tdef.speed, spread: 0.02 });
    }
  }
}

// ------------------------------------------------------------ frame update
let tick = 0;
function update(dt, t) {
  const G = TB.G;
  tick -= dt;
  if (tick <= 0 || dirty) { tick = 0.5; recompute(); }
  const E = T.econ;
  // resources flow
  const k = dt / D.DAY_LEN;
  for (const r of D.RES_KEYS) {
    const v = E.rates[r]; if (!v) continue;
    G.stock[r] = clamp(G.stock[r] + v * k, 0, Math.max(cap(r), G.stock[r] > cap(r) && v < 0 ? G.stock[r] : 0));
  }
  // auto repair (needs wood), faster with a workshop
  if (!T.alarm) {
    const rate = (count('workshop') ? 7 : 3.5) * dt;
    for (const c of cells.values()) {
      if (!c.b || c.ruined || c.hp >= c.max) continue;
      if (G.stock.wood < 0.2) break;
      const add = Math.min(rate, c.max - c.hp); c.hp += add; G.stock.wood -= add / 15;
    }
  }
  updateTurrets(dt);
  updateWalkers(dt, t);
  // bobbing + animated parts
  for (const c of cells.values()) {
    const p = world(c.i, c.j);
    const y = deckY(p.x, p.z, t), tilt = Math.sin(t * 0.9 + c.ph) * 0.012;
    c.obj.position.y = y; c.obj.rotation.x = tilt;
    if (c.bobj) {
      c.bobj.position.y = y; c.bobj.rotation.x = tilt;
      const n = c.bobj.userData.nodes;
      if (n.rotor) n.rotor.rotation.z -= dt * (1.8 + Math.sin(t * 0.3) * 0.6);
      if (n.dish) n.dish.rotation.y += dt * 0.6;
      if (n.flag) n.flag.rotation.y = Math.sin(t * 3 + c.ph) * 0.35;
      if (n.light) n.light.visible = Math.sin(t * 3) > 0;
      if (n.smoke && c.eff > 0 && Math.random() < dt * 2.5) { const v = _v.a || (_v.a = new THREE.Vector3()); n.smoke.getWorldPosition(v); TB.Fx.smoke(v.x, v.y, v.z, 0.6); }
      if (c.b && !c.ruined && c.hp < c.max * 0.5 && Math.random() < dt * 4) TB.Fx.smoke(p.x + rand(-1, 1), y + 2, p.z + rand(-1, 1), 1.2);
      if (c.ruined && Math.random() < dt * 1.5) TB.Fx.smoke(p.x, y + 0.5, p.z, 0.8);
    }
  }
}

// ------------------------------------------------------------ build preview
function preview(b, i, j) {
  const chk = b ? canPlace(b, i, j) : { ok: false };
  const slot = b === 'platform' ? 'platform' : 'bld_' + b;
  if (!b) { clearPreview(); return chk; }
  if (ghostKey !== slot) {
    clearPreview();
    ghostObj = TB.Models.ghost(slot, TB.Gfx.mats.ghostOk); ghostKey = slot; root.add(ghostObj);
  }
  const p = world(i, j);
  ghostObj.position.set(p.x, D.DECK + 0.05, p.z);
  const mat = chk.ok ? TB.Gfx.mats.ghostOk : chk.cost ? TB.Gfx.mats.ghostWarn : TB.Gfx.mats.ghostBad;
  ghostObj.traverse(m => { if (m.isMesh) m.material = mat; });
  ghostObj.visible = true;
  return chk;
}
function clearPreview() { if (ghostObj) { ghostObj.removeFromParent(); ghostObj = null; ghostKey = ''; } }
// tints the tiles where the selected thing can go
const _m4 = { a: null }, _col = { a: null };
function overlay(b) {
  if (!overlayMesh) return;
  if (!b) { overlayMesh.count = 0; return; }
  const m4 = _m4.a || (_m4.a = new THREE.Matrix4()), col = _col.a || (_col.a = new THREE.Color());
  let n = 0;
  const put = (i, j, c) => { if (n >= 400) return; const p = world(i, j); m4.makeTranslation(p.x, D.DECK + 0.08, p.z); overlayMesh.setMatrixAt(n, m4); col.set(c); overlayMesh.setColorAt(n, col); n++; };
  if (b === 'platform') {
    for (let i = -D.GRID; i <= D.GRID; i++) for (let j = -D.GRID; j <= D.GRID; j++) {
      if (get(i, j) || !hasNeighbour(i, j)) continue;
      put(i, j, inChannel(i, j) ? '#ff5a4a' : '#5dffb0');
    }
  } else {
    for (const c of cells.values()) if (c.kind === 'platform' && !c.b) put(c.i, c.j, '#5dffb0');
  }
  overlayMesh.count = n;
  overlayMesh.instanceMatrix.needsUpdate = true; overlayMesh.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------ shallows map
function paint(c) {
  for (const cell of cells.values()) {
    const p = world(cell.i, cell.j);
    const w = cell.kind === 'pier' ? 2.8 : D.TILE;
    c.fillStyle = 'rgb(95,95,95)'; c.fillRect(p.x - w / 2 - 4, p.z - D.TILE / 2 - 4, w + 8, D.TILE + 8);
  }
  for (const cell of cells.values()) {
    const p = world(cell.i, cell.j);
    const w = cell.kind === 'pier' ? 2.8 : D.TILE;
    c.fillStyle = '#fff'; c.fillRect(p.x - w / 2, p.z - D.TILE / 2, w, D.TILE);
  }
}

// ------------------------------------------------------------ save / load
function save() { return [...cells.values()].map(c => ({ i: c.i, j: c.j, k: c.kind, b: c.b, hp: Math.round(c.hp), r: c.ruined ? 1 : 0 })); }
function load(list) {
  init();
  for (const s of list) addCell(s.i, s.j, s.k);
  for (const s of list) {
    if (!s.b) continue;
    const c = get(s.i, s.j);
    setBuilding(c, s.b, s.hp);
    if (s.r) { c.b = s.b; setRuin(c); }
  }
  changed();
}

TB.U.extend(T, { init, newTown, world, ij, cellAt, get, canPlace, place, demolish, rebuild, count, buildings, damage, nearestBuilding, nearestCell,
  collideBoat, bounds, recompute, update, preview, clearPreview, overlay, paint, save, load, canAfford, missing, cap, deckY, changed,
  get root() { return root; } });
})();
