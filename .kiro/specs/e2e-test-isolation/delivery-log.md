# Delivery Log — E2E Test Isolation

> Feature: E2E Test Isolation
> Status: In Progress
> Last updated: 2026-09-12
> Maintained by: Delivery Lead

---

## 2026-09-12 — Shared-readonly smoke mode implemented and green

**Context:** The dedicated fixture existed, but there was no executable `shared-readonly` mode: the only Playwright suite was isolated-only and included mutation-capable specs. This increment adds a separate, auditable read-only lane and proves it against the isolated Preview.

**What changed:**
- Added explicit mode resolution in `playwright.config.ts`. `E2E_MODE=shared-readonly` exposes only `shared-readonly` and `shared-readonly-auth` projects, rejects an `E2E_ISOLATED=true` claim, and cannot select the `chromium`/`mobile`/`setup` projects. The legacy `E2E_ISOLATED=true` isolated contract is preserved unchanged.
- Added the single allowlisted spec `tests/e2e/shared-readonly-smoke.spec.ts` (navigation and rendering only) plus `test:e2e:shared-readonly` and `test:e2e:shared-readonly:setup` scripts.
- Added the separate, manually dispatchable `Shared Read-only Smoke` workflow using the protected `e2e-shared-readonly` environment and `PLAYWRIGHT_SHARED_READONLY_AUTH_SESSION`.
- Hardened `tests/e2e/auth.setup.ts`: it creates the ignored auth directory, asserts the Oracle login origin before entering credentials, supports an explicit manual Preview-access flag, and passes the Vercel automation bypass via header/cookie so credentials never reach the Vercel access layer.
- Documented both modes and the temporary risk boundary in `tests/e2e/README.md` and the design doc.

**Validation evidence:**
- Config selection: shared mode lists exactly one test; isolated mode still lists all 88; the `chromium` project is absent in shared mode; a `shared-readonly` run claiming `E2E_ISOLATED=true` is rejected during config load.
- Static allowlist check: no direct `request.post|put|patch|delete` or `page.request` calls in the smoke spec.
- Live run: `shared-readonly-auth` saved a Preview-scoped session, and the smoke passed against `dpl_2cFEYAMHYRXv2BCYg9f1RY9bQyyb`, rendering the dedicated fixture deck, commander context, and deck tabs with no mutation.
- Deployed parity during the browser smoke: `getBuildCards` match (50/50) and `getSynergyScores` match (12/12), identical digests, HTTP 200, snapshot `d0da1021…31d3487`, with no mismatch or shadow_error.
- Targeted ESLint and `git diff --check` passed; workflow YAML parsed.

**Operational note:**
- Vercel automation-bypass was enabled on the `oracle` project so the protected Preview can be reached non-interactively. The bypass secret was generated locally, used only in-memory for this run, and stored in neither source control nor application code. Oracle's own dedicated-user login remains required, and SSO protection on the project was not disabled.

**Loop-back:**
- **Backtrack-one (twice):** The automated login first followed the Vercel SSO/third-party redirect. The origin guard caught it, and the fix was to carry the Vercel bypass as a header plus set-cookie parameter. The smoke then failed once on stale selectors (`deck list` role, `13 cards`); the assertions were aligned to the real DOM (`Decks` heading, fixture link, deck heading, tabs) from the captured page snapshot.

**Refs:**
- Files: `playwright.config.ts`, `tests/e2e/shared-readonly-smoke.spec.ts`, `tests/e2e/auth.setup.ts`, `.github/workflows/shared-readonly-smoke.yml`, `package.json`, `tests/e2e/README.md`
- Accepted risk: TD-036

---

## 2026-09-12 — Dedicated read-only smoke fixture established

**Context:** Authenticated shadow-mode route evidence required a non-empty deck, while the configured dedicated test identity contained only one empty deck. The temporary shared-backend exception permits deterministic fixture setup for that identity but no test-driven mutations.

**What changed:**
- Verified the saved Playwright session matches `TEST_USER_EMAIL`, the production Oracle project, and the dedicated identity's hashed subject without printing credentials or tokens.
- Confirmed the identity owned exactly one deck with zero cards and no build assignment.
- In one guarded transaction, converted that empty deck into the named read-only fixture, assigned one reference build, and inserted one commander plus 12 build cards. Allocation remains disabled; no `user_cards`, `user_copies`, or real-user rows were touched.
- Ran authenticated GET-only smoke against the separate shadow Preview for `/api/decks`, `/api/decks/{id}`, and `/api/decks/{id}/build`; all returned HTTP 200 and produced deployed snapshot parity matches.

**Safety boundary:**
- This fixture is persistent and read-only because reset, allocation, import, deck creation, and all other mutation coverage remain prohibited on the shared backend.
- The result does not satisfy isolated mutable-suite or two-user tenancy requirements. TD-036 remains accepted risk until a separate hosted database is available.

**Loop-back:**
- **Backtrack-one:** The first authenticated attempt proved route access but exposed that list responses omit `build_id` and the test deck had no cards. The API contracts were traced, fixture preconditions were guarded, and the smoke was repeated only after the dedicated tenant could invoke both read paths.

**Refs:**
- Preview deployment: `dpl_2cFEYAMHYRXv2BCYg9f1RY9bQyyb`
- Commander evidence: `.kiro/specs/commander-context-snapshot/delivery-log.md`
- Accepted risk: TD-036

---

## 2026-09-12 — Production containment started

**Context:** The 2026-09-03 migration-readiness audit found that authenticated Playwright runs target production and can invoke real allocation mutations without deterministic cleanup. This blocks trustworthy release evidence and risks changing real collection state.

**What changed:**
- Traced CI triggers, URL fallbacks, auth-state reuse, and mutation-capable tests.
- Defined a fail-closed containment contract that applies to every Playwright invocation.
- Split immediate containment from later isolated-environment provisioning and test repair.

**Decisions made:**
- E2E will be unavailable temporarily rather than continue against production.
- Playwright configuration is the primary guard because CI-only checks do not protect local, headed, UI, or auth-setup runs.
- Re-enablement requires a separate Supabase project, not merely a Vercel preview URL.
- Missing isolation configuration must be visible as a failure; it must not silently claim test coverage.

**Loop-back:**
- **Backtrack-multi:** DevOps must establish isolated infrastructure and credentials, Tester must repair/verify deterministic coverage, then Delivery Lead can reopen the release gate.

**Refs:**
- Readiness audit: `docs/audits/collection-migration-readiness-2026-09-03.md`
- Debt: TD-027
- Original E2E record: `.kiro/specs/cards-tab-workshop/delivery-log.md`

---

## 2026-09-12 — Production execution paths fail closed

**Context:** Immediate containment needed to protect production before isolated test infrastructure is available.

**What changed:**
- Added a Playwright configuration preflight requiring `E2E_ISOLATED=true` and an explicit HTTPS `E2E_BASE_URL`.
- Denied the production hostname, localhost, and loopback targets before browser launch.
- Removed the production URL and generic `PLAYWRIGHT_AUTH_SESSION` from GitHub Actions.
- Added a CI preflight and dedicated `PLAYWRIGHT_E2E_AUTH_SESSION` contract under the protected `e2e` environment.
- Replaced unsafe production/local instructions with isolated-environment guidance.

**Verification:**
- Missing isolation configuration was rejected during Playwright config loading.
- The production URL was rejected even with `E2E_ISOLATED=true`.
- A synthetic safe HTTPS target loaded the config and listed all 89 tests without executing requests.
- Targeted ESLint passed for `playwright.config.ts`.
- GitHub Actions YAML parsed successfully.
- `git diff --check` passed.

**Decisions made:**
- CI remains visibly fail-closed until DevOps provisions and verifies isolated Vercel/Supabase resources.
- TD-027 remains in progress: production targeting is contained, while credential rotation, historical mutation review, deterministic fixtures, cleanup, and isolated execution remain open.

**Handoff:**
- DevOps owns isolated environment provisioning and credential rotation next.
- Tester follows with deterministic seed/reset, stale-selector repair, and mutating-suite verification.

**Refs:**
- Files: `playwright.config.ts`, `.github/workflows/e2e-tests.yml`, `tests/e2e/README.md`
- Requirements: `.kiro/specs/e2e-test-isolation/requirements.md`
- Debt: TD-027

---

## 2026-09-12 — Temporary shared-backend smoke exception approved

**Context:** Free hosted project creation was blocked by the account's two-active-project limit, and the user needs both current projects. The user chose to use the Oracle backend temporarily and expects another database to become available in the coming weeks.

**Decision:**
- Permit a separate E2E frontend and dedicated test identity against the shared backend for read-only navigation/rendering smoke tests only.
- Do not label the environment isolated and do not enable allocation, import, reset, cron, deck creation, or direct mutation API tests.
- Preserve the existing fail-closed requirement for the full/mutating suite.
- Review by 2026-10-12 or when an alternate database becomes available, whichever comes first.

**Risk:**
- Service-role routes and known ownership-scoping debt mean a shared database cannot provide a trustworthy blast-radius boundary. This is accepted only for the constrained smoke allowlist.

**Loop-back:**
- **Branch:** DevOps provisions the separate frontend and protected mode; Tester proves the allowlist is mutation-free; Developer fixes any route needed to keep smoke execution read-only.
