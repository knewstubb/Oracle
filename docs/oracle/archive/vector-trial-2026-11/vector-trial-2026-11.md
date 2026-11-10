# Contract: vector-based card recommendations, small reversible trial (DRAFT)

> **Status: SIGNED by Gene, 2026-11-06.** Changes C1-C10 of `docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md` §2 are resolved; the brief `vector-recommendation-trial.md` was approved by the owner at Gate 1 on 2026-11-04. Sign-off conditions (Gene; Architect applies them in V-04/V-09, no re-sign needed) are in `docs/oracle/reports/2026-11-06-gene-signoff-next-slices.md` §2; in short: (a) facts in §1.1, §1.5 and the header about the ten waiting migrations and about hosted access are superseded by the V-02 report (all ten are applied; pgvector online unverified); (b) A1 does not cover running the sync, that needs owner approval A2; (c) the sync's non-atomic delete-then-insert is settled in V-05. Signing authorises slices V-04, V-05 and V-09 only; **no migration, extension install, model download, data write or sync is authorised by this signature** (each stays behind its own owner approval).
>
> *(Earlier draft status, kept for history: DRAFT, returned for Gene sign-off (V-01, 2026-11-06).)* `docs/oracle/process.md` Gate 1 requires an owner-approved brief in `docs/oracle/briefs/` before design or build. Nothing here authorises a migration, an extension install, a paid model call or any data write. The SQL below is a sketch inside a document, not a migration file.
>
> Author: Architect · Date: 2026-11-04 · Builds on: `ai-recommendations-assessment-2026-09.md` (T-19, §4.5 option C, gap G1, §8) and `card-tagging-pipeline.md`.
> **Update 2026-11-04 (owner-approved additions, still DRAFT, still nothing built):** exact embedded text per face and an optional Scryfall Tagger tag arm (§2.3, §2.4, new column `tags`); new evaluation checks for multi-feature and deck-dependent cards (§5.5, §5.6); a new section on additional data that could improve results (§5A). The Tagger-tag finding in the owner's probe is **partly contradicted by the live Scryfall manifest**, see §2.4.1.
>
> **Update 2 2026-11-04 (owner decisions, still DRAFT, no approved brief, nothing built, report status PARTIAL):** (1) **Commander Spellbook combos are in scope from day one** as a third signal beside vectors and EDHREC (new §4A, combo arm in the fusion, new check §5.7, new gates in §5.4). (2) **Recommendations are computed per build (archetype) of a commander**, not only per commander (new §4B, per-build EDHREC scores, per-build grading, new check §5.8). Success criteria (§5.4), grading effort (§5.2), rollback (§6), risks (§7) and the additional-data table (§5A) are updated. Two findings the owner did not ask for: the existing Spellbook client reads the wrong field and sorts the wrong way (§4A.1), and the stored build card lists keep only the top 100 cards per build (§4B.1).
>
> **Update 3 2026-11-04 (owner decisions, all final; still DRAFT, no approved brief, nothing built, report status PARTIAL):** (a) the trial commanders are now **Mendicant Core, Guidelight** (colours W/U) and **Wilhelt, the Rotcleaver** (colours U/B), each the other's contrast commander; Prosper and Korvold are gone from this contract. The candidate pool is now W/U/B (§2.1). (b) Per-build design stays; lists are **W1** and **W2** (two Wilhelt builds) and **M1** (Mendicant's top build); grading effort stays about 2 hours (§5.2). (c) The infinite-combo "ask before suggesting" rule applies to any combo-labelled card that is a piece of an infinite combo; combo labels must be switchable off per deck; the "Commander Spellbook" credit on labels is fine (§4A.5, §4A.6). If builds were never synced, **sync them first and treat that as blocking per-build work** (§1.3). Combo, pool and build numbers were recomputed for the new commanders; one earlier pool estimate was wrong and is corrected (§2.1).
>
> **Update 4 2026-11-06 (slice V-01, Gene's changes C1-C10 from `docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md` §2; still DRAFT, nothing built or run):** C1 new §1.4 (linked from §1.3 and §6; build sync deletes and re-inserts the card list of each build it touches); C2 §1.4 (sync filters and dry run required first); C3 §4B.2, §5.2, §5.6 (graded lists use the no-deck seed); C4 §5.6 and §1.4 (fixtures are the owner's two Archidekt decks, fixed rule); C5 §2.2, §7 (HNSW index dropped, exact scan, ~18,850 rows); C6 §1.1, new §1.5 "Where the trial runs", §6 (ordering after the ten waiting migrations); C7 §5.2 (assistant pre-grading rules); C8 new §5.9 (freeze); C9 §9 (slice list replaces handoffs); C10 §5A (Archidekt scope). Owner approval A1 (builds for Zombies, Aristocrats, Artifacts; the two Archidekt decks usable as read-only test lists) is recorded in §1.3 and §5.6.
>
> **Update 6 2026-11-06 (V-04b and V-06c, Architect; Gene signs after reading, no owner decision needed):** (a) V-06c, §4B.2 (and §1.3 builds row, §4B.1 note, §7 and §5A references): the build seed no longer uses `is_signature`; it uses the top 8 stored cards by synergy, with a fixed deterministic rule and a "fewer than 5 qualify" fallback. Reason: V-06 found 33 to 41 of 50 stored cards per build flagged `is_signature`. (b) V-04b, §5.2 rule 5, §5.4 gate 4 and stop rule, §5.8: trap and contrast cards are sealed; gates that use traps are computed on the unexposed traps first and the exposed ones are reported beside them. The owner had been told which cards were traps (recorded exposure).
>
> **Gene sign-off of Update 6, 2026-11-06:** SIGNED (V-06c seed rule and V-04b sealed-key wording). Follow-ups are decided in `docs/oracle/reports/2026-11-06-gene-signoff-amendment.md` and carried out in V-04d: contrast picks are scored on the trial's own rankings (not on membership of the stored build lists), one weak trap is swapped, one low-confidence exposed trap is scored separately. No owner decision needed.
>
> **Update 5 2026-11-06 (slice V-09, Gene's condition (a)):** stale facts corrected in this header, §1.1, §1.5, §2.2, §6 and §7. All ten import migrations are applied on the hosted database (V-02 §4: `supabase migration list --linked`, last version 20261023170200), so nothing waits ahead of the trial migration. Hosted *read* access exists for SELECT checks (V-02). pgvector: the owner confirmed it is **listed as available** in the Supabase dashboard; whether it is **installed (enabled)** is unconfirmed. The migration draft is in `docs/oracle/contracts/drafts/vector-trial/` (not in `supabase/migrations/`; nothing applied). §2.2 function signature gained `p_version` and `p_seed_vector`.
>
> Evidence tags: `[Confirmed: path]` read in the repo this task; `[Approximate]` inferred or from general knowledge, not proven here. The original task (2026-11-04) had no access to the hosted database; where this document says "unverified for the hosted database" for builds, V-02 (2026-11-06) is the current source: all 1,885 builds hold 0 cards online.

---

## 0. Position in one paragraph

The T-19 assessment ranked "fix the current architecture" (option A) first and embeddings plus a trained ranker (option C) as a later add-on. This contract does **not** reverse that. It defines a **bounded experiment** that answers one question: *for Mendicant Core, Guidelight and Wilhelt, the Rotcleaver (each the other's contrast), does "find cards whose rules text is similar in meaning", blended with EDHREC data **and Commander Spellbook combo data, per build of the commander**, surface good cards that EDHREC's popularity list misses?* It is read-only against user data, adds one new global table, has no UI, and can be switched off or removed without touching any locked table.

**Recommendation:** proceed to a brief (Gate 1), then run the trial with a **partial data fix** (§1.3), not the full G1 fix. Do not ship anything user-facing from the trial.

---

## 1. Prerequisites and data readiness

### 1.1 What exists (verified)

| Need | Current state | Evidence |
|---|---|---|
| Rules text per card | `ref_cards.oracle_text`, `type_line`, `keywords[]`, `color_identity`, `commander_legal`. **Keyed by `name`; no `oracle_id` column in the generated row type** | [Confirmed: src/types/supabase.ts] |
| `oracle_id` ↔ name | `ref_printings` has `oracle_id`, `name`, `layout`, `legality_commander`, `color_identity[]`, indexed on `oracle_id`, `name` and `legality_commander = 'legal'` | [Confirmed: src/types/supabase.ts; supabase/migrations/20260730044951_rename_tables_prefix_convention.sql] |
| Card faces | **Absent as structure.** `ref_printings.layout` tells us a card is multi-faced; face text is not stored in Supabase | [Confirmed: src/types/supabase.ts] |
| Face text source | Local `data/AllPrintings.sqlite` exists; its face columns are not inspected here | [Confirmed: data/ listing] [Approximate for schema]. Scryfall's Oracle Cards bulk file is the authoritative alternative [Approximate] |
| EDHREC per-commander data | `ref_commander_builds` (PK `id`, unique `(commander_id, edhrec_theme_slug)`), `ref_build_cards` (PK `id`, unique `(build_id, card_name)`; columns `inclusion_rate`, `synergy_score`, `deck_count`, `position`, `category`). **Card identity is `card_name` only** | [Confirmed: supabase/migrations/20260806000000_create_commander_builds.sql; src/types/supabase.ts] |
| Commander identity | `ref_commanders` (`color_identity` string, `legal_commander`, `leadership_type`, `scryfall_id`) | [Confirmed: src/types/supabase.ts] |
| Ownership | `user_copies` (with `is_proxy`); current recommend route reads it with `is_proxy = false` | [Confirmed: src/app/api/ai/recommend/route.ts L57-62] |
| Reference-table security pattern | RLS on, read for everyone, writes service-role only | [Confirmed: supabase/migrations/20260731011347_add_ref_rulings.sql; 20260806000000_create_commander_builds.sql] |
| pgvector | **Not used by the repo** (no `create extension` and no "vector" in `supabase/`, `src/`, `scripts/`, `package.json`). **Online: listed as available in the Supabase dashboard (owner, 2026-11-06); installed/enabled state unconfirmed.** The draft migration enables it if needed and stops with a plain message if it is not available | [Confirmed: repository search]; owner report via Gene (not independently verified; V-02 could not read `pg_available_extensions`) |
| Stale references | `mtg_cards` was renamed `ref_cards` on 2026-07-30; two live files still query `mtg_cards` | [Confirmed: supabase/migrations/20260730044951_rename_tables_prefix_convention.sql; src/app/api/brew/skeleton/route.ts L273; src/lib/tool-registry.ts L1660, L1671] |
| Legality freshness | Stored per printing; no freshness timestamp | [Confirmed: src/types/supabase.ts] (assessment §2 agrees [Approximate]) |
| Evaluation set | None for recommendations. The tagging pipeline proposes a 100-card tag sample, not yet labelled | [Confirmed: card-tagging-pipeline.md §8] |
| Migration backlog | **None ahead of the trial.** All ten import migrations (20261020120000 to 20261023170200) are applied on the hosted DB; the last hosted version is 20261023170200 and no local file sorts after it. The trial migration takes the next number (draft: 20261106120000). Separate, not part of the trial: T-57's migration `20261013120000` is not applied and sits only on branch `t57-deck-import-foil` | [Confirmed: docs/oracle/reports/2026-11-06-architect-v02-kickoff-checks.md §4, `supabase migration list --linked`] |
| Commander Spellbook client | `findCombosForCard(cardName, {colorIdentity, limit})`: one call to `/variants?q=card="<name>" ci:<identity>&limit=<n>&ordering=popularity`, header `User-Agent: TheOracle/0.1.0`, no auth, no retry, no 429 handling, no pagination, default limit 10. Returns `cards` as **names only** (no `oracle_id`), `produces`, `description`, `identity`, `cardCount`. Used only by the AI chat tool | [Confirmed: src/lib/spellbook-client.ts; src/lib/tool-registry.ts L19, L231-260] |
| Spellbook client defects (live API probed 2026-11-04) | (a) The live response nests each piece as `uses[].card.name` (and `uses[].card.oracleId`); the client reads `uses[].name`, so `cards` comes back as undefined entries. (b) `ordering=popularity` sorts **ascending**: in the first probe the first three results (for a different commander) all had popularity 0; `ordering=-popularity` returned 7898, 4727, 4499. Neither is a trial blocker (the trial uses the bulk file, §4A.1) but the client is **not reusable as is** | [Confirmed: live request to backend.commanderspellbook.com; src/lib/spellbook-client.ts L56-L81] |
| `deck_combos` | One row per deck: `deck_id` PK (FK to `decks`, cascade), `content` TEXT (a cached JSON blob), `user_id`, `generated_at`. Per-deck, user-owned, not queryable by card. **Not suitable** as the combo reference store | [Confirmed: src/types/supabase.ts; supabase/reconciliation/pre-ledger/outer-migrations/001_initial_schema.sql L296-303; src/app/api/decks/[id]/combos/route.ts (read-only cache)] |
| Commander builds (schema) | `ref_commander_builds`: PK `id` uuid, FK `commander_id` to `ref_commanders(id)`, unique `(commander_id, edhrec_theme_slug)`, `archetype`/`theme` plus (later migration) `primary_archetype`, `secondary_archetypes[]`, `primary_theme`, `secondary_themes[]`, `tribe`, `deck_count`, `deck_percentage`, deck-structure averages. `ref_build_cards`: PK `id`, FK `build_id` (cascade), unique `(build_id, card_name)`, `synergy_score`, `inclusion_rate`, `deck_count`, `category`, `is_staple`, `is_signature`, `position`. `decks.build_id` (nullable FK) links a user deck to a build. Read-only RLS for authenticated users | [Confirmed: supabase/migrations/20260806000000_create_commander_builds.sql; 20260806120000_builds_multi_archetype.sql] |
| Commander builds (sync) | `scripts/sync-edhrec-builds.ts` writes `ref_build_cards` as the **top 100 cards by inclusion rate per build**; `is_staple` = inclusion > 0.5; `is_signature` = synergy > 0.15 and inclusion > 0.4; a missing synergy is stored as **0** (`card.synergy \|\| 0`), so "no data" and "zero" look the same | [Confirmed: scripts/sync-edhrec-builds.ts L9, L405-428] |
| Commander builds (data actually synced) | **Unverified for the hosted database** (no database access in this task); it stays a kickoff gate (§1.3, row "Builds"). Indirect evidence from repo files and a public check: **Wilhelt** had four builds at the 2026-08-06 sync (Zombies 4,024 decks, Aristocrats 1,013, Reanimator 816, Combo 680); the dedup plan merged Reanimator and Combo into Aristocrats, and the local commander-context export (taken 2026-09-12 from the hosted tables, 1,885 builds, 50 cards stored per build) holds **Zombies and Aristocrats for Wilhelt (50 cards each, 39 and 41 of them signature cards) and neither of the other two**. **Mendicant:** no build for it can be identified in the export (the export carries no commander column; Mendicant appears only as a card inside other commanders' builds) and it is absent from the August build-similarity and dedup files, which only list commanders with two or more builds. EDHREC's public page today shows 17,570 decks and one theme above the sync's 2% cut-off (Artifacts, about 10%; the next, Tokens, about 1.9%). So the expectation is **Wilhelt: 2 builds present; Mendicant: 1 build (Artifacts) if it was synced at all**. This is an expectation, not a finding | [Approximate]; [Confirmed: research/edhrec-sync/build-similarity.json, dedup-completed.txt, data/commander-context/manifest.json and its build_cards table]; EDHREC figures from a live public request 2026-11-04 | 

### 1.2 Gaps that matter for the trial

1. **No `oracle_id` on card text or EDHREC rows** (the heart of G1). Embeddings must be keyed by `oracle_id` (D-003); EDHREC rows must be joined to it.
2. **No face structure.** A modal or transform card has two texts. One blended vector would mix a land face with a spell face.
3. **Legality of unknown age.** Dockside Extortionist, Mana Crypt and Jeweled Lotus are banned now (assessment §3) and would be suggested if stored legality is stale.
4. **No judged examples**, so "better" cannot be measured.
5. Stale `mtg_cards` code paths. They do **not** block the trial if the trial never calls them (§1.3).

### 1.3 Can the trial proceed with a partial fix? **Yes, for the trial only.**

Partial fix, all done **outside the production recommendation paths and without changing existing tables**:

| Gap | Partial fix for the trial | Not done in the trial |
|---|---|---|
| `oracle_id` keying | Build a name → `oracle_id` map from `ref_printings` (distinct `name`, `oracle_id`). Join `ref_build_cards.card_name` to it at query time. Report every unmatched name; **never guess**. Pass gate: ≥ 99% of the trial pool resolves; unresolved names are listed and excluded | No `oracle_id` column added to `ref_cards` or `ref_build_cards` |
| Faces | Load face-level text for the trial pool from Scryfall's Oracle Cards bulk file (or `AllPrintings.sqlite` after a schema check). One embedding row per face | No permanent face tables |
| Legality | At load time, check each pool card against the **same dated Scryfall bulk snapshot** used for face text; record the snapshot date in the evaluation report. At query time filter with `ref_printings.legality_commander`. The evaluation re-checks every shown card against that snapshot (hard gate, §5.4) | No freshness column, no cron |
| Combos | Load Spellbook's published bulk file (§4A.1) into a new reference table keyed by `oracle_id` (§4A.2). Pieces carry Spellbook's own `oracleId`, so no name matching is needed; every piece is still checked against `ref_printings` (exists, legal, in identity). Pass gate: 100% of pieces of every combo that can be labelled resolve, otherwise that combo is dropped and listed | No change to `deck_combos`; no live API calls at query time |
| Builds | Kickoff check (read-only counts): Wilhelt has at least 2 builds and Mendicant at least 1, each with at least 50 cards and at least 5 cards meeting the seed rule of §4B.2 (synergy above 0, resolves to one `oracle_id`, Commander-legal, inside the commander's colour identity, not the commander); the commander's `oracle_id` (Mendicant `b20d74a4-0e08-4779-972a-499f1a2be15a`, Wilhelt `eada96a1-4964-4ad0-b0e3-2df08d6ae188`, both confirmed against Scryfall 2026-11-04) is found through `ref_commanders.scryfall_id` → `ref_printings.oracle_id` (the printing id is used only to look up, never stored as identity, D-003). **If builds were never synced for either commander, the plan is: sync first, as a separate owner-approved task, and treat it as blocking all per-build work** (lists W1, W2, M1, §4B, §5.8); nothing per-build is simulated or substituted. **The sync deletes and re-inserts the card list of each build it touches and cannot yet be scoped to named builds: see §1.4 (C1, C2).** While it is pending, only the commander-level and combo parts of the trial may proceed (the §5.8 build check is then not run) | The trial itself does not re-sync EDHREC; no `oracle_id` column added to build tables |
| Stale `mtg_cards` | Not touched. The trial reads `ref_printings`, `ref_commanders`, `ref_build_cards`, `user_copies` only | Fixing the two stale files stays a separate task |

**Must be finished before any production use (out of trial scope):** `oracle_id`-keyed face-aware card facts (G1 proper), the unified tag vocabulary and parser (G2, `card-tagging-pipeline.md`), legality freshness, and the stale `mtg_cards` fixes.

### 1.4 The build sync: what it really does, and what must exist before it runs (C1, C2)

- **It deletes and re-inserts (C1).** For each build it processes, the script **deletes that build's stored card list and inserts it again**, and upserts the build row itself [Confirmed: scripts/sync-edhrec-builds.ts L594]. The earlier statement that it "only adds or updates `ref_*` rows (no delete)" was wrong and is withdrawn everywhere in this contract. Delete-then-insert per build is **not atomic** as written (a failure between the two statements leaves that build with no cards) [Approximate: statements are separate calls at L594 and the insert after it; V-05 confirms]. Consequence: under AGENTS rule 5 the step must be **named and owner-approved**, and its reach limited to the builds named below. **Owner approval A1 covers building Zombies and Aristocrats (Wilhelt) and Artifacts (Mendicant), and nothing else.** A failed run is recoverable by re-running the same filtered sync for the same named builds (the data comes from EDHREC, so it is reproducible); the pre-sync baseline counts (V-02) show what was there.
- **It cannot be scoped today (C2).** Its only options are `--dry-run`, `--limit`, `--offset` and `--min-decks` (default 300) [Confirmed: scripts/sync-edhrec-builds.ts L51-58]. It processes every legal commander with at least that many decks [Confirmed: scripts/sync-edhrec-builds.ts L876-L889] and recreates every theme at or above 2% of decks [Confirmed: scripts/sync-edhrec-builds.ts L47, L301]. Run as is, it would re-sync the whole database and would also create themes the trial does not want (Wilhelt has five themes on EDHREC today, not two [Approximate: public EDHREC page, per Gene's plan 2026-11-04]).
- **Required before any run against the hosted database:**
  1. A small Developer change (slice V-05) adding a **commander filter** and a **theme filter**, allowing only `zombies`, `aristocrats` and `artifacts` for the two trial commanders. No other behaviour changes.
  2. A **dry run first** with the existing `--dry-run`.
  3. A **dry-run report** listing exactly which build rows and card-list rows would be **added** and which **replaced** (with current row counts for the replaced ones). The owner sees this before the real run.
  4. After the run (V-07), table counts are compared with the V-02 baseline; any row outside the named builds that changed is a failure and is reported.

### 1.5 Where the trial runs, and in what order (C6)

**Ordering rule (corrected 2026-11-06, V-09).** The trial migration (pgvector extension, embeddings table, similar-cards function, combo tables) must sort after every migration already applied online. **All ten import migrations are already applied** (V-02 §4), the last being 20261023170200, so the rule is satisfied: the draft is `20261106120000_vector_trial_tables.sql`. V-10 re-checks at copy time that nothing newer has been merged and renumbers if so. T-57's migration (`20261013120000`, unapplied, sorts earlier) is unrelated and must not be pushed as part of the trial [Confirmed: V-02 §4].

**Option 1 (as drafted, recommended): the online database.** The owner sees nothing different in the app. Nothing waits ahead of it. Trade-off: it adds new tables and a function (not touching existing ones) to the live database, and needs pgvector enabled online.

**Option 2: a throwaway local copy.** The trial's tables are created in a disposable local database so the online database is never changed. The owner sees nothing different in the app. Trade-off: the build data and `ref_printings` must be copied in, and a local copy would not test that the extension works online.
- **Feasibility (Architect statement):** feasible in principle, because the trial reads only `ref_printings`, `ref_commanders`, `ref_build_cards` and `ref_commander_builds` and writes only to its own new tables [Confirmed: §1.3, this contract]; those reads can be exported to a local database that has pgvector. It needs a local Postgres with pgvector, which is **not verified to exist on the owner's machine** [Approximate]. It would also need the build sync to run against the throwaway copy rather than the online one, which makes the sync filters of §1.4 even more important, and means the **real** build data for the trial would then exist only locally.
- **The pgvector check result.** V-02 could not read it. The owner reports that pgvector is **listed as available** in the Supabase dashboard (2026-11-06); **whether it is installed is unconfirmed**. Available-but-not-enabled is acceptable: the migration enables it, and stops with a plain message, changing nothing, if it is not available. A local copy additionally needs Docker or a Homebrew Postgres, none present on this machine (V-02 §5). The choice between the options is the owner's, at A3.

Which option is used does not change the evaluation, only where the tables live.

---

## 2. Trial scope and storage design

### 2.1 Scope

- **Commanders (owner decision, final):** **Mendicant Core, Guidelight** (white/blue; legendary artifact creature, Commander-legal) and **Wilhelt, the Rotcleaver** (blue/black; legendary creature, Commander-legal), the commanders the owner knows well. Each is the other's contrast commander; neither is "primary". Names, `oracle_id`s and colour identities were read from Scryfall on 2026-11-04 [Confirmed: live Scryfall request]: Mendicant `b20d74a4-0e08-4779-972a-499f1a2be15a` (colour identity W, U), Wilhelt `eada96a1-4964-4ad0-b0e3-2df08d6ae188` (colour identity U, B). Both names match the repo's spelling [Confirmed: research/edhrec-sync/build-similarity.json; data/oracle.db decks "Arti-facts" and "A Rot to Process"]. These replace Prosper and Korvold, which no longer appear in this trial. (The assessment's 16-commander matrix [Confirmed: ai-recommendations-assessment-2026-09.md §5.6] still lists Wilhelt; Mendicant is not in it, so the trial no longer reuses the matrix as-is.)
- **Candidate pool:** every Commander-legal card whose colour identity fits within **W/U/B** (the union of the two commanders), one row per face. **18,561 cards** [Confirmed: Scryfall search `legal:commander id<=wub`, 2026-11-04], plus about 290 extra face rows for two-faced cards (202 transform, 40 modal, 40 split, 11 flip) for roughly **18,850 face rows**. Each commander's own candidate set is a subset: Mendicant's W/U subset is 12,780 cards, Wilhelt's U/B subset 12,708. The two sets share the blue-or-colourless cards, **7,454 cards**, which is the only region where a card can be graded for both commanders (§5.6). **Correction:** the earlier drafts estimated about 10,000 cards for the old B/R/G pool [Approximate]; the same Scryfall count for B/R/G is 18,474, so that estimate was about half the true size. Embedding cost is still trivial with the local model (§3) and the index choice is now "none, exact scan" (C5, §2.2); the only effect is a larger one-time load.
- **No user data enters embeddings or the provider.** Only public rules text.
- **No UI, no production route, no advisor change.** Output is an offline evaluation report.
- **Lists (update 3):** Wilhelt is evaluated as **two builds** (**W1**, **W2**) and Mendicant as **one build** (**M1**); builds chosen from data at kickoff and approved by the owner (§4B.1). Combo data (§4A) is loaded for the same W/U/B pool. The two commanders' identities differ (Mendicant W/U, Wilhelt U/B), so every gate that uses colour identity uses **the commander's own identity**, never the pool's.

### 2.2 Table: `ref_card_embeddings_trial` (new, global reference data; sketch only)

```sql
-- DRAFT SKETCH, not a migration. Forward-only; reverse = drop this table only (owner approval, section 6).
create extension if not exists vector with schema extensions;   -- owner gate; hosted availability unverified [Approximate]

create table ref_card_embeddings_trial (
  oracle_id       uuid        not null,            -- Scryfall oracle_id (canonical card). NOT scryfall_id (D-003).
  face_index      smallint    not null default 0,  -- 0 = front or only face, 1 = back/second face
  face_name       text        not null,            -- display/debug only; never a join key
  text_hash       text        not null,            -- sha256 of exact embedded text; skip re-embedding when unchanged
  embedded_text_version text  not null,            -- recipe arm: 'v2-base' or 'v2-tagged' (section 2.3); part of the key so both arms coexist
  tags            text[]      not null default '{}', -- plain list of Tagger tag slugs that were in the embedded text; empty for 'v2-base'. Tags are attached by oracle_id, never by name. Not JSON.
  model_name      text        not null,            -- e.g. 'BAAI/bge-small-en-v1.5'
  model_version   text        not null,            -- pinned revision or date
  dimension       smallint    not null,            -- must equal the vector column dimension (check below)
  source_snapshot date        not null,            -- Scryfall bulk date the text came from
  embedding       extensions.vector(384) not null, -- sized for the recommended model
  created_at      timestamptz not null default now(),
  primary key (oracle_id, face_index, embedded_text_version),
  check (dimension = 384)
);
create index ref_card_embeddings_trial_tags_gin on ref_card_embeddings_trial using gin (tags); -- only needed for the tag-filter checks in section 5.5
comment on column ref_card_embeddings_trial.oracle_id is 'Scryfall oracle_id (canonical card identity), never a printing id.';
alter table ref_card_embeddings_trial enable row level security;
-- read for authenticated; writes service role only (same pattern as ref_rulings / ref_build_cards)
-- No vector index (C5): exact scan only, see "Index" below.
```

Design statements:
- **Primary key:** `(oracle_id, face_index, embedded_text_version)` (the earlier draft keyed on the first two only; the A/B arm needs the third). **Foreign keys:** none in the trial. `ref_cards.oracle_id` does not exist and uniqueness on `ref_printings.oracle_id` does not hold (many printings per card), so there is no valid FK target [Confirmed: src/types/supabase.ts]. Membership is validated by the load script against `ref_printings`.
- **No `user_id`, deliberate exception.** The standard says user-owned rows carry `user_id`; this is shared reference data like `ref_*` and the tag profiles [Confirmed: card-tagging-pipeline.md §6]. No user data is stored in it.
- **Text recipe:** superseded by §2.3 (`v2-base`, `v2-tagged`). The earlier `v1` excluded the name; the owner now wants the name included, see §2.3.
- **One model per table.** A vector column has a fixed dimension, so comparing models means a second table (`..._trial_b`), not a second column. The `model_*` and `dimension` columns exist for audit and for refusing mixed-model comparisons.
- **Index (C5): none on the vector column.** At about 18,850 face rows (§2.1) an exact cosine-distance scan is fast [Approximate; V-14 measures it], and §4.3 already requires an exact scan because an approximate index combined with colour and legality filters can silently return too few cards. The earlier HNSW index, and the plan to run both and compare, are dropped. The GIN index on `tags` stays (needed only for §5.5). If the exact scan proves too slow in the harness, that is reported and an index is a separate decision, not part of this trial.
- **Writes are atomic per batch and idempotent:** upsert on `(oracle_id, face_index, embedded_text_version)`, skip when `text_hash` + `model_version` are unchanged. A failed batch leaves earlier batches valid and the run is safely re-runnable. **No truncate, delete-all or clear-and-recompute** (AGENTS rule 5, D-007 spirit).
- **Query function (read-only):** `ref_similar_cards_trial(p_identity text[], p_version text, p_seed_oracle_ids uuid[] default null, p_seed_vector vector(384) default null, p_exclude_oracle_ids uuid[] default '{}', p_k int default 200)`, SECURITY INVOKER, returns `(oracle_id, best_face_index, distance)`. Exactly one of the two seed arguments is given (cards averaged, or a ready-made blended vector for §5.6). `p_version` picks the recipe arm. It contains **no user tables**; ownership is joined afterwards (§4). Final text: `docs/oracle/contracts/drafts/vector-trial/20261106120000_vector_trial_tables.sql` (draft).
- **Locked data model:** `user_cards`, `user_copies`, `deck_cards` and `get_collection_rollup` are untouched (D-001).

### 2.3 Exactly what text is embedded per card face (recipe v2, owner-approved)

One embedding row per **face** (a single-faced card has one face; transform, modal and split cards have one per face). The embedded string is built from these fields, in this order, one per line, and nothing else:

```
<face name>
<face type line>
<face oracle text, with the card's own name replaced by ~>
Keywords: <Scryfall keywords that belong to this face, lower case, alphabetical, comma separated>
Function tags: <Tagger tags, tagged arm only; section 2.4>
```

| Field | Rule |
|---|---|
| Face name | Included (owner decision; reverses draft v1, which excluded it). Risk: name words can pull in cards that merely share a word, for example "Blood" or "Tome". Mitigation: the base arm is also run once without the name as a sanity check on the 10 look-alike traps, reported but not an arm of the go/stop decision |
| Type line | That face's own type line (for example "Legendary Creature - Human Warlock") |
| Oracle text | That face's own oracle text only. Whitespace normalised; the card's own name replaced by `~`. Reminder text left in. No flavour text |
| Keywords | Scryfall `keywords` array. In Scryfall data this array sits on the card, not on each face [Approximate], so for a multi-face card keep a keyword on a face only if the word appears in that face's type line or oracle text; otherwise omit it. Line omitted when empty |
| Function tags | Tagged arm only, section 2.4. Tags are per card (by `oracle_id`), so every face of a multi-face card gets the same tag list [Approximate, a face-level choice the trial does not refine]. Line omitted when empty |

**Explicitly excluded from the embedded text and from the stored vector input:** price (any currency, any finish), whether the owner owns the card, whether it is in any deck or maybeboard, EDHREC data, mana cost, mana value, colour identity, rarity, set, artist, flavour text, rulings. Mana value and colour identity are applied as hard filters (§4.2), not embedded. The recipe function takes only public card fields, so user data cannot enter it by construction; the evaluation checks that no user table is read by the load script.

Arms: **`v2-base`** (first four lines) and **`v2-tagged`** (all five). Same model, same pool, same filters. `text_hash` is computed over the exact string, so a recipe change is a new version, never an overwrite.

### 2.4 Scryfall Tagger function tags (optional A/B arm)

Tags are Scryfall's community "oracle tags" (searchable as `otag:`), such as `ramp` or `mana-rock`. They are a hint about a card's function, not ground truth [Confirmed: card-tagging-pipeline.md §2].

**2.4.1 Where the tags come from (a correction to the owner's probe, flagged).** The probe found tags only through per-tag search queries. Scryfall's live bulk-data manifest, fetched 2026-11-04, lists an **Oracle Tags** file (updated daily, last 2026-11-03), and the Tags documentation describes it as the supported route, joined by `oracle_id` to the Oracle Cards file [Scryfall: api.scryfall.com/bulk-data; scryfall.com/docs/api/tags]. The existing tagging contract already assumed this [Confirmed: card-tagging-pipeline.md §4.1]. I downloaded both files to a temporary folder (outside the repo, nothing stored) and joined by `oracle_id` for the owner's sample cards:

| Card | Tags found in the bulk file (direct taggings) | Owner's probe |
|---|---|---|
| Mendicant Core, Guidelight; Wilhelt, the Rotcleaver | **Not yet probed.** The tag lists for the two trial commanders are read from the dated Oracle Tags file at load and recorded in the report; none is typed in here | n/a |
| Smothering Tithe | ramp, **repeatable-treasures**, rhystic, draw-hate | ramp only, no treasure tag |
| Blood Artist | blood-artist-ability, opponent-loses-life, repeatable-crime | death-trigger, lifedrain, drain-life |
| Sol Ring | mana-rock, adds-multiple-mana, full-refund | ramp, mana-rock |
| Rampant Growth | land-ramp, tutor-land-basic, tutor-land-to-battlefield | ramp, land-ramp |
| Rhystic Study (extra) | draw-engine, repeatable-pure-draw, rhystic, cast-tax | not probed |

Reading: the bulk file has **more tags than the search probe** (Smothering Tithe does have a Treasure-maker tag), but **only direct taggings**: Sol Ring shows `mana-rock` but not `ramp` because `ramp` is its parent tag; the docs say parents must be expanded through `child_ids` [Scryfall docs]. Slugs differ from the probe's labels (for example `blood-artist-ability` versus "death-trigger"); the search site resolves aliases, the bulk file stores one slug plus `aliases`. The file also holds noise tags (for example `meme`, `activated-ability`, `inscryption-achievement`). So the tagged arm needs an **allow-list** of functional tags and parent expansion, decided before the test. Both are small; they are the main cost of the arm. Per-tag search is kept only as a fallback; it needs one call per tag (the file has about 4,600 oracle tags, measured 2026-11-04) at the 2-per-second search limit, roughly 40 minutes plus paging, so it is a worse route.

**2.4.2 Join rule.** Join only by `oracle_id` against the Oracle Cards snapshot. **Never by card name** (the owner's probe saw a name collision give a false tag). Tags with no matching `oracle_id` in the pool are counted and dropped.

**2.4.3 Column.** `tags text[]` is a plain list of tag slugs (not JSON), holding exactly the slugs written into the Function tags line; empty for `v2-base`. Because slugs can change, the load also records the Oracle Tags file date in `source_snapshot`, and the tag UUID is the stable identity upstream [Scryfall docs]. The trial stores slugs for readability only and reloads from the dated file rather than trusting old slugs. Weights (`very_strong` to `weak`): include only `median` and stronger, decided before the test; the cutoff is recorded in the report.

**2.4.4 Usage rules checked 2026-11-04 (flag anything uncertain).**

| Topic | What Scryfall says | Status |
|---|---|---|
| Rate limits | Search, named, collection: 2 per second. Other API methods: 10 per second. Files on `*.scryfall.io` (the bulk files): no limit. A 429 response means a 30-second block, repeat offenders can be banned; do not ignore 429s | Confirmed from the docs [Scryfall: /docs/api/rate-limits] |
| Headers | Every API request needs an accurate `User-Agent` and an `Accept` header | Confirmed |
| Caching | Encouraged to cache at least 24 hours; use bulk files for large lookups; gameplay text changes rarely, weekly is enough | Confirmed |
| Tag data | Updated daily; community-maintained; may contain errors or abuse; apps should be able to disable individual tags; use UUIDs not slugs as identity | Confirmed |
| Data use | Free for Magic software and research; no Scryfall logo or implied endorsement; no paywalling Scryfall data; do not simply republish the data; the product must add value | Confirmed. The trial is internal and adds new value, so it complies. **Uncertain for the future public version (O-002):** whether showing tag names to users, or exposing the stored tags through an API, counts as republishing. Needs a check before any user-facing use |
| Attribution | The docs name no required credit line for card data or tags | **Uncertain:** whether Tagger contributors must be credited is not stated; ask or decide when anything user-facing is planned. The trial shows nothing to users |
| Licence of tags | No separate licence text found on the tags pages | **Uncertain** |

**2.4.5 Mapping to the existing taxonomy.** What the repo has: `ref_taxonomy` holds only five categories: archetype, mechanic, tribe, keyword, colour, with `edhrec_aliases` to map EDHREC themes [Confirmed: supabase/migrations/20260803100000_create_ref_taxonomy.sql]. It has **no card-role slugs** such as ramp or draw; the role vocabulary lives in `docs/category-taxonomy.md` and the proposed `role.*` and `action.*` slugs in the tagging contract, which are not live [Confirmed: docs/oracle/contracts/card-tagging-pipeline.md §3, §4.2]. So the trial does not write into `ref_taxonomy`. It maps Tagger slugs to the **proposed vocabulary** in a report-only lookup, resolved from the dated file and following the tagging contract's explicit-mapping rule (no substring guessing):

| Tagger tag (sample) | Proposed internal slug | Comment |
|---|---|---|
| `ramp` (parent), `mana-rock`, `land-ramp`, `adds-multiple-mana` | `role.ramp` | broad; use child tags to separate rock from land ramp |
| `repeatable-treasures` | `resource.treasure.produce` | the Treasure-maker distinction the traps rely on |
| `long-term-impulsive-draw`, `repeatable-impulsive-draw`, `draw-engine`, `repeatable-pure-draw` | `role.draw` plus `action.play_from_exile` where exile-based | impulse draw is not the same as plain draw |
| `synergy-exile-cast` | `action.cast_from_exile` | only if the tag description is specific; confirm at load |
| `opponent-loses-life`, `blood-artist-ability` | `event.permanent_dies` / drain role, mapped by hand | no direct death-trigger slug found in the bulk file for Blood Artist; may need parent expansion, flagged |
| `rhystic`, `cast-tax`, `draw-hate` | unmapped in v1 | taxes and punishers; stay as raw tags |
| `meme`, `activated-ability`, `triggered-ability`, `cycle-*` | excluded | not functional recommendations |

Coverage is uneven and `ramp` is broad: the tagging contract measured 93.1% of cards with any tag but only 58.3% matched by a draft functional map [Confirmed: card-tagging-pipeline.md §4.3]. So the tagged arm is expected to help cards that are tagged and to be neutral on the rest; the report states coverage of the trial pool and splits results by tagged versus untagged cards.

---

## 3. Embedding model options (recommendation first)

All three embed **public card rules text only**. No collection, deck, preference or account data is sent anywhere. Prices are `[Approximate]` and not verified in this task.

| | **1. Small open model run locally (recommended)** | 2. OpenAI `text-embedding-3-small` | 3. Voyage AI general embedding model |
|---|---|---|---|
| Example | `BAAI/bge-small-en-v1.5`, 384 dimensions, run by a script on the owner's machine | 1536 dimensions (can be shortened) | ~1024 dimensions |
| Cost | $0 | cents for ~1.2M tokens (about $0.02 per million tokens) [Approximate] | small or free tier [Approximate] |
| Privacy | Nothing leaves the machine | Public text goes to a vendor already near the stack (OpenAI SDK is installed for DeepSeek, but there is no OpenAI account in use [Confirmed: src/lib/adapters/deepseek-adapter.ts; package.json]) | New vendor |
| Approval needed | None beyond brief approval | New account and key (owner gate, assessment G4) | New account and key |
| Quality | Good general text similarity; unproven on MTG wording | Likely somewhat better on general text [Approximate] | Strong retrieval quality [Approximate] |
| Ops | One-time script; small dev dependency | API call in a script | API call in a script |
| Trade-off | Might be a little weaker; no vendor risk; can re-run freely | Quality margin vs account and spend | Same, plus a new vendor |

**Why option 1:** the trial needs no per-query embedding (queries use stored card vectors, §4), so no hosted model is needed at runtime, and nothing requires an account or spend. If option 1 fails the success bar narrowly, re-run with option 2 into a second table before concluding vectors do not work. Switching model is a new table plus a re-embed, about minutes of compute.

---

## 4. Retrieval query shape and how it combines with other data

All stages are **read-only** and return suggestions; nothing is written over decks or allocations.

1. **Seed vectors.** For a commander: its own face vector(s). For a deck: add the vectors of cards already in the deck (centroid = normalised mean). Trial decks are fixtures, not the owner's live decks. Free-text queries remain out of scope for production (they would need a runtime embedding call). **Exception inside the offline evaluation harness only:** the §5.5 sub-queries embed short synthetic texts with the same local model; this costs nothing and needs no hosted runtime. Seeds for §5.6 are a weighted blend, see there.
2. **Hard filters inside the query (cheap, deterministic):**
   - colour identity: `ref_printings.color_identity <@ commander identity` (partner pairs use the union, see `commander-resolver.ts` [Approximate, not read this task]);
   - legality: `ref_printings.legality_commander = 'legal'` (one row per `oracle_id`);
   - exclude the commander and cards already in the deck.
3. **Vector ranking.** Order by cosine distance to the seed, top 200 faces, card score = best face. Use an **exact scan** (no vector index exists in the trial, §2.2) so filtering cannot silently return fewer than requested; report the returned count (a short list is shown as short, D-036(c)).
4. **EDHREC join (by `oracle_id`).** Map `ref_build_cards.card_name` to `oracle_id` through `ref_printings` (§1.3). Build rows for the commander's builds give `inclusion_rate` and `synergy_score`. A card absent from EDHREC data keeps `null`, shown as "no EDHREC data", never as 0.
5. **Blending (fixed before the test, not tuned on it):** Reciprocal Rank Fusion over **three signals**, `score = 1/(60 + rank_vector) + 1/(60 + rank_edhrec_build_synergy) + 1/(60 + rank_combo)`, where a missing rank contributes 0. The vector rank comes from the build-conditioned seed (§4B.2); the EDHREC rank is the card's synergy rank **within the selected build** (§4B.3); the combo rank is §4A.4. Arms always produced for comparison: vector-only (V), EDHREC-only (B1, B2), two-signal fused (F2 = vector + EDHREC, the previous design), three-signal fused (F3 = F2 + combo). Both fused arms are per build.
6. **Ownership (labels, not filters).** After ranking, join the existing ownership facts for the requesting `user_id` (existing queries already used by the recommend route, which filter `is_proxy = false` [Confirmed: src/app/api/ai/recommend/route.ts]). Result is labelled Spare / In another deck / Buy as the `use-what-i-own` brief defines [Confirmed: docs/oracle/briefs/use-what-i-own.md §3] using existing labels (D-025, D-030). A failed ownership lookup is shown as unavailable, never as Unowned (D-030). Ownership never changes the ranking in the trial. In the trial it is exercised on **synthetic fixtures or the test account only**.
7. **Validation before display** (same boundary as `card-tagging-pipeline.md` §9): every shown card has an `oracle_id`, is legal and in colour identity; rules claims come from card text, not from the vector score. Vector distance is a "looks similar" signal and is never presented as a fact about rules. A "combo" label is shown only when the stored combo data supports it and every piece passes the same checks (§4A.5).

---

## 4A. Commander Spellbook combos (third signal, in scope from day one)

### 4A.1 How combo data is fetched

**Recommendation: load Spellbook's published bulk file on a schedule of our own; do not call the live search API per card.** Reasons, all verified 2026-11-04:

- Spellbook's own API documentation asks clients **not to export the whole dataset through the search API** and points to a single published file: gzipped about 31 MB (`variants.json.gz`, HTTP 200 confirmed), uncompressed about 709 MB. The file holds `timestamp`, `version`, `variants`, `aliases`. The copy I downloaded was built 2026-11-03T20:12Z, version 7.3.4, and held **117,956 variants**, all with status `OK`; every piece carries an `oracleId` (0 pieces without one) [Confirmed: live download, unparsed fields noted below].
- Terms and limits, from the API's own documentation text [Confirmed: github.com/SpaceCowMedia/commander-spellbook-backend, common/api_docs.py]: no authentication; "sparse" requests, a few calls per user interaction; name the service in the `User-Agent`; **80 requests per minute is described as a safe rate** and clients must handle `429`; **please credit Commander Spellbook and link back to commanderspellbook.com**; the backend is open source. No formal terms-of-service page was read; whether commercial or multi-user republishing is restricted is **[uncertain, not verified]**; attribution is treated as required.
- Bulk fetch is one request, so rate limits are irrelevant to the trial. Because the uncompressed file is large, the loader must **stream** the gzip (not load 709 MB into memory) and keep only the fields in §4A.2.

What the existing client can and cannot do [Confirmed: src/lib/spellbook-client.ts]:

| Need | Existing `findCombosForCard` | Verdict |
|---|---|---|
| Search combos by card name | Yes (`card="…"`, optional `ci:`) | Works for the AI chat tool |
| Return the card pieces | Reads `uses[].name`; live data has `uses[].card.name` | **Defect:** pieces come back undefined. Fix is outside the trial (Developer, small) |
| Most popular first | Sends `ordering=popularity` | **Defect:** ascending; needs `-popularity` |
| `oracle_id` per piece | Not returned | Bulk data has it; client would need extending |
| Legality, bracket tag, popularity, templates | Not returned | Bulk data has them |
| Rate-limit handling, retries, pagination | None | Not needed for bulk |
| Whole-dataset load | Impractical (10 per call) | Use the bulk file |

The trial therefore does **not** reuse the client's search function; it may reuse its base URL and `User-Agent` constant. A later production feature that needs a live lookup (for example a brand-new combo) extends the client after the two defects are fixed. Scheduled refresh cadence is a later decision; the trial uses one dated snapshot, recorded in the report (same discipline as the Scryfall snapshot).

Verified shape of one variant (live, trimmed) [Confirmed: live API]: `id` (string like `392-967-5078`), `status`, `uses[]` (each with `card.oracleId`, `card.name`, `card.typeLine`, `quantity`, `mustBeCommander`, zone fields), `requires[]` (non-card requirements, called templates, for example "a creature with …"; 6,472 of 117,956 variants have at least one), `produces[]` (`feature.name`), `identity` (e.g. `BR`), `legalities.commander` (boolean), `popularity` (integer), `bracketTag` (e.g. `O`), `salt`, `description`, `manaNeeded`, `easyPrerequisites`, `variantCount`.

Sizes for the trial commanders, from a live Spellbook query on 2026-11-04 for each commander, paging through every result (not the bulk file; the run recomputes these from its own dated bulk snapshot) [Confirmed: live API request]: **Mendicant Core, Guidelight is in 10 variants**, all with 3 pieces (the commander plus two others), none needing a template, all Commander-legal, all in identity W/U. **Wilhelt, the Rotcleaver is in 35 variants** (13 with 3 pieces, 10 with 4, 12 with 5; none need a template; all 35 Commander-legal). "Pieces" counts the commander itself. Consequences: (1) Mendicant's combos are all two-card-plus-commander, so with only the commander in the deck every one of its labelled cards is "1 piece away" (tier 2), never tier 3, and "complete" appears once the deck holds the other piece; (2) Wilhelt's mix is wider (3 to 5 pieces), so all three tiers can appear; (3) **every** in-colour combo for both commanders produces an infinite or win-the-game result (10 of 10 and 21 of 21 in the live data), so the infinite-combo preference rule (§4A.5) applies to every combo label in this trial.

### 4A.2 Where it is stored (separate reference tables keyed by `oracle_id`; sketch only)

`deck_combos` is not used (§1.1): it is per deck, user-owned, one JSON blob, and cannot answer "which combos contain this card". No locked table changes (D-001). Two small global reference tables, same RLS pattern as other `ref_*` tables (read for authenticated, writes service role only), no `user_id` (shared public data, same exception as §2.2):

```sql
-- DRAFT SKETCH, not a migration. Reverse = drop both tables (owner approval, section 6).
create table ref_combo_variants_trial (
  variant_id      text        primary key,          -- Spellbook variant id, e.g. '392-967-5078'
  identity        text        not null,             -- Spellbook colour identity letters, e.g. 'BR' ('' = colourless)
  commander_legal boolean     not null,             -- Spellbook legalities.commander; re-verified per piece at query time
  piece_count     smallint    not null,             -- number of card pieces, commander included
  template_count  smallint    not null default 0,   -- non-card requirements; variants with > 0 are never labelled 'complete'
  popularity      integer     not null,
  bracket_tag     text,
  produces        text[]      not null default '{}',-- feature names, display only
  summary         text,                             -- first lines of description, display only
  source_snapshot timestamptz not null,             -- Spellbook bulk 'timestamp'
  source_version  text        not null              -- Spellbook bulk 'version'
);
create table ref_combo_pieces_trial (
  variant_id      text        not null references ref_combo_variants_trial(variant_id) on delete cascade,
  oracle_id       uuid        not null,             -- Scryfall oracle_id, from Spellbook card.oracleId. NOT scryfall_id (D-003).
  must_be_commander boolean   not null default false,
  primary key (variant_id, oracle_id)
);
create index ref_combo_pieces_trial_oracle on ref_combo_pieces_trial (oracle_id);  -- "combos containing this card"
```

- **Primary keys:** variants `variant_id`; pieces `(variant_id, oracle_id)`. **Foreign key:** pieces → variants only (cascade delete is within this trial's own tables). No FK to card tables (same reason as §2.2).
- **Joined by `oracle_id`, never by name.** Card names appear only as display text from Spellbook's own payload, and are not stored as keys. If one oracle_id appears twice in a variant with quantity 2, the pieces row is stored once and a quantity is not needed for presence tests (flagged as an accepted simplification; such variants are counted and reported).
- **Indexes needed by the queries:** `oracle_id` on pieces (candidate → its combos); the primary key covers variant → pieces; `popularity` is read only after the join, so no index at this size [Approximate].
- **Atomic and idempotent write:** the loader upserts variants and their pieces **per variant in one transaction** (a variant is never half-loaded), in batches; a failed batch leaves earlier batches valid, and re-running is safe. Variants that disappear from a later snapshot are **not deleted** by the trial loader (no clear-and-recompute, AGENTS rule 5); they are flagged stale by a `source_snapshot` older than the newest, and excluded at query time. Pruning old snapshots would be a separate owner-approved step.
- **Size:** only variants that include at least one card inside the trial's colour pool (W/U/B identity) are kept, roughly a few tens of thousands of variants [Approximate; not recounted for W/U/B in this task; counted and reported at load].

### 4A.3 How combo membership affects ranking and what the user sees

> **Amended by A-V15 (§10, 2026-11-06):** tier 2 needs at least one other piece already present.

Facts are computed read-only from the stored tables. "Present" = the commander plus every card currently in the deck (fixture decks in the trial). For a candidate card C and a stored combo that contains C, let **M = number of combo pieces that are neither present nor C**.

| Tier | Meaning (M) | Visible label | Example |
|---|---|---|---|
| **1 Complete** | M = 0 and no template requirement: adding C finishes a combo all of whose other pieces are already in the deck or are the commander | **Combo: completes** *(combo result, e.g. "near-infinite draw")* | Deck has the other pieces; C is the last |
| **2 One piece away** | M = 1, or M = 0 but the combo has a template requirement | **Combo: 1 piece away** *(name the missing piece)* | The deck has 3 of 5 pieces; C is the 4th; one more needed |
| **3 Commander-linked** | M ≥ 2, the commander is a piece, and the combo has **at most 4 pieces in total** | **Combo with commander** *(pieces still needed: M)* | Wilhelt plus C plus one more |

The three tiers are the complete-versus-partial distinction the owner asked for. Combos that need more than one extra card beyond what is shown in tier 3 (5-piece combos with M ≥ 2) are **not labelled and do not boost**; cutoffs (4 pieces, M ≤ 1 for tiers 1 and 2) are fixed before the test. A card in several qualifying combos takes its best tier, then its most popular combo; the label names that one combo and says how many more exist ("+3 more").

The label is a visible chip on the suggestion (final wording and look are Designer's decision), tells the owner what the combo does in the combo's own words, shows the bracket tag where Spellbook gives one, and carries "Source: Commander Spellbook" attribution. Combos are facts from stored data, not from the vector, and are never inferred.

### 4A.4 The combo arm in the fusion

The combo arm ranks only cards that have a label: first by tier (1, then 2, then 3), then by variant `popularity` (higher first), then by `oracle_id` for stable ties. Only the **top 20** combo-ranked cards receive a combo rank (a cap so a combo-rich commander does not flood the list); all others contribute 0 to that term. Same constant 60. The same list with the third term removed is F2, so the effect of combos can be measured directly (§5.7). A card whose only support is a combo (no vector rank, no EDHREC rank) can still enter the list; it is shown with its label so the reason is visible.

Tier-1 and tier-2 labels do not depend on the build; they depend on the deck. Whether a combo belongs to a build's plan is not modelled in the trial (Spellbook has no build concept); it is listed as a limit.

### 4A.5 Gates (hard, no exceptions)

For every card shown with a combo label, and for **every piece of the combo named in the label**:
1. **Legal:** Commander-legal in the dated Scryfall snapshot (`ref_printings.legality_commander`), not only Spellbook's own boolean. A combo with any illegal piece is never labelled.
2. **Colour identity:** each piece's identity is within the **asking commander's own identity** (partner-aware; never the wider W/U/B pool), and Spellbook's variant `identity` is also within it.
3. **Joined by `oracle_id`:** each piece has an `oracle_id` that exists in `ref_printings`; no name matching. Pieces that do not resolve cause the combo to be dropped and listed.
4. **Label matches data:** the tier and M shown equal a recomputation from the stored tables (checked by the evaluation harness, §5.7).
5. **Honest wording:** a tier-2 or tier-3 combo is never described as complete, and a template-requiring combo is never tier 1.

**Preference gate (D-036(b), owner answer 2026-11-04, final):** the "ask before suggesting an infinite-combo package" rule **does apply to a card that is a piece of an infinite combo and carries a combo label** (any tier, §4A.3). A card that is merely a piece of some combo but carries no label is not covered by this rule. Which combos count as "infinite" is decided from Spellbook's own produced-result names (for example "Infinite death triggers", "Infinite colorless mana", win-the-game results) with the list of qualifying names fixed before the test; a combo whose results are unclear is treated as infinite (the safe side). In the live data for both trial commanders, every in-colour combo qualifies (§4A.1), so in practice the rule covers every combo label here.

### 4A.6 Per-deck switch for combo labels (owner answer 2026-11-04, final)

Combo labels must be switchable **off per deck** (not one global setting). Each deck has one combo-label state:

| State | What the owner sees | What the ranking does |
|---|---|---|
| **Unknown** (never asked) | The labelled infinite-combo cards are held back from the suggestion list, and the advisor asks once, in plain words, whether this deck should show infinite-combo suggestions | No combo boost is applied while the answer is unknown |
| **On** | Combo labels, with the "Commander Spellbook" credit, and the combo boost | F3 (§4A.4) |
| **Off** | No combo labels and no combo-only cards; the deck can be switched back on at any time | Exactly F2: the same list as if the combo arm did not exist |

- **Off keeps eligibility:** switching labels off removes the label, the boost and combo-only cards. A card that ranks on its own merits (vector and EDHREC) is still listed, just without a label. Whether "off" should also hide infinite-combo cards completely is an open question for the owner (report, open question 2).
- **Trial vs production:** the trial is offline, so the state is a switch on the evaluation harness (on / off / unknown), tested in §5.4 gate 8. Where the per-deck answer is stored in the live app is **not designed here**: it is a new user-owned setting (needs `user_id`, row-level security and a migration), so it needs its own contract after a brief is approved. The trial must not write it anywhere.
- **Credit:** the "Commander Spellbook" credit on each combo label is confirmed fine by the owner. A link back to commanderspellbook.com is kept (the API documentation asks for it, §4A.1).

---

## 4B. Per-build recommendations (a card's value changes by build)

Example: a sacrifice-and-drain card such as Blood Artist should rank higher in Wilhelt's Aristocrats build than in its Zombies go-wide build, and a Zombie-typal payoff should rank the other way round (an expectation to be tested, not a finding). A card's vector is the same for every asker, so the build has to enter through the **query**, the **EDHREC scores** and the **grades**.

### 4B.1 What build data exists

`ref_commander_builds` and `ref_build_cards` (schema and sync behaviour in §1.1). Things that matter for this design:
- Each build has an archetype and theme, up to a tribe, secondary archetypes and themes, and `deck_count` (how popular it is) [Confirmed: migrations above].
- Build cards keep the **top 100 cards by inclusion rate**. A card outside a build's top 100 has **no per-build score**; that is "no data in this build", not zero [Confirmed: scripts/sync-edhrec-builds.ts L426-428]. This is a real limit: a niche payoff that is excellent in the build but low in raw inclusion may be missing.
- Missing synergy is stored as 0 by the sync, so a stored 0 may mean "unknown" [Confirmed: same file L406]. The trial treats exactly 0.0000 synergy together with a non-null inclusion as **unknown synergy** and falls back to the inclusion rank for that card, and counts how many cards that affects.
- `is_signature` (synergy > 0.15 and inclusion > 0.4) marks build-defining cards in the stored data, but it is loose on a top-50 list (V-06: 33 to 41 of 50 stored cards per trial build carry it), so **the trial ignores it** (§4B.2); the stored data is not changed; `decks.build_id` links a deck to a build (nullable) [Confirmed: migrations].
- Whether Wilhelt and Mendicant actually have builds synced in the hosted database, and how many cards each holds, is **unverified** (no database access); it is the kickoff gate in §1.3, and if builds were never synced the plan is to sync first and block per-build work. **Proposed builds (owner approves at kickoff, before any result is seen; choice is from the data, evidence in §1.1):**
  - **W1 = Wilhelt, Zombies** (theme `kindred:zombies`; the most-played build, 4,024 decks at the August sync) and **W2 = Wilhelt, Aristocrats** (1,013 decks). These are the two Wilhelt builds the local export still holds; Reanimator and Combo were merged into Aristocrats by the dedup step, so they are not candidates. They differ enough to be worth separating (the August similarity check put them at 59% overlap in top cards, 37 shared of 63 distinct, "related" rather than "merge"), but not so much that direction is easy; §5.8 states what happens if too few card pairs differ.
  - **M1 = Mendicant, its most-played build** (expected to be Artifacts, the only theme above the sync's 2% cut-off on EDHREC today; if the hosted data holds a different or second build the kickoff check reports it).
  - **Why not a second Mendicant build:** it would add about 25 minutes of grading (§5.2), taking the total to about 2.4 hours, over the owner's roughly 2-hour budget, and on current EDHREC data a second Mendicant build probably does not exist in the synced data anyway. Rule applied: up to two builds per commander only while grading effort stays about 2 hours; here that allows two for one commander and one for the other.

### 4B.2 Build-conditioned retrieval (the vector side)

**Which seed each list uses (C3, decision):** the three graded lists **W1, W2 and M1 use the no-deck seed** below (0.5 commander + 0.5 build seed picks). The owner's deck lists are used **only** for §5.6 (deck-dependent cards) and the "deck" planted-combo fixtures (§5.7). Reason: one Wilhelt deck cannot sit in both the Zombies and Aristocrats lists without making the two lists look alike, which would hide exactly the build difference §5.8 tests. The with-deck seed in the second bullet is therefore **not used for W1, W2 or M1 grading**.

Seed vector for a (commander, build) is a weighted, normalised blend, weights fixed now and not tuned on results:

- no deck (**used for W1, W2, M1**): **0.5 commander** + **0.5 build seed picks** (mean of the 8 seed picks defined in the pick procedure below; weights fixed, not tuned on results);
- with a fixture deck (**§5.6 and deck-planted combo fixtures only**): **0.3 commander** + **0.3 build seed-pick mean** + **0.4 deck centroid** (replaces the 0.4/0.6 commander/deck blend of §5.6 when a build is chosen; the §5.6 commander-and-deck blend remains the no-build comparator).
- **Seed pick procedure (V-06c, fixed, deterministic, ignores `is_signature`).** From the stored cards of the build (`ref_build_cards`, 50 per trial build): (1) keep only cards with `synergy_score` greater than 0 that resolve to one `oracle_id`, are Commander-legal, are inside the commander's colour identity and are not the commander; (2) sort by synergy descending, tie-break by inclusion rate descending, then card name ascending; (3) take the first **8**. A card with missing synergy (stored as 0) or negative synergy never qualifies. The rule is fixed now and is not tuned on results.
- If fewer than 5 cards qualify under the pick procedure, the build seed falls back to the commander seed and the output says so ("no build signal").
- The seed pick cards used in the seed are removed from the candidate list (they would trivially rank first, and the user would learn nothing); the report lists them.
- **Optional offline arm (harness only):** a short synthetic text built from the build's theme words (for example "sacrifice a creature, drain, aristocrats"), embedded locally as in §5.5. Compared against the seed-pick seed; not a production path because it needs a runtime embedding call.
- **Circularity note:** the seed pick cards come from EDHREC data, and EDHREC is also a fusion input. So the vector-only arm under a build seed is partly EDHREC-informed. The gold grades are independent of EDHREC (§5.2), and the report must show V-build separately so this is visible.

### 4B.3 Per-build EDHREC scores in the fusion

The EDHREC term of the fusion uses **the selected build's** rows only: rank by that build's `synergy_score` (tie-break inclusion), unknown synergy handled per §4B.1. A card absent from the build contributes 0 to the term and is shown as "no data in this build". Commander-wide EDHREC data (`ref_commander_cards`, `ref_edhrec_recommendations`) is **not** blended in as a fallback in the trial (extra parameters, and it would blur the build signal); that choice is revisited after results.

### 4B.4 Production note (not built)
For a user deck, the build comes from `decks.build_id` when set; when unset, the advisor either asks the owner which build, or uses the commander-level seed and says so. How a build is detected or chosen is a later design; the trial only tests that conditioning works when the build is given.

---

## 5. Evaluation plan

### 5.1 Arms (same pool, same filters, **run per list**)

**A "list" is a (commander, build) pair.** Lists: **W1** (Wilhelt, Zombies) and **W2** (Wilhelt, Aristocrats), **M1** (Mendicant's top build). Each commander is the other's contrast. Every arm below is produced for each list; commander-level versions (no build) are also produced once per commander as the comparator for §5.8.
- **B1 (baseline):** EDHREC inclusion order for **that build**, after legality and identity filters. This is the existing data-driven behaviour offline and repeatable [Approximate: how the live advisor ranks is not re-read here; the live chat output is captured only as an optional extra].
- **B2 (baseline):** EDHREC synergy order for that build.
- **V:** vector only (build-conditioned seed, §4B.2). **F2:** vector + build EDHREC fused (the previous design). **F3:** F2 + combo arm (§4A.4). F3 is the candidate; the go/stop decision in §5.4 uses F3, with F2 reported beside it.
- **Tag A/B (§2.4):** each of V and F3 is run on `v2-base` and on `v2-tagged`. The go/stop decision in §5.4 uses the **base** arm; tags are judged separately: they are kept for the next step only if tagged beats base by ≥ 0.03 nDCG@10 on either commander and does not worsen the traps, otherwise dropped. Results are also split by tagged and untagged cards (coverage is uneven).

### 5.2 Hand-labelled set (small, versioned)
- **Cards to label (per list, because a card's grade depends on the build):** **all three lists are generated with the no-deck seed (§4B.2, C3).** For each of the 3 lists (W1, W2, M1), a pooled list of about 40 cards: the union of each arm's **top-10** plus F3's **top-20** (duplicates removed, arm identity hidden). Grading depth is cut from top-20 for every arm to top-10 (the metrics are @10) with top-20 kept only for F3 (the novel-finds metric). Plus ~10 deliberate **look-alike traps per commander** (similar words, wrong function, e.g. "sacrifice" vs "dies", "play" vs "cast", Treasure maker vs Treasure user; for the new commanders also "an artifact you cast" vs "an artifact that enters", and "a Zombie" vs "any creature that dies" [Confirmed: card-tagging-pipeline.md §1, §3.1]), graded once per commander, not per build.
- **Updated owner grading effort (estimate, not measured; at about 30 seconds a card, the earlier rate):**

| Part | Grades |
|---|---|
| Pooled lists W1, W2, M1 (about 40 each) | ~120 |
| Look-alike traps (10 per commander, shared across builds) | ~20 |
| Multi-feature cards (§5.5, commander level, drawn from both commanders) | ~20 |
| Deck-dependent cards (§5.6, 12 cards × 3 lists, replaces the 24 per-commander grades) | ~36 |
| Build-flip cards (§5.8, drawn from the same cards as §5.6 plus 4 more, 2 builds) | ~8 |
| Combo-only cards (cards that only the combo arm surfaced, §5.7, up to 8 per list) | ~24 |
| **Total** | **about 230 grades, about 2 hours** (range 1.75 to 2.5) |

  Effort with the new commanders: **unchanged, about 230 grades, about 2 hours** (range 1.75 to 2.5). The earlier estimate was about 170 grades and 1.5 hours before the combo and per-build work; the owner's own guess was about 2 hours, which this matches. The commander swap does not change the count because the number of lists (3) and the card counts per list are the same; it changes only which cards appear. Two things could move it: Mendicant has few combos (10), so its combo-only grades will probably fall well short of the 8-per-list allowance (saves a few minutes), and the deck-dependent cards must be legal for both commanders, which limits the choice to blue or colourless cards (§5.6) but not the count. **How it scales:** each extra build adds about 40 pool grades plus 12 deck-dependent grades, about 25 minutes; each extra commander adds its builds the same way plus ~10 trap grades; the traps and multi-feature cards do not grow with builds. A second Mendicant build is therefore left out (about 2.4 hours). **Ways to keep it smaller:** assistant pre-grades and the owner only confirms or edits (already assumed); grade top-10 only for all arms (saves about 30%, loses the novel-finds metric); or cut the trial to Wilhelt W1 and W2 alone (about 1.2 hours) and treat Mendicant as optional. Combo hits themselves are **not** graded: they are checked mechanically against stored data (§5.7); only combo-only cards need a human opinion on whether the card is any good.
- **Grades are per (card, build).** The same card graded in W1 and W2 is two separate answers; that is the point of §5.8.
- **Labelling:** per card, the owner sees plain card text and answers 3 / 2 / 1 / 0: *would be great / would play / marginal / wouldn't*. An assistant may draft grades first; the owner confirms or edits every one (same method as `card-tagging-pipeline.md` §8). Grades are **not** derived from EDHREC inclusion, to avoid circularity [Confirmed: assessment §8.1].
- **Assistant pre-grading rules (C7), so "blind" stays honest:**
  1. **The drafter never sees which arm a card came from.** It works only from the grading sheet (§5.9, V-04) and the freeze file: card text plus the owner's grade scale; no arm, rank, build source or combo hint, and never the sealed key that maps cards to arms. (Architect drafts grades under this rule in V-18.)
  2. **Drafts are not shown to the owner for the 10 blind pair comparisons** of §5.4 (F3 versus F2 lists). Those are judged fresh by the owner, with no draft attached.
  3. **The owner's edit rate on drafts is reported** (share of drafted grades the owner changed, and by how much). A high edit rate means the drafts were anchoring or wrong, and the report says so; it does not alter any gate.
  4. For the graded pools, the owner confirms or edits every draft as before.
  5. **Traps are sealed and partly exposed (V-04b, 2026-11-06).** Look-alike trap and flip-contrast identities live only in `trial/vector/sealed/gold-key.json` (hash in the freeze file §5). Because the owner was told which original traps were traps, each commander has 5 **exposed** traps (original picks) and 5 **unexposed** traps (new picks); 3 of 6 Wilhelt contrast picks are likewise unexposed. Slot ids do not reveal which is which. On the grading sheet trap rows sit inside the commander's first list (W1 for Wilhelt, M1 for Mendicant) with no section label (grading sheet format). Gates and results that use traps are computed on the **unexposed** traps first (10 cards in total) and the exposed ones are reported beside them; a result that depends only on exposed cards cannot decide go or stop.
- **Record:** gold-set version, Scryfall snapshot date, model name/version, recipe version, grader.
- **No dev/test split.** The trial has no tuned parameter (RRF constant fixed at 60, k fixed at 20), so there is nothing to overfit; any later change to these means a fresh set.

### 5.3 Metrics
- nDCG@10 and precision@10 (grade ≥ 2), **per list** (W1, W2, M1).
- **Novel finds:** cards graded ≥ 2 in F3's top-20 that are not in that **build's** stored EDHREC list (so popularity could not have found them). Combo-only finds are reported separately so combos are not credited as vector finds.
- **Commander specificity:** share of top-20 that is not a generic staple. Staple = appears in the top 50 of ≥ 25% of all stored builds, computed offline [Approximate threshold; confirm at kickoff].
- **Build separation (diagnostic, not a gate):** overlap of the top-20 between W1 and W2. Expected between 30% and 80%: identical lists mean the build does nothing; near-zero overlap suggests an unstable seed. Reported either way.
- **Combo metrics:** combo surfacing (§5.7) and combo harm (F3 minus F2 nDCG@10).
- **Blind owner preference:** 10 situations across the lists (for example "Wilhelt, Zombies build, no sacrifice outlets yet"), owner picks list A or B without knowing which arm.
- Cost and run time of the load, in the report.

### 5.4 Success criteria (decided in advance)
**Hard gates, all must pass (100%):**
1. Every shown card resolves to an `oracle_id`; unresolved names are listed, not shown.
2. Every shown card is Commander-legal in the dated snapshot and within colour identity (partner-aware where relevant).
3. Ownership labels match the synthetic fixture; no failed lookup appears as Unowned.
4. No card from the "look-alike traps" appears in an arm's top-10 *without* being flagged as a known confusion in the report (so errors are visible, not hidden). **Computed on the unexposed traps first (§5.2 rule 5)**, with the exposed traps reported beside them; the report names traps by slot id until the sealed key is opened after grades are final.
5. **Combo gates (§4A.5):** every combo label's pieces are all legal, in colour identity and joined by `oracle_id`; the label's tier and missing-piece count equal a recomputation from stored data; no template-requiring combo labelled complete; no combo with an unresolved piece labelled.
6. **Combo surfacing (§5.7):** every card in the fixed Mendicant and Wilhelt combo lists is surfaced with the correct label, as specified there.
7. **Build integrity:** every list states its build; the build data passed the kickoff gate (§1.3); the build seed's fallback to commander-level is shown where used, never silent; cards missing from a build are shown as "no data in this build", never as zero.
8. **Combo switch and preference (§4A.5, §4A.6):** with a deck's combo state **off**, the list is identical to F2 (same cards, same order) and shows no combo label; with the state **unknown**, no combo-labelled infinite-combo card is in the list and exactly one question is raised per deck; with **on**, every label shows the "Commander Spellbook" credit. Checked on all three lists, 100%.

**Go (worth a real brief and design) if:**
- for **each of the three lists**, F3's nDCG@10 ≥ B1's + 0.10 (B1 being that build's EDHREC order) and F3's precision@10 ≥ 0.70 (thresholds from assessment §8.2 [Confirmed]); a list may not use a different threshold;
- F3 has ≥ 3 novel finds per list in its top-20 (combo-only finds counted separately and not included);
- F3's specificity ≥ 50% on every list;
- the owner prefers F3 in ≥ 7 of 10 blind comparisons;
- **combo harm:** F3's nDCG@10 is within 0.02 of F2's or better on every list (the combo arm must not make the owner's own grades worse; if it does, the combo arm is kept as a label only, not as a ranking boost); and
- **build direction (§5.8):** pair ordering ≥ 75% and the build-seed no-harm rule holds. If this fails but the rest passes, the result is "go for commander-level, build-awareness not proven" and per-build stays a recorded limit.

**Iterate:** F3 meets some but not all, or only two of three lists pass. Allowed once: try model option 2 in a second table, same set.
**Stop:** F3 does not beat B1 on nDCG@10 by ≥ 0.05 on at least two of the three lists, or V returns mostly look-alike traps (**counted on the unexposed traps first**; if the finding rests only on exposed traps it cannot decide the stop and is reported as inconclusive on that point). Record the result; keep option A (assessment) as the path.

Small-sample caution: 2 commanders, 3 lists and about 230 grades is directional evidence, not proof; the report must say so. Wilhelt's two builds share a commander, so they are not independent samples, and Mendicant's single build (with only 10 known combos) is the weakest of the three lists for the combo checks.

### 5.5 Check A: multi-feature cards (one blended vector per face)

Problem: a card like Wilhelt does several jobs (replaces dying Zombies with tokens, plus sacrifice-for-a-card draw). One vector per face blends them, so "more like Wilhelt" may return cards that are mediocre at both jobs instead of good at one.

- **Test cards (replaces the earlier Prosper-based list; final choice fixed before the test):** about 10 multi-feature cards, drawn from both commanders' territory: **Mendicant Core, Guidelight** (power grows with artifacts you control; speed mechanic; copies artifact spells at maximum speed); **Wilhelt, the Rotcleaver**; Smothering Tithe (white, so usable only for Mendicant; ramps and taxes draws); Rhystic Study; Skullclamp (colourless; makes creatures smaller and draws when they die); Sai, Master Thopterist (blue; makes tokens when you cast artifacts and can turn artifacts into cards); a ramp-plus-draw card; a drain-plus-token card, and similar. Each has a fixed list of 2-3 features drafted by an assistant and confirmed by the owner (for example Wilhelt: "make replacement tokens when Zombies die", "sacrifice a creature to draw"; Mendicant: "count artifacts", "copy artifact spells"). The features are fixed before results are seen. Each card is checked as Commander-legal and within the identity of the commander it is asked about.
- **Arms:** (1) **single query:** one seed, the card's own vector. (2) **per-feature queries merged:** for each feature, embed a short synthetic query built from the sentence(s) of the card's text that carry that feature (offline, local model), take each top-20, merge with Reciprocal Rank Fusion (same constant 60). (3) **tag-assisted** (tagged arm only): per-feature query restricted to cards sharing the matching function tag.
- **Graded set:** the multi-feature cards, and the top-10 from each arm, are in the owner's graded set (§5.2), graded per feature as well as overall (would this card be a good "ramp like X" pick? a good "draw like X" pick?). That is about 20 extra grades.
- **Metrics:** nDCG@10 and precision@10 on the multi-feature subset; **feature coverage** (share of top-20 results that are graded ≥ 2 for at least one named feature, and number of features with ≥ 3 such results).
- **Success:** per-feature merged beats single on the subset by ≥ 0.05 nDCG@10 **and** reaches coverage of all features. If not, keep the single query (simpler). A result in between is reported as "no clear gain".

### 5.6 Check B: deck-dependent cards (good in some decks, weak in others)

Problem: Rhystic Study and Skullclamp are excellent in some decks and weak in others, and rules text alone cannot say which. A card's vector is the same whichever commander asks; only the query seed and the EDHREC data can differ.

- **Test cards:** about 12 deck-dependent cards chosen before the test, graded **separately per commander** (Mendicant and Wilhelt), about 24 grades (the three-list figure of §5.2 uses 12 per list). **Constraint from the colour change:** a card can be graded for both commanders only if it fits both identities, that is, it is blue or colourless (7,454 cards, §2.1). So white cards such as Smothering Tithe and black cards such as Blood Artist cannot be used here (they stay in §5.5 and §5.8, where only one commander's identity matters). Candidate examples, all verified Commander-legal and in identity for both commanders on 2026-11-04: Rhystic Study, Mystic Remora, Skullclamp, Sai, Master Thopterist, Sol Ring, Ashnod's Altar; the rest are a Zombie or sacrifice payoff and an artifact payoff in blue or colourless, chosen before the test. At least 8 are expected to differ by 2 or more grades between the commanders (for example Sai, Master Thopterist and Skullclamp are expected to be graded very differently by an artifact deck and a Zombie-sacrifice deck); if the owner's grades do not differ, the card is replaced.
- **Seeds compared:** (a) the commander alone; (b) the deck's cards alone; (c) **blend:** weighted mean of the commander vector (weight 0.4) and the centroid of the current deck's card vectors (weight 0.6), normalised. Weights are fixed now, not tuned on the results. The deck is a **fixture: the owner's own public Archidekt deck for that commander, read-only** (C4; owner approval A1): Mendicant, https://archidekt.com/decks/15628123/artifacts; Wilhelt, https://archidekt.com/decks/19277239/a_rot_to_process. Each is fetched once into a fixture file (V-03) with no database connection and no write to any user table; nothing goes through the import routes. **Fixed rule, written before any result:** use **all non-land, non-commander cards, whole**, with no sampling and no trimming (the earlier "about 30 cards from a sample" is withdrawn). Archidekt returns **printing ids**; each is mapped to an **`oracle_id`** through the same name/printing mapping used for everything else in the trial, the printing id being used only to look up the card and never kept as identity (D-003); any card that cannot be mapped is listed and excluded, never guessed. Decks are never built from EDHREC inclusion (circular with the baseline); fixtures contain no ownership data. These decks feed **only** this check and the deck-planted combo fixtures (§5.7), not the three graded lists (C3, §4B.2).
- **Fused list:** blend seed through the vector ranking, then Reciprocal Rank Fusion with the commander's own EDHREC synergy rank (§4.5). EDHREC carries the deck-specific signal: the same card has a different inclusion and synergy per commander, and a card missing from that commander's data keeps `null`, not 0 [Confirmed: supabase/migrations/20260806000000_create_commander_builds.sql].
- **Success (both must hold):**
  1. **Pair ordering:** for the cards graded at least 2 apart between commanders, the fused list ranks the card higher for the commander with the higher grade in ≥ 75% of cases.
  2. **No harm:** blend seed (c) is at least as good as the commander-alone seed (a) on nDCG@10 for both commanders (within 0.02); otherwise keep the commander-alone seed.
- **Expected and accepted:** vector-only should not separate these cards (same text, same vector); the check is about the fused list. If pair ordering passes only because of EDHREC and not the blend, say so plainly in the report: it then argues for the EDHREC data, not the vector, as the deck-specific signal.
- The §5.4 go decision requires **no** new gate from §5.5-5.6 (they decide design choices), but the report must show both; a failure of §5.6 pair ordering is recorded as a known limit of the approach.

---

### 5.7 Check C: combo hits for Mendicant and Wilhelt are surfaced (mechanical, no grading)

> **Amended by A-V15 (§10, 2026-11-06):** L-cmd and L-deck run on an empty-deck base; completes must be in the top 30 (was 10); L-cmd is listed + label (hard), top 30 soft. Where this section differs, §10 wins.

Facts from live Spellbook queries on 2026-11-04 [Confirmed: live API request; the run recomputes all of this from its own dated bulk snapshot]: **Mendicant has 10 combos, all 10 inside its W/U colours, all legal**, so the colour gate has nothing to remove for Mendicant itself. **Wilhelt has 35 combos, 21 inside its U/B colours; 14 are outside its colours** (4 are W/U/B, 6 are G/W/U/B, 4 are U/B/R). Of those 14, 4 sit inside the trial's W/U/B pool but outside Wilhelt's own colours, which is exactly the case the pool-versus-commander rule in §2.1 guards against: a pool-wide identity check would wrongly label them for Wilhelt. The most popular in-colour combos (by Spellbook popularity) involve, for Mendicant: Urza, Lord High Artificer with Worldwalker Helm; Sensei's Divining Top with Krark-Clan Ironworks; Krark-Clan Ironworks or Ashnod's Altar with Myr Retriever; Ashnod's Altar with Scrap Trawler. For Wilhelt they are dominated by Poppet Stitcher // Poppet Factory (in 9 of its 21 in-colour combos) with Carrion Feeder, Ashnod's Altar, Phyrexian Altar, Altar of Dementia or Viscera Seer; Shambling Ghast and Chthonian Nightmare each appear in about 11. These are examples; the frozen lists below are recomputed from the snapshot used in the run, never typed in by hand.

**Frozen lists (computed and recorded before any result is seen):**
- **L-cmd:** per commander, the 5 most popular combos that are Commander-legal, in the commander's own colour identity, have at most 4 pieces and contain the commander. Its non-commander cards (about 7 for Mendicant, about 6 for Wilhelt, below the 20-card cap in §4A.4) must each appear in F3's top-30 in **every list of that commander** (W1 and W2; M1), carrying the label its tier gives against a deck that holds only the commander: **"Combo: 1 piece away"** for 3-piece combos (every Mendicant combo, since M = 1) and **"Combo with commander"** for 4-piece combos (M = 2). **Pass: 100%.** Reported softly beside it: the same for the top 10 combos, target ≥ 80% (Mendicant has only 10 combos, so for it this is the whole set).
- **L-deck (planted combos, per commander):** a fixture deck that already holds all but one non-commander piece of the most popular qualifying combo: the missing piece must be labelled **"Combo: completes"** (tier 1) and rank in F3's top-10. A second fixture holds all but two pieces of another combo: the next piece must be labelled **"Combo: 1 piece away"** (tier 2) naming the missing card, rank in F3's top-30; for Mendicant, whose combos have only 3 pieces, this fixture is replaced by one holding none of the other pieces. A template check uses a **synthetic** variant with a template requirement (fixture row, never loaded), because neither commander has a real one: it must not be labelled complete. A 5-piece check uses one of Wilhelt's 9 in-colour 5-piece combos: it must not be labelled tier 3. **Pass: 100%.**
- **L-negative (must not appear with a combo label):** (i) every card whose only combos have a piece outside the asking commander's identity (Wilhelt's 14 outside-colour combos supply real cases, including the 4 W/U/B ones); (ii) a synthetic variant whose piece fails the snapshot's legality (fixture row, never loaded into the reference table); (iii) a variant containing an unresolvable `oracle_id` (fixture). **Pass: 100% unlabelled.**
- **L-label:** for 100% of labelled cards in every F3 list, tier and missing-piece count equal an independent recomputation from the stored tables.
- **L-cross (new):** every Mendicant combo piece must be unlabelled in Wilhelt's lists unless it sits in one of Wilhelt's own combos and fits U/B, and the reverse. For example Krark-Clan Ironworks may not carry a label in a Wilhelt list merely because it is a Mendicant combo piece. Ashnod's Altar, which is a piece in both commanders' combos, may be labelled in both, naming the right combo each time. **Pass: 100%.**

If a frozen-list card is missing from the list, the report names it and the reason (not in the vector pool, filtered, below cap). Failure of L-cmd, L-deck, L-negative, L-label or L-cross is a hard-gate failure (§5.4 gates 5 and 6). All of these are run with the combo state **on** (§4A.6); gate 8 covers off and unknown.

**Effect on quality (not a gate by itself):** F3 minus F2 nDCG@10 and precision@10 per list, the combo-only cards each list gained, and the owner's grade for them (§5.2). Combos are build-independent in the trial, so the report also lists any combo label that looks off-plan for its build (for example an infinite-mana artifact combo on Wilhelt's Zombies build) for the owner to judge.

### 5.8 Check D: the same card ranks differently across builds, in the expected direction

- **Cards:** the deck-dependent cards of §5.6 that are also legal for Wilhelt (all of them, since §5.6 cards fit both commanders) plus 4 to 8 more chosen for the build contrast and legal for Wilhelt only (a sacrifice-and-drain payoff, a Zombie-typal payoff, a token-maker, a card expected to be unaffected; the six chosen are sealed, freeze §8, 3 exposed and 3 unexposed), all fixed before results. Candidates must appear in both builds' candidate pool (legal, in identity). This check uses only Wilhelt's two builds, so the black cards that §5.6 had to exclude are usable here.
- **Expected direction** is defined by the **owner's grades**, not by EDHREC (avoids circularity): a card graded at least 2 higher in W1 than W2 must rank higher in F3 for W1, and the reverse. Mechanical corollary reported alongside: a card present in one build's EDHREC list and absent from the other's should rank higher where present (shows the data is doing the work). **Known risk:** the two builds share about 59% of their top cards, so fewer card pairs may differ by 2 grades than with two sharper builds; if there are fewer than 8 such pairs the check is reported inconclusive (see criterion 1 below), not passed.
- **Controls:** 5 universal staples (for example a mana rock every build wants) should stay near the top in both builds (stay within the top 30 in both); they must not flip order by more than 10 places. A control failure means build-conditioning is distorting the list.
- **Seeds compared:** commander-alone seed versus build seed (§4B.2), each through F3, both measured on the same W1 and W2 grades.
- **Success (all must hold):**
  1. **Pair ordering:** for cards graded ≥ 2 apart between W1 and W2, F3 ranks the card higher in the build with the higher grade in **≥ 75%** of cases (minimum 8 such pairs; fewer pairs means the check is reported as inconclusive and the card set is replaced once).
  2. **Build seed no-harm:** F3 with the build seed has nDCG@10 at least equal to F3 with the commander-alone seed on W1 and W2 (within 0.02), else keep the commander-alone seed and record that build-conditioning in the seed does not help.
  3. **Beats the commander-level list:** on the flip cards, the build-conditioned ranking orders pairs correctly at least 15 percentage points more often than the commander-level ranking (which cannot tell the builds apart, so its rate is about chance).
  4. **Controls hold.**
  5. **Exposed and unexposed contrast cards (V-04b).** Pair ordering is computed on all flip cards (the 12 deck-dependent cards of §5.6 plus the 6 Wilhelt-only contrast picks), and the 3 unexposed Wilhelt-only picks are reported separately beside the total. A pass that depends only on exposed cards is reported as such.
- **Expected and accepted:** if pair ordering passes only because of the EDHREC term and not the build seed, say so; it then argues that per-build EDHREC data does the work and the build seed is optional.
- **Known limit:** Mendicant M1 is a single build, so it tests nothing about direction; it is the cross-commander contrast of §5.6 and the third list in §5.4. The direction check rests on Wilhelt's two builds alone.

---

### 5.9 Freeze: the moment everything is fixed (C8)

Many items above are "fixed before the test". This section names the moment and the contents.

- **One dated freeze file**, committed to the repository **before any evaluation pool exists**, that is, before any arm has produced a ranked list for any of W1, W2 or M1 (slice V-04 writes it; the owner skims and edits it, about 10 minutes). **Gene checks that the freeze's commit precedes the first pool-generation run**; if it does not, the evaluation is invalid and the report says so.
- **Contents (all fixed at freeze, none changed afterwards without a dated amendment and a fresh gold set):**
  1. the approved builds W1, W2, M1 (§4B.1), with the data each was chosen from;
  2. the infinite-result name list (§4A.5);
  3. the tag allow-list and the weight cutoff (§2.4.3);
  4. the staple threshold (§5.3);
  5. the trap cards (§5.2);
  6. the 12 deck-dependent cards (§5.6);
  7. the multi-feature cards with their 2-3 features each (§5.5);
  8. the flip cards (§5.8);
  9. the Scryfall snapshot date, the Spellbook snapshot date, the model name and version, the recipe version, and the Archidekt fixture files with their fixed rule (§5.6).
- **Appended later, by the harness, before results are read:** the **frozen combo lists** (qualifying combos per commander, §4A) are **computed by the harness from the dated Spellbook snapshot** and appended to the freeze file once computed. They are derived, not chosen, and must be appended before any result is looked at.
- The freeze file contains no arm, rank, or grade information.

---

## 5A. Additional data that could improve results

Verdicts: **now** = cheap, already held or trivial, include in the trial; **later** = worth a follow-up after the trial decides go; **not recommended** = do not pursue. Everything below is about improving recommendation quality; none of it is built or approved.

| Data | Held today? | What it would add | Verdict |
|---|---|---|---|
| **EDHREC per-commander inclusion and synergy, per build** | Schema yes: `ref_commander_builds`, `ref_build_cards` (inclusion, synergy, deck count, signature flag, which the trial ignores; top 100 cards per build in the table schema, 50 loaded for the trial) [Confirmed: supabase/migrations/20260806000000_create_commander_builds.sql; scripts/sync-edhrec-builds.ts]; also `ref_edhrec_recommendations` and `ref_commander_cards` [Confirmed: src/types/supabase.ts]. **Rows actually synced for Mendicant and Wilhelt: unverified for the hosted database (no DB access); the local export shows two Wilhelt builds and none identifiable for Mendicant (§1.1); if never synced, sync first (§1.3)**. Keyed by card name, so it needs the `oracle_id` join (§1.3) | The build-specific signal (§4B.3, §5.8), the build seed's top-8 synergy picks, and the per-build baseline | **Now** |
| **Build structure averages** (`avg_lands`, `avg_ramp`, `avg_draw`, `avg_removal`, creature counts per build) | Schema yes, same tables; synced values unverified [Confirmed: migration; Approximate for content] | Would show what a build typically needs ("this build runs 11 ramp pieces"); not used by the trial's ranking | **Later** (needs the deck-level stats row) |
| **Deck-to-build link** (`decks.build_id`) | Column exists, nullable; how often it is populated is unverified [Confirmed: supabase/migrations/20260806000000_create_commander_builds.sql] | Tells the advisor which build the owner's deck is, so per-build advice needs no extra question | **Later** (production; trial supplies the build directly) |
| **Mana value and colour identity as hard filters** | Yes: `ref_cards.mana_value`, `ref_cards.color_identity`; `ref_printings.cmc`, `color_identity` [Confirmed: src/types/supabase.ts] | Colour identity already a filter (§4.2). Mana value as an optional filter or tie-breaker (for example "cheap ramp"), never embedded | **Now** (identity); **later** (mana-value filter UI) |
| **Card role taxonomy** | Partly. `ref_commander_cards.card_role` exists [Confirmed: src/types/supabase.ts]; the role vocabulary is documented but the proposed per-card tag store is not live [Confirmed: docs/category-taxonomy.md; card-tagging-pipeline.md §6]. `ref_taxonomy` has no role slugs (§2.4.5) | Lets the report say "ramp / draw / removal balance" and supports sub-queries | **Later**; Tagger tags (§2.4) are the cheap first approximation inside the trial |
| **Scryfall rulings** | Yes: `ref_rulings` keyed by `oracle_id` [Confirmed: supabase/migrations/20260731011347_add_ref_rulings.sql] | Might clarify odd cards, but rulings are long, mostly about edge cases, and would dilute the vector | **Not recommended** for embedding; keep for the validation step only |
| **Commander Spellbook combos** (owner decision 2026-11-04: **in scope from day one**) | Client exists but has two defects (§1.1); `deck_combos` is per deck and unsuitable [Confirmed: src/lib/spellbook-client.ts; src/types/supabase.ts; live API]. Bulk file available (about 31 MB gzipped, 117,956 variants, snapshot 2026-11-03) [Confirmed: live download]. No reference table exists yet | The third signal: "this card works with your commander or your deck", separating complete from one-piece-away combos (§4A). Vectors cannot see it | **Now** (new reference tables, §4A.2; bracket and salt use is **later**) |
| **Spellbook extras: bracket tag, popularity, salt votes, "produces" features** | In the bulk file for every variant [Confirmed: live API] | Popularity orders combos; the bracket tag is shown beside a label; salt and produced features are display text | **Now** (popularity, bracket tag, display text); **later** (using salt or bracket to filter) |
| **Commander-specific decklists (Archidekt, Moxfield)** | No stored public decklists; Archidekt and Moxfield are import formats [Confirmed: AGENTS.md; src/lib/deck-normalizer.ts]. **In scope (C10, owner approval A1):** reading the owner's **two named public Archidekt decks, read-only, once each**, as §5.6 fixtures (no database, no user-table writes, no import routes). **Out of scope:** bulk pulls of other users' decks; those stay out and need a terms-of-use check first | A richer per-commander picture than EDHREC's averages, and realistic fixtures for check B | **Two named decks: now.** Anything wider: **later**, terms-of-use check needed for each site first [uncertain, not verified here]; EDHREC already covers most of the signal |
| **Deck-level stats (creature count, curve, ramp count)** | Computable from `deck_cards` and `ref_cards`; `deck_health` and `deck_mana_analysis` tables exist [Confirmed: src/types/supabase.ts]; contents not inspected | Context for "this deck needs more draw", which a ranker (not the vector) can use | **Later** |
| **The owner's accept / skip history** | No table that records accepting or skipping suggestions was found by name; `deck_upgrades`, `upgrade_change_log` and `debrief_actions` exist but were not inspected [Confirmed: src/types/supabase.ts] [Approximate for content] | The best personal taste signal, but only after there is a suggestion screen to collect it | **Later** (start recording when a suggestion UI exists; needs its own brief) |
| **The owner's graded labels (future ranker training set)** | Not yet; created by this trial (§5.2, §5.5, §5.6) | About 170 grades is too few to train a ranker, enough to evaluate one. Keep the file versioned so grades can seed a later, larger set | **Later** (keep, do not train on it now) |
| **Price, power level, salt** | Price per printing: yes [Confirmed: src/types/supabase.ts `price_usd`]. Salt: commander-level only, from EDHREC [Confirmed: supabase/migrations/20260805195644_add_edhrec_columns.sql]. A bracket attribute appears in the generated types; not inspected [Approximate]. No card-level power or salt | Price and salt are about budget and table fit, not about whether a card does the right job | **Not recommended** as embedded text or as vector ranking input (owner decision, §2.3); **later** as optional filters |

Priority view: the EDHREC (now per build), mana and identity rows, and Spellbook rows are in the trial; the owner's accept / skip history is the later addition most likely to move quality; commander decklists are mostly redundant with EDHREC.

---

## 6. Rollback plan

The trial is built to be removed in layers, least to most invasive:

1. **Switch off (nothing user-visible to switch):** the trial has no UI or production route. Stop running the script and do not wire the function into any route. Zero effect on the app.
1a. **Switch off one signal at a time (configuration of the offline harness, no data change):** (i) **combos off** = run F2 instead of F3 (the combo arm and labels disappear, vectors and EDHREC unaffected); (ii) **build-awareness off** = use the commander-alone seed and commander-level EDHREC rows (what the earlier draft specified); (iii) **both off** = the original two-signal commander-level design. §5.7 and §5.8 results say which of these to fall back to.
2. **Revoke read access** to the trial function and tables (a reversible permission change).
3. **Remove, only with explicit owner approval at that time** (it is a drop, so AGENTS rule 5 applies): drop `ref_card_embeddings_trial`, `ref_similar_cards_trial`, `ref_combo_pieces_trial` and `ref_combo_variants_trial` in one reverse script drafted alongside the forward migration (pieces first, then variants, because of the foreign key). These objects hold only reproducible derived data (the embeddings can be regenerated; the combo tables can be reloaded from the dated Spellbook bulk file, which the loader keeps a copy of outside the database). Leave the `vector` extension installed.
4. **Per-build conditioning stores nothing.** It is query logic over the existing `ref_commander_builds` and `ref_build_cards`, which are only read. Nothing to remove and nothing to restore.
5. **The build sync is the one step that does change existing reference rows (C1).** Per-build conditioning at query time stores nothing, but the build sync that may precede it **deletes and re-inserts the card list of each build it touches** (§1.4). That step is named, limited to the Zombies, Aristocrats and Artifacts builds of the two trial commanders (owner approval A1), preceded by a dry-run report, and is **not** covered by the reverse script of item 3. Its rollback is re-running the same filtered sync (EDHREC data is re-fetchable) and comparing with the V-02 baseline counts. Apart from that step, no locked table, RPC or existing data is modified at any step (`deck_combos` and `decks.build_id` are untouched; the EDHREC tables are otherwise read-only).
6. **If the throwaway-copy option is chosen (§1.5 option 2),** rollback is deleting the local copy; the online database is never changed, including by the build sync.

Ordering: the trial migration sorts after every migration already applied (the ten import migrations are applied, V-02 §4) and is never applied out of order (§1.5, C6). The reverse script is drafted at `docs/oracle/contracts/drafts/vector-trial/20261106120000_vector_trial_tables.reverse.sql`; it is run only with owner approval at that time.

---

## 7. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Similar words are not the same function** | Vectors blur cast vs play, sacrifice vs dies, Treasure makers vs users | Hard validation of cards; trap cards in the test set; vectors never state rules facts; tag pipeline (G2) remains the rules-grade layer |
| **Popularity is invisible to vectors** | Good but obscure cards may rank with bad ones | Fuse with EDHREC; D-036(c): fewer, explained suggestions |
| **Filter + approximate index can return too few cards** | Narrow colour pools with an ANN index | No vector index in the trial; exact scan only (C5, §2.2); report the returned count |
| **Stale legality** | Banned cards suggested | Dated snapshot check in the trial; legality freshness work before any production use |
| **Name-to-`oracle_id` mismatches** | Double-faced names, punctuation, reprinted names | ≥ 99% match gate, unmatched list, no guessing |
| **Model lock-in and drift** | Changing model invalidates all vectors | `model_*` columns, one table per model, cheap re-embed |
| **New sets not embedded** | New cards invisible | Incremental hash-skip upsert; not built in trial |
| **Hosted setup partly known** | pgvector listed as available (owner), install state unconfirmed; size limits unchecked; migration order is settled (ten applied, V-02) | Rehearse on a throwaway database first (V-10); owner gate A3; the migration stops harmlessly if the extension is unavailable; throwaway-copy option in §1.5; ~18,850 rows is small [Approximate] |
| **Multi-user future (O-002)** | Public version means many users | Embeddings are global, shared, no `user_id`, read-only to users, written by service role only. No per-user vectors in the trial. Per-user taste vectors, free-text query embedding, per-request cost, rate limits and connection pooling are explicitly **not** validated and need their own contract. Ownership joins must always filter by the caller's `user_id` and rely on existing RLS (assessment §0.3 found several AI queries not scoped to the user [Confirmed: assessment §0]) |
| **Tagger data is community-made and shifts daily** | Wrong, missing or renamed tags; unclear attribution and republishing rules if shown to users (§2.4.4) | Dated snapshot, allow-list, UUID identity, join by `oracle_id` only, tags A/B kept out of the go/stop gate, nothing user-facing |
| **Name in the embedded text** | Shared words ("Blood", "Tome") could create false similarity | Name-free sanity run on the traps (§2.3) |
| **Scope creep into production** | Trial quietly becoming a feature | No route, no UI; "Go" leads to a brief and Gates 2-5, not directly to build |
| **Owner time** | Labelling effort | About 230 grades, about 2 hours (§5.2); pre-graded by an assistant, can be cut to Wilhelt-only (about 1.2 hours); a second Mendicant build would take it to about 2.4 hours |
| **Spellbook client defects** | Existing client returns undefined piece names and sorts least-popular first | Trial does not use it (bulk file); defects reported for a Developer fix before any live use |
| **Spellbook terms and load** | Docs ask not to export the dataset through the search API, 80 requests per minute, handle 429, credit the site; formal terms page not read | Bulk file only, one request, `User-Agent` set, attribution on any label, terms re-checked before multi-user use [uncertain] |
| **Bulk file size and freshness** | 709 MB uncompressed; variants change daily | Stream the gzip; dated snapshot; no per-query calls; stale variants excluded not deleted |
| **Combos that are not legal or not in colours** | 14 of Wilhelt's 35 combos are outside its colours (4 of them inside the W/U/B pool); all 10 of Mendicant's are inside its own; Spellbook legality is a boolean, not our snapshot | Gates in §4A.5 (own-commander identity, not the pool's) and L-negative, L-cross in §5.7; legality re-checked per piece against our snapshot |
| **Combos flood or distort the list** | A combo-rich commander could fill the list with combo pieces; infinite-combo cards may be unwelcome (D-036(b)) | Cap of 20 combo-ranked cards, F3 vs F2 harm check, label-only fallback, preference question to the owner |
| **Combo not on-plan for the build** | Spellbook has no concept of a build; a legal combo can be wrong for the build in hand | Listed for owner judgement in §5.7; limit recorded |
| **Template combos and 5-piece combos** | Some combos need "a creature with …" or five cards; "complete" would overpromise | Template combos never tier 1; tier 3 limited to 4-piece combos |
| **Build data missing or thin** | Whether Wilhelt and Mendicant builds were synced is unknown (local evidence: Wilhelt yes, two builds; Mendicant not identifiable); only top 100 cards per build; missing synergy stored as 0 | Kickoff gate (§1.3); if missing, sync first and block per-build work (BLOCKED, never simulated); "no data in this build" never shown as zero, unknown-synergy rule (§4B.1) |
| **Build seed borrows EDHREC data** | Seed pick cards come from EDHREC, which is also fused: double counting and weaker independence | Gold grades independent of EDHREC; V-build reported alone; seed pick cards excluded from candidates |
| **Builds chosen to flatter the result** | Two builds that differ obviously would make direction easy | Builds chosen at kickoff by data (most played, most different), owner approves before results |
| **Per-build grades multiply effort** | Each build is a separate grading list | Effort table and scaling in §5.2; Wilhelt-only cut; second Mendicant build left out |
| **Small sample across builds** | W1 and W2 share a commander; direction check needs ≥ 8 pairs | Inconclusive is a reportable outcome; no overclaim |

---

## 8. Locked decisions touched

- **D-001:** untouched (separate table).
- **D-003:** embeddings keyed by `oracle_id`; no `scryfall_id` anywhere.
- **D-007:** suggestions only, nothing written over allocations.
- **D-030:** failed lookups never become Unowned.
- **D-036(c):** short lists when evidence is thin.
- **D-036(b):** asks before including an infinite-combo package when the owner's preference is unknown. Owner answer 2026-11-04: it applies to any combo-labelled card that is a piece of an infinite combo; labels are switchable off per deck (§4A.5, §4A.6). The trial is offline; the per-deck setting needs its own contract before production. Not a challenge to the decision; it clarifies its scope. The owner may want Gene to record the clarification in the register.
- **O-002 (open):** multi-user scale is not resolved here. Combo and build tables are global and shared; Spellbook attribution and terms matter more with many users.
- **No challenges to locked decisions.**

## 9. Handoffs: the slice list (C9)

The earlier handoffs (Gene writes the brief, and so on) are withdrawn: Product's brief exists (`docs/oracle/briefs/vector-recommendation-trial.md`). Work now follows **Gene's slice list V-01 to V-22** in `docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md` §3, which is the single source for order, owners, dependencies and approvals (A1 to A4). This contract is the specification those slices cite; it does not restate them. Contract sections the slices rely on: V-02 §1.1, §1.5; V-03 §5.6; V-04 §5.9, §5.2; V-05 §1.4; V-09 §2.2, §4A.2, §6 (forward migration says in its header that it is reversible by its reverse script); V-14/V-15 §4, §4A, §4B; V-16 §5.4, §5.7; V-17 to V-20 §5.2 to §5.9. Separate small ticket, not part of the trial: fix the two Spellbook client defects (§1.1).


---

## 10. Amendment A-V15 (SIGNED by Gene, 2026-11-06; owner option 1, "keep it natural")

**Source:** draft in `docs/oracle/reports/2026-11-06-architect-v15-combo-amendment.md` (Architect). **Owner approval:** Brad chose option 1 (visible, not pinned) on 2026-11-06 and approved the draft as written. **Signed:** Gene, 2026-11-06. This amendment is not an entry in `decisions.md` (it changes trial test rules, not a locked product decision). It applies to the V-15 re-run onward; nothing else in this contract changes (constants 60, cap 20, tier cutoffs, credit, per-deck switch and the infinite-combo rule are untouched; no weight tuning).

1. **§4A.3, anchor rule.** A tier 2 label ("1 piece away") applies only if at least one combo piece other than the candidate is present (the commander counts as present). Otherwise the card is unlabelled for that combo and gets no boost. Tiers 1 and 3 are unchanged.
2. **§5.7, clean base for the frozen lists.** L-cmd and L-deck are evaluated on a list built the same way as V-14/F3 but with an **empty deck** (it still excludes the commander, the seed, basic lands, duplicates, and illegal or out-of-colour cards). The fixture-deck lists keep feeding gates 2, 5, 7 and 8. A frozen-list card that is a seed card of the list under test is reported as "excluded by seed" and is not a failure; the report names it.
3. **§5.7, L-cmd.** Hard (100%): every non-commander piece of the top 5 combos is **listed** with the label its tier gives ("1 piece away" for 3-piece, "Combo with commander" for 4-piece) and none is lost to the cap or a filter. Soft (reported, target 80%): the piece is in the top 30. The rank of every piece is printed.
4. **§5.7, L-deck.** Fixture 1: the missing piece is labelled "Combo: completes" (hard) and ranks in the **top 30** (hard; was top 10); top 10 is reported as soft. Fixture 2: the next piece is labelled "Combo: 1 piece away" naming the missing card (hard) and is listed (hard); top 30 is soft. Template and 5-piece synthetic checks are unchanged.
5. **§5.4 gate 6.** Passes on the hard parts above. Soft rank results are reported and carried into §5.2 grading so the owner judges whether combo-only cards sit too low.
6. **§7 honest limit.** Combo-only cards compete on one signal and will usually sit between about 20th and 45th place in a list of about 270. At the fixed weights the combo arm is a labelling and discovery signal, not a strong ranking lever. **Fallback for Wilhelt, if the rank thresholds are missed:** report it as "correct and listed but placed 20th to 45th", count it as a known limit, and do not widen the cut-off or raise the weight to turn it green.
7. **Reporting rule (changed thresholds after first results).** The V-16 report shows the original-rule results and the amended results side by side. If W1 "completes" ranks exceed 30 on the re-run, return to Gene with the numbers; do not adjust constants.
8. **V-18 drafter (Gene instruction, same day).** The draft grades are written by a fresh agent in a clean context that has never read the sealed key, any pool or arm output, or any combo list (the Architect has handled the key, so is not used for this). Intent of §5.2 rule 1 is unchanged.
