// Static game data: content tables, ranks, icons.

export const AREAS = {
  woods: {
    hazard: null, boss: 'drake', hazardText: 'No hazards', step: 1,
    name: 'Whispering Woods', blurb: 'Cool blue night', ground: [[0.14, 0.3, 0.18], [0.1, 0.22, 0.17], [0.17, 0.33, 0.2]], dirt: [0.45, 0.28, 0.14],
    tree: [[0.07, 0.27, 0.2], [0.08, 0.2, 0.19], [0.1, 0.3, 0.17]], trunk: [0.2, 0.12, 0.08], rock: [0.2, 0.24, 0.3],
    amb: [0.4, 0.54, 0.8], moon: [0.34, 0.52, 0.9], fog: [0.05, 0.09, 0.17], ember: [1, 0.7, 0.25], fly: [0.7, 1, 0.4], dead: false,
  },
  ashen: {
    hazard: 'geyser', boss: 'warden', hazardText: 'Ember geysers', step: 2,
    name: 'Ashen Hollow', blurb: 'Red ember night', ground: [[0.3, 0.2, 0.2], [0.22, 0.15, 0.16], [0.34, 0.22, 0.19]], dirt: [0.45, 0.18, 0.09],
    tree: [[0.2, 0.14, 0.14], [0.15, 0.1, 0.11], [0.26, 0.15, 0.13]], trunk: [0.16, 0.1, 0.1], rock: [0.3, 0.2, 0.2],
    amb: [0.45, 0.28, 0.38], moon: [0.65, 0.35, 0.42], fog: [0.14, 0.06, 0.08], ember: [1, 0.4, 0.15], fly: [1, 0.45, 0.2], dead: true,
  },
  marsh: {
    hazard: 'puddle', boss: 'drake', hazardText: 'Slow puddles', step: 3, name: 'Frostmere Marsh', blurb: 'Misty teal night, slow puddles',
    ground: [[0.1, 0.27, 0.28], [0.08, 0.2, 0.24], [0.13, 0.31, 0.31]], dirt: [0.34, 0.32, 0.22],
    tree: [[0.06, 0.26, 0.26], [0.07, 0.2, 0.25], [0.09, 0.29, 0.27]], trunk: [0.16, 0.14, 0.11], rock: [0.22, 0.28, 0.34],
    amb: [0.36, 0.6, 0.8], moon: [0.3, 0.6, 0.95], fog: [0.04, 0.13, 0.19], ember: [0.8, 0.95, 1], fly: [0.6, 1, 0.9], dead: false,
  },

};

export const HEROES = {
  warden: { role: 'All-rounder', start: true, name: 'Warden', desc: 'Steady lantern-bearer. Starts with Ember Bolt.', hp: 100, speed: 5.4, weapon: 'bolt', crit: 0, fireRegen: 0, fireMax: 0, cloak: [0.75, 0.15, 0.15], tunic: [0.2, 0.32, 0.75], hat: 0 },
  wren: { role: 'Fast archer', name: 'Ranger Wren', desc: 'Fast and fragile. Starts with the Bow. +10% crit.', hp: 80, speed: 6.1, weapon: 'bow', crit: 0.1, fireRegen: 0, fireMax: 0, cloak: [0.2, 0.5, 0.25], tunic: [0.25, 0.4, 0.2], hat: 1 },
  monk: { role: 'Tank', name: 'Cinder Monk', desc: 'Slow and sturdy. Starts with Ember Nova. Fire regrows faster.', hp: 135, speed: 4.9, weapon: 'nova', crit: 0, fireRegen: 1.2, fireMax: 0.1, cloak: [0.85, 0.4, 0.1], tunic: [0.5, 0.2, 0.1], hat: 2 },
  ash: { role: 'Light mage', name: 'Lantern Witch Ash', desc: 'Frail but bright. Starts with Cinder Wisps. Kills in the dark feed the fire.', hp: 85, speed: 5.7, weapon: 'wisp', crit: 0.05, fireRegen: 0, fireMax: 0, darkFeed: 2.2, trait: 'Kills in the dark restore 2x fire; her wisps carry light', cloak: [0.45, 0.2, 0.65], tunic: [0.3, 0.2, 0.5], hat: 3 },
};

// Weapon base tables, indexed by level-1.
export const WEAPONS = {
  bolt: { name: 'Ember Bolt', icon: 'flame', col: '#ff9d3b', evo: 'Comet Barrage', evoWith: 'wick', desc: 'Fires embers at the nearest foe.' },
  orbit: { name: 'Flame Orbit', icon: 'orbit', col: '#c25bff', evo: 'Halo of Cinders', evoWith: 'heart', desc: 'Fire orbs circle you.' },
  chain: { name: 'Spark Chain', icon: 'bolt', col: '#4fc3ff', evo: 'Storm Web', evoWith: 'kindle', desc: 'Lightning bounces between foes.' },
  bow: { name: "Wren's Bow", icon: 'bow', col: '#9be26b', evo: 'Hawk Volley', evoWith: 'clover', desc: 'Fast arrows at random foes. Crits often.' },
  bomb: { name: 'Powder Bomb', icon: 'bomb', col: '#ffd24a', evo: 'Cinder Mortar', evoWith: 'flint', desc: 'Lobs bombs at the thickest swarm.' },
  nova: { name: 'Ember Nova', icon: 'nova', col: '#ff6a3d', evo: 'Sunburst', evoWith: 'ward', desc: 'Pulses a ring of fire. Bigger with a bigger fire.' },
  wisp: { name: 'Cinder Wisp', icon: 'wisp', col: '#7ee8ff', evo: 'Spirit Lanterns', evoWith: 'kindle', desc: 'Wisps orbit you, carry light and snipe nearby foes.' },
  whip: { name: 'Ash Whip', icon: 'whip', col: '#c8a2ff', evo: 'Cinder Flail', evoWith: 'flint', desc: 'Sweeps an arc in front of you.' },
  mine: { name: 'Spark Mines', icon: 'mine', col: '#4fe0b0', evo: 'Tripwire Storm', evoWith: 'magnet', desc: 'Drops mines that blow when foes step close.' },
  beacon: { name: 'Beacon', icon: 'beacon', col: '#ffe08a', evo: 'Dawn Beacon', evoWith: 'heart', desc: 'Sends a pulse from the fire. Hits foes at the edge of the light.' },
  dawn: { name: 'Dawnblade', icon: 'sword', col: '#ffcf5a', evo: 'Noonblade', evoWith: 'boots', desc: 'A blade of morning light. Cuts a full circle around you.' },
};

export const PASSIVES = {
  wick: { name: 'Quick Wick', icon: 'wick', col: '#ffd24a', per: 0.12, fmt: '+{}% attack speed', mul: 100 },
  heart: { name: 'Warm Heart', icon: 'heart', col: '#ff9d3b', per: 0.1, fmt: '+{}% fire radius', mul: 100 },
  flint: { name: 'Sharp Flint', icon: 'star', col: '#e8eaff', per: 0.1, fmt: '+{}% damage', mul: 100 },
  boots: { name: 'Swift Boots', icon: 'boots', col: '#6be2c8', per: 0.08, fmt: '+{}% move speed', mul: 100 },
  magnet: { name: 'Gem Magnet', icon: 'magnet', col: '#ff5d7a', per: 0.3, fmt: '+{}% pickup range', mul: 100 },
  cloak: { name: 'Thick Cloak', icon: 'shield', col: '#7aa2ff', per: 20, fmt: '+{} max health', mul: 1 },
  clover: { name: 'Lucky Charm', icon: 'clover', col: '#6bd96b', per: 0.06, fmt: '+{}% crit chance', mul: 100 },
  scholar: { name: 'Bright Mind', icon: 'book', col: '#b48cff', per: 0.12, fmt: '+{}% XP gain', mul: 100 },
  kindle: { name: 'Kindling', icon: 'logs', col: '#ff8a3b', per: 0.25, fmt: 'Fire regrows +{}% faster', mul: 100 },
  ward: { name: 'Fire Ward', icon: 'ward', col: '#ffb347', per: 0.1, fmt: 'Foes in light take +{}% damage', mul: 100 },
};

export const RARITY = [
  { id: 'common', name: 'COMMON', mul: 1, dmg: 0, cls: 'r0' },
  { id: 'rare', name: 'RARE', mul: 1.6, dmg: 0.12, cls: 'r1' },
  { id: 'legendary', name: 'LEGENDARY', mul: 2.4, dmg: 0.3, cls: 'r2' },
];

// Permanent upgrade tracks.
export const UPGRADES = {
  vit: { fx: (l) => '+' + 12 * l + '% max health', name: 'Vitality', icon: 'heart', desc: '+12% max health per level', col: '#ff5d7a', base: 90 },
  kin: { fx: (l) => '+' + 8 * l + '% fire size', name: 'Kindling', icon: 'flame', desc: '+8% fire size per level', col: '#ff9d3b', base: 110 },
  might: { fx: (l) => '+' + 6 * l + '% damage', name: 'Might', icon: 'star', desc: '+6% damage per level', col: '#ffd24a', base: 120 },
  haste: { fx: (l) => '+' + 4 * l + '% move speed', name: 'Haste', icon: 'boots', desc: '+4% move speed per level', col: '#6be2c8', base: 80 },
  mag: { fx: (l) => '+' + 12 * l + '% pickup range', name: 'Magnetism', icon: 'magnet', desc: '+12% pickup range per level', col: '#c25bff', base: 70 },
  wis: { fx: (l) => '+' + 8 * l + '% XP gain', name: 'Wisdom', icon: 'book', desc: '+8% XP gain per level', col: '#b48cff', base: 100 },
  fort: { fx: (l) => '+' + 3 * l + '% crit, +' + 6 * l + '% coins', name: 'Fortune', icon: 'clover', desc: '+3% crit, +6% coins per level', col: '#6bd96b', base: 130 },
  ward: { fx: (l) => '-' + 8 * l + '% fire damage taken', name: 'Ember Ward', icon: 'ward', desc: '-8% fire damage, faster regrowth', col: '#4fc3ff', base: 140 },
};
export const UP_MAX = 5;
export const upCost = (id, lvl) => Math.round(UPGRADES[id].base * (1 + lvl * 0.9));

// Ember Road: goal-based unlocks. `stat` is read by progress.statVal(); `label` is the exact condition shown to the player.
export const UNLOCKS = [
  { id: 'wren', type: 'hero', name: 'Ranger Wren', sub: 'Fast archer. Starts with the Bow.', stat: 'runs', need: 1, label: 'Finish 1 run' },
  { id: 'bomb', type: 'weapon', name: 'Powder Bomb', sub: 'Joins the level-up pool.', stat: 'runs', need: 2, label: 'Finish 2 runs' },
  { id: 'monk', type: 'hero', name: 'Cinder Monk', sub: 'Sturdy. Starts with Ember Nova.', stat: 'won:woods', need: 1, label: 'Beat The Cinder Drake in Whispering Woods' },
  { id: 'ashen', type: 'area', name: 'Ashen Hollow', sub: 'Map 2: new boss, ember geysers.', stat: 'won:woods', need: 1, label: 'Beat The Cinder Drake in Whispering Woods' },
  { id: 'whip', type: 'weapon', name: 'Ash Whip', sub: 'Joins the level-up pool.', stat: 'acctLvl', need: 3, label: 'Reach account level 3' },
  { id: 'mine', type: 'weapon', name: 'Spark Mines', sub: 'Joins the level-up pool.', stat: 'acctLvl', need: 6, label: 'Reach account level 6' },
  { id: 'ash', type: 'hero', name: 'Lantern Witch Ash', sub: 'Starts with Cinder Wisps.', stat: 'won:marsh', need: 1, label: 'Beat The Cinder Drake in Frostmere Marsh' },
  { id: 'beacon', type: 'weapon', name: 'Beacon', sub: 'Joins the level-up pool.', stat: 'acctLvl', need: 9, label: 'Reach account level 9' },
  { id: 'marsh', type: 'area', name: 'Frostmere Marsh', sub: 'Map 3: misty night, slow puddles.', stat: 'won:ashen', need: 1, label: 'Beat The Ashen Warden in Ashen Hollow' },
  { id: 'pacts', type: 'feature', name: 'Night Pacts', sub: 'Risk and reward modifiers for your runs.', stat: 'acctLvl', need: 3, label: 'Reach account level 3' },
];

// Account level: XP from every run. Level n -> n+1 needs 100 + 30 n XP.
export const ACCT_MAX = 30;
export const acctNeed = (lvl) => 100 + 30 * lvl;
export const RANKS = [[1, 'Ember Novice'], [4, 'Spark Keeper'], [8, 'Flame Warden'], [13, 'Cinder Knight'], [19, 'Blaze Captain'], [25, 'Dawnbringer']];
export const rankOf = (lvl) => { let r = RANKS[0][1]; for (const [l, n] of RANKS) if (lvl >= l) r = n; return r; };
// Reward for reaching account level L: coins every level, plus a permanent small perk at milestones (applied in game.recalc).
export const acctReward = (lvl) => 40 + 10 * lvl;
export const ACCT_PERKS = { 5: { key: 'xp', v: 0.04, text: '+4% XP gain' }, 10: { key: 'hp', v: 0.04, text: '+4% max health' }, 15: { key: 'dmg', v: 0.04, text: '+4% damage' }, 20: { key: 'fire', v: 0.04, text: '+4% fire size' }, 25: { key: 'coin', v: 0.06, text: '+6% coins' } };

// Hero mastery: XP per hero (time, kills, wins). Levels 1-10.
export const MASTERY_AT = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
export const MASTERY_PERKS = { 2: { key: 'dmg', v: 0.02, text: '+2% damage' }, 4: { key: 'hp', v: 0.05, text: '+5% max health' }, 6: { key: 'xp', v: 0.03, text: '+3% XP gain' }, 8: { key: 'fire', v: 0.03, text: '+3% fire size' }, 10: { key: 'dmg', v: 0.04, text: '+4% damage' } };
// Cosmetics (purely visual): ember trail and lantern glow colours, chosen per hero.
export const COSMETICS = {
  3: { id: 'trail_ruby', kind: 'trail', name: 'Ruby embers', col: [1, 0.3, 0.35] },
  6: { id: 'trail_azure', kind: 'trail', name: 'Azure embers', col: [0.3, 0.7, 1] },
  10: { id: 'trail_verdant', kind: 'trail', name: 'Verdant embers', col: [0.4, 1, 0.5] },
};

// Achievements: `stat` is read by progress.statVal(); the reward is account XP. Everything is local and real.
export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Light', desc: 'Finish a run.', stat: 'runs', need: 1, xp: 40 },
  { id: 'runs10', name: 'Regular', desc: 'Finish 10 runs.', stat: 'runs', need: 10, xp: 100 },
  { id: 'time120', name: 'Two Minutes of Dark', desc: 'Survive 2 minutes in one run.', stat: 'bestTime', need: 120, xp: 60 },
  { id: 'time180', name: 'Past Three Minutes', desc: 'Survive 3 minutes in one run.', stat: 'bestTime', need: 180, xp: 100 },
  { id: 'stag', name: 'Boss Slayer', desc: 'Defeat a boss.', stat: 'bossKills', need: 1, xp: 150 },
  { id: 'untouched', name: 'Untouched', desc: 'Defeat a boss without taking damage during the fight.', stat: 'bossNoHit', need: 1, xp: 250 },
  { id: 'evo1', name: 'Evolutionist', desc: 'Evolve a weapon.', stat: 'evoCount', need: 1, xp: 80 },
  { id: 'evo3', name: 'Triple Threat', desc: 'Evolve 3 weapons in one run.', stat: 'maxEvoRun', need: 3, xp: 200 },
  { id: 'cent', name: 'Centurion', desc: 'Defeat 100 foes in one run.', stat: 'maxKills', need: 100, xp: 80 },
  { id: 'slay1', name: 'Slayer', desc: 'Defeat 1,000 foes in total.', stat: 'kills', need: 1000, xp: 100 },
  { id: 'slay2', name: 'Exterminator', desc: 'Defeat 5,000 foes in total.', stat: 'kills', need: 5000, xp: 200 },
  { id: 'lvl10', name: 'Rising Spark', desc: 'Reach level 10 in a run.', stat: 'maxLvl', need: 10, xp: 80 },
  { id: 'lvl20', name: 'Roaring Blaze', desc: 'Reach level 20 in a run.', stat: 'maxLvl', need: 20, xp: 160 },
  { id: 'streak', name: 'Inferno', desc: 'Reach a 50 kill streak.', stat: 'maxStreak', need: 50, xp: 100 },
  { id: 'gold5', name: 'Golden Touch', desc: 'Catch 5 golden wisps.', stat: 'golds', need: 5, xp: 80 },
  { id: 'chest10', name: 'Treasure Hunter', desc: 'Open 10 Cinder Chests.', stat: 'chests', need: 10, xp: 100 },
  { id: 'shop10', name: 'Shopper', desc: 'Buy 10 permanent upgrade levels.', stat: 'upBought', need: 10, xp: 100 },
  { id: 'maxup', name: 'Maxed Out', desc: 'Max out one upgrade track.', stat: 'upMaxed', need: 1, xp: 120 },
  { id: 'heroes3', name: 'Hero Hopper', desc: 'Win with 3 different heroes.', stat: 'heroesWon', need: 3, xp: 200 },
  { id: 'brightkeep', name: 'Bright Keeper', desc: 'Win a run with the fire above 80%.', stat: 'brightWins', need: 1, xp: 120 },
  { id: 'codex50', name: 'Collector', desc: 'Complete half of the collection.', stat: 'codexPct', need: 50, xp: 200 },
  { id: 'acct10', name: 'Flame Warden', desc: 'Reach account level 10.', stat: 'acctLvl', need: 10, xp: 150 },
];

// Enemy types: hp, speed, radius, contact dmg, fire dmg /s, xp, scale
export const ET = [
  { name: 'Creeper', hp: 14, sp: 2.7, r: 0.45, dmg: 8, fd: 1.0, xp: 1 },
  { name: 'Skitter', hp: 8, sp: 4.5, r: 0.35, dmg: 5, fd: 0.6, xp: 1 },
  { name: 'Brute', hp: 75, sp: 1.7, r: 0.95, dmg: 16, fd: 3.5, xp: 4 },
  { name: 'Wraith', hp: 26, sp: 3.1, r: 0.5, dmg: 9, fd: 2.8, xp: 2 },
  { name: 'Ember Eater', hp: 440, sp: 1.9, r: 1.25, dmg: 22, fd: 7, xp: 14 },
  { name: 'The Cinder Drake', hp: 4200, sp: 2.0, r: 2.3, dmg: 26, fd: 9, xp: 0, boss: true, trait: 'Lunges, slams its tail and breathes fire' },
  { name: 'Spitter', hp: 16, sp: 2.3, r: 0.4, dmg: 6, fd: 0.5, xp: 2, m: 5, ai: 'ranged', rng: 7.5, cd: 3.2, shot: 5, trait: 'Shoots embers from range' },
  { name: 'Bulwark', hp: 70, sp: 1.5, r: 0.9, dmg: 14, fd: 3, xp: 5, m: 6, ai: 'shield', trait: 'Front plate blocks most damage. Hit it from the side or behind.' },
  { name: 'Blast Bug', hp: 10, sp: 5.2, r: 0.38, dmg: 0, fd: 0, xp: 2, m: 7, ai: 'bomb', trait: 'Rushes the fire and explodes' },
  { name: 'Gloom Moth', hp: 24, sp: 2.6, r: 0.45, dmg: 5, fd: 1.5, xp: 3, m: 8, ai: 'moth', trait: 'Eats light: every living moth shrinks your fire' },
  { name: 'Hollow Matron', hp: 620, sp: 1.7, r: 1.35, dmg: 20, fd: 6, xp: 16, m: 9, ai: 'summon', elite: true, trait: 'Calls creepers from the dark' },
  { name: 'The Ashen Warden', hp: 5200, sp: 1.7, r: 2.5, dmg: 28, fd: 10, xp: 0, boss: true, trait: 'Lava pools and dimming light' },
];
// Champions: a mini-boss every 90 s (retention.js `champion`). An oversized elite of an existing type with its own bar.
export const CHAMPIONS = [
  { et: 2, name: 'Ironhide', sub: 'Champion Brute', scale: 1.8, hp: 1100 },
  { et: 4, name: 'The Glutton', sub: 'Champion Ember Eater', scale: 1.4, hp: 1300 },
  { et: 10, name: 'Old Matron', sub: 'Champion Matron', scale: 1.35, hp: 1300 },
];
// Sparks: one small run-only perk picked before each run (from run 2 on). Exact, visible effects; no timer.
export const PERKS = {
  heart: { name: 'Ember Heart', icon: 'heart', col: '#ff5d7a', desc: '+20 max health', hp: 20 },
  feet: { name: 'Quick Feet', icon: 'boots', col: '#6be2c8', desc: '+8% move speed', spd: 0.08 },
  sharp: { name: 'Sharp Start', icon: 'star', col: '#ffd24a', desc: 'Your starting weapon begins at level 2', wlv: 1 },
  deep: { name: 'Deep Embers', icon: 'flame', col: '#ff9d3b', desc: '+12% fire size', fire: 0.12 },
  pull: { name: 'Gem Pull', icon: 'magnet', col: '#c25bff', desc: '+30% pickup range', mag: 0.3 },
  purse: { name: 'Ember Purse', icon: 'coin', col: '#ffc02a', desc: '+15% coins from this run', coin: 0.15 },
  spark: { name: 'Bright Spark', icon: 'book', col: '#b48cff', desc: '+12% XP', xp: 0.12 },
  luck: { name: 'Lucky Charm', icon: 'clover', col: '#6bd96b', desc: '+6% crit chance', crit: 0.06 },
};
export const BOSSES = {
  drake: { name: 'The Cinder Drake', icon: 'drake', hint: 'Appears at 2:50 in Whispering Woods and Frostmere Marsh.', desc: 'Three phases: lunge, tail slam, fire breath. Stay in the light.', et: 5 },
  warden: { name: 'The Ashen Warden', icon: 'boar', hint: 'Appears at 2:50 in Ashen Hollow.', desc: 'Lava pools mark the ground, then the light dims. Keep moving, keep the fire alive.', et: 11 },
};
// Night Pacts: optional run modifiers with an exact, visible upside and downside. Chosen from the hub; never random, never timed.
export const PACTS = {
  glass: { name: 'Glass Lantern', up: '+25% XP gain', down: 'Fire capacity -25%', xp: 0.25, fireMax: -0.25 },
  heavy: { name: 'Heavy Night', up: '+30% coins', down: 'Foes have +20% health', coin: 0.3, ehp: 0.2 },
  frail: { name: 'Frail Flame', up: '+20% damage', down: 'Max health -20%', dmg: 0.2, hp: -0.2 },
  quiet: { name: 'Quiet Embers', up: '+15% fire size', down: 'Fire regrows 50% slower', fire: 0.15, regen: -0.5 },
  hungry: { name: 'Hungry Dark', up: '+40% coins', down: 'Foes move 15% faster', coin: 0.4, espd: 0.15 },
};

export const ICONS = {
  flame: '<path d="M12 2c.6 3.6 5.6 6 5.6 11.6a5.6 5.6 0 0 1-11.2 0c0-2.6 1.2-4.2 2.6-5.7.3 1.7 1 2.4 2 2.6C11 7 11.5 4.6 12 2z" fill="currentColor"/>',
  orbit: '<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="3.6" r="2.2" fill="currentColor"/><circle cx="19.3" cy="16.2" r="2.2" fill="currentColor"/><circle cx="4.7" cy="16.2" r="2.2" fill="currentColor"/>',
  bolt: '<path d="M13.5 2 5 13.5h5.5L9.5 22 19 9.5h-5.7z" fill="currentColor"/>',
  bow: '<path d="M6 3c9 3 13 9 12 18M6 3l12 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4 20 20 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  bomb: '<circle cx="11" cy="14" r="7" fill="currentColor"/><path d="M15 8c1-2 3-3 5-2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="20" cy="5.5" r="1.8" fill="#fff"/>',
  nova: '<circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.4"/>',
  wick: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  heart: '<path d="M12 21s-8-5.4-8-11a4.4 4.4 0 0 1 8-2.5A4.4 4.4 0 0 1 20 10c0 5.600-8 11-8 11z" fill="currentColor"/>',
  star: '<path d="M12 2l3 7 7 .6-5.4 4.6 1.7 7.3L12 17.8 5.700 21.500l1.700-7.300L2 9.600 9 9z" fill="currentColor"/>',
  boots: '<path d="M7 3h6v9l5 3v4H4v-4l3-2z" fill="currentColor"/>',
  magnet: '<path d="M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z" fill="currentColor"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.500 9-8 11-4.500-2-8-6-8-11V5z" fill="currentColor"/>',
  clover: '<circle cx="8.500" cy="8.500" r="4" fill="currentColor"/><circle cx="15.500" cy="8.500" r="4" fill="currentColor"/><circle cx="8.500" cy="15" r="4" fill="currentColor"/><circle cx="15.500" cy="15" r="4" fill="currentColor"/>',
  book: '<path d="M3 4h8v16H3zM13 4h8v16h-8z" fill="currentColor"/>',
  logs: '<path d="M3 18 21 12M3 12l18 6" stroke="currentColor" stroke-width="3.500" stroke-linecap="round"/><path d="M12 3c.5 2 3 3 3 5.500a3 3 0 0 1-6 0C9 6.500 11 6 12 3z" fill="currentColor"/>',
  ward: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.500"/><path d="M12 6c.4 2.500 3 3.500 3 6a3 3 0 0 1-6 0c0-1.500.8-2.300 1.500-3.200z" fill="currentColor"/>',
  coin: '<circle cx="12" cy="12" r="9" fill="currentColor"/><path d="M12 6l1.800 4 4.200.4-3.200 2.800 1 4.200L12 15.200 8.200 17.400l1-4.200L6 10.400 10.200 10z" fill="#a35a00"/>',
  skull: '<path d="M12 2a8 8 0 0 0-8 8c0 3 1.500 4.500 3 5.500V19h10v-3.500c1.500-1 3-2.500 3-5.500a8 8 0 0 0-8-8z" fill="currentColor"/><circle cx="9" cy="11" r="2" fill="#10121f"/><circle cx="15" cy="11" r="2" fill="#10121f"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.500"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2.500" fill="none" stroke-linecap="round"/>',
  stag: '<path d="M6 3v6M4 5h4M18 3v6M16 5h4M8 9l4 3 4-3v6l-4 5-4-5z" fill="currentColor" stroke="currentColor" stroke-width="1.500" stroke-linejoin="round"/>',
  drake: '<path d="M3 9 7 4l1 4 4-3 1 4 4-2-1 5 5 1-5 3 1 5-5-3-4 4-1-5-5-1 4-3z" fill="currentColor"/><circle cx="14" cy="10" r="1.5" fill="#10121f"/>',
  boar: '<path d="M4 10c0-4 4-7 8-7s8 3 8 7v4l-3 3H7l-3-3z" fill="currentColor"/><path d="M7 17l-2 4M17 17l2 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="10" r="1.4" fill="#10121f"/><circle cx="15" cy="10" r="1.4" fill="#10121f"/>',
  gear: '<circle cx="12" cy="12" r="3.500" fill="none" stroke="currentColor" stroke-width="2.500"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="2.500" stroke-linecap="round"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.500"/>',
  hero: '<circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M4 21c0-5 3-8 8-8s8 3 8 8z" fill="currentColor"/>',
  tree: '<path d="M12 2 5 11h4l-4 6h14l-4-6h4z" fill="currentColor"/><rect x="11" y="17" width="2" height="5" fill="currentColor"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0zM3 4h4v3a3 3 0 0 1-3-3zM21 4h-4v3a3 3 0 0 0 3-3zM10 14h4v3h3v3H7v-3h3z" fill="currentColor"/>',
  target: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  check: '<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  back: '<path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  fwd: '<path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor"/>',
  wisp: '<circle cx="12" cy="10" r="4.5" fill="currentColor"/><path d="M8 14c-2 3-1 6 4 8 5-2 6-5 4-8" fill="currentColor" opacity=".55"/><circle cx="10.6" cy="8.8" r="1.1" fill="#10121f"/><circle cx="13.6" cy="8.8" r="1.1" fill="#10121f"/>',
  whip: '<path d="M3 19c7 1 13-3 14-11M17 8l-3 1M17 8l1 3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  mine: '<circle cx="12" cy="13" r="6" fill="currentColor"/><path d="M12 3v4M4 13H1M23 13h-3M6 7 4 5M18 7l2-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  beacon: '<path d="M9 22l1-10h4l1 10zM10 12l-1-5h6l-1 5z" fill="currentColor"/><path d="M3 5l4 1M21 5l-4 1M12 1v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  sword: '<path d="M18.5 2.5 21.5 5.5 10 17l-3-3z" fill="currentColor"/><path d="M5 13l6 6-1.6 1.6-1.9-1.9-2.6 2.6-1.4-1.4 2.6-2.6-1.9-1.9z" fill="currentColor"/>',
  home: '<path d="M3 11 12 3l9 8v9h-6v-6H9v6H3z" fill="currentColor"/>',
};
export const icon = (n, col, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" style="color:${col || 'currentColor'}">${ICONS[n] || ''}</svg>`;
