# Report: designer-phase2-whats-missing
Role: Designer
Status: DONE
Task as received: Gate 3 design for Phase 2 ONLY of the approved brief docs/oracle/briefs/daily-use-deck-advisor.md (the deck 'what's missing' view: plain-language verdict on top, counts below, each target with a short reason including the typical number and its source; honest fallback when role data is thin; generic role tags until a strategy is agreed; each gap clickable leading to owned cards (spare, then another deck with warning, then buy ideas with labelled estimated prices, unknown price never zero); if nothing owned fits say so then suggest buys; chat answers the same question; build on the existing health strip and chat; works on phone and laptop; use docs/oracle/vocabulary.md vocabulary). Deliver one HTML mockup at docs/oracle/mockups/, a short spec at docs/oracle/specs/, and this report. Questions for the owner are about behaviour with an example, max three options, recommendation first. Do not touch app code, decisions.md or status.md.

## Summary for the owner
The deck's bottom strip now starts with a one-line verdict such as "Light on draw and removal", followed by counts like "Removal 3/8". Tapping it opens a panel that gives each target's reason and where the number comes from. Tapping a gap shows cards you own that fill it (spare first, then in another deck with a warning), then buy ideas with estimated prices. The chat gives the same answer. Three small behaviour questions are below.

## Changed files
- docs/oracle/mockups/whats-missing.html — one page with eight scenarios (healthy, gaps overview, spare, only-in-another-deck, nothing owned with buy ideas, thin data, chat, checking/error) and a Laptop/Phone switch
- docs/oracle/specs/whats-missing.md — the spec
- docs/oracle/reports/2026-11-11-designer-phase2-whats-missing.md — this report

No app code, decisions.md or status.md touched. Note: `docs/oracle/vocabulary.md` does not exist; the vocabulary used is `docs/oracle/specs/vocabulary.md`.

## New decisions made (need owner confirmation)
1. **Where it lives:** the existing health strip gets a verdict chip; the panel is a right drawer on laptop and a bottom sheet on phone. No new tab.
2. **Pills limited to Ramp, Draw, Removal, Wipes** until a strategy is agreed (brief 17.2). The other five health pills are hidden for now.
3. **No red for gaps.** Light is amber with a warning icon and the word "Light"; on track is a quiet tick. Red stays for "Couldn't check". This is how the all-red result goes away.
4. **New words:** Spare, Light, On track, General guide, Buy ideas. The vocabulary spec has no "Spare" row; the brief and Architect use it. Existing words kept: Available, Unavailable · In [deck], Unowned, est., Price unknown.
5. **Title "What's missing"** is the brief's own name for the view. It sits next to the Phase 3 system location "Missing" (brief 17.6), which could confuse. Suggest Gene decide at Phase 3 whether the location is renamed or the view is.
6. **The old pill click** (jump to Cards tab) is kept as a link inside each gap.
7. **Owned cards only count when legal for the deck:** same colour identity, proxies and planned slots not counted.
8. **Phase 2 is suggest-only:** no add or move button in the panel (D-007, D-034).
9. **Thin-data buy ideas:** none shown (question 3).
10. **A role counts as "Light"** when 2 or more short (question 1).

## Assumptions
- The Architect sets the "thin" threshold (how few classified EDHREC cards count as thin); the mockup uses 9 as an example. Real numbers in the mockup are invented sample data.
- A card can count in several roles; the deck total stays 100 (brief section 9).
- Cache of role targets per commander exists (audit 15a); it is not a contract yet.
- Card names used as examples are sample data and not checked against the owner's collection.

## Challenges to locked decisions
- none. Reminder for Gene: D-028 (Missing removed) is reversed for the system location only; the "Missing" word is kept off this view's owner-facing items except in the brief's own title.

## Open questions
1. **When is a role "Light"?**
   - Recommended: 2 or more short. Example: typical 8, you have 7 reads "On track"; you have 6 reads "Light, 2 short".
   - Alternative A: any shortfall. The same deck would show 7 as "Light, 1 short"; stricter, but it would mark most decks light.
   - Alternative B: under 75% of typical. 8 typical means 5 or fewer is Light; 2 typical means 1 is Light. Scales with size, harder to explain.
2. **Buy ideas when you already own options.**
   - Recommended: collapsed, with a count ("Buy ideas (3)"). Example: Removal shows 3 spare and 1 in another deck, then a closed "Buy ideas (3)" row; for Draw, with nothing owned, it opens by itself.
   - Alternative A: always open. More complete, but a long list under every gap.
   - Alternative B: hidden until you ask. Cleanest, but the brief wants buys offered.
3. **Thin data and buy ideas.**
   - Recommended: no buy ideas, with a plain sentence saying why. Example: a commander with 9 EDHREC cards shows your spare cards and "No buy ideas yet", never a made-up list.
   - Alternative A: show a short list labelled "general staples, not specific to this commander". Helpful, but it is the popular template the brief warns against.
   - Alternative B: show buy ideas only when 3 or more EDHREC cards fit the role. Fills more gaps, but partial lists may mislead.

## Dependencies for the Architect (before Gate 4)
- A per-commander role-target contract: role, typical number, number of EDHREC cards used, source label, and the thin threshold.
- A per-card role result for suggested cards so the pill count and the cards listed agree.
- A colour-identity filter on the spare and buy lists.
- Health route does not filter by user (audit area 3); fix before any multi-user work.

## Verification
- Opened the mockup in Chrome via Playwright and clicked through all eight scenarios in laptop and phone layouts — no script errors; screenshots reviewed for spare, buy (phone) and thin-data views.
- Contrast ratios computed from the real tokens — all text pairs 4.5:1 or better; magenta used for icon and border only.
- Not tested: real devices, screen reader, the app (nothing built).
