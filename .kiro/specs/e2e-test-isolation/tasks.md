# Tasks: E2E Test Isolation

## Phase 0 — Containment

- [x] Trace CI, Playwright URL resolution, auth-state handling, and mutation-capable tests. Refs: requirements 5.1–5.2; design Architecture.
- [x] Add a fail-closed Playwright isolation preflight. Refs: requirements 5.1; design Playwright isolation preflight.
- [x] Remove the production URL and generic auth-session secret from GitHub Actions. Refs: requirements 5.2; design GitHub Actions E2E job.
- [x] Replace production/local execution guidance with the isolation contract. Refs: requirements 5.1–5.2; design Operator guide.
- [x] Validate rejected and accepted configuration paths without sending network requests. Refs: NFR-1–NFR-2.
- [x] Record containment in the delivery log and TD-027. Refs: requirements 2.

## Phase 1 — Isolated Infrastructure

- [ ] Provision a dedicated Supabase project and Vercel deployment.
- [ ] Verify and expose a non-secret backend environment identity.
- [ ] Create a least-privilege E2E test user.
- [ ] Implement deterministic fixture seed/reset and failure cleanup.
- [ ] Generate and store an environment-scoped Playwright auth session.
- [ ] Enable protected `E2E_BASE_URL` and `E2E_ISOLATED` configuration.

## Phase 2 — Trustworthy Coverage

- [ ] Repair stale selectors and action terminology.
- [ ] Add two-user isolation and mutation-cleanup verification.
- [ ] Re-enable mutating suites against disposable fixtures.
- [ ] Decide when isolated E2E becomes a required branch-protection gate.
- [ ] Rotate/revoke the prior production browser session and audit possible historical mutations.

## Temporary Shared-Backend Smoke Increment

- [ ] Add an explicit `shared-readonly` execution mode without weakening isolated-mode guards.
- [ ] Create a dedicated smoke-only Playwright project and mutation-free allowlist.
- [ ] Create a dedicated test identity and deterministic read-only fixture rows.
- [ ] Provision a separate Vercel E2E frontend connected to the shared backend.
- [ ] Configure protected GitHub variables/secret for shared-readonly smoke.
- [ ] Verify no write-capable spec or direct mutation request is selected.
- [ ] Record accepted risk with review date 2026-10-12.
- [ ] Retire this mode when an alternate hosted database becomes available.
