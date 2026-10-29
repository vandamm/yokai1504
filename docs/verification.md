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
