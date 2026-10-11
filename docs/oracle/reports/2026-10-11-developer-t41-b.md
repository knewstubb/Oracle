# Report: T-41 Batch B — skip paused Phase 8/9 checks

Role: Developer
Status: DONE
Task as received: "T-41 Batch B. These 12 test files cover paused Phase 8/9 work (AI routes, canvas, new-deck page, migration-020): src/app/api/ai/build-deck/route.test.ts, src/app/api/ai/mana-analysis/route.test.ts, src/app/api/ai/recommend/route.test.ts, src/app/api/ai/search/route.test.ts, src/lib/brew-prompts.test.ts, src/app/new-deck/page.test.tsx, src/components/brew-v2/useCanvasZoom.test.ts, src/components/brew-v2/useCanvasDrag.test.ts, src/test/migration-020.test.ts, src/components/brew-v2/BrewTopbar.test.tsx, src/components/brew-v2/DeckListTab.test.tsx, src/components/brew-v2/ModelSelector.test.tsx. Mark every currently failing test in them as skipped (describe.skip / it.skip) with a one-line comment 'Paused: Phase 8/9, re-enable when that phase resumes (T-41 Batch B)'. Do not edit test logic and do not touch non-test files. Also fix type and lint errors in these files only if trivial. Done when: npx vitest --run on these files shows 0 failed. Report is docs/oracle/reports/2026-10-11-developer-t41-b.md."

## Summary for the owner
The 39 checks that were failing because they cover the paused AI-advisor and Brew Canvas work are now parked (marked "skipped") instead of red, so the test run on these files is clean. Nothing about the app's behaviour changed — these are the old checks for features we have not resumed yet, and they will be switched back on when those features come back. No card, deck or collection data was touched.

## Changed files
- `src/app/api/ai/build-deck/route.test.ts` — skipped 2 failing tests (`.skip` + pause comment).
- `src/app/api/ai/mana-analysis/route.test.ts` — skipped 2 failing tests.
- `src/app/api/ai/recommend/route.test.ts` — skipped 2 failing tests.
- `src/app/api/ai/search/route.test.ts` — skipped the whole failing suite (all 4 tests fail on the same stale mock).
- `src/lib/brew-prompts.test.ts` — skipped 2 failing prompt-string tests.
- `src/app/new-deck/page.test.tsx` — skipped the `BrewModePage` suite (all 9 tests die on a missing `next/navigation` `useRouter` mock).
- `src/components/brew-v2/useCanvasZoom.test.ts` — skipped 5 failing tests (zoom min/max moved to 30/200).
- `src/components/brew-v2/useCanvasDrag.test.ts` — skipped 4 failing tests (jsdom has no hit-test target for `.closest`).
- `src/test/migration-020.test.ts` — skipped the suite (all 9 tests; migration moved to `supabase/migrations`, `020-brew-v2-columns.sql` no longer exists) and removed 7 `no-explicit-any` lint errors in the helper code (type-only edits, no behaviour change).
- `src/components/brew-v2/BrewTopbar.test.tsx` — added missing `beforeEach` import (type-only fix); tests were already passing.
- `src/components/brew-v2/DeckListTab.test.tsx` — added missing `beforeEach` import (type-only fix); tests were already passing.
- `src/components/brew-v2/ModelSelector.test.tsx` — added missing `beforeEach` import (type-only fix); tests were already passing.
- `docs/oracle/reports/2026-10-11-developer-t41-b.md` — this report (new).

Note: `node_modules` in this worktree was a dangling path, so I created the git-ignored symlink to the main folder's `node_modules` (the shared copy named in the task). It does not appear in `git status`.

## New decisions made (need owner confirmation)
- none.

## Assumptions
- The three Brew V2 component test files (`BrewTopbar`, `DeckListTab`, `ModelSelector`) were listed in Batch B but currently pass; per the task ("mark every currently failing test") I did not skip them and only applied the trivial missing-import type fix.
- For suites where every test in the file failed (`search`, `new-deck/page`, `migration-020`) I used `describe.skip`; for files with a mix of passing and failing tests I used per-test `it.skip` so passing coverage stays live.

## Challenges to locked decisions
- none.

## Open questions
- `src/app/new-deck/page.test.tsx:4` still has one type error: it imports `@/hooks/useBrewSession`, a hook that does not exist anywhere in the repo (only `src/lib/brew-v2-session.ts` exists). Fixing it is not trivial and would require creating/changing non-test code, so I left it; it belongs to the paused Phase 8/9 work and should be revisited when that resumes.
- `src/test/migration-020.test.ts` is now skipped rather than deleted; T-40 recommended deleting it since `020-brew-v2-columns.sql` no longer exists. This task scoped only skipping, so I left it. Confirmation wanted on delete-vs-keep when Phase 9 resumes.

## Verification
- `NODE_DISABLE_COMPILE_CACHE=1 ./node_modules/.bin/vitest --run <12 files>` — **9 passed, 3 skipped files; 103 passed, 39 skipped tests; 0 failed.**
- `./node_modules/.bin/eslint <12 files>` — **0 errors** (6 warnings remain in `new-deck/page.test.tsx`, all pre-existing unused-mock/`<img>` warnings).
- `npx tsc --noEmit` filtered to these 12 files — **1 remaining error**: `src/app/new-deck/page.test.tsx(4,32): Cannot find module '@/hooks/useBrewSession'` (see Open questions). All other type errors in these files resolved.
- `git status --short` — only the 12 test files modified; no non-test files touched.
