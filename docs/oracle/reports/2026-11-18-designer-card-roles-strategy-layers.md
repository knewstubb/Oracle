# Report: card-roles-strategy-layers
Role: Designer
Status: DONE
Task as received: Revise the card roles and deck jobs design documents (brief, spec, mockup; documents only) for the owner decisions of 2026-11-18: (1) jobs versus categories, option A, keep both and make the difference obvious; (2) builds and strategy are one tab in layers (Build, Your strategy, Card jobs); (3) "rules" becomes "strategy points", strategy notes box becomes Notes; (4) health numbers: the build's typical numbers first, then common groups, then strategy points and jobs adjust, with the source named on screen.

## What changed
- **Brief:** new section 2d quotes the four decisions and lists what they touch; section 1 rewritten; new section 7a (jobs vs categories, how to avoid confusion when a category is named like a job); the Strategy tab section rewritten as three layers with an example of how they read together; Q6 rewritten (order of sources, build column in the roll-up table); new section 7d (two choices for the owner); scenarios S14 to S17; "must never happen" and words updated; slices 4 to 7 reworded; section 12 for Gene updated (D-060, D-062, D-064, D-066, RQ-05 now "strategy points per deck", RQ-04, RQ-06, RQ-07, CC-26 now covers the Strategy tab including the build picker fold-in).
- **Spec:** version 3. Card window Category and Job fields with hints (6.2, 6.3), new 6.7 (keeping category and job apart) and 6.8 (Group by Category or Job, hidden until jobs exist). Section 8 rewritten as three layers (8.1 to 8.7, new state I, Link commander flow). Section 10 rewritten (target source order, source words on every row, roll-up table with build column, change notice for build picks). Section 13 worked decks redone with common-guide numbers and the empty Build layer. Edge cases, hand-off notes and open items updated.
- **Mockup:** same file and styling. Strategy tab states A, B, C, C2, E to H, phone now show the three layers; new state I (build picked, illustrative numbers); new deck list view with a working Group by switch; card window Category and Job fields with hints in all states; new card window state 8 (Category and Job side by side, plus the "category looks like a job" question from Claude).
- **Rename:** "rule" became "strategy point" in all three documents. Internal ids kept (RQ-05 and so on).

## Changed files
- docs/oracle/briefs/card-roles-and-deck-jobs.md: revised to version 3
- docs/oracle/specs/card-roles-and-deck-jobs.md: revised to version 3
- docs/oracle/mockups/card-roles-and-deck-jobs.html: layered Strategy tab, group-by, field hints
- docs/oracle/reports/2026-11-18-designer-card-roles-strategy-layers.md: this report

## First-design items I had to change
- Q5 (name only). Q6 (sources and numbers). 7c item 1 (answered by decision 4; a smaller choice is in 7d). Strategy tab section order (the old "Commander guide" section is gone). Slices 4 to 7 wording. Q1 to Q4, Q7 to Q10, Claude applying at once up to 120 with batch undo, and 7c items 2 to 5 are unchanged.

## New decisions made (need owner confirmation)
- Brief 7d-1: a deck with no build. I followed the owner's order literally (no build means the common guide). Recommendation: keep today's commander average as a middle step, because otherwise Arti-facts is judged on Ramp against 10 instead of 16 and Interaction against 10 instead of 4.
- Brief 7d-2: the free-text box becomes Notes; today's dated notes list moves under it as "Earlier notes".
- Build layer gets a **Link commander** step for decks with no commander record (new small behaviour; the deck can already store one).
- Interaction target from a build is used only when the build has both removal and wipes averages; otherwise the common guide.

## Assumptions
- "Plan" in Your strategy is the existing win condition field; no new plan field. The playgroup label in the mockup is the existing "table context" field.
- Light is applied to all four groups with the existing "2 or more short" rule, so Arti-facts lands (33 of 36) and Murky Business card advantage (8 of 10) show Light under the common guide.
- Build names, numbers and guide text in mockup state I are illustrative.

## Challenges to locked decisions
- none

## Open questions
- 7d-1 and 7d-2 above.

## Verification
- Playwright (installed Chrome), 1280 and 390 px widths: all 15 tab buttons render and show their section, no page or console errors, Group by switch toggles both ways, no horizontal overflow on phone. Temp screenshots deleted.
- Remaining uses of "rules" (intentional): "rules text" of cards; "allocation terminology rule"; "the rule from vocabulary.md"; the "Light" rule; Trade/Black binder rules; the owner's verbatim quotes ("rules/jobs", "deck rules/strategy"); notes that name the old word ("formerly deck rules", "was commander rules"); "How to avoid confusion"-style generic uses are reworded. The CSS class name `rule` in the mockup is not shown on screen.
- Health sources named in the roll-up: spec 10.2 and 10.4 and mockup tables ("from the Aggro build", "common guide", "adjusted by your strategy point").
- git status: only the three documents and this report under docs/oracle changed (plus the pre-existing untracked .agents/tasks). Nothing committed.
