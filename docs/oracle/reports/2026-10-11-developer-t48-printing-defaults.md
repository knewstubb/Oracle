# Report: T-48 printing defaults

Role: Developer
Status: DONE
Task as received:

> Task: T-48 (audit Batch 11, items P5 and P6). Files you own: src/app/api/decks/[id]/cards/route.ts, src/app/api/decks/[id]/cards/batch/route.ts, src/components/CardHoverPreview.tsx, src/lib/card-data.ts, src/lib/render-card-links.tsx, plus tests. Required behaviour: when a card is added to a deck by hand or in a batch, prefer a printing the owner already owns, and only fall back to the default printing by name when they own none; when a hover preview is shown for a card whose printing is known (a deck slot or an owned copy), show that exact printing instead of resolving the newest printing by name. Never use an oracle_id where a printing id is needed (D-003). Keep behaviour unchanged where no printing is known.

## Summary for the owner

Adding a card to a deck by hand, or letting the advisor add several, now asks for a printing you already own; if you own none, it still falls back to the usual default as before. Hovering a card that has a known printing (a deck slot or a card in your collection) shows that exact printing rather than a random newest one. Nothing about cards where no printing is known has changed.

## Changed files

- `src/lib/card-data.ts` — added `getOwnedPrintingsByNames` / `getOwnedPrintingForCard` (owned-printing preference), the pure `selectPreferredOwnedPrinting` picker, and `getPrintingById` (exact printing lookup). All return `scryfall_id` printing ids, never oracle ids (D-003).
- `src/app/api/decks/[id]/cards/route.ts` — manual add now stores a printing the owner owns first; the Scryfall exact-name default is only used when the owner owns none. The reference `type_line` is now read as a fallback so category derivation still works without the Scryfall call.
- `src/app/api/decks/[id]/cards/batch/route.ts` — batch add resolves owned printings for all additions in one lookup and only queries the default newest printing per card when nothing is owned.
- `src/components/CardHoverPreview.tsx` — `getScryfallId` and `useCardHoverPreviewByName` accept a known printing id and return it directly instead of resolving the newest printing by name.
- `src/lib/render-card-links.tsx` — `CardHoverLink` accepts an optional known `scryfallId`; `renderInlineContent` / `renderMessageContent` accept an optional `printingLookup` so a known printing flows to the hover preview.

Tests added/updated:
- `src/lib/__tests__/card-data-owned-printing.test.ts` (new) — picker rules, owned-vs-proxy, multi-printing choice, exact printing lookup.
- `src/app/api/decks/[id]/cards/route.test.ts` (new) — owned printing stored and no Scryfall call; default fallback; graceful failure.
- `src/app/api/decks/[id]/cards/batch/route.test.ts` (new) — owned printing per addition; default fallback; mixed additions.
- `src/components/CardHoverPreview.test.ts` (new) — known printing returned without a name lookup; name lookup still used when unknown.
- `src/lib/__tests__/render-card-links-printing.test.tsx` (new) — known printing reaches the hover hook; printing lookup threads through inline content.

No migration, backend route outside the named files, real API call or database write was made. `node_modules` was symlinked to the main folder to run the checks.

## New decisions made (need owner confirmation)

- None. The work follows D-003, D-038 and the T-46 audit. D-041 (deck slot remembers finish) belongs to T-49, not this batch.

## Assumptions

- "A printing the owner already owns" means an original (`is_proxy = false`) copy with a `printing_id`. A proxy's printing is a stand-in, so it is not treated as owning that printing. If the owner owns several printings, the most recently released one is chosen (ties broken on the printing id) so the result is stable.
- The preference is matched by the stored card name. Deck-first import/DFC name variants that differ from `user_cards.card_name` will simply fall through to the existing default; behaviour is unchanged in that case.
- Hover previews for deck slots (`CardGroupSection`) and owned copies (`PrintingListView`, `InstanceDetailPanel`) already receive an explicit printing id. The T-48 hover change is therefore (a) making hand-added slots store the owned printing so those previews show it, and (b) adding the known-printing path to the shared name-based hover helpers for callers that have one.
- `CardHoverLink` still validates the card by name for the commander/crown flag; when a known printing is supplied it overrides the image printing without changing that validation.

## Challenges to locked decisions

- None.

## Open questions

- None blocking. One optional follow-up for the Orchestrator: the pick list and status popover hover previews are currently no-ops because `useCardHoverPreview` does not return the `previewProps` those two `@ts-nocheck` files destructure (T-42 defects 10 and 11, Phase 7). This batch deliberately did not touch those files.

## Verification

- `NODE_DISABLE_COMPILE_CACHE=1 npm run check` — EXIT 0. Unit tests: 1549 passed, 40 skipped, 0 failed (135 files passed, 4 skipped). `tsc --noEmit`: 0 type errors. Lint: 0 errors, 263 pre-existing warnings.
- Focused run of the five new/changed test files — 27 passed, 0 failed.
- `git status --short` — only the five named source files changed plus the five new test files; no migration, data or lockfile change.
