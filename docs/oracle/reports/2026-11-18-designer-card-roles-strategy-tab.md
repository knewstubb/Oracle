# Report: card-roles-strategy-tab
Role: Designer
Status: DONE
Task as received: Finalise the design for card roles and deck jobs by recording the owner's answers (Q1 to Q10) and extending the design with the deck Strategy tab. Brief, spec and mockup updated by earlier steps; check they agree, fix small gaps, write this report. No commits; documents only.

## Summary for the owner
Your ten answers are recorded, and Claude's freedom now works the way you asked: it applies its proposals at once, marks them "Proposed by Claude", never overwrites what you set, and you can Undo one card or a whole batch with one click. Only a request above 120 cards waits for your approval. The Strategy tab is redesigned as the home for the deck's plan, jobs, rules, Claude's proposals and health, for computer and phone. There are a few small confirmations for you in section 7c of the brief. Nothing is built and no database change has been made.

## Changed files
- `docs/oracle/briefs/card-roles-and-deck-jobs.md` — answers Q1 to Q10 recorded, health groups, Strategy tab, slice plan, Gene suggestions (earlier step; checked, no edits needed now)
- `docs/oracle/specs/card-roles-and-deck-jobs.md` — full spec including Strategy tab states A to H (earlier step; checked, no edits needed now)
- `docs/oracle/mockups/card-roles-and-deck-jobs.html` — Strategy tab views and seven card window states (earlier step; checked, no edits needed now)
- `docs/oracle/reports/2026-11-18-designer-card-roles-strategy-tab.md` — this report

## New decisions made (need owner confirmation)
- Brief 7c: (1) health target is the commander's typical number when it exists, with the common guide beside it; (2) Claude's proposals count in health at once, labelled; (3) Interaction includes Hand disruption and Counterspell, not Graveyard hate or Stax/tax; (4) Strategy tab shown on phone; (5) Ask Claude fills the chat and waits for Send.
- Spec 17, items 6 to 9: no full history of your own edits for now; Claude remembers dismissed proposals; Undo all leaves already-accepted items alone and says which; keep the word "Standard".
- Suggested decisions D-060 to D-066 and backlog changes (CC-26 added; RQ-12 replaced; RQ-01, RQ-02, RQ-05, CC-11 folded in; RQ-04 jobs folded in, locked flag later; RQ-06 and RQ-07 partly touched; RQ-03 later) are listed in brief section 12 for Gene. Gene has not applied them.

## Assumptions
- Not confirmed from a source (no web access): the Rachel Weeks interaction number; the Command Zone template figures (about 10 ramp, 10 to 12 card advantage, about 10 targeted and 3 mass disruption, 36 to 38 lands), which are from memory.
- The Interaction common guide of 10 is my own assumption, between today's 8 and a roughly 13 from the template.
- Today's guide numbers (ramp 10, draw 10, removal 6, wipes 2, lands 36) come from the app's health code; their origin is not recorded.
- Counts such as "51 jobs" in the Arti-facts walk-through are illustrative.
- A request proposing a role and a job for one card counts once toward the 120 limit; the Architect must confirm.
- "Mendicant" = Arti-facts, "Rocco" = Rocco's Secret Sauce, "Myrkul" = Murky Business.

## Challenges to locked decisions
- D-034a — the decision still says "about 10" direct changes, but CC-13 already moved this to 120 and a Gene amendment is pending — amend both together when recording D-063.

## Open questions
- Owner: the nine items above (7c and spec 17).
- Someone to check the Rachel Weeks and Command Zone numbers before they are locked.
- Architect: contract for DB-1 to DB-4 (proposer and "still to look at" state, batch id, remembered dismissals), tried on a throwaway copy, owner approval first. None applied.

## Verification
- Read the brief, spec and mockup together. Result: Q1 to Q10 are all marked Answered; Q6 and Q8 are rewritten with the owner's quotes; the roll-up table (Lands 36, Ramp 10, Card advantage 10, Interaction 10, Plan and win conditions with no judged number) is identical in brief and spec and matches the mockup's health tables.
- Searched all three for approval-wait wording: it appears only for the above-120-cards case (spec 7.1, state H; mockup state H and card window state 7; brief Q8). Normal sizes say "applied at once".
- Slice plan places the Strategy tab at slices 4 to 7; its database needs sit inside DB-1 to DB-4, flagged "needs owner approval", never applied. Brief section 12 lists decision text and backlog changes, with RQ-12 replaced by CC-26.
- Mockup step (earlier): opened in Playwright, clicked all 12 tabs, each showed only its own view, no script errors; temp screenshots deleted.
- Screenshots viewed in that step: Strategy C (proposals bar, intent, job bars, rule card, health table with Light marker, open roll-up; nothing overlaps); Strategy A (empty text, Ask Claude menu, health numbers not zeros, prefilled chat with Send); Strategy E to H (loading skeletons, failed section with Try again, greyed offline buttons, amber "Waiting for your approval: 150 changes", phone frame with 44 px rows); card window state 2 (dashed "Proposed by Claude · already applied" chip, Accept/Change/Dismiss, Strategy tab link). Strategy B, C2 and the other card window states rendered without errors but were not checked by eye.
- `git status --short` — only `docs/oracle/` files from this feature are new. Two untracked items outside docs (`.agents/tasks/`, `supabase/drafts/cc14-backfill-ref-cards.manifest.json`) belong to other work (CC-14 search and earlier tasks), were not created here, and were left alone. No temp scripts from this feature remain. The Playwright log under `.playwright-mcp/` is ignored by git.
