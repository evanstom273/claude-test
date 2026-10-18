# Handover: porting the paper RPG prototype to Godot

You're picking up a first-person (and third-person) RPG inspired by Daggerfall. It currently runs as a web prototype built with React, Vite, TypeScript and three.js. We're rebuilding it in **Godot 4** (GDScript unless I say otherwise). The web version is the reference: it's playable at https://evanstom273.github.io/claude-test/ and the source is at https://github.com/evanstom273/claude-test (branch `main`). When this document and the code disagree, the code wins.

**The setting, story, places and characters aren't decided yet.** The prototype's content is placeholder that exists only to exercise the systems. Don't carry its names, lore or tone into the Godot project, and don't invent a setting. Port the look and the systems. Where something needs content to be tested, use obvious placeholders, or ask me.

## How I work

- I'm the designer and the main tester. Build what I ask for, literally. Don't add features, effects, animation flourishes or "improvements" I didn't ask for, and don't make creative calls on my behalf. If a missing decision would change the design, ask me.
- Keep each change as small as it can be. Don't refactor things that aren't part of the task. Don't build tooling or generators for one-off jobs unless they're genuinely needed.
- Don't spend ages running the game or validating it yourself. A quick check that nothing is obviously broken is plenty; I'll test.
- Keep updates short. When you're done, tell me what changed and anything I actually need to know.
- British English, warm and direct, honest opinions. If something's a bad idea, say so.

## The look (the most important part to get right)

I love the paper look. It has to come across intact.

- **Everything is drawn as flat vector art with dark ink outlines** (`#2b2118`, about 2–2.5px at 100×200 scale) and flat fills. There are no gradients and no realistic textures.
- **Paper grain:** every texture has a paper grain multiplied over it: warm off-white noise plus a few faint fibres, at about 0.25–0.35 strength. In Godot, do this in a shader (multiply by a tiling noise texture), or bake it into the PNGs.
- **Cut-paper edge:** every sprite has a pale cream (`#f4ecd6`) border round its silhouette, as if it's been cut out with scissors. On the web this is an SVG `feMorphology` dilate filter.
  - **Godot's SVG importer doesn't support filters**, so this won't come through on import.
  - Either rasterise the SVGs to PNG in a browser first, or recreate the edge with an outline shader on the sprites.
- **Characters, enemies and trees are billboards:** flat paper cut-outs that turn to face the camera on the Y axis only (in Godot, `Sprite3D` with `billboard = Y`).
  - They have soft blob shadows under them.
  - Walking is a bob plus a gentle side-to-side rock, not limb animation.
  - When enemies die, they tip over backwards and lie flat.
  - **No ragdoll and no floppy limbs.** Poses snap and hold so they're readable.
- **Architecture is low-poly boxes** with the paper textures on them: plaster, stone, plank, thatch and tile roofs, cobbles, grass and dirt paths. Lighting is simple (Lambert-style, soft shadows), with lit windows and lamps at night.
- **UI is ink on parchment:**
  - **Fonts:** *IM Fell English* and *IM Fell English SC* (Google Fonts).
  - **Dialogue** appears on an open book: portrait on the left page, text and numbered topics on the right.
  - **The character sheet** is also a book: stats and skills on the left, the journal on the right.
  - **HUD:**
    - Daggerfall-style strip compass at the top.
    - Health and stamina bars top left.
    - Gold, potions and level on a little ledger.
    - Clock, date and location top right.
    - Notes fading in under the compass.
    - A centre dot crosshair and an "E: Talk to …" prompt.
  - **First-person weapon:** a paper sword held bottom right, which swings, bobs and blocks.
- **Palette accents:** deep red `#7a1f24`, gold `#c9a24a`, cream `#f4ecd6`, ink `#2b2118`.

**The art is generated in code.** It's all in `src/engine/render/art.ts`: each function returns an SVG string for character outfits, enemy frames, trees, props, building surfaces, signs, sun, moon, clouds, backdrops and interior bits. The fastest faithful route is to export these to SVG/PNG files and import them, rather than redrawing them by hand. Treat the specific characters and props as style references, not content.

## Data-driven content

In the prototype, all the content lives in `src/data/*.json`, and `src/data/types.ts` documents every field. Port the **structure** (the kinds of definition and how they connect), not the placeholder entries.

| Kind of definition | What it holds |
| --- | --- |
| NPCs | Name, title, role, outfit (colours, hat, beard, apron…), home, wander radius, greetings, and the building and named spot they live at |
| Places | Places people can give directions to |
| Buildings | Position, size, rotation, wall and roof style, sign, and kind (which drives the interior layout) |
| Enemies | hp, speed, reach, wind-up, strike and recover times, damage, sight, gold drop, whether hits make them flinch, tell sound |
| Items | Name, whether it's listed on the sheet, heal amount, damage bonus |
| Quests | Quest ids and their stages |
| Dialogue | Every dialogue topic, as rules |
| Props | Usable things (doors, pickups, searchable bodies, level entrances and exits), as rules |
| Rumours | Lines per quest stage |
| Levels | Title, arrival note, lantern strength, fog |
| Player | Starting stats, skills, time, journal, the player's outfit, movement, combat and stamina numbers, level-up and respawn rules |

### Rules

Dialogue topics and props both use the same small rules language. That's what keeps quests out of the code.

- **A rule** is `{ when?, cost?, poor?, say?, do? }`. The first rule whose `when` holds is the one that runs. If you can't afford `cost`, you get the `poor` line instead.
- **Conditions:** `quest` (a stage or list of stages), `flag`, `notFlag`, `has`, `lacks`.
- **Effects:** `gold`, `give`, `take`, `quest` + `stage`, `journal`, `note`, `sfx`, `train`, `heal`, `rest` (hours), `flag`, `end`, `travel` (with an optional `at`), `exitBuilding`, `remove`, and `if` / `do` / `else`.
- **Topics** also have `roles` (who offers them), `show` (when they're offered), `rumour`, and `places` (opens the "Where is…" list).
- **Text** can use `{building}` and `{id}`, filled in from the prop.

`src/engine/systems/rules.ts` is the interpreter, about 90 lines. Port it closely.

The loader (`src/data/index.ts`) checks every cross-reference at startup, so a typo in an item, quest, skill or building id fails loudly. Keep that check.

### Resources or JSON?

I originally wanted something like Godot resources / `.tres`. There are two options:

- Keep loading JSON at runtime.
- Make custom `Resource` classes that mirror `types.ts`, and author content as `.tres`.

**Ask me which before building either.**

## Systems, with the numbers

The reference code is in `src/engine/`: `core/game.ts` is the main loop and player, plus `entities/`, `systems/`, and `world/` (levels, interiors, sky, collision).

### Player

- Eye height 1.62. Collision radius 0.35.
- Walk 4.2, run 7 (Shift; in first person, forwards only).
- Jump 5.4, gravity 15.
- **Stamina:** 80 to start. Running costs 11/s, jumping 6, a swing 9. It regenerates at 16/s after a short delay.
- You can step up 0.45 without jumping, and you snap down onto floors and stairs.
- Starting state:

  | Stat | Starting value |
  | --- | --- |
  | Health | 60 |
  | Gold | 25 |
  | Healing potions | 2 |
  | Skills | Blade 18, Block 14, Athletics 12, Etiquette 10 |

### Combat

- **Your swing:** wind-up 0.13s, then strike 0.1s, then recover 0.24s.
  - It hits enemies within 2.4m and a forward arc (dot product ≥ 0.72).
  - Damage = round(5 + Blade/5 + bonuses + random 0–4).
- **Blocking:** hold to block. If you're facing the attacker (dot > 0.35), damage is ×0.2, it costs 10 stamina, and it trains Block.
- **Enemies** run idle → chase → wind-up → strike → recover, with clear visual tells during the wind-up.
  - Some enemies flinch out of an attack when hit; others commit to the swing.
  - The strike only lands if you're still within reach plus 0.35.
  - The two prototype enemies are a fast, weak one and a slow, heavy one. Their stats are in `enemies.json` and work as a tuning reference.
- **Readability matters more than anything.** I hate fights where the enemy is right on top of you with no spacing, like Gaius in Elden Ring. Keep the tells long and the spacing generous.

### Skills, levels, healing

- **Skills:**
  - Blade improves on hits, Block on blocks, Athletics every 40m you run, Etiquette when you meet someone new or a quest says so.
  - A skill needs 2 + floor(value/10) uses to go up a point.
  - Every 5 skill raises you level up: +10 max health, +6 max stamina, and a full heal.
- **Healing potion:** Q. Heals 35.

### Time

- Time runs at 2 game minutes per real second.
- The sky colour, sun and ambient light come from keyframes in `world/sky.ts`.
- At night, windows and lamps light up and the sun swaps for the moon.
- The prototype's weekday and month names are placeholders.

### Death

When you die, the camera tips over. You wake at a respawn point set in the player data and lose 10% of your gold.

### Dialogue

- Talking freezes the world and opens the dialogue book.
- Topics come from the rules.
- "Where is…" gives Daggerfall-style compass directions from where the speaker is standing. Indoors, directions are measured from the building's door.

### Third person

V, R3 or an on-screen button toggles between first and third person. Your choice is remembered.

- The camera orbits freely, over the right shoulder (distance 3.2, side offset 0.45, aimed at a height of 1.5).
- It pulls in when walls get in the way. If it gets closer than 0.9, the player figure is hidden.
- You turn to face the direction you're walking.
- Swinging or blocking snaps you to face the camera's direction.
- The player figure has front and back views (front when the camera is in front of you), each with idle, wind-up, strike and block poses.
- From behind, a raised or swung sword sits behind the body: it pokes out round the edges and isn't drawn over your back.

### Saves

- There are three slots plus an autosave on every change of level and on respawn.
- **What's saved:** level, position and facing, health, stamina and their maximums, gold, level, skill raises, skill values and progress, inventory (item id → count), quest stages, flags (one-off facts like "met this NPC" or "took this item"), journal, and time.
- **What isn't saved:** dungeon enemies. They come back every time you enter.
- **Title screen:** Continue, a new game, or open a saved game. The pause menu has Save and Load.

## World-building tech (the techniques, not the places)

The prototype builds three kinds of level. The methods are worth porting; the specific layouts aren't.

- **Outdoor level** (`world/levels.ts`):
  - Buildings placed from data, with walls and gates.
  - Flat ground layers: roads, streets, a square.
  - Dirt paths found by grid search (0.5m cells) from each front door to the nearest road.
  - Billboard trees and props.
  - Backdrop rings on the horizon.
  - Sun, moon and clouds.
- **Dungeon:**
  - A grid maze carved from a fixed seed, with 3.6m tiles.
  - Wall torches.
  - Enemies placed by distance from the entrance, weaker ones near it and tougher ones deeper.
  - The goal goes in the room farthest from the entrance.
  - A lantern light is carried by the camera only here.
- **Interiors** (`world/interiors.ts`): every building has a unique layout, procedurally generated from its seed.
  - **Floors:** one or two storeys, 3m high.
  - **Stairs** have landings and are kept clear of doors and walls.
  - **Partition walls** have doorways. On the ground floor of two-storey buildings, partitions stop just short of the floor above, so they don't poke through it.
  - **The upper floor** has a stairwell hole with railings.
  - **Room kinds** depend on the building kind, and each room kind has its own furniture.
  - **NPC spots** are named and always at least 3m from the door.

  This was fiddly to get right. Port the rules, don't reinvent them.
- **Coordinates:** north is −z, and yaw 0 looks north. Keep this convention or convert it carefully; the data uses it.

## Lessons already learned (don't repeat them)

- **Flat ground layers z-fought.** Overlapping roads and squares on the ground plane flickered. On the web, polygon offset per layer fixed it.
- **A dungeon entrance got buried in its mound.** Make sure entrances sit clear of the terrain.
- **Stairs ran into walls or into corners.** Fixed with landing and foot-clearance checks.
- **NPCs stood on doormats.** Every spot must be at least 3m from the door.
- **Interior walls clipped through the floor above.** See the partition height above.
- **Readable combat beats realistic combat:** spacing, tells, and held poses.

## Suggested order

1. Project setup and a first-person controller with the numbers above.
2. The paper material: grain shader and cut-edge outline on a test billboard and wall.
3. An art pipeline that gets the generated SVGs out of `art.ts` and into Godot.
4. Data definitions and the rules interpreter.
5. NPCs, dialogue, enemies and combat in a simple test level.
6. Level-building tech (outdoor, dungeon, interiors), saves, third person, polish.

Check in with me after each step. Don't run ahead.
