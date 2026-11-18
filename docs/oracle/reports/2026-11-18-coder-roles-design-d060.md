# Report: roles-design-d060
Role: Developer (docs only)
Status: DONE

Task as received: Bring the card roles and deck jobs design documents in line with new locked decision D-060 in docs/oracle/decisions.md. Deck health targets are no longer "Claude suggests, owner approves each". Claude sets and maintains them itself from the deck strategy, with a visible reason per number, undo, and an owner override that Claude then leaves alone until handed back. Fallback order stays: build numbers, commander average, common guide. Category stays separate from jobs and strategy. Do not edit decisions.md or status.md. Do not edit database drafts; report a needed "owner override" column only as a finding.

## Summary for the owner
Deck health targets are now described as Claude's job. Claude sets each number from the deck's strategy (for example little ramp for Urza, many lands for Hearthhull) and shows a short reason next to it. You can undo any change Claude makes, or type over a number yourself, and Claude then leaves that number alone until you hand it back. Where a deck has no strategy yet, health still falls back to the build's numbers, then the commander average, then the common guide. Categories stay separate and never move a target. Storing these numbers needs one more database change that you would have to approve before anything is built.

## Changed files
- docs/oracle/briefs/card-roles-and-deck-jobs.md — Q6 amended: Claude sets targets from the strategy; owner override and hand-back; fallback order kept; "deck-specific targets later" removed; slice 7 now needs DB-5; note that the old suggested decision numbers D-060 to D-066 clash with the real D-060.
- docs/oracle/specs/card-roles-and-deck-jobs.md — section 10 (idea, refinement, what the section shows): "Set by Claude" with reason and Undo, "Set by you" override, Hand back to Claude, no approval step, change notices; new worked example 13.4 (Urza, Hearthhull, no strategy); sections 8.6, 15 and 17 updated.
- docs/oracle/contracts/card-roles-and-deck-jobs.md — new settlements S16 to S19, S11 amended, new 3.6 (proposed DB-5), 7.2 source order (owner, Claude, then the unchanged fallback), 7.3 inputs, new tool 8.6, section 11 and 13 notes.
- docs/oracle/contracts/card-roles-and-deck-jobs.types.ts — target sources `owner` and `claude_strategy`, new `DeckHealthTargetRow`, reason / set-by / undoable fields on the group result.
- docs/oracle/mockups/card-roles-and-deck-jobs.html — new health screen showing Claude-set targets with reason, Undo, Change, a "Set by you" override and Hand back to Claude.
- docs/oracle/reports/2026-11-18-coder-roles-design-d060.md — this report.

## New decisions made (need owner confirmation)
- Wording on screen: "Set by Claude" (with its reason) and "Set by you" for an override; buttons Undo, Change, Hand back to Claude.
- Claude's target changes are one batch per update, recorded in Recent changes and undoable for 7 days, like its other changes (follows D-034a and D-063).
- Source order per group: your override, Claude's strategy number, build, commander average, common guide.
- A "strategy exists" means the deck has a win condition, strategy points, Notes or jobs. Please confirm.

## Assumptions
- D-060's "Where no strategy exists yet" applies per group: if Claude has not set a number for a group, that group uses the fallback.
- Jobs still do not change health counts (contract S12); the strategy sets targets, strategy points set counts.
- Existing worked examples (13.1 to 13.3, earlier mockup states) are left as decks before Claude has set targets; the new 13.4 and mockup screen show the D-060 state.

## Challenges to locked decisions
- D-060 vs the brief's suggested decision list (section 12): the brief proposed its own D-060 to D-066 before the register had a D-060. They clash. Gene must renumber the suggestions when recording them (noted in the brief).
- D-064 text suggested in the brief ("targets come from the build first") is now partly superseded by D-060. Noted in the brief; Gene should write it with D-060's order above it.

## Findings (database; drafts not changed)
- The contract needs a new store for health targets: number, reason, who set it (Claude or owner, which is the "owner override"), previous value for Undo, batch. This is described as DB-5 in the contract (3.6) and is not drafted.
- The existing `deck_strategy.health_overrides` column holds JSON thresholds (min/max by old category) [Confirmed: src/lib/health-store.ts]. It cannot hold a reason, setter or previous value, so the contract leaves it alone and proposes a new table instead. If the owner prefers a column on `deck_strategy`, the Architect should choose; either way it is a database change needing approval.
- A new change kind `health_target` is needed in the change log (DB-2 widens the list, so DB-5 or a DB-2 amendment must add it).
- The contract's S11 ("health stores nothing") is amended: counts are still not stored; targets are.

## Open questions
- Is "strategy exists" defined as above (win condition, strategy points, Notes or jobs)?
- Should Claude's target update run automatically whenever a strategy point or the win condition is saved, or only when Claude is next asked about the deck? The documents assume the first.

## Verification
- `grep -rniE "approve each|each (health )?suggestion|..." docs/oracle` (excluding reports) — only the new text that says approval is no longer needed, plus unrelated hits (card tagging pipeline, connector brief, status.md). No remaining text describes the owner approving each health suggestion.
- `git status` — only the five design files and this report changed; decisions.md, status.md and supabase/drafts untouched.
