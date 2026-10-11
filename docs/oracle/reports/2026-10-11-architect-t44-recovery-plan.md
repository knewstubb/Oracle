# Report: T-44 Recovery plan

Role: Architect
Status: DONE
Task as received: Write a recovery plan (read-only, no migrations or database changes) covering what a full Oracle backup must contain (owned copies, storage locations, deck lists, which copy sits in which deck slot, history snapshots), what the hosted Supabase project already provides (check supabase/ and docs; do not call the live database), what the current collection and deck exports omit, and a proposed restore test that uses no real data, saved to docs/oracle/contracts/recovery-plan.md.

Subsequent direction from Gene: the owner runs the app locally but it still uses the hosted Supabase database; Vercel is not used. Update the recovery plan for that exact setup.

## Summary for the owner

Oracle stores every detail about your cards, boxes, deck slots and history in the hosted Supabase project. The app runs on your computer, but the data does not — it lives online in Supabase. Vercel is not involved right now. Because Supabase Free has no managed backups or point-in-time recovery, the hosted database is the only complete copy of your data and it is not automatically protected. If it were deleted or corrupted, you would have to rebuild from your original Archidekt/Moxfield/CSV source files and manually re-assign every physical copy. I updated the recovery plan to focus on this real setup: what the hosted database provides, what the current exports omit, what extra backup is needed, and a synthetic restore test that uses no real data.

## Changed files

- `docs/oracle/contracts/recovery-plan.md` — revised contract covering the current runtime setup (local app, hosted Supabase database, no Vercel), backup scope, Supabase Free limitations, export gaps, restore scenarios, minimum safe posture, owner decisions, and a no-real-data restore test.

## New decisions made (need owner confirmation)

- None. This is a read-only plan; no new product decisions are implemented. The plan documents the existing owner-approved rebuild-only posture from the 2026-09-03 audit.

## Assumptions

- The app runs locally via `npm run dev` / `next dev` and connects to the hosted Supabase project using `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` [Confirmed: package.json; src/lib/supabase.ts; src/middleware.ts].
- Vercel is not used for hosting right now; this is a local-only app deployment.
- There is no local database configuration in the repo: no `supabase/config.toml`, no local Postgres setup [Confirmed: glob for `supabase/config.toml`; package.json scripts].
- The project remains on Supabase Free with no managed backups or PITR, as stated in `docs/audits/collection-migration-readiness-2026-09-03.md` [Confirmed].
- The current collection CSV export and deck text export are the only user-facing exports [Confirmed: src/app/api/collection/export/route.ts; src/lib/deck-export.ts].
- The schema state matches the generated types in `src/types/supabase.ts` and the migrations in `supabase/migrations/` [Confirmed].
- No live database call was made; all claims are based on repo files and docs.

## Challenges to locked decisions

- None. The plan does not contradict any locked decision in `docs/oracle/decisions.md`. It explicitly preserves the owner-approved rebuild posture and the D-001 data model.

## Open questions

1. Does the owner want to stay on the rebuild-only posture, upgrade to Supabase Pro for backups/PITR, or implement scheduled manual dumps of the hosted database?
2. If backups are implemented, should the approach be a full database dump or an enhanced user-facing export that includes copy IDs, locations, and deck-slot assignments?
3. Where should `.env.local` and authoritative source files (collection export, deck files) be stored so a rebuild can be done without hunting for them?
4. Is the current version-history restore behaviour — which restores deck lists but releases physical copies — acceptable, or should a future restore also try to re-attach the same copies?

## Verification

- Read agent context: `AGENTS.md`, `~/agents-shared/architect.md`, `.agents/project/architect.md`.
- Reviewed runtime setup: `package.json` scripts, `src/lib/supabase.ts`, `src/middleware.ts`.
- Reviewed schema: `src/types/supabase.ts`, foundational migrations in `supabase/migrations/`.
- Reviewed exports: `src/app/api/collection/export/route.ts`, `src/lib/deck-export.ts`.
- Reviewed backup posture docs: `docs/audits/collection-migration-readiness-2026-09-03.md`, `research/docs/product/launch-strategy.md`, `docs/roadmap-foundations-first.md`.
- Confirmed no `supabase/config.toml` or automated backup workflow exists in the repo.
- Updated `docs/oracle/contracts/recovery-plan.md` with the local-app / hosted-database focus, `[Confirmed: path]` tags, and a short side note on the local-database alternative.
