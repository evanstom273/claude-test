# claude-test

## Primordia (working title)

A god sandbox in the spirit of WorldBox and Spore: a top-down island where life evolves on its own while you meddle. Play it at https://evanstom273.github.io/claude-test/

- **Evolution runs itself.** Every creature carries a genome: size, speed, diet, senses, colour, body segments, legs, eyes, horns, spikes, tail, fertility and lifespan. Children inherit it with small mutations. When a lineage drifts far enough from its species, it becomes a new one, with its own name and a body drawn from its genes.
- **Food chains.** Plants grow and spread by biome and rainfall. Grazers eat plants, hunters chase and lunge at prey, prey flees, and forests hide things.
- **God tools.** Look (follow a creature's life), raise and lower land, sow plants, rain, create life, and call down meteors.
- **Watch it unfold.** A species list with population sparklines, a population graph, a creature inspector with its lineage, and news as species arise and die out. Run at 1×, 3× or 10×, or pause.

Controls: drag to move the map, scroll or pinch to zoom, Space to pause, 1–4 for speed, WASD or arrows to pan.

Built with React, Vite, TypeScript and Tailwind on a plain canvas. Art follows `ART_STYLE.md` (cel-shaded, layered SVG), seen straight from above. `src/sim` is the simulation (world, genomes, species, creatures), `src/render` the terrain painter, creature and plant art and renderer, and `src/ui` the panels.

## Archive

Earlier experiments are kept on their own branches:

- [`archive/ashen-vow`](https://github.com/evanstom273/claude-test/tree/archive/ashen-vow): Ashen Vow on the web, the hooded sorcerer with eight-direction walk and sprint in a movement test scene, plus the game data and `ART_STYLE.md`.
- [`archive/quillmarch`](https://github.com/evanstom273/claude-test/tree/archive/quillmarch): Quillmarch, the first-person paper-book RPG in three.js (with saves, JSON resources, third person and the Godot handover prompt).
- [`archive/hollow-orchard`](https://github.com/evanstom273/claude-test/tree/archive/hollow-orchard): Hollow Orchard, the cut-paper folk-horror side-scroller and isometric farmstead prototype.
- [`archive/emberwake`](https://github.com/evanstom273/claude-test/tree/archive/emberwake): Emberwake, the first top-down SVG survival game.
