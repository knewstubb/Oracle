# Report: claude-connector-design
Role: Designer
Status: DONE
Task as received: CC-03 (Gate 3): design the Claude connector screens. One HTML mockup, one spec, one report. Cover connect/login, recent changes with Undo, pending approvals (incl. phone), the card-moved state in the original deck's plan, and the "Claude can't remove from the collection" visibility. Max three owner questions, behaviour-only, recommendation first.

## Summary for the owner
I designed a Settings page called "Claude connector" with three tabs: Connection (on/off switch, sign-in, expired state, "what Claude can and can't do"), Recent changes (Undo list plus a "waiting for your yes" section for big edits and deck moves, which also works on a phone), and a plain-words Setup guide. A card moved out of a deck stays on that deck's list as an Unsleeved card marked "Unavailable · In {deck}", plus one short note that Claude moved it. Please answer the three questions below.

## Changed files
- docs/oracle/mockups/claude-connector.html — all screens as labelled states (1a-1e, 2a-2f, 3a-3d, 4, 5).
- docs/oracle/specs/claude-connector.md — states, copy, interactions, data, accessibility.
- docs/oracle/reports/2026-11-16-designer-claude-connector-design.md — this report.

## New decisions made (need owner confirmation)
- Switching Claude off has no "are you sure" step (safe direction); it also cancels any waiting requests.
- Waiting requests expire after 24 hours with "Expired, nothing changed".
- Big edits are approved or declined whole, never partly.
- Undone rows stay visible (greyed) in the list for the 7 days.
- Header chip "N Claude is waiting for your yes" appears on every screen only while something waits.
- Moved card reuses the existing Unsleeved + "Unavailable · In {deck}" badge; only addition is a history line. No new slot type.
- Settings page location and tab names.

## Assumptions
- The source slot becomes an ordinary planned (Unsleeved) slot after a move (brief marks this [Approximate]; Architect must confirm in the contract).
- Owner-facing words are Sleeved/Unsleeved (D-025), not "planned/placed".
- Contrast figures are hand-calculated from existing tokens [Approximate].

## Challenges to locked decisions
- none. (D-034 amendment is still unrecorded; this design assumes it as per brief section 0.)

## Open questions (max three)

**1. Undoing "Claude added a card to your collection".**
- Recommendation: allow Undo, for the 7 days, by you only. It deletes only the copy Claude just added.
- With it: you see Undo on the row and the copy disappears. The "never removes from the collection" rule still holds for Claude, but Oracle does remove one copy on your say-so.
- Without it: that row has no Undo; you delete the copy yourself in the collection screen.
- Trade-off: allowed is convenient and consistent with "every change can be undone"; not allowed keeps a strictly clean "nothing is ever removed from the collection by this feature" story.

**2. How long a waiting request lasts.**
- Recommendation: 24 hours, then it expires and Claude must ask again.
- 24 hours: an old request you forgot can't surprise you later; you see "Expired, nothing changed".
- No expiry (waits until answered): you could approve a move days later when the decks have changed, so Oracle would usually refuse it as out of date.
- Trade-off: expiry is safer; no expiry avoids having to ask Claude again if you answer on the weekend.

**3. Telling you something is waiting.**
- Recommendation: a small chip in Oracle's header on every screen, only while something waits.
- Chip only: you notice when you open Oracle; Claude's chat tells you "I've asked you to approve this in Oracle".
- Chip plus a notification (email or phone) : you hear about it while only Claude is open on your phone.
- Trade-off: chip is quiet and needs no new setup; notifications are faster on a phone but add a new feature outside this brief.

## Verification
- Opened-structure review of the mockup file by reading; not rendered in a browser here (no browser run). The owner should open the HTML to check the switch, Undo, Approve and Decline buttons.
