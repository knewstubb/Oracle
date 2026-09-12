# Spec Validity Audit

> Audited: 2026-08-12
> Purpose: Identify which spec folders represent current shipped features vs. superseded designs

## Summary

| Status | Count | Action |
|--------|-------|--------|
| **Valid** | 27 | Keep as-is |
| **Superseded** | 5 | Archive with notes |
| **Partially Valid** | 3 | Keep, update notes |
| **Already Archived** | 12 | No action |

---

## Valid Specs (27)

These specs describe features that exist in the current codebase.

| Spec Folder | Feature | Verified By |
|-------------|---------|-------------|
| `brew-ai-tools/` | AI tool-use loop in brew | `src/lib/brew/tool-*` |
| `brew-canvas-redesign/` | Spatial canvas for deck building | `src/components/brew-v2/BrewCanvas.tsx` |
| `brew-mode-v2/` | Two-phase brew interface | `src/app/new-deck/page.tsx` |
| `brew-model-selector/` | Multi-model AI support | `src/lib/ai-models.ts` |
| `brew-session-autosave/` | Session persistence | `useBrewAutosave` hook |
| `card-category-classification/` | Functional categories | `default_category` column, `card-definition-resolver.ts` |
| `card-identity-physical-copies/` | Card definition storage (Req 1 only) | `user_cards` table |
| `card-status-taxonomy-rename/` | Six-state taxonomy | `CardSlotStatus` type, `CardSlotBadge.tsx` |
| `card-ux-unified/` | Unified card row components | `CardGroupSection.tsx` |
| `cards-tab-workshop/` | Cards tab with views | `CardsTab.tsx`, `PicklistV2.tsx` |
| `collection-allocation-expansion/` | Allocation page | `src/app/allocation/page.tsx` |
| `collection-csv-upsert/` | CSV import | `import-engine-v2.ts` |
| `collection-printing-view/` | Printing-level list view | `src/app/collection/page.tsx` |
| `deck-authority-split/` | Local-authoritative decks | `ownership-resolver.ts` guard comments |
| `deck-import-v2/` | Unified import dialog | `DeckImportButton.tsx`, `text-deck-parser.ts` |
| `deck-lifecycle-overhaul/` | Brewing/In Rotation/Graveyard | `StatusControl.tsx`, `StatusBadge.tsx` |
| `deck-status-management/` | Deck lifecycle states | `decks.status` column |
| `draft-deck-management/` | Draft deck tiles | `DraftDeckTile.tsx`, `DraftSessionTile.tsx` |
| `generic-basic-lands/` | Basic land exemption | `is_generic_land`, `isBasicLand()` |
| `monitor-mode/` | Health strip | `HealthStrip.tsx`, `health-engine.ts` |
| `nav-split-collection-allocation/` | Nav structure | Sidebar with Cards/Collection split |
| `picklist-v2/` | Three-column picklist | `PicklistV2.tsx` |
| `price-tracking/` | Price data | `ref_printings.price_usd`, `/api/collection/prices/refresh` |
| `proxy-ownership-layer/` | Ownership status tracking | `ownership_status` column |
| `pwa-infrastructure/` | PWA installability | `public/manifest.json`, service worker |
| `scryfall-cache/` | Local printings cache | `ref_printings` table |
| `shared-cards-v2/` | Shared cards view | `src/app/shared-cards/page.tsx` |

---

## Superseded Specs (5) — Move to `_archive/`

These specs describe designs that were either never shipped or replaced by later specs.

| Spec Folder | Issue | Superseded By | Recommended Action |
|-------------|-------|---------------|-------------------|
| `debrief-mode/` | **Code deleted** — all `/api/ai/debrief/*` routes removed | None (feature cut) | Archive with note: "Feature cut during scope reduction" |
| `goldfish-playtesting/` | **Code never existed** — no `/goldfish` or `/playtest` routes | None (never implemented) | Archive with note: "Spec written but never implemented" |
| `precon-mod-tracker/` | **Code deleted** — no `precon_mod_state` table or UI references | None (feature cut) | Archive with note: "Feature cut during scope reduction" |
| `card-scanning/` | **Code deleted** — no `/scan` route or camera integration | None (feature cut) | Archive with note: "Feature cut during scope reduction" |
| `card-allocation-workflow/` | **Superseded** by `card-status-taxonomy-rename` and `picklist-v2` | `card-status-taxonomy-rename/`, `picklist-v2/` | Archive with note: "Early allocation design, replaced by six-state taxonomy" |

---

## Partially Valid Specs (3) — Keep with Notes

These specs describe features that exist but with caveats documented in the spec.

| Spec Folder | Issue | Resolution |
|-------------|-------|------------|
| `upgrade-tab-expansion/` | UpgradeTab exists but EDHREC integration may be dormant | Keep — verify EDHREC sync is active |
| `decks-dashboard/` | Decks grid exists at `/decks` but no separate dashboard page | Keep — feature exists, just no distinct `/dashboard` route |
| `remove-notion-dependency/` | Feature complete, but legacy naming (`notion_logged`) noted as tech debt | Keep — accurately documents current state |

---

## Already Archived (12)

These are in `_archive/` and should remain there.

- `allocation-tab-repoint/`
- `collection-rollup-ui/`
- `collection-screen-pricing/`
- `collection-sync/`
- `deck-import-url/`
- `deck-list-section/`
- `deck-page-template/`
- `deck-ratings/`
- `deck-reimport-dataloss-fix/`
- `instance-level-card-tracking/` ← Note: This is the *authoritative* spec for instance-level tracking despite being archived; it superseded the printing-group design
- `oracle-upgrade-engine/`
- `remove-sync-capability/`

---

## Infrastructure/Foundation Specs (Always Valid)

These specs describe foundational decisions that don't have discrete "features" to verify.

| Spec Folder | Nature |
|-------------|--------|
| `supabase-migration/` | Database migration (historical, complete) |
| `user-authentication/` | Auth setup (active) |
| `ui-overhaul/` | Design system foundation (active) |
| `ui-token-pass/` | CSS tokens (active) |

---

## Recommended Actions

1. **Archive 5 specs** with explanatory notes
2. **Update product-spec.md** to remove references to cut features
3. **Add "Feature Status" section** to each archived spec explaining why it's archived

