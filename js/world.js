'use strict';
/* =====================================================================
   TIDEBREAKERS — the sea: drowned city ruins, wrecks, drifting salvage,
   castaways, dive sites and Red Wake outposts. North is -Z.
   ===================================================================== */
(() => {
const { rand, randi, clamp, dist2, rng, wave, TAU } = TB.U;
const D = TB.D;
let THREE, root;
const W = TB.World = {
  obstacles: [],     // { x, z, r }  solid things above water
  ruins: [],         // for the shallows map and the minimap
  items: [],         // floating salvage
  castaways: [],
  dives: [],
  outposts: [],
  fields: [],
  landmarks: [],
};

function clear() {
  if (root) { root.removeFromParent(); root.traverse(o => { if (o.userData.mixer) TB.Models.release(o); }); }
  root = new THREE.Group(); root.name = 'world';
  TB.Gfx.scene.add(root);
  for (const k of ['obstacles', 'ruins', 'items', 'castaways', 'dives', 'outposts', 'fields', 'landmarks']) W[k].length = 0;
}

// keep the town, the pier approach and the merchant lane clear
function blocked(x, z, r) {
  if (x * x + z * z < (60 + r) * (60 + r)) return true;
  if (Math.abs(x - 5) < 18 + r && z > 0 && z < 240) return true;
  return false;
}
function free(x, z, r) {
  if (blocked(x, z, r)) return false;
  for (const o of W.obstacles) if (dist2(x, z, o.x, o.z) < (o.r + r + 6) ** 2) return false;
  return true;
}

function generate(seed) {
  THREE = window.THREE;
  clear();
  const R = rng(seed);
  const rr = (a, b) => a + R() * (b - a);
  // ---- drowned city: blocks on a slightly rotated street grid
  const rot = rr(-0.3, 0.3), cs = Math.cos(rot), sn = Math.sin(rot), sp = 26;
  for (let gx = -11; gx <= 11; gx++) for (let gz = -11; gz <= 11; gz++) {
    if (R() < 0.38) continue;
    let x = gx * sp + rr(-4, 4), z = gz * sp + rr(-4, 4);
    const X = x * cs - z * sn, Z = x * sn + z * cs;
    const dist = Math.hypot(X, Z);
    if (dist > 285) continue;
    const w = rr(7, 15), d = rr(7, 15);
    if (blocked(X, Z, Math.max(w, d) * 0.7)) continue;
    const above = R() < 0.36;
    const top = above ? rr(1.5, dist > 140 ? 16 : 9) : rr(-7, -1.6);
    const ruin = { x: X, z: Z, w, d, top, rot: rot + (R() < 0.2 ? rr(-0.3, 0.3) : 0) };
    const obj = TB.Models.make('ruin_tower', { w, d, top, depth: 26, roofJunk: above && R() < 0.6, broken: R() < 0.3 });
    if (TB.Models.hasGLB('ruin_tower')) { const s = TB.Models.SLOTS.ruin_tower.size; obj.scale.set(w / s[2], (top + 26) / s[1], d / s[0]); obj.position.y = -26; }
    obj.position.x = X; obj.position.z = Z; obj.rotation.y = ruin.rot;
    if (!above) obj.traverse(m => { if (m.isMesh) { m.layers.set(1); m.castShadow = false; } });
    root.add(obj);
    W.ruins.push(ruin);
    if (above) W.obstacles.push({ x: X, z: Z, r: Math.max(w, d) * 0.62, kind: 'ruin' });
  }
  // ---- ship graveyard (east)
  for (let i = 0; i < 6; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rr(-0.6, 0.6), dd = rr(130, 250), x = Math.cos(a) * dd, z = Math.sin(a) * dd;
      if (!free(x, z, 8)) continue;
      const o = TB.Models.make('shipwreck');
      o.position.set(x, 0, z); o.rotation.set(rr(-0.15, 0.15), rr(0, TAU), rr(-0.35, 0.35));
      root.add(o);
      W.obstacles.push({ x, z, r: 6.5, kind: 'wreck' });
      W.ruins.push({ x, z, w: 4, d: 12, top: 1, rot: o.rotation.y, wreck: true });
      break;
    }
  }
  // ---- rocks
  for (let i = 0; i < 12; i++) for (let tries = 0; tries < 20; tries++) {
    const a = rr(0, TAU), dd = rr(80, 280), x = Math.cos(a) * dd, z = Math.sin(a) * dd;
    if (!free(x, z, 3)) continue;
    const o = TB.Models.make('rock'); o.position.set(x, 0, z); o.rotation.y = rr(0, TAU); const s = rr(0.8, 1.6); o.scale.setScalar(s);
    root.add(o); W.obstacles.push({ x, z, r: 2.6 * s, kind: 'rock' }); W.ruins.push({ x, z, w: 4 * s, d: 4 * s, top: 1, rot: 0, rock: true });
    break;
  }
  // ---- ferris wheel landmark (south-west)
  {
    let x = -120, z = 95;
    for (let tries = 0; tries < 40 && !free(x, z, 12); tries++) { x = rr(-170, -90); z = rr(60, 140); }
    const o = TB.Models.make('ferris_wheel'); o.position.set(x, -5, z); o.rotation.set(0.12, rr(0, TAU), 0.18);
    root.add(o); W.obstacles.push({ x, z, r: 4, kind: 'landmark' }); W.landmarks.push({ x, z, name: 'Old fairground' });
    W.ruins.push({ x, z, w: 3, d: 18, top: 1, rot: o.rotation.y });
  }
  // ---- buoys marking the harbour channel
  for (const [x, z] of [[-8, 20], [8, 20], [-8, 34], [8, 34]]) { const o = TB.Models.make('buoy'); o.position.set(x, 0, z); o.userData.bob = true; root.add(o); }
  // ---- Red Wake outposts (north-east first, more in endless)
  const spots = [[0.55, 205], [1.05, 235], [-0.35, 230]];
  for (const [a0, dd] of spots) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 60; tries++) {
      const a = -Math.PI / 2 + a0 + rr(-0.15, 0.15) + (tries > 30 ? rr(-0.5, 0.5) : 0), d = dd + rr(-15, 15);
      x = Math.cos(a) * d; z = Math.sin(a) * d;
      if (free(x, z, 12)) break;
    }
    // clear any ruins on top of it
    for (let i = W.obstacles.length - 1; i >= 0; i--) if (dist2(x, z, W.obstacles[i].x, W.obstacles[i].z) < 18 * 18) W.obstacles.splice(i, 1);
    const o = TB.Models.make('outpost_platform'); o.position.set(x, 0, z); o.rotation.y = rr(0, TAU); root.add(o);
    W.outposts.push({ x, z, obj: o, cleared: false, guns: [], cage: null, respawnT: 0, id: W.outposts.length });
    W.obstacles.push({ x, z, r: 7.5, kind: 'outpost' });
    W.ruins.push({ x, z, w: 14, d: 14, top: 1, rot: o.rotation.y, outpost: true });
  }
  // ---- drift fields: currents carry salvage through them
  for (let i = 0; i < 6; i++) {
    const a = rr(0, TAU), dd = i < 2 ? rr(55, 90) : rr(90, 230);
    const ca = rr(0, TAU), cv = rr(0.25, 0.7);
    W.fields.push({ x: Math.cos(a) * dd, z: Math.sin(a) * dd, vx: Math.cos(ca) * cv, vz: Math.sin(ca) * cv, r: rr(18, 30) });
  }
  repaint();
}

// ------------------------------------------------- shallows / foam map
function repaint() {
  TB.Gfx.paintShallows(c => {
    for (const r of W.ruins) {
      c.save(); c.translate(r.x, r.z); c.rotate(-r.rot);
      const k = r.top > 0 ? 1 : clamp(0.55 + r.top * 0.06, 0.12, 0.5);
      const v = Math.round(k * 255);
      c.fillStyle = `rgb(${v},${v},${v})`;
      if (r.top > 0) { c.fillStyle = 'rgb(95,95,95)'; c.fillRect(-r.w / 2 - 5, -r.d / 2 - 5, r.w + 10, r.d + 10); c.fillStyle = '#fff'; }
      c.fillRect(-r.w / 2, -r.d / 2, r.w, r.d);
      c.restore();
    }
    if (TB.Town && TB.Town.paint) TB.Town.paint(c);
  });
}

// ------------------------------------------------- floating salvage
function pickType(dist) {
  let tot = 0; const opts = [];
  for (const [k, p] of Object.entries(D.PICK)) { if (!p.weight || (p.far && dist < p.far)) continue; opts.push([k, p.weight]); tot += p.weight; }
  let r = Math.random() * tot;
  for (const [k, w] of opts) { if ((r -= w) <= 0) return k; }
  return 'pick_wood';
}
function addItem(slot, x, z, give, o = {}) {
  const obj = TB.Models.make(slot);
  obj.position.set(x, 0, z); obj.rotation.y = rand(0, TAU);
  root.add(obj);
  const it = { slot, x, z, vx: o.vx || 0, vz: o.vz || 0, give: give || Object.assign({}, D.PICK[slot].give), obj, spin: rand(-0.3, 0.3), age: 0, life: o.life || 0, ph: rand(0, 6) };
  W.items.push(it);
  return it;
}
function spawnDebris(nearPlayer) {
  const f = TB.U.pick(W.fields);
  let x = f.x + rand(-f.r, f.r), z = f.z + rand(-f.r, f.r);
  if (nearPlayer && TB.Boat && TB.Boat.P) {
    // never pop into view right next to the player
    const p = TB.Boat.P; if (dist2(x, z, p.x, p.z) < 50 * 50) return;
  }
  for (const o of W.obstacles) if (dist2(x, z, o.x, o.z) < (o.r + 2) ** 2) return;
  if (x * x + z * z < 40 * 40) return;
  addItem(pickType(Math.hypot(x, z)), x, z, null, { vx: f.vx, vz: f.vz });
}
function removeItem(it) {
  const i = W.items.indexOf(it); if (i >= 0) W.items.splice(i, 1);
  it.obj.removeFromParent();
}
// salvage dropped by sunk raiders (life in seconds, sinks afterwards)
function drop(x, z, give) {
  const it = addItem('pick_loot', x + rand(-1, 1), z + rand(-1, 1), give, { life: 70 });
  return it;
}

// ------------------------------------------------- castaways
function spawnCastaway() {
  for (let tries = 0; tries < 25; tries++) {
    const a = rand(0, TAU), d = rand(70, 260), x = Math.cos(a) * d, z = Math.sin(a) * d;
    let ok = true;
    for (const o of W.obstacles) if (dist2(x, z, o.x, o.z) < (o.r + 5) ** 2) { ok = false; break; }
    if (!ok) continue;
    if (TB.Boat && TB.Boat.P && dist2(x, z, TB.Boat.P.x, TB.Boat.P.z) < 45 * 45) continue;
    const obj = TB.Models.make('castaway_raft'); obj.position.set(x, 0, z); obj.rotation.y = rand(0, TAU); root.add(obj);
    W.castaways.push({ x, z, obj, n: Math.random() < 0.3 ? 2 : 1, ph: rand(0, 6) });
    return;
  }
}
function addCastawayAt(x, z, n) {
  const obj = TB.Models.make('castaway_raft'); obj.position.set(x, 0, z); root.add(obj);
  W.castaways.push({ x, z, obj, n, ph: rand(0, 6) });
}
function removeCastaway(c) { const i = W.castaways.indexOf(c); if (i >= 0) W.castaways.splice(i, 1); c.obj.removeFromParent(); }

// ------------------------------------------------- dive sites
function spawnDive() {
  // over a sunken building, the deeper / farther the better the haul
  const subs = W.ruins.filter(r => r.top < 0 && !r.dived && Math.hypot(r.x, r.z) > 70);
  for (let tries = 0; tries < 20; tries++) {
    const r = subs.length ? TB.U.pick(subs) : null;
    const x = r ? r.x + rand(-2, 2) : rand(-200, 200), z = r ? r.z + rand(-2, 2) : rand(-200, 200);
    if (W.dives.some(d => dist2(d.x, d.z, x, z) < 60 * 60)) continue;
    if (TB.Boat && TB.Boat.P && dist2(x, z, TB.Boat.P.x, TB.Boat.P.z) < 40 * 40) continue;
    const obj = TB.Models.make('dive_marker'); obj.position.set(x + 3, 0, z); root.add(obj);
    const dist = Math.hypot(x, z);
    W.dives.push({ x, z, obj, ph: rand(0, 6), rich: dist > 170, shark: dist > 120 && Math.random() < 0.45, ruin: r });
    if (r) r.dived = true;
    return;
  }
}
function removeDive(d) { const i = W.dives.indexOf(d); if (i >= 0) W.dives.splice(i, 1); d.obj.removeFromParent(); }

// ------------------------------------------------- outposts
function armOutpost(op) {
  op.cleared = false;
  op.guns = [];
  const n = 2 + (TB.G && TB.G.day > 8 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = op.obj.rotation.y + i * (TAU / n) + 0.4;
    const gx = op.x + Math.sin(a) * 4.5, gz = op.z + Math.cos(a) * 4.5;
    const e = TB.Actors.spawn('tower', gx, gz, { y: 1.2, outpost: op });
    op.guns.push(e);
  }
  if (!op.cage) {
    const c = TB.Models.make('outpost_cage');
    const a = op.obj.rotation.y + Math.PI;
    c.position.set(op.x + Math.sin(a) * 2.5, 1.2, op.z + Math.cos(a) * 2.5);
    root.add(c);
    op.cage = { obj: c, n: 3 };
  }
  // a couple of skiffs patrol the fort
  for (let i = 0; i < 2; i++) TB.Actors.spawn('skiff', op.x + rand(-20, 20), op.z + rand(-20, 20), { home: { x: op.x, z: op.z }, mode: 'patrol' });
}
function outpostGunDown(op) {
  if (op.cleared || op.guns.some(g => g.alive)) return;
  op.cleared = true;
  op.respawnT = (TB.G ? TB.G.t : 0) + D.DAY_LEN * 3;
  TB.Fx.explode(op.x, 2, op.z, 2.5); TB.Snd.play('boom');
  if (op.cage) {
    // freed prisoners swim to rafts around the fort
    for (let i = 0; i < op.cage.n; i++) { const a = rand(0, TAU); addCastawayAt(op.x + Math.cos(a) * 11, op.z + Math.sin(a) * 11, 1); }
    op.cage.obj.removeFromParent(); op.cage = null;
  }
  TB.emit('outpost', op);
}

// ------------------------------------------------- update
let spawnT = 0;
function update(dt, t) {
  const G = TB.G;
  // keep the sea stocked
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 0.4;
    const target = 50 + Math.min(20, (G.day - 1) * 2);
    if (W.items.filter(i => !i.life).length < target) spawnDebris(true);
    const radio = TB.Town.count('radio') ? 2 : 0;
    if (W.castaways.length < 3 + radio && Math.random() < 0.06) spawnCastaway();
    if (W.dives.length < 5 && Math.random() < 0.05) spawnDive();
  }
  for (const op of W.outposts) if (op.cleared && G.t > op.respawnT && !op.guns.some(g => g.alive)) {
    const p = TB.Boat.P; if (!p || dist2(p.x, p.z, op.x, op.z) > 120 * 120) { armOutpost(op); }
  }
  // drift & bob
  for (let i = W.items.length - 1; i >= 0; i--) {
    const it = W.items[i];
    it.age += dt;
    it.x += it.vx * dt; it.z += it.vz * dt;
    if (it.life && it.age > it.life) { TB.Fx.splash(it.x, it.z, 0.5); removeItem(it); continue; }
    if (it.x * it.x + it.z * it.z > D.WORLD_R * D.WORLD_R * 1.1) { removeItem(it); continue; }
    for (const o of W.obstacles) if (dist2(it.x, it.z, o.x, o.z) < o.r * o.r) { it.vx = -it.vx; it.vz = -it.vz; break; }
    const o = it.obj;
    o.position.set(it.x, wave(it.x, it.z, t) + Math.sin(t * 1.7 + it.ph) * 0.06, it.z);
    o.rotation.y += it.spin * dt;
    o.rotation.x = Math.sin(t * 1.3 + it.ph) * 0.12; o.rotation.z = Math.cos(t * 1.1 + it.ph) * 0.12;
  }
  for (const c of W.castaways) {
    c.obj.position.set(c.x, wave(c.x, c.z, t), c.z);
    c.obj.rotation.z = Math.sin(t * 1.4 + c.ph) * 0.1;
    const f = c.obj.userData.nodes.flag; if (f) f.rotation.y = Math.sin(t * 4 + c.ph) * 0.4;
  }
  for (const d of W.dives) {
    d.obj.position.y = wave(d.x + 3, d.z, t);
    d.obj.rotation.z = Math.sin(t * 1.2 + d.ph) * 0.12;
    if (Math.random() < dt * 3) TB.Fx.bubbles(d.x + rand(-1.5, 1.5), 0, d.z + rand(-1.5, 1.5));
    if (Math.random() < dt * 0.8) TB.Fx.foam(d.x + rand(-1, 1), d.z + rand(-1, 1), 0.6, 1.6, 2.2);
  }
  root.children.forEach(o => {
    if (o.userData.bob) { o.position.y = wave(o.position.x, o.position.z, t); o.rotation.z = Math.sin(t + o.position.x) * 0.12; }
  });
  for (const op of W.outposts) { const f = op.obj.userData.nodes.flag; if (f) f.rotation.y = Math.sin(t * 3 + op.id) * 0.35; }
}

// circle-vs-obstacles; returns the speed lost
function collide(e, r) {
  let hit = false;
  for (const o of W.obstacles) {
    const dx = e.x - o.x, dz = e.z - o.z, rr = o.r + r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; e.x += dx * k; e.z += dz * k; hit = true; }
  }
  return hit;
}
// line of sight across the water (ruins block shots)
function clearShot(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  if (L2 < 1) return true;
  for (const o of W.obstacles) {
    if (o.kind === 'outpost') continue;
    const t = clamp(((o.x - ax) * dx + (o.z - az) * dz) / L2, 0, 1);
    if (dist2(ax + dx * t, az + dz * t, o.x, o.z) < o.r * o.r * 0.7) return false;
  }
  return true;
}
function zone(x, z) {
  const d = Math.hypot(x, z);
  if (d < 45) return 'Tidebreak Harbor';
  for (const op of W.outposts) if (dist2(x, z, op.x, op.z) < 60 * 60) return 'Red Wake waters';
  if (x > 100 && Math.abs(z) < x * 0.8) return 'Ship graveyard';
  if (d < 110) return 'Drowned suburbs';
  if (d < 200) return 'Sunken downtown';
  return 'Open sea';
}
function start() {
  for (let i = 0; i < 46; i++) spawnDebris(false);
  // a guaranteed first batch right outside the harbour for the tutorial
  for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.22; addItem(i % 3 === 2 ? 'pick_plastic' : 'pick_wood', Math.sin(a) * 34, 26 + Math.cos(a) * 14, null, { vx: 0.05, vz: -0.02 }); }
  for (let i = 0; i < 4; i++) spawnCastaway();
  for (let i = 0; i < 5; i++) spawnDive();
  for (const op of W.outposts) armOutpost(op);
}

TB.U.extend(W, { generate, start, update, collide, clearShot, zone, repaint, addItem, removeItem, drop, removeCastaway, addCastawayAt, removeDive, spawnDive, outpostGunDown,
  get root() { return root; } });
})();
