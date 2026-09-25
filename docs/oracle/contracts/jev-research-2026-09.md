# Jev Research: Suitability for Fast Card-Recommendation Classification in Oracle

**Date:** 2026-09-25  
**Role:** Architect  
**Task:** T-19  
**Inputs:**
- Article: LangChain, "Building a Harness with Jev" (https://www.langchain.com/blog/building-a-harness-with-jev)
- AI audit: `~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md` — **read and reconciled below** [Confirmed: `~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md`]

---

## 1. What Jev is

Jev is a **System One model** released by TypeSafe AI. It is **not a text-generating LLM**. Instead, it evaluates a supplied *state* and answers one or more typed *questions*, returning probabilities and confidence scores [LangChain article, "All about Jev"].

Key characteristics from the source:

| Aspect | Detail |
|--------|--------|
| Model type | Discriminative classifier (System One) |
| Input | `state` (text, structured data, or LangChain messages) + `questions` |
| Output | Typed answers with probabilities/confidence |
| Question types | `Choice`, `Score`, `Noul` (yes/no) |
| Parallelism | All questions in a single request are evaluated in parallel |
| Reported performance | Up to 200× faster inference and 400× lower cost than comparable LLMs on classification tasks |
| Training | Reinforcement learning for calibrated decisions (RLCD) |
| LangChain access | `TypeSafeClassifier` in `langchain-typesafe` |

A typical request looks like:

```json
{
  "model": "jev-latest",
  "state": "Hi, I've been trying to connect my Stripe account for 3 days...",
  "questions": {
    "is_urgent": {
      "type": "noul",
      "instructions": "The message conveys urgency or time-sensitivity"
    }
  }
}
```

---

## 2. Oracle contexts where Jev could serve

Oracle already performs several classification-like tasks that Jev could accelerate or improve. The relevant code is server-side TypeScript in `src/lib/`.

### 2.1 Functional category classification
**Current:** `src/lib/category-classifier.ts` uses a three-tier pipeline: manual override → Archidekt category string mapping → regex heuristics on oracle text and type line [Confirmed: `src/lib/category-classifier.ts`].

**Jev fit:** A `Choice` question could classify each non-land card into the `FunctionalCategory` enum (`Ramp`, `Draw`, `Removal`, etc.). This would replace or augment the regex tier for cards without an Archidekt mapping.

### 2.2 Dead-weight / cut recommendation flags
**Current:** `src/lib/dead-weight-classifier.ts` applies deterministic priority rules (format violation → redundancy → off-strategy → bracket mismatch) using EDHREC synergy scores and category counts [Confirmed: `src/lib/dead-weight-classifier.ts`].

**Jev fit:** `Noul` questions could independently flag:
- "Is this card off-strategy for the declared win condition?"
- "Is this card redundant given the current category counts?"
- "Does this card violate the declared budget/bracket?"

These would be **inputs to the suggestion engine**, not replacements for the deterministic rules, consistent with D-007 (suggestions must not overwrite allocations) [Confirmed: `docs/oracle/decisions.md` D-007].

### 2.3 Card recommendation fit scoring
**Current:** Brew skeleton generation uses a heavy LLM with selection-based prompting from EDHREC staples, collection cards, and Scryfall candidates [Confirmed: `src/lib/brew-prompts.ts`]. The heavy model selects 100 cards in one or few calls.

**Jev fit:** For *incremental* recommendations (e.g., "should [[Sylvan Library]] go in this deck?"), a Jev `Noul` or `Score` question could provide a fast, cheap fit judgement. This is the closest match to the task's "fast card-recommendation classification" framing.

### 2.4 Tool-use routing in Brew
**Current:** `src/lib/tool-executor.ts` runs a provider-agnostic tool loop with a single model and context-aware tool filtering [Confirmed: `src/lib/tool-executor.ts`].

**Jev fit:** The LangChain article highlights Jev for model routing and guardrail middleware [LangChain article, "Use Cases"]. Oracle could use it to route simple lookup queries to cheaper models and complex creative tasks to heavier models, or to gate risky tool calls.

### 2.5 Auto-bracket validation
**Current:** `src/lib/auto-bracket-cards.ts` uses regex patterns plus a known-name set from `/api/cards/names` to wrap card names in `[[brackets]]` [Confirmed: `src/lib/auto-bracket-cards.ts`].

**Jev fit:** A `Noul` question could validate whether a matched pattern is really a card name before bracketing, reducing false positives.

### 2.6 D-016 alignment and what Jev does **not** fix

The AI audit tests **D-016**: structured data from LLMs must come via tool use or a JSON sidecar block, not regex parsing of prose [Confirmed: `docs/oracle/decisions.md` D-016; `~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md` §3].

**Where Jev aligns with D-016:**
Jev's native output is typed structured data (probabilities/confidence scores per question). It never returns prose that needs regex extraction. Any Jev classifier added to Oracle would therefore conform to D-016 by design, provided the calling code consumes the typed response directly and does not round-trip through text.

**Where Jev does not help:**
The audit found D-016 violations in generative routes that ask models to emit JSON inside prose and then parse it out with regex:
- `src/app/api/brew/skeleton/route.ts`
- `src/app/api/brew/assess/route.ts`
- `src/app/api/brew/extract/route.ts`
- `src/app/api/brew/chat/route.ts` (Haiku decision extraction)
- `src/app/api/ai/brew/investigate/route.ts`
- `src/app/api/ai/brew/generate/route.ts`
- `src/app/api/ai/brew/refine/route.ts`
- `src/lib/adapters/deepseek-adapter.ts` (DSML fallback)

Jev cannot fix these because it does not generate structured JSON skeletons, assessments, or card arrays. Those routes must be fixed with native tool use or validated sidecar blocks, per the audit's recommendations [Confirmed: `~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md` §5].

**Implication for this research:**
Jev is suitable only for *new* classification tasks (or upgrades to existing heuristic classifiers), not as a drop-in remediation for the audit's D-016 violations.

---

## 3. Integration effort

### 3.1 New dependencies and credentials
- Add `langchain-typesafe` (or call the TypeSafe REST API directly).
- Add `TYPESAFE_API_KEY` to environment variables and to the provider validation in `src/lib/provider-factory.ts` [Confirmed: `src/lib/provider-factory.ts`].

### 3.2 New adapter / classifier module
Oracle already uses a provider-adapter abstraction for Anthropic, Gemini, and DeepSeek [Confirmed: `src/lib/provider-factory.ts`, `src/lib/adapters/`]. A clean integration would add a small `JevClassifier` wrapper that:
- Accepts an Oracle domain input (card context + deck strategy).
- Builds the TypeSafe `state` and `questions` payload.
- Maps responses back to Oracle types (e.g., `FunctionalCategory`, `DeadWeightFlag`, recommendation score).

### 3.3 Types and schema
A new contract file should define:
- Input state shape (card name, oracle text, type line, commander, strategy brief, existing deck categories).
- Question definitions for each Oracle use case.
- Output types with probabilities/confidence.

### 3.4 Evaluation harness
Before any production use, Oracle needs a benchmark comparing Jev against the existing deterministic classifiers on a labelled set of Oracle decks. This is essential because vendor-reported speed/cost numbers do not guarantee domain accuracy for Magic cards.

### 3.5 Call pattern
Jev is server-side only. The UI would call an existing Next.js API route, which would invoke the classifier. No direct client-side TypeSafe calls.

---

## 4. Risks

| Risk | Severity | Notes |
|------|----------|-------|
| **Brand-new provider** | High | Jev was released in September 2026. Uptime, pricing stability, and long-term support are unproven. |
| **Vendor-reported performance** | Medium | 200×/400× claims are from TypeSafe AI, not independently verified on Magic card data. |
| **Domain accuracy unknown** | High | Classifier performance on Magic rules text, combos, and commander-specific synergies is untested in Oracle. |
| **Classification-only** | Low | Jev cannot replace generative steps (skeleton generation, primer text, conversational brew). It only complements them. |
| **Another external dependency** | Medium | Adds API key management, rate-limit handling, and fallback logic to the provider factory. |
| **Regressive determinism** | Medium | Current classifiers are deterministic and free. Replacing them with a probabilistic paid model could introduce unpredictable behaviour without careful threshold tuning. |
| **Does not remediate D-016 violations** | Medium | The AI audit identified regex-parsed JSON in generative routes. Jev is a classifier, not a replacement for those generative flows; adopting it does not check off any audit finding. |
| **Audit context now available** | Low | The AI audit confirms D-016 as the governing rule and does not budget for a new provider. Any Jev pilot must still align with D-016 and the audit's remediation priorities [Confirmed: `~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md` §5]. |

---

## 5. Recommendation: **NO (for now)**

**Do not adopt Jev for production card-recommendation classification in Oracle today.**

### Rationale
1. **The upside is unverified.** The speed and cost advantages are compelling for classification at scale, but no independent Oracle benchmark proves they translate to Magic card tasks.
2. **The current deterministic classifiers are good enough for the current backlog.** The active tasks in `docs/oracle/status.md` focus on allocation, Brew Canvas, and bulk actions; none are blocked by classification latency or cost [Confirmed: `docs/oracle/status.md`].
3. **The AI audit does not justify a new provider right now.** The audit's focus is remediating D-016 violations in existing generative routes via native tool use. Jev does not help with those violations and is not mentioned or budgeted in the audit [Confirmed: `~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md` §5].
4. **Vendor newness.** A model released days before this research is not yet suitable for a production deck-building platform without a pilot and observability.
5. **D-016 alignment is necessary but not sufficient.** Jev's typed outputs would conform to D-016, but that alone does not overcome the unverified domain accuracy and operational risk.

### What would change the answer to YES
- D-016 remediation in the generative routes is complete, so engineering attention can shift to new classification capabilities.
- The owner explicitly budgets for a classifier pilot and accepts the operational risk of a brand-new provider.
- A benchmark shows Jev beats the existing heuristic classifiers on accuracy **and** latency/cost for at least one Oracle task (category classification or recommendation fit).
- A bounded pilot is scoped with: labelled test decks, a fallback to deterministic classifiers, cost caps, D-016-compliant typed consumption of responses, and an evaluation plan.

### Suggested next step
Create task **T-19-follow-up: Bounded Jev pilot for category classification** only **after** the D-016 audit remediation is complete and the owner approves a pilot budget. Scope: 1–2 weeks, 50–100 labelled Oracle cards, compare Jev `Choice` output against `category-classifier.ts` heuristics and manual labels, measure latency and cost per 1,000 cards, and confirm typed-response consumption with no regex parsing.

---

## 6. References

- LangChain, "Building a Harness with Jev" (https://www.langchain.com/blog/building-a-harness-with-jev) — primary source for Jev capabilities and use cases.
- `~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md` [Confirmed] — AI touchpoint audit; confirms D-016 violations and remediation priorities.
- `src/lib/category-classifier.ts` [Confirmed]
- `src/lib/dead-weight-classifier.ts` [Confirmed]
- `src/lib/brew-prompts.ts` [Confirmed]
- `src/lib/tool-executor.ts` [Confirmed]
- `src/lib/provider-factory.ts` [Confirmed]
- `src/lib/auto-bracket-cards.ts` [Confirmed]
- `src/lib/ai-models.ts` [Confirmed]
- `docs/oracle/decisions.md` D-007, D-016 [Confirmed]
- `docs/oracle/status.md` [Confirmed]
- `.paseo/agents/architect.md` [Confirmed]
