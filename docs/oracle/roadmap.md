# Oracle — roadmap

Owner-approved 2026-09-25. The Orchestrator reads this before choosing any task. Work only on the **current milestone** unless the owner says otherwise. A task that doesn't advance the current milestone waits.

## Why Oracle exists
An AI advisor that can see Brad's real collection and decks, and suggests how to build new decks and refine existing ones — split into cards he already owns (and has free) and cards worth buying.

Everything else (collection UI, deck building, Brew Canvas) exists to feed that advisor accurate data or to let Brad act on its advice.

## Scope rules
- **Audience:** personal tool for now. Sharing is milestone 5. Do not add multi-user scale work (O-002) before then. Keep `user_id` + RLS on user-owned rows (cheap now, expensive later).
- **No parity target.** Archidekt feature parity is not a goal. From milestone 2 onward the owner uses Oracle day to day and logs every time he has to go back to Archidekt in `docs/oracle/parity-log.md`. That log is the parity backlog.
- **Existing code first.** Import (Archidekt, Moxfield) and AI routes (`src/app/api/brew/*`, `src/app/api/ai/brew/*`, `src/app/api/decks/[id]/chat`, `src/lib/tool-registry.ts`, `src/lib/adapters/*`) already exist. Audit and harden before building new.

## Milestones

### M1 — Trustworthy data  ← CURRENT
**Outcome:** Brad's collection and decks are imported, and Oracle knows exactly which physical copy is in which deck.
**Exit test:** import Brad's real Archidekt collection and decks; Oracle's card counts, deck lists and copy-to-deck assignments match Archidekt, with differences explained (T-13).
**In:** allocation resolver validation and suggestion-engine contract (D-007), Allocation Tab off frozen table, real `physical_copy_id` selection, retire destructive RPC, placement `source` parameter (D-009), owner decisions on the T-01 audit mismatches.
**Out:** bulk actions, Brew Canvas, visual polish.

### M2 — AI advisor v0
**Outcome:** Brad asks "how do I improve this deck?" or "what could I build from my collection?" and gets suggestions grouped as *owned & free* / *owned but in another deck* / *buy* (with Card Kingdom price).
**Exit test:** for three of Brad's real decks, every suggested card resolves to a real card in the database (no invented cards, no wrong printings), and availability labels are correct.
**In:** audit of existing AI routes; D-016 fix (structured output via tool use, no regex of prose); advisor tool contract; plain chat beside a deck view.
**Out:** drag-and-drop canvas.

### M3 — Act on advice
**Outcome:** accepting a suggestion changes the deck, and can be undone.
**In:** add / remove / swap from a suggestion, maybeboard, undo; every change recorded with `source = 'ai'` or `'manual'` (D-009).

### M4 — Brew Canvas
**Outcome:** visual deck building alongside the advisor.
**In:** T-08, T-09, D-008–D-011. Bulk actions (T-06, T-07) re-evaluated here against the parity log.

### M5 — Share it
**Outcome:** other players can use Oracle.
**In:** O-002 scale validation, onboarding polish, Moxfield path confirmation (O-001).

## Owner gates (unchanged)
See `.paseo/agents/orchestrator.md`. In addition: moving to the next milestone requires owner sign-off on the exit test.
