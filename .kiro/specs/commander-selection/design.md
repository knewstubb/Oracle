# Design: Commander Selection View

> Last updated: 2024-08-12
> Status: Draft
> Reference implementation: `/app/src/app/decks/new/page.tsx` (to be created)

## Design Goals

- Replace the standalone "Forge" view with a simpler commander selection experience
- Leverage the global Oracle sidebar for all conversational interaction
- Provide multiple paths to selecting a commander: browse, search, filter, or chat
- Transition seamlessly to the workbench view once a commander is selected

## User Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  User clicks "New Deck" or "Build [Commander]" button               │
│                           │                                         │
│                           ▼                                         │
│         ┌─────────────────┴─────────────────┐                       │
│         │                                   │                       │
│         ▼                                   ▼                       │
│  No commander known              Commander known (from URL)         │
│         │                                   │                       │
│         ▼                                   ▼                       │
│  Commander Selection View         Workbench View (existing)         │
│  - Random featured commanders     - Commander with crown            │
│  - Search/filter controls         - Deck building interface         │
│  - Oracle prompt                  - Oracle in workbench context     │
│         │                                                           │
│         │ User selects commander                                    │
│         ▼                                                           │
│  Workbench View ─────────────────────────────────────────────────►  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Screens & Components

### Page: Commander Selection (`/decks/new`)

**Layout:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ [← Back to Decks]                                        [Oracle Toggle] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                     Choose Your Commander                                │
│                                                                          │
│     ┌─────────────────────────────────────────────────────────────┐     │
│     │  🔍 Search commanders...                    [Color Filters]  │     │
│     └─────────────────────────────────────────────────────────────┘     │
│                                                                          │
│     ┌─────────────────────────────────────────────────────────────┐     │
│     │                                                             │     │
│     │   💬 Not sure where to start?                               │     │
│     │   Tell Oracle what you're looking for — a playstyle,        │     │
│     │   a color combination, or just a vibe.                      │     │
│     │                                                    [Chat →] │     │
│     │                                                             │     │
│     └─────────────────────────────────────────────────────────────┘     │
│                                                                          │
│     ── Featured Commanders ──────────────────────────────────────────    │
│                                                                          │
│     ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│     │  Card   │  │  Card   │  │  Card   │  │  Card   │  │  Card   │     │
│     │  Image  │  │  Image  │  │  Image  │  │  Image  │  │  Image  │     │
│     │         │  │         │  │         │  │         │  │         │     │
│     │ Korvold │  │ Prosper │  │ Wilhelt │  │ Atraxa  │  │ Krenko  │     │
│     │   BRG   │  │   BR    │  │   UB    │  │  WUBG   │  │    R    │     │
│     └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │
│                                                                          │
│     ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│     │  Card   │  │  Card   │  │  Card   │  │  Card   │  │  Card   │     │
│     │  Image  │  │  Image  │  │  Image  │  │  Image  │  │  Image  │     │
│     │         │  │         │  │         │  │         │  │         │     │
│     └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │
│                                                                          │
│                         [🎲 Shuffle]                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**States:**
- **Default:** Shows 10 randomized popular commanders, search bar, Oracle prompt
- **Searching:** Shows filtered results based on search text
- **Filtered:** Shows commanders matching color identity filter
- **Empty:** "No commanders match your filters" with reset option

### Component: CommanderCard

Clickable card tile showing:
- Card art (image_uri_art_crop or normal)
- Commander name
- Color identity pips
- Optional: EDHREC rank badge for popular commanders

**Interactions:**
- Click → Creates deck with commander, navigates to `/decks/[id]`
- Hover → Show full card image preview (reuse CardHoverPreview)

### Component: ColorIdentityFilter

Horizontal row of mana symbol buttons:
- W U B R G (toggleable, multiple selection)
- Colorless option
- "Any" default state (nothing selected)

Logic: Show commanders whose color identity is a subset of selected colors.

### Component: OraclePromptCard

Styled card encouraging chat:
- Icon: 💬 or Oracle logo
- Copy: "Not sure where to start? Tell Oracle what you're looking for..."
- Button: "Chat →" opens Oracle sidebar

## Interactions

### Commander Selection
1. User clicks a commander card
2. System creates a new deck (draft status) with that commander
3. Navigates to `/decks/[newDeckId]`
4. Workbench view loads with commander displayed

### Oracle-Assisted Selection
1. User opens Oracle sidebar (or clicks "Chat →")
2. Oracle context: `{ type: 'commander-selection' }` (new context type)
3. User asks: "I want a graveyard commander in Golgari"
4. Oracle responds with suggestions, mentions [[Commander Name]]
5. User clicks [[Commander Name]] in chat
6. Same flow as direct selection: create deck, navigate

### Search
1. User types in search box
2. Debounced search (300ms) queries `ref_commanders` by display_name
3. Results replace the featured grid
4. Clicking a result follows commander selection flow

### Color Filter
1. User toggles color identity buttons
2. Featured/search results filter to matching commanders
3. Filter persists across search queries
4. "Any" resets to show all

## Accessibility Notes

- Commander cards are focusable with keyboard navigation
- Enter/Space selects the focused commander
- Color filter buttons have aria-pressed state
- Search has appropriate labeling and live region for results count

## Design Decisions & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Random featured commanders | Weighted by EDHREC popularity | Fully random | Popular commanders are more likely to be useful starting points |
| Create deck on selection | Immediate | Require confirmation | Faster flow; user can always delete unwanted decks |
| Color filter UX | Multi-select toggles | Dropdown | Visual mana symbols are more intuitive for MTG players |
| Oracle context type | New 'commander-selection' | Reuse 'forge' | Cleaner separation; forge context was tied to old view |

## Open Questions

1. Should we show the user's owned commanders first/highlighted?
2. Should search include archetype/theme tags (e.g., "aristocrats")?
3. Partner commanders — how to handle selecting both halves?

---

## Architecture

### Route

`/decks/new` — New page for commander selection

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  ref_commanders │────▶│ CommanderSelect │────▶│  Create Deck    │
│  (DB lookup)    │     │  (React state)  │     │  (API call)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ Navigate to     │
                                                │ /decks/[id]     │
                                                └─────────────────┘
```

### API Endpoints

**GET `/api/commanders/featured`**
Returns 10 random popular commanders for the default view.
```typescript
Response: {
  commanders: Array<{
    canonicalKey: string
    displayName: string
    colorIdentity: string
    artUrl: string
    edhrecRank: number | null
  }>
}
```

**GET `/api/commanders/search?q=name&colors=WUB`**
Search/filter commanders.
```typescript
Response: {
  commanders: Array<CommanderSummary>
  total: number
}
```

**POST `/api/decks`**
Create a new deck with commander. (May already exist — verify)

### Oracle Context

Add new context type: `'commander-selection'`

When Oracle is in this context:
- System prompt emphasizes commander recommendations
- Clicking [[Commander Name]] triggers commander selection
- Tools available: `search_commanders`, `get_commander_info`

### Components to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| `CommanderSelectionPage` | `app/decks/new/page.tsx` | Main page component |
| `CommanderGrid` | `components/commander-selection/CommanderGrid.tsx` | Grid of commander cards |
| `CommanderCard` | `components/commander-selection/CommanderCard.tsx` | Individual commander tile |
| `ColorIdentityFilter` | `components/commander-selection/ColorIdentityFilter.tsx` | Mana color toggles |
| `OraclePromptCard` | `components/commander-selection/OraclePromptCard.tsx` | CTA to open Oracle |

### Components to Deprecate

| Component | Reason |
|-----------|--------|
| `BrewChatView` | Embedded chat replaced by Oracle sidebar |
| `BrewCanvas` (phase 1 mode) | Commander candidates now in dedicated view |
| Forge context handling | Replaced by commander-selection context |

## Trade-offs & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| New route `/decks/new` | Yes | Reuse `/decks/[id]` with draft state | Cleaner separation; deck list shows real decks only |
| Random featured | Weighted by popularity | User's collection | Most users want inspiration, not just owned cards |
| Oracle click → select | Direct selection | Add to shortlist | Faster; shortlist adds complexity |

## Migration Path

1. Create new `/decks/new` route with commander selection
2. Update "New Deck" button to point to `/decks/new`
3. Update Oracle navigate_prompt to use `/decks/new?commander=key`
4. Deprecate `/new-deck` (old Forge) route
5. Remove BrewChatView and related forge components
