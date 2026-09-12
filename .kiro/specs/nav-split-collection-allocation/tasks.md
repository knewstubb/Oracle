# Implementation Plan: Nav Split Collection & Allocation

## Overview

Restructure the primary navigation by splitting Collection and Allocation into independent top-level routes. Replace the "Shared Cards" nav item with "Allocation", create a new `/allocation` page reusing the existing `CollectionRollupTab` component, remove tab navigation from the Collection page, and add a 308 redirect from `/shared-cards` to `/allocation`.

## Tasks

- [x] 1. Create the Allocation page route
  - [x] 1.1 Create `src/app/allocation/page.tsx` with page header and `CollectionRollupTab`
    - Render a page header with title "Allocation"
    - Import and render `<CollectionRollupTab />` as the page content
    - Follow the same layout patterns as Collection page (max-width container, dark background)
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 1.2 Create `src/app/allocation/loading.tsx` loading skeleton
    - Implement a loading skeleton consistent with other pages in the app
    - _Requirements: 3.3_

  - [x] 1.3 Create `src/app/allocation/error.tsx` error boundary
    - Client component with retry button that calls `reset()`
    - Follow the same error boundary pattern as `src/app/collection/error.tsx`
    - _Requirements: 3.3_

- [x] 2. Update Sidebar navigation
  - [x] 2.1 Replace "Shared Cards" nav item with "Allocation" in `src/components/Sidebar.tsx`
    - Change `navItems` array entry: `{ label: 'Allocation', icon: Copy, href: '/allocation' }`
    - Keep the `Copy` icon from lucide-react
    - Maintain the same position in the nav order (between "Decks" and "Collection")
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2_

  - [ ]* 2.2 Update Sidebar tests in `src/components/Sidebar.test.tsx`
    - Update assertions: replace "Shared Cards" references with "Allocation"
    - Update active-state test for `/allocation` route instead of `/shared-cards`
    - Verify nav item order (Decks, Allocation, Collection)
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

- [x] 3. Remove tab navigation from Collection page
  - [x] 3.1 Simplify `src/app/collection/page.tsx` to remove tabs
    - Remove `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` imports and usage
    - Remove `CollectionRollupTab` import
    - Remove `activeTab`/`handleTabChange` state logic
    - Remove `useSearchParams`/`useRouter` for tab param handling
    - Page renders the browsing view content directly (no tab wrapper)
    - Legacy `?tab=allocation` param is simply ignored (not read, no redirect)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Checkpoint - Verify pages render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Configure redirect and clean up legacy route
  - [x] 5.1 Add 308 redirect from `/shared-cards` to `/allocation` in `next.config.ts`
    - Add to the `redirects` async function: `{ source: '/shared-cards', destination: '/allocation', permanent: true }`
    - _Requirements: 4.1, 4.2_

  - [x] 5.2 Delete legacy `/shared-cards` route files
    - Remove `src/app/shared-cards/page.tsx`
    - Remove `src/app/shared-cards/loading.tsx`
    - Remove `src/app/shared-cards/error.tsx`
    - Remove `src/app/shared-cards/page.test.tsx`
    - _Requirements: 2.2, 4.1_

- [ ] 6. Write tests for new pages
  - [ ]* 6.1 Write unit tests for Allocation page
    - Test that `CollectionRollupTab` content is rendered
    - Test that "Allocation" heading is present
    - Test loading skeleton renders in loading state
    - Test error state renders with retry button
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 6.2 Write unit tests for simplified Collection page
    - Test that no tab navigation is rendered
    - Test that `CollectionRollupTab` is not rendered
    - Test that grid/list view toggle, search, sort, and filters remain functional
    - Test that `?tab=allocation` param is ignored (page still renders browsing view)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- No property-based tests are included — this is a UI navigation restructure with no pure functions or data transformations
- The `CollectionRollupTab` component is reused as-is; no modifications needed to it
- The redirect is handled at the framework level in `next.config.ts` (no page component needed for `/shared-cards`)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1"] },
    { "id": 2, "tasks": ["5.1", "5.2"] },
    { "id": 3, "tasks": ["6.1", "6.2"] }
  ]
}
```
