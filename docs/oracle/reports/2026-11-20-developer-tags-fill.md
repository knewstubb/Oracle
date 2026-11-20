# Report: tags-fill
Role: Developer
Status: DONE
Task as received: Task: store Scryfall's Oracle tags as the app's 40 card Tags for every card, ready to fill (stored-data change drafted and rehearsed, fill job, tests; no screen changes). Owner decision 2026-11-20: "Lets just use the current tags and we will do the pass at a later date. Can you update all the cards with the Oracle tags." Use the local Scryfall copy (7 August 2026) as it is, no refresh, no AI pass; fill ALL Commander-legal cards in the app library; the 40 Tags from docs/oracle/reports/2026-11-20-architect-tag-frequency-proposal.md; keyed by oracle_id (D-003), global, read-only for the owner. Full text as given in the handoff.

## Summary for the owner
Nothing changes on screen yet. I prepared the two new shared lists the Tags need (the 40 Tags, and which card has which Tag) and a tool that fills them from the Scryfall copy you already have. Once you approve and apply the stored-data change, the tool would give a Tag to 25,558 of the 32,643 Commander cards (78.3%) and to 2,562 of your 2,878 Commander cards in your collection (89.0%), about the same as the earlier estimate (78.4% and 89.1%). Nothing was applied or written to the real database.

## Approval note for the owner (stored-data change)
- **What it adds:** two new shared tables. One holds the 40 Tags (name, broad or mechanic, which Scryfall tags feed it, display order). The other holds one row per card per Tag, with where the row came from ("scryfall" now; room for rule, AI and your own corrections later), which fill run wrote it, and the date. It starts with the 40 Tags in the first table and nothing in the second.
- **Who can see and change it:** every signed-in user can read both. Only the system (service role) can write. There is no user or deck on any row: Tags are the same for everyone.
- **What it touches:** no existing table, column, function or row. Rehearsed on a throwaway database with every live earlier change (DB-1 to DB-5, CC-25, S3, S4, S5) in place: 26 of 26 checks passed, and rolling everything back returned that database exactly to its starting point.
- **How to undo it:** two ways. To remove just the Tags the fill added, run the fill tool with `--undo-run <run id>` (it prints the run id). To remove the tables, run the rollback file; it refuses while any Tag rows exist, so nothing is lost by accident.

Draft and rollback (not applied):

`supabase/drafts/20261120100000_tags_fill_tag_tables.draft.sql`

`supabase/drafts/20261120100000_tags_fill_tag_tables.rollback.sql`

## What the owner will NOT see yet
No Tag chips on cards and no Tag filter anywhere. Showing Tags is the next slice (Designer gate). Fixing and Stax / tax are weaker than the others (Scryfall misses cards such as Command Tower and Rule of Law); the AI check that would fix that is deferred. About 628 Commander cards newer than the 7 August 2026 copy get no Tags until Scryfall's data is refreshed (deferred).

## Dry-run numbers (read-only against the hosted library; nothing written)
Scryfall copy dated 2026-08-07. Rows that would be written: 50,473 (source "scryfall").

| Tag | Kind | Commander-legal cards | Your cards |
|---|---|---|---|
| Targeted removal | broad | 4873 | 395 |
| Card draw | broad | 4048 | 439 |
| Ramp | broad | 2136 | 326 |
| Recursion | broad | 2130 | 197 |
| Card selection | broad | 1614 | 174 |
| Protection | broad | 1261 | 106 |
| Tutor | broad | 1114 | 153 |
| Fixing | broad | 1056 | 279 |
| Board wipe | broad | 904 | 73 |
| Hand disruption | broad | 655 | 24 |
| Stax / tax | broad | 643 | 61 |
| Counterspell | broad | 520 | 70 |
| Graveyard hate | broad | 408 | 38 |
| Direct damage or life loss to opponents | mechanic | 2573 | 218 |
| +1/+1 counter maker | mechanic | 2491 | 278 |
| Lifegain | mechanic | 2468 | 251 |
| Token generator | mechanic | 1750 | 210 |
| Play from exile (impulse) | mechanic | 1674 | 167 |
| Anthem / team pump | mechanic | 1599 | 213 |
| Death trigger | mechanic | 1533 | 163 |
| Mana sink | mechanic | 1504 | 124 |
| Sacrifice outlet | mechanic | 1400 | 136 |
| Discard outlet | mechanic | 1242 | 91 |
| Counters payoff | mechanic | 1234 | 141 |
| Cast trigger | mechanic | 1157 | 120 |
| Graveyard payoff | mechanic | 1030 | 77 |
| Artifact payoff | mechanic | 1028 | 110 |
| Self-mill | mechanic | 986 | 123 |
| Copy / clone | mechanic | 918 | 69 |
| Tapper | mechanic | 652 | 32 |
| Steal / gain control | mechanic | 608 | 30 |
| Creature-enters payoff | mechanic | 589 | 103 |
| Spellslinger payoff | mechanic | 531 | 56 |
| Mill opponents | mechanic | 435 | 26 |
| Group hug | mechanic | 399 | 21 |
| Free cast / cheat into play | mechanic | 371 | 34 |
| Cost reducer | mechanic | 297 | 38 |
| Landfall | mechanic | 270 | 50 |
| Treasure generator | mechanic | 191 | 19 |
| Blink | mechanic | 181 | 17 |

| Measure | All Commander-legal cards | Your collection (user da7ccf96…) | Frequency report |
|---|---|---|---|
| Cards in scope | 32,643 | 2,878 (the 2,879th is not Commander-legal) | 32,643 / 2,878 |
| At least one Tag | 25,558 (78.3%) | 2,562 (89.0%) | 25,593 (78.4%) / 2,563 (89.1%) |
| No Tag | 7,085 | 316 | 7,050 / 315 |

The 32,643 matches the frequency report exactly (distinct oracle_id in `ref_printings` with `legality_commander = 'legal'`) [Confirmed: read-only query]. The only count that differs from the frequency report is Targeted removal: 4,873 here against 4,911 (see Challenges). Every other Tag matches to the card.

## Changed files
- `src/lib/card-tags.ts` — the one mapping of Scryfall tags to the 40 Tags (with sub-tags and exclusions), row building, dry-run report
- `src/lib/card-tags-fill.ts` — fill job logic with the database injected (batching, idempotent insert, run id, argument parsing)
- `scripts/fill-card-tags.ts` — the job: `--dry-run`, real run, `--undo-run`; hosted database (service role from `.env.local`) or a throwaway local Postgres
- `supabase/drafts/20261120100000_tags_fill_tag_tables.draft.sql` and `.rollback.sql` — the draft and its rollback (not applied)
- `docs/oracle/reports/evidence/roles-db/test_tags.sh`, `test_tags.out`, `README.md` — throwaway rehearsal and its output
- `src/lib/card-tags.test.ts`, `src/lib/card-tags-fill.test.ts` — 64 unit tests
- `docs/oracle/briefs/card-tags-and-deck-slot-why.md` — records the owner decision (section 9 and section 12 only)
- `docs/oracle/reports/2026-11-20-developer-tags-fill.md` — this report

## Commands for Gene
Run from the repo root after the branch is merged, after the owner approves and the draft is applied. The Scryfall copy (`data/scryfall-tags/`) is git-ignored and lives in the main repo folder; `.env.local` supplies the service role.

1. Dry run (reads only; prints counts per Tag and coverage):
`npx tsx scripts/fill-card-tags.ts --dry-run --user da7ccf96-2c73-431c-9d03-952463f82dcc`
2. Real run (writes about 50,473 rows in batches of 1,000; prints the run id; running it again adds nothing):
`npx tsx scripts/fill-card-tags.ts`
3. Undo one run (use the run id printed in step 2):
`npx tsx scripts/fill-card-tags.ts --undo-run <run-id>`

The real run refuses to write if the 40 Tags are not in the stored Tag list yet (draft not applied).

## New decisions made (need owner confirmation)
- Stable Tag keys (snake_case, for example `targeted_removal`, `stax_tax`) and table names `ref_tag_list` and `ref_card_tags`.
- A row keeps the run id of the run that FIRST wrote it; later runs do not overwrite it, so undoing a run removes only what that run added and a repeat run is a true no-op. A later AI row for the same card and Tag is a separate row (primary key includes source).

## Assumptions
- A card is Commander-legal if any printing in `ref_printings` has `legality_commander = 'legal'` (same as the frequency report).
- Cost reducer maps from `cost-reducer` only, as in section 5b of the report (the CSV note also lists `discount-self`, but its 297 count matches `cost-reducer` alone).
- Scryfall sub-tags count toward their parent, as in the frequency report.
- The existing `scryfall-category-mapping.ts` maps Scryfall tags to deck Categories, not to these Tags, so it was left alone; `card-tags.ts` is the only Scryfall-tag-to-Tag mapping.

## Challenges to locked decisions
- none. One deviation from the frequency report: Targeted removal is defined there as "removal minus sweepers, player burn, land removal" with 4,911 cards. I could not reproduce 4,911 from that wording. Excluding sweepers and land removal (with their sub-tags) gives 4,873. "Player burn" is not a sub-tag of removal in Scryfall's data, so there was nothing to subtract; cutting all `burn-player` cards would drop Targeted removal to about 3,800 and remove cards such as Lightning Bolt. I kept 4,873 (38 fewer than the report; overall coverage 35 cards lower). Owner or Architect to confirm, or give the exact rule behind 4,911.

## Open questions
- Confirm the Targeted removal rule above.
- Does Gene run the real fill before or after the Designer slice for Tag chips? Nothing depends on the order.

## Verification
- `npx vitest --run src/lib/card-tags` — 2 files, 64 tests passed (mapping for all 40 Tags from real Scryfall tag names, dropped and nested tags, sub-tags, exclusions, D-003 keys, idempotency, batching, undo of one run, dry-run shape, draft seed matches code, real-copy tag names exist).
- `./run.sh test_tags` (with `TAGS_LEGAL_FILE`, `TAGS_OWNER_FILE`, `TAGS_COPY_FILE`) — 26 PASS, 0 FAIL. Includes: draft and rollback, exact restore, earlier drafts still work with it applied, then the real fill job on the throwaway copy: dry run wrote nothing; real run wrote 50,473 rows; second run wrote 0 and the table was identical; `--undo-run` of run 2 removed 0, of run 1 removed 50,473 and left the table empty; all rows source "scryfall", only Commander-legal cards; a banned test card got none.
- `./run.sh test_chain` — 16 PASS, 0 FAIL; `./run.sh test_s5` — 34 PASS, 0 FAIL (rerun with the new draft present; their saved outputs were not changed).
- `npx tsx scripts/fill-card-tags.ts --dry-run --user da7ccf96-2c73-431c-9d03-952463f82dcc` against the hosted library: reads only, numbers above.
- `npx tsc --noEmit` — no errors outside the known AddToPicklist ones. `npx eslint` on the new files — clean.
- Full `npx vitest --run` — 1 failure: `ImportIntentFlow.test.tsx` ("Import disabled (save flag off)"). It fails the same way on main, so it is not from this change.
