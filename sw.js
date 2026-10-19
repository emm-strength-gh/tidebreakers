/* TIDEBREAKERS service worker — offline play after the first visit.
   Bump VERSION whenever you ship changed game files. */
const VERSION = 'tidebreakers-v2';
const CORE = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/core.js', './js/skin.js', './js/audio.js', './js/gfx.js', './js/models.js', './js/world.js',
  './js/town.js', './js/boat.js', './js/actors.js', './js/ui.js', './js/game.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];
const THREE_BASE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const CDN = [
  THREE_BASE + 'build/three.module.js',
  THREE_BASE + 'examples/jsm/loaders/GLTFLoader.js',
  THREE_BASE + 'examples/jsm/utils/BufferGeometryUtils.js',
  THREE_BASE + 'examples/jsm/utils/SkeletonUtils.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    await Promise.all(CDN.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The game's own files → network first (so edits, new .glb models and skins show up at once),
// falling back to the cache offline. The 3D engine and fonts never change → cache first.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheFirst = url.href.startsWith(THREE_BASE) || url.host.includes('fonts.g');
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (cacheFirst) {
      const hit = await cache.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; } catch (err) { return Response.error(); }
    }
    try {
      const r = await fetch(req);
      if (r.ok && url.origin === location.origin) cache.put(req, r.clone());
      return r;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('./index.html') : null) || Response.error();
    }
  })());
});
