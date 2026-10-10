# Report: old-workspace-tidy-up
Role: Gene
Status: DONE
Task as received: Tidy up what is safe and then come back to me with outstanding questions. Make sure they are framed in the context of the current main build

## Summary for the owner
Seven old workspaces have been cleared away. Before that, the three finished write-ups they held (the AI suggestions review, the slow-loading study and the pre-launch test) were saved into the main project. The AI advisor plan and the final card rules are still kept, because both are waiting on your answers below. The to-do list now shows the Collection, price and AI fixes as live.

## What was done
- **Saved into main:** the AI suggestions review (T-19), the loading study (T-27) and the combined pre-launch test write-up (I-01). Each was checked to be an exact copy.
- **Archived in Paseo:** t32-collection-client, t33-price-freshness, t34-native-stream-fragments, t28-state-contract, grand-dodo, t19-ai-assessment and t27-loading-baseline. Before archiving, every file in them was confirmed to be in main, a spare copy kept in t15/t28-hardening, or an older draft of a note that is newer in main.
- **Removed the seven matching labels** (branches). None held work missing from main; grand-dodo's one saved change matched the Archidekt import already in main.
- **To-do list corrected:** T-32/T-33/T-34 and T-35 are marked DONE (merged 5 October), the duplicate T-35 line is removed, and T-19/T-27 note where their write-ups now live.
- **Corrected the review report:** the fixes went live on 5 October, not 1 October.
- **Kept:** t15-advisor-contract-astra and t28-contract-hardening-astra (waiting on answers below), and task-t35-archidekt-any-account (not in scope; empty, its work is in main).

## Outstanding questions (framed against the app as it is today)

### AI advisor: current milestone, from the T-15 plan and T-19 review
1. **Should the deck assistant ask before changing your deck?** Today, if you ask the sidebar assistant to add or cut cards, it changes the deck immediately, with no confirmation and no undo. *Recommend:* make it show suggestions you choose to add yourself, until undo arrives in the next milestone. You would see suggestion cards with an Add button instead of cards appearing in the deck by themselves.
2. **Which prices should "buy" suggestions show?** The roadmap promises Card Kingdom prices, but the app has no working Card Kingdom price feed today. *Recommend:* show Scryfall prices clearly labelled as estimates for now. The alternative is to show no buying advice until Card Kingdom prices work.
3. **Approve three advisor defaults?** (a) If an Upgrade refresh fails, keep the old suggestions with a note rather than wiping them. (b) Ask you before suggesting infinite-combo packages. (c) For a new or unusual commander, give three well-explained ideas rather than ten generic staples. *Recommend:* yes to all three.

### Card rules: from the T-28 plan, checked against the new Reconcile page
4. **How should the Reconcile page and the shortage list relate?** The Reconcile page built on 5 October ignores proxies. For example, with two decks needing Sol Ring, one original and one proxy, Sol Ring does not appear. Your shortage rule says it should appear as "one more original needed". *Recommend:* keep Reconcile for "decks fighting over the same original" and build the shortage list as a separate view later. You would see two views with different jobs. Both rules also need your sign-off: Reconcile currently counts every deck, skips basic lands and skips cards you own no original of.
5. **Should retired decks count towards shortages?** The retired-deck folder isn't built yet, so today every deck counts. *Recommend:* don't count retired decks, so old lists don't inflate what you need to buy.
6. **What happens to cards already marked Missing?** The Collection screen still has a hidden "Missing" toggle, which you decided to remove. *Recommend:* keep those copies unavailable to decks and list them once so you can restore any you find. Nothing would quietly reappear as available.
7. **What printing should a new proxy record?** *Recommend:* the printing the deck asks for. For example, a proxy made for a deck's Borderless Sol Ring is recorded as that printing.
8. **What happens when a deck switches a basic land between a real copy and "generic"?** The deck screen already has "Make all lands generic". *Recommend:* the real copy goes back to storage and the deck's card count stays the same.
9. **When is a Casual deck "complete"?** The app supports Casual decks, but the Draft / Assembling / Playable rule is defined only for Commander. Deck tiles still show today's green / amber / red colours. *Recommend:* decide this after Commander decks work, and keep Casual decks as they are until then.

### Housekeeping
10. **Save the main project's unsaved planning notes?** Your approved decisions D-025 to D-033, the three review plans, the to-do list and about 30 reports are in the main project folder but were never saved to history. *Recommend:* save them now. Until then, they could be lost or overwritten.
11. **Mark the AI advisor milestone (M2) as current in the roadmap?** The roadmap still says M1 (Trustworthy data), but its exit test was completed and the to-do list already treats M2 as current. *Recommend:* yes.
12. **Two small follow-ups from the pre-launch test.** Have you clicked through the Collection checklist since the fixes went live? It covers search, paging, filters and the "no results" message. Also, should one test that fails at random be fixed? *Recommend:* a small fix task for the test.

## Changed files
- docs/oracle/reports/2026-09-30-architect-i01-first-batch-integration.md — brought in from grand-dodo (identical copy)
- docs/oracle/contracts/collection-loading-solutions.md — brought in from t27 (identical)
- docs/oracle/reports/2026-09-29-architect-t27-loading-solutions.md — brought in from t27 (identical)
- docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md — brought in from t27 (identical)
- docs/oracle/contracts/ai-recommendations-assessment-2026-09.md — brought in from t19 (identical)
- docs/oracle/reports/2026-09-29-architect-t19-ai-recommendations.md — brought in from t19 (identical)
- docs/oracle/reports/2026-10-10-gene-old-workspace-review.md — merge date corrected (5 Oct)
- docs/oracle/status.md — T-19/T-27/T-32/T-33/T-34/T-35 rows updated, duplicate T-35 row removed (left unsaved with the rest of the main folder's notes; see Q10)
- docs/oracle/reports/2026-10-10-gene-old-workspace-tidy-up.md — this report

## New decisions made (need owner confirmation)
- None.

## Assumptions
- "Tidy up what is safe" covered: bringing in the three write-up sets, archiving the seven workspaces with nothing unique left, and deleting their fully merged branches. t15/t28-hardening were kept, as recommended.
- Out of scope and left untouched: `/tmp/oracle-i01-integration`, `/tmp/pre-merge-main`, `/tmp/pre-t22`, `/tmp/verify-baseline`, `t19-jev-research` branch, rooftop/ubiquity worktrees on Oracle branches, and the task-t35 workspace.

## Challenges to locked decisions
- none

## Open questions
- Q1–Q12 above. Technical mapping: Q1 = T-15 O1 / T-19 (src/contexts/OracleContext.tsx applies `add_cards`/`remove_cards` events directly via `/api/decks/[id]/cards/batch`) [Confirmed]. Q2 = O5 (`prices/refresh` route notes the CK table was removed and is mid-rewrite) [Approximate]. Q3 = O2/O3/O4. Q4 = D-027 vs the 2026-10-05 Reconcile report's "New decisions" [Confirmed: src/lib/reconcile-overuse.ts]. Q5 = T-28 Q1. Q6 = G-D1/D-028 [Confirmed: src/components/collection/MissingToggle.tsx]. Q7 = G-M3. Q8 = G-D2/G-D3. Q9 = G-O1 [Confirmed: src/components/DeckTile.tsx getReadinessTier still green/amber/red]. Q10 = gate 5. Q11 = O-006 / gate 6. Q12 = I-01 open questions.

## Verification
- `cmp` of each brought-in file against its workspace source — all identical.
- Pre-archive sweep of all `git status -uall` paths in the seven workspaces — every path was in main, an older superseded draft (dispatch reports; workspace-only lines were pre-launch placeholders), or a spare copy byte-identical to t15/t28-hardening.
- `paseo workspace archive` ×7 — all `archived`; folders removed; `git worktree list` shows only t15, t28-hardening and t35 under 03dz1jp4.
- `git rev-list --count main..<branch>` = 0 for six branches; grand-dodo's tree equals 1f15656 (in main) — branches deleted.
