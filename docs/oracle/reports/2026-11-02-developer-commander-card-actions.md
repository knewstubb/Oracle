# Developer report — commander card actions (2026-11-02)

Branch `commander-card-actions` (worktree `oracle_app-cmd-actions`, from main). Not merged.

## Owner summary (plain language)

- The deck header no longer lets you pick or change a commander. It still shows the commander name(s) as read-only text, e.g. "Commander · A + B".
- Cards in the Commander section have a new **Remove as commander** action on their menu. The card stays in the deck and goes back to its normal type section. Colour identity and legality are recalculated from whichever commanders remain.
- Cards in other sections get **Add as commander**, **Add as partner**, **Add as background** or **Add as companion** on their menu, but only when it is valid:
  - No commander set: only cards that can legally lead, and whose colours cover the rest of the deck.
  - Commander set: only cards that make a valid pairing (Partner, Partner with, Friends forever, Doctor's companion). A "Choose a Background" commander only offers Backgrounds.
  - Companion: only cards with the Companion ability.
  - Invalid cards are never offered.
- The companion slot only appears when a companion is already set or the deck has at least one card with the Companion ability. The Background slot only appears for a "Choose a Background" commander.
- Empty-slot "Add" chips remain, and only list valid cards.
- No data changes or migrations.

## Changed files

- New: `src/lib/commander-card-actions.ts`, `src/hooks/useCommanderActions.tsx`
- Modified: `src/lib/commander-eligibility.ts`, `src/app/api/commanders/eligible/route.ts` (new `role=lead`; the default is unchanged), `src/components/CardGroupSection.tsx` (kebab items), `src/components/CardsTab.tsx` (provider, grid hover actions, slots), `src/components/CommandZoneSlots.tsx`, `src/app/decks/[id]/page.tsx` (read-only chip)
- Tests: `src/lib/__tests__/commander-card-actions.test.ts`, `src/components/CommanderCardActions.test.tsx` (which cards get which action, valid and invalid cases, remove via PUT), `src/components/CommandZoneSlots.test.tsx` (updated)

## Decisions and assumptions to confirm

1. **Companion rule (ASSUMPTION).** The code and D-058 do not tie a companion to the commander. Companion detection only checks the Companion keyword and Commander legality, and the companion sits outside the 100 and colour identity. So I implemented the rule from the request: the slot shows when a companion is set or any card has the Companion ability, and "Add as companion" shows only on such cards. Real Commander rules also require the companion to fit the commander's colour identity, which D-058 does not. I did not implement that. Please confirm.
2. **Companion count rule (assumption).** A companion is saved to Sideboard, so moving a main-list card there lowers the main count. It is not offered if the deck is at or over target and the move would drop it below target. Decks already under target still get the offer.
3. **Removing a chooser.** The remaining commander is promoted to primary. A Background cannot lead alone, so if only a Background would remain it is cleared too, and removing the "Choose a Background" commander also unflags the Background. The companion is unaffected.
4. **Side effect.** A companion not already in the deck can no longer be added through the slot's "Search all cards" unless the deck has a Companion card, because the slot is hidden. This follows the owner rule.
5. Partner, Partner with, Friends forever and Doctor's companion all use the label "Add as partner".
6. A card can show both "Add as commander" and "Add as companion" when both are valid.
7. Second commanders and the companion are offered only from the main list, so the count stays at 100. A second commander only widens the colour union, so it can't break colour. For a first commander the server checks that its colours cover the rest of the main list.

## Challenges to locked decisions

None. The only tension is the real-rules companion colour identity point above versus D-058.

## Open questions

- Confirm the companion rule (1) and the count rule (2).
- Should commander actions also be on mobile and the right-click menu? They are not yet.

## Verification

- `npx vitest --run`: 214 files passed, 5 skipped. 2503 tests passed, 42 skipped.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors, 279 warnings (the existing kind).
- `npm run check` as one command stalled in the wrapper, so I ran its three parts separately. All passed.
- **Untested in a browser:** the kebab menus, the grid hover overlay and the header chip. Mobile is not covered: the kebab is hidden there, so no commander actions on mobile. All tests mock fetch.

## Process disclosures

- I edited four files with Python scripts rather than the edit tool: `eligible/route.ts`, `CardGroupSection.tsx`, `CardsTab.tsx` and `CommandZoneSlots.test.tsx`.
- `CommanderPicker` and `ChooseCommanderButton` are left in place because import review and a refresh test still use them. They are no longer in the header. The `?pickCommander=true` param from import flows is now ignored.
