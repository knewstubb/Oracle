# Report: record-readiness-decisions
Role: Orchestrator
Status: DONE
Task as received:
> A proxy exists versus one you intend to print: Proxy is an action as well as a card type. This means adding a new proxy and sleeving it
> Two decks want one free copy: This should not affect the decks but there should be a list to see all these
> A full list is still being designed: Lets keep it simple. Some systems say 100 cards for a commander deck with a commander is legal. More or less is illegal. We could add the sleeved component to that
> All sleeved, but illegal or overfull: Same as above
> Missing cards and basic lands: Yes. I want a better way to manage basic lands. Lets remove the concept of missing for now
> Archiving versus breaking down: This should be a folder, not an action
> Loading failures: Agree

## Summary for the owner
Recorded the agreed simplified rules: deck readiness follows list completeness and physical sleeving; Proxy creates and sleeves a new proxy; competing demand lives in a separate list. Missing is to be retired and archived decks organised in a folder. No app behaviour or stored data changed; existing Missing records and the basic-land interaction still need a safe, explicit treatment.

## Changed files
- `docs/oracle/decisions.md` - replaced the previously deferred D-002 with the approved readiness direction and recorded D-025 through D-031.
- `docs/oracle/status.md` - updated T-25's approved direction, added bounded contract/UX follow-ups T-28 through T-30, and recorded the existing-data/basic-land gate.
- `docs/oracle/reports/2026-09-29-orchestrator-record-readiness-decisions.md` - recorded approval, superseded proposals, implementation boundaries, and evidence.

## Approved interpretation

### Readiness

For the owner's Commander workflow:
- A complete required decklist is exactly 100 cards including the commander(s), with a commander selected, excluding Maybeboard.
- A list that is short, overfull, or lacks its commander is Draft, with its count/commander issue visible.
- A complete list with one or more Unsleeved required slots is Assembling.
- A complete list with every required slot Sleeved is Playable, whether those copies are originals, proxies, or a mixture.
- Do not add a manual full-list Draft override or a "Finish draft" action to complicate this rule.
- This is a deliberately simple completeness/readiness rule. Do not silently remove existing detailed format information or imply that count alone verifies every official MTG rule. Other supported formats still require their appropriate size rules.

The prior recommendation to gate readiness on a broader set of legality checks is not adopted here. Generic-land physical readiness remains unresolved; it cannot be inferred from a list entry alone.

### Proxy

The owner has explicitly chosen the existing compound meaning of the **Proxy** action: create a new proxy copy and sleeve it into the chosen slot. No separate Plan proxy state/action is required by this workflow.

**Proxy available** is different: a physical proxy already exists and is free. Sleeving it must not create another proxy. A filled slot still requires an explicit replacement flow; this approval does not mean silently converting an original copy into a proxy.

Current `add-proxy` already creates and assigns a proxy and rejects a filled target. The owner has confirmed the desired meaning; this does not mean all other screens already use consistent labels or supply classification. [Confirmed: src/app/api/allocation/add-proxy/route.ts] [Confirmed: src/components/StatusChipPopover.tsx]

### Competing demand

Two decks wanting one free copy is informational cross-deck demand. It must not automatically change their lists, placements, readiness, or add a deck-level conflict badge. Show the card, available quantities/types/printings, and requesting decks in a separate list.

For example, Prosper and Korvold both have an Unsleeved Sol Ring and one copy is free. Both retain their current readiness. The separate overview shows one free copy and two requests; the user decides where to sleeve it. That physical decision then changes assignments and availability normally.

An allocation overview already exists and hosts `CollectionRollupTab`; it is a candidate for reuse, not proof that the requested list is implemented correctly today. The exact title and interaction need a UX spec. [Confirmed: src/app/allocation/page.tsx]

### Missing and basic lands

Retire Missing from the owner-facing product. The current code excludes missing copies from some availability paths and retains them as inventory records. Removing the UI or ignoring that flag could silently make previously unavailable copies appear usable. No such change was made.

T-28 must describe existing-record treatment before any change to eligibility, assignments, or storage. Existing flags/records were not queried against the live database in this turn, so their presence and quantity are not known. No deletion, field drop, or restore-all was authorised.

For basic lands, recommend a quantity-based interaction such as **"Sleeve 12 Forests"**, rather than requiring twelve individual clicks. This is a proposal for owner review, not a decision that supply is unlimited or that lands stop being physical copies.

Current UI already groups some lands, but it also supports generic land entries with no physical-copy reference and conversion actions. The next design must address that distinction, not simply add another quantity control. Preserve D-001/D-021 and the fungible import exception D-023 unless the owner explicitly approves a change. [Confirmed: src/components/generic-land-badge.tsx] [Confirmed: src/components/CardGroupSection.tsx] [Confirmed: src/components/CardsTab.tsx] [Confirmed: src/lib/missing.ts] [Confirmed: docs/oracle/decisions.md]

### Folder organisation

Use a folder for retired/archived decks, not Archive/Unarchive commands or an additional lifecycle state. Moving a deck into that folder must not implicitly release its cards. Break down remains the separate physical operation and preserves the list.

### Failures

Display loading, failure, and stale data honestly. Do not map failed availability to Unowned or absent completeness to Playable. This preserves the owner's explicit agreement to the failure-state recommendation.

## Superseded recommendations

Earlier discussion reports remain historical records. The following are no longer proposals to carry into implementation:
- Considering or owner-facing Planned instead of Unsleeved.
- Theorycrafted instead of Assembling.
- A separate Plan proxy action as a prerequisite for the normal Proxy workflow.
- Manual retention of a complete list as Draft.
- Retaining Missing as a normal product state/action.
- Archive/Unarchive as separate lifecycle actions.
- Competing unsleeved demand creating warnings or changing readiness on individual decks.
- Automatically adding comprehensive legality checks as new gates to the agreed simple readiness rule.

The recommendation "Move from [deck]" instead of Claim remains a UX wording proposal; this turn did not explicitly settle it. Availability headline priority and proxy-only ownership wording likewise still require a consistent contract/spec rather than independent screen-level guesses.

## New decisions made (need owner confirmation)
- No unapproved product decisions enacted. Updated the register only for the owner's current decisions and previously accepted vocabulary/readiness direction.
- Quantity-based basic-land controls, demand-list title/layout, and treatment of existing Missing records remain proposals/open work.

## Assumptions
- The owner is resolving product rules in the ongoing design discussion, not authorising implementation, deployment, migration, or destructive data operations.
- "This should be a folder" refers to archiving; Break down remains the previously accepted action for releasing physical copies.
- The Commander count includes the commander(s) and excludes Maybeboard, consistent with the separate-membership model.
- The request for a separate demand list does not authorise bypassing actual copy uniqueness or silently allocating contested supply during import.

## Challenges to locked decisions
- D-002 - previously challenged in the vocabulary/permutation reports; now replaced with the owner-approved Draft / Assembling / Playable direction and simple count/commander/sleeving rules.
- No other existing locked data/placement decisions were changed or bypassed. D-025 through D-031 record the new approved direction; implementation remains pending.

## Open questions
- Existing Missing records: if any exist, obtain owner approval for how they are retained, reviewed, or returned to usable supply before changing eligibility.
- Basic lands: approve the proposed quantity-based workflow and how actual physical sleeving is recorded.
- Final UX/contract: availability priority/mixed original-proxy supply, transfer action wording, and the demand-list interaction.
- The earlier roadmap/current-milestone discrepancy remains recorded as O-006; this turn did not approve a milestone transition.

## Verification
- Read the current decisions/status and working-tree state before editing; preserved earlier review reports and unrelated files.
- Read the allocation page, generic-land badge, and relevant land-grouping references; recommendations reuse existing surfaces without claiming new behaviour.
- Relied on the directly reviewed proxy and missing-state routes/wrapper from the immediately preceding state audit.
- Documentation-only changes. No application changes, live database requests, runtime tests, migrations, or deployments.
