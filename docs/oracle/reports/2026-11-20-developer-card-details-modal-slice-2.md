# Report: card details modal, slice 2 (collection context)
Role: Developer
Status: DONE
Task as received: build slice 2 of the card details modal (collection context): Overview and Copies in the collection context, retire InstanceDetailPanel, verify bulk selection and every existing allocation action still work. Stop after slice 2 for owner review.

## Summary for the owner
Clicking a card on the Collection page now opens the same card window as in decks (1080 by 600 on desktop, full screen on a phone). It shows where each copy is, which decks are waiting for the card, every printing, every copy with condition and storage you can change in place, and the rulings. The old side panel is gone, so the Collection list now uses the full page width. Please read the flags below: a few things differ from the sample screens, and two old actions that never worked (Unassign, Replace with original) now do.

## Changed files
- src/components/card-details/CardDetailsShell.tsx (new) — shared frame (picture rail, header, tabs, loading and error); the deck window now uses it with no change in behaviour
- src/components/card-details/CardDetails.tsx — deck window rebuilt on the shell; tab memory now per context (deck, collection)
- src/components/card-details/OverviewFacts.tsx (new), OverviewTab.tsx — card text, stats and Tags shared by both Overview tabs
- src/components/card-details/CollectionCardDetails.tsx, CollectionOverviewTab.tsx, CollectionPrintingsTab.tsx, CollectionCopiesTab.tsx, useCollectionCardDetailsData.ts (new) — the collection window
- src/components/card-details/CopiesTab.tsx, RulingsTab.tsx, PrintingsTab.tsx, shared.tsx — condition shown as NM/LP/MP/HP/DMG in the deck Copies tab (display only); small type and sharing changes
- src/lib/card-details/labels.ts (+ test), printings.ts, load.ts — words, condition map, shared filter/sort, three helpers exported
- src/lib/card-details/collection-copies.ts, load-collection.ts (+ tests) — read-only loader for the collection window
- src/app/api/collection/instances/[oracleId]/details/route.ts (+ test) — new read route
- src/app/api/collection/instances/condition/route.ts (+ test) — new write route for one existing column (flag 1)
- src/components/SaveStatus.tsx, collection/StorageLocationSelect.tsx — optional additions (error text; start/saved/error callbacks); defaults unchanged
- src/components/collection/CollectionRollupTab.tsx — opens the window; one full-width column; old pane, phone overlay and Escape listener removed
- src/components/collection/InstanceDetailPanel.tsx — deleted (its only importer was the rollup tab; it had no test file)
- src/components/DeckPickerPopover.tsx, src/app/api/allocation/valid-decks/route.ts — comment wording only
- src/components/collection/CollectionRollupTab.test.tsx — two new tests (existing ones unchanged)
- src/components/manabox-import/ImportModalLayout.test.tsx — removed `collection/CollectionRollupTab` from the list of files that must contain the shared backdrop token; that file no longer draws its own overlay (the shared dialog does)
- docs/oracle/reports/evidence/card-details-modal-slice-2/ — screenshots, capture.mjs, harness page

## Contradictions between the spec and the codebase
1. Slice 1 was deck-only (loader, route and window keyed by a deck slot); added a collection loader and route plus a shared shell.
2. No route wrote a copy's condition (only imports did). One small new route was needed.
3. Stored condition words are near_mint, lightly_played… not NM, LP…; one two-way map in labels.ts. The deck Copies tab used to print the raw word and now prints NM/LP.
4. The old panel sent wrong field names to Unassign (`physicalCopyId`, route reads `copyId`) and Replace with original (`proxyPhysicalCopyId`/`originalPhysicalCopyId`, route reads `proxyCopyId`/`originalCopyId`); both answered 400. The new window sends the right names.
5. The old "decks waiting" list only appeared when demand exceeded owned copies, so the spec's "Sleeve free copy" row could never show. The new loader reads planned-but-unsleeved slots directly.
6. No existing route adds one original copy of one card (only imports and add-proxy). "Add a copy" is hidden in the header and the Printings rows.
7. "Add to a deck" does have a flow (valid-decks plus `POST /api/decks/[id]/cards`); reused.
8. Storage of a copy that is in a deck cannot be changed (route answers 409). Those rows show the place as text.
9. Proxies have no condition ("–"), as in the sample.
10. The app says "Unassign", not "Release", in every screen; `vocabulary.md` has no "release". Menu keeps "Unassign".
11. The app's collection value counts originals only; the sample screen's $7.80 included the Proxy.
12. The Collection page had a permanent 560px right pane and a phone overlay; both are gone.
13. ImportModalLayout test #10 required the rollup tab to contain the backdrop token (see changed files).

## InstanceDetailPanel carry-over
| Old behaviour | Now |
|---|---|
| Header, close | Window header, "Close card details" |
| Load instances, skeleton, error, empty | New details route; skeleton; error with Try again; Copies empty line "You don't own a copy of this card (Unowned)." |
| "In decks" / "In storage" sections | One table, "Assigned to" column |
| Per-copy checkbox (isInstanceSelected / onToggleInstance) | Copies tab checkbox, same two props; plus select-all |
| Thumbnail hover preview | Hovering a row swaps the picture in the rail (floating preview not carried) |
| Deck link | Assigned to cell link |
| Storage select (not in a deck) | Stored in select (Open copies); text for in-deck copies (flag 5) |
| Set, number, Proxy and Foil badges | Printing cell, swatch, "foil", "proxy" |
| Condition (loaded, never shown) | Condition select, saves on change |
| Reassign via deck picker | Row menu "Move to a deck" (flag 6) |
| Replace with original | "Replace with original" on in-deck Proxies, same location picker |
| Kebab Unassign (+ storage move, soft-fail toast) | Row menu Unassign, same two calls and picker, Playable warning first |
| Kebab Delete with confirm | Row menu Delete with inline confirm (adds Playable warning) |
| Kebab Add proxy | Copies toolbar "Add a proxy" (flag 8) |
| Short rows: deck link, "No card" | "Decks waiting for it" |
| Claim from another deck dropdown | Not a button (flag 7); use "Move to a deck" on that copy or "Move here" in the deck window |
| Add proxy picker of printed proxies | "Add proxy" uses an Open proxy first (Sleeve free copy), else makes one (flag 7) |
| "Sleeve from built deck?" confirmation | Dead code in the old panel (never opened); not carried |
| Deck status pill | Deck state word |
| Query refreshes | One refresh helper (window, collection, instances, storage, decks, picklist, allocation) |
| Escape closes | Dialog handles it |
| Phone full-screen overlay | Full-screen window |
| Toasts | Kept, convention words |

## Flags for the owner
1. Condition needed one new small write route (writes only the existing condition column; refuses Proxies and Missing copies). No migration.
2. "Add a copy" is hidden (nothing to reuse).
3. Menu says "Unassign", not "Release" (one word in labels.ts).
4. Unassign and Replace with original were broken in the old panel and now work.
5. Stored in is read-only for a copy in a deck; the row says to unassign it first.
6. "Move to a deck" lists only decks that have this card planned. "Add to a deck" in the header covers decks without a slot.
7. The "Claim from another deck" button and the printed-proxies picker are replaced (see table).
8. "Add a proxy" kept in the Copies toolbar although the spec does not list it.
9. Collection value counts originals only ($6.90 in tests vs the sample's all-copies sum).
10. The Collection list loses its permanent right pane.
11. The bulk action bar sits behind the open window. Ticking copies in the window selects them immediately (and "N selected" shows), and the bar works the same once the window is closed; the selection stays after closing. Only reachability while the window is open differs.
12. Hollow swatch rows say "Open" (convention status word), not "Unassigned".
13. "Add to a deck" keeps the window open and refreshes (so the new waiting deck appears); the plan said close.
14. Playwright e2e cannot run (no isolated login). Screenshots come from a headless browser on a temporary fixture page (removed), with every request answered by fixtures. No request reached hosted data.

## New decisions made (need owner confirmation)
Flags 2, 3, 6, 8, 12, 13.

## Assumptions
- "You own N" counts every copy that is not Missing, Proxies included.
- Cheapest is the lowest non-foil price across printings.

## Challenges to locked decisions
none

## Open questions
- Should the bulk action bar be reachable while the window is open (needs a different layout)?

## Verification
- `npm test` — 4419 passed, 1 failed (known ImportIntentFlow)
- `npm run typecheck` — 4 errors, all known AddToPicklist.test.tsx
- `npm run lint` — 1 error (known PicklistV2), 0 new; new files clean
- New tests: CollectionCardDetails.test.tsx (27), collection-copies, load-collection, labels, details route, condition route, two in CollectionRollupTab.test.tsx. Deck-context tests pass unedited.
- `node capture.mjs` at 1280 and 390 — all checks passed: window 1080 by 600, tabs scroll inside, 390 full screen, condition shows Saving then Saved, ticking shows "1 selected", Playable warning shows, focus returns to opener, no console errors, text contrast 6.4:1 or better, swatch colours checked against the dark panel. Failed-save and retry paths are covered by the unit tests, not the screenshots.
- Screenshots: docs/oracle/reports/evidence/card-details-modal-slice-2/ (1280 and 390: overview, printings, copies, rulings, saving, Playable warning)
- Real data: nothing changed, so nothing to restore. Main app on localhost:3000 was not touched.

## 5-minute test (a card you own several copies of, for example Sol Ring)
Needs this branch running. 1. Collection page, click Sol Ring: window opens; "You own N" matches your count. 2. Overview: each copy shows place and state; any deck planning Sol Ring shows a button. 3. Copies tab: change one Open copy's condition and see Saving then Saved; change it back. 4. Change its storage place and back. 5. Tick two copies: "2 selected"; close the window; the bar at the bottom shows 2 and Clear works. 6. Open the menu on a copy in a Playable deck and choose Unassign: the Assembling warning shows first; Cancel. 7. Delete: it asks first; Cancel. 8. Press Escape: focus returns to the Sol Ring row.
