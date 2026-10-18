# Quillmarch

A first-person RPG in the spirit of Daggerfall, built as a pop-up paper book: inked and painted surfaces, cut-out townsfolk and monsters that turn to face you, and paper scenery standing round the horizon.

**Current stage: first playable slice.** The walled market town of Brindle, its townsfolk (talk to them by topic, ask for directions and rumours, buy draughts, rent a room), a day and night cycle, and the Hollow Barrow, a maze of rats and the restless dead, with one quest: the Reeve's stolen signet. Skills improve with use.

Every building can be entered. Interiors are generated from each building's seed: staircases on different walls rising different ways, dividing walls with doorways, upper floors with stairwells and railings, and rooms furnished for their purpose (the Goose's bar and hearth, the Reeve's study and archive, the temple's pews and dais, Hobb's forge). Dirt paths are routed from every front door to the street.

## Controls

| | Keyboard / mouse | Gamepad |
|---|---|---|
| Move / look | WASD + mouse (click to capture) | Left / right stick |
| Run, jump | Shift, Space | LB, A |
| Strike, block | Left click, hold right click | RT, LT |
| Talk / use | E | B |
| Healing draught | Q | X |
| Character & journal | C, Tab | Y |

On touch devices: drag the left half to move, the right half to look, and use the on-screen buttons.

## Development

```sh
npm install
npm run dev
npm run build
```

React, Vite, TypeScript, Tailwind CSS and three.js. All art is generated SVG baked into textures at runtime. Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.

### Layout

- `src/data/` — the game's content as JSON resources (Godot `.tres` style): people, places, buildings, enemies, items, quests, dialogue, usable props, levels and the starting player. `types.ts` describes each file; `index.ts` loads them and checks every cross-reference at startup.
- `src/engine/core/` — the game loop (`game.ts`), the saveable `GameState` (`state.ts`), save slots (`save.ts`), input and audio.
- `src/engine/entities/` — `Entity` and `EntityManager`, plus `Npc`, `Enemy` and `Prop`.
- `src/engine/systems/` — the rules interpreter (conditions and effects used by dialogue and props), dialogue, time.
- `src/engine/world/` — level, interior and sky building, collision.
- `src/engine/render/` — SVG texture generation.
- `src/ui/` — HUD, books, save slots, touch controls.

Dialogue topics and props are lists of rules: the first whose `when` holds runs its `do` effects (`give`, `gold`, `quest`, `journal`, `travel`, `if`…). Saves go to `localStorage`: three slots plus an autosave on every change of level.

## Archive

Earlier experiments live on their own branches: [`archive/hollow-orchard`](https://github.com/evanstom273/claude-test/tree/archive/hollow-orchard) and [`archive/emberwake`](https://github.com/evanstom273/claude-test/tree/archive/emberwake).
