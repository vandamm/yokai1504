# Yokai 1504

A local two-player implementation of Yokai 1504. Both players use the same browser. All cards and images are bundled; the running game does not need external services.

## Play online

[Open Yokai 1504](https://vandamm.github.io/yokai1504/). Both players share one device; private handoffs, open-hands testing and undo work in the hosted version. Matches stay in the browser you use, separately from local development saves.

## Deployment

Every push to `main` runs `npm ci`, the full test suite and the production build, then deploys `dist/` with GitHub Actions to GitHub Pages. A failed test or build prevents deployment. You can also run **Deploy GitHub Pages** manually from the repository's Actions tab.

Pages must use **GitHub Actions** as its deployment source. Vite uses a relative base and runtime assets use `BASE_URL`, so the same code works locally and under `/yokai1504/`. No secrets or additional hosting service are required.

## Run locally

Use Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`, then `npm run preview`.

Open the HTTP URL, not `index.html` directly. Keep the terminal server running while playing.

### Play on a phone

Run `npm run dev:lan` on your computer. Connect the phone to the same trusted Wi-Fi and open the **Network** URL printed by Vite, such as `http://192.168.1.98:5173/`. Keep the computer awake and the server running. This exposes the local development game to your LAN; it does not publish an online game. Matches are saved separately in each browser and origin.

The table keeps the rival’s hand above the facing yokai fields and your hand and actions at the bottom. Tap a card for its actions, then tap marked board targets. Attack submits on the target tap; spells use an explicit confirmation. Sake shows a soul allocation stepper. **Details** opens readable card rules without changing a choice; larger desktops keep details and history beside the table. Short screens scroll the battlefield independently. Accepted actions, undo, and player/mode changes clear drafts. Pending effects save and resume after refresh.

## Play

Start Game prepares the table, shuffles both decks, deals four cards each, and takes the starting player's mandatory first draw. Select a card to choose an action; use Details to inspect visible cards during targeting. Play cards and evoke souls up to a combined two times per main phase; releases and setting a trap have their own rules. Attack with one yokai or end the turn without attacking.

Private play uses a handoff curtain whenever the decision maker changes. Open hands (testing) shows both hands and traps and skips those curtains; it preserves game rules and response choices. It does not reveal deck order. The mode can be changed during a local match.

Undo restores the last accepted action and all of its consequences, including draws, damage, costs, and turn/response changes. Repeat undo to go back further. Undo history and the match save automatically in this browser. Undo cannot erase information players already saw. Starting a new match replaces the current local save.

## Architecture and future online play

- `src/game/` contains the card catalog, pure deterministic rules, serializable pending decisions, and player-specific views. It has no browser/storage/network dependency.
- `src/session/` owns command IDs, monotonic match revisions, local saves, and undo checkpoints. Its asynchronous interface is the replacement point for an online service.
- `src/ui/` renders views and submits commands. Normal player views exclude the opposing hand and unknown trap; the explicit local testing view reveals them.

For online play, run the same rules on an authenticated authoritative server. Persist snapshots and command receipts atomically, return only the requesting player's view, and use revision checks and command IDs for stale clients/retries. Live subscriptions and correspondence polling can share that protocol. Persisted defender/effect decisions survive disconnection. Online play and negotiated online takebacks are not implemented in this release.

## Rules notes

The English rulebook and designer's bilingual cards govern this implementation. Some interactions are underspecified; the app uses these explicit rulings:

- A trap that removes the original defending yokai cancels the consumed attack. A direct attack still redirects to a defender summoned by Boseki.
- Yuki-onna's soul replacement prevents destruction, while battle damage from the original attack difference still applies.
- Tengu damage resolves before the mandatory main-phase draw. A lethal event stops later effects.
- Chochin-kozo's delayed effect resolves after battle and survives Chochin's battle destruction.
- Nurikabe's summon-turn restriction applies while it remains on that controller's field. Control exchange is not summoning.
- Rokurokubi draws only on actual opposing battle destruction, using possession at battle time, including a tied battle where it is also destroyed.
- Borrowed yokai return to their original owner's graveyard. Battle damage and effects use their current controller.
- An exact-count effect needs a legal target; an "up to" effect can select zero. Revived yokai have zero souls.

The current catalog cannot prevent mandatory empty-deck damage or replenish decks, so normal passing eventually finishes the game. No arbitrary repeated-position or turn-count stalemate rule is added.

See [design](docs/superpowers/specs/2026-10-21-yokai-1504-design.md) and [verified card catalog](docs/references/yokai-1504-card-catalog.md) for source details.

## Checks

```sh
npm test
npm run build
```

The suite covers individual card effects, combat and reactions, hidden-information projections, deterministic complete-match simulations, storage failures, save validation, duplicate/stale submissions, and undo/resume.

Verified 2026-10-22: **197 tests passed across twelve files**, TypeScript and production build passed. The clean table was checked at ten phone/tablet/desktop sizes, including two complete gameplay audits, exact/overkill combat wins, empty-deck and extra-draw wins, direct targeting, trap responses, Sake/Ougi/Boseki, undo/refresh, duplicate controlled cards, long names, fifteen-card hands and zero Supply. Physical iPhone/Android tests and native text magnification remain unverified. See the [verification record](docs/verification.md).

## Credits

Game design: Yusei Kozu. Artwork: MINORI. English translation: Jacek Mackiewicz. Publishers: KOZU and JELLY JELLY GAMES. This local implementation is an unofficial adaptation.

Card illustrations come from the designer's [official card posts](https://gamemarket.jp/booth/blog/6673). The [English rulebook](https://cdn.shopify.com/s/files/1/0664/3197/5477/files/Yokai1504_Rulebook_ENG.pdf?v=1782548535) is bundled in `docs/references/`.
