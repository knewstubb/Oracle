# Approval pack: the five database changes for card roles, deck jobs, strategy and health targets
Role: Coder
Date: 2026-11-18
Status: for owner approval. Nothing in this pack has been applied to any database.

## Summary for the owner

These five changes give the app somewhere to keep card roles, each card's job in a deck, a deck's strategy points, and the health numbers Claude sets for a deck. They only add new places to store things. None of them changes or removes a card, deck, copy or note you already have.

**Decision for you:** approve all five to be applied in the order below, or tell me which to hold back. Each one can be undone while it is still empty (details per change).

**Order to apply them:** 1, then 2, then 3, then 4, then 5. Changes 3 and 4 do not depend on each other, so those two can swap, but 5 must come after 2 and is best last.

**What each one adds, in plain words**

| # | What it adds | Existing data touched | Can it be undone? |
|---|---|---|---|
| 1 | A shared list of what job a card does in general (ramp, card draw, removal and so on), plus your own personal layer on top where you or Claude can add or remove a role for a card. The shared list starts empty. | None | Yes, while nothing has been saved in it. |
| 2 | Lets Claude suggest roles for cards and have them show up in "Recent changes" with one-click Undo, like its other edits. Until changes 3 and 4 are in, Claude is told that jobs and strategy points are not available yet. | None. Cards, decks and old change history are not edited. | Yes, while no role suggestion has been logged. |
| 3 | A place to save each card's job in a deck (for example "Engine") with the reason it is there. The job follows the card, so re-importing a deck does not lose it. Jobs never change the health counts. | None | Yes, while no job has been saved. |
| 4 | A place to save a deck's strategy points, such as "Artifacts count as ramp in this deck", with what they cover and whether they change a health count. | None | Yes, while no strategy point has been saved. |
| 5 | A place to save the health numbers for a deck (lands, ramp, card advantage, interaction). Claude sets each number from the deck's strategy and gives a short reason. You can override any number, and Claude then leaves it alone until you hand it back to Claude. Claude's changes can be undone in one click. | None. Your old per-deck health settings are left exactly as they are and are not read. | Yes, while no number has been saved. |

**What "can it be undone" means here.** Each change comes with a matching undo step that puts the database back exactly as it was. The undo step refuses to run once there is saved data in the new places, so it cannot delete your work by accident. Removing saved data needs a separate, deliberate go-ahead from you at that time. Undoing must be done in the opposite order: 5, 4, 3, 2, 1.

**Handing a health number back to Claude.** When you hand a number back, your override is removed and the group has no stored number until Claude sets it again. Until then the screen uses the fallback numbers (the build's, then the commander average, then the common guide). Tell me if you would rather keep your old number visible until Claude replaces it.

**Safety.** Every change keeps each person's data private to them, and nothing can be written except through the app's own server. The tests (below) include a second user trying to read or change the first user's data, and being refused.

**Tested, not applied.** All five were run only on a throwaway test database that is deleted afterwards: 301 checks, no failures. That includes applying all five in order, in the other allowed order, undoing them in reverse and confirming the database ends up exactly as it started, and applying them again.

## Technical notes (for agents)

Draft files, all under `supabase/drafts/` (each has a matching rollback file):

`20261118120000_roles_db1_card_roles.draft.sql`

`20261118120100_roles_db2_change_kinds.draft.sql`

`20261118120200_roles_db3_deck_card_jobs.draft.sql`

`20261118120300_roles_db4_strategy_points.draft.sql`

`20261118120400_roles_db5_health_targets.draft.sql`

Test evidence and re-run instructions are in the roles-db evidence folder next to this report (README there). Run one with `./run.sh <name>` from that folder.

- DB-1 and DB-2: no existing table or row is changed. DB-2 widens two allow-lists by two names and puts a thin front door in front of four existing connector functions (every other kind still runs the same code).
- DB-3, DB-4: one new table each; four stub steps replaced with real bodies.
- DB-5: one new table, one extra name in the same two allow-lists, and the same four front doors get one extra line each. The rollback restores the DB-2 text byte for byte (checked by a fingerprint of every function, grant, constraint, table and trigger).
- "Handed back to Claude" is stored as the deletion of the owner row, as the contract (S17, 3.6) says. If you want a visible "handed back" state instead, that is a contract change, not a draft change.
- Apply order is enforced by the drafts themselves: each one refuses to run if what it needs is missing or it is already applied. Rollbacks refuse out of order.
- Nothing has been applied to the local or the live database. Before applying, re-check `docs/oracle/status.md` for what is currently deployed.
