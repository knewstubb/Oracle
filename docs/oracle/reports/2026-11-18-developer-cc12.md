# Report: cc12
Role: Developer
Status: DONE
Task as received: CC-12, align the connector deck list words with D-059 and the app's current deck status words (Brewing / Assembling / Playable, Unowned cards where D-059 says so).

## Summary for the owner
The deck list Claude sees already uses the same three status words as the app: Brewing, Assembling, Playable. The app does not show "Unowned cards" as a deck status yet (that part of D-059 is not built), so the connector does not either. I changed the deck list's description so cards you do not own are called "unowned", and it says this is a count of cards, not a deck status. Decision for you: when the Unowned cards status is built in the app, the connector should follow it then.

## Changed files
- src/lib/connector/tools/index.ts — list_decks description says "unowned" and that it is not a deck status
- src/lib/connector/tools/list-decks.ts — `let q` to `const q` (fixes the known lint error)
- src/lib/connector/__tests__/deck-status-wording.test.ts — new test for the wording

## New decisions made (need owner confirmation)
- Connector returns Brewing / Assembling / Playable only, until the app builds the Unowned cards status.

## Assumptions
- The app's status is the Brewing-based rule in the deck readiness code [Confirmed: src/lib/deck-readiness.ts]; no Unowned status or Use proxies toggle exists in src.
- Field name notOwned in counts is left as is (changing it would break the connector contract).

## Challenges to locked decisions
- D-059 / status.md CC-12 row still say "Draft"-based wording; the app renamed Draft to Brewing. Suggest updating that text (not edited here).

## Open questions
- Should Claude's deck list gain an Unowned status when D-059 is built?

## Verification
- vitest run src/lib/connector — 336 passed
- full vitest run — 3819 passed, 0 failed
- eslint src/lib/connector — clean
- tsc --noEmit — 4 errors (known AddToPicklist)
