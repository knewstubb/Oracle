# Report: cc03c-insights-private
Role: Gene
Status: DONE
Task as received: Merge data-separation fixes on branch import-destination after tester click-through, build and smoke tests; make the AI commander analysis table private (no public-key read), update the helper scripts to the server key, apply live (owner approved), keep an undo script, verify anon blocked and helpers work. Update status.md, write report, stop before CC-04.

## Summary for the owner
The AI commander analysis is now private: the public key can no longer read it, and the app and helper scripts use the private server key, so they still work. The real app was clicked through against the locked database and nothing broke; your data is identical afterwards. The merge went through a pull request (see the final message for its state).

## Changed files
- supabase/migrations/20261116120000_ref_commander_insights_private.sql — the change applied live
- supabase/drafts/20261116120000_ref_commander_insights_private.rollback.sql — exact undo
- scripts/check-insight-status.js, scripts/generate-coverage-report.js, scripts/distill-commander.ts — server key only (from branch cc03c-insights-scripts)
- docs/oracle/status.md — CC-03a/b/c rows

## New decisions made (need owner confirmation)
- Signed-in accounts also lost read on this table (only the server reads it today).

## Assumptions
- Interrupted earlier run left: the helper-script branch (complete, verified) and nothing applied live for this table. Confirmed from live state before acting.
- The two migrations dated 20261113 (In your hand/Missing, move items) are unapplied drafts; left untracked and out of the commit.

## Challenges to locked decisions
- none

## Open questions
- Production build fails on a type error in a docs example file (docs/oracle/contracts/card-state-actions.examples.ts), present on main already and untouched by this branch.
- Playwright smoke suite refuses localhost by design (needs a separate HTTPS test site with fixture login); not run. Tester's own click-through replaced it.
- Cron, card refresh, allocation, reconcile, brew, collection import/replace and deck delete routes untested against the lockdown.
- Leftover: user_preferences table missing live (chat logs a harmless error).

## Verification
- Live state captured before: RLS on, SELECT for anon and signed-in, public-read policy, 6459 rows.
- After: anon REST read returns 401 permission denied; other reference tables (ref_commanders) still 200; row count 6459 unchanged.
- check-insight-status script with server key: lists insight counts.
- Tester report: collection, deck, status change (restored), import preview, chat add + undo all PASS; counts unchanged.
