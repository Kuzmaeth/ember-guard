# Handoff: EMBER GUARD (after the HUD / hub / progression / content session, 2026-10-03)

Project: `C:\Users\Kuzma Corp\Desktop\guard` (not a git repo). Three.js + vanilla JS + Vite survivor roguelite targeting CrazyGames.

## Read first
- `plan.md`: audit, SCREEN MAP, progression design, content list, size budget, stage log (session 2 at the bottom). Session 1 (3D models) is above it.
- `CHANGELOG.md` (0.3.0 lists every change, including the core-loop ones), `README.md`, `LICENSES.md`, `DESIGN.md`.

## State
- All 8 stages are done. First load = total = **1376 kB in 34 files** (JS 768 kB / 217 kB gzip, CSS 33 kB, 31 GLB about 590 kB). Limit was 20 MB.
- Verified in a real Chromium pane: hub, hero select with live preview (desktop and 375x812), shop, codex, goals + achievements, pacts, results summary, new enemies, Ashen Warden bar, production build (31/31 GLBs, no console errors, dev hooks stripped).
- **Not verified:** real FPS on any device (the pane throttles rAF to about 2 fps when unfocused; draw calls were measured instead: 47 calls / 244k tris with 154 enemies and 4 new weapons active); touch input on a real phone; audio for the new weapons (they reuse existing sfx); the Warden fight was only checked up to the boss bar and by headless code paths, never played end to end by a human.

## Session 3: Retention Engine (rollout step 1 done)
- Config and switches: `src/retention.js` (`RET.master` plus one switch per system, all tunables, `DAWN_PRICE`). Dev A/B: `?ret=off`, `?ret=-deathClock,-drama`, or `__eg.RET` in the console.
- Logic: the "Retention Engine: run director" block in `src/game.js`:
  - state: `DC` (death clock), `DR` (drama), `LS` (Last Stand), `RUN` (jackpot, loan, intervention log)
  - functions: `retStart`, `retStep`, `dcSave`, `retSaveHero`, `reclaimLoan`, `retTele`, `markRetry`
- UI pieces:
  - Last Stand badge `#lsb` (index.html, ui.js)
  - LOAN tag and `UI.reclaim` animation (ui.js, style.css)
  - Armory offer (`armoryHtml` in hub.js, shown on results and in the shop)
- Dev tools:
  - F3 director overlay in `src/dev.js`, with `histogram()` and `retryStats()` over `save.tele`.
  - Helpers: `_debugStart(runIdx)`, `_debugHurt`, `_debugCards(jackpot)`, `_debugBossHp`, `_debugRet`.
  - `_debugSim(secs, { runIdx })` runs a headless bot run as run N without touching persistent retention state.
- Measurements and caveats: plan.md "Measurements, step 1". In short: run-1 bot survival went from 82 to 142 s mean. No 3:00-4:00 cluster within the caps. Retry rate and session length can't be measured locally.
- Next rollout step: Stages 4-5 (death screen nearest goal, XP bar tuning, endowed progress, layered goals, session quests, menus burn, quick retry focus, pre-run perk, peak-end). Then re-measure.
- Open decisions for the user:
  - (a) Weaker or earlier boss in runs 1-3, to make the 10-15% near-miss reachable.
  - (b) An analytics path for real retry and session data, which needs a privacy text change.
  - (c) Whether to loosen the death-clock caps.

## Session 4: simpler heroes and maps (done)
- Maps are a path (`AREAS[].step`): Woods -> Ashen Hollow (beat the Drake in Woods) -> Marsh (beat the Warden in Ashen). New `showMaps` screen in hub.js; the Heroes screen now only shows heroes. PLAY auto-selects a newly unlocked map (`awardRun`).
- Heroes show real name, role (`HEROES[].role`), stats and the exact unlock goal even when locked. Monk = beat Woods boss, Ash = beat Marsh boss, Wren = finish 1 run.
- Unlock stat keys `won:woods|ashen|marsh` (progress.statVal). Existing saves keep what they already unlocked.
- Open risk: map and hero unlocks now need boss wins. Check with real players that first boss kills happen early enough.
- Touch scrolling fix: menus override the global `touch-action:none` (ui2.css, bottom).

## Session 3b: UI v2 (done)
- `src/ui2.css` overrides `style.css`: solid surfaces, tokens `--s0..s3`, `--line`, `--mute`, 12 px type floor. New UI goes there; `style.css` is the old base.
- `hub.js`:
  - `setupAttract` (hub v2: top bar, NEXT UNLOCK, PLAY, TASKS, nav)
  - `showResults` (results v2: peak, SO CLOSE, bests, tasks; Space/Enter retry via `resKey`)
  - `tasksHtml` (shared by hub, results and pause)
- `progress.js`:
  - `QUESTS`, `ensureQuests`, `applyQuests`, `questLive` (session tasks)
  - `nearestGoal` (death screen)
  - `nextUnlock`
- `game.js`:
  - `endRun` adds `prevBest`, `questsDone`, `nearest`, `peakT` to the results data.
  - `updateQuestHud` drives the live tracker.
  - `questsNow` / `buildNow` feed the pause menu.
  - `attractPose` places the hero beside the fire on the hub.
  - The Heroes screen skips the world draw (`G.previewBackdrop`).
- Settings: `save.set.dn` controls damage numbers (0 all, 1 big hits = default, 2 off).

## Session 3c: boss, champions, sparks, juice, remodels
- Boss key `drake` (The Cinder Drake, `boss_drake.glb`); `stag` is retired (`assets/retired/`). Fire-breath volley in `bossUpdate` case 6. Wing flap = shader joint 10 (`J_WING` in build_assets.py).
- Champions: `CH` / `champDirector` / `spawnChampion` / `champStep` / `champKilled` in game.js; `CHAMPIONS` in data.js; `echamp` / `escl` per-enemy arrays; bar via `UI.champBar`.
- Sparks: `PERKS` in data.js, `startRun(perk)`: undefined shows the picker (`UI.showPerks`), null skips it (sim and debug). Modifiers in `RK`, applied in `recalc`.
- Juice: `chestCharge` / `juiceStep` / `juiceFrame` in game.js; new sfx `combo`, `combobreak`, `charge`, `chestpop`, `heart`, `release` and `A.setMuffle` in audio.js.
- New builders at the end of build_assets.py (`build_boss_drake` and the remodelled `build_enemy_bulwark`, `build_enemy_gloommoth`, `build_boss_ashen_warden` override the older ones); `_slab` and `_curve` helpers.
- Dev helpers: `_debugChest()`, `_debugHp(f)`, `_debugFeel(secs, autoPick)`. The pane often delivers no animation frames when unfocused, so drive frames with `_debugFeel`.
- Known: the naive bot often loses the fire to the 0:24 skitter swarm. Worth checking with real players; it may be a real early drop-off point.

## Code map (new or changed)
- `src/data.js`: all content tables (HEROES, WEAPONS, ET, BOSSES, AREAS, PACTS, UNLOCKS, ACHIEVEMENTS, ranks, mastery, cosmetics, ICONS). Add content here first.
- `src/progress.js`: pure save/progression logic (save v2 + migration, account level, mastery, unlock and achievement evaluation, codex, `awardRun`, `nextGoal`). No DOM.
- `src/hub.js`: hub, heroes (live preview), shop, codex, goals, pacts, settings, run summary. `src/ui.js`: HUD, input, level-up cards, pause. `src/gfx.js`: renderer, shaders, `previewOpen/Set/Draw/Close` for the hero preview.
- `src/game.js`: sim. Enemy type index `t` = `ET[t]`; `ET[t].m` = mesh slot (`G.enemyGeo`, caps in `ECAP`); `ai` = `ranged | shield | bomb | moth | summon`; bosses are `ET[t].boss` (`BB.kind` = `stag | warden`). Weapons: `wInfo` + `updateWeapons` + per-weapon function. Fire mechanics: `isLit` (fire + wisps), `updateLP` (Light Pulse), moth shrink in `step`, shrines (gem kind 6), `R_.darkT`.
- `src/dev.js` (F2 overlay) and `_debug*` exports are dev-only.

## How to add content
- New enemy: add `ET` entry (+ `m`, `ai`), a geometry in `gfx.js enemyGeo` (or a GLB in `models.js`), a mesh slot cap in `ECAP`, optionally a case in `stepEnemies`, and a line in `NEWT` (when it starts appearing). It shows up in the codex automatically.
- New weapon: `WEAPONS` entry, `wInfo` case, dispatch in `updateWeapons`, `weaponUnlocked` rule + an `UNLOCKS` entry.
- New unlock / achievement / pact: one table entry each (`stat` names are in `progress.statVal`).
- Save changes: bump `SAVE_VERSION` and extend `migrate`.

## Assets
1. Edit `PAL` / `P` or add a `build_x()` in `tools/build_assets.py` and register it in `ASSETS`.
2. Over the Blender MCP: `g = {'__name__': 'eg'}; exec(open(r'...\tools\build_assets.py', encoding='utf-8-sig').read(), g); g['build'](['hero_ash'], previews=True)`. `g['contact_sheet'](names, 'views'|'game', 'out.png')` for review.
3. `npm run models:optimize`, add the name to `MODEL_NAMES` in `src/models.js`.
- Gotchas from session 1 still apply (Store Blender cannot be launched from a shell; PowerShell `Set-Content -Encoding utf8` adds a BOM; Vite dev port 5188). Bash heredocs containing certain quote patterns fail in this tool: write patch scripts to files instead.

## Balance and telemetry
- `__eg.game._debugSim(400)` runs a headless bot run in about 1 s. `DBG.noNew = true` disables the new enemy types for A/B. The bot is naive (kites, no aiming); use it for relative comparisons only. Results are in CHANGELOG 0.3.0.
- Local run history is in `save.tele` (last 40 runs). Nothing leaves the device.

## Known gaps / ideas
- Bulwark's front plate reads as a flat slab; Gloom Moth reads bat-like; hero_ash and boss_ashen_warden are scripted primitives like the earlier heroes. See "NEEDS REPLACEMENT / optional upgrades" in plan.md for image prompts.
- New weapons reuse existing sounds. Hero cosmetics are trail colours only (no lantern/cloak tint yet).
- The Ashen Warden has no unique vulnerability window beyond +30% damage while the light is dimmed.
- Ranged Spitter shots reuse the Stag's volley pool (MAXS 90); heavy boss volleys plus many spitters can starve it.
- Mobile touch was not tested on a device.

## Next session (planned)
1. CrazyGames SDK in `src/platform.js` (data, gameplayStart/Stop, loading events; `loadModels()` resolution is `loadingStop`).
2. Staged loading (models are 590 kB, so this is optional now), then QA on real low-end hardware: confirm 60 fps with 150+ enemies, tune the quality tiers, test touch on phones and tablets.
3. Playtest the checklist in plan.md and rebalance with real data.
