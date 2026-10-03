// Dev-only overlays, loaded only in dev builds and stripped from production. Read local data only.
// F2: performance and run telemetry. F3: Retention Engine director (state, interventions, death-time histogram, retry stats).
import { RET } from './retention.js';

function panel(top) {
  const el = document.createElement('pre');
  el.style.cssText = `position:fixed;left:8px;top:${top}px;z-index:50;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#9fffa8;background:rgba(0,0,0,.72);border-radius:6px;pointer-events:none;display:none;max-width:90vw;white-space:pre-wrap`;
  document.body.appendChild(el); return el;
}
// Death-time histogram in 30 s buckets, as text bars.
export function histogram(times, bucket = 30, max = 300) {
  const n = Math.ceil(max / bucket) + 1, h = new Array(n).fill(0);
  for (const t of times) h[Math.min(n - 1, Math.floor(t / bucket))]++;
  const top = Math.max(1, ...h);
  return h.map((c, i) => { const a = i * bucket, lab = i === n - 1 ? (a / 60 | 0) + ':' + String(a % 60).padStart(2, '0') + '+  ' : (a / 60 | 0) + ':' + String(a % 60).padStart(2, '0') + '-' + ((a + bucket) / 60 | 0) + ':' + String((a + bucket) % 60).padStart(2, '0'); return lab.padEnd(11) + '#'.repeat(Math.round(c / top * 24)) + ' ' + c; }).join('\n');
}
export function retryStats(tele) {
  const done = tele.filter((r) => r.rq), again = done.filter((r) => r.rq === 'r' || r.rq === 'h');
  const r1 = tele.filter((r) => r.ri === 0 && r.rq);
  return { decided: done.length, retried: again.length, quick: done.filter((r) => r.rq === 'r').length, rate: done.length ? Math.round(again.length / done.length * 100) : null, run1: r1.length ? r1.map((r) => r.rq).join(',') : 'n/a', pending: tele.filter((r) => r.rq === null).length };
}

export function initDev(game, G) {
  if (window.__eg) window.__eg.G = G;
  const el = panel(96), dir = panel(96);
  dir.style.left = 'auto'; dir.style.right = '8px'; dir.style.color = '#ffe08a';
  addEventListener('keydown', (e) => {
    if (e.code === 'F2') { el.style.display = el.style.display === 'none' ? 'block' : 'none'; e.preventDefault(); }
    if (e.code === RET.overlay.key && RET.overlay.on) { dir.style.display = dir.style.display === 'none' ? 'block' : 'none'; e.preventDefault(); }
  });
  setInterval(() => {
    if (el.style.display !== 'none') {
      const s = game.save, t = s.tele || [], by = {}, gs = game.GS, i = G.renderer.info;
      for (const r of t) { const k = r.w ? 'win' : r.c || '?'; by[k] = (by[k] || 0) + 1; }
      const avg = t.length ? Math.round(t.reduce((a, r) => a + r.t, 0) / t.length) : 0, lv = t.length ? Math.round(t.reduce((a, r) => a + r.l, 0) / t.length * 10) / 10 : 0;
      el.textContent = `fps ${gs.fps.toFixed(0)}  enemies ${gs.alive}  lvl ${gs.lvl}  moths ${gs.moths || 0}\ndraw calls ${i.render.calls}  tris ${i.render.triangles}  quality ${G.Q.level}  dpr ${G.Q.dpr}\nruns ${s.stats.runs}  played ${Math.round(s.stats.timeTotal / 60)} min  acct xp ${s.acctXp}\nlast ${t.length} runs: avg ${avg}s, avg lvl ${lv}\ndeaths ${JSON.stringify(by)}\nrecent ${t.slice(-6).map((r) => r.t + 's/L' + r.l).join('  ')}`;
    }
    if (dir.style.display !== 'none') {
      const d = game._debugRet(), s = game.save, t = s.tele || [], rs = retryStats(t), sw = Object.keys(RET).filter((k) => RET[k] && typeof RET[k] === 'object').map((k) => (RET[k].on && RET.master ? '+' : '-') + k).join(' ');
      const iv = d.RUN.iv.slice(-8).map((x) => `  ${x.t.toFixed(1).padStart(6)}s ${x.k} ${x.note}`).join('\n') || '  (none)';
      dir.textContent = `RETENTION DIRECTOR  master ${RET.master ? 'ON' : 'OFF'}\n${sw}\n` +
        `run idx ${d.runIdx}  phase ${d.phase}  t ${d.t.toFixed(1)}s\n` +
        `death clock ${d.DC.on ? 'ARMED' : 'off'}  T ${d.DC.T.toFixed(0)}s  saves ${d.DC.saves}/${RET.deathClock.maxSaves}  boss nudge +${Math.round(d.DC.nudge * 100)}%  boss hp ${d.boss == null ? '-' : Math.round(d.boss * 100) + '%'}\n` +
        `drama crushed ${d.DR.crushed ? 'YES' : 'no'} (${d.DR.crushT.toFixed(1)}s)  enraged ${d.DR.enraged ? 'yes' : 'no'}  extra logs this min ${d.DR.logs}\n` +
        `last stand ${d.LS.used ? (d.LS.t > 0 ? 'ACTIVE ' + d.LS.t.toFixed(1) + 's' : d.LS.held ? 'held' : 'spent') : 'ready'}  jackpot ${d.RUN.jackpot ? 'YES' : 'no'} (next at run ${s.ret.jackpotAt})  loan ${d.RUN.loan ? d.RUN.loanT.toFixed(0) + 's left' : d.RUN.loanHad ? 'reclaimed' : '-'}\n` +
        `interventions ${JSON.stringify(d.RUN.ivN)}\n${iv}\n` +
        `LOCAL TELEMETRY (${t.length} runs on this device)\n${histogram(t.filter((r) => !r.w).map((r) => r.t))}\n` +
        `retry after run: ${rs.rate == null ? 'n/a' : rs.rate + '%'} (${rs.retried}/${rs.decided}, quick ${rs.quick}, pending ${rs.pending})  run-1: ${rs.run1}`;
    }
  }, 500);
}
