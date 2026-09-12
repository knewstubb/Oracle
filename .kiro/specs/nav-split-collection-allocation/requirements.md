# Requirements Document

## Introduction

This feature restructures The Oracle's primary navigation by separating "Collection" and "Allocation" into independent top-level menu items. Currently, the Collection page hosts both card browsing and allocation as internal tabs, while a separate "Shared Cards" nav entry exists at `/shared-cards`. After this change, "Collection" focuses solely on browsing the card collection, and "Allocation" replaces "Shared Cards" as its own primary navigation destination — consolidating the allocation rollup view currently housed within the Collection page tabs.

## Glossary

- **Sidebar**: The persistent left-hand navigation component rendered via `Sidebar.tsx`, containing the app's primary nav items.
- **Collection_Page**: The page at `/collection` focused on browsing owned cards (grid view, list/printing view, filtering, sorting).
- **Allocation_Page**: The new top-level page at `/allocation` that displays cards shared across multiple decks, proxy needs, and allocation status.
- **Nav_Item**: A clickable link entry in the Sidebar component representing a primary navigation destination.
- **Allocation_Rollup_Tab**: The existing "Allocation" tab content within the Collection page, rendered by the `CollectionRollupTab` component.
- **Shared_Cards_Page**: The existing page at `/shared-cards` that shows cards used in multiple decks with printing-level detail and proxy indicators.

## Requirements

### Requirement 1: Remove tab navigation from Collection page

**User Story:** As a user, I want the Collection page to focus exclusively on browsing my card collection, so that the interface is simpler and allocation concerns are separated.

#### Acceptance Criteria

1. WHEN the user navigates to `/collection`, THE Collection_Page SHALL display the card browsing view without any tab navigation (no "Collection" / "Allocation" tab strip).
2. THE Collection_Page SHALL retain all existing collection browsing functionality including grid view, list/printing view, search, sort, color identity filter, status filter, location filter, and proxy toggle.
3. THE Collection_Page SHALL no longer render the Allocation_Rollup_Tab component or any reference to allocation content.
4. WHEN a user visits `/collection?tab=allocation` (legacy URL), THE Collection_Page SHALL ignore the tab parameter and display the collection browsing view.

### Requirement 2: Create Allocation as a top-level navigation destination

**User Story:** As a user, I want Allocation to be its own primary nav item, so that I can access allocation information directly without navigating through the Collection page.

#### Acceptance Criteria

1. THE Sidebar SHALL display an "Allocation" Nav_Item that links to the `/allocation` route.
2. THE Sidebar SHALL no longer display the "Shared Cards" Nav_Item.
3. THE "Allocation" Nav_Item SHALL appear in the same position where "Shared Cards" previously appeared in the navigation order (between "Decks" and "Collection").
4. WHEN the user clicks the "Allocation" Nav_Item, THE Sidebar SHALL navigate to `/allocation`.
5. WHILE the user is on the `/allocation` route, THE "Allocation" Nav_Item SHALL display as active (highlighted).

### Requirement 3: Create Allocation page at /allocation

**User Story:** As a user, I want a dedicated Allocation page that shows me which cards are shared across decks and which need proxies, so that I can manage my physical card assignments.

#### Acceptance Criteria

1. WHEN the user navigates to `/allocation`, THE Allocation_Page SHALL render the allocation rollup content (the same functionality currently provided by the Allocation_Rollup_Tab component).
2. THE Allocation_Page SHALL have its own page header with the title "Allocation".
3. THE Allocation_Page SHALL include loading and error states consistent with other pages in the app.
4. THE Allocation_Page SHALL follow the same layout patterns (max-width container, dark background) as the Collection_Page.

### Requirement 4: Redirect legacy Shared Cards route

**User Story:** As a user who has bookmarked or is linked to the old Shared Cards URL, I want to be redirected to the new Allocation page, so that I am not shown a broken page.

#### Acceptance Criteria

1. WHEN the user navigates to `/shared-cards`, THE system SHALL redirect to `/allocation`.
2. THE redirect SHALL be a permanent (308) redirect so that search engines and bookmarks update.

### Requirement 5: Update navigation icon for Allocation

**User Story:** As a user, I want the Allocation nav item to have an appropriate icon, so that the navigation is visually clear and distinguishable from other items.

#### Acceptance Criteria

1. THE "Allocation" Nav_Item SHALL use an icon that visually communicates sharing or distribution (the existing `Copy` icon from lucide-react used by "Shared Cards" is acceptable, or a suitable alternative).
2. THE icon SHALL follow the same sizing and styling conventions as other Nav_Item icons in the Sidebar (size-5, strokeWidth 1.5).
