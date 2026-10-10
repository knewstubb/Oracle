# Oracle — roadmap

Owner-approved 2026-09-25. The Orchestrator reads this before choosing any task. Work only on the **current milestone** unless the owner says otherwise. A task that doesn't advance the current milestone waits.

## Why Oracle exists
An AI advisor that can see Brad's real collection and decks, and suggests how to build new decks and refine existing ones — split into cards he already owns (and has free) and cards worth buying.

Everything else (collection UI, deck building, Brew Canvas) exists to feed that advisor accurate data or to let Brad act on its advice.

## Scope rules

- **Owner-directed first implementation batch (2026-09-29):** "Delegate work to implement" authorises the ready, bounded T-32/T-33 Collection loading slices and T-34's native AI streaming argument bug fix. These preserve existing screen designs, API payloads and data meanings; the reviewed F1/F2/B1 sections are accepted only for these scoped handoffs. This exception does not adopt the full T-15/T-28 proposals, advance milestones, approve new UI, change stored data, provision/run a benchmark, or authorise merging/deployment. See the first-implementation dispatch report for exact ownership and tests.
- **Owner-directed Astra solution design (2026-09-29):** after reviewing the returned assessments, the owner said "Great. Set off the architect to create the different solutions we need. Use astra". This authorises T-15's advisor contract, a bounded T-28 contract-hardening pass and T-27's loading-solution follow-up in parallel. These are architecture outputs only, using GPT-6 Astra. They may proceed despite O-006; this does not advance a milestone or approve child proposals, production code, UI specifications, migrations, runtime experiments, merges or deployments. T-15 may prepare against the frozen draft T-28 input but cannot be accepted until its shared interface is reconciled with reviewed T-28 outputs.
- **Owner-directed consolidation preparation (2026-09-29):** the owner approved the three review plans and explicitly authorised allocation of T-28 (shared behaviour contract), T-27 (safe performance investigation), and dependent pick-list-first UX preparation. These named tasks may proceed despite the stale milestone-marker discrepancy recorded as O-006; this is a scoped owner exception, not a milestone transition or permission to start other parked features. Production implementation still requires approved contracts/mockups, and stored-data changes, merges and deployments retain their approval gates.
- **Owner-directed AI assessment (2026-09-29):** the owner additionally requested a separate agent for an end-to-end assessment of the existing AI recommendation system, Jev's suitability, and commander-specific mechanics/archetype coverage using existing data. T-19 is expanded to this read-only assessment and may run alongside the quality pass. This authorises research and recommendations only, not selecting a new production vendor, sharing private data with one, implementing the advisor, or moving milestones.
- **Audience:** personal tool for now. Sharing is milestone 5. Do not add multi-user scale work (O-002) before then. Keep `user_id` + RLS on user-owned rows (cheap now, expensive later).
- **No parity target.** Archidekt feature parity is not a goal. From milestone 2 onward the owner uses Oracle day to day and logs every time he has to go back to Archidekt in `docs/oracle/parity-log.md`. That log is the parity backlog.
- **Existing code first.** Import (Archidekt, Moxfield) and AI routes (`src/app/api/brew/*`, `src/app/api/ai/brew/*`, `src/app/api/decks/[id]/chat`, `src/lib/tool-registry.ts`, `src/lib/adapters/*`) already exist. Audit and harden before building new.

## Milestones

### M1 — Trustworthy data  (COMPLETE — exit test T-13 done; owner confirmed M2 as current 2026-10-10)
**Outcome:** Brad's collection and decks are imported, and Oracle knows exactly which physical copy is in which deck.
**Exit test:** import Brad's real Archidekt collection and decks; Oracle's card counts, deck lists and copy-to-deck assignments match Archidekt, with differences explained (T-13).
**In:** allocation resolver validation and suggestion-engine contract (D-007), Allocation Tab off frozen table, real `physical_copy_id` selection, retire destructive RPC, placement `source` parameter (D-009), owner decisions on the T-01 audit mismatches.
**Out:** bulk actions, Brew Canvas, visual polish.

### M2 — AI advisor v0  ← CURRENT
**Outcome:** Brad asks "how do I improve this deck?" or "what could I build from my collection?" and gets suggestions grouped as *owned & free* / *owned but in another deck* / *buy* (with a price: Scryfall estimate, clearly labelled, for now; Card Kingdom later — D-035).
**Exit test:** for three of Brad's real decks, every suggested card resolves to a real card in the database (no invented cards, no wrong printings), and availability labels are correct.
**In:** audit of existing AI routes; D-016 fix (structured output via tool use, no regex of prose); advisor tool contract; plain chat beside a deck view; undo for every AI deck change, which applies without a confirmation step (D-034).
**Out:** drag-and-drop canvas.

### M3 — Act on advice
**Outcome:** accepting a suggestion changes the deck, and can be undone.
**In:** add / remove / swap from a suggestion, maybeboard, undo for manual changes (AI-change undo moved to M2 by D-034); every change recorded with `source = 'ai'` or `'manual'` (D-009).

### M4 — Brew Canvas
**Outcome:** visual deck building alongside the advisor.
**In:** T-08, T-09, D-008–D-011. Bulk actions (T-06, T-07) re-evaluated here against the parity log.

### M5 — Share it
**Outcome:** other players can use Oracle.
**In:** O-002 scale validation, onboarding polish, Moxfield path confirmation (O-001).

## Owner gates (unchanged)
See `.agents/project/gene.md`. In addition: moving to the next milestone requires owner sign-off on the exit test.
