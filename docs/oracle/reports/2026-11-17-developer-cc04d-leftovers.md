# Report: cc04d-leftovers
Role: Developer
Status: DONE
Task as received: Three owner-approved tweaks after CC-04d: (1) connector deck list shows "not marked active by you" plus Draft/Assembling/Playable and lists all decks; (2) remove the sync-scryfall cron from vercel.json; (3) soften the phone note in the setup guide.

## Summary for the owner
Claude's deck list now includes every deck and says "not marked active by you" (or "marked active by you") along with Draft, Assembling or Playable. The broken daily card sync is removed; price refresh still runs. The phone note now says adding a connector from the phone app is still in beta, so it's easiest to start on the web or desktop, and it shows on the phone once added.

## Changed files
- src/lib/connector/tools/list-decks.ts — no active filter; adds activeNote and readiness (via computeDeckReadiness, format deck size); input description reworded, parameter still accepted
- src/lib/connector/tools/list-deck-cards-by-ownership.ts — no longer limited to flagged decks; description reworded
- docs/oracle/contracts/claude-connector-slice-a.types.ts / .md — DeckSummary gains optional activeNote and readiness; include_inactive noted as ignored
- src/lib/connector/__tests__/tools.test.ts — tests for all-decks listing, wording, readiness
- vercel.json — removed sync-scryfall cron
- src/app/api/cron/sync-scryfall/route.ts — deleted (only referenced by vercel.json; the in-app refresh uses src/lib/card-data-sync.ts, untouched)
- src/components/connector/SetupGuideTab.tsx and .test.tsx — softer phone note

## New decisions made (need owner confirmation)
- none

## Assumptions
- Readiness ignores maybeboard cards and uses the format's deck size (100 for Commander), same as the import picker.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npx tsc --noEmit — only AddToPicklist.test.tsx errors (not mine); stale .next types cleared by build
- npx vitest run — 3428 pass, 2 fail (basic-lands-import, import-destination); both fail identically on a clean tree, unrelated
- npm run build — passes
