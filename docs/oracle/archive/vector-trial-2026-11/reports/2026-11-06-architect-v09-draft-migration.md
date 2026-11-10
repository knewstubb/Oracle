# Report: architect-v09-draft-migration
Role: Architect
Status: DONE (drafts and contract text only; nothing applied, no database touched, nothing placed in supabase/migrations/)
Task as received: Slice V-09, DRAFT ONLY. Read AGENTS.md, your role files, docs/oracle/reports/2026-11-06-gene-signoff-next-slices.md (V-09 handoff and Gene's four sign-off conditions) and the signed contract (§2.2, §4A.2, §6). Draft the one forward trial migration plus a reverse script and generated-types plan, with the plain-language 'what changes, can it be undone, what could go wrong' note. Apply the contract fixes Gene required (stale text about ten migrations and hosted access: all ten are applied online per V-02; the owner confirmed pgvector is listed as available in the Supabase dashboard, install state unconfirmed). Put drafts in a clearly named drafts location, NOT in supabase/migrations/. Apply nothing. Write report docs/oracle/reports/2026-11-06-architect-v09-draft-migration.md in the standard format with a plain-language owner summary ending with a 'For Brad (plain words)' line.

## Summary for the owner
The one storage change for the trial is written up and ready for you to read, but nothing has been applied. It adds a few new, separate storage areas for card-similarity and combo information, and does not touch your cards, decks or anything the app uses today. One prepared undo step removes them again. You will be asked for approval (A3) before anything is applied, and it gets practised on a throwaway copy first.

For Brad (plain words): The storage change is drafted and not applied; it only adds new trial-only areas, it can be removed with one prepared step, and I need nothing from you until Gene asks for your A3 yes.

### What changes, can it be undone, what could go wrong (plain language)

**What changes.** Four new things are added to the online database, all for the trial only: (1) a place to store a "fingerprint" of each card's rules text so similar cards can be found; (2) a place to store combo lists from Commander Spellbook, in two parts (the combos, and the cards in each combo); (3) a "find similar cards" lookup that only reads. The database's similar-card capability (called pgvector) is switched on if it is not already. Example: for a Wilhelt build, the lookup could return the 200 cards whose text looks most like what that build wants, limited to legal cards in Wilhelt's colours. These areas hold only public card information. Your collection, decks, imports and every existing screen are not touched, and the app does not read the new areas.

**Can it be undone.** Yes. One prepared undo step removes exactly those four things and nothing else. Everything inside them can be re-created (the fingerprints can be made again; the combo lists can be downloaded again). The one thing the undo leaves behind is the switched-on similar-card capability, which is harmless when unused; removing that would need its own approval. Undoing is a deletion, so it is only run when you approve it at that time.

**What could go wrong.**
- *The similar-card capability is not available online.* The owner sees it listed as available but we have not confirmed it is switched on. If it is not available at all, the change stops at the very first step with a plain message and changes nothing. If it is available but off, the change switches it on. If it is unavailable, the fallback is a throwaway copy on your computer, which needs extra software installed (V-02 §5), or pausing the trial.
- *The change half-applies.* It runs as a single all-or-nothing step, so a failure leaves the database as it was.
- *Name clash.* The new names all end in "trial" and none exist today, so a clash is very unlikely; if one existed the step stops.
- *A slow lookup.* With about 18,850 card entries a full search should be quick, but this is measured later (V-14), not assumed. If slow, that is reported and is a separate decision.
- *Switching on the capability online is hard to fully reverse* (hence it is left installed on undo). It is a standard Supabase feature and is low risk.
- *Practice first.* V-10 rehearses the change and the undo on a throwaway database before touching the real one.

## Changed files
- docs/oracle/contracts/drafts/vector-trial/20261106120000_vector_trial_tables.sql — DRAFT forward migration (extension guard + extension, 3 tables, 1 function, RLS, comments); not in supabase/migrations/
- docs/oracle/contracts/drafts/vector-trial/20261106120000_vector_trial_tables.reverse.sql — DRAFT reverse script; drops only the 3 trial tables and 1 function, no CASCADE, leaves the extension
- docs/oracle/contracts/drafts/vector-trial/generated-types-plan.md — plan for regenerating `src/types/supabase.ts` after (and only after) V-10 applies; no types generated now
- docs/oracle/contracts/vector-trial-2026-11.md — stale text fixed in header (new Update 5 note and evidence line), §1.1 (migration backlog, pgvector rows), §1.5 (ordering rule, Option 1, pgvector bullet), §2.2 (function signature), §6 (ordering line, pointer to reverse script), §7 (hosted-setup risk row). No design change.
- docs/oracle/reports/2026-11-06-architect-v09-draft-migration.md — this report

(The "one forward migration" holds the extension, three tables and the function in a single file, as the task asked; the "four objects" in the undo are the three tables plus the function, the extension is deliberately excluded.)

## Technical detail (for Developer/Tester/Gene)
- **Filename and ordering.** `20261106120000_vector_trial_tables.sql`; highest existing is `20261023170200`, applied online, and no file sorts after it [Confirmed: docs/oracle/reports/2026-11-06-architect-v02-kickoff-checks.md §4; supabase/migrations listing]. V-10 re-checks at copy time.
- **Keys.** Embeddings: PK `(oracle_id, face_index, embedded_text_version)`; no FKs (ref_printings.oracle_id is not unique) [Confirmed: contract §2.2]. Variants: PK `variant_id`. Pieces: PK `(variant_id, oracle_id)`, FK to variants `on delete cascade` (within trial tables only).
- **Unique/indexes.** GIN on `tags` (only §5.5 needs it); btree on `ref_combo_pieces_trial(oracle_id)` ("combos containing this card"); no vector index (C5, exact scan). The function's legality/colour filter uses an `exists` against `ref_printings` by `oracle_id`, which has an existing index [Confirmed: contract §1.1].
- **Identifiers.** Every identifier column is `oracle_id` (D-003), stated in column comments; names are display-only.
- **RLS.** On for all three tables. Select for `authenticated`; write policy `auth.role() = 'service_role'`, mirroring `ref_rulings` [Confirmed: supabase/migrations/20260731011347_add_ref_rulings.sql] but with read limited to signed-in users as the contract §2.2 says (ref_rulings allows anyone). No `user_id` by deliberate exception (shared public reference data).
- **Atomicity.** Supabase runs a migration file as one transaction, so it is all-or-nothing. The pg_available_extensions guard gives a readable failure. Load-time writes (embeddings, combos) are atomic per batch/variant and idempotent per contract §2.2/§4A.2; no truncate or delete-all.
- **Function.** `ref_similar_cards_trial(p_identity, p_version, p_seed_oracle_ids, p_seed_vector, p_exclude_oracle_ids, p_k)`: SECURITY INVOKER, STABLE, `search_path = public, extensions`, execute revoked from public/anon, granted to authenticated and service_role. Read-only, reads no user table. Returns the best face per card. Plain `avg()` of seed vectors is fine because cosine distance ignores length.
- **Reverse.** Drops function, then pieces, variants, embeddings, in one transaction, no CASCADE (fails rather than removing unexpected dependants). Extension kept. Also needs `supabase migration repair --status reverted 20261106120000` to align history (separate step).
- **Generated types.** See the plan file: regenerate only after V-10, review the diff (additions only), `vector` columns come out as `string`.
- **Not run.** The SQL has not been executed anywhere, so it is syntactically unverified. V-10's rehearsal is the first execution. Points most likely to need adjustment there: `avg(vector)` support (needs pgvector 0.5.0 or later; Supabase on Postgres 17 ships newer [Approximate]), and `distinct on` with the distance expression.

## New decisions made (need owner confirmation)
- Function signature differs slightly from the contract sketch: added `p_version` (which recipe arm to search) and `p_seed_vector` (so the §5.6 blended seed can be passed in). Contract §2.2 updated. Gene to confirm; no owner-visible effect.
- Embeddings read access is limited to signed-in users (as contract §2.2), not everyone as for `ref_rulings`.
- The reverse script leaves the extension installed.
- Added a `check` constraint limiting recipe arm names to `v2-base` / `v2-tagged`; a third arm would need a new migration.

## Assumptions
- The owner's statement that pgvector is "listed as available" is taken as given; it is not independently verified (V-02 could not read the extension list). Installed state is unknown and the migration handles both cases.
- Supabase's `extensions` schema exists on this project (the Supabase default) [Approximate].
- No file newer than `20261023170200` is on main by apply time.

## Challenges to locked decisions
- none (D-001 tables untouched; D-003 respected; D-007 read-only function)

## Open questions
- Is pgvector installed online? Gene's Q2 remains open for the install state; it does not block approval of the draft.
- Gene: confirm the two signature additions above.
- T-57's migration (`20261013120000`) is unrelated and unresolved (Gene's open item); the trial migration must not be pushed together with it.

## Verification
- Read AGENTS.md, the Architect base and project files, Gene's sign-off report, contract §1.1, §1.5, §2.2, §4, §4A.2, §6, V-02 report §4, ref_rulings migration for RLS pattern, `ref_printings` column types in src/types/supabase.ts — done.
- `grep` on the contract for stale phrases ("waiting", "ten import", "no access to the hosted") — remaining hits are dated history lines or the corrected text only.
- No SQL executed, no database connection, nothing copied into supabase/migrations/ (the drafts folder is `docs/oracle/contracts/drafts/vector-trial/`).
- `npm run check` not run (no code changed).

## Addendum (2026-11-06, Gene's required change)
Gene's review asked for the "drop policy if exists" lines to go. Done in the draft SQL: all six removed (Gene's note said five; there are six policies), each policy is now a plain create, so a name clash fails the migration instead of dropping anything. The header note now says this, says to apply by running that file only (never a blanket push, because T-57's migration sorts earlier), and says a second model needs a new migration. Nothing else changed; nothing applied.
- Verification: grep for "drop policy" in the drafts folder returns no matches; six "create policy" statements remain. SQL not executed.
- Changed file: docs/oracle/contracts/drafts/vector-trial/20261106120000_vector_trial_tables.sql
- For Brad (plain words): the storage draft is now strictly add-only; if anything with the same name already exists, it stops with an error rather than removing it.
