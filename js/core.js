'use strict';
/* =====================================================================
   TIDEBREAKERS — core helpers, event bus and all tuning data.
   Every number a designer may want to tweak lives in TB.D below.
   World units are metres: x/z on the sea surface, y up. Water level is y = 0.
   ===================================================================== */
window.TB = window.TB || {};
(() => {

// ---------------------------------------------------------------- helpers
const U = TB.U = {};
U.TAU = Math.PI * 2;
U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
U.lerp = (a, b, t) => a + (b - a) * t;
U.rand = (a, b) => a + Math.random() * (b - a);
U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
U.pick = arr => arr[Math.floor(Math.random() * arr.length)];
U.dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
U.dist = (ax, az, bx, bz) => Math.sqrt(U.dist2(ax, az, bx, bz));
U.angDiff = (a, b) => { let d = (b - a) % U.TAU; if (d > Math.PI) d -= U.TAU; else if (d < -Math.PI) d += U.TAU; return d; };
U.approach = (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));
U.damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
U.heading = (dx, dz) => Math.atan2(dx, dz);          // model forward is +Z
U.fmt = n => { n = Math.floor(n); return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n); };
// like Object.assign but keeps getters live (Object.assign would copy their current value)
U.extend = (target, src) => Object.defineProperties(target, Object.getOwnPropertyDescriptors(src));
U.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// deterministic generator (mulberry32) for the world layout
U.rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// sea surface height; the water shader uses the same formula (keep in sync with gfx.js)
U.wave = (x, z, t) => 0.22 * Math.sin(x * 0.12 + t * 1.1) + 0.16 * Math.sin(z * 0.15 + t * 1.4) + 0.08 * Math.sin((x + z) * 0.31 + t * 2.1);

// ---------------------------------------------------------------- events
const subs = {};
TB.on = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); };
TB.emit = (ev, data) => { const l = subs[ev]; if (l) for (const fn of l) fn(data); };

// ================================================================= DATA
const D = TB.D = {};

D.TILE = 4;              // a town grid cell is 4 m × 4 m
D.GRID = 7;              // buildable cells run -7..7 on both axes
D.DECK = 0.7;            // platform deck height above the water
D.WORLD_R = 300;         // sailing limit (radius from the town)
D.DAY_LEN = 150;         // seconds of real time per in-game day
D.HALL = { i: 0, j: 0 };
D.PIER = [{ i: 0, j: 2 }];                       // fixed pier cells (not buildable)
D.CHANNEL = { i0: -1, i1: 1, j0: 3, j1: 9 };    // keep-clear water in front of the pier
D.DOCK = { x: 0, z: 2 * 4 + 6.5 };              // where the player boat docks
D.MOOR = { x: 13, z: 14 };                      // where the merchant ship moors (needs a Trader Pier)

D.RES = {
  wood:        { name: 'Wood',        color: '#c48a52' },
  plastic:     { name: 'Plastic',     color: '#5fc3e4' },
  metal:       { name: 'Metal scrap', color: '#a7b3bd' },
  electronics: { name: 'Electronics', color: '#8ef06a' },
  food:        { name: 'Food',        color: '#ff8a5c' },
  water:       { name: 'Fresh water', color: '#4fb7ff' },
  fuel:        { name: 'Fuel',        color: '#ff5a4a' },
  coins:       { name: 'Trade tokens', color: '#ffd24a' },
};
D.RES_KEYS = Object.keys(D.RES);
D.STORE_BASE = 80;       // storage per resource from the Town Hall
D.STORE_PER = 90;        // each Storage building adds this much per resource

// -------------------------------------------------------------- buildings
// cat: build | production | defense | civic
// prod / use are per in-game day. power: + makes, - needs.
// bp: true → needs a blueprint (found by diving wrecks or bought from merchants).
D.B = {
  platform: { name: 'Raft Platform', cat: 'build', cost: { wood: 6, plastic: 3 }, hp: 0, desc: 'Barrel-and-plank foundation. Everything is built on these.' },
  house:    { name: 'Scrap Shack', cat: 'build', cost: { wood: 12, plastic: 4 }, hp: 120, beds: 4, desc: '+4 beds. Settlers only move in if there is a bed for them.' },
  storage:  { name: 'Storage Crates', cat: 'build', cost: { wood: 10, metal: 4 }, hp: 140, store: 1, desc: '+90 storage for every resource.' },
  lanterns: { name: 'Lantern Post', cat: 'build', cost: { wood: 3, plastic: 2 }, hp: 60, amen: 5, desc: 'Lights the walkways at night. Small happiness boost.' },
  rain:     { name: 'Rain Catcher', cat: 'production', cost: { wood: 6, plastic: 6 }, hp: 80, prod: { water: 5 }, desc: '+5 fresh water a day. No worker needed.' },
  fishing:  { name: 'Fishing Net', cat: 'production', cost: { wood: 10, plastic: 2 }, hp: 90, workers: 1, prod: { food: 9 }, desc: '+9 food a day with 1 fisher.' },
  windmill: { name: 'Windmill', cat: 'production', cost: { wood: 10, metal: 6 }, hp: 100, power: 3, desc: '+3 power.' },
  purifier: { name: 'Desalinator', cat: 'production', cost: { metal: 10, plastic: 6, electronics: 1 }, hp: 120, workers: 1, power: -2, prod: { water: 14 }, bp: true, desc: '+14 fresh water a day. Needs 2 power and a worker.' },
  garden:   { name: 'Seaweed Garden', cat: 'production', cost: { wood: 6, plastic: 8 }, hp: 90, workers: 1, prod: { food: 10 }, use: { water: 2 }, bp: true, desc: '+10 food a day, uses 2 water.' },
  solar:    { name: 'Solar Raft', cat: 'production', cost: { metal: 6, electronics: 2 }, hp: 80, power: 5, bp: true, desc: '+5 power.' },
  workshop: { name: 'Workshop', cat: 'production', cost: { wood: 14, metal: 8 }, hp: 160, workers: 1, power: -1, unique: true, desc: 'Unlocks boat upgrades. Repairs the town faster.' },
  watchtower: { name: 'Watchtower', cat: 'defense', cost: { wood: 12, metal: 4 }, hp: 160, workers: 1, safety: 14, turret: { range: 34, dmg: 7, rate: 1.6, speed: 80, kind: 'bullet' }, desc: 'A lookout with a rifle. Warns of raids earlier and shoots boarders.' },
  harpoon:  { name: 'Harpoon Turret', cat: 'defense', cost: { metal: 14, electronics: 2 }, hp: 200, workers: 1, power: -1, safety: 18, turret: { range: 48, dmg: 34, rate: 0.55, speed: 70, kind: 'harpoon' }, bp: true, desc: 'Heavy harpoon gun that punches through raider boats.' },
  trader:   { name: 'Trader Pier', cat: 'civic', cost: { wood: 16, plastic: 4 }, hp: 160, unique: true, desc: 'Merchant ships can moor and trade.' },
  market:   { name: 'Market Stall', cat: 'civic', cost: { wood: 12, plastic: 6 }, hp: 100, workers: 1, amen: 12, prod: { coins: 5 }, bp: true, desc: '+5 trade tokens a day and a happier town.' },
  clinic:   { name: 'Clinic', cat: 'civic', cost: { metal: 8, plastic: 8, electronics: 2 }, hp: 120, workers: 1, power: -1, amen: 10, safety: 8, bp: true, desc: 'Healthier, happier settlers. Fewer of them leave.' },
  radio:    { name: 'Radio Tower', cat: 'civic', cost: { metal: 10, electronics: 4 }, hp: 120, power: -2, unique: true, bp: true, desc: 'More castaways to rescue and more settlers arriving.' },
  hall:     { name: 'Town Hall', cat: 'none', cost: { wood: 40, metal: 12 }, hp: 450, beds: 6, power: 2, desc: 'The old lifeboat, now the heart of town. If raiders wreck it, rebuild it fast (on Tidebreaker difficulty, losing it ends the game).' },
};
D.BUILD_ORDER = ['platform', 'house', 'storage', 'lanterns', 'rain', 'fishing', 'windmill', 'purifier', 'garden', 'solar', 'workshop', 'watchtower', 'harpoon', 'trader', 'market', 'clinic', 'radio'];
D.BLUEPRINTS = ['purifier', 'solar', 'harpoon', 'garden', 'market', 'clinic', 'radio'];
D.CATS = [
  { key: 'build', name: 'Build', icon: 'tab_build' },
  { key: 'production', name: 'Production', icon: 'tab_production' },
  { key: 'defense', name: 'Defense', icon: 'tab_defense' },
  { key: 'civic', name: 'Civic', icon: 'tab_civic' },
  { key: 'boats', name: 'Boats', icon: 'tab_boats' },
];
// worker priority when there are fewer settlers than jobs
D.JOB_PRIORITY = ['fishing', 'purifier', 'garden', 'watchtower', 'harpoon', 'workshop', 'clinic', 'market'];

// ------------------------------------------------------------- pickups
// floating salvage; net it with E. give = what it adds to the boat's hold
D.PICK = {
  pick_wood:        { give: { wood: 3 }, weight: 30 },
  pick_plastic:     { give: { plastic: 3 }, weight: 26 },
  pick_metal:       { give: { metal: 2 }, weight: 16, far: 60 },
  pick_food:        { give: { food: 3 }, weight: 12 },
  pick_fuel:        { give: { fuel: 1 }, weight: 9, far: 50 },
  pick_electronics: { give: { electronics: 1 }, weight: 4, far: 120 },
  pick_loot:        { give: {}, weight: 0 },   // raider drops: contents decided on drop
};

// ------------------------------------------------------------- enemies
D.E = {
  skiff:     { name: 'Raider skiff', model: 'raider_skiff', hp: 30, r: 1.8, speed: 15, turn: 2.6, range: 26, dmg: 4, rate: 1.4, burst: 3, kind: 'bullet', loot: { metal: 1, coins: 2 }, score: 50 },
  speedboat: { name: 'Raider speedboat', model: 'raider_speedboat', hp: 60, r: 2.4, speed: 12.5, turn: 2.0, range: 30, dmg: 5, rate: 1.1, burst: 4, kind: 'bullet', boarders: 2, loot: { metal: 2, fuel: 1, coins: 4 }, score: 90 },
  gunboat:   { name: 'Red Wake gunboat', model: 'raider_gunboat', hp: 170, r: 3.4, speed: 8, turn: 1.1, range: 52, dmg: 16, rate: 0.35, kind: 'shell', loot: { metal: 5, electronics: 1, coins: 8 }, score: 200 },
  swimmer:   { name: 'Saboteur swimmer', model: 'swimmer', hp: 12, r: 0.8, speed: 4.2, turn: 3, range: 2, dmg: 9, rate: 0.6, kind: 'melee', hidden: true, loot: { coins: 1 }, score: 40 },
  boarder:   { name: 'Boarder', model: 'raider', hp: 14, r: 0.6, speed: 3.2, turn: 6, range: 1.6, dmg: 3, rate: 1, kind: 'melee', loot: {}, score: 25, onDeck: true },
  shark:     { name: 'Shark', model: 'shark', hp: 45, r: 1.6, speed: 11, turn: 2.4, range: 2.8, dmg: 8, rate: 0.7, kind: 'bite', loot: { food: 6 }, score: 60 },
  tower:     { name: 'Outpost gun', model: 'outpost_turret', hp: 110, r: 2, speed: 0, turn: 2, range: 44, dmg: 6, rate: 0.9, burst: 3, kind: 'bullet', loot: { metal: 3, coins: 6 }, score: 150, fixed: true },
  boss:      { name: 'Iron Fleet flagship', model: 'boss_ironclad', hp: 1400, r: 7, speed: 5.5, turn: 0.5, range: 64, dmg: 20, rate: 0.5, kind: 'shell', loot: { metal: 30, electronics: 8, coins: 80 }, score: 3000, boss: true },
};

// ------------------------------------------------------------- boat upgrades
// cost[i] buys level i+1. Every upgrade needs a Workshop and the boat docked.
D.UPG = {
  engine:  { name: 'Engine', desc: 'Top speed', vals: [14, 16.5, 19, 22], cost: [{ metal: 8, wood: 6 }, { metal: 14, electronics: 1 }, { metal: 22, electronics: 3 }], fmt: v => v + ' kn' },
  hull:    { name: 'Hull plating', desc: 'Maximum hull', vals: [100, 140, 190, 250], cost: [{ metal: 10, wood: 8 }, { metal: 18 }, { metal: 28, electronics: 2 }], fmt: v => v + ' hp' },
  gun:     { name: 'Deck gun', desc: 'Damage per round', vals: [6, 8, 11, 15], cost: [{ metal: 8 }, { metal: 14, electronics: 1 }, { metal: 20, electronics: 3 }], fmt: v => v + ' dmg' },
  barrels: { name: 'Twin barrels', desc: 'Rounds per burst', vals: [1, 2, 3], cost: [{ metal: 16, electronics: 2 }, { metal: 26, electronics: 4 }], fmt: v => '×' + v },
  harpoon: { name: 'Harpoon rack', desc: 'Harpoons carried', vals: [4, 6, 9, 12], cost: [{ metal: 6, wood: 4 }, { metal: 12 }, { metal: 18, electronics: 1 }], fmt: v => v + ' harpoons' },
  cargo:   { name: 'Cargo hold', desc: 'Salvage you can carry', vals: [30, 45, 65, 90], cost: [{ wood: 12, plastic: 8 }, { wood: 18, metal: 8 }, { metal: 18, plastic: 14 }], fmt: v => v + ' units' },
  net:     { name: 'Salvage net', desc: 'Net catch radius', vals: [3.5, 4.6, 5.8, 7.2], cost: [{ plastic: 10, wood: 4 }, { plastic: 16, metal: 4 }, { plastic: 22, metal: 10 }], fmt: v => v.toFixed(1) + ' m' },
  tank:    { name: 'Fuel tank', desc: 'Range before refuelling', vals: [100, 140, 190], cost: [{ metal: 8, plastic: 6 }, { metal: 16, plastic: 10 }], fmt: v => v + ' L' },
  seats:   { name: 'Rescue seats', desc: 'Castaways you can carry', vals: [2, 3, 4, 6], cost: [{ wood: 10 }, { wood: 14, plastic: 8 }, { metal: 12, plastic: 10 }], fmt: v => v + ' seats' },
  dive:    { name: 'Dive gear', desc: 'Time to search a wreck', vals: [8, 6.5, 5, 3.8], cost: [{ plastic: 8, metal: 6 }, { metal: 12, electronics: 1 }, { metal: 18, electronics: 3 }], fmt: v => v + ' s' },
};

// ------------------------------------------------------------- difficulty
D.DIFF = {
  easy:   { name: 'Castaway', dmgTaken: 0.6, enemyHp: 0.8, raidGap: 1.35, eat: 0.75, start: 1.4 },
  normal: { name: 'Survivor', dmgTaken: 1, enemyHp: 1, raidGap: 1, eat: 1, start: 1 },
  hard:   { name: 'Tidebreaker', dmgTaken: 1.4, enemyHp: 1.25, raidGap: 0.75, eat: 1.2, start: 0.8 },
};
D.START = { wood: 30, plastic: 14, metal: 6, electronics: 0, food: 18, water: 14, fuel: 6, coins: 10 };
D.START_POP = 6;

// ------------------------------------------------------------- campaign
// Objective kinds read live values from the game (see quests in game.js).
// count: a statistic in G.stats that goes up while the chapter is active.
// have:  a value that is checked directly (buildings standing, population…).
D.CHAPTERS = [
  { title: 'The First Float', text: 'Six castaways, one rusty boat, three pontoons. Start with salvage.',
    goals: [{ k: 'count', s: 'collected_wood', n: 12, t: 'Net 12 wood (E / NET lowers the net)' }, { k: 'count', s: 'built_platform', n: 2, t: 'Build 2 raft platforms (B to build)' }],
    reward: { plastic: 10, wood: 10 } },
  { title: 'Something to Drink', text: 'Two days of water left. The sky will help if you let it.',
    goals: [{ k: 'have', s: 'b_rain', n: 1, t: 'Build a Rain Catcher' }, { k: 'have', s: 'b_fishing', n: 1, t: 'Build a Fishing Net' }],
    reward: { wood: 12, food: 8 } },
  { title: 'Make It Home', text: 'A distress flare on the horizon. Make room and bring them in.',
    goals: [{ k: 'have', s: 'b_house', n: 1, t: 'Build a Scrap Shack' }, { k: 'count', s: 'rescued', n: 2, t: 'Rescue 2 castaways (stop beside a raft)' }],
    reward: { metal: 8, fuel: 3 } },
  { title: 'The Blue Gull', text: 'A merchant ship answers your radio. Give her somewhere to tie up.',
    goals: [{ k: 'have', s: 'b_trader', n: 1, t: 'Build a Trader Pier' }, { k: 'count', s: 'trades', n: 1, t: 'Make a trade with the merchant' }],
    reward: { coins: 15, metal: 6 } },
  { title: 'Beyond the Horizon', text: 'The old city lies below. Divers can reach what the tide took.',
    goals: [{ k: 'have', s: 'b_workshop', n: 1, t: 'Build a Workshop' }, { k: 'count', s: 'dives', n: 2, t: 'Dive 2 wreck sites (stop over bubbles, press E)' }, { k: 'count', s: 'upgrades', n: 1, t: 'Buy a boat upgrade at the Workshop' }],
    reward: { electronics: 3, metal: 10 } },
  { title: 'The Red Wake', text: 'Engines on the radio. Raiders have noticed your lights.',
    goals: [{ k: 'have', s: 'b_watchtower', n: 1, t: 'Build a Watchtower' }, { k: 'count', s: 'raids_repelled', n: 1, t: 'Repel the Red Wake raid' }],
    reward: { metal: 14, coins: 20 } },
  { title: 'Strike the Outpost', text: 'The Red Wake keeps prisoners on a fort to the north-east. Free them.',
    goals: [{ k: 'count', s: 'outposts', n: 1, t: 'Destroy a Red Wake outpost' }, { k: 'count', s: 'rescued', n: 3, t: 'Rescue 3 more castaways' }],
    reward: { electronics: 4, metal: 16, coins: 25 } },
  { title: 'City on the Sea', text: 'Your lights can be seen for miles. So can your wealth.',
    goals: [{ k: 'have', s: 'pop', n: 16, t: 'Grow the town to 16 settlers' }, { k: 'count', s: 'boss', n: 1, t: 'Sink the Iron Fleet flagship' }],
    reward: { coins: 60, electronics: 6 } },
];

// Endless milestones: the town keeps growing forever; these just mark the way.
D.MILESTONES = [
  { s: 'pop', n: 10, t: 'Village afloat: 10 settlers' },
  { s: 'pop', n: 20, t: 'Harbor town: 20 settlers' },
  { s: 'pop', n: 35, t: 'Floating city: 35 settlers' },
  { s: 'pop', n: 50, t: 'Metropolis of the tides: 50 settlers' },
  { s: 'raids', n: 5, t: 'Repelled 5 raids' },
  { s: 'raids', n: 15, t: 'Repelled 15 raids' },
  { s: 'days', n: 10, t: 'Survived 10 days' },
  { s: 'days', n: 30, t: 'Survived 30 days' },
  { s: 'bosses', n: 1, t: 'Sank an Iron Fleet flagship' },
];

// ------------------------------------------------------------- merchant
D.MERCHANT_NAMES = ['The Blue Gull', 'Saltmother', 'Lantern Barge', 'Old Marigold', 'Coral Queen'];
// sell = the player gets the goods, pays coins; buy = the merchant takes goods, pays coins
D.TRADES = [
  { kind: 'sell', give: { fuel: 5 }, price: 12, stock: 3 },
  { kind: 'sell', give: { metal: 8 }, price: 16, stock: 3 },
  { kind: 'sell', give: { electronics: 2 }, price: 22, stock: 2 },
  { kind: 'sell', give: { food: 10 }, price: 9, stock: 2 },
  { kind: 'sell', give: { water: 10 }, price: 9, stock: 2 },
  { kind: 'buy', take: { wood: 10 }, price: 6, stock: 4 },
  { kind: 'buy', take: { plastic: 10 }, price: 7, stock: 4 },
  { kind: 'buy', take: { food: 8 }, price: 8, stock: 3 },
  { kind: 'buy', take: { metal: 6 }, price: 9, stock: 2 },
  { kind: 'blueprint', price: 55, stock: 1 },
];

})();
