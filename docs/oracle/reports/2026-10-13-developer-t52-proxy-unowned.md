# Report: T-52 — Add proxy for an unowned card

Role: Developer
Status: DONE
Task as received: T-52 (docs/oracle/status.md). Fix: Add proxy is greyed out for a card you do not own (owner checklist C-01, C-02). The card lookup only finds cards already in the collection. Make the add-proxy path work for a card with no user_cards row yet, without a migration. Run `NODE_DISABLE_COMPILE_CACHE=1 npm run check` in the worktree. Write report in standard format. Do not merge.

## Summary for the owner

The Add proxy button now works for cards you have never added to your collection. When you open a deck slot that is Unowned, the popover still says "No copies in your collection", but the Add proxy button is active. Clicking it creates the card identity in your collection and sleeves a proxy into that deck slot in one go.

No migration was needed. The existing bulk proxy function already knows how to create a missing card identity row, so the single-proxy route now uses it for the unowned case.

## Changed files

- `src/app/api/decks/[id]/card-actions/[cardName]/route.ts` — now returns the card's `oracleId` even when you do not own the card, so the popover knows a proxy can be added. Falls back to `ref_printings` for colour identity when there is no `user_cards` row.
- `src/app/api/allocation/add-proxy/route.ts` — when no `cardId` is supplied, looks up the deck slot and calls `add_proxies_to_slots`, which creates the `user_cards` identity row if it is missing and sleeves the proxy. Then reads the new `copy_id` back from the slot and returns it.
- `src/components/StatusChipPopover.tsx` — enables the Add proxy button when either `cardDefinitionId` or `oracleId` is present. For unowned cards it sends only `deckCardsId`, letting the route resolve the identity from the trusted slot.
- `src/lib/identity-resolver.ts` — added `resolveOracleIdFromCardName`, a small helper that resolves a card name to an `oracle_id` via `ref_printings`, with the standard double-faced card front-face fallback.
- `src/lib/identity-resolver.test.ts` — unit tests for the new helper.
- `src/app/api/decks/[id]/card-actions/[cardName]/route.test.ts` — new test file: verifies the route returns `oracleId` for unowned cards (would fail before).
- `src/app/api/allocation/add-proxy/route.test.ts` — added tests for the no-`cardId` unowned path, including slot lookup, `add_proxies_to_slots` call, copy-id read-back, and error mapping.

## New decisions made (need owner confirmation)

None.

## Assumptions

- The existing `add_proxies_to_slots` database function is already deployed and behaves as written in migration `20261011120000_proxy_requested_printing_finish.sql`. It creates a `user_cards` row when missing, so no new migration is required.
- For unowned cards, the route derives the card identity from the deck slot (`deck_cards.card_name` / `deck_cards.scryfall_id`) rather than trusting an `oracleId` sent by the client. This avoids changing the API contract type.
- If a proxy is created but the subsequent read-back of `deck_cards.copy_id` fails, the route returns 500. The proxy itself is still committed by the RPC.

## Challenges to locked decisions

None.

## Open questions

None.

## Verification

- `NODE_DISABLE_COMPILE_CACHE=1 npm run check` — completed. Tests, type check, and lint all pass.
  - `npm test`: 1,627 passed, 40 skipped. The 22 new tests added by this fix are included in that total.
  - `npm run typecheck`: `tsc --noEmit` passes with no errors.
  - `npm run lint`: 0 errors, 261 warnings (all pre-existing; none introduced by this change).
- Focused tests for the changed files:
  - `src/app/api/allocation/add-proxy/route.test.ts`: 14 passed
  - `src/app/api/decks/[id]/card-actions/[cardName]/route.test.ts`: 5 passed
  - `src/lib/identity-resolver.test.ts`: 45 passed
- No database writes were performed. All Supabase access in this change is through existing RPCs and read queries; no migration was created or applied.

## Example request/response

GET `/api/decks/1/card-actions/Sol%20Ring` (user does not own Sol Ring):

```json
{
  "status": "unowned",
  "cardName": "Sol Ring",
  "cardDefinitionId": null,
  "oracleId": "oracle-sol-ring",
  "availableCopies": [],
  "holders": [],
  "validDecks": []
}
```

POST `/api/allocation/add-proxy` for the same unowned slot:

```json
// Request
{ "deckCardsId": 10 }

// Response
{ "success": true, "copyId": 99, "physicalCopyId": 99 }
```
