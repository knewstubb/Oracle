# Collection Migration Readiness Audit

> Date: 2026-09-03
> Owner: Delivery Lead
> Scope: Product behavior, collection migration, data integrity, recovery, security, performance, tests, operations, repository hygiene, and documentation
> Decision: **NO-GO as the sole source of truth; usable as a secondary/test system while blockers are resolved**

## Executive Summary

The Oracle has substantial working product surface: authentication, collection browsing, instance-level copies, deck allocation, CSV import/export, price data, storage locations, and automated tests. It is not yet safe to replace Archidekt as the only authoritative copy of the collection.

The main barriers are not missing UI polish. They are deterministic rebuild correctness and operational controls:

1. Collection replacement deletes live rows before the complete import is validated and cannot roll back.
2. Large imports are split into independently committed chunks, so interruption leaves a partial collection.
3. Replacement nulls existing allocations; this is acceptable for the initial disposable reset, but deck reimport and allocation review must rebuild a coherent state.
4. Current import/export paths do not prove that the selected full-fidelity source fields can be reconstructed deterministically.
5. CI runs authenticated, state-mutating tests against the production URL.
6. Some multi-row allocation flows are non-atomic; the undo route also lacks user ownership scoping while using the service-role client.
7. No isolated staging environment, durable mutation audit, or production alerting is documented.
8. Quality gates are not green: 277 unit tests fail, TypeScript does not parse generated Supabase types, lint has 334 errors, and production builds ignore TypeScript errors.
9. Database migrations and Edge Functions are split across multiple directories, including paths outside the application Git repository.
10. Product and feature documentation describes superseded table names and guarantees that the current implementation does not provide.

## Migration Decision

### Safe today

- Treat the current Oracle user dataset as disposable.
- Retain the authoritative collection export and deck input files needed for a complete rebuild.
- Continue evaluating collection browsing and deck workflows with non-authoritative data.
- Use non-destructive manual testing only after disabling production-mutating CI.

### Not safe today

- Do not present a partial or interrupted rebuild as successful.
- Do not make Oracle authoritative until the real source files rebuild with agreed fidelity and reconciliation totals.
- Do not rely on current CI, tests, or build success as proof that migration is safe.
- Do not delete or consolidate migration/function trees until deployed Supabase history is reconciled.

## Release Gates Before Authoritative Migration

All gates are required unless the user explicitly accepts the residual risk.

| Gate | Required evidence | Current state |
|---|---|---|
| Production-mutating CI removed | E2E uses isolated test project and deterministic reset/cleanup | **Fail** |
| Rebuild inputs retained | Authoritative collection export and deck files are available and immutable during rehearsal | **Partial / collection file present** |
| Rebuild rehearsal | Isolated project is reset and rebuilt from the real source files with invariant checks | **Fail / no evidence** |
| Staged import | Complete file parsed/resolved before the rebuild is reported as successful | **Fail** |
| Deterministic apply | Retry/restart produces the same logical collection without duplicates or hidden partial success | **Fail** |
| Allocation reconstruction | Deck imports preserve unchanged assignments, assign free copies, and surface Claimed/Unowned review states | **Fail** |
| Source fidelity | Rebuild reproduces agreed counts and exact source metadata | **Fail / untested** |
| Import idempotency | Retry/resume cannot duplicate copies | **Fail** |
| Tenant safety | Every user-data route is RLS-backed or ownership-scoped and tested with two users | **Fail** |
| Green quality gate | Typecheck, lint baseline, critical unit/integration tests, build, isolated E2E | **Fail** |
| Canonical schema source | One committed migration/function tree reproduces deployed schema | **Fail** |
| Operational detection | Failed/partial import and sudden count-drop alerts plus durable audit event | **Fail** |

Native database backup and restore are not MVP gates. The user accepts reset-and-rebuild recovery on Supabase Free.

## Critical Findings

### 1. Destructive collection replacement is non-transactional

`src/app/api/collection/import/route.ts` deletes all `user_copies`, then attempts to delete `user_cards`, then starts parsing/resolving/inserting. A malformed file, timeout, failed lookup, process crash, or batch error can leave an empty or partial collection. The `user_cards` deletion error is swallowed.

The browser importer sends the first chunk as `replace` and later chunks as `add`. At approximately 3,650 copies this is multiple independent commits. Cancel, browser close, network loss, or one failed request cannot restore the pre-import state.

**Required fix:** stage the whole import under an `import_run_id`, validate it, present reconciliation totals, then execute the approved swap/reconciliation in one database transaction. Never delete before validation.

### 2. Replacement breaks deck allocations

Deleting `user_copies` nulls `deck_cards.copy_id`. Re-imported copies receive new IDs and the collection importer does not relink deck slots. Even a technically successful replace can make decks incomplete.

**Required MVP behavior:** stable IDs and current assignments do not need to survive the initial disposable reset. After collection rebuild, deck imports reconstruct assignments using the finalized rules: preserve deterministic unchanged matches, assign free owned copies, leave contested copies Claimed, and explicitly review Unowned choices. Ongoing deck reimports must preserve valid unchanged assignments.

### 3. Export is not a complete restore artifact

The export includes card/printing, finish, condition, proxy, purchase price, and date. It omits missing status, storage location, language, source provenance, proxy target, notes, copy identity, decks, and allocation relationships. The importer does not preserve all exported semantics, and no export/import round-trip test exists.

**Accepted risk / deferred fix:** a versioned relational backup remains the correct long-term solution, but it is not an MVP gate. On Supabase Free, the user accepts losing Oracle-only state and rebuilding from retained collection/deck source files. The CSV must not be presented as a complete database backup.

### 4. CI mutates production

`.github/workflows/e2e-tests.yml` targets `https://oracle-alpha-two.vercel.app`, restores an authenticated session, and runs tests on push/PR. `tests/e2e/card-movement.spec.ts` performs allocation mutations without guaranteed teardown.

**Immediate action:** disable the workflow or point it to an isolated project before further production use. Rotate the stored Playwright session and review whether tests changed real allocations.

### 5. Allocation undo is an authorization and atomicity risk

`src/app/api/allocation/undo/route.ts` uses the service-role client but does not scope copy/slot reads and writes to the authenticated user. It clears one slot and restores another in separate calls, leaving a crash/race window.

`add-proxy` has a related insert-then-assign window with best-effort rollback.

**Required fix:** ownership guards, advisory lock, source/target validation, and all writes inside one Postgres RPC transaction.

### 6. Recovery is intentionally rebuild-only; observability is not established

Supabase Free does not provide the managed daily backup/PITR posture originally recommended. The user accepts deleting and rebuilding from retained collection/deck files rather than restoring database state. No durable mutation audit logs, error tracking, slow-query monitoring, or alerts for partial imports/count drops are documented.

**Required MVP behavior:** rehearse the deterministic reset-and-rebuild process in isolated staging and add durable import/allocation audit events plus failure/count-drop detection. Native backup/restore remains deferred accepted risk.

## High Findings

### Import correctness

- Add/import retry has no per-run idempotency key and can duplicate copies.
- Sync reconciles mainly by printing quantity and can lose finish/proxy/condition/date distinctions.
- Sync unlink/delete/insert steps are independently committed.
- Normalizing Moxfield/ManaBox to an Archidekt-shaped CSV loses original source identity.
- Archidekt parsing does not restore the Oracle export's Proxy column.
- Hand-written CSV parsing does not fully support escaped quotes or multiline fields.
- The legacy default `upsert` path remains exposed and does not reliably receive `userId`.
- Existing-card reads and some list endpoints remain vulnerable to PostgREST's 1,000-row cap.

### Collection correctness and performance

- Card-name list requests fetch all matching copies, sort in memory, then paginate.
- Pagination occurs before grouping, so one printing's quantity can split across pages.
- Quantity/price sorting can become page-local rather than globally correct.
- Status filters are represented in the toolbar but are not wired into the list query.
- Proxy/missing toggle visibility depends on current-page counts.
- Unbounded parallel batches trade latency for database/request pressure and server memory.

A database-side collection projection/RPC (or denormalized sortable fields) is the correct long-term fix; further application-layer batch loops will remain fragile.

### Schema and authorization

- Normal user routes frequently use `createAdminClient()`, so RLS cannot contain missing filters.
- At least one aggregate route was found without user scoping; all admin-client routes require systematic review.
- `user_cards` conflict/uniqueness assumptions must be verified against the deployed schema.
- Atomic RPC definitions exist in root migration trees, but the repository has multiple competing migration histories and no confirmed canonical replay path.

### Quality gates

Validation run on 2026-09-03:

- `npm test -- --reporter=dot`: **53 failed files, 61 passed, 1 skipped; 277 failed tests, 1,065 passed, 1 skipped**.
- `npx tsc --noEmit`: **failed** because `src/types/supabase.ts` contains Supabase CLI upgrade text at lines 2075–2076.
- `npm run lint`: **334 errors, 340 warnings**.
- `next.config.ts` sets `typescript.ignoreBuildErrors: true`, so a production build can succeed despite type errors.
- CI runs E2E only; it does not run unit tests, lint, strict typecheck, build, migration replay, or schema drift checks.

The large number of passing tests is useful, but the failing baseline means regressions cannot be distinguished from existing breakage.

## Repository and Documentation Audit

### Current sources of truth

| Area | Source |
|---|---|
| Runtime behavior | `app/src/` |
| Build/dependencies | `app/package.json`, lockfile, Next/Vitest/Playwright config |
| Deployment | `app/vercel.json`, `app/.github/workflows/` |
| Intended normalized card schema | `.kiro/steering/schema-card-data.md`, verified against deployed DB before changes |
| Feature history | `.kiro/specs/<feature>/` where present |
| Operational/product docs | `app/docs/`, after code verification |

### Current structural risk

`app/` is the Git repository. `.kiro/`, root `research/`, root `specs/`, and root `supabase/` sit outside it. Production-relevant migrations and Edge Functions therefore exist outside the application audit trail. There are also migration copies/collisions under `app/supabase`, `supabase/migrations`, and `supabase/supabase/migrations`.

**Target organization:** one repository and one canonical `supabase/` directory. Either make the workspace root the repository or move required `.kiro`, research, specs, migrations, and functions under `app/`. Reconcile deployed migration history before moving/deleting files.

## Cleanup Classification

### Keep and make authoritative

- `app/src/`, package/lock/config files.
- Active sync scripts referenced by package scripts or workflows.
- Current feature specs after terminology corrections.
- The deployed-equivalent Supabase migration/function history after reconciliation.
- The Archidekt source export and database backups until restore is proven.

### Archive after transferring unique decisions

- `.kiro/specs/CODE-CLEANUP-AUDIT.md` and `SPEC-VALIDITY-AUDIT.md` (dated snapshots now superseded by this audit).
- Root `specs/list-views/` if its unique decisions are moved into current feature specs.
- Completed one-off migration/backfill/fix scripts, only after execution status and recovery value are recorded.
- Notion-era research utilities once no source data depends on them.
- Historical research outputs after durable conclusions are promoted to `app/docs/`.

### Safe to regenerate/delete locally

After confirming no active process is using them:

- `.next/`, `playwright-report/`, `test-results/`, `tsconfig.tsbuildinfo`, `node_modules/`.
- `.DS_Store` files.
- Empty duplicate research directories.
- Local Supabase `.temp/` data.

These are workspace cleanup actions, not product fixes.

### Do not delete yet

- Any Supabase migration/function tree.
- Ignored databases, CSVs, exports, environment files, or Playwright auth session before backup/security review.
- `import-engine.ts`, `import-engine-v2.ts`, or `deck-import-legacy.ts` while live callers remain.
- Active EDHREC/Scryfall scripts and mapping files.
- Any apparent orphan test until the feature is explicitly retired or a replacement test exists.

## Documentation Drift to Correct

- The living spec still uses `physical_copies`, `physical_copy_id`, `card_definitions`, and `scryfall_printings`; current names are `user_copies`, `copy_id`, `user_cards`, and `ref_printings`/`ref_cards`.
- Collection import requirements describe a non-destructive quantity-group upsert model that was superseded by instance rows.
- The delivery log says sync preserves allocation, which is not guaranteed by the current implementation.
- Roadmaps call CSV export a "full backup," which is false for relational state.
- Infrastructure docs call production-targeted E2E and security hardening "built" without noting the production mutation and admin-client gaps.
- The application README is still the create-next-app template.

## Reduced Implementation Sequence

### Phase 0 — Contain risk and restore a meaningful quality gate

1. Disable production-mutating E2E and rotate the stored production browser session.
2. Hide or disable unsafe Collection Replace/Sync until the rebuild path replaces them.
3. Retain the authoritative collection export and all deck input files needed to start again.
4. Create an isolated Supabase/Vercel test environment; it is a rehearsal environment, not a backup.
5. Repair generated Supabase types and the critical auth/import test harness so migration tests are trustworthy.

### Phase 1 — Deterministic collection reset and rebuild

1. Define a user-scoped reset operation and require explicit confirmation.
2. Parse the complete source before applying it; validate full-fidelity fields and produce reconciliation totals.
3. Apply a deterministic, restartable rebuild that cannot report partial state as success.
4. Record source hash/provenance and make retries idempotent.
5. Test the real 3,650+ copy file, malformed input, interruption, retry, duplicate input, and unmatched cards.
6. Replace the in-memory collection list assembly with database-native filtering, grouping, sorting, counting, and pagination so the rebuilt collection is correct and usable.

### Phase 2 — Authoritative deck reimport and allocation

1. Implement one shared diff-based CSV/text reimport path for a selected deck.
2. Preserve unchanged Oracle metadata and valid assignments.
3. Release copies from removed slots.
4. Assign deterministic free owned copies to new slots.
5. Leave cards held by other decks Claimed and require an explicit Pull.
6. For Unowned slots, offer explicit confirm-purchased, add-proxy, or leave-unowned actions.
7. Make allocation mutations ownership-scoped and transactional, including undo and proxy creation.

### Phase 3 — Release confidence

1. Enforce tenant-scoped access and add two-user isolation tests despite the private first release.
2. Add CI for strict typecheck, lint baseline, critical unit/integration tests, build, migration replay, and isolated E2E.
3. Persist import/allocation audit events and detect failed/partial rebuilds or unexpected count drops.
4. Rehearse reset → collection rebuild → deck imports → allocation review in staging with the real inputs.
5. Approve cutover only after counts, metadata, deck compositions, and allocation invariants reconcile.

### Phase 4 — Repository and documentation consolidation

1. Confirm the repository-boundary recommendation.
2. Reconcile deployed Supabase migrations/functions and choose one canonical tree.
3. Move durable specs/research into the chosen Git boundary.
4. Archive stale audits and one-off scripts only after unique decisions and execution history are retained.

## Final Fundamentals-First MVP Decisions

The interview is complete. These decisions define the MVP and supersede the earlier open questions.

1. **Required weekly jobs:** Oracle must reliably show what is owned, maintain authoritative deck lists, and show where every physical copy is allocated.
2. **Source fidelity:** Collection rebuild uses full fidelity: exact printing, quantity, finish, condition, language, purchase price, date added, and retained source-row provenance. Unresolved rows block completion unless explicitly accepted.
3. **Disposable current state:** Existing Oracle data does not require in-place migration or preservation. It may be deleted and rebuilt from collection and deck files. Stable IDs and current Oracle-only metadata do not need to survive the initial reset.
4. **Allocation outcome:** Preserve deterministic matches and review/recalculate the rest. No allocation may silently disappear or be guessed.
5. **Authoritative deck reimport:** An explicit CSV/text reimport replaces only that deck's composition. It must not affect another deck's composition or silently change collection ownership.
6. **Post-cutover collection maintenance:** Support manual per-copy editing plus safe additive CSV import. Ongoing authoritative Archidekt reconciliation is out of scope.
7. **Recovery choice:** The project uses Supabase Free. The user accepts deleting and rebuilding instead of funding or implementing native backup/PITR recovery for the MVP.
8. **Private release, tenant-safe foundation:** Release one serves one user, but user-owned data and mutations remain ownership-scoped for future multi-user support.
9. **Reduced surface:** Scanner code is removed. Card Kingdom pricing, AI Brew, and Monitor/Upgrade remain frozen while fundamentals are stabilized.

### Collection rebuild contract

The rebuild process must be deterministic and reviewable even though it does not preserve the current Oracle database:

- Parse and validate the complete collection source before reporting success.
- Preserve exact source fields selected above; do not downgrade exact printings to card-name-only ownership.
- Record source identity/hash and row-level provenance so a rebuild can be explained.
- Produce source-row, physical-copy, resolved, unresolved, and rejected totals.
- Handle the full real collection without PostgREST's 1,000-row cap or oversized `.in()` requests.
- Retrying the same rebuild input must produce the same logical collection without duplicates.
- A failed run must be clearly incomplete and safe to restart; partial state must never be presented as a successful collection.

The current production state may be reset before this rebuild. Preserving existing copy IDs, storage, notes, and allocations across that reset is not an MVP requirement.

### Authoritative deck reimport and allocation contract

For each explicit deck reimport:

- **Unchanged slot:** Preserve Oracle category, selected printing, proxy/ownership state, and valid assigned copy.
- **Removed slot:** Remove it from that deck and release any assigned copy back to the available pool.
- **New slot with a free owned copy:** Assign a deterministic free copy to the slot. Prefer the requested exact printing when supplied; otherwise use a consistent best-match rule.
- **New slot whose owned copies are all in other decks:** Leave it **Claimed** and require an explicit **Pull**. Never move a copy out of another deck automatically.
- **New unowned slot:** Offer explicit choices to confirm a purchase, add a proxy, or leave it Unowned. Confirming a purchase creates an Original copy and assigns it; adding a proxy creates and assigns a Proxy. The import itself must not infer ownership.
- **Ambiguous match:** Leave the slot for review rather than guessing.
- **Scope:** Reimport changes only the selected deck and explicitly confirmed collection additions.

### Accepted recovery risk

Supabase documentation states that managed daily backups begin on paid plans and PITR is a paid add-on; Free projects are advised to make manual CLI exports. The user has chosen not to make database backup/restore part of this MVP.

The recovery model is therefore **reset and deterministic rebuild from retained source files**, not restoration of Oracle's database state. This deliberately accepts that Oracle-only changes made after the latest retained collection/deck files—including manual copy metadata, storage changes, and allocation work—may be lost and need to be recreated.

A separate staging project remains required for safe testing and migration rehearsal; staging is not a backup. A full relational Oracle backup/restore capability is deferred and should be reconsidered if Oracle-only data becomes costly to recreate or before public/multi-user release.

### Repository boundary still pending

The only unanswered structural decision is the Git/workspace boundary. Recommended default: keep `app/` as the repository, move durable `.kiro`, canonical Supabase, research, and specification assets inside it after deployed migration history is reconciled, then open `app/` as the workspace root.

## Go/No-Go Rule

Oracle becomes eligible to replace Archidekt when the reset-and-rebuild flow passes in an isolated environment, the complete real collection reconciles to agreed totals and full-fidelity metadata, authoritative deck reimport/allocation behavior passes, tenant isolation is verified, and the user approves the reconciliation report. Native database restore is explicitly waived for this private Free-plan MVP; retained collection and deck source files are the rebuild inputs.
