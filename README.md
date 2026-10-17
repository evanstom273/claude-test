# Hollow Orchard

A folk-horror metroidvania-soulslike told as a cut-paper storybook. Everything is drawn in SVG; the characters are jointed paper puppets held together with brass split-pins.

**Current stage: feel prototype.** One field, the farmhand with her scythe and four hedge-witch rites (paid for in candle tallow), one scarecrow (The Tattered Man), and a shrine to rest at. The point is to get the combat feeling right before building the world on top of it.

## Controls

| | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | A / D, arrows | Left stick, D-pad |
| Jump | Space (down + jump drops through planks) | A |
| Strike (chain up to 3) | J, left click | X / RB |
| Heavy | K, right click | Y / RT |
| Roll | Shift, L | B |
| Lock on | Tab, middle click | R3 |
| Cast rite | I, C | LT |
| Change rite | Q, R, mouse wheel | D-pad up |
| Drink honey | F | LB |
| Rest at shrine | E | D-pad down |
| Pause | Esc, P | Start |

On touch devices a floating analogue joystick (left side) and buttons appear. `H` toggles hitboxes.

## The farmstead (isometric experiment)

From the title screen, *Or look down on the farmstead* opens a Project Zomboid / Sims 1 style isometric take on the same fight: a cottage whose walls drop when you go inside, a pumpkin patch, a pond, two cornfields that fade as you walk behind them, and several scarecrows on posts. One of them is the Tattered Man. Move in 8 directions with WASD or the stick; Space rolls; everything else matches the side view.

## Development

```sh
npm install
npm run dev
npm run build
```

Built with React, Vite, TypeScript and Tailwind CSS. Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
