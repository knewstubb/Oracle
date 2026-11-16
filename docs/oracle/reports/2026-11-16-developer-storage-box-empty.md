# Report: storage-box-empty
Role: developer
Status: DONE
Task as received: Storage tile shows 361 cards after importing ~1400 into Bulk Box; clicking shows "No cards in this location", title stuck on "Loading...". Restore/write missing storage detail routes, fix capped counting, investigate possible duplicate import read-only.

## Summary for the owner
Clicking a storage box now lists its cards, and the tile counts are exact instead of stopping around 1000. The Bulk Box import ran once, so there's no sign of a double import; the extra cards come from cards imported in multiples. Nothing was deleted.

## Changed files
- src/app/api/storage/locations/[locationId]/route.ts — new; the route never existed in git history (the page was added with only the overview route), so written fresh
- src/app/api/storage/unsorted/route.ts — new, same reason
- src/lib/storage/copies.ts — shared paged fetch (1000-row pages) and exact per-location count
- src/app/api/storage/overview/route.ts — per-location exact counts; unsorted counted via paged fetch

## New decisions made (need owner confirmation)
- Unsorted = no location AND not in a deck (kept from existing overview logic). Note 1780 copies have no location; those in decks aren't Unsorted.

## Assumptions
- Set name comes from ref_printings; isFoil true for foil or etched.

## Challenges to locked decisions
- none

## Open questions
- Is 2131 copies in Bulk Box the expected total? (see below)

## Findings: Bulk Box import (SELECT only)
- All 2131 Bulk Box copies share one identical creation timestamp and a contiguous id range (152772–154902): a single import run, not several. [Confirmed: DB]
- 1744 distinct card+printing+finish combos; 1461 appear once, 208 twice, 55 three times, 13 four, 5 five, 2 six. 1636 distinct cards. So ~1744 lines expanded by quantity into 2131 copies; "~1400" is probably the single-quantity count.
- Double-submit risk: the Import button in the import dialog is not disabled while an import runs (only when preview is empty), so a double click could send two requests. Evidence of this actually happening: none (one timestamp). Suggest disabling the button while importing (UI task, not done).
- Proposed cleanup: none needed unless the owner's source file totals fewer than 2131 copies. If so, compare file quantities per card to the groups above and remove only the excess, with owner approval.

## Verification
- npm run typecheck (tsc --noEmit) — clean
- npx vitest run — 273 files passed, 3205 tests passed
- Endpoints not called live (require login session); logic covered by typecheck only.
