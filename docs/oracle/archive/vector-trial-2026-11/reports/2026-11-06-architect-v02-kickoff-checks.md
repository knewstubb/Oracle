# Report: v02-kickoff-checks
Role: Architect
Status: PARTIAL (read-only; four of five checks answered with evidence, pgvector availability could not be verified and a local copy is not currently possible on this machine)
Task as received: Slice V-02, READ-ONLY. Read AGENTS.md, your role files, docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md (V-02 list) and the trial contract. Do the kickoff data checks exactly as listed in V-02, with evidence for each: which EDHREC builds exist for Mendicant Core, Guidelight and Wilhelt, the Rotcleaver in hosted data; whether pgvector is available/enabled; the printing-id-in-oracle_id-column question; the status of the ten pending import migrations; feasibility of a throwaway local copy. Use only SELECT/read-only access and existing project tooling (Supabase CLI/MCP if configured). Make NO writes, migrations, or sync runs. If you lack hosted database access, say exactly what you could not verify and what the owner or Developer must run. Write report docs/oracle/reports/2026-11-06-architect-v02-kickoff-checks.md in the standard format with a plain-language owner summary.

## Summary for the owner
The app's live data is fine: the card identity problem in the old local database does not affect the real app, and all the waiting import changes are already in the online database. Two things matter for the trial. First, the online database has the builds you want (Zombies, Aristocrats, Artifacts) but **none of the 1,885 builds in it has any cards stored**, so the build data pull must be run; it cannot be skipped. Second, I could not confirm that the online database can do the "similar cards" matching, and this computer has no way to make a throwaway copy today. Someone needs to check one setting in the Supabase dashboard (steps in section 2), and you will need to choose at the later approval point between using the online database or installing the tools for a local copy.

## How the checks were run (access)
- **Hosted migration history:** `supabase migration list --linked` with the existing local CLI login, project ref `udocxsyzzvrceiuupprj` from `supabase/.temp/project-ref`. Read-only. [Confirmed: command output 2026-11-06]
- **Hosted table reads:** HTTP GET requests (SELECT only, no POST/PATCH/DELETE) to the project's REST interface, using the existing `.env.local` project URL and service key, as the project's own scripts do. No key value was printed or stored. No rows were written. Row counts and ids only; no `user_cards` contents are reproduced here beyond a match count. [Approximate: ad-hoc inline commands, no file was saved; Gene may prefer the Tester repeat this on a read-only role]
- **Local old database:** `sqlite3 -readonly data/oracle.db`.
- **Not possible with this access:** reading `pg_available_extensions` (not exposed through the REST interface; the CLI 2.75.0 has no read-only query command; no `psql`, no `docker`).

## 1. Builds that exist now, and the baseline for V-07

Commanders found in `ref_commanders` (by name search):

| Commander | `ref_commanders.id` | EDHREC decks | EDHREC rank | Last EDHREC sync |
|---|---|---|---|---|
| Mendicant Core, Guidelight (searching "Guidelight" finds this same row) | 77e2e6c2-573d-4792-85d8-32de12cc97dc | 16,341 | 3 | 2026-08-23 |
| Wilhelt, the Rotcleaver (searching "Rotcleaver" finds this same row) | 7efd346e-9815-4934-b04a-e27b055a23fa | 22,200 | 2 | 2026-08-23 |

Both exceed the sync's 300-deck commander minimum, and each has one row only [Confirmed: `scripts/sync-edhrec-builds.ts` `MIN_DECKS = 300`, hosted read].

Builds in `ref_commander_builds` (all synced 2026-08-06):

| Commander | Build (theme / archetype, EDHREC slug) | Decks | % of commander | Cards stored in `ref_build_cards` |
|---|---|---|---|---|
| Mendicant | theme `artifacts`, slug `artifacts` | 1,634 | 10.2 | **0** |
| Mendicant | `tokens` | 305 | 2.0 | 0 |
| Mendicant | `clones` | 269 | 2.0 | 0 |
| Mendicant | theme `artifacts`, slug `affinity` | 262 | 2.0 | 0 |
| Wilhelt | theme `kindred:zombies`, slug `zombies` | 4,024 | 18.2 | **0** |
| Wilhelt | `tokens` | 1,090 | 4.9 | 0 |
| Wilhelt | archetype `aristocrats`, slug `aristocrats` | 1,013 | 4.6 | **0** |

- The three builds the trial needs (Artifacts for Mendicant, Zombies and Aristocrats for Wilhelt) **exist as build rows but are empty**. Card count per build is 0; signature cards resolving to `oracle_id`: not applicable (0 cards). `ref_build_cards` has no `oracle_id` column; it holds `card_name` only, so resolution happens later by name against `ref_printings` (section 5) [Confirmed: `supabase/migrations/20260806000000_create_commander_builds.sql`].
- **This is wider than these two commanders:** `ref_build_cards` has 0 rows in the whole database. So the V-06 condition "skip only if all three builds exist and are healthy" is **not met**; V-05/V-06 are needed. The existing sync's pass 2 targets builds with no cards, and the Artifacts (10.2%), Zombies (18.2%) and Aristocrats (4.6%) builds are all above its 2% theme floor, so a filtered run would pick them [Confirmed: `scripts/sync-edhrec-builds.ts` lines 47, 301, 665; Approximate for pass 2 selection, not run].
- Why `ref_build_cards` is empty everywhere is not known from this read. The contract (§4B.1) and the sync script both say it should hold the top 50 to 100 cards per build. Gene should treat "who or what emptied it" as an open question before V-06 (C1 notes the sync deletes then re-inserts a build's cards; an empty table means nothing is lost by a first run).
- Two other tables that EDHREC data could come from are not usable as a fallback for these builds: `ref_edhrec_recommendations` is also empty (0 rows overall), `ref_commander_cards` has 0 rows for both commanders (11,082 overall). `ref_commander_insights` has 32 rows (Mendicant) and 39 rows (Wilhelt).
- **Baseline of every build table before any sync (for V-07), 2026-11-06:**

| Table | Rows |
|---|---|
| `ref_commanders` | 7,242 |
| `ref_commander_builds` | 1,885 |
| `ref_build_cards` | 0 |
| `ref_edhrec_recommendations` | 0 |
| `ref_commander_cards` | 11,082 |
| `ref_commander_insights` | 6,459 |
| `ref_commander_taxonomy` | 64,045 |
| `ref_taxonomy` | 263 |
| `ref_cards` | 32,533 |
| `ref_printings` | 119,985 |
| `deck_combos` | 0 |

  Per-commander build counts for the other 7,240 commanders were not exported; V-07 should read them again at the same time as it reads the after-state, or Tester should capture the full per-commander list immediately before V-06. Since `ref_build_cards` is 0 overall, T-1's "other commanders' build rows are unchanged" is already satisfied by "still 0 for every build except the three named".

## 2. pgvector on the hosted database: NOT VERIFIED

- **Could not verify.** The list of available/installed extensions is not readable with the access above [see "How the checks were run"].
- Local evidence: no migration, source, script or `package.json` mention of `vector` or `create extension` (consistent with contract §1.2, "not present") [Confirmed: repository search].
- Hosted Postgres version file says 17.6.1.141 [Confirmed: `supabase/.temp/postgres-version`]. Supabase normally ships pgvector with its Postgres images, but I did not verify that for this project [Approximate].
- **What the owner or Developer must run (read-only; do not click Enable):**
  - Dashboard, project `udocxsyzzvrceiuupprj`, Database, Extensions, search "vector": note whether it is listed, and whether it shows enabled or disabled (expect "available, not enabled"). Or, in the SQL editor: `select name, default_version, installed_version from pg_available_extensions where name = 'vector';` (SELECT only). Record the three values. `installed_version` empty means available but not enabled, which is the expected and acceptable state.
- Effect on the plan: if available, A3 stays as drafted. If not listed, per plan Open question 2, the trial runs on a local copy or pauses.

## 3. Printing ids stored under the name `oracle_id`: live app NOT affected

**Old local database `data/oracle.db` (read July 2026):** the table `card_definitions` has columns `id, oracle_id, card_name, created_at` and its `oracle_id` holds **printing ids**, not canonical card ids [Confirmed: sqlite read-only].
- 3,003 rows, 3,003 distinct values; 2,677 of the values equal a `scryfall_id` in the local `collection` table.
- Wilhelt: local value `2501a911-d072-436d-ae3b-a5164e3b30aa`, which hosted `ref_printings` shows is the printing mic #2, not Scryfall's card id `eada96a1-4964-4ad0-b0e3-2df08d6ae188`.
- Mendicant: local value `6f11d7a7-72e9-406e-a701-5c3a556a43e0`, which is the printing dft #365, not `b20d74a4-0e08-4779-972a-499f1a2be15a`.
- `physical_copies.scryfall_printing_id` is the printing-id column there, so the same value type sits under two different names.

**Places that read it:**
- `src/`: nothing reads `data/oracle.db`. `src/` mentions the table name `card_definitions` only in comments saying it was renamed (`src/app/api/collection/rollup/route.ts:29`, `.../collection/printings/route.ts:32`, `.../collection/export/route.ts:14`) and in `src/lib/import-engine-v2.ts` comments (lines 1053 to 1058), `warm-start-import.ts:5`, `brew-v2-types.ts:138` [Confirmed: grep].
- `scripts/`: `generate-mana-data.ts`, `generate-upgrade-data.ts`, `compute-deck-ratings.ts`, `detect-dead-weight.ts`, `export-sqlite.ts` open `data/oracle.db`; none of them mention `oracle_id` (they key by card name) [Confirmed: grep]. `scripts/transform-data.ts` lists `card_definitions` in its one-time list of tables to move into Postgres (line 40) and `scripts/load-postgres.ts` loads them; neither refers to `oracle_id` by name, so whether the one-time move changed the value is **not shown by code**; the hosted result below settles it.
- The hosted table `card_definitions` was renamed `user_cards` (migration `20260730032938_rename_card_tables.sql`) and `20260907061101_drop_legacy_oracle_id_unique_constraint_v2.sql` shows the same column.

**Hosted live data (the real test):**
- `user_cards` has 2,650 rows; **all 2,650** `oracle_id` values exist as a real `oracle_id` in hosted `ref_printings`; **0** equal a printing id; **0** match neither [Confirmed: read-only REST check 2026-11-06].
- Hosted `ref_printings.oracle_id` for both commanders equals Scryfall's value: `b20d74a4-0e08-4779-972a-499f1a2be15a` (Mendicant Core, Guidelight; 5 printings including dft #213, #365, #485) and `eada96a1-4964-4ad0-b0e3-2df08d6ae188` (Wilhelt, the Rotcleaver; 6 printings including mic #2, #40). [Confirmed: hosted read] Note a second Mendicant name, "Mendicant Core, Guidelight // Mendicant Core, Guidelight" (set `adft`, 2 printings), carries a different oracle id `87128bfa-2d2f-48c8-803b-c1998111684b`; a lookup by name alone would find two oracle ids for Mendicant; use the id, not the name.
- Live paths that use `user_cards.oracle_id` as card identity (collection roll-up, instances, add-proxy, export, onboarding stream, card actions) read hosted data, which is correct [Confirmed: `src/app/api/collection/rollup/route.ts:181`, `.../instances/[oracleId]/route.ts:71`, `.../instances/add-proxy/route.ts:55`, `.../collection/export/route.ts:56`, `.../onboarding/collection-stream/route.ts:170`, `.../decks/[id]/card-actions/[cardName]/route.ts:143`].
- **Verdict: the live app is not affected.** The problem exists only in the old local file, which no live path reads. Rule for the trial: never take identifiers from `data/oracle.db`; V-03 and V-09 take them from hosted `ref_printings` only.

## 4. The ten import migrations and T-57's migration

`supabase migration list --linked` (CLI 2.75.0) shows all ten applied on hosted, same timestamp in both columns:

| Migration | Hosted |
|---|---|
| 20261020120000 deck_import_per_copy_attributes | applied |
| 20261020120100 ref_printings_finishes | applied |
| 20261021120000 deck_cards_is_generic | applied |
| 20261021130000 generic_basics_rpcs | applied |
| 20261023140000 deck_card_alerts | applied |
| 20261023150000 ref_precons_cards | applied |
| 20261023160000 import_deck_with_intent | applied |
| 20261023170000 deck_cards_command_zone_role | applied |
| 20261023170100 set_deck_command_zone | applied |
| 20261023170200 import_deck_with_intent_roles | applied |

- This agrees with `docs/oracle/reports/2026-11-04-architect-import-migrations-verification.md`; the "ten NOT applied" lines in `status.md` and the plan are stale. The last row of the hosted list is 20261023170200; **nothing sorts after it** [Confirmed: command output; 75 local migration files, none after 20261023170200].
- **T-57's migration (`20261013120000_deck_import_row_finish.sql`) is not applied on hosted and is not in the current working tree.** It exists only on branch `t57-deck-import-foil` (preserved as commit 21058b7, "wip: preserve uncommitted work ... before archiving") [Confirmed: git]. Its timestamp sorts **before** the ten that are already applied, so if it were ever applied it would need an out-of-order push and would replace `replace_deck_with_new_cards`, which the newer import work may have superseded. Not for this trial; flagged for Gene.
- **Consequence for the trial:** the ordering rule (contract §1.5) is satisfied as things stand. The trial migration takes the next number after `20261023170200` (V-09 chooses; it must be later than any file merged to main by then). No waiting migrations block A3.

## 5. Name to `oracle_id` pairs in `ref_printings`

Full read of all 119,985 printing rows, 2026-11-06 [Confirmed: hosted read]:

| Measure | Value |
|---|---|
| Printing rows | 119,985 |
| Distinct `oracle_id` | 39,408 |
| Distinct (name, `oracle_id`) pairs | 39,408 |
| Distinct names | 38,901 |
| `oracle_id` values with more than one name | 0 |
| `oracle_id` values equal to any `scryfall_id` | 0 |
| Names with more than one `oracle_id` | **223** |
| Of those, ones where at least one id is not a token/emblem | 131 |

- Every `oracle_id` maps to exactly one name; the reverse is not true. 223 names map to several ids: mostly tokens ("Spirit" has 23, "Bird" 13) but 131 involve real cards, for example "Ornithopter", "Llanowar Elves" (card plus token), "Pick Your Poison" (two normal-layout cards), "Inferno", "Blink", "The Superlatorium" (six normal-layout cards). Layouts include 2,775 `art_series` rows and 140 `emblem` rows.
- **Consequence:** resolving EDHREC card names to `oracle_id` by name alone is ambiguous for those names. V-04/V-09 must (a) prefer the non-token, legal-in-commander row and (b) count any unresolved or ambiguous names as "unresolved" rather than picking one silently. Whether any of the 223 collide with names in the three trial builds cannot be known until the builds have cards (section 1).
- The exact list of the 223 names was not saved to a file (read-only slice); V-09 or the Tester can regenerate it.

## 6. Feasibility of a throwaway local copy (contract §1.5 option 2)

**Not feasible on this machine today; feasible after installing tools.** [Confirmed: shell checks]
- No `docker` (the Supabase CLI's local database needs it), no `psql`, `pg_dump`, `postgres` or `pg_ctl` on the PATH, and no Postgres or pgvector in `/opt/homebrew/opt`. The Supabase CLI is installed (2.75.0).
- Disk: 19 GiB free of 460 GiB (96% used). The trial's reads are small (the text and ids of about 120,000 printings plus build lists), so space is probably enough but is tight for a Docker image set [Approximate].
- Routes if the owner chooses option 2: (a) install Docker Desktop and run `supabase start` (applies all 75 migrations, including the ten, into an empty database; a local copy of reference data would then have to be loaded from the hosted tables, a read-only export), or (b) install Postgres 17 with pgvector through Homebrew and load only the four reference tables the trial reads. Both are installs on the owner's machine; neither was done here. (c) A second, separate hosted Supabase project (the CLI account lists other projects, none is the Oracle one); not checked for plan limits.
- The contract's own risk stands: with a local copy, the real build data for the trial would exist only locally, and the sync must be pointed at the copy (§1.4).
- **Recommendation for A3:** wait for the section 2 result. If pgvector is available online, option 1 (online database; nothing else needs to settle first, since the ten are already applied) is the shortest route and the trial's tables are additive and removable. Choose option 2 only if the owner wants the online database never to be changed at all.

## Changed files
- docs/oracle/reports/2026-11-06-architect-v02-kickoff-checks.md — this report (the only file touched)

## New decisions made (need owner confirmation)
- Which route for A3: online database after the section 2 check (recommended), or a local copy that needs new software installed. None made here.

## Assumptions
- The project in `supabase/.temp/project-ref` is the production database [Approximate].
- The service key already in `.env.local` is acceptable for SELECT-only reads; if not, the Tester should repeat sections 1, 3 and 5 on a read-only role.
- `ref_build_cards` being empty is the real state, not an access artefact: a direct select returned `[]` and the count header read 0 with the same key that returned 1,885 build rows and 119,985 printings.

## Challenges to locked decisions
- none (the old-database identifier problem is outside every locked decision's live path; D-003 holds for the live app on hosted data)

## Open questions
1. Does hosted Postgres list `vector` in available extensions (section 2)? Owner or Developer must run the check; blocks A3 only if "no".
2. Why is `ref_build_cards` empty for all 1,885 builds, and is something (cleanup script, a failed run) expected to refill it? Gene to confirm before V-06.
3. Status docs need correcting: `status.md` and the plan still say the ten migrations are pending (Gene's file).
4. Disposal of the T-57 branch/migration (superseded or to be re-timestamped) is a separate decision for Gene.
5. Option 2 requires installing Docker or Postgres; does the owner want that?

## Verification
- `supabase migration list --linked` — all ten applied; last hosted version 20261023170200; no remote-only or local-only rows beyond what the 2026-11-04 report records.
- REST GETs (SELECT only) on `ref_commanders`, `ref_commander_builds`, `ref_build_cards`, `ref_edhrec_recommendations`, `ref_commander_cards`, `ref_commander_insights`, `ref_printings`, `user_cards` — results above; no writes.
- `sqlite3 -readonly data/oracle.db` — schema and identifier comparison above.
- Not run: pgvector extension read (no access); `npm run check` (no code changed).
