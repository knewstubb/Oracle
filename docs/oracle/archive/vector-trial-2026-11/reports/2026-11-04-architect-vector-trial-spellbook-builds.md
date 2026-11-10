# Report: vector-trial-spellbook-builds
Role: Architect
Status: PARTIAL
Task as received: Read AGENTS.md and your role files, then update docs/oracle/contracts/vector-trial-2026-11.md (still a DRAFT, no approved brief, build nothing, status PARTIAL) and write docs/oracle/reports/2026-11-04-architect-vector-trial-spellbook-builds.md in the standard format. Owner decisions: 1. Commander Spellbook moves from 'later' to IN SCOPE FROM DAY ONE as a third signal beside vectors and EDHREC. Combo data identifies specific cards that work together. Design: how combo data is fetched (use existing src/lib/spellbook-client.ts; verify its capabilities and API terms/rate limits), where stored (a separate reference table keyed by oracle_id, no locked-model change, check the existing deck_combos table first), how combo membership with the commander and/or current deck boosts rank and shows a visible 'combo' label, how it is added to the fusion and evaluation (new arm; gates: combo pieces must be legal, colour-identity correct, joined by oracle_id; add evaluation checks that combo hits for Prosper/Korvold are surfaced). Note partial combos (missing 1 piece) vs complete combos. 2. Build styles: recommendations must be computed PER BUILD (archetype) of a commander, not just per commander, because a card's value changes by archetype (e.g. Blood Artist high in an Aristocrats build, low in Treasure-ramp). EDHREC builds already exist [verify: ref_commander_builds, ref_build_cards in supabase/migrations/20260806000000_create_commander_builds.sql and 20260806120000_builds_multi_archetype.sql; check data actually synced is unverifiable without DB access, say so]. Design: build-conditioned retrieval (query vector = commander + build theme/signature cards), per-build EDHREC scores in fusion, evaluation grading per build (limit to 2 builds for Prosper and keep Korvold as contrast), updated owner grading effort estimate (owner estimated ~2 hours; keep as small as sensible and say how it scales), and a check that the same card ranks differently across builds in the expected direction. Update the success criteria, rollback plan and risks accordingly, and the 'additional data' table. Report owner summary in plain language, no code/paths; list any open questions for the owner.

## Summary for the owner
Combos and builds are now designed into the trial; it is still a draft, nothing is built and nothing is approved. Combos become a third way to rank cards: a suggestion that finishes a combo, or is one piece away from one, gets a visible "combo" label and moves up the list. Suggestions are also worked out for each build of a commander, so Blood Artist can rank high in an Aristocrats build and low in a Treasure build. Grading effort comes to about 2 hours, which matches your estimate. Two things you didn't ask about turned up. The existing combo lookup in the app returns blank card names and sorts the least popular combos first, so the trial doesn't use it. And I can't tell from the code whether the Prosper and Korvold builds were ever loaded, so that gets checked first. Your decisions are in "Open questions".

## Changed files
- docs/oracle/contracts/vector-trial-2026-11.md — added the combo design (§4A) and per-build design (§4B), a three-signal fusion (§4), per-list arms and grading (§5.1, §5.2), new success criteria and gates (§5.4), combo and build checks (§5.7, §5.8), updated additional-data table (§5A), rollback (§6), risks (§7), locked decisions (§8), handoffs (§9), and new readiness rows (§1.1, §1.3, §2.1).
- docs/oracle/reports/2026-11-04-architect-vector-trial-spellbook-builds.md — this report.

No migration, types file or code was created. The SQL in the contract is a sketch inside a document. No contract `.types.ts` file was created or changed.

## New decisions made (need owner confirmation)
- **Combo data comes from Spellbook's published bulk file, not live per-card calls.** Their own docs ask clients not to export the dataset through the search API. The file is about 31 MB gzipped (117,956 combos in the copy I downloaded, built 2026-11-03).
- **Two new global reference tables** (combos, and the cards in each combo), keyed by `oracle_id`. `deck_combos` is not used (per deck, one JSON blob, not searchable by card). No locked table changes.
- **Three combo labels:** "completes" (all other pieces already there), "1 piece away" (names the missing card), and "combo with commander" (up to 4-piece combos including the commander). Combos needing a "a creature with …" style template are never labelled complete. Combos of 5 pieces needing two or more more cards are not labelled.
- **Combo arm in the fusion:** ranked by label strength then combo popularity; the top 20 only; same fusion constant. Measured against the two-signal version (F2) so its effect is visible, with a label-only fallback if it hurts the owner's grades.
- **Combo hard gates:** every piece legal (checked against our own dated legality snapshot, not just Spellbook's flag), within colour identity, joined by `oracle_id` only, and label recomputed from stored data.
- **Combo check §5.7:** frozen lists of top combos per commander must surface with the right label; planted-combo decks must label the last and the second-to-last piece correctly; out-of-colour, illegal and unresolved combos must never be labelled.
- **Per-build design:** query vector = commander + up to 8 signature cards of the build (+ deck centroid when a deck exists), weights fixed in advance (0.5/0.5 without a deck, 0.3/0.3/0.4 with one). EDHREC term uses only the selected build's scores. Signature cards are removed from candidates. Cards absent from a build show "no data in this build", never zero.
- **Lists to grade:** Prosper build 1, Prosper build 2, Korvold's top build (contrast). Builds chosen from data at kickoff (most played, most different), owner approves before results.
- **Success criteria changed:** each of the three lists must meet the same bar (previously each commander); added combo harm check (F3 within 0.02 of F2), build direction check (≥ 75% of card pairs ordered as the owner's grades), and build/combo hard gates. See §5.4.
- **Grading effort:** about 230 grades, about 2 hours (range 1.75 to 2.5), up from about 170 grades and 1.5 hours. Scaling: each extra build ≈ 25 minutes; Prosper-only cut ≈ 1.2 hours.

## Assumptions
- Korvold stays a single-build contrast (its most played build). The brief said "keep Korvold as contrast"; I read that as not adding a second Korvold build.
- Time per grade stays at about 30 seconds (the rate implied by the earlier estimate); not measured.
- Combo hits are checked mechanically, not graded. Only cards surfaced purely by the combo arm are graded by the owner.
- Spellbook has no build concept, so combos are build-independent in the trial. Off-plan combos are listed for the owner's judgement.
- A card that appears twice (quantity 2) in a combo is stored once. Accepted simplification, counted at load.
- Formal Spellbook terms of service page was not read; terms come from the API's own documentation text. Attribution is treated as required.
- Cutoffs (4 pieces, top 20 cap, M ≤ 1, signature count 8, weights) are fixed in the contract before any result and are not tuned on it.

## Challenges to locked decisions
- none. D-036(b) (ask before including an infinite-combo package when preference unknown) is touched, not challenged: the trial is offline; production behaviour needs an owner answer (open question 1).

## Open questions
1. **Combos and your preference.** Previously decided: the advisor asks before suggesting an infinite-combo package if it doesn't know whether you want combos. Should that rule also cover a single card that merely carries a "combo" label, or only a whole package of combo pieces? Until answered, the label is offline-only.
2. **Combos that don't fit the build.** The combo database doesn't know about builds. Should a combo label show on every build (my default), or should you be able to turn labels off for decks where you don't want combo lines?
3. **Which builds for Prosper.** I will propose the two most-played, most different builds once I can see which ones exist. You approve before any result is seen. Do you already have two in mind (for example Treasure versus Aristocrats)?
4. **Korvold:** is one build enough as the contrast, or do you want a second, at roughly 25 more minutes of grading?
5. **If the builds were never loaded.** I can't see the database. If Prosper or Korvold builds turn out missing or thin, should the trial stop and wait for a data sync, or fall back to commander-level lists and report that build-awareness was not tested?
6. **Credit.** Spellbook asks to be credited and linked. Are you happy for any combo label to carry a small "Commander Spellbook" source note?

## Verification
- Read AGENTS.md, ~/agents-shared/architect.md, .agents/project/architect.md, the contract, src/lib/spellbook-client.ts, both build migrations, scripts/sync-edhrec-builds.ts (sync rules), src/types/supabase.ts (`deck_combos`, `ref_commanders`), src/app/api/decks/[id]/combos/route.ts — done.
- Live request to backend.commanderspellbook.com for Prosper: response nests pieces as `uses[].card.name` and `uses[].card.oracleId`; client reads `uses[].name` — **client defect confirmed**.
- Live requests with `ordering=popularity` vs `ordering=-popularity`: popularity values 0, 0, 0 vs 7898, 4727, 4499 — **client sorts least popular first, confirmed**.
- HEAD on the bulk files: gzipped ≈ 31 MB, uncompressed ≈ 709 MB, HTTP 200 — **confirmed**. Downloaded the gzipped file to a temporary folder and parsed it: 117,956 variants, version 7.3.4, built 2026-11-03T20:12Z, all status OK, 6,472 with template requirements, 0 pieces without `oracleId`. Prosper 240 variants (176 out of colour), Korvold 83 (29 out of colour) — **confirmed**.
- Rate limit "80 requests per minute safe, handle 429, credit the site, few calls per user action" — taken from the API's published documentation text (backend repo `common/api_docs.py`), not a formal terms page.
- Hosted database contents (builds synced, `decks.build_id` populated, deck_combos rows): **not verified, no DB access**.
- No code run, no migration applied, no database written, no paid calls. The downloaded file is a temporary copy outside the repo. No tests or lint run (documentation-only change).
