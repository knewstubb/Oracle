# Plan 3: Faster collection and deck loading

**Status: P1-P3 direction approved on 29 September 2026, including 2-second first-load and 0.5-second return goals. Pick-list assembly and shaped loading feedback added. No new live timings or performance changes have been made.**

**Recommendation:** measure the journeys you use most, remove unnecessary work, then compare the same journeys again. Do not treat a nicer loading animation or older data as a speed improvement.

## Outcome

Collection browsing, searching and opening decks feel responsive without sacrificing correct ownership, current availability or useful error messages.

The pick list is part of the core deck-opening/assembly journey, not a secondary screen to optimise last. It is usable only when it can tell the user where the needed copies are and which actions are valid.

## Journeys in scope

| Journey | What we measure |
|---|---|
| Open Collection in grid and list views | Time until the first page of cards and its controls are usable. |
| Search, filter, sort and change Collection page | Time from the completed input/action until the correct results appear. |
| Open the deck list | Time until the decks are visible with honest readiness information. |
| Open a deck | Time until its card list and essential actions are usable; record later analysis/price loading separately. |
| Open the pick list | Time until outstanding cards, actual storage/source decks, copy types and valid Sleeve/Move actions are usable. Record both a direct visit and navigation from the deck. |
| Sleeve or move through the pick list | Time until the result is reflected in both affected decks and their outstanding-card lists; no stale source locations or duplicate actions. |
| Open import reconciliation | Time until real decisions or an explicit failure are visible. Import processing itself is a separate journey. |
| Return to a recently viewed screen | Whether previously loaded results return promptly and update when relevant cards changed. |

## Approved goals and supporting targets

The owner approved the 2-second first-visit and 0.5-second return goals. These are requirements to measure against, not claims of current performance. Record device, connection and collection size before comparison; report an unmet goal rather than quietly loosening it.

| Measure | Target | Review state |
|---|---|---|
| First usable Collection/deck content | Within 2 seconds for at least 95% of the measured visits. Include pick-list usability in the deck-assembly profile. | Approved initial goal. |
| Return to a recently viewed Collection/deck | Within 0.5 seconds for at least 95% of visits when its saved results remain valid. | Approved initial goal. |
| Search results | Within 1 second of the last keystroke for at least 95% of searches, including one 0.3-second pause before searching. | Supporting target proposed for baseline review. |
| Immediate action feedback | Show that a click was accepted or is processing within 0.1 seconds; never announce success before completion. | Supporting target proposed for baseline review. |
| Reconciliation | Establish its own measured target after the baseline; do not assume it should have the same budget as one page of collection cards. | Baseline required. |

"95%" means the experience should meet the target reliably, not just once on the fastest run.

## How we will measure fairly

- Use a verified read-only target or an isolated representative copy of the data. No surprise stress testing against the shared live collection.
- Record collection/deck size, browser, device and connection conditions.
- Separate a first visit with no saved browser results from a return visit. Record unusually slow server starts separately rather than mixing them into an unexplained average.
- Collect at least 20 repetitions per measured journey/profile once the measurement target and request volume are approved. Run journeys sequentially, not as an artificial traffic spike.
- Compare before and after using the same data and conditions. Include a desktop profile and an agreed mobile/network profile.
- Record useful screen timing as well as request count and transferred data. A faster individual request does not prove a faster usable screen.
- Record failures and timeouts rather than discarding them to improve the figures.

This is measurement work first. If safe access is unavailable, report the missing input instead of inventing timings or bypassing environment safeguards.

## Proposed improvement order

The review identified the following candidates. Their user-visible payoff still needs measurement.

| Priority | Proposed change | What you should notice |
|---|---|---|
| 1. Stop duplicate work | Avoid fetching the hidden Collection view; remove the second search pause. | Faster typing-to-results and less unnecessary work when changing views. |
| 2. Fetch the page you need | Stop reading and sorting the whole collection just to display one page. | Collection list, filtering and sorting remain responsive as the collection grows. |
| 3. Shorten deck-opening waits | Combine repeated information requests and run independent work together. Load secondary information separately where appropriate. | Cards become usable sooner without waiting for every supporting panel. |
| 4. Make assembly responsive | Measure pick-list source lookup and post-Sleeve/Move refresh, removing unnecessary repeated work without hiding locations. | Users can find and sleeve cards promptly and trust the source shown after a transfer. |
| 5. Recheck remaining bottlenecks | Re-measure deck list, reconciliation and image/rendering work. | Follow-up work addresses the actual remaining delay rather than the most visible spinner. |

The previous reconciliation timeout fix is not assumed broken. Revisit it only if measurements show a current problem.

## Loading feedback

Use skeletons shaped like the incoming content for initial loads: card tiles for a grid, header/card rows for a deck, and source headings/card rows for the pick list. Reserve enough space to avoid large layout shifts.

Use scoped spinners for a pending Sleeve/Move/Proxy action or a refreshing section. Preserve already usable results during refresh; disable only actions whose pending or stale state makes them unsafe. Label the waiting state accessibly and respect reduced-motion preferences.

Prices and analysis can arrive after usable cards. A pick-list row that lacks its source location or eligibility is still loading those essential details, not successfully loaded with an invented default. Loading indicators do not replace the measured timing goals.

## Correctness guardrails

Faster loading must still preserve:
- The same matching cards, ordering, complete totals and stable page boundaries.
- Original/proxy distinctions, printing and finish, and the approved basic-land rules.
- Fresh availability and readiness after a sleeve, transfer, Proxy or Break down.
- Both source and destination updates after moving a copy.
- Correct pick-list locations, including proxies held in other decks; generic basics excluded from outstanding pulls because they automatically count as Sleeved.
- Honest loading/error states. Keep prior results visible where useful, but clearly identify when they are refreshing or stale.
- No lost actions when the user clicks again, changes filters quickly or navigates away.

A proposed speedup is rejected if it achieves its number by showing incorrect results, hiding failures or leaving ownership stale. Changing stored-data structures still needs separate approval.

## Delivery sequence

| Stage | Deliverable | Finish condition |
|---|---|---|
| 1. Baseline | A short before table for the journeys above, including failures and cold/return visits. | Device, data size and conditions are stated; targets are agreed. |
| 2. Small fixes | Duplicate-request and search-delay improvements in separate bounded changes. | Before/after comparison shows the benefit without changing results. |
| 3. Larger fixes if justified | Collection-page and deck-loading improvements supported by the baseline. | Any stored-data changes are approved; correctness remains intact. |
| 4. Final comparison | Before/after figures and any remaining slow journeys. | Agreed targets are met, or unmet targets and their causes are explicitly reported. |

The Architect prepares the baseline and scope. Backend and Frontend implement the relevant approved fixes. This can run alongside behaviour/design planning, but changes to the same screen must be coordinated.

## Owner feedback recorded

| Ref | Direction | Owner response |
|---|---|---|
| **P1: Priority** | Collection browsing/search first, then opening decks, explicitly including the pick-list assembly journey. | Order agreed; pick list emphasised as important. |
| **P2: Targets** | 2-second first visit and 0.5-second return visit as initial goals. | Agreed. |
| **P3: Loading presentation** | Usable primary content first, secondary prices/analysis later; scoped spinners and correctly shaped skeletons. | Agreed, with explicit loading-feedback requirement. |

## Boundaries

No infrastructure replacement, public multi-user scaling project or whole-app rewrite. AI response speed is outside this first pass. This plan does not promise that every fix fits in two days; finish the highest-value bounded changes rather than rushing incomplete ones.

Behaviour requirements come from [Plan 1](01-behaviour-and-actions.md); common loading/error presentation comes from [Plan 2](02-components-and-screens.md).

## Review notes

**Your decision:** P1-P3 direction approved.  
**Still needed before measurement:** a verified safe target, device/network profile and approved request volume; supporting search/action/reconciliation budgets remain for baseline review.  
**Approval allows:** the baseline on an explicitly verified safe target. Implementation, stored-data changes and release remain separately reviewed.
