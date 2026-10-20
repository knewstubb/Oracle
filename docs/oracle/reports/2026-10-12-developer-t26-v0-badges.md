# Report: T-26 batch V0 — shared badges, tokens and skeletons

Role: Developer  
Status: DONE  
Task as received: Add the colour aliases to `src/styles/tokens.css` (aliases only, no new colours) and build the shared building blocks `SlotBadge`, `DeckStateBadge`, `FinishTag`, `PriceText`, `CheckNotice` and shaped skeletons as new files with unit tests, exactly per the vocabulary table (words, icons, tokens). Do not wire them into existing screens; other batches do that. Run `NODE_DISABLE_COMPILE_CACHE=1 npm run check` before finishing; it must pass. Write your report to `docs/oracle/reports/2026-10-12-developer-t26-v0-badges.md`.

## Summary for the owner

This batch creates the shared badge and loading-skeleton kit that every screen will use in later batches, so nothing visible changes yet. The shared words, colours and icons from the vocabulary spec are now encoded as reusable components, and every component has unit tests.

## Changed files

- `src/styles/tokens.css` — added vocabulary state aliases (e.g. `--state-unavailable: var(--signal-warning)`) and 15% tint aliases for loud badge fills, all derived from existing tokens.
- `src/components/vocabulary/SlotBadge.tsx` + `.test.tsx` — badge for card copy/placement/availability states: Original, Proxy, Basic, Available, Alt available, Proxy available, Unavailable, Unowned, Checking…, Couldn't check.
- `src/components/vocabulary/DeckStateBadge.tsx` + `.test.tsx` — badge for deck readiness: Draft, Assembling, Playable, Checking…, Couldn't check.
- `src/components/vocabulary/FinishTag.tsx` + `.test.tsx` — Nonfoil / Foil / Etched tag.
- `src/components/vocabulary/PriceText.tsx` + `.test.tsx` — "$12.40", "est. $12.40", "Price unknown", dense "—".
- `src/components/vocabulary/CheckNotice.tsx` + `.test.tsx` — section-level "Couldn't check… Try again" and "Last checked 10:42 · Refresh" notices.
- `src/components/vocabulary/skeletons.tsx` + `.test.tsx` — `DeckTileSkeleton`, `CardRowSkeleton`, `BadgeSkeleton`.
- `src/components/vocabulary/MaterialSymbol.tsx` — shared Material Symbol icon helper.
- `src/components/vocabulary/LoadingSpinner.tsx` — scoped spinner helper.
- `src/components/vocabulary/index.ts` — public exports for the new kit.

## New decisions made (need owner confirmation)

- None. All words, icons, colours and shapes follow `docs/oracle/specs/vocabulary.md` (D-043).

## Assumptions

- 15% opacity tints of existing status colours (e.g. `rgba(74, 147, 160, 0.15)` for proxy) count as colour aliases, not new colours, because they reuse the existing hex values.
- `Playable` shows a proxy count only when proxies are used; otherwise it shows just the word "Playable".
- `DeckStateBadge` accepts `required: null` for Casual decks and omits the "/target" count.

## Challenges to locked decisions

- None.

## Open questions

- None.

## Verification

- `NODE_DISABLE_COMPILE_CACHE=1 npm run check` — passed.
  - Tests: 148 files passed, 1650 tests passed, 40 skipped.
  - TypeScript: `tsc --noEmit` passed with no errors.
  - Lint: 262 pre-existing warnings, 0 errors.
- `npm test -- src/components/vocabulary/` — 36/36 tests passed.
