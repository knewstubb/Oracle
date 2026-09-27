# Import Reconciliation: Card Slot States

This document maps every possible state a card slot can enter during the import reconciliation process, organized by ownership of the requested printing, availability of alternate printings, over-allocation status, and user actions.

## Definitions

- **Specific printing owned:** Do you own at least one real copy of the printing requested by the deck?
- **Alt printing owned:** `No`, `Available`, or `Claimed`. Whether another printing of this card exists in your collection, and if so, whether it's available or already assigned elsewhere.
- **Overallocated:** Are there more competing import slots than available copies of the requested/effective printing?
- **Available now:** Is there currently a matching copy the user can choose to Sleeve?
- **Resolved:** Has this import slot been handled? This does not describe its permanent status after import.

---

## Initial Import States (Before User Action)

| # | Specific printing owned | Alt printing owned | Overallocated? | Matching copy available now? | Import state | Resolved? | Options |
|---|---|---|---|---|---|---|---|
| 1 | No | No | Yes—zero requested copies exist | No | **Planned (unowned)** | No | Proxy; Add to wishlist checked |
| 2 | No | Available | Yes—zero requested copies exist | No | **Planned (alt printing available)** | No | Switch printing; Proxy |
| 3 | No | Claimed | Yes—zero requested copies exist | No | **Planned (claimed by another deck)** | No | Proxy; leave Planned |
| 4 | Yes | Irrelevant | No | Yes | **Sleeved (owned)** | Yes | None |
| 5 | Yes | No or Claimed | Yes | Yes | **Planned (conflict)** | No | Sleeve; Proxy; leave Planned |
| 6 | Yes | Available | Yes | Yes | **Planned (conflict)** | No | Sleeve; Switch printing; Proxy; leave Planned |

### Initial States — Descriptions

1. **Planned (unowned):** You do not own the requested printing or any other printing of this card.
2. **Planned (alt printing available):** You do not own the requested printing, but another printing of this card is available.
3. **Planned (claimed by another deck):** You do not own the requested printing. You own another printing, but every copy of it is already assigned to another deck.
4. **Sleeved (owned):** You own the requested printing and there are enough copies for every slot requesting it. This copy is allocated automatically.
5. **Planned (conflict):** You own the requested printing, but there are not enough copies for every competing slot. You decide which deck receives a real copy.
6. **Planned (conflict):** The requested printing is contested, but this slot can use either the requested printing or an available alternate printing. You decide.

### State Priority

Some facts overlap, so the displayed state needs a consistent priority:

1. If the requested printing fits all competing slots → **Sleeved (owned)**.
2. If requested copies remain but cannot satisfy everyone → **Planned (conflict)**.
3. If no requested copy remains but an alternate is available → **Planned (alt printing available)**.
4. If a printing is owned but every usable copy is held elsewhere → **Planned (claimed by another deck)**.
5. If no printing of the card is owned → **Planned (unowned)**.

This avoids describing a card as "unowned" when another printing is actually in the collection.

---

## States After User Actions

| # | User action or event | Specific printing owned | Alt printing owned | Overallocated? | Matching copy available now? | Resulting state | Resolved? | Options |
|---|---|---|---|---|---|---|---|---|
| 7 | User clicks Sleeve on the requested printing | Yes | Irrelevant | Recalculated after reservation | Reserved for this slot | **Sleeved (owned)** | Yes | Change decision if editing remains available |
| 8 | Another deck Sleeves the last requested copy | Yes | Available | Yes | No requested copy; alternate available | **Planned (alt printing available)** | No | Switch printing; Proxy; leave Planned; Sleeve disabled |
| 9 | Another deck Sleeves the last requested copy | Yes | No or Claimed | Yes | No | **Planned (claimed by another deck)** | No | Proxy; leave Planned; Sleeve disabled |
| 10 | User switches to an available alternate printing | Alternate becomes the effective printing | Depends on other alternates | Recalculated for the selected printing | Yes | **Planned (alternate selected)** | No | Sleeve; Proxy; leave Planned |
| 11 | User Sleeves the selected alternate | Yes—the selected alternate | Irrelevant | Recalculated after reservation | Reserved for this slot | **Sleeved (alternate printing)** | Yes | Change decision if editing remains available |
| 12 | User clicks Proxy | Irrelevant | Irrelevant | Irrelevant | Irrelevant | **Proxy** | Yes | Change decision if editing remains available |
| 13 | User leaves an unresolved slot Planned and finishes import | Depends on slot | Depends on slot | No longer part of import reconciliation | Not allocated | **Planned (in the system)** | Yes for the completed import | Normal deck actions later |
| 14 | User changes a Sleeved or Proxy decision back to Planned | Recalculated | Recalculated | Recalculated across every competing slot | Recalculated | One of the applicable Planned states above | Usually no | Based on newly available supply |

### Post-Action States — Descriptions

7. **Sleeved (owned):** The user chose this deck to receive a real copy of the requested printing.
8. **Planned (alt printing available):** Another deck now has the last requested copy, but this slot can switch to an available alternate.
9. **Planned (claimed by another deck):** Another deck now has the last usable real copy. This slot can use a proxy or remain Planned.
10. **Planned (alternate selected):** The user selected another printing, but has not yet chosen to allocate its physical copy.
11. **Sleeved (alternate printing):** The user chose this deck to receive a real copy of the alternate printing.
12. **Proxy:** The user chose a proxy instead of allocating a real copy.
13. **Planned (in the system):** The import is finished without allocating a physical copy. The slot remains Planned in the deck and is no longer an outstanding import decision.
14. **Planned (recalculated):** The previous allocation decision is released, and every affected slot is recalculated.

---

## Important Process Rule

Example: Two imported built decks request one available Felothar printing.

1. Neither deck should receive it automatically.
2. Both begin as **Planned (conflict)**.
3. Both initially offer Sleeve.
4. When the user Sleeves Felothar into one deck, that deck becomes **Sleeved (owned)**.
5. The other immediately becomes either:
   - **Planned (alt printing available)** if another printing is free, or
   - **Planned (claimed by another deck)** if no usable printing is free.
6. Sleeve is disabled for the remaining deck.

This means automatic allocation can only happen when the complete set of competing import requests fits within supply. The app must assess the whole import batch before allocating; otherwise, processing decks one at a time would silently choose which deck "wins," contrary to the rule that users decide.
