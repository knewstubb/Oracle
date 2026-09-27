# Report: Import reconciliation showed "All imported cards are reconciled" despite expected conflicts

Role: Orchestrator
Status: PARTIAL
Task as received: "I imported my collection and it jumped past the reconciliation page even though there should have been over 100 conflicts. Why was that?"

## Changed files

- `docs/oracle/status.md` — added open item O-005 tracking the reconciliation predicate bug.

## New decisions made (need owner confirmation)

- Whether the T-22/T-24 slot-level "resolved" predicate should be changed so that a default `planned` instance is treated as unresolved. The current approved contract treats `planned` + zero available supply as resolved, which hides the conflicts the owner expects to see.

## Assumptions

- The owner reached the new T-22 reconciliation screen (the one with Decks / Owned / Unowned tabs and the Allocate Cards button).
- The expected conflicts include both unowned cards and owned cards whose single copy is already held by another deck or printing.

## Challenges to locked decisions

- The approved contract (`docs/oracle/contracts/import-reconciliation-redesign.md` §5) defines a `planned` slot as resolved when no owned printing has room. That rule is now producing behavior that contradicts the UX spec (`docs/oracle/specs/import-reconciliation-redesign.md` §9) and the owner’s observed reality: genuine conflicts are hidden. This is a contract-level bug, not a code-level bug.

## Open questions

- Does the owner want every default `planned` instance to appear as unresolved (noisier, but matches the spec and the screenshot expectation), or should only certain categories appear?
- Should the screen support reassigning a copy from another deck, or only Proxy / Planned / alternate-printing choices?

## Verification

- Deck lifecycle default is **Brew**, and an all-Brew import skips the reconciliation summary [Confirmed: `src/app/onboarding/page.tsx` lines 222–226, 458–465]. The owner confirmed a mixture of Brew and Active decks, so at least one Active deck reached the screen.
- Active decks create claims with `resolution = 'planned'` for every non-basic slot [Confirmed: `src/lib/import-sleeve-claims.ts` lines 64–79].
- The deployed migration marks a `planned` instance as resolved when no owned printing has room [Confirmed: `supabase/migrations/20260926140000_import_reconciliation_redesign.sql` lines 292–298].
- `GET /api/onboarding/reconciliation` defaults to `includeResolved=false`, and `ReconciliationSummary` shows the empty state when no unresolved rows are returned [Confirmed: `src/components/reconciliation/ReconciliationSummary.tsx` lines 102–122, 304–306].
- The prefetched import path does **not** assign copies during import; it leaves every slot as `copy_id IS NULL` [Confirmed: `src/lib/warm-start-resolve.ts` lines 677–737]. Therefore the available-supply math in the RPC is not being masked by eager assignment.

## What happened

After the T-22/T-24 migration was deployed, the reconciliation screen switched from "every unassigned slot is a conflict" to "only slots where the user can still take a real-copy action are conflicts". Because every newly imported slot defaults to `planned`, the new rule classifies a slot as resolved whenever there is no free owned copy of the requested printing. That happens for:

- **Unowned cards** — you own zero copies, so no printing has room.
- **Owned cards already held elsewhere** — you own one copy, but it is already in another deck, so the printing has no room.
- **Printing-mismatch cards** — you own the card, but not in the printing the deck asked for, and no alternate printing is free.

In all three cases the user still has meaningful choices (Proxy, reallocate, alternate printing), but the current predicate hides the row. The result is the "All imported cards are reconciled" screen even when dozens or hundreds of genuine conflicts exist.

## Recommended next step

Get owner confirmation to change the slot-level resolved predicate so that a default `planned` instance is unresolved. Once confirmed, hand off to the Backend/Architect agent to update the RPC, route tests, and the Frontend empty-state copy if needed. Do not start another import in production until this is fixed, because the missing rows mean decisions are being made implicitly.

## Status update

- Added open item **O-005** to `docs/oracle/status.md`: fix T-22/T-24 reconciliation predicate so default Planned conflicts appear.
