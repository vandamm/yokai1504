# Larger forecast skull — 2026-11-04

- Enlarged the white forecast skull from 120% to 160% of card width and moved its trap-uncertainty question mark beside the lower-right jaw. Actual death markers keep their previous size. Forecast damage remains numeric, without an HP label.
- 370 tests, frontend/Worker type checks, production build and whitespace checks passed. No new tests for this CSS-only adjustment; browser and physical iPhone visuals were not checked.
- Published version `46c06f45-4551-4430-97f5-c625f60edd3d`. Live HTML references the new release, and the served JavaScript and CSS match the tested build exactly.

# Attack aiming and impact — 2026-11-04

- Published version `1a0f0a12-8800-4666-aacd-d6a878ec766a` to the existing Worker and https://yokai-1504.vansach.me/.
- Deployed yokai stay on the field while a thick red parabolic arrow follows the pointer from the exact initial press. The tail is horizontal, gaps have flat ends, and the smaller head follows the final tangent.
- Lethal forecasts use large white skulls over translucent black card overlays; survivors have no marker. Health forecasts and trap uncertainty use only visible information.
- Combat waits for trap resolution. The card stops at shallow edge contact; attack/counter strengths, health changes and death skulls appear at contact, with immediate return and no shake or hold. Boseki revival is staged before the strike and its casualties use the correct field geometry.
- 370 tests across 30 files, frontend/Worker type checks, production build, deployment dry run and whitespace checks passed. Independent review found the Boseki case; its regression failed first and then passed with private player snapshots.
- All 28 published static files match the local build byte for byte. Custom-domain HTML references the tested bundles; origin HTML matches exactly (Cloudflare adds its challenge script on the custom domain). A separate production test game passed private-seat checks, End turn, Undo and reload.
- Pointer geometry, motion lifecycle and static rendering were tested without browser access. Browser interaction, visual layout and physical iPhone behavior were not verified in this run; on-device adjustment remains the next feedback step.

# Published UI updates — 2026-11-04

- Deployed all current changes to https://yokai-1504.vansach.me/ and the existing workers.dev address as version `0e4f0a10-4592-471b-92c5-302978d47a0a`.
- Includes full-screen table/home backgrounds, health updates when damage animation starts, the original English rulebook link, named unfinished games as the main home action, an enlarged mobile trap drop target and Set trap in card details.
- 358 tests, frontend/Worker type checks, production build and deployment dry run passed. All 27 fetched production assets match the tested build; live HTML references the new bundles and includes the teal document background and translucent status-bar setting.
- A separate production test game verified creation, joining, private hands, End turn, Undo and reload. The public notification configuration endpoint responds successfully. Physical iPhone cutout rendering and touch ergonomics remain unverified.

# Green/red player and card names — 2026-11-04

- Card names now use a clear green (`#267a34`) for the viewer's cards and red (`#b32635`) for the opponent's. Player names use the same pair in log headings, messages, attack targets, damage reasons and turn summaries. Card inspection links retain their original ownership, even if a player's name matches a card.
- Name matching treats punctuation literally and avoids matching inside longer words. Identical player names remain neutral in text logs where the seat cannot be distinguished reliably.
- 361 tests across 29 files, frontend/Worker type checks, build and whitespace checks pass. Phone (390×844) and desktop (1280×800) browser checks confirm matching name/card colors and no document overflow. Green/red text contrast is 5.32:1 and 6.42:1 against the log background. [Phone screenshot](verification/player-name-colors-phone.jpg), [desktop screenshot](verification/player-name-colors-desktop.jpg). Physical-device testing was not repeated.
- Deployed version `aebb9321-f5b9-41f5-95ef-6948509ef7f9` to the existing Worker/custom domain. Live JavaScript and CSS match the verified release exactly.

# Compact public history — 2026-11-03

- Routine draw messages are hidden; depleted-deck damage and its cause remain visible. Summons use ⛩️, attacks use ⚔️, damage uses a signed health amount and ❤️, destruction uses 💀, and cast/revealed spells use 💥. Soul changes use the original soul icon. Trap-setting messages keep the player's name; final sentence periods are removed. Turn grouping remains unchanged.
- Card names retain inspection links/tooltips and are green for the viewer's original cards and red for the opponent's, with owner labels for accessibility. References are recorded from the actual card instance, so identical names, Nekomata exchanges, revival and destruction preserve original ownership. Hidden draws and set traps disclose no private card references.
- Existing text histories recover their references from matching saved transitions. History text remains available separately in views for existing clients and animations. Legacy replays still import; metadata is validated, normal Undo/reload works, and incorrect Undo-branch receipts cannot supply history references. No rules or costs changed.
- 352 tests across 29 files, frontend/Worker type checks, production build and whitespace checks pass. The HTTP game test completed after 70 actions with private seats, stale/retry handling, Undo, victory and finalized replay import verified.
- Browser checks at 390×844 and 1280×800 show the compact log without document overflow. Original soul artwork is visible on the light background; Jufu's hover tooltip works. Card-name colors have 6.83:1 and 6.36:1 contrast against the surface. No console warnings/errors. [Phone screenshot](verification/compact-history-phone.jpg), [desktop screenshot](verification/compact-history-desktop.jpg). Physical-device testing was not repeated.
- Deployed version `cd2f6c8b-76a4-4e76-96ac-c64bd45c9e19` to the existing Worker and custom domain. Live asset references and a fresh online game's persistent card-owner records were verified; the plain-text history projection remains available for existing clients.

# Mirrored desktop health — 2026-11-03

- Desktop health displays share the left column and 36px number size: opponent at the upper-left, local player at the lower-left. The opponent label keeps its natural height. The change is confined to the existing 700px desktop media query.
- Browser checks at 700×640 and 1280×800 place both health displays at x=24 with matching 80×40px health areas and no document overflow; the opponent label remains readable. At 390×844, both remain centered at x=163 with 64px-wide health areas. Build, frontend/Worker type checks and whitespace checks pass. No new tests for this CSS-only positioning change; physical-phone testing was not repeated. [Desktop screenshot](verification/desktop-mirrored-health.jpg).
- Deployed version `a378c69d-aedb-46a2-ad5e-e5f1b03dcd39` to the existing Worker and custom domain.

# Nekomata action-count clarification — 2026-11-03

- Verified the reported sequence against the English rulebook's starred Main Phase actions and the designer's [rules explanation](https://gamemarket.jp/blog/196520): playing a card and evoking a soul share the two-action limit; releasing a soul does not spend one. Starting with two actions, evoking once and using Nekomata's exchange correctly leaves one action. No action refund was found in the engine.
- The action indicator disappeared during target selection and returned afterwards. It now remains visible during the turn player's voluntary spell/release decisions, while staying hidden during opposing trap responses. Engine tests cover evoking and exchanging with either one or two actions already spent by the evoke step; neither release nor exchange changes the spent count. Rendering tests cover the stable count during cast/release and the opposing viewer's privacy.
- 333 tests across 28 files, frontend/Worker checks, production build and whitespace checks pass. This verifies state transitions and rendered controls; physical-phone behavior was not retested.
- Deployed version `55ca997f-e3e9-4a88-9d9f-05af51045254` to the existing Worker/custom domain; the live frontend matches the tested bundle exactly.

# Notification offer after creating/joining — 2026-11-03

- Creating or joining an online table offers notification setup after the seat is successfully established. The check uses browser permission, its subscription and the server's per-game registration; already-enabled devices skip the offer. Unsupported/blocked browsers receive the existing installation/settings guidance. No browser permission is requested automatically, and failed status checks keep setup available without failing game entry.
- The check runs only for successful Create/Join actions, not polling, Undo, local testing or resumed tables. A late result is ignored if the player has moved to another game. Browser checks verified automatic offers after creation and invitation joining, dismissal, and no repeated offer after reload.
- 329 tests across 28 files, frontend/Worker checks, production build and whitespace checks pass in the new checkout. This includes six notification-offer cases; the old checkout's unrelated untracked UX-review prototype tests were not imported. Physical iPhone and system push delivery were not retested.
- Deployed version `3bdc80a0-913c-49be-b422-f489b1532eba` to the existing Worker and custom domain. Live creation automatically opened the ready-to-enable panel at 390×844 without overflow or console warnings/errors. [Phone screenshot](verification/notification-offer-phone.jpg).

# Home Screen app and opt-in Web Push — 2026-11-03

- Added a standalone manifest, 192/512px app icons and 180px Apple touch icon, safe-area padding, installation help and an online-table notification bell. iPhone requires Home Screen installation and iOS 16.4+; permission is requested only after tapping Enable. Preferences are per game/device and do not affect the game revision or Undo window.
- Push contains public decision status and the credential-free room URL. Subscriptions are authenticated, strictly validated, limited to known push-provider HTTPS endpoints and four devices per seat. Redirects are not followed. No subscriptions or keys enter game snapshots or replay exports.
- Game mutation, notification outbox and alarm scheduling persist together. Delivery uses encrypted aes128gcm/VAPID, durable retry, expired-endpoint cleanup and stable notification tags. Immediate Undo clears queued alerts. The service worker always displays a visible notification and focuses the matching table or opens another window; it does not cache gameplay/API responses.
- 336 tests across 28 files, frontend/Worker checks and production build pass. Real workerd integration covers authorization, seat ownership, device cap, command retries, encrypted delivery, restart/retry, expired endpoints and Undo cancellation. A separate HTTP game finished after 75 actions, with private seats, one-use invite, stale/retry checks, Undo and finalized replay verified.
- The notification panel and expanded install help fit 390×844, 360×640 and 1440×900 browser viewports without document overflow. Native permission acceptance, actual push-provider delivery and physical iPhone Home Screen behavior remain unverified; these are separate from the simulated-provider runtime checks.
- Deployed version `f28db202-7c3e-45ff-ab66-afcd9aff9e2d` to https://yokai-1504.vansach.me/ and the existing workers.dev address. Live manifest, service worker and all app icons exactly match the tested build; HTML references the tested frontend bundle and includes the install links (Cloudflare adds its own script). The public-key endpoint returns only the public key with no-store. Live browser creation and the ready-to-enable bell panel work without console warnings/errors. Screenshot: [phone notification settings](verification/notifications-phone.jpg).

# Dedicated game domain — 2026-11-03

- Connected `yokai-1504.vansach.me` as a custom domain for the existing `yokai-1504-online` Worker. The original workers.dev address remains enabled, with the same game storage. No routes or DNS changes were made to `apps.vansach.me`.
- Deployed version `9fdfa086-8577-452a-b7b5-64983545b1f6`; 318 tests, frontend/Worker checks, build, regenerated binding types and deployment dry run pass. The final change only adds the dedicated domain and explicitly retains workers.dev.
- Authoritative DNS and 1.1.1.1 return the Cloudflare addresses. HTTPS certificate verification, exact frontend asset comparison, online creation/join, private hands, End turn and Undo pass at the new hostname using its published address. The original URL also returns 200.
- The local resolver cached the previously absent hostname (about 24 minutes remaining when checked), so ordinary browser navigation is still waiting for that cache to expire. Verification used a request-scoped DNS override with certificate checks enabled; system DNS settings were unchanged. Browser seats remain separate per domain; existing games need their original room links.

# Welcome screen, spell cancellation and desktop controls — 2026-11-03

- The welcome screen follows the box’s turquoise, white lettering and red Chochin-kozo illustration, reusing bundled card art. Start/Join share the name field; direct invitations prepare the join form without exposing their private token in page text. Invalid pasted invitations show an explanation. Local testing and recent tables remain available.
- Cancel spell reuses the saved Undo checkpoint while choosing targets for a voluntary cast, returning the card and action and clearing staged choices. Tests cover five pending spells, persistence, casting from hand/trap online and rejection of the other player’s Undo. Browser checks cancelled a partially allocated Sake locally and Jufu online, with restored actions/cards visible to both seats.
- Desktop decks/traps, Supply, soul tokens and End turn scale up starting at 700px. Hovering a hand card shows a 200px preview. A hand yokai cannot be picked up with three yokai on the field or no main actions; spells can still be set freely. Actual pointer dragging verified the full-field block; hover was visually verified.
- Full-board checks at 360/390/700/994/1280/1440px found no horizontal overflow or card/control overlap; soul hit targets stayed 44px. Welcome checks at 320/390/700/760/994/1440px found no horizontal overflow, with 52px submit buttons. Screenshots were inspected at phone and desktop sizes; small landing text has at least 4.5:1 contrast. Local setup dealt 4/5 cards, 15 health and two actions; online creation and invitation joining worked through separate browser origins.
- 318 tests across 26 files, frontend/Worker TypeScript checks, production build, deployment dry run and whitespace checks pass. Deployed to https://yokai-1504-online.vandamm.workers.dev/ as version `19b53c22-adfe-45fa-ae77-221cae304071`. The live welcome screen loads without console warnings/errors, and its JavaScript/CSS match the tested build byte for byte. No full production-game or physical-phone check in this pass.

# Continuous sides and empty-field attacks — 2026-10-30

- The acting side has one uninterrupted tint from the center divider through the field and hand, including the battlefield gutters. Separate edge lines are removed. Both the near side on a 375 × 667 phone viewport and the far side in a 1440 × 900 online viewer were visually checked.
- Dragging a field yokai onto the empty opposing play area now declares a direct attack. The whole field lights up and says Drop to attack directly while it is a valid destination; dropping onto health remains supported. Occupied opposing fields still require choosing a yokai.
- Actual pointer drags at phone sizes dealt five damage, reducing health from 15 to 10 with both main actions already spent. Undo restored the original position and another direct drag worked. Keyboard pickup also exposed the empty-field destination. Tests cover both seats, occupied/own fields, first-turn restrictions and pending decisions.
- 287 tests, frontend/Worker TypeScript checks, production build and whitespace checks pass. Physical-phone touch testing remains unverified.

# Trap choices and battle presentation — 2026-10-30

- Trap responses offer Activate trap and Keep hidden. Ougi selects donor then recipient directly on the field; its duplicate target buttons and drag route are removed.
- The highlight covers the acting player's hand and field. During trap/effect responses it follows the defender, while history retains the actual turn owner. The normal turn banner is removed.
- Snapshots can include a presentation-only battle frame generated by the same validated effect code, before combat. Online frames use each viewer's private projection. Saves, commands, Undo checkpoints and replay outcomes are unchanged.
- Reproduced Yuki-onna with two souls attacking an empty-soul Kappa, with an Ougi trap transferring one soul to Kappa. Both visibly reach 4 ATK with one soul. The tied battle then destroys Kappa and spends Yuki-onna's last soul to survive. Attack/death animations retain the live values.
- Actual browser checks at 375 × 667 and 1440 × 900 covered field taps, donor/recipient prompts, the intermediate values, Undo back through trap activation, and Keep hidden retaining Ougi while applying three battle damage. No document-level horizontal overflow was observed.
- 285 tests, frontend/Worker TypeScript checks, production build and whitespace checks pass. A two-seat local HTTP match reached victory after 51 actions, then finalized/exported/imported its replay and rejected Undo. Physical phone testing remains unverified.

# Replay export finalization — 2026-10-30

- Exporting a finished online game atomically sets a persistent finalized flag and increases the room revision before releasing either deck. Both seats receive canUndo=false, and the server rejects fresh Undo and legacy requestUndo commands after export. Repeated exports return the same replay without another revision change.
- Current clients use POST for the state-changing export. GET remains compatible with older open clients and applies the same lock. Nonparticipants and unfinished games cannot finalize a room. The replay format and local testing exports remain unchanged.
- UI labels the action Export replay & finalize, explains the Undo cutoff, refreshes the exporting seat immediately, and shows the finalized status. The opponent receives the updated room revision through polling.
- Regression tests cover undoing an unexported winning move, authorization, persistence/reload, both seats, repeat downloads and the export-versus-Undo race. The existing game state, history and replay contents remain intact.
- A complete two-seat HTTP game reached victory after 46 actions. POST export finalized both seats, fresh Undo was rejected, repeated export left the revision unchanged, and the exported replay imported successfully.
- 274 tests across 24 files, frontend/Worker TypeScript checks, production build and whitespace checks pass.

---

# Immediate online Undo — 2026-10-30

- Removed online approval prompts. Undo reverses only the authenticated player’s own uninterrupted action window, including End turn and its automatic draw. The opponent’s first accepted action closes the previous window; undoing that first action does not reopen it.
- Persisted a per-room Undo boundary independent of the checkpoint stack. Existing rooms derive it from their accepted-action audit; old approval prompts are cleared on authenticated access. Old clients’ requestUndo command is accepted as immediate Undo under the same server checks.
- Tests cover repeated own Undo, End turn reversal, rejected moves and polling, the opponent cutoff, undoing the opponent’s first move, stale-revision races, receipt retries/reload, trap responses and legacy room migration. The Undo button stays enabled outside your turn until the server closes the window, without showing the opponent’s action controls.
- Two isolated browser seats verified immediate End turn reversal, the first-opponent-move cutoff and persistence of that cutoff after the opponent undoes their move. The HTTP smoke completed 39 actions to victory and imported its replay with the new Undo rules.
- 271 tests across 24 files, frontend/Worker TypeScript checks, production build and whitespace checks pass.

---

# Reconnection recovery — 2026-10-30

- Kept temporary polling failures separate from action errors. A successful poll clears a connection warning even when the room revision has not changed; rejected action explanations remain available.
- Actual browser check: opened the saved guest seat, stopped the local Worker, observed the connection alert, restarted the Worker, and waited for the alert to disappear without reload or dismissal. The same private hand and enabled End turn control remained available.
- 265 tests, frontend and Worker TypeScript checks, production build and whitespace checks pass.

---

# Online play — 2026-10-29

- Branch codex/online-play adds a separate Cloudflare Worker and SQLite Durable Object per match. Main’s Pages deployment is untouched.
- 265 tests across 24 files, both frontend and Worker TypeScript checks, production build and Worker dry run pass. Added authentication/hidden view, schema validation, actor permissions for all pending phases, idempotency, revision conflicts, undo consent, replay, fixed-view layout and transport recovery coverage.
- Deployed HTTPS smoke played 47 actions to victory; local HTTP smoke played 48 actions to victory using two independently authenticated private views. Confirmed one-use invitation, duplicate request safety, stale revision rejection, agreed undo and validated final replay import. Rate-limit responses pause and retry; requests remain bounded.
- Actual browser seats used independent 127.0.0.1 and localhost storage. Host Alex created an invitation, guest Poli joined and the invitation fragment disappeared. Opposing hands were card backs and opponent cards had no drag bindings. Guest moves appeared on the host without refresh. Undo requested by Poli required Alex’s acceptance; guest reload restored the agreed position.
- Online Kappa attack handed control to the defender’s fixed viewpoint. A full local server process restart preserved the pending trap response. Hamaya destroyed the highest-attack Kappa, cancelled battle and returned to explicit End turn. Phone layout at 390 × 844 had no document overflow and preserved own hand at the bottom.
- Fresh review identified predictable 32-bit online shuffle seeds and credential loss on rate-limited creation/join retries. Online setup now uses cryptographic randomness per shuffle draw; local deterministic seeds still reproduce prior games. Creation/join credentials persist before requests and survive response loss and 429s. A retry control remains visible even when an error banner is dismissed or undo negotiation is pending.
- Deployed Worker: https://yokai-1504-online.vandamm.workers.dev/ . No main merge or Pages replacement. Physical two-phone touch testing, accounts, notifications and credential recovery are not implemented/verified. Browser storage is the seat credential; clearing it loses access.

---

# Nurikabe stat artwork — 2026-10-29

- Replaced the flat grey stat backgrounds on field Nurikabe with an SVG layer that follows the original olive background and head outline. Printed hand artwork remains unchanged; field and drag previews share the corrected CardFace.
- Browser checks at 1440 × 900 and 390 × 844 confirmed the rectangles are gone. Evoking a soul correctly displayed 6 attack and one filled soul. The original raster illustration is unchanged.
- 238 tests across 21 files and the production build pass. Physical phone touch was not tested.

---

# Local testing table and trap requirements — 2026-10-29

- Removed pass/reveal/hide-table screens and actor-change Continue steps. New games default to open hands; an imported closed-hand replay also resumed immediately without a curtain. Existing player projections remain available for future online play.
- Turn and phase head the desktop history rail, separated from round/player subheadings. Card names are highlighted and underlined; the existing large inspector appears on history hover or focus. Phone history remains a drawer. Actions, Undo and End turn sit beneath near-player health; phone Undo has an accessible icon and End turn stays on one line.
- Trap instructions appear beneath the near hand. At 390 × 844 the prompt occupied y730–844 with all four cards visible. Its unwanted arrow markers have no generated content. Hamaya activated, destroyed Yuki-onna by target tap, cancelled the attack and returned to explicit End turn without a pass/review screen. Undo restored both the effect and preceding trap response.
- Shared CardFace renders live attack and soul slots for drag previews. Only the decision player’s cards bind as drag sources; opponents remain legal targets. Keyboard pickup of Sake highlighted the full own field (1104px wide at 1440), including occupied destinations. One soul allocated to Tengu appeared in place and raised its attack to 5; a subsequent evoke raised it to 6.
- Trap availability uses canActivate with the prospective defender’s decision state. Full-field Boseki, no-donor Ougi and fully immune highest-attack Hamaya skip responses without exposing or spending the trap. Legal traps, including zero-target up-to effects, still pause. Old replay pauses and export/import round trips have regression coverage.
- Six-card layouts checked at 375 × 667, 390 × 844, 430 × 932, 1024 × 768, 1280 × 650 and 1440 × 900: zero document horizontal overflow, all six cards inside the battlefield and 44px-high Undo/End turn controls visible.
- 235 tests across 20 files pass; TypeScript, production build and whitespace checks pass. The action/effect audit covers 96 matches and the deterministic simulation covers 24 full games. Fresh code review found stale README handoff wording, now corrected.
- Physical iPhone/Android touch behavior remains unverified. Pointer drag preview uses the shared card renderer and has regression coverage; no new physical-device test was performed.

---

# Table cleanup and Hamaya replay — 2026-10-29

- Reproduced the supplied turn-3 replay in an independent session: Hamaya was legally pending a highest-attack target, but tapping marked Yuki-onna only inspected it. Tapping the target now resolves the spell, destroys Yuki-onna, cancels the attack and enables End turn. Explicit target buttons provide the same continuation. A sanitized regression test covers that position without publishing the user replay.
- Removed the bottom decision/outcome bars and visual hand counts/separators/field frames. Main actions and End turn are at the top; pending choices are above the table; desktop history occupies the sidebar, with a side drawer on phones.
- Shift-hover inspection showed a large tooltip while held and removed it on release. Desktop graveyard clicks remain in the graveyard; Shift inspection portals into its dialog. The desktop sidebar has no inspector.
- Spells cast by dragging onto the same field used for yokai, including occupied cards. During a real drag the source hand card had opacity 0. Yokai appeared on the board with no playback layer; evocation updated attack and souls immediately with `soul-arrive` animation, also without playback.
- Instant adoption exposed a leftover synthetic-click flag that swallowed the next allocation click. Suppression now matches only the dragged source. Its regression test and a repeated phone Sake drag → first Tengu allocation → Resolve confirm one soul is placed.
- Six occupied cards fit, with zero document overflow, at 390 × 844, 430 × 932, 1024 × 768, 1280 × 650, 1440 × 900 and 1488 × 1005. Pending Sake kept all six cards and Resolve visible at 390 × 844. The phone history drawer occupied the right edge and full viewport height.
- 224 tests across 19 files, including target-tap and drag equivalence throughout 96 complete-match audits, pass. TypeScript, production build and whitespace checks pass.
- Physical iPhone/Android touch behavior remains unverified.

---

# Verification update — 2026-10-29

- Desktop hands scale to about 95 CSS px at 1488 × 1005 (previously 63 px); health, text, controls and piles are larger. The 2/1/0 main-action budget is beside the current decision, and hidden during defender effects.
- Details opens a modal on desktop as well as phones.
- Actual browser pointer drags: Sake to Play, Ougi to Trap, Nurikabe to Karakasa-kozo, Jufu trap to Play, and Kappa from hand to field. Sake staged two soul allocations and resolved by dragging to Resolve. Jufu targeted two yokai with keyboard pick/drop, destroyed the attacker and cancelled the attack.
- Explicit End turn was required after both battle and cancellation. Tengu damage and the next draw were animated and listed after End turn. Private player-changing outcomes displayed card backs and zero hand-card inspection nodes before Continue and Reveal.
- Exported a pending Jufu trap response as JSON; imported it into a separate query-keyed session with the same fields, souls, player, and pending effect. Undo in the imported session restored the trap decision while the original remained pending. Prefix import, invalid files, undo branches and legacy automatic-turn save migration have automated coverage.
- Final populated-table checks: 390 × 844, 430 × 932, 1024 × 768, 1280 × 650, 1280 × 741, 1440 × 900, 1488 × 1005, 1920 × 1080. All six cards visible and zero document horizontal overflow. Small/landscape screens retain independent battlefield scrolling.
- Code review identified a second-pointer release/cancel bug. The corrected gesture lifecycle ignores all secondary-pointer events; automated tests cover the complete primary/secondary gesture sequence.
- 220 tests across 18 files pass, including 96 complete-match action/effect choice audits and 24 deterministic game simulations. Build and diff whitespace check pass.
- Not physically tested on iPhone/Android. Browser pointer input and phone-size layout checks do not establish physical-device behavior.

---

# Gameplay edge-case audit — 2026-10-22

**197 tests / 12 files pass; TypeScript and production build pass.** Played two complete games through browser controls on an isolated origin, preserving the existing match.

- Private combat match: exact lethal on turn 11; undo/reload, then overkill replay.
- Draw-boundary match: last-card/no-damage, first missed draw, mandatory-draw victory on turn 51; undo, then Kozuchi victory for the other player on turn 50 with its second draw skipped.
- Verified trap cancellation/redirection, controller/owner differences, Yuki tie survival, ordered Ougi edits, Sake limits and double-click safety.
- Fixed duplicate Details picker labels when one controller has both copies of a yokai; labels now include field slot and live stats.
- Added 23 win-boundary tests, 112 additional simulated complete games in two differential/persistence tests, and five inspection-label regressions. No confirmed reachable win-condition defect found.

See [full playtest report and captures](playtests/2026-10-22/README.md) for exact cases, evidence and rulebook timing/stalemate limits. Physical phone testing remains unverified.

---

# Clean table verification — 2026-10-22

## Automated and source checks

- `npm test`: **167 tests passed across nine files**. `npm run build`: TypeScript and Vite passed.
- Added 19 interaction tests, three rendered-table regressions and 13 UI/session integration tests; retired seven obsolete phone-sheet tests.
- Interaction/session checks cover every pending effect, ordered Ougi choices, legal soul allocation, protection, visible and hidden trap targeting, rival-owned resurrection, rejected persistence/retry, undo/reload and three complete matches driven by projected UI choices. Existing engine simulations still cover 24 seeded matches and deterministic replay.
- A fresh independent source review found a visible-trap token mismatch and missing phone safe-area insets. Both were fixed. Final review found no further material issues.
- Engine, projected views, asynchronous session protocol and save schema remain unchanged. Removed the former PhoneSheet/ActionPanel paths and both legacy stylesheet imports; one coherent `table.css` now serves all widths.

## Actual browser checks

All actions used the local app's visible controls; no game-state or local-storage injection.

- Loaded the saved match from the previous UI. Summoned, evoked, set a trap after both main actions, released for free, cast a set spell, and explicitly resolved zero-target Jufu.
- Tested Karakasa destroying a visible own trap and a hidden opposing trap, using the proper projected ID/public seat token. Undid release/resolution and restored the previous souls/trap.
- Declared an attack after inspecting the defender through the read-only Details picker. The inspection did not submit the attack. The defender became the lower seat after reveal.
- Activated Ougi as a defender, selected its donor, opened Details and Public history, and resized phone → desktop rail → phone. Target order persisted. Selecting the recipient and Confirm resolved the effect and battle.
- Cast Sake; edited allocations; inspected another yokai; resized; hid the table manually and refreshed. Zero private card controls, inspector controls or allocation steppers remained under the curtain. The pending effect resumed only after explicit reveal; its unsubmitted allocation reset. Placed three souls, undid, and verified the draft reset before choosing again.
- Activated Boseki as a defender using its owner-labelled inline graveyard tray. Also cast Boseki to revive the rival's Nurikabe into the current controller's field.
- Explicitly declined a trap; checked passive/possession outcomes and automatic next turns.
- Reached an unavailable Evoke action through Tab and pressed Return. It announced “Both main actions are spent”, submitted no action and produced no canonical error. A later free Release remained usable.
- Finished the private phone-layout match when ending turn 26. Player 1 won after health reached zero. Undo restored turn 26; refresh retained that position and raised the private curtain with zero private controls.
- Started a separate named testing match, drew both hands to fifteen cards, horizontally scrolled to and selected the last card, and independently expanded the opposing hand. Long names and hand strips stayed within the document.
- Verified Kappa at 6 attack with two souls, one/two/three capacity overlays, white base and gold modified values, empty/full slots, real graveyard faces, original deck backs, empty crossed traps, and Supply at eleven and zero. At zero, exactly eleven soul icons were filled on the field.

- Final fresh-match reload produced no browser warnings or errors. Left a fresh open-hands testing match at localhost, reset temporary viewport overrides, and verified the same app at `http://192.168.1.98:5173/` for same-Wi-Fi phone access.

## Responsive measurements

| Viewport | Document horizontal overflow | Both occupied fields visible with selected actions | Details |
| --- | --- | --- | --- |
| 320 × 568 | None | Battlefield scrolls; hand/actions anchored | Drawer |
| 390 × 844 | None | Yes | Drawer |
| 430 × 932 | None | Yes | Drawer |
| 844 × 390 | None | Battlefield scrolls; physical top/bottom order retained | Drawer |
| 1024 × 768 | None | Yes | Drawer |
| 1280 × 800 | None | Yes | 300px rail |
| 1366 × 768 | None | Yes | 300px rail |
| 1440 × 900 | None | Yes | 300px rail |
| 1920 × 1080 | None | Yes; 1600px total composition | 340px rail |
| 1440 × 600 | None | Battlefield scrolls; hand/actions anchored | Drawer |

The three field columns aligned across the horizontal divider at every size. All measured match buttons were at least 44 × 44 CSS pixels. Field art measured 106px at 390px, 142px at 1440 × 900 and 184px at 1920 × 1080. A final pass with long names, twelve-card hands and selected actions still showed all six field cards at 390/430/1440/1920. Expanded fifteen-card hands were checked at 320/390/430/844/1024/1440 without document overflow. Desktop card art in the inspector was reduced so English rules remain visible; its history scrolls independently.

Captures in `docs/design/clean-table/` (final captures use full-viewport screenshot API; cropped native captures were discarded):

- Existing pre-redesign phone baselines: `current-table.jpg`, `current-actions.jpg`
- `production-after-desktop.png`
- `production-live-values-phone.png`, `production-live-values-desktop.png`
- `production-sake-phone.png`, `production-zero-supply.png`, `production-complete-match.png`

These are browser viewport tests, not physical iOS Safari or Android Chrome tests. Actual touch/browser chrome/safe-area behavior remains unverified on hardware. The IAB offers viewport overrides but no native text-magnification control; attempted zoom shortcuts did not change zoom, so 200% text magnification is not claimed. Safe-area insets, user zoom permission, keyboard focus and reduced-motion styling are present.

---

# Historical verification — 2026-10-21

## Automated checks

- `npm test`: 139 tests passed across seven files.
- `npm run build`: TypeScript checking passed; Vite production build succeeded.
- The automated suite includes 24 deterministic full-match simulations with card/soul conservation, input immutability, private-view checks, and exact command replay.
- Session tests cover persistence failures, malformed saves, pending trap/effect reloads, finished-game undo, duplicate/stale commands, retries after undo, branching, and open-hands preferences.
- Regression checks cover a manually hidden table remaining hidden after same-player undo, and rejection of impossible or unfinishable saved effect choices.

## Browser checks

Tested the actual local app at `http://127.0.0.1:5173/` through its visible controls:

1. Named two players, chose a starter, enabled open hands, and started. Both decks were prepared; hands contained four cards plus the starting player's mandatory draw.
2. Summoned Chochin-kozo, evoked a soul, and set Sake without spending a third main action.
3. On the opponent's turn, summoned/evoked Nekomata, released its soul, and exchanged control with the soul-equipped Chochin-kozo.
4. Declared battle against Nekomata; the defender activated Sake. Reloaded while its allocation decision was pending, then completed the effect and battle. Verified damage, Chochin's delayed destruction, original-owner graveyards, and return of all souls.
5. Undid the battle, switched to private play, and undid again while the curtain was raised. The curtain remained visible and zero card-inspection buttons were rendered. Revealed explicitly and replayed the battle using a different allocation.
6. Used Boseki to revive the other player's yokai, cast Kozuchi to draw twice, and made a direct attack. Verified the two-action budget and automatic next turn.
7. Finished the match through empty-deck damage. A winner appeared at turn 37. Undo restored the preceding position at turn 36, and that position survived reload.
8. Opened the rules/card reference and verified all fifteen card entries.
9. At a temporary 390 × 844 viewport, verified a fourteen-card hand caused no document-level horizontal overflow. Checked full-width action controls and readable card inspection after selecting a card. Restored the default viewport afterward.
10. Started a fresh match with default player names and open-hands testing enabled for the local preview.

The initial release has no online backend. The documented provisional rules remain implementation interpretations where primary sources are underspecified.

## Phone-first follow-up

- Verified the actual app at 320 × 568, 390 × 844, 430 × 932 and 844 × 390, with all six yokai slots occupied. Document dimensions stayed within each viewport; the battlefield scrolls independently and the decision hand/dock remain anchored. All visible match buttons measured at least 44 × 44 CSS pixels.
- Fixed the short-landscape soul-pool overlap, then confirmed it sits below both public player areas. Landscape uses two public columns and permits battlefield scrolling.
- Tested the dock card picker, including selecting the final card in a fifteen-card hand. The selected action sheet resets to the top; actions remain reachable without horizontal document scrolling.
- Through phone controls: summoned and evoked, set Sake, declared an attack, closed/reopened its draft, responded as the defender, allocated souls, and closed/reopened an incomplete allocation without changing it.
- Reloaded during Sake resolution: the committed pending decision resumed automatically; the unsubmitted allocation restarted at zero. Switched to private mode, confirmed zero private inspection buttons or sheets existed behind the curtain, undid while hidden, then explicitly revealed and resolved the response.
- Cast Ougi, selected its source, closed/reopened the sheet, and confirmed source order remained before choosing the recipient. Used Boseki to revive from a graveyard.
- Completed that phone match at turn 28. The result sheet opened automatically; undo restored turn 27 and survived reload.
- Started a separate game at `http://10.1.10.44:5173/`, verifying match/command IDs work over LAN HTTP. Drew up to fifteen cards by ending turns, without document-level overflow.
- Independent source review found no additional actionable privacy/draft lifecycle issue after the picker and scroll reset fixes.
- These are browser viewport checks, not physical iOS Safari or Android Chrome device tests. Safe-area CSS is present; physical browser chrome, touch scrolling, and home-indicator behavior remain unverified.
