# Report: scan-wins import review
Role: Designer
Status: DONE
Task as received: “Repository: /Users/bradknewstubb/Developer/Personal/oracle_app on main. Owner approved building the new scan-wins import review. Read AGENTS.md, your role instructions, `docs/oracle/process.md`, the updated `docs/oracle/briefs/use-what-i-own.md` §9, and the audit `docs/oracle/reports/2026-11-03-architect-scan-wins-audit.md`. Follow the required Gate 3 process. Create a separate worktree/branch based on main (do not disturb dirty proxy icon files on main). Do NOT implement production code, do NOT modify database/schema/contracts/decisions, and do NOT merge. Create one mockup that covers all scenarios below and a standard report in docs/oracle/reports/2026-11-03-designer-scan-wins-review.md. Commit only your design outputs on your branch.

Approved behavior:
- Import scan wins: physical cards found in another deck can be moved into the deck being scanned. The source deck keeps its planned card and shows short by one until scanned.
- Before saving, show a review listing proposed moves; a single source is auto-selected but owner can untick.
- If a move is unticked, the incoming deck keeps that slot unsleeved/short; physical copy remains in the existing source deck; do not create an extra copy.
- If multiple copies exist across decks, owner chooses the source deck for each incoming copy (e.g., one Sol Ring from Korvold and one from Prosper).
- Ignore basic lands toggle is ON by default. It ignores Plains, Island, Swamp, Mountain, Forest and Wastes and shows how many are ignored. Snow-Covered lands and nonbasic lands remain in the move list. Turning the toggle off includes those six basic names.
- Architect found the existing data model can represent moves and shortages without a migration (see report); no new storage decision needed.

Design should follow the existing ManaBox import visual style and use plain language. Make the flow integrated with the current deck-import review rather than inventing a separate screen. Cover: no conflicts; one proposed move; unticked move; multiple candidate source decks/copies; basic-land toggle/count; confirmation/save state. Don't ask the owner more questions on behavior already approved. If any remaining ambiguity is truly blocking visual design, state one precise question in the report rather than guessing.

Stop after the mockup and report. Include a short owner-facing summary, changed files, assumptions, open questions, and verification in report. Owner must review/approve the mockup before code is built.”

## Summary for the owner
The existing ManaBox deck review now has a mockup for checking proposed moves before import. It shows a preselected unique source, choosing a source for each of several copies, what stays Unsleeved when a move is unticked, and the basic-land count; please review and approve the mockup before code is built.

## Changed files
- `docs/oracle/mockups/scan-wins-review.html` — one interactive, self-contained mockup integrated into the deck-import review.
- `docs/oracle/reports/2026-11-03-designer-scan-wins-review.md` — Gate 3 design handoff and verification.

## New decisions made (need owner confirmation)
- Place the proposed-move check, basic-land toggle, and move count inside the existing deck-import review rather than adding a separate screen.
- Show one row per incoming physical copy. A unique source is visibly preselected; multiple candidates require an owner selection for each copy.
- An unticked row explicitly says the physical card stays in its source deck and the incoming deck's slot remains Unsleeved. The import summary is updated before save.
- The final review's **Import deck** action saves the displayed choices; the mockup does not add a separate confirmation dialog.

## Assumptions
- The current ManaBox deck-import review is the surrounding screen; deck name, format, commander, defaults and deck-list preview remain in place.
- The move review presents source-deck name, printing and finish as descriptive details. Sample content is illustrative, not data from a live account.
- The basic-land count represents scanned copies (sample: Forest ×2 and Wastes ×1), not distinct card names. The six excluded names are shown in the toggle helper; Snow-Covered Forest and Command Tower remain visible in the proposed-move sample.
- The sample controls above the mockup switch between no-conflict, one-move and multiple-copy examples; they are for review only, not proposed product controls.

## Challenges to locked decisions
- D-020 and D-047 — the approved §9 scan-wins flow is a specific, owner-confirmed import-time transfer. The mockup makes the transfer visible and leaves the final save action with the owner; the decisions register was not changed. Gene should reconcile the narrow exception at the appropriate close-out gate.
- None of D-012–D-015 is changed: controls are scoped to the move review, status is conveyed with text as well as color, and the normal review remains visually quiet.

## Open questions
- None. The approved brief resolves the audit's earlier untick and Wastes questions.

## Verification
- Read `AGENTS.md`, the Designer base and project role instructions, `docs/oracle/process.md`, `docs/oracle/briefs/use-what-i-own.md` §9, and the Gate 2 audit.
- Confirmed the review styling against the existing ManaBox import mockup, import-flow component, import summary, and design tokens.
- Created isolated worktree `/Users/bradknewstubb/Developer/Personal/oracle_app-scan-wins-review` on branch `design/scan-wins-review-2026-11-03`, based on `main`; the dirty proxy-icon files in the main worktree were not touched.
- No production code, database/schema/contracts/decisions, or other worktree files were modified. No owner data was accessed. Automated product tests are not applicable to this design-only task.
- Parsed the mockup HTML and validated its embedded JavaScript syntax with Python's HTML parser and Node.js. A browser interaction check was attempted but could not run because the installed Playwright package has no Chromium executable available in this environment.
