# Report: rename-draft-to-brewing
Role: Developer
Status: DONE
Task as received: Rename the automatic deck status 'Draft' to 'Brewing' everywhere (tiles, Decks page group headers and saved choice, code type and values, connector, docs, tests). Statuses: Brewing (none sleeved, purple flask), Assembling (some sleeved), Playable (all sleeved, right size). Rule unchanged. No database changes.

## Summary for the owner
The first deck status is now called Brewing everywhere: deck tiles, the group-by-status headers, the pickers, Claude and the docs. The rule is the same (none of the deck's cards sleeved). The saved "group by status" choice keeps working, because it never stored the status words. One thing to decide: the word Brewing was already used in a few other places (see Open questions).

## Changed files
- src/lib/deck-readiness.ts, deck-status-label.ts, deck-list-data.ts, allocation-candidates.ts, supply-pool.ts, move-here.ts, import-destinations-list.ts, tool-registry.ts — status value 'draft' became 'brewing', label "Brewing"
- src/components/DeckTile.tsx, vocabulary/DeckStateBadge.tsx, MoveHereControl.tsx, connector/PendingCard.tsx — badge label, tooltip, accessible name
- src/styles/tokens.css — token --state-draft renamed --state-brewing
- src/app/page.tsx — group order and section headers
- src/app/api/allocation/valid-decks/route.ts, src/app/api/collection/instances/[oracleId]/route.ts — fallback status value
- src/app/settings/components/page.tsx — component gallery wording and sample status
- src/lib/connector/tools/index.ts — list_decks, get_deck and create_deck descriptions ("starts as Brewing")
- docs/oracle/contracts/claude-connector-slice-a.types.ts — status type 'Brewing' | 'Assembling' | 'Playable'
- docs/oracle/contracts/card-state-actions.md/.types.ts/.examples.ts, know-where-cards-are.md/.types.ts — status wording and values
- docs/oracle/specs/vocabulary.md (3.4, table, retired-words row), card-management-system-overview.md, deck-commander-selector.md, manabox-import.md — status wording
- docs/oracle/test-plan-2026-11-17.md (untracked in main, edited directly) — four mentions
- Tests: DeckTile.test, page.test, DeckStateBadge.test, deck-readiness.test, move-here.test, tools.test, deck-status-wording.test

The route files for list_decks and get_deck needed no edit: they take the label from the shared label table. The picker components (PicklistV2, DeckPickerPopover, InstanceDetailPanel, StatusChipPopover, CardLocator) and api/decks routes contained no 'draft' text; they pick up the new value through the shared types.

## New decisions made (need owner confirmation)
- Gallery page at /settings/components: its "Brewing" section already described this same purple flask state under the old word; kept the section, now says "Deck is Brewing".

## Assumptions
- Saved grouping: the browser stores only "status" or "none" (never a status word), and collapsed sections are kept in memory only. No migration needed; an existing test confirms the saved choice survives reload and refresh.
- Contract and spec files were updated where they name the automatic status. Decisions register not edited (read-only).

## Challenges to locked decisions
- D-002 — wording "Draft / Assembling / Playable" — change to "Brewing / Assembling / Playable".
- D-031 — "rather than using Built/Draft or Theorycrafted" — Draft here is the old import word, likely leave; Gene to judge.
- D-043 — "sort Playable, Assembling, Draft" — change to Brewing.
- D-059 — states list; check for the status wording and update if it names Draft.
- Not edited, Gene to decide: other contract files in docs/oracle/contracts that still say "Draft" only as a document status (for example "Status: draft for owner review") are unaffected on purpose.

## Open questions
Existing "Brewing" uses audited (all kept, none renamed):
- Old manual lifecycle "brewing / in_rotation" (stored in decks.status, the old unused column): src/lib/deck-status.ts, brew-v2-types.ts, StatusFilter, StatusControl, StatusBadge, StatusSectionDivider, the status route and its test. Vocabulary lists these as deprecated, not shown on screen. Left alone. The app still reads it in src/lib/auto-assign.ts (filters decks by status 'brewing') and the supply-pool tests use deckStatus 'brewing' as fixture data. No writes added.
- Onboarding import choice "Brew" with value 'brewing' (src/app/onboarding/page.tsx): means "import without sleeving". Left alone. Question: should this choice be renamed to avoid confusion with the Brewing status? After import without sleeving, the deck would in fact show as Brewing, so the meanings agree today.
- Brew activity wording ("Continue brewing", "Resume brewing", brew chat prompts, workbench prompt, new-deck message, hasBrew flag, brew sessions and pages): activity of building a deck, kept.
- DraftDeckTile and DraftSessionTile (show a "Brewing" badge, "Continue brewing", "Delete draft"): a tile for a deck still tied to a brew session. Not used by any page (only by its own test), and vocabulary.md already lists them for deletion. It is the same idea as the status in meaning but uses the old `decks.status` string 'draft' in canDeleteDeck. Not renamed. Question: delete these two unused tiles?
- Possible confusion: a deck with an open brew session can show "Brewing" status while the Brew pages call the same deck a "brew". These agree in practice, but a deck with cards fully sleeved and an open brew session reads Playable, not Brewing.

Intentional remaining 'draft' hits: supabase/drafts and draft migration notes ("draft M2", "DRAFT migration"), brew save mode 'draft' (api/brew/save, new-deck), saveDraft in brew-v2-session, text-edit draft state in CardGroupSection, "Strix draft.csv" fixtures, format-config "draft environment" (card draft format), StatusFilter test that rejects old URL value 'draft', edit-tools test (supabase/drafts), DraftDeckTile and DraftSessionTile, document-status lines ("Status: Draft for owner review"), a not-match test for the old word.

## Verification
- npm test (full) — 3 failures, all known: ImportIntentFlow (env flag), connector description test (registry-and-isolation), copy-availability card-status check (also fails on main before my change; not listed in your known set, flagging).
- npm run typecheck — 4 errors in AddToPicklist.test.tsx, identical count on main.
- npm run lint — 2 errors (storage/missing link, list-decks prefer-const) in files I did not change.
- Three-word tests: DeckTile.test (badge label and tooltip), page.test (group headers), tools.test (connector output), deck-status-wording.test (descriptions say Brewing, not Draft).
- Rebased onto main twice (main moved; one conflict in DeckTile.tsx resolved), re-ran DeckTile and page tests (42 pass), fast-forwarded the main checkout. Nothing pushed. Worktree left at ../oracle_app_brewing.
