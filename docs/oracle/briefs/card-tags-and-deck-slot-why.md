# Brief: Card Tags, and Why and Keep on deck cards (RQ-12)
Author: Gene, drafted 2026-11-19 from the owner's design review. Status: **Draft, awaiting owner approval (Gate 1).** Nothing is built or applied. Folds in RQ-01 and RQ-10; RQ-03 stays later. Evidence: `docs/oracle/reports/2026-11-19-architect-audit.md` (sections 3, 7, 10, 12) and the conflict list. Starting points: `docs/oracle/contracts/card-tagging-pipeline.md`, `src/lib/scryfall-category-mapping.ts`.

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
- Of your 2,832 cards, 39% carry one of the broad Tags today's mapping supports; 4 of the 13 broad Tags have no mapping at all.
- There is nowhere to record why a card is in a deck, or to protect a card you love from "cut" advice. No such field exists on the deck card today.
- The card window built in CC-26 slice 2 lets you add and remove Tags per user. That is not wanted.

## 4. Goals
1. A shared, read-only Tag for every card where one can be found reliably.
2. Tags visible on the card and usable in search, for you and for Claude.
3. Why and Keep on each deck card, with a safe rule for Claude.

## 5. Scope
**Tags.**
- Keyed by card identity (the same card in any printing has the same Tags). Global. No per-deck Tags, no "Set by you", no "Proposed by Claude", no accept or dismiss.
- Two layers. Broad: ramp, fixing, card draw, card selection, tutor, targeted removal, board wipe, counterspell, protection, recursion, graveyard hate, stax/tax, hand disruption. Mechanic: for example sacrifice outlet, token generator, Treasure generator.
- A curated allow-list, estimated 30 to 60 Tags, each mapped from one or more Scryfall tags. We do not copy all of Scryfall's tags.
- Source order: Scryfall's own tags through the mapping first; then an AI fallback only for cards in your collection and EDHREC candidate cards that Scryfall leaves untagged, with you spot-checking a sample.
- Plan for gaps. 2026-11 trial: 93.1% of cards carry any Scryfall tag, a draft map matched 58.3%, a 15-label list reached 13.7%. On your collection the audit estimates roughly 55 to 70% get a useful Tag from Scryfall, so about 850 to 1,250 cards go to the fallback. Cards with no Tag show none; that is allowed.
- Uses: (a) read-only chips on card details, at most five shown, the rest findable by search; (b) a Tag filter in the collection search and in Claude's collection search tool (extends CC-14); (c) inputs to Deck health counts only where a Tag counts better than today's classifier, shown on a sample first.
- Card details: the editable Tag section from slice 2 is removed. The text-reading stand-in is hidden for any card that has stored Tags.

**Why and Keep.**
- Per deck card: Category (exists), Why (one line, optional, free text), Keep (optional flag).
- Rule: Claude may fill an empty Why. A change to a Why you wrote goes through History with Undo, with no accept or dismiss step. Claude never sets Keep (recommendation; question 4).
- Why and Keep survive re-importing the deck (to be tested).

## 6. Out of scope (owner direction 2026-11-19, binding)
- Any build, migration or hosted write this round, including running the Tag fill and the AI fallback (each needs separate approval; the AI part costs usage).
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

## 8. Success checks
1. Sol Ring shows ramp; Warren Soultrader shows sacrifice outlet, token generator and ramp (if owned or searched).
2. No card window offers adding, removing or restoring a Tag.
3. The allow-list is between 30 and 60 Tags, each with its Scryfall source tags written down, and you approve it.
4. After the approved run: percentage of your 2,832 cards with at least one Tag is reported, split by source (Scryfall, AI fallback). A sample of about 100 AI-filled cards is checked by you; the error rate is reported.
5. The collection search filters by Tag, and Claude's search does too, with the same results for the same Tag.
6. A card with more than five Tags shows five; the rest are findable by search.
7. Deck health: for the sample decks, a before and after table; a Tag is used only where it is closer to your judgement than the classifier.
8. Why: typing a Why saves and survives re-import; Keep survives re-import.
9. Claude fills an empty Why; Claude's change to your Why appears in History with Undo and no accept button.
10. Searching or advising never hides a card because of bracket.

## 9. Open questions (recommendation first)
1. **Allow-list start.** Recommend: your 13 broad Tags plus about 15 mechanic Tags (sacrifice outlet, token generator, Treasure generator and similar), growing by adding rows later. You would see: fewer, more trustworthy chips. Trade-off: some cards stay with no mechanic Tag at first.
2. **AI fallback scope and spot check.** Recommend: only your collection and EDHREC candidate cards left untagged, checked on a sample of about 100 by you before the rest is accepted. Cost and the run need your separate approval.
3. **Card with no Tag after Scryfall and the fallback.** Recommend: show none, never guess in the app.
4. **Does Claude ever set Keep?** Recommend: no, only you. Claude can suggest it in words.
5. **Where Why and Keep live.** Recommend: on the card in the deck, kept on re-import (tested). Alternative: per card per deck in a second table, never lost. Trade-off: simpler versus safer.
6. **Text-reading stand-in on card details.** Recommend: hide it once a card has stored Tags, so one card is never described two ways.
7. **Land Tags** (dual lands and fixing): need their own check, since the audit could not test them. Recommend: include in the first Tag fill only if the sample looks right.
8. **Refresh.** Recommend: refresh from Scryfall's daily Tag file before the first run (the local copy is from August). Separate approval.

## 10. Dependencies
- Stored-data drafts for owner approval, rehearsed on a throwaway copy first, nothing applied: a shared Tag list table and a shared card-Tag table (audit S1); Why and Keep on deck cards, and a new kind of Claude change for Why edits behind the existing Undo (audit S2). The unused CC-26 tables stay as they are.
- DV-04 (reason shown on Claude changes) for the Why rule.
- CC-14 (collection search) for the Tag filter.
- Gate 3: Designer proposals for card details with Tags, Category, Why and Keep, and their phone layout and accessibility.
- RQ-14 and RQ-13 do not depend on this brief; Tags may later feed them.

## 11. Risks
- Over-trusting AI-filled Tags: mitigated by owner sample checks and a visible source.
- Coverage looks poor on some Tags (for example stax/tax). Reported honestly; not padded.

## 12. Next gates
Owner approves brief, Architect (conflict list answers, mapping draft), Designer (Gate 3), sliced build (order proposed: after the Strategy window), Tester, Scribe.

For Brad (plain words): this proposes read-only Tags on every card (what it does in any deck), a Tag filter for you and for Claude, and an optional one-line Why plus a Keep flag on each card in a deck.
