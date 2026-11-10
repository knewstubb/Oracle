# How Oracle manages cards today — from import to Reconcile

Role: Designer · Written 2026-10-11 · Companion to [Reconcile — original-copy shortages](reconcile-original-shortages.md)

This describes what the app **does today**, in the order a card travels through it: import → collection → storage → decks → Reconcile. Where today's app differs from what you have already agreed (the decisions register), it says so. Section 9 lists all those differences in one place. Sources for every claim are in the appendix for agents; the body has no code.

---

## 1. The big picture

Oracle tracks four things:

| Thing | Plain meaning | Example |
|---|---|---|
| **Card** | The card as a game object, whatever the printing. | "Sol Ring" |
| **Copy** | One physical piece of cardboard you own. Either an **Original** or a **Proxy**. Each copy has its own printing and finish (nonfoil, foil or etched). | Your foil Commander Masters Sol Ring |
| **Deck slot** | A line on a deck's list that asks for a card. It is either filled by one copy (**Sleeved**) or empty (**Unsleeved**; today's screens say "Planned"). | "Korvold needs 1 Sol Ring" |
| **Storage location** | A box or binder where a copy sits when it is not in a deck. There is always a default location. | "Binder 2" |

**The one rule everything rests on:** a copy is in exactly one place at a time, either in one deck slot or in one storage location. It can never be in two decks at once. Every move happens as a single all-or-nothing step, so a copy can't be lost halfway through a move.

```
          import
            │
            ▼
   ┌──────────────────┐   sleeve / take from deck   ┌──────────────┐
   │ Storage (binder) │ ──────────────────────────▶ │  Deck slot   │
   │   copy sits here │ ◀────────────────────────── │ copy sleeved │
   └──────────────────┘ remove / unsleeve /          └──────────────┘
                        break down
```

## 2. Words: what the screens say today vs what you agreed

| Idea | Today's screens say | Agreed wording (D-025, D-002) |
|---|---|---|
| Slot has a copy in it | "Original" or "Proxy" (internally "sleeved") | **Sleeved**, with Original / Proxy |
| Slot is empty | "Planned · …" | **Unsleeved** |
| Empty slot, a free copy exists | "Planned · Available" | **Available** |
| Empty slot, a different printing is free | "Planned · Alternate" | **Alt available** |
| Empty slot, every copy is in other decks | "Planned · In decks" / "Claimed" | **Unavailable** (with which deck has it) |
| Empty slot, a free proxy exists | *(no label)* | **Proxy available** |
| Card not owned at all | "Unowned" | **Unowned** |
| Deck state | Active / inactive; Brewing sessions; green/amber/red health tiers | **Draft / Assembling / Playable** |
| Lost copy | "Missing" | *(removed — D-028)* |

---

## 3. Stage 1 — Getting cards in

There are four ways in. They overlap, and they do not all handle printings equally well (see 3.6).

### 3.1 First-time setup (onboarding)

A guided flow for a new account:

1. **Choose a source:** Archidekt or Moxfield.
2. **Import the collection.**
   - *Archidekt:* paste any public collection link. A progress bar shows the fetch. Every card becomes individual copies in your default storage location: four Lightning Bolts become four copies.
   - *Moxfield:* enter your username and upload Moxfield's collection CSV file.
3. **Pick which decks to bring in** from that account.
4. **Say whether each deck is built.** Each deck gets **Brew** or **Active** (buttons "All Brew", "All Active", "Skip"). The screen explains: *"Active = physically built. Sleeves real copies… Brew = saved as Planned, nothing sleeved."* Archidekt decks also get a format (Commander by default).
5. **Import.** A progress list shows each deck. For Active decks the app tries to match each card to a free copy in your collection, **one deck at a time, in order**. The first deck therefore gets first pick of contested copies. That is expected, not a bug.
6. **Sort out conflicts** on the import reconciliation screen (3.5), or skip and leave them Unsleeved.
7. **Finish.** The app applies your choices and takes you to your decks.

Basic lands with no specific printing become **generic** lands and need no copy. Maybeboard and sideboard cards go to the deck's Maybeboard and never take a copy.

### 3.2 Adding or replacing your collection later

From the collection screens you can import a CSV file or pasted text in one of two ways:

- **Add:** adds the listed copies to what you already have.
- **Replace:** makes your collection match the file exactly. Anything not in the file is removed. A progress bar runs while it works.

This route understands printings and all three finishes (nonfoil, foil, etched). It does **not** sleeve anything into decks. *Not yet checked:* what Replace does to a copy that is currently sleeved in a deck. Treat Replace with care until that is confirmed.

### 3.3 Adding a deck later

The **Import deck** dialog accepts a link (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox), pasted text, a CSV file, or a preconstructed deck. After a preview you choose one of three options:

| Option on screen | What happens to your collection | What happens to the deck |
|---|---|---|
| **"Add cards to my collection"** | Creates new copies for every card. | Each new copy is sleeved straight into its slot. |
| **"I have this deck built"** | Nothing new is created. | The app sleeves your existing free copies into the slots, exact printing first. Basic lands can use any copy of the same land. Anything it can't fill stays Unsleeved, with a reason: not owned, all copies in other decks, or owned in a different printing. |
| **"This is theorycrafted"** | Nothing. | List only; every slot Unsleeved. |

Unlike onboarding, this dialog does not lead to the reconciliation screen. The agreed replacement for these choices is a simple **Sleeved / Unsleeved** question (D-031), not yet built.

### 3.4 Re-importing a deck from Archidekt

Only for decks that originally came from Archidekt. It warns: *"will overwrite all local edits (card changes, proxy allocations, printing selections, categories)… This cannot be undone."* It updates the list to match Archidekt, adding new slots and removing dropped ones.

**Safety rule:** if Archidekt has dropped a card that is currently sleeved, the re-import **stops with an error** rather than quietly removing it. You must take that card out of the deck first, and its copy then returns to storage.

Sending changes **back** to Archidekt does not work. Those features are switched off, and the app says to copy the list across by hand.

### 3.5 The import reconciliation screen (onboarding only)

This screen appears after onboarding imports Active decks. It lists every slot the app could not fill cleanly, titled "Reconcile imported decks", split into **owned** and **unowned** groups. Example: you own one Sol Ring, Korvold and Prosper both want it, and the screen shows both decks' claims side by side.

For each slot you choose:
- **Sleeved:** use a real copy (owned cards only).
- **Proxy:** a proxy of that exact printing will be created and sleeved.
- **Planned:** leave it Unsleeved (toast: "Marked as Unsleeved").

You can also pick a **different printing** you own. If that copy is already used elsewhere, the slot drops back to Unsleeved with a message. Unowned cards have a **Wishlist** tick box, which records interest but changes nothing else.

**Finish** carries out every choice: it sleeves the copies, creates the proxies and leaves the rest Unsleeved, then reports, for example, "sleeved 12, added 3 proxy copies, kept 5 slots unsleeved". If conflicts remain, it asks for confirmation first. After Finish, anything left is just an ordinary Unsleeved slot. No conflict badge follows the deck around.

### 3.6 How each route identifies the card

| Route | Knows the exact printing? | Finishes kept |
|---|---|---|
| Onboarding, Archidekt collection | Groups by card name | nonfoil / foil only (etched is lost) |
| Onboarding, Moxfield CSV | Yes (by printing ID, or set + collector number looked up on Scryfall) | all three |
| Collection CSV / text | Yes, falling back to name | all three |
| Deck import | Yes when the source gives a printing | n/a (slots don't have finishes) |

---

## 4. Stage 2 — Your collection

There are three screens. They overlap.

### 4.1 Collection (menu: "Collection")
A browsing view of everything you own, **by printing**: a grid of card images or a list, with search, colour filters, sorting and a value total. Foil, proxy and missing copies are marked. Proxies are hidden unless you switch them on. Prices come from Scryfall, refresh automatically, and are treated as out of date after 48 hours.

### 4.2 Card Management (menu: "Card Management", page title "Cards")
A working view **by card**: one row per card with the columns **Owned / Proxy / Allocated / Shortfall** and a status icon ("Over-allocated", "Proxy in use", "Fully allocated", "Partially allocated"). Selecting a card opens a panel listing **every copy**, split into **In decks** and **In storage** (and **Missing**, if shown). Each copy shows its printing, condition and finish, and either its deck or its storage location.

From that panel you can:
- **Add proxy**: creates a proxy in storage.
- Sleeve a free copy into a deck, or move a copy to another deck.
- **Replace with original**: swap a sleeved proxy for a free original in one step. The proxy goes to storage.
- Take a copy out of its deck and choose which storage location it goes to.
- Move a copy between storage locations, or change its printing.
- **Mark as missing** / **Mark as found**, or **Delete** a copy permanently.

You can also select several copies at once to move them to storage, mark them missing, or delete them.

### 4.3 Binders (menu: "Binders")
One tile per storage location with its copy count, plus **Unsorted** for copies with no location. Opening a location lists its copies, each with an option to sleeve it into a deck. You add, rename or remove locations under Settings → "Manage locations".

### 4.4 "Missing" (to be removed)
A copy marked Missing is taken out of any deck and ignored by every count, but it still claims to be in its old box. You have agreed to remove this concept (D-028, task T-38); you will reimport, so no data needs converting.

---

## 5. Stage 3 — Decks

### 5.1 Deck list (menu: "Decks")
Deck tiles with commander, colours and card count, split into **Active** and inactive groups, with a green/amber/red readiness icon and an optional folder. Folders only organise; they don't affect copies. AI brewing sessions appear separately as **Brewing**. A deck-status filter with a **Graveyard** option still exists in the code; you have agreed to remove it (D-029).

### 5.2 Deck page — Cards view
Cards are grouped by category, with the **Maybeboard** separate. Each card shows a status chip from §2, for example "Original", "Proxy", "Planned · Available" or "Planned · Unowned". **Generic basic lands** appear as simple rows with a quantity control and no ownership chip; they always count as covered.

Clicking a status chip offers the actions that make sense for that card:

| Action | What it does | Who gives up the copy |
|---|---|---|
| **Sleeve** a free copy | Puts a copy from storage into this slot. | No one |
| **Take from another deck** | Moves a copy out of another deck's slot into this one. Taking from an Active deck asks "Sleeve from Active deck?" first. | The other deck's slot becomes Unsleeved. It is **not** refilled automatically. |
| **Proxy** | Creates a new proxy copy and sleeves it here. | No one |
| **Replace with original** | Swaps the sleeved proxy for a free original; the proxy goes to storage. | No one |
| **Undo** | Reverses the last sleeve or take (offered in a pop-up message). | Restores the previous position |
| **Remove** card | Deletes the slot. Its copy returns to the default storage location (D-039). | — |
| **Move to Maybeboard** | Agreed (D-005 / D-039): the copy returns to storage. | — |

Every placement is recorded as **manual**, **ai** or **import**, so undo and history work the same way however a card was placed.

### 5.3 Deck page — Pick list view
A to-do list of the deck's Unsleeved cards (generic lands excluded), grouped as **Available**, **Claimed** (in another deck) and **Unowned**, with a running count of Originals, Proxies and what's left. Each card shows where its candidate copies are and has a **Sleeve** button. Claimed cards need confirmation; Unowned cards can get a proxy. You have agreed this becomes the main deck-assembly screen, with each copy's storage location shown (D-033, task T-25).

### 5.4 Break down
**Break down** empties a deck physically: every sleeved copy goes back to storage, and the deck list stays intact with every slot now Unsleeved. No copies are deleted.

### 5.5 What the app never does on its own
- It never sleeves cards outside import. There is an "auto-assign all Brew decks" function in the code, but no button for it.
- It never swaps a proxy for an original without you asking.
- It never refills a slot that lost its copy to another deck.

---

## 6. Stage 4 — Reconcile (menu: "Reconcile")

**Today:** a read-only list of cards that more decks want than you own originals of, grouped by deck. It ignores slots filled by proxies, and leaves out cards you own no original of.

**Agreed (D-037), designed in the companion spec:** Reconcile becomes the **original-shortage** view. Every deck slot counts, including proxy-filled ones; proxies never count as originals; cards with no original appear; and any printing counts. Example: Sol Ring in three decks, one original and two proxies, shows "2 more originals needed". It is purely informational: nothing on it changes your decks.

Don't confuse it with **import reconciliation** (3.5), which is a one-off step during onboarding.

---

## 7. Worked example: the life of a Sol Ring

| Step | What you do | What the app shows |
|---|---|---|
| 1 | Onboard from Archidekt; your collection has one Sol Ring. | One original Sol Ring copy in your default binder. |
| 2 | Import Korvold and Prosper as **Active**; both list Sol Ring. | Korvold is imported first and gets the copy. Prosper's Sol Ring appears on the reconciliation screen. |
| 3 | Choose **Proxy** for Prosper and click Finish. | A proxy Sol Ring (same printing) is created and sleeved in Prosper. |
| 4 | Import Atraxa with "I have this deck built". | Atraxa's Sol Ring is "Planned · In decks", because your only original is in Korvold. |
| 5 | On Atraxa's pick list, choose **Take from Korvold** and confirm. | Atraxa has the original; Korvold's Sol Ring becomes "Planned · In decks". |
| 6 | On Korvold, choose **Proxy**. | Second proxy created and sleeved. All three decks are fully sleeved. |
| 7 | Open Reconcile (after T-37). | "Sol Ring — 2 more originals needed · Needed in decks 3 · Originals owned 1 · Proxies sleeved 2". |
| 8 | Buy a Sol Ring and add it to your collection. | It lands in storage. Reconcile drops to "1 more". Korvold's note says an original in storage could replace a proxy; you choose **Replace with original** when you're ready. |
| 9 | **Break down** Prosper. | Prosper's proxy goes to storage as a spare. Prosper's list still includes Sol Ring, so Reconcile still counts it. |

---

## 8. Rules that always hold

1. One copy, one place: one deck slot **or** one storage location.
2. Proxies are copies too. They are tracked individually and are never silently turned into originals or the other way round.
3. Taking a copy out of a deck (Remove, Break down, Unsleeve, Maybeboard) returns it to storage. It is never deleted unless you choose **Delete**.
4. Lists and copies are separate facts: a deck can list 100 cards with only 60 sleeved.
5. Generic basic lands never need a copy.
6. The app suggests but does not move cards on its own. The only exception is matching your own copies when you import a built deck.

---

## 9. Where today differs from what you've agreed

| Agreed | Today | Task |
|---|---|---|
| Draft / Assembling / Playable deck states (D-002) | Active / inactive, Brewing, colour health tiers | not yet scheduled for screens (contract T-28 in review) |
| Sleeved / Unsleeved and Available / Unavailable / Alt available / Proxy available / Unowned (D-025) | "Planned · …", "In decks", "Alternate"; no "Proxy available" | T-25 / T-26 |
| Import asks Sleeved / Unsleeved (D-031) | Onboarding: Brew / Active; deck dialog: three options | T-25 |
| Proxy records the printing the slot asks for (D-038) | Proxy from a deck slot takes the first printing found. Onboarding's Finish already matches the printing. | T-28 follow-up |
| Remove Missing (D-028) | Still visible and active | T-38 |
| No retired/Graveyard (D-029) | Graveyard filter still in code | T-38 |
| Pick list shows storage locations (D-033) | Shows candidates; locations partial | T-25 |
| Reconcile = original shortages (D-037) | Old "overused" rule | T-29 spec (ready for your review) → T-37 |
| Generic basics count as Sleeved (D-032) | Already treated as covered; final presentation to approve | T-30 |

## 10. Rough edges worth knowing

- **Two screens for the same job:** Collection and Card Management both list your cards, in different shapes. Card Management is where the copy actions are.
- **Archidekt onboarding loses etched finishes** and groups by card name, while CSV import keeps both. Reimporting via CSV is the more precise route.
- **Sending decks back to Archidekt is switched off.**
- **The standalone deck import has no reconciliation screen.** Conflicts there become Unsleeved slots you sort out on the pick list.
- **An older, simpler conflict screen** still exists alongside the newer reconciliation screen; onboarding uses the newer one.

---

## Appendix — sources (for agents)

Collected from the code on 2026-10-11. Tags: [Confirmed] = read in source; [Approximate] = from a research summary, not re-read line by line.

- Nav labels "Decks", "Card Management" (/allocation), "Reconcile", "Collection", "Binders" — [Confirmed: src/components/Sidebar.tsx]
- Card Management page title "Cards" and the rollup — [Confirmed: src/app/allocation/page.tsx → CollectionRollupTab]; Collection page grid/list by printing — [Confirmed: src/app/collection/page.tsx]
- Onboarding steps, Brew/Active, "All Brew"/"All Active" — [Confirmed: src/app/onboarding/page.tsx]; serial deck resolution — [Approximate: src/lib/warm-start-resolve.ts resolveDeckBatch]
- Archidekt collection import groups by name, foil/nonfoil only — [Approximate: src/app/api/onboarding/collection-stream/route.ts]
- CSV identity resolution order and finishes — [Approximate: src/lib/identity-resolver.ts, src/lib/csv-import.ts]; add/replace modes — [Approximate: src/app/api/collection/import/route.ts]
- Deck import options "I have this deck built" / "This is theorycrafted" / add-cards — [Confirmed: src/components/DeckImportButton.tsx]; modes — [Approximate: src/lib/deck-import.ts, reconcile_built_deck]
- Reimport warning text — [Confirmed: src/app/api/decks/[id]/reimport/route.ts]; reimport refuses to delete a sleeved slot ("assigned_row_in_diff") — [Confirmed: supabase/migrations/20260912150000_atomic_collection_movements.sql apply_deck_cards_diff]
- Archidekt push dormant — [Confirmed: src/app/api/decks/[id]/push/route.ts]
- Import reconciliation states, alternate printing, wishlist, finalize — [Approximate: src/components/reconciliation/ConflictCard.tsx, ReconciliationSummary.tsx, WishlistCheckbox.tsx, src/app/api/onboarding/finalize/route.ts]; legacy conflicts API — [Approximate: src/app/api/onboarding/conflicts/**]
- Slot chip labels and "Planned ·" prefix — [Confirmed: src/components/CardSlotBadge.tsx]
- Copy placement invariant (deck slot xor storage) — [Approximate: supabase/migrations/20260912150000_atomic_collection_movements.sql header]
- Collection columns, status icons — [Confirmed: src/components/collection/RollupRow.tsx]; detail panel actions — [Approximate: src/components/collection/InstanceDetailPanel.tsx, BulkActionBar.tsx]
- Storage overview, Unsorted — [Approximate: src/app/storage/page.tsx, src/app/api/storage/overview/route.ts]
- Prices from Scryfall, 48-hour staleness — [Approximate: src/lib/price-store.ts]
- Allocation actions (assign, claim-from-deck, reassign, add-proxy, replace-with-original, undo) — [Approximate: src/app/api/allocation/**]; add-proxy picks first available printing — [Confirmed: src/app/api/allocation/add-proxy/route.ts header comment]
- Remove returns copy to default storage — [Confirmed per D-039: src/app/api/decks/[id]/cards/[cardId]/route.ts]
- Auto-assign resolve has no UI caller — [Confirmed: no reference to allocation/resolve in any .tsx]
- Placement source manual/ai/import — [Approximate: supabase/migrations/20260925220000_placement_source.sql]
- Break down releases copies, keeps list — [Approximate: src/app/api/decks/[id]/breakdown/route.ts]
- Pick list groups Available / Claimed / Unowned — [Approximate: src/components/PicklistV2.tsx]
- Graveyard still in StatusFilter / StatusBadge — [Confirmed: src/components/StatusFilter.tsx, StatusBadge.tsx]
- Missing still active — [Approximate: src/components/collection/MissingToggle.tsx, MissingCopyRow.tsx, src/app/api/physical-copies/[id]/missing]
- Reconcile today — [Confirmed: src/lib/reconcile-overuse.ts]
- Note: docs/card-movement-reference.md (July 2026) is partly out of date (e.g. it says Remove 404s; D-039 confirms it now works).
