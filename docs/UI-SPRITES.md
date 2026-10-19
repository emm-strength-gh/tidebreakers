# Replacing the interface with sprites

The whole HUD and menu system is built so that every piece can be swapped for your own image without touching code:

- **Icons** (resources, buttons, markers, build cards…) are drawn through one function, `TB.Skin.icon(key)`. It uses the built-in vector art unless your skin lists an image for that key.
- **Frames** (panels, buttons, bars, tabs, cards, touch buttons, joystick, minimap ring, toasts) carry a CSS class `sk-<frame>`. If your skin lists an image for a frame, it becomes a **9-slice** sprite (corners stay crisp, edges and centre stretch).
- **Images** (`logo`, `menu_bg`) replace the title text and menu backdrop.

Everything is listed in **`assets/ui/skin.json`**. Paths are relative to `assets/ui/`. Anything you don't list keeps the default art, so you can reskin piece by piece. Add `?skin=off` to the URL to compare with the defaults. Skins need the game served over http, like models.

```json
{
  "icons": {
    "wood": "icons/wood.png",
    "bld_house": "icons/house_card.png"
  },
  "frames": {
    "panel":  { "src": "frames/panel.png",  "slice": 32, "width": 16 },
    "button": { "src": "frames/button.png", "slice": 20, "width": 10 },
    "touch_button": { "src": "frames/round_button.png", "slice": 48, "width": 24 }
  },
  "images": { "logo": "logo.png", "menu_bg": "menu_bg.jpg" }
}
```

## Frames (9-slice)

| Option | Meaning |
|---|---|
| `src` | the image |
| `slice` | how many pixels in from each edge of the **image** the corners are |
| `width` | how wide the border is drawn **on screen**, in CSS pixels (default: half of `slice`) |
| `repeat` | `stretch` (default), `repeat` or `round` for the edges |
| `padding` | inner padding in pixels, if your art needs more room |

Design frames at 2× (e.g. a 128×128 panel with 32 px corners, `width` 16) so they're sharp on phones.

| Frame key | Used for |
|---|---|
| `panel` | HUD panels (resource bar, clock, objective, boat status), menus, dialogs |
| `panel_header` | header strip of dialogs (Town, Trade, Quests, Settings) |
| `button` | normal buttons (side menu, icon buttons) |
| `button_primary` | main action buttons (Set sail, Resume, Buy) |
| `button_danger` | destructive buttons (Demolish, Delete save) |
| `chip` | pill toggles (difficulty, mode, settings), docked badge |
| `tab`, `tab_active` | build menu tabs |
| `slot`, `slot_selected` | build cards, upgrade cards, list rows |
| `bar_track` | empty part of every bar |
| `bar_hull`, `bar_fuel`, `bar_oxygen`, `bar_progress` | bar fills (hull, fuel, dive, loading & meters) |
| `touch_button`, `touch_button_pressed` | round touch buttons (GUN, HARPOON, NET, SONAR) |
| `joystick_base`, `joystick_knob` | virtual stick |
| `minimap_frame` | ring around the minimap |
| `toast`, `toast_danger` | notifications |
| `tooltip` | build placement hint |
| `banner` | big centre banner (default is text only) |
| `marker` | off-screen arrows container |

## Icons

Recommended: **square PNG with transparency, 64×64 or 96×96**. The game shows them at 14–70 px.

**Resources:** `wood`, `plastic`, `metal`, `electronics`, `food`, `water`, `fuel`, `coins`

**Town stats:** `people`, `mood`, `beds`, `power`, `day`, `night`

**Boat:** `hull`, `cargo`, `seats`, `harpoon`, `gun`, `net`, `dive`, `sonar`, `dock`

**Menus and buttons:** `build`, `upgrade`, `trade`, `quests`, `town`, `map`, `pause`, `play`, `settings`, `sound`, `sound_off`, `rotate_l`, `rotate_r`, `zoom_in`, `zoom_out`, `close`, `check`, `lock`, `warning`, `repair`, `demolish`, `menu`

**Markers and messages:** `raider`, `trader`, `castaway`, `home`, `objective`, `arrow` (the edge-of-screen pointer; draw it pointing **up**), `blueprint`, `star`

**Build menu tabs:** `tab_build`, `tab_production`, `tab_defense`, `tab_civic`, `tab_boats`

**Build cards** (default: rendered from the 3D model): `bld_platform`, `bld_house`, `bld_storage`, `bld_lanterns`, `bld_rain`, `bld_fishing`, `bld_windmill`, `bld_purifier`, `bld_garden`, `bld_solar`, `bld_workshop`, `bld_watchtower`, `bld_harpoon`, `bld_trader`, `bld_market`, `bld_clinic`, `bld_radio`, `bld_hall`. Recommended 128×110.

**Upgrade cards** (default: the boat): `upg_engine`, `upg_hull`, `upg_gun`, `upg_barrels`, `upg_harpoon`, `upg_cargo`, `upg_net`, `upg_tank`, `upg_seats`, `upg_dive`

## Images

| Key | Used for |
|---|---|
| `logo` | replaces the TIDEBREAKERS title text on the main menu (transparent PNG, about 900×200) |
| `menu_bg` | full-screen backdrop behind the main menu (replaces the live 3D town) |

## Fonts and colours

Fonts and the default colour palette are CSS variables at the top of `style.css` (`--display`, `--ui`, `--navy`, `--sun`, …). Change them there to restyle the default (non-sprite) look.

## Sounds

Same idea for audio: list files in `assets/audio/sounds.json` (`"gun": "gun.mp3"`, `"ambient": "waves.ogg"`). Anything not listed stays synthesized.
