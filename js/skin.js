'use strict';
/* =====================================================================
   TIDEBREAKERS — UI skin layer (replace any UI piece with your own sprite)

   Every icon in the interface is drawn through Skin.icon(key) and every
   panel / button / bar / touch control carries a frame class (sk-<frame>).
   Out of the box they use the built-in vector art below. To reskin, list
   your images in assets/ui/skin.json — anything not listed keeps the
   default. See docs/UI-SPRITES.md for every key and recommended sizes.

   skin.json:
   {
     "icons":  { "wood": "icons/wood.png", "bld_house": "icons/house.png" },
     "frames": { "panel": { "src": "frames/panel.png", "slice": 32, "width": 16 } },
     "images": { "logo": "logo.png" }
   }
   Paths are relative to assets/ui/. ?skin=off in the URL ignores the skin.
   ===================================================================== */
(() => {

const BASE = 'assets/ui/';
const INK = '#14232c';
const st = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const svg = body => `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

// ------------------------------------------------------- default icon art
const ICONS = {
  // resources
  wood: svg(`<rect x="4" y="16" width="24" height="7" rx="3" fill="#b5773f" ${st}/><rect x="6" y="9" width="22" height="7" rx="3" fill="#d4945a" ${st}/><circle cx="25" cy="12.5" r="2" fill="#f2c48c"/><circle cx="7.5" cy="19.5" r="2" fill="#e0a86e"/>`),
  plastic: svg(`<rect x="8" y="6" width="16" height="22" rx="4" fill="#4fb8e0" ${st}/><rect x="12" y="3" width="8" height="5" rx="1.5" fill="#2e7fb0" ${st}/><path d="M11 13h10M11 19h10" stroke="#bfefff" stroke-width="2"/>`),
  metal: svg(`<path d="M4 22l6-12h14l4 12z" fill="#9aa8b4" ${st}/><path d="M10 10l3 12M18 10l-1 12" stroke="#6d7a86" stroke-width="2"/><circle cx="22" cy="17" r="2" fill="#d5dde3"/>`),
  electronics: svg(`<rect x="6" y="8" width="20" height="16" rx="2" fill="#2f9e5c" ${st}/><rect x="11" y="12" width="10" height="8" fill="#1d5a39"/><path d="M9 8V4M14 8V4M19 8V4M23 8V4M9 24v4M14 24v4M19 24v4M23 24v4" ${st}/><circle cx="16" cy="16" r="2" fill="#9ff58a"/>`),
  food: svg(`<path d="M4 16c4-7 14-8 20 0-6 8-16 7-20 0z" fill="#ff8a5c" ${st}/><path d="M24 16l5-5v10z" fill="#ff6e3a" ${st}/><circle cx="10" cy="14.5" r="1.6" fill="${INK}"/>`),
  water: svg(`<path d="M16 3c5 8 9 12 9 17a9 9 0 0 1-18 0c0-5 4-9 9-17z" fill="#3aa8f0" ${st}/><path d="M12 19a4 4 0 0 0 4 4" stroke="#c9ecff" stroke-width="2.4" fill="none" stroke-linecap="round"/>`),
  fuel: svg(`<path d="M7 9l4-4h12a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#e8463a" ${st}/><path d="M11 13l10 10M21 13L11 23" stroke="#ffd1c9" stroke-width="2.2"/><rect x="18" y="2" width="5" height="4" fill="#7a2a24" ${st}/>`),
  coins: svg(`<ellipse cx="16" cy="22" rx="10" ry="4" fill="#d9a520" ${st}/><ellipse cx="16" cy="17" rx="10" ry="4" fill="#f0c03a" ${st}/><ellipse cx="16" cy="12" rx="10" ry="4" fill="#ffd95a" ${st}/><path d="M13 12h6" stroke="#a87808" stroke-width="2"/>`),
  // stats
  people: svg(`<circle cx="11" cy="10" r="4.5" fill="#f2c79a" ${st}/><path d="M3 27c0-6 4-9 8-9s8 3 8 9z" fill="#4a9a8e" ${st}/><circle cx="22" cy="12" r="4" fill="#e0a77a" ${st}/><path d="M15 27c0-5 3-8 7-8s7 3 7 8z" fill="#f8c55b" ${st}/>`),
  mood: svg(`<circle cx="16" cy="16" r="12" fill="#ffd24a" ${st}/><circle cx="11.5" cy="13" r="1.8" fill="${INK}"/><circle cx="20.5" cy="13" r="1.8" fill="${INK}"/><path d="M10 19c3 4 9 4 12 0" ${st} fill="none"/>`),
  beds: svg(`<rect x="3" y="15" width="26" height="8" rx="2" fill="#c95b3c" ${st}/><rect x="5" y="11" width="8" height="5" rx="2" fill="#f4efe2" ${st}/><path d="M4 23v4M28 23v4" ${st}/>`),
  power: svg(`<path d="M18 2L7 18h8l-2 12 12-17h-8z" fill="#ffd24a" ${st}/>`),
  day: svg(`<circle cx="16" cy="16" r="7" fill="#ffc23a" ${st}/><path d="M16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M6 26l3-3M23 9l3-3" ${st}/>`),
  night: svg(`<path d="M21 4a12 12 0 1 0 7 18A10 10 0 0 1 21 4z" fill="#c9d6ff" ${st}/><circle cx="9" cy="8" r="1.2" fill="#fff"/>`),
  hull: svg(`<path d="M3 15h26l-4 10H8z" fill="#c95b3c" ${st}/><rect x="10" y="8" width="10" height="7" fill="#f4efe2" ${st}/><path d="M13 11h4" ${st}/>`),
  cargo: svg(`<rect x="5" y="9" width="22" height="17" rx="2" fill="#c48a52" ${st}/><path d="M5 15h22M16 9v17" ${st}/>`),
  seats: svg(`<circle cx="16" cy="16" r="11" fill="none" stroke="#ff6e3a" stroke-width="6"/><circle cx="16" cy="16" r="11" fill="none" stroke="#f4efe2" stroke-width="6" stroke-dasharray="8.6 8.6"/><circle cx="16" cy="16" r="14" fill="none" ${st}/><circle cx="16" cy="16" r="8" fill="none" ${st}/>`),
  // actions
  gun: svg(`<rect x="3" y="13" width="16" height="7" rx="2" fill="#5c6b78" ${st}/><rect x="19" y="14.5" width="10" height="4" fill="#3c4a56" ${st}/><path d="M8 20l-2 7h6l1-7" fill="#3c4a56" ${st}/>`),
  harpoon: svg(`<path d="M4 28L24 8" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M4 28L24 8" stroke="#c9b48a" stroke-width="2.5" stroke-linecap="round"/><path d="M28 4l-9 3 6 6z" fill="#cfd8de" ${st}/>`),
  net: svg(`<path d="M5 6h22l-4 20H9z" fill="#2c6a78" ${st}/><path d="M9 6l3 20M16 6v20M23 6l-3 20M6 12h20M7 18h18" stroke="#9fe0e6" stroke-width="1.6"/>`),
  dive: svg(`<circle cx="16" cy="13" r="9" fill="#3aa8f0" ${st}/><rect x="10" y="9" width="12" height="7" rx="3" fill="#c9ecff" ${st}/><circle cx="25" cy="25" r="2.5" fill="#c9ecff" ${st}/><circle cx="20" cy="28" r="1.6" fill="#c9ecff"/>`),
  sonar: svg(`<circle cx="16" cy="16" r="3.5" fill="#79dfc1" ${st}/><path d="M9 9a10 10 0 0 0 0 14M23 9a10 10 0 0 1 0 14M5 5a15 15 0 0 0 0 22M27 5a15 15 0 0 1 0 22" ${st} fill="none"/>`),
  build: svg(`<path d="M5 27l11-11" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M5 27l11-11" stroke="#c48a52" stroke-width="3" stroke-linecap="round"/><path d="M13 7l7-3 8 8-3 7-5-5-3 1z" fill="#9aa8b4" ${st}/>`),
  upgrade: svg(`<path d="M16 3l11 12h-6v13H11V15H5z" fill="#79dfc1" ${st}/>`),
  trade: svg(`<path d="M4 12h18l-4-5M28 20H10l4 5" ${st} fill="none" stroke-width="3"/><path d="M4 12h18M28 20H10" stroke="#ffd24a" stroke-width="1.6"/>`),
  quests: svg(`<rect x="7" y="4" width="18" height="24" rx="2" fill="#f4e3c0" ${st}/><path d="M11 10h10M11 15h10M11 20h6" ${st}/><path d="M22 18l2 2 4-5" stroke="#2f9e5c" stroke-width="2.6" fill="none" stroke-linecap="round"/>`),
  town: svg(`<rect x="3" y="22" width="26" height="5" fill="#9a6b43" ${st}/><rect x="6" y="13" width="9" height="9" fill="#f8c55b" ${st}/><path d="M5 13l5.5-6 5.5 6z" fill="#c95b3c" ${st}/><rect x="18" y="10" width="8" height="12" fill="#4a9a8e" ${st}/><path d="M22 10V4l4 2-4 2" fill="#c95b3c" ${st}/>`),
  map: svg(`<path d="M3 7l8-3 10 3 8-3v21l-8 3-10-3-8 3z" fill="#f4e3c0" ${st}/><path d="M11 4v21M21 7v21" ${st}/><circle cx="16" cy="15" r="2" fill="#c95b3c"/>`),
  pause: svg(`<rect x="8" y="6" width="6" height="20" rx="1.5" fill="#f4efe2" ${st}/><rect x="18" y="6" width="6" height="20" rx="1.5" fill="#f4efe2" ${st}/>`),
  play: svg(`<path d="M9 5l18 11L9 27z" fill="#79dfc1" ${st}/>`),
  settings: svg(`<path d="M16 4l3 3 4-1 1 4 4 2-2 4 2 4-4 2-1 4-4-1-3 3-3-3-4 1-1-4-4-2 2-4-2-4 4-2 1-4 4 1z" fill="#cfd8de" ${st}/><circle cx="16" cy="16" r="4" fill="#5c6b78" ${st}/>`),
  sound: svg(`<path d="M4 12h6l7-6v20l-7-6H4z" fill="#f4efe2" ${st}/><path d="M21 11a6 6 0 0 1 0 10M24 7a11 11 0 0 1 0 18" ${st} fill="none"/>`),
  sound_off: svg(`<path d="M4 12h6l7-6v20l-7-6H4z" fill="#f4efe2" ${st}/><path d="M21 12l7 8M28 12l-7 8" ${st}/>`),
  rotate_l: svg(`<path d="M8 12a10 10 0 1 1 1 10" ${st} fill="none" stroke-width="3"/><path d="M3 6l5 7 7-4z" fill="#f4efe2" ${st}/>`),
  rotate_r: svg(`<path d="M24 12a10 10 0 1 0-1 10" ${st} fill="none" stroke-width="3"/><path d="M29 6l-5 7-7-4z" fill="#f4efe2" ${st}/>`),
  zoom_in: svg(`<circle cx="14" cy="14" r="9" fill="#c9ecff" ${st}/><path d="M21 21l7 7M10 14h8M14 10v8" ${st} stroke-width="2.6"/>`),
  zoom_out: svg(`<circle cx="14" cy="14" r="9" fill="#c9ecff" ${st}/><path d="M21 21l7 7M10 14h8" ${st} stroke-width="2.6"/>`),
  close: svg(`<path d="M8 8l16 16M24 8L8 24" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M8 8l16 16M24 8L8 24" stroke="#f4efe2" stroke-width="3" stroke-linecap="round"/>`),
  check: svg(`<path d="M5 17l7 7L27 8" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 17l7 7L27 8" stroke="#79dfc1" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  lock: svg(`<rect x="7" y="14" width="18" height="14" rx="2" fill="#f8c55b" ${st}/><path d="M11 14V10a5 5 0 0 1 10 0v4" ${st} fill="none" stroke-width="3"/><circle cx="16" cy="21" r="2" fill="${INK}"/>`),
  warning: svg(`<path d="M16 3l14 25H2z" fill="#ffd24a" ${st}/><path d="M16 12v8" ${st} stroke-width="3"/><circle cx="16" cy="24" r="1.6" fill="${INK}"/>`),
  raider: svg(`<path d="M6 13a10 10 0 0 1 20 0v6l-3 2v5H9v-5l-3-2z" fill="#f4efe2" ${st}/><circle cx="12" cy="15" r="3" fill="#b93b46" ${st}/><circle cx="20" cy="15" r="3" fill="#b93b46" ${st}/><path d="M13 22v4M16 22v4M19 22v4" ${st}/>`),
  trader: svg(`<path d="M16 3v19" ${st}/><path d="M17 4l10 14H17z" fill="#f4efe2" ${st}/><path d="M15 7L6 18h9z" fill="#f8c55b" ${st}/><path d="M3 22h26l-4 6H7z" fill="#9a6b43" ${st}/>`),
  castaway: svg(`<circle cx="16" cy="9" r="4.5" fill="#f2c79a" ${st}/><path d="M9 4l3 3M23 4l-3 3" ${st}/><path d="M3 21h26l-3 6H6z" fill="#c48a52" ${st}/><path d="M10 21c0-5 3-7 6-7s6 2 6 7" fill="#f8c55b" ${st}/>`),
  home: svg(`<path d="M4 15L16 4l12 11" fill="none" ${st} stroke-width="3"/><path d="M7 14v13h18V14L16 6z" fill="#f8c55b" ${st}/><rect x="13" y="19" width="6" height="8" fill="#c95b3c" ${st}/>`),
  blueprint: svg(`<rect x="4" y="5" width="24" height="22" rx="2" fill="#2f6fb0" ${st}/><path d="M8 22V12l5-4 5 4v10zM20 22h5M20 17h5M20 12h3" stroke="#c9ecff" stroke-width="1.6" fill="none"/>`),
  star: svg(`<path d="M16 3l4 8.5 9 1.2-6.6 6.2 1.7 9L16 23.5 7.9 28l1.7-9L3 12.7l9-1.2z" fill="#ffd24a" ${st}/>`),
  repair: svg(`<path d="M20 4a6 6 0 0 0-5 8L4 23l5 5 11-11a6 6 0 0 0 8-5l-4 2-4-4z" fill="#cfd8de" ${st}/>`),
  demolish: svg(`<path d="M6 9h20l-2 19H8z" fill="#c95b3c" ${st}/><path d="M4 9h24M12 5h8v4h-8zM12 13v11M16 13v11M20 13v11" ${st}/>`),
  dock: svg(`<path d="M16 4v20M9 10h14M6 18a10 10 0 0 0 20 0" ${st} fill="none" stroke-width="3"/><circle cx="16" cy="5" r="2.5" fill="#f4efe2" ${st}/>`),
  objective: svg(`<circle cx="16" cy="16" r="12" fill="#c95b3c" ${st}/><circle cx="16" cy="16" r="7" fill="#f4efe2" ${st}/><circle cx="16" cy="16" r="2.5" fill="#c95b3c"/>`),
  arrow: svg(`<path d="M16 3l11 22-11-5-11 5z" fill="#ffd24a" ${st}/>`),
  menu: svg(`<path d="M6 9h20M6 16h20M6 23h20" ${st} stroke-width="3.5"/>`),
  // build bar tabs
  tab_build: svg(`<path d="M3 20l13-8 13 8-13 8z" fill="#c48a52" ${st}/><path d="M3 20v3l13 8 13-8v-3" fill="#9a6b43" ${st}/>`),
  tab_production: svg(`<circle cx="16" cy="16" r="6" fill="#cfd8de" ${st}/><path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3.5 3.5M21.5 21.5L25 25M7 25l3.5-3.5M21.5 10.5L25 7" ${st} stroke-width="3"/>`),
  tab_defense: svg(`<path d="M16 3l11 4v8c0 7-5 12-11 14-6-2-11-7-11-14V7z" fill="#4a9a8e" ${st}/><path d="M11 16l4 4 7-8" ${st} stroke="#f4efe2" fill="none" stroke-width="3"/>`),
  tab_civic: svg(`<path d="M4 12h24L16 4z" fill="#c95b3c" ${st}/><path d="M7 12v12M13 12v12M19 12v12M25 12v12" ${st} stroke-width="3"/><rect x="3" y="24" width="26" height="4" fill="#f4e3c0" ${st}/>`),
  tab_boats: svg(`<path d="M3 18h26l-5 8H8z" fill="#f4efe2" ${st}/><rect x="11" y="11" width="10" height="7" fill="#4a9a8e" ${st}/><path d="M2 29c4-2 6-2 10 0s6 2 10 0 6-2 8 0" ${st} fill="none"/>`),
};
// short-hand fallbacks for building keys until 3D thumbnails are rendered
for (const k of ['platform', 'house', 'storage', 'lanterns', 'rain', 'fishing', 'windmill', 'purifier', 'garden', 'solar', 'workshop', 'watchtower', 'harpoon', 'trader', 'market', 'clinic', 'radio', 'hall'])
  ICONS['bld_' + k] = ICONS.town;
for (const k of Object.keys(TB.D.UPG)) ICONS['upg_' + k] = ICONS.upgrade;

// every frame the UI uses (class sk-<name>); documented in docs/UI-SPRITES.md
const FRAMES = ['panel', 'panel_header', 'button', 'button_primary', 'button_danger', 'chip', 'tab', 'tab_active', 'slot', 'slot_selected',
  'bar_track', 'bar_hull', 'bar_fuel', 'bar_oxygen', 'bar_progress', 'touch_button', 'touch_button_pressed', 'joystick_base', 'joystick_knob',
  'minimap_frame', 'toast', 'toast_danger', 'tooltip', 'banner', 'marker'];

const skin = { icons: {}, frames: {}, images: {} };
const defaults = {};          // runtime defaults (e.g. 3D-rendered building thumbnails)
const imgCache = {};
const off = /[?&]skin=off/.test(location.search);

function url(p) { return /^(data:|blob:|https?:)/.test(p) ? p : BASE + p; }

async function load() {
  if (off || location.protocol === 'file:') return;
  let j = null;
  try { const r = await fetch(BASE + 'skin.json', { cache: 'no-cache' }); if (r.ok) j = await r.json(); } catch (e) { /* no skin: defaults */ }
  if (!j) return;
  for (const [k, v] of Object.entries(j.icons || {})) if (!k.startsWith('_') && v) skin.icons[k] = url(v);
  for (const [k, v] of Object.entries(j.images || {})) if (!k.startsWith('_') && v) skin.images[k] = url(v);
  for (const [k, v] of Object.entries(j.frames || {})) if (!k.startsWith('_') && v) skin.frames[k] = typeof v === 'string' ? { src: url(v) } : Object.assign({}, v, { src: url(v.src) });
  applyFrames();
  console.info('[skin] loaded', Object.keys(skin.icons).length, 'icons,', Object.keys(skin.frames).length, 'frames,', Object.keys(skin.images).length, 'images');
}

// Turns each skinned frame into a 9-slice border-image rule
function applyFrames() {
  let css = '';
  for (const [name, f] of Object.entries(skin.frames)) {
    const s = f.slice != null ? f.slice : 24, w = f.width != null ? f.width : s / 2;
    const pad = f.padding != null ? `padding:${f.padding}px;` : '';
    css += `.sk-${name}{border-style:solid!important;border-color:transparent!important;border-width:${w}px!important;` +
      `border-image:url("${f.src}") ${s} fill / ${w}px / 0 ${f.repeat || 'stretch'}!important;background:none!important;box-shadow:none!important;border-radius:0!important;${pad}}\n`;
  }
  for (const [name, src] of Object.entries(skin.images)) css += `:root{--sk-img-${name}:url("${src}")}\n`;
  const el = document.createElement('style'); el.id = 'skin-css'; el.textContent = css; document.head.appendChild(el);
  for (const name of Object.keys(skin.images)) document.documentElement.classList.add('skin-img-' + name);
}

function icon(key, cls = '') {
  const src = skin.icons[key] || defaults[key];
  const inner = src ? `<img src="${src}" alt="" draggable="false">` : (ICONS[key] || ICONS.star);
  return `<span class="ico ${cls}" data-ico="${key}">${inner}</span>`;
}
// fills <span data-ico="key"> placeholders in static HTML
function hydrate(root = document) {
  root.querySelectorAll('[data-ico]').forEach(el => {
    if (el.dataset.done) return;
    const tmp = document.createElement('div'); tmp.innerHTML = icon(el.dataset.ico);
    el.classList.add('ico'); el.innerHTML = tmp.firstChild.innerHTML; el.dataset.done = '1';
  });
}
// image for canvas drawing (minimap); null when the key has no image
function img(key) {
  const src = skin.icons[key];
  if (!src) return null;
  if (!imgCache[key]) { const im = new Image(); im.src = src; imgCache[key] = im; }
  return imgCache[key].complete && imgCache[key].naturalWidth ? imgCache[key] : null;
}
function setDefault(key, src) { defaults[key] = src; }
function has(key) { return !!skin.icons[key]; }

TB.Skin = { load, icon, hydrate, img, setDefault, has, ICONS, FRAMES, skin };
})();
