# Convention: Component Reuse

## Core Principle

If the same UI pattern appears in two or more views, it must be a single shared component — not duplicated code with divergent feature sets. When one view adds a feature (hover preview, kebab menu, status chip), the other view gets it automatically.

## When this applies

Any time you're about to write a component that renders a list of items, a card row, a section header, a status indicator, or a grouped layout — check if a shared component already exists.

## Rules

1. **One component, one source of truth.** If two views show the same data in the same row format, they use the same component. Layout differences (single column vs. multi-column) are handled by the parent, not by duplicating the row.

2. **Layout wrappers are thin.** The parent decides grid/flex/masonry layout. The shared component handles the section and row rendering. Wrapper components should be < 30 lines.

3. **Feature parity by default.** When a shared component gains a feature (e.g. hover preview, kebab menu, category editor), all consumers get it. Use optional props to disable features for specific contexts — don't fork the component.

4. **Prop gating over forking.** If a feature doesn't make sense in one context, gate it with an optional prop (`onCategoryChange?: ...`). The component checks `if (onCategoryChange)` before rendering the editor. Never create a "lite" copy.

5. **Name shared components clearly.** Use descriptive names that indicate reusability: `CardGroupSection`, `CopyRow`, `StatusChipPopover`. Avoid names that tie them to one view (`GroupsViewCard`, `ListModeRow`).

## Existing shared components

| Component | Used by | Purpose |
|-----------|---------|---------|
| `CardGroupSection` | List view, Groups view | Collapsible section with header, card rows (quantity, name, hover preview, category editor, status chip, kebab menu) |
| `StatusChipPopover` | CardGroupSection, GridView hover actions, Picklist | Status badge + contextual action popover |
| `CardSlotBadge` | StatusChipPopover trigger, standalone badge displays | Five-state visual indicator |
| `CopyRow` | StatusChipPopover (Open/Claimed/Original popovers) | Thumbnail + printing info + action button row |
| `AddCardSearch` | CardsTab toolbar | Scryfall autocomplete + add-to-deck |
| `CardHoverPreview` + `useCardHoverPreview` | CardGroupSection rows, PicklistV2 CardRow, StatusChipPopover CopyRow | Portal-based cursor-following card image preview (200ms delay, 220px, 5:7 aspect, viewport-clamped) |
| `CardRowKebab` | CardGroupSection rows | Hover-revealed kebab → Remove + qty adjuster (non-singleton formats) |

## Anti-patterns

- **Copy-paste-modify.** Copying a row component to make a slightly different version for another view. Instead: add an optional prop.
- **View-specific names.** `GroupsViewSection` and `ListViewSection` that do 90% the same thing. Instead: one `CardGroupSection` with layout handled by the parent.
- **Divergent feature sets.** "The groups view doesn't need hover preview" — it does, you just haven't added it yet. Use the shared component and get the feature for free.
- **Inline rendering of complex rows.** If a card row has > 3 interactive elements (status chip, kebab, category editor, hover preview), it belongs in a named component, not inline JSX.

## When to create a new shared component

- You're about to write the same row/section structure for a second time
- A feature request applies to "all list views" or "everywhere cards appear"
- Two existing components have > 60% structural overlap

## When NOT to extract

- The pattern is genuinely unique to one context (e.g. the brew canvas drag-drop grid)
- Extracting would require > 5 props to handle all the branching (sign that the concerns are actually different)

## Provenance

- Authored: 2026-07-16
- Motivated by: GroupedListView and GroupsView diverging — same data, two implementations, inconsistent features. Unified into CardGroupSection.
