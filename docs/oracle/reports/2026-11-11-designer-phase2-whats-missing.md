# Report: designer-phase2-whats-missing
Role: Designer
Status: DONE
Task as received: Gate 3 design for Phase 2 ONLY of the approved brief docs/oracle/briefs/daily-use-deck-advisor.md (the deck 'what's missing' view: plain-language verdict on top, counts below, each target with a short reason including the typical number and its source; honest fallback when role data is thin; generic role tags until a strategy is agreed; each gap clickable leading to owned cards (spare, then another deck with warning, then buy ideas with labelled estimated prices, unknown price never zero); if nothing owned fits say so then suggest buys; chat answers the same question; build on the existing health strip and chat; works on phone and laptop; use docs/oracle/vocabulary.md vocabulary). Deliver one HTML mockup at docs/oracle/mockups/, a short spec at docs/oracle/specs/, and this report. Questions for the owner are about behaviour with an example, max three options, recommendation first. Do not touch app code, decisions.md or status.md.

## Summary for the owner
The deck's bottom strip starts with a one-line verdict such as "Light on draw and removal", followed by counts like "Removal 3/8". Tapping it opens the **Deck gaps** panel with each target's reason and source, then owned cards that fill the gap (spare first, then in another deck with a warning), then buy ideas with estimated prices. The chat gives the same answer. Your three answers and the new name are applied; no questions remain.

## Changed files
- docs/oracle/mockups/whats-missing.html — one page with eight scenarios (healthy, gaps overview, spare, only-in-another-deck, nothing owned with buy ideas, thin data, chat, checking/error) and a Laptop/Phone switch
- docs/oracle/specs/whats-missing.md — the spec (file names kept; view renamed Deck gaps)
- docs/oracle/reports/2026-11-11-designer-phase2-whats-missing.md — this report

No app code, decisions.md or status.md touched. Note: `docs/oracle/vocabulary.md` does not exist; the vocabulary used is `docs/oracle/specs/vocabulary.md`.

## New decisions made (need owner confirmation)
1. **Where it lives:** the existing health strip gets a verdict chip; the panel is a right drawer on laptop and a bottom sheet on phone. No new tab.
2. **Pills limited to Ramp, Draw, Removal, Wipes** until a strategy is agreed (brief 17.2). The other five health pills are hidden for now.
3. **No red for gaps.** Light is amber with a warning icon and the word "Light"; on track is a quiet tick. Red stays for "Couldn't check". This is how the all-red result goes away.
4. **New words:** Spare, Light, On track, General guide, Buy ideas. The vocabulary spec has no "Spare" row; the brief and Architect use it. Existing words kept: Available, Unavailable · In [deck], Unowned, est., Price unknown.
5. **View name: Deck gaps** (owner decision, replaces the brief's "What's missing" so it cannot clash with the Phase 3 Missing location).
6. **The old pill click** (jump to Cards tab) is kept as a link inside each gap.
7. **Owned cards only count when legal for the deck:** same colour identity, proxies and planned slots not counted.
8. **Phase 2 is suggest-only:** no add or move button in the panel (D-007, D-034).
9. **Thin-data buy ideas:** none shown (owner decision).
10. **A role counts as "Light"** when 2 or more short (owner decision).

## Assumptions
- The Architect sets the "thin" threshold (how few classified EDHREC cards count as thin); the mockup uses 9 as an example. Real numbers in the mockup are invented sample data.
- A card can count in several roles; the deck total stays 100 (brief section 9).
- Cache of role targets per commander exists (audit 15a); it is not a contract yet.
- Card names used as examples are sample data and not checked against the owner's collection.

## Challenges to locked decisions
- none. Reminder for Gene: D-028 (Missing removed) is reversed for the system location only; this view no longer uses the word "Missing".

## Decisions (owner answers, 2026-11-11)
1. **Light at 2 or more short.** Typical 8 and you have 7 reads On track; 6 reads Light, 2 short.
2. **Buy ideas** are collapsed with a count when owned options exist, and open by themselves when nothing owned fits.
3. **Thin data shows no buy ideas**, with a plain sentence saying why.
4. **The view is named Deck gaps** everywhere (mockup, spec, this report).

## Open questions
- none

## Dependencies for the Architect (before Gate 4)
- A per-commander role-target contract: role, typical number, number of EDHREC cards used, source label, and the thin threshold.
- A per-card role result for suggested cards so the pill count and the cards listed agree.
- A colour-identity filter on the spare and buy lists.
- Health route does not filter by user (audit area 3); fix before any multi-user work.

## Verification
- Opened the mockup in Chrome via Playwright and clicked through all eight scenarios again after the rename in laptop and phone layouts — no script errors; screenshots reviewed for spare, buy (phone) and thin-data views.
- Contrast ratios computed from the real tokens — all text pairs 4.5:1 or better; magenta used for icon and border only.
- Not tested: real devices, screen reader, the app (nothing built).
