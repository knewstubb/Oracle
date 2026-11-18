# Report: deck-strategy-design
Role: Architect
Status: DONE
Task as received: design the deck strategy store for the Oracle app so the owner can write a deck's strategy and Claude can read and edit it. This round is design plus an unapplied database draft plus a mockup. No app code build. Do not apply anything to any database. (This step: the contract, the spec update and this report. The database draft and the mockup are the next step.) Owner request, verbatim: "The next thing we need to do is the deck strategy. We need a place to log this so that claude can read and/or edit it." A later notification from the parent session carried the owner's review feedback (adopt points 1 to 7; present the roles question as an owner question); it is folded in below.

## Summary for the owner
A deck's strategy becomes a short list of one-sentence items, at most 7 per deck: one Aim, up to three "What the commander enables", up to three Win conditions, and an optional "Play it like" line (for example Norin for Rocco's Secret Sauce). Each says "Set by you" or "Proposed by Claude". Claude's items count as unconfirmed assumptions until you accept them, and each shows the few cards it is based on. Claude reads the whole deck in one go (deck, strategy, health targets, every card, what is waiting), adds to your Notes without ever replacing them, and asks you for the bracket when it is empty. A job can say which strategy item it serves, shown as a "Serves" line in the card window. The Strategy tab tells you when you changed the strategy after Claude set the health numbers.
Decisions for you are in the questions below. The two that matter most: moving your written win condition into a Win condition item (the original text is kept, nothing is deleted), and whether Claude's role guesses should count in your other decks before you accept them.

## Questions for the owner (recommendation first)
1. **Your written win condition: move it into a Win condition item?** Recommendation: yes. It is copied word for word into one Win condition item marked "Set by you", and from then on you edit it there. The old text stays safely stored but is no longer shown, nothing is deleted, and running the copy twice does not make a second copy. A text longer than 300 characters is not copied; it shows as a read-only line asking you to split it. Notes stay exactly as they are. Playgroup stays its own field, because it describes your pod and feeds the bracket question. Budget, frustrations and format stay as they are. *You would see:* your Murky Business win condition as one line under Win conditions. *Alternative:* keep it as a separate box; the cost is two places to say how the deck wins. (This reverses my first recommendation after the review.)
2. **How many items?** Recommendation: at most 7 per deck: 1 Aim, 3 What the commander enables, 3 Win conditions, 1 Play it like. A fourth of a kind usually means two plans in one deck; merge them. Strategy points stay their own list (up to 30).
3. **What do Claude's proposed items do before you accept them?** Recommendation: they are used straight away as labelled, unconfirmed assumptions, and you can undo the batch. Claude must say "assuming X (not yet confirmed by you)" and never talk as if you said it. An item changes no health count by itself, so using it early only gives Claude context. Claude's new wording for *your* item waits beside yours and applies only when you accept it.
4. **Does the "Serves" link go in this database change or a separate one?** Recommendation: the same change. It adds two small tables and one extra layer of request handling in total. A separate change would add a second layer and one more thing to test and undo.
5. **Bracket is required, and health numbers come from the bracket plus the strategy. (Owner to confirm; changes the earlier order.)** Bracket is empty on all 21 decks, so Claude asks you for each deck's bracket instead of guessing. The EDHREC numbers (build, commander average, common guide) become a fallback only, in the same order as before. *You would see:* "Set by Claude from bracket 3 and your strategy" on a number, with the EDHREC source shown only as a fallback.
6. **Roles: the same for a card in every deck (today), or per deck?** Recommendation: keep them the same everywhere, but change how Claude's guesses count. Roles describe what a card does by its text, and the 13 roles are locked as universal; your jobs are already per deck. *Option 1 (recommended):* a role Claude proposes while working on one deck counts only in that deck until you accept it. Example: working on Murky Business, Claude proposes Ramp for Devoted Druid. Murky Business counts it at once, labelled. Arti-facts, which also holds Devoted Druid, shows "Proposed by Claude in Murky Business, not counted here yet" and counts it only after you accept it once; then it counts everywhere. *Option 2:* roles per deck. Devoted Druid is Ramp in Murky Business and has no role in Arti-facts until someone sets one there; every deck repeats the work, and the shared starting list stops helping. Option 1 fixes the worry (a guess for one deck moving another deck's numbers) without that cost. It is not part of this database change; it changes only how Claude's waiting guesses are counted. Nothing has been changed on this.
7. **Claude editing your item.** Recommendation: Claude proposes new wording beside yours; yours stays until you accept. Claude may rewrite its own waiting item directly.
8. **A link needs a job first.** Recommendation: yes; otherwise "Serves" would show under an empty job.
9. **Notes.** Recommendation: Claude adds a dated paragraph at the end and never replaces your text. One small gap: if you save Notes in the same instant Claude adds a paragraph, your save can be lost. It is undoable for 7 days and very unlikely with one user; closing it would need a change to an existing routine, which this design avoids.

## What was cut or merged to stay simple
Caps went from 1/5/5 to 1/3/3/1 and 7 in total; 7 items per request; 3 earlier notes in the brief. The written win condition merges into the Win condition item. "Serves nothing" is worked out when shown, never stored. The cards a proposal is based on are one small list on the item, not a table. The reference commander is one more item kind, read only. No existing table or routine is changed. The staleness notice is one read, nothing stored. Kept because the owner decided them: Claude's wording beside your item, and the optional link.

## Worked on the three corrected decks
Yedora the Explorer, Rocco's Secret Sauce and Murky Business all use the same four item kinds, the same strategy points and the same optional link. No new field type and no special case. Rocco's reference commander is an ordinary "Play it like Norin the Wary" line. Murky Business's counter-cost rule stays a strategy point (it covers two cards). I could not find your corrected strategy text for these decks in the repository (it is in your Claude chat of 2026-11-16), so the sentences are illustrative and Yedora's are left for you to supply. The table is in the contract and a short version is in the spec.

## How it fits the brief
- The brief (card roles and deck jobs, version 3) already says a deck has a strategy, jobs serve it, strategy points belong to the deck, and Claude sets health targets from the strategy (D-060). This design adds the missing home for "aim, what the commander enables, win conditions" and a way for Claude to read it.
- **Stays inside the brief:** jobs never change health counts; category stays separate from job and strategy; Claude's proposals apply at once, labelled, with one-click undo; 120 cards per request; Claude never overwrites the owner; the three-layer Strategy tab.
- **Goes beyond it, so needs the owner's yes:** (a) the written win condition moves into an item (brief section 7 kept Deck Intent as is); (b) the reference commander (RQ-06) appears as one read-only line, although the brief put choosing a different commander's EDHREC data out of scope; nothing uses it for numbers yet; (c) bracket required and the new target order; (d) the job-to-strategy link; (e) the roles question.
- **Not touched:** the locked pet-card flag (RQ-04's "locked flag" stays skipped); the old "dead weight" columns on cards are not read or written.
- It is slice work inside CC-26: the deck brief read and the Notes rule need no database change and can be built first. The items, links and win condition copy need one database change (DB-6), after DB-1 to DB-5.

## Proposed decision text (not recorded; for Gene to put to the owner)
- **D-NEW-1 Deck strategy items.** A deck's strategy is a short list of one-sentence items: Aim (1), What the commander enables (up to 3), Win condition (up to 3) and an optional Play it like line, at most 7 per deck, beside the existing strategy points. Each is labelled "Set by you" or "Proposed by Claude" and both can add and change them; Claude's wording for an item the owner set waits beside it until accepted. An item need not cover any card.
- **D-NEW-2 Unconfirmed means unconfirmed.** Claude's proposed items are assumptions until accepted. Claude says so and never presents them as the owner's words. Each proposal shows the cards it is based on.
- **D-NEW-3 Notes are never replaced by Claude.** Claude may add a dated paragraph to Notes. It reads the owner's strategy text (win condition item, playgroup, frustrations, budget, format, Notes, bracket).
- **D-NEW-4 A job may say which strategy item it serves.** The card window shows "Serves: …". A link never changes a health count. (Restates the owner's rule that only strategy points change counts.)
- **D-NEW-5 Strategy changed notice.** The Strategy tab says when the strategy changed after Claude set the health numbers, from update times only.
- **D-NEW-6 Bracket first (owner to confirm).** Bracket is required for every deck; Claude asks when it is empty. Health numbers are set from bracket plus strategy; build, commander average and common guide are a fallback only. Amends D-060's fallback wording.
- **D-NEW-7 Serving nothing is a question.** "These N cards serve nothing yet" is computed when shown, never stored, never an automatic cut.
- Numbering to be assigned by Gene.

## Changed files
- docs/oracle/contracts/deck-strategy.md — new contract: tables, who writes what, deck brief, tools, Notes rule, undo and 120 limit, identifiers, DB-6 specification, test plan, open points, three-deck table.
- docs/oracle/contracts/deck-strategy.types.ts — new types matching the contract.
- docs/oracle/contracts/card-roles-and-deck-jobs.md — one pointer line to DB-6 in section 11.
- docs/oracle/specs/card-roles-and-deck-jobs.md — Your strategy layer rewritten (8.6), Serves line (new 6.3a and layout line), staleness and bracket lines (10.4), component and data rows, worked example 13.5, "or job" removed from 10.3 (owner decision), header note.
- docs/oracle/reports/2026-11-18-architect-deck-strategy-design.md — this report.

## New decisions made (need owner confirmation)
- Win condition copied into an item; old text kept untouched (question 1).
- 7-item cap and per-kind caps (question 2).
- Proposed items apply at once as unconfirmed assumptions (question 3).
- Link in the same database change (question 4).
- Bracket required; new target order (question 5).
- Claude's wording beside the owner's item; link requires a job; Notes append-only with the small save gap (questions 7 to 9).

## Assumptions
- The five drafts DB-1 to DB-5 are the base. Their files say "not applied"; the task says applied. DB-6 checks the objects exist and refuses otherwise, so either way is safe. [Approximate: live state not checked]
- Whether the existing save routine sets the deck strategy's update time on every Notes change is not confirmed [Approximate]; a test is listed. If it does not, the staleness notice would miss Claude's Notes additions.
- "Bracket empty on all 21 decks" is taken from the owner's review; the test plan says 19 locked decks, none with a bracket. [Approximate]
- Corrected strategy text for Yedora, Rocco and Murky Business was not found in the repo; example wording is illustrative.
- The roles change in question 6 is outside DB-6 and not specified beyond direction.

## Challenges to locked decisions
- D-060 — "Claude updates them itself when the strategy changes", but the connector only acts inside a conversation, so numbers cannot move on their own. Same finding as the earlier report. Suggested change: say "Claude refreshes when asked, and Oracle tells the owner when the strategy changed after the numbers" (the notice in this design).
- D-060 fallback wording — the bracket-first order (question 5) amends it; proposed, not applied.
- Flag, not a challenge: the DB-5 rollback draft restores the earlier front doors by replacing them, so it would undo DB-6's if run while DB-6 is applied. It needs one guard line, and DB-6 must be rolled back first. I did not edit the DB-5 draft.

## Open questions
- Owner's answers to questions 1 to 9.
- Owner's corrected strategy sentences for the three decks, to replace the illustrative ones.
- Does the old `deck_cards.dead_weight_flag` matter to the owner? Nothing in this design reads or writes it.

## Verification
- Read the earlier report, brief, roles contract, spec sections 5, 6, 8, 9, 10, 13, the DB-3, DB-4, DB-5 drafts, `set_deck_setup`, `get_deck`, the strategy and notes routes, vocabulary, process and AGENTS.md.
- No database contacted; no code, decisions.md or status.md edited; card window, roles and Picklist code untouched.
- Documents only: no tests were run. The SQL is specified, not written; the next step drafts and rehearses it on a throwaway database.
