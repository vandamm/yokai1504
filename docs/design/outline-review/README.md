# Outline and prompt review

This is a separate, commentable mockup. It reuses the game's Table, card artwork, card definitions and live card faces. It does not change the production game or submit game commands.

Start from the repository root:

```sh
npx vite --config docs/design/outline-review/vite.config.mjs
```

Open <http://127.0.0.1:5174/docs/design/outline-review/>. Keep this server running while reviewing. It is separate from the game preview on port 8787.

The options are A: a crisp blue frame (recommended), B: an amber double frame, and C: violet corners with a fine perimeter. All become red when the opponent acts. The frame covers the whole acting side without a background wash. Desktop and Phone controls render real table components at their respective viewport sizes.

The Moment control switches main actions, trap responses, Ougi choices, action messages and connection retry. Prompts replace content in a fixed area beneath the viewer's health; no green announcement stripe is inserted. The two-column tooltip puts the original card image on the left and all text on the right, with no separate attack/soul rows.

Use Add comment, then click an outline, field, card, hand, toolbar, history, prompt, tooltip image or tooltip text. Comments record the selected option, acting player, moment, part and relative position. They save through the local review server to git-ignored `feedback.json`, so Codex can read them in the next review without an upload. The Comments drawer can return to a pinned part or remove a comment. Prefer option saves an explicit preference; selecting a preview alone does not approve it.

Verified: TypeScript and JavaScript syntax; comment validation, persistence/reload and removal; browser pin creation on tooltip text and selection of the outline region; all three opponent outlines red; both tooltip columns. Battlefield and hand coordinates stayed identical across all five moments on desktop (1440 × 820) and phone (390 × 844). The phone table had no horizontal document overflow. Physical-device testing and production implementation are outside this mockup.
