# Report: dispatch-ai-assessment
Role: Orchestrator
Status: DONE
Task as received:
> Set up another agent to do a full assessment of the existing system and focus on how to.make the AI better. I would like to find out if Jev is a good option for recommendations. How can we use the data we have to make commander specific recommendations that cover all the mechanics and archetypes that are related

## Summary for the owner
A separate Opus agent has started examining what Oracle knows, what its recommendations actually use, and where useful commander-specific interactions are being missed. It will compare Jev with alternatives and recommend how to cover different strategies without falling back to the same popular cards for every commander.

## Changed files
- docs/oracle/status.md — expands the existing T-19 research task to the owner's requested AI assessment without starting implementation.
- docs/oracle/roadmap.md — records the owner's explicit read-only AI assessment authorisation alongside the existing quality pass.
- docs/oracle/reports/2026-09-29-orchestrator-dispatch-ai-assessment.md — records the bounded research brief, handoff and continuation.

## Dispatch
- Role: Architect, one new agent, no sub-delegation.
- Selected model: `copilot/claude-opus-5.5`, high reasoning.
- Workspace: `wks_06873aa53ec2e5d6`.
- Worktree: `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t19-ai-assessment`.
- Branch: `task/t19-ai-assessment-20260929`.
- Base: explicit local `refs/heads/main`, `0a74e8e3604dddc69d8e9976229b3a4a9186af00`.
- Agent ID: `7d860b27-5910-40ee-8e49-b816812dff92`, returned `running` by the actual launch.
- Launch inspection: confirmed `claude-opus-5.5`, `high`, normal Agent mode, the isolated worktree and parent agent `c3f14e05-5dae-4530-a342-5ff1dec17019`.
- Named launch profiles are not exposed by this CLI. Model selection uses the available Copilot model list, retaining the owner's instruction to use stronger models where appropriate.

The current documentation tree was copied before launch, and the decisions, roadmap, status, prior AI audit and this complete brief were compared byte-for-byte. No credentials or private deck exports were copied. The initial shell request only read the role/brief and listed documentation directories; it was individually approved without enabling Allow All. This report completes dispatch, not the assessment.

### Actual initial prompt

```text
You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
Task T-19: Assess the existing AI recommendation system end to end, verify whether Jev is a good fit, and recommend how existing data can support commander-specific mechanics and archetype coverage. Use the complete Research brief in docs/oracle/reports/2026-09-29-orchestrator-dispatch-ai-assessment.md, current decisions and the prior AI audit as inputs; perform current public-source research without sharing private code or collection/deck data.
Done when: docs/oracle/contracts/ai-recommendations-assessment-2026-09.md and docs/oracle/reports/2026-09-29-architect-t19-ai-recommendations.md provide a source-backed system map, Jev verdict against alternatives, commander coverage matrix, measurable evaluation plan and prioritised improvements; then stop without implementing, committing, deploying or delegating.
```

## Research brief — required task scope

### Authority, inputs and boundaries

Read `AGENTS.md`, `.paseo/agents/architect.md`, current decisions/roadmap/status, and this entire brief first. Use the existing read/view/search tools for initial document inspection rather than shelling out just to read files. Current approved documentation is copied into this isolated worktree before launch; those uncommitted input files are not your output and must not be reverted or committed.

The existing T-14 audit is background, not proof of current behaviour: `docs/oracle/contracts/ai-audit-2026-09.md`. Relevant inputs also include the state-of-the-nation report and the three current plans. Recheck the present code/data contracts where necessary. This task is the full AI-recommendation system assessment, not another general UI audit, collection-performance investigation, or exploit/security review.

Output only:
- `docs/oracle/contracts/ai-recommendations-assessment-2026-09.md` — source-backed assessment and proposed architecture, clearly labelled an assessment, not an approved implementation contract.
- `docs/oracle/reports/2026-09-29-architect-t19-ai-recommendations.md` — required completion report, including a clear Jev verdict, evidence, remaining gates, exact output paths and verification.

Do not edit production code, dependencies, tests, existing contracts/reports, status/roadmap/decisions, specs/mockups or migrations. Do not write to a database, run imports/ingestion/cron jobs, commit, push, merge, deploy, create accounts, subscribe to services, download model weights or execute third-party repository code. Do not start other agents or inspect the other agents' worktrees.

Public-source web research is authorised and required for Jev/current service capabilities, using vendor documentation/model cards, official repositories and independent technical evidence where available. Query public product/technical concepts, not private repository snippets or the owner's private deck/collection data. No private code, credentials, personal data, deck exports or collection contents may be uploaded to Jev or another new service. No paid model API benchmarking is authorised. Do not print secret/config/auth contents. Respect upstream API limits, data licences and usage terms; do not bypass access restrictions or assume undocumented endpoints are stable.

### 1. Map the actual AI system and its data

Trace the existing user-facing AI journeys and background data preparation end to end: commander discovery, new-deck generation, deck skeletons, refinement/add-cut advice, chat/advisor, card classification/tags, synergy scoring, search/retrieval, tools, provider adapters, caching and structured-output validation. Mark dead or unwired paths separately from live consumers. Include other journeys only where they materially supply or consume recommendation data.

Starting points, to locate and follow rather than assume complete:
- `src/app/api/brew/*`, `src/app/api/ai/brew/*`, `src/app/api/decks/[id]/chat`
- `src/lib/tool-registry.ts`, `src/lib/adapters/*`
- Existing commander, archetype, categorisation, synergy, skeleton/refinement, Scryfall, EDHREC, Commander Spellbook, Card Kingdom and provider integrations
- Relevant hooks/components that construct or display AI requests/responses
- Current schema/types/migrations, data ingestion/enrichment paths, existing fixtures and AI-related tests

Build a data inventory: what is actually stored, available on demand, derived, stale, absent, or present but never passed to the AI. Cover canonical card/face text and rules metadata, commander identity, keywords and unkeyworded mechanics, roles and archetypes, EDHREC-style inclusion/synergy signals, combo relationships, deck composition, colour identity/format rules, curve/mana, prices, owned originals/proxies, printing/finish and physical availability. Check whether saved preferences, accepted/rejected suggestions or game/debrief information exist; do not assume they do or invent a feedback history.

For every recommendation path, show which data it actually receives, what is truncated or discarded, which model/tool does each job, where facts become model guesses, and how output is resolved and checked. Call out incompatible duplicate classifiers/prompts and D-016 structured-output violations with current evidence. Distinguish code capability from confirmed deployment/data coverage; no live access is needed for a useful assessment.

### 2. Investigate Jev without assuming the answer

The previous backlog referred to "Jev (TypeSafe AI System One model)". Verify the actual product/repository/model identity and that relationship from current primary sources instead of repeating the label as established fact. If ambiguous or unavailable, show the evidence and the narrow unresolved identification question, while still completing the existing-system assessment.

Determine what Jev actually does: generation, embeddings, classification, multi-label prediction, retrieval or reranking; its input/output constraints, training/fine-tuning requirements, domain-data needs, hosting/integration options, licence/commercial terms, maintenance/support, data handling, and cost/latency claims. Separate vendor claims, independent measurements and your own measurements. Record source URLs and access date; do not fabricate benchmark results.

Assess fit separately for:
- Multi-label card mechanic/role extraction, including overlapping roles.
- Commander/archetype relevance and candidate ranking.
- Context-sensitive card-card/commander interactions and conditional rules.
- Explaining additions/cuts and deck-level trade-offs.

Compare at most three practical options: improving the current architecture, a Jev-assisted hybrid if supported by evidence, and the strongest relevant alternative/hybrid. Reuse current capabilities where possible. Compare recommendation quality, semantic coverage, operational burden, speed, cost, privacy and maintainability. Consider Jev as one possible stage, not automatically a replacement for the reasoning model.

Give a clear verdict: adopt now, bounded trial, or not recommended yet, with confidence, disqualifiers and what evidence would change the verdict. If a trial is needed, specify a small experiment and success/failure thresholds; do not implement or incur API spend.

### 3. Design commander-specific coverage, not a popularity list

Recommend how existing data could represent:
- A commander's abilities and restrictions, supported game plans, and multiple compatible or competing archetypes.
- Card roles that overlap: enabler, payoff, resource producer/consumer, outlet, protection, redundancy, draw, ramp and interaction.
- Relationships between mechanics and resources: triggers/events, timing/zones, sacrifice/death, tokens, artifacts/Treasures, counters, graveyard, exile/cast/play, tribal, combat, spells, lands and other relevant families.
- Support density, packages and missing links, not merely isolated high-scoring cards.

Distinguish keyword matches from real semantic interactions. Cover restrictions such as cast versus play, creature versus any permanent, token versus nontoken, once-per-turn, controller/opponent, colour identity, commander pairing/backgrounds and multiple card faces. Use verified card rules, not guessed interactions.

For example, examine how a Prosper recommendation would distinguish exile-based engines, Treasure production/spending, payoffs and support rather than return generic black-red staples; compare how Korvold's sacrifice-related plans change those priorities. These examples are prompts for verified analysis, not a predetermined ranking.

Propose an extensible multi-label mechanics/archetype model and coverage/gap detection, with provenance, confidence and versioning. Explicitly distinguish what is deterministically derived, externally evidenced, statistically inferred or model-inferred. Explain how new sets, sparse/new commanders, off-meta plans, conflicting evidence and unknown mechanics are handled. Do not claim finite tags or EDHREC alone can prove coverage of every possible emergent interaction.

Describe the candidate pool, legal/rules filtering, mechanic/package retrieval, commander-specific ranking, diversity/role coverage, deck-level reranking, explanations and final validation. Separate hard constraints from configurable preferences. Avoid popularity feedback loops, circular evaluation, generic staples crowding out specialist cards, role double-counting and accidental recommendation of combos the user did not request.

Account for the selected deck's actual contents, curve, mana, redundancy, chosen plan, budget/power preferences if supplied, and cards already owned/free/in other decks. Missing preferences are missing inputs, not permission to assume a preferred archetype or combo policy. Explain which decisions would need owner input without inventing a UI spec.

### 4. Preserve Oracle's current product rules

Use D-001/D-003/D-004: canonical card identity, printing and finish are separate. Semantic recommendation happens at the appropriate card identity; available physical-copy choices require accurate printing/type/location facts.

Respect the approved Available / Unavailable / Alt available / Proxy available / Unowned vocabulary; keep Sleeved/Unsleeved and Original/Proxy separate. Never let model output invent ownership, copies, prices, locations or availability. Generic basics have automatic coverage but not fictional inventory. A proxy can make a deck Playable while an original shortage remains; purchase advice must account for usable owned originals before suggesting more.

Recommendations are read-only proposals. No automatic allocation, cross-deck moves or proxy creation. Explicit actions retain provenance, validation and undo; this assessment must not implement the later action-on-advice milestone. Honour D-016 and D-017, rather than bypassing existing decisions with a new model.

T-28 is independently defining the detailed state/action contract. Identify the AI's integration requirements without creating a competing availability contract or waiting unnecessarily for that task. Report genuine conflicts as challenges for the owner.

### 5. Provide a concrete evaluation plan and improvement sequence

Include a commander/archetype coverage matrix with at least 12 varied commanders, drawing at least three from existing repository fixtures/examples if present. Public examples are acceptable where no private fixture is available; do not access or export the owner's live decks merely to fill the matrix. Cover different colour counts, overlapping mechanics, narrow/off-meta plans, sparse data and paired commanders where appropriate.

Include worked recommendation cases and tricky negative examples across the matrix, each grounded in verified card rules. Show why a card fits or fails, which existing data supports that conclusion, what the current path can/cannot know, and what additional representation would be needed. Do not label unexecuted examples as successful model outputs.

Specify a held-out, versioned evaluation set and how to avoid training/test leakage. Define measurable criteria for legal/real card identity, factual interaction accuracy, conditional-rule errors, mechanic/archetype/role coverage, relevance, useful diversity, actionable additions/cuts, ownership accuracy, honest unknowns, and user preference fit. Describe latency/cost per useful recommendation and failure rates. Set proposed acceptance thresholds and identify which require owner calibration.

Use existing safe offline tests where useful, but do not run live-write or paid-model suites. Clearly separate executed checks from the proposed evaluation. Compare strong-LLM-only, existing deterministic/rule-based baselines and any Jev-assisted approach fairly; ablate data/retrieval changes separately from model changes so improvements have an attributable cause.

Finish with a short prioritised improvement sequence: what can be reused now, the highest-value data/wiring corrections, the smallest measurable recommendation-quality experiment, then later work. Give dependencies and risks. This is recommendation input for T-15 and future owner approval, not a new backlog implementation dispatch.

### Completion standard

The owner-facing summary is short, plain language, recommendation first, with one concrete commander example and at most three alternatives. Technical detail belongs in the assessment. Tag existing-system claims `[Confirmed: path]` or `[Approximate]`; cite external claims with verified URLs. Report uncertainty and inaccessible evidence honestly.

The assessment must distinguish "better model", "better supplied data", "better retrieval/ranking", and "better verification", and show which current weaknesses each would actually address. Return your report and exact output paths, then stop. New product choices, vendor adoption, migrations and implementation remain owner gates.

## New decisions made (need owner confirmation)
- None. Expanding the existing research task and choosing a stronger assessment model implement the owner's explicit instruction; no AI provider or recommendation strategy has been adopted.

## Continuation
- Use the known agent ID for permission/completion follow-ups; do not create another AI assessment agent or repeatedly poll agent lists.
- Review returned outputs against this brief, verify current-source/public citations and execute appropriate reported offline checks. Use the same agent for a bounded correction if needed.
- Require a distinction between inspected architecture, documented vendor capabilities, executed evaluation and proposed evaluation; the owner must not be told Jev performs well based only on marketing claims.
- Copy/merge no agent inputs over newer parent documentation. Outputs remain isolated and uncommitted until reviewed; new product choices, vendor adoption, implementation and merges still require their gates.
- T-27/T-28 and their dependency chain remain separate. Wait for all active tasks before Session Scribe close-out.

## Assumptions
- "Full assessment" covers the existing system insofar as it supports AI recommendations, including data preparation and consumption; unrelated UI/performance work stays with the already allocated agents.
- Jev's identity and capabilities need current primary-source verification; the existing backlog label is not treated as proof.
- Public research and local source inspection can proceed without uploading private Oracle data to a new service.

## Challenges to locked decisions
- None at dispatch. The assessment must report any evidence-backed challenge rather than work around it.

## Open questions
- Jev's actual fit, required labelled data and whether a bounded trial is justified are the requested research outcomes, not assumed decisions.
- Full runtime/paid-model benchmarking is not authorised; any recommended experiment must identify its data, access and cost gates.

## Verification
- `paseo provider models copilot --json` — confirms `claude-opus-5.5` and `high` reasoning are available.
- `paseo workspace create --isolation worktree ... --base refs/heads/main` — returned workspace `wks_06873aa53ec2e5d6` and the isolated worktree path.
- `git status --short` and `git rev-parse HEAD` — existing parent changes are documentation only; base commit recorded above.
- `rsync -a docs/oracle/ <new-worktree>/docs/oracle/` plus inline Node comparison — current approved inputs, previous audit and research brief matched before launch.
- `paseo run -d --provider copilot/claude-opus-5.5 --thinking high --workspace wks_06873aa53ec2e5d6 ...` — returned the real agent ID and `running`.
- `paseo inspect 7d860b27-5910-40ee-8e49-b816812dff92 --json` — confirmed launch settings, parent routing and initial pending permission.
- `paseo logs 7d860b27-5910-40ee-8e49-b816812dff92 --tail 5` and individual `paseo permit allow` — inspected and approved the read-only briefing command.
- `git diff --check` and inline Node documentation/link check — passed before launch; five local Markdown links resolve.
