# Brief: A reason on every Claude change (DV-04)
Author: Gene, drafted 2026-11-19 from the owner's design review. Status: **Draft, awaiting owner approval (Gate 1).** Nothing is built or applied. Evidence: `docs/oracle/reports/2026-11-19-architect-audit.md` section 4 and section 12 (S4).

## 1. What this is, in plain words
When Claude changes something in your decks, it also says in one line why. That line appears next to "Changed by Claude" in the recent changes list and in History. Undo works as today.

## 2. Problem
The recent changes list says what Claude did, not why. You have to remember or ask. 183 changes are logged today and none carries a reason.

## 3. Goals
1. Every new Claude change carries a one-line reason.
2. The reason shows beside "Changed by Claude" wherever those changes are listed.
3. No second history. The existing list and Undo are the only ones.

## 4. Scope
- Every Claude edit tool must give a short reason; the app stores it with the change.
- Recent changes by Claude (in the connector settings) shows the reason on each row.
- The deck page History shows the same changes for that deck, with the reason and Undo (see question 1).
- Waiting requests (changes held for your approval) carry the reason too, so it is there when you approve.
- Old changes stay as they are and show no reason.

## 5. Out of scope
- Any build, migration or hosted write this round.
- A second history, a new Undo, or a new screen for Claude changes.
- Reusing the existing approval-hold reason (it only records why a change is waiting: more than ten edits, recent total, busy, or a card move). It stays as it is.
- Adding reasons to old changes.
- Reasons for your own edits.
- Blocking or refusing any change or suggestion because of bracket. Never.
- DV-03 (pause the in-app chat).

## 6. What the owner will see
- Recent changes: "Changed by Claude: Added Arcane Signet to Yedora. Reason: the deck is two mana sources under its target."
- Deck History: Claude's changes for that deck, newest first, with reason and Undo.
- Older rows: no reason line, nothing else different.
- Example: Claude cuts a card you did not mark Keep. The row says what, when and why, and Undo is one click.

## 7. Success checks
1. A change made by Claude after this ships always shows a reason (a change without one is refused by the tool, not saved blank).
2. The reason shows beside "Changed by Claude" in recent changes and in deck History.
3. Undo still works for 7 days on every change, old and new.
4. The 183 existing rows still display and undo correctly.
5. A change waiting for approval shows its reason and its hold reason separately, never mixed.
6. There is exactly one change list in the app.
7. A reason longer than 200 characters is shortened or refused with a clear message.

## 8. Open questions (recommendation first)
1. **What does the deck History button open?** Today it opens saved versions of the deck, not Claude's changes. Recommend: one History per deck, Claude's changes first, then saved versions. You would see one window with both. Alternative: leave History alone and open the recent changes list filtered to the deck. Trade-off: a little more build versus two different screens. Shared with the left panel brief.
2. **Mandatory or optional reason?** Recommend: required for every Claude edit, enforced when Claude calls the tool. Old rows stay blank.
3. **Length.** Recommend: one line, up to 200 characters.
4. **Reasons for your own edits.** Recommend: no.

## 9. Dependencies
- Stored-data change (draft for owner approval, throwaway rehearsal first, nothing applied): one new reason field on the Claude change log, separate from the existing approval-hold reason; the edit functions already in use must be changed against their live versions (audit S4).
- Connector tools: each edit tool gains a reason input; the recent changes list returns it.
- The Why rule in RQ-12 (a change to your Why shows its reason in History).
- The left panel brief (DV-01/DV-02) for the "See in History" link.
- Slice order proposed by the audit: after Tags and the left panel; the same edit functions are touched once.

## 10. Risks
- The edit functions are in the path of every Claude change today; a mistake could break all Claude edits. Mitigation: rehearse on a throwaway copy with the Claude-edit test suite.
- Reasons can be vague. Mitigation: owner reviews a sample at close-out.

## 11. Next gates
Owner approves brief, Architect (confirm History decision and function plan), Designer (reason in the list and in History), sliced build, Tester, Scribe.

For Brad (plain words): this proposes that every change Claude makes comes with a one-line reason, shown next to "Changed by Claude" and covered by the same Undo you have now.
