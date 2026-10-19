'use strict';
/* =====================================================================
   TIDEBREAKERS — low-poly model library + .glb replacement layer

   Every model in the game is a named SLOT (see SLOTS below). Out of the box
   each slot is built here from simple low-poly shapes with vertex colours
   (one draw call per model). To replace one with your own model:

     1. Export a .glb named after the slot, e.g. assets/models/boat_player.glb
     2. List it in assets/models/models.json:
          { "boat_player": {}, "bld_house": { "scale": 1.1, "yaw": 90 } }
     3. Serve the game over http(s) (file:// pages cannot load models).

   Per-model options in models.json:
     file   another file name           scale  extra size multiplier
     yaw    turn in degrees             lift   raise/lower in metres
     fit    true (default) scales the model to the slot size, false keeps it as authored
     toon   true (default) converts materials to the game's toon shading
     anims  map game states to clip names, e.g. { "walk": "Run_Cycle" }
   Named nodes the game animates (turret, muzzle, rotor…) are listed per
   slot; give the matching objects those names in Blender to hook them up.
   Full table: docs/GLB-MODELS.md.   ?models=off ignores all .glb files.
   ===================================================================== */
(() => {
let THREE;
// size = [length (Z, forward), height (Y), width (X)] in metres; fit = how a .glb is scaled into it
// y = where the model's bottom sits (boats sit slightly below the waterline); top: align the top instead
const S = (L, H, W, nodes = '', o = {}) => Object.assign({ size: [L, H, W], nodes: nodes ? nodes.split(' ') : [], fit: 'xz', y: 0 }, o);
const SLOTS = {
  // player & ships (forward = +Z, waterline = y 0)
  boat_player:      S(6.0, 2.6, 2.6, 'turret muzzle netbag flag', { y: -0.45 }),
  raider_skiff:     S(4.2, 1.8, 1.8, 'turret muzzle', { y: -0.35 }),
  raider_speedboat: S(5.8, 2.2, 2.2, 'turret muzzle', { y: -0.4 }),
  raider_gunboat:   S(8.2, 3.6, 3.2, 'turret muzzle smoke', { y: -0.55 }),
  boss_ironclad:    S(17, 7.5, 6.2, 'turret muzzle turret2 muzzle2 smoke', { y: -0.8 }),
  merchant_ship:    S(14, 10, 5, 'sail', { y: -0.6 }),
  migrant_raft:     S(4.2, 2.4, 3.2, '', { y: -0.3 }),
  castaway_raft:    S(2.8, 2.6, 2.6, 'flag', { y: -0.25 }),
  swimmer:          S(1.8, 0.7, 0.7, '', { y: -0.45 }),
  shark:            S(3.4, 1.4, 1.3, 'tail', { y: -0.9 }),
  // people (fit by height)
  person:           S(0.6, 1.6, 0.7, '', { fit: 'h' }),
  raider:           S(0.6, 1.7, 0.7, '', { fit: 'h' }),
  diver:            S(0.8, 1.7, 0.8, '', { fit: 'h' }),
  // town (one 4 m × 4 m tile; y 0 = deck surface)
  platform:         S(4, 1.8, 4, '', { top: 0 }),
  pier:             S(4, 1.6, 4, '', { top: 0 }),
  bld_hall:         S(4, 6.5, 4, 'flag'),
  bld_house:        S(4, 3.6, 4),
  bld_storage:      S(4, 3.0, 4),
  bld_lanterns:     S(2.5, 2.8, 2.5),
  bld_rain:         S(4, 3.4, 4),
  bld_fishing:      S(4, 4.0, 4),
  bld_windmill:     S(4, 7.5, 4, 'rotor', { fit: 'h' }),
  bld_purifier:     S(4, 4.2, 4, 'smoke'),
  bld_garden:       S(4, 2.2, 4),
  bld_solar:        S(4, 2.0, 4),
  bld_workshop:     S(4, 3.8, 4),
  bld_watchtower:   S(4, 7.5, 4, 'turret muzzle flag', { fit: 'h' }),
  bld_harpoon:      S(4, 3.0, 4, 'turret muzzle'),
  bld_trader:       S(4, 3.8, 4, 'flag'),
  bld_market:       S(4, 3.4, 4),
  bld_clinic:       S(4, 3.8, 4),
  bld_radio:        S(4, 10, 4, 'dish light', { fit: 'h' }),
  rubble:           S(4, 1.0, 4),
  // world
  ruin_tower:       S(10, 30, 10, '', { fit: 'none' }),
  shipwreck:        S(16, 6, 5, '', { y: -3 }),
  rock:             S(5, 3, 5, '', { y: -1.5 }),
  buoy:             S(0.9, 2.2, 0.9, 'light', { y: -0.6 }),
  dive_marker:      S(1.2, 2.4, 1.2, 'flag', { y: -0.6 }),
  ferris_wheel:     S(4, 22, 22, '', { fit: 'h', y: -8 }),
  outpost_platform: S(14, 3, 14, 'flag', { top: 1.2 }),
  outpost_turret:   S(3, 2.6, 3, 'turret muzzle'),
  outpost_cage:     S(3, 2.8, 3),
  // floating salvage & projectiles (centred on the waterline)
  pick_wood:        S(1.8, 0.6, 1.4, '', { y: -0.25 }),
  pick_plastic:     S(1.6, 0.9, 1.6, '', { y: -0.3 }),
  pick_metal:       S(1.4, 0.9, 1.4, '', { y: -0.35 }),
  pick_food:        S(1.3, 0.9, 1.3, '', { y: -0.35 }),
  pick_fuel:        S(0.9, 1.0, 0.6, '', { y: -0.3 }),
  pick_electronics: S(1.1, 0.8, 1.1, '', { y: -0.3 }),
  pick_loot:        S(1.4, 1.1, 1.4, '', { y: -0.35 }),
  proj_harpoon:     S(2.0, 0.25, 0.25),
  proj_shell:       S(0.6, 0.6, 0.6),
};

// ------------------------------------------------------- builder
// Shapes are merged into one vertex-coloured mesh; parts named with node()
// become child objects the game can move (turrets, rotors, flags…).
let M4, Q, E, V, V2, C;
class B {
  constructor() { this.g = []; this.gl = []; this.kids = []; }
  add(geo, color, x, y, z, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    E.set(o.rx || 0, o.ry || 0, o.rz || 0); Q.setFromEuler(E);
    V.set(x, y, z); V2.set(o.sx || 1, o.sy || 1, o.sz || 1);
    M4.compose(V, Q, V2); g.applyMatrix4(M4);
    g.computeVertexNormals();
    C.set(color);
    if (o.jit !== 0) C.offsetHSL(0, 0, (Math.random() - 0.5) * (o.jit || 0.05));
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = C.r; arr[i * 3 + 1] = C.g; arr[i * 3 + 2] = C.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (o.glow ? this.gl : this.g).push(g);
    return this;
  }
  // y is the bottom of the shape for box / cyl / cone; the centre for ball
  box(w, h, d, c, x = 0, y = 0, z = 0, o) { return this.add(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, o); }
  cyl(rt, rb, h, c, x = 0, y = 0, z = 0, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 8), c, x, y + h / 2, z, o); }
  // horizontal cylinder along X (or Z with o.alongZ)
  hcyl(r, len, c, x = 0, y = 0, z = 0, o = {}) {
    return this.add(new THREE.CylinderGeometry(r, r, len, o.seg || 8), c, x, y, z, Object.assign({}, o, o.alongZ ? { rx: Math.PI / 2 } : { rz: Math.PI / 2 }));
  }
  cone(r, h, c, x = 0, y = 0, z = 0, o = {}) { return this.add(new THREE.ConeGeometry(r, h, o.seg || 8), c, x, y + h / 2, z, o); }
  ball(r, c, x = 0, y = 0, z = 0, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, o.detail || 0), c, x, y, z, o); }
  rock(r, c, x = 0, y = 0, z = 0, o = {}) { return this.add(new THREE.DodecahedronGeometry(r, 0), c, x, y, z, o); }
  // gable roof: ridge along Z
  roof(w, h, d, c, x = 0, y = 0, z = 0, o = {}) {
    const hw = w / 2, hd = d / 2;
    const p = [-hw, 0, hd, hw, 0, hd, 0, h, hd,  hw, 0, -hd, -hw, 0, -hd, 0, h, -hd,
      -hw, 0, -hd, -hw, 0, hd, 0, h, hd,  -hw, 0, -hd, 0, h, hd, 0, h, -hd,
      hw, 0, hd, hw, 0, -hd, 0, h, -hd,  hw, 0, hd, 0, h, -hd, 0, h, hd,
      -hw, 0, -hd, hw, 0, -hd, hw, 0, hd,  -hw, 0, -hd, hw, 0, hd, -hw, 0, hd];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return this.add(g, c, x, y, z, o);
  }
  // pointed bow wedge for hulls (points to +Z)
  bow(w, h, len, c, x = 0, y = 0, z = 0, o = {}) {
    const hw = w / 2;
    const p = [-hw, 0, 0, hw, 0, 0, 0, 0, len,  -hw, h, 0, 0, h, len, hw, h, 0,
      -hw, 0, 0, 0, 0, len, 0, h, len,  -hw, 0, 0, 0, h, len, -hw, h, 0,
      hw, 0, 0, hw, h, 0, 0, h, len,  hw, 0, 0, 0, h, len, 0, 0, len];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return this.add(g, c, x, y, z, o);
  }
  node(name, x = 0, y = 0, z = 0, ry = 0) { const b = new B(); this.kids.push({ name, b, x, y, z, ry }); return b; }
  build() {
    const grp = new THREE.Group();
    if (this.g.length) { const m = new THREE.Mesh(merge(this.g), TB.Gfx.mats.toon); m.castShadow = m.receiveShadow = true; grp.add(m); }
    if (this.gl.length) { const m = new THREE.Mesh(merge(this.gl), TB.Gfx.mats.glow); grp.add(m); }
    for (const k of this.kids) { const c = k.b.build(); c.name = k.name; c.position.set(k.x, k.y, k.z); c.rotation.y = k.ry; grp.add(c); }
    return grp;
  }
}
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.count * 3; g.dispose(); }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere(); m.computeBoundingBox();
  return m;
}

// ------------------------------------------------------- palette
const P = {
  aqua: '#28c7c4', ocean: '#086f9c', rust: '#c95b3c', teal: '#4a9a8e', sun: '#f8c55b', wood: '#9a6b43', plank: '#c48a52', plankL: '#d9a46a',
  dwood: '#6e4a2c', crimson: '#b93b46', navy: '#142b38', foam: '#79dfc1', canvas: '#f1e6cc', grey: '#8a96a0', steel: '#5c6b78', dark: '#2d3740',
  tire: '#26272b', red: '#d8473a', blue: '#2f6fb0', tarp: '#3d7fb8', orange: '#ec7a2e', white: '#f4f1ea', glass: '#9fe7ff', lamp: '#ffd27a',
  green: '#4caf50', leaf: '#3f9a46', skin: ['#f2c79a', '#d9a27a', '#a8714c', '#7a4f33', '#f6d6b8'], black: '#1d1f24', concrete: '#9ca3a0', moss: '#5f8f5a',
};
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------- people
function personB(b, x, y, z, o = {}) {
  const shirt = o.shirt || pick([P.teal, P.sun, P.rust, P.tarp, P.canvas, P.foam]);
  const pants = o.pants || pick([P.wood, P.steel, P.navy, P.dwood]);
  const skin = o.skin || pick(P.skin);
  b.box(0.18, 0.62, 0.22, pants, x - 0.12, y, z); b.box(0.18, 0.62, 0.22, pants, x + 0.12, y, z);
  b.box(0.5, 0.6, 0.32, shirt, x, y + 0.6, z);
  b.box(0.14, 0.5, 0.16, shirt, x - 0.32, y + 0.68, z); b.box(0.14, 0.5, 0.16, shirt, x + 0.32, y + 0.68, z);
  b.box(0.34, 0.34, 0.32, skin, x, y + 1.2, z);
  const hat = o.hat !== undefined ? o.hat : pick([0, 1, 2, 3]);
  if (hat === 1) { b.cyl(0.36, 0.36, 0.05, P.sun, x, y + 1.5, z); b.cyl(0.2, 0.22, 0.16, P.sun, x, y + 1.53, z); }
  else if (hat === 2) b.box(0.38, 0.12, 0.36, o.band || P.crimson, x, y + 1.5, z);
  else if (hat === 3) { b.box(0.38, 0.1, 0.36, P.tarp, x, y + 1.52, z); b.box(0.3, 0.04, 0.2, P.tarp, x, y + 1.52, z + 0.25); }
  return b;
}
const MAKERS = {};
const PERSON_VARIANTS = 8;
MAKERS.person = (o = {}) => personB(new B(), 0, 0, 0, o).build();
MAKERS.raider = () => {
  const b = personB(new B(), 0, 0, 0, { shirt: P.black, pants: P.dark, hat: 2, band: P.crimson });
  b.box(0.06, 0.06, 0.5, P.grey, 0.38, 0.7, 0.25);
  b.box(0.36, 0.12, 0.05, P.crimson, 0, 1.25, 0.17);
  return b.build();
};
MAKERS.diver = () => {
  const b = personB(new B(), 0, 0, 0, { shirt: P.black, pants: P.black, hat: 0, skin: P.skin[0] });
  b.cyl(0.13, 0.13, 0.6, P.sun, -0.1, 0.62, -0.25, { seg: 6 }); b.cyl(0.13, 0.13, 0.6, P.sun, 0.1, 0.62, -0.25, { seg: 6 });
  b.box(0.3, 0.14, 0.06, P.glass, 0, 1.3, 0.17);
  b.box(0.2, 0.05, 0.4, P.sun, -0.12, 0, 0.2); b.box(0.2, 0.05, 0.4, P.sun, 0.12, 0, 0.2);
  return b.build();
};
MAKERS.swimmer = () => {
  const b = new B();
  b.box(0.45, 0.3, 1.2, P.black, 0, -0.3, -0.2);
  b.box(0.32, 0.32, 0.32, P.skin[1], 0, -0.05, 0.45);
  b.box(0.36, 0.1, 0.34, P.crimson, 0, 0.2, 0.45);
  b.cyl(0.03, 0.03, 0.4, P.sun, 0.14, 0.1, 0.5, { seg: 5 });
  b.box(0.3, 0.12, 0.05, P.glass, 0, 0.05, 0.62);
  return b.build();
};
MAKERS.shark = () => {
  const b = new B();
  b.ball(0.6, '#6d8a9c', 0, 0.55, 0.2, { sz: 2.4, sy: 0.9 });
  b.ball(0.45, '#e8eef0', 0, 0.38, 0.4, { sz: 2.0, sy: 0.5 });
  b.cone(0.3, 0.9, '#5d7a8c', 0, 0.95, 0.1, { seg: 4, sz: 0.3 });
  b.box(1.2, 0.06, 0.3, '#5d7a8c', 0, 0.4, 0.4, { ry: 0 });
  b.box(0.06, 0.08, 0.06, P.black, 0.3, 0.7, 1.3); b.box(0.06, 0.08, 0.06, P.black, -0.3, 0.7, 1.3);
  const t = b.node('tail', 0, 0.55, -1.2);
  t.cone(0.35, 0.9, '#5d7a8c', 0, -0.2, -0.3, { seg: 4, sz: 0.25, rx: -Math.PI / 2 - 0.3 });
  t.cone(0.3, 0.7, '#5d7a8c', 0, 0.15, -0.3, { seg: 4, sz: 0.25, rx: -Math.PI / 2 + 0.6 });
  return b.build();
};

// ------------------------------------------------------------ boats
function hull(b, w, h, len, bowLen, top, bottom, z0 = 0, y0 = -0.45) {
  b.box(w, h * 0.45, len, bottom, 0, y0, z0);
  b.box(w, h * 0.55, len, top, 0, y0 + h * 0.45, z0);
  b.bow(w, h * 0.45, bowLen, bottom, 0, y0, z0 + len / 2);
  b.bow(w, h * 0.55, bowLen, top, 0, y0 + h * 0.45, z0 + len / 2);
  b.box(w + 0.08, 0.12, len, P.white, 0, y0 + h - 0.06, z0, { jit: 0 });
}
MAKERS.boat_player = () => {
  const b = new B();
  hull(b, 2.3, 1.2, 4.2, 1.4, P.canvas, P.rust, -0.4);
  b.box(2.0, 0.08, 4.0, P.plank, 0, 0.72, -0.4);
  b.box(2.32, 0.18, 4.22, P.teal, 0, 0.32, -0.4, { jit: 0 });
  b.box(1.5, 1.05, 1.5, P.teal, 0, 0.8, -1.1);
  b.box(1.56, 0.1, 0.06, P.glass, 0, 1.45, -0.34, { glow: true }); b.box(0.06, 0.3, 1.0, P.glass, 0.78, 1.25, -1.1, { glow: true }); b.box(0.06, 0.3, 1.0, P.glass, -0.78, 1.25, -1.1, { glow: true });
  b.box(1.7, 0.12, 1.75, P.sun, 0, 1.85, -1.1);
  b.cyl(0.04, 0.04, 1.2, P.dark, -0.5, 1.95, -1.5, { seg: 5 });
  b.box(0.7, 0.9, 0.55, P.dark, 0, 0.3, -2.75); b.box(0.5, 0.4, 0.4, P.steel, 0, 1.2, -2.75);
  for (const s of [-1, 1]) for (const z of [-1.6, 0.2]) b.hcyl(0.22, 0.14, P.tire, s * 1.2, 0.55, z, { seg: 8 });
  b.box(0.5, 0.35, 0.5, P.plank, 0.55, 0.78, -2.0); b.cyl(0.22, 0.22, 0.5, P.blue, -0.6, 0.78, -2.1, { seg: 7 });
  const t = b.node('turret', 0, 0.8, 1.2);
  t.cyl(0.3, 0.38, 0.35, P.steel, 0, 0, 0, { seg: 7 }); t.box(0.5, 0.35, 0.7, P.dark, 0, 0.35, 0); t.box(0.6, 0.45, 0.08, P.steel, 0, 0.3, 0.38);
  t.hcyl(0.07, 1.1, P.black, 0, 0.55, 0.85, { alongZ: true, seg: 6 });
  t.node('muzzle', 0, 0.55, 1.45);
  const f = b.node('flag', -0.5, 3.1, -1.5);
  f.box(0.03, 0.4, 0.6, P.foam, 0, -0.15, -0.3);
  const n = b.node('netbag', 0, 0.2, -3.4);
  n.box(2.2, 0.06, 0.06, P.dwood, 0, 0.6, 0); n.box(1.9, 0.7, 1.4, '#2c6a78', 0, -0.5, -0.7, { sy: 1 }); n.box(2.0, 0.08, 0.08, P.sun, 0, 0.18, -1.4);
  return b.build();
};
MAKERS.raider_skiff = () => {
  const b = new B();
  hull(b, 1.6, 0.9, 3.0, 1.0, P.crimson, P.dark, -0.4, -0.35);
  b.box(1.4, 0.08, 2.8, P.wood, 0, 0.5, -0.4);
  b.box(0.45, 0.6, 0.4, P.dark, 0, 0.2, -2.05);
  personB(b, 0, 0.52, -1.2, { shirt: P.black, hat: 2, band: P.crimson });
  b.cyl(0.03, 0.03, 1.2, P.dark, 0.5, 0.5, -1.6, { seg: 4 }); b.box(0.04, 0.35, 0.5, P.crimson, 0.5, 1.3, -1.85);
  const t = b.node('turret', 0, 0.55, 0.7);
  t.box(0.3, 0.25, 0.5, P.dark, 0, 0, 0); t.hcyl(0.05, 0.8, P.black, 0, 0.15, 0.55, { alongZ: true, seg: 5 });
  t.node('muzzle', 0, 0.15, 0.95);
  return b.build();
};
MAKERS.raider_speedboat = () => {
  const b = new B();
  hull(b, 2.0, 1.1, 4.0, 1.6, P.crimson, P.black, -0.6, -0.4);
  b.box(2.02, 0.16, 3.4, P.black, 0, 0.3, -0.6, { jit: 0 });
  b.box(1.8, 0.08, 3.8, P.dwood, 0, 0.62, -0.6);
  b.box(1.2, 0.5, 0.9, P.dark, 0, 0.7, -0.4); b.box(1.2, 0.06, 0.5, P.glass, 0, 1.2, -0.05, { rx: -0.6 });
  b.box(0.55, 0.7, 0.5, P.dark, 0, 0.3, -2.8);
  personB(b, 0.4, 0.66, -1.5, { shirt: P.black, hat: 2 }); personB(b, -0.45, 0.66, -1.9, { shirt: P.crimson, hat: 2, band: P.black });
  for (const s of [-1, 1]) b.cone(0.07, 0.4, P.grey, s * 1.0, 0.65, 0.9, { seg: 4 });
  const t = b.node('turret', 0, 0.7, 1.0);
  t.cyl(0.2, 0.25, 0.3, P.dark, 0, 0, 0, { seg: 6 }); t.box(0.35, 0.3, 0.6, P.steel, 0, 0.3, 0); t.hcyl(0.06, 0.9, P.black, 0, 0.45, 0.7, { alongZ: true, seg: 5 });
  t.node('muzzle', 0, 0.45, 1.15);
  return b.build();
};
MAKERS.raider_gunboat = () => {
  const b = new B();
  hull(b, 3.0, 1.6, 6.0, 2.0, P.steel, P.crimson, -1, -0.55);
  b.box(2.8, 0.1, 5.8, P.dark, 0, 1.0, -1);
  b.box(2.2, 1.4, 2.2, P.steel, 0, 1.05, -1.8); b.box(2.24, 0.25, 0.08, P.lamp, 0, 2.0, -0.68, { glow: true });
  b.box(2.4, 0.15, 2.4, P.crimson, 0, 2.45, -1.8);
  b.cyl(0.35, 0.4, 1.6, P.dark, 0.5, 2.5, -2.4, { seg: 7 });
  for (const s of [-1, 1]) for (const z of [-3, -1, 1]) b.box(0.08, 0.7, 1.4, P.grey, s * 1.52, 0.4, z);
  b.cyl(0.03, 0.03, 2, P.dark, -0.7, 2.6, -2.4, { seg: 4 }); b.box(0.04, 0.6, 0.9, P.crimson, -0.7, 3.9, -2.85);
  const t = b.node('turret', 0, 1.1, 1.3);
  t.cyl(0.7, 0.8, 0.5, P.steel, 0, 0, 0, { seg: 8 }); t.box(1.0, 0.6, 1.1, P.dark, 0, 0.4, 0);
  t.hcyl(0.14, 1.9, P.black, 0, 0.75, 1.3, { alongZ: true, seg: 7 });
  t.node('muzzle', 0, 0.75, 2.3);
  b.node('smoke', 0.5, 4.1, -2.4);
  return b.build();
};
MAKERS.boss_ironclad = () => {
  const b = new B();
  hull(b, 6.0, 2.6, 13, 3.8, P.steel, P.crimson, -1.6, -0.8);
  b.box(5.6, 0.12, 12.6, P.dark, 0, 1.8, -1.6);
  for (const s of [-1, 1]) b.box(0.12, 0.9, 11, P.grey, s * 3.02, 0.9, -1.8);
  b.box(3.6, 2.2, 3.6, P.steel, 0, 1.9, -3); b.box(3.0, 1.4, 2.6, P.steel, 0, 4.1, -3.2);
  b.box(3.04, 0.3, 0.1, P.lamp, 0, 4.9, -1.85, { glow: true }); b.box(3.64, 0.3, 0.1, P.lamp, 0, 3.4, -1.15, { glow: true });
  b.box(3.4, 0.2, 3.0, P.crimson, 0, 5.5, -3.2);
  for (const x of [-0.8, 0.8]) b.cyl(0.5, 0.55, 2.6, P.dark, x, 4.0, -5.4, { seg: 8 });
  b.cyl(0.06, 0.06, 3, P.dark, 0, 5.7, -3.2, { seg: 4 }); b.box(0.05, 0.9, 1.4, P.crimson, 0, 7.4, -3.9);
  for (const z of [-7.5, -6]) b.box(1.2, 0.8, 1.0, P.grey, 0, 1.9, z);
  const t = b.node('turret', 0, 1.9, 3.0);
  t.cyl(1.2, 1.4, 0.7, P.steel, 0, 0, 0, { seg: 8 }); t.box(1.8, 0.9, 1.8, P.dark, 0, 0.6, 0);
  t.hcyl(0.2, 2.6, P.black, -0.4, 1.0, 2.0, { alongZ: true, seg: 7 }); t.hcyl(0.2, 2.6, P.black, 0.4, 1.0, 2.0, { alongZ: true, seg: 7 });
  t.node('muzzle', 0, 1.0, 3.3);
  const t2 = b.node('turret2', 0, 1.9, -8.2, Math.PI);
  t2.cyl(1.0, 1.1, 0.6, P.steel, 0, 0, 0, { seg: 8 }); t2.box(1.4, 0.8, 1.4, P.dark, 0, 0.5, 0);
  t2.hcyl(0.17, 2.2, P.black, 0, 0.9, 1.6, { alongZ: true, seg: 7 });
  t2.node('muzzle2', 0, 0.9, 2.7);
  b.node('smoke', 0.8, 6.6, -5.4);
  return b.build();
};
MAKERS.merchant_ship = () => {
  const b = new B();
  hull(b, 4.4, 2.0, 10, 3.2, P.wood, P.dwood, -1, -0.6);
  b.box(4.2, 0.1, 9.8, P.plankL, 0, 1.4, -1);
  b.box(3.0, 1.6, 2.4, P.canvas, 0, 1.5, -4.4); b.roof(3.4, 0.9, 2.8, P.rust, 0, 3.1, -4.4);
  b.box(3.04, 0.35, 0.08, P.lamp, 0, 2.3, -3.18, { glow: true });
  for (const [x, z, c] of [[-1, 0.5, P.blue], [1.1, 0.2, P.red], [0, 2.6, P.sun], [-1.2, -1.5, P.teal]]) b.box(1.0, 0.9, 1.0, c, x, 1.5, z);
  for (const [x, z] of [[1.3, -1.6], [1.2, 2.4]]) b.cyl(0.35, 0.35, 0.9, P.blue, x, 1.5, z, { seg: 7 });
  b.cyl(0.12, 0.15, 8.5, P.dwood, 0, 1.4, 0.8, { seg: 6 });
  b.box(0.1, 0.1, 4.6, P.dwood, 0, 3.0, 0.4);
  const s = b.node('sail', 0, 3.1, 0.8);
  s.box(0.08, 5.6, 4.0, P.canvas, 0.1, 0, -0.5); s.box(0.1, 1.2, 1.2, P.navy, 0.16, 2.8, -0.5, { rx: Math.PI / 4 });
  b.cyl(0.02, 0.02, 1, P.dark, 0, 9.9, 0.8, { seg: 4 }); b.box(0.04, 0.5, 0.9, P.foam, 0, 10.3, 0.35);
  for (const z of [-3, 2]) b.ball(0.18, P.lamp, 2.1, 2.2, z, { glow: true });
  return b.build();
};
MAKERS.migrant_raft = () => {
  const b = new B();
  for (let i = 0; i < 5; i++) b.box(0.62, 0.2, 3.6, i % 2 ? P.plank : P.plankL, -1.3 + i * 0.65, -0.05, 0);
  for (const x of [-1.2, 1.2]) for (const z of [-1.3, 1.3]) b.cyl(0.35, 0.35, 0.6, x > 0 ? P.blue : P.red, x, -0.5, z, { seg: 7 });
  for (const x of [-1.3, 1.3]) b.cyl(0.04, 0.04, 1.6, P.dwood, x, 0.15, -1.4, { seg: 4 });
  b.box(2.8, 0.06, 1.4, P.tarp, 0, 1.7, -1.0, { rx: 0.2 });
  personB(b, -0.5, 0.15, 0.3); personB(b, 0.5, 0.15, -0.3); personB(b, 0.1, 0.15, 1.1);
  return b.build();
};
MAKERS.castaway_raft = () => {
  const b = new B();
  for (let i = 0; i < 4; i++) b.box(0.55, 0.16, 2.2, i % 2 ? P.plank : P.plankL, -0.85 + i * 0.57, -0.05, 0);
  b.hcyl(0.3, 2.2, P.red, 0, -0.3, -0.8, { seg: 7 });
  personB(b, 0.2, 0.1, 0.2, { hat: 0 });
  b.cyl(0.03, 0.03, 2.2, P.dwood, -0.7, 0.1, -0.6, { seg: 4 });
  const f = b.node('flag', -0.7, 2.0, -0.6);
  f.box(0.03, 0.5, 0.8, P.white, 0, -0.25, 0.4); f.box(0.04, 0.12, 0.6, P.red, 0, -0.1, 0.4);
  return b.build();
};

// ------------------------------------------------------------ town
function deck(b, w = 4, d = 4, seed = 0) {
  const n = Math.round(w / 0.8);
  for (let i = 0; i < n; i++) b.box(w / n - 0.06, 0.18, d - 0.04, i % 2 ? P.plank : P.plankL, -w / 2 + (i + 0.5) * (w / n), -0.18, 0, { jit: 0.08 });
  for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) b.box(w, 0.22, 0.24, P.dwood, 0, -0.4, z);
}
MAKERS.platform = () => {
  const b = new B();
  deck(b);
  const cols = [P.blue, P.red, P.sun, P.blue, P.teal];
  let k = 0;
  for (const x of [-1.3, 1.3]) for (const z of [-1.3, 1.3]) b.cyl(0.55, 0.55, 1.1, cols[k++], x, -1.55, z, { seg: 8 });
  b.hcyl(0.4, 2.6, P.sun, 0, -1.0, 0, { seg: 8 });
  for (const x of [-1.9, 1.9]) for (const z of [-1.9, 1.9]) b.box(0.2, 0.55, 0.2, P.dwood, x, -0.6, z);
  b.hcyl(0.26, 0.18, P.tire, 2.02, -0.35, 0.6, { seg: 8, alongZ: false });
  return b.build();
};
MAKERS.pier = () => {
  const b = new B();
  for (let i = 0; i < 7; i++) b.box(2.4, 0.16, 0.5, i % 2 ? P.plank : P.plankL, 0, -0.16, -1.75 + i * 0.58);
  for (const x of [-1.25, 1.25]) for (const z of [-1.6, 0, 1.6]) b.cyl(0.13, 0.13, 2.0, P.dwood, x, -1.7, z, { seg: 6 });
  b.cyl(0.06, 0.06, 2.2, P.dark, 1.15, 0, 1.6, { seg: 5 }); b.box(0.3, 0.32, 0.3, P.lamp, 1.15, 2.2, 1.6, { glow: true });
  for (const x of [-1.25, 1.25]) b.hcyl(0.24, 0.16, P.tire, x, -0.3, 0.8, { seg: 8 });
  return b.build();
};
MAKERS.bld_hall = () => {
  const b = new B();
  b.box(3.6, 0.15, 3.6, P.dwood, 0, 0, 0);
  hull(b, 2.8, 1.1, 2.6, 0.9, P.orange, P.white, -0.4, 0.15);
  b.box(2.4, 1.5, 2.2, P.canvas, 0, 1.25, -0.6);
  for (const s of [-1, 1]) b.box(0.06, 0.45, 1.4, P.lamp, s * 1.21, 1.8, -0.6, { glow: true });
  b.box(1.4, 0.45, 0.06, P.lamp, 0, 1.8, 0.51, { glow: true });
  b.box(2.8, 0.2, 2.8, P.teal, 0, 2.75, -0.6);
  b.box(1.4, 1.0, 1.4, P.sun, 0, 2.95, -0.8); b.cone(1.1, 0.8, P.rust, 0, 3.95, -0.8, { seg: 4, ry: Math.PI / 4 });
  b.box(0.6, 0.5, 0.08, P.lamp, 0, 3.25, -0.08, { glow: true });
  b.cyl(0.05, 0.05, 2.0, P.dark, 0.9, 2.95, -1.8, { seg: 5 });
  b.cyl(0.18, 0.12, 0.3, P.sun, -1.5, 0.15, 1.4, { seg: 7 }); b.box(0.06, 1.2, 0.06, P.dwood, -1.5, 0.15, 1.1);
  const f = b.node('flag', 0.9, 4.95, -1.8);
  f.box(0.04, 0.6, 1.0, P.foam, 0, -0.3, -0.5); f.box(0.05, 0.25, 0.25, P.navy, 0, -0.2, -0.5);
  return b.build();
};
MAKERS.bld_house = () => {
  const b = new B();
  const wall = pick([P.teal, P.rust, P.tarp, P.sun]);
  b.box(3.0, 2.0, 2.6, wall, 0, 0, -0.2);
  for (let i = 0; i < 6; i++) b.box(0.05, 1.9, 0.04, P.dark, -1.3 + i * 0.52, 0.05, 1.1, { jit: 0 });
  b.roof(3.5, 1.1, 3.1, pick([P.crimson, P.sun, P.rust]), 0, 2.0, -0.2, { ry: Math.PI / 2 });
  b.box(0.7, 1.3, 0.08, P.dwood, -0.6, 0, 1.12); b.box(0.7, 0.55, 0.08, P.lamp, 0.65, 0.9, 1.12, { glow: true });
  b.cyl(0.12, 0.12, 0.9, P.grey, 0.9, 2.4, -0.9, { seg: 6 });
  b.cyl(0.32, 0.32, 0.8, P.blue, 1.6, 0, 1.4, { seg: 7 }); b.box(0.6, 0.5, 0.6, P.plank, -1.55, 0, 1.45);
  return b.build();
};
MAKERS.bld_storage = () => {
  const b = new B();
  b.box(3.4, 1.3, 1.6, P.rust, 0, 0, -0.9); for (let i = 0; i < 7; i++) b.box(0.05, 1.2, 0.04, P.dark, -1.5 + i * 0.5, 0.05, -0.08, { jit: 0 });
  b.box(2.6, 1.3, 1.6, P.blue, -0.2, 1.3, -0.9, { ry: 0.08 });
  b.box(1.6, 1.3, 1.5, P.teal, 0.8, 0, 1.0);
  for (const [x, z, y] of [[-1.2, 0.8, 0], [-0.4, 1.2, 0], [-1.0, 1.0, 0.7]]) b.box(0.7, 0.7, 0.7, P.plank, x, y, z, { ry: Math.random() });
  return b.build();
};
MAKERS.bld_lanterns = () => {
  const b = new B();
  for (const x of [-0.9, 0.9]) { b.cyl(0.07, 0.09, 2.4, P.dwood, x, 0, 0, { seg: 5 }); b.box(0.3, 0.36, 0.3, P.lamp, x, 2.4, 0, { glow: true }); b.box(0.4, 0.06, 0.4, P.dark, x, 2.76, 0); }
  b.box(1.8, 0.05, 0.05, P.dark, 0, 2.2, 0);
  for (let i = 0; i < 5; i++) b.ball(0.08, pick(['#ff6b6b', '#ffd27a', '#7cf0c8', '#8ab8ff']), -0.72 + i * 0.36, 2.05 - Math.sin(i / 4 * Math.PI) * 0.25, 0, { glow: true, jit: 0 });
  b.box(0.5, 0.4, 0.5, P.plank, 0, 0, 0.6);
  return b.build();
};
MAKERS.bld_rain = () => {
  const b = new B();
  for (const x of [-1.3, 1.3]) for (const z of [-1.3, 1.3]) b.cyl(0.07, 0.07, 2.6, P.dwood, x, 0, z, { seg: 5 });
  b.cone(1.9, 1.0, P.tarp, 0, 2.0, 0, { seg: 4, rx: Math.PI, ry: Math.PI / 4 });
  b.cyl(0.12, 0.12, 1.2, P.grey, 0, 0.9, 0, { seg: 6 });
  b.cyl(0.75, 0.75, 1.0, P.blue, 0, 0, 0, { seg: 8 }); b.cyl(0.8, 0.8, 0.1, P.white, 0, 0.9, 0, { seg: 8 });
  b.cyl(0.4, 0.4, 0.8, P.white, 1.3, 0, 1.4, { seg: 7 });
  return b.build();
};
MAKERS.bld_fishing = () => {
  const b = new B();
  b.cyl(0.14, 0.18, 3.6, P.dwood, -1.2, 0, -1.2, { seg: 6 });
  b.box(0.14, 0.14, 4.4, P.dwood, -1.2, 3.1, 0.6, { rx: 0.35 });
  b.cyl(0.015, 0.015, 1.8, P.dark, -1.2, 1.3, 2.4, { seg: 3 });
  b.box(1.6, 0.9, 1.6, '#2c6a78', -1.2, 0.2, 2.6, { jit: 0.02 }); b.box(1.7, 0.1, 1.7, P.sun, -1.2, 1.05, 2.6);
  b.box(1.2, 0.6, 0.9, P.plank, 0.8, 0, -0.9); b.box(1.2, 0.6, 0.9, P.plank, 0.8, 0, 0.2);
  for (let i = 0; i < 4; i++) b.ball(0.16, i % 2 ? '#ff8a5c' : '#9ab7c4', 0.6 + i * 0.15, 0.68, -0.9 + (i % 2) * 0.3, { sz: 2 });
  b.cyl(0.3, 0.3, 0.7, P.white, 1.3, 0, 1.4, { seg: 7 });
  return b.build();
};
MAKERS.bld_windmill = () => {
  const b = new B();
  b.cyl(0.35, 0.7, 5.6, P.canvas, 0, 0, 0, { seg: 6 });
  for (let i = 0; i < 4; i++) b.cyl(0.36 + i * 0.09, 0.36 + i * 0.09, 0.12, P.rust, 0, 1.2 + i * 1.1, 0, { seg: 6 });
  b.box(0.7, 0.7, 1.2, P.teal, 0, 5.5, 0); b.box(0.06, 0.6, 0.5, P.teal, 0, 5.7, -0.8);
  const r = b.node('rotor', 0, 5.85, 0.7);
  r.box(0.25, 0.25, 0.25, P.dark, 0, -0.12, 0);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; r.box(0.36, 2.6, 0.04, i % 2 ? P.white : P.crimson, Math.sin(a) * 1.35, Math.cos(a) * 1.35 - 1.3, 0.06, { rz: -a }); }
  return b.build();
};
MAKERS.bld_purifier = () => {
  const b = new B();
  b.cyl(1.1, 1.1, 2.6, P.tarp, -0.4, 0, -0.4, { seg: 10 });
  b.cone(1.15, 0.6, P.white, -0.4, 2.6, -0.4, { seg: 10 });
  b.ball(0.35, P.white, -0.4, 1.4, 0.65, { sz: 0.4, sy: 1.3 });
  b.box(1.2, 1.2, 1.2, P.grey, 1.0, 0, 1.0); b.cyl(0.18, 0.18, 1.6, P.dark, 1.3, 1.2, 1.2, { seg: 6 });
  b.hcyl(0.12, 1.4, P.grey, 0.4, 0.5, 0.4, { seg: 6 });
  b.box(0.25, 0.2, 0.06, P.foam, 1.0, 0.8, 1.62, { glow: true });
  b.node('smoke', 1.3, 2.9, 1.2);
  return b.build();
};
MAKERS.bld_garden = () => {
  const b = new B();
  for (const z of [-1.0, 1.0]) {
    b.box(3.2, 0.6, 1.4, P.wood, 0, 0, z);
    b.box(3.0, 0.08, 1.2, '#5a3c26', 0, 0.55, z);
    for (let i = 0; i < 5; i++) b.ball(0.32 + Math.random() * 0.1, i % 2 ? P.leaf : P.green, -1.2 + i * 0.6, 0.8, z + (Math.random() - 0.5) * 0.4, { detail: 0 });
  }
  b.box(0.08, 1.8, 0.08, P.dwood, -1.6, 0, 0); b.box(0.08, 1.8, 0.08, P.dwood, 1.6, 0, 0); b.box(3.3, 0.08, 0.08, P.dwood, 0, 1.75, 0);
  return b.build();
};
MAKERS.bld_solar = () => {
  const b = new B();
  for (const x of [-0.95, 0.95]) for (const z of [-0.95, 0.95]) {
    b.box(0.12, 0.8, 0.12, P.grey, x, 0, z - 0.3);
    b.box(1.75, 0.08, 1.6, '#1f3d7a', x, 0.85, z, { rx: -0.45, jit: 0.02 });
    b.box(1.8, 0.04, 0.06, P.grey, x, 0.92, z, { rx: -0.45 });
  }
  b.box(0.6, 0.5, 0.4, P.sun, 1.5, 0, 1.6);
  return b.build();
};
MAKERS.bld_workshop = () => {
  const b = new B();
  b.box(3.4, 0.1, 3.0, P.dark, 0, 0, -0.3);
  b.box(3.4, 2.4, 0.15, P.teal, 0, 0, -1.75); b.box(0.15, 2.4, 3.0, P.teal, -1.62, 0, -0.3); b.box(0.15, 2.4, 3.0, P.teal, 1.62, 0, -0.3);
  b.box(3.8, 0.14, 3.6, P.grey, 0, 2.6, -0.2, { rx: 0.18 });
  b.box(1.6, 0.9, 0.8, P.wood, -0.5, 0, -0.9); b.box(0.5, 0.35, 0.3, P.dark, -0.4, 0.9, -0.9);
  b.cyl(0.4, 0.4, 0.12, P.sun, 0, 2.95, 1.2, { seg: 8, rx: Math.PI / 2 });
  b.box(0.12, 3.4, 0.12, P.sun, 1.4, 0, 1.4); b.box(0.12, 0.12, 2.0, P.sun, 1.4, 3.3, 0.5); b.box(0.02, 1.4, 0.02, P.dark, 1.4, 1.9, -0.4);
  b.box(0.3, 0.25, 0.3, P.grey, 1.4, 1.7, -0.4);
  b.box(0.5, 0.3, 0.06, P.lamp, 0.6, 1.8, -1.66, { glow: true });
  return b.build();
};
MAKERS.bld_watchtower = () => {
  const b = new B();
  for (const x of [-1.1, 1.1]) for (const z of [-1.1, 1.1]) b.box(0.18, 5.0, 0.18, P.dwood, x * 1.0, 0, z * 1.0, { rx: z * 0.05, rz: -x * 0.05 });
  for (const y of [1.6, 3.2]) { b.box(2.3, 0.1, 0.1, P.wood, 0, y, 1.05); b.box(2.3, 0.1, 0.1, P.wood, 0, y, -1.05); b.box(0.1, 0.1, 2.3, P.wood, 1.05, y, 0); b.box(0.1, 0.1, 2.3, P.wood, -1.05, y, 0); }
  b.box(2.8, 0.2, 2.8, P.plank, 0, 5.0, 0);
  for (const s of [-1, 1]) { b.box(2.8, 0.6, 0.1, P.wood, 0, 5.2, s * 1.35); b.box(0.1, 0.6, 2.8, P.wood, s * 1.35, 5.2, 0); }
  for (const x of [-1.3, 1.3]) for (const z of [-1.3, 1.3]) b.box(0.1, 1.5, 0.1, P.dwood, x, 5.2, z);
  b.cone(2.2, 1.0, P.crimson, 0, 6.7, 0, { seg: 4, ry: Math.PI / 4 });
  b.box(0.3, 0.3, 0.3, P.lamp, 1.3, 6.4, 1.3, { glow: true });
  const t = b.node('turret', 0, 5.2, 0);
  personB(t, 0, 0, 0, { shirt: P.teal, hat: 3 });
  t.box(0.08, 0.08, 1.0, P.dark, 0.25, 0.95, 0.5);
  t.node('muzzle', 0.25, 1.0, 1.05);
  const f = b.node('flag', -1.3, 6.9, -1.3);
  b.cyl(0.03, 0.03, 0.9, P.dark, -1.3, 6.7, -1.3, { seg: 4 });
  f.box(0.03, 0.4, 0.7, P.foam, 0, 0.3, -0.35);
  return b.build();
};
MAKERS.bld_harpoon = () => {
  const b = new B();
  b.cyl(1.3, 1.5, 0.6, P.grey, 0, 0, 0, { seg: 8 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.box(0.5, 0.45, 0.5, '#c2b38a', Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5, { ry: a }); }
  const t = b.node('turret', 0, 0.6, 0);
  t.cyl(0.5, 0.6, 0.5, P.dark, 0, 0, 0, { seg: 7 });
  t.box(0.9, 0.7, 1.6, P.teal, 0, 0.5, 0.1);
  t.box(1.2, 0.9, 0.12, P.steel, 0, 0.45, 0.85);
  t.hcyl(0.1, 1.8, P.dwood, 0, 0.95, 1.4, { alongZ: true, seg: 6 });
  t.cone(0.18, 0.4, P.grey, 0, 0.95, 2.3, { rx: Math.PI / 2, seg: 4 });
  t.node('muzzle', 0, 0.95, 2.4);
  return b.build();
};
MAKERS.bld_trader = () => {
  const b = new B();
  for (let i = 0; i < 6; i++) b.box(0.65, 0.12, 4.2, P.plankL, -1.65 + i * 0.66, 0, 0.1);
  for (const x of [-1.8, 1.8]) for (const z of [-1.8, 2.0]) b.box(0.2, 1.0, 0.2, P.dwood, x, 0, z);
  for (const x of [-1.5, 1.5]) b.box(0.12, 2.6, 0.12, P.dwood, x, 0, -0.8);
  for (let i = 0; i < 6; i++) b.box(0.6, 0.08, 1.8, i % 2 ? P.white : P.red, -1.5 + i * 0.6, 2.6, -0.2, { rx: -0.25, jit: 0 });
  b.box(2.6, 0.9, 0.7, P.wood, 0, 0, -0.9);
  for (const [x, c] of [[-0.8, P.sun], [0, P.blue], [0.8, P.foam]]) b.box(0.4, 0.3, 0.4, c, x, 0.9, -0.9);
  b.cyl(0.04, 0.04, 3.4, P.dark, 1.8, 0, 2.0, { seg: 4 });
  const f = b.node('flag', 1.8, 3.4, 2.0);
  f.box(0.03, 0.5, 0.9, P.sun, 0, -0.25, -0.45); f.box(0.04, 0.2, 0.3, P.navy, 0, -0.25, -0.45);
  return b.build();
};
MAKERS.bld_market = () => {
  const b = new B();
  for (const x of [-1.5, 1.5]) for (const z of [-1.2, 1.2]) b.box(0.12, 2.4, 0.12, P.dwood, x, 0, z);
  for (let i = 0; i < 5; i++) b.box(0.66, 0.1, 2.9, i % 2 ? P.sun : P.rust, -1.32 + i * 0.66, 2.4, 0, { rz: 0.06, jit: 0 });
  b.box(2.8, 0.9, 1.0, P.wood, 0, 0, 0.4);
  for (let i = 0; i < 6; i++) b.box(0.32, 0.25, 0.32, pick([P.red, P.sun, P.foam, P.blue, P.green]), -1.0 + i * 0.4, 0.9, 0.4);
  for (let i = 0; i < 7; i++) b.ball(0.07, pick(['#ff6b6b', '#ffd27a', '#7cf0c8']), -1.5 + i * 0.5, 2.3, 1.25, { glow: true, jit: 0 });
  b.cyl(0.35, 0.35, 0.8, P.blue, -1.3, 0, -1.2, { seg: 7 }); b.box(0.7, 0.6, 0.7, P.plank, 1.2, 0, -1.2);
  return b.build();
};
MAKERS.bld_clinic = () => {
  const b = new B();
  b.box(3.2, 2.2, 2.8, P.white, 0, 0, -0.2);
  b.box(3.5, 0.2, 3.1, P.teal, 0, 2.2, -0.2);
  b.box(0.9, 0.25, 0.08, P.red, 0, 1.6, 1.22, { jit: 0 }); b.box(0.25, 0.9, 0.08, P.red, 0, 1.28, 1.22, { jit: 0 });
  b.box(0.8, 1.4, 0.08, P.tarp, -1.0, 0, 1.22); b.box(0.6, 0.5, 0.08, P.lamp, 1.0, 0.9, 1.22, { glow: true });
  b.box(1.0, 0.8, 1.0, P.white, 0.8, 2.4, -0.6); b.box(0.5, 0.15, 0.08, P.red, 0.8, 2.85, -0.09, { jit: 0 }); b.box(0.15, 0.5, 0.08, P.red, 0.8, 2.68, -0.09, { jit: 0 });
  return b.build();
};
MAKERS.bld_radio = () => {
  const b = new B();
  b.box(1.6, 1.2, 1.4, P.grey, 1.0, 0, 1.0);
  for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) b.box(0.12, 8.4, 0.12, P.red, x * 0.55, 0, z * 0.55, { rx: -z * 0.05, rz: x * 0.05 });
  for (let i = 0; i < 6; i++) { const y = 0.8 + i * 1.3, w = 1.6 - i * 0.16; b.box(w, 0.07, 0.07, i % 2 ? P.white : P.red, 0, y, w / 2 - 0.05); b.box(w, 0.07, 0.07, i % 2 ? P.white : P.red, 0, y, -w / 2 + 0.05); b.box(0.07, 0.07, w, i % 2 ? P.white : P.red, w / 2 - 0.05, y, 0); b.box(0.07, 0.07, w, i % 2 ? P.white : P.red, -w / 2 + 0.05, y, 0); }
  const d = b.node('dish', 0, 8.3, 0);
  d.cone(0.8, 0.4, P.white, 0, 0, 0.2, { rx: Math.PI / 2 + 0.3, seg: 8 }); d.box(0.1, 0.1, 0.8, P.grey, 0, 0.1, 0.2);
  const l = b.node('light', 0, 9.3, 0);
  l.ball(0.18, '#ff4040', 0, 0, 0, { glow: true, jit: 0 });
  b.cyl(0.04, 0.04, 1.0, P.dark, 0, 8.4, 0, { seg: 4 });
  return b.build();
};
MAKERS.rubble = () => {
  const b = new B();
  for (let i = 0; i < 9; i++) b.box(0.4 + Math.random() * 1.0, 0.15 + Math.random() * 0.3, 0.2 + Math.random() * 0.4, pick([P.dwood, P.wood, P.dark, P.rust]), (Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3, { ry: Math.random() * 3, rz: (Math.random() - 0.5) * 0.4 });
  b.box(0.12, 1.1, 0.12, P.dark, 0.6, 0, -0.5, { rz: 0.4 });
  return b.build();
};

// ------------------------------------------------------------ world
// sunken building (made per instance; w × h × d with the roof at y = top)
function ruin(o) {
  const b = new B();
  const { w, d, top, depth } = o;
  const h = top + depth;
  const wall = o.color || pick([P.concrete, '#a9a08e', '#8fa3a8', '#b5a68d', '#7f9a9a']);
  b.box(w, h, d, wall, 0, -depth, 0, { jit: 0.03 });
  const floors = Math.floor(h / 3.2);
  for (let i = 1; i < floors; i++) {
    const y = -depth + i * 3.2;
    b.box(w + 0.1, 0.9, d - 0.6, '#2c3a40', 0, y, 0, { jit: 0.02 });
    b.box(w - 0.6, 0.9, d + 0.1, '#2c3a40', 0, y, 0, { jit: 0.02 });
  }
  if (top > 0) {
    b.box(w + 0.3, 0.4, d + 0.3, wall, 0, top - 0.2, 0);
    if (o.roofJunk) {
      b.box(1.2, 0.9, 1.0, P.grey, w * 0.2, top + 0.2, -d * 0.2);
      b.cyl(0.5, 0.5, 1.4, P.rust, -w * 0.25, top + 0.2, d * 0.2, { seg: 7 });
      for (let i = 0; i < 4; i++) b.ball(0.5 + Math.random() * 0.4, pick([P.leaf, P.moss, P.green]), (Math.random() - 0.5) * w * 0.7, top + 0.3, (Math.random() - 0.5) * d * 0.7);
    }
    b.box(0.1, 1.6, 0.1, P.dark, w * 0.35, top + 0.2, d * 0.35);
    if (o.broken) b.box(w * 0.5, 1.2, d * 0.5, '#2c3a40', w * 0.25, top - 0.8, d * 0.25);
  }
  return b.build();
}
MAKERS.ruin_tower = (o = { w: 10, d: 10, top: 2, depth: 28 }) => ruin(o);
MAKERS.shipwreck = () => {
  const b = new B();
  hull(b, 4.2, 3.6, 11, 3.5, P.rust, '#7a3e2c', -2, -3);
  b.box(3.0, 2.0, 3.0, '#a8aaa0', 0, 0.6, -4);
  b.box(0.8, 0.4, 0.8, P.dark, 0, 2.6, -4);
  b.cyl(0.1, 0.12, 5, P.rust, 0, 0.6, 1.5, { seg: 5, rz: 0.2 });
  for (let i = 0; i < 6; i++) b.box(0.3, 0.3, 0.5, P.rust, 2.12, -1.6 + (i % 2) * 0.8, -6 + i * 1.8, { jit: 0.1 });
  return b.build();
};
MAKERS.rock = () => {
  const b = new B();
  b.rock(2.2, '#8a8f86', 0, 0, 0, { sy: 0.7 }); b.rock(1.3, '#7b8278', 1.4, 0.6, 0.8); b.rock(1.0, '#959a90', -1.3, 0.2, -1.0);
  b.ball(0.7, P.moss, 0.2, 1.4, 0.1, { sy: 0.5 });
  return b.build();
};
MAKERS.buoy = () => {
  const b = new B();
  b.cyl(0.42, 0.42, 0.8, P.red, 0, -0.4, 0, { seg: 8 }); b.cyl(0.3, 0.35, 0.5, P.white, 0, 0.4, 0, { seg: 8 });
  b.box(0.08, 0.9, 0.08, P.dark, 0, 0.9, 0);
  const l = b.node('light', 0, 1.9, 0); l.ball(0.14, P.lamp, 0, 0, 0, { glow: true, jit: 0 });
  return b.build();
};
MAKERS.dive_marker = () => {
  const b = new B();
  b.cyl(0.5, 0.5, 0.7, P.orange, 0, -0.35, 0, { seg: 8 }); b.cone(0.5, 0.3, P.white, 0, 0.35, 0, { seg: 8 });
  b.cyl(0.04, 0.04, 1.6, P.dark, 0, 0.5, 0, { seg: 4 });
  const f = b.node('flag', 0, 2.0, 0);
  f.box(0.04, 0.6, 0.8, P.red, 0, -0.3, 0.4, { jit: 0 }); f.box(0.05, 0.12, 0.95, P.white, 0, -0.3, 0.4, { rx: 0.62, jit: 0 });
  return b.build();
};
MAKERS.ferris_wheel = () => {
  const b = new B();
  const R = 10, segs = 18;
  // the wheel stands in the Y-Z plane, axle along X, hub at the origin
  for (let i = 0; i < segs; i++) {
    const a = i / segs * Math.PI * 2, a2 = (i + 1) / segs * Math.PI * 2;
    const y1 = Math.sin(a) * R, z1 = Math.cos(a) * R, y2 = Math.sin(a2) * R, z2 = Math.cos(a2) * R;
    const len = Math.hypot(y2 - y1, z2 - z1), rim = Math.atan2(z2 - z1, y2 - y1);
    for (const x of [-0.6, 0.6]) b.add(new THREE.BoxGeometry(0.3, len + 0.1, 0.3), i % 3 ? P.white : P.red, x, (y1 + y2) / 2, (z1 + z2) / 2, { rx: rim });
    if (i % 2 === 0) b.add(new THREE.BoxGeometry(0.15, R, 0.15), P.grey, 0, y1 / 2, z1 / 2, { rx: Math.atan2(z1, y1) });
    if (i % 3 === 0) b.box(1.4, 1.2, 1.2, pick([P.sun, P.teal, P.crimson, P.tarp]), 0, y1 - 1.5, z1);
  }
  b.box(1.6, 0.8, 0.8, P.dark, 0, -0.4, 0);
  for (const s of [-1, 1]) b.box(0.4, R + 2, 0.4, P.grey, s * 1.2, -R - 2, 0);
  return b.build();
};
MAKERS.outpost_platform = () => {
  const b = new B();
  for (let i = 0; i < 14; i++) b.box(0.95, 0.25, 13.6, i % 2 ? '#6e5038' : '#7d5b3e', -6.5 + i * 1.0, 0.95, 0, { jit: 0.1 });
  for (const x of [-5.5, -1.8, 1.8, 5.5]) for (const z of [-5.5, -1.8, 1.8, 5.5]) b.cyl(0.6, 0.6, 1.4, pick([P.dark, P.rust, P.crimson]), x, -0.6, z, { seg: 7 });
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.box(0.35, 1.6 + Math.random(), 2.4, pick([P.rust, P.steel, P.dark]), Math.sin(a) * 6.6, 1.2, Math.cos(a) * 6.6, { ry: a, rz: (Math.random() - 0.5) * 0.3 }); }
  for (let i = 0; i < 6; i++) b.cone(0.15, 0.9, P.grey, (Math.random() - 0.5) * 12, 1.2, 6.9 * (i % 2 ? 1 : -1), { seg: 4 });
  b.box(3.0, 2.2, 2.6, P.dark, -2.6, 1.2, 2.4); b.box(3.4, 0.2, 3.0, P.crimson, -2.6, 3.4, 2.4);
  b.box(2.2, 0.4, 0.1, P.lamp, -2.6, 2.4, 3.71, { glow: true });
  for (const [x, z] of [[3, 3], [2.2, 4], [3.6, 2.2]]) b.cyl(0.4, 0.4, 1.0, P.red, x, 1.2, z, { seg: 7 });
  b.cyl(0.06, 0.06, 5.5, P.dark, 4.5, 1.2, -4.5, { seg: 4 });
  const f = b.node('flag', 4.5, 6.6, -4.5);
  f.box(0.04, 1.0, 1.6, P.crimson, 0, -0.5, -0.8); f.box(0.05, 0.4, 0.4, P.white, 0, -0.5, -0.8);
  return b.build();
};
MAKERS.outpost_turret = () => {
  const b = new B();
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; b.box(0.7, 0.55, 0.5, '#b8a678', Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2, { ry: a }); }
  const t = b.node('turret', 0, 0.3, 0);
  t.cyl(0.3, 0.35, 0.6, P.dark, 0, 0, 0, { seg: 6 }); t.box(0.6, 0.4, 0.9, P.steel, 0, 0.6, 0); t.box(0.8, 0.6, 0.08, P.crimson, 0, 0.5, 0.5);
  t.hcyl(0.07, 1.2, P.black, -0.12, 0.8, 0.9, { alongZ: true, seg: 5 }); t.hcyl(0.07, 1.2, P.black, 0.12, 0.8, 0.9, { alongZ: true, seg: 5 });
  t.node('muzzle', 0, 0.8, 1.5);
  return b.build();
};
MAKERS.outpost_cage = () => {
  const b = new B();
  b.box(2.6, 0.15, 2.6, P.dark, 0, 0, 0); b.box(2.7, 0.15, 2.7, P.dark, 0, 2.5, 0);
  for (let i = 0; i < 6; i++) { const t = -1.2 + i * 0.48; b.box(0.07, 2.5, 0.07, P.grey, t, 0, 1.25); b.box(0.07, 2.5, 0.07, P.grey, t, 0, -1.25); b.box(0.07, 2.5, 0.07, P.grey, 1.25, 0, t); b.box(0.07, 2.5, 0.07, P.grey, -1.25, 0, t); }
  personB(b, -0.4, 0.15, 0); personB(b, 0.5, 0.15, 0.3);
  return b.build();
};

// ------------------------------------------------------------ pickups
MAKERS.pick_wood = () => { const b = new B(); for (let i = 0; i < 3; i++) b.box(1.7, 0.2, 0.36, i % 2 ? P.plank : P.plankL, 0, -0.1 + (i === 2 ? 0.2 : 0), -0.4 + i * 0.4, { ry: (Math.random() - 0.5) * 0.4 }); return b.build(); };
MAKERS.pick_plastic = () => { const b = new B(); b.hcyl(0.42, 1.1, P.blue, 0, 0.1, 0, { seg: 8 }); b.cyl(0.13, 0.15, 0.5, '#9fe0ff', 0.6, -0.1, 0.5, { seg: 6, rz: 1.3 }); b.cyl(0.13, 0.15, 0.5, P.foam, -0.5, -0.1, 0.55, { seg: 6, rz: 1.5, ry: 1 }); b.cyl(0.13, 0.15, 0.5, P.sun, 0.1, -0.1, -0.6, { seg: 6, rx: 1.4 }); return b.build(); };
MAKERS.pick_metal = () => { const b = new B(); b.box(1.1, 0.6, 1.1, P.plank, 0, -0.3, 0); b.box(0.9, 0.3, 0.4, P.grey, 0, 0.3, 0.1, { rz: 0.3 }); b.cyl(0.12, 0.12, 1.0, P.steel, 0.2, 0.35, -0.2, { seg: 6, rz: 1.4 }); return b.build(); };
MAKERS.pick_food = () => { const b = new B(); b.box(1.0, 0.5, 0.9, P.plank, 0, -0.25, 0); for (let i = 0; i < 3; i++) b.ball(0.2, '#ff8a5c', -0.25 + i * 0.25, 0.32, 0, { sz: 2.2 }); b.ball(0.25, '#7a5a30', 0.45, 0.3, 0.45); return b.build(); };
MAKERS.pick_fuel = () => { const b = new B(); b.box(0.5, 0.8, 0.8, P.red, 0, -0.3, 0); b.box(0.15, 0.15, 0.3, P.dark, 0, 0.5, 0.25); b.box(0.1, 0.1, 0.5, P.dark, 0, 0.55, -0.15); return b.build(); };
MAKERS.pick_electronics = () => { const b = new B(); b.box(0.9, 0.5, 0.9, '#2f9e5c', 0, -0.2, 0); b.box(0.5, 0.06, 0.5, '#9ff58a', 0, 0.3, 0, { glow: true, jit: 0 }); b.cyl(0.02, 0.02, 0.8, P.dark, 0.3, 0.3, 0.3, { seg: 3 }); return b.build(); };
MAKERS.pick_loot = () => { const b = new B(); b.box(1.2, 0.8, 1.2, P.dark, 0, -0.35, 0); b.box(1.24, 0.12, 1.24, P.crimson, 0, 0.3, 0, { jit: 0 }); b.box(0.3, 0.3, 0.06, P.sun, 0, 0.0, 0.62, { jit: 0 }); return b.build(); };
MAKERS.proj_harpoon = () => { const b = new B(); b.hcyl(0.06, 1.6, P.dwood, 0, 0, -0.2, { alongZ: true, seg: 5 }); b.cone(0.14, 0.45, P.grey, 0, -0.22, 0.8, { rx: Math.PI / 2, seg: 4 }); return b.build(); };
MAKERS.proj_shell = () => { const b = new B(); b.ball(0.3, P.dark, 0, 0, 0, { detail: 0 }); return b.build(); };

// ============================================================ public API
const templates = new Map();
const glb = {};
const mixers = new Set();
let loadedCount = 0;

function init() {
  THREE = window.THREE;
  M4 = new THREE.Matrix4(); Q = new THREE.Quaternion(); E = new THREE.Euler(); V = new THREE.Vector3(); V2 = new THREE.Vector3(); C = new THREE.Color();
}
function template(slot, opt) {
  const key = slot + (opt && opt.variant != null ? '#' + opt.variant : '');
  let t = templates.get(key);
  if (!t) {
    const mk = MAKERS[slot];
    if (!mk) throw new Error('No model maker for slot ' + slot);
    t = mk(opt);
    templates.set(key, t);
  }
  return t;
}
function indexNodes(obj) {
  const nodes = {};
  obj.traverse(o => { if (o.name && !nodes[o.name]) nodes[o.name] = o; });
  obj.userData.nodes = nodes;
  return obj;
}
// a fresh instance of a slot (the .glb if one was loaded, otherwise the low-poly build)
function make(slot, opt) {
  let obj;
  const g = glb[slot];
  if (g) {
    obj = g.skinned && window.SkeletonUtils ? window.SkeletonUtils.clone(g.root) : g.root.clone();
    obj.userData.glb = true;
    if (g.anims.length) {
      const mixer = new THREE.AnimationMixer(obj), actions = {};
      for (const clip of g.anims) actions[clip.name] = mixer.clipAction(clip);
      obj.userData.mixer = mixer; obj.userData.actions = actions; obj.userData.animMap = g.cfg.anims || {};
      mixers.add(mixer);
      play(obj, 'idle');
    }
  } else if (slot === 'ruin_tower') {
    obj = ruin(opt);
  } else {
    obj = template(slot, opt).clone();
  }
  obj.userData.slot = slot;
  return indexNodes(obj);
}
function play(obj, state, fade = 0.25) {
  const u = obj.userData; if (!u.actions) return;
  const name = (u.animMap && u.animMap[state]) || state;
  const a = u.actions[name] || Object.values(u.actions).find(x => x.getClip().name.toLowerCase().includes(state));
  if (!a || u.current === a) return;
  if (u.current) u.current.fadeOut(fade);
  a.reset().fadeIn(fade).play(); u.current = a;
}
function release(obj) { if (obj && obj.userData.mixer) mixers.delete(obj.userData.mixer); }
function tick(dt) { for (const m of mixers) m.update(dt); }
function hasGLB(slot) { return !!glb[slot]; }

// ------------------------------------------------------------ .glb loading
async function loadGLBs(onProgress) {
  const q = new URLSearchParams(location.search).get('models');
  if (q === 'off' || location.protocol === 'file:' || !window.GLTFLoader) return 0;
  let base = q && q !== 'on' ? q : 'assets/models/';
  if (!base.endsWith('/')) base += '/';
  let list;
  try { const r = await fetch(base + 'models.json', { cache: 'no-cache' }); if (!r.ok) return 0; list = await r.json(); }
  catch (e) { return 0; }
  const entries = Object.entries(list).filter(([k]) => !k.startsWith('_'));
  if (!entries.length) return 0;
  const loader = new window.GLTFLoader();
  let done = 0;
  await Promise.all(entries.map(async ([slot, cfg]) => {
    cfg = cfg || {};
    if (!SLOTS[slot]) console.warn('[models] "' + slot + '" is not a known slot — see docs/GLB-MODELS.md');
    try {
      const gltf = await loader.loadAsync(base + (cfg.file || slot + '.glb'));
      prep(slot, gltf, cfg);
      loadedCount++;
    } catch (e) { console.warn('[models] could not load', slot, e && e.message ? e.message : e); }
    if (onProgress) onProgress(++done, entries.length);
  }));
  console.info('[models] loaded', loadedCount, 'of', entries.length, '.glb models');
  return loadedCount;
}
function toonify(m, geo) {
  if (Array.isArray(m)) return m.map(x => toonify(x, geo));
  const t = TB.Gfx.toon({
    color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1), map: m.map || null, vertexColors: !!geo.attributes.color,
    transparent: !!m.transparent, opacity: m.opacity != null ? m.opacity : 1, alphaTest: m.alphaTest || 0, side: m.side,
  });
  if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0) { t.emissive = m.emissive.clone(); t.emissiveMap = m.emissiveMap || null; t.emissiveIntensity = m.emissiveIntensity || 1; }
  return t;
}
function prep(slot, gltf, cfg) {
  const spec = SLOTS[slot] || S(2, 2, 2);
  const root = gltf.scene;
  let skinned = false, tris = 0;
  root.traverse(o => {
    if (o.isSkinnedMesh) skinned = true;
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      if (cfg.toon !== false) o.material = toonify(o.material, o.geometry);
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    }
  });
  const inner = new THREE.Group(); inner.add(root);
  inner.rotation.y = (cfg.yaw || 0) * Math.PI / 180;
  const pivot = new THREE.Group(); pivot.add(inner);
  pivot.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(pivot), sz = box.getSize(new THREE.Vector3());
  let k = 1;
  const fit = cfg.fit === false ? 'none' : (typeof cfg.fit === 'string' ? cfg.fit : spec.fit);
  if (fit === 'h' && sz.y > 0) k = spec.size[1] / sz.y;
  else if (fit === 'xz' && sz.x > 0 && sz.z > 0) k = Math.min(spec.size[0] / sz.z, spec.size[2] / sz.x);
  inner.scale.setScalar(k * (cfg.scale || 1));
  pivot.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(pivot);
  const ctr = box.getCenter(new THREE.Vector3());
  if (cfg.center !== false) { inner.position.x -= ctr.x; inner.position.z -= ctr.z; }
  inner.position.y += (spec.top != null ? spec.top - box.max.y : spec.y - box.min.y) + (cfg.lift || 0);
  glb[slot] = { root: pivot, anims: gltf.animations || [], skinned, cfg };
  const missing = spec.nodes.filter(n => !root.getObjectByName(n));
  console.info(`[models] ${slot}: ${Math.round(tris)} tris, scale ${k.toFixed(3)}${gltf.animations.length ? ', clips: ' + gltf.animations.map(a => a.name).join(', ') : ''}${missing.length ? ' — missing nodes (optional): ' + missing.join(', ') : ''}`);
}

// a see-through copy for build previews
function ghost(slot, mat) {
  const o = make(slot);
  o.traverse(m => { if (m.isMesh) { m.material = mat; m.castShadow = false; m.receiveShadow = false; m.layers.set(1); } });
  return o;
}

TB.Models = { init, make, ghost, play, release, tick, hasGLB, loadGLBs, SLOTS, PERSON_VARIANTS, get loaded() { return loadedCount; } };
})();
