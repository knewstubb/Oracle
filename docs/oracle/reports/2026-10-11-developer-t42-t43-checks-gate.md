# Report: T-42 final step and T-43 — checks gate

Role: Developer
Status: DONE

Task as received:
> You are the Developer. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md first. Context: Phase 1 (Safety net) in docs/oracle/roadmap.md; the app runs locally against the hosted Supabase database, no Vercel for now. Task: T-42 final step and T-43. (1) Turn type checking on for next build: remove ignoreBuildErrors from next.config.ts, but keep these 5 files out of the type check until their phases resume: src/app/new-deck/page.tsx, src/app/new-deck/page.test.tsx, src/components/DeckChatTab.tsx, src/components/PicklistV2.tsx, src/components/StatusChipPopover.tsx (25 known errors, see docs/oracle/reports/2026-10-11-developer-t42-a7.md defects 4,7,10,11,13). Pick the simplest safe mechanism (for example a separate tsconfig used by the check command that excludes them, and a comment in the file listing why and when to remove it); verify that npx next build still passes locally and report honestly if it cannot with these exclusions (next build type-checks everything it imports, so tell me exactly what happens). Do not weaken any other check. (2) Add one npm script, 'check', that runs unit tests, type check and lint in that order and fails if any fails, and a short plain 'How to run the checks' section in README (or docs/) saying to run npm run check before every merge. Lint must pass with 0 errors (today there are 7 lint errors outside src, find and fix them or list them if they need a decision; warnings are ok). Do not touch GitHub workflows, real data or the network. Do not run scripts that write to the database. Report to docs/oracle/reports/2026-10-11-developer-t42-t43-checks-gate.md in the AGENTS.md report format. Stop when done.
> For Brad (plain words): This makes one command that checks the whole app before every merge, and makes the build stop hiding type errors except in the five paused files.

## Summary for the owner
The build no longer hides type errors. Type checking is fully on during `next build`; only the five paused files (the old new-deck screen and its test, DeckChatTab, PicklistV2, StatusChipPopover) are still skipped, each marked with a comment that says what it is hiding and when to remove it. There is now one command, `npm run check`, that runs the tests, then type checking, then lint, and stops if any of them fails; it is meant to be run before every merge. Lint already had no errors — the seven mentioned in the task were cleared by the earlier T-42 A5/A6 batches, so nothing needs your decision there.

## Changed files
- `next.config.ts` — removed `typescript.ignoreBuildErrors`; added a comment pointing at the five files and this report.
- `package.json` — added `typecheck` (`tsc --noEmit`) and `check` (`npm test && npm run typecheck && npm run lint`).
- `README.md` — replaced the stale "Validation" section with a short "How to run the checks" section that says to run `npm run check` before every merge.
- `src/app/new-deck/page.tsx` — added a `@ts-nocheck` header (8 known errors, defects 4/13, paused Phase 8/9) with removal instructions.
- `src/app/new-deck/page.test.tsx` — added a `@ts-nocheck` header (1 known error, defect 13, paused Phase 8/9; suite is skipped).
- `src/components/DeckChatTab.tsx` — added a `@ts-nocheck` header (2 known errors, defect 7, paused Phase 8/9).
- `src/components/PicklistV2.tsx` — added a `@ts-nocheck` header (5 known errors, defect 10, Phase 7).
- `src/components/StatusChipPopover.tsx` — added a `@ts-nocheck` header (9 known errors, defect 11, Phase 7).

Each header is two lines: an `eslint-disable-next-line @typescript-eslint/ban-ts-comment` and the `// @ts-nocheck -- <count>, <defect>, <phase>; remove both when the file is fixed`. No other check was weakened.

## New decisions made (need owner confirmation)
- **Exclusion mechanism:** the five deferred files are kept out of type checking with a per-file `// @ts-nocheck` header, not a separate tsconfig. This is the only mechanism that works, because `next build` follows imports (evidence below). If the owner/Architect would rather not use `@ts-nocheck`, the alternative is to fix the 25 errors when their phases resume; there is no tsconfig setting that keeps an imported file out of the build's type check.

## Assumptions
- **Why not a separate tsconfig (this is the "tell me exactly what happens" part):** Next's build type check (`node_modules/next/dist/lib/typescript/runTypeCheck.js`) builds a TypeScript program from the tsconfig's `include` list and then follows every import. I tested this directly: with `tsconfig.t42-experiment.json` excluding `src/components/PicklistV2.tsx`, `tsc -p` still reported all 5 of its errors, because `src/components/CardsTab.tsx` and `src/app/decks/[id]/page.tsx` import it. `npx tsc --noEmit --listFilesOnly` also confirms all five files are in the program. `src/components/DeckChatTab.tsx` is the one exception — nothing imports it, so it did drop out when excluded — but that is not true of the other four. Next's build additionally ignores diagnostics in test files (`*.test.*`, `*.spec.*`, `__tests__`, `__mocks__`), which is why `page.test.tsx` alone would not have blocked `next build`; it still needed `@ts-nocheck` for `npm run typecheck`.
- The five files are now fully unchecked (not just their known errors) until fixed. That matches the owner's decision ("stops ignoring type errors everywhere except those deferred files"); the header text names each file's phase and removal condition.
- `eslint-disable-next-line @typescript-eslint/ban-ts-comment` is required because `@typescript-eslint/ban-ts-comment` is enabled at error level and bans `@ts-nocheck` by default.
- Worktree had no `node_modules`. I first symlinked the main checkout's install (gitignored). The symlink is sufficient for `tsc`/`vitest`/`eslint`, but Next 16's default Turbopack build rejects a `node_modules` symlink that points outside the project root. I replaced it with a real copy (gitignored, 878 MB) so the default `npx next build` could run.
- No `.env.local` was added and no environment variables were set, so `next build` made no database or network calls; all pages built as static or dynamic without prerender data fetching.
- `.next/` build output and the `node_modules` copy are gitignored; no tracked change.

## Challenges to locked decisions
- none.

## Open questions
- The task says "today there are 7 lint errors outside src". I could not reproduce them: `npm run lint` reports **0 errors, 263 warnings** on this branch, and the main checkout does too. The earlier T-42 A5/A6 batches (merged before this worktree: `6e9e7db` and below) already cleared the `no-explicit-any` / `no-require-imports` errors A6 records. I did not change any lint rule or add a suppression to manufacture a pass. Confirm no further lint action is expected.
- The 25 type errors remain in the five files (8 + 1 + 2 + 5 + 9). They should be fixed when Phase 7 (PicklistV2, StatusChipPopover), Phase 8/9 (new-deck page and test, DeckChatTab) resume; remove the `@ts-nocheck` header at that time.
- The known somewhat-related data gap from A8 (commander theme search may return nothing until taxonomy theme data is seeded) is unchanged and outside this task.

## Verification
- `npm run typecheck` — exit 0 (0 errors). Before this task: 25 errors in the five files; now 0.
- `npm run lint` — exit 0; 0 errors, 263 warnings (unchanged from baseline; warnings allowed). Also checked `npx eslint scripts` (0 errors) and `npx eslint --no-ignore research/scripts` (0 errors).
- `npm test` — 130 test files passed | 4 skipped (134); **1522 tests passed | 40 skipped | 0 failed** (1562). No new failures.
- `npm run check` — ran all three steps in order and reached lint with exit 0 (so tests and typecheck passed).
- `npx next build` (default Turbopack, type checking on) — exit 0, output `✓ Compiled successfully`, `Running TypeScript ...`, `Finished TypeScript`. Also verified with `npx next build --webpack` — exit 0.
- Exclusion-mechanism evidence — `npx tsc --noEmit --listFilesOnly` lists all five files in the program; `tsc -p tsconfig.t42-experiment.json` with `PicklistV2.tsx` excluded still reported its 5 errors. Experiment config deleted afterwards.
- `git status --short` — 8 modified files (README.md, next.config.ts, package.json, the five source files); no new tracked files; no workflow, data, migration or network changes.
