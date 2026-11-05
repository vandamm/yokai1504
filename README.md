# Yokai 1504

A two-player implementation of Yokai 1504 with invite-only online rooms and local testing. All cards and images are bundled; the running game does not need external services.

## Play against AI

Choose **Play AI** on the welcome screen. Your game saves on this device and resumes after reload. You stay at the bottom; the opponent handles its own turns, traps and effects. Undo rewinds its replies together with your last action. Thinking runs in a worker.

The opponent knows the fifteen-card deck and searches card combinations using sampled possibilities for unseen cards. Its policy receives only its own private player view: your hand, hidden trap identity and both deck orders are excluded. Self-play uses the same restriction on every decision.

Train again with `npm run train:ai`. The trainer starts from the bundled policy, explores mutated strategies, and plays paired seats against current and earlier policies. A separate selection bank picks a checkpoint; untouched validation games decide whether to retain it. Failed runs preserve the previous policy. It writes `src/ai/trained.json` and [the training report](docs/ai-training-report.json), including separate benchmarks and any unfinished matches. Options: `--seed 1504 --generations 6 --population 5 --games 16 --validation 32`. Game counts must be even. This is a small, local self-play search agent; its strength against experienced people still needs playtesting.

## Play online

[Open the online game](https://yokai-1504.vansach.me/). The original [workers.dev address](https://yokai-1504-online.vandamm.workers.dev/) also remains available. This branch adds a separate Cloudflare Worker with an authoritative, persistent game server. The main branch’s [GitHub Pages site](https://vandamm.github.io/yokai1504/) remains the local-testing version.

The box-inspired welcome screen offers Start a game and Join a game. Enter your name to create a table, then send its invitation to the second player. Join accepts a pasted invitation; opening an invitation directly prepares the join form for you. Local testing and recent tables are below the online controls. Each browser keeps its own private seat. Only your hand and trap are revealed. Live updates poll every two seconds while visible; pending turns, traps and effects persist when both players leave. Reopen the room link in the same browser to resume. The table keeps your side at the bottom throughout.

Treat the invitation as private: it grants the first guest the other seat. Once joined it cannot admit a different seat. Invitations are carried in URL fragments and removed after joining. Seat credentials stay in browser storage and Authorization headers; clearing browser data loses access. There are no accounts or seat-recovery emails yet.

Browser seats are saved per domain. Use an existing game’s original room link to return to it; seats from workers.dev do not automatically transfer to vansach.me. New games and invitations use the address where you start them.

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

The table has fan hands at the top and bottom, three yokai per side, decks/graveyards at the left edge and traps at the right. Red heart/number health sits between each hand and field on phones and desktop. Action pips sit beside your health. Supply is at the left end of the divider; Undo and End turn are at the right. End turn becomes green after both actions are spent. Battle completion ends the turn automatically after playback.

Small aligned waves cover the table. The acting half is green for your decisions and red for the opponent’s, fading toward the divider. The waves animate once on entry; reduced motion disables this. Pending decisions, errors and notices overlay the board without moving the cards. Online seats keep the same side throughout, including trap responses.

Drag yokai onto your field, spells onto the same field or your trap slot, and your field yokai onto an opposing yokai to attack. If the opposing field is empty, drop onto its highlighted play area or health to attack directly. Played cards leave their hands immediately; previews retain live attack and physical soul counters. Yokai stay on the board immediately after dropping. Attacks, destruction and draws retain visible playback. Enemy trap reveals enlarge at the center for one second before moving to the graveyard. Turn and result signs appear at the center and dismiss on tap or automatically.

Tap the ghost soul token with a small plus in the next empty slot to add a soul. The visual token is small but its touch target is 44×44px. Sake uses the same controls to stage up to three allocations on either field; Jufu selects up to two targets; Resolve confirms either spell. Ougi selects donor then recipient directly on the field. Other effects also select their targets on the table. Trap response offers Activate trap or Keep hidden. Select a release yokai and choose Release a soul in its details, or use its field Release control. Boseki revives a graveyard card by selection or drag.

While choosing targets for a spell cast on your turn, Cancel spell restores its card and action, including when cast from your trap slot. It uses the same saved Undo checkpoint locally and online, and clears staged choices. Trap responses and release effects keep their existing Undo control.

Tap a visible card for image-left/text-right inspection, or hold Shift and hover on desktop. Hovering over a hand card on desktop enlarges it; decks, traps, Supply and End turn also scale up for desktop layouts. A hand yokai cannot be picked up when your field is full or your main actions are spent. Current attack/souls remain on the field cards instead of being repeated in inspection. Open the top-right ☰ for history grouped by turn/player and its Table menu, which contains rules, replay import/export and game settings. Underlined history card names show a reference tooltip on hover or keyboard focus, or open details when tapped. Hand scroll arrows keep large hands reachable on phones. Space/Enter picks up and drops cards with the keyboard; Escape cancels a drag.

## Play

Start Game prepares the table, shuffles both decks, deals four cards each, and takes the starting player's mandatory first draw. Drag cards to play or attack; tap a visible card to inspect it. Play cards and evoke souls up to a combined two times per main phase. Releasing a soul and setting a trap do not spend either of those two actions. Attack with one yokai or end the turn without attacking.

Local play is for testing and has no pass screen or reveal step. Open hands is enabled by default and shows both hands and traps. Switching it off shows only the decision player’s hand and trap; the table stays visible when decisions change players. Neither option reveals deck order.

Undo restores the last accepted action and all of its consequences, including draws, damage, costs, and turn/response changes. Repeat undo to go back further. Undo history and the match save automatically in this browser. Undo cannot erase information players already saw. Starting a new match replaces the current local save.

## Export and replay for debugging

Public history hides routine draws and uses compact summon, attack, damage, destruction and spell icons. Soul changes use the original soul artwork. Card links stay underlined and inspectable, with green for your original cards and red for the opponent's. Ownership colors follow the original deck even after a control exchange; hover/focus labels also name the owner. Empty-deck damage and its cause remain visible. Existing saved histories recover owner references from accepted actions when those checkpoints are available.

Choose **☰ → Table menu → Export replay & finalize** in a finished online game, or **Export replay** in local testing, to download a versioned JSON file containing the initial position, reproducible active command sequence, final position and accepted-action audit, including undo branches and mode changes. The file includes both hands and deck order.

Choose **Import replay** from setup or the table menu. Load the JSON file or paste it, optionally choose an action number, then open it in a new session. The importer validates and re-executes every command before creating an independent save in a new tab. Undo can inspect earlier accepted positions without changing the original match. Older saves with automatic post-battle turns export with explicit End turn steps. Historic unusable-trap response pauses also remain reproducible.

## Architecture and future online play

- `src/game/` contains the card catalog, pure deterministic rules, serializable pending decisions, and player-specific views. It has no browser/storage/network dependency.
- `src/session/` owns command IDs, monotonic match revisions, local saves, and undo checkpoints. Its asynchronous interface is the replacement point for an online service.
- `src/ui/` renders views and submits commands. Normal player views exclude the opposing hand and unknown trap; the explicit local testing view reveals them.

Online play runs the same rules on an authenticated authoritative server. Snapshots and command receipts persist atomically; only the requesting player’s view is returned. Revision checks and command IDs handle stale clients and retries. Polling supports live and correspondence play, and pending defender/effect decisions survive disconnection. The server enforces each player’s Undo window without an approval step. Accounts, public matchmaking and chat are outside this first online version.

## Home Screen app and notifications

After creating or joining an online game, notification settings open automatically unless this device is already enabled for that game. Close the panel to keep playing; it does not reopen on turns or reloads. Browser permission is requested only after tapping Enable.

Open https://yokai-1504.vansach.me/ in Safari on iPhone, choose **Share → Add to Home Screen**, then open the new icon before starting or joining a game. On versions showing **Open as Web App**, leave it enabled. System notifications require iOS 16.4 or later. Desktop browsers can use their **Install app** option; installation is optional for desktop notifications.

At an online table, tap the **bell → Enable notifications → Allow**. Enable alerts separately for each game and device. The same panel sends a test and turns alerts off for that game. Alerts cover your turn, trap/effect decisions, opponent joining and game results, including while the page is closed. They show public status only; tapping opens the table without exposing seat credentials or invite secrets.

The installed app still needs internet for online games. The service worker handles notifications only and does not cache game state or API responses. Seats belong to the browser or installed app where you joined; Home Screen installation does not provide account-based recovery.

The server requires a stable `WEB_PUSH_VAPID` secret containing JSON with `publicKey` (base64url raw P-256), `privateKey` (base64url JWK `d`) and `subject` (the app's HTTPS URL). Configure it using Wrangler's secret input or a protected `secret bulk` JSON file; never commit keys or rotate them without re-enabling existing device subscriptions. Local development reads ignored `.dev.vars`. The Worker stores per-seat subscriptions separately from replays, permits four devices per seat/game, and uses Durable Object alarms for delivery/retries. Pending alerts are replaced by subsequent game actions; immediate Undo cancels an unsent alert.

Run `npm run test:push` for the real Worker runtime test with a simulated push provider. Actual permission prompts and system delivery also need a browser/device check.

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
