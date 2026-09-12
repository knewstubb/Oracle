# Tasks: Unified Oracle Sidebar

> Feature: Unified Oracle Sidebar
> Status: In Progress (Phases 1-5 complete, Phase 6-7 complete except cleanup)
> Created: 2026-08-12
> Updated: 2026-08-12
> Owner: Margaret (Developer), with Charity (DevOps) for DB migrations

**Blocker:** User needs to run `20260812100000_extend_oracle_sessions.sql` migration manually — the RPC was applied but the schema ALTER TABLE was not. See delivery-log.md for SQL.

---

## Phase 1: Database & API Foundation

### 1.1 Extend session schema
- [ ] Add `session_name` column to `brew_sessions` table (nullable, varchar 100)
- [ ] Add `session_type` column: `exploration` | `deck` | `general` | `collection`
- [ ] Add `last_message_at` timestamp column for 4-hour window logic
- [ ] Add `archived_at` timestamp column (nullable) for soft archive
- [ ] Add `context_deck_id` column (nullable FK to decks) for deck-context sessions
- [ ] Create migration file and apply to Supabase

**AC refs:** US-5.2.2, US-5.4.2, US-5.5.1, NFR-4, NFR-5

### 1.2 Session API endpoints
- [ ] `POST /api/oracle/sessions` — Create new session (type, context)
- [ ] `GET /api/oracle/sessions` — List sessions (paginated, filterable by type)
- [ ] `GET /api/oracle/sessions/[id]` — Get session with messages
- [ ] `PATCH /api/oracle/sessions/[id]` — Update session (name, archived)
- [ ] `GET /api/oracle/sessions/active` — Get active session for context (respects 4-hour window)

**AC refs:** US-5.2.2, US-5.4.1, US-5.5.1, NFR-2

### 1.3 Session naming API
- [ ] `POST /api/oracle/sessions/[id]/generate-name` — AI-generated name from first response
- [ ] Implement naming logic: extract topic from AI response, generate 3-6 word phrase
- [ ] Handle vague first messages ("hi", "help") — defer naming until substantive exchange

**AC refs:** US-5.4.2

### 1.4 Auto-archive job
- [ ] Create Supabase function or cron job for 90-day archive rule
- [ ] Implement 100-session limit per user (archive oldest)
- [ ] Add `archived` filter to session list endpoint

**AC refs:** NFR-5, NFR-6

---

## Phase 2: OracleContext Refactor

### 2.1 Extend OracleContext state
- [ ] Add `sessionId` to context state
- [ ] Add `sessionType` to context state
- [ ] Add `sessionName` to context state  
- [ ] Add `lastMessageAt` timestamp to context state
- [ ] Add `isHistoryPanelOpen` boolean

**AC refs:** US-5.2.1, US-5.2.2

### 2.2 Session continuity logic
- [ ] On context change, check for active session (< 4 hours)
- [ ] If active session exists, load it; otherwise create new
- [ ] Implement `startFreshSession()` for manual reset (future use)
- [ ] Persist `lastMessageAt` on every message send

**AC refs:** US-5.2.2, US-5.5.1

### 2.3 Context detection from route
- [ ] `/decks/[id]` → deck context with deckId, deckName, commanderName
- [ ] `/collection` → collection context
- [ ] `/explore` → exploration context (or general if no active session)
- [ ] All other routes → general context

**AC refs:** US-5.2.1

### 2.4 Sidebar state persistence
- [ ] Persist open/closed state to localStorage
- [ ] Persist width preference to localStorage
- [ ] Restore on app load

**AC refs:** US-5.1.1, NFR-1

---

## Phase 3: Sidebar UI Updates

### 3.1 Header redesign
- [ ] Add context icon (MessageSquare, Library, Layers, Sparkles)
- [ ] Add context label and subtitle (commander name for decks)
- [ ] Add WUBRG color bar for deck context
- [ ] Add history toggle button
- [ ] Style per design.md specifications

**AC refs:** US-5.2.1, design.md §1

### 3.2 Context bar component
- [ ] Create collapsible `ContextBar` component
- [ ] Show session name, time since start, message count
- [ ] Implement expand/collapse with chevron
- [ ] Add teal left border for exploration sessions

**AC refs:** design.md §2

### 3.3 Message rendering updates
- [ ] Add Oracle avatar (sparkle icon) to assistant messages
- [ ] Ensure card ownership colors render correctly (owned/proxy/unowned)
- [ ] Style user messages (right-aligned, rounded)
- [ ] Style Oracle messages (left-aligned, transparent bg)

**AC refs:** design.md §3

### 3.4 Commander suggestion cards in chat
- [ ] Create `CommanderSuggestionCard` component for exploration context
- [ ] Show card image (60×84), name, color pips, type line
- [ ] Add crown icon "Commit" button
- [ ] Wire commit action to deck creation flow

**AC refs:** US-5.3.2, US-5.3.3, design.md §3

### 3.5 Input area updates
- [ ] Add context indicator below input ("Chatting about: Korvold deck")
- [ ] Style send button per design.md
- [ ] Ensure auto-expand works (1-5 lines)

**AC refs:** design.md §4

### 3.6 Empty state
- [ ] Create empty state component with sparkle icon
- [ ] Add clickable suggestions that fill input
- [ ] Context-aware suggestions (different for collection vs general)

**AC refs:** design.md States §1

### 3.7 Loading and streaming states
- [ ] Add skeleton loader for history loading
- [ ] Add typing indicator (three dots animation)
- [ ] Add "Oracle is thinking..." indicator

**AC refs:** design.md States §2, §3

---

## Phase 4: Session History Panel

### 4.1 History panel component
- [ ] Create `SessionHistoryPanel` component
- [ ] Implement slide-in overlay behavior (from right)
- [ ] Add close button and backdrop click to close

**AC refs:** US-5.4.1, design.md §5

### 4.2 Tab bar
- [ ] Create tabs: "Explorations" and "Deck Chats"
- [ ] Style active/inactive tabs per design.md
- [ ] Wire tab switching to filter sessions

**AC refs:** US-5.4.1

### 4.3 Session list
- [ ] Fetch and display sessions grouped by date
- [ ] Implement date groupings: Today, Yesterday, Last 7 Days, Last 30 Days, Older
- [ ] Style session rows (Claude-style simple list)
- [ ] Add status indicators (dot for active/building)
- [ ] Truncate names at 30 chars with tooltip

**AC refs:** US-5.4.1, design.md §5

### 4.4 Session actions
- [ ] Click session → load and switch context
- [ ] Rename session (edit icon → inline edit)
- [ ] Archive session (via context menu or swipe on mobile)

**AC refs:** US-5.4.1, US-5.4.2

---

## Phase 5: Intent Detection & Exploration Flow

### 5.1 Brew intent detection
- [ ] Create intent classification prompt for AI
- [ ] Detect "build a deck", "build around [[commander]]", etc.
- [ ] Only trigger in general/collection/forge contexts (not deck context)
- [ ] In deck context, ask clarifying question instead

**AC refs:** US-5.3.1

### 5.2 Exploration session creation
- [ ] On brew intent detected, create exploration session
- [ ] Navigate to `/explore` 
- [ ] Open sidebar if closed
- [ ] Set context to exploration with new sessionId

**AC refs:** US-5.3.1

### 5.3 Commander extraction from AI responses
- [ ] Parse AI responses for commander suggestions
- [ ] Extract commander names and look up in `ref_commanders`
- [ ] Store suggested commanders in session state
- [ ] Emit event to update `/explore` page

**AC refs:** US-5.3.2

### 5.4 Commit flow
- [ ] On crown icon click in chat OR commit button on `/explore`
- [ ] Create deck with selected commander
- [ ] Update session status to "building"
- [ ] Navigate to `/decks/[newDeckId]`
- [ ] Switch context to deck context

**AC refs:** US-5.3.2, US-5.3.3

---

## Phase 6: /explore Page

### 6.1 Create /explore route
- [x] Create `app/explore/page.tsx`
- [x] Set up basic layout with sidebar integration

**AC refs:** US-5.6.1

### 6.2 Holding state component
- [x] Create `ExploreHoldingState` component
- [x] Sparkle icon, title, subtitle, "or" divider
- [x] Style per design.md

**AC refs:** US-5.3.2, design.md /explore §1

### 6.3 Suggested commanders section
- [x] Create `SuggestedCommanders` component
- [x] Horizontal scrollable row of commander cards
- [x] Commit button on each card
- [x] Teal border styling

**AC refs:** US-5.3.2, design.md /explore §2

### 6.4 Merge Forge browser
- [x] Copy/adapt commander grid from `/forge`
- [x] Add "Start Brew" action to commander cards
- [x] Add hover state styling (teal outline)
- [x] Wire filters (color identity, etc.)

**AC refs:** US-5.6.1, design.md /explore §3

### 6.5 Responsive layout
- [ ] Desktop: Grid with sidebar
- [ ] Mobile: 2-column grid, horizontal scroll for suggestions

**AC refs:** NFR-3, design.md Mobile

---

## Phase 7: Navigation & Routing

### 7.1 Update main navigation
- [x] Change nav items to: Decks, Explore, Collection
- [x] Remove "Forge" and "New Deck" entries
- [x] Update icons as needed

**AC refs:** US-5.6.2

### 7.2 Redirects
- [x] `/new-deck` → redirect to `/explore`
- [ ] `/forge` → redirect to `/explore`

**AC refs:** Migration plan

### 7.3 Explore auto-opens sidebar
- [x] When navigating to `/explore`, open sidebar if closed
- [x] If exploration session exists, load it

**AC refs:** US-5.6.2

### 7.4 Decks empty state
- [ ] Update `/decks` empty state to prompt brewing
- [ ] "Chat with Oracle to build your first deck" with CTA

**AC refs:** US-5.6.1

---

## Phase 8: Mobile Behavior

### 8.1 Overlay mode (<1024px)
- [ ] Detect viewport width
- [ ] Switch sidebar to overlay mode on mobile
- [ ] Add backdrop with tap-to-close
- [ ] Increase close button touch target (44×44)

**AC refs:** NFR-3, design.md Mobile §1

### 8.2 Floating action button
- [ ] Create `OracleFAB` component
- [ ] Show when sidebar closed on mobile
- [ ] Position bottom-right
- [ ] Tap opens sidebar overlay

**AC refs:** design.md Mobile §2

### 8.3 Swipe gesture
- [ ] Add swipe-right-to-close gesture on overlay
- [ ] Respect reduced motion preference

**AC refs:** design.md Mobile §1

---

## Phase 9: Accessibility & Polish

### 9.1 Keyboard navigation
- [ ] `Esc` closes sidebar
- [ ] `Cmd+Shift+O` toggles sidebar
- [ ] `Enter` sends message
- [ ] `Shift+Enter` adds newline
- [ ] Arrow keys navigate session history

**AC refs:** design.md Accessibility §1

### 9.2 Focus management
- [ ] Focus input when sidebar opens
- [ ] Return focus to trigger when sidebar closes
- [ ] Focus first session when history panel opens

**AC refs:** design.md Accessibility §2

### 9.3 Screen reader announcements
- [ ] Announce sidebar open/close
- [ ] Announce context changes
- [ ] Announce streaming start/end
- [ ] Announce session list count

**AC refs:** design.md Accessibility §3

### 9.4 Reduced motion
- [ ] Gate all animations behind `prefers-reduced-motion`
- [ ] Provide instant transitions as fallback

**AC refs:** design.md Animation

### 9.5 Error handling
- [ ] Add error banner component for API failures
- [ ] Add retry button
- [ ] Handle session load failures gracefully

**AC refs:** design.md States §4

---

## Phase 10: Cleanup & Deprecation

### 10.1 Remove old components
- [ ] Delete `/new-deck` page
- [ ] Delete `BrewChatView` component (or mark deprecated)
- [ ] Delete `/forge` page (after confirming `/explore` works)

**AC refs:** Migration plan

### 10.2 Update imports
- [ ] Find all imports of removed components
- [ ] Update or remove references

### 10.3 Documentation
- [ ] Update `delivery-log.md` with completion notes
- [ ] Update `product-spec.md` with feature summary
- [ ] Update any user-facing docs if applicable

---

## Estimated Effort

| Phase | Effort | Notes |
|-------|--------|-------|
| 1. Database & API | 1 day | Charity for migrations |
| 2. OracleContext | 0.5 day | Refactor existing context |
| 3. Sidebar UI | 1.5 days | Significant styling work |
| 4. History Panel | 1 day | New component |
| 5. Intent Detection | 1 day | AI integration complexity |
| 6. /explore Page | 1 day | Merge Forge + new components |
| 7. Navigation | 0.5 day | Routing changes |
| 8. Mobile | 0.5 day | Responsive + gestures |
| 9. Accessibility | 0.5 day | Polish pass |
| 10. Cleanup | 0.5 day | Remove old code |
| **Total** | **~8 days** | |

---

## Dependencies Between Phases

```
Phase 1 (DB) ─────┬─────► Phase 2 (Context) ───► Phase 3 (UI) ───► Phase 9 (A11y)
                  │                                    │
                  │                                    ▼
                  └─────► Phase 4 (History) ──────► Phase 5 (Intent) ───► Phase 6 (/explore)
                                                                               │
                                                                               ▼
                                                                         Phase 7 (Nav)
                                                                               │
                                                                               ▼
                                                                         Phase 8 (Mobile)
                                                                               │
                                                                               ▼
                                                                         Phase 10 (Cleanup)
```

---

## Provenance

- **Authored:** 2026-08-12 by Gene (Delivery Lead)
- **Based on:** requirements.md, design.md
- **Ready for:** Margaret to begin Phase 1
