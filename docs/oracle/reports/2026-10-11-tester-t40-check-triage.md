# Report: T-40 — triage every failing automatic check on main

Role: Tester (read-only)
Status: DONE
Task as received: "Triage every failing automatic check on main: the 134 failing unit tests in 34 files (`npx vitest --run`), the ~141 type errors (`npx tsc --noEmit`), the 264 lint errors (`npx eslint .`), the E2E Tests workflow run on 1a39d6f and the failing Sync Commanders and Shared Read-only Smoke scheduled jobs (`gh run list` / `gh run view --log-failed`); classify each group as out-of-date check, real app bug (name the phase from docs/oracle/roadmap.md), or belonging to paused Phase 8/9 work, confirm no test writes to real data, and propose fix batches that share no files, writing your findings to the report only."

## Summary for the owner
Almost every red check is out of date, not a real fault in the app. The test suite is asserting the old wording, old colours and old screens after a run of redesigns (for example the pips test still looks for coloured dots where the app now shows real mana symbols, and the dashboard test still looks for a "Decks" title the app no longer shows). Nothing I found points to a live user-facing feature being broken. Your cards still live in the online database, so the database side still matters — only the online **website** part gets looked at last. The three GitHub jobs that test the hosted website (the end-to-end test, Sync Commanders and the Shared Read-only Smoke) are marked **low priority while Vercel is off**; the two scheduled jobs are only failing because the cloud credentials they need were never set up, and the end-to-end job fails on purpose because its separate test copy of the app was never configured. Your decision: spend the next batch updating the local tests first (recommended), or simply switch the two scheduled jobs off.

**Priority update from Gene (2026-10-11, corrected):** the owner runs the app locally but it still uses the **hosted Supabase database**; he simply does not want Vercel for now. So hosted-database failures still matter. Only the Vercel deployment and the GitHub scheduled jobs / E2E workflow (which target the hosted app) are low priority. Local unit tests, type errors and lint stay first in the recommended batch order below.

**For Brad (plain words):** Your cards still live in the online database, so only the online website part gets looked at last.

## Verification
- `npm ci` — exit 0 (repo had no `node_modules`; needed to run the checks).
- `npx vitest --run` — 34 failed files / 96 passed / 1 skipped; 134 failed tests / 1412 passed / 1 skipped (1547 total).
- `npx tsc --noEmit` — exit 2; 139 `error TS` lines (~141 reported; some span two lines).
- `npx eslint .` — 581 problems: 264 errors, 317 warnings (24 errors + 2 warnings auto-fixable).
- `gh run list` / `gh run view --log-failed` — inspected E2E `38103595725` (on `1a39d6f`), Sync Commanders `38048469962`, Shared Read-only Smoke `37950769014`, Sync EDHREC `37204251844`.
- `git status --short` — empty. No source changes made.

## Changed files
- None. (Read-only task. `npm ci` only populated the ignored `node_modules/`.)

---

# 1. The 134 failing unit tests (34 files)

**Headline: every one of these 134 is an out-of-date check or a test-harness gap. I found no unit failure that demonstrates a broken user-facing feature.** They fall into a handful of root causes; each file below carries its cause and class.

## Class: out-of-date check (app changed on purpose; test asserts old behaviour)
| File (failing tests) | Cause |
|---|---|
| `src/app/page.test.tsx` (4) | Dashboard was redesigned. Test wants an `h1` "Decks", a "Brew Deck" link and copy "No decks found…"; the page now renders a "Welcome to The Oracle" empty state ("Bring your collection over"). |
| `src/components/Sidebar.test.tsx` (2) | Nav is now 7 items incl. "Card Management"; test expects the old 5-item list incl. "Cards". |
| `src/components/DeckTile.test.tsx` (2) | Count shows `100/100 slots` for inactive decks (was `cards`); readiness border was replaced by a status badge (commit `7073e63`). `borderColor` is computed but no longer applied (dead code). |
| `src/components/DraftDeckTile.test.tsx` (11) | Badge/label renamed "Draft" → "Brewing" (`aria-label` "Brewing: …" vs "Draft deck: …"); heading weight `font-bold` → `font-medium`. |
| `src/components/ColourPips.test.tsx` (3) + `src/components/accessibility.test.tsx` (2) | Pips replaced by Scryfall mana icons (commit `f694b34`); test queries `span[aria-hidden]`/inline background colours that no longer exist, and now finds multiple `role=img` (icons) instead of one wrapper. |
| `src/components/ManaCost.test.tsx` (2) | Renders mana-font `<i>` icons now; no text node `{2}{U}{B}` and no `font-mono` class. |
| `src/components/OwnershipBadge.test.tsx` (3) | `aria-label` is "Original claimed by" (was "held by"); size uses token `text-[length:var(--fs-sm)]` (was `text-xs`). Vocabulary change follows D-025. |
| `src/components/InlineDeleteConfirmation.test.tsx` (2) | Destructive button uses `bg-destructive/10` (was literal `bg-[rgba(226,75,74,0.15)]`). |
| `src/components/collection/CollectionToolbar.test.tsx` (2) | Default view mode is now `grid` (was `list`). |
| `src/lib/__tests__/render-card-links.test.tsx` (1) | Card link no longer carries `text-[#2dd4a8]`; colour is now ownership-based. |
| `src/lib/__tests__/url-parser.test.ts` (1) | `supportedFormats` now has 7 entries (test expects 4). |
| `src/app/api/decks/[id]/upgrade/route.test.ts` (3) | Route now enriches ownership from `deck_cards.ownership_status` (D-001/T-04 model); test seeds the retired `deck_allocations` table, so `ownership_status`/`conflict` come back null/undefined. |
| `src/app/api/archidekt/create-deck/route.test.ts` (0 tests, suite fails to load) | Imports `@/lib/archidekt-playwright`, a module that no longer exists. Obsolete — should be deleted or rewritten. |

## Class: out-of-date test harness / Supabase mock (not an app bug — the mocks no longer match the chains the code calls)
| File (failing tests) | Cause |
|---|---|
| `src/lib/csv-import.test.ts` (8) | Mock Supabase chain / delta expectations no longer match the current `applyCollectionImport` + `computeCollectionDelta` signatures. |
| `src/lib/__tests__/card-data.test.ts` (2) | Mock lacks the second `.eq()` (`getCardPrinting` calls `.eq('name').eq('digital',false)`). |
| `src/lib/health-store.test.ts` (1) | Mock `.upsert()` chain not returning what the code reads. |
| `src/lib/card-definition-resolver.test.ts` (1) | Mock lacks `.upsert(..., { onConflict: 'oracle_id' })` shape. |
| `src/lib/__tests__/deck-import-integration.test.ts` (8) | References renamed `importDeckAddNewCards` (now `importDeckNewCards`), and mock client lacks `.range()`. |
| `src/app/api/brew/commit/route.test.ts` (8) | Mock lacks `.eq().eq()` / `.maybeSingle()` (`lookupByName`, `checkCanBeCommander`). |
| `src/app/api/brew/save/route.test.ts` (3) | Mock/route response codes diverged (400/500 vs expected 200). |
| `src/app/api/collection/assign-location/route.test.ts` (5) | Mock lacks `.rpc()` (`move_copies_to_storage`). |
| `src/app/api/decks/[id]/ratings/route.property.test.ts` (6) + `src/lib/__tests__/upgrade-engine.property.test.ts` (4) | Routes now call `requireAuth()` → `next/headers` `cookies()`, which throws "`cookies` was called outside a request scope" when the handler is invoked directly in a test. Needs auth/request-context mocking. |
| `src/components/PersistentHeader.test.tsx` (11) | Child `BuildSelector` calls `useQueryClient()`; test renders without a `QueryClientProvider`. Harness gap only. |

## Class: belongs to paused Phase 8 (AI advisor) / Phase 9 (Brew Canvas / Extras) work
These checks are also out of date, but the code they cover is paused, so fixing them now will likely be thrown away when the phase resumes. Recommend deferring.
| File (failing tests) | Cause | Paused phase |
|---|---|---|
| `src/app/api/ai/build-deck/route.test.ts` (2), `ai/mana-analysis/route.test.ts` (2), `ai/recommend/route.test.ts` (2), `ai/search/route.test.ts` (4) | Routes now use `createServerClient()`/`requireAuth()` and changed validation (search returns an empty list with 200 instead of 400); tests still mock the old MCP path. | Phase 8 |
| `src/lib/brew-prompts.test.ts` (2) | Prompt section strings changed ("=== SCRYFALL CANDIDATES BY ROLE ===", "Known Includes (MUST include these):"). | Phase 8/9 |
| `src/app/new-deck/page.test.tsx` (9) | `next/navigation` mock lacks `useRouter` — every test in the file dies at `page.tsx:54`. | Phase 8/9 |
| `src/components/brew-v2/useCanvasZoom.test.ts` (5) | Constants moved to MIN 30 / MAX 200; test still expects 40 / 150. | Phase 9 |
| `src/components/brew-v2/useCanvasDrag.test.ts` (4) | `.closest` errors — drag hook now needs a real DOM hit-test target the jsdom test does not provide. | Phase 9 |
| `src/test/migration-020.test.ts` (9) | Points at `db/migrations` (moved to `supabase/migrations`) and `020-brew-v2-columns.sql`, which no longer exists anywhere. | Phase 9 (Brew V2) |

**Real app bugs found in unit tests: none.** The only near-miss is `DeckTile`'s unused `borderColor` (cosmetic dead code), which is a lint/cleanup item, not a user-visible fault.

---

# 2. Type errors (`npx tsc --noEmit`) — 139 lines, ~60 files

Class: **not an out-of-date check — genuine type-safety defects in app code**, currently hidden because `next.config.ts:5` sets `ignoreBuildErrors: true`. These are not proven runtime bugs (the app ships today), but they are the reason T-42 exists. This is Phase 1 scope (Safety net), touching code that will be reworked in Phases 4/7/8.

Production-source files with type errors (each also has lint errors unless noted):
- `src/lib/mana-analysis.ts` (12) — Phase 8 AI analysis helper.
- `src/app/new-deck/page.tsx` (10) — Phase 8/9 brew flow.
- `src/components/StatusChipPopover.tsx` (9)
- `src/components/PicklistV2.tsx` (5) — Phase 7 pick list.
- `src/app/api/decks/[id]/versions/route.ts` (4), `src/lib/deck-versions.ts` (3) — Phase 9 versioning.
- `src/lib/card-repository.ts` (3), `src/lib/deck-import.ts` (1) — Phase 5.
- `src/components/CommanderOverview.tsx` (3), `src/lib/commander-build-data.ts` (2), `src/components/VersionHistoryPanel.tsx` (2), `src/components/TopNav.tsx` (2), `src/components/DeckChatTab.tsx` (2), `src/components/CommanderSuggestionCard.tsx` (2), `src/components/brew-v2/BrewChatView.tsx` (2), `src/components/AddCardSearch.tsx` (2), `src/app/decks/[id]/page.tsx` (2), `src/app/api/decks/[id]/route.ts` (2), `src/app/api/collection/assign-location/route.ts` (2).
- Single-error files: `src/app/api/commanders/search/route.ts` (3), `src/components/StrategyGuide.tsx`, `src/components/MobileCardPreview.tsx`, `src/components/explore/SuggestedCommanders.tsx`, `src/components/DeckPickerPopover.tsx`, `src/components/ColorIdentityFilter.tsx`, `src/components/collection/CollectionToolbar.tsx`, `src/app/page.tsx`, `src/app/api/oracle/sessions/active/route.ts`, `.../sessions/[id]/route.ts`, `.../sessions/[id]/generate-name/route.ts`, `src/app/api/oracle/chat/route.ts`, `src/app/api/decks/[id]/versions/[versionId]/restore/route.ts`, `src/app/api/decks/[id]/legality/route.ts`, `src/app/api/decks/[id]/build/route.ts`, `src/app/api/commanders/[id]/builds/route.ts`, `src/lib/adapters/gemini-adapter.ts`.
- `research/scripts/*` (3): `classify-card-categories.ts`, `fetch-edhrec-themes.ts`, `fetch-youtube-transcripts.ts` — offline research scripts.

Test files with type errors (out-of-date checks, fix in the same batch as their failing tests):
`src/lib/__tests__/deck-normalizer.test.ts` (16), `deck-import-integration.test.ts` (6), `supply-pool.test.ts` (3), `deck-cards-diff.property.test.ts` (1), `deck-reimport-integration.test.ts` (1), `src/lib/card-definition-resolver.test.ts` (1), `health-store.test.ts` (2), `moxfield-client.test.ts` (2), `src/components/DeckImportButton.test.tsx` (6), `src/components/brew-v2/BrewTopbar.test.tsx` (1), `DeckListTab.test.tsx` (1), `ModelSelector.test.tsx` (1), `src/app/new-deck/page.test.tsx` (1), `src/app/error.test.tsx` (1), `src/app/api/decks/[id]/push/route.test.ts` (1), `src/app/api/archidekt/create-deck/route.test.ts` (1).

---

# 3. Lint errors (`npx eslint .`) — 264 errors in ~126 files

Class: **code-quality debt, not app bugs.** Belongs to Phase 1 (make lint pass). Dominant rules:
- `@typescript-eslint/no-explicit-any` (187) — concentrated in collection/storage/deck API routes and `tool-registry`/`tool-executor`.
- `prefer-const` (25) — auto-fixable (24 fixable with `--fix`).
- `@typescript-eslint/no-require-imports` (8) — 3 `scripts/*.js` + others.
- `react/display-name` (4), `@typescript-eslint/ban-ts-comment` (4), `react/no-unescaped-entities` (1).
- 317 warnings are unused-vars — noise, not blockers.

Test files that also have lint errors (must be owned by exactly one batch): `assign-location/route.test.ts`, `reconciliation.routes.test.ts`, `CardGrid.test.tsx`, `CardPopover.test.tsx`, `DeckImportButton.test.tsx`, `StatusControl.test.tsx`, `deck-cards-diff.preservation.test.ts`, `deck-import-integration.test.ts`, `deck-import-proxy.test.ts`, `auth.test.ts`, `card-status.test.ts`, `csv-import.test.ts`, `migration-020.test.ts`. Two e2e specs also warn (`oracle-smoke.spec.ts`).

---

# 4. CI jobs — **low priority while Vercel is off**

These jobs all drive the **Vercel-hosted website** (the E2E and shared-readonly suites hit a hosted URL; the sync jobs run on GitHub Actions against the hosted database). The owner runs the app locally against the hosted Supabase database but does not want Vercel for now, so these hosted-website/GitHub-job checks are low priority — none should be started before the local checks (§1–§3, batches A1–A6). This does **not** downgrade the database itself: local code that reads and writes the hosted Supabase database is covered by the local unit/type/lint checks, which stay first. Classified here so the failures are not lost.

| Job | Run | Cause | Class | Priority |
|---|---|---|---|---|
| **E2E Tests** (on `1a39d6f`) | `38103595725` (also `38103680484`) | Fails in 8s at "Verify isolated E2E configuration": the `e2e` GitHub environment has **no `E2E_BASE_URL` and no `E2E_ISOLATED` variable**, so the guard throws "E2E disabled: isolated environment variables are not configured". The job also requires the `PLAYWRIGHT_E2E_AUTH_SESSION` secret. It is deliberately gated — it is simply never configured. | Out-of-date/disabled check (config) | Low priority while Vercel is off |
| **Sync Commanders** | `38048469962` (failing daily since 2026-09-27) | `npx tsx scripts/sync-commanders-daily.ts` exits "Missing SUPABASE env vars" — `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` arrive empty (repo Actions secrets not set). Fails **before any DB write**. | Out-of-date/disabled check (config) | Low priority while Vercel is off |
| **Shared Read-only Smoke** | `37950769014` (failing on schedule since 2026-09-28) | Gets past its guard (env `e2e-shared-readonly` has `E2E_MODE=shared-readonly`, `E2E_BASE_URL=https://oracle-q21c9kuik-…vercel.app`, a preview from 2026-09-12) then one spec fails: `getByRole('heading', { name: 'Decks', level: 1 })` not found. Same stale "Decks" expectation as the unit dashboard test; the spec and/or the pinned preview URL are out of date. | Out-of-date check | Low priority while Vercel is off |
| **Sync EDHREC Data** (not named in T-40, same class) | `37204251844` | "Missing SUPABASE env vars", identical to Sync Commanders. | Out-of-date/disabled check (config) | Low priority while Vercel is off |

No CI failure indicates an app bug. Both write-capable scheduled jobs fail before writing, so they are not corrupting data while red.

---

# 5. Tests that could touch real data
- **Unit tests (`vitest`): cannot touch real data.** Environment is `jsdom`; `src/test/setup.ts` injects placeholder Supabase values ("nothing here is a real key"); every Supabase-touching test mocks the client; `src/test/migration-020.test.ts` uses `new Database(':memory:')`. No unit test imports a real client (`createClient(`), reads `SUPABASE_SERVICE_ROLE_KEY`, or calls a live `http(s)` URL. **Confirmed safe.**
- **E2E isolated suite (`tests/e2e/*.spec.ts`) is the only write-capable test code.** It is guarded: `playwright.config.ts` and the workflow both refuse to run unless `E2E_ISOLATED=true` and a dedicated Supabase-backed base URL are supplied, and it is excluded from `vitest`. Today it cannot run at all (vars unset), so it touches nothing.
- **E2E shared-readonly (`tests/e2e/shared-readonly-smoke.spec.ts`) is read-only by design** — the file documents an allowlist of navigation/render assertions only, no writes; the workflow enforces a separate identity.
- **Not tests, but real-data writers to be aware of:** `scripts/sync-commanders-daily.ts` and `scripts/sync-edhrec-data.ts` write to the real database (currently blocked by missing creds), and `src/app/api/dev/reset/route.ts` is a destructive dev endpoint (has lint errors). None is invoked by the test commands.

---

# 6. Proposed fix batches (disjoint — no file appears in more than one batch)

Batches are grouped by area; each batch fixes **all** failing checks (unit, type and lint) for the files it owns, so a file is listed exactly once.

**Recommended order (per Gene 2026-10-11):**
1. **A1 → A2 → A3 → A4** — local unit tests (T-41, quick wins; this is what `npm test` runs on the owner's machine, and it exercises the code that talks to the hosted database).
2. **A5 → A6** — local type errors and lint (T-42).
3. **C** — Vercel deployment and GitHub jobs for the hosted app (**low priority while Vercel is off**; last).
4. **B** — paused Phase 8/9 checks (defer until those phases resume; not "local vs online", just parked).

Local checks (§1–§3) come first; the online jobs in C are deliberately last while the owner runs only on his own computer.

**Batch A1 — Dashboard & navigation test updates** (T-41, out-of-date)
`src/app/page.test.tsx`, `src/components/Sidebar.test.tsx`, `src/components/DeckTile.test.tsx`, `src/components/DraftDeckTile.test.tsx`, `src/components/InlineDeleteConfirmation.test.tsx`, `src/components/collection/CollectionToolbar.test.tsx`, `src/components/PersistentHeader.test.tsx` (add `QueryClientProvider`).

**Batch A2 — Card visual primitives test updates** (T-41, out-of-date)
`src/components/ColourPips.test.tsx`, `src/components/accessibility.test.tsx`, `src/components/ManaCost.test.tsx`, `src/components/OwnershipBadge.test.tsx`, `src/lib/__tests__/render-card-links.test.tsx`, `src/lib/__tests__/url-parser.test.ts`.

**Batch A3 — Data-layer & import test-mock updates** (T-41)
`src/lib/csv-import.test.ts`, `src/lib/__tests__/card-data.test.ts`, `src/lib/health-store.test.ts`, `src/lib/card-definition-resolver.test.ts`, `src/lib/__tests__/deck-import-integration.test.ts`, `src/lib/moxfield-client.test.ts`, `src/lib/__tests__/deck-normalizer.test.ts`, `src/lib/__tests__/supply-pool.test.ts`, `src/lib/__tests__/deck-reimport-integration.test.ts`, `src/lib/__tests__/deck-cards-diff.property.test.ts`, `src/lib/__tests__/deck-cards-diff.preservation.test.ts`, `src/lib/__tests__/deck-import-proxy.test.ts`.

**Batch A4 — API route test-mock updates** (T-41)
`src/app/api/brew/commit/route.test.ts`, `src/app/api/brew/save/route.test.ts`, `src/app/api/collection/assign-location/route.test.ts`, `src/app/api/decks/[id]/upgrade/route.test.ts`, `src/app/api/decks/[id]/ratings/route.property.test.ts`, `src/lib/__tests__/upgrade-engine.property.test.ts`, `src/app/api/archidekt/create-deck/route.test.ts` (delete/rewrite), `src/app/api/decks/[id]/push/route.test.ts`, `src/app/error.test.tsx`, `src/components/CardGrid.test.tsx`, `src/components/CardPopover.test.tsx`, `src/components/StatusControl.test.tsx`, `src/components/DeckImportButton.test.tsx`, `src/lib/auth.test.ts`, `src/lib/card-status.test.ts`, `src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts`.

**Batch A5 — Production type + lint cleanup** (T-42, app source only)
All production files in §2's first list, plus their lint fixes (the 187 `no-explicit-any`, `prefer-const`, etc. in `src/**`, excluding files owned by A1–A4/B).

**Batch A6 — Scripts & research type + lint cleanup** (T-42, non-app source)
`scripts/*.ts|js` with lint/type errors (e.g. `backfill-insight-taxonomy-tags.ts`, `migrate-commander-taxonomy.ts`, `seed-scryfall-bulk.ts`, `seed-oracle-to-printings.ts`, `sync-edhrec-builds.ts`, `sync-additional-commanders.ts`, `check-insight-status.js`, `generate-coverage-report.js`, `validate-allocation-resolver.ts`, `sync-user-commanders.ts`), and `research/scripts/*`.

**Batch B — Paused Phase 8/9 checks (defer)**
`src/app/api/ai/build-deck/route.test.ts`, `ai/mana-analysis/route.test.ts`, `ai/recommend/route.test.ts`, `ai/search/route.test.ts`, `src/lib/brew-prompts.test.ts`, `src/app/new-deck/page.test.tsx`, `src/components/brew-v2/useCanvasZoom.test.ts`, `src/components/brew-v2/useCanvasDrag.test.ts`, `src/test/migration-020.test.ts`, plus `src/components/brew-v2/BrewTopbar.test.tsx`, `DeckListTab.test.tsx`, `ModelSelector.test.tsx`.

**Batch C — CI configuration (no source files; Gene + owner) — LOW PRIORITY WHILE LOCAL-ONLY, do last**
1. E2E Tests: either configure the `e2e` environment (`E2E_ISOLATED`, `E2E_BASE_URL`, `PLAYWRIGHT_E2E_AUTH_SESSION`) or disable the workflow until a dedicated test backend exists.
2. Sync Commanders / Sync EDHREC: set the Supabase Actions secrets, or disable the schedules for now.
3. Shared Read-only Smoke: update `shared-readonly-smoke.spec.ts` and re-point `E2E_BASE_URL` at a current deployment.

---

# 7. Notes / open questions
- `next.config.ts:5` `ignoreBuildErrors: true` is the reason 139 type errors never block a deploy; T-42 removes it.
- `src/app/api/archidekt/create-deck/route.test.ts` and `src/test/migration-020.test.ts` test files that no longer correspond to any code/migration. Recommend deleting rather than "fixing" unless the features are being revived.
- Owner decision for Batch C: the Phase 1 exit test allows scheduled jobs to be **deliberately switched off**; disabling the two credential-less sync jobs and the misconfigured E2E job is a valid, cheaper path than wiring up new credentials now. Given Vercel is off for now, this is low priority and can wait until the local checks (A1–A6) are green.

## Challenges to locked decisions
- none.

## Assumptions
- "Out-of-date check" means the app's current behaviour is intentional and the test/mock/spec is stale; I did not treat any stale test as a real bug without source evidence.
- The M1 "clear-slate is acceptable" owner note does not extend to the scheduled jobs; I assumed failing-before-write means no data was harmed.

## Open questions
- For Gene: should the paused Phase 8/9 test files (Batch B) be marked skipped rather than updated, so `npm test` goes green without churning paused code?
- For the owner (low priority while Vercel is off): Batch C option 1 (switch the two scheduled jobs off) or option 2 (set up credentials)? Recommendation: leave the website jobs for last and, when you get to them, switch the two credential-less sync jobs off rather than wiring up credentials while Vercel is off.
