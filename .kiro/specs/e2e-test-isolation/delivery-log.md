# Delivery Log — E2E Test Isolation

> Feature: E2E Test Isolation
> Status: In Progress
> Last updated: 2026-09-12
> Maintained by: Delivery Lead

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
