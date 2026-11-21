# Report: purple-primary
Role: Developer
Status: DONE
Task as received: Change Oracle's primary/brand colour to purple #7138CC, with a set of shades (hover, dark mode, charts, backgrounds). Replace brand/primary usage everywhere; leave semantic and pip colours; update the --primary-foreground test; report what was changed and left.

## Summary for the owner
The main colour of the app is now purple (#7138CC) instead of green. Buttons, the logo, the active menu item, focus outlines, links, the mana curve bars, chat accents and selected states all use purple or a lighter or darker shade of it. Green still means "good" things (owned cards, playable decks, success ticks), so the app keeps a clear difference between the brand colour and status colours. One decision for you: the "Brewing" deck badge is also purple (an older, slightly different purple). It is unchanged, but it now sits close to the brand colour; you may want a different colour for it.

## Changed files
- src/styles/tokens.css — new purple scale (brand-50 to brand-950, base 600 = #7138CC); accent-primary, its hover, text, tint and border variants now purple; mana curve tokens renamed from teal to brand
- src/app/globals.css — primary, ring, chart 1-5 and sidebar tokens use the purple scale; dark primary-foreground is now white (6.7:1 on #7138CC); success stays green; focus ring uses the lighter purple for contrast on the dark canvas
- src/components/manabox-import/ImportModalLayout.test.tsx — test now asserts white primary-foreground
- src/lib/ui-tokens.ts, deck-rail/RailCurve.tsx, lib/contrast.test.ts — curve token rename (teal to brand)
- About 45 components/pages (buttons, chips, filters, chat panels, commander browser, strategy, upgrade, collection toolbar, import modal, storage, onboarding, etc.) — hard-coded green/teal/emerald replaced by brand tokens; purple text on dark uses the lighter shade (brand-400, 5.9:1 on the canvas); text on purple fills is white
- src/app/settings/components/page.tsx — style guide shows the purple primary and the full shade scale
- src/components/DeckTile.tsx and DeckTile.test.tsx — Playable stays green via the success token
- DeckListTab.test.tsx, render-card-links.test.tsx — updated expectations

## Deliberately left (semantic or non-brand)
- Success/ownership green: Original/owned dots and badges (CardSlotBadge, CardGroupSection, OwnershipBadge, PrintingPicker, GenericArtPicker, CardHoverPreview, link colour for owned cards), "Owned" badges (SmartSearch, CommanderSearch, AddCardSearch tick), import "resolved" state, reconciliation ticks, ConnectionTab, import progress, PushToArchidekt tick
- Status greens: Playable deck badge and card count, deck health ok ticks and target band, analysis scores and "On target", category health dots, Brew top bar live indicator, version history additions, salt score low, collection price gain and price-to-add, KeyCards "synergy", DeckStatusCard
- Pip/mana colours (WUBRG tokens, mana fills) and status colours (proxy teal, unowned pink, warning amber, over orange, Brewing blue buttons)
- Folder colour picker options (user data), category colour palette, pill-toggle "teal" tone for Active/In deck statuses
- Brewing deck badge purple #8F51D5 (see summary)

## New decisions made (need owner confirmation)
- Success green kept distinct from brand purple.
- Purple text on dark uses a lighter shade than the fill colour, for readability.
- Mana curve multicolour segment (#A78BFA) is a purple too; it sits next to purple bars in the breakdown.

## Assumptions
- App is dark-only (dark class is fixed in the layout); light tokens were updated but the rest of the UI has no light design.

## Challenges to locked decisions
- none

## Open questions
- Should the "Brewing" badge colour change so it does not resemble the brand purple?

## Verification
- npm run typecheck: only 4 pre-existing errors in AddToPicklist.test.tsx (same on the unmodified tree)
- npm run lint: src has 1 pre-existing error (storage link in PicklistV2), unchanged
- vitest --run: src tests pass; upgrade-engine.property failed once in the full run and passed alone and on the unmodified tree (flaky); failures under .worktrees/mana-colours belong to another worktree
- Playwright screenshots in docs/oracle/reports/2026-11-21-developer-purple-primary/: home-dark, collection-dark, deck-dark, import-cards-dark, import-deck-dark, home-light

## Review round 2 fixes
- UpgradeTab active sort/filter pills, CommanderOverview selected build button: text now uses the brand text token.
- CollectionTagFilter: active Tags chip border, match toggle border and Done button now use brand tokens; Done text is white; count text uses the brand text token.
- StrategyGuide: left border on guide cards uses the brand token.
- Browser theme colour (mobile address bar) is now #7138CC.
- Deliberately still green (semantic): Upgrade list status dot for included entries, analysis scores, owned/Playable, price gain, success dots.
- Verification: tsc 4 baseline errors (AddToPicklist.test); lint 12 baseline errors; vitest excluding .worktrees: 4570 pass, 1 known flaky (upgrade-engine property test).
