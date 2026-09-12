# Design: E2E Test Isolation

> Last updated: 2026-09-12
> Status: In Review
> Reference implementation: `playwright.config.ts`, `.github/workflows/e2e-tests.yml`

## Design Goals

- Make production access impossible by default.
- Apply one guard to CI, local, headed, UI, and auth-setup runs.
- Keep missing configuration visible rather than silently claiming coverage.
- Preserve a straightforward path to re-enable E2E against disposable infrastructure.

## Design Principles for This Feature

| Principle | Application |
|-----------|-------------|
| Fail closed | Missing or ambiguous isolation configuration throws during config loading |
| Defense in depth | Require an isolation attestation and deny known unsafe hosts |
| Environment separation | Use a dedicated URL, Supabase project, test user, and auth secret |
| Determinism | Seed/reset known fixtures before relying on mutating assertions |

## Screens & Components

No user-facing screens change.

### Component: Playwright isolation preflight

Runs synchronously while `playwright.config.ts` loads. It requires `E2E_ISOLATED=true`, parses `E2E_BASE_URL`, denies the production hostname and local/loopback hosts, and returns the only allowed `baseURL`. A rejected configuration exits before any browser or request is created.

### Component: GitHub Actions E2E job

Reads protected E2E variables and a dedicated isolated auth-session secret. A shell preflight rejects missing configuration before dependency/browser installation. The production URL and generic production-capable session secret are removed.

## Interactions

1. A developer or CI invokes a Playwright command.
2. Configuration evaluates the isolation preflight.
3. Unsafe or missing configuration throws with remediation guidance; no tests execute.
4. After isolated infrastructure exists, protected variables attest it and the suite runs against disposable data.

## Accessibility Notes

No user interface is affected. Error messages use plain actionable text suitable for terminal and CI logs.

## Design Decisions & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Guard location | Playwright config | CI-only guard | Config protects every invocation path, including local setup and UI mode |
| Missing config behavior | Hard failure | Skip workflow | A failure makes the missing release signal visible |
| Localhost | Denied during containment | Allow local frontend | Localhost currently uses the shared backend, so hostname alone does not isolate data |
| Isolation proof | Explicit attestation plus host denylist | URL allowlist only | A Vercel preview can still use production Supabase credentials |

---

## Architecture

### Overview

The immediate increment is containment, not environment provisioning. It removes implicit targets and requires an explicit isolation contract. Re-enablement is a later task gated by a separately verified Supabase project, deterministic fixtures, and isolated credentials.

### Components

| Component | Role | Location |
|-----------|------|----------|
| Isolation preflight | Reject unsafe Playwright execution | `playwright.config.ts` |
| CI configuration | Supply protected isolation inputs | `.github/workflows/e2e-tests.yml` |
| Auth setup | Create environment-specific browser state | `tests/e2e/auth.setup.ts` |
| Operator guide | Explain safe setup and execution | `tests/e2e/README.md` |

### Data Model

No application data model changes in the containment increment. The future isolated project uses disposable fixtures and a dedicated test identity.

### State Management

- `E2E_BASE_URL`: required absolute target URL.
- `E2E_ISOLATED`: required literal `true` attestation set only after backend separation is verified.
- `PLAYWRIGHT_E2E_AUTH_SESSION`: environment-specific base64 browser state for CI.
- `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`: isolated test-user credentials for session regeneration.

### Security Review

- Known production and loopback hosts are denied in code.
- No production URL fallback remains.
- CI no longer consumes the generic production-capable browser session.
- The attestation is not sufficient by itself; Delivery Lead and DevOps must verify the target's Supabase project before setting it.
- Existing production session credentials must be rotated/revoked outside the repository.

### Rollout

1. Merge containment with isolated variables and secret unset; E2E fails closed.
2. Provision and verify isolated Vercel/Supabase resources.
3. Add seed/reset and cleanup.
4. Create a dedicated test user and environment-scoped session secret.
5. Set protected variables and confirm the preflight plus mutating suite in isolation.

### Rollback

Revert the containment commit only if an equivalent or stronger production deny guard is already active. Never restore the production URL or production auth session to CI.

### Trade-offs & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Temporary E2E outage | Accept | Continue read-only subset on production | Current tests and backend identity are not reliably read-only or isolated |
| Separate Supabase project | Required | Separate frontend only | Data isolation is the safety boundary |
| Generic reusable session | Replace | Keep existing secret | Generic state can authenticate against the wrong environment |

### Open Questions

- Resource names and ownership for the isolated Vercel/Supabase environment.
- Reset mechanism and least-privilege credential design.
- Whether branch protection should require E2E only after the isolated environment is operational.

## Temporary Shared-Backend Mode

The temporary mode uses a separate Vercel frontend and dedicated Supabase Auth user but points to the existing Oracle backend. It is intentionally named `shared-readonly`, not isolated.

Safety controls:

- `E2E_MODE=shared-readonly` is the sole explicit activation. It rejects `E2E_ISOLATED=true`, so the exception cannot be mislabeled as a dedicated database.
- Playwright config exposes only `shared-readonly` and `shared-readonly-auth` projects in this mode; the `chromium`, `mobile`, and isolated `setup` projects do not exist.
- The allowlist is the single named file `tests/e2e/shared-readonly-smoke.spec.ts`; it contains navigation/rendering assertions only and may not use direct mutation requests.
- Production frontend hostname remains denied; tests target the separate E2E Preview deployment.
- The dedicated test user receives only deterministic read-only fixtures and is never the real collection owner.
- The `Shared Read-only Smoke` workflow uses the separate protected `e2e-shared-readonly` environment and `PLAYWRIGHT_SHARED_READONLY_AUTH_SESSION`; it cannot select the full Chromium suite.
- Allocation, import, cron, reset, deck creation, and direct mutation API coverage remain disabled until a separate database exists.

This exception does not resolve TD-027. It provides limited deployment smoke evidence while preserving the fail-closed mutable-suite gate.
