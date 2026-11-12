# Contract: chat can add cards (after the owner confirms)

Author: Architect, 2026-11-12. Status: draft for owner review. Brief: `docs/oracle/briefs/daily-use-deck-advisor.md`. Related: `contracts/advisor-tools.md` (T-15), `contracts/deck-health-phase2.md`.

**Owner decision (2026-11-12, approved in chat):** the Oracle chat may add cards to a deck, but only after the owner explicitly confirms each proposal. Trigger: the chat suggested cards and then said it could not add them.

This narrows D-034 (see section 6 of this file). No code is changed by this document.

---

## 1. Audit: what exists today

| # | What | Where it lives | Reusable? |
|---|------|----------------|-----------|
| 1 | **Edit tools** `add_cards_to_deck`, `remove_cards_from_deck`, `update_deck_card`. Display-only tools: they return "Added N cards" text and emit an `add_cards` event. No checks of any kind. Hidden from the model in deck chat unless `ORACLE_DECK_CHAT_EDIT_TOOLS=true`. [Confirmed: src/lib/tool-registry.ts ~60-100, ~1937-2015] | tool registry | **No.** The model's call is the write trigger, which is exactly what this feature must not allow. Leave them off. Do not turn the flag on. |
| 2 | **Auto-apply of those events.** When the sidebar chat receives `add_cards` / `remove_cards`, it calls the batch route immediately, no confirm, no undo. [Confirmed: src/contexts/OracleContext.tsx ~556-600] | sidebar context | **No.** Dormant while the flag is off. It is a loaded gun: remove it (slice 4). |
| 3 | **Suggest-only prompt rules** forbid saying anything was added and tell the model to say "the owner can make the change themselves". Also repeated in the deck-health and owned-copy rules. [Confirmed: src/lib/deck-chat-prompt.ts] | prompt | Must be rewritten (section 2.9). This is why the chat says it cannot add. |
| 4 | **Small "+" next to every [[Card]] name** in the sidebar when a deck page is open. A click calls the plain add route for one card. [Confirmed: src/components/OracleSidebar.tsx 248-288, src/lib/render-card-links.tsx ~241] | sidebar | Partly. It is a real user click, so it already is a consent. But it is tiny, unlabelled as "add", and gives no checks (below). The owner did not find it. Keep the idea (user click = consent), replace the experience. |
| 5 | **Plain add route** `POST /api/decks/[id]/cards`. Checks the deck belongs to the user, then inserts one planned slot (quantity 1, no copy assigned), choosing a printing the owner already owns if any, else Scryfall's default. [Confirmed: src/app/api/decks/[id]/cards/route.ts] This is the same call the role-detail rows ("Add to deck", Deck health) use. [Confirmed: src/components/GapDetail.tsx 40-60] | route | **Reuse the behaviour, not the route.** It makes a **planned slot only** and does not move a copy: a card that sits in another deck stays there (D-020, D-025). That is the right behaviour for chat too. |
| 6 | **Gaps in the plain add route:** no duplicate check, no singleton check, no colour-identity check, no legality check, and an unknown name still inserts a row with no printing (Scryfall failure is swallowed). No record of who/what added it; no undo. [Confirmed: same file, lines 60-140] | route | These checks must exist on the chat path. They should live in one shared helper so the manual "+" and role rows can adopt them later (not in this slice). |
| 7 | **Batch route** `POST /api/decks/[id]/cards/batch` calls the atomic `apply_ai_deck_delta` database function (one transaction; deck row locked; ownership re-checked). Prefers an owned printing. [Confirmed: src/app/api/decks/[id]/cards/batch/route.ts; supabase/migrations/20260912150000_atomic_collection_movements.sql ~1180] | route + RPC | **Reuse for the write** (atomic, user-scoped, "Add all"). It does not do the checks in row 6 and does not record `source = 'ai'` for the added slot [Approximate: confirm in the function body]. |
| 8 | **Read tools the model already has:** `check_owned_copies`, `browse_spare_copies`, `get_deck_health`, `validate_cards_for_commander` (colour identity by commander name), `card_fuzzy_lookup`. Colour identity helpers `loadDeckCommanders`, `decks.colour_identity`. Banned/size logic in `deck-legality.ts` (exempts basic lands). [Confirmed: src/lib/tool-registry.ts; src/lib/deck-colour-identity.ts; src/lib/deck-legality.ts] | libs | **Reuse as the server's verification inputs.** The model's own validation is advice; the server re-runs it. |
| 9 | **Confirmation UI:** none in chat. The nearest patterns are the `navigate_prompt` event (a labelled button the owner clicks to continue) and toasts. [Confirmed: src/contexts/OracleContext.tsx ~540-555] | sidebar | The proposal card is new UI (Designer), but the "server sends a structured event, the UI shows a button" pattern already exists. |
| 10 | **Undo / audit for AI changes:** none. D-034 requires it and the status log says it was never built. A single added slot can be removed with `DELETE /api/decks/[id]/cards/[cardId]`. [Confirmed: src/app/api/decks/[id]/cards/[cardId]/route.ts] | route | Reuse that delete for undo of a slot that is still a plain planned slot. |
| 11 | **Two chat routes:** the sidebar's `POST /api/oracle/chat` (what the owner uses; deck id comes from the page context, then the route loads the deck and ownership) and the per-deck page's `POST /api/decks/[id]/chat`. Both pass the deck chat tool set. [Confirmed: src/app/api/oracle/chat/route.ts ~391-415, ~508-512; src/app/api/decks/[id]/chat/route.ts] | routes | The new tool and event must work in **both**, built once in a shared library. |

Bottom line: no existing tool can be reused as-is. What is reusable is the atomic write (row 7), the planned-slot behaviour (row 5), the verification inputs (row 8), and the delete (row 10).

---

## 2. Behaviour

### 2.1 Core rule
Nothing about the deck changes until the owner clicks **Add** on a specific proposal. The model can propose. It cannot add. Each proposal is one card.

### 2.2 Which deck
Always the deck the owner has open when the chat message is sent. The server fixes the deck for each proposal; the model cannot name a deck. If no deck page is open there are no Add buttons, and the chat says: "Open a deck and I can add cards to it."

### 2.3 How the chat proposes
When the chat recommends a card it wants to be addable, it calls a new read-only tool `propose_deck_cards` with card name, optional category, and a one-line reason. The server checks each card (section 3) and returns the checked result to the chat, and in the same stream sends the owner a **proposal card** per suggestion. The model only sees outcomes such as "ready" or "blocked: outside colours", never a confirmation token.

Each proposal card shows (wording is Designer's to finalise; the content is fixed here):
- Card name (hover preview, as elsewhere), the reason line, the category it would go in.
- One ownership line from existing lookups, in the owner's vocabulary: "You own it, spare", or "You own it, it's in Prosper. Adding it makes a planned slot here and leaves the card in Prosper", or "You don't own this".
- One button: **Add to <deck name>**. After the first proposal in a message there is an optional **Add all (N)** button above the list; it only covers cards that are ready.
- A second small action: **Not now** (hides it; nothing is stored beyond the proposal row's status).

Blocked cards show no Add button, only the reason (2.6).

### 2.4 What happens on confirm
1. Click sends the proposal's single-use id to the confirm route (section 3).
2. The server re-checks everything (the deck may have changed since the proposal).
3. It adds **one planned slot, quantity 1**, in the proposal's category (or the card's default). It does not assign, move or sleeve any copy and does not touch another deck (D-020, D-025). The card keeps asking for a printing the owner already owns, else the default (D-003: slot stores a printing id, the check uses the oracle id).
4. The card changes to **Added** with an **Undo** link. Deck view and counts refresh.
5. If the owner's deck now has more than 100 cards, the receipt says so ("Deck now has 101 cards"). It still adds; it does not block (open question Q2).

Wording after success: "Added Sol Ring to Korvold. It's a planned slot; no copy was moved." For an owned card in another deck: "Added Sol Ring to Korvold. Your copy is still in Prosper."

### 2.5 Undo and easy removal
- Every confirmed add is recorded as an AI add (`source = 'ai'`, D-034, D-009) with the new slot's id.
- **Undo** on the receipt removes exactly that slot if it is still a plain planned slot. It stays available as long as the proposal exists (24 hours) and the slot is unchanged.
- If the owner has since sleeved a copy to it or changed it, Undo does not guess: "This card has been changed since. Remove it from the deck page." (no copy is ever moved by chat undo).
- Undo is recorded as a manual change. Normal removal on the deck page always works as before.
- "Add all" produces one receipt with one Undo for the whole batch (atomic, same rule per slot).

### 2.6 Blocked, duplicate and failure handling

| Case | What the owner sees | Add button? |
|------|---------------------|-------------|
| Card name does not match a real card | "I couldn't confirm a card called X, so I can't add it." | No |
| Already in the main deck | "Already in Korvold." | No |
| Already in this deck's Maybeboard | "Already in your Maybeboard. Move it from the deck page." (moving is out of scope) | No |
| Singleton: any other copy of a non-basic card | covered by the two rows above (quantity is always 1). Basic lands and Wastes are exempt (D-032, same list as `deck-legality.ts`); "Add" adds one more basic | Yes (basics) |
| Outside the commander(s) colour identity | "X is outside Korvold's colours (B, R, G), so it can't go in this deck." Both commanders count together for partners | No |
| Colour identity of the deck unknown (no commander set or lookup failed) | "I can't tell this deck's colours yet, so I won't add cards. Set a commander first." Fail closed | No |
| Banned or not legal in Commander | "X isn't legal in Commander." | No |
| Server or network error on confirm | The proposal stays and shows "Couldn't add X. Try again." Nothing was added (single transaction) | Yes (Try again) |
| Something changed between proposal and click (now a duplicate, now outside colours) | The card turns into the matching blocked message above; nothing is added | No |
| Proposal older than 24 hours or deck deleted | "This suggestion has expired. Ask me again." | No |
| Add all, one card fails the re-check | Cards that pass are added in one transaction; the rest are listed with their reasons: "Added 3 of 4. Sol Ring was already in the deck." | n/a |

The chat never claims an add happened. Only the card UI says Added, based on the server reply.

### 2.7 Quantity and category
Quantity is always 1 (basic lands: one per click). The category comes from the proposal, normalised by the existing default-category logic. Maybeboard proposals are out of scope for this slice.

### 2.8 Not changed
No removals or swaps by chat (swap = propose a cut as text; the owner removes it, or a later slice). Copy assignment, sleeving, proxies and reconcile are untouched.

### 2.9 Prompt changes (shared rules text)
Replace the "suggestions only" rules with: "You can propose cards for the owner to add with propose_deck_cards. You cannot add anything yourself. Never say a card was added until the owner clicks Add and the card shows Added. If a card is blocked, say why in the words the tool gives." Update the deck-health and owned-copy rules the same way (they currently say "Never offer to add").

---

## 3. Safety boundary

The model's tool calls are untrusted input. Writes happen only through a route the model cannot reach.

1. **Propose is read-only.** `propose_deck_cards` only reads and records a proposal row. It is the only new tool. No deck-writing tool is registered for the model; the old edit tools stay hidden and the setting stays off.
2. **Server-side card verification (at propose and again at confirm).** Exact-name match against `ref_cards`, which yields the canonical `oracle_id` (D-003); no match means blocked. Names the model invents never reach the deck. Then: not already in the deck, colour identity within `decks.colour_identity` (fail closed when unknown), commander-legal.
3. **Deck belongs to the user.** The deck id comes from the open page, then the server loads the deck and requires `decks.user_id` to equal the signed-in user (as both chat routes already do). The proposal stores `user_id` and `deck_id`; confirm requires both to match the session user. Never trust a deck id sent in a confirm body.
4. **Confirmation token = the proposal's single-use id.** An unguessable id (UUID) created by the server when it proposes. It is delivered to the browser only through the stream event for the card UI, **never in the tool result or any text the model can read**, so the model cannot repeat it. Confirm requires the signed-in session plus that id, is single-use (status moves `pending` to `added`), and expires after 24 hours. A model that writes "confirmed" in text changes nothing.
5. **The confirm route is not a tool.** It is a plain page-to-server route, absent from the tool registry, and the tool loop has no way to call routes.
6. **Atomic write.** One transaction per confirm (single card or Add all), reusing the batch function's deck lock and user check. If it fails, nothing is partly added. Proposal status updates in the same transaction.
7. **No destructive operations.** Add and single-slot undo only. Undo deletes only the slot the proposal created, and only if unchanged. No clear, recompute or copy movement.
8. **Rate and size limits.** At most 10 proposals per tool call, 30 pending proposals per deck; extras are dropped with a note to the model.
9. **Audit.** Proposal rows keep who, what, when, the outcome and the created slot id.

### 3.1 Proposed data (draft; migration to be written in slice 1, owner approves before applying)
Table `chat_card_proposals`: `id uuid` PK (the token), `user_id uuid` (FK to users; RLS: own rows only), `deck_id integer` (FK to decks, cascade), `oracle_id` (canonical card id, D-003), `card_name text`, `category text null`, `reason text null`, `status` (`pending`, `added`, `dismissed`, `undone`, `blocked`, `expired`), `blocked_reason text null`, `created_deck_card_id integer null` (id of the slot added; holds a slot id, not a card id), `created_at`, `expires_at`, `confirmed_at null`. Indexes: `(user_id, deck_id, status)` for the pending cap and lookups. Forward-only and reversible by dropping the table (no other table changed).

### 3.2 Reference types (indicative; a types file comes with the slice)
```ts
type ProposalState = 'ready' | 'blocked'
type BlockReason = 'not_found' | 'in_deck' | 'in_maybeboard' | 'outside_colours'
  | 'colours_unknown' | 'not_legal' | 'expired'
interface ProposalCard { proposalId: string; cardName: string; reason?: string; category?: string
  state: ProposalState; blockReason?: BlockReason; blockText?: string; ownershipLine?: string }
// stream event to the page: { type: 'add_proposals', deckId: number, deckName: string, proposals: ProposalCard[] }
// POST /api/decks/[id]/chat-proposals/confirm  body { proposalIds: string[] }  (1 = Add, many = Add all)
// reply: { added: {proposalId, deckCardId}[], skipped: {proposalId, blockReason, blockText}[] }
// POST /api/decks/[id]/chat-proposals/undo     body { proposalIds: string[] }
// POST /api/decks/[id]/chat-proposals/dismiss  body { proposalIds: string[] }
// Errors: 401 not signed in, 404 not your deck or unknown proposal (same reply, no leak), 409 already used, 410 expired, 500 nothing added.
```
What the model receives from the tool: per card `ready` or `blocked` with the reason text, never ids.

---

## 4. Slices and tests

**Slice 1: verify and record (no UI).** Shared checking library (real card, in deck, singleton with basics exempt, colour identity, legality), the proposals table migration draft, `propose_deck_cards` tool registered for deck chat only, event emitted from both chat routes, prompt rewrite. Tests: one per row of the section 2.6 table; unknown deck colours fails closed; the tool result never contains an id (snapshot); tool absent outside deck chat; old edit tools still hidden with the setting off; wrong user's deck returns not found; pending-cap and per-call cap.

**Slice 2: confirm and undo routes.** Confirm (single and many), dismiss, undo; atomic write; re-check at confirm; single-use; expiry. Tests: confirm adds exactly one slot with quantity 1 and no copy assigned; owned card in another deck stays in that deck (the owned-in-Prosper example); second confirm returns already used; another user's proposal id returns not found; model-supplied text cannot confirm (no tool path, test the registry has no write-capable tool); failure midway leaves nothing (RPC failure test); Add all with one stale card adds the rest and reports the one; undo removes only an unchanged slot, refuses a sleeved one; a duplicate arriving between propose and confirm is blocked.

**Slice 3: proposal card UI (Designer first: spec and mockup, then Developer).** Proposal card, Add, Add all, Not now, Added with Undo, blocked and failure states, in the sidebar and the per-deck chat; deck view refreshes. Tests: component tests for each state and wording; Add disabled while sending; after confirm the card shows Added only from the server reply; Playwright on a test deck: ask, see proposals, nothing changed, click Add, deck gains the card, Undo removes it.

**Slice 4: retire the direct paths.** Remove the sidebar's auto-apply of add and remove events. Route the small "+" through the same checks (or retire it) so manual adds also refuse duplicates and off-colour cards (decision for owner, Q3). Tests: the old event no longer changes a deck; "+" on a duplicate shows the blocked message.

Not in these slices: removals and swaps by chat, Maybeboard proposals, moving a card between lists, any copy assignment.

Manual check on a real deck after slice 3 (owner): ask "what removal could I add?", confirm nothing changed in the deck, add one, undo it, try a card from outside the deck's colours.

---

## 5. Open questions (none block slice 1)
See the report. Defaults used here are marked in section 2.

## 6. Relationship to locked decisions
- **D-034** (advisor may change a deck directly, without a confirmation step, every AI change undoable): this contract requires confirmation for adds. Undo, `source = 'ai'` and audit are kept as D-034 says. Needs owner-approved amendment through Gene.
- D-003 (oracle id for the check, printing id on the slot), D-005 (Maybeboard separate), D-007 (suggest, never overwrite), D-009 (source recorded), D-020 and D-025 (planned slot only; no copy created or moved), D-032 (basic lands exempt), D-059 (unowned shows as Unowned cards) are respected.
