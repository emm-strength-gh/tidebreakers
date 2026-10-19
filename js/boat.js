'use strict';
/* =====================================================================
   TIDEBREAKERS — the player's salvage boat
   Steer with the stick / WASD (screen relative). Hold GUN to fire the deck
   gun (auto-aims), HARPOON for heavy shots, E to lower the salvage net,
   stop beside castaways to pick them up, stop over bubbles and press E to
   dive, and sail into the dock to unload, refuel, repair and rearm.
   ===================================================================== */
(() => {
const D = TB.D, U = TB.U;
const { clamp, rand, dist2, wave, angDiff, approach, damp } = U;
let THREE;
const V = k => D.UPG[k].vals[TB.G.upg[k]];
const B = TB.Boat = { P: null };
const _v = {};

function spawn(atDock = true) {
  THREE = window.THREE;
  if (B.P && B.P.obj) { B.P.obj.removeFromParent(); if (B.P.diver) B.P.diver.removeFromParent(); }
  const obj = TB.Models.make('boat_player');
  TB.Gfx.scene.add(obj);
  const n = obj.userData.nodes;
  if (n.netbag) n.netbag.visible = false;
  const P = B.P = {
    x: D.DOCK.x, z: D.DOCK.z + 2, h: Math.PI, spd: 0, vx: 0, vz: 0, turnV: 0,
    hp: V('hull'), fuel: V('tank'), cargo: {}, load: 0, passengers: 0, harpoons: V('harpoon'),
    net: false, docked: false, dive: null, gunCD: 0, harpCD: 0, sonarCD: 0, sonarT: 0, alive: true, deadT: 0,
    obj, roll: 0, pitch: 0, wakeT: 0, hurtT: 0, hintT: 0, fullT: 0, aimYaw: 0, target: null, collideT: 0,
  };
  if (!atDock) { P.z = D.DOCK.z + 10; }
  return P;
}
function load(s) {
  const P = spawn(true);
  Object.assign(P, { x: s.x, z: s.z, h: s.h, hp: s.hp, fuel: s.fuel, cargo: s.cargo || {}, passengers: s.passengers || 0, harpoons: s.harpoons });
  P.load = Object.values(P.cargo).reduce((a, b) => a + b, 0);
  if (P.hp <= 0) P.hp = V('hull');
}
function save() { const P = B.P; return { x: P.x, z: P.z, h: P.h, hp: Math.round(P.hp), fuel: Math.round(P.fuel), cargo: P.cargo, passengers: P.passengers, harpoons: P.harpoons }; }

function stern(P, k = 3.2) { return { x: P.x - Math.sin(P.h) * k, z: P.z - Math.cos(P.h) * k }; }

// ------------------------------------------------------------ update
function update(dt, IN, t) {
  const P = B.P, G = TB.G;
  if (!P) return;
  if (!P.alive) {
    P.deadT -= dt;
    P.obj.position.y -= dt * 0.8; P.obj.rotation.z += dt * 0.4;
    if (Math.random() < dt * 8) TB.Fx.bubbles(P.x + rand(-1, 1), 0, P.z + rand(-1, 1));
    if (P.deadT <= 0) respawn();
    return;
  }
  P.gunCD -= dt; P.harpCD -= dt; P.sonarCD -= dt; P.sonarT -= dt; P.hurtT -= dt; P.hintT -= dt; P.fullT -= dt; P.collideT -= dt;

  // ---- steering
  const max = V('engine') * (P.fuel > 0 ? 1 : 0.38) * (P.net ? 0.62 : 1) * (P.dive ? 0 : 1);
  const mag = Math.min(1, Math.hypot(IN.mx, IN.mz));
  if (mag > 0.12 && !P.dive) {
    const th = Math.atan2(IN.mx, IN.mz), dh = angDiff(P.h, th);
    const turn = 2.3 * (0.55 + 0.45 * clamp(P.spd / 8, 0, 1));
    P.turnV = clamp(dh * 6, -turn, turn);
    const throttle = mag * clamp(Math.cos(dh) * 1.3, 0.12, 1);
    P.spd = approach(P.spd, max * throttle, (P.spd < max * throttle ? 9 : 6) * dt);
  } else {
    P.turnV = damp(P.turnV, 0, 6, dt);
    P.spd = approach(P.spd, 0, 7 * dt);
  }
  P.h += P.turnV * dt;
  const fx = Math.sin(P.h), fz = Math.cos(P.h);
  P.vx = damp(P.vx, fx * P.spd, 3.5, dt); P.vz = damp(P.vz, fz * P.spd, 3.5, dt);
  P.x += P.vx * dt; P.z += P.vz * dt;
  if (P.fuel > 0) P.fuel = Math.max(0, P.fuel - (P.spd / Math.max(1, V('engine'))) * dt * 0.62);
  if (P.fuel <= 0 && P.hintT <= 0 && P.spd > 1) { P.hintT = 8; TB.UI.toast('Out of fuel — rowing home. Fuel comes from salvage and merchants.', 'warn'); }

  // ---- collisions
  const px = P.x, pz = P.z;
  const hitW = TB.World.collide(P, 1.6), hitT = TB.Town.collideBoat(P, 1.5);
  if (hitW || hitT) {
    const lost = Math.hypot(P.x - px, P.z - pz) / Math.max(dt, 1e-3);
    if (P.spd > 9 && P.collideT <= 0) { P.collideT = 0.8; hurt(2, null, true); TB.Fx.splash(P.x + fx * 2, P.z + fz * 2, 0.8); TB.Gfx.cam.shake = 0.5; }
    P.spd *= 0.6; P.vx *= 0.6; P.vz *= 0.6; void lost;
  }
  const r = Math.hypot(P.x, P.z);
  if (r > D.WORLD_R) {
    P.x *= D.WORLD_R / r; P.z *= D.WORLD_R / r;
    if (P.hintT <= 0) { P.hintT = 5; TB.UI.toast('Nothing but open sea out there. Turn back.', 'warn'); }
  }

  // ---- visuals: bobbing, roll, wake
  const y = wave(P.x, P.z, t);
  const sx = wave(P.x + 1, P.z, t) - wave(P.x - 1, P.z, t), sz = wave(P.x, P.z + 1, t) - wave(P.x, P.z - 1, t);
  P.roll = damp(P.roll, -P.turnV * 0.09 * clamp(P.spd / 8, 0, 1.2) + (sx * fz - sz * fx) * 0.35, 5, dt);
  P.pitch = damp(P.pitch, -P.spd * 0.008 - (sx * fx + sz * fz) * 0.35, 4, dt);
  const o = P.obj;
  o.position.set(P.x, y, P.z);
  o.rotation.set(0, 0, 0); o.rotation.order = 'YXZ'; o.rotation.y = P.h; o.rotation.x = P.pitch; o.rotation.z = P.roll;
  P.wakeT -= dt;
  if (P.spd > 2 && P.wakeT <= 0) {
    P.wakeT = 0.05;
    const s = stern(P, 2.6), side = 0.9;
    TB.Fx.foam(s.x + fz * side, s.z - fx * side, 0.45 + P.spd * 0.03, 1.6, 2.4);
    TB.Fx.foam(s.x - fz * side, s.z + fx * side, 0.45 + P.spd * 0.03, 1.6, 2.4);
    if (P.spd > 8 && Math.random() < 0.5) TB.Fx.puff(P.x + fx * 2.8, 0.3, P.z + fz * 2.8, { vx: fz * rand(-3, 3), vy: 2.5, vz: -fx * rand(-3, 3), life: 0.5, size: 0.3, end: 0.05, color: '#eafcff', grav: 12, drag: 0.5 });
  }
  const n = o.userData.nodes;
  if (n.flag) n.flag.rotation.y = Math.sin(t * 5) * 0.25 + 0.2;
  if (n.netbag) n.netbag.visible = P.net;

  // ---- weapons
  const range = 44;
  P.target = TB.Actors.findTarget(P.x, P.z, P.h, range, 1.3);
  const aimAt = P.target ? Math.atan2(P.target.x - P.x, P.target.z - P.z) : P.h;
  P.aimYaw = P.aimYaw + angDiff(P.aimYaw, aimAt) * Math.min(1, dt * 10);
  if (n.turret) n.turret.rotation.y = angDiff(P.h, P.aimYaw);
  if (IN.fire && P.gunCD <= 0 && !P.dive) fireGun(P);
  if (IN.harpoon && P.harpCD <= 0 && !P.dive) fireHarpoon(P);
  if (IN.sonar && P.sonarCD <= 0) sonar(P);

  // ---- net, rescue, dive, dock
  if (IN.action) action(P);
  if (P.net) netCatch(P);
  rescue(P);
  if (P.dive) updateDive(P, dt, t);
  dock(P, dt);
}

function action(P) {
  // stopped over a wreck → dive; otherwise toggle the net
  const site = nearDive(P);
  if (site && !P.dive) {
    if (P.spd > 3) { TB.UI.toast('Slow down to dive here', 'info'); return; }
    startDive(P, site); return;
  }
  if (P.dive) { cancelDive(P, 'Dive called off'); return; }
  P.net = !P.net;
  TB.Snd.play('netOn');
  TB.Fx.splash(stern(P).x, stern(P).z, 0.7);
  TB.emit('net', P.net);
}
function nearDive(P) { for (const d of TB.World.dives) if (dist2(P.x, P.z, d.x, d.z) < 7.5 * 7.5) return d; return null; }

function fireGun(P) {
  const v = _v.a || (_v.a = new THREE.Vector3());
  const m = P.obj.userData.nodes.muzzle;
  if (m) m.getWorldPosition(v); else v.set(P.x + Math.sin(P.h) * 2.5, 1.4, P.z + Math.cos(P.h) * 2.5);
  const barrels = V('barrels');
  for (let i = 0; i < barrels; i++) {
    const side = (i - (barrels - 1) / 2) * 0.35;
    const a = P.aimYaw + Math.PI / 2;
    TB.Actors.fire({ team: 'player', kind: 'bullet', x: v.x + Math.sin(a) * side, y: v.y, z: v.z + Math.cos(a) * side, tgt: P.target, yaw: P.aimYaw, dmg: V('gun'), speed: 95, range: 46, spread: 0.035 });
  }
  TB.Fx.muzzle(v.x, v.y, v.z);
  TB.Snd.play('gun', { gap: 0.06 });
  P.gunCD = 0.13;
}
function fireHarpoon(P) {
  if (P.harpoons <= 0) { if (P.hintT <= 0) { P.hintT = 3; TB.UI.toast('No harpoons left — restock at the dock (1 metal each)', 'warn'); } return; }
  const tgt = TB.Actors.findTarget(P.x, P.z, P.h, 60, 0.9) || P.target;
  P.harpoons--; P.harpCD = 0.7;
  TB.Actors.fire({ team: 'player', kind: 'harpoon', x: P.x + Math.sin(P.h) * 2.4, y: 1.5, z: P.z + Math.cos(P.h) * 2.4, tgt, yaw: tgt ? Math.atan2(tgt.x - P.x, tgt.z - P.z) : P.h, dmg: 48, speed: 70, range: 62, home: true });
  TB.Snd.play('harpoon');
}
function sonar(P) {
  P.sonarCD = 16; P.sonarT = 10;
  TB.Snd.play('sonar');
  for (let i = 0; i < 3; i++) setTimeout(() => TB.Fx.foam(P.x, P.z, 2, 1.4, 22 + i * 10), i * 160);
  let hidden = 0; for (const e of TB.Actors.list) if (e.type === 'swimmer' && e.alive && dist2(e.x, e.z, P.x, P.z) < 130 * 130) { e.revealT = 10; hidden++; }
  TB.UI.toast(hidden ? `Sonar: ${hidden} swimmer${hidden > 1 ? 's' : ''} detected!` : 'Sonar ping: wrecks and swimmers within range are marked.', hidden ? 'danger' : 'info');
}

function netCatch(P) {
  const G = TB.G, cap = V('cargo'), r = V('net');
  const s = stern(P, 3.6);
  for (let i = TB.World.items.length - 1; i >= 0; i--) {
    const it = TB.World.items[i];
    if (dist2(it.x, it.z, s.x, s.z) > r * r && dist2(it.x, it.z, P.x, P.z) > (r * 0.6) ** 2) continue;
    const amount = Object.values(it.give).reduce((a, b) => a + b, 0);
    if (P.load + amount > cap && amount > 0) {
      if (P.fullT <= 0) { P.fullT = 6; TB.UI.toast('Cargo hold full — sail home to unload', 'warn'); TB.Snd.play('deny'); }
      continue;
    }
    for (const [k, v] of Object.entries(it.give)) {
      if (k === 'coins') { G.stock.coins += v; continue; }
      P.cargo[k] = (P.cargo[k] || 0) + v; P.load += v;
      G.stats['collected_' + k] = (G.stats['collected_' + k] || 0) + v;
    }
    TB.UI.floatGive(it.x, 1.2, it.z, it.give);
    TB.Fx.splash(it.x, it.z, 0.5);
    TB.Snd.play(it.give.coins ? 'coin' : 'pickup');
    TB.World.removeItem(it);
    TB.emit('collect', it.give);
  }
}
function rescue(P) {
  for (let i = TB.World.castaways.length - 1; i >= 0; i--) {
    const c = TB.World.castaways[i];
    if (dist2(c.x, c.z, P.x, P.z) > 6 * 6) continue;
    if (P.spd > 4.5) { if (P.hintT <= 0) { P.hintT = 3; TB.UI.toast('Slow down to pull the castaway aboard', 'info'); } continue; }
    const seats = V('seats') - P.passengers;
    if (seats <= 0) { if (P.hintT <= 0) { P.hintT = 4; TB.UI.toast('No free seats — bring your passengers home first', 'warn'); } continue; }
    const n = Math.min(seats, c.n);
    P.passengers += n; c.n -= n;
    TB.Snd.play('rescue');
    TB.UI.floatText(c.x, 2.4, c.z, `+${n} castaway${n > 1 ? 's' : ''}`, '#79dfc1');
    TB.Fx.splash(c.x, c.z, 0.7);
    if (c.n <= 0) TB.World.removeCastaway(c);
  }
}

// ------------------------------------------------------------ diving
function startDive(P, site) {
  P.dive = { site, t: 0, dur: V('dive') };
  P.net = false; P.spd = 0;
  TB.Snd.play('dive');
  const d = P.diver || (P.diver = TB.Models.make('diver'));
  TB.Gfx.scene.add(d);
  if (site.shark) { for (let i = 0; i < 2; i++) TB.Actors.spawn('shark', site.x + rand(-30, 30), site.z + rand(-30, 30), { home: { x: site.x, z: site.z } }); site.shark = false; TB.UI.toast('Sharks circling the wreck!', 'danger'); }
  TB.UI.toast('Diver down… stay close to the marker', 'info');
}
function updateDive(P, dt, t) {
  const dv = P.dive, s = dv.site;
  if (!TB.World.dives.includes(s)) { cancelDive(P, ''); return; }
  if (dist2(P.x, P.z, s.x, s.z) > 10 * 10) { cancelDive(P, 'Drifted off the dive site'); return; }
  dv.t += dt;
  const k = dv.t / dv.dur, depth = Math.sin(Math.min(1, k) * Math.PI) * 7 + 0.5;
  P.diver.position.set(s.x + Math.sin(t * 0.8) * 1.5, -depth, s.z + Math.cos(t * 0.7) * 1.5);
  P.diver.rotation.x = k < 0.5 ? 0.9 : -0.9; P.diver.rotation.y = t;
  if (Math.random() < dt * 10) TB.Fx.bubbles(P.diver.position.x, 0, P.diver.position.z);
  if (dv.t >= dv.dur) finishDive(P);
}
function finishDive(P) {
  const G = TB.G, s = P.dive.site;
  P.diver.removeFromParent(); P.dive = null;
  const give = { electronics: U.randi(1, s.rich ? 4 : 2), metal: U.randi(2, s.rich ? 7 : 4) };
  if (Math.random() < 0.5) give.plastic = U.randi(2, 5);
  if (Math.random() < 0.25) give.fuel = U.randi(1, 3);
  let msg = 'Dive complete';
  // blueprints: first dive in "Beyond the Horizon" always finds one
  const locked = D.BLUEPRINTS.filter(b => !G.unlocked.includes(b));
  const guaranteed = !G.stats.dives && locked.length;
  if (locked.length && (guaranteed || Math.random() < (s.rich ? 0.55 : 0.35))) {
    const b = locked[0];
    G.unlocked.push(b);
    msg = 'Blueprint recovered: ' + D.B[b].name + '!';
    TB.UI.banner('Blueprint found', D.B[b].name + ' can now be built', 'blueprint');
    TB.Snd.play('levelUp');
  } else if (Math.random() < 0.3) { G.stock.coins += U.randi(5, 15); msg = 'Found an old-world cash box'; TB.Snd.play('coin'); }
  // dive loot goes into the hold (overflow is left behind)
  const cap = V('cargo');
  for (const [k, v] of Object.entries(give)) { const n = Math.max(0, Math.min(v, cap - P.load)); P.cargo[k] = (P.cargo[k] || 0) + n; P.load += n; }
  TB.UI.floatGive(P.x, 2.5, P.z, give);
  G.stats.dives = (G.stats.dives || 0) + 1;
  TB.UI.toast(msg, 'good');
  TB.World.removeDive(s);
  TB.emit('dive', s);
}
function cancelDive(P, msg) {
  if (P.diver) P.diver.removeFromParent();
  P.dive = null;
  if (msg) TB.UI.toast(msg, 'warn');
}

// ------------------------------------------------------------ dock
function dock(P, dt) {
  const G = TB.G;
  const d2 = dist2(P.x, P.z, D.DOCK.x, D.DOCK.z);
  if (!P.docked && d2 < 6.5 * 6.5 && P.spd < 6) {
    P.docked = true;
    TB.Snd.play('dock');
    unload(P);
    TB.emit('docked');
  } else if (P.docked && d2 > 10 * 10) {
    P.docked = false;
    TB.emit('undocked');
  }
  if (P.docked) {
    const maxHp = V('hull');
    if (P.hp < maxHp) P.hp = Math.min(maxHp, P.hp + 14 * dt);
    // top up the tank from the fuel store (1 fuel = 10 litres)
    const tank = V('tank');
    if (P.fuel < tank - 1 && G.stock.fuel >= 0.1) { const need = Math.min((tank - P.fuel) / 10, G.stock.fuel, dt * 2); G.stock.fuel -= need; P.fuel += need * 10; }
    if (P.harpoons < V('harpoon') && G.stock.metal >= 1 && (P.rearmT = (P.rearmT || 0) - dt) <= 0) { P.rearmT = 0.3; P.harpoons++; G.stock.metal -= 1; }
  }
}
function unload(P) {
  const G = TB.G;
  const lost = [];
  const parts = [];
  for (const [k, v] of Object.entries(P.cargo)) {
    if (!v) continue;
    const room = Math.max(0, TB.Town.cap(k) - G.stock[k]), n = Math.min(v, room);
    G.stock[k] += n; if (n) parts.push(`+${n} ${D.RES[k].name.toLowerCase()}`);
    if (n < v) lost.push(D.RES[k].name.toLowerCase());
  }
  if (parts.length) { TB.UI.toast('Unloaded ' + parts.join(', '), 'good'); TB.UI.floatGive(D.DOCK.x, 2.5, D.DOCK.z - 3, P.cargo); }
  if (lost.length) TB.UI.toast('Storage full: some ' + lost.join(', ') + ' went to waste. Build Storage Crates.', 'warn');
  P.cargo = {}; P.load = 0;
  if (P.passengers) {
    const n = P.passengers; P.passengers = 0;
    G.pop += n; G.stats.rescued = (G.stats.rescued || 0) + n; G.rep += 3 * n;
    TB.Snd.play('rescue');
    const homeless = G.pop - TB.Town.econ.beds;
    TB.UI.toast(`${n} castaway${n > 1 ? 's' : ''} joined the town!` + (homeless > 0 ? ` (${homeless} without a bed — build shacks)` : ''), 'good');
    TB.emit('rescued', n);
    TB.Town.recompute();
  }
  TB.Game.autosave();
}

// ------------------------------------------------------------ damage
function hurt(dmg, src, noScale) {
  const P = B.P; if (!P || !P.alive) return;
  if (!noScale) dmg *= D.DIFF[TB.G.diff].dmgTaken;
  P.hp -= dmg; P.hurtT = 0.25;
  TB.Snd.play('hurt', { gap: 0.12 });
  TB.Gfx.cam.shake = Math.max(TB.Gfx.cam.shake, Math.min(0.9, dmg / 20));
  if (P.hp <= 0) sink(P);
}
function sink(P) {
  P.alive = false; P.deadT = 4; P.hp = 0; P.net = false;
  if (P.dive) cancelDive(P, '');
  TB.Fx.explode(P.x, 1, P.z, 1.6); TB.Snd.play('boom'); TB.Gfx.cam.shake = 1;
  // passengers swim to a raft; the cargo is lost
  if (P.passengers) TB.World.addCastawayAt(P.x + 3, P.z + 3, P.passengers);
  P.passengers = 0; P.cargo = {}; P.load = 0;
  TB.UI.banner('Boat sunk!', 'The crew swims home. Repairs take a few seconds…', 'danger');
  TB.G.stats.sunk = (TB.G.stats.sunk || 0) + 1;
}
function respawn() {
  const P = B.P;
  P.alive = true; P.hp = V('hull'); P.fuel = Math.max(P.fuel, V('tank') * 0.4);
  P.x = D.DOCK.x; P.z = D.DOCK.z + 2; P.h = Math.PI; P.spd = 0; P.vx = P.vz = 0;
  P.obj.rotation.set(0, P.h, 0);
  TB.UI.toast('Your boat is patched up and back in the water', 'good');
}

TB.U.extend(B, { spawn, update, hurt, save, load, nearDive, V, unload });
})();
