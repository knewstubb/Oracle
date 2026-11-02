# Report: uwio-slice-a (Use what I own, slice a)
Role: Developer
Status: DONE (live chat and save path untested, see Verification)
Task as received: Build slice (a) of the approved brief docs/oracle/briefs/use-what-i-own.md, using the audit docs/oracle/reports/2026-11-02-architect-use-what-i-own-audit.md and contract docs/oracle/contracts/advisor-tools.md. Work only in a new git worktree (`../oracle_app-uwio-a`, branch `uwio-slice-a` from main). (1) Deck chat: add_cards_to_deck / remove_cards_from_deck OFF by default behind one named flag, edit ability kept; prompt never claims it changed the deck. (2) Deck chat sees which cards are proxies and which slots are gaps, reusing existing read-only helpers; unknown never shown as zero or fact. (3) No migrations, data changes, new screens or import code. (4) Unit tests, no real data writes. (5) `npm run check`, commits with Co-authored-by trailer. (6) This report. Do not merge; do not start slice (b).

## Summary for the owner
The deck chat now only suggests: it can no longer add or remove cards, and it is told never to say it changed your deck. The ability is kept and can be switched back on with one setting. The chat also now knows, for the deck you are viewing, which cards are proxies, which are real copies, which list cards have no physical copy assigned yet, and how many slots are empty out of 100. Where it cannot tell, it is told to say so rather than guess. I have not tried it in the live app; that is still to be done on the test account.

## Changed files
- src/lib/tool-registry.ts — the one setting `ORACLE_DECK_CHAT_EDIT_TOOLS` (default off, only the exact value `true` turns it on); deck chat tool list drops add/remove/update-card tools unless on
- src/lib/tool-executor.ts — in the deck chat, a gated tool the model names anyway is refused (returns "not available, nothing was changed")
- src/app/api/decks/[id]/chat/route.ts — passes the deck-chat context, loads proxy/gap facts, uses the moved prompt
- src/lib/deck-chat-prompt.ts — prompt moved out of the route (route files cannot export extras); adds suggest-only rules and the facts block
- src/lib/deck-chat-facts.ts — read-only proxy/gap facts builder, loader and prompt text
- src/lib/deck-chat-tools.test.ts, src/lib/deck-chat-facts.test.ts — 17 new tests (mock client only, no real database)

## New decisions made (need owner confirmation)
- The setting is an environment variable (`ORACLE_DECK_CHAT_EDIT_TOOLS=true` to turn editing back on), not an in-app toggle (no new screens allowed).
- `update_deck_card` is gated together with add/remove (audit slice a asked for it; it is in the same tool group).

## Assumptions
- Proxy or real = the sleeved copy's `is_proxy`, via `deck_cards.copy_id` (same join as the pick list). [Confirmed: src/app/api/decks/[id]/picklist/route.ts]
- Generic basic land = basic land name with no printing; counts as sleeved, never a gap (D-032). Maybeboard = category contains "Maybeboard", not counted (D-005). Both mirror existing code. [Confirmed: src/lib/card-status.ts, src/lib/deck-cards-diff.ts]
- "Empty slots" = 100 minus main-list count, Commander only (null/default deck type counts as Commander). Other formats: size stated as unknown.
- A row with quantity above 1 and one copy is treated as one entry for proxy/real; per-copy split is not known.
- Not done from audit slice (a), as out of the stated scope: commander colour identity and legality supplied by the server, removing `deck_context` from the deck chat, the Upgrade "Discuss" dead link.

## Challenges to locked decisions
- none (D-034 stays; this narrows to suggest-only as the brief says).

## Open questions
- Where should the setting live long term (environment only, or a per-user preference)? Not needed for this slice.
- When edit tools are switched on, the route still only forwards status events, so nothing is actually applied (as audited). Applying needs the D-034 undo first.

## Verification
- `npx vitest --run src/lib/deck-chat` — 17 passed (gate default off, switchable, dispatch refusal, other contexts unchanged; proxies/gaps/unknown/maybeboard/generic lands/failed lookup).
- `npm run check` — tests: 154 files passed, 1718 tests passed (40 skipped, existing). Lint: 0 errors (265 existing warnings). Typecheck: 2 errors, both in `docs/oracle/contracts/advisor-tools.*.ts` importing `./card-state-actions.types.ts`, which does not exist on main. Not caused by this work; left alone. My one type error in the chat route was fixed.
- UNTESTED: the live deck chat (model replies, whether it really stops claiming edits, tool loop on a real model) and the real database join for proxy flags. The loader is only tested against a mock. Nothing here writes data, so no save path is touched. Please try it on the test account.
- Branch `uwio-slice-a`, not merged. Note: `npm ci` was run inside the new worktree only.
