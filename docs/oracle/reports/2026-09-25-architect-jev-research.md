# Report: jev-research
Role: Architect
Status: DONE
Task as received: Research whether Jev, a TypeSafe AI System One classification model, is suitable for fast card-recommendation classification in Oracle. Use docs/oracle/contracts/ai-audit-2026-09.md and the article at https://www.langchain.com/blog/building-a-harness-with-jev as inputs. Output: docs/oracle/contracts/jev-research-2026-09.md with a recommendation. Done when: the research doc explains what Jev is, what Oracle use cases it could serve, the integration effort, risks, and a yes/no recommendation, with Confirmed path citations, plus a report per AGENTS.md.

## Changed files
- `docs/oracle/contracts/jev-research-2026-09.md` — Research deliverable updated to reconcile with the T-14 AI audit: what Jev is, Oracle use cases, D-016 alignment, what Jev does not fix, integration effort, risks, and a NO recommendation with pilot conditions.

## New decisions made (need owner confirmation)
- None. This research does not commit to adopting Jev or changing any existing contract/schema.

## Assumptions
- `~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md` is the authoritative T-14 AI audit referenced in the task.
- Jev's reported 200×/400× performance figures are vendor claims and are treated as unverified for the purpose of this recommendation.
- "Fast card-recommendation classification" refers to discrete classification decisions (fit, category, flag) over individual cards or small batches, not the generative 100-card skeleton generation already handled by heavy LLMs.

## Challenges to locked decisions
- None.

## Open questions
- Has anyone benchmarked Jev on Magic card classification tasks, or is there a labelled dataset of Oracle deck/category decisions to evaluate against?
- After D-016 remediation is complete, will the owner approve a bounded budget for a Jev classifier pilot?

## Verification
- `read ~/.paseo/worktrees/03dz1jp4/t14-ai-audit/docs/oracle/contracts/ai-audit-2026-09.md` — result: file read successfully; findings reconciled into the research doc.
- `webfetch https://www.langchain.com/blog/building-a-harness-with-jev` — result: article fetched and summarized successfully.
- `read src/lib/category-classifier.ts`, `src/lib/dead-weight-classifier.ts`, `src/lib/brew-prompts.ts`, `src/lib/tool-executor.ts`, `src/lib/provider-factory.ts`, `src/lib/auto-bracket-cards.ts`, `src/lib/ai-models.ts` — results: all read; code claims in the research doc are tagged `[Confirmed: path]`.
- `read docs/oracle/decisions.md`, `docs/oracle/status.md`, `.paseo/agents/architect.md` — results: all read; project-context claims are tagged `[Confirmed: path]`.
- Wrote `docs/oracle/contracts/jev-research-2026-09.md` and this report; no tests or build commands apply because the deliverable is documentation only.
