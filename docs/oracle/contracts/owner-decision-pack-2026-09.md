# Owner Decision Pack — T-01 Audit Mismatches

**Prepared by:** Orchestrator (Gene)  
**Date:** 2026-09-25  
**Purpose:** For each mismatch found in `docs/oracle/contracts/audit-2026-09.md`, present the choice between fixing the code or updating the locked decision. You decide; downstream M1 work waits on these calls.

**How to use this doc:** Reply with your choice for each numbered item (A or B). If you want a hybrid, say so. I will record the decisions in `docs/oracle/decisions.md` after you approve the changes.

---

## 1. D-001 — Table names

**Locked decision:** The three core tables are named `card_definitions`, `physical_copies`, and `deck_cards`.

**What the code actually does:** Migrations renamed `card_definitions` → `cards` → `user_cards`, and `physical_copies` → `copies` → `collection` → `user_copies`. `deck_cards` kept its name. The conceptual model is intact; only the names changed.

### Option A — Fix the code
Rename the tables back to the locked names (`card_definitions`, `physical_copies`).

- **What it means:** A new migration renames `user_cards` → `card_definitions` and `user_copies` → `physical_copies`. Every query, type, and component that uses the current names must be updated.
- **Upside:** The schema matches the locked decision and the language used across the rest of the docs.
- **Downside:** A wide, touch-everywhere refactor. High risk of missing a reference. All open work (allocation, bulk actions, Brew Canvas) would need to rebase on the new names.
- **My recommendation:** Only if the locked names are genuinely important to you. They are not user-facing.

### Option B — Update the decision
Change D-001 to say the core tables are `user_cards`, `user_copies`, and `deck_cards`.

- **What it means:** Edit `docs/oracle/decisions.md` to reflect the deployed names. No code changes.
- **Upside:** Zero code churn. Matches the actual schema and the `user_` prefix convention used for multi-user rows.
- **Downside:** The original decision is overridden.
- **My recommendation:** **B**. The names are an implementation detail; the data-model intent (one row per card identity, one row per physical copy, proxies in the same table) is preserved.

---

## 2. D-002 — Deck lifecycle

**Locked decision:** Decks have exactly three states: Brew / Boxed / Archived.

**What the code actually does:** The `decks` table has an `is_active` boolean and a `status` string. The app still carries a legacy enum (`'brewing' | 'in_rotation' | 'graveyard'`). A migration explicitly replaced the three-state lifecycle with a simple boolean toggle.

### Option A — Fix the code
Implement Brew / Boxed / Archived.

- **What it means:** Add a `status` CHECK constraint or enum with those three values. Replace `is_active` usage with status checks. Update the UI, filters, and any code that reads `is_active`.
- **Upside:** Matches the locked lifecycle and gives you richer deck state than a boolean.
- **Downside:** You have to decide what happens to existing data (`is_active = true` → Brew? Boxed?). Requires migration + frontend + API updates.
- **My recommendation:** **A** if you still want the three-state model, but only after M1 exit test so you don't destabilize allocation work mid-milestone.

### Option B — Update the decision
Change D-002 to say the lifecycle is an `is_active` boolean (active / archived), with the legacy enum retired.

- **What it means:** Edit the decision. Remove the legacy enum from code. Keep `is_active` as the source of truth.
- **Upside:** Matches the deployed schema and the migration that already happened.
- **Downside:** Loses the "Boxed" concept (deck built but not currently played).
- **My recommendation:** **B** only if you no longer need the Boxed state. If you do want Boxed later, it can be added as a separate field without renaming the lifecycle.

---

## 3. D-004 — Finish values

**Locked decision:** Finish is `normal | foil | etched`.

**What the code actually does:** The column and code use `nonfoil | foil | etched`. There is no database CHECK constraint, so any string can be inserted.

### Option A — Fix the code
Change `nonfoil` to `normal` everywhere and add a CHECK constraint.

- **What it means:** Update constants, imports, existing data, and add `CHECK (finish IN ('normal','foil','etched'))`.
- **Upside:** Matches the locked vocabulary and prevents invalid values.
- **Downside:** Data migration for existing copies. Risk of missing a hard-coded string.
- **My recommendation:** **A**. This is a small, bounded change and the locked vocabulary is clearer.

### Option B — Update the decision
Change D-004 to say finish values are `nonfoil | foil | etched`.

- **What it means:** Edit the decision. Optionally add a CHECK constraint for the actual values.
- **Upside:** Zero data migration.
- **Downside:** `nonfoil` is Scryfall jargon; `normal` is the decision's plainer language.
- **My recommendation:** Less preferred than A, but acceptable if you want zero churn.

---

## 4. D-005 — Maybeboard

**Locked decision:** The maybeboard is modelled as a separate `deck_cards` relation.

**What the code actually does:** Maybeboard and sideboard are category strings (`'Maybeboard'`, `'Sideboard'`) inside the JSON `deck_cards.categories` column.

### Option A — Fix the code
Add a real maybeboard relation or column.

- **What it means:** Add `deck_cards.board` (main / maybeboard / sideboard / commander) or split maybeboard into its own table. Update importers, UI, and APIs.
- **Upside:** Stronger data model; maybeboard cards are structurally separate, which helps with allocation (you probably don't allocate physical copies to maybeboard).
- **Downside:** Migration of existing category data. Changes to deck display, import, and Brew Canvas.
- **My recommendation:** **A**, but as part of the M1 data cleanup, because it affects whether maybeboard cards show up in allocation counts.

### Option B — Update the decision
Change D-005 to say maybeboard is a category string inside `deck_cards.categories`.

- **What it means:** Edit the decision. Keep the current convention.
- **Upside:** No code changes.
- **Downside:** Maybeboard cards are not structurally distinguishable from main-deck cards; allocation and stats have to guess from a string.
- **My recommendation:** Less preferred than A unless you want to defer maybeboard work.

---

## 5. D-007 — Destructive allocation RPC

**Locked decision:** The destructive clear-and-recompute Allocation Resolver is retired as a write path.

**What the code actually does:** The suggestion engine is read-only, but the RPC `allocation_clear_active_decks(p_user_id UUID)` still exists in the schema and could be called. No current code path calls it, but it has not been dropped.

### Option A — Fix the code
Drop the RPC and any related triggers/functions.

- **What it means:** Draft a migration `DROP FUNCTION IF EXISTS allocation_clear_active_decks(...)` and clean up any remaining references.
- **Upside:** Fully retires the destructive write path. Matches D-007 exactly.
- **Downside:** Small migration risk; must verify nothing calls it (T-02 confirmed nothing currently does).
- **My recommendation:** **A**. T-02 confirmed the suggestion engine is clean; this is just deleting the old weapon.

### Option B — Update the decision
Change D-007 to say the RPC may remain but is not used.

- **What it means:** Edit the decision to allow a deprecated RPC to exist.
- **Upside:** No migration.
- **Downside:** Leaves a destructive operation in the schema. If someone (or a future bug) calls it, data is cleared.
- **My recommendation:** Not recommended. Security-wise, it's better to remove capabilities you don't intend to use.

---

## 6. D-009 — Placement `source` parameter

**Locked decision:** Every placement carries a `source` parameter (`manual`, `ai`) so undo, validation, and audit logging are shared across manual and AI placement.

**What the code actually does:** `deck_cards` has no `source` column. The assignment API accepts `deckCardsId`, `physicalCopyId`, and `tier`, but no `source`. `user_copies.source_tag` tracks import provenance, not placement origin.

### Option A — Fix the code
Add `source` to every placement write.

- **What it means:** Add `deck_cards.source` (or a separate audit table). Update the assign API, proxy APIs, import paths, and Brew Canvas to pass `manual`, `ai`, or `import`. Update the data-access layer.
- **Upside:** Enables shared undo, validation, and audit for both manual and AI placements. Required for M3 "Act on advice."
- **Downside:** Touches every write path. Needs a migration for existing rows (backfill or null-allowed).
- **My recommendation:** **A**, and it is already on the M1 list as T-12. This is a foundational requirement for AI-driven deck changes.

### Option B — Update the decision
Remove or weaken the `source` requirement.

- **What it means:** Edit D-009 to say source tracking is optional or handled differently.
- **Upside:** Less work now.
- **Downside:** You won't be able to reliably undo AI placements or distinguish them from manual ones later.
- **My recommendation:** Not recommended. This one is load-bearing for the AI advisor roadmap.

---

## 7. D-016 — Structured data from LLMs

**Locked decision:** Structured data from LLMs comes via tool use or a JSON sidecar block. No regex parsing of prose.

**What the code actually does:** Anthropic and Gemini paths use native tool/function calling. The DeepSeek adapter parses DSML/XML tool-call markup out of model-generated prose with multiple regexes.

### Option A — Fix the code
Refactor the DeepSeek adapter to use tool use or a JSON sidecar.

- **What it means:** Replace the regex parsing in `src/lib/adapters/deepseek-adapter.ts` with DeepSeek's tool-calling API or a strict JSON response format with validation.
- **Upside:** Matches D-016 and makes DeepSeek output as reliable as Anthropic/Gemini.
- **Downside:** Requires testing against DeepSeek's actual API. May need prompt engineering if DeepSeek's tool support differs.
- **My recommendation:** **A**. DeepSeek is one of the models in the frontend/backend team table; it should follow the same structured-output rule.

### Option B — Update the decision
Carve out an exception for DeepSeek.

- **What it means:** Edit D-016 to say regex parsing is allowed for providers that don't support tool use, or specifically for DeepSeek.
- **Upside:** Less work; keeps current adapter.
- **Downside:** You accept the fragility of regex parsing LLM prose. Other agents have to know DeepSeek is special-cased.
- **My recommendation:** Not recommended unless DeepSeek genuinely cannot do tool use or JSON mode.

---

## Summary of recommendations

| Decision | My recommendation | Why |
|---|---|---|
| D-001 Table names | **B** — update decision | Names are an implementation detail; `user_` prefix is consistent. |
| D-002 Deck lifecycle | **A** — fix code, after M1 | Three-state model is useful; defer until M1 exit test is safe. |
| D-004 Finish values | **A** — fix code | Small, bounded change to match locked vocabulary. |
| D-005 Maybeboard | **A** — fix code | Structural separation matters for allocation and stats. |
| D-007 Destructive RPC | **A** — fix code | T-02 confirmed it's unused; drop it. |
| D-009 Placement source | **A** — fix code | Required for AI-driven changes and undo. |
| D-016 DeepSeek regex | **A** — fix code | All models should use structured output. |

**Next step:** Reply with your choices. Once decisions are locked, I will hand off T-03, T-11, and T-12 to the Architect and T-05 to the Backend team.
