# Report: type-line-alignment
Role: Developer
Status: DONE
Task as received: Align the app to the Magic type-line convention (supertypes, then card types, then a dash, then subtypes). Owner: "Yes. I want our app to align to this exactly". Build order: shared parser (FEAT-001), app readers (FEAT-002), connector and Collection screen (FEAT-003), measure, docs and this report (FEAT-004).

## Summary for the owner
The app now reads a card's type line the way Magic defines it, in one place, instead of searching for words anywhere in the text. "Basic" and "Snow" are now real filters, Hide Basics now hides the basic lands, the card window shows supertypes, card types and subtypes as three groups, and Claude can search all 15 card types. Searches stayed fast (under 1 second even on a cold first run) so no database change was needed. Several small visible changes need your yes; they are listed below in plain words.

## What you will notice
- Collection list "Type" column shows every card type, for example "Artifact Creature".
- Collection page has a new "Basic" chip. It shows only Basic cards (Snow-Covered Swamp included).
- Allocation page "Hide Basics" now hides the 7 basic cards (645 copies). Before, it hid nothing. Snow creatures such as Ohran Frostfang stay visible.
- Card window shows Supertypes, Card types and Subtypes as separate groups; an empty group is hidden.
- Deck page "Group: Type" and "Sort: Type" read the real type line. A card in your custom category "Ramp" now groups under its real type instead of "Other". Kindred and the rare types get their own groups.
- New cards added or imported get the category Land if the front face is a Land (an Artifact Land used to default to Artifact). Existing cards keep their category.
- Claude's counts by type now include a Kindred group (4 cards).
- Free-text card search no longer matches part of a word ("ant" no longer finds "Artifact").
- A card like "Instant // Land" now counts as a spell, not a land, on the mana curve.

## Open points for the owner (plain words)
1. **One-group order.** Where a card must sit in one group, the order is Land, Creature, Planeswalker, Battle, Kindred, Instant, Sorcery, Artifact, Enchantment, then the rare types, then Other. The audit text put Kindred after Enchantment yet said the 4 Kindred cards get their own group; the build puts Kindred before Instant so they do. Needs your yes.
2. **Deck "Group: Type" reads the type line now.** Needs your yes (see above).
3. **Land first.** An Artifact Land (9 owned) or Enchantment Land now defaults to Land. A Land Creature on one face would move from Creature to Land (none owned).
4. **All card types: window only.** The card window shows all card types; the tile and Collection list show the front face only. Say if the tile should show all.
5. **Basic chip direction.** The Collection "Basic" chip means "show only Basic". You might have expected "hide Basic".
6. **Tokens and art cards** are ignored, per your decision.
7. **Subtype search** stays whole word across both faces.
8. **Deck health panel** still has seven type rows. Battle and Kindred have no row. Should they?
9. **Legendary Vehicle commander mismatch.** The commander rules accept a Legendary Vehicle or Spacecraft, but the card-search and Claude "commander candidate" rule still needs Legendary AND Creature. Recorded, not fixed.
10. **Empty stored type line.** The type line saved on each of your 2,832 owned cards is empty, so price and add suppression for basics (rollup routes) still never fires. A fix would read the card library as the Allocation page now does. Not changed.
11. **Basic filter paging.** On the Collection list with the default name sort, the Basic filter pages by a text match first. Fine on today's data (the word Basic only appears as a supertype), but not exact. Say if you want it exact.
12. **Contract number.** The Claude contract says 100 owned cards have no card data; the audit's live read found 0. Not corrected until you confirm.
13. **Library oddities.** Library words like Hero, Stickers and Summon are not in the closed lists; they show up as "unknown" and are never dropped. The type lists come from the Comprehensive Rules as understood on 2026-11-18 and could not be verified offline.

## Changed files
This FEAT (FEAT-004):
- docs/oracle/reports/evidence/2026-11-18-type-line-after.json - measured before and after timings
- docs/oracle/specs/vocabulary.md - new "Type line" section (inserted before section 12; no renumbering)
- docs/oracle/contracts/connector-collection-search.md - sections 5.1 and 6 corrected; new section 15 amendment
- docs/oracle/reports/2026-11-18-developer-type-line-alignment.md - this report
Earlier FEATs: see `git diff --stat main..HEAD` (parser in src/lib/type-line.ts and type-line-constants.ts; readers across src/lib, src/components, connector tools, Collection screen, card window; contract types file).

## New decisions made (need owner confirmation)
- Single-group order (open point 1), Group: Type reading the type line (2), Land first (3), Basic chip meaning "only" (5), Hide Basics now effective, Kindred bucket in Claude's counts.
- No database change (see Verification).
- Data fix candidate, NOT written and NOT run: normalise the 30 library rows that mix comma style and space style (for example `Artifact // Artifact Creature — Golem`). If wanted, follow the dry-run pattern of supabase/drafts/cc14-backfill-ref-cards.ts: print what would change, change nothing without owner approval.

## Assumptions
- Type word lists and the Time Lord multiword subtype are from the Comprehensive Rules as understood from the owner's decision; unverified offline.
- Legendary, Basic and Snow are read from either face in Claude search (as Legendary always was) and from the front face in app screens.
- Cold-run timings reflect an idle database; the warm rerun is the usual case.

## Challenges to locked decisions
- none

## Suggested decision text for Gene
(Not written into decisions.md or status.md.)
- "Type line (2026-11-18): The app reads every type line by position: supertypes, card types, then subtypes after the dash. One shared reader (src/lib/type-line.ts) is the only place type lists live. Basic and Snow are supertypes. Several card types are allowed; places needing one group use the order Land, Creature, Planeswalker, Battle, Kindred, Instant, Sorcery, Artifact, Enchantment, rare types, Other. Tribal is read as Kindred. Claude search reads the exact line app-side with a coarse database prefilter; no view change."
- "Status: type-line alignment built and verified, awaiting owner yes on: one-group order, Group: Type reading the type line, Land-first default category, Basic chip meaning, Battle/Kindred health rows. Candidate follow-ups: user_cards.type_line is empty for all cards; normalise 30 mixed-format library rows (dry-run first); Legendary Vehicle commander mismatch; contract number '100 cards without data' vs live 0."

## Open questions
- See open points 1 to 13 above.

## Verification
- Read-only live EXPLAIN (ANALYZE) of 5 audit queries plus 4 type-line variants: all under 1,000 ms cold, under 100 ms warm (evidence file above). Threshold 2,000 ms. PASS. No writes.
- Database change: none. No draft, rollback or throwaway-Postgres test exists, so none was run.
- `npm test` (full): 308 files passed, 6 skipped; 3,816 tests passed, 46 skipped, 0 failed.
- `npm run typecheck`: only the 4 pre-existing errors in src/components/AddToPicklist.test.tsx (Picklist, out of scope, untouched).
- `npm run lint`: 2 errors and 278 warnings, identical to the baseline before this work (none in new files).
- `git diff --stat main..HEAD`: no change to docs/oracle/decisions.md, docs/oracle/status.md, Picklist components, the Decks list page, or any applied supabase/migrations file.

## Review round 2 addendum
- Now routed through `src/lib/type-line.ts`: rating-engine (Instant, Land, Artifact checks; an Artifact Land now counts as a land, not a non-land artifact), ref-card-backfill (Legendary, Creature, Vehicle/Spacecraft subtypes), compute-deck-ratings and detect-dead-weight (Land), generate-all-commanders (Time Lord, Doctor, Background subtypes), manabox-import (Token read from the parser's unknown words, since Token is not in the card-type list).
- Remaining `ilike('%word%')` prefilters, each followed by an exact parser check: collection-filters (appFilter in collection-query.ts), rollup/route.ts (hasSupertype Basic, line 213), printings/route.ts (hasSupertype Basic on the page, line 375; the prefilter pages the result because "basic" appears only as a supertype), spare-copy-browse typeLike (`match` using hasCardType, supertype or subtype).
- Verification: typecheck shows only the 4 existing AddToPicklist.test.tsx errors (same on the previous commit; Picklist is out of scope). Lint shows the 2 existing errors (storage link, list-decks prefer-const), same as before. `vitest --run`: 3816 passed, 46 skipped.
