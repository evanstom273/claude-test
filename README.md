# Hollow Orchard

A folk-horror metroidvania-soulslike told as a cut-paper storybook. Everything is drawn in SVG; the characters are jointed paper puppets held together with brass split-pins.

**Current stage: feel prototype.** One field, the farmhand and her scythe, one scarecrow (The Tattered Man), and a shrine to rest at. The point is to get the combat feeling right before building the world on top of it.

## Controls

| | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | A / D, arrows | Left stick, D-pad |
| Jump | Space (down + jump drops through planks) | A |
| Strike (chain up to 3) | J, left click | X / RB |
| Heavy | K, right click | Y / RT |
| Roll | Shift, L | B |
| Lock on | Tab, middle click | R3 |
| Drink honey | F, Q | LB |
| Rest at shrine | E | D-pad up |
| Pause | Esc, P | Start |

On touch devices a floating analogue joystick (left side) and buttons appear. `H` toggles hitboxes.

## Development

```sh
npm install
npm run dev
npm run build
```

Built with React, Vite, TypeScript and Tailwind CSS. Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
