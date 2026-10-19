// Writes small reference .glb models into assets/models/_samples/ to show the
// conventions the game expects (metres, +Z forward, Y up, named nodes).
// Try them in game with:  http://localhost:8080/?models=assets/models/_samples/
// Usage: node tools/make-sample-glb.js
'use strict';
const fs = require('fs');
const path = require('path');

// ---- tiny glTF writer: boxes with vertex colours, grouped into named nodes
function boxGeo(w, h, d, x, y, z, rgb) {
  const P = [], N = [], C = [];
  const hw = w / 2, hd = d / 2;
  const faces = [
    [[1, 0, 0], [[hw, 0, -hd], [hw, h, -hd], [hw, h, hd], [hw, 0, hd]]],
    [[-1, 0, 0], [[-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd], [-hw, 0, -hd]]],
    [[0, 1, 0], [[-hw, h, -hd], [-hw, h, hd], [hw, h, hd], [hw, h, -hd]]],
    [[0, -1, 0], [[-hw, 0, hd], [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd]]],
    [[0, 0, 1], [[hw, 0, hd], [hw, h, hd], [-hw, h, hd], [-hw, 0, hd]]],
    [[0, 0, -1], [[-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd], [hw, 0, -hd]]],
  ];
  for (const [n, q] of faces) for (const i of [0, 1, 2, 0, 2, 3]) { P.push(q[i][0] + x, q[i][1] + y, q[i][2] + z); N.push(...n); C.push(...rgb); }
  return { P, N, C };
}
const lin = hex => [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });

function writeGLB(file, parts) {
  // parts: { name, t:[x,y,z], boxes:[[w,h,d,x,y,z,hex]], children:[...] }
  const gltf = { asset: { version: '2.0', generator: 'tidebreakers sample' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [],
    materials: [{ name: 'vertex_colour', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }] };
  const bins = [];
  let off = 0;
  const addView = (arr, min, max) => {
    const buf = Buffer.from(new Float32Array(arr).buffer);
    gltf.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target: 34962 });
    bins.push(buf); off += buf.length;
    const a = { bufferView: gltf.bufferViews.length - 1, componentType: 5126, count: arr.length / 3, type: 'VEC3' };
    if (min) { a.min = min; a.max = max; }
    gltf.accessors.push(a);
    return gltf.accessors.length - 1;
  };
  const addNode = p => {
    const idx = gltf.nodes.length;
    const node = { name: p.name };
    if (p.t) node.translation = p.t;
    gltf.nodes.push(node);
    if (p.boxes && p.boxes.length) {
      const P = [], N = [], C = [];
      for (const [w, h, d, x, y, z, hex] of p.boxes) { const g = boxGeo(w, h, d, x, y, z, lin(hex)); P.push(...g.P); N.push(...g.N); C.push(...g.C); }
      const min = [0, 1, 2].map(k => Math.min(...P.filter((_, i) => i % 3 === k))), max = [0, 1, 2].map(k => Math.max(...P.filter((_, i) => i % 3 === k)));
      const pos = addView(P, min, max), nor = addView(N), col = addView(C);
      gltf.meshes.push({ name: p.name + '_mesh', primitives: [{ attributes: { POSITION: pos, NORMAL: nor, COLOR_0: col }, material: 0 }] });
      node.mesh = gltf.meshes.length - 1;
    }
    if (p.children) node.children = p.children.map(addNode);
    return idx;
  };
  addNode(parts);
  const bin = Buffer.concat(bins);
  gltf.buffers.push({ byteLength: bin.length });
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const binPad = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546C67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + binPad.length, 8);
  const ch = (buf, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buf.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, buf]); };
  fs.writeFileSync(file, Buffer.concat([header, ch(json, 0x4E4F534A), ch(binPad, 0x004E4942)]));
}

const out = path.join(__dirname, '..', 'assets', 'models', '_samples');
fs.mkdirSync(out, { recursive: true });

// player boat: forward is +Z, waterline at y = 0 (hull dips below it)
writeGLB(path.join(out, 'boat_player.glb'), {
  name: 'boat_player',
  boxes: [[2.4, 1.0, 5.4, 0, -0.45, 0, '#7a4bd6'], [2.0, 0.1, 5.0, 0, 0.55, 0, '#e8d6a8'], [1.4, 1.1, 1.6, 0, 0.6, -1.0, '#f2f2f2'], [1.6, 0.12, 1.8, 0, 1.7, -1.0, '#ff7ab8'], [0.6, 0.8, 0.5, 0, 0.2, -2.9, '#333333']],
  children: [
    { name: 'turret', t: [0, 0.65, 1.4], boxes: [[0.6, 0.4, 0.8, 0, 0, 0, '#444b55'], [0.12, 0.12, 1.1, 0, 0.2, 0.9, '#111111']],
      children: [{ name: 'muzzle', t: [0, 0.26, 1.5] }] },
    { name: 'netbag', t: [0, 0.2, -3.3], boxes: [[2.0, 0.7, 1.2, 0, -0.5, -0.6, '#2c6a78']] },
    { name: 'flag', t: [-0.5, 2.6, -1.4], boxes: [[0.04, 0.4, 0.6, 0, -0.2, -0.3, '#ffd24a']] },
  ],
});
// house on one 4 m tile, deck surface at y = 0
writeGLB(path.join(out, 'bld_house.glb'), {
  name: 'bld_house',
  boxes: [[3.0, 2.2, 2.8, 0, 0, 0, '#7a4bd6'], [3.4, 0.3, 3.2, 0, 2.2, 0, '#ff7ab8'], [0.8, 1.3, 0.1, -0.6, 0, 1.42, '#3a2a1a'], [0.7, 0.6, 0.1, 0.7, 1.0, 1.42, '#ffe38a']],
});
fs.writeFileSync(path.join(out, 'models.json'), JSON.stringify({ _readme: 'Sample models. Load with ?models=assets/models/_samples/', boat_player: {}, bld_house: {} }, null, 2));
console.log('sample models written to', out);
