# EMBER GUARD: 3D model upgrade plan

Scope of this session: 3D models only. No gameplay, SDK, loading or UI changes.

## Stage 0 audit (2026-10-03)

**How models are made today.** Everything is procedural, built in `src/gfx.js` at startup. Three.js primitives (icosphere, cone, cylinder, lathe, capsule, torus) are merged by the `GB` builder into one non-indexed BufferGeometry per asset. Each geometry carries custom attributes:
- `aCol`: vertex color, jittered per triangle.
- `aEm`: emissive flag.
- `aNrm`: normal.
- `aJ`: joint id for shader animation.
- `aPv`: joint pivot.

No files are loaded, there are no textures, and there are no Three.js lights or materials apart from one custom `ShaderMaterial` (`makeLit`).

**Rendering.** Every repeated object is an `InstancedMesh` (`makeInst`), with a per-instance tint (`aTint`, used for hit flash, gold and stun) and per-instance animation data (`aAnim` = phase, movement, idle). The vertex shader rotates parts around `aPv` by joint id:
- 1/2: legs (X axis)
- 3/4: arms
- 5/6: spider legs (Y axis)
- 7: ghost sway
- 8: head
- 9: cape

The camera always looks straight at the scene and nothing moves its matrices on the CPU. Instancing works per type: the hero (1), each of 5 enemy types (caps of 400/400/90/120/24), the boss (1), gems, the chest, projectiles, 300 trees, 46 rocks, 260 grass tufts, 72 mushrooms, 22 posts, 3 banners, 4 lamps and the camp. That comes to roughly 25 draw calls plus the post-processing passes.

**Current triangle counts.**

| Asset | Tris |
|---|---|
| hero_warden | 5836 |
| hero_wren / monk | 4960 |
| creeper | 872 |
| skitter | 872 |
| brute | 936 |
| wraith | 420 |
| ember eater (elite) | 1336 |
| boss | 1564 |
| tree | 112 |
| dead tree | 128 |
| rock | 80 |
| camp | 1024 |
| gem | 8 |
| chest | 36 |
| mushroom | 104 |
| lamp | 124 |
| fence post | 24 |
| grass | 48 |

**Build size (before).**

| File | Size | Gzip |
|---|---|---|
| dist/index.html | 2.1 kB | 0.9 kB |
| dist/assets/index.css | 20.6 kB | 5.5 kB |
| dist/assets/index.js | 601.8 kB (Three.js is most of it) | 166.3 kB |
| **Total** | **624.5 kB** | |

There are 3 files. First load equals total, because there are no assets.

**Camera the player sees.** A perspective camera with 45° FOV (53° in portrait), 13.2 m above the ground and 9.8 m behind the hero. That's about 16.4 m from the target, looking down at roughly 53°. Danger zoom widens it by up to 22%, and portrait mode pulls it back 55%. At 1280x720 a common enemy (about 1.2 m) covers roughly 45 to 55 px, the hero about 70 px and the boss about 250 px. Silhouettes must read from **above and slightly in front**. The top outline matters most, and heads, eyes and antlers must be visible from 53° down.

**What the testers saw.** The "blocky" complaint comes mostly from:
- 112-triangle cone trees.
- 80-triangle rocks.
- Spiders made of raw cones.

## Integration approach (decided)

- Models are authored in Blender by `tools/build_assets.py`, exported per asset as GLB, and optimized with gltf-transform (weld, dedupe, prune, quantize, Meshopt). The output goes to `public/models/*.glb`. Because the files sit under `public/`, Vite copies them with relative paths.
- **GLB vertex layout** (no textures, no materials beyond one placeholder):
  - `POSITION`, `NORMAL` (flat).
  - `COLOR_0`: palette color, set per face.
  - `_EM`: emissive strength, 0 or 1.
  - `_JOINT`: shader joint id.
  - `_PIVOT`: joint pivot, in game Y-up space.
- `src/models.js` loads the GLBs with GLTFLoader plus MeshoptDecoder. It converts each GLB into exactly the attribute layout the existing shader expects (`aCol/aEm/aNrm/aJ/aPv`), so lighting, fog, hit flash, instancing and shader animation work unchanged.
- **Fallback:** if a GLB fails to load or is missing, the old procedural geometry from `gfx.js` is used. The game never breaks.
- **Hitboxes:** hitboxes live in `ET[].r` and the sim. They are completely separate from the visuals and are not touched. Visual scale is kept close to the old models, so what you see matches what you hit.
- Meshopt was chosen over Draco: its decoder is about 20 kB inside the JS bundle with no separate wasm file, while Draco needs about 300 kB of extra files.

## Asset list

The front of each model faces -Y in Blender, which becomes +Z in the game, matching `efc` facing. Origin at the feet, 1 unit = 1 m.

| Asset (file) | Purpose | Tri budget | Silhouette notes | Palette | Animation |
|---|---|---|---|---|---|
| hero_warden | default hero, lantern-bearer | ≤ 5000 | big round head (about 40% of height), wide-brim hat, red cape, lantern in right hand | hero blue, cloak red, bark, skin, ember | shader joints: legs, arms, head, cape; code bob/squash |
| hero_wren | ranger, bow | ≤ 5000 | pointed green hood with a feather, quiver, slimmer | moss, pine, bark, skin | same |
| hero_monk | cinder monk | ≤ 5000 | wide orange hood, prayer beads, chunky | ember orange, bark, bone | same |
| enemy_creeper | basic shadow spider | ≤ 800 | round abdomen plus small head, 8 kinked legs (knee up, foot down) give a "spider" read from above, 2 big red eyes plus 2 small | indigo, plum, eye red | spider-leg joints 5/6; code wobble/bob |
| enemy_skitter | fast small spider | ≤ 800 | small, thin, very long legs, yellow eyes, spiky back | indigo-teal, eye gold | 5/6 |
| enemy_brute | tank spider | ≤ 800 | heavy, armored back plates, bone horns, thick legs | plum, bone, eye red | 5/6 |
| enemy_wraith | floating ghost | ≤ 800 | hooded teardrop body, ragged tail, long claw arms, cyan eyes | indigo, cyan | 7 sway; code float |
| enemy_ember_eater (elite) | elite: eats fire | ≤ 2000 | big spider with glowing ember cracks, lava horns, maw | plum, ember, eye gold | 5/6 |
| boss_stag (The Hollow Stag) | boss | ≤ 10000 | four-legged stag of shadow, huge glowing ember antlers (key silhouette from above), hollow chest with ember core | plum, indigo, ember, bone | joints 1/2 legs, 8 head; code bob |
| camp | campfire base | ≤ 1500 (centerpiece, exempt) | stone ring of 10 faceted stones, crossed logs, ash disc | stone, bark, ember | none (shader flames stay) |
| tree_pine_a/b | forest pines | ≤ 500 | layered, drooping, faceted tiers with an irregular silhouette | pine, moss, bark | none |
| tree_round | broadleaf/bush tree | ≤ 500 | lumpy faceted crown, crooked trunk | moss, pine, bark | none |
| tree_dead | Ashen Hollow | ≤ 500 | twisted trunk, forked branches | bark, stone | none |
| rock_a/b | rocks | ≤ 300 | faceted boulders, flat-ish base | stone | none |
| stump | ground prop | ≤ 300 | cut stump with rings, roots | bark | none |
| fence | ring fence post | ≤ 300 | post plus rail, crooked | bark | none |
| mushroom | glow accent | ≤ 200 | cap plus stem, cap emissive | bone stem, tinted cap | none |
| grass | tuft | ≤ 80 | 3 to 5 blades | moss | none |
| lamp | hanging lamp | ≤ 400 | post, arm, lantern | bark, ember | none |
| banner | camp banner | ≤ 200 | pole plus cloth | bark, cloak red | none |
| gem | XP pickup | ≤ 60 | faceted crystal | white (tinted per kind) | code spin/bob |
| chest | cinder chest | ≤ 400 | small chest with a glowing seam | bark, gold | code spin |

## Style guide (locked at Stage 2)

- Flat-shaded, faceted low-poly with one color per face and slight per-face value jitter (±5%) so facets read in firelight.
- Chunky proportions. Characters have oversized heads (about 0.4 of height), short legs and big readable features (eyes, hats, antlers).
- Silhouettes are designed for the top-down 53° view. Wide shapes read better than tall thin ones, and every enemy has glowing eyes on the top/front of the head.
- Mood: warm ember orange (fire, lanterns, ember cracks) against deep teal/indigo night. Enemies are dark indigo/plum so they separate from the green-teal ground by value and hue, and they get a red/gold/cyan eye glow that blooms.
- **One shared palette**, with values in shader space (linear multipliers, no color management):

| Name | Use | RGB (shader) |
|---|---|---|
| NIGHT | enemy body | 0.16, 0.11, 0.30 |
| PLUM | enemy dark parts | 0.09, 0.06, 0.17 |
| PINE | foliage dark | 0.10, 0.30, 0.27 |
| MOSS | foliage light, grass | 0.24, 0.48, 0.28 |
| BARK | wood | 0.36, 0.22, 0.12 |
| STONE | rocks | 0.38, 0.40, 0.46 |
| EMBER | fire, glow | 1.00, 0.52, 0.16 |
| BONE | antlers, horns, stems | 0.86, 0.80, 0.66 |

  Accents: EYE_RED (1.0, 0.18, 0.10), EYE_GOLD (1.0, 0.75, 0.15), SPIRIT (0.3, 0.85, 1.0), SKIN (0.98, 0.76, 0.6), HERO_BLUE (0.2, 0.32, 0.75), CLOAK_RED (0.75, 0.15, 0.15), GOLD (1.0, 0.8, 0.3), ASH (0.08, 0.05, 0.04).
- Conventions:
  - 1 unit = 1 m, origin at the feet (ground contact), Y up in the game (Z up in Blender, converted on export).
  - Front faces -Y in Blender and +Z in the game.
  - Transforms are applied and normals point outward.
  - No loose geometry.
  - Names are lowercase `category_name[_variant]`, for example `enemy_creeper`, `tree_pine_a`.
- No textures. Color is vertex color only, so the "palette material" is one shared material, and in the game the existing shader.

## Size budget

Models must total **≤ 6 MB** compressed, and the first load must not grow beyond that. Vertex-colored low-poly models are tiny, so the real target is **≤ 400 kB**. Expected sizes are roughly 2 to 6 kB per prop and 10 to 50 kB per character.

| Category | Allocation | Target |
|---|---|---|
| Heroes (3) | 1.5 MB | ~120 kB |
| Enemies + elite (5) | 1.5 MB | ~80 kB |
| Boss | 1.5 MB | ~80 kB |
| Environment + props | 1.0 MB | ~80 kB |
| Pickups | 0.2 MB | ~5 kB |
| Meshopt decoder (in JS) | 0.3 MB | ~20 kB |

## Stages and checkpoints

0. Audit and plan.md. **Done.**
1. Blender connection check, then the test enemy (Creeper) end to end: Blender, previews, GLB, optimize, in-game screenshot. Checkpoint: verdict, triangle count, kB.
2. Style guide locked; palette and the reusable `tools/build_assets.py` (palette and proportions as variables, one-run regeneration plus the `tools/optimize.mjs` step).
3. Remaining enemies, elite, props and environment.
4. Heroes and the Hollow Stag, with fallbacks marked where needed.
5. Integration pass: instancing, firelight/fog check, screenshots, performance.
6. Cleanup, final size report, HANDOFF.md, CHANGELOG.

## Status log
- Stage 0: done. Blender 5.2.2 LTS connected over MCP, glTF exporter present.
- Stage 1 (test asset `enemy_creeper`): 738 tris (budget 800), 20.7 kB optimized (102 kB raw). Two preview rounds; round 1 legs were too thin. Pivots and facing verified in game space. In-game screenshot: `screenshots/stage1_creeper_ingame.jpg`.
  - Build: JS 602 → 720 kB (166 → 199 kB gzip). GLTFLoader plus the Meshopt decoder account for +118 kB. Total dist 624.5 → 764 kB (4 files, including 1 GLB).
  - Correction to the audit: at 1280x720 the camera gives about 53 px per metre at the hero, so a Creeper with its legs is about 120 px wide, not 50.
  - Approved by the user after a real-browser test (2026-10-03).
- Stage 2: style guide and palette locked in `tools/build_assets.py` (`PAL`, proportions in `P`), with `tools/optimize.mjs` and the dev-only `?nomodels` fallback switch.
- Stage 3: 4 enemies, the elite and 16 environment/pickup pieces built. Preview rounds:
  - Brute: horns too small, legs too thin → fixed in round 2.
  - Wraith: looked like a stiff cone → redesigned as a tapering ghost.
  - Ember Eater: blew out in the bloom in-game (gate fail) → glow reduced in round 2, passes.
  - Rocks: too saturated blue under moonlight → tint pulled toward grey.
- Stage 4: 3 heroes and the boss built. Round 1 had hair poking through the faces and Wren's hood covering the eyes → fixed in round 2. The Stag's legs were thickened.
- Stage 5:
  - Integration: every model is instanced, tree and rock variants split one placement sequence, and the procedural fallback was verified with `?nomodels`.
  - Lighting: checked in Whispering Woods and Ashen Hollow.
  - Performance: see the table below.
- Stage 6: production build verified (`vite preview`: 25/25 GLBs load over relative paths, no console errors, debug helpers stripped).

## Size table (final)

| Asset | Tris | Budget | Optimized kB |
|---|---|---|---|
| hero_warden | 1728 | 5000 | 42.2 |
| hero_wren | 1724 | 5000 | 42.9 |
| hero_monk | 1862 | 5000 | 45.9 |
| boss_stag | 1880 | 10000 | 46.2 |
| enemy_creeper | 738 | 800 | 20.7 |
| enemy_skitter | 694 | 800 | 19.0 |
| enemy_brute | 680 | 800 | 18.7 |
| enemy_wraith | 504 | 800 | 15.8 |
| enemy_ember_eater (elite) | 1236 | 2000 | 33.5 |
| camp | 1232 | 1500 | 34.0 |
| tree_pine_a | 180 | 500 | 5.5 |
| tree_pine_b | 188 | 500 | 5.7 |
| tree_round | 372 | 500 | 13.0 |
| tree_dead | 288 | 500 | 8.4 |
| rock_a | 80 | 300 | 5.1 |
| rock_b | 120 | 300 | 6.3 |
| stump | 104 | 300 | 4.6 |
| fence | 66 | 300 | 3.9 |
| pillar | 48 | 300 | 3.7 |
| lamp | 168 | 400 | 5.8 |
| banner | 116 | 200 | 5.6 |
| mushroom | 92 | 200 | 5.1 |
| grass | 20 | 80 | 3.4 |
| gem | 20 | 60 | 3.5 |
| chest | 144 | 400 | 5.2 |
| **Total (25 GLBs)** | | | **403.7** (budget 6 MB) |

| Build | Before | After |
|---|---|---|
| JS bundle | 601.8 kB (166.3 gzip) | 721.7 kB (199.7 gzip): GLTFLoader + Meshopt decoder |
| CSS + HTML | 22.7 kB | 22.7 kB |
| Models | 0 | 403.8 kB |
| **First load = total** | **624.5 kB, 3 files** | **1130.7 kB, 28 files** |

**Performance.** Same scene with 174 enemies, quality level 0, 1280x720:

| | Draw calls | Triangles |
|---|---|---|
| Procedural (`?nomodels`) | 36 | 238k |
| Blender models | 40 | 244k |

The GPU load is essentially unchanged; the extra draw calls come from the tree, rock and stump variants. Real FPS could not be measured here, because the desktop app's browser pane gives no meaningful frame timing. The game's adaptive quality (`frame()` drops quality below 46 fps) is untouched.

## NEEDS REPLACEMENT

None of the shipped assets failed the gate. All of them read clearly at gameplay distance in firelight and fog.

**Optional upgrades.** These two are the weakest relative to the concept art. Scripted primitives limit how much character they can carry: the hero's face and clothing folds, and the Stag's muscular legs and fur. If you want a step beyond, generate a reference image and an image-to-3D model elsewhere and send me the GLB; I'll validate it, restyle it to the palette, add joints and optimize it.

- **hero_warden prompt:** "Original chibi fantasy lantern-bearer character, flat-shaded faceted low-poly 3D model, large round head about 40% of body height, wide-brimmed brown leather hat with a red band, short blue coat with brown belt and small gold buckle, red scarf and red cape, dark trousers, chunky brown boots, holding a small glowing orange lantern in the right hand, simple dot eyes and rosy cheeks, limited palette (blue, red, brown, warm skin, ember orange), neutral A-pose standing, front three-quarter view, plain light-gray background, no text, no logo."
- **boss_stag prompt:** "Original fantasy boss creature 'Hollow Stag', flat-shaded faceted low-poly 3D model, a huge shadowy deer made of deep indigo and plum facets, bone-white skull mask over the face with glowing orange eye sockets, enormous branching antlers that turn from bone at the base into burning ember-orange at the tips, a hollow ribcage in the chest cradling a glowing ember core, thick strong legs with dark hooves, spiky shadow mane along the spine, standing neutral pose, front three-quarter view, plain light-gray background, no gore, PEGI-12 friendly, no text."

---

# SESSION 2: UI/UX, hub, progression, content (started 2026-10-03)

## Stage 0 audit: what exists today

**Screens now.** Boot (`#fatal` only on failure) -> Attract (`#start`: logo, "TAP TO LIGHT THE FIRE" on run 0; from run 1 a hub card with rank bar, Ember Road, hero/area chips, START RUN, Upgrades / Heroes & Areas / Settings buttons) -> Run (HUD) -> Level-up modal (3 cards) -> Pause modal -> Results modal (stats, coin breakdown, Ember Road, rank, ONE MORE RUN / Upgrades). Name prompt after run 0. Camp modal has two tabs (Upgrades, Heroes & Areas incl. weapon list). Settings modal.

**HUD now.** Top: full-width thin XP bar, top-left level hexagon + HP bar + FIRE bar, top-centre timer + wave + pace-vs-best, top-right coin pill + pause, right: streak counter, top boss bar (below timer), bottom-left weapon slots (4) and passive row, centre hint + banner. Floating damage numbers are pooled DOM nodes.

**Progression now.** Local save `emberguard.save` (v1) via `platform.js`. One coin currency, 8 permanent upgrade tracks (5 levels). "Ember Road": 4 unlocks, one per finished run (Wren, Bomb, Ashen Hollow, Monk). Rank = upgrade levels bought + road unlocks, 6 ranks. Best-run pace, dynamic difficulty (`dda`). No mastery, achievements, codex or goals.

**Content now.** 3 heroes (HEROES), 6 weapons (WEAPONS, but weapon *behaviour* is a hard-coded `switch` in game.js and `wInfo`), 10 passives, 8 upgrade tracks, 5 enemy types + Stag in `ET`, 2 areas in `AREAS`. Enemy AI is one generic loop with `t === 3` (wraith) and `t === 5` (boss) special cases; the boss state machine is bespoke; geometry per enemy type is wired by index (`G.enemyGeo[t]`, `caps`). Data is partly data-driven (heroes, passives, upgrades, areas, enemy stats); weapon behaviour and AI are not.

**Size now.** First load = total = 1132.3 kB, 28 files (JS 723 kB / 200 kB gzip, CSS 20.6 kB, 25 GLB = 404 kB, one unused grass.glb).

**Performance facts.** 40 draw calls / ~244k tris with 174 enemies. Adaptive quality: 4 levels (now with recovery). Real FPS is not measurable in the desktop pane; test on real hardware.

## Design constraints (protect)
Core loop (auto-attack, move, fire radius, waves, Stag at 170 s), controls (WASD / floating joystick), hitboxes (`ET[].r`) and the 3D look stay. Any change to them is logged in CHANGELOG.

## SCREEN MAP

```
 boot --> [first run: TAP TO LIGHT THE FIRE] --> RUN --> RESULTS
                                                  ^         |
 HUB  (always one tap from play)                  |         v
   PLAY / ONE MORE RUN (big, always prominent) ---+    [ONE MORE RUN] [Hub]
   header: name, rank, coins, account level bar, "next best thing"
   tiles: Heroes | Upgrades | Codex | Goals | Settings
 HUB -> HEROES   (carousel + live 3D preview, mastery, unlock progress; also picks area)
 HUB -> UPGRADES (shop: 8 tracks)
 HUB -> CODEX    (weapons, evolutions, enemies, bosses, completion %)
 HUB -> GOALS    (short / mid / long goals, rank track, achievements list)
 HUB -> SETTINGS (sound, music, shake, flash reduction, quality, privacy, reset with confirm)
 RUN -> LEVEL-UP cards -> RUN;  RUN -> PAUSE (resume, settings, quit to hub);  RUN -> RESULTS
```
Every screen has Back. Screens open with a transform-only spring transition (under 300 ms); content reveals are staggered with CSS delays.

## PROGRESSION DESIGN
- **Account level / rank (Ember Novice -> Dawnbringer):** XP from every run (time, kills, boss, achievements). 6 named ranks over about 30 account levels; each level-up grants a visible reward (starting bonus, cosmetic, unlock). Replaces the old "rank points" ladder; existing saves migrate (save v2).
- **Ember Road (unlock tree):** goal-based unlocks shown with exact condition + progress (for example "Defeat The Hollow Stag 1/1"). Early unlocks stay quick: Wren after run 1, Bomb after run 2, Ashen after about run 4.
- **Hero mastery:** per-hero XP -> levels 1-10; small perks at 2/4/6/8/10; cosmetics at 3/6/10 (ember trail colour, lantern tint, cloak tint).
- **Goals panel:** one "Next best thing" line + short (this run), mid (next unlock) and long (collection %) bars.
- **Achievements:** 20 local achievements, each with progress and reward XP.
- **Tuning targets:** first level-up about 15 s; first shop purchase at the end of run 1 (first-run coin floor 130 vs cheapest upgrade 70); unlock after run 1; second hero after run 1-3; area unlock about run 4-5; 3 runs about 13 min.
- **Honesty rules:** every number shown is real saved data. No timers, scarcity, fake players, loot boxes, real-money elements. Rarity is conveyed by label + border style, never colour alone.

## CONTENT LIST (data-driven; adding content = adding a table entry)
- **Heroes (4):** Warden (bolt), Ranger Wren (bow), Cinder Monk (nova), NEW Lantern Witch Ash (starts with Cinder Wisp; kills in darkness feed her light).
- **Weapons (10):** bolt, orbit, chain, bow, bomb, nova + NEW Cinder Wisp (homing familiars), Ash Whip (arc sweep), Spark Mines (proximity traps), Beacon (fire-radius pulse that damages at the rim). Each has an evolution that needs a named passive.
- **Enemies (8 + 2 elites):** creeper, skitter, brute, wraith + NEW Spitter (ranged), Bulwark (shielded front plate), Blast Bug (exploder, hurts the fire), Gloom Moth (light-eater: shrinks the fire radius while alive). Elites: Ember Eater (existing), Hollow Matron (summoner).
- **Bosses (2):** Hollow Stag (phases, existing), NEW Ashen Warden (Ashen Hollow boss: ember pillars you must stay lit by).
- **Areas (3):** Whispering Woods, Ashen Hollow (existing), NEW Frostmere Marsh (blue-teal, thicker fog, slow-puddle hazard).
- **Run modifiers:** pick-one-of-two "Night Pacts" at run start (risk/reward), shrines (wayside choice), chests (existing).
- **Fire-centric mechanics (signature), 3 new:** (1) Light Pulse: stand still at the fire to charge a push-back pulse; (2) Torch Carry: Ash's wisps leave short-lived light zones that count as "lit"; (3) Dark Bargain shrine: shrink the light radius for double XP for one wave.

## OWN IDEAS (7) and what was chosen
| Idea | Psychology | Perf cost | Effort | Pick |
|---|---|---|---|---|
| Night Pacts (risk/reward mutators) | autonomy, mastery | tiny | M | yes |
| Light Pulse (stand-still fire burst) | meaningful choice vs endless kiting | tiny | S | yes |
| Dark Bargain shrine | risk/reward | tiny | S | yes |
| Hero mastery cosmetics | identity, long-term goal | tiny | M | yes |
| Evolution preview on cards | clarity, planning | none | S | yes |
| Run seed code on summary | sharing, replay | none | S | maybe |
| Ember-chain bonus XP | flow | tiny | S | later |
Rejected on ethics: daily-login rewards, expiring offers, anything that needs a fake clock.

## ASSET LIST (new GLBs, Blender pipeline)
hero_ash (<=5k); enemy_spitter, enemy_bulwark, enemy_blastbug, enemy_gloommoth (<=800 each); enemy_matron (elite, <=2k); boss_ashen_warden (<=10k); props: tree_marsh, reed, shrine, ice_rock (<=500); weapon FX: wisp, mine (<=100). Procedural fallbacks for all.

## SIZE BUDGET
First load target <= 3 MB (rule: <= 20 MB, cap 50). Expected: JS about 800 kB, CSS about 40 kB, models about 700 kB. Anything pushing models past 2 MB is marked "background pack candidate".

## STAGES
0 audit + plan -> 1 design system + new HUD -> 2 hub / hero preview / shop / settings / transitions -> 3 progression (ranks, mastery, goals, achievements, summary, save v2) -> 4 content -> 5 GLB models -> 6 balance / telemetry / mobile / a11y / perf -> 7 cleanup + handoff. Each stage ends with screenshots and a size report.

## Stage log (session 2)
- Stage 0: done.
- Stage 1: design tokens and the bottom-centre HUD done (screenshots `screenshots/s2_stage1_*`). Size 1132 -> 1139 kB.
- Stage 2: hub, heroes with live preview (shared canvas, scissor viewport), shop, codex, settings, pacts done (`s2_stage2_*`, `s2_codex`, `s2_shop`, `s2_pacts`).
- Stage 3: save v2, account level, mastery, goals, achievements, summary done (`s2_stage3_*`, `s2_achievements`).
- Stage 4: 1 hero, 4 weapons, 5 enemies, 1 boss, 1 area, hazards, pacts, shrines, Light Pulse. Balance A/B with the headless bot: 164 s vs 167 s average survival (8 runs each) after one tuning pass (first pass 98 s vs 206 s, so spawn share, Spitter fire rate, Bulwark health, Blast Bug damage and Moth shrink were reduced).
- Stage 5: 7 new GLBs built through the Blender MCP (connection test first, ok). Previews `s2_models_a/b.png`, in-game check `s2_stage4_new_enemies_ashen.jpg`.
- Stage 6: telemetry (`save.tele`, F2 overlay), quality recovery, mobile layouts checked at 375x812 (HUD, hub, hero preview), accessibility: flash reduction and shake toggles, FIRE LOW and low health shown as text + icon + pulse (not colour only), nothing flashes faster than 2 Hz, 44 px touch targets, ARIA on toggles.
- Stage 7: unused `grass.glb` removed, final size below, `HANDOFF.md` rewritten.

## Final size table (session 2)

| Build | Before session 2 | After |
|---|---|---|
| JS | 723.2 kB (200.4 gzip) | 767.6 kB (216.8 gzip) |
| CSS + HTML | 22.7 kB | 36.0 kB |
| Models | 403.8 kB (25 GLB) | 590 kB (31 GLB) |
| **First load = total** | **1132 kB, 28 files** | **1376 kB, 34 files** |

| New asset | Tris | Budget | kB |
|---|---|---|---|
| hero_ash | 1702 | 5000 | 41.5 |
| enemy_spitter | 754 | 800 | 20.9 |
| enemy_bulwark | 616 | 800 | 17.3 |
| enemy_blastbug | 710 | 800 | 20.2 |
| enemy_gloommoth | 496 | 800 | 16.1 |
| enemy_matron (elite) | 1114 | 2000 | 31.6 |
| boss_ashen_warden | 1652 | 10000 | 42.9 |

Draw calls with 154 enemies and 4 new weapons: 47 (was 40), 244k triangles, one extra post pass free. All new models are "background pack candidates" only in the sense that every model could be staged later; the whole game is 1.4 MB.

## NEEDS REPLACEMENT / optional upgrades
Nothing failed the gate. Weakest, in order: **enemy_bulwark** (the front plate is a flat slab), **enemy_gloommoth** (bat-like), **hero_ash** and **boss_ashen_warden** (scripted primitives).
- hero_ash prompt: "Original chibi lantern witch, flat-shaded faceted low-poly 3D model, big round head about 40% of body height, tall purple pointed hat with a glowing teal band, silver-white hair, long purple coat and cape, teal scarf, small brass lantern in the right hand, simple dot eyes, limited palette (purple, teal, silver, warm skin, ember orange), neutral A-pose, front three-quarter view, plain light-gray background, no text."
- boss_ashen_warden prompt: "Original fantasy boss 'Ashen Warden', flat-shaded faceted low-poly 3D model, a huge boar-like beast of ash-grey and dark red stone plates, glowing lava cracks across its hide, bone-white curved tusks, two small burning ember horns, a forge-like glowing hollow in its chest, thick armoured legs, standing pose, front three-quarter view, plain light-gray background, no gore, PEGI-12 friendly, no text."
- enemy_bulwark prompt: "Original spider-like creature carrying a battered bone-and-iron shield plate on its front, dark indigo body, red eyes, faceted low-poly, game enemy, top-three-quarter view, plain background."

## Playtest checklist (to run with real people)
1. First 30 seconds: does the player move, see the first gem, pick the first level-up card by about 15 s without reading help? (Sim: first level-up at 6-15 s.)
2. End of run 1: coins >= 130 (first-run floor), cheapest upgrade costs 70, one purchase possible; Wren unlocked (Finish 1 run).
3. Run 2 or 3: Powder Bomb, Ash Whip (account level 3) and Cinder Monk (level 4) arrive. Ashen Hollow at level 5 (about run 4-5).
4. Session length: 3 runs about 13 minutes; check that the hub shows a clear next goal each time.
5. Boss moments: does the Warden's barrage read (red circles) and is the dim phase fair? Are retries under 2 seconds (ONE MORE RUN is one tap)?
6. Expected drop-off points: the first death before 60 s (dynamic difficulty softens after quick deaths), the hub if "next best thing" is unclear, mobile if the joystick overlaps the dock (it does not capture touches).
7. Check on a real 4 GB Chromebook: 60 fps with 150+ enemies, the quality tier steps, preview half-rate, memory with the hero screen open and closed.

## Telemetry results (headless bot, see caveats)
Naive bot, woods area, 8 runs each: average survival 164 s without the new enemies, 167 s with them; fire deaths 3/8 and 3/8; first level-up 6-15 s. The bot is a relative gauge, not a player model.

---

# SESSION 3: Retention Engine (started 2026-10-03)

Goal: average session 10-13 min, run-1 retry rate above 70%. Everything is built into the game, behind one config file (`src/retention.js`) with a master switch and one switch per system, so each system can be A/B tested.

## Guardrails (from the brief, never violated)
- No fabricated players, names, scores or leaderboard entries.
- Hidden systems shape pacing and luck only. None is ever aimed at an ad, a revive or a purchase prompt.
- No mid-run interstitials, no punishment for tabbing out, no fake timers or discounts. Prices shown are the real prices. PEGI-12, not aimed at children.
- Every intervention is capped and logged (run log + telemetry + F3 overlay).

## Decisions where the brief meets an existing honesty rule
1. **Jackpot run vs the visible odds line.** Level-up cards show "Odds this pick: Common / Rare / Legendary". On a jackpot run those odds really are 100% legendary, so the line shows exactly that. It is never shown as 5% while rolling 100%. The jackpot has no banner or text, but it is not hidden by a false number.
2. **Dawnblade price.** A single fixed price for every player, chosen once from measured run-2 earnings. It is never computed per player from what they just earned (that would be personalised pricing, and the shop says "Prices never change").
3. **Measuring retry rate.** Saves and telemetry are local only (the Settings privacy text promises nothing leaves the device). One device produces one run-1 retry, so a real run-1 retry rate needs aggregate data from many players. This session builds the local measurement (per-run retry/quit, death-time histogram); getting the aggregate needs either CrazyGames analytics or an endpoint, plus a privacy text change. The headless bot can measure death times, but it cannot measure whether a human retries.
4. The Session 2 rule "no daily login rewards, no fake clock" stays: the Stage 3 streak flame (later) gives no reward and takes nothing away.

## Systems and switches (`src/retention.js`)
| Key | Stage | What it does | Visible? | Cap |
|---|---|---|---|---|
| `deathClock` | 1.1 | Runs 1-3: a lethal hit (or fire out) before this run's target time T (random 3:00-4:00) leaves the player at 1 HP + 2 s invulnerability (fire at 10%). After T, death is allowed. During the boss fight, player damage to the boss is raised just enough to aim for 10-15% boss HP at T. | No | 3 saves per run, 10 s apart; boss damage +35% max |
| `drama` | 1.2 | Dominating (boss under 30%, player HP above 70%, fire above 60%): the boss enrages once (banner, faster attacks, adds). Crushed (HP under 35% or fire under 30% for 5 s): Ember Log drop chance x2.5. | Enrage is a visible boss behaviour; the drop rate is not | Enrage once per fight; 2 extra logs per minute |
| `lastStand` | 1.3 | Once per run, a killing blow triggers LAST STAND: 1 s invulnerable push-back, then 6 s at 1 HP with +50% damage. 12 kills during it heal 40% ("STAND HELD"). Explained by a hint in run 1 and a HUD badge. | Yes | Once per run |
| `overlay` | 1.4 | F3 (dev builds): director state, intervention log, local death-time histogram, retry stats. | Dev only | |
| `jackpot` | 2.1 | Every 10-15 runs (random), every level-up card rolls legendary for one run. No banner; the odds line is truthful. | Odds line only | 1 run per 10-15 |
| `loaner` | 3.1 | Run 2 opens with the Dawnblade "borrowed from the armory". After 60 s it is taken back with a subtraction animation and sound. Results and the shop then offer it at its fixed price. | Yes | Run 2 only |
| `tele` | 9 | Per run: death time, run number, retry/quit, interventions, Last Stand use, jackpot/loaner flags. | Local only | Last 40 runs |

The rest (Stages 2.2-8) gets added to the same file when its stage starts.

## Rollout
1. **Now:** Stage 1 (1.1-1.4), 2.1, 3.1 and the telemetry they need. Then report the death-time histogram (bot, A/B with the master switch) and what can and cannot be said about retry rate.
2. Stages 4-5, re-measure.
3. Stages 6-8.

## Verification method
- Headless bot (`__eg.game._debugSim(secs, { runIdx })`): N runs with the system on vs off, histogram of death times, intervention counts.
- Browser pane screenshots of each visible piece (Last Stand, Dawnblade loan and reclaim, results offer, F3 overlay).
- Build size and draw calls before/after.

## Stage log (session 3)
- **Rollout step 1 (Stage 1 + 2.1 + 3.1 + telemetry): built and verified.** Screenshots: `screenshots/s3_loan_intro`, `s3_loan_reclaim`, `s3_last_stand`, `s3_results_armory_offer`, `s3_f3_director_overlay`, `s3_boss_enraged`.

### Measurements, step 1 (headless bot, Warden, Whispering Woods, dynamic difficulty reset to 1)

Bot = the existing naive kiting bot (`_debugSim`): it hugs the fire, steps away from the nearest foe, picks level-up cards at random and never aims. It is a relative gauge, not a player model.

**Baseline before any code change (12 runs per run index):** 45% of runs died at 29-33 s with the fire out. That is the skitter swarm at 0:24 gnawing the fire.

**Run 1 (run index 0), 30 runs per arm:**

| | Engine off | Engine on |
|---|---|---|
| Mean survival | 82 s | 142 s |
| Median survival (deaths only) | 81 s | 125 s |
| Deaths 0:00-1:00 | 12 | 3 |
| Deaths 1:00-2:00 | 12 | 8 |
| Deaths 2:00-3:00 | 3 | 8 |
| Deaths 3:00-4:00 | 3 | 6 |
| Deaths after 4:00 | 0 | 0 |
| Wins (boss killed) | 0 | 5 |
| Reached the boss | 4 | 12 |
| Silent saves fired | 0 | 67 (2.2 per run) |
| Extra Ember Logs (crushed) | 0 | 52 (1.7 per run) |
| Last Stand held | - | 17 of 30 |
| Boss enrages | 0 | 0 (the bot never dominates) |

**Run 2 (run index 1, Dawnblade loan), 15 runs per arm:** mean 85 s (off) vs 131 s (on); deaths before 1:00: 6 vs 0. Median run earnings: 293 coins (off) vs 574 (on).

**Dawnblade price.** Fixed at 450 coins for everyone. That is roughly the run-2 median earnings (293 off / 574 on) plus part of the 130-coin first-run floor, so a player who saved can buy it right after run 2, and one who spent needs about one more run. It is never set per player.

**Read honestly:**
- The engine moves the run-1 distribution clearly later (median +44 s, early deaths 12 -> 3), but it does **not** cluster run-1 deaths at 3:00-4:00 for this bot: 6 of 30 land there, 19 still die earlier.
- The binding limit is the cap. The bot stands still at 1 HP and gets hit again right after the 2 s of invulnerability, and fire deaths from the 0:24 swarm need more saves than the cap of 4 allows.
- A variant with 5 saves and a 5 s gap (tried before the breather existed) moved the median only slightly. Clustering this bot at 3:00-4:00 would need interventions big enough to look scripted.
- Near-misses (death with the boss at 10-15%) happened in 2 of 25 runs in one batch and 0 of 30 in the final batch. The boss appears at 2:50 with 4200 HP, so at T = 3:00-4:00 it is usually at 45-95% even with the +35% cap. "Boss at 10-15% when you die" is not reachable inside the brief's 3:00-4:00 window without a much weaker early boss. Options for the next step: the boss spawns at 2:20 in runs 1-3, or has 25% less HP in runs 1-3.
- **Retry rate was not measured.** A bot cannot choose to retry, and telemetry is local, so one device yields one run-1 verdict. The game now records r/h/q per run (verified: retry -> `r`, hub then play -> `h`, closed page -> `q`). A real run-1 retry rate needs aggregated data from many players (CrazyGames analytics or an endpoint, plus a change to the privacy text in Settings). Session length was not measured either, for the same reason.
- **Not measured:** real FPS (the pane throttles to about 2 fps when unfocused; the new code adds no draw calls and only per-step scalar math), touch on a phone, how Last Stand and the reclaim feel to a human.

---

# SESSION 3b: UI v2 rework + retention features in the screens (2026-10-03)

## Audit (screenshots at 1280x720, `screenshots/s3b_before_*`)
1. Translucent panels over the live 3D scene: pause, level-up odds line, hub chips, Heroes gaps. Small text (11-13 px) sits on fire, grass and particles and can't be read.
2. Hub: the logo covers the campfire and hero; 5 tiles + 3 chips + goal bar all have equal weight; "Next best thing" is vague.
3. Level-up: the odds and evolution lines are tiny and float on the game; the HUD stays fully visible behind the cards.
4. HUD: the tip bubble and the evolution hint sit in the middle of the action; labels are 10-11 px; damage numbers flood the centre.
5. Codex: weapons the player has unlocked but not yet picked show as "???" and read as locked.
6. Results: a long scroll; the retry button falls below the fold at 720 px tall.

## UI v2 rules
- **Solid surfaces only.** Every card and panel is opaque (`--s1` card, `--s2` raised). Menus sit on an 88% dark backdrop. No text ever sits directly on the 3D scene, except the HUD numbers, which get solid pills.
- **Type floor:** 12 px for captions, 14-15 px for body text, 26-32 px for titles.
- **One primary action per screen** (orange). Secondary buttons are solid slate; minimum height 48 px.
- **Heroes screen:** the main scene isn't drawn while it is open. The canvas is cleared to the backdrop colour and only the hero preview is drawn (also saves GPU).

## Retention features built into the new screens
- **Session tasks (4.5 / 4.4).** Three tasks per play session, e.g. defeat 300 foes, reach level 8 in one run, survive 2:30. Real coin rewards, paid at run end. They show in the hub and on results, and the closest one is tracked live on the HUD. Targets scale from the player's own bests. No timers: tasks last until done or until the page is closed.
- **Results v2 (4.1, 5.2, 5.4, 8.2).**
  - The peak of the run comes first: biggest streak, kills, best moment.
  - Then the nearest unmet goal, picked automatically from: boss HP left, XP to the next level, unlock progress, task progress.
  - Personal bests with the real numbers.
  - ONE MORE RUN has focus, and Space or Enter retries.
  - Everything fits on one 720 px screen.
- **Hub v2.**
  - Profile bar with name, rank, level and coins.
  - The scene's campfire and hero stay visible in the centre.
  - One PLAY card with the loadout.
  - A NEXT UNLOCK card with a silhouette and the exact condition (8.4).
  - A tasks card.
  - A solid nav bar.
- **Codex fix:** unlocked-but-unfound items show their name with "Unlocked: appears on level-up cards".
- **Damage numbers** setting: All / Big hits (crits and bosses, default) / Off.
