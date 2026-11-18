# Report: feature audit, newest first
Role: Gene
Status: DONE
Task as received: "Can you do an audit of where we are up to with the development of all features for this app. Do this in chronological order with newest first. I feel like there are a lot of half built features"

## Summary for the owner
Most recent work is finished and live, but five things are half done: Claude category tools (built, not saved to the shared codebase), Add all on the import result, the Picklist click-through, Claude's remaining follow-ups, and several older import/card-fact fixes. Older foundation work (phases 3, 4, 6 to 10) was parked on purpose and is not "half built", just not started.

## Audit (newest first; status from status.md, git history and reports)

### 16 Nov 2026
| Feature | State | What is missing |
|---|---|---|
| Claude set-card-category tool | BUILT, NOT SAVED to git (edits sit uncommitted; its draft database file was deleted from drafts) | Commit/merge; confirm live test result |
| Category management screen, Suggested categories | Briefs drafted only | Owner approval; both wait on the category tool |
| Claude collection search (CC-07) | Audit and contract done | Not built |
| Game logging and playgroup (CC-08) | Brief approved | Not started (last in order) |
| Claude card facts and live deck health (CC-06) | Built and merged | Nothing known |
| Import: deck destination (I2) | LIVE | Click-through in the browser not done |
| Import: box or binder destination (I1) | LIVE | Click-through |
| Import result "Add all to Picklist" | PARTIAL: designed, no database change needed | Developer has not wired it |
| Picklist (Move here, per-deck list, In your hand, Missing, ticks, all-decks page, Add to Picklist, Found it, I checked here, Undo, Cancel) | BUILT, routines live | Owner click-through; unowned footnote wording awaiting your confirmation; Sleeved/Unsleeved replacement words undecided |
| Claude connector slices A, B, D (read, safe edits with Undo, switch, setup guide) | LIVE | Slice D branch recorded "not merged" in status (later log suggests merged; status is stale); owner choices on deck-list wording, removing a broken scheduled job; D-034 amendment not recorded |
| Data separation fixes (CC-03a/b/c) | LIVE | Nothing |
| Storage page and ManaBox large-import speed fixes | Done | Nothing |
| Collection value above 1000 cards | Fixed | Nothing |

### 11 to 13 Nov 2026
| Feature | State | What is missing |
|---|---|---|
| Deck health (verdict, gaps, owned fixes, buy ideas, chat button) | LIVE | S2 commander targets built; status wording unclear on merge |
| Chat adds cards (Add / Not now / Undo) | LIVE | Designer spec for suggestion cards |
| Floating chat panel and footer | LIVE | Nothing |
| Daily-use brief: priorities beyond "what's missing" (power level effect, post-purchase walk-through) | Approved, not started | Most of the brief |

### 2 to 10 Nov 2026
| Feature | State | What is missing |
|---|---|---|
| Use what I own (deck chat checks owned copies) | Slices a, b merged; slice c folded into daily-use | Exit test on three real decks not recorded |
| Import review (move check, source picks, finish, basics toggle) | Merged | Nothing known |
| Commander slots, partner, companion | Merged | Nothing |
| Vector recommendations trial | CLOSED, NOT A GO, archived | Spellbook combo notes and two small bug fixes left as ideas |

### 11 Oct to 1 Nov 2026
| Feature | State | What is missing |
|---|---|---|
| Phase 1 safety net (checks, type errors) | DONE | No automatic backups (accepted) |
| Phase 2 card facts | Built, never checked by owner | Checklist C-01 to C-07; T-51 (value banner) and T-52 (Add proxy for unowned card) PARKED |
| ManaBox import (T-53 to T-56) | Merged | T-58 (CSV without Scryfall ID rejected) PARKED; T-57 foil on deck import dropped |
| Vocabulary spec (T-25) | Approved | T-26 shared badges/states PARKED, so old words remain on screens |
| Import cleanup (old import screens, broken Precon tab) | Brief DRAFT, not approved | Old screens still present |

### Sept 2026 and earlier
| Feature | State | What is missing |
|---|---|---|
| M1 trustworthy data (allocation, source tracking, maybeboard import) | DONE | Nothing |
| Advisor contract (T-15 to T-19, T-36) | PARKED | Not built as designed; chat suggestions replaced it in practice |
| Reconcile overuse rule (T-37), shortage spec (T-29), basics spec (T-30) | PARKED | Not built |
| Collection and storage (Phase 4), deck states (Phase 6, D-059), Brew Canvas, bulk actions, sharing (Phase 10) | PARKED / not started | |

## Half-built list (what you suspected)
1. Category tool: built but unsaved.
2. Add all on the import result: designed, not wired.
3. Picklist and import destinations: built, never click-tested by you.
4. Phase 2 card-fact fixes: two parked, checklist unconfirmed.
5. Shared words/badges (T-26): spec approved, never built, so screens mix old and new wording.
6. Old import screens and Precon tab (import cleanup): never approved.
7. Status document itself is stale in places (connector slice D, CC-04 rows still TODO).

## Changed files
- docs/oracle/reports/2026-11-16-gene-feature-audit-newest-first.md — this report

## New decisions made (need owner confirmation)
- none

## Assumptions
- [Approximate] Merge state of connector slice D inferred from git log ("CC-04d" commits on main) versus status.md saying "not merged".
- Uncommitted category-tool files noted from git status [Confirmed: git status, src/lib/connector/tools/edit-tools.ts modified].

## Challenges to locked decisions
- none

## Open questions
- Which half-built item matters most to finish before new work?

## Verification
- Read status.md, roadmap.md, briefs, reports list, git log and git status; no code run.
