# Full-app audit, area: stored data, scripts, cron, flags, dependencies, tests, dead code

Role: Developer (read-only audit). Branch `main`, HEAD `127e472` (2026-11-26). Nothing in the repo was changed except this file. No commit, no push, no install, no delete.

How the checks were run (all outputs and caches in a temp folder outside the repo, repo status compared before and after each run: unchanged):
- knip (via npx) twice: once counting tests as entry points (finds files nothing imports at all), once in "production" mode with only `src/app` pages and routes, `middleware.ts` and `scripts/` as entry points (finds code the running app and scripts never reach). Playwright plugin switched off because `playwright.config.ts` throws unless `E2E_ISOLATED=true`.
- depcheck (via npx) as a cross-check on dependencies.
- `supabase migration list --linked` (the read-only history listing the project already used in commit `c350c5c`) for the hosted migration ledger. No SQL was run against the hosted database, so table contents, row counts and whether a draft was applied by hand (SQL editor) could not be read directly.
- Test suites were not re-run. Last recorded result in git: 4,675 tests pass, 0 type errors, 1 existing lint error (commit `d49ff8f`, 2026-11-25) [Confirmed: git log].

## Headline numbers

| Item | Count |
|---|---|
| Source files under `src/` (ts, tsx, css) | 1,168 (772 app files, 396 test files) |
| Lines under `src/` | about 204,500 (139,100 app, 65,500 test) |
| Scripts (`scripts/`) | 59 files, 16,253 lines |
| Local migrations / hosted ledger | 110 local files; 83 match the hosted ledger; 27 local-only; 17 remote-only |
| Draft files in `supabase/drafts/` | 57 files (6,274 lines) |
| Files nothing imports, not even a test (knip) | 23 files, 3,247 lines |
| Files the running app never reaches (knip production mode) | 62 files, 8,183 lines; 24 test files (3,322 lines) test only these |
| API routes with no caller anywhere in app code | 36 of 182 routes (4,931 lines, plus tests 2,234 lines) plus 1 scheduled-only route (116 lines) |
| Unused exports / types | 569 in 206 files; 14 duplicate-alias export groups |
| Unused npm packages (confirmed) | 6 of 52 (`@phosphor-icons/react`, `@tanstack/react-query-persist-client`, `next-themes`, `youtube-search-without-api-key`, `youtube-transcript`, `youtubei.js`); `cmdk` only used by an unused file |
| Tests skipped | about 26 cases in 12 files (about 7 files skip all or nearly all tests); 9 e2e conditional skips |
| Stored-data drafts with status unverified | 5 (Strategy window fields S3, Claude change reason S4, Claude replaces Strategy S5, card-tag tables, trade-location flag) |

Removable share, rough: knip-unreachable app code 8,183 lines plus no-caller routes 4,931 lines is about 13,100 lines, or 9.4% of the 139,100 app lines (with their tests, about 18,600 lines). Add scripts that target removed tables or a local SQLite file (about 6,200 lines, section 2) and the share is higher. These figures overlap in places and a share of it is "paused, not dead" (AI chat), so treat the owner-decision candidates in section 8 separately from the safe ones.

---

## 1 Stored-data audit

### 1.1 Hosted migration history mismatch (OPEN POINT, not decided here)

Owner decided earlier to leave this alone. Facts from `supabase migration list --linked` run 2026-11-26 [Confirmed: command output]:
- 83 versions are in both the local folder and the hosted ledger (everything from `20260730032938` to `20261116035529`, plus `20261116062746`, except the items below).
- 27 local migration files have no entry in the hosted ledger. They were applied another way (owner SQL editor or Gene's connection), per the backlog. Versions: `20261111120000`, `20261112120000`, `20261113100000`, `20261113100100`, `20261113130000`, `20261116100000`, `20261116100100`, `20261116110100`, `20261116120000`, `20261116130000`, `20261116130100`, `20261116140000`, `20261116150000`, `20261116150100`, `20261116150200`, `20261116150300`, `20261116170000`, `20261116190000`, `20261116200000`, `20261117100000`, `20261117120000`, `20261117200000`, `20261117200100`, `20261120110000`, `20261120120000`, `20261121100000`, `20261122120000`.
- 17 hosted ledger entries have no local file: `20261111053539`, `20261112065224`, `20261113020541`, `20261115230056`, `20261115230105`, `20261115230241`, `20261115230258`, `20261116002842`, `20261116003115`, `20261116003621`, `20261116004055`, `20261116014823`, `20261116030615`, `20261116030622`, `20261116062246`, `20261116084751`, `20261125015400`. Their timestamps look like the same changes recorded under auto-generated versions (for example the picklist and chat-proposal changes of 11-11 to 11-16), but that pairing is [Approximate]: contents were not compared.
- Consequence: a blanket `supabase db push` is unsafe (already warned in the backlog for T-57). `supabase/reconciliation/README.md` is last checked 2026-09-03 and says nothing about November.
- Open for the owner: whether to ever repair the ledger. Not decided here.

### 1.2 `supabase/drafts/` versus `supabase/migrations/`

57 files. State per group. "Applied" means the backlog or the file header says applied; "not verified" means I could not confirm against the hosted database.

| Draft file(s) | State | Evidence | Note |
|---|---|---|---|
| 18 `*.rollback.sql` files whose forward migration is in `migrations/` (CC-03a/b/c, connector, AI edit, CC-13, CC-15a/b, CAT-01, why-here, card-why, deck health settings, deck order) | Applied; undo scripts kept on purpose | Same version exists in `supabase/migrations/` [Confirmed: file names] | Keep. They are the undo path. |
| `20261116130000_connector_connections.draft.sql`, `20261116130100_oauth_client_tokens_no_writes.draft.sql` | Applied, stale duplicate of the promoted migration | Promoted copies in `migrations/` (second one differs from the draft) | The promoted `20261116130000` file still starts with "DRAFT ... NOT APPLIED" in its header [Confirmed: migrations/20261116130000_connector_connections.sql line 1]. Misleading header. |
| `insert_user_copies_to_deck.draft.sql` (166 lines) | Applied, stale duplicate | Reviewed version is `migrations/20261116062746_insert_user_copies_to_deck.sql`, applied 2026-11-16 per its header and backlog I2 | Its header still says "NOT APPLIED". |
| `20261116110000_drop_dead_collection_rollup.sql`, `.rollback.sql`, `.applied.rollback.sql` | Applied (functions and view dropped), but the forward file is not in `migrations/` and not in the hosted ledger | Backlog CC-03b: "DROPPED after definitions captured"; AGENTS.md says the function was removed 2026-11-16 | Header still says "NOT APPLIED". `src/types/supabase.ts` still lists `get_collection_rollup`, `get_shared_cards` and the `collection_rollup` view (stale types). |
| `20261118100000_rename_trade_binder_to_black_binder.sql` | Applied live 2026-11-18 (header says so) | Data-only rename | One-off. Not a schema change. |
| `20261117200200_cc16_picklist_and_boxes.draft.sql` (157), `20261117200300_cc17_import_deck_list.draft.sql` (55), `20261117200400_cc18_wishlist.draft.sql` (80) | Not applied. Approved work "planning underway" | Backlog "Approved work being progressed": import via Claude, storage and Picklists via Claude, wishlist (not built) | Started and left (section 9). Nothing in `src/` references `ai_picklist`, `ai_import_deck_list` or `wishlist_items`. |
| `20261118120000` to `20261118120400` roles DB-1 to DB-5 (`ref_card_roles`, `user_card_roles`, `deck_card_jobs`, `deck_strategy_points`, `deck_health_targets` plus functions) with rollbacks | Applied live, empty, and unused. Headers still say "NOT APPLIED" | Architect audit 2026-11-19: "applied live and empty [Confirmed: live]"; D-063 drops the plan "in principle" and says "its empty tables stay until a separate approved cleanup" | Zero references in `src/` or `scripts/` to the five table names [Confirmed: grep]. Candidate R-09. |
| `20261118140000_roles_db6_deck_strategy.draft.sql` (856 lines) + rollback, `20261118140100_roles_db6b_copy_win_conditions.draft.sql` + rollback | Not applied, abandoned | Architect audit 2026-11-19 section on DB-6: "Discard (keep the file for history; mark SUPERSEDED, never apply)"; D-063 drops CC-26 | 969 lines in 4 files. Needs a SUPERSEDED mark or archive; owner has not formally confirmed. |
| `20261118130000_cc25_trade_locations.draft.sql` (adds `user_locations.is_trade`) + rollback | Not verified. App code reads `is_trade` and tolerates its absence | `collection-query.ts` line 62 to 67 ignores an error that mentions `is_trade`; rehearsal scripts after it assume it is applied; backlog.md still lists "Add a trade binder location type" as unfinished | Cannot tell from files alone. |
| `20261119100000_s3_strategy_window_fields.draft.sql` (adds `deck_strategy.summary` and `updated_by`, bracket 1 to 5) + rollback | Not verified, probably applied | Header "NOT APPLIED"; backlog DV-02 says "not verified"; `s5` report says "S3 and S4 stay applied"; later applied migrations (`why_here`, `card_why`) were rehearsed on a base that includes S3 to S5; `deck-strategy-window-server.ts` reads the new columns and comments that "the owner applies [it] later" | Backlog flagged this as unverified. Still unverified. |
| `20261119110000_s4_claude_change_reason.draft.sql` (table `ai_change_reasons`, function `ai_record_change_reason`) + rollback | Not verified, probably applied | `write-gateway.ts` calls `ai_record_change_reason` and reads `ai_change_reasons` | Same as above. |
| `20261119120000_s5_strategy_replace.draft.sql` + rollback | Not verified | Report 2026-11-20 "S5, NOT applied"; D-062 describes the behaviour as decided | Same as above. |
| `20261120100000_tags_fill_tag_tables.draft.sql` (tables `ref_tag_list`, `ref_card_tags`) + rollback | Not verified, probably applied | Card details route, connector card-tags tool and search read `ref_card_tags`; `fill-card-tags.ts` refuses to run until the tables exist | `ref_tag_list` is read only by the fill script. Fill job (25,558 of 32,643 cards in the rehearsal) may never have been run on the hosted DB. |
| `20261122120000_deck_order.rehearsal.sql` | Rehearsal script for an applied migration | Backlog UX-03 applied | Keep or archive. |
| `cc14-backfill-ref-cards.ts`, `.README.md`, `.manifest.json` (768 lines), `.rollback.sql` | Not applied. Owner approval pending | README: "NOT applied, needs owner approval"; backlog: "Fill in missing card information ... Approved 2026-11-18; build started" | Supported by `src/lib/ref-card-backfill*.ts` (416 lines) with 508 lines of tests, which knip finds unreachable from the app because only this draft script imports them. |

`supabase/reconciliation/` (80 files, 5,439 lines): archive of pre-ledger histories plus two never-applied "pending-local" drops (`drop_ref_rulings`, `drop_deck_documentation`). README says do not delete until a clean schema can be replayed (rule 2 there). Keep. `scripts/migrations/add-ref-rulings.sql` (45 lines) predates the applied `20260731011347_add_ref_rulings.sql` and looks superseded [Approximate].

### 1.3 Tables nothing in the app reads or writes

Method: table names from migrations, drafts and `src/types/supabase.ts` (68 names), searched in `src/` (excluding generated types and tests) and `scripts/`. Hosted existence and row counts could not be read. `src/types/supabase.ts` (2,670 lines) is stale: it lacks the connector tables, `move_items`, `chat_card_proposals`, `deck_card_alerts`, `ref_card_tags`, `deck_health_*`, and still lists dropped objects.

| Table | App reads or writes | Scripts | Notes |
|---|---|---|---|
| `ref_card_roles`, `user_card_roles`, `deck_card_jobs`, `deck_strategy_points`, `deck_health_targets` | None | None | CC-26 DB-1 to DB-5, applied, empty (R-09). |
| `deck_strategy_items`, `deck_job_serves` (DB-6) | None | None | Never applied. |
| `wishlist_items` (CC-18) | None | None | Never applied. |
| `commander_content`, `commander_strategies` | None | None | In generated types, no migration creates them (pre-ledger). Probably leftover from the research content pipeline whose input folder `research/commander-content/` no longer exists. State on hosted DB unknown. |
| `debrief_sessions`, `debrief_actions`, `deck_priority` | None | Only legacy transform/load/export scripts | Roadmap item O-004 (post-game debrief) "not specced". Probably empty. |
| `precon_cards`, `precon_mod_state` | None | `sync-precons.ts`, `apply-precon-migration.ts` | The app reads `ref_precons` instead (2 files). |
| `ref_edhrec_recommendations` | None | `sync-edhrec-*` scripts | Created by migration `20260805195645`; app reads builds and insights instead. |
| `sync_runs` | None | `sync-*` scripts | Log table written by scripts only. |
| `deck_leaderships`, `deck_leadership_cards` | None | None | Renamed to commanders by `20260730214119`; names remain in the migration chain only. |
| `deck_documentation` | Only `/api/dev/reset` | Legacy scripts | Never-applied drop sits in `supabase/reconciliation/pending-local/`. |
| `oracle_to_printings`, `printing_set_info` | None | `seed-scryfall-bulk.ts` (the `npm run seed:scryfall` script), `seed-oracle-to-printings.ts` | No migration creates them and they are absent from generated types: probably gone from the hosted DB, so the npm script likely fails [Approximate]. |
| `_migrations` | None | 2 scripts | Legacy bookkeeping table from the SQLite era (in generated types). |
| `deck_mana_analysis`, `deck_ratings`, `deck_upgrades`, `upgrade_change_log`, `deck_overview_content`, `deck_combos`, `deck_health` | Yes, by routes | Legacy scripts | Written by app routes, but several of those routes have no caller (section 7): `/api/decks/[id]/mana`, `/overview`. Worth a second look by the decks agent. |
| `brew_sessions`, `oracle_sessions`, `oracle_messages` | Yes, by AI chat routes | Yes | Only reachable while AI chat is on (paused, D-063). |

### 1.4 Database functions nothing calls from the app

Method: 108 function names created in migrations, searched in app code (excluding generated types and tests). Internal helpers and trigger functions (names starting `_`, `validate_*`, `*_updated_at`, `decks_set_position`, `compute_card_diff`, `user_copies_keep_one_place`, `deck_cards_copy_must_be_available`, `create_deck_location`, `update_deck_location_name`) are called inside SQL and are not listed. Public functions with no app caller found:

| Function | Evidence | Note |
|---|---|---|
| `get_import_allocations` | Only contracts and docs; replaced by `get_import_reconciliation` (called by the app) in the 2026-09-26 redesign migration | Superseded. |
| `get_import_conflicts`, `resolve_import_conflict_proxy`, `resolve_import_conflict_release`, `set_import_claim_resolution` | Only contracts and docs | Earlier import-conflict model. The app calls `set_import_claim_state`, `set_import_claim_printing`, `set_import_claim_wishlist`, `finalize_import_claims` instead. |
| `mark_copy_missing`, `unmark_copy_missing` | No app caller; Missing is handled by `resolve_missing_copy` and the picklist routines | D-028 retired the old Missing actions. |
| `delete_user_copies` | Only docs | Batch delete; the app calls `delete_user_copy` and `delete_user_copies` is not used. Locked down in CC-03a. |
| `get_next_deck_version_number`, `archive_old_oracle_sessions` | No app caller | Old deck-version and chat-session housekeeping. |

I could not check which of these still exist on the hosted database (several were redefined or dropped across later migrations), so removing any needs the hosted state first.

### 1.5 Other stored-data notes
- `data/` holds 699 MB locally, of which 3 tracked files are the 34 MB snapshot in `data/commander-context/` (R-07), 124 tracked files are `data/knowledge/` (688 KB), and the rest is git-ignored local copies (`AllPrintings.sqlite` 650 MB, `oracle.db` 11 MB from July, CSV exports, `scryfall-tags/` 22 MB which `fill-card-tags.ts` and `scryfall-tags-data.ts` read).
- `.git` is 204 MB (72 MB packed), with 23 stray temporary object files ("garbage found"). Not a problem for the app; a `git gc` would clear them. Not done.

---

## 2 Scripts and cron

### 2.1 Scheduled jobs

| Job | Where | Purpose | State |
|---|---|---|---|
| `/api/cron/refresh-prices`, daily 06:00 UTC | `vercel.json` (only entry) | Despite the name it does not touch prices. It asks Scryfall for every owned card name and upserts mana cost, mana value and type line into `ref_cards`. Fail-closed without `CRON_SECRET`. [Confirmed: `src/app/api/cron/refresh-prices/route.ts`] | Mislabelled. Owner direction 2026-10-11: no Vercel for now, so it probably never runs; whether Vercel still deploys could not be verified. Real price refresh is `POST /api/collection/refresh-prices` (button). A second Vercel cron, `sync-scryfall`, was removed 2026-11-17 [Confirmed: report cc04d-leftovers]. |
| Sync Commanders, daily 06:00 UTC | `.github/workflows/sync-commanders.yml` runs `scripts/sync-commanders-daily.ts` | Pull new legendary creatures from Scryfall into `ref_commanders` | Switched off on GitHub 2026-10-11 per backlog T-43. I could not confirm the live GitHub state. |
| Sync EDHREC Data, weekly Sunday 07:00 UTC | `.github/workflows/sync-edhrec.yml` runs `scripts/sync-edhrec-data.ts` | EDHREC commander data | Switched off (T-43). Script last changed 2026-09-12; builds sync (`sync-edhrec-builds.ts`) is the newer path and is not scheduled. |
| E2E Tests | `.github/workflows/e2e-tests.yml` | Playwright run | Switched off (T-43). Failed on the last push per backlog T-45. |
| Shared Read-only Smoke, weekdays 08:17 UTC | `.github/workflows/shared-readonly-smoke.yml` | Read-only smoke against a shared environment | Switched off (T-43). |
| Supabase scheduled jobs (`pg_cron`) | none in migrations | | None exist in the migration chain. Edge functions: none deployed per reconciliation README (2026-09-03). The pre-ledger archive holds `ck-price-refresh` (Card Kingdom, removed by D-040) and `scryfall-sync`. |

### 2.2 Every script in `scripts/`

"Last change" is the last git commit touching the file. Many files share one bulk commit date (2026-08-12), so it says little. "Doc mention" is the latest dated report or doc that names the script [Approximate]. Only 5 scripts are wired into `package.json` or a workflow.

Groups and totals: A legacy SQLite-to-Postgres pipeline 2,897 lines; B scripts that target tables that no longer exist 655; C one-off fixes and audits 2,613; D commander insight and taxonomy generators 2,129; E EDHREC and precon syncs 3,140; F mapping data used only by E and D 2,661; G live or recently used 2,099.

| Script | Lines | Purpose | Last change | Doc mention | State |
|---|---|---|---|---|---|
| sync-scryfall-printings.ts | 63 | `npm run sync:cards`; runs `src/lib/card-data-sync` | 10-20 | 11-16 | G. Live, manual |
| export-commander-context.ts (+ `tsconfig.export-commander-context.json`) | 892 | `npm run export:commander-context`; builds the 34 MB snapshot | 09-12 | none | G. Used once (snapshot dated 2026-09-12). Only needed if `COMMANDER_CONTEXT_SOURCE` is set (R-07) |
| sync-commanders-daily.ts | 427 | Daily commander sync (workflow, off) | 11-18 | 11-18 | G. Used recently by hand; schedule off |
| sync-edhrec-builds.ts | 993 | EDHREC tags and build cards | 10-11 | 11-11 | G. On demand; build cards still empty for most commanders (RQ-08 proposes the load) |
| fill-card-tags.ts | 176 | Fill `ref_card_tags` from local Scryfall tag copy | 11-20 | 11-20 | G. Not known to have been run on the hosted DB |
| check-deck-status-readonly.ts | 52 | Read-only check that deck status matches sleeved counts | 11-18 | 11-18 | G. Live check |
| backfill-commander-flags.ts | 76 | One-off, flag commander cards | 11-02 | 11-02 | C. Done |
| sample-edhrec-typical-numbers.ts | 125 | Deck health S2 sampling of EDHREC average decks | 11-11 | 11-11 | C. Done |
| create-test-user.ts | 110 | Playwright test user | 08-14 | 10-11 | G. Only needed if e2e is switched back on |
| dev-test.sh, env.testdb.example | 30, 10 | Run the app on a test database (port 3100) | 10-23 | 10-23 | G. On demand |
| validate-allocation-resolver.ts | 273 | Read-only run of the allocation suggestion engine on real data | 10-11 | 10-11 | G. On demand; D-007 retired the writer, this checks the suggester |
| check-insight-status.js, generate-coverage-report.js | 53, 187 | Insight coverage and traffic-light report | 11-16 | 11-16 | D. Touched 11-16 (server-key change CC-03c). Input DB `research/commander-content/content-raw.sqlite` no longer exists [Confirmed: folder absent] |
| generate-coverage-report.ts | 129 | Older TypeScript copy of the same report | 09-12 | none | D. Duplicate of the `.js`; same missing input |
| distill-commander.ts, distill-single-commander.ts | 286, 269 | Commander insights from raw content | 11-16, 09-12 | 11-19 | D. Input folder missing |
| generate-commander-insights.ts | 372 | AI "brewer's notes" per build | 08-18 | none | D. Stale |
| generate-all-commanders.ts | 512 | Pre-generate `ref_commanders` | 11-18 | none | D. Touched 11-18, no report mentions it |
| migrate-commander-taxonomy.ts, backfill-insight-taxonomy-tags.ts, seed-taxonomy.ts, build-scryfall-tag-index.ts | 181, 86, 264, 159 | Taxonomy build and backfill | Aug to Oct | Oct | D. One-off, done |
| sync-user-commanders.ts | 528 | EDHREC data for the owner's commanders | 10-11 | 10-11 | E. On demand, last Oct |
| sync-edhrec-data.ts | 836 | EDHREC sync (workflow, off) | 09-12 | 10-23 | E. Schedule off |
| sync-additional-commanders.ts, sync-commander-rankings.ts, sync-precons.ts | 179, 182, 297 | EDHREC extras, rankings, precons | Aug to Oct | Oct | E. On demand |
| archetype-detection-rules.ts, edhrec-tag-mappings.ts, scryfall-tag-mappings.ts, theme-archetype-mappings.ts | 650, 970, 268, 773 | Mapping tables | Aug | Oct | F. Imported only by D and E scripts, not by the app |
| export-sqlite.ts, transform-data.ts, load-postgres.ts | 193, 311, 659 | July SQLite-to-Postgres move | Jul to Aug | 11-16 | A. Source file `data/oracle.db` is dated 2026-07-06; targets `deck_documentation`, `upgrade_change_log`, etc. |
| generate-mana-data.ts, generate-upgrade-data.ts, compute-deck-ratings.ts, detect-dead-weight.ts | 128, 478, 449, 482 | Read `card_metadata` and `oracle.db` | Jul to Nov | Oct | A. `card_metadata` dropped by `20260730070439`; last two import `../src/lib/concurrency-limiter`, which does not exist: broken [Confirmed: knip unresolved] |
| export-cards-with-oracle-text.ts, apply-category-migration.ts, apply-precon-migration.ts | 81, 43, 73 | `mtg_cards` and `card_metadata` helpers | Aug | none | A. Targets removed tables |
| seed-scryfall-bulk.ts (`npm run seed:scryfall`), seed-oracle-to-printings.ts | 222, 189 | Fill `oracle_to_printings` | 10-11 | 10-11 | B. Table not in migrations or types (1.3) |
| sync-card-keywords.ts, test-commander-resolver.ts | 128, 116 | Keywords from local `AllPrintings.sqlite`; resolver test | Jul to Aug | 11-16 | B. Old |
| fix-commander-legality.ts, fix-invalid-scryfall-ids.ts, backfill-can-be-commander.ts, backfill-deck-commander-ids.ts, cleanup-corrupted-edhrec-insights.ts, normalize-insight-values.ts, sync-sephiroth.ts | 189, 232, 189, 63, 206, 155, 111 | One-off data repairs (Aug) | Aug | none | C. Done; no report mentions them |
| db-audit.ts, audit-commander-data.ts, audit-user-commanders.ts, check-archetype-coverage.ts, check-build-tags.ts, detect-staples.ts, enrich-build-archetypes.ts | 108, 260, 79, 57, 77, 205, 313 | Ad-hoc audits | Aug | none | C. Done |
| `scripts/migrations/add-ref-rulings.sql` | 45 | Old SQL (see 1.2) | | | Stale |

Also: 43 script and test files import `dotenv`, which is not in `package.json` (it is present only through another package) [Confirmed: knip and depcheck].

---

## 3 Flags and environment variables

Read from code with `process.env`; "set" refers to local `.env.local` (names only checked, no secret values read). Hosted (Vercel) settings could not be seen.

| Name | Read in | Set locally | State |
|---|---|---|---|
| `NEXT_PUBLIC_AI_CHAT_ENABLED` | `src/lib/ai-chat-switch.ts` (single reader); test setup forces `true` | No (so the in-app chat is paused) | LIVE switch, currently OFF. D-063. Gates the AI chat sidebar, `/new-deck`, 11 API routes (section 7) and the Brew tools menu entries. |
| `NEXT_PUBLIC_IMPORT_INTENT_SAVE` | `components/manabox-import/import-copy.ts` | Yes, `true` | Redundant now. The comment says "off until migration M2 is applied"; `20261023160000_import_deck_with_intent` is applied and in the hosted ledger. If unset on Vercel, Built/Planned imports cannot be saved. Not in `.env.local.example`. Candidate to turn into a constant. |
| `DECK_DESTINATION_ENABLED` (code constant, always `true`) | `lib/import-destination.ts`, `api/import/destinations` | n/a | Dead flag: the `false` branch is never used. Its own comment says it is on since 2026-11-16. |
| `ORACLE_DECK_CHAT_EDIT_TOOLS` | `lib/tool-registry.ts` | No | Off by default; only matters for the deck chat, which is paused. Dead while D-063 stands. |
| `COMMANDER_CONTEXT_SOURCE`, `COMMANDER_CONTEXT_MANIFEST_PATH` | `lib/commander-context/*` | No (default `supabase`) | Snapshot and shadow modes are unused in practice (R-07). Documented in `.env.local.example`. |
| `CRON_SECRET` | `api/cron/refresh-prices` | No | Only matters if the Vercel cron runs. `.env.local.example` comment is stale: it names `/api/collection/prices/refresh` and says it allows unauthenticated access; the real cron route is fail-closed. |
| `NEXT_PUBLIC_SITE_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | `components/connector/connector-address.ts`, `lib/connector/errors.ts` | No | Live for the Claude connector address; falls back to `http://localhost:3000` locally. |
| `NEXT_PUBLIC_APP_URL` | `lib/tool-registry.ts` line 441 only | No | Minor; falls back to localhost. Not in the example file. |
| `NEXT_PUBLIC_APP_VERSION` | TopNav, MobileHeader | No | Shows `v0.1.0` while `package.json` says 0.2.0. Cosmetic drift. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Many | Yes | Live. |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` | Brew and chat routes, `provider-factory.ts`, adapters | Yes | Used only by AI chat code, which is paused. Keys are set although the feature is off. |
| `LOCAL_AUTO_LOGIN_EMAIL`, `LOCAL_AUTO_LOGIN_PASSWORD` | `lib/local-auto-login.ts` | Yes | Live, development only. |
| `SUPABASE_DEFAULT_USER_ID` | nothing | Yes | Dead. Not read anywhere in `src/`, `scripts/` or `tests/`. |
| `YOUTUBE_API_KEY` | `research/scripts/*` only | No | Dead for the app; in `.env.local.example`. |
| `SUPABASE_EDGE_FUNCTION_URL` | nothing | No | Dead (Card Kingdom edge function removed, D-040); in `.env.local.example`. |
| `E2E_MODE`, `E2E_ISOLATED`, `E2E_BASE_URL`, `E2E_VERCEL_PROTECTION_BYPASS`, `E2E_MANUAL_PREVIEW_ACCESS`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `CI` | `playwright.config.ts`, e2e specs | `.env.test.local` | Live only for e2e, which is off. |
| `RUN_LIVE_RPC_TESTS`, `RUN_LIVE_CONNECTOR_TESTS`, `CONNECTOR_TEST_TOKEN`, `CONNECTOR_BASE_URL` | opt-in tests | No | Test switches, off by default. |
| `SKIP_SLOW`, `PLAN_DIR`, `PGLITE_MODULE` | `tests/db-perf/reconciliation-perf.mjs` | No | Needs `@electric-sql/pglite`, which is not installed (3.4). |
| `PSQL_BIN`, `CC14_OWNER_APPROVED`, `TEST_DB_CONFIRMED`, `ENV_FILE`, `SQLITE_DB_PATH`, `COMMANDER_CONTENT_DB_PATH` | Scripts and drafts | No | Script-only. `COMMANDER_CONTENT_DB_PATH` default points at a missing folder. |
| `NX_DAEMON`, `TURBO_*`, `VERCEL_*`, `VERCEL_OIDC_TOKEN` in `.env.local` | nothing in the repo | Yes | Noise from `vercel env pull`. A backup `.env.local.bak-20260912205154` also sits in the folder. Both are git-ignored. |
| `NODE_ENV`, `VERCEL`, `VITEST`, `USER` | Standard | | Standard. `/api/dev/reset` relies on `NODE_ENV` alone (R-10). |

---

## 4 Dependencies (`package.json`)

Evidence: knip plus depcheck plus a text search of `src`, `scripts`, `tests` and config files.

| Package | Verdict | Evidence |
|---|---|---|
| `@phosphor-icons/react` | UNUSED | No import anywhere (including `research/`, `docs/`). Added or left from early work; no recent mention. |
| `@tanstack/react-query-persist-client` | UNUSED | No import. (Persistence of the query cache is not wired.) |
| `youtube-search-without-api-key`, `youtube-transcript`, `youtubei.js` | UNUSED by the app | Imported only by `research/scripts/fetch-*.ts` (not part of the app or tests). Added 2026-07-14 checkpoint. Removing them breaks only those research scripts. |
| `next-themes` | UNUSED | Only mentioned in two test files that mock it (`Sidebar.test.tsx`, `accessibility.test.tsx`). No `ThemeProvider` in the app. |
| `cmdk` | Used only by an unused file | Imported only by `src/components/ui/command.tsx`, which nothing imports. |
| `class-variance-authority` | Used | `ui/tabs.tsx` and others (one of the users, `ui/input-group.tsx`, is unused). |
| `keyrune`, `mana-font`, `shadcn`, `tw-animate-css`, `tailwindcss`, `@tailwindcss/postcss` | Used (false alarms in knip and depcheck) | Imported from `layout.tsx` and `globals.css`, `postcss.config.mjs`. |
| `sharp` | Likely used by Next image optimisation; no import in code | [Approximate] keep. |
| `better-sqlite3`, `@types/better-sqlite3` | Used, but only by the commander-context snapshot reader, `export-commander-context.ts`, and one skipped test | R-07. If the snapshot is dropped, these two can go. |
| `@google/generative-ai` | Used by Gemini adapter and `ai/brew/investigate` route | Only reachable while AI chat is on. |
| `openai` | Used by the DeepSeek adapter only | Same. |
| `@anthropic-ai/sdk` | Used by 14 files (brew routes, oracle chat, adapters) | Same; the connector does not need it. |
| `@modelcontextprotocol/sdk`, `jose` | Used | Connector (`/mcp`) and token checks. |
| `@supabase/ssr`, `@supabase/supabase-js`, `@tanstack/react-query`, `@tanstack/react-virtual`, `@base-ui/react`, `lucide-react`, `sonner`, `zod`, `clsx`, `tailwind-merge`, `next`, `react`, `react-dom` | Used | Many importers. |
| Dev: `@playwright/test`, `playwright` | Used by the e2e suite (off) and `create-test-user.ts` | Keep while e2e stays an option. |
| Dev: `@testing-library/*`, `jsdom`, `@types/jsdom`, `vitest`, `@vitejs/plugin-react`, `fast-check`, `tsx`, `eslint`, `eslint-config-next`, `typescript`, `@types/*` | Used | |
| Not listed but imported | MISSING: `dotenv` (43 files, mostly scripts and `tests/e2e/auth.setup.ts`) | Works today only because another package pulls it in. `@electric-sql/pglite` is needed by `tests/db-perf` and is not installed. |

---

## 5 Tests

Counts: 396 test and test-support files in `src/` (65,469 lines), 8 Playwright files in `tests/e2e` (1,863 lines, last changed mostly July to September), `tests/db-perf` (1 script + 1 fixture, last change 2026-09-28), 2 CSV fixtures. Last recorded green run: 4,675 tests.

### 5.1 Tests that cover only code the app never reaches (24 files, 3,322 lines)
`CardArtPreview`, `CommanderSearch`, `DeckEditor`, `DraftDeckTile`, `InlineDeleteConfirmation`, `PersistentHeader`, `Sidebar`, `StatusControl`, `StatusFilter`, `CollectionValueBanner`, five `vocabulary/*` component tests, `useSSEChat`, `copy-availability`, `deck-list-generator` (two files, 495 lines), `format-strategy-prompt`, `generic-count-queue`, `import-deck-placement`, `ref-card-backfill` and `ref-card-backfill-script` (508 lines). They pass, so they hide the fact the code is unreachable. `import-deck-placement.ts` is the TypeScript mirror of the applied database function `insert_user_copies_to_deck` (the draft header says the tests cover that logic), so it has a documentation value (R-03).

### 5.2 Skipped tests
Whole file skipped (no test runs): `src/app/new-deck/page.test.tsx` (312 lines; imports `@/hooks/useBrewSession`, which does not exist), `src/test/migration-020.test.ts` (187 lines, SQLite, "Paused: Phase 8/9"), `src/lib/__tests__/card-identity-v2-checkpoint.test.ts` (23 lines, marked OBSOLETE), `src/app/api/ai/build-deck/route.test.ts`, `ai/mana-analysis/route.test.ts`, `ai/recommend/route.test.ts` (every test skipped; 119 + 136 + 147 lines), `src/app/api/ai/search/route.test.ts` (103 lines, `describe.skip`).
Partly skipped: `useCanvasDrag.test.ts` (4 of 7), `useCanvasZoom.test.ts` (5 of 20), `brew-prompts.test.ts` (2 of 43).
Conditional skips: `ai-change-log-deck-delete.db.test.ts` (needs local Postgres), `command-zone-anon-denied.live.test.ts` and `mcp.live.test.ts` (need live flags), `card-tags.test.ts` (needs local Scryfall copy), 9 Playwright cases in `card-management.spec.ts` (skip when a deck has no cards of a given state).

### 5.3 Stale fixtures and e2e
- `src/lib/__fixtures__/` (7 JSON files, 239 KB) are all referenced by tests. `card-roles-scryfall.json` supports `card-roles.ts` (the card-roles code path that D-063 replaced with Tags); it is still used by two connector tests, so keep for now.
- `tests/e2e/*` : `card-management.spec.ts` (490 lines, July) and `card-movement.spec.ts` (381, July) use the older Open/Claimed/Unowned wording and flows; `oracle-smoke.spec.ts` (580, Aug) and `new-features.spec.ts` (179, Aug) predate the library rewrite. `E2E_ISOLATED=true` is needed or the config throws, and the workflows are off. [Approximate] likely stale.
- `tests/db-perf/reconciliation-perf.mjs` needs `@electric-sql/pglite` (not installed) and tests a reconciliation function redesigned on 2026-09-26.
- `src/test/migration-t49-proxy-printing.test.ts` reads migration text and asserts patterns; it passes by checking file text, not behaviour.

---

## 6 Dead-code scan and size totals

### 6.1 Tool results
knip (tests as entries; 23 files nothing imports, even a test):
`useDeckChat.ts` 112, `DeckChatTab.tsx` 217, `DeckStatusCard.tsx` 117, `DraftSessionTile.tsx` 215, `MobileHeader.tsx` 169, `OracleChat.tsx` 327, `OraclePromptCard.tsx` 119, `PushToArchidekt.tsx` 85, `RecommendationCard.tsx` 149, `StatusBadge.tsx` 50, `StatusSectionDivider.tsx` 52, `StrategyRow.tsx` 39, `lib/format-relative-time.ts` 20, `components/connector/index.ts` 3, `brew-v2/CandidateCard.tsx` 209, `brew-v2/CardRow.tsx` 109, `brew-v2/ChatPanel.tsx` 537, `brew-v2/InlineAssessment.tsx` 139, `brew-v2/SuggestionsTab.tsx` 160, `ui/command.tsx` 197, `ui/input-group.tsx` 159, `ui/radio-group.tsx` 39, `vocabulary/index.ts` 24. Total 3,247 lines.

knip production mode (62 files, 8,183 lines) adds, beyond the list above: `CardArtPreview`, `CardDataStaleNotice`, `CommanderSearch`, `DeckEditor`, `DeckHealthButton`, `DraftDeckTile`, `HealthPill`, `HealthStrip`, `InlineDeleteConfirmation`, `KeyCardsSection`, `PersistentHeader`, `PrimerSection`, `RatingsSection`, `Sidebar` (273), `StatusControl`, `StatusFilter`, `WeaknessSection`, `brew-v2/CardTooltip`, `brew-v2/ConceptTile`, `brew-v2/DeckListTab` (322), `collection/CollectionValueBanner` (164), five `vocabulary/*` files, `useSSEChat`, and libraries `card-details/fake-client` (test helper), `contrast`, `copy-availability`, `csv-deck-parser`, `deck-health-chat-question`, `deck-list-generator` (196), `format-strategy-prompt`, `generic-count-queue`, `import-deck-placement` (155), `ref-card-backfill-plan` and `ref-card-backfill` (416 together), `scryfall-bulk-cache` (192). Full list with line counts is reproducible with the same configuration.

Caveats on production mode: `scripts/` count as entries, so scripts keep libraries alive; `supabase/drafts/cc14-backfill-ref-cards.ts` is not an entry, so the backfill libraries show as dead although the draft script imports them; files used only by tests show as dead.

Other findings: 569 unused exports and types in 206 files (largest: `card-identity-store.ts` 39, `knowledge-data.ts` 23, `deck-health.ts` 15, `import-reconciliation.ts` 13, `commander-resolver.ts` 13). 14 duplicate-alias export groups, mostly old and new names for the same function (`CollectionCopy` and `PhysicalCopy`, `Commander` and `Leadership`) left from the table renames. depcheck agrees with section 4.

### 6.2 Size by folder (lines; test files shown separately)

| Folder | App files | App lines | Test files | Test lines |
|---|---|---|---|---|
| `src/app/api` (182 routes) | 182 | 22,617 | 63 | 9,695 |
| `src/app` pages, layouts, css | 39 | 7,810 | 7 | 2,364 |
| `src/components` | 258 | 50,729 | 121 | 16,433 |
| `src/lib` (top level) | 210 | 44,870 | 157 | 30,142 |
| `src/lib/connector` | 43 | 4,331 | 33 | 4,594 |
| `src/lib/adapters` (Gemini, DeepSeek) | 3 | 1,050 | 1 | 287 |
| `src/lib/commander-context` | 6 | 750 | 0 | 0 |
| `src/hooks` | 22 | 2,549 | 8 | 1,485 |
| `src/contexts` | 2 | 832 | 1 | 45 |
| `src/types` | 5 | 3,294 | 0 | 0 |
| `src/middleware.ts`, `src/styles`, `src/test` | 2 | 256 | 5 | 424 |
| **`src/` total** | **772** | **139,088** | **396** | **65,469** |
| `scripts/` | 59 | 16,253 | | |
| `tests/` (e2e, db-perf) | 9 | 2,206 | | |
| `supabase/` drafts / reconciliation / migrations | 57 / 80 / 110 files | 6,274 / 5,439 / (see 1.2) lines | | |
| Tracked non-code bulk | `research/` 94 files, 211,464 lines; `.kiro/` 209 files, 34,062 lines; `data/` 128 files | | | |

### 6.3 Sections of the app by dormant footprint (lines, app only; tests extra)
- AI chat and Brew (paused by D-063): `api/ai` 2,463, `api/brew` 2,450, `api/oracle` 1,293, `api/brew-sessions` 51, `new-deck` 1,251, `components/brew-v2` 5,889, `OracleContext` 832 (always mounted; checks the switch), adapters 1,047. About 15,300 lines. Not dead: the switch can turn it back on. Of this, `brew-v2` is still live through the Workbench tab (section 8, R-05).
- Onboarding page and routes: `app/onboarding` 1,407 plus `api/onboarding` 946.

---

## 7 Route inventory with states

### 7.1 Pages in `src/app`

| Route | Lines | State | Evidence |
|---|---|---|---|
| `/` | 660 | Live. Deck library; new-user branch links to `/onboarding` | Nav "Decks" |
| `/decks/[id]` | 404 | Live. Deck page with tabs including Workbench and Analysis | |
| `/decks/new` | 504 | Live, secondary. Create-from-import flow | Nav Tools menu and `NewDeckModal` link here |
| `/collection` | 636 | Live | Nav |
| `/allocation` | 24 | Live. "Card Management" (collection rollup tab) | Nav Tools menu |
| `/reconcile` | 125 | Live. Original-copy shortage view (D-037) | Nav Tools menu |
| `/picklist` | 3 | Live. All-decks Picklist | Nav Tools menu |
| `/storage`, `/storage/[locationId]`, `/storage/in-hand`, `/storage/missing` | 157, 391, 3, 3 | Live | Nav "Binders" |
| `/settings` | 136 | Live. Holds the reset-all-data button (R-10) | |
| `/settings/claude-connector` | 48 | Live. Connector setup and on/off | |
| `/settings/components` | 974 | Developer-only component gallery, linked from `/settings`. Keep or remove, owner's call | |
| `/login`, `/oauth/consent`, `/auth/callback`, `/mcp` | 20, 63, route, route | Live. Sign-in and the Claude connector endpoint | |
| `/onboarding` | 1,407 | Reachable only from the empty-state button on `/`. Owner has data, so never seen | Older Archidekt/Moxfield first-run flow; its `/api/onboarding/*` routes (12) are live for reconciliation |
| `/explore` | 153 | Reachable only by redirect from `/new-deck` or typed address. Hosts commander browser plus AI suggestion blocks | `Sidebar.tsx` (unused) was its only menu link |
| `/new-deck` | 1,189 (+ layout, 3 more) | Paused. Layout redirects to `/explore` unless AI chat is on. Entry links are in unused components (`MobileHeader`, `DraftDeckTile`, `DraftSessionTile`) | D-063 |
| `layout.tsx`, `loading.tsx`, `error.tsx`, `actions/auth.ts` | | Live | |

### 7.2 API routes (182) with callers

"Callers" are the first files in app code (not tests) that build a request to the route. A route marked "No caller found" may still be used by Claude's connector (which uses `/mcp`, not these routes), by an outside tool or by a path built in a way my search cannot see; 7 routes whose paths are built from a variable were verified by hand and are marked live. 140 live, 3 only called from unmounted code, 5 paused by the AI chat switch, 37 with no caller found (including the cron route).

| Route | Methods | Lines | Callers in app code | State |
|---|---|---|---|---|
| /api/ai/brew/confirm | POST | 68 | none found | No caller found |
| /api/ai/brew/generate | POST | 561 | none found | No caller; also paused by AI chat switch |
| /api/ai/brew/investigate | POST | 433 | none found | No caller; also paused by AI chat switch |
| /api/ai/brew/refine | POST | 456 | none found | No caller; also paused by AI chat switch |
| /api/ai/brew/save | POST | 227 | none found | No caller found |
| /api/ai/brew/session | GET | 70 | none found | No caller found |
| /api/ai/brew/start | POST | 152 | none found | No caller; also paused by AI chat switch |
| /api/ai/build-deck | POST | 112 | none found | No caller found |
| /api/ai/mana-analysis | POST | 159 | none found | No caller found |
| /api/ai/recommend | POST | 128 | none found | No caller found |
| /api/ai/search | POST | 108 | components/CommandZoneSlots.tsx; components/CommanderSearch.tsx (+2) | Live |
| /api/allocation/add-proxy | POST | 168 | components/PicklistV2.tsx; components/StatusChipPopover.tsx (+1) | Live |
| /api/allocation/assign | POST | 162 | components/PicklistV2.tsx; components/StatusChipPopover.tsx | Live |
| /api/allocation/assign-free-copy | POST | 100 | app/storage/[locationId]/page.tsx; components/card-details/CollectionCopiesTab.tsx (+2) | Live |
| /api/allocation/candidates | GET | 45 | none found | No caller found |
| /api/allocation/candidates/batch | POST | 90 | none found | No caller found |
| /api/allocation/claim-from-deck | POST | 72 | components/StatusChipPopover.tsx | Live |
| /api/allocation/reassign-to-deck | POST | 104 | app/storage/[locationId]/page.tsx; components/StatusChipPopover.tsx (+1) | Live |
| /api/allocation/replace-with-original | POST | 125 | components/StatusChipPopover.tsx; components/card-details/CollectionCopiesTab.tsx | Live |
| /api/allocation/resolve | POST | 28 | none found | No caller found |
| /api/allocation/undo | POST | 90 | components/MoveHereControl.tsx; components/card-details/CopiesTab.tsx | Live |
| /api/allocation/valid-decks | GET | 68 | app/storage/[locationId]/page.tsx; components/card-details/CollectionCardDetails.tsx | Live |
| /api/archidekt/create-deck | POST | 26 | none found | No caller found |
| /api/archidekt/write-tags | POST | 26 | none found | No caller found |
| /api/brew-sessions/[id] | DELETE | 52 | components/DraftSessionTile.tsx | Only called from unmounted code |
| /api/brew/assess | POST | 217 | none found | No caller; also paused by AI chat switch |
| /api/brew/chat | POST | 667 | app/new-deck/page.tsx | Paused by AI chat switch |
| /api/brew/commit | POST | 206 | none found | No caller found |
| /api/brew/extract | POST | 206 | none found | No caller; also paused by AI chat switch |
| /api/brew/positions | POST | 93 | none found | No caller found |
| /api/brew/save | POST | 229 | app/new-deck/page.tsx | Live |
| /api/brew/session | POST,GET,PATCH | 176 | app/new-deck/page.tsx | Live |
| /api/brew/session/[id] | PATCH | 166 | hooks/useBrewAutosave.ts | Live |
| /api/brew/skeleton | POST | 499 | app/new-deck/page.tsx | Paused by AI chat switch |
| /api/card-data/refresh | GET,POST | 65 | components/CardDataSection.tsx; hooks/useCardDataStatus.ts | Live |
| /api/cards | GET,POST | 226 | app/new-deck/page.tsx; components/CardHoverPreview.tsx (+1) | Live |
| /api/cards/[name]/decks | GET | 53 | components/CardPopover.tsx | Live |
| /api/cards/autocomplete | GET | 36 | middleware.ts | Live |
| /api/cards/builder-status | GET | 103 | none found | No caller found |
| /api/cards/locate | GET | 184 | components/CardLocator.tsx | Live |
| /api/cards/names | GET | 57 | lib/auto-bracket-cards.ts | Live |
| /api/cards/owned-printings | GET | 92 | components/CardGroupSection.tsx | Live |
| /api/cards/search | GET | 267 | components/AddCardSearch.tsx; middleware.ts | Live |
| /api/cards/suggest-categories | GET,POST | 243 | components/CardGroupSection.tsx; components/CardsTab.tsx | Live |
| /api/cards/update-printing | POST | 79 | components/CardGroupSection.tsx | Live |
| /api/collection | GET | 63 | none found | No caller found |
| /api/collection/allocation | GET | 227 | none found | No caller found |
| /api/collection/assign-location | POST,PATCH | 134 | components/card-details/CollectionCopiesTab.tsx; components/collection/StorageLocationSelect.tsx | Live |
| /api/collection/export | GET | 161 | components/collection/CollectionExportButton.tsx | Live |
| /api/collection/import | POST | 425 | components/manabox-import/ManaBoxCollectionImportDialog.tsx | Live |
| /api/collection/import/preview | POST | 59 | components/manabox-import/ManaBoxCollectionImportDialog.tsx | Live |
| /api/collection/instances/[oracleId] | GET | 269 | components/card-details/CollectionCopiesTab.tsx; components/collection/BulkActionBar.tsx | Live |
| /api/collection/instances/[oracleId]/details | GET | 30 | components/card-details/useCollectionCardDetailsData.ts | Live |
| /api/collection/instances/[oracleId]/ids | GET | 41 | components/collection/CollectionRollupTab.tsx | Live |
| /api/collection/instances/add-proxy | POST | 127 | components/card-details/CollectionCopiesTab.tsx | Live |
| /api/collection/instances/bulk-assign | POST | 74 | components/collection/BulkActionBar.tsx | Live |
| /api/collection/instances/condition | PATCH | 51 | components/card-details/CollectionCopiesTab.tsx | Live |
| /api/collection/instances/delete | POST | 75 | components/card-details/CollectionCopiesTab.tsx; components/collection/BulkActionBar.tsx | Live |
| /api/collection/instances/free-proxies | GET | 117 | none found | No caller found |
| /api/collection/instances/unassign | POST | 75 | components/card-details/CollectionCopiesTab.tsx | Live |
| /api/collection/ownership-batch | POST | 239 | components/OracleSidebar.tsx; components/brew-v2/BrewChatView.tsx (+1) | Live |
| /api/collection/printings | GET | 644 | hooks/useCollectionPrintings.ts | Live |
| /api/collection/refresh-prices | POST | 155 | components/collection/CollectionValueBanner.tsx; components/collection/PriceStaleIndicator.tsx | Live |
| /api/collection/rollup | GET | 417 | hooks/useCollectionRollup.ts | Live |
| /api/collection/rollup-v2 | GET | 46 | components/collection/CollectionRollupTab.tsx | Live |
| /api/collection/rollup/[cardDefinitionId] | GET | 187 | hooks/useCollectionRollup.ts | Live |
| /api/collection/stats | GET | 51 | none found | No caller found |
| /api/collection/value | GET | 149 | app/collection/page.tsx; components/collection/CollectionValueBanner.tsx | Live |
| /api/commander-summaries | GET | 36 | components/CommanderOverview.tsx | Live |
| /api/commanders/[id]/builds | GET | 128 | components/StrategyTab.tsx | Live |
| /api/commanders/[id]/insights | GET | 155 | components/StrategyTab.tsx | Live |
| /api/commanders/eligible | POST | 108 | components/manabox-import/CommanderPicker.tsx; hooks/useCommanderActions.tsx | Live |
| /api/commanders/featured | GET | 222 | app/decks/new/page.tsx; components/explore/CommanderBrowser.tsx | Live |
| /api/commanders/names | GET | 59 | components/OracleSidebar.tsx | Live |
| /api/commanders/search | GET | 526 | app/decks/new/page.tsx; components/explore/CommanderBrowser.tsx | Live |
| /api/connector/changes | GET | 13 | components/connector/api.ts | Live |
| /api/connector/changes/[id]/undo | POST | 12 | components/connector/api.ts | Live |
| /api/connector/changes/marker | GET | 21 | components/connector/api.ts | Live |
| /api/connector/enable | POST | 18 | components/connector/api.ts | Live |
| /api/connector/moved-slots | GET | 11 | components/connector/api.ts | Live |
| /api/connector/pending | GET | 11 | components/connector/api.ts | Live |
| /api/connector/pending/[id]/approve | POST | 12 | components/connector/api.ts (built from `${action}`) | Live |
| /api/connector/pending/[id]/decline | POST | 12 | components/connector/api.ts (built from `${action}`) | Live |
| /api/connector/pending/count | GET | 11 | components/connector/api.ts | Live |
| /api/connector/revoke | POST | 33 | components/connector/api.ts | Live |
| /api/connector/status | GET | 11 | components/connector/api.ts | Live |
| /api/cron/refresh-prices | GET | 116 | none found | Scheduled only (vercel.json); mislabelled, see section 2 |
| /api/decks | GET | 173 | app/page.tsx; components/explore/SuggestedCommanders.tsx (+1) | Live |
| /api/decks/[id] | GET,DELETE,PATCH | 488 | app/decks/[id]/page.tsx; app/decks/new/page.tsx (+13) | Live |
| /api/decks/[id]/allocate | POST | 50 | none found | No caller found |
| /api/decks/[id]/breakdown | POST | 60 | none found | No caller found |
| /api/decks/[id]/build | GET,POST | 267 | components/BuildSelector.tsx | Live |
| /api/decks/[id]/card-actions/[cardName] | GET | 211 | app/storage/[locationId]/page.tsx; components/PicklistV2.tsx (+1) | Live |
| /api/decks/[id]/card-statuses | GET | 124 | lib/deck-card-statuses-query.ts | Live |
| /api/decks/[id]/cards | POST | 166 | components/AddCardSearch.tsx; components/CardGroupSection.tsx (+5) | Live |
| /api/decks/[id]/cards/[cardId] | DELETE,PATCH | 202 | components/CardGroupSection.tsx; components/CardsTab.tsx (+4) | Live |
| /api/decks/[id]/cards/[cardId]/categories | PUT | 127 | components/CardsTab.tsx | Live |
| /api/decks/[id]/cards/[cardId]/details | GET | 47 | components/card-details/useCardDetailsData.ts | Live |
| /api/decks/[id]/cards/[cardId]/why | PUT | 55 | components/card-details/OverviewTab.tsx | Live |
| /api/decks/[id]/cards/batch | POST | 210 | none found | No caller found |
| /api/decks/[id]/cards/bulk | POST | 280 | components/CardsTab.tsx | Live |
| /api/decks/[id]/chat | POST | 225 | hooks/useDeckChat.ts (itself unused) | Paused by AI chat switch; only caller is unused code |
| /api/decks/[id]/chat-proposals/confirm | POST | 27 | components/ChatProposalCards.tsx (base path variable) | Live |
| /api/decks/[id]/chat-proposals/dismiss | POST | 21 | components/ChatProposalCards.tsx (base path variable) | Live |
| /api/decks/[id]/chat-proposals/undo | POST | 22 | components/ChatProposalCards.tsx (base path variable) | Live |
| /api/decks/[id]/combos | GET | 50 | components/CombosPanel.tsx | Live |
| /api/decks/[id]/command-zone | PUT | 78 | components/CommandZoneSlots.tsx; hooks/useCommanderActions.tsx | Live |
| /api/decks/[id]/dead-weight | GET | 51 | none found | No caller found |
| /api/decks/[id]/dead-weight/dismiss | POST,DELETE | 118 | components/CardGrid.tsx | Live |
| /api/decks/[id]/folder | PATCH | 74 | components/DeckTile.tsx; components/FolderChip.tsx | Live |
| /api/decks/[id]/generic-basics | POST,PATCH | 84 | components/CardGroupSection.tsx | Live |
| /api/decks/[id]/health | GET | 28 | components/HealthStrip.tsx; hooks/useDeckHealth.ts | Live |
| /api/decks/[id]/health-settings | GET,PUT | 52 | hooks/useHealthSettings.ts | Live |
| /api/decks/[id]/health/gap | GET | 40 | components/GapDetail.tsx | Live |
| /api/decks/[id]/health/overrides | GET,PUT,DELETE | 206 | none found | No caller found |
| /api/decks/[id]/health/recheck | POST | 28 | none found | No caller found |
| /api/decks/[id]/import-alerts | GET | 24 | none found | No caller found |
| /api/decks/[id]/import-alerts/[alertId] | POST | 35 | none found | No caller found |
| /api/decks/[id]/legality | GET | 119 | lib/deck-legality-query.ts | Live |
| /api/decks/[id]/mana | GET | 50 | none found | No caller found |
| /api/decks/[id]/move-here | GET,POST | 238 | components/MoveHereControl.tsx; components/card-details/CopiesTab.tsx | Live |
| /api/decks/[id]/notes | GET | 66 | components/StrategyTab.tsx | Live |
| /api/decks/[id]/overview | GET | 51 | none found | No caller found |
| /api/decks/[id]/picklist | GET | 202 | components/PicklistV2.tsx | Live |
| /api/decks/[id]/push | POST | 46 | components/PushToArchidekt.tsx | Only called from unmounted code |
| /api/decks/[id]/ratings | GET | 52 | components/AnalysisTab.tsx | Live |
| /api/decks/[id]/status | PATCH | 92 | components/StatusControl.tsx | Only called from unmounted code |
| /api/decks/[id]/strategy | GET,PUT | 199 | none found | No caller found |
| /api/decks/[id]/strategy-window | GET,PUT | 51 | components/deck-strategy/DeckSettingsHost.tsx | Live |
| /api/decks/[id]/upgrade | GET | 253 | components/UpgradeTab.tsx | Live |
| /api/decks/[id]/upgrade/apply | POST | 141 | components/UpgradeTab.tsx | Live |
| /api/decks/[id]/upgrade/refresh | POST | 76 | components/UpgradeTab.tsx | Live |
| /api/decks/[id]/upgrade/skip | POST | 113 | components/UpgradeTab.tsx | Live |
| /api/decks/[id]/versions | GET,POST | 115 | components/VersionHistoryPanel.tsx | Live |
| /api/decks/[id]/versions/[versionId]/restore | POST | 142 | components/VersionHistoryPanel.tsx | Live |
| /api/decks/create | POST | 116 | app/decks/new/page.tsx; components/NewDeckModal.tsx (+2) | Live |
| /api/decks/details | GET | 45 | app/page.tsx | Live |
| /api/decks/import | POST | 165 | components/DeckImportButton.tsx; components/manabox-import/ManaBoxDeckImportFlow.tsx | Live |
| /api/decks/import/ownership | POST | 37 | components/manabox-import/ManaBoxDeckImportFlow.tsx | Live |
| /api/decks/import/preview | POST | 189 | components/DeckImportButton.tsx; components/manabox-import/ManaBoxDeckImportFlow.tsx | Live |
| /api/decks/order | PUT | 28 | hooks/useSaveDeckOrder.ts | Live |
| /api/dev/reset | POST | 51 | app/settings/page.tsx | Live |
| /api/folders | GET,POST | 110 | components/CreateFolderModal.tsx | Live |
| /api/folders/[id] | PATCH,DELETE | 103 | none found | No caller found |
| /api/import/destinations | GET | 91 | components/PicklistPlaces.tsx; components/manabox-import/destinations-client.ts | Live |
| /api/locations/system | GET | 19 | app/storage/page.tsx; components/SystemPlacePages.tsx | Live |
| /api/moves/items/[id]/cancel | POST | 29 | components/AllDecksPicklist.tsx | Live |
| /api/moves/items/[id]/looked-here | POST | 33 | components/SystemPlacePages.tsx | Live |
| /api/moves/items/[id]/undo | POST | 37 | components/AllDecksPicklist.tsx | Live |
| /api/moves/lists | POST | 42 | components/AddToPicklist.tsx | Live |
| /api/moves/missing/[copyId]/turned-up | POST | 35 | components/SystemPlacePages.tsx | Live |
| /api/onboarding/collection-stream | POST | 331 | app/onboarding/page.tsx | Live |
| /api/onboarding/decks | GET | 65 | app/onboarding/page.tsx | Live |
| /api/onboarding/finalize | POST | 52 | components/reconciliation/ReconciliationSummary.tsx | Live |
| /api/onboarding/moxfield/collection | POST | 49 | app/onboarding/page.tsx | Live |
| /api/onboarding/moxfield/decks | GET | 39 | app/onboarding/page.tsx | Live |
| /api/onboarding/moxfield/resolve-one | POST | 54 | app/onboarding/page.tsx | Live |
| /api/onboarding/prefetch-decks | POST | 100 | app/onboarding/page.tsx | Live |
| /api/onboarding/reconciliation | GET | 30 | components/reconciliation/ReconciliationSummary.tsx | Live |
| /api/onboarding/reconciliation/instance | PATCH | 57 | components/reconciliation/ReconciliationSummary.tsx | Live |
| /api/onboarding/reconciliation/instance/printing | PATCH | 52 | components/reconciliation/ReconciliationSummary.tsx | Live |
| /api/onboarding/reconciliation/instance/wishlist | PATCH | 49 | components/reconciliation/ReconciliationSummary.tsx | Live |
| /api/onboarding/resolve-one | POST | 80 | app/onboarding/page.tsx | Live |
| /api/oracle/chat | POST | 563 | contexts/OracleContext.tsx | Paused by AI chat switch |
| /api/oracle/history | GET,DELETE | 105 | contexts/OracleContext.tsx | Live |
| /api/oracle/sessions | POST,GET | 140 | components/SessionHistoryPanel.tsx; contexts/OracleContext.tsx | Live |
| /api/oracle/sessions/[id] | GET,PATCH,DELETE | 191 | contexts/OracleContext.tsx | Live |
| /api/oracle/sessions/[id]/generate-name | POST | 176 | contexts/OracleContext.tsx | Paused by AI chat switch |
| /api/oracle/sessions/active | GET | 124 | contexts/OracleContext.tsx | Live |
| /api/picklist | GET | 109 | components/AllDecksPicklist.tsx | Live |
| /api/picklist/[action] | POST | 74 | lib/picklist-tick-client.ts | Live |
| /api/precons | GET | 64 | components/DeckImportButton.tsx | Live |
| /api/precons/[id] | GET | 65 | components/DeckImportButton.tsx | Live |
| /api/printing-languages | GET | 27 | components/manabox-import/use-printing-languages.ts; lib/printing-languages.ts | Live |
| /api/printings/search | GET | 45 | components/GenericArtPicker.tsx | Live |
| /api/reconcile/overused | GET | 25 | app/reconcile/page.tsx | Live |
| /api/scryfall/commanders | GET | 64 | components/NewDeckModal.tsx | Live |
| /api/settings/storage-locations | GET,POST | 87 | components/LocationPickerModal.tsx; components/collection/BulkActionBar.tsx (+2) | Live |
| /api/settings/storage-locations/[id] | PUT,DELETE | 111 | components/settings/storage-locations-settings.tsx | Live |
| /api/storage/locations/[locationId] | GET | 34 | app/storage/[locationId]/page.tsx | Live |
| /api/storage/overview | GET | 55 | app/storage/page.tsx | Live |
| /api/storage/unsorted | GET | 16 | app/storage/[locationId]/page.tsx | Live |

### 7.3 Feature inventory rows (this agent's areas)

| Feature | State | Evidence and notes |
|---|---|---|
| Pricing refresh | Live, manual | Button (`PriceStaleIndicator`) calls `POST /api/collection/refresh-prices`; Scryfall prices only (D-040, D-042); parsing in `lib/price-parsing.ts`. `CollectionValueBanner` (its other caller) is unmounted. `/api/collection/value` feeds the collection page. Connector `get_buying_list` uses the same prices, labelled estimates (D-035). No scheduled price refresh exists. |
| Daily "refresh-prices" cron | Dead or unknown, mislabelled | Refreshes card facts, not prices (2.1). No decision names it. |
| Card data refresh | Live | `POST /api/card-data/refresh` (4 callers) runs `lib/card-data-sync`; same code as `npm run sync:cards`. |
| Commander and EDHREC sync scripts and workflows | Off, on demand | 2.1 and 2.2. |
| Local data scripts (A to F) | Mostly legacy | 2.2. |
| Test and check tooling | Live | `npm run check` (tests, types, lint). e2e and live smoke are off. |
| Stored-data drafts | Mixed | 1.2. |
| Hosted migration history | Open point | 1.1. |
| Settings reset button and `/api/dev/reset` | Live, risky | Wipes the signed-in user's decks, copies, cards and brew sessions; guarded only by `NODE_ENV !== 'production'`, and local development runs against the hosted database (owner direction 2026-10-11). AGENTS rule 5 on destructive operations applies. |

---

## 8 Removal candidates

Format: what, size, evidence, why safe or what could break, locked decision or brief, recommendation. "Remove now" means safe by evidence and no owner-visible change; the owner can still veto.

| ID | What | Size | Evidence | Safe or what could break | Decision or brief | Recommendation |
|---|---|---|---|---|---|---|
| R-01 | Unused packages: `@phosphor-icons/react`, `@tanstack/react-query-persist-client`, `next-themes` (also drop two test mocks) | 3 packages, 2 test mock blocks | [Confirmed: knip, depcheck, grep] | Nothing imports them. Lockfile changes. | None | Remove now |
| R-01b | `youtube-search-without-api-key`, `youtube-transcript`, `youtubei.js` | 3 packages | Only `research/scripts/fetch-*` | Breaks only those research scripts | None | Confirm with owner (remove together with the research scripts, R-12) |
| R-02 | Files nothing imports (23 files) incl. `OracleChat`, `DeckChatTab`, `useDeckChat`, `MobileHeader`, `DraftSessionTile`, `PushToArchidekt`, `StatusBadge`, `ui/command` (and with it `cmdk`), `ui/input-group`, `ui/radio-group`, `brew-v2/{CandidateCard,CardRow,ChatPanel,InlineAssessment,SuggestionsTab}` | 23 files, 3,247 lines | [Confirmed: knip] | No file, test or script imports them. Removing `DeckChatTab` and `useDeckChat` leaves `/api/decks/[id]/chat` with no caller. The brew-v2 five belong to the paused chat, so check D-063 intent first. | D-011 (Brew conversation) and D-063 (AI chat paused) relate to the brew-v2 five only | Remove now for the 18 non-brew files (about 1,800 lines). Confirm for the brew-v2 five |
| R-03 | Code the running app never reaches but tests still cover (39 more files): `Sidebar`, `PersistentHeader`, `CommanderSearch`, `DeckEditor`, `CardArtPreview`, `StatusControl`, `StatusFilter`, `CollectionValueBanner`, five `vocabulary/*`, `deck-list-generator`, `csv-deck-parser`, `scryfall-bulk-cache`, `contrast`, `copy-availability`, `generic-count-queue`, `useSSEChat` and their 24 test files | about 4,900 lines app + 3,322 lines test | [Confirmed: knip production mode] | Passing tests hide that nothing mounts them. Exceptions that need care: `import-deck-placement.ts` (documents the applied DB function), `ref-card-backfill*.ts` (feed the unapplied CC-14 backfill draft), `HealthStrip`, `HealthPill`, `DeckHealthButton` (probably the "unmounted category health in the deck list" that backlog HC-08 plans to remove after HC-05 [Approximate]), `vocabulary/*` (locked vocabulary D-043, used by the Designer spec) | D-043 vocabulary; CC-14 approval; HC-08 | Remove now: `Sidebar`, `PersistentHeader`, `CommanderSearch`, `DeckEditor`, `CardArtPreview`, `StatusControl`, `StatusFilter`, `contrast`, `copy-availability`, `generic-count-queue`, `useSSEChat`, `deck-list-generator`, `csv-deck-parser`, `scryfall-bulk-cache` with their tests. Confirm with owner: `CollectionValueBanner` (backlog says "check the collection value banner"), `vocabulary/*`, `import-deck-placement`, `ref-card-backfill*`. Keep until HC-08: the health pieces |
| R-04 | 36 API routes with no caller, plus the mislabelled cron route (list in 7.2). Subsets: AI (`ai/brew/*` 7, `ai/build-deck`, `ai/mana-analysis`, `ai/recommend`): 2,366 lines; Brew leftovers (`brew/commit`, `brew/positions`; assess and extract show a caller only in paused code); old allocation and collection helpers (`allocation/candidates*`, `allocation/resolve`, `collection`, `collection/allocation`, `collection/stats`, `collection/instances/free-proxies`, `cards/builder-status`); deck routes (`allocate`, `breakdown`, `cards/batch`, `dead-weight`, `health/overrides`, `health/recheck`, `import-alerts` x2, `mana`, `overview`, `strategy`); `archidekt/*`; `folders/[id]` | 4,931 lines + 116 (cron) ; tests 2,234 lines | [Confirmed: literal path search of src, tests and scripts; 7 variable-built paths checked by hand] | A caller I cannot see (external tool, URL typed by hand) would break. `decks/[id]/strategy` was replaced by `strategy-window`; `health/overrides` by `health-settings`. Removing `dead-weight` GET leaves `dead-weight/dismiss` and CardGrid's dismissal; check first. | D-063 for AI routes; D-009 and D-007 for allocation helpers; `PushToArchidekt` backs `decks/[id]/push` | Remove now: 12 non-AI routes clearly replaced (`strategy`, `health/overrides`, `health/recheck`, `allocate`, `breakdown`, `allocation/resolve`, `collection/stats`, `cards/builder-status`, `collection/instances/free-proxies`, `collection/allocation`, `import-alerts` x2). Confirm with owner: the AI and Brew routes (they follow the AI chat decision), `folders/[id]` (rename or delete folder may be wanted later), `archidekt/*`, `cards/batch`, `mana`, `overview`, `dead-weight` |
| R-05 | Workbench Curve layout, the owner's example: `CurveView`, `CurveColumn`, `CurveCardRow`, `useCurveBuckets` plus the "Curve" button in `CanvasToolbar` and its branch in `DeckCanvas`. The Piled layout (`PiledColumn`, 197 lines) is the sibling | 4 files, 199 lines (+ toggle code); Piled 197 | [Confirmed: `WorkbenchTab` renders `BrewCanvas`; `layoutMode` options in `CanvasToolbar.tsx`; no tests for the curve files] | Small, self-contained. `RailCurve` (deck rail) and `AnalysisTab`'s curve are separate and stay. Saved canvas positions are unaffected. | D-008 (free-drag canvas) and D-017 (curve targets) mention neither the toggle nor the files | Remove now (curve); ask the owner whether Piled should go too |
| R-06 | Legacy and one-off scripts, groups A, B, C (2.2) | groups A to C, about 6,200 lines | Target dropped tables, a July SQLite file, or a folder that is gone; two import a missing module | None run in CI; no locked decision. Keep scripts that are the only record of how data was loaded, if the owner wants that history | None | Remove now: group A (2,897 lines, broken or dead), group B (655), the duplicate `generate-coverage-report.ts` (129). Confirm: group C (2,613 lines, one-offs that may be used as templates) and D (2,129, input folder gone) |
| R-07 | Commander-context snapshot: `data/commander-context/*.sqlite` (34 MB, tracked), `lib/commander-context/` snapshot and shadow modes (750 lines), `scripts/export-commander-context.ts` (892), `better-sqlite3` and its types, flag `COMMANDER_CONTEXT_SOURCE` | 7 tracked files and 1 package; about 1,650 lines | Default is `supabase`; owner `.env.local` does not set the flag [Confirmed: grep] | Snapshot is a frozen July to September copy of build cards that were nearly empty (backlog V-02: all 1,885 builds had 0 cards). Removal would cut a fallback path. | None locked. The vector trial that wanted it is closed (2026-11-10) | Confirm with owner |
| R-08 | Stale draft duplicates in `supabase/drafts/`: `insert_user_copies_to_deck.draft.sql` (166), the two connector `.draft.sql` (109), headers saying "NOT APPLIED" on applied files | 3 files, 275 lines; plus 4 header fixes | [Confirmed: promoted copies exist] | Documentation only. | Process: Architect and Gene own drafts | Confirm with Gene (archive, do not delete without them). Header fixes are the useful part |
| R-09 | CC-26 DB-1 to DB-5 live tables and functions, plus unapplied DB-6, DB-6b drafts | 5 applied-empty tables; 2,100 lines of drafts | D-063; audit 2026-11-19 | A drop on the hosted database is a destructive operation: AGENTS rule 5 requires explicit owner approval and a rehearsal | D-063 says "stay until a separate approved cleanup" | Confirm with owner. Mark DB-6/6b SUPERSEDED now (no behaviour change) |
| R-10 | `/api/dev/reset` plus the Settings reset button | 50 lines + about 40 | [Confirmed] | Deletes all the signed-in user's decks and cards on whatever database `.env.local` points to. Guard is `NODE_ENV` only | AGENTS rule 5, D-006 (clean slate with approval) | Confirm with owner (remove, or put behind a typed confirmation) |
| R-11 | Fully skipped tests and the code they cover: `new-deck/page.test.tsx`, `migration-020.test.ts` (with `better-sqlite3`), `card-identity-v2-checkpoint.test.ts`, 4 AI route tests, partly skipped `useCanvas*` and `brew-prompts` cases | 8 files, about 1,150 lines | [Confirmed: grep skip markers] | Nothing runs them today | None | Remove now for the obsolete SQLite and v2-checkpoint tests; confirm the rest with R-04 |
| R-12 | `research/` (94 tracked files, 211,464 lines of mostly JSON and HTML), including 20 one-off research scripts that need the removed youtube packages and a missing folder | 94 files | README says "safe to archive once feature stable"; last reviewed 2026-08-06 | Docs agent's area; no app import | None | Confirm with owner (archive) |
| R-13 | Unused exports and duplicate-alias exports | 569 exports in 206 files | [Confirmed: knip] | Mechanical; low value per item | None | Remove later, after R-02 and R-03 shrink the list |
| R-14 | Env: `SUPABASE_DEFAULT_USER_ID`, example entries `YOUTUBE_API_KEY`, `SUPABASE_EDGE_FUNCTION_URL`, stale `CRON_SECRET` comment; constant `DECK_DESTINATION_ENABLED`; flag `NEXT_PUBLIC_IMPORT_INTENT_SAVE` | 6 items | Section 3 | The intent-save flag must be removed together with its `.env` and Vercel setting | None | Remove now (config only), except the flag, which needs a quick check of the Vercel setting |
| R-15 | Switched-off GitHub workflows (4) and `vercel.json` cron | 5 files | T-43; owner direction 2026-10-11 | Re-enabling later needs them | None | Confirm with owner |
| R-16 | `tests/db-perf/*` and `tests/e2e/*` (old) | 12 files, about 3,000 lines | Section 5.3 | e2e is the only browser safety net, though off and stale | None | Confirm with owner |

---

## 9 Started-and-left

| Item | What was started | What exists | Where it stops |
|---|---|---|---|
| Workbench Curve and Piled layouts | Brew canvas V2 layouts | Curve toggle in the Workbench tab, 4 files | Owner decided it is not useful (this audit's example); never removed |
| In-app AI chat, Brew canvas and deck chat | Specs under `.kiro/specs` (brew-mode-v2, brew-canvas-redesign, ...) | About 15,300 lines | Paused 2026-11-19 (D-063), not removed |
| Claude via connector: import decks (CC-17), manage storage and Picklists (CC-16), wishlist (CC-18) | Three Architect drafts | 292 lines of SQL, not applied | "Approved, planning underway"; no code |
| Card roles and deck jobs (CC-26) | Five applied tables, DB-6 draft, roles code (`lib/card-roles.ts`) | Empty tables | Dropped in principle (D-063), cleanup not done |
| Card Tags | Tables, fill script, read paths, read-only display, search filter | Reads live; fill job not known to have run | Backlog RQ-12 still says "Not built" while code reads the tables: backlog may be out of date |
| Strategy window fields, Claude change reason, Claude replaces Strategy text | S3, S4, S5 drafts | App code written to run with or without the columns | Application on hosted DB not verified |
| Trade binder location type (CC-25) | Draft and read code | `is_trade` read tolerantly | Backlog lists it unfinished |
| Missing-card backfill (CC-14, library gaps and two-faced cards) | Script, README, manifest of about 100 cards, tests | 3 libraries, 508 test lines | Approved 2026-11-18, not applied |
| Build cards from EDHREC | Sync script and tables | `ref_build_cards` holds cards for 3 of 1,885 builds | RQ-08 proposed, needs owner approval |
| Combos | `deck_combos` table, `/api/decks/[id]/combos` route | Live route; backlog says combo lookup has known issues | Fix proposed, not started |
| Upgrade tab | `/api/decks/[id]/upgrade/*`, `deck_upgrades`, refresh route with a TODO ("Re-run upgrade engine") | Routes live | Refresh is a stub [Confirmed: `upgrade/refresh/route.ts` line 43] |
| Post-game debrief | Tables `debrief_*`, `deck_priority` | No code | O-004 "roadmap, not specced" |
| Collection value banner | `CollectionValueBanner` | Component and tests, not mounted | Backlog "check the collection value banner" |
| Push to Archidekt | `PushToArchidekt` component, `/api/decks/[id]/push`, `/api/archidekt/*` | Not mounted | No decision or backlog line |
| Deck status control and filter | `StatusControl`, `StatusFilter`, `/api/decks/[id]/status` | Not mounted | Replaced by automatic deck states (D-059) |
| Onboarding first-run flow | `/onboarding` (1,407 lines) | Reachable from empty library only | Replaced by ManaBox import (D-044) |
| Mana curve slider (O-003) | None | | Open roadmap item |
| Card Kingdom pricing | Removed by D-040; leftover wording in tests | | Done |
| Local `data/` clutter | `data/check-delta.ts`, `data/import-moxfield.ts`, old CSV exports | Ignored by git | July leftovers on this machine |

---

## 10 Decisions drift (report only)

- **D-028 (Missing retired, owner-facing) versus the "Missing" place and tick actions.** `/storage/missing`, the Missing flag and `resolve_missing_copy` shipped under Phase 3 (Picklist slices, owner-approved 2026-11-13 to 11-16). `decisions.md` has no amendment. [Confirmed: `src/app/storage/missing/page.tsx`, migrations `20261113100000`, `20261116035436`]
- **D-029 (no retired or archived deck concept) versus `decks.is_active`.** The column and "not marked active by you" wording exist (CC-04d), and `lib/deck-status.ts` carries a deprecated `brewing/in_rotation` enum next to it. Not an archive, but the line is thin.
- **D-040 (Card Kingdom removed) versus code.** Consistent: only test names and a "not shop prices" sentence mention it. `scripts/transform-data.ts` still mentions it.
- **D-063 (AI chat paused, roles plan dropped) versus repository.** The roles tables and drafts still say "NOT APPLIED" or sit applied and empty; roughly 15,300 lines of chat code remain, which D-063 allows.
- **D-008, D-010, D-011 (Brew canvas decisions) versus D-063.** Decisions describe the Brew canvas as the product; the chat that drives it is paused, though the canvas is still the Workbench tab.
- **D-035 (advisor buy prices from Scryfall) versus D-040.** D-040 says it "replaces deferred in D-035". The D-035 text still says "Card Kingdom pricing is deferred". Wording drift only.
- **AGENTS.md vs reality.** It says the app is hosted on Vercel; the backlog says the owner runs it locally with no Vercel since 2026-10-11 (the connector needs a reachable address). Unclear which is true today.
- **`src/types/supabase.ts` vs hosted schema.** Generated types predate roughly 25 tables and functions and list dropped ones.
- **Status headers on drafts** (section 1.2): at least 9 files say "NOT APPLIED" while applied.
- **`.env.local.example`** points to a route that no longer exists.

---

## 11 Open questions

1. Is the Vercel deployment still live, and does `/api/cron/refresh-prices` still run on it? (Decides R-14, R-15.)
2. Were S3, S4, S5, the card-tag tables and CC-25 applied to the hosted database? One read-only query would settle all five. Has the card-tag fill job been run?
3. Should the Workbench keep any alternate layout (Piled), or only free-form?
4. Is the 34 MB commander-context snapshot still wanted as an offline fallback?
5. Should the empty CC-26 tables be dropped now, and the DB-6 drafts marked superseded?
6. Do the owner and Gene want `import-deck-placement.ts` and the unapplied CC-14 backfill libraries kept?
7. Should the settings reset button stay, and if so with what safeguard?
8. Is the old e2e suite worth reviving, or removed?
9. Whether to ever repair the hosted migration ledger (1.1). Report only.
10. `D-028` and `D-029`: amend the decisions to match what shipped? (Gene, with owner approval.)

## 12 Could not verify

- Hosted database contents and schema: which tables, columns and functions exist; row counts; whether S3, S4, S5, tags and CC-25 are applied; which functions in 1.4 survive. No query tool was available without writing, and no SQL was run.
- Whether Vercel crons or GitHub workflows are currently enabled (`gh workflow list` returned nothing usable).
- Environment variables set on Vercel or GitHub.
- Whether any route marked "no caller" is called by an outside tool.
- Contents of the 17 remote-only ledger entries (pairing with local files).
- Test suite results (not re-run; last recorded numbers used).
- ts-prune was not run; knip and depcheck covered the same ground. `src/types/supabase.ts` is stale so type-based table checks relied on migrations and text search.
- The `.kiro/`, `.github/agents/` and `docs/` trees are the docs agent's area and were counted, not audited.
