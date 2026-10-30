# Yokai 1504

A two-player implementation of Yokai 1504 with invite-only online rooms and local testing. All cards and images are bundled; the running game does not need external services.

## Play online

[Open the online game](https://yokai-1504-online.vandamm.workers.dev/). This branch adds a separate Cloudflare Worker with an authoritative, persistent game server. The main branch’s [GitHub Pages site](https://vandamm.github.io/yokai1504/) remains the local-testing version.

Create an online table, enter your name, and send the invitation link to the second player. Each browser keeps its own private seat. Only your hand and trap are revealed. Live updates poll every two seconds while visible; pending turns, traps and effects persist when both players leave. Reopen the room link in the same browser to resume. The table keeps your side at the bottom throughout.

Treat the invitation as private: it grants the first guest the other seat. Once joined it cannot admit a different seat. Invitations are carried in URL fragments and removed after joining. Seat credentials stay in browser storage and Authorization headers; clearing browser data loses access. There are no accounts or seat-recovery emails yet.

Online Undo is immediate for your own actions, including End turn, until the opponent takes an action. Their first accepted action closes your previous undo window permanently, even if they undo that action. Free actions and trap responses count; automatic draws, polling and rejected commands do not. Full replay export is available only after the game finishes, because it includes both hands and deck order. Exporting permanently finalizes the online game and disables Undo for both players, including after a refresh or interrupted download. The replay remains downloadable again. Local testing retains instant undo and optional open hands. Choosing a new table leaves online rooms saved and listed under Recent online tables.

## Run the online server locally

```sh
npm ci
npm run dev:online
```

Open the printed Worker URL (normally http://127.0.0.1:8787). To test two isolated local seats on one computer, use 127.0.0.1 for the host and localhost for the guest invitation; these have separate browser storage while reaching the same local server. The local Vite-only command still runs local testing, and reports online hosting unavailable if you attempt an online room there.

```sh
npm test
npx tsc -p tsconfig.worker.json --noEmit
npm run test:online:http # with the local Worker running; honors rate-limit Retry-After
npm run deploy:online  # after wrangler login
```

Online deployment uses the separate `yokai-1504-online` Worker and one SQLite Durable Object per match. State mutations, revision checks and command receipts commit atomically. Online shuffles use cryptographic randomness for every draw, while local seeded setup remains reproducible. Responses contain only the authenticated seat’s projected view. Anonymous requests have per-IP rate limits. Create/join/move retries preserve their original credentials and command IDs.

## Main branch deployment

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

The table keeps the rival’s hand above the facing yokai fields and your hand and actions at the bottom. Drag yokai onto your field, spells onto the same field or your **Trap** slot, and your field yokai onto an opposing yokai to attack. If their field is empty, drag onto their health. There are no click-to-play or click-to-attack controls. Use **+ soul** beside eligible yokai; select a release yokai to reveal its free Release control. Hand scroll arrows keep large hands reachable on touch screens.

On desktop, hold **Shift** and hover a visible card for a large inspector, including cards in a graveyard. The sidebar shows the current turn above history grouped by round and player. Underlined card names show a reference tooltip on hover or keyboard focus, or open details when tapped. On phones, select a card and use **Inspect** beneath the current player’s health; **Menu → Public history** opens a side drawer.

Pending effects show clear target choices above the table. Tap a marked card or an explicit choice to resolve Hamaya and other targeted effects. Sake uses + soul to stage allocations; Jufu selects up to two targets; **Resolve** confirms either spell. Ougi chooses donor then recipient, or drags your donor onto a recipient. Opposing cards remain selectable targets but cannot be picked up. Boseki revives a graveyard card by selection or drag.

Dragged cards disappear from the hand while held. Yokai stay on the board immediately after dropping, and added souls animate in place. Attacks, destruction and draws retain visible playback; **End turn** remains explicit. Actions, Undo, Inspect and End turn sit beneath the decision player’s health. Trap response instructions appear below the table. There are no selection arrows, empty-field frames or visible hand-count labels. Drag previews retain live attack and souls; casting highlights the whole own field. Pending effects save and resume after refresh.

## Play

Start Game prepares the table, shuffles both decks, deals four cards each, and takes the starting player's mandatory first draw. Drag cards to play or attack; use Details to inspect visible cards during targeting. Play cards and evoke souls up to a combined two times per main phase; releases and setting a trap have their own rules. Attack with one yokai or end the turn without attacking.

Local play is for testing and has no pass screen or reveal step. Open hands is enabled by default and shows both hands and traps. Switching it off shows only the decision player’s hand and trap; the table stays visible when decisions change players. Neither option reveals deck order.

Undo restores the last accepted action and all of its consequences, including draws, damage, costs, and turn/response changes. Repeat undo to go back further. Undo history and the match save automatically in this browser. Undo cannot erase information players already saw. Starting a new match replaces the current local save.

## Export and replay for debugging

Choose **Menu → Export replay & finalize** in a finished online game, or **Export replay** in local testing, to download a versioned JSON file containing the initial position, reproducible active command sequence, final position and accepted-action audit, including undo branches and mode changes. The file includes both hands and deck order.

Choose **Import replay** from setup or the table menu. Load the JSON file or paste it, optionally choose an action number, then open it in a new session. The importer validates and re-executes every command before creating an independent save in a new tab. Undo can inspect earlier accepted positions without changing the original match. Older saves with automatic post-battle turns export with explicit End turn steps. Historic unusable-trap response pauses also remain reproducible.

## Architecture and future online play

- `src/game/` contains the card catalog, pure deterministic rules, serializable pending decisions, and player-specific views. It has no browser/storage/network dependency.
- `src/session/` owns command IDs, monotonic match revisions, local saves, and undo checkpoints. Its asynchronous interface is the replacement point for an online service.
- `src/ui/` renders views and submits commands. Normal player views exclude the opposing hand and unknown trap; the explicit local testing view reveals them.

Online play runs the same rules on an authenticated authoritative server. Snapshots and command receipts persist atomically; only the requesting player’s view is returned. Revision checks and command IDs handle stale clients and retries. Polling supports live and correspondence play, and pending defender/effect decisions survive disconnection. The server enforces each player’s Undo window without an approval step. Accounts, notifications, public matchmaking and chat are outside this first online version.

## Rules notes

The English rulebook and designer's bilingual cards govern this implementation. Some interactions are underspecified; the app uses these explicit rulings:

- A trap that removes the original defending yokai cancels the consumed attack. A direct attack still redirects to a defender summoned by Boseki.
- Yuki-onna's soul replacement prevents destruction, while battle damage from the original attack difference still applies.
- Tengu damage resolves before the mandatory main-phase draw. A lethal event stops later effects.
- Chochin-kozo's delayed effect resolves after battle and survives Chochin's battle destruction.
- Nurikabe's summon-turn restriction applies while it remains on that controller's field. Control exchange is not summoning.
- Rokurokubi draws only on actual opposing battle destruction, using possession at battle time, including a tied battle where it is also destroyed.
- Borrowed yokai return to their original owner's graveyard. Battle damage and effects use their current controller.
- An exact-count effect needs a legal target; an "up to" effect can select zero. Attacks skip unusable traps using the same activation requirements as casting. You can cast your previously set trap during your own main phase for one action. Revived yokai have zero souls.

The current catalog cannot prevent mandatory empty-deck damage or replenish decks, so normal passing eventually finishes the game. No arbitrary repeated-position or turn-count stalemate rule is added.

See [design](docs/superpowers/specs/2026-10-21-yokai-1504-design.md) and [verified card catalog](docs/references/yokai-1504-card-catalog.md) for source details.

## Checks

```sh
npm test
npm run build
```

The suite covers individual card effects, combat and reactions, hidden-information projections, deterministic complete-match simulations, storage failures, save validation, duplicate/stale submissions, and undo/resume.

Verified 2026-10-29: **274 tests passed across twenty-four files**, TypeScript and production build passed. Browser checks covered turn changes without handoffs, undo across turn/trap/effect decisions, history tooltips, whole-side casting highlights and in-place soul allocation. Six played cards and controls fit at six phone/desktop viewports without document overflow. Physical iPhone/Android touch testing remains unverified. See the [verification record](docs/verification.md).

## Credits

Game design: Yusei Kozu. Artwork: MINORI. English translation: Jacek Mackiewicz. Publishers: KOZU and JELLY JELLY GAMES. This local implementation is an unofficial adaptation.

Card illustrations come from the designer's [official card posts](https://gamemarket.jp/booth/blog/6673). The [English rulebook](https://cdn.shopify.com/s/files/1/0664/3197/5477/files/Yokai1504_Rulebook_ENG.pdf?v=1782548535) is bundled in `docs/references/`.
