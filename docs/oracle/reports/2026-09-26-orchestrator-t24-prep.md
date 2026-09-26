# Report: T-24 prep — TypeScript baseline, contract Q1/Q2, Scryfall reference
Role: Orchestrator
Status: DONE
Task as received: "Three items before Backend starts T-24: 1) fix the TypeScript regression on main, 2) close contract Q1/Q2 and leave Q3/Q4 open, 3) record the Scryfall printing/finish reference."

## Changed files
- `src/lib/provider-adapter.ts` — made `sendMessageStreaming` optional on the `ProviderAdapter` interface. The existing tool executor already guards with `if (adapter.sendMessageStreaming)`, so adapters that do not implement streaming (Anthropic, Gemini) no longer fail the type check.
- `src/lib/debrief-types.ts` — new shared type module exporting `ChatMessage`, `CommanderSummaryContext`, and `Recommendation`. Fixes the broken `@/lib/debrief-types` imports in `brew-autosave-serializers.ts`, `useBrewAutosave.ts`, `useDeckChat.ts`, `ChatPanel.tsx`, `BrewChatView.tsx`, `OracleChat.tsx`, `RecommendationCard.tsx`, and `src/types/brew.ts`.
- `src/lib/upgrade-candidates.test.ts` — aligned test fixtures with the existing `OwnershipStatus` type (`'original' | 'proxy' | null`). Unowned add cards now use `null` instead of the unsupported string `'not_owned'`.
- `src/lib/rating-engine.property.test.ts` — removed the unsupported second argument from `fast-check`'s `.map()` callback at line 357.
- `src/components/OwnershipBadge.tsx` — added `'not_owned'` as a valid status with the matching glyph/label/colours expected by `OwnershipBadge.test.tsx`.
- `tsconfig.json` — excluded `supabase/reconciliation/pre-ledger/functions` from the project-wide `tsc` run. Those files are Deno-only and must be type-checked by Deno/Supabase CLI, not by the Next.js/tsconfig compiler.
- `docs/oracle/contracts/import-reconciliation-redesign.md` —
  - Updated §13 to mark Q1 and Q2 closed and Q3 and Q4 still open.
  - Added §15, the Scryfall printing/finish reference, and linked the finish/condition debt items to it.

## New decisions made (need owner confirmation)
- None. Q1 and Q2 were closed using the clarifications supplied; Q3 and Q4 remain open pending an explicit owner decision.

## Assumptions
- The 19 errors listed in the handoff were the intended scope for the TypeScript fix.
- The remaining `tsc` errors are out of scope for this task and require a separate decision because they touch many unrelated files.

## Challenges to locked decisions
- None.

## Open questions
- `docs/oracle/contracts/import-reconciliation-redesign.md` §13 still shows Q3 and Q4 as open, as requested.
- A clean, full `npx tsc --noEmit` baseline is not yet achieved. See Verification below.

## Verification
- `npx tsc --noEmit` — the 19 errors listed in the handoff are gone (confirmed by grepping for `sendMessageStreaming`, `debrief-types`, `upgrade-candidates.test`, `rating-engine.property`, `ck-price-refresh`, and `scryfall-sync`).
- `npx tsc --noEmit` — fresh run still reports **252 errors**. I verified the pre-merge commit `b2011d8` also reports **252 errors** in a clean worktree, so the 19 errors were a subset surfaced by an incremental TypeScript check, not a regression introduced only on main.
- `npx vitest --run src/lib/upgrade-candidates.test.ts src/lib/rating-engine.property.test.ts src/lib/__tests__/brew-autosave-serializers.test.ts` — passed.
- `npx vitest --run src/components/OwnershipBadge.test.tsx` — 47/50 passed. The 3 failures are pre-existing (label text mismatch and `text-xs` class expectation) and are not caused by the `not_owned` change.
- `next build` — still succeeds with "Skipping validation of types" because `next.config.ts` has `typescript.ignoreBuildErrors: true`.

## Isolation findings
- **Deno edge functions:** yes, they need their own exclusion from the root `tsconfig.json`. They import `https://esm.sh/...` and `https://deno.land/x/...` modules and use the `Deno` global, which the Node/Next.js compiler cannot resolve.
- **Provider-adapter / debrief-types breakage:** this is separate in-flight work (the brew/debrief chat surface) that was never fully type-aligned. The T-22 merge did not touch these files; the errors were simply surfaced by the incremental check around the merge.

## Recommendation before Backend starts T-24
Backend can build T-24 routes safely: the contract is stable, the reconciliation UI is merged, and the Deno edge functions are no longer polluting the TypeScript baseline. However, the project currently relies on `next.config.ts` ignoring build errors, and a full `tsc --noEmit` pass still needs a dedicated cleanup sprint. Backend should run `npx tsc --noEmit --noEmitOnError` only for the files it touches, or the team should schedule a separate task to make the whole repo type-clean.
