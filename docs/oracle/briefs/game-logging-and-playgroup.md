# Brief: Game logging and playgroup (Gate 1 DRAFT)
Author: Gene, drafted 2026-11-16. Status: **DRAFT, awaiting owner approval. NOT approved. Nothing is built.** Owner said YES on 2026-11-16 to Claude being able to log games in Oracle. Related: roadmap item O-004 (post-game debrief), parked until after M3. This brief would pull the logging part forward; owner to confirm.

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

## 7. Open questions for the owner (behaviour). Please answer before approval
1. **What is in a game record?** Recommended minimum: date, your deck, result (won / lost / draw), number of players, free-text notes. Anything else? Options to add: turn the game ended, how it ended (combo, combat...), the opponents' decks and commanders, which player won if not you, game length, "would play again".
2. **Result when you are not the winner.** Is it enough to say "lost", or do you want to record who won?
3. **Who can log?** Recommended: you, and Claude on your behalf (with the same undo as other Claude edits, 7 days). Could other people in your playgroup ever add or see games? (Affects a future public version; recommended: no, owner only for now.)
4. **Does Claude need approval?** Recommended: one game goes straight in with undo, like small deck edits. Alternative: every logged game waits for your yes. Which?
5. **Editing and deleting.** Can Claude fix a wrong entry? Can Claude delete one? Recommended: Claude can edit its own entries and undo them; only you can delete games.
6. **Pods and power level.** Do you want each game to record the pod (the group of players that night) and its power level or bracket? If yes: is the power level one number for the table (e.g. bracket 3), or each player's deck? Recommended: pod = list of people from your playgroup; one agreed table bracket (optional).
7. **Opponent decks.** Free-text names ("Sam's Atraxa") or a saved list per person that you maintain? Recommended: free text at first, saved list later.
8. **Playgroup people.** What should Oracle know about each person: just a name, or also usual decks, bracket they like, notes? Recommended: name, usual decks, notes.
9. **Past games.** Will you want to enter old games in bulk, or only start from now? (Bulk would need an import.)
10. **Debrief (O-004).** Should this brief include a short "how did it go" prompt, or just record facts? Recommended: record facts only; leave analysis for later.

## 8. Risks
- Privacy: playgroup names are other people's data. Kept private to your account; not shared.
- Scope creep into stat tracking. Mitigation: facts only in the first version.
- Claude entering a wrong deck or result. Mitigation: undo, plus Claude repeats back what it logged.

## 9. Next gates
Owner answers section 7 and approves, then Architect contract (new stored data, owner gate), Designer mockup (owner gate), Developer, Tester, Scribe.

For Brad (plain words): this proposes a way to record games you play, with Claude able to log them, and asks you to decide what a game record holds.
