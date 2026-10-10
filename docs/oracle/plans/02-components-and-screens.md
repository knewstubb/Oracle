# Plan 2: Standard components and clearer screens

**Status: U1-U3 direction approved on 29 September 2026, including original-copy shortages despite proxy coverage. No mockups or application changes have been made yet.**

**Recommendation:** standardise a small set of frequently used components, not redesign every screen. Approve one compact visual board, then use those same components throughout the app.

## Outcome

A status means the same thing, looks the same and offers the same appropriate actions wherever you encounter it. Desktop and mobile can have different layouts without becoming different systems.

## Proposed review board

| Example | What you would review |
|---|---|
| Pick-list assembly screen | Outstanding cards grouped by useful source information, exact storage locations/source decks, Original/Proxy and printing details, Sleeve/Move from/Proxy actions, and source changes after a move. |
| Card rows and compact badges | Every availability label; Sleeved/Unsleeved; Original/Proxy; mixed original/proxy choices; long card/deck names. |
| Card actions | Sleeve, Unsleeve, Proxy, Remove and moving between decks. Make creating a proxy visibly different from sleeving an existing one. |
| Deck tiles | Draft, Assembling and Playable, with card and sleeved counts. Assembling is neutral progress, not a warning. |
| Basic-land row | Generic quantities automatically count as Sleeved; tracked printing rows retain real copy availability and sleeving controls. |
| Original-shortage list | Where owned originals fall short of deck requirements, including proxy-filled slots. Show actual proxy usage, existing original supply and additional originals worth considering. |
| Import controls | Sleeved/Unsleeved plus the separate question of whether copies are new to the collection. |
| Feedback | Correctly shaped first-load skeletons, scoped spinners for actions/refresh, retained results while updating, empty results, failed loads and failed actions. |

Each example includes desktop and compact/mobile treatment. The next deliverable is a visual mockup for approval; this document is the plan for that work.

## Shared presentation rules

- Use the approved words, including accessible labels and confirmations, not just visible badges.
- Keep normal ownership quiet. Distinguish proxies and relevant exceptions without using mana colours to communicate status.
- Never rely on colour alone.
- Keep actions visually attached to the card, copy or deck they affect.
- Use one shared approach to menus, buttons, previews, confirmations and notifications.
- Keep essential information available by keyboard and touch; hover must not be the only way to understand a status.
- Do not show both a disabled action and a misleading success message. Explain why an action is unavailable.
- Match skeletons to the screen being loaded: location headings and rows for the pick list, card-shaped placeholders for grids, and appropriate header/list shapes for deck views.
- Use small labelled spinners for the action or section that is waiting. Do not replace an already usable screen with a full-page spinner during a background update.
- Preserve layout while loading and respect reduced-motion preferences. Prices/analysis can arrive later; pick-list locations and action eligibility cannot be faked while waiting.

The existing component library is the starting point. Its examples should use the same components as the actual screens, so the library cannot drift into a separate illustration.

## Basic lands: revised after owner feedback

**Generic basics automatically count as Sleeved.** Example row:

**Forest — 12 generic · Sleeved automatically**

There is no outstanding quantity to sleeve, no physical-copy selection, and no collection inventory created by that row. Increasing or decreasing its main-list quantity adjusts the deck count and its automatically covered quantity. Generic basics do not appear as outstanding pick-list items or shortage requests.

Specifically tracked basic lands still use physical copies. For those rows, **Forest — 12 in decklist · 8 sleeved · 4 unsleeved** remains a useful presentation; originals and proxies are shown separately.

| Action | Proposed behaviour |
|---|---|
| Change generic quantity | The generic quantity automatically counts as Sleeved; no ownership records or physical assignments are created. |
| Change tracked quantity | Add Unsleeved tracked slots when increasing. When reducing below the sleeved quantity, show which physical copies will be released before confirming. |
| Sleeve a tracked quantity | Choose how many available copies to use. If four matching originals are free, sleeve the remaining four in one action. |
| Choose printing | Optionally choose versions rather than handling every identical land individually. No silent changes to already sleeved copies. |
| Unsleeve a tracked quantity | Select how many copies to return to storage while preserving the list quantity. This action does not apply to automatically Sleeved generic basics. |
| Tracked supply is short | Show what is available and what remains Unsleeved. Do not silently take copies from another deck or create proxies. |

This is an explicit readiness exception for generic basics, not unlimited tracked inventory. Changing an already assigned tracked land to generic needs a clear copy-release/confirmation design so its real copy is not lost or left reserved invisibly.

## Pick list: the assembly workspace

The pick list must answer **"Where are the cards I still need to put into this deck?"**, not merely repeat availability badges.

Show the card, exact usable printing/finish, Original/Proxy type, and actual storage location or source deck. Keep Sleeve as the primary action for a free copy and Move from [deck] for a selected held copy; Proxy creates a new copy rather than pretending an existing one is free.

The visual board will demonstrate a storage copy, an existing proxy, a copy in another deck, alternate printings, and an unowned card. It will also show a missing location as "Location not recorded", not guess where the user should look.

After a successful Sleeve, remove that item from the outstanding work or mark it completed consistently. After a transfer, update both decks' pick lists and readiness. After a failure, keep the item unresolved with an explicit error.

## Original shortages: proposed first version

**Working title: Original shortages.** Reuse the existing cross-deck overview where suitable instead of adding another competing destination.

The purpose is **"Where am I relying on proxies, and how many more originals would cover my decks?"** It is not a list of decks that cannot be played.

| Card | Copies needed across decks | Originals owned | Proxies sleeved | Additional originals needed | Decks |
|---|---|---|---|---|---|
| Sol Ring | 2 | 1 | 1 | 1 | Korvold, Prosper |

In this example both decks can be Playable. The row remains because the owner is using one proxy in place of an additional original. Free proxies also do not reduce the original shortfall.

Expand a card to distinguish originals already in decks from originals free in storage, show which decks use proxies, and identify relevant printing options. Account for suitable originals already owned before recommending more: two sleeved proxies with one usable original free means one additional original is needed, not two.

Only actual original shortfalls appear. If enough suitable originals are already owned, proxy usage alone does not create a purchase shortage; replacing those proxies remains an explicit card action. Generic basics and Maybeboard do not create required original demand.

Proposed visual emphasis: proxy usage and additional originals needed, with links to the affected decks. The exact column order, grouping and sorting remain for the visual board. No automatic purchase, proxy replacement, card reservation or deck-readiness change occurs.

## Owner feedback recorded

| Ref | Updated direction | Owner response |
|---|---|---|
| **U1: Basic lands** | Generic basics are automatically considered Sleeved; retain tracked-copy rules for specifically tracked basics. | Replaces the earlier proposal that generic basics require physical confirmation. |
| **U2: Card actions** | Useful primary action on the row; less frequent actions in a consistent menu. | Agreed. |
| **U3: Original shortages** | Shortages in owned originals, including requirements currently covered by proxies. Show proxy usage to help decide whether to obtain more originals. | Clarified: proxies do not cancel an original shortfall, even when decks are Playable. |

Exact appearance, colour choices, spacing and confirmations remain for the visual board. This plan does not treat those as already approved.

## Delivery sequence

| Stage | Deliverable | Approval or finish condition |
|---|---|---|
| 1. Align | Use the shared behaviour plan and list the existing components to reuse or consolidate. | No competing interpretation of the same status/action. |
| 2. Show | Produce the compact visual board above. | Owner approves layout, wording, density and action consequences. |
| 3. Build the shared pieces | Status presentation, pick-list/card rows and actions, deck readiness and shaped loading feedback. | The library and production screens use the same pieces. |
| 4. Apply in batches | First the pick-list-centred Sol Ring journey; then remaining Collection/deck views, imports, lands and demand. | Each batch works on desktop/mobile; old duplicate presentations are retired only after their consumers have moved. |

The UX/UI role owns the examples and interaction spec. Frontend implements approved examples; changes to action behaviour must match the shared behaviour contract rather than being invented during styling.

## What counts as finished

| Review scenario | Expected result |
|---|---|
| Open the same card in Collection, a deck and the pick list | Consistent copy facts, wording and appropriate actions. The pick list names the actual source location or deck. |
| Inspect Proxy available, then choose Proxy | Existing-copy sleeving and new-proxy creation are clearly different choices. |
| Select a Collection status filter | Results actually change; a highlighted control alone is not sufficient. |
| Complete a deck using proxies | It can be Playable, while its proxy count remains visible. |
| Two decks use one original and one proxy | Both can be Playable while the separate list shows one additional original needed. |
| Two decks use proxies and one suitable original is free | Show two proxies in use but only one additional original needed. |
| Add twelve generic Forests | All twelve count as Sleeved immediately, without creating copies or outstanding pick-list entries. |
| Sleeve four remaining tracked Forests | The quantity updates correctly without twelve separate card interactions. |
| Move a copy through the pick list | Both source/destination pick lists and readiness update; the donor keeps its Unsleeved list entry. |
| Move a Sleeved card to Maybeboard | Its copy returns to storage and the card no longer contributes to required deck readiness. |
| Inspect original shortages | Include proxy-filled requirements, not only Unsleeved cards. Decks and assignments remain unchanged until an explicit action. |
| Navigate by keyboard or on a phone | Status meanings, previews and actions remain accessible. |
| Encounter a failed load or save | Clear failure and recovery, not empty success or lost visible data. |
| Open or refresh the pick list | Initial skeletons match location headings and rows; refresh keeps useful existing content visible with appropriate scoped feedback. |

## Boundaries

No whole-app visual rebrand, new design system, new Brew Canvas, dark/light theme project or new advisor feature. Removing Missing from the interface depends on safe handling of existing records; this work must not quietly change which physical copies count as available.

Depends on [Plan 1: Behaviour and actions](01-behaviour-and-actions.md). It can proceed alongside the read-only measurement work in [Plan 3: Faster loading](03-loading-performance.md).

## Review notes

**Your decision:** U1 revision, U2 and clarified U3 approved.  
**Still open:** actual mockups, source-grouping layout, original-shortage presentation and confirmations require visual approval.  
**Approval allows:** creating the detailed visual board/spec. The mockup still requires your approval before application implementation.
