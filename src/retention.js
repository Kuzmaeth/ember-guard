// Retention Engine: every tunable and every switch in one place, so each system can be A/B tested on its own.
// `master` turns the whole engine off (the game then plays exactly as before this session).
// Rules (see plan.md, session 3): hidden systems shape pacing and luck only, never an ad, revive or purchase prompt;
// every intervention is capped and logged; prices are fixed and real; no fake players or numbers.
export const RET = {
  master: true,
  // 1.1 Silent death clock: early runs, a lethal hit before this run's target time leaves the player at 1 HP.
  deathClock: {
    on: true, runs: 3, // first N runs (runIdx 0..N-1)
    minT: 180, maxT: 240, // target time T is random in [minT, maxT] per run; after T, death is allowed
    maxSaves: 4, gap: 6, // at most this many saves per run, at least `gap` seconds apart
    breather: 8, breatherMul: 0.35, // after a save, spawning runs at 35% for 8 s (a quiet beat, not a visible effect)
    inv: 2, fireFloor: 0.15, fireInv: 2.5, gnawSoft: 4, // hero: 1 HP + `inv` s; fire: floor + `fireInv` s immune + `gnawSoft` s of half gnaw damage
    fireLow: 0.25, fireMul: 0.45, fireBudget: 50, // while the fire is under 25%, damage to it x0.45, at most 50 s of this per run (reads as 'barely held it')
    bossNudge: true, bossAim: 0.125, bossHi: 0.15, bossCap: 0.35, // extra player damage vs the boss (max +35%) aiming for ~12.5% boss HP at T
  },
  // 1.2 Drama curve: both tails.
  drama: {
    on: true,
    domBoss: 0.3, domHp: 0.7, domFire: 0.6, enrage: 1.25, enrageAdds: 10, // dominating: boss under 30%, player healthy -> boss enrages once
    crushHp: 0.35, crushFire: 0.3, crushAfter: 5, logMul: 2.5, logPerMin: 2, // crushed for 5 s -> Ember Log chance x2.5, max 2 extra per minute
  },
  // 1.3 Last Stand: visible, once per run.
  lastStand: { on: true, inv: 1, dur: 6, dmg: 0.5, kills: 12, heal: 0.4, push: 26 },
  // 1.4 Director overlay (dev builds only).
  overlay: { on: true, key: 'F3' },
  // 2.1 Jackpot run: every 10-15 runs, all level-up cards roll legendary for one run. The odds line stays truthful.
  jackpot: { on: true, min: 10, max: 15 },
  // 3.1 Loaner weapon: run 2 opens with the Dawnblade; after `dur` s the armory takes it back. Fixed real price afterwards.
  loaner: { on: true, runIdx: 1, id: 'dawn', lv: 3, dur: 60, warn: 10 },
  // 6.2 Champion: a mini-boss every 90 s (first at 1:30), announced `warn` s ahead. Not during the boss fight.
  champion: { on: true, first: 90, every: 90, warn: 8 },
  // 5.3 Spark: pick one of three small run-only perks before each run, from run `fromRun` (0-based count of finished runs) on.
  perk: { on: true, fromRun: 1 },
  // 7 Juice: chest charge-up (seconds of game time), combo notes, low-health heartbeat and release.
  juice: { on: true, chestT: 0.55 },
  // Softer swarm tide in the first runs: the 0:24 skitter ring was the most common early death (it eats the fire).
  // First swarm at 0:30 with 55% of the skitters, later ones 80%, not sped up. (A wider 17 m ring was worse: it sent every
  // skitter past the hero to the fire.) Bot, run 1, 30 runs: deaths before 1:00 11 -> 6; reached 1:30 16 -> 22.
  earlySwarm: { on: true, runs: 3, firstT: 30, firstMul: 0.55, laterMul: 0.8, ring: 14 },
  // 9 Telemetry (local only, last 40 runs).
  tele: { on: true },
};
// Fixed for every player, never computed per player. Chosen from measured run-2 earnings (bot, median 293 coins with the
// engine off, 574 with it on) plus the 130-coin first-run floor: about one good run's worth. See plan.md, session 3.
export const DAWN_PRICE = 450;

// Dev-only A/B overrides from the URL: ?ret=off (master off), ?ret=-deathClock,-drama (switch systems off).
if (import.meta.env.DEV && typeof location !== 'undefined') {
  const m = /[?&]ret=([^&]*)/.exec(location.search);
  if (m) for (const p of decodeURIComponent(m[1]).split(',')) { if (p === 'off') RET.master = false; else if (p[0] === '-' && RET[p.slice(1)]) RET[p.slice(1)].on = false; }
}
export const on = (sys) => RET.master && !!RET[sys] && RET[sys].on;
export const randIn = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
