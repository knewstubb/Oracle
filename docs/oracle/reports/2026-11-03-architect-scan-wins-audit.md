# Report: scan-wins audit
Role: Architect
Status: DONE
Task as received: “Repository: /Users/bradknewstubb/Developer/Personal/oracle_app. Owner has approved the scan-wins behavior text in docs/oracle/briefs/use-what-i-own.md §9 and says: ‘Lets move onto the build of the new card wins functionality’. Follow AGENTS.md and your role instructions. This is a Gate 2 READ-ONLY audit only: do not implement, do not edit schema/contracts/decisions, do not touch any hosted/live database. Create a separate worktree/branch from main so you do not disturb the owner's dirty proxy-chip changes in main. Write the required report to docs/oracle/reports/2026-11-03-architect-scan-wins-audit.md and commit only that report on your branch.

Bounded objective: audit the existing data model and import/sleeve flow for the approved scan-wins behavior. Read locked decisions, current schema/migrations, current import contract + implementation, and relevant APIs for deck_cards, user_copies and card allocation. Answer concretely:
1. Can an import move a physical copy currently allocated to another deck while leaving the source deck visibly short, using today's schema? Trace actual current writes/reads.
2. How can the user choose a source deck when multiple physical copies of that card exist in different decks? Identify a safe per-copy mapping, including printing/finish identity if relevant.
3. What should happen when the owner unticks a proposed move in the review list, based only on approved wording/current model; flag ambiguous behavior rather than deciding it.
4. Effect of Ignore basic lands ON by default: exact definition of basic land vs snow-covered/special lands, and how count/screen can be derived.
5. Any locked-decision conflicts, data migration requirement, risks to add-only import/repeat-import behavior, and recommended next Gate 3 design inputs.

The brief says: scan wins; before saving show ‘N cards moved from other decks’ and let owner untick any card; if multiple copies in multiple decks, select which deck to pull each copy from; unique source auto-selected; source deck keeps card as planned and is marked short; basic-land ignore toggle ON by default and counts omitted basic lands, while Snow-Covered and nonbasic lands remain visible. Do not widen scope beyond this.

Stop after the read-only audit/report. Do not start the UI design or implementation. State whether the current behavior is blocked on an owner decision, and name the exact question if so.”

## Summary for the owner
The data model can represent a moved card: the new deck gets the physical copy and the old deck keeps its card on the list without that copy, so it becomes short. The current import screen does not yet do this; the available move-saving path is behind a flag, and its current review logic blocks held copies instead of offering a move. Design/build is blocked until two behaviours are clarified: what unticking a move does, and whether Wastes is included in “Ignore basic lands.”

## Findings

### 1. Can a scanned import move a copy and leave the source short?

**The schema supports it; the current import experience does not yet offer it.**

- `deck_cards.copy_id` links a deck slot to one `user_copies.id`; `user_copies` stores the card identity, actual printing (`printing_id`, a Scryfall printing ID), finish, proxy status and storage location. A physical copy is therefore represented separately from its deck slot. The `copy_id` foreign key uses `ON DELETE SET NULL`; there is no unique database constraint enforcing one slot per copy, so the movement RPCs and advisory locks maintain that invariant. [Confirmed: `src/types/supabase.ts`; `supabase/migrations/20260730044951_rename_tables_prefix_convention.sql`; `supabase/migrations/20260730032938_rename_card_tables.sql`; `supabase/migrations/20260912150000_atomic_collection_movements.sql`]
- The repository contains `import_deck_with_intent`, whose `move` action clears `copy_id`, `ownership_status` and `placement_source` on the donor slot, inserts a slot in the imported deck linked to the same copy, and clears that copy’s storage location. The old donor `deck_cards` row is retained; no copy is deleted. This is one transaction. [Confirmed: `supabase/migrations/20261023160000_import_deck_with_intent.sql`]
- The donor slot has no persisted “short” flag: shortness is derived. The card-status reader treats a slot with no `copy_id` as planned/unresolved, and the deck summary counts planned and sleeved cards from those slots. The card remains visible, and the deck’s sleeved count/readiness falls. [Confirmed: `src/lib/card-status.ts`; `src/app/api/decks/[id]/card-statuses/route.ts`]
- A separate existing allocation route can force-claim a physical copy into an existing slot and leave the donor slot empty. It is not the ManaBox import review and does not provide the requested import check screen. [Confirmed: `src/app/api/allocation/claim-from-deck/route.ts`; `supabase/migrations/20260912150000_atomic_collection_movements.sql`]
- The ManaBox save path creates a new deck row and upserts `user_cards`, then makes its deck-slot/copy changes through an RPC. Its ordinary `replace_deck_with_new_cards` path creates new copies; it does not pull a held copy. The older `reconcile_built_deck` path explicitly takes only free storage copies, does not take from other decks, and deletes unmatched slots in its target deck, so it is not suitable for this scan-wins behavior. [Confirmed: `src/lib/manabox-deck-import.ts`; `supabase/migrations/20261020120000_deck_import_per_copy_attributes.sql`; `supabase/migrations/20260912180000_built_import_reconciliation.sql`]
- The current import-intent save is not an active scan-wins path. The screen only sends intent save fields when `NEXT_PUBLIC_IMPORT_INTENT_SAVE=true`; the UI blocks built/planned saves while it is off. More importantly, the current planner produces `share` for a held copy, and the server rejects `share` with `SharedCopyError`; it does not currently turn it into the `move` action in the SQL function. [Confirmed: `src/components/manabox-import/ManaBoxDeckImportFlow.tsx`; `src/components/manabox-import/import-copy.ts`; `src/lib/import-intent.ts`; `src/lib/import-intent-save.ts`]

**Hosted-state caution:** `docs/oracle/status.md` says the import migrations from `20261020120000` through `20261023170200` are not yet applied to the hosted database. The older `docs/oracle/contracts/import-intent.md` §7 says the M2 function was applied. These repository documents conflict; no hosted database was queried. Treat deployment of the existing function as unverified, and do not enable the flag based only on the older contract.

### 2. Choosing a source deck safely

The read-only ownership endpoint already groups held copies by **card identity, source deck, printing, finish and proxy/original**, returning a count for each group. It deliberately does not return database copy IDs. The source deck ID is therefore available for the requested choice, and identical copies can be represented as a count that is consumed once per imported copy. [Confirmed: `src/lib/import-ownership.ts`; `docs/oracle/contracts/import-intent.types.ts`]

For a safe per-copy review mapping, keep a choice for each imported row and copy index, and identify its candidate group with `(source deck ID, printing ID, finish, proxy/original)`. Show the printing and finish in the source option; `scryfall_id` identifies a printing, while finish is separate and is not encoded in that ID (D-003). At save, the server should re-resolve and lock a matching copy rather than trust a client-supplied copy ID. If multiple copies have the same group identity in one deck, they are indistinguishable for this choice; decrement that group’s available count once for each selected copy.

The existing planner does not yet meet this requirement: it deterministically chooses a held group and exposes the deck as `share`, not a selectable move. The existing SQL move descriptor includes source deck, printing and proxy status, but finish is only a preference in its ordering, not an exact filter. If the owner’s choice is meant to select a particular finish, the save-time match must also enforce that selected finish. [Confirmed: `src/lib/import-intent.ts`; `src/lib/import-intent-save.ts`; `supabase/migrations/20261023160000_import_deck_with_intent.sql`]

### 3. Unticking a proposed move

**Not settled by the approved wording.** It says the owner may untick a card, but does not state the resulting state of the imported deck’s slot. The existing `move_skipped` SQL action instead adds a *new* copy to the scanned deck, leaves the old copy in the source deck, and creates an alert. That is a distinct “keep both copies” outcome and should not be assumed to mean “untick.” [Confirmed: `supabase/migrations/20261023160000_import_deck_with_intent.sql`; `src/lib/import-intent-save.ts`]

**Owner question:** If you untick a proposed move, should the scanned deck keep that card as a planned/short slot while the source deck keeps its copy, or should the import add a separate new copy to the collection and leave the source deck unchanged?

### 4. “Ignore basic lands” definition and count

The current helper defines exactly 11 names as basic: Plains, Island, Swamp, Mountain, Forest, Wastes, and the five Snow-Covered versions. D-048 uses that same set for “convert to generic.” But the new brief explicitly says Snow-Covered lands remain visible. Reusing `isBasicLand()` unchanged would therefore hide cards the owner said should remain visible. [Confirmed: `src/lib/basic-lands.ts`; `docs/oracle/decisions.md` D-048]

For this move check, the text appears to distinguish the five regular basics from Snow-Covered basics; “nonbasic” should also remain visible. Wastes is the unresolved edge: it is included by the current helper and D-048, but the new wording does not say whether it is ignored or listed. Nonbasic lands with basic land types are not the same as basic-land cards and should remain visible under the approved wording.

The count can be derived from the parsed deck preview by summing **quantity**, not row count, for each name the final ignore rule covers. That gives the number of scanned copies omitted from the move check even when a printing/finish appears on multiple preview rows. Apply the same predicate before ownership matching, move choices and the “N cards moved” total; generic basics (no specific printing, no physical copy) must never be treated as physical moves. [Confirmed: `src/lib/manabox-import.ts`; `src/lib/basic-lands.ts`; `src/lib/manabox-deck-import.ts`]

**Owner question:** Should the default ignore set be only the five regular basics, with Snow-Covered basics and Wastes listed, or should Wastes also be ignored? The approved wording already excludes Snow-Covered basics from the ignore set.

### 5. Decisions, migration, import risks and Gate 3 inputs

- **Potential locked-decision conflict:** D-020 says imports do not automatically allocate existing copies; D-047 says existing copies are never pulled in automatically. The new owner-approved check screen and explicit move choice can make a transfer user-confirmed rather than silent, but the unique-source auto-selection and exact confirmation point need to be described consistently with those decisions. Gene should reconcile the register after owner approval; this audit does not edit it. [Confirmed: `docs/oracle/decisions.md` D-020, D-047; `docs/oracle/briefs/use-what-i-own.md` §9]
- **Basic-land decision scope:** D-023 makes basic-land matching fungible by name, while D-032 excludes generic basics from physical allocation and D-048 includes Snow-Covered basics and Wastes in its basic set. The scan toggle must be explicitly scoped to physical card moves and must not pull generic slots or silently change the existing generic-basic rules. [Confirmed: `docs/oracle/decisions.md` D-023, D-032, D-048]
- **Migration:** No new table or column is needed for the minimal move: the nullable slot-to-copy link and donor-slot clearing already exist. The repository has an atomic import move RPC, but migration/deployment status must be reconciled before using it. A new persisted move history or a different “short” flag would be additional scope and is not required by the current model. [Confirmed: `supabase/migrations/20261023160000_import_deck_with_intent.sql`; `docs/oracle/status.md`]
- **Add-only and repeat-import safety:** Keep the collection-import endpoint untouched: D-050 requires collection scans to append copies and importing the same collection file twice to add twice. The scan-wins action should move an existing copy, not insert another one. Deck imports currently create a fresh deck for each import; repeat imports are not idempotent and can create another deck, then move the same physical copy again from the earlier deck. The untick outcome could additionally create a duplicate copy if implemented as `move_skipped`. [Confirmed: `docs/oracle/decisions.md` D-050; `docs/oracle/contracts/manabox-import.md`; `src/lib/manabox-collection-import.ts`; `src/lib/manabox-deck-import.ts`]
- **Save boundary:** The copy/slot move is atomic inside the import RPC, but creation of the new deck and the `user_cards` upsert happen before that RPC. A failed or ambiguous save can therefore leave an empty deck or card identity rows even if the move itself rolls back. Preserve the existing guarded cleanup behaviour and cover this boundary in test-account testing. [Confirmed: `src/lib/manabox-deck-import.ts`; `src/lib/import-intent-save.ts`]
- **Gate 3 inputs:** Design only after the two owner questions above are answered. Then show the per-copy source deck and printing/finish, preselect only a unique candidate, make the move count update as cards are unticked, show the basic-land ignored count from scanned quantities, and show the source deck’s remaining planned/short slot. Keep “new copy” distinct from “move”; do not design additional collection or deck-management scope here.

## Changed files
- `docs/oracle/reports/2026-11-03-architect-scan-wins-audit.md` — this read-only audit.

## New decisions made (need owner confirmation)
- None. The report lists the two unresolved owner behaviour questions.

## Assumptions
- “Source deck” means the deck whose `deck_cards.copy_id` currently points to the physical copy.
- The hosted database was not checked; repository status and migration files are the only deployment evidence used.

## Challenges to locked decisions
- D-020 and D-047 — the approved scan-wins flow adds an explicit import-time move of an existing copy, unlike the older default rule. Reconcile how the confirmation/unique-source auto-selection fits; no decision changed here.
- D-023, D-032 and D-048 — the new ignore rule needs a narrower, named definition than the existing 11-name helper and must preserve generic-basic behavior. No decision changed here.

## Open questions
- When a proposed move is unticked, should the scanned deck slot remain planned/short, or should a new physical copy be added while the source remains unchanged?
- Is Wastes ignored by default, or shown in the move list?
- **Build status:** blocked until those owner behaviour questions are answered and the conflicting repository notes about M2 deployment are reconciled. The current import behaviour is not waiting for a single decision: its review logic presently does not support scan-wins moves.

## Verification
- Read-only inspection of the brief, locked decisions, feature process, status, import contracts, current implementation, migrations, and relevant allocation/status APIs.
- Confirmed isolated branch `audit/scan-wins-2026-11-03` was created from local `main` in a separate worktree. No implementation tests run; no source/schema/contracts/decisions edited; no hosted/live database accessed.
