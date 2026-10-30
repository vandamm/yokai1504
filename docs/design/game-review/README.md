# Game appearance review

Three disposable design prototypes using the existing artwork, card definitions and CardFace. Production UI, rules, online sessions and deployment are untouched.

Run from the repository root:

```sh
npx vite --config docs/design/game-review/vite.config.mjs
```

Open http://127.0.0.1:5175/docs/design/game-review/ for the interactive review, or `compare.html` beside it for all three phone views. The full-size link opens the selected composition directly. Keep the local server running to save comments.

The review switches between desktop (1280 × 820) and phone (390 × 844), actor and five situations. Attack and soul buttons replay finite demonstrations. Trap activation opens Ougi; select a donor and recipient on the field. End turn changes the actor explicitly. Undo resets the demonstration. These are fixtures, not a playable game or a rules simulation.

Comments and the optional preference are saved to this directory's git-ignored `feedback.json`, independently of the earlier outline review. Do not overwrite user feedback. The middleware retains the earlier server's validation and atomic writes.

Verified in the browser: all fifteen desktop option/situation combinations preserve their board and divider geometry, without table overflow. All fifteen phone combinations also preserve their geometry without table overflow. B gives the table more height by placing its actor label in the decision shelf; C groups both health values at the top. The trap-to-Ougi transition reveals the spell in the graveyard; selecting Yuki-onna then Kappa changes them from 4/2 attack to 3/4 with the transferred soul. Attack finishes with Kappa hidden, graveyard count increased, Poli at 13 health and a persistent receipt. Soul addition updates Yuki-onna to 5 attack/two souls. Reduced motion removes animation while retaining the result. A Cyrillic QA comment was saved on the mobile decision panel, produced a correctly positioned pin, and was removed.

TypeScript, JavaScript syntax and whitespace checks pass. Nine sampled foreground/background pairs for ordinary text, secondary text and primary buttons exceed 4.5:1 contrast (lowest 4.94:1). This is not a complete accessibility audit: original card artwork, text zoom, screen readers and physical phones remain untested. The drag alternative is a design proposal; this prototype implements only the interactions needed to compare the UI. See [DESIGN.md](./DESIGN.md) for the analysis, motion policy and tradeoffs.
