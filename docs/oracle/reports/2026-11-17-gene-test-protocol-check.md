# Report: test-protocol-check
Role: Gene
Status: DONE
Task as received: "Can you check the test protocol is still up to date. I think claude can create decks now"

## Summary for the owner
Claude still cannot create decks: that work is approved and designed but nothing is built or switched on, so the current test plan was right to tell you to make the two test decks yourself. I corrected a few details in it (what can be tested now versus what waits for the bigger-edit limits, the known collection-value problem, and that Claude's deck build adds planned cards without taking copies). I also marked the older import protocol as paused so it cannot be mistaken for the current one.

## What I checked
- **Current test plan** (`docs/oracle/test-plan-2026-11-17.md`): the deck-creation claim is accurate. No tool for creating or setting up a deck exists in the connector's tool list [Confirmed: src/lib/connector/tools/index.ts]. The only deck-creation work is five drafts under `supabase/drafts/` (CC-15 to CC-18), none applied or run, and no Claude tools built [Confirmed: supabase/drafts/20261117200000…20261117200400; status CC-15]. The CC-15 audit is DONE, not a build [Confirmed: docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md].
- **Bigger-edit limits (CC-13)**: code is built but the database change is a draft; the rehearsal passed 43/43 on a throwaway database and nothing is applied, so the 120-card build and the 500/hour cap are not live [Confirmed: docs/oracle/reports/2026-11-17-tester-cc13-verify.md; status CC-13]. The plan only applied that caveat to some steps.
- **Collection value**: the plan asked the owner to check the value banner, but the value strip is a known parked fault (T-51; owner checklist C-03/C-04 Fail) [Confirmed: docs/oracle/status.md line 115; docs/oracle/owner-checklist.md]. That would have produced a needless Fail.
- **Planned cards vs copies**: Claude's deck build adds planned slots in one request; taking physical copies is a separate per-card step [Confirmed: docs/oracle/reports/2026-11-17-developer-cc13-limits.md §"Existing tools support a one-click deck build"]. The plan's ground rules said copies leave storage during the build, which is wrong.
- **Old import protocol** (`docs/oracle/test-protocol-import.md`): stale and paused. It refers to branch `test-t56-local`, the save switch, stage 3 and a collection total of 108 from the October run. Import work is parked (T-56/T-57 closed, T-58 parked) [Confirmed: docs/oracle/status.md; docs/oracle/test-log-import.md].

## Changes made
- `docs/oracle/test-plan-2026-11-17.md`
  - Added a 17 Nov status note: Claude cannot create decks yet; CC-13 not live; lists what can run now and what waits for the test decks or CC-13.
  - Step 1: said plainly why Claude cannot create a deck, and added the rehearsal result to the CC-13 note.
  - Ground rules and step 1c: corrected "planned cards, no copies taken" (copies move only through the Picklist steps).
  - Part A: marked that it needs CC-13 live.
  - Part G: added "Items 8 to 12 need CC-13 live first".
  - Part G13: updated CC-19 from "should now say" to "is now built, not yet seen in a real chat".
  - Part B7 and C5: the collection value banner is a known parked problem, note it but do not fail it; C5 totals line now ties to the cards Part A moved.
  - Part H: CC-13 rehearsal recorded as done (43/43, nothing applied).
- `docs/oracle/test-protocol-import.md` — added a "Paused 2026-11-11 — this is not the current test plan" banner pointing to the 17 Nov plan and the import test log.
- `docs/oracle/status.md` — CC-13 and CC-15 status lines now say the rehearsal passed and the CC-15 audit is done with nothing built (a parallel update had already added CC-20; left in place).
- `docs/oracle/reports/2026-11-17-gene-test-protocol-check.md` — this report.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- "Test protocol" means the current owner test plan; the file literally named `test-protocol-import.md` was checked and marked paused because it is the only other document with that name.
- The plan's live-data figures (4,550 copies, 19 decks, 137 proxies) were checked by Gene earlier on 17 Nov and nothing has changed since; no fresh live query was run for this documentation check.

## Challenges to locked decisions
- None.

## Open questions
- Owner: approve applying the CC-13 database change so the build-related parts of the plan (Step 1c–1e, Part A, G8–G12) can run. Until then the owner can make the two empty test decks and run the connector-page, read-only Claude and non-TEST-B storage/import checks.

## Verification
- `grep -rn "create_deck|set_deck_setup|deck_setup" src supabase/migrations` — no connector tool or applied migration; only the unrelated `create_deck_version` and the app's own new-deck screen [Confirmed].
- `ls supabase/drafts/` — CC-13, CC-15a/b, CC-16, CC-17, CC-18 present as `.draft.sql`, not in `supabase/migrations/`.
- Read `docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md`, `2026-11-17-tester-cc13-verify.md`, `2026-11-17-developer-cc13-limits.md`, `docs/oracle/status.md`, `docs/oracle/owner-checklist.md`, `docs/oracle/test-log-import.md`.
- Documentation only; no app code, test or database was changed.
