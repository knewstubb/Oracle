# Decks Dashboard — Spec

Status: Draft, synthesized from design conversation. Not yet handed to Kiro.

This document covers two things in one place, as requested:

- **Part 1 — V1**: buildable against the current schema and code, no new infrastructure beyond what's listed.
- **Part 2 — V2 exploration**: real feature/schema work that needs scoping decisions before it can be turned into implementation tasks.

Claims are tagged `[Confirmed]` (verified against current source) or `[Proposed]` (new work, not yet built). Where a decision is still open, it's called out explicitly rather than assumed.

---

## Locked decisions

| Decision | Resolution |
|---|---|
| Landing page architecture | Same route (`/`), same sidebar entry ("Decks"). Dashboard becomes a tab, not a new nav item or separate page. |
| Deck creation entry points | Out of scope for this doc — flagged separately as an inconsistency between the sidebar "Brew Deck" shortcut and the header "New Deck" modal gate. |
| `in_rotation` status label | Displayed label changes from "In Rotation" to **"Active"**. Database/enum value stays `in_rotation` — copy-only change. |
| Manual deck creation flow | Manual per-deck status toggle stays as the only mechanism for setting Brewing vs Active on import. No card-count heuristic — one didn't exist in code despite earlier notes referencing it. |

---

## Part 1 — V1 spec

### 1.1 Navigation and routing

**Requirement:** The Decks page (`src/app/page.tsx`, route `/`) gains two tabs in the header area: **Dashboard** (default) and **All decks** (the existing tile grid, unchanged).

Acceptance criteria:
- WHEN a user visits `/`, THE system SHALL default to the Dashboard tab.
- WHEN a user selects the All decks tab, THE system SHALL render the current grid (`page.tsx` lines 122-157) unmodified.
- THE Sidebar SHALL NOT gain a new nav item for this — `src/components/Sidebar.tsx`'s existing "Decks" entry (`href: '/'`) covers both tabs.

### 1.2 Status label rename: "In Rotation" → "Active"

`[Confirmed]` The `DeckStatus` enum value `in_rotation` (`src/lib/deck-status.ts`) stays as-is — this is a display label change only, not a migration.

Files with the hardcoded label, all requiring the same find-and-replace:
- `src/components/StatusBadge.tsx:30`
- `src/components/StatusControl.tsx:40`
- `src/components/StatusFilter.tsx:15`
- `src/components/PicklistV2.tsx:481` and `:591`
- `src/components/StatusChipPopover.tsx:145` ("Pull from In Rotation deck?" modal title)
- `src/app/onboarding/page.tsx:958` and `:1117` (import toggle button text)
- `src/app/settings/components/page.tsx:426` (component-library demo copy)

Acceptance criteria:
- WHEN any UI surface displays the `in_rotation` status label, THE system SHALL render "Active" instead of "In Rotation".
- THE system SHALL NOT change the database column value, API payload field values, or any status-comparison logic (`StatusControl.tsx:176-177`, `api/decks/[id]/status/route.ts:71`).

### 1.3 Header stat strip

**Requirement:** The page header gains a subtitle line beneath "Decks", matching the density of the Collection page's stat band — but scoped to decks, not the collection.

**Revised, correcting an earlier draft:** total card count and total collection value were originally proposed here and are wrong for this page — those are Collection's numbers, and Collection already has its own stat band showing them. Repeating them on Decks duplicates another page's header instead of saying anything about decks.

Content: deck count broken out by status (e.g. "12 decks · 6 Active, 4 Brewing, 2 Graveyard"), plus a readiness ratio drawn from the same tiers as Ready to Play (e.g. "4 of 6 Active decks ready to play"). Both are decks-scoped and the readiness ratio gives the stat line a reason to exist beyond decoration — it's a rollup of 1.4's traffic-light data, not a new computation.

Acceptance criteria:
- THE stat line SHALL NOT include total card count or total collection value.
- THE readiness ratio SHALL count decks in the green ("Ready") tier from 1.4 against the total count of `in_rotation` decks.

### 1.4 Ready to Play section

**Revised, correcting Phase 2's shipped behavior:** this section shows green-tier decks only. Amber and red tier Active decks do NOT appear here — showing a deck flagged "unowned" inside a section titled "Ready to Play" is a direct contradiction (a card you don't own means the deck isn't playable). Their status is not lost — it's the exact content of Needs Attention (1.5) items A and B, which already exists. Duplicating the same signal as a badge in this section added noise, not information, and undermined the one thing this section is supposed to promise: everything here is playable right now, no exceptions.

Scope: decks with status `in_rotation` ("Active") **and** green tier only.

**Readiness tiers** — `[Confirmed built, Phase 2]` Rollup logic using the 5-state card ownership taxonomy (original/proxy/unallocated/claimed/unowned) already exists from Phase 2:
- **Green ("Ready")**: all slots resolved. Only this tier renders in Ready to Play.
- **Amber**: unresolved slots exist, but corresponding cards are owned and unclaimed elsewhere. Surfaces only via Needs Attention item type A (1.5) — not shown in this section.
- **Red**: unresolved slots exist where the card isn't owned at all. Surfaces only via Needs Attention item type B (1.5) — not shown in this section.

Acceptance criteria:
- THE system SHALL render a deck in Ready to Play WHEN AND ONLY WHEN its status is `in_rotation` AND all `deck_cards` rows have a non-null `physical_copy_id`.
- THE system SHALL NOT render a per-item readiness badge in this section — every item shown means the same thing, so a repeated "Ready" label on each row is redundant given the section header.
- Tapping a deck tile SHALL navigate directly to `/decks/[id]` (reuse `DeckTile`'s existing `Link` behavior).

**Empty state, case 1 (no Active decks at all):** list the user's Brewing decks with an inline "Mark Active" action, unchanged from the original design.
- WHEN no decks have status `in_rotation`, THE system SHALL list up to 3-5 Brewing decks in this section with a "Mark Active" affordance per deck.
- WHEN a user selects "Mark Active", THE system SHALL call the existing `PATCH /api/decks/[id]/status` endpoint `[Confirmed exists]` with `{ status: 'in_rotation' }` and refresh the section on success.

**Empty state, case 2 (new) — Active decks exist, but none are green:** THE system SHALL render the message "Your Active decks need prep before they're playable — see Needs Attention below" rather than an empty box or, worse, showing not-actually-ready decks to fill the space.

### 1.5 Needs Attention section — v1 scope

Only ship item types backed by data that exists today:

| Item type | Example copy | Data source | V1? |
|---|---|---|---|
| Allocation match | "Muldrotha: 2 cards could be pulled from storage" | `supply-pool.ts` / `allocation-candidates.ts` `[Confirmed exists]` | Yes |
| Unowned slot, current price | "Sqrl deck: Rhystic Study unowned · $45" | `deck_cards` where card status = unowned, joined to `card_kingdom_prices` current snapshot `[Confirmed exists]` | Yes |
| Collection value delta | "Collection value up $12 this week" | Requires price history — does not exist (`card_kingdom_prices` is overwritten in place, no snapshot table) | **No — v2** |
| Wishlist price drop | "3 wishlist cards dropped below $5" | Wishlist feature does not exist | **No — v2** |

Acceptance criteria:
- THE system SHALL show at most 3-5 items, sorted by [recency or severity — needs a tie-breaking rule, flagged as open].
- WHEN a user dismisses an item, THE system SHALL hide it for the remainder of the session. `[Proposed]` Persistence across reloads/devices is v2 (see 2.6).
- WHEN zero items qualify, THE system SHALL omit the section entirely rather than render an empty placeholder.

### 1.6 Recently Active section — v1 scope

`[Confirmed]` Only `brew_sessions` have a usable recency signal (`updated_at`, bumped on every `updateBrewSession` call). Decks have no equivalent — `last_synced_at` reflects Archidekt sync time, not user interaction, and there is no view-tracking table.

Acceptance criteria:
- THE system SHALL populate this section from `brew_sessions` only, sorted by `updated_at` descending, max 3-4 items.
- THE system SHALL NOT include decks in this section for v1 — see 2.5 for the follow-up work that would enable it.
- Each item SHALL show a "Brewing" tag distinct from a deck tile, to avoid the DeckTile/DraftSessionTile visual-twin confusion identified earlier in this review.

### 1.7 Empty state (0 decks, 0 brew sessions)

- Primary action: "Bring your collection over" → routes to the existing `/onboarding` wizard `[Confirmed exists]`. Copy must reference both Archidekt and Moxfield — current copy on `page.tsx:119` says "Archidekt" only, which is stale since onboarding already supports both.
- Secondary actions, visually subordinate (text links, not buttons): "Add a single deck" (opens `DeckImportButton`), "Start a new brew" (opens `NewDeckModal`).

### 1.8 Low-data state (decks exist, none Active)

- Ready to Play renders the Brewing-list-with-promote-action pattern from 1.4.
- Needs Attention omits itself if empty (1.5).
- Recently Active renders normally from `brew_sessions` (1.6).

---

## Part 2 — V2 exploration

These need a scoping decision before they can become implementation tasks. None of this should be started until the open questions below are answered.

### 2.1 Import-time review — no automatic action

**Decided:** no automatic/silent claiming at this stage. This removes the "auto-pull" tier from the original three-way concept entirely. Import-time classification is now two states:
- **Needs review**: any deck with unresolved slots — including ones where every card is technically owned and unclaimed — always routes through the existing manual allocation/picklist flow. Nothing gets claimed without the user confirming.
- **Theoretical**: cards aren't owned — deck stays incomplete, no allocation attempted.

`[Confirmed]` Because nothing claims automatically, this likely needs little to no new backend work — the existing `existing_collection` import mode plus the existing allocation-candidates/picklist flow already cover "match against what I own, then let me confirm." The only optional addition is a UI convenience: surfacing which matches are unambiguous (tier 1-3 in `allocation-candidates.ts`) with a one-click "confirm all clean matches" bulk action — still an explicit user action, never automatic. This is a nice-to-have, not a dependency for anything in Part 1.

The tier-4 guardrail (never reassign from another Active deck without explicit action) still applies inside the manual review flow regardless.

### 2.2 Additional migration sources — deferred

**Decided:** not building additional sources (TappedOut, Deckstats, MTGGoldfish, etc.) now. Archidekt and Moxfield remain the only supported sources.

Requirement for whatever ships in 2.3: the saved-source data model must not hardcode against exactly two platforms — use an open `platform` field/enum rather than two dedicated boolean columns — so a new source can be added later without a schema change. This is the only forward-looking constraint; no investigation or build work on additional sources otherwise.

### 2.3 Saved external source links — convenience only

**Decided:** convenience only, no ongoing sync. Store the URL/username so the user doesn't retype it; re-importing is always a manual, user-triggered action. No conflict-resolution model needed, since Oracle never reconciles automatically.

New schema: an `import_sources` table (`user_id`, `platform`, `identifier`, `created_at`) — see 2.2 for the platform-field extensibility requirement. Settings gains a "Connected sources" section listing saved entries with a "Re-import" button per entry, reusing the existing onboarding/import logic rather than duplicating it.

### 2.4 Precon catalog — data source recommendation

You asked WOTC vs. Scryfall. Neither is actually a good fit, and I'd steer away from both:

- **WOTC's own site** publishes precon decklists as marketing pages, images, or PDFs tied to product announcements — not structured data. A scraper against this is fragile and breaks on every template change.
- **Scryfall** has a "Decks" feature (user-submitted decklists, e.g. a community member's "Sneak Attack precon" list), but it's user-generated content, not an official precon catalog. No guarantee of completeness, accuracy, or that every precon is even represented. Scryfall's bulk card data is excellent for card identity but has no canonical precon-to-decklist mapping.

**Recommendation: EDHREC.** They maintain dedicated, actively updated precon pages with full decklists per product, and Oracle already talks to EDHREC via `edhrec-client.ts` — this would extend an existing integration rather than add a new one. It's still not an official contract (same informal-data trust model as the existing recommendation calls), so spot-checking against WOTC's official announcements at launch time is still worth doing, but as a *verification* step, not the primary data source.

This deviates from your original two options — flagging clearly rather than deciding it silently. Confirm before this moves into scoping.

### 2.5 Deck-level activity tracking

Needed to include real decks (not just brew sessions) in Recently Active (1.6). Small in scope: one nullable timestamp column (e.g. `decks.last_opened_at`) plus a bump-on-view call from the deck detail page. Not blocking for v1, worth prioritizing early in v2 since it directly improves a v1 feature.

### 2.6 Persisted dismiss state for Needs Attention

Needed only if dismissed feed items shouldn't reappear after a reload or on another device. Small in scope: a `dismissed_at` marker keyed by user + item type + item id, or equivalent.

---

## Decisions locked (round 2)

1. Additional migration sources: deferred, not building now. Data model must stay platform-extensible for later (2.2).
2. Saved sources: convenience only, no sync (2.3).
3. Precon catalog data source: **EDHREC confirmed**, extending the existing `edhrec-client.ts` integration. Spot-check against WOTC's official announcements at launch time as a verification step, not the primary source.
4. Import-time matching: no automatic/silent action at this stage. Everything routes through manual review (2.1) — this likely shrinks 2.1 to little or no new backend work.

All four v2 scoping questions are now resolved. Part 2 is ready to convert into implementation tasks whenever it's prioritized.

---

## Suggested phasing for implementation handoff

- **Phase 1**: tab structure (1.1), status label rename (1.2), stat strip (1.3), grid unchanged.
- **Phase 2**: Ready to Play with traffic-light tiers and promote action (1.4), empty and low-data states (1.7, 1.8).
- **Phase 3**: Needs Attention limited to the two data-backed item types (1.5), Recently Active limited to brew sessions (1.6).
- **Phase 4 (v2)**: deck activity tracking (2.5), saved external sources with platform-extensible schema (2.3), persisted dismiss state (2.6), optional "confirm all clean matches" bulk action (2.1).
- **Phase 5 (v2, blocked on precon source confirmation)**: precon catalog (2.4).
- **Not scheduled**: additional migration sources (2.2) — revisit if/when a specific source becomes a real need.
