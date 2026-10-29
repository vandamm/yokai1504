# Gameplay edge-case audit — 2026-10-22

Played two complete matches through the real browser controls at a 390 × 844 viewport. The combat match used private hotseat throughout; the draw-boundary match used open hands before checking private result undo. Testing used `http://localhost:5173/`, whose save is separate from the existing `http://127.0.0.1:5173/` match. No game-state or storage injection was used.

## Outcome and fix

No confirmed defect was found in reachable win conditions. One UI ambiguity was reproduced and fixed: after Boseki and Nekomata gave Dawn both copies of Kappa, the Details picker showed two identical `Dawn · Kappa · field` options, although the cards had 6 and 2 ATK. Field labels now include their current controller, left-to-right slot, current ATK and soul count. Even copies with identical stats remain distinguishable by slot. Inspection remains read-only.

Fix: `src/ui/inspection.ts` and its five regression tests; App uses the helper for inspection options. The rules engine, session protocol and save format did not change.

## Combat match: Dawn vs Dusk

Dawn won on turn 11 with 8 health remaining. The opponent still had four cards in its deck, so the winning attack was unrelated to deck exhaustion.

| Check | Actual result |
| --- | --- |
| Boseki with empty graveyards | Explanation shown, no action spent |
| Attack on the first turn | Rejected by UI with explanation, no command or damage |
| Set trap after both main actions | Accepted for free |
| Equal 4-ATK Kappas | Both destroyed, no battle damage |
| Undo declined trap, choose another response | Restored the pending response, hands, health and souls |
| Hamaya destroys attacker | Attack cancelled; no extra battle damage or second attack |
| Direct attack into Boseki | Redirected to the revived Kappa; 6−2 dealt four damage |
| Nekomata control exchanges | Souls stayed with the card; new controller could act with it |
| Borrowed weaker Kappa lost battle | Current controller took one damage; card returned to original owner's graveyard |
| Undo/replay with stronger copy | Restored both Kappas and replayed correct three-damage battle |
| Kozuchi with cards available | Drew exactly two cards for one action |
| Nurikabe on summon turn | Attack unavailable with explicit reason |
| Ougi donor deselection | Cleared both ordered choices, returning to step one |
| Ougi trap reversed battle | Kappa 6/Nurikabe 5 became Kappa 4/Nurikabe 6; current attacker took two damage |
| Details during targeting | Could inspect the other Kappa without altering choices or submitting |
| Yuki-onna tied against possessed Rokurokubi | Yuki returned a soul and survived; Roku died, no damage and no Roku bonus draw |
| Zero-target Jufu, undo, select a target | Both resolutions worked; only the original cast spent an action |
| Sake capacity and total limits | Denied an extra soul at Tengu's cap and a fourth total soul; no command submitted |
| Sake minus/plus, Details and resize | Allocations preserved through editing, inspection and phone/desktop layout changes |
| Double-click Place | Exactly three souls placed once; one main action remained. The second click selected a hand card after the dock moved, without submitting a further game command |
| Exact lethal: five damage into five health | Dusk reached zero; Dawn won immediately at turn 11, still at eight health |
| Undo result and refresh | Restored pre-win health and raised the private curtain; no private controls mounted |
| Overkill: seven damage into five health | Health clamped to zero; same winner and turn; no next-turn draw or Tengu damage |

Evidence: [public history](combat-history.txt), [recorded UI observations](ui-edge-trace.json), [ordered Ougi](ougi-ordered-targets.png), [Sake allocations](sake-allocation.png), [exact lethal](combat-exact-lethal.png), [overkill](combat-overkill.png).

## Empty-deck boundary match: Draw A vs Draw B

Intentionally ended turns without playing cards to isolate draw damage from combat and card effects.

1. At turn 22, both decks were empty and both players still had 15 health. Drawing the last actual card did not damage anyone or end the game.
2. At turn 23, Draw A's first failed draw reduced Draw B to 14 health; Draw A retained 15.
3. At turn 50, both players had one health. Ending the turn caused Draw A's turn-51 failed draw to defeat Draw B. Draw A won with one health.
4. Undid that terminal turn, then cast Kozuchi as Draw B at turn 50. Its first failed draw defeated Draw A instead. Draw B won with one health. The final history was exactly:

   ```text
   Draw B casts Kozuchi.
   Draw A takes 1 damage (Draw B could not draw).
   Draw B wins.
   ```

   Its second requested draw and the next turn did not run.
5. Refreshed the finished result successfully. Switched to private play, undid while hidden, and verified zero private card/inspector/allocation controls. Revealed and replayed the winning Kozuchi successfully.

Evidence: [public history](draw-history.txt), [boundary observations](draw-edge-trace.json), [mandatory draw victory](empty-deck-win.png), [Kozuchi victory](kozuchi-lethal.png), [private replay](kozuchi-lethal-private.png).

## Automated verification

Fresh commands: `npm test` and `npm run build`.

- **197 tests passed across 12 files.** TypeScript and Vite build passed.
- Added 23 focused win-boundary tests covering exact lethal, overkill, one-HP survival, ties, controller/owner differences, last-card draws, missed draws, Kozuchi with zero/one/two cards, lethal defensive traps, extra battle draws, Yuki, Tengu and rejection of every command after victory.
- Added 96 deterministic full-match differential runs: every UI action's availability and all reachable effect choices agree with canonical engine acceptance, including checking that legal choices are not omitted.
- Added 16 private full-match persistence runs: reload pending decisions, undo/reload/retry receipts, replay effect and winning actions, then reload finished results.
- Added five label regressions for duplicated cards, identical live stats, exchanged control, slot order, projection privacy and non-mutation.
- Final browser reload had no console warnings or errors.

## Rulebook comparison and limits

Read both rendered pages of the bundled [English rulebook](../../references/Yokai1504_Rulebook_ENG.pdf), with the verified bilingual card catalog for individual effects. Page two confirms ATK-difference damage, ties without damage, full direct-attack damage, one damage to the opponent per missed draw and immediate game end at zero health.

The printed stalemate clause is not an alternate result merely because both decks are empty or players decline attacks. Mandatory failed draws continue dealing damage with the current fifteen-card catalog; it has no draw/damage-prevention effect that can make the stated stalemate condition reachable. No arbitrary turn limit or repeated-position draw rule was added.

Timing not fully specified by the rulebook remains an app interpretation, especially Tengu before the mandatory draw, attacker-first ordering for simultaneous Rokurokubi draws, and Yuki's survival retaining the original ATK-difference damage. Tests confirm the documented interpretation; they do not establish an official publisher clarification.

These were real UI actions in a browser phone viewport, not physical iPhone/Android hardware testing.
