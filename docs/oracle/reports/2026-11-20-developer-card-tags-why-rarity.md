# Report: card-tags-why-rarity
Role: Developer
Status: PARTIAL
Task as received: Build the tag and Why functionality using the Tags the app already shows; let Claude see card rarity and Pauper legality in decks (rarity of the printing in use, plus "legal in Pauper by any printing"). No 40-Tag list, no new tag pipeline, no AI fill, no Keep. Stored-data changes need owner approval and a rehearsal first; nothing applied.

## Summary for the owner
Claude can now see, for every card in a deck, the rarity of the printing you use and whether the card is Pauper-legal through any printing (so it can say "legal, but your copy is a rare printing"). Claude also already sees each card's Tags, and now sees your "Why it's here" line when you have written one. **A stored-data change is still pending your approval:** the Why box in the card window only appears, and only saves, after the "Why it's here" change (already drafted) is applied. Claude writing or changing a Why is not built, because it needs a further stored-data change (see Open questions).

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
- docs/oracle/reports/2026-11-20-developer-card-tags-why-rarity.md — this report

## Rarity and Pauper: what is stored
- Rarity is already stored for every printing (`ref_printings.rarity`). No change needed.
- "Legal in Pauper by any printing" is worked out from the same table: true when any printing of the card was ever common. Also no change needed.
- Missing: the card library has no Pauper legality or ban list. Cards banned in Pauper would show as legal; the tool text tells Claude to check bans itself. Adding it needs a new stored column (not drafted; needs your approval).
- A card never shows as illegal only because your printing is not common. Unknown printings leave the fields out; a failed read says `rarity_unavailable` instead of guessing.

## New decisions made (need owner confirmation)
- Field names Claude sees: `rarity` and `pauperLegal`; left out when unknown, to keep a 100-card deck in one answer.
- Why shows to Claude as `why`, only when you wrote one. A deck where every card has a 200-character Why no longer fits one answer; it then pages with a clear "ask for the next page" note.

## Assumptions
- "Pauper-legal by any printing" means any printing ever common, as agreed.
- Why in get_deck reads defensively: if the column does not exist yet, it is simply absent and the deck still reads.

## Challenges to locked decisions
- none

## Open questions
- Stored-data change pending approval: `deck_cards.why_here` (draft exists, rehearsed). Needed before Why saves in the live app.
- Claude writing a Why (fill an empty one; change yours through History with Undo): needs a new kind of change in the change log and a database function. Not built or drafted. Want it as the next slice?
- Keep flag: not built, not asked for. In scope now?
- Pauper ban list: want it stored so Claude does not have to check bans itself?

## Verification
- npm test — 364 files passed, 6 skipped; 4531 tests passed
- npx vitest --run src/lib/connector/__tests__/deck-rarity-pauper-why.test.ts — 8 passed: the Why saves through the route (trimmed, to the right slot) and a later get_deck returns it on that slot only; missing column leaves the deck readable; rarity "rare" with Pauper legal true for a card with a common printing elsewhere; mythic-only card false; unknown printing left out; failed read marked unavailable; Tags still returned; 100-card deck with rarity, Pauper and 3 Tags fits one answer
- npm run typecheck — only the 4 known AddToPicklist.test.tsx errors (same on main)
- npm run lint — only the known PicklistV2.tsx error (same on main)
- Not done: no live Claude chat check; nothing applied to the live database.
