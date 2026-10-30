# Minimal tabletop UX wireframes

The user narrowed the direction to as little UI as possible, with dragging/clicking like Hearthstone. The command dashboard and activity-first models are retired. These are three **layout alternatives of one shared card-first UX**, not three different interaction models or skins.

They are static wireframes, before any interactive prototype. Only review controls, scrolling and comments work; game controls are drawn spans. Production code, game rules and deployments are untouched.

Run from the repository root:

```sh
npx vite --config docs/design/minimal-table/vite.config.mjs
```

Open http://127.0.0.1:5177/docs/design/minimal-table/.

## Shared interaction contract

- Drag a hand card onto the existing field to play it. A spell can instead go to the trap position. Show destinations only during selection/drag. The original disappears from hand while lifted; dropping a yokai does not start a second placement flight.
- Drag an owned yokai onto an enemy to attack. Selecting it then clicking/tapping the destination is equivalent; a command menu and review step are unnecessary. Enemy health remains a direct-attack target when their field is empty. Dropping away/clicking empty space cancels an uncommitted gesture. Undo reverses the committed action within the established online window.
- A tiny + soul appears beside the eligible selected yokai. Release abilities use the filled soul as their source, followed by a legal effect target. Eligibility and accessible names must come from existing game requirements when implemented.
- Hold inspects, movement begins a drag, a simple tap selects. Shift-hover inspects on desktop; focus/keyboard equivalents must exist. Hand expansion uses its own blank handle, not card hold. A future implementation must distinguish horizontal hand browsing from upward play and test this on phones.
- Required trap response is a small persistent Activate / Keep hidden prompt near the trap/hand area. The hand recedes during this opponent-turn decision so the prompt can avoid the combatants. Ougi selects a donor yokai then a recipient yokai by tapping the existing field cards. The attack stays visibly paused until the effect finishes; no automatic turn ending.
- Inspect card text on demand; history, rules and settings are in the compact menu. Returning goes directly to the live position with a small unread-history cue. Gameplay results belong to their objects (attack, soul slot, health, graveyard), followed by an enduring history entry.
- Health, actual decision player and action budget remain visible. Utility glyphs may be small visually, but future touch areas must be at least 44px and have visible keyboard focus/accessibility labels. The wireframes do not certify accessibility or gesture usability.

## Layout choices

**A Straight hand:** separated cards at the near edge, visible hand, Undo and End turn below. Most discoverable, at the cost of hand space.

**B Fan hand:** overlapping fan with a separate expansion handle, larger field cards, own health above the hand, utilities flanking it. The main risk is browsing/inspection/drag ambiguity; it needs a touch prototype before choosing it.

**C Thumb shelf:** raised straight hand, own health and utilities grouped along the lower edge, menu within thumb reach. The tradeoff is more density near the lower edge.

Phone frames are 360 × 720 and desktop frames 1120 × 660. Seven moments show rest, lifted spell, attack, soul addition, trap response, Ougi targeting and asynchronous return. Notes and gesture descriptions are outside the drawn game UI.

Comments have their own validated local endpoint and git-ignored feedback file. Previous UX wireframes and their feedback are preserved separately. The shared comment code retains same-origin checks, bounds/input validation and atomic writes.

Reference: Blizzard describes placing minions from hand onto the board and changing positions by dragging in its [Battlegrounds introduction](https://hearthstone.blizzard.com/en-us/news/23156373/introducing-hearthstone-battlegrounds). This study adopts object manipulation as the design principle; it does not import Battlegrounds rules or claim to reproduce Hearthstone's complete UI.

Verification: JavaScript syntax/whitespace checks, browser layout measurements for all seven moments on phone and desktop, and trap-prompt/card overlap checks. Own health was checked against field cards and piles; an overlap in the straight-hand layout and crowding in the fan layout were corrected. A QA comment was saved, pinned and removed. Wireframe controls were visually reviewed; actual dragging, animations, touch gestures and screen-reader behavior remain unimplemented.
