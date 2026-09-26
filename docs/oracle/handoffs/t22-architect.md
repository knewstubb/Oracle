# Handoff: T-22 Architect — Import reconciliation contract & data model

## Task

Define the API contract, data model, and persistence behaviour needed to implement the redesigned import reconciliation flow described in `docs/oracle/specs/import-reconciliation-redesign.md`.

## Context

The UX/UI agent has finished the spec and interactive mockup for T-22. The owner has approved all UX decisions. The next step is the backend/contract work so a Frontend agent can build against a stable API.

The redesign moves import reconciliation from an action model (`sleeve` / `release` / `proxy`) to a state model (`Planned` / `Sleeved` / `Proxy`) with three tabs: Decks, Owned, Unowned. Choices must persist across tab switches and page reloads.

## Relevant files

- `docs/oracle/specs/import-reconciliation-redesign.md` — final UX spec with all owner decisions.
- `docs/oracle/mockups/import-reconciliation-redesign.html` — interactive mockup showing the three tabs, card containers, state selectors, alternate-printing selector, and wishlist.
- `docs/oracle/reports/2026-09-26-uiux-t22.md` — UX completion report listing resolved and pending questions.
- `src/app/api/onboarding/conflicts/route.ts` — existing `GET /api/onboarding/conflicts` endpoint.
- `src/app/api/onboarding/conflicts/resolve/route.ts` — existing `POST /api/onboarding/conflicts/resolve` endpoint.
- `src/lib/import-allocation-state.ts` — current state derivation helpers.
- `src/lib/import-sleeve-claims.ts` — claim-resolution types.
- `docs/oracle/contracts/placement-source.md` — placement source requirements.
- `docs/oracle/decisions.md` — locked decisions (read-only).

## Current state

- UX spec is finalized.
- All owner-facing open questions are resolved.
- Pending technical questions:
  - Exact API field for per-instance alternate-printing selection.
  - How persistence is stored so users can leave and return.
  - How counts are computed per conflict printing across tabs.

## Decisions to build on

- Counts are per **conflict printing**, not per deck-card instance.
- There is **no tie-breaker** for competing owned copies; the UI prevents more `Sleeved` instances than owned copies exist.
- Resolved printings stay visible until the screen is refreshed or reloaded.
- Alternate-printing conflicts **warn only**; they never block finishing.
- Wishlist toggles are local UI state persisted separately; they do not affect deck membership.
- State model per owned instance: `Planned` (default) / `Sleeved` / `Proxy`.
- State model per unowned instance: `Planned` (default) / `Proxy`.
- Only owned instances can select alternate printings.

## Acceptance criteria

- [ ] A contract document is saved to `docs/oracle/contracts/import-reconciliation-redesign.md` covering:
  - Data model changes (if any) to support per-instance state, alternate-printing overrides, and persistence.
  - API endpoint shape for reading reconciliation state per import batch.
  - API endpoint shape for updating a single instance's state.
  - API endpoint shape for selecting an alternate printing per instance.
  - How counts per conflict printing are computed.
  - How resolved printings are filtered on full reload.
- [ ] Migrations (if needed) are drafted in `supabase/migrations/` with the next sequential number.
- [ ] No destructive database operations (drop/truncate/delete-all) are used unless explicitly approved.
- [ ] A brief report is saved to `docs/oracle/reports/YYYY-MM-DD-architect-t22.md` following the project report format.

## Constraints

- Follow locked decisions in `docs/oracle/decisions.md`. Do not relitigate them.
- `scryfall_id` identifies a printing; `oracle_id` identifies the canonical card. Never mix them.
- Proxies are `user_copies` rows with `is_proxy = true` (D-001).
- Import does not run an automatic allocation pass (D-020).
- Basic lands are fungible during import (D-023).
- Import allocation conflicts include a `printing_mismatch` reason when applicable (D-024).
