# Next Session Prompt

Copy everything below into a new chat session. This is designed to run autonomously for several hours — work through each task in order, verify build after each, and move on.

---

@Gene

## Context

The Oracle is a Commander MTG deck management web app (Next.js 16 App Router, Supabase, TanStack Query, Tailwind, shadcn/ui). Key docs:
- Product spec: `specs/product-spec.md`
- User guide: `docs/user-guide.md`
- Tech debt register: `specs/tech-debt-register.md`
- Component reuse convention: `.kiro/steering/convention-component-reuse.md`

## What was shipped in the last two sessions

- Deck status lifecycle: `brewing` / `in_rotation` / `graveyard`
- Import flow V2: URL/Paste/CSV → mode picker → always starts as brewing
- Picklist V2: 3-column layout (In Storage / In Decks / Unowned) as top-level deck tab (`PicklistV2.tsx`)
- Card Management UX: unified `CardGroupSection.tsx` for list + masonry views
- Basic Lands: generic (qty-based, always Original) vs specific-printing (full allocation)
- Mana pips + set icons: `ManaCost.tsx`, keyrune, `card_metadata` auto-backfill
- Material Symbol icons: sidebar nav + status badges
- Card count reliability: +/- qty stepper with dual-key invalidation
- Non-singleton qty adjuster: `CardRowKebab` shows +/- when `maxCopies > 1`
- Unified card hover preview: `useCardHoverPreview` hook + portal-based component
- DFC name resolution: `frontFaceName()` utility for `//` cards

## Architectural notes

- Supabase admin client bypasses RLS — all server queries use `createAdminClient()`
- PostgREST batch limit: `.in()` queries limited to 200 items (URL length)
- TanStack Query key for deck data: `['decks', deckId]` where deckId is STRING from URL params
- Status values: `'brewing' | 'in_rotation' | 'graveyard'`
- Card slot statuses: `'original' | 'proxy' | 'available' | 'claimed' | 'unowned' | 'generic_land'`
- Format config: `src/lib/format-config.ts` — `countRule`, `maxCopies`, `deckSize` per format
- Shared components: `CardGroupSection`, `CardSlotBadge`, `StatusChipPopover`, `PicklistV2`, `ManaCost`, `CardHoverPreview`

---

## Tasks — work through in order

### 1. Mobile responsiveness pass

The app is used at the LGS on phones. Fix layout breakage on viewports < 640px:

- **Picklist (PicklistV2.tsx)**: the 3-column grid breaks. Stack vertically on mobile (single column with section headers "In Storage", "In Decks", "Unowned" as collapsible sections).
- **Card masonry view (UnifiedGroupsLayout in CardsTab.tsx)**: already has `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` — verify it actually works at small widths. The progress bar + "View Picklist" button may overflow.
- **Deck tile grid (src/app/page.tsx)**: already responsive (`grid-cols-1 sm:grid-cols-2...`) — just verify the rotation summary text wraps cleanly.
- **CardGroupSection rows**: the fixed-width columns (pips 80px, set name 160px, price 56px) may overflow on narrow screens. Hide set name and price columns on mobile (`hidden md:inline-flex`).
- **StatusControl button group**: the three status buttons ("Brewing", "In Rotation", "Graveyard") may overflow. Abbreviate on mobile or wrap.

Test at 375px width (iPhone SE). Verify no horizontal scrolling on any page.

### 2. Deck total value

Show the sum of all card prices in the deck header area.

- Source: `card.price_usd` field already on `DeckCard` (from `card_metadata`)
- Location: add to the `PersistentHeader` or the deck info line below the title (where "Brewing — 100 cards" shows)
- Format: `$XX.XX` — sum all non-null `price_usd` values across all cards
- If total is 0 or all prices are null, don't show anything

### 3. Bulk "Make all lands generic"

Add a button to the LAND section header in `CardGroupSection` that converts all specific-printing lands in that section to generic in one action.

- Only show when there are specific-printing lands present (not when all are already generic)
- Reuse the existing PATCH `/api/decks/[id]/cards/[cardId]` endpoint (setting `scryfall_id: null, set_code: null`)
- Show loading toast during the operation (same pattern as single "Make generic")
- After completion, invalidate all relevant queries

### 4. Sorting in Picklist columns

Each column in `PicklistV2.tsx` should sort cards alphabetically by `cardName` within each group. Currently they come back in whatever order the API returns.

- In `categorizeCards()`: sort each group's `items` array by `card.cardName`
- Sort the `unowned` array by `card.cardName`
- Sort the groups themselves: Available groups alphabetically by location, Claimed groups alphabetically by deck name

### 5. Search in the Picklist

Add a search input at the top of the Picklist tab (same style as the Cards tab search field) that filters all three columns simultaneously.

- Filter by card name (case-insensitive substring)
- When search is active, hide empty groups/columns that have no matching cards
- Clear button to reset

### 6. Deck export

Add an export option to the deck detail page (kebab menu or button near the deck header).

Two formats:
- **Text (MTGA format)**: `1 Card Name (SET) CollectorNumber` per line. Group by board if categories include Sideboard/Maybeboard.
- **Copy to clipboard**: put the text on clipboard with a toast confirmation

Implementation:
- Create a utility function `exportDeckAsText(cards: DeckCard[]): string` in `src/lib/deck-export.ts`
- Add a button/menu item in the deck page header actions area (near the StatusControl)
- Use `navigator.clipboard.writeText()` for copy

### 7. Empty deck state

When a deck has 0 cards (freshly created or all removed):

- Cards tab: instead of empty sections, show a centered prompt with:
  - "This deck is empty"
  - "Import cards from a URL or paste a list" button (triggers import dialog)
  - "Or add cards individually using the search above"
- Picklist tab: show "No cards in this deck yet" with same import prompt

Check: `filteredCards.length === 0 && cards.length === 0` (distinguish "no cards match filters" from "deck is actually empty").

### 8. Error boundaries + loading improvements

- Add a React error boundary wrapper around the main content area of the deck detail page. On error: show "Something went wrong" with a "Reload" button. Use the existing `error.tsx` pattern if one exists, or create one at `src/app/decks/[id]/error.tsx`.
- Verify that API failures in `useQuery` hooks show meaningful states (the existing `isLoading` and `error` handling in deck page, CardsTab, PicklistV2). If any just show a blank page on error, add a simple error message.
- Add a loading skeleton to the Picklist tab (3-column placeholder) matching the existing deck page skeleton pattern.

### 9. Mark as Missing — atomic write (TD-010)

Current: `src/lib/missing.ts` sets `physical_copies.missing = true` then unlinks `deck_cards` rows in sequential calls.

Fix: Create a Supabase RPC function that does both in one transaction:

```sql
CREATE OR REPLACE FUNCTION mark_copy_missing(
  p_physical_copy_id INTEGER,
  p_user_id UUID
) RETURNS JSON LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_physical_copy_id::TEXT));
  
  -- Verify ownership
  IF NOT EXISTS (SELECT 1 FROM physical_copies WHERE id = p_physical_copy_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  
  -- Set missing flag
  UPDATE physical_copies SET missing = true WHERE id = p_physical_copy_id;
  
  -- Unlink from any deck_cards
  UPDATE deck_cards SET physical_copy_id = NULL, ownership_status = NULL 
  WHERE physical_copy_id = p_physical_copy_id;
  
  RETURN json_build_object('success', true);
END;
$$;
```

Apply via Supabase MCP `apply_migration`. Then update `src/lib/missing.ts` (or wherever the mark-as-missing logic lives) to call `supabase.rpc('mark_copy_missing', ...)` instead of sequential updates.

### 10. Fresh-account onboarding polish

Check what a brand new user with zero data sees:

- Decks page (home): should show an empty state with "Import your first deck" CTA, not a blank grid
- Collection page: should show "Import your collection" if no physical_copies exist
- Verify the onboarding page (`src/app/onboarding/page.tsx`) still works and references correct status values

If empty states are missing or broken, add simple centered prompts with the Import button.

---

## General rules for this session

- Run `npx tsc --noEmit` after each task to verify build (ignore `supabase.ts` errors — those are pre-existing)
- Don't touch: brew mode/AI features, the legacy precon system, test files (leave them stale for now)
- Match existing patterns: use `toast` for feedback, `queryClient.invalidateQueries` for cache refresh, shared components from the convention doc
- If a task requires a Supabase migration, use the MCP `apply_migration` tool (project_id: `udocxsyzzvrceiuupprj`)
- If you hit a blocker on one task, note what's blocking and move to the next
