# Requirements Document

## Introduction

Shared Cards V2 completes the migration from the legacy `proxy_allocations`-based system to the V2 instance-level allocation model. The `/api/shared-cards` listing route is already V2 (reads from `deck_cards` + `physical_copies` directly). What remains is: removing the legacy `ProxyAllocationPanel` and its write path, fixing the tag-based proxy detection bug in the listing route, replacing the panel's "role toggle" interaction with the taxonomy's existing Claimed/Picklist reallocation pattern, and dropping the `proxy_allocations` table.

This is primarily a **deletion and wiring** feature, not a design-from-scratch feature. The reallocation interaction already exists (taxonomy spec's Picklist with Tier 3/4/5 candidates). The Shared Cards page's new role is: surface contention, then link into that existing mechanism.

**Value proposition:** Eliminates a dead-end write path (`proxy_allocations`) that doesn't affect actual card resolution, replaces it with the real reallocation mechanism (Picklist assignment at the `physical_copy_id` level), and fixes a latent bug where proxy detection relies on string-matching inside a `tags` field instead of reading the authoritative `ownership_status` column.

## Glossary

- **Shared_Cards_Page**: The `/shared-cards` page showing cards appearing in 2+ decks with contention information
- **Shared_Cards_Route**: `GET /api/shared-cards` — the listing API, already V2
- **ProxyAllocationPanel**: Legacy component — per-card-name "Original vs Proxy" role toggle writing to `proxy_allocations`
- **Proxy_Allocate_Route**: `POST /api/proxy-allocate` — legacy write path calling `commitAllocation()` from `allocation.ts`
- **Allocations_Route**: `GET /api/shared-cards/allocations` — reads `proxy_allocations` for write-back tracking
- **Allocations_Preview_Route**: `POST /api/shared-cards/allocations/preview` — previews allocation changes against `proxy_allocations`
- **Picklist**: The existing interactive resolution UI from the taxonomy spec — ranks candidates by tier, commits assignments at the `physical_copy_id` level
- **Contention**: A card appearing in 2+ decks where total demand exceeds owned supply

## Requirements

### Requirement 1: Remove ProxyAllocationPanel and Legacy Write Path

**User Story:** As a developer, I want the legacy role-toggle allocation system removed, so that no code path writes to the dead-end `proxy_allocations` table.

#### Acceptance Criteria

1. THE system SHALL delete `src/components/ProxyAllocationPanel.tsx`
2. THE system SHALL delete `src/app/api/proxy-allocate/route.ts` and its test file
3. THE system SHALL delete `src/app/api/shared-cards/allocations/route.ts`
4. THE system SHALL delete `src/app/api/shared-cards/allocations/preview/route.ts`
5. THE system SHALL delete `src/lib/allocation.ts` (the V1 allocation engine — `commitAllocation`, `previewAllocation`)
6. THE system SHALL verify no remaining imports reference the deleted files (`npx tsc --noEmit` + grep)
7. AFTER deletion, THE system SHALL have zero code paths that write to or read from the `proxy_allocations` table

### Requirement 2: Drop proxy_allocations Table

**User Story:** As a developer, I want the `proxy_allocations` table dropped from the database, so that the V1 allocation system is fully decommissioned.

#### Acceptance Criteria

1. THE migration SHALL drop the `proxy_allocations` table
2. THE migration SHALL drop any indexes on `proxy_allocations`
3. THE migration SHALL run after Requirement 1's code deletions are deployed (no code references the table at that point)
4. THE migration SHALL be irreversible by design — no data in this table is recoverable or needed (it was a labeling system, not instance-level assignments)

### Requirement 3: Fix Tag-Based Proxy Detection in Shared Cards Route

**User Story:** As a user, I want the Shared Cards page to correctly identify which deck copies are proxies, so that contention information is accurate.

#### Acceptance Criteria

1. THE Shared_Cards_Route SHALL determine proxy status from `deck_cards.ownership_status = 'proxy'` (or the joined `physical_copies.is_proxy` flag), NOT from string-matching inside the `tags` field
2. WHEN a deck_cards row has `ownership_status = 'proxy'` OR its linked physical_copy has `is_proxy = true`, THE route SHALL report `is_proxy: true` for that deck entry
3. WHEN a deck_cards row has `ownership_status = 'original'` OR `ownership_status IS NULL`, THE route SHALL report `is_proxy: false` for that deck entry
4. THE route SHALL no longer reference the `tags` field for proxy determination

### Requirement 4: Shared Cards Page Shows Contention with Taxonomy Status

**User Story:** As a user, I want the Shared Cards page to show each contended card's resolution status using the new five-state taxonomy, so that I can see which cards are Claimed vs. simply shared.

#### Acceptance Criteria

1. THE Shared_Cards_Page SHALL display the card's slot status using the `CardSlotBadge` component (from taxonomy spec) for each deck entry
2. WHEN a card is in 2+ decks and total demand exceeds owned supply, THE page SHALL visually indicate contention (the `needing_proxies` flag already computed by the route)
3. THE page SHALL use the existing colour/badge vocabulary: Original (teal solid), Proxy (teal dashed), Claimed (orange) — consistent with Cards Tab
4. THE page SHALL NOT display any "Apply to Archidekt" button or role-toggle radio buttons (the removed ProxyAllocationPanel's UI)

### Requirement 5: Reallocation Action Links to Existing Picklist

**User Story:** As a user, when I see a contended card on the Shared Cards page, I want to navigate directly to the relevant deck's Picklist to resolve it, so that I use one consistent reallocation mechanism across the app.

#### Acceptance Criteria

1. FOR each contended card row, THE Shared_Cards_Page SHALL display a "Resolve in [Deck Name]" link (or equivalent) that navigates to that deck's Cards tab in Picklist mode
2. THE link SHALL navigate to `/decks/[id]?tab=cards&mode=picklist` (or equivalent deep-link that opens the Picklist view)
3. THE Shared_Cards_Page SHALL NOT implement its own inline reallocation mechanism — all physical-copy-level reassignment happens through the existing Picklist
4. WHEN a user completes a reallocation via the Picklist and returns to Shared Cards, THE page SHALL reflect the updated state on next data fetch (TanStack Query invalidation on navigation back)

### Requirement 6: Remove collection-reallocator.ts

**User Story:** As a developer, I want the collection reallocator removed, so that no legacy re-allocation logic remains alongside the V2 Picklist.

#### Acceptance Criteria

1. THE system SHALL delete `src/lib/collection-reallocator.ts`
2. THE system SHALL verify no remaining imports reference it
3. IF any route previously called `collection-reallocator` functions, THOSE calls SHALL be removed (the Collection import route's `legacy` mode, which is already dead behind a write-blocking trigger)

### Requirement 7: Update Shared Cards Page Component

**User Story:** As a user, I want the Shared Cards page to work without the removed panel, displaying contention information cleanly with links to resolve via Picklist.

#### Acceptance Criteria

1. THE Shared_Cards_Page SHALL remove all references to `ProxyAllocationPanel`
2. THE Shared_Cards_Page SHALL remove any "Manage Proxies" or "Allocate" button that opened the panel
3. THE Shared_Cards_Page SHALL continue to display: card name, deck count, owned count, proxy-needed indicator, and per-printing breakdown
4. THE Shared_Cards_Page SHALL add a "Resolve" action per contended card that links to the relevant deck's Picklist
5. WHEN no contention exists (owned supply >= deck demand for all shared cards), THE page SHALL display the listing without resolve actions (informational only)

## Success Metrics

- **Zero V1 allocation writes:** No code path writes to `proxy_allocations` after deployment
- **Proxy detection accuracy:** Every `is_proxy` value on the Shared Cards page matches `deck_cards.ownership_status` or `physical_copies.is_proxy` — zero reliance on tag string matching
- **Table dropped:** `proxy_allocations` table no longer exists in the schema
- **File deletion complete:** `allocation.ts`, `allocation-resolver.ts`, `allocation-store.ts`, `collection-reallocator.ts`, `ProxyAllocationPanel.tsx`, `proxy-allocate/route.ts`, `shared-cards/allocations/route.ts`, `shared-cards/allocations/preview/route.ts` all removed
- **No new allocation UI:** The Shared Cards page links to existing Picklist, does not implement its own reassignment interaction

## Out of Scope

- **Picklist UI changes:** The Picklist already handles Claimed/Tier 3/4/5 reassignment. No changes to its interaction design.
- **Shared Cards route performance optimization:** The route works and is already V2. Performance work (pagination, caching) is separate.
- **Allocation resolver V1 deletion:** `allocation-resolver.ts` and `allocation-store.ts` are also on the Phase 2 deletion list per the refactoring audit, but they may have other consumers beyond the shared-cards path. Margaret to verify during architecture — if safe, include in this spec's deletion pass; if not, flag as a follow-up.
- **`proxy_allocations` data export:** No data preservation needed — the table contains stale role labels that never affected actual resolution.

## Risks

| Risk | Category | Mitigation |
|------|----------|------------|
| `allocation-resolver.ts` or `allocation-store.ts` have consumers beyond the shared-cards path | Feasibility | Margaret to grep for imports before including in deletion list. If consumers exist, exclude from this spec and file as separate debt. |
| Shared Cards page has other components or hooks that reference ProxyAllocationPanel indirectly | Feasibility | Grep for `ProxyAllocationPanel`, `proxy-allocate`, `SharedCardRow` (which may pass props to the panel). TypeScript compiler catches missing references after deletion. |
| Users rely on the "Apply to Archidekt" flow (even though it's dormant) | Usability | The write-back has been dormant since the deck-authority-split decision. The button exists but does nothing meaningful. Removing it removes a false affordance. |

## Dependencies

- **Taxonomy spec (shipped):** `CardSlotBadge` component, five-state vocabulary, Picklist Claimed row pattern
- **`/api/shared-cards` route:** Already V2, needs the proxy detection bug fix only
- **`proxy_allocations` table:** Must have zero readers/writers before drop migration

## References

- Briefing: `the-oracle/docs/shared-cards-v2-briefing.md`
- Refactoring audit (Phase 2): `the-oracle/docs/refactoring-audit.md`
- Taxonomy design (Picklist/Claimed): `.kiro/specs/card-status-taxonomy-rename/design.md`
- Current ProxyAllocationPanel: `src/components/ProxyAllocationPanel.tsx`
- Current shared-cards route: `src/app/api/shared-cards/route.ts`
