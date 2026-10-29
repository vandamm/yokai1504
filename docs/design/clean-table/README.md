# Clean table production UI

Implemented in the playable app on 2026-10-22. Open `/` on the local server; the pages in this folder remain visual prototypes. Production uses the actual rules engine, saves, undo, private hotseat and direct table controls.

Final captures: [phone](production-live-values-phone.png), [desktop](production-live-values-desktop.png), [Sake allocation](production-sake-phone.png), [zero Supply](production-zero-supply.png), [completed match](production-complete-match.png). [Verification](../../verification.md) records the 167 passing tests, complete UI match and ten-size responsive matrix, with physical-device and magnification limitations.

## Archived approved prototype review

The following notes describe the visual proposal before production integration. At that stage, the playable app had not changed. These sample-position prototypes replace framed player panels and default action modals with a physical table and direct selection/targeting.

The 2026-10-22 revision uses a warm gray-green table (`#e2e7e1`), off-white surfaces (`#f1f4ee`) and teal controls (`#286873`). Played cards have no repeated name or external stats: current attack covers the printed upper-left value, white at base/gold when modified; original soul icons fill/fade the exact printed upper-right capacity slots. Accessible card names retain the name, base/current attack and current/capacity souls.

Supply now occupies the toolbar as label, numeric total and one original icon. The horizontal center divider stays clear. Phone deck/graveyard/trap controls move behind the facing fields; desktop piles remain offside. Decks use the original [card back](../../../public/cards/back.svg), graveyards show an actual top card/count, and an empty trap is a crossed empty outline. Prominent health sits beside each hand's owner name. Borderless selected cards lift slightly with left/right chevrons; eligible targets use side chevrons. Larger field cards and shorter hand areas reduce wasted vertical space. Production implementation and acceptance remain pending.

Latest captures: [phone table](tabletop-refined-phone.jpg), [phone targeting](tabletop-refined-targeting.jpg), [desktop table](tabletop-refined-desktop.jpg). The second deck uses the original [ochre back](../../../public/cards/back-ochre.svg); both backs preserve the rulebook's original resources and transforms. Sample card locations and deck counts now account for fifteen unique cards per player.

Latest verification (2026-10-22): no document or battlefield horizontal overflow at 320 × 568, 390 × 844, 430 × 932, 844 × 390, 1024 × 768, 1280 × 800, 1366 × 768, 1440 × 900, 1920 × 1080 or 1440 × 600. All six faces fit at the primary portrait sizes and ordinary desktop sizes; short phone/landscape and 1440 × 600 use battlefield scrolling with hands/actions anchored. At 390 × 844, battlefield client/scroll heights both measure 468px, health is 30px and every visible button is at least 44 × 44px. At 1440 × 900, the battlefield measures 484/484px and field cards are 142px wide; at 1920 × 1080 cards grow to 184px. Three columns stay aligned across the divider.

Checked borderless selection/side markers, hand selection, Details close/reopen, attack targeting, defender seating, trap activation, three-soul allocation across a two-slot Yuki-onna and another yokai, ignoring hand taps during allocation, and empty-trap taps leaving inspection closed. The private handoff removes all card images and card buttons. Independent source review found two prototype interaction issues; both were fixed and rechecked. Existing tests: 139 passed across 7 files; TypeScript/Vite build and shared-script syntax check passed. These are prototype/browser checks; production integration and physical iOS/Android verification remain pending.

- [Design and visual findings](../../superpowers/specs/2026-10-21-clean-table-design.md)
- [Implementation plan](../../superpowers/plans/2026-10-21-clean-table.md)
- [Interactive proposal](preview.html) — run the existing Vite server and open `/docs/design/clean-table/preview.html`
- [Desktop proposal](desktop.html) — facing top/bottom fields, hands at the outer edges, center divider and persistent card/history rail
- [Comparison](comparison.html)

The current table/action captures come from the actual app at 390 × 844. Proposed images use a labelled sample position; they are not screenshots of an implemented rules integration. Captures and measurements below record earlier prototype revisions, before the on-card values and toolbar-Supply revision above.

## References and earlier prototype evidence

Rally’s public home page and toolbar documentation were inspected; its live game interface was not. On 2026-10-22 the user corrected the second reference to [boardtogether.games](https://boardtogether.games/); its public home/library and About pages were visually inspected and [captured](board-together-reference.jpg).

After the user signed in, an existing Fresh Fish game was inspected without starting a new table or making a move: desktop at 1440 × 900, desktop history, phone board at 390 × 844, and phone history (signed-in reference captures are kept locally and excluded from this repository). The waiting-state board, compact actor status and separate Players/History tabs reinforce the proposed hierarchy. Its phone interface scrolls sideways between supporting information and the board; Yokai retains an explicit Details/history drawer and simultaneous top/bottom card fields. Active-turn targets and undo were not exercised in the reference game. Viewport overrides were reset after review.

Board Together's official [game UI guidance](https://github.com/justinkwaugh/tabletop/blob/main/docs/game-ui-layout.md) also supports direct board targets, one current-decision area, one Undo and compact phone controls with tap-accessible details. These source-documented patterns reinforce the proposal without changing Yokai's physical top/bottom table or adding sideways phone navigation.

Earlier prototype checks: 320 × 568, 390 × 844, 430 × 932. No document overflow; all phone buttons at least 44 × 44. Both occupied fields fit at the two primary portrait sizes; the short 320px phone scrolled only its battlefield. Select → Attack → directly highlighted targets worked without opening a modal. These checks validate that revision's composition and demonstration, not production gameplay, physical phones or the latest revision.

The design received a separate builder review. A later independent reference review clarified target inspection before attack commitment, distinct source/eligible/chosen treatments and accessible unavailable-action explanations. These are specified in the design and plan; the visual sample does not implement these added interaction details. Production interaction, privacy, complete-match and broader viewport acceptance work remain unchecked.

The earlier physical-table revision established the shared spatial order: opponent hand, opponent yokai, horizontal divider, own yokai, own hand, with aligned field columns and an external desktop details/history rail. Its side piles and resource-bearing divider are superseded by the latest phone rear rows and toolbar Supply.

That revision was checked at 320 × 568, 390 × 844, 430 × 932, 1280 × 800, 1440 × 900 and 1920 × 1080. No document overflow; hands/actions stayed anchored. Both fields/live values fit at the primary portrait sizes and 1440 × 900; small phones and short laptops used battlefield-only scrolling. At 1440 × 900 tabletop client/scroll heights were both 461px. See the older [desktop capture](desktop-preview.jpg) and [phone targeting capture](proposed-targeting.jpg).

The subsequent soul-art revision used repeated original icons for cards, allocations and the supply. Checks at 320 × 568, 390 × 844, 430 × 932 and 1440 × 900 found no document horizontal overflow. Both fields' external live stats fit at 390 × 844 and 1440 × 900; the 390px battlefield client/scroll heights were 400/401px (rounding). Zero/one/three card icons, two/three allocation icons, the eleven-icon supply and numeric accessible labels were checked. Its [phone](soul-icons-phone.jpg) and [desktop](soul-icons-desktop.jpg) captures predate the latest on-card slots and numeric toolbar Supply. None of these earlier checks establishes production keyboard, privacy, full-match or physical-phone acceptance.
