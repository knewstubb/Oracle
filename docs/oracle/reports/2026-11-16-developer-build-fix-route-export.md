# Report: build-fix-route-export
Role: Developer
Status: DONE
Task as received: Move `parsePositiveUsd` out of src/app/api/collection/refresh-prices/route.ts (Next.js forbids it as a route export); update importers/tests, behaviour unchanged; `next build --webpack` and `vitest --run` must pass; commit on branch build-fix-route-export (from cc04a-connector), no push/merge.

## Summary for the owner
Fixed a small code layout problem that stopped the app building for release. Nothing changes in how the app looks or behaves. The build and all tests now pass.

## Changed files
- src/lib/price-parsing.ts — new home for `parsePositiveUsd`, `buildPriceUpdate` and the price types (moved verbatim)
- src/app/api/collection/refresh-prices/route.ts — now only exports `POST`; imports helpers from the lib
- src/app/api/collection/refresh-prices/route.test.ts — imports helpers from `@/lib/price-parsing`

## New decisions made (need owner confirmation)
- none

## Assumptions
- `buildPriceUpdate` was also an illegal route export, so it moved too.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- `npx next build --webpack` — passed
- `npx vitest --run` — 263 files passed, 6 skipped; 3094 tests passed, 46 skipped
