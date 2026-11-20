# Report: card-tags-why-rarity
Role: Developer
Status: DONE
Task as received: Build the tag and Why functionality using the Tags the app already shows; let Claude see card rarity and Pauper legality in decks (rarity of the printing in use, plus "legal in Pauper by any printing"). No 40-Tag list, no new tag pipeline, no AI fill, no Keep. Stored-data changes need owner approval and a rehearsal first; nothing applied.

## Summary for the owner
Claude can now see, for every card in a deck, the rarity of the printing you use and whether the card is Pauper-legal through any printing (so it can say "legal, but your copy is a rare printing"). It sees each card's Tags and your "Why it's here" line, and it can fill an empty Why or change a written one: every change shows in the deck's History as "Changed by Claude" with Undo, and Undo is refused if you edited the line since. **Two stored-data changes are pending your approval, and the Why does nothing until they are applied:** the Why line itself (drafted earlier) and Claude's right to write it (new, drafted now). Both were rehearsed on a throwaway database; nothing was applied to the live one.
## What already existed (not rebuilt)
- Tags on the card window: stored in `ref_card_tags` (a shared table, 40 Tags in `ref_tag_list`, one row per card identity and Tag), read-only, same for every deck and user. [Confirmed: src/lib/card-tags-read.ts, supabase/drafts/20261120100000_tags_fill_tag_tables.draft.sql]
- Tags for Claude: `get_deck` already returns each card's Tags (short codes with a name list) and `search_collection` already filters by Tag. Unchanged. [Confirmed: src/lib/connector/tools/card-tags-tool.ts, get-deck.ts]
- Why in the card window: box with autosave, 200 character limit, "0 of 200", saved through a per-slot route. [Confirmed: src/components/card-details/OverviewTab.tsx, src/app/api/decks/[id]/cards/[cardId]/why/route.ts]
- It saves to `deck_cards.why_here`, which does not exist yet: the column is a draft (`supabase/drafts/20261120110000_why_here_deck_cards.draft.sql`, rehearsed on a throwaway database, not applied). Until it is applied the app hides the box and the route answers "not available". So Why does not save today on the live app. [Confirmed]

## Changed files
- src/lib/connector/tools/card-printing-facts.ts — new: rarity of the printing in use, and Pauper legality by any printing, two batched reads
- src/lib/connector/tools/get-deck.ts — each card now carries rarity, pauperLegal and (when written) why
- src/lib/connector/tools/index.ts — get_deck description explains the new fields and the "legal, but your copy is a rare printing" wording
- src/lib/connector/__tests__/deck-rarity-pauper-why.test.ts — new tests (see Verification)
- src/lib/connector/tools/edit-tools.ts, index.ts, edit-config.ts — new edit tool set_card_why (one card per call; fills an empty Why, or changes a written one; always logged; says plainly when the stored data is not updated yet)
- src/lib/connector/write-types.ts, write-gateway.ts — the gateway call for it
- src/lib/connector/change-sentences.ts — History wording for it and the refusal wording (one line, why_changed)
- src/lib/connector/__tests__/card-why-write.test.ts, registry-and-isolation.test.ts — new tests, tool list updated
- supabase/drafts/20261120120000_card_why_claude_write.draft.sql and .rollback.sql — NOT APPLIED: the change kind, Claude's write, Undo and the Undo-blocked check
- docs/oracle/reports/evidence/roles-db/test_card_why.sh, test_card_why.out, README.md — throwaway rehearsal, 20 PASS 0 FAIL
- docs/oracle/reports/2026-11-20-developer-card-tags-why-rarity.md — this report

## Rarity and Pauper: what is stored
- Rarity is already stored for every printing (`ref_printings.rarity`). No change needed.
- "Legal in Pauper by any printing" is worked out from the same table: true when any printing of the card was ever common. Also no change needed.
- Missing: the card library has no Pauper legality or ban list. Cards banned in Pauper would show as legal; the tool text tells Claude to check bans itself. Adding it needs a new stored column (not drafted; needs your approval).
- A card never shows as illegal only because your printing is not common. Unknown printings leave the fields out; a failed read says `rarity_unavailable` instead of guessing.

## New decisions made (need owner confirmation)
- Field names Claude sees: `rarity` and `pauperLegal`; left out when unknown, to keep a 100-card deck in one answer.
- Every Claude write to a Why is logged and undoable, including filling an empty one (simpler than two paths, and the owner sees every change). The app cannot tell an owner-written Why from a Claude-written one, so any Why with text counts as the owner's: the tool tells Claude to change it only when asked.
- Clearing a Why is not offered to Claude (text only).
- Why shows to Claude as `why`, only when you wrote one. A deck where every card has a 200-character Why no longer fits one answer; it then pages with a clear "ask for the next page" note.

## Assumptions
- "Pauper-legal by any printing" means any printing ever common, as agreed.
- Why in get_deck reads defensively: if the column does not exist yet, it is simply absent and the deck still reads.

## Challenges to locked decisions
- none

## Open questions
- **Stored-data changes pending owner approval (nothing applied), apply in this order:** (1) `20261120110000_why_here_deck_cards` (the Why column; needed before Why saves in the live app). (2) `20261120120000_card_why_claude_write` (change kind card_why, Claude's write, Undo; needs (1) and DB-2). Before (2) is applied, set_card_why answers "not updated yet" and changes nothing.
- DB-6 (not applied) rewrites the same change-kind list and Undo front doors; if it is applied after (2) it must be changed to keep card_why.
- The contract type list of change kinds (docs/oracle/contracts, Architect's file) does not list card_why; the code compares it as text. Architect may want to add it.
- Keep flag: not built, not asked for. In scope now?
- Pauper ban list: want it stored so Claude does not have to check bans itself?

## Verification
- npm test — 365 files passed, 6 skipped; 4540 tests passed
- npx vitest --run src/lib/connector/__tests__/card-why-write.test.ts — 9 passed: Claude fills an empty Why, changes a written one (sends the text it read), owner-edited-since refused, wrong name / unknown slot / line break / 201 characters / missing reason refused with no write, 200 accepted, old database told plainly, same text no change, History wording
- npx vitest --run src/lib/connector/__tests__/deck-rarity-pauper-why.test.ts — 8 passed: the Why saves through the owner's route and get_deck returns it on that slot; rarity "rare" with Pauper legal true for a card with a common printing elsewhere; mythic-only false; unknown left out; failed read marked unavailable; Tags still returned; 100-card deck fits one answer
- docs/oracle/reports/evidence/roles-db/run.sh test_card_why — 20 PASS, 0 FAIL on a throwaway local Postgres (never the hosted project)
- npm run typecheck — only the 4 known AddToPicklist.test.tsx errors (same on main)
- npm run lint — only the known PicklistV2.tsx error (same on main)
- Not done: no live Claude chat check; nothing applied to the live database.
