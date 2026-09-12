# Roadmap: Infrastructure & Quality

## Built

- **Auth** — Supabase PKCE flow, middleware protection on all routes.
- **Admin Client** — Server-only, RLS bypassed. User isolation via .eq('user_id').
- **Atomic RPCs** — assign_physical_copy, batch_assign_deck, reassign_to_deck, mark_copy_missing.
- **Diff-Based Reimport** — Preserves allocation data on deck resync.
- **Vercel Deployment** — With cron schedule (daily price refresh).
- **E2E Test Suite** — 55 Playwright tests exist, but the current CI target is production and includes state mutations. **Not an acceptable release gate until isolated.**
- **GitHub Actions CI** — Workflow exists, but currently runs only production-targeted E2E; unit tests, typecheck, lint, build, and migration checks are not enforced.
- **Security Controls (partial)** — Auth middleware, fail-closed cron, payload limits, and headers exist. Admin-client ownership scoping and atomic mutation coverage remain incomplete.
- **Query Key Hook** — useDeckQueryKeys for normalized cache management.
- **Design Tokens** — Figma variables pushed via REST API.

## Migration Safety Gate

The current deployment is not approved as the sole source of truth for a real collection. Production-targeted mutable E2E, destructive/non-atomic collection replacement, incomplete export restore, broken quality gates, and unverified database recovery must be resolved first. See [`../audits/collection-migration-readiness-2026-09-03.md`](../audits/collection-migration-readiness-2026-09-03.md).

## Planned

### Rate Limiting
**Priority:** Medium | **Effort:** Medium

Protect expensive endpoints (AI brew and price refresh) from abuse. Options: Vercel KV sliding window, Upstash Redis, or in-memory (resets on cold start).

### Type Cleanup
**Priority:** Low | **Effort:** Medium

Remove `ignoreBuildErrors: true` from next.config. Fix all TypeScript errors. Remove `@ts-nocheck` directives.

### Migrate to useDeckQueryKeys
**Priority:** Low | **Effort:** Low (incremental)

Replace inline `['decks', deckId]` literals with `deckKeys.detail(deckId)` across all components. Eliminates double-invalidation pattern.

### Fix Stale E2E Selectors
**Priority:** Low | **Effort:** Low

card-management.spec.ts references old UI labels. Update to match current component structure.

## Ideas

- **Error Monitoring** — Sentry or similar for production error tracking
- **Performance Monitoring** — Core Web Vitals tracking, slow query detection
- **Database Backups** — Automated Supabase backup schedule + restore testing
- **Staging Environment** — Preview deployments with test data (not prod)
- **Feature Flags** — Gradual rollout capability for risky changes
- **API Versioning** — If ever opening to third parties
