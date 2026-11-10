# Vector recommendation trial (Nov 2026) — archive

Outcome: NOT A GO (2026-11-09). Meaning-based (vector) suggestions beat EDHREC popularity order on the three test decks by +0.056, +0.093 and +0.017 nDCG@10 against a +0.10 bar, found 0/2/1 novel cards per deck against 3, and were preferred in 4 of 10 comparisons against 7. Stop line not triggered, so the result is "iterate"; the owner chose to park vectors and keep EDHREC-based suggestions.

Bright spot: the Commander Spellbook combo signal surfaced useful cards (14 of 23 combo-only cards graded 2 or higher). Candidate for a separate small feature later.

Not tested: tags A/B arm, multi-feature merged query, specificity (staple set), build-seed no-harm check. Sample was small: 3 lists, 1 grader.

Contents: `reports/` (all trial agent reports, verdict is `2026-11-09-architect-v20-verdict.md`), the contract, freeze and sheet-format docs, the brief, and the owner's grades and scores in `results/`.

Removed after the verdict: the three trial tables, the similar-cards function and the vector extension online; the trial code, sealed answer keys and grading page (git branches `trial/vector-*`); local Homebrew Postgres.
