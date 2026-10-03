// Account progression, mastery, unlocks, achievements and the codex. Pure logic over the save object (no DOM, no rendering).
// Every number here comes from real saved stats; nothing is time-gated or random.
import { UNLOCKS, ACHIEVEMENTS, ACCT_MAX, acctNeed, acctReward, ACCT_PERKS, rankOf, RANKS, MASTERY_AT, MASTERY_PERKS, COSMETICS, WEAPONS, ET, UPGRADES, UP_MAX, upCost, HEROES, BOSSES } from './data.js';

export const SAVE_VERSION = 3;
export const defSave = () => ({
  v: SAVE_VERSION, name: null, coins: 0, up: {}, runs: 0, wins: 0, kills: 0, best: null, hero: 'warden', area: 'woods',
  set: { snd: 1, mus: 1, shake: 1, flash: 0, vib: 1, dn: 1 }, hints: {}, dda: 1, quests: null, // dn: damage numbers 0 all, 1 big hits, 2 off
  acctXp: 0, mastery: {}, unlocked: {}, ach: {}, cos: {}, pact: null, tele: [],
  seen: { w: {}, evo: {}, e: {}, b: {} },
  ret: { jackpotAt: 0, loanDone: 0 }, // Retention Engine state (session 3); see retention.js
  stats: { runs: 0, wins: 0, kills: 0, bestTime: 0, bossKills: 0, bossNoHit: 0, evoCount: 0, maxEvoRun: 0, maxKills: 0, maxLvl: 0, maxStreak: 0, golds: 0, chests: 0, upBought: 0, brightWins: 0, won: {}, wonArea: {}, timeTotal: 0 },
});

// v1 saves (one unlock per run) are converted once; nothing is lost and nothing is invented beyond what the old data implies.
export function migrate(d) {
  const s = defSave();
  if (!d) return s;
  if (d.v === SAVE_VERSION || d.v === 2) { // v2 -> v3 only added `ret`
    Object.assign(s, d); s.v = SAVE_VERSION; s.ret = Object.assign(defSave().ret, d.ret || {});
    s.set = Object.assign(defSave().set, d.set || {}); s.up = d.up || {}; s.hints = d.hints || {};
    s.tele = Array.isArray(d.tele) ? d.tele : []; s.mastery = d.mastery || {}; s.unlocked = d.unlocked || {}; s.ach = d.ach || {}; s.cos = d.cos || {};
    s.seen = Object.assign(defSave().seen, d.seen || {});
    s.stats = Object.assign(defSave().stats, d.stats || {});
    if (s.seen.b && s.seen.b.stag) { s.seen.b.drake = 1; delete s.seen.b.stag; } // the Hollow Stag became the Cinder Drake
    return s;
  }
  if (d.v === 1) {
    for (const k of ['name', 'coins', 'runs', 'wins', 'kills', 'best', 'hero', 'area', 'dda', 'namePrompted']) if (d[k] != null) s[k] = d[k];
    s.up = d.up || {}; s.hints = d.hints || {}; s.set = Object.assign(s.set, d.set || {});
    const order = ['wren', 'bomb', 'ashen', 'monk'];
    for (let i = 0; i < (d.unlockN | 0) && i < order.length; i++) s.unlocked[order[i]] = 1;
    s.stats.runs = s.runs | 0; s.stats.wins = s.wins | 0; s.stats.kills = s.kills | 0;
    if (s.best) s.stats.bestTime = s.best.t | 0;
    if (s.wins) s.stats.bossKills = s.wins;
    s.acctXp = s.runs * 110 + Math.floor(s.kills * 0.4);
    s.seen.w.bolt = s.seen.w.orbit = s.seen.w.chain = 1;
    for (let i = 0; i < 4; i++) s.seen.e[i] = s.runs > 0 ? 1 : 0;
    return s;
  }
  return s;
}

/* ---- account level ---- */
export function acctInfo(s) {
  let lvl = 1, xp = s.acctXp | 0;
  while (lvl < ACCT_MAX && xp >= acctNeed(lvl)) { xp -= acctNeed(lvl); lvl++; }
  const need = lvl >= ACCT_MAX ? 1 : acctNeed(lvl), nextRank = RANKS.find((r) => r[0] > lvl) || null;
  return { lvl, xp: lvl >= ACCT_MAX ? 1 : xp, need, frac: lvl >= ACCT_MAX ? 1 : xp / need, rank: rankOf(lvl), nextRank: nextRank && nextRank[1], nextRankLvl: nextRank && nextRank[0], max: lvl >= ACCT_MAX };
}
// Sum of permanent account perks reached so far, by key (xp, hp, dmg, fire, coin).
export function acctPerks(s, out) {
  out.xp = out.hp = out.dmg = out.fire = out.coin = 0;
  const lvl = acctInfo(s).lvl;
  for (const l in ACCT_PERKS) if (lvl >= +l) out[ACCT_PERKS[l].key] += ACCT_PERKS[l].v;
  const m = masteryInfo(s, s.hero);
  for (const l in MASTERY_PERKS) if (m.lvl >= +l) out[MASTERY_PERKS[l].key] += MASTERY_PERKS[l].v;
  return out;
}

/* ---- hero mastery ---- */
export function masteryInfo(s, hero) {
  const xp = (s.mastery && s.mastery[hero]) | 0;
  let lvl = 1; for (let i = 0; i < MASTERY_AT.length; i++) if (xp >= MASTERY_AT[i]) lvl = i + 1;
  const at = MASTERY_AT[lvl - 1], nx = MASTERY_AT[lvl];
  return { xp, lvl, max: nx == null, frac: nx == null ? 1 : (xp - at) / (nx - at), need: nx == null ? 0 : nx - at, into: xp - at };
}
export const unlockedCosmetics = (s, hero) => { const m = masteryInfo(s, hero).lvl, out = []; for (const l in COSMETICS) if (m >= +l) out.push(COSMETICS[l]); return out; };
export function activeTrail(s, hero) {
  const list = unlockedCosmetics(s, hero), id = s.cos && s.cos[hero];
  return list.find((c) => c.id === id) || null;
}

/* ---- stats, unlocks, achievements, codex ---- */
export function codexItems() {
  const items = [];
  for (const k in WEAPONS) items.push({ kind: 'w', id: k });
  for (const k in WEAPONS) items.push({ kind: 'evo', id: k });
  for (let i = 0; i < ET.length; i++) if (!ET[i].boss) items.push({ kind: 'e', id: i });
  for (const k in BOSSES) items.push({ kind: 'b', id: k });
  return items;
}
export const codexSeen = (s, it) => !!(s.seen[it.kind] && s.seen[it.kind][it.id]);
export function codexPct(s) { const it = codexItems(); let n = 0; for (const x of it) if (codexSeen(s, x)) n++; return Math.round(n / it.length * 100); }

export function statVal(s, key) {
  switch (key) {
    case 'acctLvl': return acctInfo(s).lvl;
    case 'codexPct': return codexPct(s);
    case 'heroesWon': return Object.keys(s.stats.won || {}).length;
    case 'upMaxed': { let n = 0; for (const k in UPGRADES) if ((s.up[k] | 0) >= UP_MAX) n++; return n; }
    default: return s.stats[key] | 0;
  }
}
export const unlockState = (s, u) => { const have = Math.min(u.need, statVal(s, u.stat)); return { have, need: u.need, done: !!s.unlocked[u.id] || have >= u.need, frac: have / u.need }; };
export const isUnlocked = (s, id) => {
  if (HEROES[id] && HEROES[id].start) return true;
  if (id === 'bolt' || id === 'orbit' || id === 'chain' || id === 'woods') return true;
  return !!s.unlocked[id];
};
export function evalUnlocks(s) {
  const fresh = [];
  for (const u of UNLOCKS) if (!s.unlocked[u.id] && statVal(s, u.stat) >= u.need) { s.unlocked[u.id] = 1; fresh.push(u); }
  return fresh;
}
export function achState(s, a) { const have = Math.min(a.need, statVal(s, a.stat)); return { have, need: a.need, done: !!s.ach[a.id], frac: have / a.need }; }
export function evalAch(s) {
  const fresh = [];
  for (let again = true; again;) {
    again = false;
    for (const a of ACHIEVEMENTS) if (!s.ach[a.id] && statVal(s, a.stat) >= a.need) { s.ach[a.id] = 1; s.acctXp += a.xp; fresh.push(a); again = true; }
  }
  return fresh;
}

/* ---- the one place a finished run is written into the save ---- */
// run: { time, kills, win, hero, area, lvl, evos, maxStreak, golds, chests, bossSeen, bossHits, fireFrac, hpFrac, seenW[], seenE[], seenEvo[], boss }
export function awardRun(s, run) {
  const a0 = acctInfo(s), m0 = masteryInfo(s, run.hero), st = s.stats;
  st.runs++; st.kills += run.kills; st.timeTotal += Math.round(run.time);
  if (run.win) { st.wins++; st.bossKills++; st.won[run.hero] = 1; st.wonArea[run.area] = 1; if (run.bossHits === 0) st.bossNoHit++; if (run.fireFrac >= 0.8) st.brightWins++; }
  st.bestTime = Math.max(st.bestTime, Math.round(run.time)); st.maxKills = Math.max(st.maxKills, run.kills); st.maxLvl = Math.max(st.maxLvl, run.lvl);
  st.maxStreak = Math.max(st.maxStreak, run.maxStreak); st.golds += run.golds; st.chests += run.chests; st.evoCount += run.evos; st.maxEvoRun = Math.max(st.maxEvoRun, run.evos);
  for (const id of run.seenW) s.seen.w[id] = 1;
  for (const id of run.seenEvo) s.seen.evo[id] = 1;
  for (const t of run.seenE) s.seen.e[t] = 1;
  if (run.boss) s.seen.b[run.boss] = 1;
  const xpGain = Math.round(run.time * 0.9 + run.kills * 0.4 + (run.win ? 150 : 0));
  s.acctXp += xpGain;
  const mGain = Math.round(run.time * 0.5 + run.kills * 0.3 + (run.win ? 60 : 0));
  s.mastery[run.hero] = (s.mastery[run.hero] | 0) + mGain;
  const newUnlocks = evalUnlocks(s);
  const newAch = evalAch(s);
  const a1 = acctInfo(s), levelUps = [];
  for (let l = a0.lvl + 1; l <= a1.lvl; l++) { const c = acctReward(l); s.coins += c; levelUps.push({ lvl: l, coins: c, perk: ACCT_PERKS[l] ? ACCT_PERKS[l].text : null, rank: RANKS.find((r) => r[0] === l) ? rankOf(l) : null }); }
  const newUnlocks2 = evalUnlocks(s); // account level may have crossed an unlock threshold
  const m1 = masteryInfo(s, run.hero), mastUps = [];
  for (let l = m0.lvl + 1; l <= m1.lvl; l++) mastUps.push({ lvl: l, perk: MASTERY_PERKS[l] ? MASTERY_PERKS[l].text : null, cos: COSMETICS[l] ? COSMETICS[l].name : null });
  return { xpGain, mGain, a0, a1, levelUps, m0, m1, mastUps, newUnlocks: newUnlocks.concat(newUnlocks2), newAch, rankUp: a1.rank !== a0.rank ? a1.rank : null };
}

/* ---- "next best thing to do" ---- */
export function nextGoal(s) {
  for (const k in UPGRADES) { const l = s.up[k] | 0; if (l < UP_MAX && s.coins >= upCost(k, l)) return { kind: 'shop', text: 'You can afford a permanent upgrade: ' + UPGRADES[k].name, frac: 1, cta: 'up' }; }
  let best = null;
  for (const u of UNLOCKS) { if (s.unlocked[u.id]) continue; const st = unlockState(s, u); if (!best || st.frac > best.frac) best = { kind: 'unlock', text: u.name + ': ' + u.label + ' (' + st.have + '/' + st.need + ')', frac: st.frac, cta: 'play', u }; }
  if (best) return best;
  let ach = null;
  for (const a of ACHIEVEMENTS) { if (s.ach[a.id]) continue; const st = achState(s, a); if (!ach || st.frac > ach.frac) ach = { kind: 'ach', text: a.name + ': ' + a.desc + ' (' + st.have + '/' + st.need + ')', frac: st.frac, cta: 'play' }; }
  return ach || { kind: 'done', text: 'Everything unlocked. Chase your best run.', frac: 1, cta: 'play' };
}

/* ---- session tasks (Retention Engine 4.5): three small goals per play session, real coin rewards paid at run end ----
   A "session" is one page visit: tasks are regenerated when the page is opened again or when all three are done.
   Targets scale with the player's account tier so they stay reachable; no timers, nothing expires mid-session. */
export const QUESTS = {
  kills: { kind: 'sum', icon: 'skull', fmt: (n) => `Defeat ${n} foes`, n: [150, 300, 500], coin: [40, 60, 90] },
  runs: { kind: 'sum', icon: 'play', fmt: (n) => `Play ${n} runs`, n: [2, 3, 3], coin: [40, 50, 60] },
  chests: { kind: 'sum', icon: 'star', fmt: (n) => `Open ${n} Cinder Chest${n > 1 ? 's' : ''}`, n: [1, 2, 3], coin: [40, 60, 80], min: 1 },
  boss: { kind: 'sum', icon: 'drake', fmt: () => 'Reach the boss', n: [1, 1, 2], coin: [70, 70, 100], min: 1 },
  evo: { kind: 'sum', icon: 'bolt', fmt: (n) => n > 1 ? `Evolve ${n} weapons` : 'Evolve a weapon', n: [1, 1, 2], coin: [70, 70, 110], min: 1 },
  lvl: { kind: 'best', icon: 'crown', fmt: (n) => `Reach level ${n} in one run`, n: [5, 8, 12], coin: [40, 60, 90] },
  time: { kind: 'best', icon: 'clock', fmt: (n) => `Survive ${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} in one run`, n: [90, 150, 200], coin: [40, 60, 90] },
  streak: { kind: 'best', icon: 'flame', fmt: (n) => `Reach a ${n} kill streak`, n: [25, 50, 100], coin: [40, 60, 90] },
};
// value a finished (or live) run contributes to a task
export function questRunVal(id, run) {
  switch (id) {
    case 'kills': return run.kills | 0; case 'runs': return 1; case 'chests': return run.chests | 0; case 'boss': return run.bossSeen ? 1 : 0;
    case 'evo': return run.evos | 0; case 'lvl': return run.lvl | 0; case 'time': return Math.floor(run.time || 0); case 'streak': return run.maxStreak | 0; default: return 0;
  }
}
const SESSION = Math.random().toString(36).slice(2, 10); // one per page visit
export function questTier(s) { const l = acctInfo(s).lvl; return l < 4 ? 0 : l < 9 ? 1 : 2; }
export function genQuests(s) {
  const tier = questTier(s), pool = Object.keys(QUESTS).filter((id) => (QUESTS[id].min || 0) <= tier || (id === 'chests' && s.runs >= 1) || (id === 'boss' && s.stats.bestTime >= 120));
  const sums = pool.filter((id) => QUESTS[id].kind === 'sum'), bests = pool.filter((id) => QUESTS[id].kind === 'best');
  const pick = (arr) => arr.splice((Math.random() * arr.length) | 0, 1)[0];
  const ids = [pick(sums), pick(bests)]; const rest = sums.concat(bests); ids.push(pick(rest));
  s.quests = { sid: SESSION, list: ids.map((id) => ({ id, n: QUESTS[id].n[tier], coin: QUESTS[id].coin[tier], have: 0, done: 0 })) };
  return s.quests;
}
export function ensureQuests(s) {
  if (!s.quests || s.quests.sid !== SESSION || !s.quests.list || s.quests.list.every((q) => q.done)) genQuests(s);
  return s.quests;
}
export const questText = (q) => QUESTS[q.id].fmt(q.n);
// Live progress of a task including the run in progress (for the HUD and the pause menu).
export function questLive(q, run) { const v = questRunVal(q.id, run); return QUESTS[q.id].kind === 'sum' ? Math.min(q.n, q.have + v) : Math.min(q.n, Math.max(q.have, v)); }
// Write a finished run into the tasks; returns the tasks completed by this run (coins are added to the save).
export function applyQuests(s, run) {
  const qs = ensureQuests(s), fresh = [];
  for (const q of qs.list) {
    if (q.done) continue;
    q.have = questLive(q, run);
    if (q.have >= q.n) { q.done = 1; s.coins += q.coin; fresh.push(q); }
  }
  return fresh;
}

/* ---- the closest thing to completion, for the death screen (4.1). All values are real. ---- */
export function nearestGoal(s, run) {
  const c = [];
  if (run.bossSeen && !run.win && run.bossHp != null) c.push({ kind: 'boss', icon: 'drake', frac: 1 - run.bossHp, text: `${run.bossName} had ${Math.max(1, Math.round(run.bossHp * 100))}% health left`, sub: 'You were close. Same fire, one more try.' });
  if (run.xpNeed > 0) { const left = Math.max(1, Math.ceil(run.xpNeed - run.xp)); c.push({ kind: 'lvl', icon: 'crown', frac: run.xp / run.xpNeed, text: `${left} XP short of level ${run.lvl + 1}`, sub: 'Your level bar when the run ended.' }); }
  for (const u of UNLOCKS) { if (s.unlocked[u.id]) continue; const st = unlockState(s, u); c.push({ kind: 'unlock', icon: u.type === 'hero' ? 'hero' : u.type === 'area' ? 'tree' : 'lock', frac: st.frac, text: `${u.name}: ${st.have} / ${st.need}`, sub: u.label }); }
  if (s.quests) for (const q of s.quests.list) if (!q.done) c.push({ kind: 'task', icon: QUESTS[q.id].icon, frac: q.have / q.n, text: `Task: ${questText(q)} (${q.have} / ${q.n})`, sub: `+${q.coin} coins when done` });
  c.sort((a, b) => b.frac - a.frac);
  return c[0] || null;
}
export function nextUnlock(s) {
  let best = null;
  for (const u of UNLOCKS) { if (s.unlocked[u.id]) continue; const st = unlockState(s, u); if (!best || st.frac > best.st.frac) best = { u, st }; }
  return best;
}
