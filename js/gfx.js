'use strict';
/* =====================================================================
   TIDEBREAKERS — rendering
   - Orthographic isometric camera (rotates in 90° steps, zooms)
   - Toon materials: banded light, warm rim, underwater tint
   - Ink outlines: post pass that finds edges in a normal + depth buffer
   - Faceted low-poly sea with shallows, foam rings and glitter
   - Day / night lighting, instanced particles
   Layers: 0 = gets outlines, 1 = no outlines (water, particles, ghosts)
   ===================================================================== */
(() => {
const { clamp, lerp } = TB.U;
let THREE, renderer, scene, camera, sun, hemi, water, waterU;
let post = null, quality = 'high';
const shared = {};
const mats = {};
const cam = { tx: 0, tz: 8, yaw: Math.PI / 4, yawT: Math.PI / 4, pitch: 38 * Math.PI / 180, zoom: 48, zoomT: 48, shake: 0, sx: 0, sz: 0 };
const CAM_DIST = 240;
const view = { w: 1, h: 1, dpr: 1 };

const QUALITY = {
  high:   { dpr: 2,   shadow: 2048, outline: true,  msaa: 4 },
  medium: { dpr: 1.5, shadow: 1024, outline: true,  msaa: 0 },
  low:    { dpr: 1,   shadow: 0,    outline: false, msaa: 0 },
};

function init(canvas) {
  THREE = window.THREE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fd3e8');
  camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, CAM_DIST * 2.2);
  camera.layers.enable(1);

  // ---- lights
  hemi = new THREE.HemisphereLight('#cfefff', '#2a7f8e', 1.1);
  scene.add(hemi);
  sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
  scene.add(sun); scene.add(sun.target);

  // ---- toon gradient (4 bands)
  const grad = new THREE.DataTexture(new Uint8Array([85, 150, 215, 255]), 4, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
  shared.grad = grad;
  shared.uDeep = { value: new THREE.Color('#0b5a7a') };
  shared.uRim = { value: new THREE.Color('#ffe0b0') };
  shared.uRimK = { value: 0.22 };

  mats.toon = toon({ vertexColors: true });
  mats.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  mats.ghostOk = new THREE.MeshBasicMaterial({ color: '#5dffb0', transparent: true, opacity: 0.62, depthWrite: false });
  mats.ghostBad = new THREE.MeshBasicMaterial({ color: '#ff4a4a', transparent: true, opacity: 0.62, depthWrite: false });
  mats.ghostWarn = new THREE.MeshBasicMaterial({ color: '#ffb340', transparent: true, opacity: 0.62, depthWrite: false });

  buildWater();
  Fx.init();
  try { const q = localStorage.getItem('tb.quality'); if (q && QUALITY[q]) quality = q; else quality = isTouch() ? 'medium' : 'high'; } catch (e) { quality = 'high'; }
  applyQuality();
  window.addEventListener('resize', resize);
  resize();
}
const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// toon material with rim light + underwater tint, shared by everything
function toon(opts = {}) {
  const m = new THREE.MeshToonMaterial(Object.assign({ gradientMap: shared.grad }, opts));
  patchToon(m);
  return m;
}
function patchToon(m) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uDeep = shared.uDeep; sh.uniforms.uRim = shared.uRim; sh.uniforms.uRimK = shared.uRimK;
    sh.vertexShader = 'varying float vTbY;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 tbW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        tbW = instanceMatrix * tbW;
      #endif
      tbW = modelMatrix * tbW; vTbY = tbW.y;`);
    sh.fragmentShader = 'uniform vec3 uDeep; uniform vec3 uRim; uniform float uRimK; varying float vTbY;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `
      float tbRim = 1.0 - clamp(dot(normalize(normal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
      outgoingLight += uRim * step(0.7, tbRim) * uRimK * diffuseColor.rgb;
      #include <opaque_fragment>
      float tbD = clamp(-vTbY / 9.0, 0.0, 1.0);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep, tbD * 0.82);`);
  };
  m.customProgramCacheKey = () => 'tbtoon' + (m.vertexColors ? 'v' : '') + (m.map ? 'm' : '');
  return m;
}
const colorMats = new Map();
function toonColor(hex) {
  if (!colorMats.has(hex)) colorMats.set(hex, toon({ color: hex }));
  return colorMats.get(hex);
}

// ------------------------------------------------------------------ sea
const MAP_SIZE = 720, MAP_PX = 1024;
let shallowCanvas, shallowCtx, shallowTex;
function buildWater() {
  const geo = new THREE.PlaneGeometry(1000, 1000, 200, 200);
  geo.rotateX(-Math.PI / 2);
  shallowCanvas = document.createElement('canvas'); shallowCanvas.width = shallowCanvas.height = MAP_PX;
  shallowCtx = shallowCanvas.getContext('2d');
  shallowTex = new THREE.CanvasTexture(shallowCanvas);
  shallowTex.colorSpace = THREE.NoColorSpace;
  shallowTex.flipY = false;   // canvas row 0 = world z -MAP_SIZE/2
  waterU = {
    uTime: { value: 0 }, uNight: { value: 0 },
    uDeep: { value: new THREE.Color('#086f9c') }, uMid: { value: new THREE.Color('#18a9c4') }, uShallow: { value: new THREE.Color('#28c7c4') },
    uFoam: { value: new THREE.Color('#f2fffd') }, uSun: { value: new THREE.Vector3(0.4, 1, 0.3).normalize() },
    uMap: { value: shallowTex }, uMapSize: { value: MAP_SIZE },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: waterU, transparent: true, depthWrite: false,
    vertexShader: `
      uniform float uTime; varying vec3 vW;
      float wave(vec2 p, float t) { return 0.22 * sin(p.x * 0.12 + t * 1.1) + 0.16 * sin(p.y * 0.15 + t * 1.4) + 0.08 * sin((p.x + p.y) * 0.31 + t * 2.1); }
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += wave(w.xz, uTime);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uDeep, uMid, uShallow, uFoam, uSun; uniform float uTime, uNight, uMapSize; uniform sampler2D uMap;
      varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y < 0.0) n = -n;
        float sh = texture2D(uMap, vW.xz / uMapSize + 0.5).r;
        vec3 col = mix(uDeep, uMid, smoothstep(0.02, 0.35, sh));
        col = mix(col, uShallow, smoothstep(0.35, 0.8, sh));
        float ndl = dot(n, normalize(uSun));
        col *= ndl > 0.992 ? 1.07 : (ndl > 0.965 ? 1.0 : 0.9);
        float c = vnoise(vW.xz * 0.16 + vec2(uTime * 0.15, uTime * 0.1)) + vnoise(vW.xz * 0.33 - uTime * 0.12);
        col += uShallow * (0.16 + 0.12 * sh) * step(1.28, c);
        float fn = vnoise(vW.xz * 0.55 + uTime * 0.45);
        float foam = step(0.5 + fn * 0.12, sh) * (1.0 - step(0.66 + fn * 0.12, sh));
        float glit = step(0.992, vnoise(vW.xz * 1.6 + vec2(uTime * 0.9, -uTime * 0.6))) * step(0.97, ndl) * (1.0 - uNight) * 0.85;
        col = mix(col, uFoam, max(foam * 0.92, glit));
        float alpha = mix(0.88, 0.6, smoothstep(0.15, 0.8, sh));
        alpha = max(alpha, foam * 0.95);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  water = new THREE.Mesh(geo, mat);
  water.layers.set(1);
  water.renderOrder = 1;
  water.frustumCulled = false;
  scene.add(water);
}
// shallows / foam map: draw(ctx, toPx, scale) is called with a helper to convert world → pixels
function paintShallows(draw) {
  const c = shallowCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000'; c.fillRect(0, 0, MAP_PX, MAP_PX);
  const k = MAP_PX / MAP_SIZE;
  c.setTransform(k, 0, 0, k, MAP_PX / 2, MAP_PX / 2);   // world metres → pixels (x right, z down)
  if ('filter' in c) c.filter = 'blur(4px)';
  draw(c);
  c.filter = 'none';
  shallowTex.needsUpdate = true;
}

// --------------------------------------------------------- outline pass
function buildPost() {
  disposePost();
  const q = QUALITY[quality];
  if (!q.outline) return;
  const w = Math.max(1, Math.floor(view.w * view.dpr)), h = Math.max(1, Math.floor(view.h * view.dpr));
  const rtColor = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa });
  const rtNormal = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
  rtNormal.depthTexture = new THREE.DepthTexture(w, h);
  rtNormal.depthTexture.type = THREE.UnsignedIntType;
  const normalMat = new THREE.MeshNormalMaterial();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rtColor.texture }, tNormal: { value: rtNormal.texture }, tDepth: { value: rtNormal.depthTexture },
      uTexel: { value: new THREE.Vector2(1 / w, 1 / h) }, uInk: { value: new THREE.Color('#13202b') },
      uRange: { value: camera.far - camera.near }, uThick: { value: Math.max(1, view.dpr * 0.9) }, uInkK: { value: 0.85 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tColor, tNormal, tDepth; uniform vec2 uTexel; uniform vec3 uInk; uniform float uRange, uThick, uInkK;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(tColor, vUv).rgb;
        vec2 o = uTexel * uThick;
        vec3 n0 = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
        float d0 = texture2D(tDepth, vUv).x * uRange;
        float en = 0.0, ed = 0.0;
        vec2 offs[4]; offs[0] = vec2(o.x, 0.0); offs[1] = vec2(-o.x, 0.0); offs[2] = vec2(0.0, o.y); offs[3] = vec2(0.0, -o.y);
        for (int i = 0; i < 4; i++) {
          vec2 uv = vUv + offs[i];
          vec3 n = texture2D(tNormal, uv).rgb * 2.0 - 1.0;
          float d = texture2D(tDepth, uv).x * uRange;
          en = max(en, 1.0 - dot(n0, n));
          ed = max(ed, d - d0);
        }
        float edge = max(smoothstep(0.45, 0.75, en), smoothstep(0.5, 1.1, ed));
        col = mix(col, uInk, edge * uInkK);
        vec2 q = vUv - 0.5; col *= 1.0 - 0.35 * dot(q, q);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const ps = new THREE.Scene(); ps.add(quad);
  post = { rtColor, rtNormal, normalMat, mat, scene: ps, cam: new THREE.Camera(), clip: [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05)] };
}
function disposePost() {
  if (!post) return;
  post.rtColor.dispose(); post.rtNormal.dispose(); post.normalMat.dispose(); post.mat.dispose();
  post = null;
}

function applyQuality() {
  const q = QUALITY[quality];
  view.dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  renderer.setPixelRatio(view.dpr);
  sun.castShadow = q.shadow > 0;
  if (q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  renderer.shadowMap.enabled = q.shadow > 0;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  resize();
}
function setQuality(q) {
  if (!QUALITY[q]) return;
  quality = q;
  try { localStorage.setItem('tb.quality', q); } catch (e) { /* storage blocked */ }
  applyQuality();
}

function resize() {
  view.w = window.innerWidth; view.h = window.innerHeight;
  renderer.setSize(view.w, view.h, false);
  renderer.domElement.style.width = view.w + 'px'; renderer.domElement.style.height = view.h + 'px';
  buildPost();
  updateCamera(0);
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  cam.yaw = TB.U.damp(cam.yaw, cam.yawT, 8, dt || 1);
  cam.zoom = TB.U.damp(cam.zoom, cam.zoomT, 8, dt || 1);
  cam.shake = Math.max(0, cam.shake - dt * 2.5);
  const s = cam.shake * cam.shake * 1.2;
  const tx = cam.tx + (Math.random() - 0.5) * s, tz = cam.tz + (Math.random() - 0.5) * s;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  camera.position.set(tx + Math.sin(cam.yaw) * cp * CAM_DIST, sp * CAM_DIST, tz + Math.cos(cam.yaw) * cp * CAM_DIST);
  camera.lookAt(tx, 0, tz);
  // zoom = metres of view height; in portrait it sizes the width instead so phones held upright still see enough sea
  const aspect = view.w / view.h, hh = aspect < 1 ? cam.zoom / 2 * (0.8 / aspect) : cam.zoom / 2;
  camera.left = -hh * aspect; camera.right = hh * aspect; camera.top = hh; camera.bottom = -hh;
  camera.updateProjectionMatrix();
  view.span = hh * 2;
  // the sun (and its shadow box) follows the camera target
  const sd = waterU.uSun.value;
  sun.position.set(cam.tx + sd.x * 150, sd.y * 150, cam.tz + sd.z * 150);
  sun.target.position.set(cam.tx, 0, cam.tz);
  const half = clamp(Math.max(hh * aspect, hh) * 1.24 + 8, 30, 90);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - half) > 1) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
}
// screen directions on the sea surface (for steering relative to the view)
function screenAxes() {
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  return { upX: -s, upZ: -c, rightX: c, rightZ: -s };
}

const _v = { a: null };
function project(x, y, z) {
  const v = _v.a || (_v.a = new THREE.Vector3());
  v.set(x, y, z).project(camera);
  return { x: (v.x + 1) * 0.5 * view.w, y: (1 - v.y) * 0.5 * view.h, on: v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.05 };
}
let _ray = null, _plane = null, _hit = null;
function screenToSea(px, py, y = 0) {
  if (!_ray) { _ray = new THREE.Raycaster(); _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); _hit = new THREE.Vector3(); }
  _ray.setFromCamera({ x: (px / view.w) * 2 - 1, y: -(py / view.h) * 2 + 1 }, camera);
  _plane.constant = -y;
  return _ray.ray.intersectPlane(_plane, _hit) ? { x: _hit.x, z: _hit.z } : null;
}

// ------------------------------------------------------------ day / night
// key: t in day (0 dawn → 1 next dawn)
const SKY = [
  { t: 0.00, sun: '#ffb27a', si: 1.6, sky: '#ffd2b0', gnd: '#2d6b80', hi: 0.95, deep: '#0e5f8a', mid: '#1f9fb8', sh: '#3fd6cf', glow: 0.5, ang: 0.15 },
  { t: 0.12, sun: '#fff1d6', si: 2.4, sky: '#cfefff', gnd: '#2a7f8e', hi: 1.1, deep: '#086f9c', mid: '#18a9c4', sh: '#28c7c4', glow: 0, ang: 0.35 },
  { t: 0.52, sun: '#fff1d6', si: 2.4, sky: '#cfefff', gnd: '#2a7f8e', hi: 1.1, deep: '#086f9c', mid: '#18a9c4', sh: '#28c7c4', glow: 0, ang: 0.65 },
  { t: 0.64, sun: '#ffb060', si: 2.1, sky: '#ffd9a8', gnd: '#3b6f80', hi: 1.0, deep: '#0f5d86', mid: '#1e97ae', sh: '#3cc4bb', glow: 0.3, ang: 0.8 },
  { t: 0.73, sun: '#ff7a5a', si: 1.1, sky: '#a084c0', gnd: '#253a5a', hi: 0.75, deep: '#183e66', mid: '#24607e', sh: '#2f8f9c', glow: 0.8, ang: 0.9 },
  { t: 0.81, sun: '#8fb0ff', si: 0.6, sky: '#5068a8', gnd: '#101a30', hi: 0.6, deep: '#0a2440', mid: '#123a58', sh: '#1d5a70', glow: 1, ang: 0.3 },
  { t: 0.95, sun: '#8fb0ff', si: 0.6, sky: '#5068a8', gnd: '#101a30', hi: 0.6, deep: '#0a2440', mid: '#123a58', sh: '#1d5a70', glow: 1, ang: 0.6 },
  { t: 1.00, sun: '#ffb27a', si: 1.6, sky: '#ffd2b0', gnd: '#2d6b80', hi: 0.95, deep: '#0e5f8a', mid: '#1f9fb8', sh: '#3fd6cf', glow: 0.5, ang: 0.15 },
];
const _ca = {}, _cb = {};
function mixC(target, a, b, t) { target.set(a); (_cb.c || (_cb.c = new THREE.Color())).set(b); target.lerp(_cb.c, t); return target; }
let nightK = 0;
function setTimeOfDay(t, stormK = 0) {
  let i = 0; while (i < SKY.length - 2 && SKY[i + 1].t <= t) i++;
  const a = SKY[i], b = SKY[i + 1], k = clamp((t - a.t) / (b.t - a.t), 0, 1);
  mixC(sun.color, a.sun, b.sun, k);
  sun.intensity = lerp(a.si, b.si, k) * (1 - stormK * 0.4);
  mixC(hemi.color, a.sky, b.sky, k); mixC(hemi.groundColor, a.gnd, b.gnd, k);
  hemi.intensity = lerp(a.hi, b.hi, k);
  mixC(waterU.uDeep.value, a.deep, b.deep, k); mixC(waterU.uMid.value, a.mid, b.mid, k); mixC(waterU.uShallow.value, a.sh, b.sh, k);
  shared.uDeep.value.copy(waterU.uDeep.value).lerp(waterU.uMid.value, 0.3);
  // what shows through the water is the deep sea, not the sky (the iso camera never sees the horizon)
  scene.background.copy(waterU.uDeep.value).multiplyScalar(0.55);
  nightK = lerp(a.glow, b.glow, k);
  waterU.uNight.value = nightK;
  const g = 0.85 + nightK * 0.5; mats.glow.color.setRGB(g, g, g);
  // sun swings across the sky (direction only; height stays high enough for readable shadows)
  const ang = (lerp(a.ang, b.ang, k) - 0.5) * 2.2;
  waterU.uSun.value.set(Math.sin(ang) * 0.75, 1, Math.cos(ang) * 0.45 + 0.35).normalize();
}

// ------------------------------------------------------------------ render
function render(time) {
  waterU.uTime.value = time;
  if (post) {
    camera.layers.enable(0); camera.layers.enable(1);
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(post.rtColor);
    renderer.render(scene, camera);
    // normals + depth of outline-able things, clipped at the waterline
    const bg = scene.background;
    scene.background = null; scene.overrideMaterial = post.normalMat;
    camera.layers.set(0);
    renderer.clippingPlanes = post.clip;
    renderer.setRenderTarget(post.rtNormal);
    renderer.setClearColor(0x000000, 1); renderer.clear();
    renderer.render(scene, camera);
    renderer.clippingPlanes = [];
    scene.overrideMaterial = null; scene.background = bg;
    camera.layers.enable(1);
    renderer.setRenderTarget(null);
    post.mat.uniforms.uRange.value = camera.far - camera.near;
    renderer.render(post.scene, post.cam);
  } else {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }
}

// render an object to a transparent PNG (used for build-menu thumbnails)
let thumbR = null, thumbScene = null, thumbCam = null;
function thumbnail(obj, size = 128, fitScale = 1) {
  if (!thumbR) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    thumbR = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
    thumbR.outputColorSpace = THREE.SRGBColorSpace;
    thumbR.setClearColor(0x000000, 0);
    thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.HemisphereLight('#e6f6ff', '#40606a', 1.3));
    const d = new THREE.DirectionalLight('#fff3dc', 2.6); d.position.set(3, 6, 4); thumbScene.add(d);
    thumbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  }
  thumbR.setSize(size, size, false);
  const box = new THREE.Box3().setFromObject(obj), ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const r = Math.max(sz.x, sz.y, sz.z) * 0.62 / fitScale;
  thumbCam.left = -r; thumbCam.right = r; thumbCam.top = r; thumbCam.bottom = -r; thumbCam.updateProjectionMatrix();
  thumbCam.position.set(ctr.x + 20, ctr.y + 16, ctr.z + 20); thumbCam.lookAt(ctr);
  thumbScene.add(obj);
  thumbR.render(thumbScene, thumbCam);
  thumbScene.remove(obj);
  return thumbR.domElement.toDataURL('image/png');
}
function disposeThumbs() { if (thumbR) { thumbR.dispose(); thumbR.forceContextLoss(); thumbR = null; } }

// =============================================================== particles
const Fx = {
  N: 700, F: 800,
  init() {
    const pg = new THREE.IcosahedronGeometry(1, 0); pg.computeVertexNormals();
    this.pm = new THREE.InstancedMesh(pg, toon({ color: '#ffffff' }), this.N);
    this.pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3);
    this.pm.layers.set(1); this.pm.frustumCulled = false; this.pm.renderOrder = 3;
    scene.add(this.pm);
    const fg = new THREE.CircleGeometry(1, 7); fg.rotateX(-Math.PI / 2);
    this.fm = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ color: '#f4fffd', transparent: true, opacity: 0.85, depthWrite: false }), this.F);
    this.fm.layers.set(1); this.fm.frustumCulled = false; this.fm.renderOrder = 2;
    scene.add(this.fm);
    this.p = []; this.f = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.pv = new THREE.Vector3(); this.col = new THREE.Color();
  },
  puff(x, y, z, o = {}) {
    if (this.p.length >= this.N) this.p.shift();
    this.p.push({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, ml: o.life || 1, s0: o.size || 1, s1: o.end != null ? o.end : 0,
      g: o.grav || 0, drag: o.drag != null ? o.drag : 1.5, c: o.color || '#ffffff', c2: o.color2 || null, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 4 });
  },
  foam(x, z, size = 1, life = 1.4, grow = 1.6) {
    if (this.f.length >= this.F) this.f.shift();
    this.f.push({ x, z, s0: size, s1: size * grow, life, ml: life });
  },
  explode(x, y, z, size = 1) {
    const n = Math.round(10 + size * 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 6) * size;
      this.puff(x, y, z, { vx: Math.cos(a) * sp, vy: 2 + Math.random() * 6 * size, vz: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4, size: (0.6 + Math.random() * 0.8) * size, end: 0.1, color: i % 3 ? '#ffb340' : '#fff2a0', color2: '#ff5a2a', drag: 3 });
    }
    for (let i = 0; i < n * 0.6; i++) {
      const a = Math.random() * Math.PI * 2, sp = (1 + Math.random() * 3) * size;
      this.puff(x, y + 0.5, z, { vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp, life: 1.2 + Math.random() * 1.2, size: (0.8 + Math.random()) * size, end: 1.8 * size, color: '#5a5450', color2: '#2b2a2c', drag: 1.5 });
    }
    for (let i = 0; i < 6 * size; i++) this.puff(x, y, z, { vx: (Math.random() - 0.5) * 14 * size, vy: 6 + Math.random() * 8, vz: (Math.random() - 0.5) * 14 * size, life: 1.2, size: 0.25, end: 0.2, color: '#3a3330', grav: 22, drag: 0.3 });
    if (y < 1.5) this.splash(x, z, size * 1.2);
  },
  splash(x, z, size = 1) {
    for (let i = 0; i < 8 * size + 4; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3 * size;
      this.puff(x, 0.2, z, { vx: Math.cos(a) * sp, vy: 4 + Math.random() * 5 * size, vz: Math.sin(a) * sp, life: 0.7, size: 0.35 * size + 0.15, end: 0.05, color: '#e9fbff', grav: 16, drag: 0.5 });
    }
    this.foam(x, z, 1.2 * size, 1.4, 2.6);
  },
  smoke(x, y, z, k = 1) {
    this.puff(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, { vx: 0.6, vy: 1.6 + Math.random(), vz: 0.3, life: 2.2, size: 0.4 * k, end: 1.5 * k, color: '#4d4846', color2: '#8a8582', drag: 0.4 });
  },
  muzzle(x, y, z) { this.puff(x, y, z, { life: 0.09, size: 0.55, end: 0.1, color: '#fff3a0', drag: 0 }); },
  sparks(x, y, z) {
    for (let i = 0; i < 5; i++) this.puff(x, y, z, { vx: (Math.random() - 0.5) * 9, vy: 2 + Math.random() * 5, vz: (Math.random() - 0.5) * 9, life: 0.35, size: 0.16, end: 0.02, color: '#ffe27a', grav: 18, drag: 0.5 });
  },
  bubbles(x, y, z) { this.puff(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), { vy: 1.2 + Math.random(), life: 1.4, size: 0.12 + Math.random() * 0.12, end: 0.2, color: '#d9f6ff', drag: 0 }); },
  update(dt) {
    const m4 = this.m4, q = this.q, e = this.e, s = this.s, pv = this.pv, col = this.col;
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.life -= dt; if (p.life <= 0) { this.p.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.g && p.y < 0) { p.life = 0; continue; }
      p.rx += p.spin * dt;
    }
    for (const p of this.p) {
      const t = 1 - p.life / p.ml, sc = lerp(p.s0, p.s1, t);
      e.set(p.rx, p.ry + p.rx, 0); q.setFromEuler(e); s.set(sc, sc, sc); pv.set(p.x, p.y, p.z);
      m4.compose(pv, q, s); this.pm.setMatrixAt(n, m4);
      col.set(p.c); if (p.c2) { _ca.c = _ca.c || new THREE.Color(); _ca.c.set(p.c2); col.lerp(_ca.c, t); }
      this.pm.setColorAt(n, col);
      n++;
    }
    this.pm.count = n;
    this.pm.instanceMatrix.needsUpdate = true; if (this.pm.instanceColor) this.pm.instanceColor.needsUpdate = true;
    let m = 0; const tm = waterU.uTime.value;
    for (let i = this.f.length - 1; i >= 0; i--) { const f = this.f[i]; f.life -= dt; if (f.life <= 0) this.f.splice(i, 1); }
    q.identity();
    for (const f of this.f) {
      const t = 1 - f.life / f.ml, sc = lerp(f.s0, f.s1, t) * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) * 0.9);
      s.set(sc, 1, sc); pv.set(f.x, TB.U.wave(f.x, f.z, tm) + 0.06, f.z);
      m4.compose(pv, q, s); this.fm.setMatrixAt(m++, m4);
    }
    this.fm.count = m; this.fm.instanceMatrix.needsUpdate = true;
  },
  clear() { this.p.length = 0; this.f.length = 0; },
};

TB.Gfx = {
  init, render, resize, updateCamera, project, screenToSea, screenAxes, setTimeOfDay, setQuality, toon, patchToon, toonColor, paintShallows, thumbnail, disposeThumbs,
  cam, view, mats, Fx,
  get scene() { return scene; }, get camera() { return camera; }, get renderer() { return renderer; }, get quality() { return quality; }, get night() { return nightK; },
  QUALITY,
};
TB.Fx = Fx;
})();
