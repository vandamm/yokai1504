# Turn effects and prompt review

This is a separate, commentable mockup. It reuses the game's Table, card artwork, card definitions and live card faces. It does not change the production game or submit game commands.

Start from the repository root:

```sh
npx vite --config docs/design/outline-review/vite.config.mjs
```

Open <http://127.0.0.1:5174/docs/design/outline-review/>. Keep this server running while reviewing. It is separate from the game preview on port 8787.

This is the second set of visual options, after the frame treatments were rejected. A: Spotlight puts a pool of light and deeper card shadows on the active side. B: Spirit mist uses drifting wisps and small floating lights. C: Ink tide uses a Japanese wave pattern with a spreading ripple. All become red when the opponent acts. The effects are painted behind the cards, cover the acting half, and have no perimeter frame. Replay effect restarts the entry animation; reduced-motion settings disable motion. Desktop and Phone controls render real table components at their respective viewport sizes.

The Moment control switches main actions, trap responses, Ougi choices, action messages and connection retry. Prompts replace content in a fixed area beneath the viewer's health; no green announcement stripe is inserted. The two-column tooltip puts the original card image on the left and all text on the right, with no separate attack/soul rows.

Use Add comment, then click an effect, field, card, hand, toolbar, history, prompt, tooltip image or tooltip text. Comments record the selected option, acting player, moment, part and relative position. They save through the local review server to git-ignored `feedback.json`, so Codex can read them in the next review without an upload. The Comments drawer can return to a pinned part or remove a comment. Prefer option saves an explicit preference; selecting a preview alone does not approve it.

Verified this round: TypeScript and JavaScript syntax; all three effects render without borders, underneath the table content, with pointer events disabled. All three opponent versions use the same red palette. Battlefield bounds match across all three options on desktop (1440 × 820) and phone (390 × 844), with no horizontal overflow. All five prompt moments retain identical phone battlefield bounds. An effect-region comment was saved, shown as a pin and removed after verification. The fixed prompt area and two-column tooltip are retained. Hand scrollbars are hidden; touch scrolling and the existing arrow buttons remain available. Physical-device testing and production implementation are outside this mockup.
