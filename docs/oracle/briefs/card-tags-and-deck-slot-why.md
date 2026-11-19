# Brief: Card Tags, and Why and Keep on deck cards (RQ-12)
Author: Gene, drafted 2026-11-19 from the owner's design review. Status: **Draft, awaiting owner approval (Gate 1). Updated 2026-11-20 with the owner's answers on the Tag list, the two weak Tags and the Scryfall refresh (section 9).** Nothing is built or applied. Folds in RQ-01 and RQ-10; RQ-03 stays later. Evidence: `docs/oracle/reports/2026-11-19-architect-audit.md` (sections 3, 7, 10, 12) and the conflict list. Tag list evidence: `docs/oracle/reports/2026-11-20-architect-tag-frequency-proposal.md`. Starting points: `docs/oracle/contracts/card-tagging-pipeline.md`, `src/lib/scryfall-category-mapping.ts`.

## 1. What this is, in plain words
Every card gets a few read-only Tags that say what it does in any deck, for example Sol Ring is "ramp", and Warren Soultrader is "sacrifice outlet, token generator, ramp". You can see them on a card, filter your collection by them, and Claude can search your collection by them. Separately, each card in a deck can carry a one-line Why (this card's reason in this deck) and a Keep flag for pet cards.

## 2. New words (defined once; to be added to the vocabulary file)
- **Tag**: what a card does in any deck. Same for every deck and every user. Read-only.
- **Category**: your own grouping in a deck list. Exists today.
- **Why**: one line on why this card is in this deck.
- Keep: a flag that protects a pet card or a combo piece.
Each word has one place. Older words for these ideas are retired in new documents.

## 3. Problem
- The app sorts cards by reading their text, and only into four groups. Claude cannot ask "which of my cards are sacrifice outlets?".
- Of your cards, 39% carry one of the broad Tags today's mapping supports; 4 of the 13 broad Tags have no mapping at all. (Your collection holds 2,878 Commander-legal cards by the 2026-11-20 count; the 2,832 earlier figure is out of date.)
- There is nowhere to record why a card is in a deck, or to protect a card you love from "cut" advice. No such field exists on the deck card today.
- The card window built in CC-26 slice 2 lets you add and remove Tags per user. That is not wanted.

## 4. Goals
1. A shared, read-only Tag for every card where one can be found reliably.
2. Tags visible on the card and usable in search, for you and for Claude.
3. Why and Keep on each deck card, with a safe rule for Claude.

## 5. Scope
**Tags.**
- Keyed by card identity (the same card in any printing has the same Tags). Global. No per-deck Tags, no "Set by you", no "Proposed by Claude", no accept or dismiss.
- Two layers, **40 Tags in total (owner decision 2026-11-20)**. Broad (13): ramp, fixing, card draw, card selection, tutor, targeted removal, board wipe, counterspell, protection, recursion, graveyard hate, stax/tax, hand disruption. Mechanic (27): for example sacrifice outlet, token generator, Treasure generator, lifegain, +1/+1 counter maker, landfall, blink. The full list with counts is in the Tag list evidence. This replaces the earlier "13 plus about 15".
- Fixing and Stax / tax are ordinary Tags like the other 38. They carry no "incomplete" label. Scryfall's own tags find only about 3 of 10 well-known fixing cards and 4 of 10 well-known stax cards, so the AI verification pass (section 9A) is how those gaps and any other errors get found and cleaned up.
- A curated allow-list of exactly these 40 Tags (adding or removing one later is a one-line change), each mapped from one or more Scryfall tags, sub-tags included. We do not copy all of Scryfall's tags.
- Source order: (1) Scryfall's own tags through the mapping, after a refresh of Scryfall's Tag data just before the fill (its own approval). (2) A rule on the card for the few cases a plain rule settles (for example a land that makes two or more colours counts as fixing). (3) The AI verification pass over **all** Commander-legal cards, which checks every Tag and finds missing ones. The earlier plan, an AI fallback limited to your collection and EDHREC candidates, is replaced by (3).
- Coverage, measured 2026-11-20: with the 40 Tags about 78% of all Commander cards (25,593 of 32,643) and 89% of your cards (2,563 of 2,878) get at least one Tag. The rest are mostly plain creatures with no special purpose. Cards with no Tag show none; that is allowed.
- Uses: (a) read-only chips on card details, at most five shown, the rest findable by search; (b) a Tag filter in the collection search and in Claude's collection search tool (extends CC-14); (c) inputs to Deck health counts only where a Tag counts better than today's classifier, shown on a sample first.
- Card details: the editable Tag section from slice 2 is removed. The text-reading stand-in is hidden for any card that has stored Tags.

**Why and Keep.**
- Per deck card: Category (exists), Why (one line, optional, free text), Keep (optional flag).
- Rule: Claude may fill an empty Why. A change to a Why you wrote goes through History with Undo, with no accept or dismiss step. Claude never sets Keep (recommendation; question 4).
- Why and Keep survive re-importing the deck (to be tested).

## 6. Out of scope (owner direction 2026-11-19, binding)
- Any build, migration or hosted write this round, including the Scryfall refresh, the Tag fill and the AI verification pass (each needs its own separate approval; the AI part costs usage).
- Per-user or per-deck Tags, accept or dismiss, "Set by you", "Proposed by Claude".
- Mirroring all of Scryfall's tags.
- Per-deck card-purpose groups, per-deck strategy statements, Group by switch, Claude-set health targets, and the broad health roll-up.
- Changing a card's Category from its Tag, or a Tag from its Category. They never write to each other.
- **Blocking, filtering or refusing suggestions because of bracket.** Tags never do this either.
- RQ-03; the Game Changer flag (RQ-14); deleting the CC-26 tables already applied (they stay, unused).
- Picklist screens.

## 7. What the owner will see
- Open a card in a deck or the collection: small read-only chips, at most five, for example "ramp" and "sacrifice outlet". No add or remove buttons.
- A Tag filter in the collection search. Example: pick "Treasure generator" and see the ones you own.
- Claude can ask for "owned cards tagged sacrifice outlet that are not in a deck" in one call.
- In a deck, a card row can show its Why and a Keep marker. Example: Why "Gives Yedora a free land drop each turn", Keep on.
- If Claude writes a Why where one was empty, it appears marked "Changed by Claude". If Claude changes yours, it shows in History with Undo and the reason (DV-04), and nothing waits for your accept.
- Some cards show no Tags. Deck health numbers stay the same unless a Tag proves a better count on the sample.
- Fixing and Stax / tax look like every other Tag. Example: Command Tower shows "fixing" once the pass has checked it; nothing says "incomplete".
- Later, once the AI pass has run: a short list of cards where the AI and Scryfall disagree, for you to spot check (section 9A).

## 8. Success checks
1. Sol Ring shows ramp; Warren Soultrader shows sacrifice outlet, token generator and ramp (if owned or searched).
2. No card window offers adding, removing or restoring a Tag.
3. The allow-list is the 40 Tags from the Tag list evidence, each with its Scryfall source tags written down, and you approve it.
4. After the approved fill: the percentage of your 2,878 cards (and of all Commander cards) with at least one Tag is reported, split by source (Scryfall, rule, AI pass). After the AI pass, a sample of about 100 disagreements is checked by you and the error rate is reported.
5. The collection search filters by Tag, and Claude's search does too, with the same results for the same Tag.
6. A card with more than five Tags shows five; the rest are findable by search.
7. Deck health: for the sample decks, a before and after table; a Tag is used only where it is closer to your judgement than the classifier.
8. Why: typing a Why saves and survives re-import; Keep survives re-import.
9. Claude fills an empty Why; Claude's change to your Why appears in History with Undo and no accept button.
10. Searching or advising never hides a card because of bracket.

## 9. Open questions (recommendation first)
**Answered by the owner on 2026-11-20 (closed):**
- **Allow-list start: closed.** Agreed: start with the 40 Tags (13 broad plus 27 mechanic).
- **The two weak Tags (Fixing, Stax / tax): closed.** Agreed, as ordinary Tags with no "incomplete" label. The owner wants an AI pass across all cards to check the Tags and clean up errors (section 9A). This replaces the earlier AI fallback limited to your collection and EDHREC candidates.
- **Refreshing Scryfall's Tag data: closed.** Agreed: refresh just before the Tags are filled in, as its own approval.

**Still open:**
1. **Card with no Tag after Scryfall, the rule and the AI pass.** Recommend: show none, never guess in the app.
2. **Does Claude ever set Keep?** Recommend: no, only you. Claude can suggest it in words.
3. **Where Why and Keep live.** Recommend: on the card in the deck, kept on re-import (tested). Alternative: per card per deck in a second table, never lost. Trade-off: simpler versus safer.
4. **Text-reading stand-in on card details.** Recommend: hide it once a card has stored Tags, so one card is never described two ways.
5. **Land Tags** (dual lands and fixing): the earlier audit could not test them. Recommend: include them in the first Tag fill and let the AI pass check them, since fixing is a plain Tag now.
6. **Questions about the AI pass** are in section 9A (five questions).

## 9A. The AI verification pass (new, 2026-11-20)
**In plain words.** After the Tags are filled from Scryfall, an AI reads every Commander-legal card (about 32,643 distinct cards) and the 40-Tag list, and says which Tags each card should have. Where it disagrees with what Scryfall gave, the card is flagged. Example: Scryfall has no "fixing" on Command Tower; the AI says it should, so Command Tower is flagged and, once you agree, gets the Tag. The aim is to find and clean up wrong or missing Tags, especially Fixing and Stax / tax. Tags stay global and read-only for you; the pass never touches a deck or a Category.

**How big, and what it costs.** The earlier plan covered only 850 to 1,250 cards. This pass covers about 26 to 38 times as many. The existing pipeline plan prices a Haiku batch run at $0.50 per million input tokens and $2.50 per million output tokens, about 900 to 1,200 input tokens and 100 to 200 output tokens per card. That works out to about $0.0007 to $0.0011 per card, so **about $23 to $36 for all 32,643 cards, roughly $29 to $45 with the plan's 25% allowance for retries**. The plan's own figures for 11,000 to 16,000 cards were $10 to $23, so this is the same method scaled up. **Where this is a guess:** the plan's token counts are for a smaller task. Checking existing Tags means sending the 40-Tag list and Scryfall's answer with every card, which likely adds input; I would budget **$30 to $60** until a small test run measures real numbers. Time is also a guess: the plan says batches usually finish within an hour and can take up to 24 hours, and 32,643 cards means several batches, so expect hours to a day, not minutes. The prices were checked on 2026-10-02 and need rechecking before approval. This is not a quote and not a spend approval.

**Decisions for you (recommendation first):**
1. **Check only, or also correct?** Recommend: check and flag only in the first run. You see a list of disagreements and spot check about 100; corrections are written only after you accept the error rate. You would see: a review list, and no Tag changing by surprise. Trade-off: one extra approval step. Alternative: the pass writes corrections straight away; faster, but a bad run changes thousands of cards before you look.
2. **Where do corrections live?** Recommend: in the shared Tag table (not yet created), changed only by a scheduled system task, never per user and never per deck. Every change keeps a record: what changed, the source (Scryfall, rule, AI, or you), the date and the run it came from, and a whole run can be undone with one action. Example: if one run wrongly adds "stax" to 300 cards, you undo that run and the 300 go back. You would see: the same chips as today, plus a visible source on request. Trade-off: slightly more stored data. This is a stored-data change and needs its own approval and a rehearsal on a throwaway copy first.
3. **How do errors you find by hand get fixed?** Recommend: a correction list, a plain table where you or Claude add a row ("Rule of Law, add stax / tax"). The next system task applies the list and logs it like any other change, and the AI pass never overrides a listed correction. You would see: spot an error, tell Claude, and it stays fixed after later runs. Trade-off: corrections are applied by a system task, not instantly. Alternative: fix each card directly in the app; this brings back per-card editing, which you ruled out.
4. **How often to re-run?** Recommend: once now, then only for new cards after each Scryfall refresh (a few hundred to a thousand cards, a few dollars), plus a full re-run only if you change the Tag list or the wording the AI is given. You would see: new sets get Tags without a big bill. Trade-off: old Tags are not rechecked unless something changes.
5. **Cost approval.** Recommend: separate approvals, in order: (a) a small test of about 100 cards to measure real cost and quality, then (b) the full run with a ceiling you set (for example $60), stopping automatically if it would go over. You would see: a measured price before you commit. Trade-off: one more round trip.

## 10. Dependencies
- Stored-data drafts for owner approval, rehearsed on a throwaway copy first, nothing applied: a shared Tag list table and a shared card-Tag table (audit S1), plus a record of each change with its source, date and run, and a correction list (section 9A); Why and Keep on deck cards, and a new kind of Claude change for Why edits behind the existing Undo (audit S2). The unused CC-26 tables stay as they are.
- DV-04 (reason shown on Claude changes) for the Why rule.
- CC-14 (collection search) for the Tag filter.
- Gate 3: Designer proposals for card details with Tags, Category, Why and Keep, and their phone layout and accessibility.
- Scryfall Tag data refresh (its own approval) before the Tag fill. The local copy is from 7 August 2026 and lacks Tags for about 630 newer Commander cards (45 of yours).
- Anthropic usage for the AI verification pass, approved separately (section 9A). The pipeline contract (`docs/oracle/contracts/card-tagging-pipeline.md`) needs updating to match: all cards instead of the owner-collection fallback, and a check step instead of a fill-only step. Not done here.
- RQ-14 and RQ-13 do not depend on this brief; Tags may later feed them.

## 11. Risks
- Over-trusting AI results: mitigated by check-and-flag first, owner sample checks, a visible source, and undo for a whole run.
- Fixing and Stax / tax start weaker than the other Tags, with no label saying so, until the AI pass runs. Mitigation: run the pass soon after the fill; the measured Scryfall gaps are in the Tag list evidence.
- Cost and time of the full pass are estimates (section 9A); a small test run and a spending ceiling guard this.
- Scryfall's data is stale until refreshed; about 630 newer cards would have no Tags.
- Loose Tag matches (for example Swords to Plowshares under lifegain) are not yet measured; the 100-card review in the pipeline contract is where they show up.

## 12. Next gates
Owner approves brief (including the five AI pass questions). Then, each its own approval: Scryfall Tag refresh; Architect mapping draft for the 40 Tags and update of the pipeline contract; stored-data drafts and throwaway rehearsal; Tag fill; AI test run of about 100 cards; full AI pass with a cost ceiling. Designer (Gate 3), sliced build (order proposed: after the Strategy window), Tester, Scribe.

For Brad (plain words): this proposes 40 read-only Tags on every card (what it does in any deck), an AI check across all cards to find and clean up Tag errors, a Tag filter for you and for Claude, and an optional one-line Why plus a Keep flag on each card in a deck.
