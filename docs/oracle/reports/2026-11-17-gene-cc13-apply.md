# Report: cc13-apply
Role: Gene (Orchestrator)
Status: BLOCKED
Task as received: "Approve" (owner approval of the CC-13 gate: apply `supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql` to the hosted database, then save the matching code to main).

## Summary for the owner
Approved, but I could not apply the database change from this session: I have no way to run SQL on your Supabase database here. Nothing was changed on the live database and the code is not saved yet. Quickest route: run the file in the Supabase SQL editor and tell me; I will check the new limits and then save the code.

## What was attempted
- Checked the Supabase command-line tool: it cannot run a single SQL file. Pushing migrations would also apply older unapplied files, which the status notes rule out.
- Checked for a stored database password: none is set up (no entry in the environment or the password file). I did not take the login token from the tool's keychain entry; that is not something I should use without you setting it up.
- Earlier changes were applied with a Supabase tool that is not available in this session.

## Changed files
- docs/oracle/status.md — CC-13 row: owner approval recorded, apply blocked, next steps
- docs/oracle/reports/2026-11-17-gene-cc13-apply.md — this report

## Not done (on purpose)
- The draft was not moved into `supabase/migrations/`. That would tell the repository the change is live when it is not.
- No code was committed. The code must follow the database change (the Developer's report says so). The CC-13 code shares `src/lib/connector/tools/index.ts` with the CC-18 buying list and CC-19, so the save will include those two as well (both already approved by the owner).

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The owner's approval covers the same migration file the Tester rehearsed (unchanged since the rehearsal).
- A rollback file exists (`supabase/drafts/20261117100000_cc13_loosen_limits.rollback.sql`) and was tested by the Tester.

## Challenges to locked decisions
- None. D-034a wording is still to be recorded by Gene after the change is live.

## Open questions
- Owner: run `supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql` in the Supabase SQL editor, then tell Gene. Or give Gene a route to run it.
- Owner: OK for the same save to include the CC-18 buying list and CC-19 wording (they share a file)?

## Verification
- `supabase --version` — 2.75.0; `supabase db query --help` — no single-file command; `supabase/.temp/pooler-url` — no password in it.
- No SQL was run against the hosted database; no migration was applied; no commit was made.
- Status row updated; no product code changed.
