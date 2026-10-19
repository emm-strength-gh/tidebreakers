# Replacing models with .glb files

Every 3D model in Tidebreakers is a named **slot**. Out of the box each slot is built in code from simple low-poly shapes (`js/models.js`). Drop in a `.glb` for any slot and the game uses it instead. Slots without a file keep the built-in model, so you can replace them one at a time.

## Quick start

1. Export your model from Blender (or any tool) as **glTF Binary (.glb)**.
2. Name it after the slot, e.g. `boat_player.glb`, and put it in `assets/models/`.
3. List it in `assets/models/models.json`:
   ```json
   { "boat_player": {}, "bld_house": { "scale": 1.1, "yaw": 90 } }
   ```
4. Serve the game over http (`node tools/serve.js`) and open `http://localhost:8080`. Browsers can't load models from a page opened straight from disk (`file://`).
5. Open the browser console. It lists every loaded model with its triangle count, scale and any missing animation nodes.

Want to try it first? `node tools/make-sample-glb.js` writes two sample models into `assets/models/_samples/`. Load them with `http://localhost:8080/?models=assets/models/_samples/`. Use `?models=off` to ignore all `.glb` files.

## Conventions

| | |
|---|---|
| Units | metres |
| Up | +Y |
| Forward | **+Z** (the bow of a boat, the front door of a building) |
| Boats | origin at the waterline (y = 0), centred; the hull may dip below 0 |
| Buildings | origin at the deck surface (y = 0), centred on a 4 m × 4 m tile |
| Platforms / pier | the *top* of the deck is at y = 0 |
| People | feet at y = 0 |
| Floating pickups | roughly centred on the waterline |

By default the game **scales your model to fit the slot size** (table below), centres it, and puts its bottom (or top, for platforms) where it belongs. So exact authoring scale doesn't matter much. Turn that off with `"fit": false` to use your model exactly as authored.

Materials are converted to the game's **toon shading** (banded light, outlines, underwater tint), keeping their base colour, colour texture, vertex colours and emissive. Set `"toon": false` to keep your PBR materials as they are.

## Options in models.json

| Key | Meaning |
|---|---|
| `file` | load a different file name, e.g. `"file": "speedboat_v3.glb"` |
| `scale` | extra size multiplier after fitting |
| `yaw` | turn the model, in degrees (use 180 if it faces backwards) |
| `lift` | move it up or down, in metres |
| `fit` | `true` (default: fit to the slot), `false` (as authored), `"h"` (fit height) or `"xz"` (fit footprint) |
| `center` | `false` keeps your pivot instead of centring the model |
| `toon` | `false` keeps the original materials |
| `anims` | map game states to your clip names, e.g. `{ "walk": "Walk_Cycle", "idle": "Idle_01" }` |

Keys starting with `_` are ignored, so you can leave notes in the file.

## Animated parts (named nodes)

Give these objects these exact names in your scene and the game moves them. All are optional. If one is missing, that part just doesn't animate.

| Node | What the game does |
|---|---|
| `turret` | turns to aim (boats, turrets, watchtower gunner) |
| `muzzle` | where bullets and shells come out (child of `turret`) |
| `turret2`, `muzzle2` | the flagship's rear gun |
| `netbag` | shown only while the salvage net is lowered |
| `flag` | flutters |
| `rotor` | windmill blades, spins around its local Z |
| `dish` | radio dish, spins around Y |
| `light` | blinks |
| `smoke` | smoke comes out here |
| `sail` | sways |
| `tail` | shark tail, swishes |

**Skeletal animation:** characters (`person`, `raider`, `diver`) can carry glTF animation clips. The game plays clips whose names contain `idle`, `walk`, `run` or `attack`, or whatever you map with `anims`.

## Slots

Size is length (Z) × height (Y) × width (X) in metres.

### Boats and ships
| Slot | Size | Nodes |
|---|---|---|
| `boat_player` | 6.0 × 2.6 × 2.6 | turret, muzzle, netbag, flag |
| `raider_skiff` | 4.2 × 1.8 × 1.8 | turret, muzzle |
| `raider_speedboat` | 5.8 × 2.2 × 2.2 | turret, muzzle |
| `raider_gunboat` | 8.2 × 3.6 × 3.2 | turret, muzzle, smoke |
| `boss_ironclad` | 17 × 7.5 × 6.2 | turret, muzzle, turret2, muzzle2, smoke |
| `merchant_ship` | 14 × 10 × 5 | sail |
| `migrant_raft` | 4.2 × 2.4 × 3.2 | |
| `castaway_raft` | 2.8 × 2.6 × 2.6 | flag |
| `swimmer` | 1.8 × 0.7 × 0.7 | |
| `shark` | 3.4 × 1.4 × 1.3 | tail |

### People (fitted by height)
| Slot | Height |
|---|---|
| `person` | 1.6 (residents) |
| `raider` | 1.7 (boarders) |
| `diver` | 1.7 |

### Town (one 4 × 4 m tile each)
| Slot | Height | Nodes |
|---|---|---|
| `platform` | deck top at 0 | |
| `pier` | deck top at 0 | |
| `bld_hall` | 6.5 | flag |
| `bld_house` | 3.6 | |
| `bld_storage` | 3.0 | |
| `bld_lanterns` | 2.8 | |
| `bld_rain` | 3.4 | |
| `bld_fishing` | 4.0 | |
| `bld_windmill` | 7.5 | rotor |
| `bld_purifier` | 4.2 | smoke |
| `bld_garden` | 2.2 | |
| `bld_solar` | 2.0 | |
| `bld_workshop` | 3.8 | |
| `bld_watchtower` | 7.5 | turret, muzzle, flag |
| `bld_harpoon` | 3.0 | turret, muzzle |
| `bld_trader` | 3.8 | flag |
| `bld_market` | 3.4 | |
| `bld_clinic` | 3.8 | |
| `bld_radio` | 10 | dish, light |
| `rubble` | 1.0 | (destroyed building) |

### World
| Slot | Size | Notes |
|---|---|---|
| `ruin_tower` | 10 × 30 × 10 | stretched per building to its footprint and height; most of it sits underwater |
| `shipwreck` | 16 × 6 × 5 | |
| `rock` | 5 × 3 × 5 | |
| `buoy` | 0.9 × 2.2 × 0.9 | light |
| `dive_marker` | 1.2 × 2.4 × 1.2 | flag |
| `ferris_wheel` | landmark | |
| `outpost_platform` | 14 × 3 × 14 | flag |
| `outpost_turret` | 3 × 2.6 × 3 | turret, muzzle |
| `outpost_cage` | 3 × 2.8 × 3 | |

### Floating salvage and projectiles
`pick_wood`, `pick_plastic`, `pick_metal`, `pick_food`, `pick_fuel`, `pick_electronics`, `pick_loot` (raider drops), `proj_harpoon`, `proj_shell`.

## Tips

- Keep models **low poly** (a few hundred to a couple of thousand triangles). Many copies of people, platforms and pickups are on screen at once.
- Flat-shaded faces and simple colours suit the toon shader best. A small colour texture (or vertex colours) is plenty.
- Hosts that refuse to serve `.glb` files: rename the file to anything else (e.g. `boat.bin`) and point `"file"` at it.
- The build menu thumbnails are rendered from the models automatically, so replacing a building also updates its icon unless you set a sprite for it (see UI-SPRITES.md).
