# Report: import-cleanup-brief
Role: Architect
Status: DONE
Task as received: Draft the CLEANUP BRIEF for owner approval, following docs/oracle/process.md. Write docs/oracle/briefs/import-cleanup.md plus this report. No code deletions, no DB writes, don't edit decisions.md. Contents: KEEP, DELETE (with what the user stops seeing, risk, verification incl. dynamic-string callers; uncertain items as "needs owner decision"), DECISIONS to change (D-020, D-031, D-044, D-047, D-050, D-052, D-006 mis-citation, "Reconcile" double meaning), DOCS to mark superseded, ordered SLICES with Tester verification, owner questions (max 3 options, recommendation first). Short and scannable.

## Summary for the owner
The cleanup plan is ready for your approval. Four things can be removed now with no visible change (old unused import code, a re-import route nobody uses, and five unused onboarding routes). **Update 2026-10-23: you decided to fix the Precon tab rather than delete it**, so it is now a separate fix slice (P1) using the community precon dataset; saving the card lists needs a small database change that waits for your approval. Everything else waits for answers from you: whether to offer "Sleeve the cards you already own" after an import, whether to keep importing decks from a link, whether other CSV files still matter, whether you want a "Start fresh" button, and two new precon questions (what happens if you already own the cards; confirming exact printings). Nothing has been deleted.

## Changed files
- docs/oracle/briefs/import-cleanup.md — the brief (new)
- docs/oracle/reports/2026-10-23-architect-import-cleanup-brief.md — this report (new)

## New decisions made (need owner confirmation)
- Proposed rewordings of D-020, D-031, D-044, D-047, D-050, D-052, D-018/D-022 and a clarifying note on D-006, all listed in the brief; none applied.

## Assumptions
- The brief's order treats the slices 1-4 as touching no save path, so they can ship before the separate test account exists.
- "No caller" was re-checked for literal, template-string and concatenated URLs across src, scripts, tests, config and .github; a URL built from several variables would not be found.

## Challenges to locked decisions
- Same as the audit: D-020/D-047 (contradicted by link-import built mode and onboarding claims), D-031 and D-052 (superseded), D-044 (silent on onboarding), D-050 vs contract wording.

## Findings that changed since the audit
- Re-check found five onboarding server routes with no caller (`collection`, `resolve`, `moxfield/resolve`, `conflicts`, `conflicts/resolve`) — previously only partly noted.
- Whether non-ManaBox CSVs can still be imported through the new collection screen is **uncertain**; the old route modes that handle them are listed as "needs owner decision", not for deletion.
- `/api/decks/[id]/allocate` has no caller anywhere (also no e2e or script use) and is kept.

## Open questions
No open questions remain in the brief: Q1–Q6 and the "copy in another deck" question are answered (see updates below).

## Update 2026-10-23 (owner answers Q1, Q3, Q4, Q5, Q6)
- Q1 yes: deck import can sleeve owned cards, designed as I bought it / I built it / I'm planning it; import is source of truth; copies can move between decks. Slice 5 flagged as likely replaced by this intent design (not decided); D-020/D-047 wording on hold for it. New small question: show "Moves from Deck A" before moving?
- Q3 yes: other CSV files stay (low priority). Slice 8 dropped; nothing deleted from the old collection route modes.
- Q4: keep Settings "Clear All Data"; no Start fresh flow. Slice 9 dropped; D-050 needs no new wording.
- Q5: precons import all 100 as new Originals even if owned. Q6: exact printings as listed. Both closed and removed from open questions. Only Q2 (links) and the new "moves between decks" question remain open.
- Q2 answered (option a): intent choices apply to every import method incl. links; links feed the same review; onboarding importer and three-choice screen retire after (slices 6, 7). D-044 / D-018 / D-022 notes updated; D-018/D-022 still need a Designer decision on Maybeboard in the review.
- "Copy in another deck" answered by the Designer's revision: the review shows which decks the card is in so the owner confirms which deck is missing it; if skipped, the card is added sleeved and the affected decklist shows an accounting-error alert. My "Moves from Deck A" question is removed.

### Earlier update (Precon tab, same day)
- Precon tab removed from the DELETE list and from slice 3 (slice 3 now "not used"); new slice **P1** added (store card lists in sync, `/api/precons`, open the chosen precon in the same review). Database change needs owner approval before applying.
- Owner decided: chosen precon defaults to "I bought it" (all 100 as Originals); printings exactly as the dataset lists (pending owner confirm). New questions Q5 (already own the cards) and Q6 (confirm printings) in the brief.
- Verified in code: the review accepts exact printings via the CSV path (Scryfall ID, set code, collector number, finish, quantity), not as a pre-built object. Details and small gaps (commander preselect, default copy type, set-code mapping) in brief section 6a. Nothing was run.
