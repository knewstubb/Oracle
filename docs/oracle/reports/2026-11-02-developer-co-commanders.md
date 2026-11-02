# Report: co-commanders
Role: Developer
Status: DONE
Task as received: Owner feedback (2026-11-02): "I don't think the way we have built partners is correct. We are treating them like a primary commander and a secondary partner but they are both commanders and both contribute to the colours." Audit and fix so two commanders (partner, partner-with, friends forever, doctor's companion, background) are EQUAL co-commanders everywhere: colour identity = union of all commanders (not companion), legality, wording/UI, stored data kept as is, assistant uses both. Worktree `co-commanders` from main; no migrations; mock-only tests; `npm run check`; no merge.

## Summary for the owner
Both commanders now count equally. The deck's colours are always the colours of both commanders together (never the companion), so a partner pair no longer gets colour errors, and the assistant's "what fits" lists use both. The header shows "Commander · A + B", the Commander section shows both as ordinary commander cards, and the empty slot for the second is named by its kind (Partner, Background…) only while it is empty. Nothing about "primary" or "second" commander is left in text you see. Not tried in a browser yet.

## Findings (audit)
- [Confirmed: src/app/api/decks/[id]/route.ts] PATCH (choosing a commander in the header) wrote the deck colours from the one chosen commander, overwriting the union that the command-zone route had saved. Fixed: it no longer writes the single-commander colours; after flags update it recomputes from all commanders.
- [Confirmed: src/app/api/decks/[id]/command-zone/route.ts] Used only the two ids in the request. Now uses the shared all-commanders function.
- [Confirmed: src/lib/manabox-deck-import.ts] Import review with two commanders never wrote their colours (deck was created with the file's colour text). Now stores both commanders' colours (best effort).
- [Confirmed: src/lib/owned-copy-lookup.ts] `loadCommanderColours` (used by the assistant's owned-copy check and spare-copy browse) took every `is_commander` row, so it could include a companion flagged that way, and only used commander_name when nothing was flagged. Now: all commanders, never the companion, plus the commander_name fallback.
- [Confirmed: src/lib/spare-copy-browse.ts] Trusted the stored deck colours first, so a stale single-commander value hid partner colours. Now commanders win; stored value is only the fallback. (Test updated to say so.)
- [Confirmed: src/app/api/decks/[id]/legality/route.ts] Read only the stored value. I reimplemented in this branch (did not rely on the uncommitted change in the main checkout): colours are the union of the commander cards' own card data, stored value only when a commander's card data is missing. Check carries no "too many commanders" rule today, so nothing to remove [Confirmed: src/lib/deck-legality.ts]; singleton and the colour check already skip commanders and the companion.
- [Confirmed: src/app/api/allocation/valid-decks/route.ts, .../card-actions/[cardName]/route.ts, src/app/api/ai/mana-analysis/route.ts] Split stored colours on commas, but PATCH/command-zone store "WBR" with no commas, so a multi-colour deck read as one unknown colour and valid-deck lists and the mana colour list were wrong. Now read through `parseColourLetters` (handles both forms). Not asked for, but it is the same union data reaching users.
- [Confirmed: src/app/api/decks/[id]/chat/route.ts, src/lib/deck-chat-prompt.ts, src/app/api/oracle/chat/route.ts, src/lib/oracle-prompt.ts, src/lib/deck-chat-facts.ts] Assistant knew one commander name (and, in the sidebar chat, one commander's colours). Now both are named as commanders, with their combined colours; slot-count text says "commanders, which count equally".
- [Confirmed: src/app/api/ai/recommend/route.ts] Suggestions were built around one commander. Now `buildAround` gets all commander names. `suggestCuts` is an external tool that takes one name, so it still gets the first.
- [Confirmed: src/lib/commander-card-flag.ts] `findCommanderCards` only used commander_name when no row was flagged. A deck with only the partner flagged showed one commander. Now the named card is added whenever it is not already among the commanders (old decks by name work).

## Changed files
- src/lib/deck-colour-identity.ts — new `loadDeckCommanders` and `syncDeckColourIdentity` (union of all commanders, never companion)
- src/app/api/decks/[id]/route.ts — PATCH: stop writing single-commander colours; sync after flags
- src/app/api/decks/[id]/command-zone/route.ts — use sync
- src/app/api/decks/[id]/legality/route.ts — colours from all commanders (fallback: stored)
- src/lib/commander-card-flag.ts — commander_name fallback adds to flagged commanders
- src/lib/owned-copy-lookup.ts, src/lib/spare-copy-browse.ts — all-commander colours; commanders before stored value
- src/lib/import-command-zone-save.ts, src/lib/manabox-deck-import.ts — store both commanders' colours on import; wording
- src/app/api/allocation/valid-decks/route.ts, src/app/api/decks/[id]/card-actions/[cardName]/route.ts, src/app/api/ai/mana-analysis/route.ts — read colours without comma assumption
- src/app/api/ai/recommend/route.ts — all commanders
- src/app/api/decks/[id]/chat/route.ts, src/lib/deck-chat-prompt.ts, src/app/api/oracle/chat/route.ts, src/lib/oracle-prompt.ts, src/lib/deck-chat-facts.ts — assistant describes both
- src/lib/command-zone.ts — `commanderChipText`
- src/components/manabox-import/CommanderPicker.tsx, src/app/decks/[id]/page.tsx — header chip "Commander · A + B"
- src/components/CommandZoneSlots.tsx — filled chip shows the card name (no "Second commander" label); empty chip named by kind; remove/aria/toast wording
- src/components/manabox-import/ReviewCommanderSelect.tsx, src/lib/command-zone-request.ts, src/app/api/commanders/eligible/route.ts — "second commander" wording removed
- Tests: src/lib/__tests__/co-commanders.test.ts (new), src/test/fake-supabase.ts (new in-memory mock), route.patch-commander.test.ts, spare-copy-browse.test.ts, CommandZoneSlots.test.tsx, ReviewCommanderSelect.slots.test.tsx, import-command-zone-save.test.ts (updated)

## Stored data (no migration)
Unchanged: the commander keeps `is_commander = true` with no role; the other commander is `is_commander = true` with `command_zone_role` partner/background; the companion has role companion. Behaviour is symmetric on top: every reader and writer above treats all `is_commander` non-companion rows (plus the commander_name card) the same. Internal names such as `primaryCardId` and `findPrimaryRow` remain in code and in the API body (no owner-visible text).

## UI changes
- Header chip: "Commander · A + B" (or one name). Choosing there still replaces the commander named on the deck (`commander_name`).
- Commander section: both commanders are already shown as equal cards (via `findCommanderCards`); now robust to old decks.
- Slot chip for the other commander: empty → "No partner · Add" (kind from the commander's rules; "Partner or Background" if unknown); filled → just the card's name. Clicking it lets the owner replace or "Remove <name>".
- Import review slot is labelled "Partner or Background" (kind is not known there).

## New decisions made (need owner confirmation)
- Fixed the comma-versus-no-comma colour reading in three other places (see findings).
- Spare-copy browse now prefers commander-derived colours over the stored value.

## Assumptions
- The five "kinds" are all stored as role partner/background (as the existing `commander-pairing` does); labels come from `SECOND_SLOT_LABEL`.
- The legality route in the owner's main checkout was not consulted.

## Challenges to locked decisions
- none (D-058 followed)

## Open questions
- Removing the commander named in `commander_name` while a partner exists, and replacing the first commander through the slot chip, are not changed (the slot chip covers the other commander; the header picker covers the named one). Symmetric replace of either from one control would be a UI change; say if wanted.
- Deck list tool (`list_user_decks`) and the Workbench tab still show only the named commander's name; colours are correct.

## Verification
- `npm run check` — pass: 212 test files passed (5 skipped), typecheck clean, lint 0 errors (279 existing warnings).
- Partner-pair colour union is tested (mock-only) across: command-zone PUT, PATCH re-pick/replace, import writer, legality route (stale stored value, off-colour card still flagged), assistant colour lookup (companion ignored), commander_name fallback, header chip, prompt wording.
- Browser behaviour (header chip, slot chip, Commander section) is UNTESTED in a browser; only component tests ran.
