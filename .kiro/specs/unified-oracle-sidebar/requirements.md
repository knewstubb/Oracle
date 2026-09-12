# Requirements: Unified Oracle Sidebar

## 1. Problem Statement

The current app has **two separate conversational interfaces**:
1. **Oracle Sidebar** — Global assistant on the right side, used for deck editing, collection queries, and general questions
2. **Brew Page (`/new-deck`)** — Full-page chat + canvas for commander exploration and deck creation

This split creates confusion:
- Users don't know which interface to use for what
- Brew conversations are isolated from the rest of the app
- No way to start a brew from the sidebar ("build me a deck")
- Context switches require navigating to different pages

## 2. Outcome

A **single, persistent Oracle sidebar** that:
- Handles all conversational interactions (including brew/exploration)
- Is context-aware and adapts to the current page
- Manages conversation sessions intelligently (fresh start after inactivity)
- Allows users to browse and resume past conversations
- Replaces the dedicated `/new-deck` brew page

## 3. Users

| User | Role |
|------|------|
| Deck builder | Starts new brew sessions by chatting with Oracle |
| Collection manager | Asks Oracle about their cards while viewing collection |
| Deck editor | Gets card suggestions while editing a specific deck |
| Browser | Explores commanders/strategies with Oracle's guidance |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Sidebar state (open/closed, width) persists across sessions |
| NFR-2 | Conversation history loads within 500ms of context switch |
| NFR-3 | Sidebar renders correctly on screens 1024px+ wide; below 1024px, sidebar overlays content (mobile pattern) |
| NFR-4 | Chat sessions are persisted to database for cross-device access |
| NFR-5 | Sessions older than 90 days with no committed commander are auto-archived (hidden from default list, still retrievable) |
| NFR-6 | Maximum 100 active sessions per user; oldest auto-archive beyond this limit |

## 5. User Stories & Acceptance Criteria

### 5.1 Persistent Sidebar

**US-5.1.1** As a user, I want the Oracle sidebar to be available on every page so that I can ask questions without navigating away.

#### Acceptance Criteria
- WHEN the user opens any page in the app, THE SYSTEM SHALL display the Oracle sidebar (if previously open) or a toggle to open it.
- WHEN the user closes the sidebar, THE SYSTEM SHALL persist this preference and keep it closed on subsequent page loads.
- WHEN the user resizes the sidebar, THE SYSTEM SHALL persist the width preference.

### 5.2 Context-Aware Sessions

**US-5.2.1** As a user, I want Oracle to understand what page I'm on so that responses are relevant to my current task.

#### Acceptance Criteria
- WHEN the user navigates to a deck page, THE SYSTEM SHALL set the Oracle context to that deck (deckId, deckName, commanderName).
- WHEN the user navigates to the collection page, THE SYSTEM SHALL set the Oracle context to "collection".
- WHEN the user navigates to the Forge page, THE SYSTEM SHALL set the Oracle context to "forge".
- WHEN the user is in an exploration/brew session, THE SYSTEM SHALL set the Oracle context to "exploration" with the sessionId.

**US-5.2.2** As a user, I want Oracle to start a fresh conversation if I haven't chatted in a while, so that old context doesn't confuse new questions.

#### Acceptance Criteria
- WHEN the user sends a message and the last message in this context was more than 4 hours ago, THE SYSTEM SHALL start a new conversation session (new session ID, empty message list) while preserving access to the previous session.
- WHEN the user sends a message within 4 hours of the previous message, THE SYSTEM SHALL continue the existing session.
- WHEN a new session starts, THE SYSTEM SHALL auto-generate a name based on the first user message (using AI summarization).

### 5.3 Brew/Exploration in Sidebar

**US-5.3.1** As a user, I want to start a new deck brew by typing in the Oracle sidebar, so that I don't need to navigate to a separate page.

#### Acceptance Criteria
- WHEN the user types "I want to build a new deck" or similar intent, THE SYSTEM SHALL create a new exploration session and switch context to "exploration".
- WHEN the user types "build around [[Commander Name]]" or similar, THE SYSTEM SHALL create a new exploration session with that commander as starting context.
- WHEN a new exploration session starts, THE SYSTEM SHALL navigate the main screen to `/explore`.
- WHEN detecting brew intent, THE SYSTEM SHALL use AI classification only when current context is `general`, `collection`, or `forge` — not when already in a deck or exploration context.
- WHEN in deck context, messages like "build a new deck" SHALL be clarified by Oracle ("Do you want to start a new brew, or modify this deck?") rather than auto-switching.

**US-5.3.2** As a user, I want to see commander suggestions on the main screen while Oracle describes them in chat.

#### Acceptance Criteria
- WHEN Oracle suggests commanders during exploration, THE SYSTEM SHALL display them on the `/explore` screen with "Commit" buttons.
- WHEN no commanders have been suggested yet, THE SYSTEM SHALL display a holding screen with guidance ("Chat with Oracle to explore commanders").
- WHEN the user clicks "Commit" on a commander, THE SYSTEM SHALL create the deck and navigate to `/decks/[id]`.
- WHEN the user opens `/explore` directly (not via chat trigger), THE SYSTEM SHALL show the commander browser (merged Forge functionality) alongside the holding screen prompt.

**US-5.3.3** As a user, I want to commit a commander from the chat by clicking a crown icon, as an alternative to the main screen.

#### Acceptance Criteria
- WHEN Oracle mentions a commander in chat during exploration, THE SYSTEM SHALL render it with a crown icon button.
- WHEN the user clicks the crown icon, THE SYSTEM SHALL commit that commander and create the deck.

### 5.4 Session History (Brew History)

**US-5.4.1** As a user, I want to see a list of my past exploration sessions so that I can resume incomplete brews.

#### Acceptance Criteria
- WHEN the user opens the session history panel, THE SYSTEM SHALL display a list of exploration sessions with: name, commander (if committed), status (exploring/building/complete), last updated date.
- WHEN the user clicks on a session, THE SYSTEM SHALL load that session's conversation and switch to exploration context.
- WHEN a session has been inactive for 30+ days and has no committed commander, THE SYSTEM SHALL mark it as "archived" (still accessible but visually de-emphasized).

**US-5.4.2** As a user, I want each session to have a descriptive name so I can identify them later.

#### Acceptance Criteria
- WHEN a new session is created, THE SYSTEM SHALL auto-generate a name after the first AI response (not the first user message), using the response content to infer the topic.
- WHEN the AI generates a name, THE SYSTEM SHALL use a short phrase (3-6 words) that captures the exploration intent (e.g., "Sacrifice aristocrats exploration", "Zedruu politics build").
- WHEN the first user message is vague (e.g., "hi", "help"), THE SYSTEM SHALL wait for a substantive exchange before naming.
- WHEN the user wants to rename a session, THE SYSTEM SHALL allow manual renaming via an edit action in the session history panel.

### 5.5 Deck-Context Sessions

**US-5.5.1** As a user, I want Oracle to remember our conversation about a specific deck so I can continue where I left off.

#### Acceptance Criteria
- WHEN the user navigates to a deck and sends a message, THE SYSTEM SHALL load the most recent session for that deck (if within 4 hours).
- WHEN the deck has no recent session, THE SYSTEM SHALL start a fresh session tied to that deck.
- WHEN the user navigates away and returns, THE SYSTEM SHALL restore the session if still within the 4-hour window.

### 5.6 Default Landing & Navigation

**US-5.6.1** As a user, I want a clear starting point when I open the app so I know where to begin.

#### Acceptance Criteria
- WHEN the user opens the app without a specific destination, THE SYSTEM SHALL display the deck list (`/decks`) as the default landing page.
- WHEN the user has no decks, THE SYSTEM SHALL show an empty state with a prompt to start a brew ("Chat with Oracle to build your first deck").
- WHEN the user navigates to `/explore`, THE SYSTEM SHALL display the merged Forge/Exploration view with commander browsing and Oracle chat integration.

**US-5.6.2** As a user, I want the navigation to reflect the new unified structure.

#### Acceptance Criteria
- WHEN the user views the main navigation, THE SYSTEM SHALL show: Decks, Explore, Collection (removing the separate "Forge" and "New Deck" entries).
- WHEN the user clicks "Explore", THE SYSTEM SHALL navigate to `/explore` and open the Oracle sidebar if closed.
- WHEN the user is on `/explore` with an active exploration session, THE SYSTEM SHALL display that session in the sidebar.

## 6. In Scope

- Unified sidebar replacing `/new-deck` page
- Context-aware session management
- Exploration/brew flow in sidebar with visual output on `/explore` page
- Session history panel with two tabs: Explorations and Deck Conversations
- Auto-naming of sessions (after first AI response)
- 4-hour session continuity window (following Gemini/Claude patterns)
- Merge Forge into `/explore` page
- AI-based intent detection for brew triggers (in non-deck contexts only)
- Navigation restructure: Decks, Explore, Collection

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Mobile-specific sidebar behavior | Requires separate mobile UX design |
| Voice input | Future enhancement |
| Multi-user/shared sessions | Single-user app |
| Session export/sharing | Future enhancement |
| Full conversation search | Complexity; can add later |

## 8. Resolved Questions

| # | Question | Resolution |
|---|----------|------------|
| 1 | Should deck-context sessions be separate from exploration sessions in the history view? | **Yes, separate.** Two tabs in session history: "Explorations" and "Deck Conversations". |
| 2 | Should the Exploration main screen be a new page (`/explore`) or a modal/overlay? | **New page `/explore`.** URL is bookmarkable, consistent with navigation patterns. |
| 3 | What happens to the current Forge page? | **Merge into `/explore`.** Forge functionality (commander browsing/filtering) becomes part of the Exploration page. Users can browse directly or get Oracle suggestions. |

## 9. Dependencies

- Current Oracle sidebar implementation (`OracleContext.tsx`, `OracleSidebar.tsx`)
- Current brew session infrastructure (`brew_sessions` table, `/api/brew/*` endpoints)
- Current Forge page for commander browsing (to be merged)
- Navigation components for restructure

## 10. Migration & Deprecation

| Item | Action |
|------|--------|
| `/new-deck` page | Deprecate and redirect to `/explore` |
| `/forge` page | Deprecate and redirect to `/explore` |
| `BrewChatView` component | Functionality absorbed into unified `OracleSidebar` |
| `brew_sessions` table | Extend with `session_name` column; reuse for exploration sessions |
| `oracle_messages` table | Extend to link to `brew_sessions.id` for exploration context |

## Provenance

- **Authored:** 2026-08-12 by Margaret (Developer) based on user direction
- **Reviewed:** 2026-08-12 by Gene (Delivery Lead) — added NFRs 5-6, intent detection clarity, session naming timing, navigation restructure, migration plan
- **Motivated by:** User request to unify conversational interfaces into a single persistent sidebar
