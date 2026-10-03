# EMBER GUARD — Design (Stage 0)

## 1. Design analysis (≈350 words)

**Why survivor-roguelites hook.** Three loops nest inside each other. *Seconds*: move, auto-kill, vacuum gems: constant small variable rewards (pitch-rising pickups, numbers, pops). *Minutes*: a level-up every 20-40 s offers a real decision (3 cards, rarity glow) and the build "snowballs" into a power fantasy (evolutions). *Days*: permanent upgrades and unlocks make every failed run still pay out (the goal gradient plus Zeigarnik: there is always an unfinished thing).

**Where they lose players.** (1) Slow starts: no dopamine in the first 30 s. (2) Mid-run sag: a flat difficulty line, power plateaus. (3) Deaths that feel unfair or unrewarding, followed by a menu wall. (4) Samey visuals: a screen of 200 identical blobs with no readable "danger geometry". (5) Passive fantasy: the player has no meaningful positioning decision beyond "run in circles".

**What makes EMBER GUARD stand out.** The *fire is a second health bar you can see and feel*. Its radius is simultaneously the base's HP, the light, the weapon-buff zone, the music mix and the colour grade. Every system answers one question: "how big is my light?" That gives the player a positional decision in every second (stay near the fire to tend it and fight weakened enemies, or roam into the dark for gems and risk stronger ones) and gives the run a built-in story arc (night to dawn).

Presentation rules: warm vs. cold contrast is the readability tool (enemies in the light are warm-lit and slowed, in the dark they are nearly black with only eyes). Run is ~4 min: boss at ~3:00, fight ~60 s. Run 1 is softened and ends on a guaranteed unlock; run 2 reveals a new mechanic (Elites and Cinder Chests); run 3 plays the same Stag but with an extended finale (longer slow-mo, bigger dawn, bigger confetti), because the peak-end rule says people remember the end.

## 2. My own ideas (beyond the brief)

| # | Idea | Psychology | Cost |
|---|------|-----------|------|
| 1 | **Tend the fire**: standing beside the fire slowly regrows it and heals; kill streak tier-ups make "the fire roar". | Risk/reward positioning; mastery loop; streak = flow | ~0 KB, a few lines |
| 2 | **Last Ember**: once per run, when the fire is nearly out, a slow-mo shockwave knocks the swarm back and relights a sliver. | Comeback / near-miss relief; failure feels dramatic, not cheap | small |
| 3 | **Pace ember** (HUD): "+12 ahead of your best run" using only your real saved best-run checkpoints. | Goal gradient, self-competition, no fake players | tiny |
| 4 | **Cinder Chests** (Elites, run 2): rare-chest glint beam, opens a boosted-rarity pick. | Anticipation, variable reward with visible odds, mid-run sag fix | small |
| 5 | **Swarm tide**: telegraphed ring of skitters every ~25 s ("THE DARK CLOSES IN"). | Tension/release rhythm, mid-run peaks | small |
| 6 | **Evolution hints on cards** ("Evolves with Quick Wick") plus a gold EVOLUTION card. | Zeigarnik, planning, "I broke the game" | small |
| 7 | **Dawn grading**: sky/ambient lerps toward dawn as the boss HP drops; final blow floods the screen with gold. | Peak-end, visible progress | shader uniforms only |
| 8 | **Dynamic spawn pressure**: spawn density follows hero HP + fire; quick deaths soften next run. | Flow channel | tiny |

## 3. Changelog

- Replaced a post-process bloom stack with an in-shader light model (fire pool, hero lantern, fog) plus additive point sprites: one custom `ShaderMaterial` for all geometry, no Three lights, no shadow maps. Cheaper on Chromebooks and gives the fire radius direct control over every pixel.
- Replaced the idea of a fourth enemy "spitter" with the Wraith (flies and targets the *fire*, not the hero) so enemy types force different positioning.
- Run-1 softening and run-2 mechanic reveal made explicit (spawn scale, Elites gated).
- Unlock order fixed: Ranger Wren, Powder Bomb, Ashen Hollow, Cinder Monk (each run ends with the next one).
