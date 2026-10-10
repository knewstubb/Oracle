# Report: vocabulary-starting-point
Role: Orchestrator
Status: DONE
Task as received:
> I prefer Available, Unavailable, Alt available, Unowned
> Cards are either sleeved or considering
> A card is either an original or a proxy
> The actions are to sleeve, un-sleeve, remove, add, proxy, breakdown (deck)
> A deck can be playable, theorycrafted, draft
>
> What are your thoughts on this as a starting point?

## Summary for the owner
This is a strong starting point because availability, a card's place in a deck, and copy type become separate facts. The main ambiguity is whether Considering means an undecided candidate or a card already chosen for the deck but not yet sleeved. Deck states and the effect of each action should be agreed before the labels are implemented.

## Changed files
- `docs/oracle/reports/2026-09-29-orchestrator-vocabulary-starting-point.md` - recorded the owner's preferred vocabulary and the remaining behavioural boundaries.

## Assessment

The owner's preferred terms supersede the review's suggested wording as the direction for discussion. They are not yet a complete implementation contract.

### Availability

Recommended interpretation, subject to approval:

| Label | Meaning |
|---|---|
| Available | A usable, unassigned original of the requested printing is available. Preserve approved basic-land exceptions. |
| Alt available | No requested-printing original is free, but another printing has a usable free original. |
| Unavailable | An original is owned, but no usable original is currently free. Give a reason, such as "In Korvold" or "Missing", rather than relying on the label alone. |
| Unowned | No original of any printing is owned. A proxy must not silently count as an original. |

Availability is contextual to the target deck/printing; a copy already sleeved into this deck must not appear unavailable merely because it is assigned. Competing import demand needs explanatory text even when one copy is presently free: "1 copy available; 2 decks need it." Keep that supply-versus-demand fact separate from copies already assigned elsewhere.

This is not only a string substitution. The existing status calculation excludes missing copies and can report unowned when no usable copies remain, or after a lookup failure. A user-facing availability contract must distinguish ownership, usable supply, and failure to load. [Confirmed: src/lib/card-status.ts] [Confirmed: src/lib/card-status.test.ts]

### Deck placement and copy type

- Keep **Sleeved / Considering** independent of **Original / Proxy**. A proxy can be sleeved; Proxy is not a third placement state.
- Recommend defining Considering as "included in this deck's intended list, with no physical copy assigned" if it replaces Planned.
- The unresolved question is whether the owner instead intends Considering to mean "a candidate I might include". That would overlap with the separately modelled maybeboard and needs a different interaction contract, not a global rename.
- Original/Proxy describes a physical copy, or an explicit intended copy type when no copy exists. It must not imply that an unowned card has been added to the physical collection.

Current placement is `planned | sleeved`, while CardsTab handles Maybeboard separately from the main list. [Confirmed: src/lib/card-status.ts] [Confirmed: src/components/CardsTab.tsx] [Confirmed: docs/oracle/decisions.md]

### Actions

Suggested display labels: **Sleeve, Unsleeve, Remove, Add, Use proxy, Break down**. "Break down" is the verb; "breakdown" is a noun.

Recommended boundaries, not enacted behaviour:
- Sleeve assigns a specific physical copy to this deck slot.
- Unsleeve releases its physical copy but keeps the intended deck-list entry, which returns to Considering.
- Remove removes the deck-list entry; if sleeved, release the copy rather than deleting it from the collection.
- Add includes a card in the intended deck list; availability alone must not silently sleeve it.
- Use proxy needs an explicit distinction between using an existing physical proxy, recording a newly made physical proxy, and merely planning to obtain/print one. Do not create an owned physical copy from intent alone.
- Break down releases the deck's assigned originals and proxies while retaining its deck list. Returning the retained list to Theorycrafted is a recommendation requiring approval.

Actions must be visibly scoped: "Remove from deck" and a collection-level removal must never be ambiguous. Preserve the existing placement provenance and undo direction when defining these flows. [Confirmed: docs/oracle/decisions.md]

### Deck states

Recommended interpretation:
- **Draft:** still working out the intended list.
- **Theorycrafted:** intended list is settled but the deck is not assembled.
- **Playable:** assembled and ready to play, including proxies the owner accepts.

These are proposed meanings, not automatic transition rules. Clarify whether Playable is an owner's designation, a computed readiness result, or a designation accompanied by warnings before implementing it. Likewise, decide how retired decks are hidden or archived without adding a competing visible lifecycle.

The current UI exposes Active/Inactive, while legacy types retain Brewing/Active/Graveyard. The locked register's earlier Brew/Boxed/Archived decision is marked under review. Consequently, adopting the proposed three states is a product decision, not a safe label-only change. [Confirmed: src/components/ActiveToggle.tsx] [Confirmed: src/lib/deck-status.ts] [Confirmed: docs/oracle/decisions.md]

## New decisions made (need owner confirmation)
- None enacted. The owner's preferred terms are recorded without altering application code, contracts, specs, or the locked decisions register.
- Recommended action spelling and the behavioural definitions above remain proposals.

## Assumptions
- The user requests feedback on a starting point, not immediate implementation or formal approval of every inferred behaviour.
- Separate availability, deck placement, and copy type should be retained in both data and presentation.

## Challenges to locked decisions
- D-002 - the owner's proposed Draft / Theorycrafted / Playable set differs from the earlier Brew / Boxed / Archived set, which is already marked under review. Recommendation: confirm the new meanings, transition behaviour, and retirement/archive treatment, then update D-002 only after explicit owner approval. [Confirmed: docs/oracle/decisions.md]
- D-005 - no change recommended. Keep Maybeboard separate; do not infer that Considering replaces it.

## Open questions
- Primary owner question: does Considering mean "chosen for the deck, but not sleeved", or "still deciding whether it belongs"?
- Before implementation: define Playable assignment/validation, retirement handling, and what the Use proxy action records when a physical proxy does not yet exist.

## Verification
- Read `src/lib/deck-status.ts` and `src/components/ActiveToggle.tsx`; confirmed legacy lifecycle versus current Active/Inactive presentation.
- Searched `src/lib/card-status.ts` and `src/components/CardsTab.tsx`; confirmed Planned/Sleeved and separate Maybeboard handling.
- Consulted the decisions and state-of-the-nation evidence already read in this session.
- Discussion/report only; no application code, stored data, or locked decisions changed. No runtime validation was needed.
