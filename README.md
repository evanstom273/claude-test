# claude-test

## Studio

The start of a cartoon studio in the browser, at https://evanstom273.github.io/claude-test/. So far it's the shell: a slide-out drawer with Home, Audio, Visuals, Writing and Timeline (`src/studio/`).

### Art Studio (Visuals, phase 1)

`src/studio/art/`: an SVG code editor with a live canvas preview.

- **Code editor:** CodeMirror 6, with SVG autocomplete, tag closing and matching, folding, search and replace, formatting, and errors highlighted on their line.
- **Canvas:** shows the last valid version while the code is broken. You can pan and zoom (pinch on touch), turn on a grid in artwork units, and use preview mode.
- **Safety:** artwork is checked and sanitised before display. Scripts, event attributes and external resources are stripped, and the preview sits in a shadow root so its styles can't leak into the studio.
- **Files:** New, Open, Save, Save As, Import and Export `.svg`. Artwork is saved in IndexedDB on this device, and the working copy is autosaved so unsaved work survives a closed tab.
- **Layouts:** side by side, stacked, code only and canvas only, with a draggable divider.

## The Dorseys: "Smart Toast"

An 85-second animated sitcom scene made entirely from SVG and JavaScript. Frank buys a smart toaster, and it does not go well. Play it at https://evanstom273.github.io/claude-test/player.html

- **Characters** (`src/characters/`): Frank and Linda share one rig. It has mouth shapes, blinking lids, brows, pupils, a head tilt, jointed arms with four hand shapes, walking legs and prop slots in the hands. Professor the cat has a small rig of his own.
- **Direction** (`src/engine/director.ts`): a script of calls (`say`, `walk`, `pose`, `face`, `look`, `cam`, `sfx`, `place`, `fly`, `card`) compiles to keyframe tracks. Rendering is a pure function of time, so pause, restart and scrubbing are exact.
- **Speech** (`src/engine/speech.ts`): each line is split into syllables. The same syllables drive the subtitle reveal, the mouth shapes and the gibberish voice.
- **Sound** (`src/audio/`): Web Audio only, with no samples or text-to-speech.
  - Each voice is an oscillator through vowel formant filters, and each character has their own pitch, speed and timbre.
  - Every effect is synthesised.
- **Episode** (`src/episode/smartToast.ts`): only the direction lives here. A new episode is a new script file that reuses the same cast, set and engine.

`npm run dev` to work on it; adding `#t=42` to the URL opens paused at that moment.

`ART_STYLE.md` is the art direction from the earlier game experiments.

## Archive

Earlier experiments are kept on their own branches:

- [`archive/primordia`](https://github.com/evanstom273/claude-test/tree/archive/primordia): Primordia, the top-down WorldBox/Spore god sandbox: an evolving island with procedural Spore-like creatures, god tools and four world sizes.
- [`archive/ashen-vow`](https://github.com/evanstom273/claude-test/tree/archive/ashen-vow): Ashen Vow on the web, the hooded sorcerer with eight-direction walk and sprint in a movement test scene, plus the game data.
- [`archive/quillmarch`](https://github.com/evanstom273/claude-test/tree/archive/quillmarch): Quillmarch, the first-person paper-book RPG in three.js (with saves, JSON resources, third person and the Godot handover prompt).
- [`archive/hollow-orchard`](https://github.com/evanstom273/claude-test/tree/archive/hollow-orchard): Hollow Orchard, the cut-paper folk-horror side-scroller and isometric farmstead prototype.
- [`archive/emberwake`](https://github.com/evanstom273/claude-test/tree/archive/emberwake): Emberwake, the first top-down SVG survival game.
