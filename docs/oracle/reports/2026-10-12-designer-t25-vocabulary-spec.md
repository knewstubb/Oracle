# Report: t25-vocabulary-spec
Role: Designer
Status: DONE
Task as received: You are the Designer. Read AGENTS.md, ~/agents-shared/designer.md and .agents/project/designer.md first. Context: Phase 3 (Shared words and building blocks) in docs/oracle/roadmap.md. Task T-25 (spec only; change no application code). Produce ONE agreed vocabulary spec at docs/oracle/specs/vocabulary.md plus an HTML mockup at docs/oracle/mockups/vocabulary.html that Brad (a designer, not a developer) can review in a browser. Inputs: decisions D-002, D-012 to D-015, D-025, D-026, D-027, D-030, D-032, D-037, D-040, D-041 in docs/oracle/decisions.md; docs/oracle/reports/2026-09-29-orchestrator-vocabulary-starting-point.md; docs/oracle/reports/2026-09-29-orchestrator-card-deck-state-permutations.md. Required content: (1) one table: every fact a card or deck can show (copy type Original/Proxy; placement Sleeved/Unsleeved; availability Available/Unavailable/Alt available/Proxy available/Unowned; deck readiness Draft/Assembling/Playable incl. the Casual rule; loading / failed / stale / unknown; price known / unknown; finish Nonfoil/Foil/Etched) with the exact word, one-line meaning, the colour token and icon (colour never alone, D-012; status hues outside WUBRG, D-013; quiet default / loud exception, D-014), and where it appears; (2) the retired words that must disappear from the app (Planned, Claimed, Considering, Brewing as a status, active/inactive, green/amber/red health as a deck status, Missing, Graveyard, Card Kingdom) and what replaces each; (3) a read-only inventory, by grep of src/, of every place the app uses a retired or inconsistent word or colour today (file, what it shows, the agreed replacement), grouped into proposed fix batches that share no files, ordered by what Brad sees most, each sized small/medium/large; (4) the shared loading, empty and error states (D-030): when to use a scoped spinner vs a skeleton, wording for failed lookup and stale data, and that a failed lookup never reads as Unowned, empty or Playable; (5) a short list of questions for Brad, each framed as a behaviour question with a recommendation first and an example, never implementation. Do not invent new colours outside the existing design tokens in the app: read the current tokens and reuse them. Do not edit decisions.md. Report to docs/oracle/reports/2026-10-12-designer-t25-vocabulary-spec.md in the AGENTS.md report format, with the owner summary in plain words. Stop when done.

## Summary for the owner
Every fact about a card or deck now has one agreed word, icon and colour, and the one-page mockup shows them side by side with how the app looks today. Normal things stay grey; colour is kept for proxies, cards in other decks, cards you don't own, and checks that failed. I found the old words on about 50 screens and parts and grouped the clean-up into 13 batches. I need your answers to six short questions at the end of the mockup, starting with whether deck tiles should drop Active/Inactive now.

## Changed files
- docs/oracle/specs/vocabulary.md — the vocabulary spec: fact table, retired words, loading/error rules, data binding, accessibility, current-app inventory with fix batches V0–V12, questions.
- docs/oracle/mockups/vocabulary.html — self-contained mockup (no internet needed) with an Agreed/Today switch and a greyscale check.
- docs/oracle/reports/2026-10-12-designer-t25-vocabulary-spec.md — this report.

## New decisions made (need owner confirmation)
- Colour mapping, using existing tokens only:
  - Proxy and Proxy available use `--status-proxy`.
  - Unavailable and Out of date use `--signal-warning`.
  - Unowned uses `--status-unowned`.
  - Couldn't check uses `--signal-critical`, on the icon only.
  - Every other state is grey or white.
- Brand green (`--accent-primary`) and `--status-over` are no longer used for status, because they sit next to mana green and mana red (D-013).
- Badge shape shows placement: a solid badge means Sleeved, an outlined badge means Unsleeved. Borders are never dashed; dashed stays reserved for drop zones (D-015).
- Badge words are always grey or white text. The colour goes on the icon and border, because coloured text on tinted fills fails contrast.
- Status icons come from Material Symbols (check, comedy_mask, circle, swap_horiz, lock, do_not_disturb_on, landscape, edit_note, clock_loader_40, check_circle, error, history, help, auto_awesome, texture).
- Nonfoil has no tag in compact rows.
- An unknown price shows "—" or "Price unknown". Totals show "· N cards unpriced".
- New words:
  - "Owned ×N" for search and suggestions outside a deck.
  - Action words: "Move from/to [deck]", "Proxy", "Replace with original".
  - Collection filters: "All / Some / None sleeved / Short".
- New interim state names: Checking…, Couldn't check, Out of date, Unknown.

## Assumptions
- The app stays dark-only; contrast was measured against the dark surfaces.
- Internal code names (`planned`, `claimed`, `alternate`) can stay where nobody sees them (D-025 note). Only visible text, tooltips, toasts and screen-reader labels must change.
- "Graveyard" as the Magic game zone is legitimate and stays.
- The category health checks on the deck page (Ramp, Draw …) are deck analysis, not a deck status. They keep their ok/warn/critical meaning but move to tokens.

## Challenges to locked decisions
- D-013: `--status-proxy` (hue 189°) is only 12° from `--mana-blue` (201°). The mask icon is meant to carry the meaning, and Question 4 asks Brad whether it still reads as blue. The fallback is a grey proxy with a mask icon.
- D-013: `--accent-primary` and `--status-over` are near mana hues and are used as status colours today. The spec stops that; no change to the decision is needed.
- D-002: deck readiness has no data source yet, so the tiles can't honestly show Draft/Assembling/Playable until T-28 / Phase 6 lands. Question 2 offers an interim count-only tile.

## Open questions
- Architect/Gene: two data fields don't exist yet: whether a free proxy is in storage (needed for Proxy available), and deck readiness (state, sleeved count, required count, proxy count, failure). V1, V4 and the Proxy available badge are blocked for build until they exist.
- Gene: the import clean-up (V9) overlaps Phase 5 and the collection clean-up (V8) overlaps Phase 4. Should they run now with wording-only changes, or be folded into those phases?
- Gene: T-46 Batch 2 and the StatusChipPopover part of Batch 9 touch the same files as V2/V3/V5/V6. I propose merging them so each file has one owner.
- Brad: the six questions in §11 of the spec, repeated in the mockup.

## Verification
- `grep` across `src/` for the retired words (Planned, Claim, Reassign, Considering, Brew, Active/Inactive, Missing, Graveyard, Card Kingdom, Not owned, Alternate, Over-allocated, theorycrafted) and for hard-coded hex values. Result: inventory in spec §10.
- Contrast and hue calculations for the tokens against #1A1A1E / #212126 / 15% tints (Python). Result: table in spec §9.
- `ls` of every file path cited in the spec. Result: all exist.
- `git status`: only the three docs files are new; `src/` is unchanged.
