# Delivery Log — Cards Tab Workshop

## 2026-07-21: Card Count Reliability + Hover Unification + DFC Fix

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Bug fix + polish sprint (6 tasks)

### Changes shipped

| # | Change | Files |
|---|--------|-------|
| 1 | **Card count invalidation fix** — GenericLandRow, SpecificLandRow, CardRowKebab now invalidate ALL query keys (deck, card-statuses, health, picklist) in both string and number deckId variants. Header counts, progress bar, and section headers update immediately after +/- qty changes. | `CardGroupSection.tsx` |
| 2 | **Qty adjuster for non-singleton formats** — CardRowKebab shows +/− stepper when format allows >1 copy. Threaded `maxCopies` from page via `getFormatConfig(deck.deck_type)` through CardsTab → layout wrappers → CardGroupSection → UnifiedCardRow → CardRowKebab. | `CardGroupSection.tsx`, `CardsTab.tsx`, `page.tsx` |
| 3 | **Claim flow invalidation hardening** — PicklistV2 assign/claim/proxy mutations now include String(deckId) variant invalidations for robustness. | `PicklistV2.tsx` |
| 4 | **Unified CardHoverPreview** — Extracted `useCardHoverPreview` hook + portal-based component (200ms delay, 220px, cursor-following, viewport-clamped). Replaced 3 inline implementations. | `CardHoverPreview.tsx`, `CardGroupSection.tsx`, `PicklistV2.tsx`, `StatusChipPopover.tsx` |
| 5 | **DFC card name resolution** — Added `frontFaceName()` utility. Deck API card_metadata lookup tries front-face variants. Auto-fill uses front-face for Scryfall identifiers, stores under both names, extracts mana_cost from card_faces. Allocation candidates try front-face fallback. | `basic-lands.ts`, `decks/[id]/route.ts`, `allocation-candidates.ts`, `backfill-mana-costs.ts` |

### Claim flow verification (no code change needed)

- Status values correct: `brewing` → tier 3 instant, `in_rotation` → tier 4 confirm, `graveyard` → instant claim
- No old values (`brew`/`boxed`/`archived`) found
- Collection import path verified: CSV → import-engine-v2 → physical_copies → deck import creates unresolved slots → picklist resolves via card_definitions

### Root cause: query key string/number mismatch

The deck page gets `deckId` from `useParams()` (string), passes `deck.id` (number) to child components. TanStack Query keys used inconsistent types, causing invalidations to miss. Fixed by hedging (invalidating both variants). Systemic fix logged as tech debt TD-016.

### Conventions applied

- Component reuse steering doc updated (CardHoverPreview + CardRowKebab entries)
- Atomic writes convention: claim-from-deck gap acknowledged, not fixed this session (tracked separately)

### Known gaps deferred

- `claim-from-deck` non-atomic sequential writes (existing TD item)
- Precon-mod-store DFC lookup not fixed (low priority, not in critical path)


---

## 2026-07-21: Mobile + Polish Sprint (10 tasks)

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Polish sprint — mobile responsiveness, UX features, atomic write fix

### Changes shipped

| # | Change | Files |
|---|--------|-------|
| 1 | **Mobile responsiveness** — PicklistV2 stacks to single column on mobile (md:grid-cols-3). CardGroupSection hides set name + price on mobile (hidden md:inline-flex). CardsTab toolbar + footer wrap. StatusControl wraps. PicklistProgress legend wraps. | `PicklistV2.tsx`, `CardGroupSection.tsx`, `CardsTab.tsx`, `StatusControl.tsx` |
| 2 | **Deck total value** — Sum of card prices shown in header stats line (`· $XX.XX`), hidden when 0. | `page.tsx`, `PersistentHeader.tsx` |
| 3 | **Bulk "Make all generic"** — Button in LAND section header converts all specific-printing lands to generic in one action. | `CardGroupSection.tsx` |
| 4 | **Picklist sorting** — Cards sorted alphabetically within groups. Groups sorted by location (available) or deck name (claimed). | `PicklistV2.tsx` |
| 5 | **Picklist search** — Search input filters all 3 columns by card name (case-insensitive substring). Clear button resets. | `PicklistV2.tsx` |
| 6 | **Deck export** — Export button copies MTGA-format decklist to clipboard. Grouped by Commander/Deck/Sideboard/Maybeboard. | `deck-export.ts`, `page.tsx` |
| 7 | **Empty deck state** — CardsTab: "This deck is empty" + DeckImportButton. PicklistV2: "No cards in this deck yet". Distinct from "no cards match filters". | `CardsTab.tsx`, `PicklistV2.tsx` |
| 8 | **Picklist loading skeleton** — 3-column skeleton placeholder matching picklist layout (replaces spinner). error.tsx already existed. | `PicklistV2.tsx` |
| 9 | **Mark as Missing atomic RPC** — `mark_copy_missing` Postgres function with advisory lock. `missing.ts` now calls `supabase.rpc()` instead of sequential updates. TD-010 resolved. | `missing.ts`, Supabase migration |
| 10 | **Collection empty state** — Enhanced with descriptive text + CollectionImportButton CTA for fresh accounts. | `collection/page.tsx` |

### Tech debt resolved this session

- **TD-010** (Mark-as-Missing not atomic) — resolved via `mark_copy_missing` RPC
- **TD-011** (Card preview hover not standardized) — marked resolved (unified in prior session)

### Deferred

- Supabase CLI not linked in workspace for migration fetch — migration applied remotely, local file not synced
- `unmarkCopyMissing` still uses sequential calls (lower priority — no concurrent-write invariant at risk since un-marking doesn't modify deck_cards)


---

## 2026-07-21: Mobile Hamburger Menu

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Quick polish

### What shipped

- Sidebar hidden on mobile (< md breakpoint) via `hidden md:flex`
- `MobileHeader.tsx` component: sticky top bar with app name + hamburger icon (top-right)
- Right-side slide-out drawer with full nav items, active state, sign-out
- Drawer closes on navigation, outside tap, or Escape key
- Body scroll locked when drawer is open
- Added to root layout inside `<main>` element


---

## 2026-07-21: Storage → Binders Rename

**Delivered by:** Gene (Delivery Lead)
**Session type:** Terminology alignment with ManaBox

### What shipped

- Renamed all user-facing "Storage" / "Storage Locations" labels to "Binders"
- Affected: Sidebar, MobileHeader, storage page header, scanner target picker, settings section
- Database table (`storage_locations`) and API routes unchanged — UI strings only
- Motivation: ManaBox uses "Binders" for the same concept (named physical storage containers), aligning terminology for users migrating between apps


---

## 2026-07-21: Printing Picker

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Feature build

### What shipped

- `PrintingPicker.tsx` — modal with Scryfall-powered visual grid of all printings for a card
- Search/filter by set name or set code
- Owned printings highlighted with green "OWNED" badge (fetched from `/api/cards/owned-printings`)
- Current printing shown with checkmark, hover reveals set name + collector number + price
- `/api/cards/owned-printings` — returns user's owned scryfall_printing_ids for a card name
- `/api/cards/update-printing` — updates scryfall_id + set_code on physical_copies or deck_cards
- `CardRowKebab`: added "Change printing" menu item that opens PrintingPickerWithOwned wrapper
- On select: updates deck_cards row, invalidates queries, shows toast confirmation


---

## 2026-07-21: Alternate Printing Badge State

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Feature — printing-aware allocation status

### What shipped

- New `'alternate'` card slot status: shown when a free copy exists but isn't the exact printing specified in the deck slot
- `card-status.ts`: `computeUnresolvedStatuses` now accepts `preferredPrintings` map, compares free copies' `scryfall_printing_id` against slot's desired printing
- `CardSlotBadge.tsx`: new 'alternate' config — same grey color as 'available', `swap_horiz` icon, dashed border in grid view
- Status taxonomy is now 6 states: original, proxy, available, alternate, claimed, unowned (+ generic_land exemption)

### Design decision

Per-slot implicit (not per-deck toggle). The slot's `deck_cards.scryfall_id` defines the desired printing. If no printing preference is set, any free copy counts as "available" (exact).


---

## 2026-07-22: PWA Manifest + Price Tracking MVP

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Feature build

### What shipped

| Component | File | Purpose |
|-----------|------|---------|
| PWA manifest | `public/manifest.json`, `public/icons/`, `layout.tsx` | Home screen installable, standalone mode, green theme |
| Purchase price migration | Supabase migration | `purchase_price_usd` + `purchased_at` on physical_copies |
| Purchase price on scan | `api/scan/confirm/route.ts` | Auto-sets market price from card_metadata at scan time |
| Collection value API | `api/collection/value/route.ts` | Total market value, purchase value, gain/loss, top 10 cards |
| Collection value banner | `collection/CollectionValueBanner.tsx` | Displays value summary on collection page |
| Price refresh endpoint | `api/collection/refresh-prices/route.ts` | Batch refresh from Scryfall (75 cards/request) |

### Notes

- Per-deck value already shipping (totalValue in PersistentHeader from earlier session)
- Price refresh is manual via API call — UI button or Vercel cron to be added later
- Purchase price defaults to current market price at scan time; manual edit TBD


---

## 2026-07-22: Price Tracking — Refresh Button

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Polish — wiring existing endpoint to UI

### What shipped

| Component | File | Purpose |
|-----------|------|---------|
| Refresh Prices button | `collection/CollectionValueBanner.tsx` | RefreshCw icon button in value banner, calls POST refresh-prices, invalidates cache, toasts result |

### Details

- Button sits at the right end of the collection value banner (`ml-auto`)
- Shows spinner (`animate-spin`) while refreshing
- Label hidden on mobile (icon-only), visible on sm+ breakpoints
- Invalidates `['collection-value']` query key on success to re-fetch updated totals
- Error handling via toast
- No new API endpoints — uses existing `/api/collection/refresh-prices`



---

## 2026-07-22: iOS Safe-Area Fix + Version Badge

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Bug fix + UX polish

### What shipped

| Component | File | Purpose |
|-----------|------|---------|
| Safe-area bottom padding | `src/app/layout.tsx` | `pb-[env(safe-area-inset-bottom)]` on main scroll container |
| Drawer safe-area | `src/components/MobileHeader.tsx` | Same padding on mobile nav drawer panel |
| Version badge (fixed) | `src/app/layout.tsx` | `v0.2.0` in bottom-left corner, mobile only, 10px mono at 40% opacity |
| Version badge (drawer) | `src/components/MobileHeader.tsx` | Version shown in drawer footer below sign-out |
| Version config | `next.config.ts` | `NEXT_PUBLIC_APP_VERSION` env from `npm_package_version` |
| Version bump | `package.json` | `0.1.0` → `0.2.0` |

### Root cause (safe-area)

The previous session added `viewport-fit: cover` and `safe-area-inset-top` handling for the sticky header, but never added bottom safe-area padding. On iOS with `black-translucent` status bar style, content extends under the home indicator / address bar area. The `<main>` scroll container and the mobile drawer panel both needed `pb-[env(safe-area-inset-bottom)]` to push content above the system UI.

### Version strategy

- Version comes from `package.json` → `next.config.ts` env → rendered at build time
- To bump: change `"version"` in package.json, push, Vercel rebuilds with new number
- Badge is pointer-events-none and very subtle (doesn't interfere with content)



---

## 2026-07-22: Multi-Feature Sprint

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Feature sprint — 7 items shipped

### What shipped

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Vercel Cron | `vercel.json`, `api/cron/refresh-prices/route.ts` | Daily price refresh at 6AM UTC, CRON_SECRET auth |
| Purchase price import | `src/lib/import-engine-v2.ts` | CSV import captures purchase_price from all formats (Archidekt, Moxfield, ManaBox, generic) |
| Collection CSV export | `api/collection/export/route.ts`, `CollectionExportButton.tsx` | GET endpoint + download button in collection header |
| Query key hook | `src/hooks/useDeckQueryKeys.ts` | `deckKeys` factory + `useDeckQueryKeys()` hook — normalizes deckId to string |
| Multi-platform import | `src/lib/url-parser.ts`, `src/lib/external-deck-fetcher.ts`, `api/decks/import/preview/route.ts` | MTGGoldfish (/deck/download/{id}), TappedOut (?fmt=txt), Deckbox (/sets/{id}/export) |
| Text parser enhancements | `src/lib/text-deck-parser.ts` | MTGA 'Deck' section header, 'SB:' prefix support |
| Goldfish mode | `src/components/GoldfishTab.tsx`, `src/app/decks/[id]/page.tsx` | New tab: shuffle, draw, mulligan, play/graveyard zones, card preview, undo |

### Key decisions

- **Cron over manual-only refresh** — prices go stale overnight; daily 6AM refresh means morning checks show current data
- **Universal text parser** — MTGGoldfish/TappedOut/Deckbox all just export text decklists. Rather than maintaining 3 scrapers, we fetch their text export and run through the same parser
- **Query key hook is additive** — existing components still work; migration is incremental. Double-invalidation pattern remains until components adopt the hook.
- **Goldfish is client-only** — no server state needed. Shuffle/draw/zones all in React state with undo history stack.

### Setup required

- `CRON_SECRET` env var in Vercel project settings (for cron auth)
- Cron auto-activates on deploy (Vercel reads vercel.json)

### Deferred

- Migrate existing components to use `useDeckQueryKeys()` (incremental, not blocking)
- Goldfish: card images in zones (currently text-only cards for performance)
- Export: deck-specific export (currently collection-only)



---

## 2026-07-22: E2E Test Suite + CI Pipeline

**Delivered by:** Gene (Delivery Lead) + James (Tester)
**Session type:** Testing infrastructure

### What shipped

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Playwright config | `playwright.config.ts` | BASE_URL env var, CI reporters, mobile viewport project, retries in CI |
| Test scripts | `package.json` | `test:e2e`, `test:e2e:headed`, `test:e2e:ui`, `test:e2e:setup` |
| New features tests | `tests/e2e/new-features.spec.ts` | Goldfish (5), Export (3), Prices (2), Multi-Import (8) |
| Card movement tests | `tests/e2e/card-movement.spec.ts` | Status counts, fill, reassign, proxy, missing, cross-deck propagation, API contracts (12) |
| GitHub Actions CI | `.github/workflows/e2e-tests.yml` | Runs on push/PR, auth from secret, uploads artifacts |
| Test docs | `tests/e2e/README.md` | Local + CI setup instructions |

### Key decisions

- **Test against live Vercel deployment** — not a local server. This catches real deployment issues (env vars, edge runtime, etc.)
- **Auth session as GitHub secret** — base64-encoded Supabase session. Expires weekly, needs manual refresh.
- **API contract tests alongside UI tests** — verifying endpoints exist and validate inputs is faster and more reliable than clicking through UI for every flow.
- **Card movement tests verify invariants, not individual pixels** — tests check that "Original count increased after claim" rather than checking specific card names.

### Setup required

- `PLAYWRIGHT_AUTH_SESSION` secret in GitHub repo (base64 of `tests/e2e/.auth/session.json`)
- Session needs refresh every ~1 week when Supabase auth expires

### Test coverage summary

| Spec file | Tests | Area |
|-----------|-------|------|
| oracle-smoke.spec.ts | ~15 | Navigation, layout, pages |
| card-management.spec.ts | ~10 | Status chip actions |
| card-movement.spec.ts | 12 | Cross-deck movement, API contracts |
| new-features.spec.ts | 18 | Goldfish, export, prices, import |
| **Total** | **~55** | |



---

## 2026-07-23: Deck Tile Visual Redesign

**Delivered by:** Gene (Delivery Lead) + Dieter (Designer)
**Session type:** Design refinement

### What shipped

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Proportional color bar | `DeckTile.tsx`, `api/decks/route.ts`, `page.tsx` | Bar width reflects actual mana pip distribution from card_metadata (not equal-width) |
| Thinner bar with gaps | `DeckTile.tsx` | h-1 (4px), gap-0.5 (2px) between segments |
| Remove health pips | `DeckTile.tsx` | Removed green/amber/red dots (redundant with count + alert) |
| Remove completeness dot | `DeckTile.tsx` | Removed colored circle next to status badge |
| Icon-only status badges | `StatusBadge.tsx` | science (brewing), check_circle (in rotation), skull (graveyard) — no text |
| Brewing dashed border | `DeckTile.tsx` | 1px dashed blue border on brewing tiles |
| Graveyard desaturation | `DeckTile.tsx` | 70% grayscale + 70% opacity on graveyard tiles |
| Red count for incomplete | `DeckTile.tsx` | Card count turns red for In Rotation decks with empty slots |
| Neutral count for brewing | `DeckTile.tsx` | Brewing decks never show colored counts |

### Design decisions

- **Proportional bar > equal bar** — A Simic deck that's 70% green pips should look 70% green, not 50/50
- **Icon-only badges** — Cleaner, less text clutter. Hover shows label via title attribute.
- **Dashed border for brewing** — Communicates "work in progress / sketch" without needing a label
- **Desaturated graveyard** — Immediately communicates "retired" at a glance
- **Red count** — The only signal that matters for In Rotation decks: "can I play this tonight?"

---

## 2026-07-23: Security Audit

**Delivered by:** Gene (Delivery Lead) + Charity (DevOps)
**Session type:** Security review

### Summary

Comprehensive security audit performed. Full findings at `docs/security-audit.md`.

- 16 findings across 10 categories
- 5 items exploitable in current single-user deployment
- 5 IDOR vulnerabilities that become critical if multi-user added
- Top fixes: fail-closed cron auth, gate dev/reset, add security headers, npm audit fix

### Action required

- Set `CRON_SECRET` in Vercel env vars (immediate)
- Run `npm audit fix` (immediate)
- Add security headers to next.config.ts (short-term)
- Add user_id filters to all admin-client queries (before multi-user)

---

## 2026-07-23: Figma Design System Setup

**Delivered by:** Gene (Delivery Lead) + Dieter (Designer)
**Session type:** Design infrastructure

### What shipped

- Figma Variables API: pushed 30 color variables (bg, text, border, accent, signal, status, mana, overlays, hover)
- Figma Variables API: pushed 7 spacing variables (4-48px, 8pt grid)
- Figma Variables API: pushed 9 typography size variables (10-28px)
- Figma Variables API: pushed 5 border radius variables (sm-full)
- Plugin script: `data/oracle_figma/code.ts` — generates text style samples
- Token reference: `docs/figma-tokens.json` — complete design system as importable JSON
- Figma file: `YCoOUFO1BOsUUxAPbh52TZ` — "Oracle" project with Components page

### Deferred

- Code Connect mapping (waiting for user to build more Figma components)
- Text styles need manual save from plugin-generated samples (Figma createTextStyle API hanging)



---

## 2026-07-23: Security Fixes Deployed

**Delivered by:** Gene (Delivery Lead) + Charity (DevOps)
**Session type:** Security hardening

### What shipped

| Fix | File(s) | Description |
|-----|---------|-------------|
| Cron fail-closed | `api/cron/refresh-prices/route.ts` | Rejects if CRON_SECRET not configured (was fail-open) |
| Dev reset gated | `api/dev/reset/route.ts` | Returns 404 in production (NODE_ENV check) |
| OCR size limit | `api/scan/ocr/route.ts`, `api/scan/ocr-title/route.ts` | 5MB base64 payload cap (413 if exceeded) |
| Security headers | `next.config.ts` | X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy |
| IDOR: decks list | `api/decks/route.ts` | Added `.eq('user_id', userId)` |
| IDOR: deck detail | `api/decks/[id]/route.ts` | Added `.eq('user_id', authResult.id)` on GET and DELETE |
| IDOR: brew sessions | `api/brew-sessions/[id]/route.ts` | Added `.eq('user_id', authResult.id)` on DELETE |
| Gitignore | `.gitignore` | Excludes test-results/ and playwright-report/ |

### Accepted risks (not fixed)

- **sharp CVEs** — bundled inside Next.js, can't fix without their patch release
- **No rate limiting** — needs Vercel KV or Upstash (medium-term)
- **ignoreBuildErrors: true** — needs type cleanup pass

### Setup required

- `CRON_SECRET` must be set in Vercel environment variables (the cron now rejects without it)



---

## 2026-07-23: Rename Fill/Claim Actions to "Pull"

**Delivered by:** Gene (Delivery Lead) + Dieter (Designer)
**Session type:** UX terminology standardization

### What shipped

| Component | Change |
|-----------|--------|
| StatusChipPopover.tsx | "Fill" button → "Pull". "Claim" button → "Pull". Toast: "Pulled [card] from [deck]" |
| PicklistV2.tsx | Confirm dialog title → "Pull from In Rotation deck?". confirmLabel → "Pull" |
| user-guide.md | Updated lifecycle descriptions to use "allocated" instead of "claimed" as a verb |

### Design decision

One verb for the user action: **Pull**. The source is contextual:
- Pull from binder (was "Fill") — card is free in storage
- Pull from deck (was "Claim") — card is currently in another deck

The status name **Claimed** remains unchanged — it describes the state ("this card is held elsewhere"), not the action the user takes.

Internal code names (`claimMutation`, `ClaimedGroup`, `fillMutation`) unchanged — implementation detail, not user-facing.



---

## 2026-07-23: Dashboard Phase 1 — Tabs, Status Rename, Stat Strip

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Feature build (spec: `.kiro/specs/decks-dashboard/spec.md` sections 1.1-1.3)

### What shipped

| Component | File(s) | Change |
|-----------|---------|--------|
| Tab structure | `src/app/page.tsx` | Dashboard + All Decks tabs. Default: All Decks. Dashboard placeholder. |
| Status rename | 6 files | "In Rotation" → "Active" in all user-facing strings |
| Stat strip | `src/app/page.tsx` | Subtitle: "X decks · Y Active, Z Brewing, W Graveyard · N of Y Active decks ready to play" |

### Status rename locations

- `StatusBadge.tsx` — label config
- `StatusControl.tsx` — label config
- `StatusFilter.tsx` — label config
- `PicklistV2.tsx` — modal title + status display function
- `StatusChipPopover.tsx` — modal title
- `onboarding/page.tsx` — button labels (2 instances)

### Key decisions

- **Enum unchanged** — `in_rotation` stays in code/DB. Only display label changes.
- **All Decks as default tab** — Dashboard content (Ready to Play, Needs Attention, Recently Active) doesn't exist yet. Flip default in Phase 2.
- **readyCount is interim** — Uses `completeness.resolved === completeness.total`. TODO comment marks it for Phase 2 three-tier rollup.
- **Stat strip omitted when 0 decks** — Empty state is Phase 2 (spec 1.7).

### Deferred to Phase 2

- Ready to Play section
- Needs Attention section
- Recently Active section
- Three-tier readiness rollup (green/amber/red)
- Empty/low-data states
- Default tab flip to Dashboard



---

## 2026-07-23: Dashboard Phase 2 — Ready to Play, Empty States, Default Tab Flip

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Feature build (spec: `.kiro/specs/decks-dashboard/spec.md` sections 1.4, 1.7, 1.8)

### What shipped

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Three-tier readiness | `api/decks/route.ts` | Enriched completeness with availableCount/claimedCount/unownedCount via batch computeUnresolvedStatuses() |
| Ready to Play section | `src/app/page.tsx` | Compact rows: thumbnail + name + tier badge. Sorted red→amber→green→alpha. |
| Top-level empty state | `src/app/page.tsx` | 0 decks: hides tabs, shows onboarding CTA (Archidekt + Moxfield) |
| Low-data state | `src/app/page.tsx` | 0 Active decks: shows Brewing decks with "Mark Active" button |
| Mark Active action | `src/app/page.tsx` | Calls PATCH /api/decks/[id]/status with in_rotation, refetches |
| Default tab flip | `src/app/page.tsx` | Dashboard is now the default tab (was All Decks in Phase 1) |

### Readiness tier logic

- **Green ("Ready"):** `completeness.resolved === completeness.total`
- **Amber ("N to pull"):** unresolved rows exist, but `unownedCount === 0` (all gaps have a physical copy somewhere — available, alternate, or claimed)
- **Red ("N unowned"):** `unownedCount > 0` (at least one card has no physical copy anywhere in collection)

### Deferred to Phase 3

- Needs Attention section
- Recently Active section
- Deck activity tracking



---

## 2026-07-23: Dashboard Phase 3 — Needs Attention + Recently Active

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Feature build (spec: `.kiro/specs/decks-dashboard/spec.md` sections 1.5, 1.6)

### What shipped

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Needs Attention section | `src/app/page.tsx` | Type A: amber decks ("N cards could be pulled"). Type B: red decks ("N slots unowned"). Capped at 5, dismissible (client-local). |
| Recently Active section | `src/app/page.tsx` | Up to 4 brew sessions, sorted by updated_at desc. Click-to-resume → /new-deck?sessionId=N |
| formatRelativeTime util | `src/lib/format-relative-time.ts` | Extracted from DraftSessionTile for shared use |
| DraftSessionTile update | `src/components/DraftSessionTile.tsx` | Imports from shared util instead of local function |

### Key decisions

- **No price data in type B items** — spec called for unowned card name + price, but that requires per-card price lookups not available in the decks list response. Showing aggregate count for now. Per-card naming + pricing is Phase 4 (spec section 2.6).
- **Client-local dismiss** — dismissed items reset on reload. Persisted dismiss state is Phase 4 (spec section 2.6).
- **Recently Active = brew sessions only** — no deck activity timestamps exist yet (Phase 4, section 2.5). DraftSessions already have `updated_at` which is the right signal.
- **Both sections omitted when empty** — no placeholder, no "nothing to see" copy.

### Completes v1 Dashboard spec

This delivery closes the full Part 1 scope of the Decks Dashboard spec:
- Phase 1: Tabs, status rename, stat strip ✅
- Phase 2: Ready to Play, empty/low-data states ✅  
- Phase 3: Needs Attention, Recently Active ✅



---

## 2026-07-23: Fix Shortfall Calculation — Proxies Count as Supply

**Delivered by:** Gene (Delivery Lead) + Margaret (Developer)
**Session type:** Bug fix

### Root cause

The `collection_rollup` Postgres view calculated shortfall as `demand - owned_count`, ignoring proxy copies. A card with OWNED=1, PROXY=1, ALLOC=2 incorrectly showed SHORT=1 (should be 0, since the proxy covers the second slot).

### Fix

Changed the shortfall formula from:
```sql
GREATEST(0, demand - COUNT(*) FILTER (WHERE NOT pc.is_proxy))
```
to:
```sql
GREATEST(0, demand - COUNT(*))
```

This counts ALL physical copies (owned + proxy) as supply against demand.

### Files

- `supabase/migrations/20260723_fix_shortfall_count_proxies.sql` — view replacement
- Applied to live database via Supabase SQL API

### Verified

Field of the Dead: OWNED=1, PROXY=1, ALLOC=2 → shortfall now correctly = 0.

