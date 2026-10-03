// Fully synthesized audio: SFX + a layered generative music loop that follows fire size and danger.
let ctx = null, master, sfxG, musG, lp, noiseBuf, voices = 0, timer = 0, muf = null, mufV = 0;
let sndOn = true, musOn = true;
export const mood = { fire: 1, danger: 0, boss: 0, low: 0 };
const last = {};

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
  master = ctx.createGain(); master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  muf = ctx.createBiquadFilter(); muf.type = 'lowpass'; muf.frequency.value = 20000; muf.Q.value = 0.5; // low-health muffle
  master.connect(muf); muf.connect(comp); comp.connect(ctx.destination);
  sfxG = ctx.createGain(); sfxG.gain.value = sndOn ? 0.9 : 0; sfxG.connect(master);
  musG = ctx.createGain(); musG.gain.value = musOn ? 0.55 : 0;
  lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.7;
  musG.connect(lp); lp.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  nextT = ctx.currentTime + 0.1;
  timer = setInterval(sched, 40);
}
export function setEnabled(snd, mus) {
  sndOn = snd; musOn = mus;
  if (!ctx) return;
  sfxG.gain.value = snd ? 0.9 : 0; musG.gain.value = mus ? 0.55 : 0;
}
// 0 = clear, 1 = heavily muffled (near death). Smoothed; cheap to call every frame.
export function setMuffle(v) { if (!ctx || !muf || Math.abs(v - mufV) < 0.02) return; mufV = v; muf.frequency.setTargetAtTime(20000 * Math.pow(0.05, v), ctx.currentTime, 0.08); }
export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

function tone(f, type, dur, vol, slide, delay, dest) {
  if (!ctx || voices > 30) return;
  const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(18, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || sfxG); o.start(t); o.stop(t + dur + 0.03);
  voices++; o.onended = dec;
}
function dec() { voices--; }
function noise(dur, vol, freq, q, delay, type, slide, dest) {
  if (!ctx || voices > 30) return;
  const t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 0.8;
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || sfxG); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  voices++; s.onended = dec;
}
// Rate-limit helper so floods of events don't turn to mud.
function ok(name, gap) {
  if (!ctx) return false;
  const n = ctx.currentTime;
  if (last[name] && n - last[name] < gap) return false;
  last[name] = n; return true;
}

export function sfx(name, p = 1) {
  if (!ctx || !sndOn) return;
  switch (name) {
    case 'shoot': if (ok(name, 0.05)) { tone(520 * p, 'triangle', 0.12, 0.12, 2.2); noise(0.06, 0.05, 3000, 1, 0, 'highpass'); } break;
    case 'arrow': if (ok(name, 0.05)) { noise(0.09, 0.07, 2500, 2, 0, 'bandpass', 2); tone(900 * p, 'square', 0.05, 0.03, 0.5); } break;
    case 'zap': if (ok(name, 0.08)) { tone(160, 'sawtooth', 0.18, 0.08, 4); noise(0.16, 0.08, 4000, 1.5, 0, 'highpass'); } break;
    case 'hit': if (ok(name, 0.035)) { tone((200 + Math.random() * 40) * p, 'square', 0.05, 0.07, 0.4); noise(0.04, 0.06, 1800, 1); } break;
    case 'crit': if (ok(name, 0.04)) { tone(700, 'square', 0.09, 0.09, 1.8); tone(1050, 'triangle', 0.12, 0.08, 1.5, 0.02); } break;
    case 'kill': if (ok(name, 0.03)) { tone(320 * p, 'triangle', 0.1, 0.1, 0.35); noise(0.09, 0.08, 1200, 1, 0, 'lowpass', 0.4); } break;
    case 'gem': if (ok(name, 0.025)) tone(660 * p, 'sine', 0.12, 0.09, 1.0); break;
    case 'coin': tone(1200, 'square', 0.07, 0.05); tone(1600, 'square', 0.12, 0.05, 1, 0.06); break;
    case 'boom': noise(0.45, 0.35, 900, 0.7, 0, 'lowpass', 0.15); tone(90, 'sine', 0.4, 0.3, 0.3); break;
    case 'nova': noise(0.5, 0.25, 500, 0.8, 0, 'lowpass', 6); tone(150, 'sawtooth', 0.45, 0.1, 3); break;
    case 'hurt': if (ok(name, 0.15)) { tone(150, 'sawtooth', 0.22, 0.2, 0.4); noise(0.15, 0.15, 700, 1); } break;
    case 'fire': if (ok(name, 0.3)) { noise(0.25, 0.1, 400, 1, 0, 'lowpass', 0.4); tone(70, 'sine', 0.25, 0.12, 0.7); } break;
    case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 'triangle', 0.35, 0.12, 1, i * 0.065)); noise(0.4, 0.06, 6000, 1, 0.2, 'highpass'); break;
    case 'pick': [784, 1175, 1568].forEach((f, i) => tone(f, 'triangle', 0.16, 0.1, 1, i * 0.045)); break;
    case 'streak': tone(55, 'sine', 0.5, 0.5, 0.5); tone(110, 'sawtooth', 0.3, 0.15, 0.4); noise(0.2, 0.15, 300, 1); break;
    case 'roar': noise(1.1, 0.4, 500, 1.5, 0, 'bandpass', 0.3); tone(70, 'sawtooth', 1.1, 0.3, 0.5); tone(104, 'sawtooth', 1.0, 0.18, 0.6); break;
    case 'tele': if (ok(name, 0.2)) { tone(300, 'sawtooth', 0.5, 0.1, 2.5); } break;
    case 'stomp': noise(0.5, 0.4, 300, 0.7, 0, 'lowpass', 0.2); tone(48, 'sine', 0.5, 0.5, 0.5); break;
    case 'chest': [660, 880, 1320, 1760].forEach((f, i) => tone(f, 'sine', 0.3, 0.1, 1, i * 0.05)); break;
    case 'near': tone(1400, 'sine', 0.35, 0.12, 0.4); tone(700, 'sine', 0.35, 0.1, 2); break;
    case 'click': tone(540, 'triangle', 0.06, 0.1, 1.4); break;
    case 'confirm': tone(440, 'triangle', 0.08, 0.1, 1.5); tone(880, 'triangle', 0.12, 0.1, 1, 0.06); break;
    case 'lastember': noise(0.9, 0.3, 200, 1, 0, 'lowpass', 8); tone(220, 'sawtooth', 0.8, 0.15, 3); tone(330, 'triangle', 0.8, 0.12, 3); break;
    case 'victory': [392, 494, 587, 784, 988, 1175, 1568].forEach((f, i) => { tone(f, 'triangle', 0.8, 0.12, 1, i * 0.11); tone(f / 2, 'sine', 0.9, 0.1, 1, i * 0.11); }); break;
    case 'defeat': [330, 311, 262, 196].forEach((f, i) => tone(f, 'sawtooth', 0.6, 0.1, 0.9, i * 0.22)); break;
    case 'laststand': tone(98, 'sawtooth', 0.7, 0.3, 0.6); noise(0.6, 0.3, 300, 1, 0, 'lowpass', 4); [392, 523, 659].forEach((f, i) => tone(f, 'square', 0.3, 0.07, 1, 0.15 + i * 0.07)); break;
    case 'reclaim': [880, 659, 523, 392, 262].forEach((f, i) => tone(f, 'triangle', 0.28, 0.11, 0.85, i * 0.07)); noise(0.5, 0.25, 2400, 1, 0.3, 'lowpass', 0.1); tone(60, 'sine', 0.5, 0.4, 0.5, 0.35); break;
    case 'combo': { const n = Math.min(14, p | 0), sc = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33], f = 523 * Math.pow(2, sc[n] / 12); tone(f, 'triangle', 0.18, 0.09, 1); tone(f * 1.5, 'sine', 0.22, 0.05, 1, 0.04); break; }
    case 'combobreak': tone(392, 'triangle', 0.25, 0.07, 0.6); tone(262, 'triangle', 0.3, 0.06, 0.7, 0.08); break;
    case 'charge': tone(180, 'sawtooth', 0.85, 0.07, 4.5); tone(360, 'triangle', 0.85, 0.06, 4); noise(0.85, 0.05, 900, 2, 0, 'bandpass', 5); break;
    case 'chestpop': [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 'triangle', 0.3, 0.09, 1, i * 0.035)); noise(0.35, 0.18, 3000, 1, 0, 'highpass', 0.4); tone(110, 'sine', 0.35, 0.3, 0.5); break;
    case 'heart': tone(62, 'sine', 0.16, 0.35 + 0.3 * p, 0.7); tone(55, 'sine', 0.18, 0.25 + 0.25 * p, 0.7, 0.2); break;
    case 'release': noise(0.7, 0.2, 400, 1, 0, 'lowpass', 12); [523, 659, 784, 1047].forEach((f, i) => tone(f, 'triangle', 0.6, 0.08, 1, 0.1 + i * 0.05)); break;
    case 'unlock': [523, 784, 1047, 1568].forEach((f, i) => tone(f, 'square', 0.25, 0.07, 1, i * 0.08)); break;
    default: break;
  }
}

/* ---------- music ---------- */
const BPM = 100, STEP = 60 / BPM / 4;
const CH = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]];
let nextT = 0, step = 0;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function sched() {
  if (!ctx || ctx.state !== 'running') { if (ctx) nextT = Math.max(nextT, ctx.currentTime); return; }
  // Filter opens with fire size, closes in the dark.
  lp.frequency.setTargetAtTime(700 + 3800 * mood.fire * (0.5 + 0.5 * (1 - mood.boss * 0.4)), ctx.currentTime, 0.4);
  while (nextT < ctx.currentTime + 0.18) { playStep(step, nextT); nextT += STEP; step = (step + 1) % 64; }
}
function mtone(f, type, dur, vol, t, slide) {
  if (voices > 34) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musG); o.start(t); o.stop(t + dur + 0.03); voices++; o.onended = dec;
}
function mnoise(dur, vol, freq, t, type) {
  if (voices > 34) return;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(musG); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02); voices++; s.onended = dec;
}
function playStep(s, t) {
  const bar = (s >> 4) & 3, k = s & 15, ch = CH[bar];
  const d = mood.danger, f = mood.fire;
  if (k === 0) { // pad: detuned saws, always on, darker when fire is low
    const v = 0.05 + 0.03 * f;
    for (let i = 0; i < 3; i++) { mtone(mtof(ch[i]) * 0.5, 'sawtooth', STEP * 15, v * 0.5, t); mtone(mtof(ch[i]) * 0.5 * 1.006, 'sawtooth', STEP * 15, v * 0.4, t); }
  }
  if (k === 0 || k === 6 || k === 10 || (d > 0.5 && (k === 4 || k === 12))) mtone(mtof(ch[0] - 24), 'triangle', STEP * 3, 0.16 + 0.1 * d, t, 0.9);
  const arpOn = 0.25 + 0.5 * f + d * 0.4;
  if (k % 2 === 0 && arpOn > 0.55) {
    const n = ch[(k >> 1) % 4] + (k % 8 === 4 ? 12 : 0) + (f > 0.6 ? 12 : 0);
    mtone(mtof(n), 'triangle', STEP * 1.6, 0.05 + 0.04 * f, t);
  }
  if (d > 0.4 && k % 4 === 0) { mtone(110, 'sine', 0.18, 0.4 * Math.min(1, d + 0.2), t, 0.3); mnoise(0.03, 0.05, 2000, t, 'highpass'); }
  if (mood.boss > 0.5 && (k === 10 || k === 14)) mtone(90, 'sine', 0.2, 0.3, t, 0.35);
  if (d > 0.6 && k % 2 === 0) mnoise(0.04, k % 4 === 2 ? 0.07 : 0.035, 7000, t, 'highpass');
  if (d > 0.3 && k === 12) mnoise(0.1, 0.06, 1500, t, 'bandpass');
  if (mood.low > 0.4 && (k === 0 || k === 3 || k === 8 || k === 11)) mtone(52, 'sine', 0.2, 0.45 * mood.low, t, 0.6);
}
