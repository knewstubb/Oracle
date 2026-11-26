# Oracle feature inventory

Audit date: 2026-11-22 (code read on `main`, last commit 2026-11-26; pieces gathered 2026-11-22 to 2026-11-26). The audit itself removed nothing. Updated 2026-11-22 after the clean-up on branch `audit-cleanup` (not yet merged): rows marked REMOVED keep their text for one release; rows marked BUILT not merged are finished on that branch.
Companion report: `docs/oracle/reports/2026-11-22-gene-full-app-audit.md` (removal candidates RC-01 and up, started-and-left list, decisions drift).

## How to keep this up to date

- Gene updates the row whenever a feature is merged, switched on or off, paused, replaced or removed. One row per user-visible feature or route.
- When a slice is finished, change STATE and the "Notes and code agree" cell in the same task. Do not leave a note saying "not built" for something that is.
- When a removal candidate (RC-xx) is done, mark the row REMOVED with the date and keep the row for one release so readers can see it went.
- A new top-level page or API folder in `src/app` needs a row before its slice closes.
- Re-run the checks in the report's Verification section (unused-file scan, "no caller" route search) at each phase close-out and compare with this table.

## State key

| State | Meaning |
|---|---|
| LIVE and used | Reachable by a click or by Claude, and in use |
| LIVE but hidden behind a switch | Works, but only when a setting or shortcut is on |
| BUILT not merged | Finished on a branch that is not in `main`. At the audit none were found; since the clean-up, the rows marked BUILT not merged and REMOVED live only on branch `audit-cleanup` |
| REMOVED | Code deleted; row kept for one release so readers can see it went |
| HALF-BUILT | Started; part works, part missing or not wired |
| SUPERSEDED | Replaced by something newer; the old code is still there |
| ABANDONED | Started and left; the owner decided against it or nobody finished it |
| DEAD CODE | Nothing calls or mounts it |
| NOT BUILT | Extra label (not in the brief). Planned or approved in the notes; no code |

Evidence tags: `[Confirmed: path]` means a file was opened or a search was run. `[Approximate]` means inferred. RC-xx points to the removal candidate in the report.

## Inventory

| # | Feature | Plain-words description | Where the user reaches it | STATE | Evidence | Notes that describe it | Notes and code agree? |
|---|---|---|---|---|---|---|---|
| 1 | **Collection: main screen** | Grid of owned cards with search, sort, colour filter, basic-lands toggle, Proxies toggle, 50 per page | Top bar "Collection" (`/collection`) | LIVE and used | [Confirmed: src/app/collection/page.tsx] | backlog-details T-32/T-33 | Yes |
| 2 | Collection: list view | One row per printing, 100 per page | Collection toolbar toggle | LIVE and used | [Confirmed: src/components/collection/PrintingListView.tsx] | T-32 | Yes |
| 3 | Collection: Tags filter | Filter by 40 card Tags, "all of / any of" | Collection, "Tags" button | LIVE and used | [Confirmed: src/app/collection/page.tsx, src/lib/collection-tag-filter.ts] | reports/2026-11-20-developer-card-tags-display.md; backlog.md RQ-12 | No: backlog says RQ-12 "not built"; the display half is merged |
| 4 | Collection: status filter chips | Chips for Original / Proxy and so on | Collection toolbar | BUILT not merged 2026-11-22 (status chips now filter the cards; branch `audit-cleanup`) | [Confirmed: src/app/collection/page.tsx keeps `activeStatuses` but never passes it to the data hooks] | owner-checklist C-16 Fail; backlog.md "check filters really change results" | Yes (unresolved). The control shows and does nothing |
| 5 | Collection: value in header | "N owned, $X value" in the page header | Collection header | LIVE and used | [Confirmed: src/app/collection/page.tsx:263-282, api/collection/value] | T-51 PARKED; checklist C-03/C-04 Fail | No: merged 2026-10-20; notes still say parked or failed |
| 6 | Collection: value banner component | Old banner that showed collection value | Nothing mounts it | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: src/components/collection/CollectionValueBanner.tsx, only a test imports it] RC-31 | T-51 | No: replaced by the header number |
| 7 | Collection: "Prices are out of date" + Refresh Prices | Warning and button when prices are over 48 h old | Collection grid | LIVE and used | [Confirmed: src/components/collection/PriceStaleIndicator.tsx] | D-042 | Yes. List view never shows it |
| 8 | Collection: export CSV | Download the collection | Collection header | LIVE and used | [Confirmed: CollectionExportButton.tsx, api/collection/export] | none | Notes silent |
| 9 | Collection: expand a tile to see printings | Click a tile to expand its printings | Collection grid | LIVE and used | [Confirmed: CollectionGridView.tsx:198] | UX-02 | No: UX-02 wants a card window from here |
| 10 | Collection: location switcher, locations column, edit quantities (UX-01, UX-12, UX-15) | Planned controls | n/a | NOT BUILT | [Confirmed: absent from CollectionToolbar.tsx, PrintingListView.tsx] | UX-01/12/15 TODO | Yes |
| 11 | **Card Management screen** | Two-pane list of every card with owned / proxy / used / short counts and bulk select | Tools > "Card Management" (`/allocation`; old `/shared-cards` redirects) | LIVE and used | [Confirmed: src/app/allocation/page.tsx, next.config.ts] | specs/card-management-system-overview.md; roadmap exit test "one collection place" | No: two overlapping collection screens remain; no note says which wins |
| 12 | Card window for a collection card | Overview, Copies, Printings, Rulings; change condition, add proxy, delete copy, assign box | Card Management > click a card. Not reachable from Collection | LIVE and used | [Confirmed: CollectionCardDetails.tsx mounted only in CollectionRollupTab.tsx:195] | UX-02 TODO; reports 2026-11-20 card-details-modal | No: window is built; UX-02 reads as not started |
| 13 | Bulk actions (set box, delete many) | Select many copies and act | Card Management bottom bar | LIVE and used | [Confirmed: BulkActionBar.tsx; routes instances/bulk-assign, delete] | T-06/T-07 PARKED | No: implemented and used |
| 14 | Two collection data feeds | Older paged rollup and rollup-v2 | Behind rows 1 and 11 | LIVE and used | [Confirmed: api/collection/rollup, rollup-v2] | contracts/data-separation.md | Notes silent |
| 15 | Boxes: Binders page | List of boxes with counts; Unsorted, In your hand, Missing tiles; add, rename, recolour, delete | Tools > "Binders" (`/storage`) | LIVE and used | [Confirmed: src/app/storage/page.tsx] | specs/know-where-cards-are.md | Yes. Menu says "Binders", notes say "box" |
| 16 | Boxes: box page and Unsorted | Cards in a box; move to deck, release | Binders > a box (`/storage/[locationId]`) | LIVE and used | [Confirmed: src/app/storage/[locationId]/page.tsx] | same | Yes |
| 17 | Boxes: In your hand page | Cards you are holding | Binders tile (`/storage/in-hand`) | LIVE and used | [Confirmed: src/app/storage/in-hand/page.tsx] | spec §5 | Yes. Not in decisions.md |
| 18 | Boxes: Missing page | "Can't find it", "Turned up", where to look next | Binders tile (`/storage/missing`) | LIVE and used | [Confirmed: src/app/storage/missing/page.tsx] | D-028 says Missing retired; contract §9 reverses it | No: decisions.md never amended |
| 19 | Boxes: trade place flag | Box that Claude leaves out of searches | No screen sets it | HALF-BUILT | [Confirmed: collection-query.ts reads `is_trade`; draft 20261118130000 unapplied] | CC-25 "PROPOSED" | No: Claude half is built, database half is a draft |
| 20 | **Picklist: all-decks page** | Every planned card grouped by where the copy is; Picked / Placed ticks, Undo, Cancel | Tools > "Picklist" (`/picklist`) | LIVE and used | [Confirmed: src/app/picklist/page.tsx, AllDecksPicklist.tsx] | reports/2026-11-18-developer-picklist-simplification.md | Yes |
| 21 | Picklist: deck tab | Planned cards for one deck | Deck page, Picklist tab | LIVE and used | [Confirmed: PicklistV2.tsx] | D-033 | Yes |
| 22 | Picklist: Add to Picklist / Add all | Send cards from Unsorted or an import result | Unsorted box; import result | LIVE and used | [Confirmed: AddToPicklist.tsx] | spec §7 | Yes. Maybe redundant since every planned card now shows |
| 23 | Picklist run by Claude (CC-16) | Claude builds and ticks Picklists, makes boxes | n/a | NOT BUILT | [Confirmed: draft SQL only] | CC-16 approved 2026-11-17 | Yes. Nothing moved since 2026-11-17 |
| 24 | **Search: top-bar card search** | Type a name, see Scryfall cards with an owned badge | Top bar search box | LIVE and used | [Confirmed: SmartSearch.tsx, api/ai/search (no AI call)] | none | Notes silent |
| 25 | Search: ⌘K shortcut | Shortcut the search box advertises | Nowhere | Hint on the search box removed 2026-11-22 (branch `audit-cleanup`); shortcut itself still DEAD CODE | [Confirmed: only handler is in unmounted Sidebar.tsx:104] RC-06 | none | No: the hint promises a shortcut that does nothing |
| 26 | Search: "Where is my card?" overlay | Which decks hold a card | Hidden shortcut ⌘⇧K | LIVE but hidden behind a switch | [Confirmed: CardLocator.tsx:66] | reports/2026-11-11-architect-daily-use-audit.md | Notes silent on discoverability |
| 27 | Search: add card to deck by name | Search box in a deck | Deck, add card | LIVE and used | [Confirmed: AddCardSearch.tsx, api/cards/search] | C-07 | Yes. `/api/cards/search` works without sign-in (see report) |
| 28 | Search: Claude collection search | Rules text, Legendary, subtype, mana value, Tags, rarity, trade-place exclusion | Claude | LIVE and used | [Confirmed: connector/tools/search-collection.ts] | CC-07, CC-14 "build started" | No: built and merged; backfill script waits for approval |
| 29 | **Buying list** | What decks are missing, with estimate prices | Claude only; no screen | LIVE and used | [Confirmed: connector/tools/get-buying-list.ts] | CC-18, CC-19 | Yes. Never tried in a real Claude chat |
| 30 | Wishlist | Cards you want to buy | None (an inert tick on the old import screen) | NOT BUILT | [Confirmed: draft 20261117200400 unapplied; route "deliberately inert"] RC-52 | CC-18 | Yes |
| 31 | **Proxies: add proxy to a slot** | Make a proxy for a deck slot | Status popover, Picklist, card window | LIVE and used | [Confirmed: api/allocation/add-proxy] | D-026, D-038, T-49 | Yes |
| 32 | Proxies: add proxy for unowned card | Same, for a card you do not own | same buttons | LIVE and used | [Confirmed: git c1add89, api/collection/instances/add-proxy] | T-52 PARKED; checklist C-01/C-02 Fail | No: merged 2026-10-20; needs one owner click-through |
| 33 | Proxies: replace proxy with original | Swap in a free original | Status popover, card window | LIVE and used | [Confirmed: api/allocation/replace-with-original] | none | Yes |
| 34 | Proxies: "Use proxies" switch and "Unowned cards" deck state | Global toggle, new deck state | Nowhere | NOT BUILT | [Confirmed: no `useProxies` in src] | D-059 locked | Yes (backlog does not list it as work) |
| 35 | Proxies: free-proxies lookup | List of free proxies for a card | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: no caller of api/collection/instances/free-proxies] RC-18 | none | n/a |
| 36 | **Sleeve / assign / move here / reassign** | Put a copy into a slot, take from another deck, move | Status popover, Picklist, card window, box page | LIVE and used | [Confirmed: api/allocation/assign, claim-from-deck, reassign-to-deck, MoveHereControl.tsx] | D-025 to D-034 | Yes. Words changed to In deck / Planned; decisions not amended |
| 37 | Auto-assign (fill every slot) | Old automatic allocation | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: no caller of api/allocation/resolve or api/decks/[id]/allocate] RC-16 | D-020, D-007 | Yes |
| 38 | Break down a deck | Release all copies, keep the list | No button | HALF-BUILT | [Confirmed: api/decks/[id]/breakdown, no caller] | O-010, D-029 | Yes |
| 39 | Reconcile page | Cards that more decks want than you own originals of | Tools > "Reconcile" (`/reconcile`) | LIVE and used | [Confirmed: src/app/reconcile/page.tsx, lib/reconcile-overuse.ts] | D-037 locked; T-37 PARKED | No: code uses the old rule D-037 replaced |
| 40 | Generic basic land +/- | Count controls for generic basics | Deck card list (direct save) | HALF-BUILT | [Confirmed: generic-count-queue.ts imported only by its test] RC-33 | backlog.md "finish controls for generic basic lands" | Yes |
| 41 | **Pricing: Refresh Prices** | Update prices from Scryfall | Collection warning button | LIVE and used | [Confirmed: api/collection/refresh-prices, lib/price-parsing.ts] | D-042, T-50 | Yes |
| 42 | Pricing: nightly cron | Daily job named refresh-prices | Vercel cron 06:00 UTC | HALF-BUILT | [Confirmed: api/cron/refresh-prices writes card text to ref_cards, never prices; vercel.json] RC-36 | D-042 | No: name says prices, job does not touch prices; likely not running |
| 43 | Pricing: Card Kingdom | Shop prices | Nowhere | ABANDONED | [Confirmed: only a comment remains] | D-040 removed; D-035 still says "deferred" | Yes (D-035 text stale) |
| 44 | **History and undo: Claude Recent changes** | 7-day Undo, pending approvals | Settings > Claude connector; header chip | LIVE and used | [Confirmed: RecentChangesTab.tsx, PendingChip.tsx] | D-034a, CC-03/04 | Yes |
| 45 | History: Claude changes on a deck | History panel, "moved" note, live banner | Deck menu > History | LIVE and used | [Confirmed: DeckClaudeChanges.tsx, MovedSlotNote.tsx, LiveChangeNote.tsx] | CC-04d | Yes |
| 46 | History: deck version history and restore | Restore an earlier deck list | Deck menu > History | LIVE and used | [Confirmed: VersionHistoryPanel.tsx, api/decks/[id]/versions] | DV-04 | Yes |
| 47 | History: undo toast after move/sleeve | Undo right after the action | Toast | LIVE and used | [Confirmed: MoveHereControl.tsx:61] | D-034 | Yes |
| 48 | **Import: collection file** | Review screen, Original/Proxy, destination, add-only | Collection > Import | LIVE and used | [Confirmed: ManaBoxCollectionImportDialog.tsx, api/collection/import] | D-044..D-056, T-53..T-56 | No: T-58 shown "parked" but merged; T-59 to T-63 have no rows |
| 49 | Import: deck file or pasted list | Review with intent choice and commander picker | Library > Import deck | LIVE and used | [Confirmed: DeckImportButton.tsx, ManaBoxDeckImportFlow.tsx] | D-046..D-058 | Partly |
| 50 | Import: save "I built it / I'm planning it" | Scan-wins save that moves copies between decks | Same screen | LIVE but hidden behind a switch | [Confirmed: import-copy.ts:62; env NEXT_PUBLIC_IMPORT_INTENT_SAVE true locally; hosted value unknown] RC-46 | reports 2026-11-03/04 | No: backlog never mentions the switch |
| 51 | Import: deck links (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox) | Paste a link, opens same review | Import deck > link tab | LIVE and used | [Confirmed: url-parser.ts, external-deck-fetcher.ts] | import-cleanup brief | Partly. Retest of a failed stage never logged |
| 52 | Import: Precon tab | Pick a ready-made deck | Import deck > Precon | LIVE and used | [Confirmed: api/precons, scripts/sync-precons.ts] hosted list loaded: could not verify | brief P1 | No: brief says needs approval; built and applied |
| 53 | Import: destination picker, Add all to Picklist | Send result to box, deck, Unsorted | Import dialogs | LIVE and used | [Confirmed: api/import/destinations] | I2 notes | Yes |
| 54 | Import: row editing, generic basics, printings | Fix rows before saving | Inside review | LIVE and used | [Confirmed: ImportRowEditor.tsx] | contracts/import-row-editing.md | Yes |
| 55 | Import: old three-choice screen after a link | "New cards / built / theorycrafted" | Nowhere (can never show) | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: DeckImportButton.tsx `previewData` only set to null] RC-27 | import-cleanup slice 6 | Yes (brief expected deletion) |
| 56 | Import: legacy server modes (new_cards, built) | Old deck import paths | Nothing calls them | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: api/decks/import/route.ts, deck-import.ts] RC-27 | brief slice 6 | Yes |
| 57 | **Import: old onboarding importer** "Bring your collection over" | Archidekt/Moxfield account import with Brew/Active and conflict screen | Home page, only when the account has no decks (`/onboarding`) | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: src/app/page.tsx:207, src/app/onboarding/page.tsx 1,407 lines, 12 api/onboarding routes] RC-26 | import-cleanup slice 7; T-22/T-24/T-35 shown DONE | No: brief says retire, backlog-details lists as done |
| 58 | Import: old collection modes add/sync/upsert/replace | API-only modes, no screen | Nothing in screens | SUPERSEDED | [Confirmed: dialog always sends mode=manabox] RC-28 | brief Q3 | Partly |
| 59 | Import: import alerts per deck | Warnings from import | No screen | HALF-BUILT | [Confirmed: api/decks/[id]/import-alerts no caller] RC-20 | contracts/import-intent.md | Yes |
| 60 | Identifier resolution | Printing vs card, finish, set + number | Behind every import | LIVE and used | [Confirmed: identity-resolver.ts, manabox-resolver.ts] | D-003, D-021 | Yes |
| 61 | Archidekt reading | Read public decks and collections | Link tab, onboarding | LIVE and used | [Confirmed: archidekt-client.ts] | T-13 | Yes |
| 62 | Archidekt writing back (push, create deck, write tags) | Send a deck to Archidekt | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was ABANDONED) | [Confirmed: three routes answer 501 / no caller; PushToArchidekt.tsx unmounted] RC-15 | none | Yes |
| 63 | Moxfield reading | Deck by link | Link tab, onboarding | LIVE and used | [Confirmed: moxfield-client.ts] | O-001 "needs curl test" | No: O-001 stale |
| 64 | Scryfall live lookups and bulk data refresh | Commander search, printings, "Refresh card data" | New deck, Settings | LIVE and used | [Confirmed: card-data-sync.ts, CardDataSection.tsx] | reports/2026-10-20-developer-card-data-refresh.md | No: no backlog row |
| 65 | Scryfall bulk-file cache | Local file download | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: scryfall-bulk-cache.ts no importer] RC-29 | none | n/a |
| 66 | EDHREC data for Deck health targets | Typical numbers per commander | Deck health in left rail | LIVE and used | [Confirmed: edhrec-client.ts, commander-targets.ts] | briefs/categories-drive-deck-health.md | Yes |
| 67 | EDHREC top cards and Commander Spellbook tools for chat | Chat-only lookups | Paused chat | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch) | [Confirmed: tool-registry.ts] | D-063; two known Spellbook bugs | Yes |
| 68 | Third-party mtg-mcp-server client | Starts an outside program for EDHREC data | Three unused AI routes | ABANDONED (client file kept: no live importer left, only tests mock it; follow-up) | [Confirmed: mcp-client.ts:92-94 starts `uvx`; routes no caller] RC-13 | ai-recommendations-assessment-2026-09.md | No backlog row |
| 69 | **Auth: email login** | Sign in, sign out, return to page | `/login`, sign out | LIVE and used | [Confirmed: src/app/login, src/middleware.ts] | AGENTS.md | Yes. No sign-up or reset (blocks multi-user later) |
| 70 | Auth: login required on every route | 401 on all API routes | All | LIVE and used | [Confirmed: lib/auth.ts requireAuth] | CC-02/03 | Yes |
| 71 | Auth: open routes (card search, autocomplete) | Work without sign-in | Search boxes | LIVE and used | [Confirmed: middleware.ts:6] | none | Notes silent. Autocomplete has no caller (RC-18) |
| 72 | Auth: local auto sign-in | Dev only | Dev | LIVE and used | [Confirmed: local-auto-login.ts] | none | n/a |
| 73 | Auth: Claude sign-in (consent screen, `/oauth/consent`, discovery pages) | "Allow Claude?" screen | Claude connecting | LIVE and used | [Confirmed: src/app/oauth/consent, src/app/.well-known/*] | CC-04a, CC-05 | Mostly. 12-step click-through never recorded |
| 74 | **Settings page** | Card data, Claude connector link, developer tools | Avatar menu (`/settings`) | LIVE and used | [Confirmed: src/app/settings/page.tsx] | none | n/a |
| 75 | Settings: Clear All Data | Wipes decks, copies, cards, sessions | Settings | BUILT not merged 2026-11-22 (hidden unless the app runs on the owner's own computer; branch `audit-cleanup`) | [Confirmed: api/dev/reset returns 404 in production; list of tables incomplete] RC-37 | import-cleanup Q4; AGENTS rule 5 | No: brief assumes it works |
| 76 | Settings: component library (`/settings/components`) | Design reference page, 974 lines | Settings link | LIVE and used | [Confirmed: src/app/settings/components/page.tsx] | design-system.md | Yes. Keep or remove is taste |
| 77 | Settings: Claude connector page (`/settings/claude-connector`) | Connection, Recent changes, Setup guide tabs | Settings | LIVE and used | [Confirmed: page.tsx] | CC-04d | Yes |
| 78 | Settings: card data stale notice | "Data is out of date" warning | Nowhere | DEAD CODE | [Confirmed: CardDataStaleNotice.tsx no importer] RC-35 | report 2026-10-20 | Built, never mounted |
| 79 | **Deck library** (`/`) | Deck tiles grouped by readiness or saved order | Top bar "Decks" | LIVE and used | [Confirmed: src/app/page.tsx, DeckTile.tsx] | UX-03/05/09; D-002, D-059 | No: tiles say Brewing/Assembling/Playable, neither D-002 nor D-059 |
| 80 | Library: rename a deck | Click the name | Tile, deck page | LIVE and used | [Confirmed: InlineNameField.tsx] | UX-05 | Yes |
| 81 | Library: drag to reorder | Tile order saved | Library | LIVE and used | [Confirmed: useSaveDeckOrder.ts, migration 20261122120000] | UX-03 | Yes. Polish not built |
| 82 | Library: folders (create, filter, move a deck) | Folder chips | Library | LIVE and used | [Confirmed: FolderChip.tsx, api/folders] | none | Notes silent |
| 83 | Library: rename or delete a folder | No button | Nowhere | HALF-BUILT | [Confirmed: api/folders/[id] no caller] RC-20 | none | n/a |
| 84 | Library: New Deck dialog | Format, then commander | Library "New deck" | LIVE and used | [Confirmed: NewDeckModal.tsx] | none | No spec for this dialog |
| 85 | Library: full-page commander picker (`/decks/new`) | Second way to start a deck | Tools > New Deck | LIVE and used | [Confirmed: src/app/decks/new/page.tsx] | none | Duplicate of row 84; its Back button goes to a missing `/decks` page |
| 86 | Library: "Help me find one" AI suggestions | AI commander ideas | New Deck dialog | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch) | [Confirmed: NewDeckModal.tsx:209] | DV-03, D-063 | Yes |
| 87 | Library: Explore page (`/explore`) | Browse commanders | Typed address or redirect only | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE and used) | [Confirmed: src/app/explore/page.tsx] | reports 2026-11-19 dv03 | No: report says "open Explore"; no menu link |
| 88 | Library: draft/brew tiles ("Continue brewing") | Resume an AI brew | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: DraftDeckTile.tsx, DraftSessionTile.tsx no importer] RC-09 | rename-draft-to-brewing report | n/a |
| 89 | Library: old left sidebar and phone header | Old navigation | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: Sidebar.tsx, MobileHeader.tsx unmounted; TopNav in layout] RC-06 | none | n/a |
| 90 | Library: delete a deck | Confirm dialog | Deck "..." menu | LIVE and used | [Confirmed: DeckMenu.tsx] | report 2026-11-17 | Yes |
| 91 | **Deck page** (`/decks/[id]`) | Rail, seven tabs, legality banner, History | Click a deck | LIVE and used | [Confirmed: src/app/decks/[id]/page.tsx] | DV-01 BUILT | No: briefs still say "Draft, nothing built"; UX-04/11/14 listed TODO |
| 92 | Deck: Cards tab | Cards by category, sort, bulk, status chips | First tab | LIVE and used | [Confirmed: CardsTab.tsx 2,088 lines] | T-06/T-07 PARKED | No: bulk route is live |
| 93 | Deck: Picklist tab | see row 21 | Second tab | LIVE and used | [Confirmed: PicklistV2.tsx] | D-033 | Yes |
| 94 | **Deck: Workbench tab** | Free-form canvas of cards | Third tab | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was HALF-BUILT) | [Confirmed: WorkbenchTab.tsx 240 lines] RC-24 | UX-13 only | Drag-to-category calls a missing route; positions not saved; no spec |
| 95 | **Deck: Workbench Curve view** | Cards in columns by mana value | Nothing on the deck page (toolbar hidden since 2026-08-19) | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was ABANDONED) | [Confirmed: WorkbenchTab.tsx:227-236 `showToolbar={false}`; DeckCanvas.tsx:387; commit f66a510] RC-01 | none | No note records the owner's "not useful" call; would show every card in column 0 |
| 96 | Deck: Workbench Piled view | Cards piled by category | Same | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was ABANDONED) | [Confirmed: DeckCanvas.tsx:391, PiledColumn.tsx] RC-02 | none | Same |
| 97 | **Deck: Analysis tab** | Ratings, mana curve chart, mana base, categories | Fourth tab | LIVE and used (trimmed 2026-11-22 on branch `audit-cleanup`: keeps Proxies, Attribute ratings, Mana base analysis, Category distribution, Colour coverage gaps) | [Confirmed: AnalysisTab.tsx 902 lines] | UX-13 queued | Overlaps the rail; ratings table filled by a script reading an old local file |
| 98 | Deck: Combos tab | Known combos in the deck | Fifth tab | HALF-BUILT (shows an "Out of date" label since 2026-11-22, branch `audit-cleanup`) | [Confirmed: CombosPanel.tsx; table deck_combos written only by old scripts] | backlog.md "combo notes" | Data frozen since July |
| 99 | **Deck: Upgrade tab** | Cut-X add-Y suggestions; Refresh wipes them | Sixth tab | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was HALF-BUILT) | [Confirmed: UpgradeTab.tsx; api/decks/[id]/upgrade/refresh/route.ts] RC-23 | D-036(a) | No: D-036(a) says keep old suggestions on failure; code deletes them |
| 100 | **Deck: Strategy tab** | Overview, build picker, guide, categories, notes | Seventh tab | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was HALF-BUILT) | [Confirmed: StrategyTab.tsx:412-441, 596-603] RC-21, RC-22 | D-062; HC-08 | "Sync to Archidekt" only shows a success message; "Add category" does nothing |
| 101 | Deck: EDHREC build selector | Pick a build (e.g. Zombies) | Tab bar right | LIVE and used (the second picker in the Strategy tab went with that tab; this header picker is the only one and has no other planned home yet) | [Confirmed: BuildSelector.tsx] | RQ-08 | Yes. A second picker sits in the Strategy tab |
| 102 | Deck: legality banner | Colour identity, banned, size | Under header | LIVE and used | [Confirmed: LegalityBanner.tsx] | none | Yes |
| 103 | Deck: command zone | Commander, partner, companion | Rail, Cards tab | LIVE and used | [Confirmed: CommandZoneSlots.tsx] | D-058 | Yes |
| 104 | Deck: old header (name, key cards, primer, ratings) | Replaced by the rail | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: PersistentHeader.tsx, DeckEditor.tsx unmounted] RC-04 | UX-04/UX-14 TODO | No: header gone, backlog still lists it |
| 105 | Deck: old footer health strip | Row of role pills at page bottom | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: HealthStrip.tsx unmounted] RC-03 | specs/whats-missing.md | No: spec describes a removed screen |
| 106 | Deck: old status controls | Manual Brew / Active picker | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: StatusControl.tsx, api/decks/[id]/status] RC-05 | D-059 | Yes |
| 107 | Deck: per-deck chat tab | Chat about one deck | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: DeckChatTab.tsx, useDeckChat.ts no importer] RC-08 | DV-03 "keep" | No: DV-03 assumes it can come back; nothing mounts it |
| 108 | Deck: dead-weight flag and Dismiss | "May be dead weight" mark | Cards tab hover | HALF-BUILT | [Confirmed: flags written only by scripts/detect-dead-weight.ts] | none | No backlog row |
| 109 | **Left rail: shell, commander, Cards box** | Sticky left panel | Deck page | LIVE and used | [Confirmed: deck-rail/DeckRail.tsx, RailCards.tsx] | DV-01 | Yes (brief headers stale) |
| 110 | Left rail: Strategy & bracket block | Bracket, summary, Edit | Rail | LIVE and used | [Confirmed: deck-strategy/StrategyBlock.tsx] | DV-02, D-062 | Yes |
| 111 | Left rail: Deck health tiles | Lands, Ramp, Card advantage, Removal, Wipes, Game plan; Light/Ok/Heavy | Rail | LIVE and used | [Confirmed: RailHealth.tsx, migration 20261121100000] | HC-01/02 PROPOSED | No: built; HC-03 to HC-08 not built |
| 112 | Left rail: Mana curve | Seven bars, click for colour split | Rail | LIVE and used | [Confirmed: RailCurve.tsx] | brief deck-rail-figma-redesign | Yes. The curve the owner designed |
| 113 | Left rail: Mana production | Sources, opening-hand odds | Rail | LIVE and used | [Confirmed: RailProduction.tsx] | report 2026-11-21 | Yes |
| 114 | Left rail: Mana by turn chart | 5,000 simulated games | Rail bottom | LIVE and used | [Confirmed: RailManaByTurn.tsx] | briefs/mana-by-turn-chart.md | No: no backlog or roadmap row |
| 115 | **Deck health (panel and gaps)** | Gap detail with buy and spare suggestions | Rail tiles | LIVE and used | [Confirmed: DeckHealthPanel.tsx, GapDetail.tsx] | D-061; HC-01 | See row 111 |
| 116 | Deck health: per-deck overrides and recheck | Old override store, recheck button | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: api/decks/[id]/health/overrides, recheck no caller] RC-19 | contracts/deck-health-phase2.md | Contract describes button never built |
| 117 | **Strategy window** | Bracket, summary, strategy text, playgroup, autosave, Claude rewrite | Rail > Edit | LIVE and used | [Confirmed: StrategyWindow.tsx, api/decks/[id]/strategy-window] | D-062, DV-02 | Yes. S3/S4/S5 database state not verified |
| 118 | Deck settings window | Strategy and Deck health tabs, autosave | Rail Edit links | LIVE and used | [Confirmed: DeckSettingsWindow.tsx] | POLISH-01 | Yes |
| 119 | Old strategy route | Older GET/PUT strategy | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: api/decks/[id]/strategy no caller] RC-19 | contracts/deck-strategy.md | Contract predates the window |
| 120 | **Categories: per-card categories** | Up to 5 per card, group-by, chips | Cards tab, card window | LIVE and used | [Confirmed: categoryUtils.ts, api/.../categories] | HC-02 PROPOSED | No: built |
| 121 | Categories: suggested on add/edit | Suggestions from Scryfall tags | Category popover | LIVE and used | [Confirmed: api/cards/suggest-categories] | briefs/suggested-categories.md "nothing built" | No: older version exists |
| 122 | Categories: management screen (rename, merge) | Across decks | Nowhere | NOT BUILT | [Confirmed: no route] | briefs/category-management.md draft | Yes |
| 123 | **Tags: card Tags and "Why this card is here"** | Read-only tags, Why line | Card window | LIVE and used | [Confirmed: lib/card-tags*.ts, migrations 20261120110000/120000] | RQ-12 "not built" | No: built; Keep flag not found |
| 124 | Card roles and deck jobs (CC-26) | Roles, jobs, strategy points | Nowhere | ABANDONED | [Confirmed: no code reads card_roles etc.] RC-44 | D-063 dropped; backlog-details "awaiting approval" | No |
| 125 | **Upgrade/suggestions engine (script)** | Makes the Upgrade tab data | Command line only | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was ABANDONED) | [Confirmed: scripts/generate-upgrade-data.ts reads old local SQLite; imports missing module] RC-23, RC-41 | roadmap-foundations-first.md says "functional" | No |
| 126 | Mana curve slider (O-003) | Target average mana value | n/a | NOT BUILT | none | O-003 | Yes |
| 127 | **Brewing: `/new-deck` page** | Chat plus canvas to brew with AI | Redirects to Explore unless switch on | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch) | [Confirmed: new-deck/layout.tsx, ai-chat-switch.ts] RC-14 | D-063, D-008..D-011 | Yes |
| 128 | Brewing: brew canvas and brew-v2 screens | Drag candidates, commit | `/new-deck` only | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch) | [Confirmed: 39 files, 7,051 lines] | T-08/T-09 PARKED | No: "parked" but built and mounted |
| 129 | Brewing: eight unmounted brew pieces | Old side panels | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: knip list] RC-07 | none | n/a |
| 130 | Brewing: v2 routes with callers (chat, skeleton, session, save) | Behind the page | `/new-deck` | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch) | [Confirmed: api/brew/*] | DV-03 | Yes |
| 131 | Brewing: v2 routes with no caller (commit, positions, assess, extract) | Never wired | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: grep no match] RC-10, RC-11 | none | n/a |
| 132 | Brewing: v1 routes `api/ai/brew/*` (7) | Older brew flow | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | [Confirmed: no caller] RC-12 | process.md "delete old in same task" | Not followed |
| 133 | Drafts: saved brew sessions | Draft list and delete | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: api/brew-sessions/[id] only caller unmounted] RC-09 | none | n/a |
| 134 | Post-game debrief | Review a game | Nowhere | ABANDONED | [Confirmed: removed in commit 30370f0, 2026-08-12; tables left] | O-004 | Yes |
| 135 | Goldfish playtest and Precon Mod Tracker | Solo test tab | Nowhere | ABANDONED | [Confirmed: same commit] | docs/user-guide.md still teaches goldfish | No: guide stale |
| 136 | Game logging and playgroup (CC-08) | Record games via Claude | n/a | NOT BUILT | none | brief approved 2026-11-16 | Yes |
| 137 | **Claude connector: `/mcp` endpoint and sign-in** | What Claude talks to | Claude app | LIVE and used | [Confirmed: src/app/mcp/route.ts, handle-request.ts] | CC-04, CC-05 | Yes |
| 138 | Claude tool: get_collection_summary | Collection counts | Claude | LIVE and used | [Confirmed: connector/tools/index.ts] | CC-07 | Yes |
| 139 | Claude tool: search_collection | Search owned cards | Claude | LIVE and used | [Confirmed: tools/search-collection.ts] | CC-07, CC-14 | Wording stale |
| 140 | Claude tool: list_decks | Decks with colours, format, status | Claude | LIVE and used | [Confirmed: tools/index.ts] | slice-a | Yes |
| 141 | Claude tool: get_deck | One deck with cards | Claude | LIVE and used | same | CC-06 | Yes |
| 142 | Claude tool: get_deck_health | Same six rows as the screen | Claude | LIVE and used | same | CC-06, D-061 | Yes |
| 143 | Claude tool: list_deck_cards_by_ownership | Proxy / not-owned cards | Claude | LIVE and used | same | slice-a | Yes |
| 144 | Claude tool: get_buying_list | Shopping list | Claude | LIVE and used | same | CC-18 | Yes. Not tried live |
| 145 | Claude tool: add_cards_to_deck | Add up to 120 Planned cards | Claude | LIVE and used | same | CC-13 | Yes |
| 146 | Claude tool: remove_cards_from_deck | Take cards off | Claude | LIVE and used | same | slice-b | Yes |
| 147 | Claude tool: set_card_zone | Main list or Maybeboard | Claude | LIVE and used | same | slice-b | Yes |
| 148 | Claude tool: set_card_category | Change categories | Claude | LIVE and used | same | CC-22 | Yes. Never tried live |
| 149 | Claude tool: create_deck | Empty deck | Claude | LIVE and used | same | CC-15 | Yes. Not checked in a real chat |
| 150 | Claude tool: set_deck_setup | Bracket, summary, strategy | Claude | LIVE and used | same | D-062 | Yes |
| 151 | Claude tool: set_card_why | "Why it's here" | Claude | LIVE and used | same | CC-26 slice 2 | Yes |
| 152 | Claude tool: add_card_to_collection | Add one copy | Claude | LIVE and used | same | slice-b | Yes |
| 153 | Claude tool: sleeve_free_copy | Sleeve a free copy | Claude | LIVE and used | same | slice-b | Yes |
| 154 | Claude tool: make_slot_original | Proxy to original | Claude | LIVE and used | same | slice-b | Yes |
| 155 | Claude tool: create_proxy_for_slot | Proxy for an empty slot | Claude | LIVE and used | same | slice-b | Yes |
| 156 | Claude tool: request_card_move | Move a copy between decks | Claude | LIVE and used | same | D-034a, CC-04b | No: notes say moves wait for approval; tool text says they go straight through |
| 157 | Claude tool: undo_change | Undo within 7 days | Claude | LIVE and used | same | slice-b | Yes |
| 158 | Claude tool: get_change_status | Pending / approved / declined | Claude | LIVE and used | same | slice-b | Yes |
| 159 | Claude tool: list_recent_changes | Last 7 days with reasons | Claude | LIVE and used | same | CC-04b | Yes |
| 160 | Claude tools not built: boxes and Picklist (CC-16), import (CC-17), wishlist (CC-18), games (CC-08) | Planned tools | n/a | NOT BUILT | [Confirmed: absent from tools/index.ts] | CC-16/17/18 | Yes |
| 161 | Claude: pending approvals, header chip, reasons, Recent changes | Approve or decline big edits | Header chip, settings | LIVE and used | [Confirmed: PendingChip.tsx, ClaudeReason.tsx] | CC-04b | Yes |
| 162 | **In-app chat (paused)**: side panel, sessions, proposals | Oracle chat about collection or deck | Hidden; switch off | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch) | [Confirmed: OracleSidebar.tsx, ai-chat-switch.ts] RC-14 | D-063 | Yes |
| 163 | In-app chat: OracleChat, OraclePromptCard | Full-page chat, prompt card | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: no importer] RC-08 | DV-03 "keep" | No: never mounted |
| 164 | In-app chat: provider layer (Claude, Gemini, DeepSeek), prompts, tool registry | Behind 11 guarded routes | Paused | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch) | [Confirmed: provider-factory.ts, adapters/*] RC-14 | D-063 | Yes |
| 165 | In-app chat: "Chat about this" in health strip | Hidden button | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: HealthStrip.tsx unmounted] RC-03 | DV-03 | n/a |
| 166 | AI routes with no caller (recommend, build-deck, mana-analysis) | EDHREC via outside program | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | [Confirmed: no caller] RC-13 | contracts/ai-audit-2026-09.md | n/a |
| 167 | **Scripts: live or recent** (sync:cards, commander sync, EDHREC builds, fill-card-tags, status check, validate resolver, dev-test) | Run by hand | Command line | LIVE and used | [Confirmed: scripts/*] | various | Yes |
| 168 | Scripts: July SQLite-to-Postgres pipeline and dropped-table scripts | One-time data move | Command line | ABANDONED | [Confirmed: target tables dropped; two import a missing module] RC-41 | none | n/a |
| 169 | Scripts: one-off fixes, audits, commander insight generators | Done jobs | Command line | ABANDONED | [Confirmed: input folder gone] RC-42 | none | n/a |
| 170 | **Cron**: Vercel daily job | see row 42 | vercel.json | HALF-BUILT | RC-36 | none | No |
| 171 | Cron: four GitHub workflows (E2E, smoke, commander sync, EDHREC sync) | Scheduled checks | GitHub | ABANDONED | [Confirmed: .github/workflows; switched off per T-43] RC-50 | T-43 | Yes. Live GitHub state not verifiable |
| 172 | Commander-context snapshot | Offline fallback for build data | Env flag only | ABANDONED | [Confirmed: default supabase; 34 MB file] RC-43 | vector trial closed | n/a |
| 173 | Old e2e browser tests | Playwright suite | Off | ABANDONED | [Confirmed: tests/e2e; E2E_ISOLATED needed] RC-50 | T-43/T-45 | Likely stale |
| 174 | **Page `/`** | Deck library | Top bar | LIVE and used | see row 79 | | |
| 175 | **Page `/decks/[id]`** | Deck page | Tile | LIVE and used | see row 91 | | |
| 176 | **Page `/decks/new`** | Commander picker | Tools menu | LIVE and used | see row 85 | | |
| 177 | **Page `/new-deck`** | AI brew | Redirects | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch) | see row 127 | | |
| 178 | **Page `/explore`** | Commander browser | Address only | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE and used) | see row 87 | | |
| 179 | **Page `/collection`** | Collection | Top bar | LIVE and used | see row 1 | | |
| 180 | **Page `/allocation`** | Card Management | Tools | LIVE and used | see row 11 | | |
| 181 | **Page `/picklist`** | All-decks Picklist | Tools | LIVE and used | see row 20 | | |
| 182 | **Page `/reconcile`** | Shortage view | Tools | LIVE and used | see row 39 | | |
| 183 | **Pages `/storage`, `/storage/[locationId]`, `/storage/in-hand`, `/storage/missing`** | Binders | Tools | LIVE and used | see rows 15 to 18 | | |
| 184 | **Page `/settings`, `/settings/claude-connector`, `/settings/components`** | Settings | Avatar menu | LIVE and used | see rows 74, 76, 77 | | |
| 185 | **Page `/login`, `/oauth/consent`, `/auth/callback`** | Sign-in | Direct | LIVE and used | see rows 69, 73 | | |
| 186 | **Page `/onboarding`** | Old importer | Home empty state | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED) | see row 57 | | |
| 187 | **Route `/mcp`, `/.well-known/oauth-protected-resource` (+`/mcp`)** | Claude endpoint | Claude | LIVE and used | see rows 73, 137 | | |
| 188 | **API folder `/api/ai`** (brew x7, build-deck, mana-analysis, recommend, search) | Search is live (no AI call); the rest have no caller | n/a | DEAD CODE (search: LIVE and used); some routes REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) | [Confirmed: grep] RC-12, RC-13 | | |
| 189 | **API folder `/api/allocation`** (add-proxy, assign, assign-free-copy, claim-from-deck, reassign-to-deck, replace-with-original, undo, valid-decks live; candidates, candidates/batch, resolve no caller) | Allocation actions | Popovers, Picklist | LIVE and used (3 routes DEAD CODE); some routes REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) | RC-16, RC-17 | | |
| 190 | **API folder `/api/archidekt`** | 501 stubs | Nowhere | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was DEAD CODE) | RC-15 | | |
| 191 | **API folder `/api/brew`, `/api/brew-sessions`** | see rows 130 to 133 | | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was LIVE but hidden behind a switch / DEAD CODE) | RC-10, RC-11 | | |
| 192 | **API folders `/api/card-data`, `/api/commander-summaries`, `/api/commanders`, `/api/import`, `/api/locations`, `/api/moves`, `/api/picklist`, `/api/precons`, `/api/printing-languages`, `/api/printings`, `/api/reconcile`, `/api/scryfall`, `/api/settings`, `/api/storage`, `/api/connector`, `/api/folders` (except `[id]`)** | Feature routes with callers | Screens | LIVE and used | [Confirmed: caller search] | | |
| 193 | **API folder `/api/cards`** | Live: base, locate, owned-printings, search, suggest-categories, update-printing, [name]/decks, names. Dead: autocomplete, builder-status | Search, card menus | LIVE and used (2 routes DEAD CODE); some routes REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) | RC-18 | | |
| 194 | **API folder `/api/collection`** | Live: rollup, rollup-v2, printings, value, export, refresh-prices, import, instances/*. Dead: base GET, instances/[oracleId] GET, allocation, stats, free-proxies | Collection, card window | LIVE and used (5 routes DEAD CODE); some routes REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) | RC-18 | | |
| 195 | **API folder `/api/cron`** | refresh-prices | Vercel cron | HALF-BUILT | RC-36 | | |
| 196 | **API folder `/api/decks`** | About 45 live routes; about 14 with no caller (allocate, breakdown, cards/batch, chat, dead-weight GET, health/overrides, health/recheck, import-alerts x2, mana, overview, push, status, strategy) | Deck screens | LIVE and used (14 routes DEAD CODE or HALF-BUILT); some routes REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) | RC-05, RC-08, RC-15, RC-16, RC-19, RC-20 | | |
| 197 | **API folder `/api/dev`** | reset | Settings | HALF-BUILT | RC-37 | | |
| 198 | **API folders `/api/onboarding`, `/api/oracle`** | Old importer routes (12); chat session routes | Old importer / paused chat | REMOVED 2026-11-22 (branch `audit-cleanup`, not yet merged) (was SUPERSEDED / LIVE but hidden behind a switch) | RC-26, RC-14 | | |
