# Report: deck rail redesign, build steps 1 to 3
Role: Developer
Status: DONE
Task as received: Implement the deck rail redesign (build steps 1 to 3) in the worktree on branch deck-rail-redesign, following the owner's five overrides: 1 Keep Command Zone ranges; 2 Follow the allocation vocabulary rules; 3 New spec for the art header; 4 Ok (no green status colour on the rail and deck page only); 5 Follow spec (Strategy label, one Edit link, chips). Opening instruction: "Check with me for any conflicts before beginning." Final step (FEAT-005): evidence, report, rebase onto current main, keep both sides on conflicts, never push.

## Summary for the owner
The deck page's left rail now has the new look: the commander art runs across the top of the card, the command zone shows each commander with its colours, Strategy is a label with one Edit link and chips, and the Cards section shows a single bar split by sleeved and not sleeved with a plain legend. Legality and build status sit under it, followed by Deck health (Command Zone ranges, shortfalls first) and one Mana section. Green is gone from the rail. Please decide two things: whether the rail may stay 48 px wider than before (352 px instead of 304 px), and whether the Cards tab list should get the same neutral checks and coloured mana symbols (a proposal is below, nothing was changed there).

## Contradictions (all settled, none needed a question to the owner)
| # | Spec says | Conflicts with | Settled by | Reading built |
|---|---|---|---|---|
| C1 | Health targets = EDHREC average | D-061 Command Zone ranges | Override 1 | Ranges 35-38 / 10-12 / 10-12 / 10-12 / 3-6, Game Plan plain total. EDHREC only in the footnote. |
| C2 | "Available", "Open slot" | Allocation vocabulary | Override 2 | Free copy = Open; empty slot = Empty slot; other decks = In other decks. Legend groups Sleeved / Not sleeved / Empty. |
| C3 | Equal radius on all four art corners | New spec: full-width header art | Override 3 | Header art with top radius only; partners side by side. |
| C4 | No green as status colour | Deck tiles and import screen use green | Override 4 | Rail and deck page only. Deck tiles and import screens untouched. |
| C5 | Whole-block Strategy button | New spec | Override 5 | Label, one Edit link, chips. |
| C6 | Three legality states, size and partner lines | Task: today's legality rules | Task limits | Three-state component fed by today's Legal / Not legal; Unverified, size and partner lines wait for Gate A. |
| C7 | "100 cards · singleton ..." | Route does not check size | Task limits | "100 cards" only when the count is 100; otherwise "Legal so far" with "Nothing found illegal. 84 of 100 cards." |
| C8 | "Playable needs a legal list first." | Playable ignores legality today | Task limits | Shown only when Not legal and not Playable. |
| C9 | Brewing / Assembling / Playable | D-059 renames them (parked) | Existing automatic states | Uses today's readiness rule. D-059 is not built. |
| C10 | Legend has no state for sleeved basics | D-032 counts them as sleeved | D-032 | "Basics" in Sleeved; "Basics, not sleeved" in Not sleeved. |
| C11 | Partner with / Friends forever / Doctor's companion chips | Only partner, background, companion are stored | Existing data | Chip says "Partners" or "Background". The other three cannot be stored today. |
| C12 | Salt chip colours | Rail used green/amber/red | Principle 1, Override 4 | Salt chip is neutral. |
| C13 | "Basics" | Rail said "Generic" | Vocabulary | "Basics". |
| C14 | Over range stays neutral | Panel words "heavy" | Spec | No word or colour for over in the rail; the dialog keeps its own words. |
| C15 | Same card surface as group cards | No shared component | No Cards tab styling change | Shared surface token; the Cards tab output is byte-identical (test pins it). |
| C16 | Contrast against card surface | Surface is translucent | Check against the token | Contrast computed from the token over the page background. Lighter blurred art behind is a known residual. |
| C17 | 216 px for label / meter / have / delta | 304 px rail | Spec | Rail widened to 352 px. |

## Gate A findings (the four Elfball cards)
Cause: the four cards are not in the card library at all. They are not a name-format mismatch and not a missing legality value.

- Khalni Ambush // Khalni Territory: no exact, prefix or front-face match.
- Find // Finality: no exact or front-face match (prefix "Find%" only gives "Find the Path", a different card).
- Revitalizing Repast // Old-Growth Grove: no match.
- Bridgeworks Battle // Tanglespan Bridgeworks: no match.

Other double-faced and split cards are stored under the full "A // B" name (189 of 32,633 rows), so the route's exact-name lookup works for them. Across all 23 decks, 4 distinct names (4 rows, 1 deck) are affected; 1,249 of 1,253 distinct names resolve. A front-face or prefix fallback would find none of the four.
Mechanism: the legality route finds no row, `evaluateCommanderLegality` skips the card silently, so it is never flagged or marked unverified. [Confirmed: src/app/api/decks/[id]/legality/route.ts, src/lib/deck-legality.ts]
Smallest fix (not applied): load the four missing printings through the normal card-data sync (a data write, owner decision), and have the route return the names it could not look up so the rail can show "Unverified". Queries: select-only on `deck_cards.card_name` and `ref_cards.name` by exact, `ilike 'X%'` and front-face name, plus a count of deck names with no library row.

## Gate B impact list (proposed Playable = every counted card sleeved AND legality Legal or Unverified)
No deck changes status. Today's rule already requires exactly 100 cards, so wrong-size decks are never Playable.
- Murky Business 101/100 and Yedora the Explorer 102/100: Assembling both ways (the expected change did not appear).
- Other off-size decks, Assembling both ways: Tidus 98, World Breaker 97, All gas no brakes 98, Arti-facts 84.
- Brewing both ways (nothing sleeved): Isshin 2, Test C 61, TEST A 61, E2E Read-only Snapshot Fixture 13, Elfball with Partners 100/100 (4 unverified rows).
- Banned, colour-identity or over-limit issues today: none in all 23 decks.
- Playable today and under the proposed rule (12): Sliver me timbers, Drake Expectations, Big Zurgs, Ureni the Heartbreaker, Stax on Stax, Veloci-ramp-tor, Auntie Ool, A rot to process, Felothar, Rocco's Secret Sauce, Merfolk, The Fairmaker.
- Only way a status could change under the proposed rule: a counted card found illegal. None exist.
Caveat: the check counted rows, as the readiness rule does, not quantities.

## Gate C proposal (Cards tab list, not changed)
Before: green check circle on every row; monochrome mana symbols; status marks that differ from the rail's swatches.
After: neutral check (grey outline, no green); coloured mana symbols from the same symbol component the rail uses; row status shown with the same swatches as the rail (solid grey Original, hatch Proxy, hollow Open, grey In other decks, amber Unowned). Decision needed: approve or decline.

## Flags for visual choices (owner to confirm)
- Rail width 352 px instead of 304 px. The card list loses 48 px at 800 px page width.
- Deck health meter: a muted band from minimum to maximum with two thin ticks, fill = count; neutral when in range or over, amber only when under. The exact marking is proposed. Rows carry a "proposed" flag so a later "proposed, not confirmed" state can be added.
- Amber `#F2B84B` (warnings, Unowned) and greys `#C9CFCB` (Original) and `#6E7571` (In other decks). Mana fills are the spec values; contrast tests require 3:1 and passed (see the contrast test file for any adjusted value).
- Original swatch is no longer green in the card details window (it shares the swatch component).
- Salt chip is neutral and shows with or without a bracket.
- Wording of C7 ("Legal so far") and C8.
- Legend for sleeved basics (C10).
- "+ Set bracket" is a dashed neutral chip link, never amber.
- Deck health footnote shows "EDHREC average for reference · N decks" with an amber "small sample, treat as rough" under 1,000 decks. N comes from a new additive field on the health response; the numbers `get_deck_health` returns are unchanged (pinned by a test). [Confirmed: src/lib/deck-health.ts]

## countLandSources answer
`countLandSources` matches land names against fixed lists (basics, snow basics, shocks, originals, fetches and so on). It receives only card name and quantity, so it cannot read card text. Counting rocks would need non-land mana producers passed in with a rule for their colours (card text "Add {G}"). Counting utility lands needs text reading for "any colour". Neither is cheap without new data on the rail's cards. The function was not changed. The "−N pts" under-supply chip remains the strongest warning in the Mana section, and the footnote says rocks and utility lands are not included. [Confirmed: src/lib/mana-analysis.ts]

## 5-minute test on the four decks
Screenshots show the top of the rail only (the rail scrolls on its own). Real browser, local app, logged in as the default user. Playwright could not run (no isolated test login), so these were taken by hand.
- Rocco's Secret Sauce: one commander, Bracket 3 and Salt 0.6 chips, 94 Original and 6 Proxy, "Legal for Commander", "Playable · 100 of 100 sleeved". Reads in under a minute.
- Sliver me timbers: playable deck, same layout (see screenshots).
- Arti-facts: 84 / 100, "+ Set bracket" chip, italic summary link, 83 Original, 1 Proxy, 16 Empty slots, "Legal so far · Nothing found illegal. 84 of 100 cards.", "Assembling · 84 of 100 sleeved".
- Elfball with Partners: two commanders side by side, "Partners" chip, Combined identity row, 19 Open, 14 Basics not sleeved, 20 In other decks, 47 Unowned, "Basics short: Forest, Swamp", "To buy: 47 unowned cards · $126.10". The four Gate A cards show no legality mark, as expected.

Screenshots:

`docs/oracle/reports/evidence/deck-rail-redesign/`

Files: rocco, sliver, artifacts and elfball, each at 1280 and 800.

## Changed files
- src/components/deck-rail/* (DeckRail, RailCards, RailCommander, RailHealth, RailMana, RailLegality, RailBuildStatus, RailOutside, RailSection and tests) — new rail; RailCurve and RailColourNeeds replaced by RailMana
- src/components/deck-strategy/StrategyBlock.tsx (+test) — label, Edit link, chips
- src/components/CopySwatch.tsx, ManaSymbol.tsx (+tests) — shared swatch and mana symbol
- src/components/CardGroupSection.tsx, CardGrid.tsx — shared surface import; color_identity field type
- src/components/LegalityBanner.tsx, src/lib/deck-legality-query.ts — one shared legality query
- src/lib/ui-tokens.ts, contrast.ts, styles/tokens.css — tokens and contrast checks
- src/lib/deck-rail-stats.ts, deck-rail-health-view.ts (+tests) — rail numbers
- src/lib/deck-health.ts (+tests) — additive `sample` field
- src/app/api/decks/[id]/route.ts, src/app/decks/[id]/page.tsx — colour identity per card, full card list to the rail
- docs/oracle/reports/evidence/deck-rail-redesign/*.png, this report

## New decisions made (need owner confirmation)
- Rail width 352 px (C17).
- Meter marking and amber/grey values (flags above).
- "Legal so far" wording and the Playable line gating (C7, C8).

## Assumptions
- Screenshots use the default user's data via the local app on port 3417 with a copy of the existing `.env.local` (not committed).
- Original swatch changing from green to grey in the card details window is accepted as part of Override 4.

## Challenges to locked decisions
- D-059: Brewing rename is not built; the rail uses today's states. Evidence: readiness rule still returns brewing. Suggested change: none until D-059 is scheduled.

## Open questions
- Approve Gate C (Cards tab list restyle)?
- Load the four missing Elfball printings into the card library (data write)?
- Keep 352 px?

## Verification
- `git rebase main` — clean, no conflicts (4 commits replayed onto 0c0a8e3).
- `npm run check` after rebase — vitest: 1 failed (known ImportIntentFlow), 4522 passed; because the test step fails, the script stops there. Run separately: `npm run typecheck` — only the 4 known AddToPicklist errors; `npm run lint` — 0 new errors (1 existing error in PicklistV2.tsx, a file this branch does not touch; 275 warnings). Matches baseline.
- 8 screenshots saved and checked at 1280 and 800 px.
