# Requirements Document

## Introduction

Brew sessions currently lose all state (chat messages, decision log entries, candidate cards, deck state, canvas positions) when a user navigates away from the page or refreshes the browser. The session row already exists in Supabase with the appropriate columns, and persistence functions exist in `brew-v2-session.ts`, but they are never called from the client. This feature adds automatic background persistence so that all session state survives page navigations and browser refreshes without requiring any manual save action from the user.

## Glossary

- **Autosave_Service**: The client-side logic responsible for detecting state changes and triggering persistence to Supabase via API routes
- **Session_Loader**: The logic responsible for hydrating React state from a persisted Supabase session row when the brew page mounts with an existing session
- **Brew_Page**: The `/new-deck` page component that orchestrates brew mode, managing session state, deck state, chat messages, and canvas positions
- **Session_Row**: The Supabase `brew_sessions` table row containing all persistable session data (decision_log_json, conversation_json, skeleton_json, assessment_cache_json, refinement_history_json, status, commander_name, colour_identity, path_type)
- **Debounce_Window**: A configurable time period (in milliseconds) after the last state change before persistence is triggered, preventing excessive writes during rapid interaction
- **Hydration**: The process of restoring React state from a previously-persisted Session_Row when the user returns to a brew session

## Requirements

### Requirement 1: Autosave Chat Messages

**User Story:** As a brewer, I want my chat conversation to persist automatically, so that I can navigate away and return to find the full conversation intact.

#### Acceptance Criteria

1. WHEN a new chat message (user or assistant) is appended to the messages array, THE Autosave_Service SHALL persist the updated conversation_json to the Session_Row within the Debounce_Window
2. WHEN the Brew_Page mounts with an existing session ID, THE Session_Loader SHALL hydrate the messages state from conversation_json in the Session_Row, restoring messages in their original chronological order
3. THE Autosave_Service SHALL serialize messages as a JSON array containing role (string: "user" or "assistant"), content (string, max 50,000 characters), timestamp (ISO 8601 string), and cost (number representing USD spent on the message, 0 if not applicable) fields for each message
4. IF the conversation_json in the Session_Row is null, empty, or contains malformed JSON, THEN THE Session_Loader SHALL initialize the messages state as an empty array without displaying an error to the user
5. THE Autosave_Service SHALL persist a maximum of 500 messages per session in conversation_json; WHEN the messages array exceeds 500 entries, THE Autosave_Service SHALL persist only the most recent 500 messages

### Requirement 2: Autosave Decision Log

**User Story:** As a brewer, I want my decision log entries (strategy, parameters, constraints) to persist automatically, so that extracted decisions survive page navigations.

#### Acceptance Criteria

1. WHEN a new decision entry is added to any section of the decision log, THE Autosave_Service SHALL persist the updated decision_log_json to the Session_Row within the Debounce_Window, coalescing multiple entries added within that window into a single write
2. WHEN the Brew_Page mounts with an existing session ID, THE Session_Loader SHALL hydrate the decisionLog state from decision_log_json in the Session_Row, restoring strategy, parameters, and constraints arrays with all DecisionEntry fields (id, key, value, sourceQuote, timestamp)
3. IF the decision_log_json in the Session_Row is null, empty, or contains malformed JSON, THEN THE Session_Loader SHALL initialize the decisionLog state with empty arrays for strategy, parameters, and constraints without throwing an error
4. THE Autosave_Service SHALL serialize the full DecisionLog structure (strategy, parameters, constraints arrays) as a single JSON string
5. IF the persist operation to the Session_Row fails, THEN THE Autosave_Service SHALL retain the decision log in local state and retry on the next entry addition

### Requirement 3: Autosave Deck State

**User Story:** As a brewer, I want my deck cards, suggestions, and generation status to persist automatically, so that my skeleton and any card changes survive navigation.

#### Acceptance Criteria

1. WHEN the deck state changes via any of the following reducer actions (addCard, removeCard, dragReassign, addSuggestion, setSuggestions, setCanvasPositions, updatePosition, setArchive), THE Autosave_Service SHALL persist the updated skeleton_json to the Session_Row within the Debounce_Window
2. WHEN the Brew_Page mounts with an existing session ID in the building phase, THE Session_Loader SHALL hydrate the deck reducer state from skeleton_json in the Session_Row, setting isGenerating to false regardless of any previously-persisted value
3. IF the skeleton_json in the Session_Row is null, empty, or fails JSON parsing during hydration, THEN THE Session_Loader SHALL initialize the deck reducer with the default empty DeckState instead of failing
4. THE Autosave_Service SHALL serialize deck cards, suggestions, canvas positions, and exploration archive together in skeleton_json, excluding transient fields (isGenerating)

### Requirement 4: Autosave Canvas Positions

**User Story:** As a brewer, I want my canvas card positions to persist automatically, so that my spatial arrangement is preserved when I return to the session.

#### Acceptance Criteria

1. WHEN a card position is updated on the canvas, THE Autosave_Service SHALL persist the updated canvasPositions within skeleton_json to the Session_Row within the Debounce_Window defined in Requirement 6
2. WHEN the Brew_Page mounts with an existing session ID, THE Session_Loader SHALL hydrate canvas positions from the canvasPositions field of skeleton_json in the Session_Row; IF skeleton_json is null or the canvasPositions field is absent, THEN THE Session_Loader SHALL initialize canvasPositions as an empty record
3. THE Autosave_Service SHALL persist canvasPositions by replacing only the canvasPositions key within the existing skeleton_json object, preserving sibling fields (cards, suggestions) without modification
4. THE Autosave_Service SHALL persist each canvas position as a record keyed by card identifier containing: id (string), x (number), y (number), type (string), category (string, optional), and updatedAt (epoch milliseconds)

### Requirement 5: Autosave Phase and Commander State

**User Story:** As a brewer, I want my session phase and committed commander to persist, so that I return to the correct phase (exploring or building) with the correct commander data.

#### Acceptance Criteria

1. WHEN the session transitions from exploring to building (commander commit), THE Autosave_Service SHALL persist the status, commander_name, colour_identity, and path_type fields to the Session_Row
2. WHEN the Brew_Page mounts with an existing session ID, THE Session_Loader SHALL hydrate the session phase and commander data from the Session_Row status, commander_name, colour_identity, and path_type fields
3. IF the Session_Row status is "building" and commander_name is present, THEN THE Session_Loader SHALL reconstruct the CommittedCommander object by resolving the card's artUrl and typeLine from the persisted commander_name, populating colourIdentity from the persisted colour_identity field, and setting archetype from the decision log — then set the phase to "building"
4. IF the Session_Row status is "exploring" or commander_name is null, THEN THE Session_Loader SHALL set the phase to "exploring" with commander as null
5. IF the Session_Row status is "building" but the CommittedCommander object cannot be reconstructed (commander_name lookup fails), THEN THE Session_Loader SHALL set the phase to "exploring" with commander as null and log a warning to the console

### Requirement 6: Debounced Persistence

**User Story:** As a brewer, I want autosave to batch rapid changes into a single write, so that the system does not make excessive network requests during active interaction.

#### Acceptance Criteria

1. THE Autosave_Service SHALL debounce all persistence writes using a trailing-edge strategy with a Debounce_Window defaulting to 2000 milliseconds, where each new state change resets the timer and the write fires only after 2000 milliseconds of inactivity
2. WHEN multiple state fields change within a single Debounce_Window, THE Autosave_Service SHALL batch them into a single API call that updates all changed fields together
3. WHEN the user navigates away from the Brew_Page (beforeunload or route change), THE Autosave_Service SHALL flush any pending debounced writes synchronously before the page unloads, using navigator.sendBeacon or a synchronous transport to maximise delivery reliability
4. IF a debounced write is pending and a new state change occurs before the Debounce_Window expires, THEN THE Autosave_Service SHALL reset the timer and merge the new changes into the pending batch rather than scheduling a separate write

### Requirement 7: Session Resumption via URL

**User Story:** As a brewer, I want to return to a specific brew session via a URL parameter, so that I can resume exactly where I left off.

#### Acceptance Criteria

1. WHEN the Brew_Page mounts with a sessionId query parameter in the URL, THE Session_Loader SHALL fetch the Session_Row for that ID and hydrate conversation_json, decision_log_json, skeleton_json (including canvas positions), status, commander_name, colour_identity, and path_type into their corresponding React state slices instead of creating a new session
2. WHEN the Brew_Page creates a new session on mount, THE Brew_Page SHALL update the URL to include the sessionId query parameter using history replacement (no new history entry) without triggering a page navigation
3. IF the session ID in the URL does not correspond to an existing Session_Row in the database (row not found or fetch returns an error), THEN THE Session_Loader SHALL create a new session, replace the URL sessionId parameter with the new session's ID, and display the Brew_Page in its default initial state
4. WHILE the Session_Loader is fetching a Session_Row for a URL-provided sessionId, THE Brew_Page SHALL display a loading indicator and SHALL NOT render the chat, decision log, or canvas in their default empty states

### Requirement 8: Error Resilience

**User Story:** As a brewer, I want autosave failures to be silent and non-disruptive, so that a transient network error does not interrupt my brewing flow.

#### Acceptance Criteria

1. IF a persistence write fails due to a network error (connection failure, request timeout, or HTTP 5xx response), THEN THE Autosave_Service SHALL retry the write once after 5000 milliseconds using the latest local state at retry time rather than the originally failed payload
2. IF the retry also fails, THEN THE Autosave_Service SHALL log a warning to the console and continue operating without surfacing any error to the user
3. IF a persistence write fails due to a non-retryable error (HTTP 4xx response), THEN THE Autosave_Service SHALL log a warning to the console and skip the retry, continuing to operate normally
4. IF a persistence write fails (after retry exhaustion or non-retryable error), THEN THE Autosave_Service SHALL schedule the next persistence attempt on the subsequent state change using the full current state
5. THE Brew_Page SHALL remain fully interactive during and after persistence failures — all UI controls remain enabled, state mutations continue to apply locally, and no blocking UI (modals, banners, or disabled controls) is presented to the user
