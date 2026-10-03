// DOM UI: HUD, modals, input (keyboard + virtual joystick), damage numbers. CSS transforms/opacity only.
import * as THREE from 'three';
import * as A from './audio.js';
import { icon } from './data.js';

let GM = null; // game API injected by main (avoids a circular import)
export function bind(g) { GM = g; }
export const mv = { x: 0, z: 0 };
export const startEl = () => $('start');
export const setAtStart = (v) => { atStart = v; };
const $ = (id) => document.getElementById(id);
const el = {};
let hudOn = false, joy = null, lastBanner = 0;
const keys = {};
let levelCards = null, levelCb = null, levelAt = 0, modalOpen = false, atStart = false;
let W = innerWidth, Hh = innerHeight;

export const isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
export const fmt = (s) => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

export function init() {
  for (const id of ['hud', 'xpfill', 'xpbar', 'xptxt', 'lvl', 'hpfill', 'hpghost', 'hpbar', 'hptxt', 'hpIc', 'firefill', 'firetxt', 'firebox', 'fireIc', 'lightR', 'timer', 'wave', 'pace', 'coinN', 'killN', 'killIc', 'streak', 'stN', 'stT', 'bossbar', 'bossfill', 'bossName', 'bossPh', 'slots', 'evohint', 'dmgdir', 'hint', 'banner', 'dns', 'joy', 'start', 'modal', 'modalBody', 'fxDark', 'fxHurt', 'fxDawn', 'fxFlash', 'confetti', 'btnPause', 'lsb', 'qhud', 'stBar', 'comboEnd'])
    el[id] = $(id);
  el.fire = el.firefill.parentElement;
  el.fireIc.innerHTML = icon('flame', '#ffb347'); el.hpIc.innerHTML = icon('heart', '#ffd0d6'); el.killIc.innerHTML = icon('skull', '#dfe4ff');
  window.addEventListener('resize', () => { W = innerWidth; Hh = innerHeight; });
  // dmg numbers pool
  for (let i = 0; i < 40; i++) { const d = document.createElement('div'); d.className = 'dn'; el.dns.appendChild(d); dn.push({ d, on: false, x: 0, y: 0, z: 0, t: 0, life: 0, crit: false, dx: 0 }); }
  el.btnPause.addEventListener('click', () => { A.sfx('click'); GM.pause(true); });
  document.body.classList.toggle('rf', !!GM.save().set.flash);
  bindInput();
}

/* ---------------- input ---------------- */
function updateMv() {
  if (joy) return;
  mv.x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0); mv.z = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const l = Math.hypot(mv.x, mv.z); if (l > 1) { mv.x /= l; mv.z /= l; }
}
const KMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
function bindInput() {
  addEventListener('keydown', (e) => {
    const k = KMAP[e.code];
    if (k) { keys[k] = true; updateMv(); if (hudOn) e.preventDefault(); }
    if (e.repeat) return;
    if (levelCards && perkMode && (e.code === 'Space' || e.code === 'Enter')) { choose(0); e.preventDefault(); return; }
    if (levelCards && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Numpad1' || e.code === 'Numpad2' || e.code === 'Numpad3')) { choose(+e.code.slice(-1) - 1); e.preventDefault(); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (modalOpen && !levelCards && GM.phase() !== 'results') { closeModal(); if (GM.phase() === 'paused') GM.pause(false); } else if (hudOn && !levelCards) GM.pause(GM.phase() === 'run'); e.preventDefault(); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && atStart && !modalOpen) { GM.startRun(); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { const k = KMAP[e.code]; if (k) { keys[k] = false; updateMv(); } });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; updateMv(); });
  const app = $('app');
  app.addEventListener('pointerdown', (e) => {
    if (!hudOn || joy || modalOpen || e.target.closest('button')) return;
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    el.joy.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; el.joy.classList.add('on'); el.joy.firstChild.firstChild.style.transform = 'translate(0,0)';
    try { app.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
  });
  app.addEventListener('pointermove', (e) => {
    if (!joy || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy), max = 52;
    if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    el.joy.firstChild.firstChild.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.hypot(dx, dy) / max; if (m < 0.15) { mv.x = mv.z = 0; } else { mv.x = dx / max; mv.z = dy / max; }
  });
  const up = (e) => { if (!joy || e.pointerId !== joy.id) return; joy = null; el.joy.classList.remove('on'); mv.x = mv.z = 0; updateMv(); };
  app.addEventListener('pointerup', up); app.addEventListener('pointercancel', up);
  addEventListener('contextmenu', (e) => e.preventDefault());
}

/* ---------------- HUD ---------------- */
// Restart a CSS class animation without the "remove class, read offsetWidth, add class" trick: that read forces a full
// synchronous layout, and when it ran once per kill a single Ember Nova ring could force dozens of layouts in one step.
function restart(node, cls) {
  if (node.classList.contains(cls)) { const an = node.getAnimations(); if (an.length) { for (const a of an) { a.currentTime = 0; a.play(); } return; } node.classList.remove(cls); requestAnimationFrame(() => node.classList.add(cls)); return; }
  node.classList.add(cls);
}
// Per-kill / per-coin HUD updates are only recorded here and applied once per frame in updateHud().
const pend = { streak: -1, coin: false };
const last = {};
const setT = (k, node, v) => { if (last[k] !== v) { last[k] = v; node.textContent = v; } };
export function startHud(hero, save, runIdx) {
  atStart = false; el.start.classList.add('off'); closeModal(true);
  el.hud.classList.remove('off'); hudOn = true; mv.x = mv.z = 0;
  el.bossbar.classList.add('off'); el.streak.classList.remove('on'); el.pace.textContent = ''; last.pace = ''; el.hint.classList.remove('on');
  for (const k in last) delete last[k];
  pend.streak = -1; pend.coin = false;
  el.fxFlash.style.opacity = 0;
}
export function endHud() { hudOn = false; el.hud.classList.add('off'); mv.x = mv.z = 0; joy = null; el.joy.classList.remove('on'); }
export function updateHud(g) {
  const hpS = Math.max(0, g.hp / g.maxhp);
  if (last.hp !== hpS) {
    el.hpghost.style.transition = last.hp != null && hpS < last.hp ? '' : 'none';
    last.hp = hpS; el.hpfill.style.transform = el.hpghost.style.transform = `scaleX(${hpS})`;
    el.hpbar.classList.toggle('low', hpS < 0.3 && hpS > 0);
  }
  setT('hpt', el.hptxt, Math.ceil(g.hp) + ' / ' + g.maxhp);
  const fs = Math.max(0, g.fire);
  if (last.f !== fs) { last.f = fs; el.firefill.style.transform = `scaleX(${fs})`; const lo = fs < 0.3; el.fire.classList.toggle('low', lo); el.firebox.classList.toggle('low', lo); }
  setT('ft', el.firetxt, 'FIRE ' + Math.round(fs * 100) + '%');
  setT('lr', el.lightR, 'LIGHT ' + (Math.round(g.fireR * 2) / 2).toFixed(1) + ' m' + (g.moths ? ' · ' + g.moths + ' MOTH' + (g.moths > 1 ? 'S' : '') + ' DIMMING' : '') + (g.dim > 0 ? ' · FADING' : '') + (g.dark > 0 ? ' · BARGAIN ' + Math.ceil(g.dark) + 's' : '') + (g.pulse > 0.04 ? ' · PULSE ' + Math.round(g.pulse * 100) + '%' : ''));
  if (last.lvl !== g.lvl) { last.lvl = g.lvl; el.lvl.textContent = g.lvl; restart(el.lvl, 'pop'); }
  if (pend.streak >= 0) { applyStreak(pend.streak); pend.streak = -1; }
  const sf = Math.round((g.streakF || 0) * 40) / 40; if (last.sf !== sf) { last.sf = sf; el.stBar.firstChild.style.transform = `scaleX(${sf})`; }
  if (last.tier !== g.tier) { last.tier = g.tier; el.streak.dataset.t = g.tier || 0; }
  if (g.champ >= 0 && !g.boss) { const c = Math.round(g.champ * 200) / 200; if (last.ch !== c) { last.ch = c; el.bossfill.style.transform = `scaleX(${c})`; } }
  if (pend.coin) { pend.coin = false; restart(el.coinN, 'pop'); }
  const xs = Math.min(1, g.xp / g.need); if (last.xp !== xs) { last.xp = xs; el.xpfill.style.transform = `scaleX(${xs})`; el.xpbar.classList.toggle('ready', xs >= 0.9); }
  setT('xt', el.xptxt, Math.floor(g.xp) + ' / ' + g.need + ' XP');
  setT('kn', el.killN, g.kills);
  for (let i = 0; i < cdN.length; i++) { const c = Math.round(g.wcd[i] * 20) / 20; if (cdV[i] !== c) { cdV[i] = c; cdN[i].style.transform = `scaleY(${c})`; } }
  setT('tm', el.timer, fmt(g.time));
  setT('wv', el.wave, g.boss ? 'BOSS FIGHT' : g.champ >= 0 ? 'CHAMPION' : g.wave > 5 ? 'THE BOSS APPROACHES' : 'WAVE ' + g.wave + '/5');
  if (last.c !== g.coins) { last.c = g.coins; el.coinN.textContent = g.coins; }
  if (g.boss) { const b = Math.max(0, g.bossHp); if (last.b !== b) { last.b = b; el.bossfill.style.transform = `scaleX(${b})`; } setT('bp', el.bossPh, 'PHASE ' + g.bossPhase + ' / 3'); }
  // Last Stand badge: ready (once per run) / active with the kill count / hidden once spent
  const lsk = g.ls === 2 ? 'a' + g.lsK + '|' + Math.ceil(g.lsT) : g.ls === 1 ? 'r' : '';
  if (last.ls !== lsk) {
    last.ls = lsk; el.lsb.classList.toggle('off', !lsk); el.lsb.classList.toggle('act', g.ls === 2);
    if (lsk) el.lsb.innerHTML = icon('shield', g.ls === 2 ? '#ffd24a' : '#9fd0ff') + (g.ls === 2 ? 'LAST STAND ' + Math.min(g.lsK, 12) + ' / 12 kills · ' + Math.ceil(g.lsT) + 's' : 'LAST STAND READY');
  }
  if (last.pace !== g.pace) { last.pace = g.pace; el.pace.textContent = g.pace ? (g.paceUp ? '▲ ' : '▼ ') + g.pace : ''; el.pace.className = g.paceUp ? 'up' : 'dn'; }
}
// Closest unfinished session task, top right under the coin pill. `q` is null when all are done.
export function questHud(q) {
  const k = q ? q.text + q.v : '';
  if (last.qh === k) return; last.qh = k;
  el.qhud.classList.toggle('off', !q);
  if (q) el.qhud.innerHTML = `<span class="qi">${icon(q.icon, '#ffd24a')}</span><span class="qt"><small>TASK</small>${esc(q.text)}</span><b>${q.v}/${q.n}</b>`;
}
export function setFx(dark, hurt, dawn) {
  const f = (k, node, v) => { v = Math.round(v * 50) / 50; if (last[k] !== v) { last[k] = v; node.style.opacity = v; } };
  f('fd', el.fxDark, dark); f('fh', el.fxHurt, hurt); f('fw', el.fxDawn, dawn);
}
export function flash(kind) {
  const f = GM.save().set.flash; el.fxFlash.getAnimations().forEach((a) => a.cancel());
  el.fxFlash.animate([{ opacity: f ? 0.15 : 0.5 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
}
export function banner(text, cls) {
  const now = performance.now(); if (now - lastBanner < 350 && cls === 'b-info') return; lastBanner = now;
  const b = el.banner; b.textContent = text; b.className = 'show ' + (cls || ''); restart(b, 'show');
}
let hintT = 0;
export function hint(text, ms) { el.hint.textContent = text; el.hint.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => el.hint.classList.remove('on'), ms || 3000); }
export function streak(n) { pend.streak = n; } // called per kill: applied once per frame
function applyStreak(n) {
  if (n <= 0) { el.streak.classList.remove('on', 'tier'); last.sn = 0; return; }
  if (n < 3) { el.streak.classList.remove('on'); return; }
  el.streak.classList.add('on'); if (last.sn !== n) { last.sn = n; el.stN.textContent = 'x' + n; restart(el.stN, 'pop'); }
}
export function streakTier(name, n) {
  el.stT.textContent = name; restart(el.streak, 'tier');
  banner(name + '!', 'b-gold'); clearTimeout(streakTier.t); streakTier.t = setTimeout(() => { el.stT.textContent = ''; }, 2200);
}
export function coinPop() { pend.coin = true; } // applied once per frame
// Champion (mini-boss) bar: same slot as the boss bar, smaller and labelled; the boss bar wins if both are up.
export function champBar(on, name, sub) {
  el.bossbar.classList.toggle('mini', !!on);
  if (on) { el.bossbar.classList.remove('off'); el.bossName.textContent = name; el.bossPh.textContent = sub || 'CHAMPION'; last.bp = null; el.bossfill.style.transform = 'scaleX(1)'; last.ch = 1; }
  else if (!GM.phase || el.bossbar.classList.contains('mini') || true) { if (!last.bossOn) el.bossbar.classList.add('off'); el.bossbar.classList.remove('mini'); }
}
// The combo ended: its size floats up once on the right side.
export function comboEnd(n) {
  const c = el.comboEnd; c.textContent = 'COMBO ' + n; c.classList.remove('show'); requestAnimationFrame(() => c.classList.add('show'));
}
export function bossBar(on, name) {
  last.bossOn = !!on; if (on) el.bossbar.classList.remove('mini'); el.bossbar.classList.toggle('off', !on); if (on) { if (name) el.bossName.textContent = name; el.bossfill.style.transform = 'scaleX(1)'; last.b = 1; } }
// Direction the hit came from, as a unit vector in world XZ (camera looks along -z, so screen-right = +x, screen-down = +z).
export function hurtDir(sx, sz) {
  const d = el.dmgdir; d.style.transform = `rotate(${Math.atan2(sx, -sz)}rad)`;
  restart(d, 'show'); restart(el.hpbar, 'hit');
}
const cdN = [], cdV = [];
export function slots(d) {
  cdN.length = 0; cdV.length = 0;
  let h = '<div class="srow">';
  for (let i = 0; i < 4; i++) {
    const w = d.w[i];
    if (!w) { h += `<div class="slot empty" aria-label="Empty weapon slot"><span class="n">${i + 1}</span></div>`; continue; }
    const pips = w.evo ? '' : `<span class="pips">${'<i class="f"></i>'.repeat(w.lv)}${'<i></i>'.repeat(5 - w.lv)}</span>`;
    h += `<div class="slot ${w.evo ? 'evo' : ''} ${w.ready ? 'evoready' : ''} ${w.loan ? 'loan' : ''}" title="${esc(w.name)}${w.loan ? ' (borrowed)' : ''}">${icon(w.icon, w.col)}<u class="cd"></u><span class="lv">${w.evo ? 'EVO' : w.ready ? 'READY' : w.lv}</span><span class="n">${i + 1}</span>${w.loan ? '<span class="lt">LOAN</span>' : pips}</div>`;
  }
  h += '</div>';
  if (d.p.length) { h += '<div class="srow ps">'; for (const p of d.p) h += `<div class="slot" title="${esc(p.name)}">${icon(p.icon, p.col)}<span class="lv">${p.lv}</span></div>`; h += '</div>'; }
  el.slots.innerHTML = h;
  el.slots.querySelectorAll('.cd').forEach((n) => { cdN.push(n); cdV.push(-1); });
  if (d.hint) { el.evohint.innerHTML = icon(d.hint.icon, d.hint.col) + esc(d.hint.text); el.evohint.classList.add('on'); } else el.evohint.classList.remove('on');
}
// The loaned weapon is taken back: the slot's icon is lifted off the HUD, cracks and drains away with a "-NAME" tag.
export function reclaim(idx, W) {
  const src = el.slots.querySelectorAll('.srow:first-child .slot')[idx]; if (!src) return;
  const r = src.getBoundingClientRect(), g = document.createElement('div');
  g.className = 'reclaim'; g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
  g.innerHTML = `<div class="slot loan">${icon(W.icon, W.col)}</div><b>-${esc(W.name.toUpperCase())}</b>`;
  document.body.appendChild(g); setTimeout(() => g.remove(), 1900);
}
export function confetti(n) {
  if (GM.save().set.flash) n = Math.ceil(n * 0.4);
  const cols = ['#ffd24a', '#ff6a3a', '#4fc3ff', '#b06bff', '#6bd96b', '#ff5d7a'], c = el.confetti;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'); s.className = 'cf'; s.style.left = (30 + Math.random() * 40) + '%'; s.style.background = cols[i % cols.length];
    s.style.setProperty('--dx', (Math.random() - 0.5) * W * 0.9 + 'px'); s.style.setProperty('--dy', (Math.random() * 0.5 + 0.2) * Hh + 'px'); s.style.setProperty('--rt', (Math.random() - 0.5) * 900 + 'deg');
    s.style.animationDelay = Math.random() * 0.25 + 's'; c.appendChild(s); setTimeout(() => s.remove(), 2100);
  }
}

/* ---------------- damage numbers ---------------- */
const dn = []; const _v = new THREE.Vector3();
export function dmgNum(x, y, z, v, crit) {
  for (let i = 0; i < dn.length; i++) {
    const n = dn[i]; if (n.on) continue;
    n.on = true; n.x = x; n.y = y; n.z = z; n.t = 0; n.life = crit ? 0.8 : 0.55; n.crit = crit; n.dx = (Math.random() - 0.5) * 30;
    n.d.textContent = Math.round(v); n.d.className = 'dn' + (crit ? ' c' : ''); n.d.style.display = 'block'; return;
  }
}
export function updateDn(cam, dt) {
  for (let i = 0; i < dn.length; i++) {
    const n = dn[i]; if (!n.on) continue;
    n.t += dt; if (n.t >= n.life) { n.on = false; n.d.style.display = 'none'; continue; }
    const f = n.t / n.life; _v.set(n.x, n.y, n.z).project(cam);
    const px = (_v.x * 0.5 + 0.5) * W + n.dx * f, py = (-_v.y * 0.5 + 0.5) * Hh - f * 46;
    const s = n.crit ? 1.25 - 0.25 * f + (f < 0.15 ? f * 3 : 0) : 1 - 0.2 * f;
    n.d.style.transform = `translate3d(${px}px,${py}px,0) translate(-50%,-50%) scale(${s})`; n.d.style.opacity = f > 0.6 ? 1 - (f - 0.6) / 0.4 : 1;
  }
}

/* ---------------- modals ---------------- */
export function openModal(html) { el.modal.classList.remove('off'); el.modalBody.innerHTML = html; modalOpen = true; }
let closeHook = null;
export const setCloseHook = (f) => { closeHook = f; };
export function closeModal(silent) { if (closeHook) closeHook(); el.modal.classList.add('off'); el.modalBody.innerHTML = ''; modalOpen = false; levelCards = null; }
export const on = (sel, fn) => { const n = el.modalBody.querySelector(sel); if (n) n.addEventListener('click', (e) => { e.stopPropagation(); fn(e); }); };
export const onAll = (sel, fn) => el.modalBody.querySelectorAll(sel).forEach((n) => n.addEventListener('click', (e) => { e.stopPropagation(); fn(n, e); }));

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* level-up */
export function showLevelUp(cards, odds, title, cb) {
  levelCards = cards; levelCb = cb; levelAt = performance.now();
  let h = `<div class="lu"><h1>${title}</h1><div class="cards">`;
  cards.forEach((c, i) => {
    h += `<button class="card ${c.rcls}" data-i="${i}" style="color:var(--c)">${c.tag ? `<span class="tag">${c.tag}</span>` : ''}<span class="key">${i + 1}</span><div class="ico" style="color:${c.col}">${icon(c.icon, c.col)}</div><h3 style="color:#fff">${esc(c.title)}</h3><p>${esc(c.sub)}</p><div class="stat">${esc(c.stat || '')}${c.evoHint ? `<div class="evoh">${esc(c.evoHint)}</div>` : ''}</div><span class="rar">${c.rname}</span></button>`;
  });
  h += `</div><div class="odds"><span>${odds ? `Odds: Common ${odds.c}% · Rare ${odds.r}% · Legendary ${odds.l}%` : 'A wayside shrine. Choose one.'}</span>${isTouch() ? '' : '<span class="keys"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> to pick</span>'}</div></div>`;
  openModal(h); levelCards = cards;
  onAll('.card', (n) => choose(+n.dataset.i));
  if (!GM.save().hints.pick) hint('Pick an upgrade (tap a card or press 1-3)', 4000);
}
function choose(i) {
  if (!levelCards || performance.now() - levelAt < 140) return;
  const cards = levelCards, cb = levelCb; levelCards = null; closeModal();
  if (cards[i].kind !== 'perk') banner(cards[i].title.toUpperCase(), cards[i].rar === 2 ? 'b-gold' : 'b-info');
  cb(i, cards);
}

/* spark: pick one small perk before the run */
let perkMode = false;
export function showPerks(perks, cb) {
  const cards = perks.map((p) => ({ kind: 'perk', id: p.id, title: p.name, sub: p.desc, icon: p.icon, col: p.col, rcls: 'r1', rname: 'SPARK', tag: 'THIS RUN' }));
  levelCards = cards; levelCb = (i) => { perkMode = false; cb(perks[i].id); }; levelAt = performance.now(); perkMode = true;
  let h = `<div class="lu spk"><h1>PICK YOUR SPARK</h1><div class="cards">`;
  cards.forEach((c, i) => { h += `<button class="card ${c.rcls}" data-i="${i}"><span class="tag">${c.tag}</span><span class="key">${i + 1}</span><div class="ico" style="color:${c.col}">${icon(c.icon, c.col)}</div><h3>${esc(c.title)}</h3><p>${esc(c.sub)}</p><span class="rar">${c.rname}</span></button>`; });
  h += `</div><div class="odds"><span>A small boost for this run only.</span>${isTouch() ? '' : '<span class="keys"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> or <kbd>Space</kbd></span>'}</div></div>`;
  openModal(h); levelCards = cards;
  onAll('.card', (n) => choose(+n.dataset.i));
}

/* name prompt */
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'piss', 'slut', 'whore', 'nazi', 'rape', 'fag', 'nigg', 'cock', 'pussy', 'anal', 'penis', 'vagina', 'hitler', 'porn'];
export function cleanName(s) {
  s = String(s || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const norm = s.toLowerCase().replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/[^a-z]/g, '');
  if (BAD.some((b) => norm.includes(b))) return null;
  return s;
}
export function showName(done) {
  openModal(`<div class="panel"><h2>What should we call you?</h2><input class="nm" id="nmIn" maxlength="16" placeholder="Warden" autocomplete="off" spellcheck="false"><div class="err" id="nmErr"></div><div class="row"><button class="btn go" id="nmOk">Save</button><button class="btn" id="nmSkip">Skip</button></div></div>`);
  const inp = $('nmIn'); setTimeout(() => inp.focus(), 60);
  const ok = () => { const v = inp.value.trim(); if (!v) { closeModal(); done('Warden'); return; } const c = cleanName(v); if (!c) { $('nmErr').textContent = "Let's keep it friendly. Try another name."; return; } closeModal(); A.sfx('confirm'); done(c); };
  on('#nmOk', ok); on('#nmSkip', () => { closeModal(); done(null); });
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); });
}

/* Hub, results, shop, codex, goals and settings live in hub.js; it registers itself here to avoid a circular import. */
let HUB = null;
export const bindHub = (h) => { HUB = h; };
export const setupAttract = () => HUB.setupAttract();
export const showResults = (r) => HUB.showResults(r);
export const showSettings = (back) => HUB.showSettings(back);
export function showPause(on_) {
  if (!on_) { closeModal(); return; }
  const b = GM.build(), q = GM.quests();
  const wrow = b.w.map((w) => `<div class="bw">${icon(w.icon, w.col)}<b>${esc(w.name)}</b><span>${w.evo ? 'EVOLVED' : w.loan ? 'BORROWED' : 'Lv ' + w.lv}</span></div>`).join('');
  const prow = b.p.map((p) => `<span class="bp">${icon(p.icon, p.col)} ${esc(p.name)} <i>${p.lv}</i></span>`).join('');
  openModal(`<div class="panel pause2"><div class="sh"><h2>Paused</h2><span class="ptime">${icon('clock', '#9fd0ff')} ${fmt(b.t)} · ${b.kills} foes · Lv ${b.lvl}</span></div>
    <div class="pz"><div class="rbox"><span class="hl">YOUR BUILD</span>${wrow}${prow ? `<div class="bps">${prow}</div>` : ''}</div>
    <div class="rbox"><span class="hl">TASKS THIS SESSION</span>${HUB.tasksHtml(q)}</div></div>
    <div class="row"><button class="btn" id="pSet">${icon('gear')} Settings</button><button class="btn" id="pQuit">${icon('home', '#fff')} Quit to hub</button><button class="btn go go-big" id="pRes">${icon('play', '#2b1000')} RESUME</button></div>
    <div class="priv" style="text-align:center">Quitting keeps your coins and unlocks, but this run gives no rewards.</div></div>`);
  const pr = document.getElementById('pRes'); if (pr) pr.focus({ preventScroll: true });
  on('#pRes', () => { A.sfx('click'); GM.pause(false); }); on('#pSet', () => { A.sfx('click'); showSettings(() => showPause(true)); });
  on('#pQuit', () => { A.sfx('click'); GM.quitToHub(); });
}
export function modalIsOpen() { return modalOpen; }
