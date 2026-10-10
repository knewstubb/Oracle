# Report: t27-loading-baseline
Role: Architect
Status: BLOCKED
Task as received:
> You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
> Task T-27: Investigate the owner-approved Collection, deck and pick-list loading priorities from docs/oracle/plans/03-loading-performance.md, following /Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t27-brief.txt as the complete scope. Verify a safe measurement target before any runtime work, and if unavailable return a source-backed request map plus a precise baseline blocker rather than inventing timings.
> Done when: docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md distinguishes measured evidence from inspected candidates and provides bounded next fixes and acceptance criteria; then stop without source edits, live writes, commits, deployment or delegation.

Complete scope supplied in the referenced brief, verbatim:

```text
Oracle T-27: safe loading baseline and bounded optimisation investigation

Explicitly authorised by the owner on 2026-09-29. You are the Architect for this read-only investigation only. Do not delegate.

Read AGENTS.md and .paseo/agents/architect.md first, then current docs/oracle/decisions.md, roadmap.md, status.md and plans/03-loading-performance.md. The owner approved Collection-first priority, then deck/pick-list assembly, 2-second first usable content and 0.5-second warm return goals, and appropriate spinners/content-shaped skeletons. The pick list must actually show where copies are and valid actions before it is called usable.

Your isolated worktree includes a snapshot of approved but uncommitted docs. Do not revert/commit those inputs. The roadmap's scoped preparation exception authorises this task despite the historical CURRENT marker discrepancy.

Allowed repository output:
docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md

Machine-readable measurement evidence or temporary read-only instrumentation may be created ONLY under:
/Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t27-measurements/

Stop after the report and bounded evidence. No production source edits, new application instrumentation, test changes, dependency changes, migrations, status/decision/roadmap/spec edits, commits, merges, deployments, or live data mutations.

Safety and measurement prerequisites:
1. Read tests/e2e/README.md and playwright.config.ts before any browser/API measurement. Read relevant GET paths to confirm they are read-only; GET alone is not proof.
2. Discover whether a VERIFIED safe measurement target and dedicated fixture identity are already available. Use only approved configured values and existing dedicated test identity; do not reuse the owner's browser/session credentials or print secrets.
3. The canonical local checkout is /Users/bradknewstubb/Developer/Personal/oracle_app. Existing ignored measurement configuration may remain there and is NOT intentionally copied into this worktree. Access only what is necessary and never expose credential/auth contents in output/artifacts.
4. Do not bypass existing E2E preflight, invent E2E_ISOLATED=true, use the full mutable suite against shared data, widen the shared-readonly allowlist, authenticate as the owner, seed fixtures, run import/cron/reset/refresh endpoints, or stress production.
5. If no suitable target, credentials or request-volume approval can be verified, return a precise PARTIAL/BLOCKED report with the source-backed request map and a ready measurement procedure. Do useful bounded analysis instead of guessing timings. Do not claim current app latency from synthetic timings or prior reports.
6. Do not copy secrets into this worktree. External sharing of code/data or credentials is forbidden.

Objectives:
- Collection list/grid first load, warm navigation, search/filter/sort/page change.
- Deck list, detail, and direct/navigation-to-pick-list loads.
- Copy source/action availability in the pick list and read-only refresh behaviour. Do not execute Sleeve/Move/Proxy against shared data to measure mutation paths.
- Reconciliation read timing only if separately proven read-only and permitted.
- Separate browser first-load/cache return, server response, request counts/bytes, and time until essential content/actions are usable. Prices/analysis may load later; locations/eligibility must not be fictitious defaults.
- Where safe authorised repeated measurement is possible, use at least 20 sequential samples per profile/journey, state device/network/data sizes, calculate p95 correctly and retain failures/timeouts. No parallel load spike. If that volume is not approved, report that limit rather than claiming the p95 targets verified.

Known code-backed candidates, not proven measured benefits:
- src/app/api/collection/printings/route.ts reads all eligible copies and slices a page later; filtered sorts also fetch/enrich broadly.
- src/app/collection/page.tsx invokes the rollup hook even while list view fetches its own data.
- src/components/collection/CollectionToolbar.tsx and collection/page.tsx each debounce search by 300 ms.
- src/app/api/decks/[id]/route.ts has successive enrichment and separate printing price/edition reads.
- src/components/CardsTab.tsx starts status/pick-list requests after the detail page mounts it.
- src/components/PicklistV2.tsx and useDeckQueryKeys have partial refresh/legacy-key concerns; do not improve timings by retaining incorrect source locations.
- Earlier reconciliation performance fix is already reported deployed. Do not presume it is the remaining cause; inspect only evidence relevant to this task.

Output:
- Plain owner summary of what was measured versus only inspected.
- Source-backed request waterfall/work map for the named journeys, without security-review scope expansion.
- Baseline table if actually measured, with conditions, samples, p95 and failures; otherwise explicit missing inputs and no fake numbers.
- Ranked small Backend/Frontend implementation tasks with expected benefit as a hypothesis, preservation requirements and before/after acceptance conditions. Do not implement.
- Keep correctness gates: accurate totals and filtering across pages, original/proxy/printing/finish distinctions, approved generic-land exception, no stale affected-deck state, honest errors.
- Use the required AGENTS.md report format, including commands run and exact output/evidence paths.
```

## Summary for the owner

No loading times were measured: a safe place to run repeated checks has not been verified, and simply opening screens can save background information. Inspection found avoidable Collection work and pick-list problems that can hide real locations or leave another deck out of date. The app is unchanged; the next step is to approve a safe, representative measurement run before claiming any speed improvement.

## Changed files

- `docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md` - the only repository output; source-backed request map, baseline blocker, bounded implementation candidates and acceptance procedure.
- External evidence only: `/Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t27-measurements/prerequisite-check.json` - redacted local configuration-presence facts, not timings.
- No contract, application, test, dependency, migration, spec, status, decision or roadmap files were created or edited by this task. The initial uncommitted planning inputs were left intact.

## Evidence classification and scope

**Source investigation complete; runtime baseline BLOCKED.** Reviewed application revision `0a74e8e` plus the supplied, uncommitted approved planning documents. Deployment equivalence and current database schema were not verified. This is not a security review, full correctness audit, visual review or production benchmark.

| Evidence class | What this report establishes |
|---|---|
| Newly measured app performance | None. No browser, app/API request, database query, authentication, mutation, server startup or performance harness was run. |
| Locally observed prerequisite evidence | Configuration key/file presence only, recorded in `prerequisite-check.json`. No auth contents or credential values were emitted or copied. |
| Inspected implementation | Request dependencies, query shapes, cache settings and specific correctness risks below. `[Confirmed: path]` refers to inspected source, not observed runtime behaviour. |
| Hypotheses | Less duplicate work, fewer sequential reads and correct cache invalidation may improve usable-screen latency. No benefit has been quantified. |
| Historical evidence | The 28 September reconciliation follow-up records deployed database work and successful reads. Those results are not this baseline, and neither old RPC timings nor synthetic harness timings establish today's usable-screen latency. [Confirmed: docs/oracle/reports/2026-09-28-orchestrator-reconciliation-timeout-followup.md] |

### Safe-target prerequisite: failed closed

The E2E README and configuration were read before any consideration of runtime work. They require a dedicated backend for `isolated` mode. The temporary `shared-readonly` mode exposes only `shared-readonly-smoke.spec.ts`, using a dedicated identity and allocation-disabled fixture; it is not permission for repeated Collection/pick-list/reconciliation measurements. The exception is due for review on 12 October 2026 or earlier database availability. [Confirmed: tests/e2e/README.md] [Confirmed: playwright.config.ts] [Confirmed: tests/e2e/shared-readonly-smoke.spec.ts]

| Prerequisite | Observed state / precise missing input |
|---|---|
| Configured frontend and mode | The process has no `E2E_BASE_URL`, `E2E_MODE` or `E2E_ISOLATED`. No top-level env file in either inspected checkout supplied those keys. There is no local `.vercel/project.json` in either checkout. This does **not** prove that no hosted target exists. |
| Dedicated credentials/session | The canonical checkout has `.env.test.local` containing the two test-credential key names, and `tests/e2e/.auth/session.json` exists. The worktree has neither. Auth contents were deliberately not read; identity, expiry, audience and preview access are **unverified**, not claimed missing or valid. |
| Frontend/backend pairing | No approved URL, verified backend isolation/read-only configuration, deployed commit or fixture manifest was established. A separate frontend alone would not establish a separate backend. |
| Request volume and profiles | Plan 3 explicitly still requires an approved measurement target, device/network profile and request volume. Approval of the 2s/0.5s goals is not approval of an arbitrary repeated run. No such run approval was found in the supplied handoff/planning inputs. |
| Existing CI | The shared-readonly workflow references protected environment variables and a dedicated session secret; their remote values were not inspected and no workflow was dispatched. Their presence in workflow source is not verification of T-27 permission. [Confirmed: .github/workflows/shared-readonly-smoke.yml] |
| Representative data | The smoke test names one fixture deck, but does not establish a representative collection, multiple copy-source decks, finish/proxy variants, outstanding pulls or an import batch. Those sizes and cases remain unverified. [Confirmed: tests/e2e/shared-readonly-smoke.spec.ts] |

**Additional source-backed navigation hazards:** these are why a GET-only endpoint list or a smoke-test label cannot certify a read-only browser journey.

- Deck detail starts `GET /api/decks/{id}/health` immediately, alongside the detail read. If no saved health result exists, that handler computes and **upserts `deck_health`**. A read failure during auto-computation can also return an empty green result. Do not exercise this path on shared data or classify that fallback as usable readiness. [Confirmed: src/app/decks/[id]/page.tsx] [Confirmed: src/app/api/decks/[id]/health/route.ts] [Confirmed: src/lib/health-store.ts]
- The shared `OracleProvider` checks an active conversation after hydration/context changes, even when the sidebar is closed. If the response requests a new session, it issues **`POST /api/oracle/sessions`**, whose handler inserts a row. This applies beyond the deck screen. Hiding the sidebar is not a no-write safeguard. [Confirmed: src/components/providers.tsx] [Confirmed: src/contexts/OracleContext.tsx] [Confirmed: src/app/api/oracle/sessions/active/route.ts] [Confirmed: src/app/api/oracle/sessions/route.ts]
- No smoke allowlist was changed; no network interception, fixture seeding, owner login or fabricated isolation flag was used to work around these findings.

**Unblock request:** provide an approved HTTPS measurement deployment and its verified backend/revision, an existing dedicated fixture identity with approved authentication/preview access, representative fixture sizes and expected results, agreed desktop/mobile network profiles, and a named journey/request-volume budget. Prefer an already provisioned isolated representative target. Its incidental background writes still need explicit approval under a subsequent measurement handoff; isolation alone does not override this task's read-only boundary. If only shared data is available, restrict any separately approved work to source-verified read endpoints and the existing smoke boundary; it cannot establish the full browser or Sleeve/Move baseline. Do not seed data or expand that boundary in T-27.

## Baseline availability

`Not measured` means no trial occurred, not zero latency or zero failures. Request counts, transferred bytes, server timings, usable-content timings and p95 are all unavailable.

| Journey | First visit | Valid warm return / repeat | Samples | Failures/timeouts |
|---|---|---|---|---|
| Collection grid | Not measured | Not measured | 0 | Not observed; no trials |
| Collection list | Not measured | Not measured | 0 | Not observed; no trials |
| Collection search, colour/status filter, sort, page change | Not measured | Not measured; each action needs a separate case | 0 | Not observed; no trials |
| Deck list | Not measured | Not measured | 0 | Not observed; no trials |
| Deck detail / essential card actions | Not measured | Not measured | 0 | Not observed; no trials |
| Direct pick list and deck-to-pick-list navigation | Not measured | Not measured; distinct entry paths | 0 | Not observed; no trials |
| Pick-list refresh after Sleeve/Move/Proxy | Source trace only | No mutation executed | 0 | Not observed; no trials |
| Reconciliation read / rendered decisions | Not measured | Not measured | 0 | Not observed; no trials |

Device, browser version, connection, deployment revision, collection size, deck/slot counts and import-batch size are **not established for a measurement profile**. No conclusion about passing or failing the approved latency goals follows.

## Source-backed request waterfall and work map

Arrows indicate inspected dependencies, not elapsed time. Parallel groups describe application code; browser scheduling, retries, prefetch, library mounting and cache hits still require observation. Counts of named requests below are source call sites, **not captured traffic totals**. All app endpoints also perform authentication through `requireAuth`; that entails a Supabase auth user check, separate from the data work. [Confirmed: src/lib/auth.ts] [Confirmed: src/lib/supabase-server.ts]

### Shared page work

Layout/hydration starts the Oracle session lookup described above, potentially followed by session creation or legacy history loading. The sidebar also fetches `/api/commanders/names` with a one-hour query freshness window; that endpoint reads reference names or its process cache. Existing chat messages can trigger ownership lookups/image preloading. Keep chat closed, empty and otherwise controlled in an approved fixture, but verify actual traffic rather than assuming it disappears. External font/stylesheets and Scryfall images add work outside the JSON endpoints. [Confirmed: src/app/layout.tsx] [Confirmed: src/contexts/OracleContext.tsx] [Confirmed: src/components/OracleSidebar.tsx] [Confirmed: src/app/api/commanders/names/route.ts]

### Collection

| Journey / browser dependency | Server work and completion dependency |
|---|---|
| Grid mount: `/api/collection/rollup?...pageSize=50` plus independent `/api/collection/value` | Rollup: exact `user_cards` count -> ordered page -> page copies and price-freshness metadata in parallel -> copy usage and printing metadata in parallel -> assemble rows. This route does not call the `get_collection_rollup` RPC; its implemented query path is the relevant evidence. |
| List mount: `/api/collection/printings?...pageSize=100` **and the still-enabled rollup**, plus value | Initial view state is grid, followed by persisted/mobile view selection in an effect. A list visit can therefore start the grid request before changing view, and the rollup remains subscribed afterwards. Headers and active data mostly switch to printing results, so a fix must cover hydration as well as a simple list-mode `enabled` guard. |
| List, name sort without colours | Two price-freshness reads -> count eligible copies -> **all eligible copies** in parallel batches of 1,000 -> in-memory search and name sort -> slice copies -> page printing/deck-usage enrichment in parallel -> group page copies. A small response page does not mean bounded database retrieval. |
| List, other sort or colour filter | Price freshness -> optional name-to-card-ID lookup -> sequential 1,000-copy batches -> all matching printing metadata in sequential groups of 200 -> filter and sort full set -> slice copies -> page deck usage -> group and sometimes re-sort page groups. Search reduces the input only on this branch. |
| Search | Toolbar's 300ms timer -> parent's 300ms timer -> query-key changes. **600ms is configured waiting, not measured latency**; a second 300ms boundary is unnecessary work under the proposed single-pause target. |
| Filter/sort/page | Query parameters change; filter/sort effects reset page to 1. On list view, shared search/colour changes also change the hidden rollup key. Status controls change local state but are not passed into either data query or applied to rows. Verify rapid changes/page reset traffic; do not call unchanged results a fast filter. |
| Grid expansion, optional separate action | `/api/collection/rollup/{cardId}`: card -> copies -> set metadata -> usage -> sequential per-copy price reads -> proxy IDs/count. Expansion is lazy and query-cached, but each tile also holds subgroup data locally, relevant to later refresh correctness. |

Sources for this table: [Confirmed: src/app/collection/page.tsx] [Confirmed: src/components/collection/CollectionToolbar.tsx] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/hooks/useCollectionPrintings.ts] [Confirmed: src/app/api/collection/rollup/route.ts] [Confirmed: src/app/api/collection/printings/route.ts] [Confirmed: src/app/api/collection/rollup/[cardDefinitionId]/route.ts] [Confirmed: src/components/collection/CollectionGridView.tsx]

The independently loaded value banner reads **all user copies** in sequential pages, with a printing-price lookup for each page, before calculating its summary. It does not gate the card component's render, but may compete for resources; that impact is unmeasured. Merely hiding its spinner would not remove the work. The price-freshness pair in both collection routes also duplicates the same latest-timestamp lookup: `isPriceDataStale()` calls `getLastRefreshTimestamp()` again. [Confirmed: src/components/collection/CollectionValueBanner.tsx] [Confirmed: src/app/api/collection/value/route.ts] [Confirmed: src/lib/price-store.ts]

**Collection correctness constraints before pagination changes:**

- `totalCount` in the printing route counts physical copies; displayed rows are grouped **after** slicing. A group can straddle pages. Quantity sorting ultimately sorts page groups, not the whole grouped collection; the exposed `usedByCount` sort falls through to name ordering. Grouping merges foil/etched through `isFoil` and retains the first copy's usage fields. Do not treat current output as a fully correct golden reference or change pagination units silently. Resolve the copy-vs-group response contract and exact finish handling before replacing the query. [Confirmed: src/app/api/collection/printings/route.ts] [Confirmed: src/lib/collection-printing-utils.ts] [Confirmed: src/components/collection/CollectionToolbar.tsx]
- Rollup counting/pages filter card identities before checking eligible copies; non-name sorting maps to `card_name`, and `exact` colours use containment without an exact-set check. These are inspected existing limitations, not measured regressions. [Confirmed: src/app/api/collection/rollup/route.ts]
- List count/batch/enrichment errors are not consistently thrown; some become empty or partial successful data. Failure fixtures must distinguish genuinely empty results from missing data. Missing-copy eligibility must remain behind D-028's separate transition gate. [Confirmed: src/app/api/collection/printings/route.ts] [Confirmed: docs/oracle/decisions.md]
- Existing query placeholder data preserves the previous page; the page dims results on refresh. The list is already virtualised, so adding virtualisation is not a first fix. Labels, valid totals and safe actions still need checking while previous results are visible. [Confirmed: src/hooks/useCollectionPrintings.ts] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/app/collection/page.tsx] [Confirmed: src/components/collection/PrintingListView.tsx]

### Deck list, deck detail and pick list

| Journey / browser dependency | Server work and completion dependency |
|---|---|
| Deck list `/`: `/api/decks` | Parallel reads of decks, folders, all user's deck cards, active brew sessions, collection count and `get_deck_conflict_counts` -> in-memory grouping -> unresolved availability and mana lookup in parallel -> response with completeness/pips. The initial parallelisation already exists; it is not seven serial calls awaiting a generic `Promise.all` fix. |
| Deck detail `/decks/{id}` | Detail and health start independently. Detail: authorised deck -> cards -> name metadata batches -> printing price/rarity batches -> **separate** printing edition batches -> latest brew session -> commander metadata -> conditional synergy repository read -> enriched response. All of that precedes mounting the usable cards. |
| Cards tab after detail | Starts `/card-statuses` and `/picklist` for statuses/progress; legality banner starts `/legality` separately. HealthStrip shares the normalised health key with the page, so its second observer is not proof of a second request. Version history is fetched only when its panel opens. |
| Direct pick list `/decks/{id}?tab=picklist` | Same detail/health entry chain; URL effect selects the pick-list tab -> `PicklistV2` fetches `/picklist` when mounted. Do not assume it bypasses detail enrichment. The transient default Cards-tab mount/request behaviour needs browser confirmation. |
| Cards -> Sleeve List tab / View Picklist | Reuses the normalised pick-list key initially populated by CardsTab, if valid. CardsTab has 5s freshness; PicklistV2 has 30s. Same-key observers can share a result/in-flight request; different settings and navigation age must be captured rather than labelling every mount a duplicate. |
| `/card-statuses` read | Deck slots with copy-type join -> unresolved names -> user-card IDs -> non-missing copies plus assignment joins -> per-slot statuses/counts. Counts exclude category-based Maybeboard/Sideboard. |
| `/picklist` read | Deck -> all deck slots/copy types -> full status calculation -> unresolved candidate lookup/ranking -> response. Candidate lookup repeats identity/supply work after status calculation. Normal small input uses two candidate database calls, but larger input and double-faced-name fallback add batches. |
| Essential source lookup | Candidate supply joins copies to `user_locations` and `deck_cards -> decks`, exposing real copy ID, printing, finish, original/proxy, location and source assignment. This is assembly data, not optional price/analysis enrichment. |
| Optional card action popover | Opening a status popover mounts `/card-actions/{cardName}`: identity/supply joins -> holder printing metadata -> card identity -> other decks -> action context. This is not a request per closed card row. |

Sources: [Confirmed: src/app/page.tsx] [Confirmed: src/app/api/decks/route.ts] [Confirmed: src/app/decks/[id]/page.tsx] [Confirmed: src/app/api/decks/[id]/route.ts] [Confirmed: src/components/CardsTab.tsx] [Confirmed: src/components/PicklistV2.tsx] [Confirmed: src/components/HealthStrip.tsx] [Confirmed: src/components/LegalityBanner.tsx] [Confirmed: src/components/VersionHistoryPanel.tsx] [Confirmed: src/components/StatusChipPopover.tsx] [Confirmed: src/app/api/decks/[id]/card-statuses/route.ts] [Confirmed: src/app/api/decks/[id]/picklist/route.ts] [Confirmed: src/app/api/decks/[id]/card-actions/[cardName]/route.ts] [Confirmed: src/lib/card-status.ts] [Confirmed: src/lib/allocation-candidates.ts]

Synergy reads use a configured Supabase, local read-only snapshot, or shadow comparison repository. Record that mode in a later baseline; do not assume every deployment has identical work or attribute the whole detail wait to Supabase. Legality's inspected handler uses selects; health is the write-capable exception above. [Confirmed: src/lib/commander-context/repository.ts] [Confirmed: src/lib/commander-context/supabase-repository.ts] [Confirmed: src/lib/commander-context/snapshot-repository.ts] [Confirmed: src/app/api/decks/[id]/legality/route.ts]

**Pick-list usability blockers found by inspection:**

| Finding | Consequence for measurement / bounded follow-up |
|---|---|
| Producer emits `locationName`, `printingId`, `assignedTo.isActive`; PicklistV2 reads `storageLocationName`, `scryfallPrintingId`, `assignedTo.deckStatus`. | Recorded storage names can fall back to "Unsorted"; printing previews fall back to a name-based image; legacy active-deck confirmation is not supported by the emitted field. A rendered row is not yet proof of valid source/action information. |
| UI chooses one free/held candidate per row and does not show finish; the route does not pass preferred printings into the candidate ranker. | Preserve other usable choices and distinguish requested/alternate printing, finish, originals and proxies under T-28/T-25. A faster but misleading default candidate fails the baseline usability gate. |
| Candidate supply does not filter `missing`, while status lookup and assignment validation do. | An apparently actionable copy may be ineligible. Do not restore eligibility or delete excluded copies; coordinate the approved D-028 transition. |
| Candidate failures are caught and converted to empty candidates; status lookup errors return the initial `unowned` map. PicklistV2 consumes neither query error nor refreshing state. | Failure can look like Unowned or empty source columns rather than a load error. Such trials must be recorded as correctness failures, never successful fast loads. |
| Pick-list query does not select/filter categories and counts rows rather than quantities. It does exclude basic-name/no-printing generic lands from outstanding cards. | Preserve the generic-land exclusion, but reconcile Maybeboard and quantity counts with the shared contract. Do not copy its current all-slot totals into a new readiness model. |

Sources: [Confirmed: src/components/PicklistV2.tsx] [Confirmed: src/app/api/decks/[id]/picklist/route.ts] [Confirmed: src/lib/allocation-candidates.ts] [Confirmed: src/lib/card-status.ts] [Confirmed: supabase/migrations/20260925220000_placement_source.sql]

### Sleeve / Move / Proxy refresh trace: inspected, not executed

| Action from pick list | Inspected write boundary | Current post-success refresh |
|---|---|---|
| Sleeve a free copy | `POST /api/allocation/assign` -> `assign_physical_copy` -> `_move_copy_to_slot` | `invalidateCardState(destination)` invalidates destination statuses and pick list only. |
| Move from another deck | `POST /api/allocation/claim-from-deck` -> `force_claim_copy` -> `_move_copy_to_slot` | Same destination-only invalidation; no source-deck refresh is requested here. |
| Create and sleeve proxy | Card-actions GET -> `POST /api/allocation/add-proxy` -> `add_proxy_to_slot` | Ad hoc number/string status/pick-list keys; no deck detail/list, collection or storage invalidation here. |

These RPC bodies lock affected rows/copies and make their copy/slot writes within one database function transaction. Assignment/move clears the source slot without deleting its deck-list entry, sets the destination assignment and clears storage location; proxy creation inserts a physical proxy and fills its target together. A database exception rolls back those writes. HTTP delivery and subsequent cache refresh are **not** part of that transaction: an uncertain response must not prompt blind duplicate Proxy creation. No transaction or contention behaviour was exercised here. [Confirmed: src/app/api/allocation/assign/route.ts] [Confirmed: src/app/api/allocation/claim-from-deck/route.ts] [Confirmed: src/app/api/allocation/add-proxy/route.ts] [Confirmed: supabase/migrations/20260925220000_placement_source.sql]

`deckKeys` already normalises IDs; use it rather than introducing another key family. Its `['decks']` prefix covers list/detail/status/health but **not** separate `['picklist', id]`, `['allocation', id]` or `['card-actions', id, name]` keys. The narrower helper used above does not refresh either detail or the deck list. A source slot ID is returned by move; the source deck can also be known from the selected candidate. The follow-up must reliably identify both affected decks, not infer that invalidating the destination reaches the source. [Confirmed: src/hooks/useDeckQueryKeys.ts] [Confirmed: src/components/PicklistV2.tsx] [Confirmed: supabase/migrations/20260925220000_placement_source.sql]

The ordinary click handlers show success toasts immediately after `mutate`, before completion; the legacy confirmation path awaits completion. A global pending flag disables all pick-list actions, while stale refresh is not similarly represented. Fix success/error timing and action scope with the T-25/T-26 interaction contract; do not count a premature toast as completed assembly. [Confirmed: src/components/PicklistV2.tsx]

Example acceptance scenario: move the only original Sol Ring from Korvold to Prosper. Prosper becomes Sleeved; Korvold keeps Sol Ring on its list but now needs a copy; every open/returned source list shows Prosper as holder. Repeat with a proxy held by another deck. No mutation was used to produce this example.

### Reconciliation

`ReconciliationSummary` mount/batch change -> `GET /api/onboarding/reconciliation[?batchId=...]` -> `getImportReconciliation` -> one `get_import_reconciliation` RPC -> response -> ownership partition/tabs/decisions. Default is `includeResolved=false`; absent batch ID scopes to unsettled claims. The wrapper rejects RPC errors and unsuccessful payloads; the component displays a distinct load error. It uses local component state rather than the shared query cache, so remounting is not a cached warm return. [Confirmed: src/components/reconciliation/ReconciliationSummary.tsx] [Confirmed: src/app/api/onboarding/reconciliation/route.ts] [Confirmed: src/lib/import-reconciliation.ts]

The **read function body** in the latest migration contains read CTEs and JSON aggregation: claim scope -> original/proxy supply and demand -> per-instance states -> pre-aggregated rows/alternates -> printing reference probes -> JSON. No INSERT/UPDATE/DELETE or write helper is called by that function. The file also defines a separate mutating finalize function; do not execute the migration or finalize while measuring reads. `get_deck_conflict_counts`, used by the deck list, likewise has a read-only inspected body. This verifies local source behaviour, not the deployed function definition. [Confirmed: supabase/migrations/20260927120000_import_reconciliation_slot_states.sql]

The previous fix pre-aggregates repeated work and probes `ref_printings.scryfall_id` with a guarded UUID conversion rather than casting the indexed column for the primary lookup. Do not replace this or increase timeouts without new evidence. [Confirmed: supabase/migrations/20260927120000_import_reconciliation_slot_states.sql]

The onboarding page starts at source selection and mounts reconciliation only in its in-memory `summary` step. No approved direct entry into an existing batch was established. Do not run an import to reach it. A separately approved direct API read could measure request latency but **not** decision-screen usability; the latter needs a safe existing summary state or a separately approved fixture entry mechanism. [Confirmed: src/app/onboarding/page.tsx]

### Warm return and freshness

Collection and deck detail/list queries use five-minute freshness; the common provider retains inactive queries for one hour and retries once, with window-focus refetch disabled. This is an in-memory QueryClient, not persisted browser query results. A full reload is not equivalent to same-app navigation back. Pick-list observer freshness differs as noted above; card-action context has 15s freshness. [Confirmed: src/components/providers.tsx] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/hooks/useCollectionPrintings.ts] [Confirmed: src/app/page.tsx] [Confirmed: src/app/decks/[id]/page.tsx] [Confirmed: src/components/CardsTab.tsx] [Confirmed: src/components/PicklistV2.tsx] [Confirmed: src/components/StatusChipPopover.tsx]

Measure unchanged valid returns separately from returns after changes or expiry. Extending freshness would hide the identified refresh gaps, not solve them. Retained tile-local expansion data also needs a correctness case after allocation changes. [Confirmed: src/hooks/useDeckQueryKeys.ts] [Confirmed: src/components/collection/CollectionGridView.tsx]

## Data and contract boundaries for follow-up

No table was changed or proposed for immediate migration. The following is local schema evidence, not a fresh hosted-schema certification:

- Current generated types expose numeric identity/copy/slot/location IDs; `user_copies.card_id -> user_cards.id`, `location_id -> user_locations.id`, and `deck_cards.copy_id -> user_copies.id`, `deck_id -> decks.id`. User-owned rows carry `user_id`. `user_cards.oracle_id` identifies the canonical card; copy `printing_id` and deck-slot `scryfall_id` identify printings. Finish is independent. [Confirmed: src/types/supabase.ts] [Confirmed: docs/oracle/decisions.md]
- Active migrations establish canonical table/foreign-key names, indexes on copy user/card, printing source, location and finish, and a per-user unique `(oracle_id, user_id)` identity key. Location uniqueness is storage-name/user scoped, with separate per-deck and default-location uniqueness. [Confirmed: supabase/migrations/20260730044951_rename_tables_prefix_convention.sql] [Confirmed: supabase/migrations/20260907061042_fix_user_cards_unique_constraint.sql] [Confirmed: supabase/migrations/20260907061101_drop_legacy_oracle_id_unique_constraint_v2.sql] [Confirmed: supabase/migrations/20260812220000_fix_locations_unique_constraint.sql] [Confirmed: supabase/migrations/20260912114410_collection_foundation_default_storage_location.sql]
- Generated relationship types are not an index/constraint inventory. Archived initial schemas are explicitly historical, not a complete replayable live schema. Do not infer a missing index or deploy one from this report. A later database pagination contract must verify primary/foreign keys, unique constraints, RLS/user scope and query plans on the approved target, including assignment uniqueness and `ref_printings` UUID/text boundaries. No clean-slate/recompute approach is authorised. [Confirmed: supabase/reconciliation/README.md] [Confirmed: src/types/supabase.ts] [Confirmed: docs/oracle/decisions.md]

## Ranked bounded next fixes

**Candidates only, not implementation approval or measured benefit.** Keep Collection first, then deck/pick-list assembly. The pick-list correctness work is a prerequisite to accepting its usable-content timing, regardless of queue order. T-28 defines shared behaviour; T-25/T-26 own interactions/loading presentation. Coordinate those handoffs rather than creating competing contracts.

| Rank / owner | Bounded change | Benefit hypothesis | Before/after acceptance and preservation |
|---|---|---|---|
| 1 - Frontend | Enable only the active Collection dataset, including persisted/mobile list hydration. Keep header counts sourced from the active result. | Removes hidden grid reads during list browsing/filtering. | Cold persisted-list visit makes no unused rollup request; a grid visit makes no printings request. One query per required active dataset, excluding documented retries. Switching views still loads correct rows/totals and reuses valid cache. Compare both view profiles. |
| 2 - Frontend | Use one 300ms search boundary; keep quick filter changes/page reset coherent. | Removes one configured pause without sending a request per keystroke. | Controlled input test proves one search update after one pause; rapid typing/clear/unmount cannot restore an older query or page. Measure from last keystroke, including debounce; proposed p95 <=1s remains for baseline review. Preserve results and explicit refresh/error feedback. |
| 3 - Backend | Read Collection's latest price timestamp once per handler and derive staleness from it. No TTL change or price refresh. | Removes an identical metadata read from each rollup/printing request. | One freshness lookup on success/empty branches; same timestamp, 48-hour boundary and error semantics. Before/after request/DB work and screen latency recorded; do not claim a guaranteed millisecond saving. |
| 4 - Backend + Architect contract gate | First resolve printing-page units, totals, stable ordering and finish semantics; then replace only the name-sort/no-colour all-copy retrieval with bounded page retrieval. Leave broader filter/sort work a separately justified slice. | Collection work scales with required results instead of materialising every copy in the handler. | Contract-approved whole-result comparison across all pages, repeated names, multiple copies/finishes/proxies and empty/last pages; no omissions, duplicate groups or false totals. No full-copy transfer to the handler for one page. Database changes require separate approval; verify query plan, not an invented index benefit. |
| 5 - Backend | Merge detail printing price/rarity/edition reads; schedule independent metadata after deck ownership is checked. Preserve response contract first. | Shorter serial enrichment chain without a new endpoint or data model. | One combined read per unique printing batch, unchanged authorised deck/card/printing facts and error visibility. Compare normal/large decks and synergy modes. Splitting secondary price/analysis payloads is a later contract change only if measured necessary. |
| 6 - Backend + Frontend, after T-28 | Repair pick-list source/type fields, eligibility and explicit load/error states; then reuse coherent supply/status work rather than computing it twice. | Makes usable rows trustworthy, with fewer repeated identity/copy reads if reuse is justified. | Real storage/source deck, original/proxy, requested/alternate printing and finish shown; unknown location stays unknown; lookup failure is not Unowned. Generic basics excluded; tracked basics and Maybeboard follow approved rules. No lost candidate choices or per-row network fan-out. Test both direct and deck-navigation paths. |
| 7 - Frontend + Backend response contract as needed | Centralise affected-deck/cache refresh for Sleeve/Move/Proxy; await truthful outcome, handle uncertain response and stale eligibility. | Warm returns remain correct; avoids ad hoc duplicate refreshes and premature success. | In isolated action cases, both source/destination detail, statuses, pick lists, deck list, open action contexts and relevant collection/storage views converge. Unrelated usable rows remain interactive where safe. Repeat-click, conflict, failure and navigation-away cases cannot duplicate a proxy/move or leave stale locations. Measure acknowledgement, commit response and full convergence separately. |
| 8 - Backend/Frontend, only after baseline | Recheck value-banner scans, deck-list enrichment, optional grid-expansion price reads, reconciliation payload/rendering, images and loading presentation. Commission one demonstrated bottleneck at a time. | Addresses the remaining measured limiting work rather than the most visible spinner. | Keep primary cards usable independently of prices/analysis. Preserve honest readiness and existing reconciliation fix. Use approved content-shaped skeletons/scoped pending indicators; animations alone do not count as a speed improvement. |

Ranks 1-3 and 5 are small implementation candidates. Rank 4 is deliberately a contract-first, larger conditional change, not a quick SQL rewrite. Ranks 6-7 are correctness-gated assembly slices, not licence to implement all of T-28 or change Missing eligibility. Existing automated starting points include `CollectionToolbar.test.tsx`, `card-status.test.ts`, `allocation-candidates.test.ts` and the reconciliation route/helper/component tests; the missing active-view, full-page result and affected-deck refresh cases would need focused tests in later implementation tasks. No tests were changed or run here.

## Ready measurement procedure after unblocking

1. **Record and approve the run manifest before any app request.** Include target origin and deployed commit, independently verified backend/mode, dedicated identity alias (not credentials), fixture revision, counts of identities/copies/printings, original/proxy/finish mix, deck/slot/outstanding counts and reconciliation scope. Record browser/version, device/OS/CPU, viewport, network RTT/down/up and any CPU throttling. Agree one desktop and one mobile/network profile; do not treat viewport resizing as mobile performance equivalence. Confirm automatic health/session write handling and reconciliation entry safety separately.
2. **Approve a finite matrix and budget.** Use >=20 sequential trials for each selected journey/profile/cache condition, including named search/filter/sort/page cases, direct versus deck-to-pick-list and valid warm returns. `20 x approved matrix cells` is the trial count, not a known HTTP request count: budget document/assets, background app/auth reads, natural request fan-out, retries and any calibration reads too. Set a request cap, timeout, pacing and stop conditions before starting. A smoke run or <20 trials is not p95 verification. No load-spike parallelism, production stress or unrelated mutable suite.
3. **Preserve preflight and isolate state honestly.** Use only approved configured values and the existing dedicated identity. Never fabricate `E2E_ISOLATED=true`, use the owner session, bypass preview protection or widen the shared-readonly spec. A later approved measurement harness may live only in the evidence directory and must preserve the existing safety gate; no stock reporter/auth setup may silently write artifacts elsewhere. Keep auth files at their existing protected location. On shared data, do not call health/session creation, import/finalize, price refresh, cron/reset or allocation writes. If the browser needs them and no safe approved path exists, stop that cell; aborting/mock-replacing them would produce a modified-journey diagnostic, not the actual baseline.
4. **Separate cache profiles.** First visit: fresh disposable browser application state/query cache and HTTP cache, with only approved fixture auth. Warm return: navigate away/back in the same client within a specified valid freshness window, with unchanged data. Record returns across pick-list's 5s/30s windows and five-minute collection/deck freshness separately. Browser-cold does not prove server-cold; record server-start evidence only if available, otherwise mark unknown. Do not discard slow starts.
5. **Use meaningful stop conditions.** Collection ends when the correct first-page cards, matching totals/order and controls are usable. Deck list ends with real decks and honest readiness; deck detail with cards and essential valid actions, not just a header. Pick list ends only with outstanding rows, physical sources, identity/type/finish and valid actions, or an explicitly evidenced unknown location; an invented fallback or false Unowned fails. Reconciliation ends with real decisions/valid empty state or an explicit error, recorded with the corresponding outcome. Prices/analysis/image completion are separate milestones, not an excuse to omit essential source information.
6. **Capture independent layers.** Timestamp navigation/click/last keystroke; request start, first byte and response end; first cards rendered; essential content/actions usable; secondary completion. Record each normalised endpoint, status, retry, request count and transferred/encoded/decoded bytes, separating assets from app JSON. Browser TTFB includes network/auth/server work and is **not** database execution time. Report true server/DB timing only from approved existing timing/log evidence; otherwise unavailable. Cross-origin Resource Timing zeros without timing permission are unknown bytes, not free transfer. No raw cookies, headers, request bodies, auth storage, chat contents or secret-bearing URLs in HAR/trace/output.
7. **Retain every trial.** Suggested local evidence shape: `trialId, profile, journey, cacheState, fixtureRevision, outcome, actionToUsableMs, responseMs, requestCount, transferBytes, retries, timeoutLimitMs, correctnessResult`, with unavailable fields `null` and reasons. Write sanitised trial JSONL and summaries only under the allowed evidence directory. Do not generate trial records now: none were attempted.
8. **Calculate and compare correctly.** Sort completed successful usable times and treat failed/timed-out/incorrect trials as not meeting the goal (conceptually infinite for unconditional order statistics). Nearest-rank p95 is order `ceil(0.95*n)`; at 20 attempts it is the 19th, not an average or the fastest run. If that rank is censored/failed, report p95 not established rather than a fabricated duration. Always give attempts, successes, failures/timeouts, correctness failures, goal-pass fraction and sample size; a successful-only latency percentile may be supplementary, not the headline. Twenty attempts provide a minimum baseline, not strong statistical certainty.
9. **Apply fixed acceptance gates.** Approved: >=95% within 2s for first usable Collection/deck content, explicitly including assembly pick-list usability, and >=95% within 0.5s for valid warm returns. Proposed pending review: search <=1s including its single 0.3s pause and acknowledgement <=0.1s without early success. Reconciliation and post-move convergence require their own agreed budgets after baseline. A speedup with incorrect ownership/locations, incomplete totals, lost actions or hidden failures is rejected even if its percentile passes. Repeat identical fixtures/profiles before/after each bounded fix; document changed behaviour separately and report unmet targets without loosening them.

Action convergence cannot be measured by this read-only task. A subsequent explicitly approved isolated run must cover originals/proxies in storage and another deck, stale contenders, failed/uncertain responses, repeat clicks, navigation away/back, generic versus tracked basics, Maybeboard release and Break down refresh. Never use shared inventory to produce those states.

## New decisions made (need owner confirmation)

- None enacted. Priority and 2s/0.5s goals remain the approved Plan 3 direction.
- The safe measurement manifest, profiles, route coverage and finite request budget remain prerequisites, not implicit approvals.
- No new schema/API contract was created. Pagination-unit and assembly-response refinements must go through their existing Architect/owner review gates before implementation.

## Assumptions

- The supplied local application revision is the inspection subject; no claim is made that it equals the currently deployed frontend/functions.
- Presence of test-credential keys or an auth file is insufficient evidence of safe dedicated access; none was reused.
- Primary content may precede secondary prices/analysis, but locations, copy distinctions and action eligibility are primary pick-list content under D-030/D-033.
- Source-backed flaws are correctness blockers/candidates, not quantified causes of the owner's observed delays.

## Challenges to locked decisions

- None. The findings support enforcing D-001, D-003/D-004, D-005, D-007 and D-025 through D-033. Existing source mismatches do not authorise weakening them.

## Open questions

- **Baseline blocker:** which verified measurement deployment/fixture and finite trial/request budget are approved, with desktop/mobile conditions and explicit handling of background writes?
- **Reconciliation entry blocker:** is there an existing dedicated summary state that can be opened without importing/finalising? Without it, only a separately permitted direct read can be timed, not screen usability.
- **Implementation handoff gate:** T-28/T-25 must settle the exact shared response/interaction details before pick-list correctness or grouped Collection pagination changes. This report makes no replacement behaviour decision.

## Verification

- Read `AGENTS.md` and `.paseo/agents/architect.md` first, then the supplied brief, decisions, roadmap, status, Plan 3, E2E README and Playwright configuration. The roadmap's scoped exception authorises this preparation only.
- `git --no-pager status --short && git --no-pager log -1 --format='%h %s'` - inspected `0a74e8e`; pre-existing modified decisions/roadmap/status and untracked plans/Orchestrator reports recorded and preserved.
- `python3 - <<'PY' ... PY` read-only configuration-presence check - checked the process's six E2E/test keys, top-level `.env*` key names in the worktree/canonical checkout, and existence only of `tests/e2e/.auth/session.json` / `.vercel/project.json`. No network calls, auth-file reads, credential printing or copying. Exact redacted result retained at `/Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t27-measurements/prerequisite-check.json`.
- `glob`, `rg` and file/range reads - traced the cited collection, deck, pick-list, reconciliation, shared-provider, helper and active migration sources. Session-history keyword lookup for shared-readonly/T-27/E2E target returned no rows; it supplied no environment verification.
- No Playwright/preflight execution, tests, build/typecheck, runtime timings, package installation, API/database calls, migration application, fixture writes, delegation, commit, merge or deployment. Documentation-only output; source facts are not a passing test claim.
- Final artifact verification: report/JSON read-back, JSON syntax and `git diff --check`; repository scope must remain the pre-existing planning inputs plus this report. No raw timing file exists because no timings were collected.
