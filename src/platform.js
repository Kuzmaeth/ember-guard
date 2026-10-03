// Single platform boundary. Swap this file's internals for the CrazyGames SDK later;
// game code must only talk to the functions exported here.
const KEY = 'emberguard.save';
let mem = null; // in-memory fallback when storage is blocked
let playing = false;

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage blocked or corrupt */ }
  return mem;
}
export function saveData(obj) {
  mem = obj;
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* ignore */ }
}
export function getPlayerName() {
  const d = loadData();
  return (d && d.name) || 'Warden';
}
export function gameplayStart() { if (!playing) { playing = true; } }
export function gameplayStop() { if (playing) { playing = false; } }
export function loadingStart() {}
export function loadingStop() {}
export function isStorageAvailable() {
  try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return true; } catch (e) { return false; }
}
export function clearData() { mem = null; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
