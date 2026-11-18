# Report: conflict list for the 2026-11-19 owner direction
Role: Architect
Status: DONE
Task as received: "You act as the Architect. PLANNING ROUND, DOCS ONLY." Deliverable (b): the conflict list report. For every locked decision or approved answer that the new direction contradicts, give what changes, the recommendation first, the trade-off, and the proposed amendment wording. Cover at least D-060, D-a to D-d, the parts of Q1 to Q10 that assume jobs, strategy points, proposals applying at once and the health roll-up; the 2026-11-18 decisions about Claude setting health targets from strategy and the deck-strategy design (DB-6 draft, contract, v4 mockup: keep, supersede or discard, nothing applied); what happens to slice 2's editing code and wording now that Tags are read-only; the unused CC-26 tables and functions (leave in place); CC-26 slice 4 (EDHREC build picker, guide, category manager stay in place); anything in decisions.md about bracket blocking or filtering suggestions (never allowed). Also the open points for the owner, recommendation first, including which decisions are needed before slice 1. Hard constraints: no build, no migration applied, no hosted write, no code changes; do not edit decisions.md or the card-roles spec; nothing is approved by being written.

Tags: `[Confirmed: path]` = read in this task or in the audit of the same day. `[Approximate]` = not checked. Nothing was written to any database and no code, decision or spec file was changed. The only file added is this report.

## Summary for the owner
The new direction removes the idea that each card has a "job" in a deck, the "strategy points", Claude's proposals bar with Accept and Undo-all, and Claude setting health targets. That contradicts one locked decision (D-060) and most of the earlier CC-26 answers (D-a to D-d, Q4, Q5, Q6, Q8, Q10). The card-tag answers (Q1, Q2, Q3, Q7, Q9) mostly survive in new words. Nothing in decisions.md blocks or filters suggestions by bracket, but two older answers in the daily-use brief do ("optimise-only suggestions never push a deck past its target"), and they need your approval to retire. Nothing below is approved or applied until you say so. Section 4 lists what you must decide before the Strategy window (slice 1) can start.

## 1. How to read this list
Verdicts: **Keep** (still true), **Amend** (true with changed words), **Supersede** (replaced by a new decision, old text marked superseded), **Discard** (never built, drop it). Every entry gives the recommendation first, then what changes, then the trade-off, then wording for the owner to approve. Gene records approved wording in `decisions.md` at Gate 5; until then the old text stays in force. Decision numbers for new entries are left for Gene to assign (the earlier proposal of D-061 to D-066 was never recorded, and a report cites a "D-063" that does not exist in the register [Confirmed: docs/oracle/decisions.md ends at D-060]).

| # | Item | Verdict |
|---|---|---|
| C1 | D-060 Claude sets health targets from strategy | **Supersede** |
| C2 | D-a Category and "Job", both kept | **Amend** (Category stays; "Job" goes) |
| C3 | D-b Builds and strategy are one thing, three-layer tab | **Supersede** |
| C4 | D-c "Rules" become "strategy points", Notes box | **Supersede** |
| C5 | D-d Health numbers: build first, adjusted by points and "jobs" | **Amend** |
| C6 | Q1 The 13 universal "roles" | **Amend** (become broad Tags, plus a mechanic layer) |
| C7 | Q2 Several per card | **Keep** |
| C8 | Q3 Category and Tag stay separate | **Keep**, one sentence dropped |
| C9 | Q4 "Deck jobs" starting list | **Supersede** (Why and Keep) |
| C10 | Q5 "Strategy points" and "jobs" are one family | **Discard** |
| C11 | Q6 Health roll-up, sources, 7c items 1 and 3 | **Amend** |
| C12 | Q7 Where "roles" come from | **Supersede** (source order changes) |
| C13 | Q8 Proposals applied at once, batch Undo, Accept/Change/Dismiss; 7c items 2 and 5 | **Supersede** |
| C14 | Q9 The card window | **Amend** |
| C15 | Q10 Build order | **Supersede** |
| C16 | Earlier answers 2a items 2 to 6 | **Amend** |
| C17 | 2026-11-18 design round: D-060 proposals, DB-6 draft, contract, approval pack, v4 mockup | mixed, table in C17 |
| C18 | Slice 2 editing code and wording | **Remove and adapt** |
| C19 | CC-26 tables and functions DB-1 to DB-5 | **Leave in place** |
| C20 | CC-26 slice 4 | **Supersede**, pieces stay where they are |
| C21 | Bracket blocking or filtering of suggestions | **Never allowed**; retire two older lines |
| C22 | Other decisions checked | no conflict, three wording notes |

## 2. The conflicts

### C1. D-060: "Claude sets and maintains a deck's health targets from the deck's strategy" (locked 2026-11-18)
**Recommendation: supersede D-060 in full.** The 2026-11-19 direction drops Claude-set targets, the owner override and hand-back, the per-number reasons, and the idea that every card has a "job" serving a strategy. Deck health keeps today's groups and today's target sources (commander average, estimate, general guide). What stays true from D-060 is that the owner does not manage health numbers by hand; nothing in the new direction asks for a number editor.
- **What changes.** The Strategy window stores a bracket, a one-line summary, free-text Strategy and Playgroup. Claude reads these and advises outside the app. No stored health target exists or is built. Health counts and targets look as they do today (existing groups Ramp, Draw, Removal, Wipes, Lands).
- **Trade-off.** Simpler and nothing new to store, but a deck like Urza keeps being judged against the commander average, not "little ramp because the deck makes its own". Claude can say this in words in its advice; the numbers on screen do not move. If you later want per-deck targets, that is a new decision with a new brief (the unused target table from DB-5 exists, see C19).
- **Proposed wording (replaces D-060).** "D-060 **Superseded 2026-11-19.** Deck health keeps today's groups and today's target sources (the commander's average deck, then an estimate, then the general guide), and every number says where it came from. The owner states a deck's bracket and strategy in words in the Strategy window; Claude reads them and advises, and does not set, store or change health numbers. *(Owner direction 2026-11-19; supersedes the 2026-11-18 decision 'Claude sets and maintains a deck's health targets'.)*"

### C2. D-a: "Jobs and categories: keep both, and make the difference obvious"
**Recommendation: amend. Keep Category exactly as it is; replace the "Job" side with Why (one line per card per deck) and Keep (a flag).** The three words are now: Tag (what a card does in any deck), Category (the owner's grouping in a deck list), Why (this card's reason in this deck).
- **What changes.** The card window shows Category and Why, plus Tags as read-only chips. The "Group by: Category or Job" switch is dropped; the deck list stays grouped by Category. The rule "Oracle never merges a category and a 'job'" becomes "never merges a Category and a Tag, or a Category and a Why".
- **Trade-off.** One less concept to explain. You lose a second way to group the list (by what a card is for in the plan). Claude can still describe that in words.
- **Proposed wording.** "D-a **Amended 2026-11-19.** Category (where a card sits in this deck's list) stays as today. The 'Job' field and 'Group by Job' are dropped. A card in a deck has an optional one-line Why (its reason in this deck) and an optional Keep flag. Category, Tag and Why are never merged or copied into each other."

### C3. D-b: "Builds and strategy are one thing" (one Strategy tab, three layers: Build, Your strategy, Card jobs)
**Recommendation: supersede.** The "Strategy" name now belongs to the owner's own plan (left-rail block and window). The EDHREC build picker, its guide and the category manager stay exactly where they are today (in the existing Commander guide area) and are not moved into any layer. Long term they get a tab called "Build" (audit section 8), which the owner approves separately.
- **What changes.** No three-layer tab. No "Build layer". The old Deck Intent form and the Notes list leave that tab only once the window exists, so nothing is lost in between (audit section 8).
- **Trade-off.** The build reference and your own plan are separate places again, which the owner's D-b answer wanted to remove. The reason to separate them now: the window is small and quick to open from the left rail, and the build picker is a reference about other players' decks. Cost: two places to look, joined by Claude reading both.
- **Proposed wording.** "D-b **Superseded 2026-11-19.** The deck page has a Strategy block and window for the owner's bracket, summary, strategy and playgroup. The EDHREC build picker, its guide and the category manager stay in the existing Commander guide area and are not moved into the window. Long-term home (a tab named Build) is decided separately."

### C4. D-c: "'Rules' becomes 'strategy' (strategy points); the free-text box is called Notes"
**Recommendation: supersede.** There are no per-deck statements to name. The free-text box in the window is called **Strategy**. The dated list of earlier notes stays stored and readable, unchanged (it is written only by the Upgrade log today, audit section 1.1).
- **What changes.** The words "strategy point" and "Notes" (as the free-text box) are retired from new documents. "Notes" survives only as the existing name of the dated list until it moves.
- **Trade-off.** The free-text box was "strategy notes" in storage and "Notes" on screen; it is now "Strategy" on screen with the same stored column. Nothing to convert.
- **Proposed wording.** "D-c **Superseded 2026-11-19.** The free-text box in the Strategy window is called Strategy. 'Strategy point' is retired. The stored strategy notes and the dated earlier notes are kept as they are."

### C5. D-d: "Health numbers: the build's typical numbers first, then adjusted by strategy points and jobs, each number names its source"
**Recommendation: amend.** Keep "every number says where it came from" and today's target sources. Drop "the picked build's numbers first" and "adjusted by your strategy point" for now (reading the picked build in health is separate backlog work, not part of this round).
- **What changes.** Targets: commander average, then estimate, then general guide, as today [Confirmed: brief section 3, "what exists today"]. Counts: today's text classifier, improved by Tags only where Tags are better (see C11). The source label stays.
- **Trade-off.** A deck with a picked build is still judged against the commander average, not the build's numbers. That is today's behaviour, so nothing gets worse. The build-first order can come back later as its own small item.
- **Proposed wording.** "D-d **Amended 2026-11-19.** Health keeps today's target sources and shows which one each number used. Counts come from today's classifier, using Tags where they give a better count. No stored per-deck targets, no adjustments from per-card reasons."

### C6. Q1: "The 13 roles are: ramp, fixing, card draw, card selection, tutor, targeted removal, board wipe, counterspell, protection, recursion, graveyard hate, stax/tax, hand disruption. Engine and finisher move to deck jobs; mill becomes a card property; 'utility' is dropped."
**Recommendation: amend.** The 13 become the **broad Tags** (layer a). Add a **mechanic Tag** layer (layer b: sacrifice outlet, token generator, Treasure generator and similar), chosen from a curated allow-list of about 30 to 60 mapped from Scryfall oracle tags, not mirrored. "Role" becomes "Tag" in all new text.
- **What changes.** (1) The list is no longer closed at 13; the allow-list is a table, so it grows by a row, not a database change. (2) "Engine" and "finisher" had a home in the old "job" list; with "jobs" gone they have none. They are not Tags (they depend on the deck). A card's Why can say it. (3) "Land may hold roles but never counts as ramp" still holds for health (C11). (4) Tags are read-only everywhere and global (keyed by card identity).
- **Trade-off.** More useful labels for search and Claude (a Warren Soultrader is a sacrifice outlet and a token generator), at the cost of a curated list the owner must spot-check. Coverage is not complete: Scryfall's own tags put about 39% of your 2,832 cards into one of the broad Tags today, and the rest needs the AI fallback (audit section 7).
- **Proposed wording.** "Q1 **Amended 2026-11-19.** A Tag is what a card does in any deck. There are two layers: broad Tags (ramp, fixing, card draw, card selection, tutor, targeted removal, board wipe, counterspell, protection, recursion, graveyard hate, stax/tax, hand disruption) and mechanic Tags (for example sacrifice outlet, token generator, Treasure generator), both from a curated allow-list. Tags are global, read-only, and the same in every deck."

### C7. Q2: "A card may hold several roles with no main one"
**Recommendation: keep**, with "role" read as "Tag". Owner's example (Warren Soultrader: sacrifice outlet, token generator, ramp) fits it.
- **What changes.** The sentence about health ("a card counts once in each group it feeds") applies only if Tags feed health (C11).
- **Trade-off.** None.

### C8. Q3: "Roles and your categories are two separate layers; a card can be ramp in both"
**Recommendation: keep.** Drop one sentence: "when a card is added, its category is suggested from its first universal role", which the direction does not mention and which couples Category to Tag; do not build it unless you ask.
- **What changes.** Category and Tag never write to each other.
- **Trade-off.** New cards keep today's category suggestion (the default-category guess), not one based on a Tag.
- **Proposed wording.** "Q3 **Kept 2026-11-19.** Category and Tag are separate. A card can be in the Category Ramp and carry the Tag ramp. Neither changes the other."

### C9. Q4: "Deck jobs: one job per card plus a free why; seven starting jobs (Engine, Enabler, Payoff, Win condition, Combo piece, Commander support, Flex); your own names allowed" ("This sounds fine for now.")
**Recommendation: supersede with Why and Keep.** Per-card fields in a deck: Category (exists), Why (one optional line, free text), Keep (optional flag).
- **What changes.** No job names, no one-per-card job, no "Group by". Why and Keep are new columns on the deck card record (neither exists today; audit section 3). Rule: Claude may fill an empty Why. A change to a Why you wrote goes through History with Undo, with no accept or dismiss step.
- **Trade-off.** Free text is flexible but cannot be counted or grouped. The seven-name list gave Claude a structure; Claude can still write "engine" inside a Why.
- **Proposed wording.** "Q4 **Superseded 2026-11-19.** A deck card has an optional Why (one line, free text) and an optional Keep flag (protects a pet card or a combo piece). Claude may fill an empty Why. A change to a Why the owner wrote is recorded in History and can be undone."

### C10. Q5: "A strategy point and a job are one family; a strategy point is saved on a deck and covers all cards of a type or a hand-picked list"
**Recommendation: discard.** Nothing was built; the tables are empty (C19).
- **What changes.** Statements like "every artifact counts as a mana source" have no home. They go into the free-text Strategy, where Claude reads them.
- **Trade-off.** Claude cannot make health counts follow those statements automatically; the numbers stay on today's classifier.
- **Proposed wording.** "Q5 **Discarded 2026-11-19.** There are no per-deck strategy points. A deck's plan is written in the free-text Strategy."

### C11. Q6 and the health roll-up (including 7c items 1 and 3, the Interaction group, the "Plan and win conditions" row)
**Recommendation: amend. Health keeps today's groups; Tags feed a count only where they beat today's text-based classifier.** Judge each group on a sample (for example Ramp and Removal on the three test decks) before switching a count. The "broad groups" idea (Interaction = removal + wipes + counterspells + hand disruption, a new "Card advantage" name, one common guide of 36/10/10/10) is not adopted this round.
- **What changes.** Dropped: the roll-up table, "Plan and win conditions" row, the idea that groups use Tags that today feed no group (Fixing, Card selection, Tutor, Protection, Recursion, Graveyard hate, Stax/tax), "adjusted by your strategy point", the "common guide numbers still need a source check" item, and any Claude-set number (C1). Kept: "a failed check says it could not check" (D-030); a land is never ramp.
- **Trade-off.** Health numbers stay as they are on day one, so nothing moves without your say. You do not get the single Interaction line.
- **Proposed wording.** "Q6 **Amended 2026-11-19.** Deck health keeps today's groups and target sources. A Tag may be used to count a group only where it gives a better count than today's classifier, shown on a sample first. Health numbers never change without saying what changed and why."

### C12. Q7: "Claude proposes roles for the three test decks first, then a bulk pass later by separate approval; the old default category guess is only a hint"
**Recommendation: supersede with the new source order.** (1) Scryfall Tagger tags through a curated mapping (starting from `src/lib/scryfall-category-mapping.ts` and `contracts/card-tagging-pipeline.md`); (2) an AI fallback limited to the 2,832 owned cards and EDHREC candidate cards; (3) your spot checks (about 100 cards).
- **What changes.** No "proposed by Claude" Tag state, no per-user Tag layer. The run that fills the Tag table is a hosted write needing its own approval (and the AI part costs usage).
- **Trade-off.** Scryfall gives broad, consistent coverage at no AI cost but only about 55 to 70% of your cards (audit section 7 [Approximate]); the AI fallback covers the gap but needs your checking. Keeping "Claude proposes on three test decks first" would be smaller but would give a deck-by-deck result that does not search across the collection.
- **Proposed wording.** "Q7 **Superseded 2026-11-19.** Tags come from Scryfall Tagger tags through a curated mapping first, then an AI fallback limited to the owner's collection and EDHREC candidate cards, with owner spot checks. The run that fills the Tag table needs separate approval."

### C13. Q8: "Claude's proposals are applied at once, up to 120 cards, marked Proposed by Claude; batch Undo all; Accept, Change, Dismiss; Claude never overwrites what you set"; 7c item 2 (proposals count in health at once); 7c item 5 ("Ask Claude" fills the chat); spec 17 items 6 to 9 (dismissal memory, Undo-all rules, "Standard")
**Recommendation: supersede, and keep three pieces.** Kept: Claude's edits are applied directly and undoable (D-034, D-034a, unchanged); every Claude write carries a one-line reason (DV-04); Claude fills an empty Why.
- **What changes.** Dropped: the proposals bar, Accept, Change, Dismiss, Accept all, Undo all with partial rules, dismissal memory, "Proposed by Claude" and "Set by you" labels on Tags and health numbers, "Standard", and the "Ask Claude / Propose" buttons. There is no "Ask Claude fills the chat" link (the in-app chat is paused, DV-03).
- **One real conflict to confirm.** Old Q8 said "Claude never overwrites a value you set; it can propose a different one beside yours." The new Why rule lets Claude change a Why you wrote, as long as it goes through History with Undo and no accept step. **Recommendation: follow the new rule, but only for a Why; Claude still never overwrites your Strategy text or your Category (it adds a dated paragraph to Strategy, see open point 6).** Trade-off: a change to your own Why can happen without you approving it first; you see it in History with the reason and one click Undoes it.
- **Existing limits stay.** More than about 10 cards in one go still waits for approval (D-034a). A Claude pass that fills many empty Whys would count toward it, so a big fill is held for approval as any big edit is [Approximate: how the 120-card direct limit set by CC-13 counts a Why fill is for the Architect to confirm in the contract].
- **Proposed wording.** "Q8 **Superseded 2026-11-19.** Claude may fill an empty Why. A change to a Why the owner wrote is recorded in History with Undo and a one-line reason, with no accept or dismiss step. Claude never replaces the owner's Strategy text. All Claude edits stay under D-034 and D-034a."

### C14. Q9: "The card window opens on the card name; contents: Universal roles (add or remove), Category in this deck, Deck job and Why it is here, strategy points that apply, Counts as, Proposed by Claude / Set by you with Accept, Change, Dismiss"
**Recommendation: amend. Keep how it opens; replace the contents.** New order: picture and name; Tags (read-only chips, at most five shown, the rest searchable); Category (edit); Why (edit); Keep (edit).
- **What changes.** Dropped sections: strategy points that apply, Counts as, Accept/Change/Dismiss. Dropped actions: Add role, remove, Restore. Slice 1 and 2 behaviour (opens on click, phone full screen) is unchanged.
- **Trade-off.** Smaller window. You lose the explanation of why a card counts in a health group.
- **Proposed wording.** "Q9 **Amended 2026-11-19.** The card window opens on the card name (computer and phone). It shows read-only Tags (at most five, the rest searchable), then the card's Category, Why and Keep in this deck."

### C15. Q10: "Build order: window, roles, Claude proposing roles, jobs, strategy points, health last"
**Recommendation: supersede with the slice order from deliverable (e):** 1 Strategy window plus Claude reading it, 2 card Tags, 3 left rail, 4 reason on Claude changes; the chat pause runs in parallel. Reasons are in the slice-order document, not repeated here.
- **Proposed wording.** "Q10 **Superseded 2026-11-19.** Build order: Strategy window and Claude reading it, card Tags (with Why and Keep), left rail, reason on Claude changes. The chat pause may run at any time."

### C16. Earlier answers (brief 2a, 2026-11-18)
| Item | Recommendation | What changes |
|---|---|---|
| 1 Two layers: fixed label plus per-deck customisation | **Amend** | The fixed label is a Tag. The per-deck part is Category, as today. No per-deck Tags. |
| 2 "Deck jobs: Claude proposes, we develop it, editable in the app" | **Supersede** | Why is editable by you and fillable by Claude (C9). |
| 3 Locked flag (pet card Claude must never cut): "Skip for now" | **Supersede** | The new direction asks for it as **Keep**. Status.md's RQ-04 "locked flag" half is satisfied by Keep. |
| 4 Strategy points "potentially one in the same" as jobs | **Discard** | See C10. |
| 5 Show it in the modal when a card is clicked | **Keep** | See C14. |
| 6 Health "tied into the rules/jobs; generic values where not set" | **Amend** | Generic values stay (today's sources); the tie to jobs and rules is dropped (C11). |
| 7 Test decks (Myrkul, Rocco, Mendicant) | **Keep** | Still the check decks for Tag quality and health. |

### C17. The 2026-11-18 design round: D-060 follow-ups and the deck-strategy design
These came from the Architect and coder design round after D-060. None was recorded in decisions.md [Confirmed]; the owner answers to its open points are not on record [Approximate: status.md has no DB-6 row and no answers]. Nothing here was applied [Confirmed: audit sections 9 and 11, live check].

| Piece | Verdict | Why and what is kept |
|---|---|---|
| D-060 follow-up wording ("Set by Claude" with reason, "Set by you" override, Hand back; source order owner, Claude, build, average, guide; "a strategy exists" means a win condition, points, Notes or jobs) | **Discard** | Follows C1. Source order returns to today's three. |
| DB-5 draft idea of stored health targets (`deck_health_targets`) | **Discard (table stays, unused)** | See C19. |
| `docs/oracle/contracts/deck-strategy.md` and `.types.ts` (items Aim, Commander enables, Win condition, Play it like; "serves" links; strategy-changed check) | **Supersede** | Replaced by the Strategy window. Keep two ideas as options: Claude adds a dated paragraph instead of replacing your text (contract T10), and bracket first in the brief to Claude with "not yet confirmed" wording for anything Claude writes. Everything else is dropped. |
| Deck brief order "deck, strategy, health, cards" | **Keep, in new words** | The owner direction fixes the same order. The contract's "deck, strategy, health targets, every card, what is waiting" becomes "deck, strategy, health, cards". |
| DB-6 draft (`20261118140000_roles_db6_deck_strategy.draft.sql` and its rollback) | **Discard.** Keep the file for history, mark it SUPERSEDED and never apply it. | It adds two more empty tables and two more allowed change kinds for dropped features. |
| DB-6b (copy written win conditions into items) | **Discard** | No win conditions are saved on any deck [Confirmed: live, audit section 1.1]; the target table is not wanted. |
| DB-6 approval pack (`2026-11-18-db6-approval-pack.md`) | **Supersede** | Its open points (move the win condition, bracket first, roles) are answered by the direction. The pack's "tested, not applied" results stay valid history. |
| v4 mockup (`docs/oracle/mockups/card-roles-and-deck-jobs.html`) and the three-layer Strategy tab in it | **Supersede** | Replaced by the Designer's Gate 3 proposals. The card window's Category and Why parts feed the Designer as input. |
| Test harness (`docs/oracle/reports/evidence/roles-db`) | **Keep** | Reused to rehearse the new stored-data changes on a throwaway copy. |
| Spec `specs/card-roles-and-deck-jobs.md` and brief `briefs/card-roles-and-deck-jobs.md` | **Mark partly superseded, only after the owner approves this list** | Not edited this round. The audit, contract and spec text keep their old words as history. |

**Proposed wording for status.md (only after approval).** "CC-26 (card roles and deck jobs): PARTLY SUPERSEDED 2026-11-19. Replaced by DV-02 (Strategy window), RQ-12 (card Tags with Why and Keep) and DV-04 (reason on Claude changes). Slices 1 and 2 shipped; slice 2's editing is removed. DB-1 to DB-5 are applied live, empty and unused. DB-6 is discarded."

### C18. Slice 2: the editable roles code and wording in the card window
**Recommendation: remove the editing; keep the display; do it inside the card Tags slice, not DV-03.** Detail and file names are in audit section 10.
- **Remove:** "Set by you", "Proposed by Claude" and "Standard" labels; "Add role", the x on each chip, "Restore", the Undo line; the save route's write path (`PUT` and `writeOwnerRole`) and its tests; the word "role" on screen.
- **Keep, adapted:** reading stored values and the chip display, now from the new global Tag table, at most five chips with the rest searchable.
- **Text-reading stand-in** (today's guessed ramp, draw, removal, wipes shown as "Worked out from card text"): show it only for a card with no stored Tag. Once a card has stored Tags, show only those, so one card is not described two ways. (This is the audit's open point 9; the owner confirms.)
- **Data to preserve:** none. The personal role table is empty [Confirmed: live, audit section 10], so nothing the owner typed is lost.
- **Trade-off.** Until the Tag table is filled, the window shows today's guessed chips with no editing, which is a step back from the slice 2 build for a short period. The alternative (leave editing in place) would let the owner create per-user Tags that the new direction forbids.

### C19. The unused CC-26 tables and functions (DB-1 to DB-5, all applied live and empty)
**Recommendation: leave every object in place. Removal is a separate, owner-approved cleanup, never part of this round, and best done after the reason-on-every-Claude-write change so the connector functions are edited once** (audit section 9).
- **In place and unused:** the personal role table and its owner functions, the job table and its functions, the strategy point table and its functions, the health target table and its functions, and the three new change kinds with their handlers.
- **In place and in use:** the widened change-kind lists and the front-door functions that every Claude edit passes through today. Removing these is not a tidy-up; it is a change to the live edit path.
- **Shared table `ref_card_roles`:** unused. The new Tag tables are new (audit S1), so no applied object is widened or renamed.
- **Trade-off.** Empty, private tables cost nothing but leave clutter in the schema and a repo that still labels the files "DRAFT. NOT APPLIED". Recommendation for the clutter: Gene marks each draft file's header and status.md as "applied live, empty, unused" (a docs change).
- **Proposed wording.** "D-NEW **Unused CC-26 objects.** The CC-26 tables and functions applied on 2026-11-18 stay in place, empty and unused. Any removal needs a separate owner approval naming each object and a rehearsal on a throwaway copy first."

### C20. CC-26 slice 4 (moving the EDHREC build picker, its guide and the category manager into a Build layer; removing the Commander guide section)
**Recommendation: supersede; those three stay in the existing Commander guide area, unchanged and unmoved.** The old slice would also have removed the "Commander guide" section in the same task (process.md gate 4: "the old version is deleted in the same task"). That deletion is cancelled for these three pieces. The Deck Intent form and the dated notes list on the same tab are retired only when the Strategy window ships (audit section 8).
- **Where they live long term (recommendation):** a deck-page tab called **Build** holding the build picker, its guide and the category manager. A later option is a "Manage categories" entry next to "Group: Category" on the Cards tab (D-015). Decide when the left rail ships, not now.
- **Trade-off.** Not moving them keeps the old tab's name "Strategy" and the new block's name "Strategy" side by side until the window ships. Recommendation: rename the old tab's remaining content "Build" in the same slice that ships the window, so there is only one "Strategy" on the page.

### C21. Bracket blocking or filtering suggestions (never allowed)
**Recommendation: record one rule and retire two older lines.** `decisions.md` contains no sentence about bracket blocking or filtering suggestions: a search for "bracket" in it returns nothing [Confirmed: docs/oracle/decisions.md]. The conflicts are in the approved daily-use brief, which is not a decisions.md entry:

| Where | Old text | Why it conflicts | Recommendation |
|---|---|---|---|
| `docs/oracle/briefs/daily-use-deck-advisor.md` section 10a | "Combined with the optional target bracket, optimise-only suggestions never push a deck past its target." | It describes a suggestion limit tied to the target. | **Retire.** Replace with: suggestions are never limited by bracket; a card that would raise the bracket is labelled as an upgrade (a label, not a limit). |
| same, section 10 | "if set, Oracle warns when a card would push past [the target]" | A warning on a suggested card is allowed, but only as a label. | **Amend.** Warn on the deck (the amber line in the window), and label cards; never hide or refuse a card. |
| same, section 17 item 3 | "Bracket warnings: only cards labelled 'upgrade' warn; optimise cards never do." | Not a conflict with the new direction. | **Keep.** |
| `docs/oracle/status.md` CC-15 line | "bracket is blocked for Claude today" | Historic. Claude may set the bracket since 2026-11-17 (status.md owner answers 2026-11-17 on CC-15 to CC-18). | **No change.** Not a block on suggestions. |
| `docs/oracle/contracts/deck-strategy.md` (deck brief) | "Claude asks you for the bracket first when it is empty; numbers set from bracket plus strategy" | Asking is fine. Setting numbers from bracket is dropped with D-060. | **Amend** as part of C17. |

- **What changes.** The window shows the amber line "Cards in this deck imply at least Bracket N. Your target is Bracket M." only when the cards imply a higher bracket. No other text says or implies that suggestions are restricted. No code, tool or Claude instruction may skip, hide or reject a card because of the target bracket.
- **Trade-off.** An Upgrade suggestion can raise the deck above its target, and Oracle only tells you. The "optimise never pushes past the target" promise is no longer made by the app. Claude can still choose to stay within a bracket if you ask it to in conversation.
- **Proposed wording (new decision).** "D-NEW **Bracket never blocks.** Nothing in Oracle blocks, filters, hides or refuses a suggestion, search result or edit because of bracket. The bracket the owner sets is the target. When the cards imply a higher bracket than the target, Oracle shows a warning (icon plus words), and shows nothing when the result is equal or lower. Cards can only prove a minimum bracket. *(Owner direction 2026-11-19.)*"

### C22. Other decisions checked
No conflict, with three wording notes.
- **D-034, D-034a (Claude edits are undoable, Recent changes, big edits wait):** unchanged. DV-04 adds the reason to them; the existing hold reason (over_ten, recent_total, busy, card_move) is not touched (audit section 4: that column is on the waiting-requests table, not the change log). D-034a's mention of "Oracle's own chat" and D-034's "sidebar assistant" stay true as history while the chat is paused; add a one-line note, no amendment.
- **D-043 (the shared vocabulary is locked as written):** adding **Tag**, **Category** and **Why** (and **Keep**) to `specs/vocabulary.md` is a change to a locked document. It needs your approval at Gate 1 for each brief, not just this list. Proposed entries: "Tag: what a card does in any deck; the same everywhere; read-only." "Category: where a card sits in this deck's list; yours; as today." "Why: this card's reason in this deck; one line; optional." "Keep: protects a card in this deck from being cut; optional." Retire "role", "job" and "strategy point" in new documents.
- **D-058 ("Stored with a tag on the deck card"):** the stored column is `command_zone_role` and an older text column `deck_cards.tags` that is empty on all 1,917 rows [Confirmed: audit section 3]. The word "tag" here is internal wording and now collides with Tag. Recommendation: no change to behaviour; reword D-058 as "stored with a marker on the deck card" at the next edit.
- **D-012, D-030 (colour never alone; failed lookups are shown, never turned into "fine"):** support the warning design and the failed and offline states of the window. **D-015 (controls sit inside their scope)** supports a read-only left rail with one editable block. **D-017 (category-count versus curve warnings):** unchanged. **D-011 (no phase gates on conversation in Brew mode):** untouched; whether the new-deck brewing chat is paused is an open point (audit point 7).
- **D-059 (deck states):** the left rail's "n / 100" and ownership split show these; no change.

## 3. What this report does not do
It does not edit `decisions.md`, the card-roles spec, brief or contract, status.md, or any draft file. It does not delete, move or apply anything. Wording above becomes a decision only when you approve it, and Gene records it at Gate 5.

## Changed files
- docs/oracle/reports/2026-11-19-architect-conflict-list.md: this report (new, docs only).

## New decisions made (need owner confirmation)
- All verdicts and proposed wordings in section 2 (C1 to C22). None is in force.
- New decision "Bracket never blocks" (C21).
- New decision "Unused CC-26 objects stay in place until a separate cleanup" (C19).
- Vocabulary additions Tag, Category, Why, Keep (C22), under D-043.

## Assumptions
- The owner answers in the CC-26 brief (Q1 to Q10, D-a to D-d) have the standing of approved answers although they are not entries in decisions.md (the register stops at D-060).
- The 2026-11-18 design-round proposals (D-NEW-1 to D-NEW-5, the DB-6 questions) were never approved, so superseding them removes no approved decision.
- Slice 2 is shipped and live (commits 984228f and 63bde94 per the audit) [Approximate: shipped state not re-checked here].

## Challenges to locked decisions
- **D-060** — direction of 2026-11-19 drops jobs, strategy points and Claude-set targets — supersede (C1).
- **D-043** — vocabulary is locked as written; adding Tag, Category, Why, Keep needs approval (C22).
- **D-058** — wording only, "tag" collides with the new Tag (C22).
- D-034 and D-034a, D-012, D-015, D-017, D-030, D-059: no conflict.

## Open questions
Each has a recommendation first. Items marked **[before slice 1]** must be decided before the Strategy window slice can start.
1. **[before slice 1] Supersede D-060, D-b, D-c and the three-layer Strategy tab.** Recommendation: yes (C1, C3, C4). Without this the repo still has a locked decision saying Claude sets health targets, and the window would contradict it.
2. **[before slice 1] Stored-data change for the window: add a one-line summary column and a "last changed by" column, and allow bracket 5.** Recommendation: yes, both columns; they are additive and the live data is empty (audit section 12, S3). Alternative: no "last changed by" column, deriving it from the change log (approximate, and owner edits are not logged). Needs a rehearsal on a throwaway copy before any live run.
3. **[before slice 1] Bracket names.** Recommendation: your names everywhere (1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH), US spelling "Optimized", allowed for Claude too. Nothing is lost: no bracket is saved on any deck.
4. **[before slice 1] What "See in History" opens.** Recommendation: the deck page's History shows two parts, Claude's changes for this deck (with Undo and the reason) first, then saved versions. Smaller alternative: the footer link opens the existing Recent changes list for this deck. Recommendation is made now because the footer wording depends on it; the build of the two-part History belongs to DV-04.
5. **[before slice 1] What Claude does to the Strategy text.** Recommendation: Claude adds a dated paragraph at the end and never replaces what you wrote (today it replaces the whole text). Alternative: it may replace. This is a code change to Claude's setup tool.
6. **[before slice 1] The bracket warning.** Recommendation: the window ships without the amber line, and it appears when the bracket check (RQ-14) is built, because the line needs Game Changers stored (audit section 6). Alternative: build the Game Changers column with the window so the warning ships in slice 1. Trade-off: one more stored-data change in slice 1 versus a window that says nothing about the cards until later.
7. **[before slice 1] Fields left out of the window.** Recommendation: leave win condition, budget, frustration and format out; their stored values (all empty) stay untouched. You see no budget field until you ask.
8. **[before slice 1] Discard DB-6 and DB-6b and supersede the deck-strategy contract.** Recommendation: yes (C17), so nobody applies them. Nothing is applied today.
9. **Why and Keep survive re-import; Claude never sets Keep; changing a Why you wrote is allowed through History.** Recommendation: store on the card slot, keep through re-import (tested), only you set Keep, and follow the new Why rule (C13). Needed before slice 2.
10. **Tag allow-list and the AI fallback batch.** Recommendation: 13 broad Tags plus about 15 mechanic Tags first; Scryfall mapping first; the AI fallback only for your remaining cards and EDHREC candidates; you check about 100. Cost and run need your separate approval. Needed before slice 2.
11. **Text-reading stand-in in the card window.** Recommendation: once a card has stored Tags, show only those (C18). Needed before slice 2.
12. **Retire the bracket "never push past target" line** in the daily-use brief (C21). Recommendation: yes. Needed before any Upgrade or bracket work.
13. **Pause scope.** Recommendation: pause the new-deck brewing chat too, because it also calls the paid service. Needed before the chat pause (can run in parallel with slice 1).
14. **Repo drift.** Recommendation: Gene marks DB-1 to DB-5 "applied live, empty, unused" in status.md and the draft headers; add a CC-26 row before marking it partly superseded.

Decisions needed before slice 1 can start: items 1 to 8. Items 9 to 11 are needed before slice 2, 12 before bracket-related work, 13 before the chat pause, 14 whenever Gene next edits status.md.

## Verification
- Read in full: owner direction (including the OUT OF SCOPE list), AGENTS.md, docs/oracle/process.md, docs/oracle/decisions.md, docs/oracle/reports/2026-11-18-db6-approval-pack.md, the audit of 2026-11-19; read the relevant sections of the card-roles brief (answers, Q1 to Q10, D-a to D-d, 7c, 7d, 8, 9), spec (sections 15 and 16), contract (settlements S1 to S19), docs/oracle/contracts/deck-strategy.md (header and sections naming bracket and health), the 2026-11-18 slice 2, design-round and D-060 reports, status.md (DV-01 to DV-04, RQ-14, CC-15), and the daily-use brief sections 10 and 17.
- `grep -n -i bracket docs/oracle/decisions.md` — no matches (no decisions.md text about bracket).
- No build, test run, migration or hosted write was done (docs-only round).
