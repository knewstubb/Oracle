# E2E Tests

## Two Explicit Modes

The Oracle has two deliberately separate Playwright modes. They must never be treated as interchangeable.

| Mode | Backend requirement | Selected coverage | Contract |
|---|---|---|---|
| `isolated` | Dedicated Supabase project, disposable fixtures, deterministic reset | Full Chromium and mobile suites, including mutating coverage | `E2E_ISOLATED=true` |
| `shared-readonly` | Separate HTTPS Vercel frontend using the existing Oracle backend and the dedicated fixture identity | One reviewed navigation/rendering smoke spec | `E2E_MODE=shared-readonly` |

Production (`oracle-alpha-two.vercel.app`), localhost, loopback addresses, non-HTTPS URLs, unknown modes, and a `shared-readonly` run that claims `E2E_ISOLATED=true` are rejected while Playwright loads. No browser or application request is sent after a rejected preflight.

## Isolated Full Suite

The full E2E suite remains fail-closed until a dedicated Vercel deployment and Supabase project are configured. Do **not** set `E2E_ISOLATED=true` for a preview or deployment that still uses the Oracle production Supabase project.

```bash
# Generate auth state for an isolated test user.
E2E_ISOLATED=true \
E2E_BASE_URL=https://<isolated-deployment> \
TEST_USER_EMAIL=<isolated-test-email> \
TEST_USER_PASSWORD=<isolated-test-password> \
npm run test:e2e:setup

# Run the full isolated suite.
E2E_ISOLATED=true \
E2E_BASE_URL=https://<isolated-deployment> \
npm run test:e2e
```

Never point these commands at `oracle-alpha-two.vercel.app`, localhost, or a deployment connected to the production Supabase project.

## Temporary Shared-Readonly Smoke

`shared-readonly` is a temporary, accepted-risk exception—not an isolated environment. It is limited to the dedicated test identity and its persistent, allocation-disabled fixture deck. The only allowlisted spec is `tests/e2e/shared-readonly-smoke.spec.ts`.

It may only navigate and assert rendered content. It must not add collection, deck, allocation, import, reset, cron, direct API write, or other mutation coverage. Do not use `npm run test:e2e` in this mode: the configuration intentionally does not expose the `chromium` project.

```bash
# Refresh the dedicated browser session. This performs authentication only and
# writes the ignored local session file; it does not create or modify app data.
E2E_MODE=shared-readonly \
E2E_BASE_URL=https://<shared-readonly-frontend> \
TEST_USER_EMAIL=<dedicated-test-email> \
TEST_USER_PASSWORD=<dedicated-test-password> \
npm run test:e2e:shared-readonly:setup

# Run the one allowlisted, read-only smoke spec.
E2E_MODE=shared-readonly \
E2E_BASE_URL=https://<shared-readonly-frontend> \
npm run test:e2e:shared-readonly
```

The separate frontend URL must not be the production hostname. The temporary exception expires for review on **2026-10-12** or when an alternate hosted database becomes available, whichever is earlier.

## CI Configuration

### Isolated full suite

The existing `e2e` GitHub Environment is reserved for the future isolated full suite:

- Variables: `E2E_ISOLATED=true`, `E2E_BASE_URL=https://<isolated-deployment>`
- Secret: `PLAYWRIGHT_E2E_AUTH_SESSION`, a base64-encoded isolated session file

### Shared-readonly smoke

The `Shared Read-only Smoke` workflow is intentionally separate and runs on its weekday schedule or by manual dispatch. Configure its protected `e2e-shared-readonly` environment only after verifying its frontend points to the dedicated test fixture:

- Variables: `E2E_MODE=shared-readonly`, `E2E_BASE_URL=https://<shared-readonly-frontend>`
- Secret: `PLAYWRIGHT_SHARED_READONLY_AUTH_SESSION`, a base64-encoded session file generated for the dedicated test identity and the shared-readonly frontend

After refreshing the session locally on macOS:

```bash
base64 -i tests/e2e/.auth/session.json | pbcopy
```

The workflow rejects a missing mode, unsafe URL, unknown mode, or missing dedicated session before it checks out code, installs browsers, or restores the session.

## Test Files

| File | Coverage | Execution mode |
|---|---|---|
| `shared-readonly-smoke.spec.ts` | Dedicated fixture navigation and commander-context rendering only | `shared-readonly` only |
| `oracle-smoke.spec.ts` | Navigation, page loading, core layout | Isolated only |
| `card-management.spec.ts` | Status chip actions (fill, pull, proxy, remove) | Isolated only |
| `card-movement.spec.ts` | Cross-deck movement, status propagation, API contracts | Isolated only |
| `new-features.spec.ts` | Goldfish, export, price refresh, multi-platform import | Isolated only |

## Writing New Tests

- Treat every UI action and API request as mutation-capable unless the route is proven read-only.
- Add tests to `shared-readonly-smoke.spec.ts` only when they are pure navigation/rendering assertions and their backend requests are proven read-only.
- Never add a new shared-readonly spec file or broad test glob; the single named file is the allowlist.
- Add deterministic fixture setup and cleanup before adding mutating coverage to the isolated suite.
- Use `page.waitForTimeout(SETTLE_TIMEOUT)` after navigation while data fetching remains asynchronous.
- Check `isVisible()` before acting on elements that may not exist in all fixture states.
- Always use `{ timeout: LOAD_TIMEOUT }` for `expect().toBeVisible()` on data-dependent elements.
