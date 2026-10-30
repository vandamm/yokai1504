# Three visual directions

Visual mockups based on `../minimal-table/`. Production UI, game rules and online play are unchanged.

| Direction | Surface and typography | Controls and state |
| --- | --- | --- |
| A — Бумага и тушь | Light paper fibers, indigo, soft physical shadows | Ink tide fades toward the divider; quiet rounded controls |
| B — Ночной лак | Deep plum lacquer, ivory serif health, brass | Warm metal End turn, pink-red opponent state, light inspection panels |
| C — Графический коврик | Flat periwinkle, cobalt, bold sans serif, offset shadows | Lime signal details, square controls, dotted active surface |

All three use the same geometry, real card art and the existing `CardFace` component. Each side holds three yokai. Fan hands sit at opposite edges. Supply is at the left end of the divider; Undo and End turn are at the right. Desktop piles are larger, with your health and actions at bottom left; phone health stays between field and hand. The active side fades toward the center and only animates on entry. Opponent state is red and also identified in text.

## Run

From the repository root:

```sh
npx vite --config docs/design/table-directions/vite.config.mjs
```

- Review and comments: <http://127.0.0.1:5178/docs/design/table-directions/>
- Comparison: <http://127.0.0.1:5178/docs/design/table-directions/compare.html>

The review switches between 360×720 phone and 1120×660 desktop canvases, your/opponent turn, and seven illustrative situations. Tap a card for a two-column inspection, or hold Shift while hovering. The soul button and Ougi donor/recipient selection update only the fixture. Scene selection illustrates dragging; it does not run the game engine. On phones, the trap response temporarily uses the hand area, following the source wireframe.

Use “Комментировать”, then click a part of the table to attach feedback. Comments and preference are stored locally in ignored `feedback.json`, using the local Vite endpoint. This server is intended only for local design review. Choosing a direction does not change the game.

## Verification

- Browser checked all 42 theme/device/situation combinations: six field cards, no canvas overflow, identical geometry between themes.
- Visually inspected all three directions on phone and desktop, plus the trap prompt and two-column inspection. Lacquer inspection uses dark text on a light panel.
- Checked soul addition (Yuki-onna 4→5 ATK, 1→2 souls, Supply 10→9, actions 2→1) and Ougi transfer to Kappa (4 ATK, 1 soul).
- Checked comment creation, visible pin, opening from pin and deletion. No test comment or preference remains.
- Local feedback validation rejected seven invalid/cross-origin/method requests without changing saved state.
- Keyboard-focus styles, native modal dialogs, 44px utility/response buttons and reduced-motion styles are included. Source card typography is read through inspection.

```sh
npx tsc --noEmit --jsx react-jsx --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2022,DOM --types vite/client --skipLibCheck docs/design/table-directions/board.tsx
node --check docs/design/table-directions/review.js
node --check docs/design/table-directions/vite.config.mjs
git diff --check
```

These are visual review fixtures. No real-phone hardware, screen-reader audit, complete game, online session or production deployment was tested in this design pass.
