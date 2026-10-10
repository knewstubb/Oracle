# Report: card-deck-state-permutations
Role: Orchestrator
Status: DONE
Task as received:
> This makes sense.
> We also need Proxy available
> Can you run through all the permutations of what state a card or deck can be in and what cations can be performed and chack to see if we have gaps
> Claim is one (pull a sleeved card from another deck) but not sure about that word

## Summary for the owner
The proposed states cover the ordinary cases when availability, physical placement, and copy type remain separate. Recommend "Move from [deck]" instead of Claim, and distinguish a proxy already owned from one merely planned. The remaining gaps concern overlapping choices, incomplete or invalid decklists, missing copies, Maybeboard, and actions that affect more than one deck.

## Changed files
- `docs/oracle/reports/2026-09-29-orchestrator-card-deck-state-permutations.md` - recorded the state/action matrix, permutation coverage, current implementation evidence, and unresolved product decisions.

## Scope and decision status

The owner's acceptance establishes the direction discussed in the previous turn: Sleeved/Unsleeved for card placement and the import physical-state question, and Draft/Assembling/Playable for decks. Proxy available is an additional owner-requested availability label.

This is a behavioural review, not an implementation spec or a claim that the app already follows the proposed model. Additional rules and wording below are recommendations, not silently approved decisions. No application code, stored data, or locked decisions were changed.

Coverage is ownership, supply, deck membership, copy placement, readiness, import, and transitions between them. Independent activities such as renaming decks, editing notes/categories, or viewing prices do not add lifecycle states and are outside this matrix.

## 1. Independent facts

| Fact | Values or scope | Important distinction |
|---|---|---|
| Card membership | Not in this deck; main list; Maybeboard | Being in the collection is independent of deck membership. |
| Main-list placement | Unsleeved; Sleeved | Unsleeved does not reserve or own a physical copy. |
| Assigned copy type | Original; Proxy | Only an actual assigned copy has an actual type. An unsleeved slot can have a preferred type, but that is intent rather than ownership. |
| Printing and finish | Specific requested printing or unconstrained printing; finish is separate | An alternate is still the same card identity. Do not silently change the selected copy or its finish. |
| Physical copy location | Free in storage; sleeved here; sleeved elsewhere; missing | Every actual copy is tracked independently, including proxies. |
| Available options | Free original matching the request; free alternate original; free proxy; copies elsewhere | More than one can be true at once. |
| Deck readiness | Draft; Assembling; Playable | Full list and physical completeness are different questions. |
| Operational state | Loading; failed; saving; stale/concurrently changed | These are not ownership labels. |
| Workflow flags | Wishlisted; proxy planned; archived; import decision pending | None creates a physical copy or automatically makes a deck Playable. |

Existing data rules require per-copy tracking for originals and proxies, separate printing/finish identifiers, and a separate Maybeboard relation. [Confirmed: docs/oracle/decisions.md]

## 2. Availability permutations

### Recommended headline priority

**Available > Alt available > Proxy available > Unavailable > Unowned.**

This is a display preference for review, not automatic allocation or a rule forcing originals over proxies. All valid alternatives remain available in the action panel.

| Free requested original | Free alternate original | Free proxy | Recommended headline | Available choices |
|---|---|---|---|---|
| Yes | Yes | Yes | Available | Sleeve requested original; choose alternate; sleeve proxy. |
| Yes | Yes | No | Available | Sleeve requested original; choose alternate. |
| Yes | No | Yes | Available | Sleeve original; sleeve proxy. |
| Yes | No | No | Available | Sleeve original. |
| No | Yes | Yes | Alt available | Choose alternate; sleeve proxy. |
| No | Yes | No | Alt available | Choose alternate and sleeve it. |
| No | No | Yes | Proxy available | Sleeve an existing physical proxy. |
| No | No | No | Unavailable or Unowned | Use the owned-copy distinction below. |

For any row, copies held elsewhere add a **Move from [deck]** option; their existence must not hide free choices or vice versa. A card already sleeved here keeps its Sleeved/Original-or-Proxy presentation; these availability calculations describe unassigned slots and possible replacements, not the current copy's own availability.

### No-free-copy cases

Recommend **Unavailable** if any actual copy is still recorded as owned but is unusable here; explain the reason and copy type:
- Original sleeved elsewhere: "Original in Korvold."
- Proxy sleeved elsewhere: "Proxy in Korvold."
- Originals and proxies elsewhere: list both choices and their source decks.
- Only missing originals/proxies: "Missing"; no Sleeve or Move action on those copies.
- Held and missing copies: show the held candidates; missing copies remain ineligible.

Recommend **Unowned** only when neither original nor proxy is owned. This closes the otherwise misleading case where a proxy is owned but sleeved elsewhere. It refines the earlier discussion's original-only interpretation of Unowned and therefore needs confirmation. If the owner instead wants Unowned to mean "no original", original ownership and proxy availability must be separate displayed facts rather than mutually exclusive labels.

An original or proxy that has actually been sold/given away is not still owned. Current missing handling describes lost, damaged, sold, and given-away copies under one flag; a future ownership contract should distinguish absence from disposal rather than calling sold cards merely unavailable. [Confirmed: src/lib/missing.ts]

### Exhaustive bounded enumeration

Enumerated seven independent supply-presence flags in session-only storage:
1. Free requested original.
2. Free alternate original.
3. Free proxy.
4. Original held elsewhere.
5. Proxy held elsewhere.
6. Original missing.
7. Proxy missing.

All 128 combinations map to one proposed headline: 64 Available, 32 Alt available, 16 Proxy available, 15 Unavailable, 1 Unowned; zero unmapped combinations. This demonstrates coverage of the proposed presence/absence model, not correctness of current code or approval of priority/ownership definitions.

Quantity is an additional overlay, not another ownership label. For example, two unsleeved slots can both see one free copy, but it can satisfy only one. Show "1 available; 2 decks need it" during reconciliation and re-evaluate every affected slot after a choice. Never reserve a copy merely because a slot is Unsleeved, or allocate a contested copy silently. Preserve the approved batch-reconciliation and sequential-import distinctions. [Confirmed: docs/oracle/import-reconciliation-states.md] [Confirmed: docs/oracle/status.md]

## 3. Card-state action matrix

These are state-changing actions, not a prescription to put every option on every row. Common deck-list actions should live in a consistent menu.

| Card state/context | Primary or conditional actions | Result/invariant |
|---|---|---|
| Not in this deck, any ownership | Add to deck; add to Maybeboard | Add a list entry without creating or assigning a physical copy. Duplicate/format limits still apply. |
| Maybeboard, any availability | Add to main list; remove from Maybeboard; choose preferred printing | Recommended default: no copy reservation, no deck-readiness contribution. Whether sleeving Maybeboard is allowed needs explicit agreement. |
| Unsleeved + Available | Sleeve original; choose another available copy; sleeve proxy if also free | Sleeve exactly one selected copy into this slot. Other copies remain where they are. |
| Unsleeved + Alt available | Choose printing, then Sleeve; optionally sleeve a free proxy or move a copy from another deck | Choosing a printing alone does not claim a copy or make the slot sleeved. |
| Unsleeved + Proxy available | Sleeve proxy; optionally move an original from another deck | Use an existing physical proxy, not create a duplicate proxy. |
| Unsleeved + Unavailable, copy elsewhere | Move from [deck]; use any other free option; record a genuinely new copy/proxy; wishlist | The donor retains its list entry, which becomes Unsleeved. |
| Unsleeved + Unavailable, only missing copies | Mark found when physically recovered; record another actual copy; wishlist | Finding a copy returns it to free storage; it is not automatically re-sleeved. |
| Unsleeved + Unowned | Wishlist; record an acquired original; record a newly made proxy; remove or keep Unsleeved | Intent to buy or print must not become physical inventory. |
| Sleeved + Original | Unsleeve; move to another deck; change copy/printing; replace with an actual proxy; remove from deck; mark missing | Never reclassify the same physical original as a proxy merely to free it. Replacing copies releases the outgoing copy. |
| Sleeved + Proxy | Unsleeve; move to another deck; replace with original; change proxy; remove from deck; mark missing | The outgoing proxy remains an owned physical copy in storage unless explicitly disposed of. |

For any main-list entry, Remove and Move to Maybeboard are distinct from Unsleeve. Recommended Move to Maybeboard releases a sleeved copy and removes the card from the required deck count; this is a proposed interaction rule, not inferred approval.

### Action vocabulary and transitions

| Label | Meaning |
|---|---|
| Add to deck | Include the card in the intended list, initially Unsleeved. It is not "add a physical copy to collection". |
| Sleeve | Assign an existing, usable physical copy after explicit selection/confirmation. |
| Unsleeve | Return the copy to storage and leave the deck-list slot in place. |
| Remove from deck | Delete the list entry and release any assigned copy; do not delete the physical copy. |
| Move from [deck] / Move to [deck] | One cross-deck transfer viewed from the destination/source respectively. Not a new ownership state. |
| Choose printing | Change an unsleeved slot's requested version without moving a physical copy. |
| Change copy | Replace the physical copy in a filled slot, preserving card identity and list size. Includes original-to-proxy, proxy-to-original, and printing/finish changes. |
| Swap card | Replace one card identity in the list with another, preserving intended list size. Different from Change copy. A useful later convenience, not assumed implemented. |
| Sleeve proxy | Assign an existing physical proxy. |
| Add proxy | Record a proxy that physically exists; sleeve it only if the user explicitly confirms that placement. |
| Plan proxy / wishlist | Intent only, remaining Unsleeved. A possible secondary flag, not a third copy type or automatic readiness. |
| Mark missing / Mark found | Remove a lost copy from usable supply / return it to supply without auto-assignment. |
| Undo | Restore the precise earlier state if still possible; report a conflict if intervening changes prevent it. |

### Transfer example

Prosper needs Sol Ring. Its selected copy is sleeved in Korvold. Label the action **Move from Korvold**.

Suggested confirmation: "Move Sol Ring from Korvold to Prosper? Korvold will become Assembling." Only name that status transition when Korvold was actually Playable; for an already incomplete/draft deck, describe the slot becoming Unsleeved instead.

On success: Prosper's target slot is Sleeved; Korvold's same list entry remains but is Unsleeved; ownership and copy count are unchanged. Recompute both decks, collection availability, and any other unsleeved slots that depend on that supply. Use the same transfer policy regardless of whether the donor is Draft, Assembling, or Playable. A Draft can still hold a real copy.

If the target already has a copy, this is replacement, not ordinary Sleeve. The outgoing copy needs a defined storage destination. If the target does not yet contain this card, offer an explicit Add-to-deck step rather than silently adding it or swapping out another card.

## 4. Deck permutations and transitions

| List state | Physical state | Recommended readiness |
|---|---|---|
| Empty or short | None, some, or every existing entry sleeved | Draft. A fully sleeved 82-card Commander list is not Playable. |
| Overfull or still being edited | Any | Draft with a specific count/editing explanation; do not label it Playable. |
| Complete | No entries sleeved | Assembling. |
| Complete | Some entries sleeved | Assembling. |
| Complete | All entries sleeved as originals | Playable, subject to agreed format/readiness rules. |
| Complete | All entries sleeved as originals and physical proxies, or all physical proxies | Playable for the owner's proxy-accepting use; show proxy count rather than treating it as a shortage. |
| Any | Assignment/readiness data failed to load | Unknown/loading/error presentation; preserve the last known state as stale rather than invent readiness. |

These apply to the required list, excluding Maybeboard. Use the format's size rule, not a universal count of 100: some formats have a minimum and Casual has no fixed target. [Confirmed: src/lib/format-config.ts]

| Action/event | Resulting deck effect |
|---|---|
| Add cards to a short Draft | Remains Draft until the list is complete; then Assembling unless all required copies are already sleeved. |
| Sleeve the final unsleeved slot of a complete list | Assembling to Playable. |
| Unsleeve, move out, or mark missing one copy | Playable to Assembling; a Draft remains Draft. Keep list entries. |
| Remove a main-list card | May become Draft because the intended list is now short; release the copy. |
| Replace an assigned proxy with an original or change assigned printing | Remains Playable if replacement completes successfully and all requirements still hold. |
| Swap a card identity | Preserve list size; Assembling if the replacement is Unsleeved, otherwise recompute readiness. |
| Break down | Release all assigned copies, preserve the list. Complete list to Assembling; short list remains Draft. |
| Archive / unarchive | Recommended separate visibility flag. Do not silently free cards; offer Break down explicitly if desired. Retirement handling still needs approval. |
| Delete deck | Remove deck/list records, preserve and release physical copies. Requires a clear confirmation. |
| Duplicate deck | Copy list only by default. Complete duplicate is Assembling; never duplicate physical inventory or assignments. |

### Deck gaps needing explicit rules

- **Legality versus assembly:** a 100-card sleeved deck can still have an illegal card, wrong colour identity, duplicate, or no commander. Recommend that Playable not silently promise legal play when known requirements fail; show the concrete issue and agree whether it blocks the label. Unknown legality is also distinct from a failed check. The owner may permit house-rule exceptions.
- **Full-list Draft:** a 100-card list can still be under active design. Decide whether Draft is an owner's explicit designation or derived only from list completeness. That determines whether a "Finish draft" action is needed.
- **Generic basic lands:** the existing model has a `generic_land` exemption without an assigned physical copy. Do not claim "all physically sleeved" solely because those rows bypass tracking. Define either actual assignments using fungible land supply or an explicit physically-sleeved quantity confirmation. D-023 does not authorise inventing owned copies.
- **Zero-target formats:** complete-list intent must be explicit when there is no format target; count alone cannot distinguish Draft from Assembling.
- **Neutral progress versus real errors:** Assembling is not an error. Missing/illegal cards, failed data loads, and overfull lists still need honest explanations rather than hiding every exception behind a neutral label.

Current tile readiness returns green when completeness is absent or all existing slots are filled and only explicitly rejects overcount. That cannot safely become the new Playable calculation without additional rules. [Confirmed: src/components/DeckTile.tsx] [Confirmed: src/lib/card-status.ts] [Confirmed: src/lib/format-config.ts]

## 5. Import permutations

| Physical-state choice | Imported list | Expected outcome |
|---|---|---|
| Unsleeved | Incomplete | Draft; list only, no copy assignment. |
| Unsleeved | Complete | Assembling; list only, no copy assignment. |
| Sleeved | Incomplete | Draft; reconcile the copies actually asserted as sleeved, but do not call the short list Playable. |
| Sleeved | Complete, all copies reconciled | Playable once recorded assignments reflect the physical deck. |
| Sleeved | Complete, conflicting/unowned/alternate/proxy decisions remain | Reconciliation first; if finished with unsleeved slots, Assembling. |

The choice describes intended physical state, not a licence to silently take cards from another deck. Partial physical assembly is a third factual situation: recommend starting from Unsleeved and explicitly sleeving the relevant subset, rather than adding a third top-level import mode. This handling needs an approved interaction for bulk imports.

Proxy choices during reconciliation must distinguish existing proxies from new proxy intent. A printed proxy assigned to a slot can count as Sleeved; a wish to print one cannot. A finalized import with unsleeved slots is handled as an import but not physically complete; it must not keep an outstanding import-conflict badge forever. [Confirmed: docs/oracle/import-reconciliation-states.md] [Confirmed: docs/oracle/status.md]

The existing New cards capability changes inventory and must remain a separate explicit choice from Sleeved/Unsleeved. Importing or reimporting a deck must not duplicate existing copies, overwrite known physical assignments without explanation, or automatically honour external proxy labels contrary to D-019. [Confirmed: src/components/DeckImportButton.tsx] [Confirmed: src/lib/deck-import.ts] [Confirmed: docs/oracle/decisions.md]

## 6. Impossible or unsafe combinations

- One physical copy simultaneously sleeved in two slots/decks.
- One slot containing both an original and a proxy, or two copies.
- A missing copy offered as free or counted as physically sleeved.
- An unsleeved slot silently reserving a copy merely because it appears in a list.
- A proxy merely planned/queued to print counted as physical inventory or a sleeved slot.
- An unowned card with an invented actual Original/Proxy copy solely to satisfy the display model.
- A complete-looking loading fallback interpreted as a verified Playable deck.
- A destructive "Remove" that deletes collection inventory when the user intended to remove a deck-list entry.
- Changing printing/finish metadata on an assigned row without changing/confirming the actual physical copy.
- An undo or transfer that silently displaces an intervening assignment.

Quantities are per physical copy and per slot. Identical names across printings must still resolve by canonical card identity, with printing/finish preserved for assignment. The display must never turn name matching into authority to move the wrong printing or card. [Confirmed: docs/oracle/decisions.md]

## 7. Current implementation gaps relevant to this model

| Gap | Evidence | Consequence for implementation |
|---|---|---|
| No distinct Proxy available status | `CardSlotStatus` has original/proxy/available/alternate/claimed/unowned/generic_land. Unresolved copy queries do not separate proxy supply; the action-context endpoint reports available when any free copy exists. [Confirmed: src/lib/card-status.ts] [Confirmed: src/app/api/decks/[id]/card-actions/[cardName]/route.ts] | Add a shared supply contract and map every consumer, not only a new badge label. |
| Missing eligibility differs between read paths | Status calculation excludes missing copies, while `fetchEnrichedSupply` selects copies without a missing filter. [Confirmed: src/lib/card-status.ts] [Confirmed: src/lib/allocation-candidates.ts] | Contextual Sleeve choices and summary labels can disagree. Shared eligibility must exclude missing copies everywhere. |
| Proxy action combines existence and placement | Add-proxy creates a physical proxy and assigns it to a slot in one call. [Confirmed: src/app/api/allocation/add-proxy/route.ts] [Confirmed: src/components/StatusChipPopover.tsx] | Existing flow is appropriate only if the action explicitly confirms a real proxy and its placement; it must not mean "plan to print". |
| Donor treatment still depends on old status fields | Picklist checks `assignedTo.deckStatus === 'in_rotation'` before confirmation; supply mapping fills `isActive` instead. Popover also references `holder.deckStatus`, while its context supplies `isActive`. [Confirmed: src/components/PicklistV2.tsx] [Confirmed: src/components/StatusChipPopover.tsx] [Confirmed: src/lib/allocation-candidates.ts] [Confirmed: src/app/api/decks/[id]/card-actions/[cardName]/route.ts] | Use consistent transfer intent/impact, not obsolete Draft/Active privilege. Current Picklist can bypass its intended confirmation branch. |
| Transfer refresh is incomplete in some consumers | Picklist calls `invalidateCardState` only for the destination. Popover's confirmed transfer refreshes destination statuses/picklist only. The separate reassign path refreshes both source and target. [Confirmed: src/components/PicklistV2.tsx] [Confirmed: src/components/StatusChipPopover.tsx] [Confirmed: src/hooks/useDeckQueryKeys.ts] | Refresh both decks, collection, and shared availability; otherwise new readiness labels can remain stale after a valid move. |
| Transfer itself already has an atomic path | `claim-from-deck` delegates to `force_claim_copy`; `reassign-to-deck` delegates to `reassign_to_deck`. [Confirmed: src/app/api/allocation/claim-from-deck/route.ts] [Confirmed: src/app/api/allocation/reassign-to-deck/route.ts] | Reuse the move semantics; an owner-facing rename does not require renaming database identifiers. Database internals were not re-audited in this review. |
| Remove, unsleeve, breakdown, and proxy-to-original already have distinct routes | Each uses its dedicated release/replacement operation. [Confirmed: src/app/api/decks/[id]/cards/[cardId]/route.ts] [Confirmed: src/app/api/collection/instances/unassign/route.ts] [Confirmed: src/app/api/decks/[id]/breakdown/route.ts] [Confirmed: src/app/api/allocation/replace-with-original/route.ts] | Preserve these distinctions and collection copies instead of collapsing actions into one ambiguous Proxy/Remove button. |
| Undo must be conflict-aware | Existing route reports slot/assignment conflicts rather than taking another copy or silently falling back. [Confirmed: src/app/api/allocation/undo/route.ts] | Keep that guarantee and surface the reason; do not promise unconditional undo. |
| Found copies deliberately do not auto-sleeve | Missing/found wrapper returns found copies to available storage. [Confirmed: src/lib/missing.ts] | A found card changes available options, not deck placement until explicitly sleeved. |

## New decisions made (need owner confirmation)
- None enacted beyond recording the owner's accepted vocabulary direction and request for Proxy available.
- Recommend Move from [deck] / Move to [deck] instead of Claim/Reassign.
- Recommend one primary availability label, with all alternate actions preserved; prefer free requested original, alternate original, then proxy for the default headline, never automatic assignment.
- Recommend Unowned mean no owned original or proxy, and Unavailable include held/missing proxies with a clear reason.
- Recommend separating physical proxy creation/placement from proxy-printing intent.
- Maybeboard sleeving, archive behaviour, Draft intent, and Playable validation remain proposals requiring approval.

## Assumptions
- Physical proxies are acceptable for the owner's ordinary Commander play, as discussed; external event legality is separate.
- Sleeve is an assertion that the user has physically placed the selected copy, not an automatic inference from availability.
- This is a state/action coverage review, not authorisation to implement or run write paths.

## Challenges to locked decisions
- D-002 - owner has accepted the proposed Draft / Assembling / Playable direction; the prior Brew / Boxed / Archived register remains marked under review. Finalise outstanding readiness/retirement rules and explicitly record the approved replacement before implementation. [Confirmed: docs/oracle/decisions.md]
- No change proposed to D-001, D-003, D-004, D-005, or D-018 through D-024. In particular, generic lands require a deliberate physical-readiness interpretation, not a workaround that invents copies.

## Open questions
- Confirm the headline preference and whether Unowned means no physical copies of either type.
- Confirm that Add proxy records an actual proxy, while a print plan stays Unsleeved.
- Decide whether a full list can remain explicitly Draft and what action ends drafting.
- Decide which known format issues block Playable and how owner-approved exceptions work.
- Define physical confirmation/tracking for generic basic lands.
- Approve Maybeboard and retirement handling before implementing those transitions.

## Verification
- Read the status popover, pull-list actions, enriched-supply/context construction, transfer/replacement/undo/release routes, missing/found wrapper, format configuration, and current reconciliation state rules. No write handlers were invoked.
- Enumerated 128 supply-presence combinations in the per-session database, not Oracle's database; every case maps to one proposed availability headline. Also enumerated all eight free-original/alternate/proxy combinations and three valid main-slot placement forms (Unsleeved, Sleeved original, Sleeved proxy).
- Enumeration validates coverage of the proposed model only. It is not a test of current application behaviour, quantity/contention handling, UI wiring, production state, or database transaction implementation.
- No application changes, live requests, deployments, or runtime tests were needed for this review.
