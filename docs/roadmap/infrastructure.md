# Roadmap: Infrastructure & Quality

## Built

- **Auth** — Supabase PKCE flow, middleware protection on all routes.
- **Admin Client** — Server-only, RLS bypassed. User isolation via .eq('user_id').
- **Atomic RPCs** — assign_physical_copy, batch_assign_deck, reassign_to_deck, mark_copy_missing.
- **Diff-Based Reimport** — Preserves allocation data on deck resync.
- **Vercel Deployment** — With cron schedule (daily price refresh).
- **E2E Tests** — 55 Playwright tests across 4 spec files.
- **GitHub Actions CI** — Runs on push/PR against deployed Vercel URL.
- **Security Hardening** — IDOR fixes, fail-closed cron, payload limits, security headers.
- **Query Key Hook** — useDeckQueryKeys for normalized cache management.
- **Design Tokens** — Figma variables pushed via REST API.

## Planned

### Rate Limiting
**Priority:** Medium | **Effort:** Medium

Protect expensive endpoints (AI brew, price refresh, OCR) from abuse. Options: Vercel KV sliding window, Upstash Redis, or in-memory (resets on cold start).

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
