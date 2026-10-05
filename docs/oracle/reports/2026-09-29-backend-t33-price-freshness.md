# Report: price-freshness-single-read (T-33 / B1)
Role: Backend
Status: DONE
Task as received: Correct R4 and the bounded T-33 test/report accuracy items in docs/oracle/reports/2026-09-29-orchestrator-first-implementation-review.md; this is a same-task correction within your original ownership and safety limits. The coordinator reproduced isPriceDataStale('') silently treating malformed input like explicit null, while verifying your 27 tests and unchanged type/lint baseline; implement the narrow diagnostic correction and exact regressions rather than broader refactoring.

## Summary for the owner (this correction pass)

The coordinator's review found one small gap in the price-freshness fix: if the database ever stores a genuinely broken value (not "no data yet", but an empty/garbled value), the app silently treated it like "no data" instead of flagging it. It's now flagged accurately — you would still see "stale" pricing in that rare case either way, only now it's recorded internally so it can be traced. Also corrected: two claims in the previous report were inaccurate (a mislabeled test and an unproven "runs in parallel" claim); the underlying behaviour was already correct, only the report/test wording was wrong. Both are now fixed and proven.

## R4 correction (this pass)

**Bug reproduced:** `isPriceDataStale('')` — and any other explicit falsy-but-non-null string such as whitespace — hit the `if (!observedRefresh) return true` short-circuit before ever reaching the malformed-timestamp check, so it returned `stale=true` with **zero diagnostic**. Contract section 6 requires a malformed supplied timestamp to log a value-free diagnostic; only explicit `null` (or omitted-and-not-found) should be silent.

**Fix:** `src/lib/price-store.ts` — narrowed the "no diagnostic" branch to `observedRefresh === null` specifically. Any other value (including `''` and whitespace-only strings) now falls through to `new Date(...).getTime()` → `Number.isNaN` → the existing value-free `console.error` and `stale=true`. Explicit `null`, explicit timestamp, and omitted/`undefined` behaviour are all unchanged.

**New regression tests added to `src/lib/price-store.test.ts`:**
- explicit `null` → zero reads, stale=true, **no** diagnostic logged (tightened the existing test to assert `console.error` was not called).
- explicit `undefined` → behaves exactly like omitted: one read.
- explicit `''` → zero reads, stale=true, **one** value-free diagnostic (the exact regression for this bug).
- explicit `'   '` (whitespace-only) → zero reads, stale=true, one value-free diagnostic that does not contain the raw value.
- omitted argument with a metadata lookup failure → exactly one read attempt, exactly one log (proves the wrapper doesn't double-log on top of `getLastRefreshTimestamp`'s own failure log).

## Test/report accuracy corrections (this pass)

- `src/app/api/collection/rollup/route.test.ts`: the test titled *"card-data errors after the freshness site remain route errors, not metadata fallback"* actually failed in Step 1b's page query, which runs **before** any freshness site in this route — it was mislabeled. Renamed to *"page-query error (still before any freshness site is reached) starts no metadata work"*, with its assertions corrected to expect **zero** `getLastRefreshTimestamp`/`isPriceDataStale` calls (previously it asserted nothing about call counts). A new, accurately-named test — *"a genuine post-freshness-site card-data error (copies query fails) still remains a route error"* — was added: it fails the `user_copies` query in the normal branch, where `getLastRefreshTimestamp` has already been started inside the same `Promise.all`, and asserts it was called exactly once while `isPriceDataStale` is never reached (the `Promise.all` rejection short-circuits before that line).
- The prior test titled *"...run in parallel"* asserted call counts only and never proved concurrency. Split into two tests: a plain call-count test (renamed, unchanged assertions), and a new deferred-promise test that records `start:copies`/`start:timestamp` events from controlled, unresolved promises and asserts both fire before either resolves — this is a genuine concurrency proof, not an inferred one from call counts.
- Prior report claimed only the printings route's 12 pre-existing lint findings; the rollup route's 4 pre-existing `no-explicit-any` errors (lines 115, 248, 252, 259 — all outside this task's diff, confirmed via `git diff`) were omitted from that count. Corrected below.

## Summary for the owner (original implementation)

When the collection screen loads its "prices last updated" note, the app used to check the database clock twice for the same answer. It now checks once and reuses that single answer everywhere the note is shown. Nothing about what you see changes — the same freshness message, the same 48-hour "stale" rule, the same error handling if that check fails.

## Changed files

- `src/lib/price-store.ts` — `isPriceDataStale` now accepts an optional already-observed timestamp (explicit value or `null` skips the database read entirely; omitting it keeps the old one-read behaviour). `getLastRefreshTimestamp` now guards against a malformed stored timestamp by normalising it to `null` and logging a value-free diagnostic, instead of letting an invalid value flow downstream. **This pass:** narrowed the "silent" branch inside `isPriceDataStale` to `observedRefresh === null` only, so malformed non-null strings (`''`, whitespace) reach the existing malformed-timestamp diagnostic instead of being swallowed.
- `src/app/api/collection/rollup/route.ts` — all three freshness sites (empty-count branch, empty-page branch, normal enrichment branch) now fetch the timestamp once and pass it into `isPriceDataStale`, instead of fetching it a second time via a separate `isPriceDataStale()` call.
- `src/app/api/collection/printings/route.ts` — its single shared freshness site now passes its own timestamp into `isPriceDataStale` instead of re-fetching it.
- `src/lib/price-store.test.ts` — 17 tests (was 13; +4 this pass: explicit-`undefined`, explicit-`''`, explicit-whitespace, metadata-failure-single-log) covering the helper's lookup-count contract and the fixed-clock boundary table from contract section 6.
- `src/app/api/collection/rollup/route.test.ts` — 9 tests (was 7; net +2, with 2 renamed/corrected and 1 new concurrency proof added) covering all three reachable freshness branches, null/error propagation, and pre-/post-freshness failure short-circuiting.
- `src/app/api/collection/printings/route.test.ts` — 7 tests, unchanged this pass (R4 did not touch this file's claims), covering the optimized path's no-copies/searched-empty/normal branches, the fallback (non-`cardName` sort) branch, and the same null/error boundaries.

No other files were touched. No hooks, page/UI components, other API routes, schema, or provider code were edited.

## New decisions made (need owner confirmation)

- None. This is a behaviour-preserving internal fix; no new API shape, UI text or product decision was introduced.

## Assumptions

- Per contract section 6, "malformed timestamp" covers two distinct guard points: a bad value read from the database (normalised to `null` at `getLastRefreshTimestamp`, so routes see the existing null/stale path) and a bad value passed directly to `isPriceDataStale` (treated as stale with a value-free log, never parsed as `NaN`-is-fresh). Both are implemented and tested separately. **This pass** closes the gap where an explicit falsy-but-non-null string bypassed that second guard point.
- The printings route's fallback path has a pre-existing quirk where per-batch `!includeProxies`/`!includeMissing` filtered batches inside its first (optimized) loop don't check the Supabase error field before pushing rows — that is unchanged, out of scope, and not something this task fixed or masked. (The rollup route's now-corrected post-freshness-failure test uses the rollup route's own `user_copies` query, not the printings route's fallback loop, for a cleaner reproduction.)

## Challenges to locked decisions

- None.

## Open questions

- None. Scope was fully addressed within the named owned files.

## Verification

- `npm ci` — dependencies were missing in this isolated worktree; restored from the existing lockfile only (no package/version changes) because the initial `npx vitest run` failed with `Cannot find module 'vitest/config'`.
- `npx vitest run src/lib/price-store.test.ts src/app/api/collection/rollup/route.test.ts src/app/api/collection/printings/route.test.ts` — **33/33 passed** (17 helper tests, 9 rollup-route tests, 7 printings-route tests; was 27/27 before this correction pass). All fetch/auth/database boundaries are mocked; no live network or database calls. Clock boundaries in `price-store.test.ts` use `vi.useFakeTimers()` / `vi.setSystemTime()`; route tests assert exact call counts on mocked `getLastRefreshTimestamp`/`isPriceDataStale` to prove the "one reached freshness site → one lookup" invariant per handler branch; the new concurrency test in the rollup suite uses controlled/deferred promises rather than call counts to prove the two operations start together.
- `npx eslint` on all six changed/added files — **15 errors, 2 warnings, all pre-existing and unchanged by this task** (corrected from the prior report, which stated only the printings route's findings): printings route has 12 pre-existing errors + 2 warnings (`no-explicit-any` ×10, `prefer-const` ×3 — one line has both, unused-var/unused-import warnings ×2) on lines untouched by this change; rollup route has 4 pre-existing `no-explicit-any` errors at lines 115, 248, 252, 259, also untouched. Confirmed via `git diff` that this task's edits are confined to the freshness-lookup call sites and the helper signature; none of the flagged lines were added or modified here.
- `npx tsc --noEmit` (full project; no `typecheck` npm script exists) — **251 errors, byte-identical to the prior verified pass** (diffed the two full outputs; zero difference). Full output saved to the session workspace (`t33-typecheck-r4-output.txt`, alongside the earlier `t33-typecheck-baseline-output.txt` / `t33-typecheck-full-output.txt`).

### Acceptance checklist (contract section 6/7, B1 only)

1. Optional observed-timestamp argument added; omitted/`undefined` still performs one lookup; explicit timestamp/`null` performs zero lookups — **covered**, `price-store.test.ts`.
2. Each reached route freshness branch obtains exactly one timestamp and derives both metadata fields from it (rollup's three sites; printings' shared site); normal rollup enrichment still runs copies-fetch and the timestamp fetch in parallel — **covered and now proven for concurrency**, not just call counts, via the new deferred-promise test.
3. Strict `>48h` threshold, valid-future-timestamp semantics, valid payloads, user scope, card-data errors, and metadata null/logging behaviour preserved; malformed runtime timestamp logs a value-free diagnostic and becomes unknown/stale — **covered**, `price-store.test.ts` clock-boundary table plus malformed-timestamp cases at both guard points, **now including explicit `''`/whitespace as the R4 regression**.
4. Mocked auth/database boundaries, frozen clock, and asserted lookup counts: explicit `null` performs zero (**and now asserts zero diagnostic**), omitted performs one, metadata failure logs once and returns null/stale, failures before the freshness stage start no metadata work — **covered** across all three test files, including the corrected pre-/post-freshness distinction in the rollup suite.
5. No price fetch/refresh, cache-duration change, extra endpoint, broad query refactor, or data writes were added — confirmed by the diff: only the freshness call sites, the helper signature, and the `null`-vs-malformed guard were changed.
