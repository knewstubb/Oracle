# Report: in-deck-planned-wording
Role: Developer
Status: PARTIAL
Task as received: Owner approved (2026-11-17, chat 'Lets do this') the replacement words: wherever the app SHOWS 'Sleeved' / 'Unsleeved' (and variants), use 'In deck' / 'Planned'. Change visible UI text, labels, toasts, aria labels, and owner-facing docs/specs only. No database or code identifier renames. Do not edit decisions.md. Ambiguous usage: stop PARTIAL with a plain question.

## Summary for the owner
Everywhere the app showed "Sleeved" or "Unsleeved" as a state (deck badges, import screens, reconcile screens, generic basic lands, Claude connector sentences, "87/100 in deck"), it now says "In deck" or "Planned". The specs and contracts were updated the same way. One question is open: the action word "Sleeve" and a few sentences that describe an event.

## Changed files
- src/components (reconciliation, reconcile, PicklistV2, CardGroupSection, manabox-import, vocabulary badges, connector PendingCard and MovedSlotNote) — visible words, aria labels, toasts
- src/lib (import-intent, import-copies, import-result, manabox-deck-import, connector change-sentences and tools/index) — owner-visible strings
- Tests updated to the new words: StateButtonGroup, SlotBadge, DeckStateBadge, GenericLine, ImportRound10, ImportRowEditing, ImportIntentReview, CardGroupSection.moved, connector small and RecentChangesTab, import-intent, generic-basics
- docs/oracle/specs, contracts and briefs (vocabulary, know-where-cards-are spec and contract, claude-connector, import specs, overview, reconcile-original-shortages, deck-basics, import briefs) — wording
- docs/oracle/status.md — WORDS-01 line

## New decisions made (need owner confirmation)
- For Gene to record in decisions.md: D-025 / D-031 / D-043 / D-002 / D-033 and the locked vocabulary now use **In deck** / **Planned** (owner, 2026-11-17). Picklist words: Q7 / Q10 of the Picklist work resolved as In deck / Planned.
- Plural forms: "N sleeved" became "N in deck"; "N unsleeved" became "N planned"; "kept slot(s) unsleeved" became "kept slot(s) planned".

## Assumptions
- Only the STATE sense was changed. Verb uses were left: Sleeve button/action, "Sleeved Sol Ring" success toast, "Sleeve failed", "Couldn't change sleeving", "was sleeved with a copy" (connector change log and undo refusal), "Needs Sleeve" on the internal settings components page, onboarding text "Sleeves real copies" / "nothing sleeved".
- AI-facing text (chat facts, tool registry descriptions, copy_status value) left as is; the value names are identifiers.
- Phrases like "already sleeved" became "already in decks"/"in the deck".

## Challenges to locked decisions
- D-025, D-031, D-043, D-033 contain the old words; they need Gene's amendment (not edited here).

## Open questions
- Should the action "Sleeve" (button, toasts, "Sleeve failed", "was sleeved with a copy", and "Your cards and sleeves haven't changed") also be reworded? The Picklist spec already plans "Placed it". Suggested: "Put in deck" for the action. Nothing changed until the owner answers.

## Verification
- npx tsc --noEmit — only pre-existing errors in AddToPicklist.test.tsx
- npx eslint on changed files — no new problems (one pre-existing link error in PicklistV2)
- npx vitest run — 3425 passed; 2 failures (basic-lands-import, import-destination) fail identically without my changes
- Tests touching changed words all pass after update
