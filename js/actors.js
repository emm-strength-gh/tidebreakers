'use strict';
/* =====================================================================
   TIDEBREAKERS — everything else that moves
   Enemies (Red Wake raiders, swimmers, boarders, sharks, outpost guns,
   the Iron Fleet flagship), friendly ships (merchant, migrant rafts),
   projectiles, and the director that schedules raids and visitors.
   ===================================================================== */
(() => {
const D = TB.D, U = TB.U;
const { clamp, rand, randi, dist2, angDiff, approach, wave, TAU } = U;
let THREE, root, bulletMesh;
const A = TB.Actors = { list: [], npcs: [], shots: [] };
const _v = {};

function init() {
  THREE = window.THREE;
  if (root) root.removeFromParent();
  root = new THREE.Group(); root.name = 'actors'; TB.Gfx.scene.add(root);
  A.list.length = 0; A.npcs.length = 0; A.shots.length = 0;
  const bg = new THREE.BoxGeometry(0.16, 0.16, 1.2);
  bulletMesh = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 500);
  bulletMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(500 * 3), 3);
  bulletMesh.layers.set(1); bulletMesh.frustumCulled = false; bulletMesh.count = 0;
  root.add(bulletMesh);
  _v.m4 = new THREE.Matrix4(); _v.q = new THREE.Quaternion(); _v.e = new THREE.Euler(0, 0, 0, 'YXZ'); _v.s = new THREE.Vector3(1, 1, 1); _v.p = new THREE.Vector3(); _v.c = new THREE.Color(); _v.w = new THREE.Vector3();
}

// ================================================================ enemies
function spawn(type, x, z, o = {}) {
  const d = D.E[type], G = TB.G;
  const scale = D.DIFF[G.diff].enemyHp * (G.mode === 'endless' ? Math.min(2.2, 1 + (G.day - 1) * 0.05) : 1);
  const obj = TB.Models.make(d.model);
  obj.position.set(x, o.y || 0, z);
  root.add(obj);
  const e = {
    type, d, x, z, y: o.y || 0, h: o.h != null ? o.h : rand(0, TAU), spd: 0, vx: 0, vz: 0, hp: Math.round(d.hp * scale), max: Math.round(d.hp * scale),
    obj, alive: true, mode: o.mode || 'raid', home: o.home || { x, z }, wp: null, cd: rand(0.5, 2), burst: 0, burstT: 0,
    tgtCell: null, raid: !!o.raid, outpost: o.outpost || null, revealT: 0, hidden: !!d.hidden, deployed: false, stealT: 2, t: 0,
    retreatT: 0, cell: o.cell || null, ph: rand(0, 6), sinkT: 0, spawnT: 0, hurtT: 0,
  };
  A.list.push(e);
  return e;
}
function aliveCount(filter) { let n = 0; for (const e of A.list) if (e.alive && (!filter || filter(e))) n++; return n; }

// targets for the player's gun: closest in front, visible
function findTarget(x, z, h, range, cone) {
  let best = null, bs = 1e12;
  for (const e of A.list) {
    if (!e.alive || e.hidden) continue;
    const d2 = dist2(x, z, e.x, e.z); if (d2 > range * range) continue;
    const a = Math.abs(angDiff(h, Math.atan2(e.x - x, e.z - z)));
    if (a > cone) continue;
    if (!TB.World.clearShot(x, z, e.x, e.z)) continue;
    const s = d2 * (1 + a * 1.5) * (e.d.onDeck ? 0.7 : 1);
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
function nearestEnemy(x, z, range, filter) {
  let best = null, bd = range * range;
  for (const e of A.list) {
    if (!e.alive || (filter && !filter(e))) continue;
    const d2 = dist2(x, z, e.x, e.z); if (d2 < bd && TB.World.clearShot(x, z, e.x, e.z)) { bd = d2; best = e; }
  }
  return best;
}

function steer(e, tx, tz, spd, dt, avoidTown = true) {
  let dx = tx - e.x, dz = tz - e.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  for (const o of TB.World.obstacles) {
    const ox = e.x - o.x, oz = e.z - o.z, dd = Math.hypot(ox, oz) || 1, rr = o.r + e.d.r + 7;
    if (dd < rr) { const k = (rr - dd) / rr * 2.4; dx += ox / dd * k; dz += oz / dd * k; }
  }
  for (const f of A.list) {
    if (f === e || !f.alive || f.d.onDeck) continue;
    const ox = e.x - f.x, oz = e.z - f.z, dd = Math.hypot(ox, oz) || 1, rr = e.d.r + f.d.r + 3;
    if (dd < rr) { const k = (rr - dd) / rr; dx += ox / dd * k; dz += oz / dd * k; }
  }
  const th = Math.atan2(dx, dz), dh = angDiff(e.h, th);
  e.h += clamp(dh, -e.d.turn * dt, e.d.turn * dt);
  const want = d < 2 ? 0 : spd * clamp(Math.cos(dh), 0.25, 1) * clamp(d / 6, 0.2, 1);
  e.spd = approach(e.spd, want, 8 * dt);
  e.vx = Math.sin(e.h) * e.spd; e.vz = Math.cos(e.h) * e.spd;
  e.x += e.vx * dt; e.z += e.vz * dt;
  TB.World.collide(e, e.d.r);
  if (avoidTown) TB.Town.collideBoat(e, e.d.r);
  return d;
}

function inRange(e, x, z, r = e.d.range) { return dist2(e.x, e.z, x, z) < r * r; }
function shootAt(e, tgt, tx, ty, tz) {
  const d = e.d;
  const v = _v.w;
  const m = e.obj.userData.nodes.muzzle;
  if (m) m.getWorldPosition(v); else v.set(e.x + Math.sin(e.h) * 1.5, e.y + 1.2, e.z + Math.cos(e.h) * 1.5);
  if (d.kind === 'shell') {
    fire({ team: 'enemy', kind: 'shell', x: v.x, y: v.y, z: v.z, at: { x: tx + rand(-2, 2), y: ty, z: tz + rand(-2, 2) }, dmg: d.dmg, speed: 34 });
    TB.Snd.play('cannon'); TB.Fx.muzzle(v.x, v.y, v.z); TB.Fx.smoke(v.x, v.y, v.z, 1);
  } else {
    fire({ team: 'enemy', kind: 'bullet', x: v.x, y: v.y, z: v.z, tgt, at: tgt ? null : { x: tx, y: ty, z: tz }, dmg: d.dmg, speed: 60, range: d.range * 1.25, spread: 0.07 });
    TB.Snd.play('enemyGun', { gap: 0.05 }); TB.Fx.muzzle(v.x, v.y, v.z);
  }
}
function aimTurret(e, tx, tz, dt, name = 'turret') {
  const n = e.obj.userData.nodes[name]; if (!n) return;
  const yaw = Math.atan2(tx - e.x, tz - e.z) - e.h - (name === 'turret2' ? Math.PI : 0);
  n.rotation.y += angDiff(n.rotation.y, yaw) * Math.min(1, dt * 6);
}
// fire with bursts; target is the player's boat or a building
function tryFire(e, dt, tgt, tx, ty, tz) {
  e.cd -= dt;
  if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = 0.11; shootAt(e, tgt, tx, ty, tz); } return; }
  if (e.cd > 0) return;
  if (!TB.World.clearShot(e.x, e.z, tx, tz)) return;
  const fast = e.d.boss && e.hp < e.max * 0.5 ? 0.6 : 1;
  e.cd = (1 / e.d.rate) * fast * rand(0.85, 1.2);
  e.burst = (e.d.burst || 1) - 1; e.burstT = 0.11;
  shootAt(e, tgt, tx, ty, tz);
}
function playerTarget() { const P = TB.Boat.P; return P && P.alive ? P : null; }
function buildingTarget(e) {
  if (!e.tgtCell || !e.tgtCell.b || e.tgtCell.ruined) e.tgtCell = TB.Town.nearestBuilding(e.x, e.z, c => (e.type === 'boarder' ? true : true));
  return e.tgtCell;
}

function updateBoatEnemy(e, dt, t) {
  const P = playerTarget(), d = e.d;
  const pd2 = P ? dist2(e.x, e.z, P.x, P.z) : 1e12;
  // morale: badly damaged small boats may flee
  if (e.mode !== 'flee' && !d.boss && e.type !== 'gunboat' && e.hp < e.max * 0.25 && Math.random() < dt * 0.5) e.mode = 'flee';
  if (e.mode === 'patrol') {
    if (!e.wp || dist2(e.x, e.z, e.wp.x, e.wp.z) < 25) { const a = rand(0, TAU); e.wp = { x: e.home.x + Math.cos(a) * 28, z: e.home.z + Math.sin(a) * 28 }; }
    steer(e, e.wp.x, e.wp.z, d.speed * 0.5, dt);
    if (P && pd2 < 58 * 58) e.mode = 'attack';
  } else if (e.mode === 'attack') {
    if (!P) { e.mode = e.raid ? 'raid' : 'patrol'; return; }
    const dist = Math.sqrt(pd2);
    const side = Math.sin(e.ph) > 0 ? 1 : -1;
    const ax = P.x - e.x, az = P.z - e.z;
    const want = d.range * 0.7;
    // circle the player at gun range
    const tx = P.x - ax / dist * want + (-az / dist) * side * 10, tz = P.z - az / dist * want + (ax / dist) * side * 10;
    steer(e, tx, tz, d.speed, dt);
    aimTurret(e, P.x, P.z, dt);
    if (dist < d.range) tryFire(e, dt, P, P.x, 1, P.z);
    const far = e.raid ? dist > 75 : dist2(e.x, e.z, e.home.x, e.home.z) > 110 * 110 || dist > 95;
    if (far) e.mode = e.raid ? 'raid' : 'patrol';
  } else if (e.mode === 'raid') {
    const c = buildingTarget(e);
    if (!c) { e.mode = 'flee'; return; }
    const p = TB.Town.world(c.i, c.j);
    if (e.type === 'speedboat' && !e.deployed) {
      // rush the nearest deck edge and put boarders aboard
      const near = TB.Town.nearestCell(e.x, e.z), np = TB.Town.world(near.i, near.j);
      const dd = steer(e, np.x, np.z, d.speed, dt);
      if (dd < D.TILE / 2 + e.d.r + 1.5) deploy(e, near);
    } else {
      const dist = Math.sqrt(dist2(e.x, e.z, p.x, p.z));
      const want = d.range * 0.6;
      const k = dist > 0.1 ? want / dist : 0;
      const tx = p.x + (e.x - p.x) * k + Math.sin(t * 0.3 + e.ph) * 6, tz = p.z + (e.z - p.z) * k + Math.cos(t * 0.3 + e.ph) * 6;
      steer(e, tx, tz, d.speed * (dist > want + 10 ? 1 : 0.5), dt);
      aimTurret(e, p.x, p.z, dt);
      if (dist < d.range) tryFire(e, dt, null, p.x, D.DECK + 1.4, p.z);
    }
    if (P && pd2 < 30 * 30 && e.type !== 'gunboat') e.mode = 'attack';
    if (P && e.type === 'gunboat' && pd2 < d.range * d.range && Math.random() < dt * 0.3) { aimTurret(e, P.x, P.z, dt); tryFire(e, dt, P, P.x, 0.5, P.z); }
  } else if (e.mode === 'flee') {
    const ax = e.x, az = e.z, l = Math.hypot(ax, az) || 1;
    steer(e, ax / l * 400, az / l * 400, d.speed * 1.1, dt);
    if (l > 290 || (P && pd2 > 160 * 160 && l > 150)) { remove(e); }
  }
}
function deploy(e, cell) {
  e.deployed = true;
  const n = e.d.boarders || 2;
  const p = TB.Town.world(cell.i, cell.j);
  for (let i = 0; i < n; i++) {
    const b = spawn('boarder', p.x + rand(-1.2, 1.2), p.z + rand(-1.2, 1.2), { y: D.DECK, raid: true });
    b.cell = cell;
    TB.Fx.splash(b.x, b.z, 0.5);
  }
  TB.UI.toast('Raiders boarded the town!', 'danger');
  TB.Snd.play('alarm');
  e.mode = 'raid';
  e.d = Object.assign({}, e.d, { range: 30 });
}
function updateBoarder(e, dt, t) {
  // boarders loot for a while, then dive back into the sea
  if (e.mode === 'flee' || e.t > 55) { TB.Fx.splash(e.x, e.z, 0.6); remove(e); return; }
  const c = buildingTarget(e);
  if (!c) { e.mode = 'flee'; return; }
  const G = TB.G;
  if (c) {
    const p = TB.Town.world(c.i, c.j);
    const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
    if (dist > 2.2) {
      const s = e.d.speed * dt; e.x += dx / dist * s; e.z += dz / dist * s; e.h = Math.atan2(dx, dz); e.walk = true;
    } else {
      e.walk = false;
      e.cd -= dt;
      if (e.cd <= 0) { e.cd = 1 / e.d.rate; TB.Town.damage(c, e.d.dmg); TB.Snd.play('hit', { gap: 0.1 }); }
      e.stealT -= dt;
      if (e.stealT <= 0) {
        e.stealT = 2.5;
        const opts = ['wood', 'plastic', 'metal', 'food', 'water', 'coins', 'electronics'].filter(k => G.stock[k] >= 2);
        if (opts.length) { const k = U.pick(opts); G.stock[k] -= 2; G.stats.stolen = (G.stats.stolen || 0) + 2; TB.UI.floatText(e.x, 2.6, e.z, '-2 ' + D.RES[k].name.toLowerCase(), '#ff6a5a'); }
      }
    }
  }
  e.y = TB.Town.deckY(e.x, e.z, t);
  // a boarder knocked off the deck is done for
  if (!TB.Town.cellAt(e.x, e.z)) { kill(e, true); }
}
function updateSwimmer(e, dt, t) {
  if (e.mode === 'flee') { remove(e); return; }
  const c = buildingTarget(e);
  if (!c) { e.mode = 'flee'; remove(e); return; }
  const p = TB.Town.world(c.i, c.j);
  const dist = Math.sqrt(dist2(e.x, e.z, p.x, p.z));
  if (dist > D.TILE / 2 + 1.3) { steer(e, p.x, p.z, e.d.speed, dt, false); }
  else {
    e.cd -= dt;
    if (e.cd <= 0) { e.cd = 1 / e.d.rate; TB.Town.damage(c, e.d.dmg); if (Math.random() < 0.4) TB.UI.toast('Saboteur cutting the floats under your ' + D.B[c.b].name + '!', 'danger'); }
  }
  const P = TB.Boat.P;
  let seen = e.revealT > 0 || (P && dist2(e.x, e.z, P.x, P.z) < 24 * 24);
  if (!seen) for (const tc of TB.Town.buildings()) if (tc.b === 'watchtower' && tc.staffed > 0) { const w = TB.Town.world(tc.i, tc.j); if (dist2(e.x, e.z, w.x, w.z) < 32 * 32) { seen = true; break; } }
  e.hidden = !seen;
  e.revealT -= dt;
  e.y = -0.15;
  if (Math.random() < dt * 6) TB.Fx.bubbles(e.x, 0, e.z);
}
function updateShark(e, dt, t) {
  const P = playerTarget();
  e.retreatT -= dt;
  if (P && e.retreatT <= 0 && dist2(e.x, e.z, P.x, P.z) < 28 * 28) {
    steer(e, P.x, P.z, e.d.speed, dt, false);
    if (dist2(e.x, e.z, P.x, P.z) < (e.d.r + 2) ** 2) {
      TB.Boat.hurt(e.d.dmg, e); TB.Fx.splash(e.x, e.z, 1); e.retreatT = 3.5;
      TB.UI.floatText(P.x, 2, P.z, 'CHOMP', '#ff6a5a');
    }
  } else if (e.retreatT > 0 && P) {
    steer(e, e.x + (e.x - P.x), e.z + (e.z - P.z), e.d.speed * 0.8, dt, false);
  } else {
    const a = t * 0.4 + e.ph;
    steer(e, e.home.x + Math.cos(a) * 14, e.home.z + Math.sin(a) * 14, e.d.speed * 0.5, dt, false);
    if (dist2(e.x, e.z, e.home.x, e.home.z) > 120 * 120) remove(e);
  }
  const tail = e.obj.userData.nodes.tail; if (tail) tail.rotation.y = Math.sin(t * 8 + e.ph) * 0.4;
}
function updateTower(e, dt) {
  const P = playerTarget();
  if (P && inRange(e, P.x, P.z)) { aimTurret(e, P.x, P.z, dt); e.h = 0; tryFire(e, dt, P, P.x, 1, P.z); }
}
function updateBoss(e, dt, t) {
  const P = playerTarget();
  const c = buildingTarget(e);
  const goal = c ? TB.Town.world(c.i, c.j) : { x: 0, z: 0 };
  const dist = Math.sqrt(dist2(e.x, e.z, goal.x, goal.z));
  const k = dist > 0.1 ? 42 / dist : 0;
  steer(e, goal.x + (e.x - goal.x) * k, goal.z + (e.z - goal.z) * k, e.d.speed, dt);
  // main guns: the player if close, else the town
  const pd = P ? Math.sqrt(dist2(e.x, e.z, P.x, P.z)) : 1e9;
  if (P && pd < e.d.range) { aimTurret(e, P.x, P.z, dt); tryFire(e, dt, P, P.x, 0.5, P.z); }
  else if (c && dist < e.d.range) { aimTurret(e, goal.x, goal.z, dt); tryFire(e, dt, null, goal.x, D.DECK + 1, goal.z); }
  // rear machine gun: bursts at the player
  e.cd2 = (e.cd2 || 0) - dt;
  if (P && pd < 40 && e.cd2 <= 0) {
    e.cd2 = 0.12; e.mg = (e.mg || 0) + 1; if (e.mg % 6 === 0) e.cd2 = 1.6;
    aimTurret(e, P.x, P.z, dt, 'turret2');
    const v = _v.w, m = e.obj.userData.nodes.muzzle2; if (m) m.getWorldPosition(v); else v.set(e.x, 3, e.z);
    fire({ team: 'enemy', kind: 'bullet', x: v.x, y: v.y, z: v.z, tgt: P, dmg: 5, speed: 60, range: 50, spread: 0.08 });
    TB.Snd.play('enemyGun', { gap: 0.05 });
  }
  // escorts
  e.spawnT -= dt;
  if (e.spawnT <= 0) { e.spawnT = 26; if (aliveCount(f => f.type === 'skiff' && f.raid) < 4) for (let i = 0; i < 2; i++) spawn('skiff', e.x + rand(-8, 8), e.z + rand(-8, 8), { raid: true, mode: 'attack' }); }
  const sm = e.obj.userData.nodes.smoke; if (sm && Math.random() < dt * 6) { sm.getWorldPosition(_v.w); TB.Fx.smoke(_v.w.x, _v.w.y, _v.w.z, 1.5); }
}

function updateEnemies(dt, t) {
  for (let i = A.list.length - 1; i >= 0; i--) {
    const e = A.list[i];
    if (!e.alive) {
      // sinking wreck
      e.sinkT -= dt;
      e.obj.position.y -= dt * 1.2; e.obj.rotation.z += dt * 0.5;
      if (Math.random() < dt * 5) TB.Fx.bubbles(e.x, 0, e.z);
      if (e.sinkT <= 0) { TB.Models.release(e.obj); e.obj.removeFromParent(); A.list.splice(i, 1); }
      continue;
    }
    e.t += dt; e.hurtT -= dt;
    switch (e.type) {
      case 'boarder': updateBoarder(e, dt, t); break;
      case 'swimmer': updateSwimmer(e, dt, t); break;
      case 'shark': updateShark(e, dt, t); break;
      case 'tower': updateTower(e, dt); break;
      case 'boss': updateBoss(e, dt, t); break;
      default: updateBoatEnemy(e, dt, t);
    }
    if (!e.alive || !A.list.includes(e)) continue;
    const o = e.obj;
    if (e.d.onDeck || e.type === 'boarder') {
      o.position.set(e.x, e.y, e.z); o.rotation.y = e.h;
      if (!o.userData.glb) o.rotation.z = e.walk ? Math.sin(e.t * 10) * 0.12 : 0; else TB.Models.play(o, e.walk ? 'walk' : 'attack');
    } else if (e.type === 'tower') {
      o.position.y = 1.2 + TB.U.wave(e.x, e.z, t) * 0.15;
    } else {
      const y = e.type === 'shark' ? -0.15 + Math.sin(t * 2 + e.ph) * 0.1 : e.type === 'swimmer' ? -0.1 : wave(e.x, e.z, t);
      o.position.set(e.x, y, e.z);
      o.rotation.set(0, 0, 0); o.rotation.order = 'YXZ'; o.rotation.y = e.h;
      o.rotation.x = -e.spd * 0.01 + Math.sin(t * 1.3 + e.ph) * 0.03; o.rotation.z = Math.cos(t * 1.1 + e.ph) * 0.04;
      if (e.type !== 'shark' && e.type !== 'swimmer' && e.spd > 2 && Math.random() < dt * 14) {
        const sx = e.x - Math.sin(e.h) * e.d.r * 1.3, sz = e.z - Math.cos(e.h) * e.d.r * 1.3;
        TB.Fx.foam(sx, sz, 0.4 + e.d.r * 0.15, 1.3, 2.2);
      }
    }
    o.visible = !e.hidden;
  }
}
function damage(e, dmg, from) {
  if (!e.alive) return;
  e.hp -= dmg; e.hurtT = 0.15;
  if (e.mode === 'patrol' || (e.mode === 'raid' && from === 'player' && e.type !== 'gunboat' && !e.d.boss && Math.random() < 0.3)) e.mode = 'attack';
  if (e.hp <= 0) kill(e);
}
function kill(e, quiet) {
  if (!e.alive) return;
  e.alive = false;
  const G = TB.G, d = e.d;
  G.stats.kills = (G.stats.kills || 0) + 1;
  G.score = (G.score || 0) + d.score;
  if (e.type === 'boarder' || e.type === 'swimmer') {
    e.sinkT = 0.01; TB.Fx.splash(e.x, e.z, 0.6);
  } else {
    e.sinkT = d.boss ? 5 : 2.2;
    TB.Fx.explode(e.x, e.y + 1, e.z, d.boss ? 3 : e.type === 'tower' ? 1.5 : 1 + d.r * 0.2);
    TB.Snd.play(d.r > 2 ? 'boom' : 'smallBoom');
    TB.Gfx.cam.shake = Math.max(TB.Gfx.cam.shake, d.boss ? 1.2 : 0.35);
  }
  if (!quiet && d.loot && Object.keys(d.loot).length) {
    const give = {}; for (const [k, v] of Object.entries(d.loot)) give[k] = Math.max(1, Math.round(v * rand(0.7, 1.3)));
    if (e.type === 'tower' || d.boss) TB.World.drop(e.x + rand(-3, 3), e.z + rand(-3, 3), give);
    else if (e.type === 'boarder') { /* boarders drop nothing into the sea */ }
    else TB.World.drop(e.x, e.z, give);
  }
  if (e.outpost) TB.World.outpostGunDown(e.outpost);
  if (d.boss) { G.stats.boss = (G.stats.boss || 0) + 1; G.stats.bosses = (G.stats.bosses || 0) + 1; TB.UI.banner('Flagship sunk!', 'The Iron Fleet will think twice', 'star'); TB.Snd.play('chapter'); }
  TB.emit('kill', e);
}
function remove(e) { e.alive = false; e.sinkT = 0; TB.Models.release(e.obj); e.obj.removeFromParent(); const i = A.list.indexOf(e); if (i >= 0) A.list.splice(i, 1); }

// ============================================================ projectiles
function fire(o) {
  const s = { team: o.team, kind: o.kind, x: o.x, y: o.y, z: o.z, px: o.x, pz: o.z, dmg: o.dmg, t: 0, tgt: o.tgt || null, home: !!o.home, obj: null };
  let tx, ty, tz;
  if (o.tgt) {
    const g = o.tgt, dd = Math.sqrt(dist2(o.x, o.z, g.x, g.z)), lt = dd / o.speed;
    tx = g.x + (g.vx || 0) * lt; tz = g.z + (g.vz || 0) * lt; ty = targetY(g);
  } else if (o.at) { tx = o.at.x; ty = o.at.y; tz = o.at.z; }
  else { const r = o.range || 50; tx = o.x + Math.sin(o.yaw) * r; tz = o.z + Math.cos(o.yaw) * r; ty = 0.4; }
  if (o.kind === 'shell') {
    const dd = Math.sqrt(dist2(o.x, o.z, tx, tz)), T = Math.max(0.7, dd / o.speed), g = 20;
    s.vx = (tx - o.x) / T; s.vz = (tz - o.z) / T; s.vy = (ty - o.y + 0.5 * g * T * T) / T; s.T = T; s.g = g; s.ty = ty;
    s.obj = TB.Models.make('proj_shell'); s.obj.layers.set(1); s.obj.traverse(m => m.layers.set(1)); root.add(s.obj);
  } else {
    let dx = tx - o.x, dy = ty - o.y, dz = tz - o.z; const l = Math.hypot(dx, dy, dz) || 1;
    const sp = o.spread || 0;
    dx = dx / l + rand(-sp, sp); dy = dy / l + rand(-sp, sp) * 0.5; dz = dz / l + rand(-sp, sp);
    const l2 = Math.hypot(dx, dy, dz);
    s.vx = dx / l2 * o.speed; s.vy = dy / l2 * o.speed; s.vz = dz / l2 * o.speed;
    s.life = (o.range || 60) / o.speed * 1.15;
    s.speed = o.speed;
    if (o.kind === 'harpoon') { s.obj = TB.Models.make('proj_harpoon'); root.add(s.obj); }
  }
  A.shots.push(s);
  return s;
}
function targetY(g) {
  if (g === TB.Boat.P) return 0.9;
  if (g.d) { if (g.type === 'boarder') return g.y + 0.9; if (g.type === 'tower') return 2.0; if (g.type === 'swimmer' || g.type === 'shark') return 0; return 0.9 + g.d.r * 0.2; }
  return 1;
}
function segHit(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? clamp(((cx - ax) * dx + (cz - az) * dz) / L2, 0, 1) : 0;
  return dist2(ax + dx * t, az + dz * t, cx, cz) < r * r;
}
function blockedBy(s) {
  for (const o of TB.World.obstacles) if (o.kind !== 'outpost' && s.y < 8 && segHit(s.px, s.pz, s.x, s.z, o.x, o.z, o.r * 0.85)) return true;
  return false;
}
function splash(s) {
  const r = 4.2;
  TB.Fx.explode(s.x, Math.max(0.2, s.y), s.z, 1);
  TB.Snd.play('smallBoom');
  if (s.team === 'enemy') {
    const P = TB.Boat.P;
    if (P && P.alive && dist2(P.x, P.z, s.x, s.z) < r * r) TB.Boat.hurt(s.dmg);
    const c = TB.Town.cellAt(s.x, s.z) || (() => { const n = TB.Town.nearestBuilding(s.x, s.z); if (!n) return null; const p = TB.Town.world(n.i, n.j); return dist2(p.x, p.z, s.x, s.z) < r * r ? n : null; })();
    if (c) TB.Town.damage(c, s.dmg);
  } else {
    for (const e of A.list) if (e.alive && dist2(e.x, e.z, s.x, s.z) < r * r) damage(e, s.dmg, s.team);
  }
}
function updateShots(dt) {
  const P = TB.Boat.P;
  let n = 0;
  const m4 = _v.m4, q = _v.q, e3 = _v.e, sc = _v.s, pv = _v.p, col = _v.c;
  for (let i = A.shots.length - 1; i >= 0; i--) {
    const s = A.shots[i];
    s.t += dt; s.px = s.x; s.pz = s.z;
    let dead = false;
    if (s.kind === 'shell') {
      s.vy -= s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.t >= s.T || s.y <= s.ty - 0.2) { splash(s); dead = true; }
    } else {
      if (s.kind === 'harpoon' && s.home && s.tgt && s.tgt.alive !== false) {
        const g = s.tgt, sp = s.speed;
        const want = Math.atan2(g.x - s.x, g.z - s.z), cur = Math.atan2(s.vx, s.vz);
        const na = cur + clamp(angDiff(cur, want), -2.8 * dt, 2.8 * dt);
        const hs = Math.hypot(s.vx, s.vz);
        s.vx = Math.sin(na) * hs; s.vz = Math.cos(na) * hs;
        s.vy = U.damp(s.vy, (targetY(g) - s.y) * 3, 4, dt);
        void sp;
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.life -= dt;
      if (s.life <= 0 || s.y < -0.3) { if (s.y < 0.3) TB.Fx.splash(s.x, s.z, s.kind === 'harpoon' ? 0.6 : 0.25); dead = true; }
      else if (blockedBy(s)) { TB.Fx.sparks(s.x, s.y, s.z); dead = true; }
      else if (s.team === 'enemy') {
        if (P && P.alive && s.y < 3 && segHit(s.px, s.pz, s.x, s.z, P.x, P.z, 1.7)) { TB.Boat.hurt(s.dmg); TB.Fx.sparks(s.x, s.y, s.z); dead = true; }
        else {
          const c = TB.Town.cellAt(s.x, s.z);
          // small arms barely scratch buildings; shells, boarders and saboteurs are the real threat
          if (c && c.b && !c.ruined && s.y < D.DECK + 4) { TB.Town.damage(c, s.dmg * 0.3); dead = true; }
          else if (c && s.y < D.DECK) { TB.Fx.sparks(s.x, D.DECK, s.z); dead = true; }
        }
      } else {
        for (const e of A.list) {
          if (!e.alive || e.hidden) continue;
          const hr = e.d.r + (s.kind === 'harpoon' ? 0.8 : 0.45);
          if (Math.abs(s.y - targetY(e)) > 2.5 + e.d.r * 0.4) continue;
          if (segHit(s.px, s.pz, s.x, s.z, e.x, e.z, hr)) {
            damage(e, s.dmg, s.team);
            TB.Fx.sparks(s.x, s.y, s.z); TB.Snd.play('hit', { gap: 0.05 });
            if (s.kind === 'harpoon') { TB.Fx.splash(s.x, s.z, 0.5); TB.Gfx.cam.shake = Math.max(TB.Gfx.cam.shake, 0.25); }
            dead = true; break;
          }
        }
      }
    }
    if (dead) { if (s.obj) s.obj.removeFromParent(); A.shots.splice(i, 1); continue; }
    if (s.obj) {
      s.obj.position.set(s.x, s.y, s.z);
      s.obj.rotation.order = 'YXZ'; s.obj.rotation.y = Math.atan2(s.vx, s.vz); s.obj.rotation.x = -Math.atan2(s.vy, Math.hypot(s.vx, s.vz));
    } else if (n < 500) {
      e3.set(-Math.atan2(s.vy, Math.hypot(s.vx, s.vz)), Math.atan2(s.vx, s.vz), 0); q.setFromEuler(e3); pv.set(s.x, s.y, s.z);
      m4.compose(pv, q, sc); bulletMesh.setMatrixAt(n, m4);
      col.set(s.team === 'enemy' ? '#ff6a3a' : s.team === 'town' ? '#a8ffda' : '#fff27a'); bulletMesh.setColorAt(n, col);
      n++;
    }
  }
  bulletMesh.count = n; bulletMesh.instanceMatrix.needsUpdate = true; if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;
}

// ============================================================ friendly ships
function moorPoint() {
  const tr = TB.Town.buildings().find(c => c.b === 'trader');
  if (tr) {
    for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      if (TB.Town.get(tr.i + a, tr.j + b)) continue;
      const p = TB.Town.world(tr.i, tr.j);
      return { x: p.x + a * (D.TILE / 2 + 3.4), z: p.z + b * (D.TILE / 2 + 3.4), h: a ? 0 : Math.PI / 2 };
    }
  }
  return { x: 12, z: 26, h: 0 };
}
function spawnNPC(kind, o = {}) {
  const a = Math.PI / 2 + rand(-0.5, 0.5), d = 230;
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  const obj = TB.Models.make(kind === 'merchant' ? 'merchant_ship' : 'migrant_raft');
  root.add(obj);
  const npc = { kind, x, z, h: Math.atan2(-x, -z), spd: 0, obj, state: 'arrive', t: 0, n: o.n || 0, d: { r: kind === 'merchant' ? 3.5 : 2, turn: 0.8 }, name: o.name || '' };
  A.npcs.push(npc);
  return npc;
}
function updateNPCs(dt, t) {
  const G = TB.G;
  for (let i = A.npcs.length - 1; i >= 0; i--) {
    const n = A.npcs[i];
    n.t += dt;
    let goal, spd = n.kind === 'merchant' ? 7 : 6;
    if (n.state === 'arrive') {
      goal = n.kind === 'merchant' ? moorPoint() : { x: D.DOCK.x - 6, z: D.DOCK.z + 4 };
      const dd = Math.sqrt(dist2(n.x, n.z, goal.x, goal.z));
      if (dd < 3) {
        if (n.kind === 'merchant') { n.state = 'moored'; n.t = 0; TB.emit('merchantArrived', n); }
        else { G.pop += n.n; TB.Town.recompute(); TB.UI.toast(`${n.n} settler${n.n > 1 ? 's' : ''} moved in, drawn by your town's reputation`, 'good'); TB.Snd.play('rescue'); TB.emit('migrants', n.n); n.state = 'leave'; n.goneT = 0; }
        spd = 0;
      }
      if (dd < 25) spd *= clamp(dd / 25, 0.2, 1);
    } else if (n.state === 'moored') {
      goal = moorPoint(); spd = 0;
      n.h += angDiff(n.h, goal.h) * Math.min(1, dt);
      n.x = U.damp(n.x, goal.x, 1, dt); n.z = U.damp(n.z, goal.z, 1, dt);
      if (n.t > 80 && !TB.UI.tradeOpen()) { n.state = 'leave'; TB.emit('merchantLeft', n); TB.UI.toast(n.name + ' sets sail. Next visit in about a day.', 'info'); }
    } else {
      if (n.kind === 'migrant') { n.goneT += dt; n.obj.position.y -= dt * 0.4; if (n.goneT > 2.5) { n.obj.removeFromParent(); A.npcs.splice(i, 1); } continue; }
      goal = { x: n.x * 3 + 1, z: Math.abs(n.z) * 3 + 200 };
      if (Math.hypot(n.x, n.z) > 250) { n.obj.removeFromParent(); A.npcs.splice(i, 1); continue; }
    }
    if (spd > 0) {
      let dx = goal.x - n.x, dz = goal.z - n.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (const o of TB.World.obstacles) { const ox = n.x - o.x, oz = n.z - o.z, dd = Math.hypot(ox, oz) || 1, rr = o.r + n.d.r + 8; if (dd < rr) { const k = (rr - dd) / rr * 2.4; dx += ox / dd * k; dz += oz / dd * k; } }
      const th = Math.atan2(dx, dz); n.h += clamp(angDiff(n.h, th), -n.d.turn * dt, n.d.turn * dt);
      n.spd = approach(n.spd, spd, 4 * dt);
      n.x += Math.sin(n.h) * n.spd * dt; n.z += Math.cos(n.h) * n.spd * dt;
      TB.World.collide(n, n.d.r);
      if (Math.random() < dt * 10) TB.Fx.foam(n.x - Math.sin(n.h) * n.d.r * 2, n.z - Math.cos(n.h) * n.d.r * 2, 0.6, 1.5, 2.2);
    }
    const o = n.obj;
    o.position.x = n.x; o.position.z = n.z; if (n.state !== 'leave' || n.kind === 'merchant') o.position.y = wave(n.x, n.z, t);
    o.rotation.set(0, 0, 0); o.rotation.order = 'YXZ'; o.rotation.y = n.h; o.rotation.z = Math.sin(t * 0.9 + i) * 0.035; o.rotation.x = Math.cos(t * 0.8) * 0.02;
    const sail = o.userData.nodes.sail; if (sail) sail.rotation.y = Math.sin(t * 0.7) * 0.12;
  }
}
function merchant() { return A.npcs.find(n => n.kind === 'merchant' && n.state === 'moored') || null; }

// ============================================================ director
// raids, merchants and settlers arriving
function raidsEnabled() {
  const G = TB.G;
  if (G.peaceful) return false;
  if (G.mode === 'endless') return G.day >= 3 || G.t > D.DAY_LEN * 2.2;
  return G.chapter > 5 || (G.chapter === 5 && TB.Town.count('watchtower') > 0) || G.campaignDone;
}
function scheduleRaid(delay) {
  const G = TB.G, gap = D.DIFF[G.diff].raidGap;
  G.raid.next = G.t + (delay != null ? delay : D.DAY_LEN * rand(1.1, 1.6) * gap * (G.mode === 'endless' ? 0.9 : 1.15));
  G.raid.state = 'idle';
}
function warnTime() { return 35 + (TB.Town.count('watchtower') ? 25 : 0) + (TB.Town.count('radio') ? 10 : 0); }
function wealth() { const s = TB.G.stock; return s.wood + s.plastic + s.metal * 2 + s.electronics * 5 + s.coins; }
function launchRaid(boss) {
  const G = TB.G, R = G.raid;
  const a = R.dir;
  const first = !(G.stats.raids_repelled || 0) && !boss;
  let budget = first ? 3 : (2.5 + G.day * 0.65 + G.pop * 0.12 + wealth() / 280) * (G.diff === 'hard' ? 1.25 : G.diff === 'easy' ? 0.8 : 1);
  budget = Math.min(budget, 34);
  const spots = [];
  const put = (type, dist = 215) => { const aa = a + rand(-0.4, 0.4), d = dist + rand(-15, 15); spots.push([type, Math.cos(aa) * d, Math.sin(aa) * d]); };
  if (boss) { put('boss', 200); budget *= 0.5; }
  if (first) { put('skiff'); put('skiff'); put('speedboat'); }
  else while (budget > 0) {
    const r = Math.random();
    if (budget >= 4 && G.day >= 4 && r < 0.25) { put('gunboat'); budget -= 4; }
    else if (budget >= 2 && r < 0.55) { put('speedboat'); budget -= 2; }
    else if (G.day >= 3 && r < 0.72) { put('swimmer', 110); budget -= 1; }
    else { put('skiff'); budget -= 1; }
  }
  for (const [type, x, z] of spots) { const e = spawn(type, x, z, { raid: true, mode: 'raid' }); e.h = Math.atan2(-x, -z); if (type === 'boss') e.spawnT = 20; }
  R.state = 'active'; R.boss = !!boss; R.t = 0; R.fled = false;
  TB.Town.alarm = true;
  TB.UI.banner(boss ? 'The Iron Fleet attacks!' : 'Red Wake raid!', boss ? 'Sink the flagship before it shells the town' : 'Defend the town', 'raider');
  TB.Snd.play('horn');
  TB.emit('raidStart');
}
function dirName(a) {
  const x = Math.cos(a), z = Math.sin(a);
  return (z < -0.38 ? 'north' : z > 0.38 ? 'south' : '') + (x > 0.38 ? (Math.abs(z) > 0.38 ? '-east' : 'east') : x < -0.38 ? (Math.abs(z) > 0.38 ? '-west' : 'west') : '');
}
function updateDirector(dt) {
  const G = TB.G, R = G.raid;
  R.t = (R.t || 0) + dt;
  // ---- raids
  if (R.state === 'idle' && raidsEnabled()) {
    if (!R.next) scheduleRaid(G.mode === 'endless' ? D.DAY_LEN * 0.6 : 40);
    const bossDue = (G.mode === 'campaign' && G.chapter === 7 && G.pop >= 12 && !(G.stats.boss > 0)) || (G.mode === 'endless' && G.day >= 10 && G.day >= (R.lastBossDay || 0) + 10);
    if (bossDue && R.next - G.t > 50) R.next = G.t + 50;
    if (G.t >= R.next - warnTime()) {
      R.state = 'warning'; R.dir = rand(0, TAU); R.bossNext = bossDue;
      if (bossDue) R.lastBossDay = G.day;
      TB.UI.toast(`${R.bossNext ? 'Iron Fleet flagship' : 'Red Wake boats'} sighted to the ${dirName(R.dir)}! Prepare your defenses.`, 'danger', 6);
      TB.Snd.play('alarm');
    }
  } else if (R.state === 'warning') {
    if (G.t >= R.next) launchRaid(R.bossNext);
  } else if (R.state === 'active') {
    // raiders don't besiege forever: after a while they take what they have and leave
    if (!R.fled && !R.boss && R.t > 110) {
      R.fled = true;
      for (const e of A.list) if (e.alive && e.raid) e.mode = 'flee';
      TB.UI.toast('The Red Wake is pulling back with their loot', 'warn');
    }
    const left = aliveCount(e => e.raid);
    if (!left) {
      TB.Town.alarm = false;
      if (R.fled) TB.UI.toast('The raiders are gone. Next time, sink them before they escape!', 'info', 5);
      else {
        G.stats.raids_repelled = (G.stats.raids_repelled || 0) + 1; G.stats.raids = G.stats.raids_repelled;
        G.rep += 6;
        TB.UI.banner('Raid repelled!', 'The town is safe — for now', 'star');
        TB.Snd.play('chapter');
      }
      R.fled = false;
      TB.emit('raidEnd');
      scheduleRaid();
    }
  }
  G.raidPenalty = Math.max(0, (G.raidPenalty || 0) - dt * 0.08);
  // ---- merchant
  const M = G.merchant;
  if (TB.Town.count('trader')) {
    if (!M.next) M.next = G.t + 25;
    if (G.t >= M.next && !A.npcs.some(n => n.kind === 'merchant')) {
      const name = U.pick(D.MERCHANT_NAMES);
      spawnNPC('merchant', { name: G.stats.trades ? name : 'The Blue Gull' });
      M.next = G.t + D.DAY_LEN * rand(1.2, 1.7);
      M.offers = makeOffers();
      TB.UI.toast(`${G.stats.trades ? name : 'The Blue Gull'} is sailing in to trade`, 'info');
    }
  }
  // ---- settlers attracted by the town
  G.migrantT = (G.migrantT || D.DAY_LEN * 0.4) - dt;
  if (G.migrantT <= 0) {
    G.migrantT = D.DAY_LEN * rand(0.35, 0.55);
    const E = TB.Town.econ, free = E.beds - G.pop;
    const band = E.attract >= 80 ? 0.9 : E.attract >= 60 ? 0.65 : E.attract >= 40 ? 0.35 : 0.1;
    if (free > 0 && Math.random() < band && !A.npcs.some(n => n.kind === 'migrant')) {
      const n = Math.min(free, randi(1, E.attract >= 80 ? 3 : 2) + (TB.Town.count('radio') ? 1 : 0));
      spawnNPC('migrant', { n });
      TB.UI.toast(`A raft with ${n} settler${n > 1 ? 's' : ''} is heading for your town`, 'info');
    } else if (free <= 0 && E.attract >= 50 && Math.random() < 0.4) TB.UI.toast('Settlers want to join, but there are no free beds', 'warn');
  }
}
function makeOffers() {
  const G = TB.G;
  const pool = D.TRADES.filter(t => t.kind !== 'blueprint');
  const out = [];
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  for (const t of shuffled.slice(0, 6)) out.push(Object.assign({}, t, { stock: t.stock }));
  const locked = D.BLUEPRINTS.filter(b => !G.unlocked.includes(b));
  if (locked.length && Math.random() < 0.7) out.push({ kind: 'blueprint', b: U.pick(locked), price: 50 + locked.length * 2, stock: 1 });
  return out;
}

function update(dt, t) {
  updateEnemies(dt, t);
  updateShots(dt);
  updateNPCs(dt, t);
  updateDirector(dt);
}
function clearAll() { init(); }
TB.U.extend(A, { init, spawn, findTarget, nearestEnemy, fire, update, kill, damage, remove, merchant, scheduleRaid, raidsEnabled, aliveCount, dirName, makeOffers, clearAll, spawnNPC,
  get raidActive() { return TB.G && TB.G.raid.state === 'active'; } });
})();
