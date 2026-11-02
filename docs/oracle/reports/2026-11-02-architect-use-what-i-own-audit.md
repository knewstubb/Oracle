# Report: use-what-i-own Gate 2 audit
Role: Architect
Status: DONE
Task as received: Gate 2 audit (read-only, no code or data changes) for the approved brief docs/oracle/briefs/use-what-i-own.md. Read it and docs/oracle/process.md first. Answer, tagging claims [Confirmed: path] or [Approximate]: (1) What the existing deck chat (src/app/api/decks/[id]/chat, src/lib/tool-registry.ts, tool-executor, brew-tool-prompt) can see today about the deck's proxies, gaps, the owner's spare (in no deck) real copies, copies held by other decks, and unowned cards. (2) What is missing for scenarios S1-S4 and the three groups Spare / In another deck (with warning) / Buy (Scryfall estimate, D-035), suggest-only. (3) Can the data model store 'physically in Korvold, claimed by Rocco as a plan' without a change? Check D-021/D-027/D-032/D-037 and existing planned/allocation structures. If a migration would be needed, describe it in plain language only and do not draft or apply it. (4) Locked decisions touched or in conflict. (5) Half-built or dead code in the AI area to reuse or delete. (6) Reuse of docs/oracle/contracts advisor contract (T-15, T-36). (7) Proposed build slices. Write the report to docs/oracle/reports/2026-11-02-architect-use-what-i-own-audit.md in the standard report format; the owner summary must be plain language, no code or paths.

## Summary for the owner
The deck chat cannot do what you want yet. It does not know which cards in a deck are proxies, it counts only real copies and cannot tell a spare one from one sitting in another deck, and it has no price for cards you don't own. Everything needed is already stored, so nothing about how data is saved has to change: a card "physically in Korvold but wanted by Rocco" is simply a card in Rocco's list with no copy sleeved into it. One thing to know: the chat as built today is also given tools to add and remove cards, so the first step is to switch those off to keep it suggest-only. Nothing needs your approval yet.

## 1. What the deck chat sees today

How it works: the deck chat route loads the deck, puts the card names and categories into the prompt, then runs the shared tool loop with every registered tool. [Confirmed: src/app/api/decks/[id]/chat/route.ts]

| Question | Today | Evidence |
|---|---|---|
| Deck's proxies | **Blind.** The prompt gets only name, category, quantity. `get_deck_cards` returns name, category, mana cost, type, price; no copy, no proxy flag. | [Confirmed: route.ts; src/lib/tool-registry.ts get_deck_cards] |
| Deck's gaps / count | **Partial.** The prompt shows a card count and list. "Gap" (fewer than 100, or slots with no real copy) is not computed. The count is the stored count, not derived from slots. | [Confirmed: route.ts] |
| Owner's spare real copies | **Wrong or blind.** `collection_lookup` / `search_owned_cards` count only `is_proxy = false` copies per card name, but do not exclude copies already sleeved into decks, so "owned" does not mean "spare". Finish and set are hard-coded (`foil:false`, `set_code:null`). | [Confirmed: src/lib/card-repository.ts getOwnedCards, getCardsByColourIdentity] |
| Copies held by other decks | **Weak.** `getDeckAllocations` lists every deck that has a row for the card name (including planned slots, maybeboard and proxies) and hard-codes the status as `original`. It does not say whether that deck physically holds a copy. | [Confirmed: src/lib/card-repository.ts getDeckAllocations] |
| Unowned cards | `collection_lookup` returns `not_owned`. Reliable only for exact names, with a loose case-insensitive fallback. No price for unowned cards (`get_deck_cards` prices only cards already in the deck). | [Confirmed: tool-registry.ts collection_lookup; card-repository.ts] |
| Colour-identity filter on owned cards | Exists (`colour_identity` option). Commander colours are not supplied to the chat; the model has to supply them. | [Confirmed: tool-registry.ts; route.ts selects no colour identity] |

Other findings that affect this feature:
- **The deck chat can already propose writes.** The route does not pass a context type, so all tools (including `add_cards_to_deck`, `remove_cards_from_deck`) are offered. [Confirmed: route.ts runToolLoop call; tool-registry.ts getToolDefinitionsForContext]. Those tools only return the text "Added N cards…" and the deck chat route forwards only status events, so nothing is actually changed, but the model is told it succeeded and may tell the owner so. This breaks "suggest only" and "never silently lose or fake a swap". [Confirmed: tool-registry.ts add_cards_to_deck; route.ts onToolEvent forwards only tool_status]
- **The prompt tells the model to check ownership but the deck chat uses a different prompt.** The tool prompt says "MANDATORY: call collection_lookup before suggesting cards" and speaks of "needing a proxy" when a card is in another deck. This is advice-by-prose, not data. [Confirmed: src/lib/brew-tool-prompt.ts]
- **`deck_context` is useless here.** It needs a brew session id, not a deck id. [Confirmed: tool-registry.ts deck_context]
- Replies are sent after the full answer is ready, split into 50-character pieces, not streamed live. [Confirmed: route.ts]
- Tool loop limits: 10 steps, 30 s total, 15 s per tool. A deck-wide check on 100 cards must be a single batched tool call. [Confirmed: src/lib/tool-executor.ts]
- Model is user-selectable and defaults to DEFAULT_MODEL_ID. [Confirmed: route.ts]

## 2. What is missing for S1–S4 and the three groups

Missing for all scenarios (one read-only fact source, call it the "ownership facts" tool):
1. **Per-deck slot view:** for each deck slot, which copy (if any) fills it, whether it is a proxy, and the exact printing. Source: `deck_cards.copy_id` joined to `user_copies.is_proxy`. [Confirmed: src/types/supabase.ts]
2. **Gaps:** slots with no copy, proxy slots, and total vs the format size. Generic basic lands count as Sleeved with no copy (D-032), so they must not appear as gaps. [Confirmed: deck_cards.is_generic in src/types/supabase.ts]
3. **Real-copy classification per candidate card:** Spare (real copy, `copy_id` not referenced by any `deck_cards` row), In another deck (referenced; which deck), Unowned (no real copy, proxies do not count, per D-037). The engine that already does this read-only is the allocation suggestion engine's supply query (copy + proxy flag + `assignedTo` deck + storage location). [Confirmed: src/lib/allocation-candidates.ts EnrichedSupplyEntry; src/lib/allocation-rollup.ts; docs/oracle/contracts/allocation-suggestion-engine.md]
4. **Colour-identity and legality gate** supplied from the deck, not left to the model. [Confirmed: tool-registry.ts validate_cards_for_commander exists]
5. **A suggestion candidate pool:** nothing today lists "owned cards that fit this deck's colours and plan". `getCardsByColourIdentity` loads the whole collection and filters in memory. Fine for one user; slow-ish at scale. [Confirmed: card-repository.ts]

| Scenario | Missing |
|---|---|
| S1 replace proxied Eternal Witness | Know the slot is a proxy; find real copies of the same card first (any printing), else similar role cards the owner owns; classify Spare / In another deck. |
| S2 gaps | Compute gaps (item 2); owned candidates in colours (item 4, 5); rank by role. Role/plan comes from the deck's own list; no new categorisation required for a first slice (the four role systems issue is known, see T-19). |
| S3 only real copy is in another deck | Item 3 plus the **warning text** with the source deck and the shortfall ("leaves Korvold short by one"). Also: the other deck must be named and its slot not hidden. |
| S4 buy | A price for unowned cards from Scryfall, with "estimate" and "unknown" states. `ref_printings.price_usd` exists; `price-store` can give the cheapest listing. Unknown must not become 0 (see risk below). [Confirmed: src/lib/price-store.ts; tool-registry.ts get_deck_cards uses `price_usd \|\| null` for display but `(priceUsd \|\| 0)` for totals] |

Grouped output (Spare, then In another deck with warning, then Buy): nothing today produces a structured, grouped answer. Per D-016 the grouping should come from a tool result the server builds, with the model writing the prose around it, not from the model's own counting. The warning and the "estimate" label should be built by the server so the model cannot omit them.

Suggest-only: remove the write tools from this chat (item in slice 1), and add an instruction that it never says a swap was made.

## 3. Can "physically in Korvold, claimed by Rocco as a plan" be stored today?

**Yes, without a data change.** [Confirmed: src/types/supabase.ts; docs/oracle/contracts/import-reconciliation-redesign.md]
- Physical home: Korvold's `deck_cards` row has `copy_id` pointing at the real `user_copies` row. One copy can be pointed to by at most one slot in practice (D-021, the move/assign RPCs; see "Assumption A1" for the constraint check).
- Rocco's claim: Rocco's `deck_cards` row for the same card with `copy_id` empty. This is exactly the "planned / Unsleeved" slot. D-025 says an Unsleeved slot does not itself reserve a copy; the plan is the row's existence. [Confirmed: docs/oracle/decisions.md D-025, D-020]
- Import claims (`import_sleeve_claims`, one per slot) and `proxy_of_deck_id` add detail for imported slots but are not needed. [Confirmed: src/types/supabase.ts]
- D-027/D-037 already define the shortage view as "demand counted by slots, supply counted by original copies, matched by card, not printing". The Rocco case is Reconcile's "short by one". [Confirmed: docs/oracle/decisions.md D-037]
- D-032: generic basics have no copy and no claim, so they never show up as claims.
- D-039: removing a card from a deck returns its copy to storage, so a copy can only be "physically in Korvold" while it is on Korvold's list. That is consistent with the owner's rule.

Limits of the current model (not blockers for suggest-only):
1. A claim is not tied to one specific copy. Rocco's empty slot says "wants Sol Ring", not "wants copy #12". With one copy this is unambiguous; with two copies, any one could fill it. This matches D-037's card-level matching, so it is acceptable.
2. "Claimed by" is derived, not stored as an event. Nothing records *when* or *why* the claim was made. Not needed to answer the questions in the brief.
3. If a later slice wants Rocco's claim to survive a move (e.g. "when Korvold's copy is logged out, Rocco gets it automatically"), that is a new behaviour. It would need a plan record linking Rocco's slot to a specific copy and a way to apply it atomically. Not required in this feature. **If** the owner later wants it, I would describe it as: "a small note on each planned slot saying which real copy it is waiting for", plus a rule that moving the copy fills that slot. It would require a stored-data change and owner approval. No migration is drafted.

Assumption A1: I did not verify whether the database prevents two `deck_cards` rows from pointing at the same copy (a unique rule). The move RPCs enforce it by behaviour. [Approximate]. The build must not rely on it; use "referenced by at least one slot" for Spare.

## 4. Locked decisions touched or in conflict

| Decision | Effect |
|---|---|
| D-001 copies/rows model | Relied on, no conflict. |
| D-003 / identifier rules | The chat uses card names today. Facts must key on `oracle_id` for card-level and `scryfall_id` for printing. Name matching in `getOwnedCards` (case-insensitive fallback) must not drive ownership facts. |
| D-007 suggestions not writes | Aligns; reuse the read-only engine. |
| D-009 / D-034 (AI changes direct + undo, `source = 'ai'`) | **No conflict, but a stated narrowing.** D-034 says the advisor *may* change decks directly; the brief says suggest-only in this slice. Applying swaps later would need D-034's undo first. Note the contract revision (T-36) was written against direct apply. |
| D-016 structured data via tools | The grouped answer should be a server-built tool result. |
| D-021 exact printing | Spare matching must consider printing; show printing mismatch rather than hiding it. |
| D-025 availability labels | The three groups are not the five labels. Brief says "Spare / In another deck / Buy". Recommend using D-025 words in tooltips (Available, Unavailable, Unowned, Proxy available) where they overlap, and **no new label meanings**. Designer to decide. |
| D-027 / D-037 shortages | The "short by one" warning is the same arithmetic. Reuse its definition: originals only, card-level. |
| D-029 | All decks count, no archived deck concept; "other decks" includes every deck. |
| D-032 | Generic basics: never gaps, never claims. |
| D-035 / D-040 | Scryfall estimates labelled; Card Kingdom removed. |
| D-039 | Describes where a copy goes when removed; consistent. |
| D-028 | Missing-marked copies behave as ordinary owned copies until re-import; chat should not special-case them. |

No decision needs changing. **Challenges: none** (the brief's "no locked decision is changed" holds).

## 5. Half-built or dead code in the AI area

Reuse:
- `src/lib/allocation-candidates.ts` (`fetchBatchEnrichedSupply`, `EnrichedSupplyEntry`): read-only supply with deck assignment, proxy flag, location. Best base for Spare / In another deck. [Confirmed]
- `src/lib/allocation-rollup.ts`: owned/proxy/allocated/shortfall per card, already built on the engine. [Confirmed]
- `src/lib/price-store.ts`: Scryfall prices with a freshness check (stale >48 h) and basic-land exclusion. Needs a "price unknown" result, not 0. [Confirmed]
- `validate_cards_for_commander`, `scryfall_search` tools for legality/identity. [Confirmed: tool-registry.ts]
- `src/hooks/useDeckChat.ts`, `src/components/DeckChatTab.tsx`: the chat UI used on the deck page. [Confirmed: src/components/DeckChatTab.tsx, src/hooks/useDeckChat.ts]

Fix or delete as part of the slices:
- **Write tools in the deck chat** (`add_cards_to_deck`, `remove_cards_from_deck`, `update_deck_card`, listed as deck-building tools): not applied and misleading in this chat. Exclude them here. [Confirmed: tool-registry.ts]
- **`card-repository` ownership methods** (`getOwnedCards`, `getCardsByColourIdentity`, `searchOwnedByType`, `getDeckAllocations`): proxy-blind, printing-blind, hard-coded `original`, optional user scoping. The T-19 assessment and T-36 contract already flagged it as not an availability source. Replace for the deck chat; delete when no caller is left (the sidebar chat also uses them, so removal is a separate decision). [Confirmed: card-repository.ts; docs on branch task/t36-advisor-contract-revision]
- **`deck_context` tool**: for brew sessions only; irrelevant in deck chat. [Confirmed]
- **Dead link:** the Upgrade tab's "Discuss" button navigates to a deck chat page that does not exist (only the API route and the in-page chat tab exist). [Confirmed: src/components/UpgradeTab.tsx; no page under src/app/decks/[id]/chat]
- **Stale table name:** `card_fuzzy_lookup` and top-commanders still read `mtg_cards`, renamed to `ref_cards` in July 2026. Not on this feature's path. [Confirmed: tool-registry.ts; docs/oracle/contracts/ai-recommendations-assessment-2026-09.md]
- **Separate duplicate chat route:** `src/app/api/oracle/chat/route.ts` (sidebar) has its own prompt, applies adds/removes with no undo (D-034), and forces tool use via a keyword detector. Not to be touched in this feature, but any ownership fact tool should be shared by both. [Confirmed: route.ts; docs assessment]
- Price total in `get_deck_cards` treats unknown price as 0 (`priceUsd || 0`). Violates "never show unknown as zero" if it is reused. [Confirmed: tool-registry.ts get_deck_cards]
- Replies are sent in 50-character pieces after the full model response; not true streaming. Non-blocking. [Confirmed: route.ts]

## 6. Reuse of the advisor contract (T-15, T-36)

**Important:** the advisor contract is **not on main**. It exists only on branches `task/t15-advisor-contract-astra-20260929` and `task/t36-advisor-contract-revision` (commit c6b87ea, files docs/oracle/contracts/advisor-tools.md, .types.ts, .examples.ts), preserved as "wip" commits. Status is REVIEW, paused with Phase 8. [Confirmed: git branches; docs/oracle/status.md T-15/T-36]. The brief's path docs/oracle/contracts is therefore empty of it today. Action for Gene: get owner approval to bring it onto main before Developer starts.

What the slice can reuse:
- **Facts are not model output** (section 3 of the contract): availability and price come from tools, the model writes prose only. Directly matches the grouped answer.
- **Advisor-only availability tool** (`advisor_get_availability`, 1–100 candidate keys, read-only) instead of `collection_lookup`. This is the single fact tool we need. It was designed to sit on the T-28 card-state read boundary.
- **Price rules:** Scryfall estimate, labelled, unknown not zero (D-035). Matches Buy group.
- **Safeguard slice S3** (dropped or malformed tool calls) and S1 (no apply). Take S1 as "suggest only"; skip the apply/undo parts.
- **Do not take yet:** direct apply, undo, structured proposals, concurrency, Upgrade-refresh fix, evaluation gates (all M2/Phase 8). T-28 (card-state contract) is the contract's required dependency and is not approved. [Confirmed: status.md T-28]. Recommend a **thin local adapter** now: one read-only function that returns slot, copy, proxy and deck-holding facts, shaped to the T-36 availability result so it can be swapped for T-28 later. That keeps this slice small while not blocking Phase 8.
- Note: the T-36 contract assumed D-034 direct apply; this feature is suggest-only, so the contract's apply sections do not apply.

## 7. Proposed build slices

Matches the brief's (a)/(b)/(c). Each slice leaves the owner something to click; old paths removed in the same slice (process Gate 4). Test on the test account only.

**Slice 0 (prep, tiny):** bring the advisor contract onto main (docs only, owner nod); confirm test account exists. If no test account exists, save-path/data tests are flagged untested per process.

**Slice (a): the chat knows a deck's proxies and gaps.**
- Chat gets a read-only deck-state fact: per slot, copy or none, proxy or real, printing; plus gaps (no real copy, short of 100). Generic basics are not gaps.
- Switch off add/remove/update tools in this chat and instruct it never to say a card was added or removed.
- Server supplies the commander's colour identity and legality check.
- Delete: `deck_context` from the deck chat's tool set; fix or remove the Upgrade tab dead link.
- Owner sees: "which cards in this deck are proxies?" answered correctly. S1 half, S2 half.

**Slice (b): the chat knows what is spare, in other decks, or unowned.**
- One batched fact tool classifies candidate cards: Spare, In another deck (deck name), Unowned; real copies only, proxies never counted as owned (D-037). Built on the allocation engine's read-only supply query.
- Price lookup for the Unowned group: Scryfall estimate, with explicit "no price" state.
- Replace the proxy-blind ownership methods for this chat; keep them for the sidebar until it is migrated.
- Owner sees: S1–S4 answers with correct data, even if shown as plain chat text.

**Slice (c): the grouped answer with warnings.**
- Server builds the three groups in order (Spare, In another deck with the "leaves X short by one" warning, Buy with an "estimate" label) and the model writes around them; layout comes from Designer's mockup (Gate 3).
- Warning wording uses D-037 arithmetic (copies owned vs decks that want it).
- Owner sees: all four scenarios end to end; then close-out on Rocco and two other decks.

Risks and hidden costs flagged to Gene:
1. The deck must be imported first with every deck card marked as a new copy; if copies are not assigned, "spare" cannot be told from "in a deck" (the brief already says this).
2. Matching is by card (oracle), while exact printing is preferred (D-021). Copies of a different printing should be listed as "different printing" rather than hidden.
3. Gap detection depends on how fully decks are sleeved. Early on many decks will show gaps simply because copies are not yet assigned; the chat must say that, not blame the deck.
4. `user_id` scoping is optional in the old repository code; the new tool must always require it.

## Changed files
- docs/oracle/reports/2026-11-02-architect-use-what-i-own-audit.md — this report (no code, data, or contract changes)

## New decisions made (need owner confirmation)
- Recommend bringing the unmerged advisor contract onto main as the base for this feature (Slice 0), docs only.
- Recommend a thin read-only facts adapter now, reshaped to T-28 later, rather than waiting for T-28 approval.

## Assumptions
- A1: the database may not enforce one copy per slot; the build must not depend on it [Approximate].
- The test account exists or will be provided before Slice (b).
- I did not run the app or query data; all findings are from code and docs only.

## Challenges to locked decisions
- none
