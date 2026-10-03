import './style.css';
import './ui2.css';
import * as game from './game.js';
import * as UI from './ui.js';
import * as Hub from './hub.js';
import * as P from './platform.js';
import { AREAS } from './data.js';
import { loadModels } from './models.js';
import { RET } from './retention.js';

P.loadingStart();
const GM = {
  save: () => game.save, pause: game.pause, phase: game.getPhase, startRun: game.startRun, canBuy: game.canAffordAny,
  upLvl: game.upLvl, buyUpgrade: game.buyUpgrade, heroUnlocked: game.heroUnlocked, areaUnlocked: game.areaUnlocked,
  areaName: (k) => AREAS[k].name, weaponUnlocked: game.weaponUnlocked, selectHero: game.selectHero, selectArea: game.selectArea,
  previewHero: game.previewHero, previewArea: game.previewArea, setSetting: game.setSetting, setName: game.setName,
  name: game.getName, eraseSave: game.eraseSave, afterResultsShown() {}, rank: game.rankInfo, afford: game.affordableCount,
  setPact: game.setPact, quitToHub: game.quitToHub, toHub: game.toHub, setCosmetic: game.setCosmetic,
  buyWeapon: game.buyWeapon, dawnPrice: game.dawnPrice, quests: game.questsNow, build: game.buildNow,
};
UI.bind(GM); Hub.bind(GM); UI.bindHub(Hub);
// Models are optional: loadModels never rejects, and anything missing falls back to procedural geometry.
// Dev-only: ?nomodels skips the GLBs to exercise the procedural fallback and compare performance.
const skipModels = import.meta.env.DEV && location.search.includes('nomodels');
(skipModels ? Promise.resolve() : loadModels()).then(() => {
  game.loadSave();
  UI.init();
  game.init(document.getElementById('c'));
  P.loadingStop();
}).catch((e) => {
  console.error(e);
  const f = document.getElementById('fatal');
  f.classList.remove('off');
  f.innerHTML = '<div><h2>Ember Guard could not start</h2><p>Your browser may not support WebGL. Try Chrome, Edge or Safari with hardware acceleration enabled.</p></div>';
});
if (import.meta.env.DEV) { window.__eg = { UI, game, RET }; import('./dev.js').then((m) => import('./gfx.js').then((G) => m.initDev(game, G))); } // dev-only debug hook, stripped from production builds
