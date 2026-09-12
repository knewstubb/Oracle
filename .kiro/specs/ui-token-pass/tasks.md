# Implementation Plan: UI Token Pass

## Overview

A three-phase refactoring pass to establish a single-source-of-truth token system across ~80 components. Phase 1 expands the token file with all spec values. Phase 2 remaps shadcn/ui theme variables to reference those tokens. Phase 3 migrates all components from inline hardcoded values to token references, grouped by page area. A final table-view standardization pass ensures all list components share a uniform row template.

## Tasks

- [x] 1. Token file expansion
  - [x] 1.1 Add spacing, typography, neutral ramp, status, and layout tokens to `src/styles/tokens.css`
    - Add spacing tokens `--space-1` through `--space-7` (4px, 8px, 12px, 16px, 24px, 32px, 48px)
    - Add typography size tokens `--text-xs` through `--text-3xl` (11px–28px)
    - Add typography weight tokens `--font-normal` (400) and `--font-medium` (500)
    - Add full neutral ramp: `--bg-canvas`, `--bg-surface`, `--bg-surface-hover`, `--border-subtle`, `--border-default`, `--text-tertiary`, `--text-secondary`, `--text-primary`
    - Add ownership axis tokens: `--status-owned`, `--status-proxy`, `--status-unowned`
    - Add allocation axis tokens: `--status-unallocated`, `--status-partial`, `--status-full`, `--status-over`
    - Add table layout tokens: `--row-height`, `--row-h-pad`, `--row-v-pad`, `--status-slot-width`
    - Add master-detail panel token: `--detail-panel-width`
    - Preserve all existing tokens (`--color-teal`, `--color-amber`, `--color-red`, `--color-blue`, `--bg-page`, `--bg-surface`, `--bg-card`, `--border-default`, `--border-emphasis`)
    - Update `--bg-page` value to `#131316`, update `--bg-surface` to `#1A1A1E`, update `--border-default` to `#35353A`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 10.2, 10.3_

  - [ ]* 1.2 Write static analysis test for token file completeness
    - **Property 1: Token file completeness — spacing, typography, and neutral ramp**
    - **Property 9: Backward-compatible token preservation**
    - Parse `tokens.css` and assert all required custom properties exist with correct values
    - Assert existing token names are still defined
    - **Validates: Requirements 1.1, 1.2, 1.4, 10.2**

- [x] 2. Theme layer remapping
  - [x] 2.1 Update `.dark` selector in `src/app/globals.css` to alias tokens
    - Map `--background` → `var(--bg-canvas)`
    - Map `--card` → `var(--bg-surface)`
    - Map `--border` → `var(--border-default)`
    - Map `--foreground` → `var(--text-primary)`
    - Map `--muted-foreground` → `var(--text-secondary)`
    - Map `--popover` → `var(--bg-surface)`
    - Map `--popover-foreground` → `var(--text-primary)`
    - Retain light-mode `:root` values unchanged
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 3. Checkpoint — Verify foundation layers
  - Ensure the app builds without errors after token expansion and theme remapping, ask the user if questions arise.

- [x] 4. Component migration — Collection page and children
  - [x] 4.1 Migrate `src/app/collection/page.tsx` to token references
    - Replace inline `style={{ }}` attributes with token-based Tailwind utilities
    - Replace hardcoded rgba/hex values with `var(--token)` references
    - Replace any `font-bold` with `font-medium`, enforce weight 400/500 only
    - Enforce typography scale (only 11–28px sizes from token set)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 6.1, 6.2, 9.3_

  - [x] 4.2 Migrate `src/components/collection/CollectionListView.tsx`
    - Replace inline styles with token references
    - Enforce spacing grid compliance (only token scale values)
    - _Requirements: 3.1, 3.2, 6.1, 6.2, 9.3_

  - [x] 4.3 Migrate `src/components/collection/CollectionGridView.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.3_

  - [x] 4.4 Migrate `src/components/collection/CollectionToolbar.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.3_

  - [x] 4.5 Migrate `src/components/collection/PrintingListView.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.3_

  - [x] 4.6 Migrate `src/components/collection/RollupRow.tsx` and `RollupListPane.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.3_

  - [x] 4.7 Migrate `src/components/collection/InstanceDetailPanel.tsx` and `InstancePanel.tsx`
    - Replace inline styles with token references
    - Apply `--detail-panel-width` token for panel width
    - _Requirements: 3.1, 3.2, 8.1, 8.3, 9.3_

  - [x] 4.8 Migrate remaining collection components (`BulkActionBar`, `CollectionRollupTab`, `LocationFilter`, `PriceStaleIndicator`, `StorageLocationSelect`, `UsedByCell`)
    - Replace inline styles with token references across all remaining collection components
    - _Requirements: 3.1, 3.2, 9.3_

- [x] 5. Component migration — Allocation page and children
  - [x] 5.1 Migrate `src/app/allocation/page.tsx` to token references
    - Replace inline styles with token references
    - Apply allocation status tokens for status indicators
    - _Requirements: 3.1, 3.2, 7.2, 7.3, 9.4_

  - [x] 5.2 Migrate `src/components/ProxyAllocationPanel.tsx`
    - Replace inline styles with token references
    - Apply `--detail-panel-width` for panel width
    - Use allocation axis tokens for status colors
    - _Requirements: 3.1, 3.2, 7.2, 7.3, 8.1, 8.3, 9.4_

  - [x] 5.3 Migrate `src/components/AllocationFailureBanner.tsx` and `src/components/StatusBadge.tsx`
    - Replace inline status color hex values with `--status-*` tokens
    - _Requirements: 3.1, 7.1, 7.2, 7.3, 9.4_

  - [x] 5.4 Migrate `src/components/StatusControl.tsx` and `src/components/StatusFilter.tsx`
    - Replace hardcoded status colors with token references
    - _Requirements: 3.1, 7.1, 7.2, 7.3_

- [x] 6. Component migration — Decks pages
  - [x] 6.1 Migrate `src/app/page.tsx` (Decks dashboard)
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.1_

  - [x] 6.2 Migrate `src/components/DeckTile.tsx` and `src/components/DraftDeckTile.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.1_

  - [x] 6.3 Migrate `src/app/decks/[id]/page.tsx` (Deck detail page)
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.2_

  - [x] 6.4 Migrate `src/components/CardsTab.tsx` and `src/components/DeckListTable.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.2_

  - [x] 6.5 Migrate `src/components/StrategyTab.tsx`, `src/components/StrategyCanvas.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.2_

  - [x] 6.6 Migrate `src/components/AnalysisTab.tsx`, `src/components/ManaCurvePanel.tsx`, `src/components/ManaAnalysisPanel.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.2_

  - [x] 6.7 Migrate `src/components/UpgradeTab.tsx` and `src/components/UpgradePanel.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.2_

  - [x] 6.8 Migrate deck detail supporting components (`DeckStats`, `DeckEditor`, `OverviewPanel`, `CategoriesPanel`, `CombosPanel`, `PrimerSection`, `KeyCardsSection`, `RatingsSection`, `WeaknessSection`)
    - Replace inline styles with token references across all deck detail sub-components
    - _Requirements: 3.1, 3.2, 9.2_

- [x] 7. Checkpoint — Verify collection, allocation, and decks migrations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Component migration — Sidebar
  - [x] 8.1 Migrate `src/components/Sidebar.tsx`
    - Replace inline styles with token references
    - Enforce neutral ramp tokens for backgrounds and borders
    - Enforce typography scale and weight constraints
    - _Requirements: 3.1, 3.2, 3.4, 5.1, 5.3, 6.1, 9.7_

- [x] 9. Component migration — Shared components
  - [x] 9.1 Migrate `src/components/SharedCardRow.tsx`
    - Replace inline styles with token references
    - Apply ownership status tokens
    - _Requirements: 3.1, 3.2, 7.1, 7.3_

  - [x] 9.2 Migrate `src/components/OwnershipBadge.tsx` and `src/components/ProxyBadge.tsx`
    - Replace hardcoded status hex values with `--status-*` tokens
    - _Requirements: 3.1, 7.1, 7.3_

  - [x] 9.3 Migrate `src/components/CardPopover.tsx`, `src/components/CardImage.tsx`, `src/components/CardArtPreview.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2_

  - [x] 9.4 Migrate `src/components/PersistentHeader.tsx`, `src/components/SmartSearch.tsx`, `src/components/ColourPips.tsx`, `src/components/ManaCost.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 5.1, 6.1_

  - [x] 9.5 Migrate `src/components/HealthBar.tsx`, `src/components/HealthPill.tsx`, `src/components/HealthStrip.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2_

  - [x] 9.6 Migrate `src/components/ConfirmationModal.tsx`, `src/components/ConflictAlert.tsx`, `src/components/DeckImportModal.tsx`, `src/components/DeckImportButton.tsx`, `src/components/DeleteDeckButton.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2_

  - [x] 9.7 Migrate `src/components/OracleChat.tsx`, `src/components/RecommendationCard.tsx`, `src/components/RecommendationsPanel.tsx`, `src/components/DebriefPanel.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2_

  - [x] 9.8 Migrate remaining shared components (`DeckScanPanel`, `PreconDiffPanel`, `PreconModTracker`, `DraftBanner`, `DraftSessionTile`, `CommanderSearch`, `CategoryTagEditor`, `SyncStatus`, `ThemeToggle`, `InlineDeleteConfirmation`, `PushToArchidekt`, `generic-land-badge`)
    - Replace inline styles with token references across all remaining shared components
    - _Requirements: 3.1, 3.2_

- [x] 10. Component migration — Brew components
  - [x] 10.1 Migrate `src/components/brew-v2/BrewCanvas.tsx`, `BrewTopbar.tsx`, `CanvasToolbar.tsx`, `CanvasViewport.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.6_

  - [x] 10.2 Migrate `src/components/brew-v2/CardRow.tsx` and `CurveCardRow.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.6_

  - [x] 10.3 Migrate `src/components/brew-v2/CandidateCard.tsx`, `CanvasDeckCard.tsx`, `CardTooltip.tsx`, `ConceptTile.tsx`, `DecisionCard.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.6_

  - [x] 10.4 Migrate `src/components/brew-v2/ChatPanel.tsx`, `DeckListTab.tsx`, `SuggestionsTab.tsx`, `ExplorationArchive.tsx`, `InlineAssessment.tsx`, `ModelSelector.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.6_

  - [x] 10.5 Migrate `src/components/brew-v2/CurveView.tsx`, `CurveColumn.tsx`, `PiledColumn.tsx`, `DraftBanner.tsx`, `DraftDeckTile.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.6_

  - [x] 10.6 Migrate Brew page-level components: `src/components/BrewBriefCard.tsx`, `BrewConfirmationCard.tsx`, `BrewContextPanel.tsx`, `BrewPathSelector.tsx`, `BrewSaveDialog.tsx`, `BrewSkeletonPanel.tsx`
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.6_

- [x] 11. Component migration — Settings page
  - [x] 11.1 Migrate `src/app/settings/` page and `src/components/settings/` components
    - Replace inline styles with token references
    - _Requirements: 3.1, 3.2, 9.5_

- [x] 12. Checkpoint — Verify all component migrations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Table view standardization
  - [x] 13.1 Standardize `src/components/collection/PrintingListView.tsx` to table row template
    - Apply `--row-height` (44px), `--row-h-pad`, `--row-v-pad` to row container
    - Set numeric columns to `text-right tabular-nums`
    - Make name column flex-grow
    - Add trailing 24px status slot (`--status-slot-width`) with empty placeholder when no status
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 13.2 Standardize `src/components/DeckListTable.tsx` to table row template
    - Apply `--row-height`, `--row-h-pad`, `--row-v-pad` to row container
    - Set numeric columns to `text-right tabular-nums`
    - Make name column flex-grow
    - Add trailing 24px status slot with empty placeholder
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 13.3 Standardize `src/components/SharedCardRow.tsx` to table row template
    - Apply uniform row height, padding, column alignment, and status slot
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 13.4 Standardize `src/components/collection/RollupRow.tsx` to table row template
    - Apply uniform row height, padding, column alignment, and status slot
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 13.5 Standardize `src/components/collection/CollectionListView.tsx` to table row template
    - Apply uniform row height, padding, column alignment, and status slot
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 13.6 Standardize `src/components/brew-v2/CardRow.tsx` to table row template
    - Apply uniform row height, padding, column alignment, and status slot
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 13.7 Standardize `src/components/brew-v2/CurveCardRow.tsx` to table row template
    - Apply uniform row height, padding, column alignment, and status slot
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 14. Final verification
  - [ ]* 14.1 Write static analysis test for inline style elimination
    - **Property 2: No inline hardcoded token-equivalent values in components**
    - Grep all `.tsx` files for `style={{` patterns containing neutral ramp hex/rgba values — count must be zero
    - **Validates: Requirements 3.1, 3.3**

  - [ ]* 14.2 Write static analysis test for font weight constraint
    - **Property 3: Font weight constraint**
    - Grep for `fontWeight: 600`, `fontWeight: 700`, `font-weight: 600`, `font-weight: 700`, `font-bold` — count must be zero
    - **Validates: Requirements 3.4, 3.5, 5.3**

  - [ ]* 14.3 Write static analysis test for typography scale adherence
    - **Property 4: Typography scale adherence**
    - Extract all fontSize/font-size values and assert each is in the allowed set (11, 12, 13, 14, 16, 20, 24, 28px)
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 14.4 Write static analysis test for table row uniformity and status slot
    - **Property 5: Table row height uniformity**
    - **Property 6: Status slot reservation**
    - Assert all table view components reference `--row-height` and have trailing `--status-slot-width` element
    - **Validates: Requirements 4.1, 4.3, 4.5, 4.6**

  - [ ]* 14.5 Write static analysis test for status color hardcoding
    - **Property 7: No hardcoded status colors when a token exists**
    - Grep for status hex values (#5F5E5A, #4A93A0, #F0339E, #8A8A92, #FF5F1F) in inline styles — count must be zero
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [ ]* 14.6 Write static analysis test for detail panel width token usage
    - **Property 8: Detail panel width via token**
    - Assert panel components reference `var(--detail-panel-width)` not hardcoded `320px`
    - **Validates: Requirements 8.1, 8.3**

- [x] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Phase 1 (token expansion) is additive-only — no risk of regression
- Phase 2 (theme remapping) changes dark-mode values — easily reversible
- Phase 3 (component migration) is the bulk of changes — done incrementally per page area
- The table standardization pass (task 13) happens after all components are migrated to tokens, ensuring a clean baseline
- Static analysis tests validate correctness properties from the design document
- No behavioral or functional changes — purely visual-token driven refactoring

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "5.1", "5.2", "5.3", "5.4", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "8.1"] },
    { "id": 3, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "11.1"] },
    { "id": 4, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7"] },
    { "id": 5, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"] }
  ]
}
```
