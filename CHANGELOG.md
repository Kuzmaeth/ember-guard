# Changelog

## 0.6.1 (unreleased)
- Heroes rebuilt smooth: smooth-shaded GLBs (1.8x finer segments, Catmull-Rom lathe profiles), neck, brows, mouth, smaller head, longer legs.
- New `SMOOTH` shader define for hero materials (true vertex normals + soft wrap light).
- Hero animation: knee bend, lagging forearms, head nod/tilt, cape that bends toward the hem, eased facing/move amount, run lean and step sway.
- Softer early swarm (`RET.earlySwarm`): deaths before 1:00 11 -> 6 of 30 bot runs (noisy).

## 0.6.0: New boss, champions, sparks, juice, remodels (2026-10-03)

Screenshots: `screenshots/s3c_*`. Model previews: `assets/previews/boss_drake_*`, `enemy_bulwark_*`, `enemy_gloommoth_*`, `boss_ashen_warden_*`.

### The Cinder Drake replaces the Hollow Stag
- New Blender model `boss_drake`: a squat charcoal-crimson dragon with lava belly scutes, a chest furnace, a spiked ember spine, swept horns, a fanged jaw, a spade tail and membrane wings. 2644 tris, 62 kB.
- New shader joint 10 flaps the wings in mirror (`gfx.js`).
- Attacks are re-themed: lunge (charge), tail slam (stomp), and **fire breath**, an 11-ember cone aimed at you instead of the deer's radial antler ring.
- Names, banners, codex and tasks are updated. Boss key `stag` -> `drake`; saves migrate (`seen.b.stag` -> `seen.b.drake`).
- The old model moved to `assets/retired/` and no longer ships.

### Champion every 90 s (retention.js `champion`)
- From 1:30, every 90 s (not during the boss fight), an oversized elite arrives with its own bar.
- There's an 8 s warning ("A CHAMPION APPROACHES").
- It rotates between Ironhide (Brute), The Glutton (Ember Eater) and Old Matron.
- It chases the hero and never gnaws the fire. Every 5.5 s it does a telegraphed ground slam (three circles toward you). Contact hits do 1.5x.
- **Kill reward:** a Cinder Chest, 3 big XP gems, coins, sometimes an Ember Log, plus the "CHAMPION SLAIN" slow-mo, shake and confetti.
- **Measured** (bot, 12 runs each, run index 3): mean survival 141 s with champions vs 131 s without. The bot killed the champion in 7 of the 9 runs that reached 1:30.

### Spark: pre-run perk (retention.js `perk`)
- From run 2 on, PLAY or ONE MORE RUN first shows **PICK YOUR SPARK**: three of eight small run-only perks.
  - The perks: +20 max health, +8% speed, starting weapon at level 2, +12% fire size, +30% pickup range, +15% coins, +12% XP, +6% crit.
  - Pick with 1/2/3, Space/Enter (first) or a tap. No timer.
- The chosen spark is stored in telemetry (`pk`).

### Juice (retention.js `juice`)
- **Combo meter:** a solid panel with a draining combo-window bar and tier colours from gold to red to pink. A rising musical note plays every 10 kills (pentatonic scale), with small per-kill shake by tier. When a combo of 20+ ends, its size floats up ("COMBO 47").
- **Near death:** under 30% HP a heartbeat speeds up as health drops, the screen edge pulses red in time, and all sound is muffled through a low-pass filter. Climbing back above 45% after dropping under 25% plays a "SECOND WIND" release (whoosh, chord, flash, burst), at most once per 12 s.
- **Chest charge-up:** a chest no longer opens instantly. It hums (rising tone) for about 0.9 s of slow-motion with a column of sparks, then bursts (pop chord, shake, hitstop) into the card pick.
- **Damage numbers:** "Big hits" mode also rate-limits crits to one every 80 ms.

### Remodels (Blender)
- **Bulwark** (1270 tris, 30 kB): a curved tower shield of seven arched staves, bone rim, gold boss with an ember gem, rivets and a spiked crest. It replaces the flat slab.
- **Gloom Moth** (1452 tris, 36 kB): a fuzzy thorax with a fur collar, banded abdomen, swept-back delta forewings with glowing eye-spots and veins, rounded hindwings, feathered antennae. It no longer reads as a bat.
- **Ashen Warden** (3886 tris, 95 kB):
  - Humped shoulders.
  - Five layered armour plates with rims, rivets and molten seams.
  - An ember-tipped mane.
  - A sculpted head: brow plate, snout disc with glowing nostrils, curling tusks, burning horns, a jaw.
  - A caged chest forge, armoured knees and split hooves.
- Both enemies are over the old 800-tri enemy budget. Measured: 41 draw calls and 298k tris with 213 enemies plus the boss on screen.

### Size
- JS 788 -> 796 kB (224 -> 228 kB gzip), CSS 52 -> 54 kB.
- Models: +62 kB drake, -46 kB stag, about +55 kB for the three remodels. dist 1.84 MB in total.

## 0.5.0: UI v2 and in-screen retention features (2026-10-03)

Before/after screenshots: `screenshots/s3b_before_*` and `screenshots/s3b_after_*`. Plan: plan.md, "SESSION 3b".

### UI v2 (`src/ui2.css`, loaded after style.css)
- **Solid surfaces everywhere.** Panels, cards, rows and HUD pills are opaque. Menus sit on a 90% dark backdrop, so no text sits on the 3D scene.
- Type floor raised: 12 px for captions, 14-15 px for body text.
- One primary (orange) action per screen. Buttons are at least 48 px tall. A shared token set (`--s0..s3`, `--line`, `--mute`).
- **Hub rebuilt:**
  - Top bar: profile, rank, account level bar, wordmark, coins, settings.
  - The campfire and hero are visible in the middle; the hero now stands beside the fire.
  - Three cards: NEXT UNLOCK (with the exact condition and the two after it), PLAY (loadout chips and an "afford N upgrades" link), TASKS.
  - A solid four-button nav.
  - Phones: the fire stays visible above PLAY; the nav sits under PLAY; the rest scrolls; no horizontal overflow.
- **Level-up:** dark backdrop, larger card text, a solid odds bar with 1/2/3 key hints.
- **Pause:** your current build (weapons with level, evolved or borrowed, plus passives), live task progress, and a focused RESUME button.
- **HUD:**
  - Tips moved from over the hero to the top, under the timer, in a solid card.
  - Wave, light and pace labels sit in solid pills.
  - New live task tracker at the top right.
- **Heroes screen:** the world isn't drawn while it is open. Only the hero preview renders, on a solid backdrop, which also saves GPU.
- **Codex:** items you have unlocked but not found read "NOT FOUND YET" with their name and icon, instead of "???".
- **First-run screen:** the logo is at the top and the call to action at the bottom, so the campfire shows.

### Retention features in the new screens
- **Session tasks (4.5, 4.4).**
  - Three tasks per play session from 8 types: foes, runs, chests, reach the boss, evolve, level in one run, survive time, kill streak.
  - Targets scale with account tier, and rewards are real coins paid at run end.
  - A mid-run "TASK DONE" banner tells you the reward comes at run end.
  - Shown in the hub, on the HUD, in pause and on results.
  - Tasks are regenerated per page visit and when all three are done. No timers.
- **Results v2 (4.1, 5.2, 5.4, 8.2).**
  - Peak moment first ("Your best moment: a 40 kill streak at 0:29").
  - Time with your best, then four stat tiles with real personal bests and NEW BEST.
  - SO CLOSE: the nearest unmet goal, picked automatically from boss HP left, XP to the next level, unlock progress and task progress.
  - Tasks, progress and rewards.
  - Fits a 1280x720 screen without scrolling. On phones the action bar is pinned to the bottom.
  - ONE MORE RUN has focus, and Space or Enter retries (verified: results -> run, telemetry `r`).
- **Damage numbers** setting: All / Big hits / Off. The default is Big hits (crits and boss hits), which cuts the number clutter in the centre of the screen.

### Size
- JS 778 -> 788 kB (221 -> 224 kB gzip); CSS 35 -> 52 kB (8.5 -> 11.6 kB gzip). No new assets.

## 0.4.2: Game feel, "snappy" pass (2026-10-03)

Measured with the new dev probe `__eg.game._debugFeel(secs)`, which replays the frame loop at 60 Hz with the bot and counts frozen, slowed and level-up-paused frames plus each hitstop's source.

- **Hitstop overuse (main cause of the stutter feel).** Before: about 2 hitstops per second (215 in a 2-minute Warden run), each freezing the game for 25-40 ms; 3.8% of all frames were frozen. Sources were every crit, every bomb or mine explosion, and every kill of an enemy type index 2 and up.
  - Removed for crits and explosions; screen shake stays.
  - **Bug fixed:** "big" kills were `type >= 2`, which counted the small Spitter, Blast Bug and Gloom Moth as heavy. Now `radius >= 0.85` (Brute, Bulwark).
  - Minor hitstops (under 50 ms) are rate-limited to one per 300 ms of real time. Big moments keep theirs: elite kills, boss roars, evolutions, Last Stand, death and victory.
  - After: 0.1% frozen frames (Warden), 0% (Monk with Nova).
- **Movement response (core-loop change, logged):** acceleration factor 0.16 -> 0.38 per step. 63% of top speed is reached in about 33 ms, down from about 100 ms. Stopping is equally quicker.
- **Camera follow:** 6 -> 11, so the camera trails the player by about 90 ms instead of about 170 ms.
- **Level-up:** the slow-motion lead-in is 0.28 -> 0.2 s, and the cards animate in 0.3 s instead of 0.5 s.
- Balance check with the bot, engine off, run 1: mean 71 s over 20 runs vs 82 s over 30 before. That is within this bot's noise, since about half its runs end at 31-35 s to the skitter swarm either way.

## 0.4.1: Performance (2026-10-03)

### Ember Nova / ring-weapon lag (fixed)
- **Cause:** every kill updated the streak counter with "remove class, read `offsetWidth`, add class". The read forces a full synchronous page layout. A nova ring kills 30-60 foes in one step, which meant 30-60 forced layouts in one step. The same trick was used for the coin pop, level pop, banner, screen flash, damage-direction wedge and health-bar hit.
- **Fix (`ui.js`):**
  - Streak and coin pops are recorded per kill or pickup and applied once per frame in `updateHud`.
  - All animation restarts use the Web Animations API (`restart()`), so there is no forced layout.
  - The flash uses `element.animate`.
- **Measured** with the dev frame benchmark, monk with evolved Ember Nova and about 200 enemies refilled every second, 360 frames, this desktop. Simulation per frame:

  | | Average | Worst |
  |---|---|---|
  | Before | 5.3 ms | 30 ms |
  | After | 0.5-1.0 ms | 2-5.5 ms |

  Ember Bolt for comparison: 0.25-0.3 ms. Render, GPU and layout were already small (about 1 ms each) and unchanged.

### First-frame hitches (fixed)
- **Cause:** shader programs were compiled on first use, in the post-processing target variant, and hidden meshes (boss, telegraphs) only on first appearance. The first in-run frame took 63 ms.
- **Fix:** `gfx.prewarm()` runs during loading, called from `game.init`. It:
  - compiles the scene and the bloom and composite passes for the real render targets
  - makes hidden objects visible for the compile
  - does one offscreen draw of every mesh, which never reaches the screen
- **Result:** first in-run frame 63 -> 8 ms; first boss frame about 5 ms.

### Death FX budget
- Per step, the first 14 small-foe deaths get full particle bursts; further deaths in the same step get a 2-particle puff. Big foes always get the full burst. This caps particle-pool saturation and additive overdraw on weak GPUs when rings kill large crowds.

### Dev tools
- `__eg.game._debugBench(frames)`: per-frame timing split into sim, render, GPU (forced sync) and layout, with avg, p95, max and frames over 16.7 ms.
- `_debugSim` logs step timing.
- `__eg.G` exposes the gfx module in dev builds.

### Not measured
- A low-end device. All numbers are from this desktop; on a 3-4x slower CPU the old nova path would have cost 15-20 ms per step, times up to 5 steps per frame.

## 0.4.0: Retention Engine, rollout step 1 (2026-10-03)

All systems sit behind `src/retention.js`: one `master` switch plus one switch per system, and every tunable. Dev A/B from the URL: `?ret=off` or `?ret=-deathClock,-drama`. With `master: false` the run plays as in 0.3.0. The only exception is the Dawnblade entry in the codex and shop data.

### Stage 1: death clock and drama curve
- **Silent death clock (1.1).** Runs 1-3 get a target time T, random between 3:00 and 4:00 per run. Before T:
  - A lethal hit leaves the hero at 1 HP with 2 s of invulnerability.
  - The fire going out leaves it at 15%, immune for 2.5 s, then taking half damage for 4 s.
  - While the fire is under 25%, damage to it is x0.45, up to 50 s per run.
  - Each save is followed by 8 s of spawning at 35%.
  - Caps: 4 saves per run, at least 6 s apart. No VFX and no text.
  - After T, death is allowed again.
  - During the boss fight, player damage to the boss rises in 5% steps (max +35%) only while the projection says the boss would sit above 15% at T. The nudge switches off once the boss is under 15%, so the last stretch is always the player's own damage.
- **Drama curve (1.2).**
  - Dominating (boss under 30%, player HP above 70%, fire above 60%): the boss enrages once, with a banner, attacks 25% faster and 10 adds. It never fires on top of a phase roar.
  - Crushed (HP under 35% or fire under 30% for 5 s): Ember Log drop chance x2.5, at most 2 extra logs per minute.
- **Last Stand (1.3).** Visible, once per run. A killing blow pushes nearby enemies back and gives 1 s of invulnerability, then 6 s at 1 HP with +50% damage. 12 kills in that window heal 40% ("STAND HELD!").
  - HUD badge shows "LAST STAND READY", and during the stand the kill count and seconds left.
  - A hint in run 1 explains it; new sound `laststand`.
- **Director overlay (1.4).** F3 in dev builds shows switches, death-clock state, boss nudge, drama state, Last Stand, jackpot, loan, the intervention log, a local death-time histogram and retry stats.

### Stage 2.1: jackpot run
- Every 10-15 runs (random), all level-up and chest cards roll legendary for one run. There is no banner. The odds line truthfully reads "Legendary 100%" on that run, never a false 5%.

### Stage 3.1: loaner weapon
- New weapon **Dawnblade**: a full-circle cut with gold sparks. It evolves into Noonblade with Swift Boots. New `sword` icon.
- Run 2 opens with the Dawnblade at level 3, shown as "BORROWED: DAWNBLADE" with a LOAN tag on its slot.
  - It never takes a level-up pick, so the player never invests a choice in it.
  - A warning hint comes 10 s before it is taken back.
  - At 60 s it is reclaimed: the slot icon cracks, greys out and lifts off with a "-DAWNBLADE" tag, plus a banner and the new `reclaim` sound.
- The results screen and the shop show an **Armory** offer at a fixed **450 coins**, the same for every player (see plan.md for how this was chosen). Buying it adds it to the level-up pool for good.

### Telemetry (part of stage 9)
- Each run record also stores:
  - run number and run index
  - retry/quit: `r` = ONE MORE RUN, `h` = played again via the hub, `q` = left the page (set on next load)
  - intervention counts
  - Last Stand use (0 unused, 1 used, 2 held)
  - jackpot and loan flags
  - death-clock T, the largest boss nudge, boss HP at the end
- Everything stays local, as before.

### Save
- Save v3 adds `ret` (`jackpotAt`, `loanDone`). v2 saves migrate in place.

### Measured (headless bot, see plan.md for the full table and caveats)
- Run 1, 30 runs each: mean survival 82 s (off) vs 142 s (on); median 81 vs 125 s; wins 0 vs 5; reached the boss 4 vs 12. Deaths in 3:00-4:00: 3 vs 6 of 30.
- Size: JS 767.6 -> 777.6 kB (216.8 -> 220.7 gzip), CSS 33 -> 35.4 kB. No new assets.

## 0.3.0: HUD, hub, progression and content (2026-10-03)

### Hero models v2 (rounded)
- All four heroes rebuilt: profile-lathe coat, hats and cape, round tapered limbs, finer head, shoulder/elbow joints, ears, round hands. 4.9k to 5.0k tris each (budget 5k), about 105 kB each. Fixes a bug where Ash used the Warden model in game and in the preview.

### Rendering fixes (earlier in the session)
- Grass rebuilt as solid, wider, 3-triangle blades (vertex-coloured, wind sway and distance fade in the shader). Ground gets crisp world-space detail (hard-edged patches, pebbles, flecks), flatter facet lighting.
- `antialias: true`; pixel ratio never below 1; adaptive quality now also recovers when FPS returns; modal backdrop blur removed (it blurred the 3D canvas).

### In-run HUD (stage 1)
- Bottom-centre dock: weapon row (level pips, cooldown overlay, EVO/READY states), health bar (numbers, white damage trail, low-health pulse + icon), XP bar with level badge ("ready" pulse above 90%).
- Fire is the signature readout: top-left flame badge, fire bar, `LIGHT x.x m`, "FIRE LOW" text warning (blink, not colour only), moth / bargain / pulse status in the same line.
- Top centre: timer, wave, pace vs best. Top right: kills, coins, pause (44 px). Boss bar: name, phase `n / 3`, phase markers.
- Damage-direction wedge, one evolution hint line ("Ember Bolt Lv 3: 2 more levels, needs Quick Wick to evolve").
- Design tokens (type scale, palette) in `style.css`; compact layout under 620 px; safe-area insets.

### Hub and screens (stage 2)
- New `src/hub.js`: Hub (play button always first, next-best-thing, tiles), Heroes (carousel, **live 3D preview** drawn into a scissored rectangle of the main canvas: no second WebGL context, created on open, disposed on close, half rate when quality is low), Upgrades, Codex (weapons, evolutions, foes, bosses, completion %), Goals, Night Pacts, Settings (quality, two-step reset).
- Pause menu gets "Quit to hub" (no rewards for quit runs, stated on screen).

### Progression (stage 3)
- Save v2 (`progress.js`), v1 saves migrate once. Account level and ranks (30 levels, XP from time/kills/win), hero mastery 1-10 (perks and ember-trail cosmetics), goal-based unlocks with exact conditions and progress, 22 achievements, codex discoveries, "next best thing" nudge, run summary with count-up, XP bars, level-up / unlock / achievement callouts. Account and mastery perks are small and listed (`ACCT_PERKS`, `MASTERY_PERKS`).

### Content (stage 4, data-driven in `data.js`)
- Hero: Lantern Witch Ash. Weapons: Cinder Wisp, Ash Whip, Spark Mines, Beacon (each with an evolution). Enemies: Spitter (ranged), Bulwark (frontal shield), Blast Bug (exploder), Gloom Moth (shrinks the fire), Hollow Matron (summoner elite). Boss: The Ashen Warden (lava barrage, shield bearers, dimming light). Area: Frostmere Marsh (slow puddles); Ashen Hollow gets ember geysers.
- Night Pacts (5, chosen in the hub), wayside shrines (Dark Bargain / Warm Blessing), Light Pulse (stand still by the fire).
- **Core-loop changes, logged:** (1) Light Pulse is a new standing-still reward near the fire, off cooldown 12 s; (2) new enemy types enter after 38 s at up to 15% of spawns; (3) elites alternate Ember Eater / Matron (every third is a Matron); (4) enemies now lit by Wisps count as "in the light"; (5) first level-up arrives at about 6-15 s in simulation (target 15 s).
- Balance: headless sim with a naive kiting bot, 8 runs each: baseline 164 s average survival vs 167 s with new enemies after tuning (first tuning pass had them at about 98 s and was reduced).

### Models (stage 5)
- 7 new Blender GLBs (hero_ash 1702 tris, enemy_spitter 754, enemy_bulwark 616, enemy_blastbug 710, enemy_gloommoth 496, enemy_matron 1114, boss_ashen_warden 1652). All within budget. Procedural fallbacks exist for each. Unused `grass.glb` removed.

### Dev tools (dev builds only)
- F2 telemetry overlay (fps, enemies, draw calls, triangles, quality, run history, deaths by cause); `__eg.game._debugSim(secs)` headless bot run, `DBG` switches for A/B balance.

## 0.2.0: 3D model upgrade (2026-10-03)

Visual-only change. Gameplay, balance, hitboxes, controls, progression and UI are untouched.

### Added
- 25 Blender-built, flat-shaded, low-poly models with one shared palette, in `public/models/*.glb` (404 kB total, Meshopt-compressed):
  - 3 heroes, the Hollow Stag boss, 4 enemies and the Ember Eater elite.
  - Campfire, 4 tree variants, 2 rocks, stump, fence, lamp, banner, ruin pillar, mushroom, grass, gem and chest.
- `tools/build_assets.py`: regenerates every model from the palette (`PAL`) and proportions (`P`), exports GLBs, renders previews and saves `assets/blender/ember_guard_assets.blend`.
- `tools/optimize.mjs` (`npm run models:optimize`): weld/dedup/prune, quantize, pack custom attributes, Meshopt.
- `src/models.js`: GLTFLoader + MeshoptDecoder. It converts GLBs into the existing shader's attribute layout, so firelight, fog, hit flash, instancing and shader joint animation work unchanged.
- New decoration: 18 stumps around the clearing. Trees split into pine A / pine B / broadleaf variants, rocks into two variants (the same placement sequence is reused).
- Dev-only helpers, stripped from production builds:
  - `?nomodels` URL switch, which tests the procedural fallback.
  - `__eg.game._debugSpawn(type, n, r)` and `_debugBoss(x, z)` for visual checks.

### Changed
- `src/main.js` waits for the models before starting the game. Loading never fails: a missing or broken GLB falls back to the old procedural geometry, and a stalled network times out after 10 s.
- Rock tint is pulled toward grey so moonlight no longer turns rocks bright blue.

### Size
- First load = total: 624.5 kB (3 files) → 1130.7 kB (28 files). JS +120 kB (loader + decoder), models +404 kB.
- With 174 enemies on screen: 36 → 40 draw calls, 238k → 244k triangles.
