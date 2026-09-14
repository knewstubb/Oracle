# Convention: Personal Application Scope

## Purpose

The Oracle is currently a private, single-user personal application. Engineering work must protect the correctness of the user's collection and deck data without prematurely building the operational, security, and platform posture of a public or multi-user product.

## Default rule

**Do not add production-level hardening unless deferring it would either:**

1. leave the current personal application exposed to immediate data corruption or unsafe behavior; or
2. make the later change destructive, incompatible, or substantially harder to adopt.

Scope decisions must distinguish current data correctness from future platform hardening. A production feature is not automatically in scope because it is generally good practice.

## Required now

Implement the smallest change that keeps the personal application correct and recoverable:

- Preserve data invariants that the user relies on today.
- Make related writes atomic when a crash or race could leave copies, deck slots, or locations inconsistent.
- Validate destructive inputs completely before mutation.
- Use the current schema and fail closed when a required transaction boundary or contract is unavailable.
- Keep existing authenticated-user ownership guards on server-side admin-client routes.
- Add only the pagination, validation, and rollback checks required by the current data volume and behavior.
- Run targeted tests and read-only integrity checks for the changed behavior.

For collection and allocation work, this includes the one-location model, current-schema RPCs, default storage behavior, canonical card identity checks, complete destructive-import preflight, and protection against partial replacement.

## Defer by default

Unless a feature explicitly changes scope, defer the following until the application needs public, multi-user, or production-operational capabilities:

- Broad Row Level Security remediation and multi-tenant policy rollout.
- Full two-user authorization matrices and tenant-isolation infrastructure.
- Import-run staging, resumable imports, durable revision systems, and replay/idempotency infrastructure.
- Durable mutation audit logs, dashboards, alerting, and production observability.
- Full backup/restore and disaster-recovery systems.
- Production-scale deployment, canary, rollback, and capacity engineering.
- Repository-wide lint, typecheck, test, and CI-baseline repair unrelated to the changed behavior.
- Production-like isolated E2E infrastructure when targeted local or hosted validation is sufficient.
- Performance optimization beyond a demonstrated current data-volume issue.

Deferred work must be recorded in the relevant feature spec or technical debt register with the trigger that will bring it back into scope.

## Safety exception

A narrowly scoped safety change is allowed when it is required to ship the current feature safely. Examples:

- A migration touching `SECURITY DEFINER` functions must not create an intermediate privilege window for `PUBLIC` or `authenticated` users.
- An RPC that maintains a current data invariant must retain explicit ownership checks even in a single-user deployment.
- A destructive import must not apply a known partial or unresolved input merely because stronger staging infrastructure is deferred.

These exceptions protect the current personal application; they do not authorize broad security, compliance, observability, or platform work.

## Scope review questions

Before adding production hardening, answer:

1. What immediate corruption or unsafe behavior exists if this is deferred?
2. Does the current user or current data volume exercise the risk now?
3. Can the change be added later without a destructive migration or incompatible contract?
4. Is a smaller guard or documented limitation sufficient for the personal-app phase?
5. What concrete trigger should move the deferred work into scope?

If deferral is safe and reversible, defer it.

## Collection Foundation application

For the atomic collection movement increment:

### In scope now

- Current-schema atomic movement and collection RPCs.
- One-location integrity for active movement paths.
- Default storage creation and safe release behavior.
- Canonical copy/slot identity validation.
- Complete preflight for destructive imports.
- Pagination beyond PostgREST's default row limit.
- One-request, one-transaction collection replacement.
- Fail-closed RPC result validation and rollback tests.
- Migration privilege safety for the functions being changed.

### Explicitly deferred

- Broad RLS remediation tracked by TD-037.
- Full multi-user and two-tenant test coverage.
- Durable import staging and collection revision infrastructure.
- Audit, alerting, backup, and disaster-recovery systems.
- Full Planned/Sleeved UX and hard XOR enforcement.
- The broader missing-card workflow.

## Ownership and review

The Delivery Lead enforces this scope boundary during design and release review. The Product Manager decides when deferred hardening becomes product scope. Developers must call out any proposed production hardening and identify whether it is required now, safely deferrable, or covered by the safety exception.

## Provenance

- **Authored:** 2026-09-12 by Delivery Lead (Gene)
- **Motivated by:** User decision to keep the current work focused on the private personal application and defer production-level hardening unless it cannot be safely added later.
