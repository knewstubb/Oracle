# Oracle — roadmap

Owner-approved 2026-09-25; phases replaced milestones 2026-10-11. The Orchestrator reads this before choosing any task. Work only on the **current phase** unless the owner says otherwise. A task that doesn't advance the current phase waits.

## Why Oracle exists
An AI advisor that can see Brad's real collection and decks, and suggests how to build new decks and refine existing ones — split into cards he already owns (and has free) and cards worth buying.

Everything else (collection UI, deck building, Brew Canvas) exists to feed that advisor accurate data or to let Brad act on its advice.

## Scope rules

The four dated owner-directed authorisations below (2026-09-29) are historical; their work is complete, in review, or now sits in the phase noted in status.md. They do not authorise new work in the current phase.

- **Owner-directed first implementation batch (2026-09-29):** "Delegate work to implement" authorises the ready, bounded T-32/T-33 Collection loading slices and T-34's native AI streaming argument bug fix. These preserve existing screen designs, API payloads and data meanings; the reviewed F1/F2/B1 sections are accepted only for these scoped handoffs. This exception does not adopt the full T-15/T-28 proposals, advance milestones, approve new UI, change stored data, provision/run a benchmark, or authorise merging/deployment. See the first-implementation dispatch report for exact ownership and tests.
- **Owner-directed Astra solution design (2026-09-29):** after reviewing the returned assessments, the owner said "Great. Set off the architect to create the different solutions we need. Use astra". This authorises T-15's advisor contract, a bounded T-28 contract-hardening pass and T-27's loading-solution follow-up in parallel. These are architecture outputs only, using GPT-6 Astra. They may proceed despite O-006; this does not advance a milestone or approve child proposals, production code, UI specifications, migrations, runtime experiments, merges or deployments. T-15 may prepare against the frozen draft T-28 input but cannot be accepted until its shared interface is reconciled with reviewed T-28 outputs.
- **Owner-directed consolidation preparation (2026-09-29):** the owner approved the three review plans and explicitly authorised allocation of T-28 (shared behaviour contract), T-27 (safe performance investigation), and dependent pick-list-first UX preparation. These named tasks may proceed despite the stale milestone-marker discrepancy recorded as O-006; this is a scoped owner exception, not a milestone transition or permission to start other parked features. Production implementation still requires approved contracts/mockups, and stored-data changes, merges and deployments retain their approval gates.
- **Owner-directed AI assessment (2026-09-29):** the owner additionally requested a separate agent for an end-to-end assessment of the existing AI recommendation system, Jev's suitability, and commander-specific mechanics/archetype coverage using existing data. T-19 is expanded to this read-only assessment and may run alongside the quality pass. This authorises research and recommendations only, not selecting a new production vendor, sharing private data with one, implementing the advisor, or moving milestones.
- **Audience:** personal tool for now. Sharing is Phase 10. Do not add multi-user scale work (O-002) before then. Keep `user_id` + RLS on user-owned rows (cheap now, expensive later).
- **No parity target.** Archidekt feature parity is not a goal. From Phase 8 (formerly milestone 2) onward the owner uses Oracle day to day and logs every time he has to go back to Archidekt in `docs/oracle/parity-log.md`. That log is the parity backlog.
- **Existing code first.** Import (Archidekt, Moxfield) and AI routes (`src/app/api/brew/*`, `src/app/api/ai/brew/*`, `src/app/api/decks/[id]/chat`, `src/lib/tool-registry.ts`, `src/lib/adapters/*`) already exist. Audit and harden before building new.

## Phases (owner-approved 2026-10-11, foundation first)

On 2026-10-11 the owner replaced milestones M1–M5 with ten phases built from the ground up ("I have gotten too far ahead of myself with features without building a solid foundation"). Work only on the **current phase**. A later phase starts when the owner signs off the previous phase's exit test; Phases 2 and 3 may overlap. Paused work is kept, not deleted. Rationale and evidence: `docs/oracle/reports/2026-10-11-gene-foundation-phases.md`.

Old milestones map as follows: M1 (complete) fed Phases 2, 4 and 5; M2 is now Phase 8; M3's accept/undo work is in Phase 8; M4 is Phase 9; M5 is Phase 10.

### Phase 1 — Safety net  ← CURRENT
**Outcome:** problems are caught before Brad sees them, and his data can be recovered.
**Exit test:** unit tests, type checking and lint pass and run automatically on every change; the build no longer ignores type errors; tests never write to real data; scheduled jobs pass or are deliberately switched off; the online copy and the live app match main; a restore from backup has been demonstrated or a documented recovery plan is owner-approved.
**Out:** new features and screen redesigns.

### Phase 2 — Card facts
**Outcome:** every card shown is the right card, printing and finish, with honestly labelled prices (D-003, D-004, D-035, D-038).
**Exit test:** spot-check of real decks shows correct printing/finish everywhere; unknown prices never show as zero; Proxy records the requested printing.

### Phase 3 — Shared words and building blocks
**Outcome:** one word, colour and badge per fact, and shared loading/empty/error states (D-012–D-015, D-025, D-030).
**Exit test:** the agreed vocabulary appears on every screen; failed lookups never show as an answer. (T-25, T-26.)

### Phase 4 — Collection and storage
**Outcome:** one clear place to see, search, filter, add, edit and remove owned copies and their storage locations.
**Exit test:** every filter changes results; no duplicate collection screens; Missing removed (D-028); acceptable load times. (T-27, T-38.)

### Phase 5 — Getting cards in
**Outcome:** every import route behaves consistently, keeps finishes, shows conflicts before saving and is safe to repeat (D-018–D-024, D-031).
**Exit test:** reimport of Brad's real collection and decks through each supported route matches the source, with differences explained.

### Phase 6 — Deck lists
**Outcome:** decks show Draft / Assembling / Playable under D-002 (including Casual), with Maybeboard (D-005), folders and honest legality.
**Exit test:** every real deck shows the correct state.

### Phase 7 — Putting real cards into decks
**Outcome:** Sleeve, Move, Proxy, Break down and the pick list work the same everywhere, and Reconcile shows original shortages (D-025–D-027, D-029, D-032, D-033, D-037, D-039).
**Exit test:** Brad assembles and breaks down a real deck using only Oracle; Reconcile matches his own count. (T-28, T-29, T-30, T-37.)

### Phase 8 — AI advisor
**Outcome:** Brad asks "how do I improve this deck?" or "what could I build?" and gets suggestions grouped as owned & free / in another deck / buy (Scryfall estimate, D-035); AI changes apply directly and can be undone (D-016, D-034, D-036).
**Exit test:** for three real decks, every suggestion resolves to a real card and printing, availability labels are correct, and every AI change can be undone. (T-14–T-19, T-36; former M2/M3.)

### Phase 9 — Extras
**Outcome:** Brew Canvas (D-008–D-011), bulk actions, ratings, explore, buy lists and other conveniences, chosen from the parity log.
**In:** T-06–T-09.

### Phase 10 — Share it
**Outcome:** other players can use Oracle (O-001, O-002).

## Superseded milestones (history)
M1 Trustworthy data was completed (exit test T-13). M2 AI advisor v0 was current from 2026-10-10 until it was paused on 2026-10-11. The detailed M1–M5 text is in git history before this change.

## Owner gates (unchanged)
See `.agents/project/gene.md`. In addition: moving to the next phase requires owner sign-off on the exit test.
