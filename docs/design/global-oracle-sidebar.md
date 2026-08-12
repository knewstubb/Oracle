# Global Oracle Sidebar

## Overview

Oracle becomes a global AI assistant accessible from any page via a collapsible sidebar. It can understand context from the current page, query your collection and decks, and take actions across the app.

## User Experience

### Sidebar Behavior

- **Toggle**: Button in the app header or keyboard shortcut (Cmd+O?)
- **Position**: Right edge of screen, slides in/out
- **Width**: ~400px (similar to current ChatPanel)
- **Persistence**: Open/closed state persists across navigation
- **Resize**: Draggable edge to adjust width

### Context Awareness

Oracle infers context from:
1. **Current page**: `/decks/123` → "this deck" means deck 123
2. **Selected items**: If you have cards selected, Oracle knows
3. **Explicit mentions**: "In my Korvold deck..." overrides page context

Context indicator at top of sidebar shows current scope:
- "Viewing: Doom Awaits (deck)"
- "Viewing: Your Collection"
- "Viewing: All Decks"
- "Viewing: The Forge (new deck)"

### Conversation Continuity

- Single conversation thread that persists across pages
- Context shifts are noted: "Now viewing Korvold deck"
- Can reference earlier conversation: "Add those cards we discussed to this deck"

## Architecture

### State Management

```typescript
// Global Oracle context (React Context + localStorage persistence)
interface OracleState {
  isOpen: boolean
  width: number
  messages: ChatMessage[]
  activeContext: OracleContext
  sessionId: string
}

interface OracleContext {
  type: 'collection' | 'deck' | 'deck-list' | 'forge' | 'general'
  deckId?: number
  deckName?: string
  commanderName?: string
}
```

### Provider Hierarchy

```
<OracleProvider>          // Global state, persisted
  <AppLayout>
    <Header />            // Oracle toggle button
    <MainContent>
      <PageContent />     // Sets context via useOracleContext()
    </MainContent>
    <OracleSidebar />     // Conditionally rendered based on isOpen
  </AppLayout>
</OracleProvider>
```

### Context Setting

Each page sets its context on mount:

```typescript
// In /decks/[id]/page.tsx
const { setContext } = useOracle()

useEffect(() => {
  setContext({
    type: 'deck',
    deckId: deck.id,
    deckName: deck.name,
    commanderName: deck.commander_name,
  })
}, [deck])
```

### API Changes

The `/api/brew/chat` endpoint (or new `/api/oracle/chat`) needs to:

1. Accept context type and IDs
2. Load relevant data based on context
3. Have tools that can operate across contexts

New/modified tools:
- `collection_lookup` — already exists, works globally
- `deck_context` — modify to accept deckId param (not just "current deck")
- `deck_list` — new tool to query all user's decks
- `add_card_to_deck` — new tool, takes deckId + cardName
- `remove_card_from_deck` — new tool
- `move_card_between_decks` — new tool
- `create_deck` — new tool (output of The Forge)

## Components

### OracleSidebar

```typescript
interface OracleSidebarProps {
  // No props — reads from OracleContext
}

function OracleSidebar() {
  const { isOpen, messages, activeContext, sendMessage } = useOracle()
  
  if (!isOpen) return null
  
  return (
    <aside className="fixed right-0 top-0 h-full w-[400px] ...">
      <OracleHeader context={activeContext} />
      <MessageList messages={messages} />
      <OracleInput onSend={sendMessage} />
    </aside>
  )
}
```

### OracleHeader

Shows current context with ability to change:
- Icon indicating context type (deck/collection/etc)
- Name of current scope
- Dropdown to switch context manually

### Integration with Existing Pages

**Collection page** (`/collection`):
- Context: `{ type: 'collection' }`
- Oracle can: search collection, suggest decks to build, find unused staples

**Deck list page** (`/decks`):
- Context: `{ type: 'deck-list' }`
- Oracle can: compare decks, find shared cards, suggest consolidation

**Deck page** (`/decks/[id]`):
- Context: `{ type: 'deck', deckId, deckName, commanderName }`
- Oracle can: tune deck, suggest cuts/adds, explain card choices
- Actions update the deck in real-time (no page reload)

**New deck / Forge** (`/new-deck`):
- Context: `{ type: 'forge' }` initially
- After commander selection: `{ type: 'deck', deckId: null, ... }` (unsaved deck)
- Oracle can: explore commanders, commit selection, build deck

## Migration Path

### Phase 1: Infrastructure
1. Create `OracleProvider` and `useOracle` hook
2. Create `OracleSidebar` component (initially just the shell)
3. Add toggle button to header
4. Wire up context setting on key pages

### Phase 2: Unify Chat
1. Move chat state from page-level to Oracle context
2. Migrate `/new-deck` to use Oracle sidebar instead of embedded ChatPanel
3. Remove DeckChatTab, use Oracle sidebar on deck pages

### Phase 3: Global Tools
1. Add `deck_list` tool
2. Add `add_card_to_deck` tool (with deckId param)
3. Add `remove_card_from_deck` tool
4. Add `move_card_between_decks` tool
5. Update system prompts for global context

### Phase 4: Polish
1. Conversation persistence (localStorage or DB)
2. Context switching UX
3. Keyboard shortcuts
4. Mobile responsiveness

## Decisions

1. **Conversation persistence**: Permanent — stored in DB, survives logout
2. **Multiple conversations**: Single thread for now, can add "new conversation" later
3. **The Forge integration**: Becomes a page that sets Oracle context to `{ type: 'forge' }`
4. **Real-time updates**: React Query invalidation — Oracle actions call `queryClient.invalidateQueries()` for affected data

## File Changes Summary

New files:
- `src/contexts/OracleContext.tsx` — Provider and hook
- `src/components/OracleSidebar.tsx` — Sidebar UI
- `src/components/OracleHeader.tsx` — Context indicator
- `src/app/api/oracle/chat/route.ts` — New unified chat endpoint (or modify existing)

Modified files:
- `src/app/layout.tsx` — Wrap with OracleProvider
- `src/components/Header.tsx` — Add Oracle toggle
- `src/app/decks/[id]/page.tsx` — Set context, remove DeckChatTab
- `src/app/new-deck/page.tsx` — Use Oracle sidebar instead of ChatPanel
- `src/app/collection/page.tsx` — Set context
- `src/lib/brew-tools.ts` — Add new global tools

Removed files:
- `src/components/DeckChatTab.tsx` — Replaced by Oracle sidebar
- `src/components/brew-v2/ChatPanel.tsx` — Merged into OracleSidebar (or kept as shared component)
