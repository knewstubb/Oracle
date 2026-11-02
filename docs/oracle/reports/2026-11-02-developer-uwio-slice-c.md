# Report: uwio-slice-c (empty-slot target and spare-copy browsing)
Role: Developer
Status: DONE
Task as received: Follow-up to docs/oracle/briefs/use-what-i-own.md after the owner's live test of the Oracle assistant on a deck page. (1) "How many slots are empty?" failed because all the owner's decks are typed Custom and a size target was only stated for Commander: a deck with a commander set targets 100 including the commander (D-002/D-059), reuse the app's helper, unknown when genuinely no commander; both the Oracle assistant and per-deck chat. (2) Replacement suggestions were weak: add a read-only tool reusing owned-copy-lookup and collection search helpers that lists SPARE real copies fitting the deck's colour identity with type/role filter and a cap, plus real copies in other decks (with the "leaves <deck> short by one" warning), Buy keeps the Scryfall estimate or "no price"; prompt calls browse first, order Spare, In another deck, Buy, suggest-only; blank colour identity is derived from the commander. No migrations, data changes, screens or import code. Mock-only tests, `npm run check`, commit with Copilot trailer, then stop.

## Summary for the owner
Asking "how many slots are empty?" on a deck like Mendicant should now work: any deck with a commander is treated as a 100-card deck including the commander (so 84 cards = 16 empty). When you ask the assistant to replace a proxy or fill a gap, it now looks through your collection first and lists cards you could use, in this order: spare copies, copies in other decks (with the "leaves X short by one" warning), then cards to buy with an estimated price or "no price". It still only suggests; it cannot change decks. None of this has been tried against your real data yet.

## Changed files
- src/lib/deck-chat-facts.ts — new `isCommanderDeck` rule (type Commander/unset, or a commander row, or a commander name on the deck; companion alone does not count); target 100 then; otherwise "unknown, do not guess" text. Loader/builder take the commander name and read `command_zone_role`.
- src/app/api/oracle/chat/route.ts, src/app/api/decks/[id]/chat/route.ts — pass the deck's commander name so both chats use the same rule.
- src/lib/spare-copy-browse.ts (new) — read-only browse of the owner's real copies that fit the deck.
- src/lib/owned-copy-lookup.ts — exports the existing commander-colour helper for reuse.
- src/lib/tool-registry.ts — registers `browse_spare_copies` (deck-chat context only; edit tools unchanged and still gated off).
- src/lib/deck-chat-prompt.ts, src/lib/oracle-prompt.ts — browse first, then check_owned_copies for Buy; Spare, In another deck, Buy order kept.
- src/lib/deck-chat-facts.test.ts, src/lib/spare-copy-browse.test.ts (new) — mock-only tests.

## How it works
- Commander rule reuses `isCommanderRow` (command-zone.ts) and the 100 constant from D-002/D-059; maybeboard stays excluded. [Confirmed: src/lib/deck-chat-facts.ts]
- Browse: real copies only (`is_proxy=false`); "sleeved" = a deck_cards row points at the copy (planned slots claim nothing), same as owned-copy-lookup; old ownership counts are not used. Card type/text/colours come from `ref_cards` by name (same source as the existing type search). Cards already on this deck's list, basic lands and out-of-colour cards are left out. Sorted by EDHREC popularity, capped at 25 per group (max 40), with a "showing N of M" note.
- Colours: the deck's stored colour identity if present, else derived from the commander's card data; if neither works, nothing is listed and the assistant is told to say so.
- Filter: type words (creature, artifact, enchantment, instant, sorcery, land, planeswalker) or roles (draw, ramp, removal). Roles read card text, so they are approximate and the tool says so.
- Buy stays in check_owned_copies (Scryfall estimate or "no price", never zero); unchanged.

## Verification
- `npm run check`: lint 0 errors (279 existing warnings), 210 test files passed. One run showed a failure in src/app/collection/page.test.tsx (timing-based search test, unrelated to this work); it passed on rerun.
- No live endpoint was run. Live behaviour is UNTESTED against the real database and model.

## New decisions made (need owner confirmation)
- A deck with any commander set counts as Commander for the size target even when typed Custom.
- Spare browse is ordered by EDHREC popularity.

## Assumptions
- `ref_cards` is matched by card name; double-faced cards stored as "Front // Back" whose owned name is only the front may be skipped (counted in "unchecked" note).
- A stored deck colour identity is trusted when non-blank; blank means "derive", so a truly colourless deck is derived from its commander.
- Browse loads all of the owner's cards, copies and deck rows per call (paged); fine for one user, may be slow on very large collections.

## Challenges to locked decisions
- none

## Test questions for the owner (on the Mendicant deck page)
1. "How many slots are empty?" — expect 16 (84 of 100), no "size not provided".
2. "Which of my proxies could I replace with spare cards I own?" — expect a Spare list first, with only cards in Mendicant's colours.
3. "Any spare removal or draw I could use?" — expect a short filtered list; check a couple against your collection.
4. "What could fill the gaps if I have no spares?" — expect Spare, then In another deck (each with a "leaves <deck> short by one" line), then Buy with an estimate or "no price".
5. Ask the same on a deck with no commander — expect it to say the target is unknown and, for colours, that they could not be determined, rather than guessing.
