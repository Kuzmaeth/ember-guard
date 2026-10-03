# EMBER GUARD

3D low-poly survivor roguelite. Three.js + vanilla JS + Vite. No SDK, no ads, no network calls beyond its own files, no bitmaps or audio files. Models are Blender-built GLBs (`public/models`, 404 kB) with a procedural fallback; audio is procedural.

## 3D models
- Source of truth: `tools/build_assets.py`, with palette `PAL` and proportions `P` at the top. Edit, then regenerate:
  1. In Blender, open `tools/build_assets.py` in the Scripting tab and click Run Script. It rebuilds every asset into `assets/models/*.glb` and saves `assets/blender/ember_guard_assets.blend`. Headless `blender -b -P tools/build_assets.py -- --only enemy_creeper --previews` works with a non-Store Blender on PATH.
  2. Run `npm run models:optimize` to write `public/models/*.glb`.
- GLB layout: `POSITION`, `NORMAL`, `COLOR_0`, `_EM` (emissive), `_JOINT` (shader joint id), `_PIVOT` (joint pivot, mm). `src/models.js` maps them to the shader attributes.
- Dev checks: `?nomodels` (procedural fallback), `__eg.game._debugSpawn(type, n, r)`, `__eg.game._debugBoss(x, z)`.
- Plan, style guide, size table: `plan.md`. Licenses: `LICENSES.md`.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ (relative paths)
```

Controls: WASD/arrows or drag (touch/mouse) to move; auto-attack; 1/2/3 or tap to pick cards; Esc/P pause.

## Architecture
- `src/platform.js`: the only place touching storage / gameplayStart/Stop / loading events. Swap for the CrazyGames SDK later.
- `src/gfx.js`: one custom lit shader (fire pool, hero lantern, fog; no Three lights/shadows), procedural geometry, InstancedMesh helpers, point-sprite particles, world builder.
- `src/game.js`: fixed 60 Hz sim with interpolated rendering, SoA enemy pools, spatial hash, weapons, boss, director, save.
- `src/audio.js`: WebAudio SFX and layered generative music (filter opens with fire size; layers follow danger).
- `src/ui.js`: HUD, modals, joystick, pooled damage numbers. `src/data.js`: content tables.

## Progression (one currency, one ladder)
- **Coins** are the only meta currency. Results show an itemized breakdown (picked up, kills, time, dawn bonus, Fortune, first-run bonus).
- **Upgrades** (8 tracks x 5 levels) are permanent; each card shows the current effect and the next level's effect.
- **Ember Road**: one unlock per finished run, win or lose (Wren, Powder Bomb, Ashen Hollow, Cinder Monk), shown as a track with a NEXT marker on the hub and results screens.
- **Rank** = upgrade levels bought + Ember Road steps (Ember Novice to Dawnbringer). No separate XP bar.

## Rendering
Custom post pass (half-float target, MSAA on desktop): bright-pass bloom at 1/4 res, soft highlight shoulder, teal-shadow/warm-highlight grade, vignette, dither. Shader fire (fbm billboards), terrain-following blob shadows, glowing mushrooms, hanging lamps with their own light pools, rim light. Characters are faceted Blender models (procedural lathe/capsule fallback) with shader-driven joint animation (legs, arms, cape, head; eight-leg scuttle for spiders). Adaptive quality drops bloom at level 2 and post entirely at level 3.

## Mechanisms (psychology)
- **Fire = base, light, buff zone, mix and grade.** Radius shrinks when gnawed; foes in light are slower and take extra damage, in the dark faster and harder-hitting. Tension and positioning in every second.
- **Micro-commitment ladder:** first level-up within ~15 s; run 1 always pays at least one affordable upgrade; every run ends with a new unlock (Wren, Powder Bomb, Ashen Hollow, Cinder Monk); run 2 reveals Elites + Cinder Chests; run 3+ has a longer, bigger dawn finale (peak-end).
- **Variable rewards with visible odds:** card rarity odds are shown on each pick; Golden Wisps (about 2.5% of Creepers, flee, expire after 9 s) are skill-caught.
- **Goal gradient:** Ember Road NEXT marker, rank bar ("N more to <rank>"), "N more coins for your next upgrade", pace vs. your own saved best run.
- **Evolutions:** weapon Lv5 plus its paired passive offers a guaranteed legendary evolution card.
- **Flow:** spawn pressure follows hero HP and fire; quick deaths soften the next run, easy wins add density; Last Ember comeback once per run; restart is one tap.
- **Near-miss:** boss telegraphs and projectiles that barely miss trigger slow-mo and a bonus gem.
- **Identity:** nickname prompt after run 1 (skippable, filtered), rank titles, personal best card.

## Ethics
No timers, scarcity, fake players or real-money elements. Only real saved data is shown. Settings: sound, music, shake, reduce flashes, vibration, privacy text, erase data.

## Status / known gaps
Implemented but not fully playtested: the browser preview used here renders at software speed, so only the start screen and first frames of a run were visually verified (no console errors). Balance, mobile performance, and the full boss/results flow still need real-device testing. Tuning points: ground and tree brightness, enemy counts (`maxEn`), boss HP (`BOSS_HP`).
