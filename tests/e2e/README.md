# E2E Tests

## Quick Start (Local)

```bash
# 1. Install Playwright browsers (one-time)
npx playwright install chromium

# 2. Start dev server
npm run dev

# 3. Save auth session (opens browser — log in manually)
npm run test:e2e:setup

# 4. Run tests
npm run test:e2e

# Or with visible browser:
npm run test:e2e:headed

# Or with interactive UI:
npm run test:e2e:ui
```

## Running Against Production

```bash
BASE_URL=https://oracle-alpha-two.vercel.app npm run test:e2e
```

## CI Setup (GitHub Actions)

The CI pipeline needs a `PLAYWRIGHT_AUTH_SESSION` secret containing your base64-encoded auth session.

### Generate the secret:

```bash
# 1. Run auth setup locally first
npm run test:e2e:setup

# 2. Base64 encode the session file
base64 -i tests/e2e/.auth/session.json | pbcopy
# (this copies to clipboard on macOS)

# 3. Add to GitHub:
#    Repo → Settings → Secrets → Actions → New repository secret
#    Name: PLAYWRIGHT_AUTH_SESSION
#    Value: (paste the base64 string)
```

### Session expiry

Supabase sessions expire after ~1 week by default. When CI tests start failing with 401s:
1. Re-run `npm run test:e2e:setup` locally
2. Re-encode and update the GitHub secret

## Test Files

| File | Coverage |
|------|----------|
| `oracle-smoke.spec.ts` | Navigation, page loading, core layout |
| `card-management.spec.ts` | Status chip actions (fill, claim, proxy, remove) |
| `card-movement.spec.ts` | Cross-deck movement, status propagation, API contracts |
| `new-features.spec.ts` | Goldfish, export, price refresh, multi-platform import |

## Writing New Tests

- Use `page.waitForTimeout(SETTLE_TIMEOUT)` after navigation (data fetching)
- Check `isVisible()` before acting on elements that may not exist in all states
- API contract tests (`request.get/post`) are fast and don't need UI interaction
- Always use `{ timeout: LOAD_TIMEOUT }` for `expect().toBeVisible()` on data-dependent elements
