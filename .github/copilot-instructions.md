# Copilot instructions for Skybound Runner

## Project overview

Skybound Runner is a small browser game implemented as a dependency-free static site. The entry point is `index.html`, which provides the HUD, canvas, game-over/stage-clear overlay, and controls. `style.css` contains the responsive layout and visual styling. `script.js` owns the complete game loop, physics, collision detection, rendering, stage progression, input handling, and Web Audio effects/BGM.

There is no package manager configuration, build system, test runner, or linter in this repository. The game can be previewed by opening `index.html` in a browser, or from the repository root with:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`. There is no configured full-suite or single-test command. The closest automated validation is:

```sh
node --check script.js
git diff --check
```

Exercise gameplay manually in a browser after changes to controls, physics, stage transitions, collectibles, rendering, or audio.

## Architecture and gameplay flow

- `index.html` defines the DOM elements queried by `script.js`: HUD counters, music toggle, canvas, message overlay, and restart/next-stage button. Keep IDs synchronized when changing either file.
- `script.js` is loaded at the end of `index.html` as a classic script, not an ES module. It expects the canvas and all queried HUD elements to already exist when it starts.
- `script.js` uses a fixed logical canvas size (`W = 960`, `H = 540`) and a horizontally scrolling world (`worldWidth`). `requestAnimationFrame(loop)` calculates a clamped frame delta, calls `update(dt)`, then calls `draw()`.
- Static base geometry is held in `platforms` and `enemySpawns`. `stageLayouts` derives three stage variants from those arrays. `reset()` selects the current layout, initializes player/lives/coins/items/enemies, and updates the HUD.
- `currentPlatforms` and `currentEnemySpawns` are the active stage data. Use these rather than the base arrays in collision, movement, and rendering code.
- Game state is held in module-level variables (`state`, `stage`, `player`, `enemies`, `goal`, etc.). `state` is `"playing"`, `"stage-clear"`, `"lost"`, or `"won"`; `update()` must not advance gameplay outside `"playing"`.
- Reaching `goal` calls `finish()`. Intermediate stages show the overlay and use the same button to increment `stage` and call `reset(false)`; restarting from a loss or final win calls `reset()` and returns to stage 1.
- Collectibles are stored on `window.coinItems` and `window.fruit` because the renderer and update loop both access them. Coins increment the HUD counter and the fruit sets `player.invincible` to `INVINCIBILITY_DURATION` (300 frames, approximately five seconds at 60 FPS).
- Enemies are initialized with per-instance dimensions, speed, patrol bounds, and a `type` value. Rendering branches on `enemy.type` to draw the distinct enemy designs. Enemy defeat can happen by stomping or by the Enter-key attack.
- Input is handled globally. Arrow keys/A/D move, W/ArrowUp/Space queue a double jump, and Enter (checked via both `event.key` and `event.code`) triggers `attack()`. Preserve `event.preventDefault()` for navigation keys.
- Audio is generated with the Web Audio API rather than external files. `startMusic()` is triggered by user input to satisfy browser autoplay restrictions; `playTone()` is shared by the Christmas-themed BGM and gameplay sound effects. Keep audio initialization inside a user gesture.
- `style.css` owns the responsive shell around the fixed canvas; the canvas is scaled with CSS while gameplay coordinates remain in the logical 960x540 space.

## Repository-specific conventions

- Keep the implementation dependency-free and browser-native; do not introduce a framework or asset pipeline for small gameplay changes.
- Use the existing fixed-world coordinate system and `overlaps(a, b)` helper for gameplay collision checks. Add new stage geometry to the layout data instead of hard-coding separate collision branches.
- When adding or renaming HUD elements, update both the matching DOM ID in `index.html` and the query/update logic in `script.js`.
- Reset transient state in `reset()` so stage transitions and restarts cannot retain taken collectibles, defeated enemies, timers, or old player physics.
- Keep frame-based timers consistent with the current 60-FPS convention (`dt` is normalized around 16.67 ms); convert seconds to frames when defining gameplay durations.
- Add new enemy appearances through the existing `enemy.type` rendering pattern and initialize any type-specific behavior with the enemy object.
- Keep gameplay data in plain objects and arrays; there are no classes, imports, persistence layers, or external assets to update when adding a small feature.
- `window.coinItems` and `window.fruit` are intentionally recreated by `reset()`. Any new collectible that is rendered and updated from separate functions must be reset there as well.
- Preserve the Japanese player-facing text and the existing control labels unless the requested feature changes them.
- Prefer small, surgical edits. After JavaScript changes, run `node --check script.js` and `git diff --check`; use a browser smoke test for gameplay behavior.
