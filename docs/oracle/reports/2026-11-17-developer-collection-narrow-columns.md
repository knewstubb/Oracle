# Report: collection-narrow-columns
Role: Developer
Status: DONE

Task as received: Collection list view: (1) prioritise card name at narrow widths, (2) remove Finish column, (3) remove Cost column. Remove only from the Collection list view; flag sort/filter references to Finish or Cost; flag where finish is still shown; check at about 1024px and 700px.

## Summary for the owner
The Collection list now gives card names the space first, so names stay readable on narrow windows. The Finish and Cost columns are gone from that list only. On narrower windows the Type column hides first, then Added, then Set shrinks, so the name never gets squeezed. Foil is no longer visible in the list view; it still shows in the grid view and in the card detail panel (see Open questions).

## Changed files
- src/components/collection/PrintingListView.tsx — removed Finish and Cost columns (and the unused mana-symbol helper); Name group has a minimum width and 3x the spare space; Type hidden below 1280px, Added hidden below 1024px; row spacing reduced
- docs/oracle/reports/evidence/2026-11-17-collection-list-700px-after.png, docs/oracle/reports/evidence/2026-11-17-collection-list-1024px-after.png — after screenshots

## New decisions made (need owner confirmation)
- Type column hides below 1280px wide and Added hides below 1024px wide. Rarity, Set and Price always stay.

## Assumptions
- "Narrow" means desktop-style list (640px and wider). Below 640px the existing phone layout (Qty, Name, Price) is unchanged.

## Challenges to locked decisions
- none

## Open questions
- Finish: Finish had no sort option and no filter, so nothing to remove there. Foil is still shown on grid view cards [Confirmed: src/components/collection/CollectionGridView.tsx] and in the card detail panel [Confirmed: src/components/collection/InstanceDetailPanel.tsx]. In the list view it is no longer shown anywhere. Recommendation: show a small "Foil" tag next to the card name in the list (the way "proxy" is already shown). I did not add it.
- Cost: no sort or filter used Cost (its header was not sortable). Colour filters are separate and untouched. Export is a separate API and unaffected [Confirmed: src/app/api/collection/export/route.ts not touched].
- No column picker or saved column settings exist for this view.

## Verification
- Playwright on a local dev server (port 3101), read-only, list view. Measured Name width: 1280px = 540px, 1024px = 456px, 700px = 291px; no names clipped, no horizontal scrolling at any of those widths. At 700px the visible columns are checkbox, Qty, Name, Rarity, Set, Price. No "before" measurement taken (the owner's server was not running); the old layout gave the Name column about half of the leftover space after fixed columns totalling about 600px.
- npm test — 2 failures, neither related: ImportIntentFlow (known env-flag) and a connector description test (registry-and-isolation, also fails on main without my change).
- npm run typecheck — only errors are in AddToPicklist.test.tsx (not touched).
- npm run lint — 4 errors elsewhere, 0 errors in the changed file.
- No existing test referenced these columns; none changed.
