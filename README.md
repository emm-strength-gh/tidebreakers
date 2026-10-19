# TIDEBREAKERS — Floating Civilization

*Build above. Salvage below. Defend what floats.*

A low-poly, toon-shaded, isometric 3D browser game (installable as a PWA). You pilot a salvage boat around a drowned city, HeliFighter-style: net drifting scrap, rescue castaways, dive sunken buildings for electronics and blueprints, and fight Red Wake raiders. Back home you grow a floating town on raft platforms. It needs food, water, power, beds and defenses, and a happy town attracts settlers (and bigger raids).

Design source: `docs/concept/` (the game design document and concept art).

## Play

```bash
node tools/serve.js
```

Then open **http://localhost:8080**. Any static web server works, and so does hosting the folder on GitHub Pages, Netlify and the like. Serve it over http(s): the service worker (offline play / install), `.glb` models and UI skins don't work from `file://`.

**Modes**
- **Campaign:** 8 chapters that teach the game (salvage → water and food → housing and rescues → the first merchant → diving → the first raid → storming an outpost → the Iron Fleet flagship). Afterwards the town keeps going forever.
- **Endless:** build, scavenge and fight forever. Raids start around day 3 and grow with each day, your wealth and your population. A flagship attacks every 10 days. Milestones track your progress.
- Three difficulties, plus an optional **Peaceful seas** (no raids) toggle.

**Controls**

| | Keyboard | Touch |
|---|---|---|
| Steer | WASD / arrows (relative to the screen) | left thumb |
| Deck gun (auto-aims) | Space / J (hold) | GUN |
| Harpoon | K | HARPOON |
| Salvage net / dive | E | NET / DIVE |
| Sonar ping | Q | SONAR |
| Build menu (pauses) | B | Build |
| Boat upgrades | U (Build → Boats tab) | |
| Town · Trade · Quests | I · T · L | left buttons |
| Rotate / zoom camera | Z, C / mouse wheel, + − | buttons, pinch |
| Pause | P / Esc | II |

The game autosaves to the browser (on docking, each new day, pausing and leaving the page). **Continue** on the main menu resumes.

## Claude artifact

`node tools/build-artifact.js` bundles everything into `dist/tidebreakers.html` (one self-contained page for a claude.ai artifact; Three.js still comes from jsDelivr). Re-run it and republish after changing the game. The artifact build has no offline mode or install prompt, and saves live in that browser only.

## Install as an app (PWA)

Open the hosted game in Chrome or Edge and use **Install app** on the main menu (or the browser's install icon). On iPhone/iPad, use *Share → Add to Home Screen*. After the first visit it plays offline.

When you ship changes, bump `VERSION` in `sw.js` so installed copies refresh their cache.

## Make it yours

- **3D models:** every model is a named slot built from low-poly shapes. Replace any of them with a `.glb`. See **[docs/GLB-MODELS.md](docs/GLB-MODELS.md)**. Try `node tools/make-sample-glb.js`, then open `?models=assets/models/_samples/`.
- **UI sprites:** every icon, panel, button, bar, tab, card and touch control can be swapped for your own image (9-slice frames). See **[docs/UI-SPRITES.md](docs/UI-SPRITES.md)**.
- **Sounds:** synthesized by default. Drop files in `assets/audio/` and list them in `assets/audio/sounds.json`.
- **App icons:** `icons/*.png` (redraw with `node tools/make-icons.js`, or replace them with your own art).
- **Balance:** all numbers live in `js/core.js` (`TB.D`): building costs and output, enemies, upgrades, raids, chapters, milestones, merchant offers, difficulty.

URL switches: `?models=off`, `?skin=off`, `?models=<folder>/`.

## Code map

| File | What's in it |
|---|---|
| `index.html`, `style.css` | HUD, menus and panels (DOM, skinnable) |
| `js/core.js` | helpers, event bus, **all tuning data** |
| `js/gfx.js` | renderer, isometric camera, toon material, ink-outline post pass, faceted sea, day/night, particles |
| `js/models.js` | low-poly model builder, every slot's default model, `.glb` loading |
| `js/skin.js` | UI icon/frame skin system and the default vector icons |
| `js/world.js` | drowned city ruins, shipwrecks, drifting salvage, castaways, dive sites, Red Wake outposts |
| `js/town.js` | raft grid, building placement, economy, attractiveness, residents, turrets, repairs |
| `js/boat.js` | the player's boat: steering, weapons, net, rescues, diving, docking |
| `js/actors.js` | raiders and their AI, sharks, swimmers, boarders, the flagship, merchant and migrant ships, projectiles, raid director |
| `js/ui.js` | HUD updates, build menu, Town/Trade/Quests/Settings panels, markers, minimap |
| `js/game.js` | boot, main loop, input, campaign quests, endless milestones, days, saving |
| `js/audio.js` | synthesized sound effects and ambience |
| `sw.js`, `manifest.webmanifest` | PWA: offline cache and install metadata |

Three.js r160 loads from the jsDelivr CDN through the import map in `index.html` and is cached by the service worker for offline play.
