# Approval pack: database change 6, the deck strategy store
Role: Architect
Date: 2026-11-18
Status: for owner approval. Nothing in this pack has been applied to any database.

## Summary for the owner
This change gives each deck a place to keep its strategy as a few short sentences (an Aim, what the commander enables, win conditions, and an optional "Play it like" line, at most 7 per deck), and a place to say which of those a card's job serves. You and Claude can both read and add to them. Claude's additions are labelled "Proposed by Claude" and count as unconfirmed assumptions until you accept them. Claude can never overwrite a sentence you wrote: its new wording sits beside yours until you accept it.

**Decision for you:** approve change 6 (after changes 1 to 5), and answer the open points in the design report (win condition move, bracket first, the roles question).

**What it adds**
| What | In plain words |
|---|---|
| Strategy items | The Aim, What the commander enables, Win condition and Play it like sentences. Limits: 1 Aim, 3 of each of the next two, 1 Play it like, 7 in total. |
| Serves links | "This card's job serves that sentence." One link per card per deck. A link never changes a health count. |
| Two new kinds in Recent changes | Claude's item and link suggestions appear there with one-click Undo, like its other edits. The 120-card rule applies to links. |
| A "strategy changed" check | Lets the Strategy tab say your strategy changed after Claude set the health numbers. It is worked out from update times; nothing extra is stored. |

**What existing data it touches: none.** No card, deck, copy, note, job, strategy point or health number is changed. Your written win condition stays exactly where it is.

**Can it be undone?** Yes. A matching undo step puts the database back exactly as it was (checked on the test database). It refuses to run while there is saved strategy data or Claude change history for these items, so it cannot delete your work by accident. Removing saved data needs a separate, deliberate go-ahead from you. Undo order: change 6 first, then 5, 4, 3, 2, 1. The undo steps for changes 3 and 5 now refuse until change 6 is undone (one added check line each; what they restore is unchanged).

**Optional second file: copy your written win conditions.** It makes one Win condition item, marked "Set by you", from each deck's written win condition (up to 300 characters). It only adds. The old text is not touched or deleted. A longer text is skipped, not cut, and reported. A deck that is already full is skipped. Running it twice makes no second copy. Its undo removes only the copies you have not edited. I recommend running it only after you approve the "move the win condition" point.

**Safety.** Each person sees only their own rows, nothing can be written except through the app's server, and the test includes a second user trying to read and change the first user's data and being refused.

**Tested, not applied.** Run only on a throwaway test database that is deleted afterwards: 111 checks for this change and 16 for all six together, no failures. The earlier five changes still pass their own checks (51, 84, 56, 52, 44). Covered: apply, rollback to the exact earlier state, re-apply, and the whole stack rolling back to the state before change 1.

## Technical notes (for agents)
Files under `supabase/drafts/`, each with a rollback:
`20261118140000_roles_db6_deck_strategy.draft.sql`
`20261118140100_roles_db6b_copy_win_conditions.draft.sql`
- Additive: two tables, new functions, two allow-lists widened by two names (`strategy_item`, `job_link`).
- Front doors: the four DB-5 functions are renamed to `*_pre_strategy` (text and grants untouched) and thin new ones handle the two new kinds. No DB-2 or DB-5 function body is rewritten. The DB-5 and DB-3 rollback files gained one guard line each (refuse while DB-6 is applied).
- Differences from the contract, written back into it: evidence cards are resolved from the deck's own slots, not checked against `ref_printings`; deleting an item sets a beside-wording row to dismissed instead of leaving it live; accept-all skips rewordings; the copy marks its rows with the reason "Copied from your written win condition."
- Evidence: `evidence/roles-db/test_db6.sh` and `.out`, `test_chain.sh`, run with `./run.sh <name>`.
