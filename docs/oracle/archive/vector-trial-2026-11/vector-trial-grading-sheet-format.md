# Vector trial grading sheet: format

Authority: contract `vector-trial-2026-11.md` §5.2 (labelling, C7 pre-grading rules) and §5.9. Written by Architect in slice V-04. This is the only document the grader (owner or the assistant drafter) sees besides the freeze file `vector-trial-freeze-2026-11-06.md`.

## Rules the sheet must satisfy
1. **No arm, rank, source or combo hint.** No column, filename, ordering or id may reveal which arm produced a card, where it ranked, whether EDHREC listed it, or whether a combo label applies.
2. **No section label, no type-specific heading.** The owner's sheet never says which rows are traps, flip cards or deck-dependent cards (V-04b, 2026-11-06). The owner was previously told which cards are traps, so a label or a separate block would have confirmed it.
2b. **Order is randomised** with a seed that lives only in the sealed key. Never sorted by rank, arm, name-of-arm, grade or inclusion.
3. **One row per (card, list)** for pool and deck-dependent grading, because a grade depends on the build (§5.2). Traps are one row per (card, commander), **placed inside the commander's first list** (W1 for Wilhelt, M1 for Mendicant) in the shuffled order, with the same context block and the same columns as the other rows. Nothing marks them.
4. The sheet contains only: row id, list context, card text, and an empty grade box.
5. The sealed key (row id to card, arm membership, ranks, sources) is a **separate file**, never given to the drafter, and not opened until all grades are final.

## Sheet header (once per sheet)
```
Gold set version:   <freeze file date, e.g. 2026-11-06>
Sheet id:           <random 8 chars, not derived from content>
Grader:             <owner | assistant draft>
Grade scale:        3 = would be great, 2 = would play, 1 = marginal, 0 = wouldn't
Not derived from EDHREC: grade the card on its text for this deck, not on popularity.
```

## List context block (once per list, plain words; no type-specific headings)
| List | Context shown |
|---|---|
| W1 (Wilhelt, Zombies) | "Commander: <name and rules text>. Build: Zombies. Grade each card for this deck." Holds that list's pool rows, the deck-dependent rows, the Wilhelt flip rows, the Wilhelt trap rows and the Wilhelt multi-feature rows (with their `feature_ask`), all in one shuffled run. The build is named but no deck list is shown, because pools use the no-deck seed. |
| W2 (Wilhelt, Aristocrats) | Same block with Build: Aristocrats. Holds that list's pool rows, the deck-dependent rows and the Wilhelt flip rows. Trap rows may sit in either Wilhelt list; each is graded once per commander. |
| M1 (Mendicant, Artifacts) | Same block with Build: Artifacts. Holds pool rows, deck-dependent rows, the Mendicant trap rows and the Mendicant multi-feature rows. |
| Multi-feature rows | Shown as ordinary rows of the commander's first list; `feature_ask` names the feature being asked. For the question "overall, then each named feature" there is one row per feature. |
| Combo-only cards | Emitted as ordinary pool rows. The grader is **not** told that a card came from the combo arm, and no combo label is shown. |

## Row format
One row per line of the sheet (CSV, UTF-8; the same columns in a rendered table):

| Column | Content | Notes |
|---|---|---|
| `row_id` | `G-0001`, `G-0002`, ... assigned after shuffling | meaningless number; not a rank |
| `list` | `W1`, `W2` or `M1` | trap and multi-feature rows are shown under the commander's first list (W1 or M1); the build is context, not a hint |
| `card_name` | the face name(s) as printed | for two-faced cards both faces are shown in the text field |
| `card_text` | type line, mana cost, oracle text, power/toughness, for every face | plain Scryfall wording, no keyword glossary, no EDHREC, no price, no ownership, no set, no art |
| `feature_ask` | only for multi-feature rows: the named feature in plain words, otherwise empty | features are from the freeze file §7 |
| `grade` | empty; the grader writes 3, 2, 1 or 0 | |
| `note` | empty; optional free text | |

**No section column.** The owner's sheet has no `section` column and no column that distinguishes row types. The real source of every row (pool, trap, multi, deckdep, flip, combo-only) is recorded **only in the sealed result key**, joined by `row_id`. The `feature_ask` column stays for multi-feature rows because it is part of the question. Rows of different types are interleaved in the shuffled order so that position carries no information.

**Sample for the owner check A1b:** 5 rows drawn by a fixed seed from rows whose real source is an ordinary pool card only (never trap, flip, multi-feature or deck-dependent), shown with the full card text (type line, cost, rules text, power/toughness) and the same columns as the sheet. Produced by Developer in V-17; no other column.

## Example (fictional values, no real results)
```
Gold set version: 2026-11-06 | Sheet id: k3f9q2xa | Grader: owner
Scale: 3 great, 2 would play, 1 marginal, 0 wouldn't

== List W1: Wilhelt, the Rotcleaver, Zombies build ==
Commander text: <printed text>

row_id,list,card_name,card_text,feature_ask,grade,note
G-0007,W1,"<card A>","<type line> | <cost> | <oracle text> | <P/T>",,,
G-0008,W1,"<card B>","<type line> | <cost> | <oracle text>",,,
G-0031,W1,"<card C>","<type line> | <cost> | <oracle text>","makes a token when a Zombie dies",,
```

## What is deliberately absent
Arm name, rank, score, similarity, EDHREC inclusion or synergy, "from combo", combo label or tier, tag names, ownership, price, set, collector number, printing id, source file, build card list, earlier grades, draft grades (when the owner grades the 10 blind pair comparisons, which are a separate sheet showing two anonymous lists "A" and "B" in random order, with no drafts).

## After grading (not in the grader's view)
The harness joins grades to the sealed key by `row_id`, reports owner edit rate against assistant drafts (§5.2 rule 3), and computes metrics (§5.3). The key and the shuffle seed are committed with the results, never before.

## Rule the drafter follows (C7, restated)
The drafter reads only this sheet and the freeze file. It must not read the sealed key, any pool file, any arm output, any combo list, or any EDHREC data.
