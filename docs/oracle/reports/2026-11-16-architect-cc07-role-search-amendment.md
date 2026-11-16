# Report: cc07-role-search-amendment
Role: Architect
Status: DONE
Task as received: Owner decision: add searching by ROLE (ramp, draw, removal, wipes, etc., whatever the deck-health classifier produces, from rules text, computed live, nothing stored) to CC-07, reversing the earlier deferral. Categories come later. Amend the contract, its types file and the slices. Decide the safest approach (SQL duplicated vs app-side classify of the filtered candidate set vs stored column), single source of truth, lands excluded, honest counts for the ~100 cards without library facts. Flag any DB change for approval (do not apply). Add a role option to get_collection_summary group_by if cheap. Pending (unanswered, proposed defaults, marked): several keywords = match all; several creature types = match any. No app code.

## Summary for the owner
Claude will be able to search and count your collection by role (ramp, draw, removal, wipes) using the very same rule Deck health uses, worked out at the moment of asking, so the two can never disagree. No database change is needed beyond the view you already approved. Cards with no card information (about 100) and cards with no rules text are never guessed at; the answer says how many could not be checked.

## Decision
Chosen: classify in the app, only on the cards that already passed the other filters, by calling the one shared classifier. Rejected: copying the rules into the database (they would drift; the ramp fix this morning would have needed two edits), and a stored role column (against "nothing stored", needs rewrites on every rule change, library is shared). Detail and the single-source-of-truth tests are in contract section 13. [Confirmed: src/lib/card-roles.ts, src/lib/deck-health.ts, src/lib/spare-copy-browse.ts already uses the same pattern]

## Findings
- Roles are: ramp, draw, removal, wipes. Lands have none and are not a search role (use the land type filter). Rules version is 2 after the cost-reducer fix, so Sapphire Medallion style cards count as ramp. [Confirmed: card-roles.ts; ramp-cost-reducers report]
- Only the front face's text is read; Deck health counts the main deck only and skips the commander, search covers every copy. Both stated in the tool description.
- Cost: at most about 15 small reads of card text per role search (200 names each); ceiling 5,000 distinct cards then a loud failure, never a short list. Timing not measured. [Approximate]
- Role grouping in the summary is cheap (same step). Roles overlap, so groups can add up to more than the total; the answer says so and also shows "No role" and "No facts".

## Changed files
- docs/oracle/contracts/connector-collection-search.md: section 10 superseded; new section 13 (design, rules, inputs, grouping, no DB change, slice changes); pending defaults marked in 12.4
- docs/oracle/contracts/connector-collection-search.types.ts: roles, roles_match, row roles, coverage count for cards without text, rules version, group_by role
- docs/oracle/reports/2026-11-16-architect-cc07-audit-and-slices.md: pointer to amended slices S2, S3, S4
- docs/oracle/reports/2026-11-16-architect-cc07-role-search-amendment.md: this report

## Database change
None. Nothing to approve for roles. The earlier approved view (amended version) is still the only change and is still not applied by me.

## New decisions made (need owner confirmation)
- Several roles in one search = card has ANY of them (PENDING, proposed default; "all" is available, e.g. removal and wipes together).
- Cards with no rules text count as "could not check", not "no role".
- PENDING, proposed defaults in use: several keywords = must have ALL; several creature types = ANY.

## Assumptions
- A types file import from the app's role module is acceptable for a reference file (keeps one list of roles).

## Challenges to locked decisions
- none

## Open questions
- The three pending answers above.
- Should a later version let Deck health's chat and search share a "role of this card" explanation? Not needed now.

## Verification
- Read the classifier, deck health, spare-copy browse and the two earlier reports; no queries run, no migration applied, no app code touched. Live role counts are an S2 acceptance check for the Developer.
