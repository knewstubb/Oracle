# E2E Tests

## Containment Status

E2E execution is intentionally fail-closed until a dedicated Vercel deployment and Supabase project are configured. Production and localhost targets are denied because the local application currently uses the shared backend from `.env.local`.

Do **not** set `E2E_ISOLATED=true` for a preview deployment that still uses production Supabase credentials. The flag is an attestation that frontend, database, test user, and fixtures are disposable and isolated.

## Required Environment

Every Playwright command, including auth setup and UI mode, requires:

- `E2E_ISOLATED=true`
- `E2E_BASE_URL=https://<isolated-deployment>`
- A dedicated isolated Supabase project and test user
- Deterministic seed/reset and cleanup for mutation-capable tests

Without these inputs, Playwright exits while loading its configuration and sends no requests.

## Local Execution Against the Isolated Environment

```bash
# Install Playwright browsers (one-time)
npx playwright install chromium

# Generate auth state for the isolated test user
E2E_ISOLATED=true \
E2E_BASE_URL=https://<isolated-deployment> \
TEST_USER_EMAIL=<isolated-test-email> \
TEST_USER_PASSWORD=<isolated-test-password> \
npm run test:e2e:setup

# Run the suite
E2E_ISOLATED=true \
E2E_BASE_URL=https://<isolated-deployment> \
npm run test:e2e

# The same variables are required for headed or UI mode
```

Never point these commands at `oracle-alpha-two.vercel.app`, localhost, or a deployment connected to the production Supabase project.

## CI Setup (GitHub Actions)

Create a protected GitHub Environment named `e2e` only after infrastructure isolation and deterministic reset are verified.

Configure these environment variables:

- `E2E_ISOLATED`: `true`
- `E2E_BASE_URL`: the isolated HTTPS deployment

Configure this environment secret:

- `PLAYWRIGHT_E2E_AUTH_SESSION`: base64-encoded `tests/e2e/.auth/session.json` generated against the isolated test user

```bash
# After running isolated auth setup locally on macOS:
base64 -i tests/e2e/.auth/session.json | pbcopy
```

The workflow preflight rejects missing configuration, the production hostname, localhost/loopback targets, non-HTTPS URLs, and a missing isolated auth session before browser installation.

## Session Rotation

When the isolated Supabase session expires:

1. Re-run auth setup against the isolated deployment.
2. Re-encode the session file.
3. Replace `PLAYWRIGHT_E2E_AUTH_SESSION` in the protected `e2e` environment.

The previous production-capable Playwright session must be rotated or revoked separately; it must not be reused here.

## Test Files

| File | Coverage |
|------|----------|
| `oracle-smoke.spec.ts` | Navigation, page loading, core layout |
| `card-management.spec.ts` | Status chip actions (fill, pull, proxy, remove) |
| `card-movement.spec.ts` | Cross-deck movement, status propagation, API contracts |
| `new-features.spec.ts` | Goldfish, export, price refresh, multi-platform import |

## Writing New Tests

- Treat every UI action and API request as mutation-capable unless the route is proven read-only.
- Add deterministic fixture setup and cleanup before adding mutating coverage.
- Use `page.waitForTimeout(SETTLE_TIMEOUT)` after navigation while data fetching remains asynchronous.
- Check `isVisible()` before acting on elements that may not exist in all fixture states.
- Always use `{ timeout: LOAD_TIMEOUT }` for `expect().toBeVisible()` on data-dependent elements.
