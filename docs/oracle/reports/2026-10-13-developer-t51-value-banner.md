# Report: T-51 value banner
Role: Developer
Status: DONE
Task as received: Fix GET /api/collection/value 500 caused by ambiguous user_copies → user_cards relationship (PGRST201). Check src/app/api/collection/route.ts and src/app/api/ai/build-deck/route.ts for the same issue. Add/update a unit test that fails before and passes after. Make CollectionValueBanner show a small plain message instead of vanishing silently if the request fails, with the Refresh Prices button still visible. Run `NODE_DISABLE_COMPILE_CACHE=1 npm run check`. Do not merge.

## Summary for the owner
The Collection value banner and Refresh Prices button should appear again. The cause was a database query that asked for a card name through `user_cards` without saying which of the four possible links to use, so Supabase rejected it with error PGRST201. I named the correct link in the three places that had the same ambiguity. I also changed the banner so that if the value request ever fails again it shows “Could not load collection value.” and keeps the Refresh Prices button visible, instead of disappearing silently.

## Changed files
- `src/app/api/collection/value/route.ts` — named the unambiguous foreign key in the user_copies → user_cards join.
- `src/app/api/collection/route.ts` — same ambiguous join fixed after confirming it failed the same way.
- `src/app/api/ai/build-deck/route.ts` — same ambiguous join fixed after confirming it failed the same way.
- `src/app/api/collection/value/route.test.ts` — mock now records the select string; new test asserts the named FK is used (fails with the old `user_cards!inner`).
- `src/components/collection/CollectionValueBanner.tsx` — on error or missing data, renders a minimal banner with a plain message and the Refresh Prices button.
- `src/components/collection/CollectionValueBanner.test.tsx` — new test that the error state shows the message and the Refresh Prices button.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The intended card name for each owned copy is the one reached through `user_copies_card_id_fkey` (the copy’s own `card_id`), not the proxy-for relationship.
- The existing 262 lint warnings are pre-existing and outside this task’s scope; the check must have zero errors.

## Challenges to locked decisions
- None.

## Open questions
- None.

## Verification
- Reproduced PGRST201 against the hosted database with the old select string (`user_cards!inner(card_name)`), limit 1, using the service role key.
- Confirmed the fixed select string (`user_cards!user_copies_card_id_fkey!inner(card_name)`) returns data, limit 1, for all three affected query shapes.
- Focused tests:
  - `npx vitest --run src/app/api/collection/value/route.test.ts src/components/collection/CollectionValueBanner.test.tsx`
  - Result: 14 passed.
- Full check:
  - `NODE_DISABLE_COMPILE_CACHE=1 npm run check`
  - Result: 142 test files passed (4 skipped), 1,616 tests passed (40 skipped); `tsc --noEmit` passed; ESLint 0 errors, 262 warnings (pre-existing).
