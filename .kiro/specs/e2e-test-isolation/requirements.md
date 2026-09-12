# Requirements: E2E Test Isolation

## 1. Problem Statement

The Playwright suite currently targets the production Vercel deployment with a reusable authenticated session. Several tests can invoke real allocation mutations, while neither CI nor local execution proves that the frontend is connected to an isolated Supabase project. A test run can therefore change authoritative user data without cleanup.

## 2. Outcome

No E2E invocation can send requests until it has an explicitly configured, non-production target that is attested as isolated. Once dedicated test infrastructure exists, CI runs against seeded disposable data with deterministic reset and cleanup.

## 3. Users

| User | Role |
|------|------|
| Developer | Runs E2E tests locally or from CI without risking production data |
| Tester | Exercises mutating workflows against deterministic disposable fixtures |
| Delivery Lead | Uses E2E results as release evidence |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Safety checks SHALL fail closed before Playwright launches a browser or sends an HTTP request. |
| NFR-2 | Production and localhost targets SHALL be denied even if an isolation flag is supplied. |
| NFR-3 | E2E credentials SHALL be scoped to the isolated environment and SHALL NOT reuse the production browser session. |
| NFR-4 | Test data SHALL be resettable and disposable before mutating E2E coverage is re-enabled. |
| NFR-5 | The containment change SHALL be reversible after isolated infrastructure passes its readiness checks. |

## 5. User Stories & Acceptance Criteria

### 5.1 Fail-closed execution

**US-5.1.1** As a developer, I want unsafe E2E targets rejected so that a mistaken command cannot mutate production.

#### Acceptance Criteria
- WHEN `E2E_ISOLATED` is absent or is not exactly `true`, THE SYSTEM SHALL stop during Playwright configuration.
- WHEN `E2E_BASE_URL` is absent or invalid, THE SYSTEM SHALL stop during Playwright configuration.
- WHEN the target host is production, localhost, or a loopback address, THE SYSTEM SHALL stop before launching a browser.
- WHEN all containment inputs are valid, THE SYSTEM SHALL use only `E2E_BASE_URL` as Playwright's base URL.

### 5.2 CI containment

**US-5.2.1** As a Delivery Lead, I want CI to require isolated environment configuration so that pushes and pull requests cannot target production.

#### Acceptance Criteria
- WHEN CI starts, THE SYSTEM SHALL obtain its URL and isolation attestation from protected configuration rather than a production literal.
- WHEN isolated configuration or credentials are absent, THE SYSTEM SHALL fail before installing browsers or restoring an auth session.
- WHEN authentication is configured, THE SYSTEM SHALL use a dedicated isolated-environment session secret.

### 5.3 Isolated test environment

**US-5.3.1** As a tester, I want deterministic disposable test data so that mutating tests can make strong assertions and clean up reliably.

#### Acceptance Criteria
- WHEN E2E is enabled, THE SYSTEM SHALL target a frontend connected to a distinct Supabase project and test user.
- BEFORE a mutating suite runs, THE SYSTEM SHALL reset or seed known fixtures.
- AFTER a run or failed test, THE SYSTEM SHALL leave the environment ready for a deterministic retry.

## 6. In Scope

- Immediate fail-closed Playwright and GitHub Actions containment.
- Removal of production execution instructions and defaults.
- Dedicated environment configuration contract.
- Follow-up provisioning, seeding, reset, cleanup, and isolated auth-session setup.

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Repairing stale E2E selectors | Separate test-maintenance concern after isolation exists |
| Fixing application allocation behavior | Tracked independently by TD-029 |
| Production data recovery | Requires an audit if prior E2E runs changed data |
| Expanding E2E coverage | No new mutating coverage until isolation is operational |

## 8. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Which isolated Supabase and Vercel projects will host E2E? | Blocks re-enabling the workflow |
| 2 | Should fixture reset use migrations plus seed SQL or a test-only RPC? | Determines reset implementation and credential scope |
| 3 | Which existing test account/session should be rotated or revoked? | Required production containment follow-up |

## 9. Temporary Shared-Backend Exception

Until a free hosted project becomes available, the user accepts a temporary shared-production-backend mode for **read-only smoke coverage only**.

### 9.1 Shared-backend smoke safety

**US-9.1.1** As an operator, I want limited deployment smoke evidence without allowing tests to mutate real collection state.

#### Acceptance Criteria
- WHEN E2E uses the production Supabase project, THE SYSTEM SHALL identify the mode as `shared-readonly`; it SHALL NOT claim isolation.
- WHEN mode is `shared-readonly`, THE SYSTEM SHALL run only an explicitly allowlisted smoke project whose tests perform no application or API mutations.
- WHEN mode is `shared-readonly`, THE SYSTEM SHALL use a dedicated test identity and SHALL NOT authenticate as the real collection owner.
- WHEN a test requires collection, deck, allocation, import, reset, cron, or other writes, THE SYSTEM SHALL exclude it from shared-backend execution.
- WHEN a separate hosted database becomes available, THE SYSTEM SHALL retire this exception and restore the isolated mutable-suite requirements in section 5.3.

### 9.2 Accepted risk

The shared database still has a non-zero blast radius because some server routes use the service-role client and known ownership-scoping debt exists. Therefore this exception permits navigation/rendering smoke tests only, has no authority as mutation or tenant-isolation evidence, and must be reviewed by 2026-10-12 or when an alternate database becomes available, whichever comes first.
