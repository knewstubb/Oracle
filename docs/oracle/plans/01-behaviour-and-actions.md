# Plan 1: Consistent card and deck behaviour

**Status: Behaviour direction approved on 29 September 2026, including generic lands, the pick list and original-copy shortages. Implementation has not started.**

**Direction:** make every screen agree about the same physical cards before replacing its presentation. Make the pick list the practical place to assemble a deck: show exactly where needed copies are and let the user sleeve or move them there. Apply the same rules across Collection, decks, imports and existing recommendation cards.

## Outcome

You can answer these questions without interpreting different terminology on different screens:

- Is this card sleeved in this deck?
- Which original or proxy can I use?
- Where is that copy, and can I collect it from storage or another deck?
- What will happen to my cards and decks if I choose an action?

## Already agreed

| Subject | Rule |
|---|---|
| Card placement | Sleeved or Unsleeved. |
| Physical copy type | Original or Proxy. |
| Availability labels | Available, Unavailable, Alt available, Proxy available, Unowned. |
| Availability preference | Free requested original first, then alternate original, then proxy; keep the other choices accessible. Unowned means neither originals nor proxies are owned. |
| Commander readiness | Draft if the list is not exactly 100 cards including its commander(s), or has no commander selected. Otherwise Assembling if any required cards are Unsleeved; Playable if all are Sleeved. |
| Generic basic lands | Automatically considered Sleeved. No manual confirmation, inventory creation or physical-copy allocation. Specifically tracked basics still follow ordinary copy rules. |
| Proxy action | Create a new proxy and sleeve it into the selected slot. |
| Existing free proxy | Sleeve the existing copy; do not create another. |
| Original shortages | Show where deck requirements exceed owned original supply, including slots already filled by Sleeved proxies. Free or Sleeved proxies do not cancel an original shortfall. The list helps decide whether to obtain more originals; it never changes readiness or assignments. |
| Pick list | Show storage locations or source decks, copy type and printing details, with consistent Sleeve, Move from and Proxy actions. Generic basics are not outstanding pulls. |
| Maybeboard | Moving a Sleeved card to Maybeboard releases its physical copy. Optional membership does not reserve copies. |
| Import | Ask Sleeved or Unsleeved, separately from whether cards are new to the collection. |
| Retirement | Organise decks in a folder. Break down remains the separate physical action. |
| Missing | Remove the concept from the interface, after agreeing how any existing affected copies are handled. |
| Failed loading | Show the problem; never substitute Unowned, Playable or an empty success. |

Maybeboard does not contribute to the required deck count. The Commander rule must not become a universal 100-card rule for other formats. Existing detailed legality information remains separate from this simple readiness calculation.

## Proposed action rules

| Action | What you would see happen |
|---|---|
| Add to deck | An ordinary card appears in the list as Unsleeved; a generic basic land automatically counts as Sleeved. Your collection quantity does not change. |
| Sleeve | One selected free physical copy becomes Sleeved in this deck. |
| Unsleeve | The copy becomes free in storage; the list entry remains. |
| Remove from deck | The list entry disappears. Any sleeved copy returns to storage, not out of your collection. |
| Move to Maybeboard | The optional entry remains, but its assigned copy returns to storage and it stops contributing to the required deck count. |
| Move from / Move to a deck | The physical copy changes decks. The source retains its list entry as Unsleeved. Both decks update immediately. |
| Choose printing | Changes which printing an Unsleeved entry requests. It does not sleeve a copy. |
| Change copy | Replaces the copy in a Sleeved slot, keeping the same card in the list. The outgoing original or proxy returns to storage. |
| Proxy | Creates exactly one new proxy and sleeves it. A filled slot needs an explicit replacement choice, not a second assignment. |
| Break down | All assigned originals and proxies return to storage. The list remains, and readiness is recalculated. Generic basics retain their automatic Sleeved treatment; there is no physical generic copy to release. |

No action may quietly take a card from another deck, switch a printing/finish, delete an owned copy, or leave half of a cross-deck move completed.

## Owner feedback recorded

| Ref | Agreed direction | Owner response |
|---|---|---|
| **B1: Mixed availability** | Requested original, alternate original, then proxy as headline preference. Keep all choices. No owned copies of either type means Unowned. | Agreed. |
| **B2: Moving cards** | **Move from [deck]**, with the source/destination and effect clear before confirmation. | Agreed; must work coherently in the pick list, not just card details. |
| **B3: Maybeboard** | Moving a Sleeved card to Maybeboard releases its copy to storage. | Agreed. |

**Shortage counting clarified:** two decks need Sol Ring and one original plus one proxy exist. The list still shows an original shortfall of one. Both decks may be Playable after those copies are sleeved; the shortage is a reason to consider buying another original, not a claim that either deck cannot be played.

The list must include proxy-filled slots, not just Unsleeved cards. Count originals already owned, including usable free originals that could replace proxies, before suggesting additional copies. Keep proxy ownership separate from actual proxy usage: a spare proxy in storage is not a proxy being played.

This is distinct from the pick list: **the pick list helps assemble a deck; the original-shortage list helps reduce reliance on proxies.**

## Pick-list assembly journey

For every outstanding tracked card, show the actual options and their locations:

| Example option | What the pick list shows | Action |
|---|---|---|
| Free original | Sol Ring, Original, selected printing/finish, Binder A | Sleeve |
| Free proxy | Sol Ring, Proxy, Storage box | Sleeve the existing proxy |
| Copy in another deck | Sol Ring, Original or Proxy, Korvold | Move from Korvold, with the donor impact explained |
| No available physical copy | Card and the unavailable/unowned explanation | Proxy, creating and sleeving a new copy |
| Location not recorded | Explicitly say the location is not recorded; do not invent a shelf or box | Resolve the location or deliberately choose another known copy |

Source grouping and compact row layout will be shown in the visual board. Copy location and eligibility are essential information: the pick list is not finished loading merely because card names have appeared.

## Work sequence

| Stage | Deliverable | Finish condition |
|---|---|---|
| 1. Formalise the agreed meaning | Shared availability, readiness and action rules, including generic lands, pick-list sources and original-only shortage supply. | Include proxy-filled deck requirements and existing original supply; never use proxy supply to erase an original shortfall. |
| 2. Check existing data | A safe transition for old Missing records and any already-assigned land being converted to generic. | No copies are silently deleted or restored; generic readiness never invents inventory. Stored-data changes receive separate approval. |
| 3. Implement one journey | Collection to pick list, Sleeve, transfer, Proxy, Unsleeve and Break down. | Source locations and counts remain correct, and both decks refresh after movement. |
| 4. Apply everywhere | Deck list/detail, Collection list/grid, pick list, imports and existing recommendation displays. | The same card has consistent facts on every relevant screen, including mobile. |

The Architect prepares the precise shared rules. Backend and Frontend implementation starts only after those rules and the related visual examples are approved.

## First delivery: the Sol Ring journey

Start with one free original Sol Ring and no proxies. Korvold and Prosper both have full lists with Sol Ring Unsleeved and every other card Sleeved.

| Step | Expected result |
|---|---|
| View both decks | Both are Assembling. Original shortages shows two requirements against one owned original, without extra deck warnings. |
| Find and Sleeve the original through Korvold's pick list | The pick list names its storage location. Korvold becomes Playable. Prosper remains Assembling. |
| Use Prosper's pick list to Move from Korvold | Prosper becomes Playable. Korvold becomes Assembling but keeps Sol Ring in its list. Both pick lists reflect the new location. |
| Choose Proxy in Korvold's pick list | Exactly one proxy is created and sleeved. Both decks are Playable, but the original-shortage list still shows one additional original needed and one proxy in use. |
| Unsleeve Korvold's proxy | Korvold becomes Assembling. That proxy becomes free; ownership stays one original and one proxy. |
| Sleeve the existing free proxy | Korvold becomes Playable again. No second proxy is created. |
| Break down Prosper | Its list remains intact. Its original returns to storage; no owned cards are lost. |

Additional completion examples: 99 or 101 cards remain Draft even when all existing entries are sleeved; 100 cards without a commander remain Draft; failed lookups show an error; an alternate printing is chosen explicitly; a repeated click cannot create duplicate proxies.

Shortage examples: two proxy-filled slots and no originals shows two originals needed; two proxy-filled slots and one usable owned original shows only one additional original needed. Once enough suitable originals are owned, the original shortage clears without automatically unsleeving or replacing the proxies.

Generic-land example: a full Commander list with 64 tracked cards already sleeved and 36 generic basics is Playable. Those basics create no collection copies and no outstanding pick-list entries. Moving a tracked Sleeved card to Maybeboard releases its copy and removes it from the required count.

## Boundaries

This does not add new advisor features, rebuild Brew Canvas, change the physical-copy model or introduce full new legality rules. It does not deploy changes or decide the fate of existing Missing records.

Basic-land controls are covered by [Plan 2: Components and screens](02-components-and-screens.md). Loading work is covered by [Plan 3: Faster loading](03-loading-performance.md).

## Review notes

**Your decision:** B1-B3 approved; generic-land, pick-list and original-shortage feedback incorporated.  
**Still needed:** detailed matching/transition rules and existing Missing-record disposition before rollout, not another decision about whether proxies offset original shortages.  
**Approval allows:** preparation of the detailed behaviour contract and implementation handoffs; visual, stored-data and release approvals remain separate.
