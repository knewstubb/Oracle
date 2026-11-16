# Brief: Game logging and playgroup (Gate 1 DRAFT, answers recorded; step 3 of 3)
Author: Gene, drafted 2026-11-16. Status: **APPROVED by owner 2026-11-16, sequenced LAST (step 3 of 3, after briefs 1 and 2). Power level = ONE number for the whole table (owner confirmed). Nothing is built.** Owner said YES on 2026-11-16 to Claude being able to log games in Oracle. Related: roadmap item O-004 (post-game debrief), parked until after M3. Owner CONFIRMED 2026-11-16 pulling the logging part forward from parked O-004, but it goes LAST: after card facts and deck health (CC-06), then collection search (CC-07).

## 1. What this is, in plain words
After a game, you tell Claude "I played Korvold, won, turn 9" and Oracle saves it. Oracle also remembers who you play with, so decks and games can be looked at in context ("how has Prosper done against Sam's group?").

## 2. Problem
Oracle has no record of games played. Claude asked for it, and today the only place such notes live is in chats. This is new stored data (needs an Architect contract and an owner-approved database change) and Claude would write it, so the connector safety rules apply.

## 3. Goals
1. Log a game from Claude or from Oracle.
2. See a deck's history: games, wins, notes.
3. Keep a simple playgroup list: people and the decks they play.
4. Nothing here blocks a future multi-user version: every game belongs to one Oracle account.

## 4. Scope
In: game records, playgroup people, viewing and editing them, undo for Claude-made entries. Out: automated debrief or AI analysis (O-004 rest), tournament tracking, life-total tracking, anything that changes decks or the collection.

## 5. Scenarios
| # | When | Wants |
|---|---|---|
| S1 | After a game, in Claude | "Log: Korvold won, 4 players, Sam's Atraxa was strong." Saved, with undo |
| S2 | Planning | "How has my Prosper deck done?" Claude reads wins, losses, notes |
| S3 | Before game night | "Who usually comes, and what do they play?" |

## 6. Proposed slices (Architect to confirm)
1. Contract and stored data (owner gate): games and playgroup people.
2. Claude can log, read and undo games.
3. Oracle screens: a game history list on each deck, and a Playgroup page. Needs Designer mockup and owner approval before build.

## 7. Owner answers and defaults
**Answered by owner 2026-11-16:**
1. **Game record = Gene's suggestion:** date, your deck, result (won / lost / draw), number of players, free-text notes.
2. **Claude-logged games go straight in, with undo** (7 days, like small deck edits). No per-game approval.
3. **Claude can fix and undo its own entries; only the owner can delete games.**
4. **Record the pod and the power level** (specifics below).
5. **Opponents' decks are free text for now** (e.g. "Sam's Atraxa"); a saved list per person comes later.

**DEFAULTS (owner has not answered; Gene's recommendations, approve or change):**
- **Pod and power level: DEFAULT = pod is a list of people from your playgroup; ONE agreed power level or bracket for the whole table, optional.** (Owner has not yet said "one number per table or per deck". Per-deck numbers would be a later addition.) CONFIRMED by owner 2026-11-16: one number for the whole table.
- **Who won when it was not you: DEFAULT = not recorded**; "lost" is enough (the record stays as answer 1).
- **Who can log or see: DEFAULT = you and Claude on your behalf; owner only, nobody else in the playgroup.**
- **Playgroup people: DEFAULT = name, usual decks, notes.**
- **Past games: DEFAULT = start from now; no bulk import.**
- **Debrief (O-004): DEFAULT = facts only; no "how did it go" prompt or analysis.**

## 8. Risks
- Privacy: playgroup names are other people's data. Kept private to your account; not shared.
- Scope creep into stat tracking. Mitigation: facts only in the first version.
- Claude entering a wrong deck or result. Mitigation: undo, plus Claude repeats back what it logged.

## 9. Next gates
Owner confirms the pod and power-level default and approves, then Architect contract (new stored data, owner gate), Designer mockup (owner gate), Developer, Tester, Scribe.

For Brad (plain words): this proposes a way to record games you play, with Claude able to log them, and asks you to decide what a game record holds.
