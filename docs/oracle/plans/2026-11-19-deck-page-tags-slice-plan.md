# Plan: slice order for the deck page, Strategy window, card Tags and Claude change reason
Author: Gene, 2026-11-19. Status: **Proposal, awaiting owner approval.** Nothing is approved by being written. Nothing is built, no migration is applied, no hosted write is made.
Inputs: briefs `briefs/deck-page-left-rail-and-strategy.md`, `briefs/card-tags-and-deck-slot-why.md`, `briefs/claude-change-reason.md`; design `specs/deck-rail-strategy-tags.md` and its mockup; `reports/2026-11-19-architect-audit.md`; `reports/2026-11-19-architect-conflict-list.md`. Owner direction: `.agents/tasks/planning-round-2026-11-19/owner-direction.md`.

## 1. Recommended order (recommendation first)

| Order | Slice | What the owner sees afterwards | Stored-data change (owner approval + throwaway rehearsal first) |
|---|---|---|---|
| Parallel, any time | **DV-03** Pause the in-app chat | No chat buttons or chat links; no paid AI calls from the app. Code kept. | None |
| 1 | **Strategy window plus Claude reading it** (DV-02) | A Strategy window with target bracket (five names), one-line summary, strategy text, playgroup; Claude reads and can set them. Opened from a simple block on the existing deck page (the rail does not exist yet). | S3: summary, "last changed by", bracket up to 5 |
| 2 | **Reason on every Claude change** (DV-04) | Each Claude change in the recent-changes list (and History, per the owner's decision) shows a one-line reason. | S4: one new column on the change log |
| 3 | **Left rail** (DV-01) | The sticky left panel replaces the deck header, slot bar and health footer; "..." menu. Strategy block opens the slice 1 window. | None |
| 4 | **Card Tags** (RQ-12) with deck-slot Why and Keep | Read-only Tag chips on card details, Tag filter in collection search and Claude's search, Why and Keep on deck cards. | S1 (two Tag tables), S2 (Why, Keep) |

This differs from the order in the direction (modal, tags, rail, reason) in two places (DV-04 moves up to second, Tags moves down to fourth). The owner may keep the original order; what changes is listed in section 3.

### Reasons
1. **DV-03 in parallel and first in practice.** It is small, has no stored-data change, no design dependency and stops the paid calls. It does not touch the files the other slices touch, apart from the card window and the health strip entry points.
2. **Slice 1 first.** It is the owner's stated first slice; Claude gets the strategy and bracket sooner, which is the point of the Claude-first direction. It needs the least new design (one window, a block on the existing page).
3. **DV-04 second (moved up from fourth).** Slice 1 (S3) and slice 2 (S4) both edit the same live connector functions (`ai_set_deck_setup` and the change-log write paths). One throwaway rehearsal and one Claude-edit test run can cover both, so the risky function edits happen once. It is also small, and the window footer "Last changed by Claude" and Claude-set strategy text are easier to trust when each Claude change has a visible reason.
4. **Left rail third (same place as in the direction).** It has no stored-data change, so it is the safest large change and the most visible. It needs slice 1 (the block opens the window). It does not need Tags: Deck health keeps today's groups.
5. **Tags last (moved down).** The longest slice and the one with the most owner steps that are not code: approve the allow-list, approve the Tag tables, approve a hosted fill, approve the paid AI fallback run, spot-check a sample. Nothing else depends on it. The paperwork (allow-list draft, mapping extension, Scryfall data refresh plan) can run while slices 1 to 3 are built, but no stored data is applied or filled before approval.

### Dependencies
- Slice 3 (rail) needs slice 1 (the window). It does not need slice 2.
- The bracket warning ("Cards in this deck imply at least Bracket N. Your target is Bracket M.") needs RQ-14 (Game Changers stored, combo data). Slices 1 and 3 ship without it; the warning area is built empty. RQ-14 is a separate brief.
- Slice 4 (Tags) needs: owner approval of the allow-list, S1 and S2, the Scryfall tag data refresh, and a separate approval for the hosted fill and the AI fallback. Card-window cleanup (remove Set by you / Proposed by Claude, Add role, remove, Restore; keep read display) is part of slice 4.
- S2 (Why and Keep) changes live Claude-edit functions (new change kind). Rehearse together with the Claude-edit test suite; it is the one reason slice 4 touches the connector.
- Gate 5 for each slice: owner click-through, then only with owner approval Gene updates decisions.md (D-060 amendment and the others in the conflict list) and vocabulary.md.
- Tests use a separate test account (process.md). Until it exists, the Developer marks save-path tests as untested.

## 2. Owner decisions needed before slice 1 can start (recommendation first)

1. **Approve the brief and the design (Gates 1 and 3) for the deck page and Strategy window.** Recommendation: approve slice 1 now; the rail design can wait. Without this nothing starts.
2. **Approve the stored-data change S3** (a summary field, a "last changed by" field, bracket allowed up to 5), to be rehearsed on a throwaway copy first. Recommendation: yes. All 22 decks have no strategy saved, so nothing is converted or lost.
3. **Bracket names and spelling.** Recommendation: 1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized (US spelling), 5 cEDH, replacing the old labels everywhere. No bracket is saved today, so nothing changes for existing decks.
4. **What "See in History" opens.** Recommendation (A): the deck page History shows Claude's changes for this deck (with reason and Undo) above the saved versions. Alternatives: (B) keep History as is and open the Claude changes list filtered to the deck; (C) rename today's button "Versions" and add a new "Claude changes" item. Today the History button and Recent changes are two different screens. Needed before slice 1 because the window footer links to it; if undecided, slice 1 can ship the footer without the link.
5. **When Claude edits the Strategy text.** Recommendation: Claude adds a dated paragraph at the end and never replaces what you wrote (Undo works). Alternative: Claude may replace the whole text, as it can today.
6. **Fields left out of the window.** Recommendation: leave win condition and budget out and keep their stored values untouched (all empty today). Alternative: add a budget line.
7. **Approve the conflict list in principle** (D-060 and the card-roles answers D-a to D-d, Q4 to Q6, Q8, Q10 that assume jobs, strategy points, proposals-at-once and the health roll-up). Recommendation: approve now so slice 1 does not build against them; decisions.md is edited only at Gate 5 after approval.
8. **Order.** Recommendation: the order in section 1. Alternative: the direction's original order.

Not needed before slice 1: the Tag allow-list, Why and Keep, the DV-04 and S1/S2/S4 approvals, and the chat pause.

## 3. If the owner keeps the original order (1 modal, 2 tags, 3 rail, 4 reason)
- The S3 and S4 function edits are rehearsed twice, around Tags and Why.
- The rail waits behind the longest slice, so the deck page redesign lands last.
- Claude changes stay without a visible reason longer. Nothing is blocked; it is slower and repeats a rehearsal.

## 4. Owner questions, not decided
These are open. Each needs a decision from the owner; none is assumed here.
1. **Where do the EDHREC build picker, its guide and the category manager live long term?** Architect recommends a "Build" tab, with the category manager possibly later next to "Group: Category". For now they stay in the existing Commander guide area, unmoved.
2. **How the deck record maps onto the window.** Recommendation: keep every stored field where it is and add only the summary and "last changed by". Bracket maps to bracket (1 to 5), playgroup to the existing table context, strategy notes to the Strategy text. Win condition and budget stay stored but have no place in the window. The dated "Earlier notes" list (written by the Upgrade log only) stays stored and readable, with a read-only home under Build for now. Open for the owner: is that mapping acceptable, and should win condition or budget get a place?
3. **Does the History button open the same screen as Recent changes?** The audit found they are different screens (see decision 4 above). The owner chooses A, B or C.
4. **Do Why and Keep already exist?** The audit found they do not (new columns on deck cards). Open: do they stay on the card slot (recommended) or per card per deck, and do they survive re-import? Does Claude ever set Keep (recommendation: no)?
5. **Does Scryfall data expose Game Changers?** Yes, as a card flag (53 cards today, 9 owned), but the app's stored copy drops it. Open: store Scryfall's flag (recommended) or keep a dated list. That belongs to RQ-14.
6. **What happens to the unused CC-26 database tables (applied, empty) and slice 2's editable-roles code in the card window?** Recommendation: leave the tables untouched for now and clean up later in a separate approved task with its own rehearsal; remove the editable-roles parts of the card window as part of the Tags slice. Open for the owner.
7. **Pause scope for DV-03.** Does the pause also cover the new-deck brewing chat (a second paid chat)? Recommendation: yes.
8. **Tag list size and the AI fallback run.** Start with the 13 broad Tags and about 15 mechanic Tags; AI fallback for the remaining cards, with the owner checking a sample. Cost and run need a separate approval.

## 5. Out of scope in this plan
Any build; any migration or hosted write; deleting the in-app chat code; Claude-set health targets; blocking or filtering suggestions by bracket (never); moving the EDHREC build picker or category manager; RQ-03, RQ-13, RQ-14, RQ-07 (later, separate briefs).
