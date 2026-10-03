// Between-run screens: hub, heroes (live 3D preview), upgrade shop, codex, goals, settings and the run summary.
// All numbers shown come from the real save (progress.js). Screens are plain DOM; transitions are CSS transform/opacity only.
import * as A from './audio.js';
import * as G from './gfx.js';
import * as UI from './ui.js';
import * as PR from './progress.js';
import { HEROES, WEAPONS, PASSIVES, UPGRADES, UP_MAX, upCost, UNLOCKS, ACHIEVEMENTS, ET, BOSSES, AREAS, RANKS, ACCT_PERKS, MASTERY_PERKS, COSMETICS, PACTS, icon } from './data.js';

const { esc, fmt, openModal, closeModal, on, onAll } = UI;
let GM = null;
const modalEl = () => document.getElementById('modal');
export function bind(g) { GM = g; UI.setCloseHook(() => { G.previewClose(); modalEl().classList.remove('clear'); }); }
const S = () => GM.save();
const $ = (id) => document.getElementById(id);
const sfx = (n) => { A.init(); A.sfx(n); };
const bar = (f, cls = '') => `<div class="xpb ${cls}"><i style="transform:scaleX(${Math.max(0, Math.min(1, f))})"></i></div>`;
const st = (i) => `style="--i:${i}"`;

function screen(title, body, back, cls = '') {
  G.previewClose(); modalEl().classList.remove('clear'); UI.startEl().classList.add('off');
  openModal(`<div class="panel scr ${cls}"><div class="sh"><button class="btn ib2" id="sBack" aria-label="Back">${icon('back')}</button><h2>${title}</h2><div class="pill coinp">${icon('coin', '#ffc02a')}<b>${S().coins}</b></div></div><div class="sbody">${body}</div></div>`);
  on('#sBack', () => { sfx('click'); closeModal(); back(); });
}

/* ---------------- hub ---------------- */
// Shared bits for the hub, results and pause screens.
const taskRows = (list) => list.map((q, i) => `<div class="task ${q.done ? 'done' : ''}" ${st(i)}><span class="ti">${icon(q.done ? 'check' : q.icon, q.done ? '#2b1000' : '#ffd24a')}</span><div class="tt"><b>${esc(q.text)}</b>${bar(q.v / q.n, q.done ? 'green' : 'gold')}</div><span class="tv">${q.done ? 'DONE' : q.v + ' / ' + q.n}<small>${icon('coin', '#ffc02a')}${q.coin}</small></span></div>`).join('');
export const tasksHtml = (list) => `<div class="tasks">${taskRows(list)}</div>`;
function unlockCard(s) {
  const nu = PR.nextUnlock(s);
  if (!nu) { const pct = PR.codexPct(s); return `<span class="hl">COLLECTION</span><div class="nuw"><span class="nui">${icon('book', '#ffd24a')}</span><div><b>Codex ${pct}%</b><small>Everything is unlocked. Fill the codex and chase your best run.</small></div></div>${bar(pct / 100, 'gold')}`; }
  const { u, st: q } = nu, ic = u.type === 'hero' ? 'hero' : u.type === 'area' ? 'tree' : WEAPONS[u.id] ? WEAPONS[u.id].icon : 'star';
  const later = UNLOCKS.filter((x) => x !== u && !s.unlocked[x.id]).map((x) => ({ x, f: PR.unlockState(s, x).frac })).sort((a, b) => b.f - a.f).slice(0, 2);
  return `<span class="hl">NEXT UNLOCK · ${u.type.toUpperCase()}</span><div class="nuw"><span class="nui sil">${icon(ic, '#0b0f22')}</span><div><b>${esc(u.name)}</b><small>${esc(u.sub)}</small></div></div><div class="nuc">${esc(u.label)}<span>${q.have} / ${q.need}</span></div>${bar(q.frac, 'gold')}${later.length ? `<div class="nul"><span class="hl">AFTER THAT</span>${later.map((l) => `<div>${icon('lock', '#8a93c0')} ${esc(l.x.name)} <small>${esc(l.x.label)}</small></div>`).join('')}</div>` : ''}`;
}
export function setupAttract() {
  const s = S(), el = UI.startEl(), ret = s.runs > 0;
  G.previewClose(); UI.setAtStart(true); el.classList.remove('off');
  if (!ret) {
    el.innerHTML = `<div class="first"><div class="logo">EMBER<small>GUARD</small></div><div class="fcard"><b>Guard the fire. Survive until dawn.</b><span>${UI.isTouch() ? 'Drag anywhere to move.' : 'Move with WASD or the arrow keys.'} You attack on your own.</span></div><button class="tap" id="tapGo">${icon('play', '#2b1000')} LIGHT THE FIRE</button><div class="mini"><button class="btn" id="bSet">${icon('gear')} Settings</button></div></div>`;
    el.onclick = (e) => { if (e.target.closest('.mini')) return; GM.startRun(); };
    $('bSet').onclick = (e) => { e.stopPropagation(); A.init(); A.sfx('click'); showSettings(() => setupAttract()); };
    return;
  }
  el.onclick = null;
  PR.ensureQuests(s);
  const ac = PR.acctInfo(s), af = GM.afford(), hero = HEROES[s.hero], tasks = GM.quests();
  const navb = (id, ic, label, dot) => `<button class="navb" id="t_${id}">${icon(ic, '#ffd24a')}<span>${label}</span>${dot ? `<em class="dot">${dot}</em>` : ''}</button>`;
  el.innerHTML = `<div class="hub2">
    <header class="topbar">
      <div class="prof"><span class="av">${icon('hero', '#2b1000')}</span><div class="pn"><b>${esc(GM.name())}</b><span>${icon('crown', '#ffd24a')} ${esc(ac.rank)}</span></div></div>
      <div class="lvbar"><div class="lvt"><b>LEVEL ${ac.lvl}</b><small>${ac.max ? 'Max level' : ac.xp + ' / ' + ac.need + ' XP'}</small></div>${bar(ac.frac, 'gold')}</div>
      <div class="wm">EMBER<small>GUARD</small></div>
      <div class="pill coinp">${icon('coin', '#ffc02a')}<b>${s.coins}</b></div>
      <button class="btn ib2" id="t_set" aria-label="Settings">${icon('gear')}</button>
    </header>
    <div class="hgap"></div>
    <div class="hrow">
      <section class="hcard nu" ${st(0)}>${unlockCard(s)}</section>
      <section class="hcard playc" ${st(1)}>
        <button class="tap play" id="hPlay">${icon('play', '#2b1000')} PLAY</button>
        <div class="loadout"><button class="chip" id="cHero">${icon('hero', '#ffd24a')}<span><small>HERO</small>${esc(hero.name)}</span></button><button class="chip" id="cArea">${icon('tree', '#4ac38a')}<span><small>MAP</small>${esc(AREAS[s.area].name)}</span></button>${s.unlocked.pacts ? `<button class="chip" id="cPact">${icon('skull', '#b48cff')}<span><small>NIGHT PACT</small>${s.pact && PACTS[s.pact] ? esc(PACTS[s.pact].name) : 'None'}</span></button>` : ''}</div>
        ${af ? `<button class="afl" id="cAfford">${icon('star', '#ffd24a')} You can afford ${af} upgrade${af > 1 ? 's' : ''}</button>` : ''}
      </section>
      <section class="hcard tk" ${st(2)}><span class="hl">TASKS THIS SESSION</span>${tasksHtml(tasks)}</section>
    </div>
    <nav class="nav2">${navb('heroes', 'hero', 'Heroes')}${navb('up', 'star', 'Upgrades', af)}${navb('codex', 'book', 'Codex')}${navb('goals', 'trophy', 'Goals')}</nav></div>`;
  const go = (fn) => (e) => { e.stopPropagation(); sfx('click'); fn(); };
  const back = () => setupAttract();
  $('hPlay').onclick = (e) => { e.stopPropagation(); GM.startRun(); };
  $('t_heroes').onclick = $('cHero').onclick = go(() => showHeroes(back));
  $('cArea').onclick = go(() => showMaps(back));
  if ($('cPact')) $('cPact').onclick = go(() => showPacts(back));
  $('t_up').onclick = go(() => showShop(back)); if ($('cAfford')) $('cAfford').onclick = go(() => showShop(back));
  $('t_codex').onclick = go(() => showCodex(back));
  $('t_goals').onclick = go(() => showGoals(back));
  $('t_set').onclick = go(() => showSettings(back));
}

/* ---------------- heroes ---------------- */
function heroStatsHtml(h) {
  const row = (l, f, t) => `<div class="hstat"><span>${l}</span>${bar(f)}<small>${t}</small></div>`;
  const extra = [];
  if (h.crit) extra.push('+' + Math.round(h.crit * 100) + '% crit');
  if (h.fireRegen) extra.push('fire regrows faster');
  if (h.fireMax) extra.push('+' + Math.round(h.fireMax * 100) + '% fire capacity');
  return row('Health', h.hp / 150, h.hp) + row('Speed', h.speed / 7, h.speed.toFixed(1)) + `<div class="hstat"><span>Trait</span><small class="tr">${esc(h.trait || (extra.join(', ') || 'Balanced, no weakness'))}</small></div>`;
}
export function showHeroes(back, start) {
  const keys = Object.keys(HEROES);
  let idx = Math.max(0, keys.indexOf(start || S().hero));
  screen('Heroes', `<div class="hs"><div class="hp-wrap"><div class="hprev" id="hPrev"></div><button class="btn nv l" id="hL" aria-label="Previous hero">${icon('back')}</button><button class="btn nv r" id="hR" aria-label="Next hero">${icon('fwd')}</button><div class="hdots" id="hDots"></div></div><div class="hinfo" id="hInfo"></div></div>`, back, 'wide hero');
  modalEl().classList.add('clear'); // the preview is drawn into the canvas behind this transparent window
  G.previewOpen($('hPrev'));
  const render = () => {
    const s = S(), k = keys[idx], h = HEROES[k], un = GM.heroUnlocked(k), u = UNLOCKS.find((x) => x.id === k), m = PR.masteryInfo(s, k);
    G.previewSet(h, !un);
    $('hDots').innerHTML = keys.map((x, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
    let html;
    if (!un) {
      const q = u ? PR.unlockState(s, u) : { have: 0, need: 1, frac: 0 };
      html = `<h3>${esc(h.name)}</h3><div class="hrole">${esc(h.role || '')}</div><div class="hd">${esc(h.desc)}</div>${heroStatsHtml(h)}<div class="ulk">${icon('lock', '#9aa6dc')}<small>TO UNLOCK</small><b>${u ? esc(u.label) : 'Locked'}</b>${bar(q.frac)}<small>${q.have} / ${q.need}</small></div>`;
    } else {
      const w = WEAPONS[h.weapon], nxP = Object.keys(MASTERY_PERKS).map(Number).find((l) => l > m.lvl), nxC = Object.keys(COSMETICS).map(Number).find((l) => l > m.lvl);
      const cos = PR.unlockedCosmetics(s, k), act = PR.activeTrail(s, k);
      html = `<h3>${esc(h.name)}</h3><div class="hrole">${esc(h.role || '')}</div><div class="hd">${esc(h.desc)}</div>
        <div class="hw">${icon(w.icon, w.col)}<span>Starts with <b>${esc(w.name)}</b></span></div>
        ${heroStatsHtml(h)}
        <div class="mast"><div class="mh"><span>${icon('star', '#ffd24a')} Mastery ${m.lvl}${m.max ? ' (max)' : ''}</span><small>${m.max ? 'Max' : m.into + ' / ' + m.need + ' XP'}</small></div>${bar(m.frac, 'gold')}
          <small class="mn">${nxP ? 'Level ' + nxP + ': ' + MASTERY_PERKS[nxP].text : 'All mastery perks earned.'}${nxC ? ' · Level ' + nxC + ': ' + COSMETICS[nxC].name : ''}</small></div>
        ${cos.length ? `<div class="cosr"><span>Ember trail</span><button class="chip ${act ? '' : 'sel'}" data-c="">Default</button>${cos.map((c) => `<button class="chip ${act && act.id === c.id ? 'sel' : ''}" data-c="${c.id}" aria-pressed="${!!(act && act.id === c.id)}">${esc(c.name)}</button>`).join('')}</div>` : ''}
        <button class="btn ${s.hero === k ? 'dis' : 'go'} selb" id="hSel">${s.hero === k ? 'SELECTED' : 'SELECT HERO'}</button>`;
    }
    $('hInfo').innerHTML = html;
    const sel = $('hSel'); if (sel) sel.onclick = () => { sfx('confirm'); GM.selectHero(k); GM.previewHero(); render(); };
    document.querySelectorAll('[data-c]').forEach((n) => { n.onclick = () => { sfx('click'); GM.setCosmetic(k, n.dataset.c); render(); }; });
  };
  const move = (d) => { idx = (idx + d + keys.length) % keys.length; sfx('click'); render(); };
  $('hL').onclick = () => move(-1); $('hR').onclick = () => move(1);
  let sx = null; const pv = $('hPrev');
  pv.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  pv.addEventListener('pointerup', (e) => { if (sx != null && Math.abs(e.clientX - sx) > 40) move(e.clientX < sx ? 1 : -1); sx = null; });
  render();
}

/* ---------------- maps ---------------- */
// A map is a step on a path. Beat its boss to unlock the next one. Each map has its own boss and hazard.
export function showMaps(back) {
  const keys = Object.keys(AREAS).sort((a, b) => AREAS[a].step - AREAS[b].step);
  const render = () => {
    const s = S();
    $('mapList').innerHTML = keys.map((a, i) => {
      const A_ = AREAS[a], un = GM.areaUnlocked(a), u = UNLOCKS.find((x) => x.id === a), q = u ? PR.unlockState(s, u) : null, cleared = !!(s.stats.wonArea || {})[a], boss = BOSSES[A_.boss];
      const tag = s.area === a ? 'SELECTED' : cleared ? 'CLEARED' : un ? 'NEW' : '';
      return `<button class="mapc ${un ? '' : 'lock'} ${s.area === a ? 'sel' : ''}" data-a="${a}"><span class="mn1">${i + 1}</span><span class="mb"><b>${esc(A_.name)}${tag ? `<em>${tag}</em>` : ''}</b>
        <small>${icon('skull', '#ff8a6a')} Boss: ${esc(boss.name)}</small><small>${icon('flame', '#ffb04a')} ${esc(A_.hazardText)}</small>
        <small class="mg">${un ? esc(A_.blurb) : icon('lock', '#9aa6dc') + ' To unlock: ' + esc(u ? u.label : 'Locked')}</small></span>${cleared ? `<span class="mck">${icon('check', '#7dffa0')}</span>` : ''}</button>`;
    }).join('<div class="marr">\u25BC</div>');
    document.querySelectorAll('[data-a]').forEach((n) => { n.onclick = () => { if (!GM.areaUnlocked(n.dataset.a)) { sfx('hurt'); return; } sfx('click'); GM.selectArea(n.dataset.a); GM.previewArea(); render(); }; });
  };
  screen('Maps', `<div class="hd mapintro">Beat a map's boss to unlock the next map. Pick where to play.</div><div id="mapList" class="maps"></div>`, back, '');
  render();
}

/* ---------------- night pacts ---------------- */
export function showPacts(back) {
  const s = S();
  const row = (id, p, i) => `<button class="pact ${s.pact === id ? 'sel' : ''}" data-p="${id}" ${st(i)} aria-pressed="${s.pact === id}"><b>${esc(p.name)}</b><span class="pu">+ ${esc(p.up)}</span><span class="pd">− ${esc(p.down)}</span>${s.pact === id ? '<em>ACTIVE</em>' : ''}</button>`;
  let i = 1, h = `<button class="pact ${!s.pact ? 'sel' : ''}" data-p="" ${st(0)}><b>No pact</b><span class="pn">Play the run as designed.</span>${!s.pact ? '<em>ACTIVE</em>' : ''}</button>`;
  for (const id in PACTS) h += row(id, PACTS[id], i++);
  screen('Night Pacts', `<div class="priv" style="text-align:center">A pact changes your next runs: one clear upside, one clear downside. You can switch any time between runs.</div><div class="pacts">${h}</div>`, back);
  onAll('[data-p]', (n) => { sfx('confirm'); GM.setPact(n.dataset.p); closeModal(); showPacts(back); });
}

/* ---------------- upgrade shop ---------------- */
export function showShop(back, toast) {
  const s = S();
  let h = toast ? `<div class="toast">${toast}</div>` : '';
  h += `<div class="bal">${icon('coin', '#ffc02a')} ${s.coins} <small>coins</small></div><div class="ups">`;
  let i = 0;
  for (const k in UPGRADES) {
    const u = UPGRADES[k], l = GM.upLvl(k), max = l >= UP_MAX, c = max ? 0 : upCost(k, l), aff = !max && s.coins >= c;
    const eff = max ? `<span class="nowv">${u.fx(l)}</span> (max)` : l ? `<span class="nowv">${u.fx(l)}</span> → <span class="nextv">${u.fx(l + 1)}</span>` : `Next: <span class="nextv">${u.fx(1)}</span>`;
    h += `<button class="up ${max ? 'max' : aff ? 'aff' : 'cant'}" data-k="${k}" ${st(i++)} ${max ? 'aria-disabled="true"' : ''}><span class="ico" style="color:${u.col}">${icon(u.icon, u.col)}</span><span class="t">${u.name}<small>${eff}</small><span class="pips">${'<i class="f"></i>'.repeat(l)}${'<i></i>'.repeat(UP_MAX - l)}</span></span><span class="cost">${max ? 'MAX' : icon('coin', '#a35a00') + c}</span></button>`;
  }
  h += '</div>' + armoryHtml(s);
  h += '<div class="priv" style="text-align:center">Upgrades are permanent and apply to every run. Prices never change.</div>';
  screen('Upgrades', h, back);
  bindArmory(() => { closeModal(); showShop(back, 'DAWNBLADE IS YOURS'); });
  onAll('.up', (n) => {
    const res = GM.buyUpgrade(n.dataset.k);
    if (!res) { sfx('hurt'); n.classList.remove('shake'); void n.offsetWidth; n.classList.add('shake'); return; }
    closeModal(); showShop(back, res.ach && res.ach.length ? 'ACHIEVEMENT: ' + esc(res.ach[0].name) : null);
    const b = document.querySelector(`[data-k="${n.dataset.k}"]`); if (b) b.classList.add('bought');
  });
}

/* ---------------- armory (Dawnblade, the one weapon sold for coins) ---------------- */
function armoryHtml(s, big) {
  if (s.unlocked.dawn || !s.seen.w.dawn) return '';
  const W = WEAPONS.dawn, price = GM.dawnPrice(), aff = s.coins >= price;
  return `<div class="sec">ARMORY</div><div class="armory ${big ? 'big' : ''}"><span class="ico">${icon(W.icon, W.col)}</span><span class="t"><b>${esc(W.name)}</b><small>${esc(W.desc)} Yours for good: it joins your level-up cards in every run.</small></span><button class="btn ${aff ? 'go' : 'dis'}" id="buyDawn" ${aff ? '' : 'aria-disabled="true"'}>${icon('coin', aff ? '#a35a00' : '#9aa6dc')} ${price}</button></div>${aff ? '' : `<div class="priv" style="text-align:center">${price - s.coins} more coins needed.</div>`}`;
}
function bindArmory(done) {
  on('#buyDawn', (e) => { if (!GM.buyWeapon('dawn')) { sfx('hurt'); const b = e.currentTarget; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; } done(); });
}

/* ---------------- codex ---------------- */
export function showCodex(back, tab = 'w') {
  const s = S(), pct = PR.codexPct(s);
  const tabs = [['w', 'Weapons'], ['evo', 'Evolutions'], ['e', 'Foes'], ['b', 'Bosses']];
  let cards = '';
  // seen: found in a run. known: unlocked but not found yet (named, dimmed). Otherwise locked (???).
  const card = (seen, ic, col, name, body, hint, i, known) => seen ? `<div class="cdx" ${st(i)}><div class="ico">${icon(ic, col)}</div><b>${esc(name)}</b><small>${body}</small></div>`
    : known ? `<div class="cdx known" ${st(i)}><div class="ico">${icon(ic, col)}</div><b>${esc(name)}</b><small><em>NOT FOUND YET</em>${esc(hint)}</small></div>`
    : `<div class="cdx lock" ${st(i)}><div class="ico">${icon('lock', '#6b7299')}</div><b>???</b><small>${esc(hint)}</small></div>`;
  let i = 0;
  if (tab === 'w') for (const k in WEAPONS) { const W = WEAPONS[k], seen = !!s.seen.w[k]; cards += card(seen, W.icon, W.col, W.name, esc(W.desc) + '<br>Evolves with ' + esc(PASSIVES[W.evoWith].name), GM.weaponUnlocked(k) ? 'Unlocked: it shows up on level-up cards.' : k === 'dawn' ? 'Sold in the armory.' : (UNLOCKS.find((x) => x.id === k || (k === 'bow' && x.id === 'wren') || (k === 'nova' && x.id === 'monk') || (k === 'wisp' && x.id === 'ash')) || { label: 'Locked' }).label, i++, GM.weaponUnlocked(k)); }
  if (tab === 'evo') for (const k in WEAPONS) { const W = WEAPONS[k], seen = !!s.seen.evo[k]; cards += card(seen, W.icon, '#ffd24a', W.evo, esc(W.name) + ' + ' + esc(PASSIVES[W.evoWith].name) + ', transformed.', 'Max ' + W.name + ' (level 5), own ' + PASSIVES[W.evoWith].name + ', pick it on a level-up.', i++); }
  if (tab === 'e') for (let t = 0; t < ET.length; t++) { if (ET[t].boss) continue; const seen = !!s.seen.e[t]; cards += card(seen, 'skull', '#c9b6ff', ET[t].name, 'Health ' + ET[t].hp + ' · Speed ' + ET[t].sp + (ET[t].trait ? '<br>' + esc(ET[t].trait) : '<br>Hits for ' + ET[t].dmg + ', gnaws the fire for ' + ET[t].fd + '/s'), t > 3 ? 'Meets you later in a run.' : 'Survive a little longer to meet it.', i++); }
  if (tab === 'b') for (const k in BOSSES) { const b = BOSSES[k], seen = !!s.seen.b[k]; cards += card(seen, b.icon || 'skull', '#ffb070', b.name, esc(b.desc), b.hint, i++); }
  screen('Codex', `<div class="cpct"><b>${pct}%</b> complete${bar(pct / 100, 'gold')}</div><div class="tabs">${tabs.map((t) => `<button class="btn ${tab === t[0] ? 'sel' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div class="cdxg">${cards}</div>`, back);
  onAll('[data-t]', (n) => { sfx('click'); closeModal(); showCodex(back, n.dataset.t); });
}

/* ---------------- goals, rank, achievements ---------------- */
export function showGoals(back) {
  const s = S(), ac = PR.acctInfo(s), goal = PR.nextGoal(s), pct = PR.codexPct(s);
  const nextPerkLvl = Object.keys(ACCT_PERKS).map(Number).find((l) => l > ac.lvl);
  const ranks = `<div class="rtrack">${RANKS.map((r, i) => `<div class="rk ${ac.lvl >= r[0] ? 'done' : ''} ${ac.rank === r[1] ? 'cur' : ''}" ${st(i)}><i>${ac.lvl >= r[0] ? icon('check', '#2b1000') : r[0]}</i><span>${r[1]}</span><small>Lv ${r[0]}</small></div>`).join('')}</div>`;
  const road = UNLOCKS.map((u, i) => { const q = PR.unlockState(s, u); return `<div class="gl-row ${s.unlocked[u.id] ? 'done' : ''}" ${st(i)}>${icon(s.unlocked[u.id] ? 'check' : u.type === 'hero' ? 'hero' : u.type === 'area' ? 'tree' : WEAPONS[u.id] ? WEAPONS[u.id].icon : 'lock', s.unlocked[u.id] ? '#8cf29c' : '#ffd24a')}<div><b>${esc(u.name)}</b><small>${esc(u.label)}</small>${bar(q.frac, s.unlocked[u.id] ? 'green' : '')}</div><span>${q.have}/${q.need}</span></div>`; }).join('');
  const done = ACHIEVEMENTS.filter((a) => s.ach[a.id]).length;
  const ach = ACHIEVEMENTS.map((a, i) => { const q = PR.achState(s, a); return `<div class="gl-row ${q.done ? 'done' : ''}" ${st(i)}>${icon(q.done ? 'check' : 'trophy', q.done ? '#8cf29c' : '#9aa6dc')}<div><b>${esc(a.name)}</b><small>${esc(a.desc)} (+${a.xp} XP)</small>${bar(q.frac, q.done ? 'green' : '')}</div><span>${q.have}/${q.need}</span></div>`; }).join('');
  const mastery = Object.keys(HEROES).filter((k) => GM.heroUnlocked(k)).map((k) => { const m = PR.masteryInfo(s, k); return `<div class="gl-row">${icon('hero', '#ffd24a')}<div><b>${esc(HEROES[k].name)}</b><small>Mastery ${m.lvl}${m.max ? ' (max)' : ''}</small>${bar(m.frac, 'gold')}</div><span>${m.lvl}</span></div>`; }).join('');
  screen('Goals', `<div class="goalcard"><span class="gl">NEXT BEST THING</span><b>${esc(goal.text)}</b>${bar(goal.frac)}</div>
    <div class="sec">ACCOUNT RANK · LEVEL ${ac.lvl}</div>${bar(ac.frac, 'gold')}<small class="cap2">${ac.max ? 'Max level' : ac.xp + ' / ' + ac.need + ' XP to level ' + (ac.lvl + 1)}${nextPerkLvl ? ' · Level ' + nextPerkLvl + ' perk: ' + ACCT_PERKS[nextPerkLvl].text : ''}</small>${ranks}
    <div class="sec">EMBER ROAD (UNLOCKS)</div>${road}
    <div class="sec">HERO MASTERY</div>${mastery}
    <div class="sec">COLLECTION</div><div class="gl-row"><div><b>Codex ${pct}%</b>${bar(pct / 100, 'gold')}</div></div>
    <div class="sec">ACHIEVEMENTS ${done} / ${ACHIEVEMENTS.length}</div>${ach}`, back);
}

/* ---------------- settings ---------------- */
export function showSettings(back) {
  const s = S().set;
  const row = (k, label) => `<div class="set"><span>${label}</span><button class="tg ${s[k] ? 'on' : ''}" data-k="${k}" role="switch" aria-checked="${!!s[k]}" aria-label="${label}"></button></div>`;
  screen('Settings', `${row('snd', 'Sound effects')}${row('mus', 'Music')}${row('shake', 'Screen shake')}${row('flash', 'Reduce flashes')}${row('vib', 'Vibration')}
    <div class="set"><span>Damage numbers</span><span class="seg">${['All', 'Big hits', 'Off'].map((l, i) => `<button class="chip ${(s.dn | 0) === i ? 'sel' : ''}" data-dn="${i}">${l}</button>`).join('')}</span></div>
    <div class="set"><span>Graphics quality</span><span class="seg"><button class="chip ${s.qual ? '' : 'sel'}" data-q="0">Auto</button><button class="chip ${s.qual ? 'sel' : ''}" data-q="1">Fast</button></span></div>
    <div class="set"><span>Nickname</span><button class="btn" id="stName" style="padding:6px 14px;font-size:14px">${esc(GM.name())} (change)</button></div>
    <div class="priv"><b>Privacy.</b> Ember Guard stores only your nickname, settings and progress on this device (browser local storage). Nothing is sent anywhere. No accounts, no tracking, no ads. Clearing your browser data erases it.</div>
    <div class="row" id="rstRow"><button class="btn" id="stReset" style="font-size:13px;padding:8px 12px">Reset progress</button></div>`, back);
  onAll('.tg', (n) => { const k = n.dataset.k; GM.setSetting(k, s[k] ? 0 : 1); n.classList.toggle('on'); n.setAttribute('aria-checked', String(!!GM.save().set[k])); sfx('click'); if (k === 'flash') document.body.classList.toggle('rf', !!GM.save().set.flash); });
  onAll('[data-q]', (n) => { GM.setSetting('qual', +n.dataset.q); sfx('click'); closeModal(); showSettings(back); });
  onAll('[data-dn]', (n) => { GM.setSetting('dn', +n.dataset.dn); sfx('click'); closeModal(); showSettings(back); });
  on('#stName', () => { UI.showName((n) => { if (n) GM.setName(n); showSettings(back); }); });
  on('#stReset', () => {
    $('rstRow').innerHTML = `<div class="priv" style="text-align:center;color:#ffb4a0">This erases coins, unlocks, mastery and achievements on this device. It cannot be undone.</div><button class="btn" id="rstNo">Keep my progress</button><button class="btn" id="rstYes" style="border-color:#ff7a6a">Erase everything</button>`;
    on('#rstNo', () => { closeModal(); showSettings(back); });
    on('#rstYes', () => { GM.eraseSave(); location.reload(); });
  });
}

/* ---------------- run summary ---------------- */
// Order (peak-end): the best moment of the run first, then the nearest unmet goal, then rewards. One screen at 720 px.
// Every number is real run or save data. ONE MORE RUN has focus; Space / Enter retries.
let resKey = null;
const dropResKey = () => { if (resKey) { removeEventListener('keydown', resKey, true); resKey = null; } };
export function showResults(r) {
  const pr = r.pr, s = S(), hero = HEROES[r.hero], af = GM.afford(), pb = r.prevBest || {};
  const head = r.win ? 'DAWN BREAKS' : r.why === 'fire' ? 'THE FIRE WENT OUT' : 'YOU FELL';
  const tile = (i, ic, col, label, val, best, fmtF) => {
    const isNew = best != null && pb.runs > 0 && val > best;
    const sub = isNew ? 'NEW BEST' : best != null && pb.runs > 0 ? 'Best ' + (fmtF ? fmt(best) : best) : '&nbsp;';
    return `<div class="rt ${isNew ? 'nb' : ''}" ${st(i)}><span class="rti">${icon(ic, col)}</span><small>${label}</small><b data-n="${val}">0</b><em>${sub}</em></div>`;
  };
  const peak = r.maxStreak >= 5 ? `<div class="peak" ${st(0)}>${icon('flame', '#ffb347')}<span>Your best moment: a <b>${r.maxStreak} kill streak</b> at ${fmt(r.peakT)}</span></div>` : '';
  const ng = r.nearest;
  const goal = r.win
    ? `<div class="ngoal win">${icon('crown', '#ffd24a')}<div><span class="hl">DAWN REACHED</span><b>The night is yours, ${esc(r.name)}.</b><small>Try another hero or area, or a Night Pact for more coins.</small></div></div>`
    : ng ? `<div class="ngoal">${icon(ng.icon, '#ffd24a')}<div><span class="hl">SO CLOSE</span><b>${esc(ng.text)}</b>${bar(ng.frac, 'gold')}<small>${esc(ng.sub)}</small></div></div>` : '';
  const cbd = r.parts.map((p) => `${esc(p[0].replace(/ \(\d+\)$/, '').toLowerCase())} +${p[1]}`).join(' · ') + (r.questCoins ? ` · tasks +${r.questCoins}` : '');
  const lu = pr.levelUps.map((l) => `<div class="lvu">${icon('crown', '#ffd24a')}<b>Account level ${l.lvl}</b><small>+${l.coins} coins${l.perk ? ' · ' + esc(l.perk) : ''}${l.rank ? ' · rank: ' + esc(l.rank) : ''}</small></div>`).join('');
  const mu = pr.mastUps.map((m) => `<div class="lvu">${icon('star', '#ffd24a')}<b>${esc(hero.name)} mastery ${m.lvl}</b><small>${m.perk ? esc(m.perk) : ''}${m.cos ? (m.perk ? ' · ' : '') + esc(m.cos) : ''}</small></div>`).join('');
  const nu = pr.newUnlocks.map((u) => `<div class="unl2">${icon(u.type === 'hero' ? 'hero' : u.type === 'area' ? 'tree' : WEAPONS[u.id] ? WEAPONS[u.id].icon : 'star', '#ffd24a')}<div><span class="nu2">NEW UNLOCK</span><b>${esc(u.name)}</b><small>${esc(u.sub)}</small></div></div>`).join('');
  const na = pr.newAch.map((a) => `<div class="lvu">${icon('trophy', '#ffd24a')}<b>${esc(a.name)}</b><small>${esc(a.desc)} (+${a.xp} XP)</small></div>`).join('');
  const tasks = r.quests.map((q) => ({ text: PR.questText(q), v: Math.min(q.n, q.have), n: q.n, coin: q.coin, done: !!q.done, icon: PR.QUESTS[q.id].icon }));
  const m1 = pr.m1, sameLvl = pr.a0.lvl === pr.a1.lvl;
  const timeBest = pb.runs > 0 ? (r.time > pb.time ? 'NEW BEST' : 'Best ' + fmt(pb.time)) : '';
  const h = `<div class="res2"><div class="ribbon ${r.win ? 'win' : ''}">${head}</div><div class="rcard">
    <div class="rtop">
      <div class="rtime"><small>TIME SURVIVED</small><b data-n="${Math.round(r.time)}" data-f="time">00:00</b><span>${r.win ? 'Well done' : 'Good fight'}, ${esc(r.name)}${timeBest ? ` <em class="pb ${timeBest === 'NEW BEST' ? '' : 'old'}">${timeBest}</em>` : ''}</span></div>
      <div class="rcoins"><small>COINS EARNED</small><b>${icon('coin', '#ffc02a')} +<span id="rwN">0</span></b><span>In your purse: <i>${r.bank}</i></span><small class="cbd">${cbd}</small></div>
    </div>
    ${peak}
    <div class="rstats">${tile(1, 'skull', '#e8eaff', 'FOES', r.kills, pb.kills)}${tile(2, 'star', '#ffd24a', 'LEVEL', r.lvl, pb.lvl)}${tile(3, 'flame', '#ffb347', 'BEST STREAK', r.maxStreak, pb.streak)}${tile(4, 'heart', '#ff8fa0', 'HITS TAKEN', r.damageTaken, null)}</div>
    ${goal}
    <div class="rgrid">
      <div class="rbox"><span class="hl">TASKS${r.questsDone.length ? ' · ' + r.questsDone.length + ' DONE' : ''}</span>${tasksHtml(tasks)}</div>
      <div class="rbox prog"><span class="hl">PROGRESS</span>
        <div class="pl"><b>Account level ${pr.a1.lvl}</b><small>+${pr.xpGain} XP</small></div>${bar(sameLvl ? pr.a0.frac : 0, 'gold')}
        <div class="pl"><b>${esc(hero.name)} mastery ${m1.lvl}</b><small>+${pr.mGain} XP</small></div>${bar(m1.frac, 'gold')}
        ${lu || mu || nu || na ? `<div class="rew">${nu}${lu}${mu}${na}</div>` : ''}
      </div>
    </div>
    ${r.offer ? armoryHtml(s, true) : ''}
  </div>
  <div class="row rbtns"><button class="btn ib3" id="bHub">${icon('home', '#fff')} Hub</button><button class="btn ${af ? 'green' : ''}" id="bUp">${icon('star', '#fff')} Upgrades${af ? `<span class="dot">${af}</span>` : ''}</button><button class="btn go go-big" id="bAgain">${icon('play', '#2b1000')} ONE MORE RUN</button></div>
  ${UI.isTouch() ? '' : '<div class="kbd">Space or Enter: one more run</div>'}</div>`;
  openModal(h);
  const again = () => { dropResKey(); sfx('confirm'); closeModal(); GM.startRun(); };
  on('#bAgain', again);
  on('#bHub', () => { dropResKey(); sfx('click'); closeModal(); GM.toHub(); });
  on('#bUp', () => { dropResKey(); sfx('click'); showShop(() => showResults(Object.assign(r, { noConf: true }))); });
  bindArmory(() => { dropResKey(); closeModal(); showResults(Object.assign(r, { noConf: true, offer: null, bank: S().coins })); UI.banner('DAWNBLADE IS YOURS', 'b-gold'); });
  dropResKey();
  resKey = (e) => { if ((e.code === 'Space' || e.code === 'Enter') && GM.phase() === 'results' && !document.getElementById('nmIn') && document.querySelector('.res2')) { e.preventDefault(); e.stopPropagation(); again(); } };
  addEventListener('keydown', resKey, true);
  const ba = $('bAgain'); if (ba) ba.focus({ preventScroll: true });
  // count-up and bar fill, once
  const t0 = performance.now(), n = $('rwN'), nums = document.querySelectorAll('.res2 [data-n]');
  const bars = document.querySelectorAll('.res2 .prog .xpb i'), fills = [pr.a1.frac, m1.frac], total = r.coins + (r.questCoins || 0);
  const show = (x, v) => { x.textContent = x.dataset.f === 'time' ? fmt(v) : v; };
  if (r.noConf) { if (n) n.textContent = total; nums.forEach((x) => show(x, +x.dataset.n)); bars.forEach((x, i) => { x.style.transform = `scaleX(${fills[i]})`; }); }
  else {
    setTimeout(() => bars.forEach((x, i) => { x.style.transition = 'transform 1.1s cubic-bezier(.2,.8,.2,1)'; x.style.transform = `scaleX(${fills[i]})`; }), 350);
    const tick = () => {
      const f = Math.min(1, (performance.now() - t0) / 900), e = 1 - (1 - f) * (1 - f);
      if (n) n.textContent = Math.round(total * e);
      nums.forEach((x) => show(x, Math.round(+x.dataset.n * e)));
      if (f < 1 && n && n.isConnected) requestAnimationFrame(tick);
    };
    tick();
  }
  UI.confetti(r.noConf ? 0 : r.win ? 60 * (r.finale || 1) : pr.newUnlocks.length || r.questsDone.length ? 24 : 0);
  if ((pr.newUnlocks.length || pr.levelUps.length || r.questsDone.length) && !r.noConf) setTimeout(() => A.sfx('unlock'), 500);
}
