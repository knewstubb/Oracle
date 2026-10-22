# Report: import-intent-contract
Role: Architect
Status: DONE
Task as received: Write the contract for the import intent design (`specs/import-intent.md` rev 3, mockup, Designer report, cleanup brief, import-row-editing contract): intents and defaults, ownership matching data, per-card result states, save semantics (atomic moves, alerts for skipped moves), generic basics and 100-card status, migrations (DRAFT only), Developer slices with Tester checks, conflicts with locked decisions with proposed wording. No code, no DB writes, no migrations applied.

## Summary for the owner
The contract is written. In plain terms:
- **Starting point.** "I bought it" adds every card as a new Original, as today. "I built it" starts by using cards you own: it sleeves a free copy, and if the only copy is in another deck it asks which deck to take it from. "I'm planning it" adds and sleeves nothing. Precons start as "I bought it". Links, files, pasted lists and precons all open the same review.
- **Matching.** The review looks up your collection once and tells each card whether you own it, whether a copy is free, which decks hold the rest, and whether you own it in a different printing (your CMM 410 vs the deck's CLB 351). A free copy is used before another deck is touched.
- **Saving.** One all-or-nothing save. Cards move between decks only when you confirm, and nothing is ever deleted. If you press Skip on a move, a new sleeved copy is added and the other deck shows an **Accounting error** alert that stays until you press Fixed or Dismiss. If a copy was taken by something else between review and save, that card is saved unsleeved and listed under "Needs a look".
- **Basics.** Generic basics are never matched or moved; they are sleeved except under "I'm planning it", which keeps the deck at Assembling until they are sleeved.
- **Needs your approval before it is built:** two database changes. One new table that stores the alerts, and one new save function that is allowed to move a copy from one deck to another. I wrote the table as a draft and specified the function; **nothing is applied**.
- **One question** (end of the contract): when you Skip a card that is in several other decks, should all of those decks show the alert? I recommend yes.
- The test account still doesn't exist, so saving can't be tested safely yet; the first three slices don't save and can go ahead.

## Changed files
- docs/oracle/contracts/import-intent.md (new)
- docs/oracle/contracts/import-intent.types.ts (new, reference types)
- docs/oracle/contracts/drafts/DRAFT_20261023140000_deck_card_alerts.sql (new, DRAFT, not in `supabase/migrations/`, not applied; folder created so it cannot be picked up by a deploy)
- docs/oracle/reports/2026-10-23-architect-import-intent-contract.md (this report)
No code, no decisions.md, no database change.

## Key findings
- Everything needed to move a copy already exists as database functions (`_move_copy_to_slot`, `reassign_to_deck`, `undo_copy_move`, `release_deck_copies`). The new save function reuses their rules (same locks, old slot becomes planned, nothing deleted) instead of inventing a second set.
- The check that links a copy to a slot compares the **card**, not the printing, so sleeving a CMM 410 into a slot that listed CLB 351 is allowed (confirmed in `20260916065913_…`). The slot then shows the printing actually used.
- Ownership data never needs copy ids on the client; the server redoes the matching at save, so a tampered request can't sleeve someone else's copy.
- The old alert route (`/api/decks/[id]/dead-weight/dismiss`) reads the deck with the service role and no user filter. I told the Developer not to copy it; worth a separate look (a possible hole in existing code, not verified further).

## New decisions made (need owner confirmation)
- **Free before held.** The matching order is free exact printing → free other printing (needs your choice) → held in another deck (move) → held other printing → none. A free copy is used before another deck is disturbed.
- **Held proxies can be moved** as well as originals; originals first.
- **Owned copies keep their own finish/condition/language;** the defaults bar only applies to new copies.
- **Skip alerts every holder deck** (Q1).
- **Alerts close themselves** if the copy is no longer in that slot (so no nagging after a manual fix).
- **Maybeboard/sideboard from links** are not imported and are counted in a notice until the Designer decides (D-018/D-022).
- The route may delete **the empty deck row it created in the same failed request** (today an empty deck can remain). Needs a nod because it is a delete.

## Assumptions
- One copy sits in at most one deck; no database constraint enforces it, so the save function checks it under lock [Approximate].
- "Free" = not sleeved in any deck and not marked missing (binder/box copies count as free).
- Preview = save because the same pure functions run on both sides.
- The Designer's one-line intent descriptions don't change behaviour.

## Challenges to locked decisions
- **D-020, D-047** are contradicted (owned copies are now sleeved and moved at import, by choice). Proposed wording in contract §11 for Gene.
- **D-045** (default Original) scoped to collection import and "I bought it". **D-021** gains the "Use my printing" rule. **D-031, D-052** marked superseded. **D-044** gains links and precons. **D-018/D-022** held for the Designer.
- AGENTS rule 5: a move re-points a copy but deletes nothing, and each move is confirmed on the review.

## Open questions
1. Skip with several holder decks: alert all (recommended), none unless a deck is picked, or only the first.
Plus approvals (not questions): M1 table, M2 function, the empty-deck cleanup nod.

## Verification
Read the spec, Designer report, cleanup brief, row-editing contract and types, generic-basics contract, the `replace_deck_with_new_cards` migration, the movement functions, the identity trigger, `deck_cards`/`user_copies` types and the dead-weight alert route. Read only; nothing was run or tested. M2 is specified, not drafted as SQL; the Developer drafts it to contract §5 and the Architect reviews before approval.
