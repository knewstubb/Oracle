# Report: card-roles-slice-2
Role: Developer
Status: DONE
Task as received: build slice 2 of CC-26 (card roles and deck jobs): "Universal roles stored and editable. Add and remove universal roles on a card in the window; 'Set by you'. Shared baseline plus personal changes." (brief section 9, row 2). Card window plus the data layer behind it. No database changes. Not in scope: Claude proposing roles, jobs, strategy points, health, Strategy tab, Picklist components.

## Summary for the owner
The card window's roles section is now called "Universal roles" and you can change it. Each role shows where it comes from: "Set by you", "Standard" (the shared list, which is empty for now) or "Worked out from card text" (today's guess). You can add a role from a list, remove one with the x ("You removed: Ramp. Restore" appears), and press Undo for 10 seconds after a change.
To test: open Murky Business, Rocco's Secret Sauce and Arti-facts cards (for example Sol Ring or Arcane Signet in Arti-facts). Each should first show its old roles marked "Worked out from card text". Add "Tutor" and check it says "Set by you" and the old role is still there. Remove a role, check "You removed", then Restore. Close and reopen the window to check the change stayed. Then put each card back how you found it (Restore, or x on roles you added), since these writes go to your real data.
Two decisions are yours (see Open questions): how the card-text guess and saved roles combine, and whether Undo stays.

## Changed files
- src/lib/card-window-stored-roles.ts — the 13 roles with spec names, source labels, the rule that combines saved roles with the text guess, what each x does, Undo action
- src/lib/card-window-stored-roles-server.ts — server calls to the database functions (_slot_oracle_id, get_effective_card_roles, owner_set_card_role), always with the signed-in user's id
- src/app/api/decks/[id]/cards/[cardId]/roles/route.ts — GET now also returns the stored roles; new PUT adds, removes or clears one role
- src/lib/card-window-roles.ts — lookup type gains the stored roles
- src/components/CardWindow.tsx — editable "Universal roles" section (chips with source label, x, Restore, Add role, save line with Undo, error and read-only states)
- src/lib/card-window-stored-roles.test.ts, src/app/api/decks/[id]/cards/[cardId]/roles/route.test.ts, src/components/CardWindow.test.tsx — tests (the existing window test was updated for the new heading and labels)

## New decisions made (need owner confirmation)
- Text-read roles are shown in the contract's names: Draw is "Card draw", Removal is "Targeted removal", Wipes is "Board wipe".
- The x on a "Worked out from card text" chip saves a "remove" for that role (the guess then stays hidden for you until Restore).
- Add role is a plain drop-down of roles not on the card (the spec says "a short list").

## Assumptions
- A card the database cannot match to a card identity (oracle id) is read-only with a message; nothing is saved for it.
- If saved roles cannot be read, the window says so and shows only the text guess, read-only (D-030: never an empty answer).
- Claude's proposed roles (slice 3) render as "Proposed by Claude" if they ever exist, but nothing writes them yet. Undo only replays your own value, not a Claude row.
- The 13-role list is mirrored in src; a test asserts it equals the contract's list.

## Challenges to locked decisions
- none

## Open questions
1. **How the card-text guess and saved roles combine (contract and spec are silent).** Built: a guessed role shows only when nothing saved says anything about that role. For example: Sol Ring is guessed as Ramp; you add Tutor, so the window shows Ramp (worked out from card text) and Tutor (set by you); if you remove Ramp, the guess is hidden. Once the shared list holds a role for a card, that role shows as "Standard" and the guess for the same role disappears. Alternative: hide all guesses as soon as a card has any saved role. Recommendation: keep what is built.
2. **Undo for your own role edits.** The spec (7.7) says every edit shows "Saved" and Undo for 10 seconds, and the contract says your edits are not in the Claude change log. Built to the spec: Undo replays the value the database returned. If you don't want it, remove the Undo button; nothing else depends on it.
3. Text reading cannot produce 9 of the 13 roles, so cards keep showing only the old four until the shared list is filled (slice 8).

## Verification
- npx vitest run (full) — 310 files passed, 6 skipped; 3818 passed, 46 skipped; 0 failures
- npx tsc --noEmit — only the 4 known AddToPicklist.test.tsx errors
- npx eslint on all touched files — 0 errors, 0 warnings
- No database object was applied or changed; no live calls were made (tests mock the database).
