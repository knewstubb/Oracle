# Contract proposal: Collection loading solutions (T-27)

## 1. Status, scope and authority

**Architecture ready for review. Runtime baseline remains BLOCKED. Nothing here authorises implementation, environment creation or measurement.**

This follows Assignment C and the common limits in `docs/oracle/reports/2026-09-29-orchestrator-dispatch-astra-solutions.md`. It narrows the completed investigation into three changes, not another loading audit. The unchanged baseline report is `docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md`; application source remains at `0a74e8e`, not a verified deployed revision.

Rule labels:

- **Approved**: Collection first, then deck/pick-list assembly; p95 first usable content <=2s and valid warm return <=0.5s; honest loading/errors, primary content before secondary prices/analysis, and copy/printing/finish correctness. [Confirmed: docs/oracle/plans/03-loading-performance.md] [Confirmed: docs/oracle/decisions.md]
- **Proposed technical solution**: F1, F2 and B1 below implement that direction without changing data meaning. They require a scoped implementation handoff.
- **Gated proposal**: grouped printing pagination and the measurement environment/budget. Neither is approved by this document.
- **Frozen dependency**: the original `card-state-actions.md` / `.types.ts` and original T-28 report are compatibility inputs, not accepted contracts. No successor worktree was read. Approved decisions override draft assumptions.

No new API, database write, stored-data migration, index, query-cache framework or UI design is needed for the three small changes. Larger count/filter defects remain explicit gates, not silently accepted behaviour.

## 2. Three slices and their dependencies

| Slice | Smallest implementation boundary | Independence / dependency |
|---|---|---|
| **F1: active Collection data only** | Collection page view-resolution gate; additive `enabled` option on the rollup hook; reuse printing's `enabled` and the toolbar's preference helper. | Independent of T-28 predicates and B1. Coordinate F2 in the same page/toolbar rather than parallel edits. Status-filter and grouped-total correctness are not solved by this slice. |
| **F2: one search pause and coherent query/page transitions** | Retain the toolbar's existing 300ms debounce; remove the page's second debounce; commit parameters and associated page resets together. | Can be designed independently of F1; implement after F1 to verify the complete active-query path. Status filter execution waits for G1, but its eventual page-reset behaviour is specified now. |
| **B1: one price-freshness read per reached handler path** | `price-store.ts` helper contract and the rollup/printings handlers. | Independent of F1/F2, T-28 and pagination. Preserve existing successful/error response shapes and metadata lookup semantics. |

**G1, coupled correctness dependency:** Collection status selections currently change `activeStatuses`, but neither query consumes it and no row filter applies it. An unchanged result is therefore not evidence of a fast successful filter. The existing labels concern collection allocation, not the five per-deck-slot availability labels; do not substitute T-28 labels or predicates by name. [Confirmed: src/app/collection/page.tsx] [Confirmed: src/components/collection/CollectionToolbar.tsx] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/hooks/useCollectionPrintings.ts] [Confirmed: docs/oracle/contracts/card-state-actions.types.ts]

Recommended G1 handoff: Architect/Backend reconcile Collection filter meanings, eligible supply, group/page units and full-result totals against reviewed T-28 rules; UX/Frontend apply the approved control meanings. Filtering must precede counting and pagination, not filter only the loaded page. Every executable filter needs a query-key/request representation, correct filtered totals and an explicit failure state. Do not turn unknown supply into a matching or non-matching known status.

F1/F2/B1 can be reviewed and tested for their bounded non-status behaviour before G1 is resolved. **Do not sign off the status-filter journey or all Collection correctness**, or claim its unchanged results meet a latency goal. If shipping these changes before G1 would require hiding/disabling/rewording controls, obtain a separate UX/owner decision; this contract does not make that presentation change. Likewise, existing mixed-copy header counts and grouped pagination limitations are not made correct by retaining them.

## 3. Shared preserved contracts

### 3.1 Request and response boundary

Keep these existing reads and parameter meanings:

| Endpoint | Query inputs used by the page | Success envelope |
|---|---|---|
| `GET /api/collection/rollup` | `tab=collection`, `page`, `pageSize=50`, `search`, `sort`, `sortDir`, `colors`, `colorMode` | `{ rows, totalCount, page, pageSize, lastPriceRefresh: string \| null, isPriceStale: boolean }` |
| `GET /api/collection/printings` | `page`, `pageSize=100`, `search`, `sort`, `sortDir`, `colors`, `colorMode`, `includeProxies`, `includeMissing` | Same envelope, with printing rows rather than card-identity rows |

`enabled` and view-resolution state are **local hook controls**, never URL parameters or cache-key fields. No status parameter is invented in these slices. Row/ID/quantity semantics remain as currently supplied, subject to G1/G2 correctness gates; no compatibility alias is removed.

Existing authentication failures return HTTP 401 `{ error: 'Unauthorized' }`; route catch blocks return HTTP 500 `{ error: 'Failed to load collection data', detail }`; hooks reject non-OK responses rather than treating the body as rows. Preserve those boundaries, including retry behaviour, without turning the metadata-only null case into a card-data failure. Not every current internal query error reaches the route catch; the baseline's existing empty/partial-success risks remain a separate correctness handoff, not proof of a successful response. [Confirmed: src/lib/auth.ts] [Confirmed: src/app/api/collection/rollup/route.ts] [Confirmed: src/app/api/collection/printings/route.ts] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/hooks/useCollectionPrintings.ts]

### 3.2 Cache, presentation and user scope

Preserve query-key prefixes and all existing filter/page dimensions, five-minute freshness, one-hour retention, previous-result placeholders, one inherited retry and no window-focus refetch. Keep lazy grid expansion. Do not add persistent caching, increase freshness windows, prefetch the hidden view, or cache user results at server/module scope. Authentication and user-scoped database predicates remain unchanged. [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/hooks/useCollectionPrintings.ts] [Confirmed: src/components/providers.tsx] [Confirmed: src/app/api/collection/rollup/route.ts] [Confirmed: src/app/api/collection/printings/route.ts]

The existing Collection skeleton/error/refresh presentation is reused, not redesigned. Waiting to determine a view, waiting for its first response, a successful empty response and a failed response must stay distinct. Old results may remain visible during refresh, but cannot be labelled the successfully applied new filter/page. Their totals belong to that same old result. Disable only actions that would operate on unsafe/stale identities; broader shared visual treatment follows T-26. [Confirmed: src/app/collection/page.tsx] [Confirmed: docs/oracle/decisions.md]

No card/copy/slot write is added: database transaction/undo design is not applicable to F1/F2/B1. Their only client-side persisted write is the existing explicit view preference. Any future stored-data or action change is outside this contract.

## 4. F1: active data, including saved/mobile entry

### Inspected starting point

The page initially chooses grid, then reads saved/mobile preference in an effect. Rollup has no enable switch; printing is enabled in list view. Therefore simply disabling rollup when `viewMode === 'list'` would still allow an unwanted initial grid read on saved-list entry. The value banner is independently mounted and is **not** the hidden view being removed. [Confirmed: src/app/collection/page.tsx] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/hooks/useCollectionPrintings.ts]

### Proposed hook/state contract

1. Keep both hooks unconditional. Add `enabled?: boolean` to `CollectionRollupParams`, defaulting to `true`, and pass it to its main `useQuery`. Preserve its lazy `expand` API and normal default behaviour for other callers.
2. Add a page-local `viewResolved` boolean, initially false on the server and first client render. Resolve the existing preference once after hydration, then commit effective view and `viewResolved=true` together. Reuse `getPersistedViewMode` with an additive optional raw stored-value argument: omitted keeps its current no-argument behaviour; supplied string/null parses without another storage read. The page reads the existing key once inside its guarded effect, uses raw null to distinguish absence, and passes that observed value to the helper. This preserves parsing/defaults without two potentially inconsistent storage reads or a new preference module.
3. Rollup is enabled exactly when `viewResolved && viewMode === 'grid'`; printing exactly when `viewResolved && viewMode === 'list'`. A pending view is not an empty collection. A disabled query's `isLoading=false` must not bypass the initial-loading presentation.
4. Once resolved, use the existing shape-appropriate skeleton while the active view has no usable data. Before resolution retain the existing shell/loading reservation; never claim zero owned, correct empty results or completed first content from disabled-hook defaults. Do not introduce new controls, skeleton designs or a fixed artificial wait.
5. Resolve the preference without changing valid saved/default behaviour:

| Stored value | Viewport | Effective view |
|---|---|---|
| `list` | Any | List |
| `grid` | Any, including mobile | Grid |
| Absent | Width <=639px | List |
| Absent | Wider | Grid |
| Present but invalid | Any | Grid, preserving the current invalid-value fallback; do not rewrite the preference |

The last row follows the helper's grid fallback and the page's explicit-key-presence check; invalid versus absent is currently distinguishable. Existing toolbar tests expecting an absent/invalid value to return list disagree with the source; do not change product defaults merely to satisfy them. [Confirmed: src/components/collection/CollectionToolbar.tsx] [Confirmed: src/components/collection/CollectionToolbar.test.tsx] [Confirmed: src/app/collection/page.tsx]

For a storage-access exception, the new resolution gate must terminate rather than leave both queries disabled forever. Proposed narrow recovery: log one value-free warning and use the no-preference viewport default; do not erase storage or silently claim that a saved choice was read. This is explicit failure recovery, not a new preference policy. Only an explicit view click writes the existing preference; resizing after entry does not switch views automatically.

### Query lifecycle and request-work invariants

- **Fresh saved-list mount, successful uncached requests:** active dataset work changes from rollup plus printings to printings only. Grid mount remains rollup only. This excludes value/banner, layout, auth, assets and retries; it is not a claim that the whole page makes one network request.
- **View switch:** an uncached/stale newly visible view may fetch once; a fresh cached result need not fetch. Do not clear either cache on switch. Keep independent per-view page/sort state.
- **Previously started request:** switching away does not undo an already sent request. It may finish into its own cache under its original key, but must not replace active results, active errors or counts. No new cancellation policy is required; do not promise `enabled=false` cancels server work.
- **Hidden invalidation:** the existing collection invalidation must mark hidden cached results stale without starting that disabled view's read. On return it must revalidate; do not classify stale cached data as a valid <=0.5s return merely because it appears immediately.
- **Header:** use the active view's response, never hidden rollup totals as a fallback while list data waits/errors. Do not invent full original/proxy totals from a loaded page. If comprehensive counts need a response change, that is G1/G2, not a reason to retain hidden work.

Migration: none. Rollback: revert the page gate and additive hook control together; restore prior fetching without deleting cache, stored preference or collection data. No database recovery is needed. Loss of the optimisation on rollback is acceptable; retaining a gate with no enabled active query is not.

## 5. F2: one pause, atomic parameter/page transitions

### Inspected starting point and chosen boundary

The toolbar already has local immediate input, a cancellable 300ms timer, an `onSearchChange` callback and unmount cleanup. The page adds another 300ms timer, then resets pages in effects after query inputs change. Keep the existing toolbar boundary; remove the page's `useDebouncedValue` and its delayed-search variable. No new shared search controller is needed. [Confirmed: src/components/collection/CollectionToolbar.tsx] [Confirmed: src/app/collection/page.tsx]

**Proposed callback contract:** `onSearchChange(value)` means "commit the latest search after the toolbar's single 300ms pause." Raw typing still updates the input immediately. Both hooks receive this committed search directly; there is no second timer in the page/hooks/routes. The existing toolbar debounce test remains relevant.

### Page-local transition contract

Use one page-local state transition for query parameters and associated pages, such as a functional update of the page's query-state object. Do not introduce an app-wide state layer. No render may issue a new-filter/old-page query between a parameter change and its reset.

| Event | Atomic transition |
|---|---|
| Settled search, including clear | Commit exact search string and set both grid/list pages to 1. Keep current colour/sort/toggle values. An identical committed string is a no-op. |
| Colour set or colour mode change | Commit changed value and reset both pages to 1 using the existing committed search. |
| Grid sort field/default direction or direction toggle | Commit the final grid sort values and reset grid page to 1 only. |
| List sort field/default direction or header-sort toggle | Commit final list sort values and reset list page to 1 only. |
| Include proxies / existing include-missing toggle | Commit list-only query value and reset list page to 1; do not alter copy eligibility or implement Missing retirement here. |
| Page click | Change only the active view's page, within its known valid boundaries. No debounce. |
| View switch | Keep search/filters and each view's existing page/sort state; apply F1. |
| Status filter, once G1 is approved and wired | Commit server-effective predicate and reset both affected views' pages together; no client-page-only filtering. This is an integration requirement, not an implemented status request. |

The toolbar currently emits sort field and default direction through adjacent callbacks. Frontend must commit their final values before query observation (one event-batched transition or a narrow combined callback if needed), not request an intermediate direction. Header sorting and direction-only controls must obey the same rule. [Confirmed: src/components/collection/CollectionToolbar.tsx] [Confirmed: src/app/collection/page.tsx]

### Concurrency, clear and failures

- Replacing input cancels the previous toolbar timer. Clearing to an empty string follows the same single pause, cancelling pending nonempty input; do not introduce an immediate-clear network exception.
- Unmount cancels the pending timer. Parent/external search resets cannot allow an old timer to resurrect a cleared search. Sync from committed props must not overwrite more recent raw input. Test that race explicitly, without adding another pause.
- A filter/sort click during pending typing uses the **last committed search**, immediately. When typing settles, commit the new search with the then-current filters/sorts and reset relevant pages. These may be two intentional requests, not duplicates to suppress by delaying the filter click.
- Keep cache keys complete. Late response A for search A may populate A's cache, but never become displayed as response B. Previous-result placeholders stay explicitly refreshing; a stale/error response must not be relabelled a successful empty/new result. No broad fetch catch returning empty arrays.
- A network error follows the existing hook rejection and one automatic retry for that request's exact key. Switching to a different query/view must not show the old query's error or relabel its retry result. The existing visible Retry reloads the page, which resets local search/filter/page state and re-resolves the saved view; preserve that behaviour rather than promising same-filter replay. Replacing reload with per-query refetch would be a separate recovery change, not part of F1/F2. [Confirmed: src/app/collection/page.tsx]
- Local parameter changes are not server transactions. They only control read selection; they do not reserve, allocate, release or change the physical cards.

**Work expectation:** two serial configured 300ms pauses become one. In a no-error uncached test, one completed typing burst produces one active-dataset request; changing a filter/sort on a later page produces no intermediate new-filter/old-page request. This does **not** establish a 300ms real-world improvement or any measured typing-to-results latency.

Migration: none. Rollback F2 as a coherent page/toolbar callback change if necessary; do not restore only a second reset effect while leaving incompatible committed-state handling. Leave F1 and B1 intact if their contracts still hold. Clear only local in-progress input by normal navigation; no data reset.

## 6. B1: a single price-freshness observation

### Inspected starting point

Both handlers request `getLastRefreshTimestamp()` alongside `isPriceDataStale()`, but the latter performs the same timestamp lookup again. Rollup has three mutually exclusive freshness sites: empty count, empty page and normal page enrichment. Printings has one common freshness site before its branches. [Confirmed: src/lib/price-store.ts] [Confirmed: src/app/api/collection/rollup/route.ts] [Confirmed: src/app/api/collection/printings/route.ts]

### Proposed existing-helper contract

Keep `getLastRefreshTimestamp(): Promise<string | null>` as the sole database lookup. Add an optional observed-timestamp argument to the existing async helper:

```ts
isPriceDataStale(lastRefresh?: string | null): Promise<boolean>
```

- Omitted/`undefined`: preserve existing standalone behaviour, including one lookup.
- Explicit timestamp or explicit `null`: calculate only; **zero database reads**. In particular, do not use a null-coalescing fallback that fetches again for `null`.
- Each reached route freshness site obtains one timestamp, then derives `isPriceStale` from that same value. The normal rollup branch must still fetch copies and that single timestamp in parallel; deriving a boolean adds no database wait. Do not move freshness work before authentication or start it on paths that previously failed before reaching it.
- Preserve the global reference-price timestamp meaning and 48-hour strict `>` threshold; this is not per-user/per-card refresh history. No new price update, shared cache, scheduled job, external Scryfall call or index.

| Observed metadata at a fixed test clock | Envelope / helper result |
|---|---|
| Valid timestamp <48h old | Same timestamp; `isPriceStale=false` |
| Exactly 48h old | Same timestamp; `false` |
| 48h plus 1ms old | Same timestamp; `true` |
| Valid future timestamp | Same timestamp; existing calculation yields `false`; clock-skew policy is not changed here |
| No reference rows / no timestamp | `lastPriceRefresh=null`, `isPriceStale=true`; do not invent a recent time |
| Metadata lookup schema-cache/42P01 failure | Existing warning and null behaviour retained; envelope remains `null/true` |
| Other metadata lookup failure | Existing error logging and null behaviour retained; envelope remains `null/true`; card results remain usable if their own read succeeded |
| Malformed timestamp supplied to the helper | Explicit value-free error/warning and `true`, never NaN interpreted as fresh. If encountered at the lookup boundary, normalise the invalid metadata to null there and report it. This narrow invalid-data guard does not change valid timestamp semantics. |

Unknown metadata is not a new successful price refresh; it is the existing null/stale indication. Do not add a new response enum or replace route-level card errors with metadata fallback. One rather than two log emissions for one failed metadata read is the intended duplicate removal. Generated source types declare `ref_printings.updated_at` as a string, not proof that runtime input validation is unnecessary. [Confirmed: src/lib/price-store.ts] [Confirmed: src/types/supabase.ts]

**Work expectation:** each freshness-reaching handler invocation drops from two latest-timestamp selects to one. Authentication/count/card failures before that site still do zero, not a forced extra read. All other database work and browser API counts are unchanged. Every successful empty/normal branch uses the same observed timestamp for both returned fields.

Migration: none; no table/PK/FK/unique constraint/RLS alteration. The existing `ref_printings` read projection, order and limit remain unchanged. Rollback must first restore compatible callers (or revert helper/callers together); a one-argument caller must not be deployed against a removed helper signature. No persisted recovery or price recomputation is needed.

## 7. Focused acceptance examples and selectors

These are **future offline implementation acceptance checks**, not tests executed by this architecture task. Stub fetch/auth/database boundaries; do not mount the real Oracle provider or allow unmocked network calls in unit/component tests. Use fake timers for configured delays, deferred promises for response races, and real QueryClient behaviour for cache/enable transitions.

| ID / case | Exact invariant to assert |
|---|---|
| C27-F1-01 cold saved list | Saved `list`, initially unresolved hydration: neither data request before resolution; afterwards printings only, no rollup. No false empty collection or zero-owned completion while disabled. |
| C27-F1-02 preferences | Saved grid on mobile remains grid; absent mobile becomes list; absent desktop and invalid stored value become grid. Storage exception logs and exits the gate with the documented recovery. No preference write during entry. |
| C27-F1-03 switch and return | List -> grid -> list. Uncached target fetches; fresh target reuses the same key/result. A response from an earlier now-hidden request cannot replace the visible view. |
| C27-F1-04 invalidated hidden cache | Invalidate collection while list is hidden: no hidden request; on activation stale list revalidates. Old totals/status cannot count as verified fresh content. |
| C27-F2-01 rapid typing/clear | Enter `S`, `So`, `Sol`, clear before the last timer expires. At 299ms since final input no commit; at 300ms exactly one empty-string callback. An unchanged initially empty query does not refetch. Repeat from committed `Sol` to prove one unfiltered request after clear. |
| C27-F2-02 burst from page 3 | Begin with a committed grid search/page 3. Settle `Sol Ring`: first requested new key is search `Sol Ring`, page 1; no search `Sol Ring`, page 3 request. List page also resets but remains disabled. |
| C27-F2-03 later-page colour/sort | Grid page 3/list page 2: colour change resets both; list sort resets only list. Request observes the final field/direction together at page 1. Verify identities/order/totals against the fixture, not just callback invocation. Existing unsupported sort/exact-colour cases remain explicit failing/G1-G2 cases until corrected. |
| C27-F2-04 filter while typing / view switch | Filter click sends last committed search plus new filter at page 1. Settled search uses latest filter/view, not stale captured state. A raw newer keystroke survives older committed-prop sync; unmount cancels pending work. |
| C27-F2-05 reversed responses | Start query A, commit B, resolve B then A. Visible rows/counts stay B. Placeholder A before B is labelled refreshing, not complete. Changing page/view cannot promote A to B. |
| C27-F2-06 error/retry | Fail current read, retain explicit error semantics and one automatic retry with that exact key. A successful response clears that error; a hidden failure does not replace active content. Assert visible Retry invokes the existing reload; re-entry uses default query state and F1 saved-view resolution, not an invented same-filter replay. HTTP failures are not empty arrays. |
| C27-B1-01 value/clock boundaries | The fixed-clock table in section 6, including explicit null and malformed input. Supplied timestamp/null performs zero helper reads; omitted argument performs one. |
| C27-B1-02 handler branches | Rollup: empty count, empty page, normal page. Printings: no copies, searched empty, normal fast branch, fallback branch. Each reached freshness path makes exactly one timestamp select and returns coherent fields. |
| C27-B1-03 failure boundaries | Metadata failure logs once and yields null/stale without refetch; pre-freshness auth/read failure does not initiate metadata work. Normal card-data errors remain errors. |
| C27-G1-01 disconnected status | Selecting a status with a known different whole-result set must change matching IDs/totals/page 1 once wired. Current unchanged results fail this case; a fast callback or green control is not a pass. |

Reuse existing accessible selectors, not CSS/spinner disappearance: `Search cards by name`, `List view`, `Grid view` with `aria-pressed`, `Sort by field`, `Sort direction: ascending/descending`, `Color filter mode`, `Color identity filter`, `Status filter`, `Next page`, `Previous page`, and the existing error/retry content. Pair each with request-key capture and known row/total assertions. [Confirmed: src/components/collection/CollectionToolbar.tsx] [Confirmed: src/app/collection/page.tsx]

Suggested later test locations/selectors (not created now):

- Extend `src/components/collection/CollectionToolbar.test.tsx` for debounce cancellation/prop-sync cases; existing `debounces search by 300ms` and view preference cases are the starting point.
- Add `src/app/collection/page.test.tsx` for real-hook/mock-fetch F1/F2 and G1 integration cases.
- Add `src/lib/price-store.test.ts`, `src/app/api/collection/rollup/route.test.ts`, and `src/app/api/collection/printings/route.test.ts` for B1.
- Focused future runner selections: `npm test -- src/components/collection/CollectionToolbar.test.tsx src/app/collection/page.test.tsx` and, independently, `npm test -- src/lib/price-store.test.ts src/app/api/collection/rollup/route.test.ts src/app/api/collection/printings/route.test.ts`. The proposed new files do not exist yet; these are handoff commands, not claimed results. Do not run the environment-dependent app/E2E suites as a substitute.

## 8. G2: larger printing-pagination decision, separate from the three fixes

The baseline established that the printing route fetches/sorts copies before slicing, then groups the sliced copies. Current `totalCount` counts copies, not grouped rows; finish is collapsed through `isFoil`. No complete pagination redesign, SQL or index proposal is included here. [Confirmed: docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md] [Confirmed: src/app/api/collection/printings/route.ts] [Confirmed: src/lib/collection-printing-utils.ts]

**Recommendation, owner review required:** a list page should count visible printing/finish/copy-type groups, with physical copies still identifiable inside each group. A proposed group identity uses user scope, canonical card, specific printing, exact finish and Original/Proxy; excluded-copy state must not be merged into eligible supply while D-028 remains unresolved.

Example: Sol Ring has two Original nonfoil copies of printing A, one Original foil A, one Original etched A, one Proxy nonfoil A and one Original nonfoil B. That is **six copies and five distinct rows**; a proposed two-row page gives three pages, and a row's quantity does not change because a page boundary cut its copies in half.

| Owner choice | What changes on screen | Trade-off |
|---|---|---|
| **Recommended: one row per printing, finish and copy type** | Duplicate matching copies share a quantity; Original, Proxy, foil and etched stay distinct. Page totals count rows, with copies counted separately. | Group selection must explicitly identify which real copies are affected. |
| One row per physical copy | Every owned copy has its own row and page position. | Simpler exact-copy selection, but more repeated rows and longer lists. |

Before implementation, the follow-up contract must settle stable row identity and selection semantics, explicit row-versus-copy totals (do not silently change `totalCount`), grouping of eligibility states, treatment of unknown printing/finish, sort null-ordering and the existing supported filter meanings. Use deterministic tie-breaks after the chosen sort: agreed card-name collation, canonical ID, printing ID, exact finish, copy type and stable row identity. Counts, filtering, grouping and pagination must operate on the same full logical result. Review compatibility/versioning before changing response or selection IDs; a group key is never a `physicalCopyId`.

Acceptance includes full traversal of equal-name/equal-price ties, ascending/descending sorts, same printing across finish/type variants, original/proxy totals and no omitted/duplicated group. Keep physical assignment distinct from row grouping. Any database changes require a later schema/constraint/RLS/query-plan review and owner approval; this report neither certifies the live schema nor recommends a speculative index.

## 9. T-28 interface dependency, not a second assembly design

The frozen draft provides `PicklistResponse`, `PicklistRow`, `PicklistOption`, `CopyLocation`, `ActionSuccess.affected` / `AffectedRefs` and `ErrorBody`. Use those as **integration topics**, not final field guarantees. [Confirmed: docs/oracle/contracts/card-state-actions.md] [Confirmed: docs/oracle/contracts/card-state-actions.types.ts]

| Loading consumer needs | Frozen interface mapping | Acceptance gate before use |
|---|---|---|
| Primary usable assembly content | Row identity/requested printing; `options[].copyId`, copy type, printing, finish, location and action preconditions; progress/readiness | Reviewed successor must retain genuine unknown locations and exact identity. No approximate-name match may authorise a move. |
| Honest failure/freshness | `dataState`, `generatedAt`, row availability error, `ErrorBody` | Resolve draft gaps for unknown readiness, stale/partial eligibility and unconditional `proxyAction`. Row errors are visible failures, not successfully usable action rows. |
| Cross-deck convergence | `affected.deckIds`, slot/copy/card references and `collection` | Donor and destination both required; reviewed retry semantics distinguish same-operation replay from a conflicting actor/unknown outcome. Do not adopt draft "filled slot means my Proxy succeeded". |
| Required/generic membership | Relation, outstanding quantities, generic-land coverage | Follow D-005/D-018/D-032 after the relation/invalid-quantity gates are resolved; do not adopt the frozen category heuristic as a new locked representation. |

When that interface is accepted, map affected decks through existing normalised `deckKeys.detail/cardStatuses/health`, plus `picklist` and `allocation`; invalidate deck list and relevant `cardActions`/Collection/storage consumers explicitly. `['decks']` does not cover the separate `['picklist']`/`['card-actions']` families. Hidden Collection queries introduced by F1 must stay invalidated until enabled. This is an integration checklist only: T-28 owns the exact affected set, action semantics and atomicity. [Confirmed: src/hooks/useDeckQueryKeys.ts] [Confirmed: docs/oracle/contracts/card-state-actions.md]

Keep pick-list field/eligibility repairs and both-deck refresh with T-28/T-25. Broader deck enrichment, value-banner scans, reconciliation and grid-expansion/image optimisations stay queued until new evidence warrants a bounded handoff. The prior reconciliation fix is not presumed broken.

## 10. Safe measurement setup proposal - no execution permission

### 10.1 Environment and authority

**Recommend a dedicated HTTPS frontend backed by a separately verified isolated Supabase project, with an existing dedicated test identity.** A preview frontend sharing the owner's backend is not isolation. Do not create a project/account, copy private data, read secrets, authenticate, seed fixtures or start services under this assignment.

Preserve the existing E2E preflight: approved `E2E_BASE_URL`, verified isolated intent before `E2E_ISOLATED=true`, HTTPS only, no production/loopback/localhost target, and no shared-readonly/isolated flag combination. The shared-readonly mode remains limited to its one reviewed smoke spec; do not expand it for this proposal. Its label alone cannot override the navigation write hazards. [Confirmed: playwright.config.ts] [Confirmed: tests/e2e/README.md]

A later operator must record deployed app commit, backend identity/isolation evidence, dedicated fixture ownership and approved preview access, current schema compatibility, fixture revision, allowed routes/writes, exact profiles and a finite run budget before preflight or browser/API work. No owner credentials. If setup needs provisioning, costs, schema changes, fixture seeding or cleanup, commission and approve those separately; the current no-new-services/no-writes limit remains.

### 10.2 Smallest useful fixture versus representative timing data

**Proposed protocol fixture:** 101 distinct card identities, each with one original, plus five additional Sol Ring variants as in section 8 (106 physical copies total, one a proxy). This crosses the current 50-card grid and 100-copy list boundaries. Include known colours, search matches/nonmatches, sortable equal values, null prices and stable reference printing metadata. Prepare it offline first; only a later approved setup operator may load it into an isolated target. No benchmark result on this tiny fixture may be presented as owner-sized performance.

Use deterministic fake responses for stale ordering, metadata errors, network retries and disconnected-status cases in the offline implementation tests. No live errors need to be induced to validate those mechanics. A later representative performance fixture must additionally match approved collection/deck sizes and copy distribution; those counts remain unknown and must be declared before comparison. Prefer non-private generated fixture data with real reference card identities, not an unapproved copy of the owner's inventory.

For later deck/pick-list work, extend the same approved fixture with two explicit source/destination decks, known storage, an original and proxy held elsewhere, a free copy, an unknown-location copy, generic and tracked basics, and approved Maybeboard examples. Do not seed those now, invent a maybeboard relation, or exercise actions to manufacture them. Reconciliation needs its own approved existing batch/entry state; importing to get there is not measurement setup by implication.

### 10.3 Background writes and safe failure

The unchanged baseline traced two incidental writes: Oracle context changes can create `oracle_sessions` even with the sidebar closed, and a missing deck health result can cause a `deck_health` upsert from GET. [Confirmed: docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md]

Proposed handling in a later isolated run:

- Explicitly approve and account for these named background writes **only in the isolated fixture**. For Collection-only timing, normal session creation is included in traffic; health is not a Collection prerequisite. No allocation, import, price refresh, reset or AI request is allowed.
- Record whether a conversation/health result already exists. Cache-cold browser state does not mean missing server data. Do not reset the database between every sample to fake a cold start; fixture reset and restoration require a separate authorised procedure.
- Pre-existing conversation/health rows are not a guarantee of read-only operation (sessions age; fixture/deck state varies). A database role that rejects writes or intercepted requests yields an altered/failing journey, not comparable production-like timing.
- If incidental writes are not approved, the browser baseline stays blocked. A separately approved direct read-only API measurement can be useful, but must be labelled request-only and cannot verify usable-screen goals.
- Stop before any request outside the approved route/method/host set or when identity/isolation cannot be verified. Preserve the stopped/failed trial. Do not permit unknown requests just to complete a graph.

### 10.4 Proposed profiles and capped first run

These are proposed numbers for approval, **not observed conditions or current limits**:

| Profile | Proposed controlled conditions |
|---|---|
| Desktop | Named physical desktop and installed browser/version, recorded OS/CPU, 1440x900 viewport, no CPU throttle; controlled 20ms added latency, 50Mbps down / 10Mbps up. Record actual unthrottled connection separately; added latency is not total RTT. |
| Mobile/network | Same named browser engine for an explicitly labelled emulation, 390x844 viewport, 4x CPU slowdown, controlled 150ms added latency, 1.6Mbps down / 0.75Mbps up. This is not evidence from a physical phone; use an agreed real-phone profile instead if that is the requirement. |

First timing stage: Collection grid/list **first visit and valid warm return**, four cells per profile, 20 attempts each: **160 measured attempts per approved data revision/run**. A warm-return trial includes its prerequisite first load and navigation away/back; those requests count even though only the return milestone is the warm sample. Up to four preliminary calibration trials are allowed only if explicitly included in approval; total <=164 trial scenarios. Cold/return results remain separate.

Proposed conservative caps for that stage: **20 first-party API requests and 250 total browser-network requests per scenario; 2,500 first-party API and 25,000 total browser-network requests for the run**, counting setup navigations, redirects, auth, calibration, failures and retries. Browser asset fan-out is not database query count; record database work separately if approved existing telemetry exposes it. Caps are stop limits, not predicted usage or promises that the matrix will fit.

One trial at a time, no overlapping trials, with a five-second minimum quiet interval after completion and a 30-second usable-content deadline. Natural concurrent requests within one page remain intact. Unfinished traffic must settle or be explicitly terminated before another trial; retain the failure. Preserve the application's one retry; do not enable whole-trial retries that discard slow/failed attempts. Stop the run at a cap, an unexpected write, auth/isolation failure, a rate-limit response or three consecutive failed/time-out trials. No silent budget extension or replacement sample.

Calibration decides whether the approved caps/profile/fixture are adequate; if not, request a revised manifest before more traffic. A protocol-fixture run and a representative-fixture run require separate approved manifests/budgets; the 160-attempt matrix does not authorise both automatically.

Search/filter/sort/page/view-switch timing follows in a separately budgeted stage after the relevant correctness gates pass, at >=20 attempts per named journey/profile. Status filters remain excluded from successful measurement until G1 is resolved. Deck/pick-list/reconciliation and action convergence remain separately scoped; the Collection cap does not authorise them.

### 10.5 Milestones, evidence and percentile rules

- First visit uses fresh browser application/query/HTTP cache with only the approved dedicated auth state. Warm return uses the same QueryClient and unchanged fixture, returning within an agreed window under five minutes. Invalidated/stale returns are separate trials, not valid-cache successes.
- Start at navigation/click or the last keystroke, as appropriate. Stop at **correct active-view rows, correct response-associated totals/order and usable controls**. A skeleton disappearing, a stale placeholder, an unsupported filter or an empty error fallback does not qualify. Prices/value/analysis finish separately. Pick-list usable content later additionally requires truthful sources and executable eligibility; row failures count as failures, not an alternative successful milestone.
- Record browser request start/first byte/end, action-to-usable, request counts and bytes, retries/status/outcome, cache/profile/fixture/app revisions and correctness results. Label server/database timings unavailable unless separately captured through approved existing evidence; browser response time is not database duration. Unknown cross-origin byte counts are null, not zero.
- Store sanitised run manifest/trial JSONL/summary only in the subsequently approved evidence location. No auth contents, cookies, raw headers, secret-bearing URLs, chat bodies or private export files. Configure all reporters/traces before running; default test artifacts must not leak outside that boundary.
- Retain failures, timeouts, cap-stops and incorrect results; no fastest-run selection. Unconditional nearest-rank p95 is `ceil(0.95*n)` in sorted usable times with failed/incorrect trials treated as non-meeting/censored. At n=20 it is the 19th rank. If the rank is censored, report the bound/not established, not an invented duration. Always report attempts, success/goal-pass fraction and failures alongside it.
- Approved goals remain <=2s first usable and <=0.5s valid warm return for >=95% of attempts. Search <=1s including the single 0.3s pause and acknowledgement <=0.1s are supporting proposals, not newly approved budgets. Reconciliation/convergence budgets remain unset. Compare identical profiles/data before/after; report unmet goals rather than relaxing them.

**Plain approval request:** approve a separate test copy with representative card counts, a dedicated test account and the capped Collection run above, allowing only the named background saves inside that copy. Approve its setup separately if it does not already exist. Until then there are no real timings and no authorised runtime work.

## 11. Bounded handoffs and finish gates

| Recipient / order | Handoff | Finish / stop |
|---|---|---|
| Owner/Orchestrator | Accept or revise this three-slice scope and separately decide measurement setup/run permission. | Record distinct implementation and environment approvals; no implied release permission. |
| Frontend F1, then F2 | Reuse page, toolbar, rollup/printing hooks and current feedback. Implement enabled/hydration and coherent settled-query state only. | Pass named F1/F2 offline cases, preserve defaults/cache/error semantics, document G1/G2 failures separately; no new UI/status rules. |
| Backend B1, independent | Reuse price-store and two handlers; one observed timestamp with no extra null fallback read. | Pass named helper/branch/error cases; unchanged valid payloads, no migration/price writes. |
| Architect/Backend + UX, G1/G2 | Review full-result status semantics and page/selection units before larger data retrieval work. | Owner review of changed row/selection presentation; no SQL/index work dispatched from this document. |
| T-28/T-25/T-26 consumers | Reconcile final source/eligibility/errors/retries/affected-deck interface before assembly/loading integration. | No competing predicates or adoption of frozen draft gaps; no stale both-deck state accepted as a fast result. |
| Measurement operator, only after explicit approval | Verify manifest, preflight and limits; collect capped before/after evidence on approved isolated data. | Stop on gate failure; no source edits, unapproved writes or expanded suite. Report partial coverage honestly. |

The three changes are reversible application changes without stored-data conversion. A later release must retain its previous revision for rollback; rollback does not undo any isolated background rows created by an approved measurement run. Their cleanup is separately authorised, scoped to known fixture records, and never a broad deletion/recompute. Runtime latency sign-off remains distinct from architecture completion and offline request-work acceptance.
