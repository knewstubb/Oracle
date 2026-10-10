# Report: t19-ai-recommendations
Role: Architect
Status: DONE
Task as received: You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
Task T-19: Assess the existing AI recommendation system end to end, verify whether Jev is a good fit, and recommend how existing data can support commander-specific mechanics and archetype coverage. Use the complete Research brief in docs/oracle/reports/2026-09-29-orchestrator-dispatch-ai-assessment.md, current decisions and the prior AI audit as inputs; perform current public-source research without sharing private code or collection/deck data.
Done when: docs/oracle/contracts/ai-recommendations-assessment-2026-09.md and docs/oracle/reports/2026-09-29-architect-t19-ai-recommendations.md provide a source-backed system map, Jev verdict against alternatives, commander coverage matrix, measurable evaluation plan and prioritised improvements; then stop without implementing, committing, deploying or delegating.

## Summary for the owner
My recommendation is to fix what the assistant knows and checks before changing the AI model. Jev is a real product, but it only sorts things into answers you define. It can't write deck advice, so it's not worth adopting yet. For example, Prosper makes a Treasure whenever you play a card from exile, lands included, while Korvold draws whenever you sacrifice anything. Today both get much the same generic black-red suggestions, and the assistant can still suggest cards that are now banned. One thing needs your decision: at the moment, the sidebar assistant adds and removes deck cards itself without asking.

Alternatives, recommended first:
1. **Fix the data and checks, keep the current AI.** Suggestions become specific to each commander and every card is a real, legal card with correct ownership labels. This is steady, measurable work with no new supplier.
2. **Same as 1, then a small trial of Jev for card sorting only.** You would see no difference unless the trial beats option 1. It adds a new supplier that is still in early access.
3. **Same as 1, plus a learning ranker.** This could surface more unusual cards later. It needs far more accept/skip history than one user produces.

## Changed files
- docs/oracle/contracts/ai-recommendations-assessment-2026-09.md — new assessment (not an approved contract): system map, data inventory, lever attribution, Jev verdict and trial design, mechanics model and pipeline, 16-commander matrix, worked/negative examples, evaluation plan, prioritised sequence.
- docs/oracle/reports/2026-09-29-architect-t19-ai-recommendations.md — this report.

No code, test, dependency manifest, migration, status/roadmap/decisions, spec or mockup was edited. `npm ci` populated the untracked `node_modules` folder so existing tests could run; no tracked file changed.

## Jev verdict
**Not recommended yet.** Confidence: medium-high that "not now" is right; low-medium on eventual value.

- **Identity (verified from primary sources, 2026-09-29):** Jev is TypeSafe AI's first "System One" model (`jev-1.13.0`), in early access since 15 September 2026. It is a classifier: yes/no ("Noul"), choice, and score. It does not generate text, cannot be fine-tuned, and costs $0.042 per million input tokens.
- **Independent evidence:** accuracy is mid-tier, level with DeepSeek, which Oracle already uses, and behind frontier models. Calibration is good on familiar English tasks.
- **Fit for Oracle:**
  - Possible only for card tagging.
  - Weak for commander ranking.
  - Poor for rules interactions.
  - Not applicable to explanations.
- **Remaining gates before any trial:**
  - G1: face-aware card facts keyed by card identity.
  - G2: a unified tag vocabulary with a deterministic parser.
  - G3: a frozen gold set.
  - G4: owner approval of a vendor account and spend (public card text only).
- The trial design and thresholds are in the assessment, §4.6.

## New decisions made (need owner confirmation)
- None adopted.
- Proposed, for later owner approval:
  - Recommendations should be proposals the owner confirms, with no automatic deck edits.
  - Community popularity (EDHREC inclusion) is used as evidence, never as the main ranking or as an evaluation label.
  - Missing preferences (combos, bracket, budget) are treated as unknown rather than defaulted.

## Assumptions
- The generated Supabase types reflect the deployed schema. Row counts come only from the local snapshot and research exports, not the live database.
- Commander coverage in the live EDHREC tables is approximate, because the snapshot stores only build IDs.
- A Commander "play" includes playing a land. Casting a card from exile satisfies "play a card from exile" regardless of who owns it. Both follow the verified card wording and standard rules usage; neither was checked against a judge ruling database.

## Challenges to locked decisions
- None to the locked decisions themselves.
- Current code conflicts with approved direction and decisions:
  - Sidebar advice auto-applies deck edits, against the brief's read-only proposals and the M3 "act on advice with undo" direction.
  - AI list edits carry no `ai` source (D-009).
  - Several live paths parse model prose (D-016).
  - The ownership tool cannot express D-025/D-026 labels.
  - Missing preferences are replaced by defaults.
- Evidence is in the assessment, §1 and §2. Suggested handling: fix as described in §10, steps 1–4, not by changing decisions.

## Open questions
- When the assistant suggests adding or removing cards, should anything change in the deck before you confirm it? (Recommended: no.)
- If you haven't said whether you want combos, should suggestions include infinite combos? (Recommended: show them only as a separate, clearly labelled group.)
- For a brand-new commander with little community data, would you rather see fewer, explained suggestions than a list padded with generic staples? (Recommended: yes.)
- The accuracy and relevance thresholds marked "owner calibration" in §8.2 need your sign-off before any experiment.

## Verification
- Read the required inputs: AGENTS.md, the architect role file, the full brief, decisions (including the uncommitted Orchestrator updates), the prior AI audit and prior Jev research.
- Traced code with repository search and file reads, covering routes, tools, adapters, prompts, classifiers, migrations, scripts and research exports. Every claim is tagged in the assessment.
- `sqlite3 -readonly` on `data/commander-context/*.sqlite`:
  - 1,885 builds × exactly 50 cards = 94,250 rows;
  - about 65% of rows flagged signature or staple;
  - `scripts/sync-edhrec-builds.ts` confirms the top-50 cut is by inclusion.
- Scryfall public API, public card names only:
  - `POST /cards/collection` returned 73/73 cards;
  - `GET /cards/search` for recent commanders;
  - this confirmed rules text, faces, legality (Dockside Extortionist, Mana Crypt and Jeweled Lotus banned) and a post-snapshot commander (Vraska, Soul of Stone).
- Temporary script `/tmp/t19/demo.ts` (deleted afterwards) ran the live `inferFromOracleText` classifier on verified texts. Misclassifications are recorded in assessment §1.5.
- `npx vitest run` on eight AI-related offline test files: **252 passed, 10 failed.**
  - 8 failures are the missing local environment (`NEXT_PUBLIC_SUPABASE_URL`), in the recommend route and upgrade-engine property tests.
  - 2 failures are outdated expectations in `brew-prompts.test.ts`. The prompt was changed to a grounded "select only from supplied lists" instruction that is used only by the dead `/api/ai/brew/generate` route.
  - No live, paid or write suites were run.
- Public research on Jev: the TypeSafe blog and docs, the LangChain post and two independent sources were fetched and read. Unverified search-summary claims were excluded. No Oracle code or data was sent to any service, and no API account or spend was used.
- Not done, by instruction: no commits, deployments, database writes, delegation or paid benchmarks.
