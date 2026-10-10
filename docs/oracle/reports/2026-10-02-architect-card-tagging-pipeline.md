# Report: card-tagging-pipeline
Role: Architect
Status: DONE
Task as received: `@Gene Architect task, read-only design: propose a multi-label card tagging pipeline for the recommendation engine. (1) Extend docs/category-taxonomy.md into a mechanic-level tag vocabulary (multi-label per card) sufficient to distinguish the commander needs in the T-19 16-commander matrix (e.g. Prosper exile-cast vs Korvold sacrifice). (2) Map Scryfall Tagger oracle tags (otag:) onto that vocabulary and estimate coverage of the ~30k unique oracle_ids. (3) Specify a one-off backfill for uncovered cards using Anthropic Message Batches + Haiku with tool-use structured output (D-016 compliant), including cost estimate, storage schema keyed on oracle_id in Supabase, and a delta job for new sets. (4) Define an accuracy check against a hand-labelled sample of 100 cards. Jev is out of scope except as a noted future option for runtime deck-fit scoring. Output: docs/oracle/contracts/card-tagging-pipeline.md plus a report per AGENTS.md. No migrations or code.`

## Summary for the owner

The card vocabulary now distinguishes mechanics such as playing versus casting from exile, making versus spending Treasures, and sacrificing a permanent versus a creature dying. A first pass over Scryfall's dated public data found that the draft mapping matches useful tags on 58.3% of all snapshot identities and 64.3% of Commander-legal identities; this is coverage under an unreviewed draft map, not an accuracy score. The proposal includes the 20-commander multi-build set, revised cost range, and a 100-card sample with plain-English first-pass labels ready for owner correction. No Scryfall/Haiku comparison or paid model call has run.

## Changed files
- `docs/category-taxonomy.md` — added the proposed mechanic-level, multi-label vocabulary and commander distinction examples.
- `docs/oracle/contracts/card-tagging-pipeline.md` — defined Tagger mapping, approximate coverage, Haiku batch/backfill, cost, Supabase data contract, set delta, evaluation, recommendation boundary, and a 20-commander multi-build matrix.
- `docs/oracle/reports/2026-10-02-architect-card-tagging-sample-100.md` — listed the exact proposed 100-card sample, source snapshots, groups, and review steps.
- `docs/oracle/reports/2026-10-02-architect-card-tagging-review-sheet.csv` — created the owner confirmation worksheet with Scryfall links, rules text, and accept/edit/unsure fields.
- `docs/oracle/reports/2026-10-02-architect-card-tagging-first-pass.md` — drafted plain-English rules-based labels for all 100 cards, for owner confirmation.
- `docs/oracle/reports/2026-10-02-architect-card-tagging-pipeline.md` — task report and historical-matrix note.

## New decisions made (need owner confirmation)
- No product or implementation decisions made. The suggested tag vocabulary, coverage gates, cost range, storage tables, and accuracy thresholds are proposals for review.

## Assumptions
- Scryfall's dated snapshot has 38,705 Oracle identities, including 32,116 Commander-legal identities. The app's actual supported reference-card population still needs an exact count before a batch.
- Scryfall UUID→internal-tag mappings will be enumerated from the current Oracle Tags bulk file. No upstream UUIDs were guessed.
- Oracle's canonical identity catalog can provide/validate Scryfall `oracle_id`; an FK to `ref_cards.oracle_id` depends on confirming UUID type and uniqueness.
- Global card mechanics are shared reference data, not user-owned data, so the proposed tag tables omit `user_id` and use authenticated read/service-role write access.
- Haiku classification and the 100-card label set are future work requiring explicit approval; no model requests, API spend, migrations, or data writes were made.

## Challenges to locked decisions
- None. Design follows D-003 and D-016. Jev remains out of this pipeline and appears only as a possible later runtime fit-scoring option.

## Open questions
- The T-19 16-commander matrix is cited in status but its rows/artifact are not present in this checkout. At the owner's direction, the contract defines a new 20-commander evaluation set with multiple build variants; it should not be described as a reconstruction of the historical list.
- Confirm the exact current `ref_cards.oracle_id` type and uniqueness before defining its foreign key.
- Owner review is needed for proposed accuracy thresholds and any future API spend/backfill authorization.

## Verification
- Read `AGENTS.md`, `.paseo/agents/architect.md`, D-016/D-003, status, existing category taxonomy, the active taxonomy migration, and prior AI/tagging contracts.
- Searched repository docs/source for the referenced T-19 matrix and found its status reference but not its matrix artifact.
- Checked current Scryfall Tagger/Tags/Bulk Data and Anthropic Batch/Structured Outputs/Pricing documentation on 2026-10-02; links and estimates are recorded in the contract.
- Read `docs/deck-taxonomy.md`; selected 20 commanders across its archetype/theme axes and described multiple plausible builds for each.
- Downloaded and inspected Scryfall Oracle Cards and Oracle Tags bulk snapshots dated 2026-10-01; verified 32,116 distinct Commander-legal Oracle IDs in the card snapshot and assembled 100 distinct sample identities.
- Counted 38,705 total Oracle IDs, 36,041 with any Oracle Tag, 22,554 matching the provisional 329-slug draft functional map, and 20,663 matched among Commander-legal identities. Counts are a preliminary coverage join, not human-verified mapping accuracy.
- The sample list has assistant-drafted labels, but is not an owner-confirmed answer set. No Scryfall/Haiku comparison or paid Anthropic request was made.
- Checked the worksheet contains 100 distinct card identities, all 100 first-pass suggestions, and blank owner-confirmation fields. `git diff --check` passed.
- No migration, application code, data job, API request, or paid-model call was run.
- `git diff --check` — passed (no whitespace errors).
