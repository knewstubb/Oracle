# Audit: collection, storage and boxes, Picklist, search, buying list, proxies, pricing, history and undo

Role: read-only auditor (area agent). Branch `main`, last commit dated 2026-11-26. Nothing in the repo was changed except this file.
How the evidence was gathered: an import graph of every file under `src/` built in a temp folder (`/tmp/aud`, outside the repo) with the Next.js entry points (pages, routes, layouts) as roots; a caller search for every API route; a search for unused exports; then a read of the notes (backlog, backlog-details, decisions, roadmap, owner-checklist, specs, contracts, reports). No tests were run. Dates come from `git log` and the notes.

Terms used: **no caller** = no `fetch`/import in `src` outside tests and the route itself. **Tests-only** = the only importer is a test file.

Plain-words headline (for the owner):
- The area is mostly alive. The Picklist, boxes ("Binders"), Claude's Recent changes and Undo, the buying list (Claude only), Reconcile and Card Management all work from the menus.
- The clearest leftovers are a second collection screen (Card Management) that overlaps Collection, an old "auto-assign" path that no screen calls, a Collection status filter that does nothing, a value banner replaced by a number in the page header, and about 3,700 lines of old code with no caller (section 2).
- The backlog is out of date on at least 9 points in this area (flagged "DISAGREE" below). The biggest: Card Tags filter is built but the backlog says "not built"; the value banner and "proxy for an unowned card" fixes are merged but listed as parked; Missing is back in the app although decisions.md still says it is retired; Reconcile still uses the old rule that decision D-037 replaced.

---

## 1 Inventory table

State key: LIVE = LIVE and used; HIDDEN = LIVE but hidden behind a switch or shortcut; BNM = BUILT not merged; HALF = HALF-BUILT; SUPER = SUPERSEDED; ABAN = ABANDONED; DEAD = DEAD CODE; NB = not built (only planned in notes).
"Agree?" compares the notes with the code. DISAGREE rows are the ones to fix in the backlog.

### 1a Features

#### Collection

| ID | Feature (plain words) | Where the user reaches it | State | Evidence | Notes that describe it | Agree? |
|---|---|---|---|---|---|---|
| F-01 | **Collection screen**: grid of owned cards with search, sort, colour filter, "basic lands only", Proxies toggle, 50 per page, export and import buttons | Top bar "Collection" | LIVE | [Confirmed: src/app/collection/page.tsx; src/components/TopNav.tsx:42] | backlog.md "Collection"; backlog-details Phase 4, T-32/T-33 (DONE) | Agree |
| F-02 | **Collection list view**: one row per printing, 100 per page, switch from the toolbar | Collection > view toggle | LIVE | [Confirmed: src/components/collection/PrintingListView.tsx, src/hooks/useCollectionPrintings.ts] | backlog-details T-32 | Agree |
| F-03 | **Click a card on Collection to expand its printings** (not a card window) | Collection > click a tile | LIVE | [Confirmed: src/components/collection/CollectionGridView.tsx:198 onClick toggles expand] | UX-02 "click a card opens a modal" | See F-12 |
| F-04 | **Tags filter on Collection** (40 card Tags, "all of / any of") | Collection > "Tags" button at end of filter row | LIVE | [Confirmed: src/app/collection/page.tsx:344 CollectionTagFilter; src/lib/collection-tag-filter.ts] | reports/2026-11-20-developer-card-tags-display.md (DONE, with a 5-minute test); backlog.md "RQ-12 ... Not built" | **DISAGREE.** backlog.md and backlog-details say RQ-12 is not built and awaits approval. The "showing Tags" slice (Collection filter, Claude search by Tag) is merged. The editing/Why/Keep part is what is not built. |
| F-05 | **Status filter on Collection** (Original / Proxy / etc. chips in the toolbar) | Collection > toolbar | HALF | [Confirmed: src/app/collection/page.tsx:49,338 keeps `activeStatuses` but lines 157-192 never pass it to either data hook; no `status` handling in src/app/api/collection/rollup/route.ts or printings/route.ts] | owner-checklist C-16 "Fail ... status filter"; backlog-details O-007; backlog.md "check that filters really change results" (Parked) | Agree that it is unresolved. The notes call it "needs a fresh check". It is a confirmed no-op: the control shows, the results do not change. The old client-side filter functions that used to do this are unused (section 2, R-12). |
| F-06 | **Collection value in the page header** ("1,234 owned · $5,678 value") | Collection header line | LIVE | [Confirmed: src/app/collection/page.tsx:263-282; src/app/api/collection/value/route.ts] | T-50 DONE; T-51 "PARKED"; owner-checklist C-03/C-04 "Fail" | **DISAGREE.** T-51 was merged on 2026-10-20 (git `70147fe` "Merge t51-value-banner"). The banner was then replaced by the header number (code comment: "replaces the old value banner"). Checklist C-03/C-04 and backlog.md "Check the collection value banner" are stale. |
| F-07 | **Value banner component** | Nothing mounts it | SUPER | [Confirmed: src/components/collection/CollectionValueBanner.tsx has only a test importer] | T-51 | See R-04 |
| F-08 | **"Prices are out of date" warning with a Refresh Prices button** | Collection grid view, only when prices are over 48 hours old | LIVE (shows only when stale) | [Confirmed: src/components/collection/PriceStaleIndicator.tsx; page.tsx:299 `activeIsPriceStale && !isPrintingView`] | D-042 "Refresh Prices really refreshes" | Agree. Note: no always-visible refresh button; the list view never shows it. |
| F-09 | **Export collection (CSV)** | Collection header button | LIVE | [Confirmed: src/components/collection/CollectionExportButton.tsx; src/app/api/collection/export/route.ts] | Not mentioned in backlog | Notes silent |
| F-10 | **Import collection button** (ManaBox) | Collection header button | LIVE (owned by the import audit) | [Confirmed: src/components/collection/CollectionImportButton.tsx] | D-044, D-050 | Import agent covers |
| F-11 | **Card Management screen** ("Cards": two-pane list of every card with owned / proxy / used-in-decks / short counts, bulk selection) | Top bar > Tools > "Card Management"; old URL /shared-cards redirects here | LIVE | [Confirmed: src/app/allocation/page.tsx; src/components/TopNav.tsx:46; next.config.ts redirect] | specs/card-management-system-overview.md §4.2 and §9 ("Two screens for the same job"); roadmap Phase 4 exit test "no duplicate collection screens" | **Partly disagree.** Roadmap exit test says one collection place. Two screens still exist; the overview spec (2026-10-11) already flagged it. No backlog line says which one wins. See Open question Q-1. |
| F-12 | **Card window for a collection card** (Overview, Copies, Printings, Rulings tabs; change condition, add proxy, delete a copy, assign box, sleeve into deck) | Card Management > click a card. NOT reachable from Collection | LIVE | [Confirmed: src/components/card-details/CollectionCardDetails.tsx is mounted only in src/components/collection/CollectionRollupTab.tsx:195] | UX-02 "TODO — queued"; backlog.md Collection "Click a card to open an editing window" | **DISAGREE.** The window is built (card-details-modal slices 1-2, reports 2026-11-20). UX-02 and the backlog.md line read as not started. What is missing is opening it from Collection. |
| F-13 | **Bulk actions** (select many copies; set box; delete) | Card Management > bottom bar | LIVE | [Confirmed: src/components/collection/BulkActionBar.tsx mounted by CollectionRollupTab; routes instances/bulk-assign and instances/delete have callers] | T-06 "Spec the bulk actions" / T-07 "Implement bulk actions": PARKED (M4) | **DISAGREE.** Bulk actions are already implemented and used. T-06/T-07 read as not started. |
| F-14 | **Location switcher row** with "All cards" and "Proxies" (UX-01) | n/a | NB | [Confirmed: no such control in src/components/collection/CollectionToolbar.tsx] | UX-01 TODO, backlog.md "Collection" | Agree |
| F-15 | **Show where each card's copies are, on Collection** (UX-12) | n/a (the Copies tab in the Card Management window does show it) | NB | [Confirmed: no location column in PrintingListView or CollectionGridView] | UX-12 TODO | Agree |
| F-16 | **Edit card quantities** (UX-15) | n/a. The card window can add a proxy and delete a copy; nothing sets a count | NB | [Approximate: src/components/card-details/CollectionCopiesTab.tsx has add-proxy and delete only] | UX-15 TODO, scope unclear | Agree |
| F-17 | **Two collection data feeds**: older paged rollup (Collection) and rollup-v2 (Card Management, includes short counts) | behind F-01 and F-11 | LIVE | [Confirmed: src/app/api/collection/rollup/route.ts (416 lines) and rollup-v2/route.ts (via src/lib/allocation-rollup.ts)] | contracts/data-separation.md; T-05a | Notes silent. Follows from F-11. |

#### Storage and boxes

| ID | Feature | Where reached | State | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| F-20 | **Binders page**: list of boxes with card counts, three "system place" tiles (Unsorted, In your hand, Missing), "Manage" panel to add, rename, recolour, delete boxes | Top bar > Tools > "Binders" | LIVE | [Confirmed: src/app/storage/page.tsx; src/components/settings/storage-locations-settings.tsx] | specs/know-where-cards-are.md §3; reports 2026-11-16-developer-storage-box-empty / storage-page-freeze | Agree. The menu says "Binders"; specs and code say "box" and "storage". |
| F-21 | **Box page** (cards in a box, move to a deck, release, Unsorted variant at /storage/unsorted) | Binders > a box | LIVE | [Confirmed: src/app/storage/[locationId]/page.tsx (391 lines); routes storage/locations/[locationId], storage/unsorted] | know-where-cards-are.md | Agree |
| F-22 | **In your hand page** | Binders > "In your hand" tile | LIVE | [Confirmed: src/app/storage/in-hand/page.tsx -> SystemPlacePages] | know-where-cards-are spec §5 | Agree. Not in decisions.md (see D-4). |
| F-23 | **Missing page** (cards you could not find, "where to look next", "Turned up") | Binders > "Missing" tile; Picklist | LIVE | [Confirmed: src/app/storage/missing/page.tsx; src/app/api/moves/missing/[copyId]/turned-up] | contracts/know-where-cards-are.md §9 says D-028 is reversed with owner approval; decisions.md D-028 still says retired | **DISAGREE** with decisions.md and owner-checklist C-15 ("no Missing anywhere": Pass 2026-10-13, now untrue). |
| F-24 | **Choose a box when assigning** (location pickers) | Card window, bulk bar, box page | LIVE | [Confirmed: src/components/collection/StorageLocationSelect.tsx, src/components/LocationPickerModal.tsx] | | Agree |
| F-25 | **Trade place** (a box Claude leaves out of searches) | Nothing in the app marks one. Claude's search reads the flag | HALF | [Confirmed: src/lib/connector/tools/collection-query.ts reads `is_trade`; supabase/drafts/20261118130000_cc25_trade_locations.draft.sql is still a draft; no UI sets it] | CC-25 "PROPOSED; priority 3"; reports/2026-11-18-developer-cc25.md (BUILT, DB draft not applied) | **DISAGREE** on wording: backlog says "PROPOSED" and "new 2026-11-18"; the Claude half is built and tested. Without the database change nothing happens. |
| F-26 | **Claude creates boxes and moves copies** (CC-16) | n/a | NB | [Confirmed: no box tool in src/lib/connector/tools/index.ts; supabase/drafts/20261117200200_cc16_picklist_and_boxes.draft.sql unapplied] | CC-16 APPROVED 2026-11-17; backlog.md "Approved; planning underway" | Agree |

#### Picklist

| ID | Feature | Where reached | State | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| F-30 | **Deck Picklist tab** (planned cards grouped by box / other deck / unowned; Found it, Placed it, Can't find it, Proxy) | Inside a deck, Cards tab | LIVE | [Confirmed: src/components/PicklistV2.tsx mounted from src/app/decks/[id]/page.tsx:404 and CardsTab.tsx:826; route decks/[id]/picklist] | D-033; briefs/daily-use-deck-advisor.md; reports 2026-11-16-developer-picklist-* | Agree |
| F-31 | **All-decks Picklist page** (every planned card in every deck, grouped by where the copy is; Picked / Placed ticks, Undo, Cancel; "N of M placed") | Top bar > Tools > "Picklist" | LIVE | [Confirmed: src/app/picklist/page.tsx -> AllDecksPicklist; routes picklist, picklist/[action], moves/items/*] | reports/2026-11-18-developer-picklist-simplification.md (DONE); .agents/tasks/picklist-simplification-investigation.md | Agree. backlog.md "Try the recent Picklist ... changes" is a test item, not a build item. |
| F-32 | **Add to Picklist / Add all** (send cards from Unsorted or an import result to a box or deck) | Unsorted box page; import result screen | LIVE | [Confirmed: src/components/AddToPicklist.tsx used by src/app/storage/[locationId]/page.tsx and manabox-import/ImportWhereTheyWent.tsx; route moves/lists] | spec know-where-cards-are §7, owner decision 2026-11-16 | Agree. Since 2026-11-18 every planned card shows without being added; this button still serves cards that are not yet planned anywhere. Worth a look (Q-4). |
| F-33 | **Picklist tick history**: Undo a tick, Cancel a step, "I checked here" | Picklist rows | LIVE | [Confirmed: src/components/AllDecksPicklist.tsx:85,98; src/components/SystemPlacePages.tsx:161] | contracts/know-where-cards-are.md | Agree |
| F-34 | **Claude runs the Picklist** (CC-16) | n/a | NB (only DB draft) | [Confirmed: draft SQL only; no tool] | CC-16 | Agree |

#### Search

| ID | Feature | Where reached | State | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| F-40 | **Top bar "Search cards…"** (type a name, see Scryfall cards with an owned badge) | Top bar search box, phone icon | LIVE | [Confirmed: src/components/SmartSearch.tsx mounted in src/app/layout.tsx; calls /api/ai/search which has no AI-pause check] | none found in backlog | Notes silent |
| F-41 | **Keyboard shortcut ⌘K for that search** | The search box shows a "⌘K" hint | DEAD (the shortcut) | [Confirmed: the only ⌘K handler is in src/components/Sidebar.tsx:104, which no screen mounts; TopNav.tsx:114 only fires the event on click] | n/a | The on-screen hint promises a shortcut that does not work. |
| F-42 | **"Where is my card?" overlay** (which decks hold a card, own or proxy) | Hidden shortcut ⌘⇧K; no button | HIDDEN | [Confirmed: src/components/CardLocator.tsx:66 mounted in layout; route cards/locate] | reports/2026-11-11-architect-daily-use-audit.md §areas | Notes silent on discoverability |
| F-43 | **Add a card to a deck by name** | Deck > add card box | LIVE | [Confirmed: src/components/AddCardSearch.tsx; route cards/search] | C-07 Pass | Agree (decks agent owns) |
| F-44 | **Claude's collection search and counts** (text in rules, Legendary, subtype, mana value, Tags, sort, trade-place exclusion, rarity) | Claude (connector) | LIVE | [Confirmed: src/lib/connector/tools/search-collection.ts, rules-text-match.ts; reports/2026-11-18-developer-cc14-search.md Status DONE] | CC-07 DONE; backlog.md "Improve search by card text ... (Approved; build started.)" | **DISAGREE.** Built and merged. Only the one-off card-data backfill script for 100 missing cards still waits on owner approval. |
| F-45 | **Card details lookups from deck (printing picker, owned printings, hover preview printing)** | Deck card menus | LIVE | [Confirmed: routes cards/owned-printings, printings/search, cards/update-printing have callers] | T-48 | Agree (decks agent) |

#### Proxies

| ID | Feature | Where reached | State | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| F-50 | **Add proxy** for a deck slot (records the slot's printing and finish) | Deck card status popover; Picklist; card window | LIVE | [Confirmed: /api/allocation/add-proxy called from StatusChipPopover.tsx:263, PicklistV2.tsx:144, CollectionOverviewTab.tsx:52] | D-026, D-038, T-49 DONE | Agree |
| F-51 | **Add proxy for a card you do not own** | same buttons | LIVE | [Confirmed: git `c1add89` "Merge t52-proxy-unowned (owner approved 2026-10-20)"; src/app/api/collection/instances/add-proxy/route.ts] | T-52 "PARKED 2026-11-11"; checklist C-01/C-02 "Fail"; backlog.md "adding a proxy for an unowned card" under Parked | **DISAGREE.** Merged 2026-10-20. Needs one owner click-through to close C-01/C-02, not a build. |
| F-52 | **Replace a proxy with an original** | Status popover; card window | LIVE | [Confirmed: /api/allocation/replace-with-original callers] | | Agree |
| F-53 | **Proxies listed with originals in Collection ("Proxies" toggle)** | Collection toolbar | LIVE | [Confirmed: page.tsx includeProxies] | UX-01 asks for a "Proxies" location chip instead | Agree |
| F-54 | **"Use proxies" top-bar switch and "Unowned cards" deck state** | n/a | NB | [Confirmed: no `useProxies` anywhere in src] | D-059 "Not started" | Agree. roadmap.md still calls "Use what I own" the CURRENT slice (see D-5). |
| F-55 | **List of free proxies for a card** | nothing | DEAD | [Confirmed: src/app/api/collection/instances/free-proxies/route.ts, no caller anywhere] | n/a | See R-09 |

#### Allocation actions (Sleeve, Move, Release)

| ID | Feature | Where reached | State | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| F-60 | **Sleeve / assign a free copy, take from another deck, reassign** | Status popover, Picklist, card window, box page | LIVE | [Confirmed: /api/allocation/assign, assign-free-copy, claim-from-deck, reassign-to-deck, valid-decks callers listed in 1b] | D-025..D-033; contracts/card-state-actions.md | Agree |
| F-61 | **Move here (take a copy from its deck) with undo toast** | Gap detail, chat cards, Picklist | LIVE | [Confirmed: src/components/MoveHereControl.tsx; route allocation/undo] | D-034 | Agree |
| F-62 | **Auto-assign (fill every planned slot from free copies)** | nothing | SUPER / DEAD | [Confirmed: src/app/api/decks/[id]/allocate/route.ts and src/app/api/allocation/resolve/route.ts have no caller; lib/auto-assign.ts still used only by the old AI brew save route] | D-020 "import does not run an automatic allocation pass", D-007 resolver retired; resolve route header still says "Brew-stage decks ... Boxed or Archived" | See R-01 |
| F-63 | **Break down a deck (release all its copies)** | none: no on-screen button | HALF | [Confirmed: src/app/api/decks/[id]/breakdown/route.ts has no caller; src/components/StatusControl.tsx unmounted] | backlog-details O-010; backlog.md "Make 'Break down deck' available on screen" (Parked) | Agree |
| F-64 | **Reconcile page** (cards that more decks want than you own originals of) | Top bar > Tools > "Reconcile" | LIVE but old rule | [Confirmed: src/lib/reconcile-overuse.ts:5,65 skips proxy-filled slots and cards with no original; src/app/reconcile/page.tsx subtitle "Proxies are not counted"] | D-037 (locked 2026-10-10) says the opposite; T-37 PARKED; spec reconcile-original-shortages.md | **DISAGREE** (code vs locked decision). See D-1. backlog.md "Finish the original-copy shortage view" agrees it is unfinished. |
| F-65 | **Generic basic land +/- count with a delayed save** | none | HALF | [Confirmed: src/lib/generic-count-queue.ts (53 lines + test) is imported by nothing but its test; CardGroupSection.tsx:812,1433 posts straight to /generic-basics] | backlog.md "Finish controls for generic basic lands"; D-032 | Agree it is unfinished. The helper looks like an unused first attempt (R-13). |

#### Pricing

| ID | Feature | Where reached | State | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| F-70 | **Refresh Prices from Scryfall** (honest counts) | F-08 button | LIVE | [Confirmed: src/app/api/collection/refresh-prices/route.ts; src/lib/price-parsing.ts] | D-042, T-50 DONE | Agree |
| F-71 | **Nightly price refresh job** | Vercel cron in vercel.json (06:00 UTC) | HALF / misnamed | [Confirmed: src/app/api/cron/refresh-prices/route.ts upserts mana_cost and type data into ref_cards; it never writes prices; roadmap says no Vercel use for now] | D-042; roadmap "Local app ... no Vercel for now" | Notes silent. The name says prices, the code refreshes card text. Likely not running. |
| F-72 | **Card Kingdom prices** | n/a | removed | [Confirmed: only a note in refresh-prices/route.ts:9 and Claude's "not shop prices" line in get-buying-list.ts remain] | D-040 removed; D-035 still says "Card Kingdom deferred" | Agree with D-040; D-035 is obsolete (D-3) |
| F-73 | **Prices shown as estimates; unknown price shown as "—"** | Collection, card window, buying list | LIVE | [Confirmed: src/lib/collection-printing-utils.ts formatPrice; src/lib/price-store.ts] | D-035, T-50 | Agree |
| F-74 | **Buying list (what a deck is missing, with Scryfall estimate prices)** | Claude only (connector tool). No screen | LIVE (Claude side only) | [Confirmed: src/lib/connector/tools/get-buying-list.ts registered in tools/index.ts; reports/2026-11-17-gene-cc18-live-check.md 26/26] | CC-18, CC-19; backlog.md "Buying list built but not tried through Claude" | Agree |
| F-75 | **Wishlist** | none | NB (leftover flag) | [Confirmed: no wishlist screen; the import conflict card has a "Wishlist" tick that the route calls "deliberately inert": src/app/api/onboarding/reconciliation/instance/wishlist/route.ts; supabase/drafts/20261117200400_cc18_wishlist.draft.sql unapplied] | CC-18 "Wishlist NOT built"; backlog.md "wishlist not built" | Agree. The inert tick on an import screen is a loose end (Q-5). |
| F-76 | **Spare-copy and buy suggestions inside Deck health "gap" detail** | Deck health panel | LIVE (decks agent) | [Confirmed: src/components/GapDetail.tsx, src/lib/deck-health-buy.ts] | briefs/daily-use-deck-advisor.md | Decks agent |

#### History and undo

| ID | Feature | Where reached | State | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| F-80 | **Claude "Recent changes" with 7-day Undo, and pending approvals** | Settings > Claude connector; pending count chip in the page header | LIVE | [Confirmed: src/app/settings/claude-connector/page.tsx; src/components/connector/RecentChangesTab.tsx, PendingChip.tsx (mounted by PageHeader.tsx); routes connector/changes, changes/[id]/undo, pending] | D-034a; CC-03/CC-04 DONE | Agree. Note that the approve/decline routes are called with a built path (api.ts:165), so a plain search shows no caller; they do have one. |
| F-81 | **Claude changes shown on a deck's history** | Deck > Version history | LIVE | [Confirmed: src/components/connector/DeckClaudeChanges.tsx imported by VersionHistoryPanel.tsx] | CC-04d; slice-2 claude-reason-history | Agree |
| F-82 | **Undo of a move-here or sleeve** | toast after the action | LIVE | [Confirmed: MoveHereControl.tsx:61; card-details/CopiesTab.tsx:48] | D-034 | Agree |
| F-83 | **Moved-card note on the old deck's plan** | Deck card list | LIVE | [Confirmed: src/components/connector/MovedSlotNote.tsx used by CardGroupSection.tsx; route connector/moved-slots] | D-034a | Agree |
| F-84 | **In-app chat history and chat proposal Undo** | Oracle sidebar | HIDDEN | [Confirmed: src/components/SessionHistoryPanel.tsx only reached through OracleSidebar, mounted only when NEXT_PUBLIC_AI_CHAT_ENABLED=true (src/lib/ai-chat-switch.ts); .env.local has no such setting] | D-063 | AI agent covers |
| F-85 | **"Clear All Data" button** (wipes decks, collection copies, sessions for the signed-in user) | Settings page, with a confirm dialog | LIVE in dev only | [Confirmed: src/app/settings/page.tsx:25; src/app/api/dev/reset/route.ts returns 404 when NODE_ENV is production] | none; AGENTS.md rule 5 | Notes silent. See Q-3. |
| F-86 | **"Update card data" button and "last updated" note** | Settings | LIVE | [Confirmed: src/components/CardDataSection.tsx; route card-data/refresh] | reports/2026-10-20-developer-card-data-refresh.md | Stored-data agent |

### 1b Pages and API routes in this area

Callers were searched in `src` (not tests) and `tests/e2e`. "AI-only" = the only callers are the in-app chat or the old brew pages, which are hidden behind the chat switch.

| Route | Caller | State |
|---|---|---|
| PAGE /collection | Top bar | LIVE |
| PAGE /allocation (Card Management) | Tools menu; redirect from /shared-cards | LIVE |
| PAGE /picklist | Tools menu | LIVE |
| PAGE /storage, /storage/[locationId] (also /storage/unsorted), /storage/in-hand, /storage/missing | Tools menu "Binders", tiles | LIVE |
| PAGE /reconcile | Tools menu | LIVE |
| PAGE /settings/claude-connector | Settings | LIVE |
| PAGE /settings (Clear All Data, card data) | avatar menu | LIVE |
| PAGE /settings/components (974 lines, design-system browser) | link on Settings | LIVE (developer tool) |
| API allocation/add-proxy, assign, assign-free-copy, claim-from-deck, reassign-to-deck, replace-with-original, undo, valid-decks | StatusChipPopover, PicklistV2, MoveHereControl, card-details, storage page | LIVE |
| API allocation/candidates (GET) | none | DEAD (R-02) |
| API allocation/candidates/batch | tests only | DEAD (R-02) |
| API allocation/resolve | none | DEAD (R-01) |
| API decks/[id]/allocate | none | DEAD (R-01) |
| API decks/[id]/breakdown | none | HALF (F-63) |
| API decks/[id]/card-actions/[cardName], generic-basics, move-here, picklist | StatusChipPopover, PicklistV2, CardGroupSection, MoveHereControl | LIVE |
| API cards (base), cards/[name]/decks, locate, owned-printings, search, suggest-categories, update-printing | new-deck page / CardHoverPreview, CardPopover, CardLocator, CardGroupSection, AddCardSearch, CardsTab | LIVE |
| API cards/autocomplete | none (listed as a public route in src/middleware.ts) | DEAD (R-08) |
| API cards/builder-status | tests only | DEAD (R-03) |
| API cards/names | src/lib/auto-bracket-cards.ts, used only by in-app chat components | HIDDEN (AI-only) |
| API collection (GET list) | none | DEAD (R-05) |
| API collection/instances/[oracleId] (GET) | none (details and ids sub-routes have callers) | DEAD (R-05) |
| API collection/allocation | none (only named in a guard test) | DEAD (R-06) |
| API collection/stats | none | DEAD (R-07) |
| API collection/instances/free-proxies | none | DEAD (R-09) |
| API collection/rollup, rollup/[cardDefinitionId], rollup-v2, printings, value, export, refresh-prices, assign-location | collection page, card pages | LIVE |
| API collection/instances/add-proxy, bulk-assign, condition, delete, unassign, [oracleId]/details, [oracleId]/ids | card window, bulk bar, Card Management | LIVE |
| API collection/ownership-batch | OracleSidebar, brew-v2 chat components | HIDDEN (AI-only) |
| API collection/import, import/preview | ManaBox collection dialog | LIVE (import agent) |
| API connector/changes, changes/[id]/undo, changes/marker, enable, moved-slots, pending, pending/count, pending/[id]/approve, pending/[id]/decline, revoke, status | settings/claude-connector, PendingChip, deck pages | LIVE |
| API cron/refresh-prices | Vercel cron only, plus one e2e test | HALF (F-71) |
| API dev/reset | Settings page | LIVE (dev only) |
| API import/destinations | PicklistPlaces, import screens | LIVE |
| API locations/system | Binders page, system place pages | LIVE |
| API moves/lists, items/[id]/cancel, items/[id]/looked-here, items/[id]/undo, missing/[copyId]/turned-up | AddToPicklist, AllDecksPicklist, SystemPlacePages | LIVE |
| API picklist, picklist/[action] | AllDecksPicklist, picklist-tick-client | LIVE |
| API printing-languages, printings/search | import row editor, GenericArtPicker | LIVE |
| API reconcile/overused | Reconcile page | LIVE |
| API settings/storage-locations, [id]; storage/locations/[locationId], overview, unsorted | Binders and box pages, pickers | LIVE |

---

## 2 Removal candidates

Sizes are lines (code + its own tests). "Locked decision" = a decision or approved brief that mentions it. Every row is real evidence from the import graph or a caller search; none were deleted.

| ID | What | Size | Why it looks removable / what could break | Locked decision or brief? | Recommendation |
|---|---|---|---|---|---|
| R-01 | **Auto-assign path**: routes `api/allocation/resolve` and `api/decks/[id]/allocate`, plus the "all Brew-stage decks" function in `src/lib/auto-assign.ts` | 2 routes (27 + 49 lines); auto-assign.ts 179 lines | No screen calls either route. `auto-assign.ts` is also imported by `src/app/api/ai/brew/save/route.ts` (old in-app brew, hidden), so only the two routes and `autoAssignAllBrewDecks` can go now; `autoAssignDeck` goes only if the old brew route goes (AI agent's call). Comments still say "Brew-stage / Boxed / Archived", words D-029 retired. | D-020 (no automatic pass), D-007 (resolver retired as a write path). Both support removal. Contract allocation-suggestion-engine.md describes the engine, not these routes. | Remove now (routes + `autoAssignAllBrewDecks`); keep `autoAssignDeck` until the old brew route is decided |
| R-02 | **Candidate lookup routes** `api/allocation/candidates` (GET) and `api/allocation/candidates/batch` (+ its test) | 44 + 89 + 143 test | No `fetch` anywhere. The lookup itself (`src/lib/allocation-candidates.ts`, 514 lines) is live: Picklist, card actions and supply pool use it directly. Only the HTTP wrappers are unused. | contracts/allocation-suggestion-engine.md §"POST /api/allocation/candidates/batch" lists the batch route as part of the engine contract; T-04 report built it. No decision requires the routes to exist. | Confirm with owner (contract names them); safe to delete if the contract is amended |
| R-03 | **`api/cards/builder-status`** (+ test) | 102 + 83 test | No caller. Its header names `?cardNames=` for a brew-builder badge that was deleted ("BuilderStatusBadge.tsx deleted" in commit 2b2f046). | Mentioned in specs/vocabulary.md §10 as a place that must not say Unowned on failure; the route was patched in T-26 V3 and then never used. | Remove now |
| R-04 | **`CollectionValueBanner`** (+ test) | 163 + 102 test | Not mounted. Replaced by the number in the Collection header (page.tsx comment "replaces the old value banner"). The route it called (`collection/value`) is still used by the header. | T-51 report built it; owner-checklist C-03/C-04 describe the banner. D-042 only needs the refresh button, which lives in `PriceStaleIndicator`. | Remove now; then close C-03/C-04 against the header number |
| R-05 | **`api/collection` (GET list)** and **`api/collection/instances/[oracleId]` (GET)** | 62 + 268 | No caller. The card window uses the `/details` and `/ids` sub-routes of the second one. The `[oracleId]/route.ts` has "Requirements 10.x" header from the first Card Management build. | none found | Remove now (check `tests/e2e` once: grep found no use) |
| R-06 | **`api/collection/allocation`** (old allocation matrix) | 226 | No caller. Only a test (`src/lib/copy-availability.test.ts`) lists it among files that must carry the supply filter. Removing it needs one line edited in that test. | Overview spec §9 treats the "allocation matrix" as retired. No decision depends on it. | Remove now; edit the guard test list |
| R-07 | **`api/collection/stats`** (+ test) | 50 + 26 test | No caller. Was hardened for owner separation in CC-03a (reports/2026-11-16-developer-cc03a-owner-checks.md). | data-separation.md §5c lists it as a hardened route; deleting also removes a risk. | Remove now |
| R-08 | **`api/cards/autocomplete`** | 35 | No caller (only named in the public-routes list in `src/middleware.ts`). It is a public route that proxies Scryfall, so removing it also shrinks what is open without sign-in. | none | Remove now (also drop it from the middleware list) |
| R-09 | **`api/collection/instances/free-proxies`** | 116 | No caller anywhere. Last touched in the T-42 type clean-up (2026-10-11). Mentioned only in the Phase 2 daily-use audit. | none | Remove now |
| R-10 | **Unused screens/components in this area**: `Sidebar.tsx` (+ test), `MobileHeader.tsx`, `StatusControl.tsx` (+ test), `StatusFilter.tsx` (+ test), `StatusBadge.tsx`, `StatusSectionDivider.tsx`, `DeckStatusCard.tsx` | 272+133, 168, 128+99, 97+98, 49, 51, 116 = about 1,210 | Import graph: nothing mounts them (the top bar replaced the left sidebar). `Sidebar.tsx` is where the dead ⌘K handler lives (F-41). `StatusControl` is the old deck-status picker and the only caller of the break-down route. Deck-status words (Brewing / In Rotation) there are obsolete. | T-26 (vocabulary, parked) and the roadmap mention the sidebar; no decision requires these | Remove now, except decide F-41 first (move the ⌘K listener into the top bar or drop the "⌘K" hint). `StatusControl` removal also leaves `breakdown` route without any path: decide with O-010. |
| R-11 | **`src/lib/card-identity-store.ts` unused part** | 943 total; about 800 lines have no importer | Its only live import is `ensureCardDefinition` (from `import-engine-v2.ts`). `upsertPhysicalCopy`, `createPhysicalCopy`, `getCollectionRollup`, `getProxyRollup` and about 12 more exports have no importer. These use the old "physical copy / card definition" naming that D-001 replaced. | D-001 (user_cards/user_copies) | Remove now (keep `ensureCardDefinition`) |
| R-12 | **Old client-side collection filter functions** in `src/lib/collection-filters.ts` (`filterBySearch`, `filterByStatus`, `filterByColorIdentity`, `filterPrinting*`, `sortPrintingRows`) and unused helpers `isOverallocated`, `getTooltipContent`, `lookupPrice` in `collection-printing-utils.ts` | roughly 200 + 40 [Approximate] | Replaced by server-side filtering in T-32. The types and sort names in the same file are still used. | none | Remove now, but fix F-05 first (the status filter is the only reason a filter function might be wanted again) |
| R-13 | **`src/lib/generic-count-queue.ts`** (+ test) | 53 + 36 | Only its test imports it. Generic-land +/- never used it. | backlog.md "Finish controls for generic basic lands" (Parked); D-032 | Confirm with owner: it is the unfinished piece of that parked item. If the +/- control is built, use it; if not, delete |
| R-14 | **Unused vocabulary building blocks**: `components/vocabulary/CheckNotice, DeckStateBadge, FinishTag, PriceText, skeletons, index.ts` (+ tests) | about 530 + 250 test | T-26 "shared building blocks" was built in part on 2026-10-12/20 and then PARKED (2026-11-11). Only `SlotBadge`, `LoadingSpinner`, `MaterialSymbol` are used. | D-043 locks the words and colours in specs/vocabulary.md, which stays. The components are one way to apply them. | Confirm with owner: keep if T-26 will resume, otherwise delete |
| R-15 | **`api/cron/refresh-prices` and `vercel.json` cron entry** | 115 + 6 | Named as a price job but refreshes card text (mana cost, type) into ref_cards; real price refresh is `collection/refresh-prices`. Roadmap: no Vercel use for now. One e2e test hits it. | D-042 requires price refresh to be real and honest; this job is neither price nor active. | Confirm with owner (is the hosted app deployed at all?). If not, remove with its e2e line |
| R-16 | **Old Reconcile-adjacent and onboarding wishlist tick** (`WishlistCheckbox`, route `onboarding/reconciliation/instance/wishlist`, `setClaimWishlist`) | 40 + route + helper (about 100) | The route says it is "deliberately inert"; no screen reads a wishlist. Owned by the import audit; listed here because the wishlist feature belongs to this area. | CC-18 wishlist is approved but unbuilt; T-22 spec put the tick there | Confirm with owner (keep until the wishlist is built, or remove the tick) |
| R-17 | **Test-only helpers with no live use**: `lib/copy-availability.ts` (`isSupplyEligible`, `isSpare`) | 22 | The functions are used only by their test; the live code uses the `SUPPLY_ELIGIBLE_FILTER` constant. It imports a types file from `docs/oracle/contracts/`, so a source file depends on a docs file. | know-where-cards-are contract §6 | Keep for now; note the docs dependency (Q-6) |
| R-18 | **Mockups and specs of retired or built-out things in this area** | n/a | `mockups/reconcile-original-shortages.html` describes the unbuilt D-037 view (keep until T-37 is decided). `specs/card-management-system-overview.md` (2026-10-11, edited 2026-11-18) describes the sidebar nav, Missing as retired and Reconcile v1 as "today" and is out of date. `plans/01-03` still say "Implementation has not started" though Picklist, loading and vocabulary pieces are built. `contracts/allocation-resolver-validation-2026-09.md` plus `scripts/validate-allocation-resolver.ts` (273 lines) test the retired resolver. | D-007 | Confirm with owner: refresh or archive the overview and plans; script can go with R-01 |
| R-19 | **Local note**: checked-in test output and caches not in `.gitignore`? `test-results/`, `playwright-report/`, `tsconfig*.tsbuildinfo` sit in the repo root | n/a | Seen in the root listing; `git status` does not list them, so they are ignored or tracked. Not verified (see section 6). | none | Keep (docs agent) |

Totals for the area: about 3,700 lines are removable now or after one owner answer (R-01 to R-15), of which roughly 2,200 have no importer or caller at all.

Outside my area but seen while tracing (for the other agents): `src/app/new-deck/page.tsx` and `brew-v2` are reachable only by in-app links that need the chat switch; `src/components/DeckChatTab.tsx`, `DraftSessionTile.tsx`, `RecommendationCard.tsx`, `OraclePromptCard.tsx`, `PushToArchidekt.tsx`, `StrategyRow.tsx`, `brew-v2/ChatPanel.tsx`, `brew-v2/CandidateCard.tsx`, `brew-v2/CardRow.tsx`, `brew-v2/InlineAssessment.tsx`, `brew-v2/SuggestionsTab.tsx`, `hooks/useDeckChat.ts`, `lib/commander-resolver.ts` (634), `lib/source-trust-config.ts` (324) have no importer; `CardArtPreview`, `CommanderSearch`, `DeckEditor`, `DraftDeckTile`, `HealthStrip`, `KeyCardsSection`, `PersistentHeader`, `PrimerSection`, `RatingsSection`, `WeaknessSection` are imported by tests only.

---

## 3 Started-and-left

Dates are the first and last commit or note date found. "Left" means nothing since.

| Item | Started | Last activity | Where it stands | Recommendation |
|---|---|---|---|---|
| Value banner (T-51) | 2026-07-22 (component); fix 2026-10-13 | merged 2026-10-20 | Replaced by a number in the page header. Component unmounted. Backlog and checklist still say parked or failed. | Drop: delete banner, close C-03/C-04 |
| Add proxy for unowned card (T-52) | 2026-10-13 | merged 2026-10-20 | Works per report. Never click-tested by the owner after merge. | Finish with one owner check, then close |
| Collection status filter | 2026-07 | I-01 review 2026-10-13 (Fail) | Control present, nothing happens. Parked "fresh check". | Finish (small: pass the choice to the server) or drop the control |
| Reconcile original-shortage view (T-29/T-37, D-037, D-027) | spec and mockup 2026-10-10 | PARKED 2026-11-11 | Locked decision, approved spec, no code change. Page still uses the old rule. | Finish. It is the only locked decision this area contradicts |
| Shared vocabulary building blocks (T-25/T-26) | 2026-10-12 | PARKED 2026-11-11 | Words locked (D-043). About 530 lines of components unused. | Park the components or drop; keep the spec |
| Collection location switcher, show locations, edit quantity (UX-01, UX-12, UX-15) | 2026-11-17 | queued | Not started | Park until the owner picks "collection and storage tools" as next priority (backlog.md "Next priority") |
| Break-down button (O-010) | 2026-07 | route last touched 2026-10-11 | Route exists, button never mounted; old control `StatusControl` unmounted | Park, or drop the route with R-10 |
| Generic basic land +/- control | helper 2026-10-22 | same day | Helper written, never wired | Finish or drop (R-13) |
| Card Management vs Collection | 2026-07-14 / 2026-07-05 | overview spec 2026-10-11 flagged it | Two screens, both live | Decide one (Q-1) |
| Trade place (CC-25) | 2026-11-18 | same day | Claude side built; database change still a draft; nothing in the app marks a place | Finish (apply change + one switch on the Binders page) or park |
| Claude manages boxes and Picklist (CC-16), imports (CC-17), wishlist (CC-18) | approved 2026-11-17 | draft SQL 2026-11-17 | Only draft SQL files and contracts exist | Park until the owner names it next. Backlog.md says "planning underway" for CC-16/CC-17: nothing has moved since 2026-11-17 [Confirmed: no reports after that date for these] |
| Card-data backfill for 100 cards with no data (CC-14) | 2026-11-18 | same day | Script prepared, not applied, owner approval pending | Finish (needs owner yes) |
| Auto-assign (resolve / allocate routes) | 2026-07-14 | untouched since | Superseded by explicit assigning and the Picklist | Drop (R-01) |
| Cron price job | 2026-07-22 | 2026-10-11 | Misnamed, probably not running | Drop or fix (R-15) |
| Card Kingdom pricing | 2026-07 | removed 2026-10-11 | Gone | Done |
| Inert wishlist tick on import screen | 2026-09-26 | T-22 | Saves a flag nothing uses | Finish with CC-18 or drop (R-16) |
| Sidebar navigation and ⌘K search shortcut | 2026-07-05 | sidebar replaced by top bar | Shortcut hint still shown, handler gone | Fix or remove the hint (F-41) |

---

## 4 Decisions drift (report only)

| ID | Decision | What the code or notes do | Evidence |
|---|---|---|---|
| D-1 | **D-037 / D-027** (Reconcile counts originals only; every main-deck slot including proxy-filled counts as demand; cards with no original owned appear) | Code still uses the 2026-10-05 "v1" rule: proxy-filled slots add no demand; cards with no original are left out. Subtitle says "Proxies are not counted". T-37 parked. | [Confirmed: src/lib/reconcile-overuse.ts:5-8, 65; src/app/reconcile/page.tsx] |
| D-2 | **D-028** (Missing retired from the product) | Missing is back as a system place (Binders tile, page, "Can't find it", "Turned up"), approved in the know-where-cards brief §17.6, but decisions.md was never amended. Contract asks Gene to record it. The same section also says contracts/card-state-actions.md §12 is stale. | [Confirmed: src/app/storage/missing/page.tsx; docs/oracle/contracts/know-where-cards-are.md:235,337]; owner-checklist C-15 now untrue |
| D-3 | **D-035** ("Card Kingdom deferred") vs **D-040** ("Card Kingdom removed") | Both are locked. D-040 replaces "deferred". D-035 text was not edited. | decisions.md |
| D-4 | **D-025 / D-031 / D-033 / D-043** words Sleeved / Unsleeved | Screens say "In deck" and "Planned" (WORDS-01, 2026-11-17); "Sleeve" stays as the action word. Backlog says Gene still has to record the amendment (needs owner approval). | backlog-details WORDS-01/02; [Confirmed: src/components/CardSlotBadge.tsx:130 "Planned ·"] |
| D-5 | **D-059** (Unowned cards state, "Use proxies" switch, "Build is parked behind Use what I own") | Not built. roadmap.md still names "Use what I own" as CURRENT and Phases 3 to 7 as parked, while the owner's 2026-11-22 priority list ignores both. The roadmap is out of date. | [Confirmed: no `useProxies` in src]; roadmap.md |
| D-6 | **D-053** (selected Original uses the app green `--accent-primary` #1D9E75) | The primary colour was changed to purple (brand-600, 2026-11-21 "purple-primary"). The decision's colour value is now wrong and Original chips follow the new primary. | [Confirmed: src/styles/tokens.css:151 `--accent-primary: var(--brand-600)`]; reports/2026-11-21-developer-purple-primary.md |
| D-7 | **D-029** (no retired/archived deck concept; "Graveyard" labels to be removed) | Comments in the allocation code still say "Boxed or Archived" and "Brew-stage"; Reconcile still carries an `isActive` field from an old on/off flag. Labels on screen are gone (C-15 Pass). | [Confirmed: src/app/api/allocation/resolve/route.ts:6; src/lib/reconcile-overuse.ts:27,172] |
| D-8 | **D-006 / owner note 2026-09-25** "migrations need not be cautious until MVP" | Superseded in practice by the 2026-11-16 data-separation work (per-user protection). Not contradicted in code, but the note is old. | backlog-details top |
| D-9 | **D-033** ("generic basics must not appear as cards still needing to be pulled") | Holds in the Picklist routes (they skip generic slots). No drift. | [Confirmed: src/app/api/picklist/route.ts uses isGenericSlot] |

---

## 5 Open questions

For the owner, in plain words:

- **Q-1** Collection and Card Management both list your cards. Collection is where you browse and filter; Card Management is where you open a card, add a proxy, move a copy and select many at once. Which should be the one place? Recommendation: keep both for now and plan to merge the card window and bulk selection into Collection, because you have not asked for either to go. With each option you would see: (a) keep both: nothing changes; (b) fold Card Management into Collection: one screen, the card window opens from Collection (also finishes the backlog item "click a card to edit it"); (c) drop Collection's grid and keep Card Management: loses Tags filter and prices view. Trade-off: (b) is the most work.
- **Q-2** The Collection status filter does nothing today. Should it work (filter by Original, Proxy and so on), or should it be removed from the toolbar? Recommendation: make it work, it is a small fix.
- **Q-3** Settings has a "Clear All Data" button for your account. It only works on a local copy, not on the live site. Do you want it kept?
- **Q-4** Now that every planned card appears on the all-decks Picklist, do you still use "Add to Picklist" on the Unsorted box and the import result? If not, it can go.
- **Q-5** The import screen has a "Wishlist" tick that saves nothing useful. Keep it until the wishlist is built, or remove it now?
- **Q-6** (technical) `src/lib/copy-availability.ts` imports a file from the contracts folder in docs. If docs are ever archived or deleted, the build breaks. Move that small types file into `src`? (Agents' call; flagged so nobody deletes the contract by mistake.)
- **Q-7** Is the live site on Vercel in use? If not, the daily "refresh prices" job can be removed (R-15). The job also does not refresh prices.
- **Q-8** The top bar search box shows "⌘K" but the shortcut does not work. Restore it, or remove the hint?
- **Q-9** The Binders menu item is called "Binders" but the notes call these "boxes". Which word should the app use? (D-043 vocabulary does not cover it.)

---

## 6 Could not verify

- I did not run the app, the tests, `tsc` or the linter. State claims come from the import graph and reading, not from clicking.
- The import graph is static. It follows `import`, dynamic `import()` and `vi.mock` lines with `@/` and relative paths. It cannot see routes built by string concatenation outside `fetch` (the connector approve/decline paths were found by hand), and it would miss a file loaded from a `.js` script or a config file. `scripts/` and `tests/` do not import `src` files by path (checked with grep), so no script-only use was found.
- A route marked "no caller" could still be called by an external client (a Claude tool, a bookmark, the Vercel cron, a GitHub job). Only `cron/refresh-prices` is known to have such a caller. GitHub workflows were not read.
- Lines for R-12 (about 200) are estimated from the export list; I did not count exact function bodies.
- Whether a database object behind a removed route (functions, drafts in `supabase/drafts/`) is still referenced by other code was not checked. I did not read the hosted database. Migration drafts for CC-16, CC-17, CC-18 and CC-25 are described from their headers only.
- I did not confirm whether the hosted app is deployed (Vercel), nor the value of `NEXT_PUBLIC_AI_CHAT_ENABLED` beyond `.env.local` having no such line (I counted matches and did not open the file).
- Dates come from git history, which shows an early shared first commit (2026-07-05) for many old files, so "started" dates for those are approximate.
- `docs/oracle/reports/` has 393 files; I read the ones named in this audit and searched the rest by keyword. A relevant decision buried in an unread report could have been missed.
- I did not review `tests/e2e/*.spec.ts` (1,962 lines) line by line; only searched them for route names.
- R-19 (root-level `test-results/`, `playwright-report/`, tsbuildinfo files): not verified whether they are tracked.
