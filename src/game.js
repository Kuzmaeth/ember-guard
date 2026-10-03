// Game simulation: fixed-timestep logic with interpolated rendering. Zero per-frame allocation in the hot paths.
import * as THREE from 'three';
import * as G from './gfx.js';
import * as A from './audio.js';
import * as P from './platform.js';
import * as UI from './ui.js';
import { AREAS, HEROES, WEAPONS, PASSIVES, RARITY, UPGRADES, UP_MAX, upCost, UNLOCKS, ET, PACTS, BOSSES, CHAMPIONS, PERKS, icon } from './data.js';
import * as PR from './progress.js';
import { RET, on as retOn, randIn, randInt, DAWN_PRICE } from './retention.js';

const { U, wM, makeInst, makeLit, Q, fx } = G;
const STEP = 1 / 60, MAXE = 380, MAXB = 160, MAXS = 90, MAXG = 420, BOSS_T = 170, BOSS_HP = 4200;
const GW = 32, GO = 40, CS = 2.5;
const isBoss = (t) => t === 5 || t === 11;
const T_SPIT = 6, T_BULW = 7, T_BOMB = 8, T_MOTH = 9, T_MATRON = 10, T_WARDEN = 11;
const TAU = Math.PI * 2;

/* ---------------- save ---------------- */
export let save = PR.defSave();
export function loadSave() { save = PR.migrate(P.loadData()); if (!Number.isFinite(save.coins)) save.coins = 0; PR.evalUnlocks(save); for (const r of save.tele) if (r.rq === null) r.rq = 'q'; return save; }
export function eraseSave() { P.clearData(); save = PR.defSave(); }
export const persist = () => P.saveData(save);
const FREE_W = { bolt: 1, orbit: 1, chain: 1 };
export const heroUnlocked = (id) => PR.isUnlocked(save, id);
export const areaUnlocked = (id) => PR.isUnlocked(save, id);
export const weaponUnlocked = (id) => !!FREE_W[id] || !!save.unlocked[id] || (id === 'wisp' && !!save.unlocked.ash) || (id === 'bow' && !!save.unlocked.wren) || (id === 'nova' && !!save.unlocked.monk);
export const upLvl = (id) => save.up[id] | 0;
export const dawnPrice = () => DAWN_PRICE;
// Armory: the one weapon sold for coins (Dawnblade). Fixed price, permanent: it joins the level-up pool.
export function buyWeapon(id) {
  if (id !== 'dawn' || save.unlocked.dawn || save.coins < DAWN_PRICE) return false;
  save.coins -= DAWN_PRICE; save.unlocked.dawn = 1; save.seen.w.dawn = 1; persist(); A.sfx('unlock');
  return true;
}
export function canAffordAny() { for (const k in UPGRADES) { const l = upLvl(k); if (l < UP_MAX && save.coins >= upCost(k, l)) return true; } return false; }
export function buyUpgrade(id) {
  const l = upLvl(id);
  if (l >= UP_MAX || save.coins < upCost(id, l)) return false;
  save.coins -= upCost(id, l); save.up[id] = l + 1; save.stats.upBought++; persist(); A.sfx('confirm');
  const fresh = PR.evalAch(save); if (fresh.length) persist();
  return { ok: true, ach: fresh };
}
export const rankInfo = () => PR.acctInfo(save);
export function affordableCount() { let n = 0; for (const k in UPGRADES) { const l = upLvl(k); if (l < UP_MAX && save.coins >= upCost(k, l)) n++; } return n; }
export function selectHero(id) { if (heroUnlocked(id)) { save.hero = id; persist(); } }
export function selectArea(id) { if (areaUnlocked(id)) { save.area = id; persist(); } }
export function setSetting(k, v) { save.set[k] = v; persist(); applySettings(); }
let trailC = null;
function applySettings() { A.setEnabled(!!save.set.snd, !!save.set.mus); }
export function setName(n) { save.name = n; persist(); }
export const getName = () => save.name || P.getPlayerName();

/* ---------------- state ---------------- */
export const GS = { hp: 100, maxhp: 100, fire: 1, fireR: 9, lvl: 1, xp: 0, need: 8, time: 0, coins: 0, wave: 1, boss: false, bossHp: 1, bossPhase: 1, kills: 0, streak: 0, pace: '', alive: 0, fps: 60, wcd: new Float32Array(4) };
let phase = 'boot', timeScale = 1, hitstop = 0, acc = 0, lastT = 0, preT = 0, slowT = 0, slowTo = 1, endT = 0;
let T = 0, hero = HEROES.warden;
let runIdx = 0, finale = 1;

const H = { x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, hp: 100, face: 0, inv: 0, hurtT: 0, bob: 0, mv: 0, squash: 0, lastDx: 0, lastDz: 1 };
const F = { hp: 100, max: 100, R: 9, last: 1, flick: 1 };
const ST = { maxHp: 100, speed: 5.4, mag: 3.2, dmg: 1, atk: 1, crit: 0.05, xp: 1, coin: 1, fireMax: 100, fireRad: 9.5, fireRegen: 1.4, fireRes: 1, lightBonus: 0.2 };
const seenEn = new Uint8Array(16);
const R_ = { maxStreak: 0, evos: 0, chests: 0, bossHits: 0, t: 0, kills: 0, coins: 0, lvl: 1, xp: 0, need: 8, pending: 0, chestPending: 0, streak: 0, streakT: 0, tier: 0, wave: 1, lastEmber: false, spawnAcc: 0, swarmN: 0, swarmT: 0, eliteT: 0, nearT: 0, pace: [], moths: 0, darkT: 0, wardenDim: 0, hazT: 6, shrineT: 55, shrinePending: 0, paceNext: 15, dens: 1, pressure: 1, pressT: 0, pressHi: 0, bossDone: false, bossSeen: false, gemChain: 0, gemChainT: 0, golds: 0, hitsTaken: 0, hpAtEnd: 1 };
let shake = 0, fovKick = 0, dark = 0, dawn = 0, danger = 0, dangerS = 0, hurtFx = 0, flashFx = 0;
const cam = { x: 0, y: 14, z: 10, lx: 0, lz: 0 };
const pv = {}, pl = {};
for (const k in PASSIVES) { pv[k] = 0; pl[k] = 0; }
const wLv = {}, wEvo = {}, wDm = {}, wCd = {};
for (const k in WEAPONS) { wLv[k] = 0; wEvo[k] = false; wDm[k] = 0; wCd[k] = 0; }
let wOwned = [];

/* light sources: the fire, plus any Cinder Wisp (Torch Carry) */
const WX = new Float32Array(8), WZ = new Float32Array(8); let wispN = 0, wispLR2 = 4.84, eliteN = 0;
function isLit(x, z) {
  if (x * x + z * z < F.R * F.R) return true;
  for (let k = 0; k < wispN; k++) { const dx = x - WX[k], dz = z - WZ[k]; if (dx * dx + dz * dz < wispLR2) return true; }
  return false;
}

/* ---------------- enemies (SoA) ---------------- */
const ex = new Float32Array(MAXE), ez = new Float32Array(MAXE), epx = new Float32Array(MAXE), epz = new Float32Array(MAXE);
const evx = new Float32Array(MAXE), evz = new Float32Array(MAXE), ehp = new Float32Array(MAXE), emx = new Float32Array(MAXE);
const eflash = new Float32Array(MAXE), eatk = new Float32Array(MAXE), eph = new Float32Array(MAXE), estun = new Float32Array(MAXE);
const eorb = new Float32Array(MAXE), efc = new Float32Array(MAXE), eage = new Float32Array(MAXE), espd = new Float32Array(MAXE);
const etype = new Uint8Array(MAXE), ealive = new Uint8Array(MAXE), egold = new Uint8Array(MAXE), ecell = new Int32Array(MAXE), echamp = new Uint8Array(MAXE), escl = new Float32Array(MAXE).fill(1);
const enova = new Int32Array(MAXE), echain = new Int32Array(MAXE), ecd = new Float32Array(MAXE);
const efree = new Int32Array(MAXE); let nfree = 0, eHi = 0, nAlive = 0;
const cellStart = new Int32Array(GW * GW + 1), cellCur = new Int32Array(GW * GW), order = new Int32Array(MAXE);
const qBuf = new Int32Array(MAXE); let qn = 0;
function resetEnemies() { ealive.fill(0); nfree = 0; for (let i = MAXE - 1; i >= 0; i--) efree[nfree++] = i; eHi = 0; nAlive = 0; }
const cellOf = (x, z) => { let cx = ((x + GO) / CS) | 0, cz = ((z + GO) / CS) | 0; cx = cx < 0 ? 0 : cx >= GW ? GW - 1 : cx; cz = cz < 0 ? 0 : cz >= GW ? GW - 1 : cz; return cz * GW + cx; };
function buildHash() {
  cellStart.fill(0);
  for (let i = 0; i < eHi; i++) if (ealive[i]) { const c = cellOf(ex[i], ez[i]); ecell[i] = c; cellStart[c + 1]++; }
  for (let c = 0; c < GW * GW; c++) cellStart[c + 1] += cellStart[c];
  for (let c = 0; c < GW * GW; c++) cellCur[c] = cellStart[c];
  for (let i = 0; i < eHi; i++) if (ealive[i]) order[cellCur[ecell[i]]++] = i;
}
function gather(x, z, r) {
  qn = 0;
  let cx0 = ((x - r - 1.2 + GO) / CS) | 0, cx1 = ((x + r + 1.2 + GO) / CS) | 0, cz0 = ((z - r - 1.2 + GO) / CS) | 0, cz1 = ((z + r + 1.2 + GO) / CS) | 0;
  cx0 = cx0 < 0 ? 0 : cx0; cz0 = cz0 < 0 ? 0 : cz0; cx1 = cx1 >= GW ? GW - 1 : cx1; cz1 = cz1 >= GW ? GW - 1 : cz1;
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = cz * GW + cx;
    for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
      const i = order[k], dx = ex[i] - x, dz = ez[i] - z, rr = r + ET[etype[i]].r;
      if (dx * dx + dz * dz < rr * rr) qBuf[qn++] = i;
    }
  }
}
function nearest(x, z, maxd) {
  let best = -1, bd = maxd * maxd;
  for (let i = 0; i < eHi; i++) if (ealive[i]) { const dx = ex[i] - x, dz = ez[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
  return best;
}
function randomIn(x, z, maxd) {
  let best = -1, n = 0;
  for (let k = 0; k < 14; k++) { const i = (Math.random() * eHi) | 0; if (ealive[i]) { const dx = ex[i] - x, dz = ez[i] - z; if (dx * dx + dz * dz < maxd * maxd) { best = i; n++; if (n > 0 && Math.random() < 0.5) break; } } }
  return best;
}

/* ---------------- other pools ---------------- */
const bx = new Float32Array(MAXB), bz = new Float32Array(MAXB), bvx = new Float32Array(MAXB), bvz = new Float32Array(MAXB), blife = new Float32Array(MAXB), bdmg = new Float32Array(MAXB), bpierce = new Int8Array(MAXB), btype = new Uint8Array(MAXB), bt = new Float32Array(MAXB), bdur = new Float32Array(MAXB), bsx = new Float32Array(MAXB), bsz = new Float32Array(MAXB), btx = new Float32Array(MAXB), btz = new Float32Array(MAXB), brad = new Float32Array(MAXB), bcb = new Float32Array(MAXB);
const bcol = new Uint8Array(MAXB), bhom = new Uint8Array(MAXB), balive = new Uint8Array(MAXB), bhit = new Int32Array(MAXB * 4).fill(-1), bcrit = new Float32Array(MAXB);
const sx_ = new Float32Array(MAXS), sz_ = new Float32Array(MAXS), svx = new Float32Array(MAXS), svz = new Float32Array(MAXS), slife = new Float32Array(MAXS), sdmg = new Float32Array(MAXS), smin = new Float32Array(MAXS), salive = new Uint8Array(MAXS);
const gx = new Float32Array(MAXG), gz = new Float32Array(MAXG), gval = new Float32Array(MAXG), gv = new Float32Array(MAXG), gt = new Float32Array(MAXG);
const gkind = new Uint8Array(MAXG), galive = new Uint8Array(MAXG), gmag = new Uint8Array(MAXG); let gHi = 0;
const orbX = new Float32Array(16), orbZ = new Float32Array(16); let orbN = 0, orbA = 0;
const lnT = new Float32Array(64); let lnP = 0, chainStamp = 0, novaStamp = 0;
const NV = { on: false, t: 0, r: 0, max: 5, dmg: 20, heal: 0 };
const BB = { kind: 'drake', i: -1, on: false, state: 0, t: 0, phase: 1, dx: 0, dz: 1, inv: 0, walkT: 2.5, hit: false, minD: 99, volleys: 0, off: 0, hurtCd: 0, face: 0, choice: 0, roarDone: 0 };

/* ---------------- meshes ---------------- */
let I = null;
const cntE = new Int32Array(16);
const ECAP = [MAXE, MAXE, 150, 160, 48, 120, 100, 100, 100, 16]; // instance capacity per enemy mesh slot (several enemy types share a mesh slot)
function buildMeshes() {
  const lit = makeLit(true, false);
  I = {};
  I.hero = makeInst(G.heroGeo(hero), makeLit(true, false, true, false, true), 1, true, true);
  I.en = [];
  for (let t = 0; t < G.enemyGeo.length; t++) { const g = G.enemyGeo[t](); I.en.push(makeInst(g, lit, ECAP[t], true, true)); }
  I.boss = makeInst(G.bossGeo(), lit, 1, true, true);
  I.gem = makeInst(G.gemGeo(), lit, MAXG, true);
  I.chest = makeInst(G.chestGeo(), lit, 8, true);
  I.bolt = makeInst(G.boltGeo(), lit, MAXB, true); I.arrow = makeInst(G.arrowGeo(), lit, MAXB, true); I.bomb = makeInst(G.bombGeo(), lit, 40, true);
  I.wisp = makeInst(G.orbGeo(), lit, 8, true); I.mine = makeInst(G.bombGeo(), lit, MAXM, true);
  I.orb = makeInst(G.orbGeo(), lit, 16, true); I.eshot = makeInst(G.enemyShotGeo(), lit, MAXS, true);
  for (const k of ['hero', 'boss', 'gem', 'chest', 'bolt', 'arrow', 'bomb', 'orb', 'wisp', 'mine', 'eshot']) G.scene.add(I[k].mesh);
  for (const o of I.en) G.scene.add(o.mesh);
  I.boss.mesh.visible = false;
}
// Compile every shader program and upload every buffer during loading, including meshes that start hidden (boss,
// telegraphs, effect rings). Without this the first run frame and the first boss frame each stalled for about 50 ms.
function prewarm() {
  const hidden = [];
  G.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { G.prewarm(); } catch (e) { /* warm-up is best effort */ }
  for (const o of hidden) o.visible = false;
}
function rebuildHero() {
  G.scene.remove(I.hero.mesh); I.hero.mesh.geometry.dispose();
  I.hero = makeInst(G.heroGeo(hero), makeLit(true, false, true, false, true), 1, true, true); G.scene.add(I.hero.mesh);
}

/* ---------------- helpers ---------------- */
const vib = (ms) => { if (save.set.vib && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } };
const addShake = (a) => { if (save.set.shake) shake = Math.min(1, shake + a); };
const kick = (a) => { fovKick = Math.min(14, fovKick + (save.set.flash ? a * 0.4 : a)); };
const FEEL = { on: false, log: null, n: 0 }; // dev-only hitstop accounting for _debugFeel
const stop = (s) => { if (FEEL.on) { FEEL.n++; const k = new Error().stack.split(String.fromCharCode(10))[2].trim().split(' ')[1]; FEEL.log[k] = (FEEL.log[k] | 0) + 1; } if (s < 0.05) { const n = performance.now(); if (n - lastMinorStop < 300) return; lastMinorStop = n; } hitstop = Math.max(hitstop, s); };
// Hitstop is for impact moments only. Minor ones (< 50 ms: hits taken, heavy kills) are rate-limited to one per 300 ms of real time;
// they used to fire on every crit, explosion and mid-size kill (about 2 freezes a second, which read as stutter).
let lastMinorStop = 0;
const slow = (dur, to) => { slowT = Math.max(slowT, dur); slowTo = to; };
const pe = (x, y, z, vx, vy, vz, life, size, r, g, b, grav, drag, grow) => G.parts.emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav, drag, grow);
const burst = (x, y, z, n, sp, life, size, r, g, b, grav, up) => G.parts.burst(x, y, z, n, sp, life, size, r, g, b, grav, up);
const fireDist = (x, z) => Math.hypot(x, z);
const xpNeed = (l) => Math.round(3 + l * 4 + l * l * 0.9);

const perks = { xp: 0, hp: 0, dmg: 0, fire: 0, coin: 0 };
const PM = { xp: 0, fireMax: 0, coin: 0, ehp: 0, dmg: 0, hp: 0, fire: 0, regen: 0, espd: 0 };
const RK = { hp: 0, spd: 0, fire: 0, mag: 0, coin: 0, xp: 0, crit: 0 }; let runPerk = null; // this run's spark (PERKS in data.js)
function applyPerk(id) { for (const k in RK) RK[k] = 0; runPerk = id && PERKS[id] ? id : null; if (runPerk) for (const k in RK) if (PERKS[id][k]) RK[k] = PERKS[id][k]; } // active Night Pact modifiers (all zero without a pact)
function applyPact() { for (const k in PM) PM[k] = 0; const p = save.pact && PACTS[save.pact] && PR.isUnlocked(save, 'pacts') ? PACTS[save.pact] : null; if (p) for (const k in PM) if (p[k]) PM[k] = p[k]; }
function recalc() {
  const u = save.up, h = hero, AP = PR.acctPerks(save, perks);
  const oldMax = ST.maxHp, oldFm = ST.fireMax;
  ST.maxHp = Math.round(h.hp * (1 + 0.12 * (u.vit | 0) + AP.hp + PM.hp) + pv.cloak * 20 + RK.hp);
  ST.speed = h.speed * (1 + 0.04 * (u.haste | 0) + pv.boots * 0.08 + RK.spd);
  ST.mag = 3.4 * (1 + 0.12 * (u.mag | 0) + pv.magnet * 0.3 + RK.mag);
  ST.dmg = (1 + 0.06 * (u.might | 0) + AP.dmg + PM.dmg) * (1 + pv.flint * 0.1);
  ST.atk = 1 + pv.wick * 0.12;
  ST.crit = 0.05 + h.crit + 0.03 * (u.fort | 0) + pv.clover * 0.06 + RK.crit;
  ST.xp = (1 + 0.08 * (u.wis | 0) + AP.xp + PM.xp + RK.xp) * (1 + pv.scholar * 0.12);
  ST.coin = 1 + 0.06 * (u.fort | 0) + AP.coin + PM.coin + RK.coin;
  ST.fireMax = 100 * (1 + h.fireMax + 0.15 * pv.heart + PM.fireMax);
  ST.fireRad = 9.5 * (1 + 0.08 * (u.kin | 0) + AP.fire + PM.fire + RK.fire) * (1 + 0.1 * pv.heart);
  ST.fireRegen = (1.4 + h.fireRegen + 0.5 * (u.ward | 0)) * (1 + pv.kindle) * (1 + PM.regen);
  ST.fireRes = Math.max(0.4, 1 - 0.08 * (u.ward | 0));
  ST.lightBonus = 0.2 + pv.ward;
  if (oldMax > 0 && ST.maxHp !== oldMax) H.hp = Math.min(ST.maxHp, H.hp + Math.max(0, ST.maxHp - oldMax));
  if (oldFm > 0 && ST.fireMax !== oldFm) F.hp = F.hp * ST.fireMax / oldFm;
  F.max = ST.fireMax;
}

export function wInfo(id, lv, evo) {
  switch (id) {
    case 'bolt': return { n: evo ? 5 : [1, 1, 2, 2, 3][lv - 1], dmg: (11 + 4 * lv) * (evo ? 1.3 : 1), cd: (1.0 - 0.07 * lv) * (evo ? 0.8 : 1), pierce: evo ? 3 : (lv >= 4 ? 1 : 0), unit: 'embers' };
    case 'orbit': return { n: evo ? 8 : [2, 2, 3, 3, 4][lv - 1], dmg: (9 + 3 * lv) * (evo ? 1.5 : 1), unit: 'orbs' };
    case 'chain': return { n: evo ? 9 : 2 + lv, dmg: (14 + 5 * lv) * (evo ? 1.4 : 1), cd: (2.1 - 0.15 * lv) * (evo ? 0.8 : 1), unit: 'bounces' };
    case 'bow': return { n: evo ? 5 : [1, 1, 2, 2, 3][lv - 1], dmg: (8 + 3 * lv) * (evo ? 1.2 : 1), cd: (0.8 - 0.08 * lv) * (evo ? 0.8 : 1), unit: 'arrows' };
    case 'bomb': return { n: evo ? 4 : 1, dmg: (26 + 9 * lv) * (evo ? 1.2 : 1), cd: 2.9 - 0.2 * lv, rad: 2.4 + 0.15 * lv + (evo ? 0.6 : 0), unit: evo ? 'clusters' : 'bomb' };
    case 'wisp': return { n: evo ? 4 : [1, 1, 2, 2, 3][lv - 1], dmg: (8 + 3 * lv) * (evo ? 1.4 : 1), cd: (1.5 - 0.1 * lv) * (evo ? 0.7 : 1), rad: evo ? 3.4 : 2.4 + 0.1 * lv, unit: 'wisps' };
    case 'whip': return { n: 1, dmg: (18 + 6 * lv) * (evo ? 1.4 : 1), cd: (1.5 - 0.1 * lv) * (evo ? 0.75 : 1), rad: 3.4 + 0.3 * lv + (evo ? 0.8 : 0), unit: evo ? 'full circle' : 'arc' };
    case 'mine': return { n: evo ? 6 : Math.min(5, 2 + lv), dmg: (28 + 10 * lv) * (evo ? 1.3 : 1), cd: (3.4 - 0.25 * lv) * (evo ? 0.75 : 1), rad: 2.3 + 0.12 * lv + (evo ? 0.7 : 0), unit: 'mines' };
    case 'dawn': return { n: 1, dmg: (24 + 8 * lv) * (evo ? 1.5 : 1), cd: (1.7 - 0.1 * lv) * (evo ? 0.75 : 1), rad: 3.6 + 0.25 * lv + (evo ? 1 : 0), unit: 'circle' };
    case 'beacon': return { n: evo ? 2 : 1, dmg: (30 + 10 * lv) * (evo ? 1.3 : 1), cd: (6 - 0.4 * lv) * (evo ? 0.8 : 1), unit: evo ? 'pulses' : 'pulse' };
    default: return { n: 1, dmg: (20 + 7 * lv) * (evo ? 1.5 : 1), cd: (4.3 - 0.3 * lv) * (evo ? 0.85 : 1), rad: (3.8 + 0.5 * lv) * (evo ? 1.4 : 1), unit: 'ring' };
  }
}
const wDmg = (id) => wInfo(id, wLv[id], wEvo[id]).dmg * (1 + wDm[id]) * ST.dmg * (LS.t > 0 ? 1 + RET.lastStand.dmg : 1);

/* ---------------- Retention Engine: run director (switches and tunables in retention.js) ---------------- */
// Hidden systems here shape pacing and luck only. None of them ever leads to an ad, a revive or a purchase prompt.
// Every intervention is capped and logged (RUN.iv, telemetry, the F3 overlay).
let SIM = false; // headless balance runs must not touch persistent retention state
const DC = { on: false, T: 0, saves: 0, last: -99, denied: -99, fireInv: 0, gnawSoft: 0, assist: 0, assistOn: false, calm: 0, nudge: 0, bLast: 1, bRate: 0, bAcc: 0 }; // 1.1 death clock
const DR = { crushT: 0, crushed: false, min: -1, logs: 0, enraged: false }; // 1.2 drama curve
const LS = { used: false, t: 0, k0: 0, held: false, hinted: false }; // 1.3 Last Stand
const RUN = { jackpot: false, loan: false, loanHad: false, loanT: 0, loanIntro: 0, iv: [], ivN: {}, nudgeMax: 0 };
function ivLog(k, note) {
  RUN.ivN[k] = (RUN.ivN[k] | 0) + 1;
  if (RUN.iv.length < 60) RUN.iv.push({ t: Math.round(R_.t * 10) / 10, k, note: note || '' });
}
const isLoan = (id) => RUN.loan && id === RET.loaner.id;
function retStart() {
  const dc = RET.deathClock;
  Object.assign(DC, { on: retOn('deathClock') && runIdx < dc.runs, T: randIn(dc.minT, dc.maxT), saves: 0, last: -99, denied: -99, fireInv: 0, gnawSoft: 0, assist: 0, assistOn: false, calm: 0, nudge: 0, bLast: 1, bRate: 0, bAcc: 0 });
  Object.assign(DR, { crushT: 0, crushed: false, min: -1, logs: 0, enraged: false });
  Object.assign(LS, { used: !retOn('lastStand'), t: 0, k0: 0, held: false, hinted: false });
  RUN.iv = []; RUN.ivN = {}; RUN.nudgeMax = 0; RUN.loan = false; RUN.loanHad = false; RUN.loanT = 0; RUN.loanIntro = 0;
  // 2.1 jackpot run: every 10-15 runs (random). Run numbers are 1-based.
  RUN.jackpot = false;
  if (retOn('jackpot') && !SIM) {
    const no = save.runs + 1, jc = RET.jackpot;
    if (!save.ret.jackpotAt) save.ret.jackpotAt = randInt(jc.min, jc.max);
    if (no >= save.ret.jackpotAt) { RUN.jackpot = true; save.ret.jackpotAt = no + randInt(jc.min, jc.max); persist(); ivLog('jackpot'); }
  }
  // 3.1 loaner: the Dawnblade for the opening minute of run 2
  const ln = RET.loaner;
  if (retOn('loaner') && runIdx === ln.runIdx && (SIM || (!save.ret.loanDone && !save.unlocked[ln.id])) && !wOwned.includes(ln.id)) {
    RUN.loan = RUN.loanHad = true; RUN.loanT = ln.dur; RUN.loanIntro = 1.7;
    addWeapon(ln.id); wLv[ln.id] = ln.lv; ivLog('loan', 'lent');
  }
}
function dcSave(kind) {
  if (!DC.on || R_.t >= DC.T) return false;
  const dc = RET.deathClock;
  if (DC.saves >= dc.maxSaves || R_.t - DC.last < dc.gap) { if (R_.t - DC.denied > 3) { DC.denied = R_.t; ivLog('denied', kind + (DC.saves >= dc.maxSaves ? ' cap' : ' gap')); } return false; }
  DC.saves++; DC.last = R_.t; DC.calm = dc.breather; ivLog('save', kind); return true;
}
function retSaveHero() {
  if (!LS.used) { startLastStand(); return true; }
  if (dcSave('hero')) { H.hp = 1; H.inv = Math.max(H.inv, RET.deathClock.inv); return true; }
  return false;
}
function startLastStand() {
  const c = RET.lastStand;
  LS.used = true; LS.t = c.dur; LS.k0 = R_.kills; H.hp = 1; H.inv = c.inv;
  gather(H.x, H.z, 6);
  for (let k = 0; k < qn; k++) { const e = qBuf[k]; if (ET[etype[e]].boss) continue; const dx = ex[e] - H.x, dz = ez[e] - H.z, d = Math.hypot(dx, dz) || 1; evx[e] += dx / d * c.push; evz[e] += dz / d * c.push; estun[e] = Math.max(estun[e], 0.6); }
  for (let k = 0; k < 40; k++) { const a = k / 40 * TAU; pe(H.x + Math.cos(a), 0.6, H.z + Math.sin(a), Math.cos(a) * 12, 2, Math.sin(a) * 12, 0.6, 0.7, 1, 0.35, 0.3, 0, 1.2, 0.5); }
  UI.banner('LAST STAND', 'b-warn'); A.sfx('laststand'); slow(0.5, 0.3); stop(0.08); addShake(0.7); kick(7); vib([60, 40, 120]);
  UI.hint('Last Stand: ' + c.kills + ' kills in ' + c.dur + ' seconds heals you. Fight!', 3200);
  ivLog('laststand', 'start');
}
const dramaLogOk = () => { if (!retOn('drama')) return false; const m = Math.floor(R_.t / 60); if (m !== DR.min) { DR.min = m; DR.logs = 0; } if (DR.logs >= RET.drama.logPerMin) return false; DR.logs++; return true; };
function reclaimLoan() {
  const id = RET.loaner.id, idx = wOwned.indexOf(id);
  RUN.loan = false;
  if (idx >= 0) { UI.reclaim(idx, WEAPONS[id]); wOwned.splice(idx, 1); }
  wLv[id] = 0; wEvo[id] = false; wDm[id] = 0;
  UI.slots(slotData());
  UI.banner('BLADE RECLAIMED', 'b-warn'); A.sfx('reclaim'); addShake(0.35); stop(0.07); kick(-3); vib([40, 30, 90]);
  if (!SIM) { save.ret.loanDone = 1; persist(); }
  ivLog('loan', 'reclaimed');
}
function retStep(dt) {
  if (phase !== 'run' && phase !== 'pre') return;
  DC.fireInv = Math.max(0, DC.fireInv - dt); DC.gnawSoft = Math.max(0, DC.gnawSoft - dt); DC.calm = Math.max(0, DC.calm - dt);
  // death clock, fire assist: a low fire burns down slower, within a per-run budget
  const fa = DC.on && R_.t < DC.T && DC.assist < RET.deathClock.fireBudget && F.hp / F.max < RET.deathClock.fireLow;
  if (fa) DC.assist += dt;
  if (fa !== DC.assistOn) { DC.assistOn = fa; if (fa) ivLog('fireAssist', Math.round(DC.assist) + 's used'); }
  // Last Stand
  if (LS.t > 0) {
    LS.t -= dt;
    if (R_.kills - LS.k0 >= RET.lastStand.kills) { LS.t = 0; LS.held = true; H.hp = Math.min(ST.maxHp, H.hp + ST.maxHp * RET.lastStand.heal); UI.banner('STAND HELD!', 'b-gold'); A.sfx('levelup'); burst(H.x, 1, H.z, 30, 7, 0.8, 0.5, 1, 0.8, 0.3, 3, 1.2); ivLog('laststand', 'held'); }
    else if (LS.t <= 0) { LS.t = 0; ivLog('laststand', 'ended'); }
  }
  if (!LS.hinted && runIdx === 0 && R_.t > 22 && !LS.used && !save.hints.ls) { LS.hinted = true; save.hints.ls = 1; UI.hint('Once per run, a killing blow starts your LAST STAND instead.', 4200); }
  // drama curve, crushed tail
  if (retOn('drama')) {
    const c = H.hp / ST.maxHp < RET.drama.crushHp || F.hp / F.max < RET.drama.crushFire;
    DR.crushT = c ? DR.crushT + dt : 0; DR.crushed = DR.crushT >= RET.drama.crushAfter;
  }
  // boss: death-clock nudge and the dominating tail
  if (BB.on && BB.i >= 0 && ealive[BB.i]) {
    const frac = ehp[BB.i] / emx[BB.i];
    if (DC.on && RET.deathClock.bossNudge && (DC.bAcc += dt) >= 1) {
      const dc = RET.deathClock, r = Math.max(0, DC.bLast - frac) / DC.bAcc; DC.bRate = DC.bRate ? DC.bRate * 0.6 + r * 0.4 : r; DC.bLast = frac; DC.bAcc = 0;
      if (R_.t < DC.T) {
        const proj = frac - DC.bRate * (DC.T - R_.t);
        const old = Math.round(DC.nudge * 10);
        if (frac <= dc.bossHi) DC.nudge = 0; // the last 15% is always the player's own damage
        else if (proj > dc.bossHi) DC.nudge = Math.min(dc.bossCap, DC.nudge + 0.05);
        else if (proj < dc.bossAim - 0.05) DC.nudge = Math.max(0, DC.nudge - 0.05);
        if (Math.round(DC.nudge * 10) > old) ivLog('nudge', '+' + Math.round(DC.nudge * 100) + '%');
        RUN.nudgeMax = Math.max(RUN.nudgeMax, DC.nudge);
      }
    }
    const d = RET.drama;
    if (retOn('drama') && !DR.enraged && BB.state !== 7 && BB.inv <= 0 && frac < d.domBoss && H.hp / ST.maxHp > d.domHp && F.hp / F.max > d.domFire) {
      DR.enraged = true; BB.enr = d.enrage; BB.inv = Math.max(BB.inv, 1.2);
      UI.banner(BB.kind === 'warden' ? 'THE WARDEN IS ENRAGED' : 'THE DRAKE IS ENRAGED', 'b-boss'); A.sfx('roar', 1.2); addShake(0.8); kick(6); vib(120); dark = 0.6;
      for (let k = 0; k < d.enrageAdds; k++) spawnEnemy(k % 3 === 0 ? 3 : 1, 14 + Math.random() * 4);
      burst(ex[BB.i], 3, ez[BB.i], 40, 12, 1, 0.6, 1, 0.3, 0.1, 3, 0.6);
      ivLog('enrage', Math.round(frac * 100) + '% boss');
    }
  }
  // loaner
  if (RUN.loan) {
    if (RUN.loanIntro > 0 && (RUN.loanIntro -= dt) <= 0) { UI.banner('BORROWED: DAWNBLADE', 'b-gold'); A.sfx('unlock'); UI.hint('The armory lends you its Dawnblade for this night.', 3600); }
    RUN.loanT -= dt;
    if (RUN.loanT <= RET.loaner.warn && RUN.loanT + dt > RET.loaner.warn) UI.hint('The armory will want its blade back soon.', 3000);
    if (RUN.loanT <= 0) reclaimLoan();
  }
}
// Telemetry fields added to each run record (local only).
function retTele() {
  if (!retOn('tele')) return {};
  return { n: save.runs, ri: runIdx, rq: null, iv: Object.assign({}, RUN.ivN), ls: !retOn('lastStand') ? -1 : LS.used ? (LS.held ? 2 : 1) : 0, jp: RUN.jackpot ? 1 : 0, ln: RUN.loanHad ? 1 : 0, T: DC.on ? Math.round(DC.T) : 0, nu: Math.round(RUN.nudgeMax * 100), bh: R_.bossSeen ? Math.round(GS.bossHp * 100) : null };
}
// retry/quit verdict for the previous run: 'r' = ONE MORE RUN from the results screen, 'h' = played again via the hub, 'q' = left (set on next load)
function markRetry(kind) { if (SIM) return; const t = save.tele, l = t && t[t.length - 1]; if (l && l.rq === null) { l.rq = kind; persist(); } }
export function _debugRet() { return { phase, t: R_.t, runIdx, DC, DR, LS, RUN, boss: BB.on ? GS.bossHp : null, enr: BB.enr }; }

/* ---------------- run lifecycle ---------------- */
export function init(canvas) {
  loadSave(); applySettings();
  G.initGfx(canvas);
  hero = HEROES[save.hero]; G.buildWorld(save.area); buildMeshes();
  prewarm();
  resetEnemies(); attractPose();
  phase = 'attract'; UI.setupAttract();
  lastT = performance.now(); requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden && (phase === 'run')) pause(true); });
}

export function startRun(perk) {
  A.init(); A.resume();
  if (perk === undefined && retOn('perk') && save.runs >= RET.perk.fromRun && !SIM) {
    const ids = Object.keys(PERKS), pick = [];
    while (pick.length < 3) { const id = ids.splice((Math.random() * ids.length) | 0, 1)[0]; pick.push(id); }
    UI.showPerks(pick.map((id) => Object.assign({ id }, PERKS[id])), (id) => startRun(id));
    return;
  }
  markRetry(phase === 'results' ? 'r' : 'h');
  applyPerk(perk || null);
  applyPact(); hero = HEROES[save.hero]; { const tc = PR.activeTrail(save, save.hero); trailC = tc ? tc.col : null; }
  if (!G.world || G.world.key !== save.area) G.buildWorld(save.area);
  rebuildHero();
  for (const k in PASSIVES) { pv[k] = 0; pl[k] = 0; }
  for (const k in WEAPONS) { wLv[k] = 0; wEvo[k] = false; wDm[k] = 0; wCd[k] = 0.3; }
  wOwned = [hero.weapon]; wLv[hero.weapon] = 1 + (RK && runPerk && PERKS[runPerk].wlv ? PERKS[runPerk].wlv : 0);
  resetEnemies(); balive.fill(0); salive.fill(0); galive.fill(0); gHi = 0; lnT.fill(0); G.fx.lnPos.fill(0); NV.on = false; BC.on = false; mna.fill(0); pla.fill(0); LP.charge = 0; LP.cd = 6; LP.t = 0; wispN = 0; orbN = 0; G.parts.clear();
  runIdx = save.runs; finale = runIdx >= 2 ? 1.6 : 1;
  seenEn.fill(0); eliteN = 0; wispN = 0;
  Object.assign(R_, { maxStreak: 0, evos: 0, chests: 0, bossHits: 0, t: 0, kills: 0, coins: 0, lvl: 1, xp: 0, need: xpNeed(1), pending: 0, chestPending: 0, streak: 0, streakT: 0, tier: 0, wave: 1, lastEmber: false, spawnAcc: 0, swarmN: 0, swarmT: 24, eliteT: 55, nearT: 0, pace: [], moths: 0, darkT: 0, wardenDim: 0, hazT: 6, shrineT: 55, shrinePending: 0, paceNext: 15, pressure: 1, pressT: 0, pressHi: 0, bossDone: false, bossSeen: false, gemChain: 0, gemChainT: 0, golds: 0, hitsTaken: 0, hpAtEnd: 1 });
  R_.dens = (save.dda || 1) * (runIdx === 0 ? 0.85 : 1);
  retStart(); champReset(); juiceReset();
  R_.swarmK = 0; if (retOn('earlySwarm') && runIdx < RET.earlySwarm.runs) R_.swarmT = RET.earlySwarm.firstT;
  PR.ensureQuests(save); qLive.clear(); qT = 0;
  ST.maxHp = 0; ST.fireMax = 0; recalc();
  H.x = 0; H.z = 3.4; H.px = H.x; H.pz = H.z; H.vx = H.vz = 0; H.hp = ST.maxHp; H.inv = 0; H.face = 0;
  F.hp = F.max; F.R = ST.fireRad; BB.on = false; BB.i = -1; I.boss.mesh.visible = false;
  dawn = 0; shake = 0; fovKick = 0; hurtFx = 0; endT = 0; timeScale = 1; slowT = 0; hitstop = 0; acc = 0; T = 0;
  cam.x = 0; cam.y = 14; cam.z = 12; cam.lx = 0; cam.lz = 0;
  for (let k = 0; k < 14; k++) spawnEnemy(randType(), 12 + Math.random() * 5);
  phase = 'run'; P.gameplayStart();
  UI.startHud(hero, save, runIdx);
  UI.slots(slotData());
  UI.banner('NIGHT FALLS', 'b-info');
  if (!save.hints.move) UI.hint(UI.isTouch() ? 'Drag to move. You attack automatically.' : 'WASD / arrows to move. You attack automatically.', 5200);
  if (runIdx === 1 && !save.hints.elite) { UI.hint('NEW: Elites drop Cinder Chests. Hunt the glint.', 6000); save.hints.elite = 1; }
  updateMood();
}

export function pause(on) {
  if (on && phase === 'run') { phase = 'paused'; A.suspend(); P.gameplayStop(); UI.showPause(true); }
  else if (!on && phase === 'paused') { phase = 'run'; A.resume(); P.gameplayStart(); UI.showPause(false); lastT = performance.now(); }
}
export const isPlaying = () => phase === 'run';

function endRun(win, why) {
  if (phase === 'results') return;
  phase = 'results'; P.gameplayStop();
  UI.endHud();
  const t = R_.t, kills = R_.kills;
  // transparent coin breakdown: every line is real run data
  const parts = [['Coins picked up', R_.coins], ['Enemies defeated (' + kills + ')', Math.floor(kills * 0.5)], ['Time survived', Math.floor(t * 0.8)]];
  if (win) parts.push(['Dawn bonus', 250]);
  let coins = 0; for (const p of parts) coins += p[1];
  const fort = Math.floor(coins * (ST.coin - 1)); if (fort > 0) { parts.push(['Fortune upgrade', fort]); coins += fort; }
  if (runIdx === 0 && coins < 130) { parts.push(['First-run bonus', 130 - coins]); coins = 130; }
  save.coins += coins; save.runs++; save.kills = (save.kills | 0) + kills; if (win) save.wins++;
  const prev = save.best;
  const better = !prev || (win && !prev.win) || (win === !!prev.win && (kills > prev.kills));
  if (better) save.best = { t: Math.round(t), kills, win, lvl: R_.lvl, pace: R_.pace.slice() };
  // dynamic difficulty: soften after quick deaths, add density if the player breezes through
  if (!win && t < 100) save.dda = Math.max(0.7, (save.dda || 1) - 0.15);
  else if (win && H.hp / ST.maxHp > 0.6) save.dda = Math.min(1.35, (save.dda || 1) + 0.1);
  // account level, hero mastery, unlocks, achievements, codex: one call writes the run into the save
  const seenW = wOwned.slice(); if (RUN.loanHad && !seenW.includes(RET.loaner.id)) seenW.push(RET.loaner.id); // the loaned blade was met this run
  const seenEvo = wOwned.filter((id) => wEvo[id]), seenE = []; for (let k = 0; k < seenEn.length; k++) if (seenEn[k]) seenE.push(k);
  const st0 = save.stats, prevBest = { time: st0.bestTime | 0, kills: st0.maxKills | 0, lvl: st0.maxLvl | 0, streak: st0.maxStreak | 0, runs: st0.runs | 0 };
  const pr = PR.awardRun(save, { time: t, kills, win, hero: save.hero, area: save.area, lvl: R_.lvl, evos: seenEvo.length, maxStreak: R_.maxStreak, golds: R_.golds, chests: R_.chests, bossHits: R_.bossHits, fireFrac: F.hp / F.max, seenW, seenEvo, seenE, boss: R_.bossSeen ? BB.kind : null });
  (save.tele = save.tele || []).push(Object.assign({ t: Math.round(t), l: R_.lvl, k: kills, w: win ? 1 : 0, c: why || null, a: save.area, h: save.hero, p: save.pact || null, pk: runPerk, ch: R_.champs | 0 }, retTele())); if (save.tele.length > 40) save.tele.shift();
  if (RUN.loanHad && !save.ret.loanDone) save.ret.loanDone = 1;
  const runQ = { kills, chests: R_.chests, bossSeen: R_.bossSeen, evos: wOwned.filter((id) => wEvo[id]).length, lvl: R_.lvl, time: t, maxStreak: R_.maxStreak };
  const questsDone = PR.applyQuests(save, runQ); let questCoins = 0; for (const q of questsDone) questCoins += q.coin;
  const nearest = win ? null : PR.nearestGoal(save, { bossSeen: R_.bossSeen, win, bossHp: R_.bossSeen ? GS.bossHp : null, bossName: BOSSES[BB.kind] ? BOSSES[BB.kind].name : 'The boss', xp: R_.xp, xpNeed: R_.need, lvl: R_.lvl });
  const afford = affordableCount();
  let teaser = null;
  if (!afford) { let best = null; for (const k in UPGRADES) { const l = upLvl(k); if (l >= UP_MAX) continue; const c = upCost(k, l) - save.coins; if (!best || c < best.d) best = { d: c, n: UPGRADES[k].name }; } if (best) teaser = best.d + ' more coins for your next upgrade (' + best.n + ')'; }
  persist();
  A.sfx(win ? 'victory' : 'defeat');
  const res = { win, why, name: getName(), time: t, kills, bossSeen: R_.bossSeen, coins, parts, bank: save.coins, afford, teaser, pr, goal: PR.nextGoal(save), newBest: better && !!prev, best: save.best, first: runIdx === 0, runs: save.runs, finale, hero: save.hero, damageTaken: R_.hitsTaken, lvl: R_.lvl, offer: RUN.loanHad && !save.unlocked.dawn ? { id: 'dawn', price: DAWN_PRICE } : null,
    prevBest, maxStreak: R_.maxStreak, peakT: R_.peakT || 0, quests: save.quests.list.map((q) => Object.assign({}, q)), questsDone, questCoins, nearest, xp: R_.xp, need: R_.need };
  const show = () => UI.showResults(res);
  if (!save.namePrompted && runIdx === 0) { save.namePrompted = true; persist(); UI.showName((n) => { if (n) { setName(n); res.name = n; } show(); }); } else show();
}
export function afterResultsReady() { return { canBuy: canAffordAny() }; }

/* ---------------- spawning ---------------- */
export const DBG = { noNew: false, off: null }; // dev-only switches for A/B balance runs
const NEWT = [[T_SPIT, 38], [T_BOMB, 55], [T_BULW, 70], [T_MOTH, 90]]; // new enemy types and the second they start appearing
function randType() {
  const t = R_.t, r = Math.random();
  if (!DBG.noNew && t > 38 && Math.random() < Math.min(0.15, (t - 38) / 420)) { let n = 0; for (let k = 0; k < NEWT.length; k++) if (t >= NEWT[k][1]) n++; if (n) { const ty = NEWT[(Math.random() * n) | 0][0]; if (!DBG.off || !DBG.off[ty]) return ty; } }
  if (t > 85 && r < 0.12) return 3;
  if (t > 55 && r < 0.2) return 2;
  if (t > 22 && r < 0.4) return 1;
  return 0;
}
function allocEnemy(type, x, z) {
  if (nfree === 0) return -1;
  const i = efree[--nfree], d = ET[type];
  seenEn[type] = 1; if (type === T_MOTH && !save.hints.moth) { save.hints.moth = 1; UI.hint('Gloom Moths eat your light. Pop them fast!', 4200); }
  ealive[i] = 1; etype[i] = type; ex[i] = epx[i] = x; ez[i] = epz[i] = z; evx[i] = evz[i] = 0; eflash[i] = 0; eatk[i] = 0.4; estun[i] = 0; eorb[i] = 0; egold[i] = 0; eage[i] = 0; echamp[i] = 0; escl[i] = 1;
  const hs = 1 + R_.t * 0.011 + (R_.t > 120 ? 0.2 : 0);
  ehp[i] = emx[i] = d.hp * (d.boss ? 1 : hs * (1 + PM.ehp)); eph[i] = Math.random() * 6; enova[i] = 0; echain[i] = 0; efc[i] = 0; espd[i] = d.sp * (0.92 + Math.random() * 0.16) * (1 + PM.espd); ecd[i] = d.cd ? d.cd * (0.4 + Math.random() * 0.8) : d.ai === 'summon' ? 4 : 0;
  if (i >= eHi) eHi = i + 1; nAlive++;
  return i;
}
function spawnEnemy(type, dist) {
  for (let k = 0; k < 4; k++) {
    const a = Math.random() * TAU; let x = H.x + Math.cos(a) * dist, z = H.z + Math.sin(a) * dist;
    const r = Math.hypot(x, z); if (r > 32) { x *= 32 / r; z *= 32 / r; }
    if (Math.hypot(x - H.x, z - H.z) < dist * 0.6) continue;
    const i = allocEnemy(type, x, z);
    if (i >= 0 && type === 0 && Math.random() < 0.025 && R_.t > 20) { egold[i] = 1; ehp[i] = emx[i] = 40; espd[i] = 5.2; }
    return i;
  }
  return -1;
}
const maxEn = () => [260, 210, 160, 120][Q.level];
function spawnShrine() {
  const a = Math.random() * TAU, r = 7 + Math.random() * 6;
  dropGem(Math.cos(a) * r, Math.sin(a) * r, 6, 0); UI.banner('A SHRINE APPEARS', 'b-info'); A.sfx('chest');
}
function director(dt) {
  const t = R_.t;
  const w = Math.min(5, 1 + Math.floor(t / 34));
  if (w !== R_.wave) { R_.wave = w; UI.banner('WAVE ' + w, 'b-wave'); A.sfx('streak'); }
  // flow: adapt pressure to how comfortable the player is
  R_.pressT += dt;
  if (R_.pressT > 8) {
    R_.pressT = 0; const comfort = (H.hp / ST.maxHp) * 0.5 + (F.hp / F.max) * 0.5;
    if (comfort > 0.85) R_.pressure = Math.min(1.5, R_.pressure + 0.07); else if (comfort < 0.45) R_.pressure = Math.max(0.65, R_.pressure - 0.1);
  }
  const dens = R_.dens * R_.pressure * (R_.bossSeen ? 0.4 : 1) * (DC.calm > 0 ? RET.deathClock.breatherMul : 1);
  const desired = Math.min(maxEn(), (16 + t * 1.05) * dens);
  const rate = (3.2 + t * 0.03) * dens * (t < 12 ? 1.5 : 1);
  R_.spawnAcc += dt * rate;
  while (R_.spawnAcc >= 1) {
    R_.spawnAcc -= 1;
    if (nAlive < desired) spawnEnemy(randType(), 15 + Math.random() * 4);
  }
  // swarm tide: telegraphed ring of skitters
  if (!R_.bossSeen && t > R_.swarmT) {
    R_.swarmT += 28; R_.swarmN = 1.2; R_.swarmK = (R_.swarmK | 0) + 1; UI.banner('THE DARK CLOSES IN', 'b-warn'); A.sfx('tele'); vib(30);
  }
  if (R_.swarmN > 0) {
    R_.swarmN -= dt;
    if (R_.swarmN <= 0) {
      // early runs (retention.js earlySwarm): smaller, wider and not sped up, so the first swarm teaches instead of ending the run
      const es = retOn('earlySwarm') && runIdx < RET.earlySwarm.runs, mul = es ? (R_.swarmK === 1 ? RET.earlySwarm.firstMul : RET.earlySwarm.laterMul) : 1, rr = es ? RET.earlySwarm.ring : 14;
      const n = Math.min(Math.round(26 * R_.dens * mul), maxEn() - nAlive);
      for (let k = 0; k < n; k++) { const a = k / n * TAU; const i = allocEnemy(1, Math.max(-31, Math.min(31, H.x + Math.cos(a) * rr)), Math.max(-31, Math.min(31, H.z + Math.sin(a) * rr))); if (i >= 0 && !es) espd[i] *= 1.1; }
    }
  }
  // elites (from the second run on)
  champDirector(t);
  if (runIdx >= 1 && !R_.bossSeen && t > R_.eliteT && CH.i < 0 && Math.abs(t - CH.next) > 12) { R_.eliteT += 42; const mat = eliteN++ % 3 === 2, i = spawnEnemy(mat ? T_MATRON : 4, 17); if (i >= 0) { UI.banner(mat ? 'A HOLLOW MATRON CALLS' : 'AN EMBER EATER STIRS', 'b-warn'); A.sfx('roar'); } }
  if (!R_.bossSeen && t > R_.shrineT && t < BOSS_T - 20) { R_.shrineT += 70; spawnShrine(); }
  if (!R_.bossSeen && t > BOSS_T) startBoss();
}

/* ---------------- champions: a mini-boss every 90 s (switch and timing in retention.js `champion`) ---------------- */
const CH = { i: -1, next: 90, warned: false, n: 0, slamT: 0, def: null };
function champReset() { R_.champs = 0; CH.i = -1; CH.next = RET.champion.first; CH.warned = false; CH.n = 0; CH.slamT = 0; CH.def = null; UI.champBar(false); }
function champDirector(t) {
  if (!retOn('champion') || R_.bossSeen) return;
  if (CH.i < 0 && !CH.warned && t > CH.next - RET.champion.warn) { CH.warned = true; UI.banner('A CHAMPION APPROACHES', 'b-warn'); A.sfx('roar', 0.55); vib(40); }
  if (t > CH.next) { CH.next += RET.champion.every; CH.warned = false; if (CH.i < 0) spawnChampion(t); }
}
function spawnChampion(t) {
  const def = CHAMPIONS[(runIdx + CH.n++) % CHAMPIONS.length], i = spawnEnemy(def.et, 16);
  if (i < 0) return;
  echamp[i] = 1; escl[i] = def.scale; egold[i] = 0; CH.i = i; CH.def = def; CH.slamT = 4.5;
  ehp[i] = emx[i] = def.hp * (1 + t / 240) * (runIdx === 0 ? 0.75 : 1) * (1 + PM.ehp); espd[i] *= 1.15;
  UI.champBar(true, def.name.toUpperCase(), def.sub.toUpperCase()); UI.banner(def.name.toUpperCase(), 'b-boss'); A.sfx('roar'); addShake(0.6); kick(5); stop(0.06); vib(90);
  burst(ex[i], 1.2, ez[i], 40, 10, 0.9, 0.6, 1, 0.4, 0.15, 3, 1);
}
function champStep(dt) {
  const i = CH.i; if (i < 0) return;
  if (!ealive[i] || !echamp[i]) { CH.i = -1; UI.champBar(false); return; }
  if (BB.on) return;
  if ((CH.slamT -= dt) <= 0) { // ground slam: telegraphed circles under it and toward the hero
    CH.slamT = 5.5; const dx = H.x - ex[i], dz = H.z - ez[i], d = Math.hypot(dx, dz) || 1;
    addPool(ex[i], ez[i], 1.1, 2.8, 20);
    for (let k = 1; k <= 2; k++) addPool(ex[i] + dx / d * 2.6 * k, ez[i] + dz / d * 2.6 * k, 1.1 + k * 0.25, 1.9, 16);
    A.sfx('tele');
  }
}
function champKilled(i, x, z) {
  echamp[i] = 0; escl[i] = 1; CH.i = -1; UI.champBar(false); R_.champs = (R_.champs | 0) + 1;
  dropGem(x, z, 5, 0); for (let k = 0; k < 3; k++) dropGem(x, z, 2, 25); for (let k = 0; k < 6; k++) dropGem(x, z, 3, 4);
  if (Math.random() < 0.5) dropGem(x, z, 4, 0);
  UI.banner('CHAMPION SLAIN', 'b-gold'); A.sfx('victory'); slow(0.45, 0.3); stop(0.09); addShake(0.8); kick(8); vib([60, 30, 120]); UI.confetti(20);
  burst(x, 1.2, z, 70, 13, 1.1, 0.7, 1, 0.75, 0.25, 3, 1.1);
}

/* ---------------- damage ---------------- */
function critRoll(extra) { return Math.random() < ST.crit + (extra || 0); }
// 'Big hits' damage numbers: crits, at most one every 80 ms, so evolved builds don't bury the screen in numbers.
let dnLast = 0; const dnGate = () => { const n = performance.now(); if (n - dnLast < 80) return false; dnLast = n; return true; };
function hurtE(i, dmg, crit, kx, kz, kb) {
  if (!ealive[i]) return;
  const t = etype[i];
  if (ET[t].boss && BB.inv > 0) { A.sfx('hit', 0.6); return; }
  const dx = ex[i], dz = ez[i], lit = isLit(dx, dz);
  if (lit) dmg *= 1 + ST.lightBonus;
  if (crit) dmg *= 1.9;
  if (t === 5 && BB.state === 5) dmg *= 1.4;
  if (t === T_WARDEN && R_.wardenDim > 0) dmg *= 1.3;
  if (DC.nudge > 0 && ET[t].boss) dmg *= 1 + DC.nudge; // hidden, capped (retention.js deathClock.bossCap)
  if (t === T_BULW && kb > 0 && kx * Math.sin(efc[i]) + kz * Math.cos(efc[i]) < -0.35) { dmg *= 0.2; burst(dx - kx * 0.9, 1, dz - kz * 0.9, 3, 3, 0.2, 0.25, 1, 0.9, 0.6, 0, 0.5); }
  ehp[i] -= dmg; eflash[i] = 0.1;
  const m = ET[t].boss ? 0.05 : echamp[i] ? 0.08 : ET[t].elite ? 0.25 : t === 2 || t === T_BULW ? 0.45 : 1;
  evx[i] += kx * kb * m; evz[i] += kz * kb * m;
  const dnm = save.set.dn | 0; if (dnm === 0 || (dnm === 1 && (ET[t].boss || (crit && dnGate())))) UI.dmgNum(dx, 1.3 + (ET[t].boss ? 3 : 0), dz, dmg, crit);
  A.sfx(crit ? 'crit' : 'hit', 0.9 + Math.random() * 0.3);
  if (ET[t].boss) { burst(dx, 3, dz, 2, 5, 0.4, 0.4, 1, 0.5, 0.15, 6, 0.8); }
  if (ehp[i] <= 0) killE(i, crit);
}
function dropGem(x, z, kind, val) {
  let s = -1;
  for (let k = 0; k < MAXG; k++) if (!galive[k]) { s = k; break; }
  if (s < 0) { if (kind <= 2) addXp(val); return; }
  galive[s] = 1; gx[s] = x + (Math.random() - 0.5) * 0.8; gz[s] = z + (Math.random() - 0.5) * 0.8; gkind[s] = kind; gval[s] = val; gmag[s] = 0; gv[s] = 0; gt[s] = Math.random() * 6;
  if (s >= gHi) gHi = s + 1;
}
const KILL_FX = 14; let killFx = 0;
function killE(i, crit) {
  const t = etype[i], x = ex[i], z = ez[i], d = ET[t], lit = isLit(x, z);
  ealive[i] = 0; efree[nfree++] = i; nAlive--;
  if (d.boss) { bossDie(); return; }
  const champ = echamp[i] === 1;
  R_.kills++;
  // streak
  R_.streak++; R_.streakT = 2.4; if (R_.streak > R_.maxStreak) { R_.maxStreak = R_.streak; R_.peakT = R_.t; }
  const tiers = [10, 25, 50, 100, 200, 400];
  if (R_.tier < tiers.length && R_.streak >= tiers[R_.tier]) {
    R_.tier++; const nm = ['KINDLING', 'BLAZING', 'INFERNO', 'SUPERNOVA', 'CONFLAGRATION', 'DAWNFIRE'][R_.tier - 1];
    UI.streakTier(nm, R_.streak); A.sfx('streak'); stop(0.04); addShake(0.35); kick(4); vib(40);
    F.hp = Math.min(F.max, F.hp + 6); UI.hint('The fire roars!', 1400);
    burst(0, 1.5, 0, 22, 8, 0.9, 0.5, 1, 0.65, 0.2, 2, 1.4);
  }
  UI.streak(R_.streak);
  if (R_.streak % 10 === 0) A.sfx('combo', R_.streak / 10); // a rising note every 10 kills
  if (killFx < 3 && R_.tier > 0) addShake(0.012 * R_.tier);
  // fire feeds on kills, more so in the dark
  F.hp = Math.min(F.max, F.hp + (lit ? 0.12 : 0.28 * (hero.darkFeed || 1)) * (1 + pv.kindle));
  // drops
  if (egold[i] && !champ) { R_.golds++; for (let k = 0; k < 7; k++) dropGem(x, z, 3, 3); dropGem(x, z, 2, 25); A.sfx('chest'); UI.banner('GOLDEN WISP CAUGHT', 'b-gold'); burst(x, 1, z, 26, 7, 0.9, 0.5, 1, 0.85, 0.3, 6, 1); }
  else if (champ) champKilled(i, x, z);
  else if (d.elite) { dropGem(x, z, 2, 25); dropGem(x, z, 5, 0); A.sfx('chest'); burst(x, 1, z, 24, 8, 0.8, 0.5, 1, 0.5, 0.15, 5, 1); stop(0.05); addShake(0.3); }
  else {
    const xp = t < 4 ? (t === 2 ? 5 : t === 3 ? 2 : 1) : d.xp;
    dropGem(x, z, xp >= 5 ? 1 : 0, xp);
    if (Math.random() < 0.05 + 0.02 * (save.up.fort | 0)) dropGem(x, z, 3, 2);
    const lr = Math.random();
    if (lr < 0.012) dropGem(x, z, 4, 0);
    else if (DR.crushed && lr < 0.012 * RET.drama.logMul && dramaLogOk()) { dropGem(x, z, 4, 0); ivLog('log', 'crushed'); }
  }
  const big = d.r >= 0.85; // heavy foes only (Brute, Bulwark); Spitter, Blast Bug and Moth were wrongly counted as big
  // Death FX budget: a nova or beacon ring can kill 50+ foes in one step. The first KILL_FX get full bursts; the rest a small
  // puff, which keeps the particle pool (1600) and additive overdraw in check on weak GPUs. Big foes always get the full burst.
  if (big || killFx++ < KILL_FX) {
    burst(x, 0.6, z, big ? 16 : 7, big ? 7 : 5, 0.5, big ? 0.55 : 0.4, 0.25, 0.2, 0.5, 8, 0.7);
    burst(x, 0.7, z, big ? 8 : 3, 6, 0.45, 0.3, 1, 0.55, 0.2, 5, 0.9);
  } else burst(x, 0.7, z, 2, 5, 0.4, 0.35, 1, 0.55, 0.2, 5, 0.9);
  A.sfx('kill', 0.9 + Math.min(0.9, R_.streak * 0.012));
  if (big) { stop(0.025); addShake(0.12); }
}
function hurtHero(dmg, kx, kz, srcX, srcZ) {
  if (H.inv > 0 || phase === 'lose' || phase === 'win') return;
  H.hp -= dmg; H.inv = 0.5; H.hurtT = 0.25; R_.hitsTaken++; if (BB.on) R_.bossHits++;
  hurtFx = Math.min(1, 0.5 + dmg / 40); addShake(0.4); kick(2); A.sfx('hurt'); vib(60); stop(0.04);
  H.vx += (kx || 0) * 6; H.vz += (kz || 0) * 6;
  burst(H.x, 1, H.z, 8, 5, 0.4, 0.4, 1, 0.3, 0.2, 6, 1);
  if (srcX !== undefined) { const dx = srcX - H.x, dz = srcZ - H.z, dl = Math.hypot(dx, dz) || 1; UI.hurtDir(dx / dl, dz / dl); }
  if (H.hp <= 0) { H.hp = 0; if (!retSaveHero()) die('hero'); }
}
function damageFire(amount) {
  if (DC.fireInv > 0) return;
  F.hp -= amount * ST.fireRes * (DC.gnawSoft > 0 ? 0.5 : 1) * (DC.assistOn ? RET.deathClock.fireMul : 1);
  if (F.hp <= 0) {
    if (dcSave('fire')) { F.hp = F.max * RET.deathClock.fireFloor; DC.fireInv = RET.deathClock.fireInv; DC.gnawSoft = RET.deathClock.fireInv + RET.deathClock.gnawSoft; }
    else { F.hp = 0; die('fire'); }
  }
}
function die(why) {
  if (phase === 'lose' || phase === 'win') return;
  phase = 'lose'; endT = 1.9; timeScale = 0.5; UI.banner(why === 'fire' ? 'THE FIRE HAS GONE OUT' : 'YOU HAVE FALLEN', 'b-warn');
  A.sfx('defeat'); addShake(0.7); kick(-3); R_.why = why; stop(0.08); vib(200);
}
function nearMiss() {
  if (R_.nearT > 0) return; R_.nearT = 2.5;
  UI.banner('NEAR MISS!', 'b-gold'); A.sfx('near'); slow(0.35, 0.3); kick(3); vib(20);
  dropGem(H.x + 0.8, H.z, 1, 5);
}

/* ---------------- xp / level-up ---------------- */
function addXp(v) {
  R_.xp += v * ST.xp * (R_.darkT > 0 ? 2 : 1);
  while (R_.xp >= R_.need) { R_.xp -= R_.need; R_.lvl++; R_.need = xpNeed(R_.lvl); R_.pending++; }
}
function checkLevel() {
  if ((R_.pending > 0 || R_.chestPending > 0 || R_.shrinePending > 0) && phase === 'run') {
    const shrine = R_.pending === 0 && R_.chestPending === 0, chest = R_.pending === 0;
    if (shrine) R_.shrinePending--; else if (chest) R_.chestPending--; else R_.pending--;
    phase = 'pre'; preT = 0.2; slowTo = 0.15; timeScale = 0.15; R_.chestMode = chest; R_.shrineMode = shrine;
    A.sfx(chest ? 'chest' : 'levelup'); kick(5); vib(30);
    burst(H.x, 1.2, H.z, 40, 9, 1.0, 0.5, 1, 0.8, 0.3, 2, 1.2); UI.flash('level');
  }
}
function openCards() {
  const chest = R_.chestMode;
  phase = 'levelup'; timeScale = 1;
  if (R_.shrineMode) { UI.showLevelUp(genShrineCards(), null, 'WAYSIDE SHRINE', pickCard); return; }
  const cards = genCards(chest);
  UI.showLevelUp(cards, oddsOf(chest), chest ? 'CINDER CACHE!' : 'LEVEL UP!', pickCard);
}
function oddsOf(chest) {
  if (RUN.jackpot) return { c: 0, r: 0, l: 100, rare: 0, leg: 1 }; // jackpot run: the odds line shows the real 100%
  const lk = (save.up.fort | 0) * 0.02 + pv.clover * 0.03;
  let rare = (chest ? 0.5 : 0.24) + lk, leg = (chest ? 0.2 : 0.05) + lk * 0.4;
  return { c: Math.round((1 - rare - leg) * 100), r: Math.round(rare * 100), l: Math.round(leg * 100), rare, leg };
}
function rollRar(o) { const r = Math.random(); return r < o.leg ? 2 : r < o.leg + o.rare ? 1 : 0; }
function genShrineCards() {
  return [
    { kind: 'dark', rar: 1, rcls: 'r1', rname: 'RISK', title: 'Dark Bargain', icon: 'skull', col: '#b48cff', tag: 'SHRINE', sub: 'Your fire shrinks by 25% for 45 seconds. Every XP gem is worth double.', stat: 'Risk and reward' },
    { kind: 'bless', rar: 0, rcls: 'r0', rname: 'SAFE', title: 'Warm Blessing', icon: 'heart', col: '#ff9d3b', tag: 'SHRINE', sub: 'Heal 50% of your health and rekindle 30% of your fire.', stat: 'No catch' },
  ];
}
function genCards(chest) {
  const pool = [], o = oddsOf(chest);
  // evolutions first: guaranteed to be offered when ready
  for (const id of wOwned) if (!isLoan(id) && wLv[id] >= 5 && !wEvo[id] && pl[WEAPONS[id].evoWith] > 0) pool.push({ kind: 'evo', id, w: 100 });
  for (const id of wOwned) if (!isLoan(id) && wLv[id] < 5) pool.push({ kind: 'wup', id, w: 10 });
  if (wOwned.length < 4) for (const id in WEAPONS) if (!wOwned.includes(id) && weaponUnlocked(id)) pool.push({ kind: 'wnew', id, w: 8 });
  for (const id in PASSIVES) if (pl[id] < 3) pool.push({ kind: 'pass', id, w: pl[id] > 0 ? 7 : 6 + (wOwned.some((w) => WEAPONS[w].evoWith === id && wLv[w] >= 3) ? 8 : 0) });
  if (F.hp / F.max < 0.6) pool.push({ kind: 'rekindle', w: 14 });
  if (H.hp / ST.maxHp < 0.55) pool.push({ kind: 'heal', w: 12 });
  const out = [];
  for (let n = 0; n < 3 && pool.length; n++) {
    let tot = 0; for (const c of pool) tot += c.w;
    let r = Math.random() * tot, k = 0;
    for (; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) break; }
    const c = pool.splice(Math.min(k, pool.length - 1), 1)[0];
    out.push(describe(c, c.kind === 'evo' ? 2 : c.kind === 'rekindle' ? 1 : rollRar(o)));
  }
  while (out.length < 3) out.push(describe({ kind: 'coins' }, 0));
  return out;
}
function describe(c, rar) {
  const ry = RARITY[rar], card = { kind: c.kind, id: c.id, rar, rcls: ry.cls, rname: ry.name };
  if (c.kind === 'wnew' || c.kind === 'wup') {
    const W = WEAPONS[c.id], lv = c.kind === 'wnew' ? 1 : wLv[c.id] + 1, inf = wInfo(c.id, lv, false);
    card.title = c.kind === 'wnew' ? W.name : W.name + ' Lv ' + lv; card.icon = W.icon; card.col = W.col; card.tag = c.kind === 'wnew' ? 'NEW WEAPON' : '';
    card.sub = c.kind === 'wnew' ? W.desc : 'More power for your ' + W.name + '.';
    card.stat = Math.round(inf.dmg * (1 + wDm[c.id] + ry.dmg) * 10) / 10 + ' dmg · ' + inf.n + ' ' + inf.unit + (ry.dmg ? ' · +' + Math.round(ry.dmg * 100) + '% dmg' : '');
    const P2 = PASSIVES[W.evoWith]; if (lv === 5 || c.kind === 'wnew') card.evoHint = 'Evolves with ' + P2.name;
  } else if (c.kind === 'evo') {
    const W = WEAPONS[c.id]; card.title = W.evo; card.icon = W.icon; card.col = '#ffd24a'; card.tag = 'EVOLUTION'; card.sub = W.name + ' transforms. A real power spike.'; card.stat = 'x1.3+ damage · extra effect';
  } else if (c.kind === 'pass') {
    const p = PASSIVES[c.id], v = p.per * ry.mul; card.title = p.name + (pl[c.id] > 0 ? ' Lv ' + (pl[c.id] + 1) : ''); card.icon = p.icon; card.col = p.col; card.tag = pl[c.id] > 0 ? '' : 'PASSIVE';
    card.sub = p.fmt.replace('{}', Math.round(v * p.mul * 10) / 10); card.stat = ''; card.mul = ry.mul;
    const ew = Object.keys(WEAPONS).find((w) => WEAPONS[w].evoWith === c.id); if (ew && wOwned.includes(ew)) card.evoHint = 'Evolves ' + WEAPONS[ew].name;
  } else if (c.kind === 'rekindle') { card.title = 'Rekindle'; card.icon = 'flame'; card.col = '#ff7a2a'; card.sub = 'Restore 35% of your fire.'; card.stat = ''; card.tag = 'FIRE LOW'; }
  else if (c.kind === 'heal') { card.title = 'Warm Meal'; card.icon = 'heart'; card.col = '#ff5d7a'; card.sub = 'Heal 40% of your health.'; card.stat = ''; card.tag = 'HEALTH LOW'; }
  else { card.title = 'Cinder Purse'; card.icon = 'coin'; card.col = '#ffd24a'; card.sub = 'Bank 60 coins for the shop.'; card.stat = ''; }
  return card;
}
function addWeapon(id) { wOwned.push(id); wLv[id] = 1; wCd[id] = 0.2; if (id === 'orbit') orbN = 0; }
function pickCard(idx, cards) {
  const c = cards[idx]; if (!c) return;
  A.sfx('pick');
  switch (c.kind) {
    case 'wnew': addWeapon(c.id); wDm[c.id] += RARITY[c.rar].dmg; break;
    case 'wup': wLv[c.id]++; wDm[c.id] += RARITY[c.rar].dmg; break;
    case 'evo': wEvo[c.id] = true; R_.evos++; UI.banner(WEAPONS[c.id].evo.toUpperCase() + '!', 'b-gold'); stop(0.06); addShake(0.4); break;
    case 'pass': pl[c.id]++; pv[c.id] += c.mul; if (c.id === 'cloak') H.hp = Math.min(ST.maxHp + 20 * c.mul, H.hp + 20 * c.mul); break;
    case 'rekindle': F.hp = Math.min(F.max, F.hp + F.max * 0.35); burst(0, 1, 0, 30, 6, 1, 0.5, 1, 0.6, 0.2, 2, 1.5); break;
    case 'heal': H.hp = Math.min(ST.maxHp, H.hp + ST.maxHp * 0.4); break;
    case 'dark': R_.darkT = 45; UI.banner('DARK BARGAIN', 'b-warn'); break;
    case 'bless': H.hp = Math.min(ST.maxHp, H.hp + ST.maxHp * 0.5); F.hp = Math.min(F.max, F.hp + F.max * 0.3); burst(0, 1, 0, 30, 6, 1, 0.5, 1, 0.6, 0.2, 2, 1.5); break;
    default: R_.coins += 60; break;
  }
  recalc(); UI.slots(slotData()); save.hints.pick = 1;
  phase = 'run'; lastT = performance.now();
  burst(H.x, 1.2, H.z, 24, 7, 0.8, 0.4, 1, 0.8, 0.3, 3, 1);
  if (R_.pending > 0 || R_.chestPending > 0) checkLevel();
}
function slotData() {
  const w = wOwned.map((id) => {
    const W = WEAPONS[id], ready = wLv[id] >= 5 && !wEvo[id] && pl[W.evoWith] > 0;
    return { id, lv: wLv[id], evo: wEvo[id], ready, name: W.name, icon: W.icon, col: wEvo[id] ? '#ffd24a' : W.col, loan: isLoan(id) };
  });
  const p = []; for (const id in PASSIVES) if (pl[id] > 0) p.push({ id, lv: pl[id], name: PASSIVES[id].name, icon: PASSIVES[id].icon, col: PASSIVES[id].col });
  // one evolution hint: the owned, unevolved weapon that is furthest along
  let hint = null, bestLv = -1;
  for (const id of wOwned) {
    if (wEvo[id] || wLv[id] <= bestLv || isLoan(id)) continue;
    const W = WEAPONS[id], P2 = PASSIVES[W.evoWith], lv = wLv[id], has = pl[W.evoWith] > 0; bestLv = lv;
    const text = lv >= 5 ? (has ? W.name + ': evolution is ready. It appears on your next level-up.' : W.name + ' is maxed: find ' + P2.name + ' to evolve it.')
      : W.name + ' Lv ' + lv + ': ' + (5 - lv) + ' more level' + (5 - lv > 1 ? 's' : '') + (has ? '' : ', needs ' + P2.name) + ' to evolve.';
    hint = { text, icon: P2.icon, col: P2.col };
  }
  return { w, p, hint };
}

/* ---------------- gems ---------------- */
function updateGems(dt) {
  R_.gemChainT -= dt; if (R_.gemChainT <= 0) R_.gemChain = 0;
  const mr = ST.mag, mr2 = mr * mr;
  for (let k = 0; k < gHi; k++) {
    if (!galive[k]) continue;
    gt[k] += dt;
    const dx = H.x - gx[k], dz = H.z - gz[k], d2 = dx * dx + dz * dz;
    const kind = gkind[k];
    if (kind === 6) { // shrine: walk onto it to choose between a risk and a reward
      if (Math.random() < dt * 6) pe(gx[k] + (Math.random() - 0.5) * 0.4, 0.8, gz[k] + (Math.random() - 0.5) * 0.4, 0, 3.5, 0, 1.2, 0.35, 0.4, 0.9, 1, 0, 0, 0);
      if (d2 < 1.5 * 1.5) { galive[k] = 0; R_.shrinePending++; checkLevel(); }
      continue;
    }
    if (kind === 5) { // chest: needs walking onto, glints to attract attention
      if (Math.random() < dt * 5) pe(gx[k] + (Math.random() - 0.5) * 0.3, 0.8, gz[k] + (Math.random() - 0.5) * 0.3, 0, 3.2, 0, 1.1, 0.35, 1, 0.85, 0.35, 0, 0, 0);
      if (d2 < 1.2 * 1.2) { galive[k] = 0; R_.chests++; chestCharge(gx[k], gz[k]); }
      continue;
    }
    if (!gmag[k] && d2 < mr2) gmag[k] = 1;
    if (gmag[k]) {
      gv[k] = Math.min(22, gv[k] + 46 * dt); const d = Math.sqrt(d2) || 1;
      gx[k] += dx / d * gv[k] * dt; gz[k] += dz / d * gv[k] * dt;
      if (d < 0.65) {
        galive[k] = 0;
        R_.gemChain++; R_.gemChainT = 0.55;
        if (kind <= 2) { addXp(gval[k]); A.sfx('gem', 1 + Math.min(R_.gemChain, 24) * 0.045); }
        else if (kind === 3) { R_.coins += gval[k]; A.sfx('coin'); UI.coinPop(); }
        else if (kind === 4) { F.hp = Math.min(F.max, F.hp + F.max * 0.22); H.hp = Math.min(ST.maxHp, H.hp + ST.maxHp * 0.15); A.sfx('chest'); burst(H.x, 1, H.z, 14, 5, 0.7, 0.4, 1, 0.55, 0.2, 2, 1.2); UI.hint('Ember Log: fire and health restored', 1800); }
        if (!save.hints.gem) { save.hints.gem = 1; UI.hint('Gems fill your level bar', 2400); }
        pe(H.x, 1.2, H.z, 0, 2, 0, 0.3, 0.5, 0.5, 1, 0.6, 0, 0, 2);
      }
    }
  }
  while (gHi > 0 && !galive[gHi - 1]) gHi--;
}

/* ---------------- boss ---------------- */
function startBoss() {
  R_.bossSeen = true; BB.on = true;
  const a = Math.atan2(H.z, H.x) + (Math.random() - 0.5);
  const kind = G.world.a.boss || 'drake', bn = BOSSES[kind].name.toUpperCase();
  BB.kind = kind;
  if (I.bossKind !== kind) { G.scene.remove(I.boss.mesh); I.boss.mesh.geometry.dispose(); I.boss = makeInst(G.bossGeo(kind), makeLit(true, false), 1, true, true); G.scene.add(I.boss.mesh); I.bossKind = kind; }
  BB.i = allocEnemy(kind === 'warden' ? T_WARDEN : 5, Math.cos(a) * 31, Math.sin(a) * 31); if (BB.i < 0) { BB.on = false; return; }
  ehp[BB.i] = emx[BB.i] = ET[kind === 'warden' ? T_WARDEN : 5].hp * (1 + (runIdx > 2 ? 0.1 : 0)) * (1 + PM.ehp * 0.5);
  Object.assign(BB, { state: 1, t: 0, phase: 1, inv: 2.2, walkT: 3.0, hit: false, volleys: 0, roarDone: 0, hurtCd: 0, choice: 0, enr: 1 });
  I.boss.mesh.visible = true;
  UI.bossBar(true, bn); UI.banner(bn, 'b-boss'); A.sfx('roar'); stop(0.06); addShake(0.8); kick(6); vib(120);
  R_.dens *= 1; dark = 0.4; UI.hint(kind === 'warden' ? 'Red circles are about to erupt. Keep moving, keep the fire alive.' : 'Dodge the red warnings. Stay in the light.', 3800);
  for (let k = 0; k < 18; k++) spawnEnemy(1, 15 + Math.random() * 4);
}
function bossAim() { BB.dx = H.x - ex[BB.i]; BB.dz = H.z - ez[BB.i]; const d = Math.hypot(BB.dx, BB.dz) || 1; BB.dx /= d; BB.dz /= d; }
function bossRoar(ph) {
  BB.state = 7; BB.t = 1.5; BB.inv = 1.6; BB.phase = ph; A.sfx('roar'); stop(0.06); addShake(0.9); kick(8); vib(150);
  UI.banner(BB.kind === 'warden' ? (ph === 2 ? 'THE WARDEN BELLOWS' : 'THE EMBERS RISE') : ph === 2 ? 'THE DRAKE ROARS' : 'THE SKY BURNS', 'b-boss'); damageFire(F.max * 0.08); dark = 0.7;
  for (let k = 0; k < (ph === 2 ? 14 : 18); k++) spawnEnemy(k % 3 === 0 ? 3 : 1, 14 + Math.random() * 4);
  burst(ex[BB.i], 3, ez[BB.i], 40, 12, 1, 0.6, 1, 0.5, 0.15, 3, 0.6);
}
function wardenUpdate(dt) {
  const i = BB.i; if (!BB.on || i < 0 || !ealive[i]) return;
  epx[i] = ex[i]; epz[i] = ez[i];
  const frac = ehp[i] / emx[i];
  if (BB.phase === 1 && frac < 0.66) bossRoar(2); else if (BB.phase === 2 && frac < 0.33) bossRoar(3);
  BB.inv = Math.max(0, BB.inv - dt); BB.t -= dt * BB.enr; BB.hurtCd -= dt;
  const mult = [1, 1.2, 1.4][BB.phase - 1] * BB.enr, hx = H.x - ex[i], hz = H.z - ez[i], hd = Math.hypot(hx, hz), fd = fireDist(ex[i], ez[i]);
  switch (BB.state) {
    case 1: {
      const d = fd || 1; if (fd > 3.8) { ex[i] += -ex[i] / d * 1.9 * mult * dt; ez[i] += -ez[i] / d * 1.9 * mult * dt; } else damageFire(10 * dt * mult);
      BB.face = Math.atan2(-ex[i], -ez[i]); BB.walkT -= dt * BB.enr;
      if (BB.walkT <= 0) {
        BB.choice++; const c = BB.choice;
        if (BB.phase === 1 || c % 3 !== 0) { // lava barrage: circles appear around you, then erupt
          const n = 4 + BB.phase * 2; BB.state = 8; BB.t = 2.0; A.sfx('tele');
          for (let k = 0; k < n; k++) { const a = Math.random() * TAU, r = 1 + Math.random() * 5.5; addPool(H.x + Math.cos(a) * r, H.z + Math.sin(a) * r, 1.4 + k * 0.12, 2.0, 14); }
        } else if (BB.phase === 2) { BB.state = 10; BB.t = 1.2; A.sfx('tele'); UI.banner('SHIELD BEARERS', 'b-warn'); for (let k = 0; k < 3; k++) spawnEnemy(T_BULW, 14 + Math.random() * 3); }
        else { BB.state = 9; BB.t = 1.2; R_.wardenDim = 7; UI.banner('THE LIGHT FADES', 'b-warn'); A.sfx('roar', 0.8); dark = 0.6; for (let k = 0; k < 4; k++) spawnEnemy(T_MOTH, 15 + Math.random() * 3); }
      }
      break;
    }
    case 8: case 9: case 10: BB.face = Math.atan2(hx, hz); if (BB.t <= 0) { BB.state = 5; BB.t = 1.0; } break;
    case 5: if (BB.t <= 0) { BB.state = 1; BB.walkT = [3.0, 2.4, 2.0][BB.phase - 1]; } break;
    case 7: if (BB.t <= 0) { BB.state = 1; BB.walkT = 1.6; } break;
    default: break;
  }
  ehp[i] = Math.min(ehp[i], emx[i]);
  GS.bossHp = ehp[i] / emx[i]; GS.bossPhase = BB.phase;
  if (hd < 2.5 + 0.5 && BB.hurtCd <= 0) { BB.hurtCd = 1.0; hurtHero(20, hx / (hd || 1), hz / (hd || 1), ex[i], ez[i]); }
}
function bossUpdate(dt) {
  if (BB.kind === 'warden') { wardenUpdate(dt); return; }
  const i = BB.i; if (!BB.on || i < 0 || !ealive[i]) return;
  epx[i] = ex[i]; epz[i] = ez[i];
  const frac = ehp[i] / emx[i];
  if (BB.phase === 1 && frac < 0.66) bossRoar(2); else if (BB.phase === 2 && frac < 0.33) bossRoar(3);
  BB.inv = Math.max(0, BB.inv - dt); BB.t -= dt * BB.enr; BB.hurtCd -= dt;
  const mult = [1, 1.25, 1.5][BB.phase - 1] * BB.enr;
  const hx = H.x - ex[i], hz = H.z - ez[i], hd = Math.hypot(hx, hz);
  const fd = fireDist(ex[i], ez[i]);
  switch (BB.state) {
    case 1: { // walk toward the fire
      const d = fd || 1; if (fd > 3.4) { ex[i] += -ex[i] / d * 2.4 * mult * dt; ez[i] += -ez[i] / d * 2.4 * mult * dt; } else damageFire(9 * dt * mult);
      BB.face = Math.atan2(-ex[i], -ez[i]);
      BB.walkT -= dt * BB.enr;
      if (BB.walkT <= 0) {
        BB.choice++; const ph = BB.phase, c = BB.choice;
        if (ph === 1) beginCharge();
        else if (ph === 2) (c % 2 ? beginCharge() : beginStomp());
        else (c % 3 === 0 ? beginVolley() : c % 3 === 1 ? beginCharge() : beginStomp());
      }
      break;
    }
    case 2: { // charge telegraph
      if (BB.t > 0.25) bossAim();
      BB.face = Math.atan2(BB.dx, BB.dz);
      const prog = 1 - BB.t / 0.95; fx.teleLine.visible = true; fx.teleLine.material.opacity = 0.2 + 0.35 * Math.sin(prog * 18) ** 2 + 0.2 * prog;
      fx.teleLine.position.set(ex[i] + BB.dx * 8, 0.1, ez[i] + BB.dz * 8); fx.teleLine.rotation.y = Math.atan2(BB.dx, BB.dz) + Math.PI / 2 * 0; fx.teleLine.scale.set(2.6, 1, 16);
      fx.teleLine.rotation.y = Math.atan2(BB.dx, BB.dz);
      if (BB.t <= 0) { BB.state = 3; BB.t = 0.55; BB.hit = false; BB.minD = 99; fx.teleLine.visible = false; A.sfx('stomp'); }
      break;
    }
    case 3: { // charge
      const sp = 28 * (BB.phase > 2 ? 1.1 : 1); ex[i] += BB.dx * sp * dt; ez[i] += BB.dz * sp * dt;
      const rr = Math.hypot(ex[i], ez[i]); if (rr > 34) { ex[i] *= 34 / rr; ez[i] *= 34 / rr; }
      pe(ex[i], 0.3, ez[i], (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, 0.5, 0.8, 0.5, 0.2, 0.9, 0, 0, 1);
      if (hd < BB.minD) BB.minD = hd;
      if (!BB.hit && hd < 2.3) { BB.hit = true; hurtHero(26, BB.dx, BB.dz, ex[i], ez[i]); }
      if (fd < 2.6) damageFire(8 * dt * 8 / 4);
      if (BB.t <= 0) { if (!BB.hit && BB.minD < 3.6 && BB.minD > 2.3) nearMiss(); BB.state = 5; BB.t = 0.9; }
      break;
    }
    case 4: { // stomp telegraph
      const prog = 1 - BB.t / 1.15; BB.face = Math.atan2(hx, hz);
      fx.teleRing.visible = fx.teleFill.visible = true; fx.teleRing.position.set(ex[i], 0.1, ez[i]); fx.teleFill.position.set(ex[i], 0.12, ez[i]);
      fx.teleRing.scale.set(5.8, 1, 5.8); fx.teleRing.material.opacity = 0.16 + 0.12 * Math.sin(prog * 20) ** 2;
      fx.teleFill.scale.set(5.8 * prog, 1, 5.8 * prog); fx.teleFill.material.opacity = 0.2 + 0.3 * prog;
      if (BB.t <= 0) {
        fx.teleRing.visible = fx.teleFill.visible = false; A.sfx('stomp'); addShake(0.8); stop(0.05); kick(5); vib(80);
        for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; pe(ex[i] + Math.cos(a) * 1.5, 0.2, ez[i] + Math.sin(a) * 1.5, Math.cos(a) * 12, 1.2, Math.sin(a) * 12, 0.6, 0.9, 1, 0.5, 0.2, 0, 1.5, 1); }
        if (hd < 5.8) hurtHero(22, hx / (hd || 1), hz / (hd || 1), ex[i], ez[i]); else if (hd < 7.2) nearMiss();
        if (fd < 6.5) damageFire(7);
        BB.state = 5; BB.t = 0.9;
      }
      break;
    }
    case 5: if (BB.t <= 0) { BB.state = 1; BB.walkT = [2.4, 1.9, 1.5][BB.phase - 1]; } break;
    case 6: { // fire breath: a fan of embers aimed at the hero, offset each wave so the gaps move
      BB.face = Math.atan2(hx, hz);
      if (BB.t <= 0 && BB.volleys < (BB.phase > 2 ? 3 : 2)) {
        BB.volleys++; BB.t = 0.55; BB.off = BB.volleys % 2 ? 0.05 : -0.05; const n = 11, aim = Math.atan2(hz, hx), spread = 1.15; A.sfx('roar', 1.4); A.sfx('boom'); addShake(0.3);
        const mx = ex[i] + Math.cos(aim) * 2.6, mz = ez[i] + Math.sin(aim) * 2.6;
        for (let k = 0; k < 18; k++) { const a = aim + (Math.random() - 0.5) * spread; pe(mx, 2.2, mz, Math.cos(a) * 9, 0.5, Math.sin(a) * 9, 0.5, 0.9, 1, 0.45, 0.1, 0, 0.8, 1.2); }
        for (let k = 0; k < n; k++) {
          const a = aim - spread / 2 + spread * k / (n - 1) + BB.off; let s = -1;
          for (let q = 0; q < MAXS; q++) if (!salive[q]) { s = q; break; }
          if (s < 0) break;
          salive[s] = 1; sx_[s] = mx; sz_[s] = mz; svx[s] = Math.cos(a) * 10; svz[s] = Math.sin(a) * 10; slife[s] = 3.2; sdmg[s] = 14; smin[s] = 99;
        }
        damageFire(F.max * 0.02);
      } else if (BB.t <= 0) { BB.state = 5; BB.t = 1.0; }
      break;
    }
    case 7: if (BB.t <= 0) { BB.state = 1; BB.walkT = 1.6; } break;
    default: break;
  }
  ehp[i] = Math.min(ehp[i], emx[i]);
  GS.bossHp = ehp[i] / emx[i]; GS.bossPhase = BB.phase;
  // contact damage
  if (hd < 2.4 + 0.5 && BB.hurtCd <= 0 && BB.state !== 3) { BB.hurtCd = 1.0; hurtHero(18, hx / (hd || 1), hz / (hd || 1), ex[i], ez[i]); }
}
function beginCharge() { BB.state = 2; BB.t = 0.95; bossAim(); A.sfx('tele'); }
function beginStomp() { BB.state = 4; BB.t = 1.15; A.sfx('tele'); }
function beginVolley() { BB.state = 6; BB.t = 0.9; BB.volleys = 0; A.sfx('tele'); }
function bossDie() {
  BB.on = false; R_.bossDone = true; fx.teleLine.visible = fx.teleRing.visible = fx.teleFill.visible = false;
  I.boss.mesh.visible = false; UI.bossBar(false);
  phase = 'win'; endT = 3.4 * finale; timeScale = 0.3; slowT = 0; stop(0.14);
  A.sfx('roar', 0.6); A.sfx('victory'); addShake(1); kick(10); vib([80, 40, 160]);
  UI.banner('DAWN BREAKS', 'b-gold'); UI.confetti(finale > 1 ? 90 : 50);
  burst(ex[BB.i], 3, ez[BB.i], 90, 16, 1.6, 0.9, 1, 0.7, 0.2, 3, 1);
  for (let i = 0; i < eHi; i++) if (ealive[i]) { burst(ex[i], 0.8, ez[i], 6, 6, 0.6, 0.4, 1, 0.8, 0.3, 4, 1); dropGem(ex[i], ez[i], 0, 1); ealive[i] = 0; efree[nfree++] = i; nAlive--; R_.kills++; }
  for (let s = 0; s < MAXS; s++) salive[s] = 0;
  F.hp = F.max;
}

/* ---------------- weapons ---------------- */
function newBullet(type, x, z, vx, vz, life, dmg, pierce, homing) {
  for (let i = 0; i < MAXB; i++) if (!balive[i]) {
    balive[i] = 1; btype[i] = type; bx[i] = x; bz[i] = z; bvx[i] = vx; bvz[i] = vz; blife[i] = life; bdmg[i] = dmg; bpierce[i] = pierce; bhom[i] = homing ? 1 : 0;
    bhit[i * 4] = bhit[i * 4 + 1] = bhit[i * 4 + 2] = bhit[i * 4 + 3] = -1; bcrit[i] = 0; bcol[i] = 0; return i;
  }
  return -1;
}
function addSeg(x1, y1, z1, x2, y2, z2) {
  const o = lnP * 6, p = G.fx.lnPos; p[o] = x1; p[o + 1] = y1; p[o + 2] = z1; p[o + 3] = x2; p[o + 4] = y2; p[o + 5] = z2; lnT[lnP] = 0.16; lnP = (lnP + 1) % 64;
}
function bolt(x1, y1, z1, x2, y2, z2) { // jagged lightning leg
  let px = x1, py = y1, pz = z1;
  for (let k = 1; k <= 3; k++) {
    const f = k / 3, jx = k < 3 ? (Math.random() - 0.5) * 0.9 : 0, jz = k < 3 ? (Math.random() - 0.5) * 0.9 : 0;
    const nx = x1 + (x2 - x1) * f + jx, ny = y1 + (y2 - y1) * f, nz = z1 + (z2 - z1) * f + jz;
    addSeg(px, py, pz, nx, ny, nz); px = nx; py = ny; pz = nz;
  }
}
function explode(x, z, rad, dmg) {
  gather(x, z, rad);
  for (let k = 0; k < qn; k++) { const e = qBuf[k], dx = ex[e] - x, dz = ez[e] - z, d = Math.hypot(dx, dz) || 1; hurtE(e, dmg, critRoll(), dx / d, dz / d, 5); }
  burst(x, 0.5, z, 26, 9, 0.6, 0.7, 1, 0.65, 0.2, 5, 0.9); burst(x, 0.5, z, 10, 5, 0.8, 1.0, 0.25, 0.2, 0.3, 0, 0.4);
  A.sfx('boom'); addShake(0.18);
}
function updateWeapons(dt) {
  for (let w = 0; w < wOwned.length; w++) {
    const id = wOwned[w], lv = wLv[id], evo = wEvo[id], inf = wInfo(id, lv, evo);
    const dmg = wDmg(id);
    if (w < 4) GS.wcd[w] = inf.cd ? Math.min(1, Math.max(0, wCd[id]) / inf.cd) : 0;
    if (id === 'orbit') { updateOrbit(inf, dmg, dt, evo); continue; }
    if (id === 'wisp') { updateWisps(inf, dmg, dt, evo); continue; }
    if (id === 'beacon') { wCd[id] -= dt * ST.atk; if (wCd[id] <= 0 && !BC.on && nAlive > 0) { wCd[id] = inf.cd; startBeacon(inf, dmg, evo); } continue; }
    if (id === 'nova') { wCd[id] -= dt * ST.atk; if (wCd[id] <= 0 && !NV.on && nAlive > 0) { wCd[id] = inf.cd; NV.on = true; NV.t = 0; NV.r = 0; NV.max = inf.rad + 0.18 * F.R; NV.dmg = dmg; NV.heal = 0; novaStamp++; A.sfx('nova'); addShake(0.2); } continue; }
    wCd[id] -= dt * ST.atk; if (wCd[id] > 0) continue;
    switch (id) {
      case 'bolt': {
        const t = nearest(H.x, H.z, 13); if (t < 0) { wCd[id] = 0.1; break; }
        wCd[id] = inf.cd; const ang = Math.atan2(ez[t] - H.z, ex[t] - H.x), n = inf.n, sp = evo ? 0.2 : 0.14;
        for (let k = 0; k < n; k++) { const a = ang + (k - (n - 1) / 2) * sp; newBullet(0, H.x, H.z, Math.cos(a) * 17, Math.sin(a) * 17, 1.1, dmg, inf.pierce, false); }
        A.sfx('shoot', 0.9 + Math.random() * 0.2); break;
      }
      case 'bow': {
        const t = randomIn(H.x, H.z, 14); if (t < 0) { wCd[id] = 0.1; break; }
        wCd[id] = inf.cd; const ang = Math.atan2(ez[t] - H.z, ex[t] - H.x), n = inf.n;
        for (let k = 0; k < n; k++) { const a = ang + (k - (n - 1) / 2) * 0.12 + (Math.random() - 0.5) * 0.05; const b = newBullet(1, H.x, H.z, Math.cos(a) * 24, Math.sin(a) * 24, 1.2, dmg, evo ? 2 : lv >= 4 ? 1 : 0, evo); if (b >= 0) bcrit[b] = 0.15; }
        A.sfx('arrow'); break;
      }
      case 'chain': {
        const t = nearest(H.x, H.z, 10); if (t < 0) { wCd[id] = 0.15; break; }
        wCd[id] = inf.cd; chainStamp++;
        let cx = H.x, cz = H.z, cy = 1.1, cur = t, n = 0;
        while (cur >= 0 && n <= inf.n) {
          echain[cur] = chainStamp; const dx = ex[cur] - cx; const dz = ez[cur] - cz; const d = Math.hypot(dx, dz) || 1;
          bolt(cx, cy, cz, ex[cur], 0.8, ez[cur]); hurtE(cur, dmg, critRoll(), dx / d, dz / d, 2); if (evo && ealive[cur]) estun[cur] = 0.8;
          burst(ex[cur], 0.8, ez[cur], 4, 4, 0.3, 0.35, 0.4, 0.8, 1, 0, 0.5);
          cx = ex[cur]; cz = ez[cur]; cy = 0.8; n++;
          gather(cx, cz, 5.5); let best = -1, bd = 1e9;
          for (let k = 0; k < qn; k++) { const e = qBuf[k]; if (echain[e] === chainStamp || !ealive[e]) continue; const q = (ex[e] - cx) ** 2 + (ez[e] - cz) ** 2; if (q < bd) { bd = q; best = e; } }
          cur = best;
        }
        A.sfx('zap'); break;
      }
      case 'whip': { if (!whipSwing(inf, dmg, evo)) { wCd[id] = 0.12; break; } wCd[id] = inf.cd; break; }
      case 'dawn': { if (!dawnSwing(inf, dmg, evo)) { wCd[id] = 0.15; break; } wCd[id] = inf.cd; break; }
      case 'mine': { if (!dropMine(inf, dmg, evo)) { wCd[id] = 0.4; break; } wCd[id] = inf.cd; break; }
      case 'bomb': {
        let best = -1, bn = -1;
        for (let k = 0; k < 6; k++) { const e = randomIn(H.x, H.z, 12); if (e < 0) continue; gather(ex[e], ez[e], 2.4); if (qn > bn) { bn = qn; best = e; } }
        if (best < 0) { wCd[id] = 0.2; break; }
        wCd[id] = inf.cd; const b = newBullet(2, H.x, H.z, 0, 0, 3, dmg, 0, false);
        if (b >= 0) { bsx[b] = H.x; bsz[b] = H.z; btx[b] = ex[best]; btz[b] = ez[best]; bt[b] = 0; bdur[b] = 0.7; brad[b] = inf.rad; }
        A.sfx('shoot', 0.5); break;
      }
      default: break;
    }
  }
}
/* Cinder Wisp: familiars that snipe foes and carry light (Torch Carry: foes near a wisp count as in the light) */
let wispA = 0, wispK = 0;
function updateWisps(inf, dmg, dt, evo) {
  const n = inf.n; wispN = n; wispLR2 = inf.rad * inf.rad; wispA += 1.9 * dt;
  for (let k = 0; k < n; k++) {
    const a = wispA + k / n * TAU, r = 3.6 + (evo ? 0.5 : 0); WX[k] = H.x + Math.cos(a) * r; WZ[k] = H.z + Math.sin(a) * r * 0.9;
    if (Math.random() < 0.3) pe(WX[k], 1.0, WZ[k], 0, 0.6, 0, 0.35, 0.4, 0.5, 0.9, 1, 0, 0, 0);
  }
  wCd.wisp -= dt * ST.atk; if (wCd.wisp > 0) return;
  const k = (wispK++) % n, t = nearest(WX[k], WZ[k], 9);
  if (t < 0) { wCd.wisp = 0.12; return; }
  wCd.wisp = inf.cd / n;
  const dx = ex[t] - WX[k], dz = ez[t] - WZ[k], d = Math.hypot(dx, dz) || 1, b = newBullet(0, WX[k], WZ[k], dx / d * 15, dz / d * 15, 1.0, dmg, evo ? 2 : 0, evo);
  if (b >= 0) bcol[b] = 1;
  A.sfx('shoot', 1.4);
}
/* Ash Whip: arc sweep toward the nearest foe */
function whipSwing(inf, dmg, evo) {
  const t = nearest(H.x, H.z, inf.rad + 1.2); if (t < 0) return false;
  let ax = ex[t] - H.x, az = ez[t] - H.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
  gather(H.x, H.z, inf.rad);
  for (let k = 0; k < qn; k++) { const e = qBuf[k], dx = ex[e] - H.x, dz = ez[e] - H.z, d = Math.hypot(dx, dz) || 1; if (evo || (dx * ax + dz * az) / d > 0.34) hurtE(e, dmg, critRoll(), dx / d, dz / d, 6); }
  const base = Math.atan2(az, ax), span = evo ? TAU : 2.2, steps = evo ? 26 : 16;
  for (let k = 0; k < steps; k++) { const a = evo ? k / steps * TAU : base - span / 2 + span * k / (steps - 1), r = inf.rad * (0.7 + Math.random() * 0.3); pe(H.x + Math.cos(a) * r, 0.6, H.z + Math.sin(a) * r, Math.cos(a) * 3, 0.6, Math.sin(a) * 3, 0.28, 0.5, 0.78, 0.64, 1, 0, 0.5, 0); }
  A.sfx('shoot', 0.7); addShake(0.05); return true;
}
/* Dawnblade: a full-circle cut of morning light */
function dawnSwing(inf, dmg, evo) {
  if (nearest(H.x, H.z, inf.rad + 1) < 0) return false;
  gather(H.x, H.z, inf.rad);
  for (let k = 0; k < qn; k++) { const e = qBuf[k], dx = ex[e] - H.x, dz = ez[e] - H.z, d = Math.hypot(dx, dz) || 1; hurtE(e, dmg, critRoll(), dx / d, dz / d, 7); }
  const steps = evo ? 34 : 26, a0 = Math.random() * TAU;
  for (let k = 0; k < steps; k++) { const a = a0 + k / steps * TAU, r = inf.rad * (0.75 + Math.random() * 0.25); pe(H.x + Math.cos(a) * r, 0.7, H.z + Math.sin(a) * r, -Math.sin(a) * 5, 0.8, Math.cos(a) * 5, 0.32, 0.6, 1, 0.85, 0.4, 0, 0.6, 0); }
  A.sfx('shoot', 0.45); addShake(0.06); return true;
}
/* Spark Mines */
const MAXM = 12, mnx = new Float32Array(MAXM), mnz = new Float32Array(MAXM), mnt = new Float32Array(MAXM), mnd = new Float32Array(MAXM), mnr = new Float32Array(MAXM), mna = new Uint8Array(MAXM);
function dropMine(inf, dmg, evo) {
  let alive = 0, free = -1; for (let k = 0; k < MAXM; k++) { if (mna[k]) alive++; else if (free < 0) free = k; }
  if (alive >= inf.n || free < 0 || nAlive === 0) return false;
  mna[free] = 1; mnx[free] = H.x + (Math.random() - 0.5) * 0.8; mnz[free] = H.z + (Math.random() - 0.5) * 0.8; mnt[free] = 0; mnd[free] = dmg; mnr[free] = inf.rad; A.sfx('shoot', 0.6); return true;
}
function updateMines(dt) {
  for (let k = 0; k < MAXM; k++) {
    if (!mna[k]) continue;
    mnt[k] += dt; if (mnt[k] > 18) { mna[k] = 0; continue; }
    if (mnt[k] < 0.7) continue;
    gather(mnx[k], mnz[k], 0.9); if (qn === 0) continue;
    mna[k] = 0; explode(mnx[k], mnz[k], mnr[k], mnd[k]);
    if (wEvo.mine) for (let q = 0; q < 6; q++) { const a = Math.random() * TAU; pe(mnx[k], 0.5, mnz[k], Math.cos(a) * 7, 2, Math.sin(a) * 7, 0.5, 0.5, 0.4, 1, 0.8, 4, 0.5, 0); }
  }
}
/* Beacon: a pulse from the fire; foes at the rim of the light take extra damage */
const BC = { on: false, t: 0, max: 0, dmg: 0, stamp: 0, evo: false, second: false };
const ebc = new Int32Array(MAXE);
function startBeacon(inf, dmg, evo) { BC.on = true; BC.t = 0; BC.max = F.R + 2; BC.dmg = dmg; BC.stamp++; BC.evo = evo; BC.second = evo; F.hp = Math.min(F.max, F.hp + 3); A.sfx('nova'); addShake(0.1); }
function updateBeacon(dt) {
  if (!BC.on) { fx.pulse.material.opacity = 0; return; }
  BC.t += dt; const f = BC.t / 0.7, r = BC.max * Math.min(1, f);
  gather(0, 0, r + 1.4);
  for (let k = 0; k < qn; k++) {
    const e = qBuf[k]; if (ebc[e] === BC.stamp) continue;
    const d = Math.hypot(ex[e], ez[e]) || 1; if (Math.abs(d - r) > 1.5) continue;
    ebc[e] = BC.stamp; hurtE(e, BC.dmg * (d > F.R - 2.5 ? 1.6 : 1), critRoll(), ex[e] / d, ez[e] / d, 6); if (BC.evo && ealive[e]) estun[e] = 0.8;
  }
  fx.pulse.position.set(0, 0.2, 0); fx.pulse.scale.set(r, 1, r); fx.pulse.material.opacity = 0.7 * (1 - f * f);
  if (BC.second && f > 0.5) { BC.second = false; BC.stamp++; BC.t = 0.15; }
  if (f >= 1) BC.on = false;
}
function updateOrbit(inf, dmg, dt, evo) {
  const n = inf.n, rad = (evo ? 3.2 : 2.3), spd = 3.4; orbN = n; orbA += spd * dt;
  for (let k = 0; k < n; k++) {
    const ring2 = evo && k >= n / 2, a = orbA * (ring2 ? -0.8 : 1) + (ring2 ? k - n / 2 : k) / (evo ? n / 2 : n) * TAU, r = ring2 ? rad + 1.3 : rad - (evo ? 0.9 : 0);
    const x = H.x + Math.cos(a) * r, z = H.z + Math.sin(a) * r; orbX[k] = x; orbZ[k] = z;
    gather(x, z, 0.5);
    for (let q = 0; q < qn; q++) { const e = qBuf[q]; if (eorb[e] > 0) continue; eorb[e] = 0.4; const dx = ex[e] - H.x, dz = ez[e] - H.z, d = Math.hypot(dx, dz) || 1; hurtE(e, dmg, critRoll(), dx / d, dz / d, evo ? 8 : 4); if (evo) pe(x, 0.7, z, 0, 0.5, 0, 0.6, 0.6, 1, 0.5, 0.15, 0, 0, 1); }
    if (Math.random() < 0.4) pe(x, 0.9, z, 0, 0.5, 0, 0.35, 0.45, 1, 0.55, 0.2, 0, 0, 0);
  }
}
function updateBullets(dt) {
  for (let i = 0; i < MAXB; i++) {
    if (!balive[i]) continue;
    if (btype[i] >= 2) { // lobbed bombs
      bt[i] += dt; const f = Math.min(1, bt[i] / bdur[i]);
      bx[i] = bsx[i] + (btx[i] - bsx[i]) * f; bz[i] = bsz[i] + (btz[i] - bsz[i]) * f; bcb[i] = Math.sin(f * Math.PI) * (btype[i] === 2 ? 3.2 : 1.8);
      if (f >= 1) {
        balive[i] = 0; explode(bx[i], bz[i], brad[i], bdmg[i]);
        if (btype[i] === 2 && wEvo.bomb) for (let k = 0; k < 4; k++) { const b = newBullet(3, bx[i], bz[i], 0, 0, 3, bdmg[i] * 0.5, 0, false); if (b >= 0) { const a = k / 4 * TAU + Math.random(), r = 2.5 + Math.random() * 2; bsx[b] = bx[i]; bsz[b] = bz[i]; btx[b] = bx[i] + Math.cos(a) * r; btz[b] = bz[i] + Math.sin(a) * r; bt[b] = 0; bdur[b] = 0.45; brad[b] = 1.7; } }
      }
      continue;
    }
    if (bhom[i]) {
      const t = nearest(bx[i], bz[i], 8);
      if (t >= 0) { const dx = ex[t] - bx[i], dz = ez[t] - bz[i], d = Math.hypot(dx, dz) || 1, sp = Math.hypot(bvx[i], bvz[i]); bvx[i] += (dx / d * sp - bvx[i]) * Math.min(1, dt * 7); bvz[i] += (dz / d * sp - bvz[i]) * Math.min(1, dt * 7); }
    }
    bx[i] += bvx[i] * dt; bz[i] += bvz[i] * dt; blife[i] -= dt;
    if (blife[i] <= 0) { balive[i] = 0; continue; }
    gather(bx[i], bz[i], 0.3);
    for (let k = 0; k < qn; k++) {
      const e = qBuf[k], o = i * 4;
      if (bhit[o] === e || bhit[o + 1] === e || bhit[o + 2] === e || bhit[o + 3] === e) continue;
      const sp = Math.hypot(bvx[i], bvz[i]) || 1;
      hurtE(e, bdmg[i], critRoll(bcrit[i]), bvx[i] / sp, bvz[i] / sp, 3.5);
      bhit[o + (bpierce[i] & 3)] = e;
      burst(bx[i], 0.9, bz[i], 3, 4, 0.25, 0.3, 1, 0.6, 0.2, 0, 0.3);
      if (bpierce[i] > 0) bpierce[i]--; else { balive[i] = 0; break; }
    }
    if (btype[i] === 0 && Math.random() < 0.6) pe(bx[i], 0.9, bz[i], 0, 0, 0, 0.25, 0.4, 1, 0.55, 0.2, 0, 0, 0);
  }
}
function updateNova(dt) {
  if (!NV.on) { fx.nova.material.opacity = 0; return; }
  NV.t += dt; const f = NV.t / 0.45; NV.r = NV.max * Math.min(1, f);
  gather(H.x, H.z, NV.r + 0.6);
  for (let k = 0; k < qn; k++) {
    const e = qBuf[k]; if (enova[e] === novaStamp) continue;
    const dx = ex[e] - H.x, dz = ez[e] - H.z, d = Math.hypot(dx, dz) || 1;
    if (d > NV.r - 1.5) { enova[e] = novaStamp; hurtE(e, NV.dmg, critRoll(), dx / d, dz / d, 9); if (wEvo.nova && NV.heal < 6) { NV.heal += 0.4; F.hp = Math.min(F.max, F.hp + 0.4); } }
  }
  for (let k = 0; k < 3; k++) { const a = Math.random() * TAU; pe(H.x + Math.cos(a) * NV.r, 0.4, H.z + Math.sin(a) * NV.r, Math.cos(a) * 2, 1.5, Math.sin(a) * 2, 0.4, 0.7, 1, 0.5, 0.15, 0, 0.5, 0); }
  fx.nova.position.set(H.x, 0.2, H.z); fx.nova.scale.set(NV.r, 1, NV.r); fx.nova.material.opacity = 0.8 * (1 - f * f);
  if (f >= 1) NV.on = false;
}
function updateEnemyShots(dt) {
  for (let s = 0; s < MAXS; s++) {
    if (!salive[s]) continue;
    sx_[s] += svx[s] * dt; sz_[s] += svz[s] * dt; slife[s] -= dt;
    const dx = H.x - sx_[s], dz = H.z - sz_[s], d = Math.hypot(dx, dz);
    if (d < 0.6) { salive[s] = 0; hurtHero(sdmg[s], -dx / (d || 1), -dz / (d || 1), sx_[s], sz_[s]); burst(sx_[s], 0.8, sz_[s], 6, 4, 0.3, 0.4, 1, 0.4, 0.15, 3, 0.5); continue; }
    if (d < smin[s]) smin[s] = d; else if (smin[s] < 1.15 && smin[s] > 0.6 && d > smin[s] + 0.3) { smin[s] = 99; nearMiss(); }
    if (slife[s] <= 0 || Math.hypot(sx_[s], sz_[s]) > 40) salive[s] = 0;
    if (Math.random() < 0.5) pe(sx_[s], 0.9, sz_[s], 0, 0.4, 0, 0.3, 0.5, 1, 0.35, 0.1, 0, 0, 0);
  }
}

/* ground pools: telegraphed circles that erupt (Ashen geysers, Ashen Warden barrage) */
const MAXP = 14, plx = new Float32Array(MAXP), plz = new Float32Array(MAXP), plt = new Float32Array(MAXP), plT = new Float32Array(MAXP), plr = new Float32Array(MAXP), pld = new Float32Array(MAXP), pla = new Uint8Array(MAXP);
function addPool(x, z, delay, r, dmg) { for (let k = 0; k < MAXP; k++) if (!pla[k]) { pla[k] = 1; plx[k] = x; plz[k] = z; plt[k] = plT[k] = delay; plr[k] = r; pld[k] = dmg; return; } }
function updatePools(dt) {
  for (let k = 0; k < MAXP; k++) {
    if (!pla[k]) continue;
    plt[k] -= dt; if (plt[k] > 0) continue;
    pla[k] = 0; const x = plx[k], z = plz[k], r = plr[k];
    burst(x, 0.4, z, 24, 8, 0.7, 0.7, 1, 0.45, 0.12, 4, 1.3); A.sfx('boom'); addShake(0.12);
    const hx = H.x - x, hz = H.z - z, hd = Math.hypot(hx, hz);
    if (hd < r) hurtHero(pld[k], hx / (hd || 1), hz / (hd || 1), x, z); else if (hd < r + 1.2) nearMiss();
    if (Math.hypot(x, z) < r + 1.2) damageFire(3);
    gather(x, z, r); for (let q = 0; q < qn; q++) { const e = qBuf[q]; if (ET[etype[e]].boss) continue; hurtE(e, 25, false, 0, 0, 0); }
  }
}
function puddleAt(x, z) { const p = G.world.puddles; if (!p) return false; for (let k = 0; k < p.length; k += 3) { const dx = x - p[k], dz = z - p[k + 1]; if (dx * dx + dz * dz < p[k + 2] * p[k + 2]) return true; } return false; }
function hazards(dt) {
  const hz = G.world.a.hazard;
  if (hz === 'geyser' && phase === 'run') {
    R_.hazT -= dt;
    if (R_.hazT <= 0) { R_.hazT = Math.max(4.2, 9 - R_.t / 60); const a = Math.random() * TAU, d = 1.5 + Math.random() * 4; addPool(H.x + Math.cos(a) * d, H.z + Math.sin(a) * d, 1.5, 1.9, 9); }
  }
}
const LP = { charge: 0, cd: 0, t: 0 };
function lightPulse() {
  LP.charge = 0; LP.cd = 12; LP.t = 0.5;
  gather(H.x, H.z, 7);
  for (let k = 0; k < qn; k++) { const e = qBuf[k]; if (ET[etype[e]].boss) continue; const dx = ex[e] - H.x, dz = ez[e] - H.z, d = Math.hypot(dx, dz) || 1; evx[e] += dx / d * 22; evz[e] += dz / d * 22; estun[e] = Math.max(estun[e], 0.7); hurtE(e, 14 * ST.dmg, false, dx / d, dz / d, 0); }
  for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; pe(H.x + Math.cos(a) * 1.2, 0.5, H.z + Math.sin(a) * 1.2, Math.cos(a) * 11, 1.2, Math.sin(a) * 11, 0.5, 0.6, 1, 0.9, 0.5, 0, 1.4, 0.4); }
  A.sfx('nova'); addShake(0.15); UI.banner('LIGHT PULSE', 'b-gold');
}
function updateLP(dt, still, near) {
  if (phase === 'run' && still && near) { LP.charge = Math.min(1, LP.charge + dt / 3); if (!save.hints.pulse && LP.charge > 0.3) { save.hints.pulse = 1; UI.hint('Standing still by the fire charges a Light Pulse', 3400); } } else LP.charge = Math.max(0, LP.charge - dt * 1.5);
  LP.cd = Math.max(0, LP.cd - dt);
  if (LP.charge >= 1 && LP.cd <= 0 && nAlive > 0) lightPulse();
  if (LP.t > 0) { LP.t -= dt; const f = 1 - Math.max(0, LP.t) / 0.5; fx.lpulse.position.set(H.x, 0.22, H.z); fx.lpulse.scale.set(0.5 + 7 * f, 1, 0.5 + 7 * f); fx.lpulse.material.opacity = 0.7 * (1 - f); } else fx.lpulse.material.opacity = 0;
  GS.pulse = LP.cd > 0 ? 0 : LP.charge; GS.pulseCd = LP.cd;
}
/* ---------------- main step ---------------- */
function step(dt) {
  R_.t += dt; killFx = 0;
  // snapshot
  H.px = H.x; H.pz = H.z;
  // input
  const mv = UI.mv; let mx = mv.x, mz = mv.z; const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const acc_ = 60, canMove = phase !== 'lose';
  const pud = G.world.puddles && puddleAt(H.x, H.z) ? 0.65 : 1;
  const tvx = canMove ? mx * ST.speed * pud : 0, tvz = canMove ? mz * ST.speed * pud : 0;
  const k = Math.min(1, acc_ * dt * 0.38); H.vx += (tvx - H.vx) * k; H.vz += (tvz - H.vz) * k;
  H.x += H.vx * dt; H.z += H.vz * dt;
  const hr = Math.hypot(H.x, H.z); if (hr > 26) { H.x *= 26 / hr; H.z *= 26 / hr; }
  const sp = Math.hypot(H.vx, H.vz); H.mv = sp / ST.speed;
  if (sp > 0.4) { H.face = Math.atan2(H.vx, H.vz); H.lastDx = H.vx; H.lastDz = H.vz; if (!save.hints.move && sp > 1) { save.hints.move = 1; } }
  if (trailC && sp > 1.5 && Math.random() < 0.55) pe(H.x - H.vx * 0.04, 0.2, H.z - H.vz * 0.04, (Math.random() - 0.5) * 0.8, 0.8 + Math.random(), (Math.random() - 0.5) * 0.8, 0.55, 0.35, trailC[0], trailC[1], trailC[2], -1, 0.4, 0);
  H.bob += dt * (6 + sp * 1.6); H.inv = Math.max(0, H.inv - dt); H.hurtT = Math.max(0, H.hurtT - dt); H.squash *= 0.85;
  R_.nearT = Math.max(0, R_.nearT - dt);
  // streak decay
  if (R_.streak > 0) { R_.streakT -= dt; if (R_.streakT <= 0) { if (R_.streak >= 20) { UI.comboEnd(R_.streak); A.sfx('combobreak'); } R_.streak = 0; R_.tier = 0; UI.streak(0); } }
  for (let i = 0; i < eHi; i++) if (ealive[i]) { epx[i] = ex[i]; epz[i] = ez[i]; }
  if (phase === 'run' || phase === 'pre') {
    director(dt);
    // pace markers vs. your saved best run
    if (R_.t >= R_.paceNext) {
      R_.pace.push(R_.kills); const idx = R_.pace.length - 1, b = save.best && save.best.pace;
      if (b && b[idx] != null) { const d = R_.kills - b[idx]; GS.pace = d >= 0 ? '+' + d + ' vs your best' : d + ' vs your best'; GS.paceUp = d >= 0; }
      R_.paceNext += 15;
    }
  }
  buildHash();
  stepEnemies(dt);
  if (BB.on) bossUpdate(dt);
  if (phase === 'run' || phase === 'pre' || phase === 'win') { updateWeapons(dt); }
  updatePools(dt); hazards(dt);
  updateBullets(dt); updateNova(dt); updateBeacon(dt); updateMines(dt); updateEnemyShots(dt); updateGems(dt);
  // fire
  const fd = Math.hypot(H.x, H.z);
  const near = fd < Math.max(3, F.R * 0.55);
  if (phase === 'run' && near && F.hp > 0) F.hp = Math.min(F.max, F.hp + ST.fireRegen * dt);
  else if (phase === 'run' && F.hp > 0) F.hp = Math.min(F.max, F.hp + ST.fireRegen * 0.12 * dt);
  updateLP(dt, sp < 0.35, near);
  if (R_.darkT > 0) R_.darkT -= dt;
  retStep(dt); champStep(dt); juiceStep(dt);
  if (R_.wardenDim > 0) R_.wardenDim -= dt;
  const frac = F.hp / F.max;
  if (frac < 0.12 && !R_.lastEmber && phase === 'run') {
    R_.lastEmber = true; A.sfx('lastember'); UI.banner('LAST EMBER!', 'b-gold'); slow(0.7, 0.3); stop(0.06); addShake(0.8); kick(8); vib(150);
    F.hp = F.max * 0.28;
    gather(0, 0, 11); for (let q = 0; q < qn; q++) { const e = qBuf[q]; if (ET[etype[e]].boss) continue; const dx = ex[e], dz = ez[e], d = Math.hypot(dx, dz) || 1; evx[e] += dx / d * 28; evz[e] += dz / d * 28; hurtE(e, 60, false, 0, 0, 0); }
    for (let k2 = 0; k2 < 60; k2++) { const a = k2 / 60 * TAU; pe(Math.cos(a) * 1.5, 0.4, Math.sin(a) * 1.5, Math.cos(a) * 16, 1.5, Math.sin(a) * 16, 0.9, 1, 1, 0.6, 0.2, 0, 1.2, 0.5); }
  }
  const targetR = (2.6 + (ST.fireRad - 2.6) * Math.sqrt(Math.max(0, frac))) * (1 - Math.min(0.15, 0.03 * R_.moths)) * (R_.darkT > 0 ? 0.75 : 1) * (R_.wardenDim > 0 ? 0.6 : 1);
  F.R += (targetR - F.R) * Math.min(1, dt * 4);
  if (phase === 'lose' && R_.why === 'fire') F.R *= 0.97;
  if (Math.random() < 0.35 && frac > 0.02) pe((Math.random() - 0.5) * 0.8, 1.1, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.5, 3 + Math.random() * 3, (Math.random() - 0.5) * 1.5, 1.1, 0.35, 1, 0.55, 0.15, -2, 0.3, 0);
  // ambient fireflies
  if (Math.random() < 0.04) { const a = Math.random() * TAU, r = Math.random() * 14; const c = G.world.a.fly; pe(H.x + Math.cos(a) * r, 0.5 + Math.random() * 2, H.z + Math.sin(a) * r, (Math.random() - 0.5), 0.2, (Math.random() - 0.5), 4 + Math.random() * 3, 0.28, c[0], c[1], c[2], 0, 0.4, 0); }
  // phase timers
  if (phase === 'win' || phase === 'lose') {
    endT -= dt / Math.max(0.01, timeScale);
    if (phase === 'win') dawn = Math.min(1, dawn + dt * 0.35 / finale);
    if (endT <= 0) endRun(phase === 'win', R_.why);
  }
  // danger metric for camera + music
  const dn = Math.min(1, nAlive / 140) * 0.55 + (1 - frac) * 0.45;
  danger = Math.max(dn, BB.on ? 0.85 : 0);
  if (H.hp > 0) R_.hpAtEnd = H.hp / ST.maxHp;
}
function enemyShot(x, z, dx, dz, sp, dmg) {
  for (let q = 0; q < MAXS; q++) if (!salive[q]) { salive[q] = 1; sx_[q] = x + dx * 0.6; sz_[q] = z + dz * 0.6; svx[q] = dx * sp; svz[q] = dz * sp; slife[q] = 3.2; sdmg[q] = dmg; smin[q] = 99; return; }
}
function summon(i) {
  if (nAlive > maxEn() - 4) return;
  for (let k = 0; k < 3; k++) { const a = Math.random() * TAU; allocEnemy(0, ex[i] + Math.cos(a) * 1.9, ez[i] + Math.sin(a) * 1.9); }
  burst(ex[i], 1, ez[i], 14, 5, 0.6, 0.5, 0.7, 0.3, 1, 3, 1); A.sfx('tele');
}
function bombBurst(i, fd, hd) {
  const x = ex[i], z = ez[i];
  ealive[i] = 0; efree[nfree++] = i; nAlive--;
  burst(x, 0.7, z, 22, 8, 0.5, 0.6, 1, 0.55, 0.15, 5, 0.9); A.sfx('boom'); addShake(0.08);
  if (fd < 3.6) damageFire(4);
  if (hd < 2.0) hurtHero(9, 0, 0, x, z);
  gather(x, z, 2.2);
  for (let k = 0; k < qn; k++) { const e = qBuf[k]; if (e === i || !ealive[e]) continue; const dx = ex[e] - x, dz = ez[e] - z, d = Math.hypot(dx, dz) || 1; hurtE(e, 18, false, dx / d, dz / d, 4); }
}
function stepEnemies(dt) {
  let nm = 0; const hasPud = !!G.world.puddles;
  const hxp = H.x, hzp = H.z, tScale = 1 + R_.t * 0.0012, fR2 = F.R * F.R, dying = phase === 'lose' && R_.why === 'fire';
  for (let i = 0; i < eHi; i++) {
    if (!ealive[i]) continue;
    const t = etype[i], d = ET[t];
    eph[i] += dt; eflash[i] = Math.max(0, eflash[i] - dt); eatk[i] -= dt; eorb[i] -= dt; estun[i] -= dt;
    evx[i] *= Math.exp(-9 * dt); evz[i] *= Math.exp(-9 * dt);
    if (d.boss) { ex[i] += evx[i] * dt; ez[i] += evz[i] * dt; continue; }
    const fdx = -ex[i], fdz = -ez[i], fd2 = fdx * fdx + fdz * fdz, fd = Math.sqrt(fd2) || 1;
    const hdx = hxp - ex[i], hdz = hzp - ez[i], hd2 = hdx * hdx + hdz * hdz, hd = Math.sqrt(hd2) || 1;
    const lit = fd2 < fR2 || (wispN > 0 && isLit(ex[i], ez[i]));
    let tx, tz;
    if (d.ai === 'moth') nm++;
    if (echamp[i]) { tx = hdx / hd; tz = hdz / hd; }
    else if (egold[i]) { tx = -hdx / hd; tz = -hdz / hd; eage[i] += dt; if (eage[i] > 9) { ealive[i] = 0; efree[nfree++] = i; nAlive--; burst(ex[i], 1, ez[i], 10, 4, 0.5, 0.4, 1, 0.8, 0.3, 0, 1); continue; } }
    else if (t === 3 || d.ai === 'moth' || d.ai === 'bomb' || hd2 > 100) { tx = fdx / fd; tz = fdz / fd; } else { tx = hdx / hd; tz = hdz / hd; }
    let sp = espd[i] * tScale * (lit ? 0.72 - pv.ward * 0.6 : 1.18) * (estun[i] > 0 ? 0 : 1) * (hasPud && puddleAt(ex[i], ez[i]) ? 0.75 : 1);
    if (dying) sp *= 1.6;
    if (d.ai === 'ranged') {
      ecd[i] -= dt;
      if (hd < d.rng) { sp = hd < d.rng * 0.55 ? -sp * 0.6 : 0; if (ecd[i] <= 0) { ecd[i] = d.cd; enemyShot(ex[i], ez[i], hdx / hd, hdz / hd, 8.5, d.shot); } }
    } else if (d.ai === 'summon') {
      ecd[i] -= dt; if (ecd[i] <= 0) { ecd[i] = 6.5; summon(i); }
    } else if (d.ai === 'bomb' && (fd < 2.9 || hd < 1.0)) { bombBurst(i, fd, hd); continue; }
    if (t === 3 || d.ai === 'moth') { const w = Math.sin(eph[i] * 3.2) * 0.7; const nx = tx - tz * w, nz = tz + tx * w; tx = nx; tz = nz; }
    // stop at the fire edge and gnaw it
    const reach = d.r + 1.4;
    const gnaw = fd < reach + 0.2 && !egold[i] && !echamp[i];
    if (gnaw) { sp = 0; damageFire(d.fd * dt * (lit ? 1 : 1.3)); if (Math.random() < dt * 2) pe(ex[i] * 0.5, 0.8, ez[i] * 0.5, 0, 2, 0, 0.5, 0.4, 1, 0.4, 0.1, 0, 0, 0); }
    ex[i] += (tx * sp + evx[i]) * dt; ez[i] += (tz * sp + evz[i]) * dt;
    if (sp > 0.1) efc[i] = Math.atan2(tx, tz);
    // separation via grid
    const c = ecell[i], cx = c % GW, cz = (c / GW) | 0; let pushx = 0, pushz = 0, cnt = 0;
    for (let oz = -1; oz <= 1 && cnt < 10; oz++) for (let ox = -1; ox <= 1; ox++) {
      const nx = cx + ox, nz = cz + oz; if (nx < 0 || nz < 0 || nx >= GW || nz >= GW) continue;
      const cc = nz * GW + nx;
      for (let k = cellStart[cc], e = cellStart[cc + 1]; k < e && cnt < 10; k++) {
        const j = order[k]; if (j === i) continue; cnt++;
        const dx = ex[i] - ex[j], dz = ez[i] - ez[j], dd = dx * dx + dz * dz, rr = d.r + ET[etype[j]].r;
        if (dd < rr * rr && dd > 0.0001) { const q = Math.sqrt(dd); const f = (rr - q) / rr; pushx += dx / q * f; pushz += dz / q * f; }
      }
    }
    ex[i] += pushx * 3.2 * dt * 6; ez[i] += pushz * 3.2 * dt * 6;
    // contact with hero
    if (hd < d.r + 0.5 && eatk[i] <= 0 && estun[i] <= 0 && !egold[i]) { eatk[i] = 0.8; hurtHero(d.dmg * (lit ? 0.8 : 1.4) * (echamp[i] ? 1.5 : 1), -hdx / hd, -hdz / hd, ex[i], ez[i]); }
  }
  R_.moths = nm;
  while (eHi > 0 && !ealive[eHi - 1]) eHi--;
}

/* ---------------- juice: chest charge-up, near-death heartbeat and release (retention.js `juice`) ---------------- */
const JC = { t: 0, x: 0, z: 0, n: 0 }, JL = { low: 0, beat: 0, wasLow: false, relT: 0 };
function juiceReset() { JC.t = 0; JC.n = 0; JL.low = 0; JL.beat = 0; JL.wasLow = false; JL.relT = 0; A.setMuffle(0); }
// A chest no longer opens instantly: it shakes, glows and hums for a beat, then bursts into the card pick.
function chestCharge(x, z) {
  if (!retOn('juice')) { R_.chestPending++; checkLevel(); return; }
  if (JC.t > 0) { JC.n++; return; } // a second chest during the charge just queues another pick
  JC.t = RET.juice.chestT; JC.x = x; JC.z = z; JC.n = 1; A.sfx('charge'); slow(RET.juice.chestT * 1.6, 0.6); vib(30);
}
function juiceStep(dt) {
  if (JC.t > 0) {
    JC.t -= dt; const f = 1 - JC.t / RET.juice.chestT;
    for (let k = 0; k < 3; k++) { const a = Math.random() * TAU, r = 0.4 + Math.random() * 0.5 * (1 - f); pe(JC.x + Math.cos(a) * r, 0.4, JC.z + Math.sin(a) * r, 0, 3 + f * 6, 0, 0.5, 0.35 + f * 0.3, 1, 0.8, 0.3, -1, 0.3, 0); }
    if (JC.t <= 0) {
      burst(JC.x, 1, JC.z, 46, 11, 0.9, 0.6, 1, 0.85, 0.35, 4, 1.3); A.sfx('chestpop'); addShake(0.45); kick(5); stop(0.06);
      R_.chestPending += JC.n; JC.n = 0; checkLevel();
    }
  }
}
// Called per rendered frame: heartbeat and a red tunnel at low health, music muffled; a "second wind" release on recovery.
function juiceFrame(rdt) {
  if (!retOn('juice') || phase !== 'run') { if (JL.low) { JL.low = 0; A.setMuffle(0); } return 0; }
  const hp = H.hp / ST.maxHp, target = hp < 0.3 ? 1 - hp / 0.3 : 0;
  JL.low += (target - JL.low) * Math.min(1, rdt * 4);
  A.setMuffle(JL.low * 0.85);
  if (JL.low > 0.15) {
    JL.wasLow = JL.wasLow || hp < 0.25;
    if ((JL.beat -= rdt) <= 0) { JL.beat = 0.95 - 0.4 * JL.low; A.sfx('heart', JL.low); }
  }
  if (JL.wasLow && hp > 0.45) {
    JL.wasLow = false;
    if (performance.now() - JL.relT > 12000) { JL.relT = performance.now(); A.sfx('release'); UI.flash('level'); UI.banner('SECOND WIND', 'b-gold'); burst(H.x, 1, H.z, 30, 7, 0.7, 0.45, 1, 0.9, 0.5, 2, 1.3); }
  }
  const pulse = JL.beat > 0 ? Math.max(0, 1 - (0.95 - 0.4 * JL.low - JL.beat) * 5) : 0;
  return JL.low * (0.35 + 0.25 * pulse);
}

/* ---------------- live session task on the HUD ---------------- */
const qLive = new Set(); let qT = 0;
function liveRun() { return { kills: R_.kills, chests: R_.chests, bossSeen: R_.bossSeen, evos: R_.evos, lvl: R_.lvl, time: R_.t, maxStreak: R_.maxStreak }; }
function updateQuestHud(rdt) {
  if ((qT -= rdt) > 0 || !save.quests) return; qT = 0.25;
  const run = liveRun(); let best = null, bf = -1;
  for (const q of save.quests.list) {
    if (q.done) continue;
    const v = PR.questLive(q, run), f = v / q.n;
    if (v >= q.n && !qLive.has(q.id)) { qLive.add(q.id); UI.banner('TASK DONE', 'b-gold'); A.sfx('unlock'); UI.hint(PR.questText(q) + ': +' + q.coin + ' coins at the end of the run', 3200); }
    if (v < q.n && f > bf) { bf = f; best = { text: PR.questText(q), v, n: q.n, icon: PR.QUESTS[q.id].icon }; }
  }
  UI.questHud(best);
}
export function questsNow() { const run = phase === 'run' || phase === 'paused' || phase === 'levelup' ? liveRun() : null; return (save.quests ? save.quests.list : []).map((q) => ({ text: PR.questText(q), v: run ? PR.questLive(q, run) : q.have, n: q.n, coin: q.coin, done: q.done || (run && PR.questLive(q, run) >= q.n), icon: PR.QUESTS[q.id].icon })); }
export function buildNow() { return { w: wOwned.map((id) => ({ name: WEAPONS[id].name, icon: WEAPONS[id].icon, col: WEAPONS[id].col, lv: wLv[id], evo: wEvo[id], loan: isLoan(id) })), p: Object.keys(PASSIVES).filter((k) => pl[k] > 0).map((k) => ({ name: PASSIVES[k].name, icon: PASSIVES[k].icon, col: PASSIVES[k].col, lv: pl[k] })), t: R_.t, kills: R_.kills, lvl: R_.lvl }; }

/* ---------------- render ---------------- */
let fpsAcc = 0, fpsN = 0, settle = 4, fpsOk = 0, rFace = 0, rMv = 0;
const tmpC = { r: 0, g: 0, b: 0 };
function updateMood() {
  const m = A.mood, fr = F.hp / F.max;
  m.fire += (fr - m.fire) * 0.05; m.danger += (danger - m.danger) * 0.03; m.boss = BB.on ? 1 : 0; m.low = (fr < 0.3 || H.hp / ST.maxHp < 0.3) && phase === 'run' ? 1 - Math.min(fr, H.hp / ST.maxHp) / 0.3 : 0;
}
function render(rdt, alpha) {
  const t = performance.now() * 0.001;
  const hx = H.px + (H.x - H.px) * alpha, hz = H.pz + (H.z - H.pz) * alpha;
  const fr = F.hp / F.max;
  // hero
  // smoothed render-side pose: eased facing and move amount, so turns and starts/stops blend instead of snapping
  const ek = 1 - Math.exp(-rdt * 14), em_ = 1 - Math.exp(-rdt * 9);
  let dfa = H.face - rFace; dfa -= Math.round(dfa / 6.2832) * 6.2832; rFace += dfa * ek;
  rMv += (Math.min(1.3, H.mv) - rMv) * em_;
  const sq = 1 + H.squash * 0.2, bob = Math.abs(Math.sin(H.bob)) * 0.1 * rMv;
  const SH = fx.shadow; let shn = 0; const hgy = G.groundY(hx, hz);
  wM(I.hero.m, 0, hx, hgy + bob, hz, rFace, sq * 1.15, 1.15 / sq, sq * 1.15);
  { // forward lean into the run and a gentle side sway with each step (shear of the model's up axis)
    const m = I.hero.m, c = Math.cos(rFace), s = Math.sin(rFace), ln = 0.1 * rMv + dfa * 0.0, rl = Math.sin(H.bob) * 0.03 * rMv - dfa * 0.05 * rMv, sy = m[5];
    m[4] = (ln * s + rl * c) * sy; m[6] = (ln * c - rl * s) * sy;
  }
  wM(SH.m, shn++, hx, hgy + 0.04, hz, 0, 1.25, 1, 1.25);
  const hf = H.hurtT > 0 ? 3 : (H.inv > 0 && Math.sin(t * 40) > 0 ? 1.8 : 1);
  I.hero.an[0] = H.bob; I.hero.an[1] = Math.min(1, rMv * 1.2); I.hero.an[2] = 1; I.hero.ana.needsUpdate = true;
  I.hero.t[0] = I.hero.t[1] = I.hero.t[2] = hf; I.hero.mesh.count = 1; I.hero.mesh.instanceMatrix.needsUpdate = true; I.hero.at.needsUpdate = true;
  // enemies
  const cnt = cntE; cnt.fill(0);
  for (let i = 0; i < eHi; i++) {
    if (!ealive[i]) continue;
    const ty = etype[i]; const x = epx[i] + (ex[i] - epx[i]) * alpha, z = epz[i] + (ez[i] - epz[i]) * alpha;
    const gy = G.groundY(x, z);
    if (ET[ty].boss) { renderBoss(x, z, rdt); wM(SH.m, shn++, x, gy + 0.05, z, 0, 5.5, 1, 5.5); continue; }
    const ms = ET[ty].m == null ? ty : ET[ty].m; if (cnt[ms] >= ECAP[ms]) continue;
    const o = I.en[ms], n = cnt[ms]++, ph = eph[i];
    const wob = Math.sin(ph * 9) * 0.06, fl = eflash[i] > 0;
    const y = ty === 3 ? 0.25 + Math.sin(ph * 3) * 0.2 : Math.abs(Math.sin(ph * 8)) * 0.08;
    const sc = (egold[i] ? 1.25 : 1) * escl[i], sqx = fl ? 1.18 : 1 + wob, sqy = fl ? 0.85 : 1 - wob;
    if (shn < 439) wM(SH.m, shn++, x, gy + 0.04, z, 0, ET[ty].r * 2.6 * sc, 1, ET[ty].r * 2.6 * sc);
    wM(o.m, n, x, y + gy, z, efc[i] + (ty === 3 ? Math.sin(ph * 2) * 0.2 : 0), sc * sqx, sc * sqy, sc * sqx);
    const tt = o.t, j = n * 3; o.an[j] = ph * 9; o.an[j + 1] = estun[i] > 0 ? 0 : 1; o.an[j + 2] = 1;
    if (fl) { tt[j] = tt[j + 1] = tt[j + 2] = 3.5; }
    else if (echamp[i]) { const q = 1.5 + Math.sin(ph * 5) * 0.25; tt[j] = q; tt[j + 1] = q * 0.7; tt[j + 2] = q * 0.45; }
    else if (egold[i]) { tt[j] = 2.6; tt[j + 1] = 1.9 + Math.sin(ph * 6) * 0.3; tt[j + 2] = 0.5; }
    else if (estun[i] > 0) { tt[j] = 0.5; tt[j + 1] = 1.0; tt[j + 2] = 2.2; }
    else { tt[j] = tt[j + 1] = tt[j + 2] = 1; }
  }
  SH.mesh.count = shn; SH.mesh.instanceMatrix.needsUpdate = true;
  for (let ty = 0; ty < I.en.length; ty++) { const o = I.en[ty]; o.mesh.count = cnt[ty]; o.mesh.instanceMatrix.needsUpdate = true; o.at.needsUpdate = true; o.ana.needsUpdate = true; }
  // gems
  let gn = 0, cn = 0;
  for (let k = 0; k < gHi; k++) {
    if (!galive[k]) continue;
    const kind = gkind[k];
    if (kind === 5) { wM(I.chest.m, cn, gx[k], 0.05 + G.groundY(gx[k], gz[k]), gz[k], gt[k] * 0.5, 1.5, 1.5, 1.5); const q = cn * 3; I.chest.t[q] = I.chest.t[q + 1] = I.chest.t[q + 2] = 1; cn++; continue; }
    if (kind === 6) { wM(I.chest.m, cn, gx[k], 0.05 + G.groundY(gx[k], gz[k]), gz[k], gt[k] * 0.8, 2.3, 2.3 + Math.sin(gt[k] * 3) * 0.15, 2.3); const q = cn * 3; I.chest.t[q] = 0.4; I.chest.t[q + 1] = 0.9; I.chest.t[q + 2] = 2.0; cn++; continue; }
    const s = kind === 2 ? 1.7 : kind === 1 ? 1.3 : kind === 4 ? 1.6 : kind === 3 ? 0.9 : 1, y = 0.25 + Math.sin(gt[k] * 3) * 0.1;
    wM(I.gem.m, gn, gx[k], y + G.groundY(gx[k], gz[k]), gz[k], gt[k] * 2, s, s, s); const q = gn * 3, tt = I.gem.t;
    if (kind === 3) { tt[q] = 1.4; tt[q + 1] = 1.1; tt[q + 2] = 0.25; } else if (kind === 4) { tt[q] = 1.5; tt[q + 1] = 0.6; tt[q + 2] = 0.15; } else if (kind === 2) { tt[q] = 0.6; tt[q + 1] = 0.9; tt[q + 2] = 1.7; } else if (kind === 1) { tt[q] = 0.4; tt[q + 1] = 1.1; tt[q + 2] = 1.3; } else { tt[q] = 0.3; tt[q + 1] = 1.1; tt[q + 2] = 0.4; }
    gn++;
  }
  I.gem.mesh.count = gn; I.gem.mesh.instanceMatrix.needsUpdate = true; I.gem.at.needsUpdate = true;
  I.chest.mesh.count = cn; I.chest.mesh.instanceMatrix.needsUpdate = true; I.chest.at.needsUpdate = true;
  // projectiles
  let n0 = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < MAXB; i++) {
    if (!balive[i]) continue;
    const ty = btype[i];
    if (ty === 0) { const x = bx[i] + bvx[i] * alpha * STEP, z = bz[i] + bvz[i] * alpha * STEP; wM(I.bolt.m, n0, x, 0.9, z, Math.atan2(bvx[i], bvz[i]), 1, 1, 1); const q = n0 * 3; if (bcol[i]) { I.bolt.t[q] = 0.5; I.bolt.t[q + 1] = 1.3; I.bolt.t[q + 2] = 1.6; } else { I.bolt.t[q] = 1.3; I.bolt.t[q + 1] = 0.75; I.bolt.t[q + 2] = 0.25; } n0++; }
    else if (ty === 1) { const x = bx[i] + bvx[i] * alpha * STEP, z = bz[i] + bvz[i] * alpha * STEP; wM(I.arrow.m, n1, x, 0.9, z, Math.atan2(bvx[i], bvz[i]), 1, 1, 1); const q = n1 * 3; I.arrow.t[q] = 0.6; I.arrow.t[q + 1] = 1.2; I.arrow.t[q + 2] = 0.4; n1++; }
    else { wM(I.bomb.m, n2, bx[i], 0.4 + bcb[i], bz[i], bt[i] * 6, ty === 2 ? 1 : 0.7, ty === 2 ? 1 : 0.7, ty === 2 ? 1 : 0.7); const q = n2 * 3; I.bomb.t[q] = I.bomb.t[q + 1] = I.bomb.t[q + 2] = 1; n2++; }
  }
  I.bolt.mesh.count = n0; I.bolt.mesh.instanceMatrix.needsUpdate = true; I.bolt.at.needsUpdate = true;
  I.arrow.mesh.count = n1; I.arrow.mesh.instanceMatrix.needsUpdate = true; I.arrow.at.needsUpdate = true;
  I.bomb.mesh.count = n2; I.bomb.mesh.instanceMatrix.needsUpdate = true; I.bomb.at.needsUpdate = true;
  let on = 0; if (wLv.orbit > 0 && phase !== 'attract') { for (let k = 0; k < orbN; k++) { wM(I.orb.m, k, orbX[k], 0.9, orbZ[k], 0, 1, 1, 1); const q = k * 3; I.orb.t[q] = 1.4; I.orb.t[q + 1] = 0.6 + (k % 2) * 0.4; I.orb.t[q + 2] = 0.2 + (wEvo.orbit ? 1 : 0); } on = orbN; }
  I.orb.mesh.count = on; I.orb.mesh.instanceMatrix.needsUpdate = true; I.orb.at.needsUpdate = true;
  let wn = 0; if (wLv.wisp > 0 && phase !== 'attract') { for (let k = 0; k < wispN; k++) { wM(I.wisp.m, k, WX[k], 1.0 + Math.sin(t * 4 + k) * 0.12, WZ[k], 0, 0.8, 0.8, 0.8); const q = k * 3; I.wisp.t[q] = 0.5; I.wisp.t[q + 1] = 1.3; I.wisp.t[q + 2] = 1.7; } wn = wispN; }
  I.wisp.mesh.count = wn; I.wisp.mesh.instanceMatrix.needsUpdate = true; I.wisp.at.needsUpdate = true;
  let mn = 0; for (let k = 0; k < MAXM; k++) { if (!mna[k]) continue; wM(I.mine.m, mn, mnx[k], 0.1 + G.groundY(mnx[k], mnz[k]), mnz[k], 0, 0.85, 0.45, 0.85); const q = mn * 3, arm = mnt[k] > 0.7 ? 1.1 + 0.6 * Math.sin(t * 9 + k) : 0.5; I.mine.t[q] = 0.3 * arm; I.mine.t[q + 1] = 1.3 * arm; I.mine.t[q + 2] = 1.0 * arm; mn++; }
  I.mine.mesh.count = mn; I.mine.mesh.instanceMatrix.needsUpdate = true; I.mine.at.needsUpdate = true;
  let pn = 0; for (let k = 0; k < MAXP; k++) { if (!pla[k]) continue; const pr = 1 - plt[k] / plT[k]; wM(fx.poolRing.instanceMatrix.array, pn, plx[k], 0.12 + G.groundY(plx[k], plz[k]), plz[k], 0, plr[k], 1, plr[k]); wM(fx.poolFill.instanceMatrix.array, pn, plx[k], 0.14 + G.groundY(plx[k], plz[k]), plz[k], 0, plr[k] * pr, 1, plr[k] * pr); pn++; }
  fx.poolRing.count = fx.poolFill.count = pn; fx.poolRing.instanceMatrix.needsUpdate = fx.poolFill.instanceMatrix.needsUpdate = true; fx.poolRing.material.opacity = 0.45 + 0.25 * Math.sin(t * 14);
  let sn = 0; for (let s = 0; s < MAXS; s++) { if (!salive[s]) continue; wM(I.eshot.m, sn, sx_[s], 0.9, sz_[s], Math.atan2(svx[s], svz[s]), 1, 1, 1); const q = sn * 3; I.eshot.t[q] = I.eshot.t[q + 1] = I.eshot.t[q + 2] = 1; sn++; }
  I.eshot.mesh.count = sn; I.eshot.mesh.instanceMatrix.needsUpdate = true; I.eshot.at.needsUpdate = true;
  // lightning decay
  let act = false; for (let i = 0; i < 64; i++) { if (lnT[i] > 0) { lnT[i] -= rdt; act = true; if (lnT[i] <= 0) fx.lnPos.fill(0, i * 6, i * 6 + 6); } }
  fx.lines.visible = act; fx.lines.geometry.attributes.position.needsUpdate = true;
  // ---- light, fog, fire visuals
  F.flick = 1 + 0.045 * Math.sin(t * 7.1) + 0.03 * Math.sin(t * 11.7 + 1.3) + 0.015 * Math.sin(t * 19.1);
  const fR = F.R;
  U.uFire.value.set(0, 0, fR, F.flick);
  U.uHero.value.set(hx, hz, 4.5, 1);
  const dk = 0.5 + 0.5 * fr, wb = G.world.base, dwn = dawn;
  const k1 = dk * (1 - dwn * 0.2);
  U.uAmb.value.setRGB(lerp(wb.amb[0] * k1, 0.8, dwn * 0.55), lerp(wb.amb[1] * k1, 0.6, dwn * 0.55), lerp(wb.amb[2] * k1, 0.55, dwn * 0.55));
  U.uMoon.value.setRGB(lerp(wb.moon[0] * dk, 1.0, dwn * 0.6), lerp(wb.moon[1] * dk, 0.65, dwn * 0.6), lerp(wb.moon[2] * dk, 0.5, dwn * 0.6));
  U.uFog.value.setRGB(lerp(wb.fog[0] * (0.6 + 0.4 * dk), 0.75, dwn), lerp(wb.fog[1] * (0.6 + 0.4 * dk), 0.45, dwn), lerp(wb.fog[2] * (0.6 + 0.4 * dk), 0.35, dwn));
  U.uFogD.value = 0.014 + (1 - fr) * 0.008;
  G.renderer.setClearColor(U.uFog.value);
  fx.glow.position.set(0, 1.4, 0); fx.glow.scale.setScalar(0.6 + fR * 0.16 * F.flick); fx.glow.userData.c.w = 0.2 * (0.4 + 0.6 * fr);
  fx.glow2.position.set(0, 1.0, 0); fx.glow2.scale.setScalar(0.6 + fr * 0.6); fx.glow2.userData.c.w = 0.12 * F.flick;
  fx.hglow.position.set(hx + 0.4, 0.8, hz + 0.4); fx.hglow.userData.c.w = 0.35;
  fx.glow.quaternion.copy(G.camera.quaternion); fx.glow2.quaternion.copy(G.camera.quaternion); fx.hglow.quaternion.copy(G.camera.quaternion);
  G.updateFire(t, fr);
  for (let i = 0; i < fx.lampGlow.length; i++) fx.lampGlow[i].userData.c.w = 0.5 + 0.06 * Math.sin(t * 9 + i * 3), fx.lampGlow[i].quaternion.copy(G.camera.quaternion);
  fx.ring.scale.set(fR, 1, fR); fx.ring.material.opacity = 0.07 + 0.04 * Math.sin(t * 2.2) + (1 - fr) * 0.12;
  // ---- camera
  const portrait = G.camera.aspect < 1, zoom = 1 + dangerS * 0.22 + (portrait ? 0.55 : 0);
  const tx = hx * 0.85, tz = hz * 0.85;
  const kf = 1 - Math.exp(-11 * rdt); // camera follow: ~90 ms lag (was ~170 ms)
  cam.lx += (tx - cam.lx) * kf; cam.lz += (tz - cam.lz) * kf;
  const sx = shake * shake, ox = (Math.sin(t * 61) + Math.sin(t * 37.3)) * 0.35 * sx, oz = (Math.sin(t * 53) + Math.cos(t * 41)) * 0.35 * sx;
  G.camera.position.set(cam.lx + ox, 13.2 * zoom, cam.lz + 9.8 * zoom + oz);
  G.camera.lookAt(cam.lx + ox * 0.5, 0, cam.lz - 0.8);
  G.camera.fov = 45 + fovKick + dangerS * 4 + (portrait ? 8 : 0); G.camera.updateProjectionMatrix();
  G.parts.uScale.value = (G.renderer.domElement.height * 0.5) / Math.tan(G.camera.fov * Math.PI / 360);
  // decay effects (real time)
  shake = Math.max(0, shake - rdt * 1.6); fovKick *= Math.exp(-5 * rdt); hurtFx = Math.max(0, hurtFx - rdt * 2.2); dark += (0 - dark) * Math.min(1, rdt * 0.8);
  dangerS += (danger - dangerS) * Math.min(1, rdt * 1.2);
  G.parts.update(rdt * (hitstop > 0 ? 0 : timeScale));
  U.uFlash.value = 0; U.uTime.value = t;
  // Heroes screen open: the world is hidden behind a solid backdrop, so skip drawing it and draw only the hero preview.
  if (G.previewActive()) { G.previewBackdrop(); G.previewDraw(rdt); } else G.draw();
  // HUD
  GS.hp = H.hp; GS.maxhp = ST.maxHp; GS.fire = fr; GS.fireR = fR; GS.lvl = R_.lvl; GS.xp = R_.xp; GS.need = R_.need; GS.time = R_.t; GS.coins = R_.coins; GS.wave = R_.bossSeen ? 6 : R_.wave; GS.boss = BB.on; GS.kills = R_.kills; GS.alive = nAlive; GS.moths = R_.moths; GS.dark = R_.darkT; GS.dim = R_.wardenDim; GS.champ = CH.i >= 0 && ealive[CH.i] && !BB.on ? ehp[CH.i] / emx[CH.i] : -1; GS.streakF = R_.streak >= 3 ? Math.max(0, R_.streakT / 2.4) : 0; GS.tier = R_.tier; GS.ls = !retOn('lastStand') ? 0 : LS.t > 0 ? 2 : LS.used ? 0 : 1; GS.lsK = LS.t > 0 ? R_.kills - LS.k0 : 0; GS.lsT = LS.t;
  if (phase === 'run' || phase === 'pre' || phase === 'levelup' || phase === 'win' || phase === 'lose' || phase === 'paused') { UI.updateHud(GS); if (phase === 'run') updateQuestHud(rdt); }
  const lowFx = juiceFrame(rdt);
  UI.setFx(Math.min(1, (1 - fr) * 0.75 + dark * 0.3), Math.max(hurtFx, lowFx) * (save.set.flash ? 0.5 : 1), dawn, fr);
  UI.updateDn(G.camera, rdt);
  A.mood.fire += (fr - A.mood.fire) * Math.min(1, rdt * 2); A.mood.danger += (danger - A.mood.danger) * Math.min(1, rdt); A.mood.boss = BB.on ? 1 : 0;
  A.mood.low = (fr < 0.3 || H.hp / ST.maxHp < 0.3) && phase === 'run' ? 1 - Math.min(fr, H.hp / ST.maxHp) / 0.3 : 0;
}
const lerp = (a, b, t) => a + (b - a) * t;
function renderBoss(x, z, rdt) {
  const m = I.boss, i = BB.i, t = performance.now() * 0.001;
  const bob = Math.sin(t * 3) * 0.05, f = eflash[i] > 0;
  const ks = 1;
  wM(m.m, 0, x, bob + G.groundY(x, z), z, BB.face, ks, ks, ks); m.mesh.count = 1; m.mesh.instanceMatrix.needsUpdate = true;
  if (f) { m.t[0] = m.t[1] = m.t[2] = 3; } else if (BB.inv > 0) { m.t[0] = 1.5; m.t[1] = 1.3; m.t[2] = 1.6; } else if (BB.state === 2 || BB.state === 4 || BB.state === 6 || BB.state === 8) { const q = 1.2 + Math.sin(t * 30) * 0.4; m.t[0] = q; m.t[1] = 0.8; m.t[2] = 0.8; } else m.t[0] = m.t[1] = m.t[2] = 1;
  m.an[0] = t * 5; m.an[1] = BB.state === 1 || BB.state === 3 ? 1 : 0.1; m.an[2] = 1; m.ana.needsUpdate = true; m.at.needsUpdate = true;
}

/* ---------------- frame loop ---------------- */
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  // adaptive quality
  if (phase === 'run' && save.set.qual) { if (Q.level < 2) G.setQuality(2); }
  else if (phase === 'run') {
    settle -= rdt; fpsAcc += rdt; fpsN++;
    if (fpsAcc > 1.6) { const fps = fpsN / fpsAcc; GS.fps = fps; if (settle <= 0 && fps < 46 && Q.level < 3) { G.setQuality(Q.level + 1); settle = 3; fpsOk = 0; }
      else if (fps >= 56 && Q.level > 0 && Q.level > G.minQuality) { if (++fpsOk >= 5 && settle <= 0) { G.setQuality(Q.level - 1); settle = 6; fpsOk = 0; } } else if (fps < 56) fpsOk = 0;
      fpsAcc = 0; fpsN = 0; }
  }
  if (phase === 'attract') {
    acc += rdt; while (acc >= STEP) { acc -= STEP; attractStep(STEP); }
    render(rdt, 1); return;
  }
  if (phase === 'paused' || phase === 'levelup' || phase === 'results' || phase === 'boot') {
    render(rdt * (phase === 'results' ? 1 : 0.4), 1); return;
  }
  if (phase === 'pre') { preT -= rdt; if (preT <= 0) { openCards(); render(rdt, 1); return; } }
  if (slowT > 0) { slowT -= rdt; timeScale = slowT > 0 ? slowTo : 1; } else if (phase !== 'pre' && phase !== 'win') timeScale = phase === 'lose' ? 0.5 : 1;
  if (phase === 'win') timeScale = endT > 1.6 * finale ? 0.35 : 1;
  if (hitstop > 0) { hitstop -= rdt; render(rdt, acc / STEP); return; }
  acc += rdt * timeScale;
  let n = 0;
  while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; }
  if (n >= 5) acc = 0;
  if (phase === 'run') checkLevel();
  render(rdt, acc / STEP);
}
function attractStep(dt) {
  T += dt; H.px = H.x; H.pz = H.z;
  if (Math.random() < 0.4) pe((Math.random() - 0.5) * 0.8, 1.1, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.5, 3 + Math.random() * 3, (Math.random() - 0.5) * 1.5, 1.1, 0.35, 1, 0.55, 0.15, -2, 0.3, 0);
  if (Math.random() < 0.05) { const a = Math.random() * TAU, r = Math.random() * 14; const c = G.world.a.fly; pe(Math.cos(a) * r, 0.5 + Math.random() * 2, Math.sin(a) * r, 0, 0.2, 0, 5, 0.28, c[0], c[1], c[2], 0, 0.4, 0); }
  F.R += (ST.fireRad - F.R) * 0.1; F.hp = F.max;
  H.face = Math.sin(T * 0.4) * 0.5;
}
// Boot values for attract mode.
ST.fireRad = 9.5; F.R = 9.5; F.hp = 100; F.max = 100;
export function previewArea() { if (G.world && G.world.key !== save.area) G.buildWorld(save.area); }
export function previewHero() { if (phase === 'attract' || phase === 'results') { hero = HEROES[save.hero]; rebuildHero(); } }
export function getPhase() { return phase; }
// Dev-only (reached through window.__eg in dev builds): spawn n enemies of a type in a ring around the hero, for visual checks.
export function _debugSpawn(type, n, r) { for (let k = 0; k < n; k++) { const a = k / n * TAU; allocEnemy(type, H.x + Math.cos(a) * r, H.z + Math.sin(a) * r); } }
export function _debugEnd(win, secs, kills) { if (phase !== 'run') return; R_.t = secs || R_.t; R_.kills = kills || R_.kills; if (win) { R_.bossSeen = true; } endRun(!!win, 'hero'); }
export function _debugGive(id, lv, evo) { if (!wOwned.includes(id)) addWeapon(id); wLv[id] = lv || 1; wEvo[id] = !!evo; recalc(); UI.slots(slotData()); }
export function _debugSpawnAt(type, n, r) { for (let k = 0; k < n; k++) { const a = k / n * TAU; allocEnemy(type, H.x + Math.cos(a) * r, H.z + Math.sin(a) * r); } }
// Dev-only headless simulation for balance checks: runs the fixed-step sim without rendering, with a simple kiting bot.
export function _debugSim(maxSecs, o) {
  o = o || {};
  SIM = true;
  if (o.runIdx != null) { const k = save.runs; save.runs = o.runIdx; startRun(o.perk || null); save.runs = k; } else if (phase !== 'run') startRun(o.perk || null);
  if (o.skipTo) { /* jump the clock so late-game content can be sampled */ R_.t = o.skipTo; }
  const uiMv = UI.mv, log = { t: 0, lvl: 1, kills: 0, minHp: 1, minFire: 1, why: null, win: false, levelUps: [], firstLevel: 0, hits: 0, stepMs: 0, maxStep: 0, slow: 0, steps: 0 };
  let n = 0;
  while (n < maxSecs * 60) {
    n++;
    if (phase === 'pre') { const cards = R_.shrineMode ? genShrineCards() : genCards(R_.chestMode); log.levelUps.push(Math.round(R_.t)); pickCard((Math.random() * cards.length) | 0, cards); }
    if (phase === 'lose' || phase === 'win' || phase === 'results') break;
    // bot: hug the fire, step away from the nearest foe, keep the pull towards the light
    let best = -1, bd = 1e9; for (let i = 0; i < eHi; i++) if (ealive[i]) { const dx = ex[i] - H.x, dz = ez[i] - H.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    let mx = -H.x * 0.25, mz = -H.z * 0.25;
    if (best >= 0 && bd < 16) { const d = Math.sqrt(bd) || 1; mx += -(ex[best] - H.x) / d * 1.4; mz += -(ez[best] - H.z) / d * 1.4; }
    const ml = Math.hypot(mx, mz) || 1; uiMv.x = mx / ml * Math.min(1, ml); uiMv.z = mz / ml * Math.min(1, ml);
    const t0 = performance.now(); step(STEP); const st = performance.now() - t0; log.stepMs += st; if (st > log.maxStep) log.maxStep = st; if (st > 8) log.slow++;
    if (phase === 'run') checkLevel();
    log.minHp = Math.min(log.minHp, H.hp / ST.maxHp); log.minFire = Math.min(log.minFire, F.hp / F.max);
  }
  uiMv.x = uiMv.z = 0;
  log.steps = n; log.avgStep = Math.round(log.stepMs / n * 1000) / 1000; log.maxStep = Math.round(log.maxStep * 100) / 100; log.t = Math.round(R_.t); log.lvl = R_.lvl; log.kills = R_.kills; log.why = R_.why || null; log.win = phase === 'win'; log.hits = R_.hitsTaken; log.phase = phase; log.alive = nAlive; log.firstLevel = log.levelUps[0] || 0;
  log.T = DC.on ? Math.round(DC.T) : 0; log.iv = Object.assign({}, RUN.ivN); log.ls = LS.used ? (LS.held ? 2 : 1) : 0; log.jp = RUN.jackpot; log.loan = RUN.loanHad;
  log.earn = R_.coins + Math.floor(R_.kills * 0.5) + Math.floor(R_.t * 0.8); log.bossHp = R_.bossSeen ? Math.round(GS.bossHp * 100) : null; log.nudge = Math.round(RUN.nudgeMax * 100); log.champs = R_.champs | 0; log.chests = R_.chests; log.assist = Math.round(DC.assist);
  SIM = false;
  return log;
}
export function _debugStart(ri, perk) { const k = save.runs; save.runs = ri; startRun(perk || null); save.runs = k; }
export function _debugHurt(d) { hurtHero(d, 0, 0); }
export function _debugCards(jackpot) { const k = RUN.jackpot; RUN.jackpot = !!jackpot; const r = { odds: oddsOf(false), cards: genCards(false).map((c) => c.rname + ' ' + c.title) }; RUN.jackpot = k; return r; }
export function _debugLevel() { R_.pending++; }
export function _debugChest() { chestCharge(H.x + 0.6, H.z); }
export function _debugHp(f) { H.hp = ST.maxHp * f; }
export function _debugBossHp(f) { if (BB.on && BB.i >= 0) ehp[BB.i] = emx[BB.i] * f; }
// Dev-only frame benchmark: sim step + render + forced GPU sync + forced DOM layout, timed separately per frame.
export function _debugBench(frames) {
  const gl = G.renderer.getContext(), px = new Uint8Array(4), uiMv = UI.mv, T_ = { sim: [], rend: [], gpu: [], lay: [] };
  for (let f = 0; f < frames; f++) {
    if (phase === 'pre') { const cards = R_.shrineMode ? genShrineCards() : genCards(R_.chestMode); pickCard(0, cards); }
    if (phase !== 'run') break;
    let best = -1, bd = 1e9; for (let i = 0; i < eHi; i++) if (ealive[i]) { const dx = ex[i] - H.x, dz = ez[i] - H.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    let mx = -H.x * 0.25, mz = -H.z * 0.25; if (best >= 0 && bd < 16) { const d = Math.sqrt(bd) || 1; mx += -(ex[best] - H.x) / d * 1.4; mz += -(ez[best] - H.z) / d * 1.4; }
    const ml = Math.hypot(mx, mz) || 1; uiMv.x = mx / ml * Math.min(1, ml); uiMv.z = mz / ml * Math.min(1, ml);
    const t0 = performance.now(); step(STEP); if (phase === 'run') checkLevel();
    const t1 = performance.now(); render(STEP, 1);
    const t2 = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t3 = performance.now(); void document.body.offsetHeight; void getComputedStyle(document.getElementById('dns')).opacity;
    const t4 = performance.now();
    T_.sim.push(t1 - t0); T_.rend.push(t2 - t1); T_.gpu.push(t3 - t2); T_.lay.push(t4 - t3);
  }
  uiMv.x = uiMv.z = 0;
  const st = (a) => { const b = a.slice().sort((x, y) => x - y), r = (v) => Math.round(v * 100) / 100; return { avg: r(a.reduce((x, y) => x + y, 0) / (a.length || 1)), p95: r(b[Math.floor(b.length * 0.95)] || 0), max: r(b[b.length - 1] || 0) }; };
  const tot = T_.sim.map((v, i) => v + T_.rend[i] + T_.gpu[i] + T_.lay[i]);
  return { frames: T_.sim.length, sim: st(T_.sim), render: st(T_.rend), gpu: st(T_.gpu), layout: st(T_.lay), total: st(tot), over16: tot.filter((v) => v > 16.7).length, parts: G.parts.hi, alive: nAlive };
}
// Dev-only game-feel probe: replays frame() logic at a fixed 60 Hz display rate (no rendering) and counts real-time frames
// the sim is frozen (hitstop), slowed (timeScale < 1) or paused for a level-up, plus what triggered each hitstop.
export function _debugFeel(secs, auto = true) {
  const uiMv = UI.mv, out = { frames: 0, frozen: 0, slowed: 0, pre: 0, cards: 0, stops: 0, stopSrc: {} };
  const st0 = stop; let src = '';
  FEEL.on = true; FEEL.log = out.stopSrc; FEEL.n = 0;
  for (let f = 0; f < secs * 60; f++) {
    const rdt = 1 / 60; out.frames++;
    if (phase === 'levelup') { out.cards++; if (auto) { const cards = R_.shrineMode ? genShrineCards() : genCards(R_.chestMode); UI.closeModal(); pickCard(0, cards); } continue; }
    if (phase !== 'run' && phase !== 'pre') break;
    let best = -1, bd = 1e9; for (let i = 0; i < eHi; i++) if (ealive[i]) { const dx = ex[i] - H.x, dz = ez[i] - H.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    let mx = -H.x * 0.25, mz = -H.z * 0.25; if (best >= 0 && bd < 16) { const d = Math.sqrt(bd) || 1; mx += -(ex[best] - H.x) / d * 1.4; mz += -(ez[best] - H.z) / d * 1.4; }
    const ml = Math.hypot(mx, mz) || 1; uiMv.x = mx / ml * Math.min(1, ml); uiMv.z = mz / ml * Math.min(1, ml);
    if (phase === 'pre') { out.pre++; preT -= rdt; if (preT <= 0) openCards(); continue; }
    if (slowT > 0) { slowT -= rdt; timeScale = slowT > 0 ? slowTo : 1; } else timeScale = 1;
    if (hitstop > 0) { hitstop -= rdt; out.frozen++; continue; }
    if (timeScale < 1) out.slowed++;
    acc += rdt * timeScale; let n = 0; while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; }
    if (phase === 'run') checkLevel();
  }
  FEEL.on = false; uiMv.x = uiMv.z = 0; out.stops = FEEL.n;
  out.frozenPct = Math.round(out.frozen / out.frames * 1000) / 10; out.slowPct = Math.round(out.slowed / out.frames * 1000) / 10; out.levelPausePct = Math.round((out.pre + out.cards) / out.frames * 1000) / 10;
  return out;
}
export function _debugBoss(x, z) { startBoss(); if (BB.i >= 0) { ex[BB.i] = epx[BB.i] = x; ez[BB.i] = epz[BB.i] = z; } }
export function resultsToIdle() { phase = 'attract'; }
// Leave a run (or the results screen) for the hub. Quitting mid-run awards nothing; results already persisted their rewards.
// Hub pose: the hero stands beside the fire, in the gap between the hub's top bar and its cards.
function attractPose() { H.x = -2.3; H.z = -0.6; H.px = H.x; H.pz = H.z; H.vx = H.vz = 0; }
function clearRun() { pla.fill(0); fx.lpulse.material.opacity = 0; resetEnemies(); balive.fill(0); salive.fill(0); galive.fill(0); gHi = 0; NV.on = false; orbN = 0; BB.on = false; BB.i = -1; if (I) I.boss.mesh.visible = false; fx.teleLine.visible = fx.teleRing.visible = fx.teleFill.visible = false; G.parts.clear(); UI.bossBar(false); UI.champBar(false); JC.t = 0; A.setMuffle(0); }
export function quitToHub() {
  if (phase !== 'paused') return;
  A.resume(); P.gameplayStop(); UI.closeModal(); UI.endHud(); clearRun();
  attractPose(); phase = 'attract'; timeScale = 1; dawn = 0; hurtFx = 0; UI.setupAttract();
}
export function toHub() { clearRun(); attractPose(); phase = 'attract'; timeScale = 1; dawn = 0; hurtFx = 0; UI.setupAttract(); }
export function setPact(id) { save.pact = id || null; persist(); }
export function setCosmetic(hero_, id) { if (id) save.cos[hero_] = id; else delete save.cos[hero_]; persist(); }
