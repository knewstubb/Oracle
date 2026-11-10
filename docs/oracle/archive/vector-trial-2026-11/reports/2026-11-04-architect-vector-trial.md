# Report: vector-trial
Role: Architect
Status: PARTIAL
Task as received: Produce an architecture contract for a SMALL, reversible trial of vector-based (pgvector on Supabase) card recommendations in Oracle. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md first, plus docs/oracle/process.md, docs/oracle/decisions.md, docs/oracle/contracts/ai-recommendations-assessment-2026-09.md (esp. §4.5 option C and gap G1), card-tagging-pipeline.md. If process.md requires an approved brief in docs/oracle/briefs/ and none exists, write the contract as a DRAFT proposal and say so (status PARTIAL), do not build anything. [Remaining requirements: cover prerequisites/data readiness, trial scope and a separate embeddings table, up to 3 embedding model options, retrieval query shape, evaluation plan, rollback plan, risks; tag claims [Confirmed: path]; no destructive DB operations; write contract to docs/oracle/contracts/vector-trial-2026-11.md and this report; plain-language owner summary.]

## Summary for the owner
Yes, a small trial is possible, but it is only a draft until you approve a one-page brief for it (our process requires that first, and none exists yet). The trial would test whether "find cards that do similar things" finds good Prosper and Korvold cards that EDHREC's popularity lists miss. It would add one separate store of card data, show nothing in the app, and can be switched off or removed without touching your collection or decks. It needs about an hour from you to mark roughly 120 cards as great, playable, marginal or no, and it only goes ahead if it clearly beats today's lists. You need to decide whether to approve the brief.

## Changed files
- docs/oracle/contracts/vector-trial-2026-11.md — new DRAFT contract (prerequisites, table design, models, query shape, evaluation, rollback, risks)
- docs/oracle/reports/2026-11-04-architect-vector-trial.md — this report

No migration, type file, code, or database change was made.

## New decisions made (need owner confirmation)
- Trial may proceed on a **partial data fix** (name-to-card-id mapping and face text loaded just for the trial pool, legality checked against a dated Scryfall snapshot), not the full G1 fix. Full G1, tag vocabulary and legality freshness stay required before any production use.
- Recommended embedding model: a small open model run locally (no account, no cost, no data leaves the machine). Alternatives: OpenAI small embedding model, Voyage.
- Success bar: fused result beats the current EDHREC ordering by ≥ 0.10 nDCG@10 and ≥ 0.70 precision@10 on both commanders, ≥ 3 novel finds each, ≥ 50% commander-specific, and owner prefers it in ≥ 7 of 10 blind comparisons. Stop if it does not beat baseline by ≥ 0.05.
- Embeddings table is global reference data with no `user_id` (deliberate exception to the "every row carries user_id" standard; same pattern as other `ref_*` tables).
- Rollback "remove" step (drop of the trial table and function) needs separate owner approval at that time.

## Assumptions
- Hosted Supabase can install pgvector; not verifiable here (no database access) [Approximate].
- Prices and relative quality of embedding vendors are general knowledge, not verified this task.
- `data/AllPrintings.sqlite` or Scryfall's Oracle Cards bulk file can supply face text; the SQLite schema was not inspected.
- Pool size (~10k cards) is an estimate, measured at load time.
- How the live advisor ranks cards today was not re-read; the baseline is therefore offline EDHREC inclusion and synergy order.
- Partner-pair colour handling via `commander-resolver.ts` was not re-read this task.

## Challenges to locked decisions
- none. (Note: the T-19 assessment ranked this idea, option C, behind option A; the trial is framed as a bounded experiment and does not replace A.)

## Open questions
- Gate 1: will the owner approve a brief for the vector trial? Gene to draft; process.md blocks design and build until then, so status is PARTIAL.
- Is the owner willing to label ~120 cards (about an hour)?
- Is a local model acceptable, or does the owner prefer a hosted one (needs an account and spend approval)?
- Confirm the "generic staple" threshold (proposed: in the top 50 of ≥ 25% of stored builds).
- Ten import migrations are still unapplied on the hosted database; the trial migration would queue behind them.
- Should the two stale `mtg_cards` code paths be fixed as a separate task? (Not needed for the trial.)

## Verification
- Read AGENTS.md, both architect role files, process.md, decisions.md, assessment §0, §2, §3, §4.5-4.6, §8, card-tagging-pipeline.md §1-3, §6, §8-9 — done.
- Listed docs/oracle/briefs/ — only import-cleanup.md and use-what-i-own.md; no vector brief (Gate 1 not met).
- Searched supabase/, src/, scripts/, package.json for vector/pgvector — no matches.
- Read src/types/supabase.ts row types for ref_cards, ref_printings, ref_build_cards, ref_commander_builds, ref_commanders — ref_cards has no oracle_id; ref_build_cards keyed by card_name; ref_printings has oracle_id and legality_commander.
- grep mtg_cards in src — still referenced in brew/skeleton route and tool-registry.
- Checked RLS pattern in ref_rulings and commander_builds migrations — read for all, service-role writes.
- No tests or builds run (documentation-only task); no database access, no destructive operations.
