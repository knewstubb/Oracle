# Handoff: T-22 Frontend — Import reconciliation UI

## Task

Build the redesigned import reconciliation UI from the approved spec and mockup in `docs/oracle/specs/import-reconciliation-redesign.md` and `docs/oracle/mockups/import-reconciliation-redesign.html`.

## Context

The UX/UI agent has finalized the spec and mockup. The owner has approved all UX decisions. A separate Architect agent will define the API contract; your job is to implement the React/Next.js components and page.

The redesign replaces the old action model (`sleeve` / `release` / `proxy`) with a state model (`Planned` / `Sleeved` / `Proxy`) and reorganises the screen into three tabs: Decks, Owned, Unowned.

## Relevant files

- `docs/oracle/specs/import-reconciliation-redesign.md` — final UX spec.
- `docs/oracle/mockups/import-reconciliation-redesign.html` — interactive mockup; open it in a browser to see the intended layout and interactions.
- `docs/oracle/reports/2026-09-26-uiux-t22.md` — UX completion report.
- `src/app/onboarding/page.tsx` — current onboarding flow including the summary/reconciliation screen that this replaces.
- `src/components/StatusChipPopover.tsx` — existing status-chip popover with state actions.
- `src/components/PicklistV2.tsx` — existing picklist patterns.
- `src/components/DeckImportProgressList.tsx` — existing deck progress list.
- `src/components/CardHoverPreview.tsx` — existing hover preview component to reuse.
- `src/app/globals.css` and `src/styles/tokens.css` — design tokens.
- `docs/oracle/decisions.md` — locked decisions (read-only).

## Current state

- UX spec and mockup are finalized.
- All owner-facing open questions are resolved.
- The existing reconciliation screen lives in `src/app/onboarding/page.tsx` under the `SummaryScreen` component.
- The Architect will provide the contract; until then, you may use the existing `GET /api/onboarding/conflicts?batchId=<uuid>` and `POST /api/onboarding/conflicts/resolve` endpoints as a starting point, or wait for the Architect's contract before writing data fetching code.

## Decisions to build on

- Counts are per **conflict printing**, not per deck-card instance.
- There is **no tie-breaker**; the UI prevents more `Sleeved` instances than owned copies exist.
- Resolved printings stay in place until the screen is refreshed or reloaded.
- Alternate-printing conflicts **warn only**; they never block finishing.
- Owned/Unowned tabs use the same card-container layout as the Decks tab.
- Controls (state buttons, printing select, wishlist checkbox) are right-aligned per instance row.
- Deck-name tags are not clickable.
- Wishlist toggles are local UI state.

## Acceptance criteria

- [ ] The onboarding summary screen is replaced (or a new route is created) showing the three tabs: Decks, Owned, Unowned.
- [ ] Decks tab shows only decks with conflicts, expandable, showing conflicted printings only.
- [ ] Owned tab shows one card container per owned conflict printing, with one instance row per deck claim.
- [ ] Unowned tab shows one card container per unowned conflict printing, with wishlist checkboxes.
- [ ] State selectors are button groups: Planned / Sleeved / Proxy for owned; Planned / Proxy for unowned.
- [ ] "Already claimed" is shown when an instance's Sleeving would exceed owned copies.
- [ ] Alternate-printing selector is an inline select per owned instance.
- [ ] Hovering the card thumbnail or printing identifier shows the existing `CardHoverPreview`.
- [ ] Count badges on tabs are per conflict printing.
- [ ] Choices persist across tab switches.
- [ ] Existing empty/loading/skeleton patterns are reused.
- [ ] The UI is keyboard-accessible and follows D-012–D-014 (colour + label, non-mana status hues, quiet default / loud exception).
- [ ] A brief report is saved to `docs/oracle/reports/YYYY-MM-DD-frontend-t22.md` following the project report format.

## Constraints

- Build on locked decisions in `docs/oracle/decisions.md`. Do not relitigate them.
- Use shadcn/ui, Tailwind, and TypeScript following existing component style.
- Reuse existing components where possible (`CardHoverPreview`, `DeckImportProgressList`, patterns from `PicklistV2`).
- Do not commit or push code unless explicitly asked.
- Do not run destructive database operations.
