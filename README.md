# The Oracle

The Oracle is a private Magic: The Gathering Commander collection and deck-management application. It tracks individual owned copies, storage locations, proxies, and deck allocations, with supporting deck-building and card-data tools.

> **Migration status:** Do not use Oracle as the only source of truth for a real collection yet. Read the [collection migration readiness audit](docs/audits/collection-migration-readiness-2026-09-03.md) before importing authoritative data.

## Stack

- Next.js 16 / React 19 / TypeScript
- Supabase Postgres and Auth
- TanStack Query
- Tailwind CSS and shadcn/ui
- Vitest and Playwright
- Vercel deployment and cron routes

## Local Development

Requirements: Node.js 20+, npm, and access to a configured Supabase project.

```bash
npm ci
npm run dev
```

The app runs at <http://localhost:3000>.

Copy `.env.local.example` to `.env.local` and provide the required Supabase/auth/integration values. Never commit service-role keys or authenticated Playwright state.

## How to run the checks

Run the whole check suite before every merge:

```bash
npm run check
```

It runs the unit tests first, then the type check, then lint, and stops at the first failure. Each part can also be run on its own:

```bash
npm test          # unit tests (Vitest)
npm run typecheck # TypeScript; no errors allowed
npm run lint      # ESLint; 0 errors (warnings are allowed)
```

`npx next build` also type-checks the app now. Five paused files are temporarily kept out of the type check with a `@ts-nocheck` header (the old new-deck screen and its test, DeckChatTab, PicklistV2 and StatusChipPopover); remove the header when each file is fixed in its phase. See [docs/oracle/reports/2026-10-11-developer-t42-t43-checks-gate.md](docs/oracle/reports/2026-10-11-developer-t42-t43-checks-gate.md).

## Repository Map

- `src/app/` — pages and API route handlers
- `src/components/` — shared UI
- `src/lib/` — domain, data, and integration logic
- `src/hooks/` — client data/query hooks
- `supabase/` — application-local migrations/functions; not yet the only migration source
- `scripts/` — active sync plus historical maintenance scripts
- `tests/e2e/` — Playwright tests; must target isolated test data, not production
- `docs/` — operational and product documentation

The workspace currently also contains `.kiro/`, research, specs, and additional Supabase assets outside this nested Git repository. Do not delete or consolidate those until deployed migration/function history is reconciled.

## Documentation

Start with [`docs/README.md`](docs/README.md). Feature requirements, designs, and delivery logs live under the workspace `.kiro/specs/` directory.

## Safety Rules

- Preserve Archidekt and independent exports until backup restore and import round-trip are proven.
- Never run destructive collection replacement without a native database backup.
- Multi-row state transitions must use atomic Postgres RPCs.
- Normal user routes should prefer an authenticated RLS-backed Supabase client; service-role access requires explicit ownership scoping.
- Production must not be used as mutable CI test data.
