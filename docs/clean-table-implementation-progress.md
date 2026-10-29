# Clean table implementation

User approved implementation on 2026-10-22, including autonomous testing.

- [x] Flat table and on-card values (Table.tsx / table.css)
- [x] Shared draft, direct targeting and DecisionBar
- [x] App integration, privacy and secondary screens
- [x] Browser matrix, complete match, final review and documentation

## Rulings

- Work in the existing project: the parent Git repository has no HEAD and this project is untracked, so an isolated worktree cannot carry its sources. Do not commit unrelated files or create an embedded repository.
- Retain engine, projection, session commands and save schema. Only presentation and transient interaction state change.
- App owns submission, busy/errors and privacy; Table and DecisionBar consume projected state. Clear private UI only on accepted snapshots, mode/privacy changes or explicit cancel. Rejected commands retain the draft.
- Auxiliary Details/history/menu and resizing preserve drafts. Hidden tables mount no private card controls or inspector content.
- Viewport QA is browser simulation, not a physical iOS/Android device test.

## Evidence

Existing phone baselines: `docs/design/clean-table/current-table.jpg` and `current-actions.jpg`. Initial native screenshots were cropped and discarded; final captures use the full-viewport Tab screenshot API.
Final verification: 167 tests / nine files pass; TypeScript and Vite production build pass. Independent review has no remaining material findings. Actual browser QA completed one private phone match, the ten-size matrix, all pending effect paths, visible/hidden trap destruction, read-only inspection, ordered/allocation persistence, result undo/refresh, long names/fifteen-card hands and zero Supply. See `docs/verification.md` for measurements and captures.

Implementation adjustments: one App-owned draft resets in accepted snapshot adoption at all widths, replacing the obsolete phone-only reset helper. Main-phase selection clears on a second card tap; attack/effect drafts also offer Cancel/Clear. Whole upper-owner summary toggles hand expansion to save phone height. Native 200% text magnification and physical phone hardware remain unverified; the current IAB does not expose that magnification control.

Final delivery: fresh default-named open-hands match at localhost; LAN address verified at `http://192.168.1.98:5173/`. Browser console clean after fresh reload; viewport overrides reset.
