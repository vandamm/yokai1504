# UX wireframes

Low-fidelity, static proposals requested before building interactive prototypes. These replace the earlier skin comparison as a UX study. They do not import game components, execute rules, animate cards or submit gameplay commands.

Run from the repository root:

```sh
npx vite --config docs/design/ux-wireframes/vite.config.mjs
```

Open http://127.0.0.1:5176/docs/design/ux-wireframes/.

Compare three different interaction models using the same five situations: start of turn, playing Sake, preparing an attack, responding with Ougi, and returning after time away. Phone frames are 360 × 720; desktop frames are 1120 × 660. Review controls switch the drawings, not a simulated game state.

- **A: object first.** The table and hand stay present. Selecting a card exposes contextual actions; choosing a legal destination commits. Traps interrupt beside the table. Inspection is separate from playing. Cancel clears selection; Undo reverses a committed action.
- **B: intention first.** Play / Attack / Soul opens a focused task workspace. The hand appears inside Play. Source, usage, target and review are separate choices; only the completed action is confirmed. Back edits the task. Table inspection remains available without losing progress.
- **C: event first.** Activity is the default mobile view. Unseen changes and unresolved decisions are addressable events. A move is a single editable draft with explicit submission; it can be interrupted by a trap. The live board is a supporting view, distinct from historical events.

The wireframes intentionally share a neutral visual language. Their differences are navigation, information hierarchy, input sequence, commitment point, interruption and recovery. Drawn buttons are static; only review controls, scrolling and comments work. No whole-turn queue or hidden-trap outcome prediction is proposed. End turn stays explicit, and previous own actions remain subject to the existing online Undo window.

Pin a comment on any labeled region. Comments record model, phone/desktop, moment and location in a separate git-ignored `feedback.json`. They use the earlier review middleware's input validation and atomic writes. Existing feedback must be preserved.

Verification: JavaScript syntax and whitespace checks; browser review of all three models across five moments and two screen sizes, including overflow measurements. A desktop C overflow was corrected. A QA comment was saved, pinned and removed. The paper controls do not establish accessibility compliance; interaction tests and real-device testing belong to the later approved prototype.

Interactive prototype drafts under `../ux-review/` were paused when the user requested wireframes first. They are not loaded by this page. Production code and deployments are unchanged.
