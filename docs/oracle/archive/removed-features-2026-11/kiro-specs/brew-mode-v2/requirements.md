# Requirements Document

## Introduction

Brew Mode V2 is a comprehensive redesign of The Oracle's deck brewing experience. It replaces the single-phase brew flow with a two-phase architecture: an **Exploration** phase (conversational commander discovery with a decision log panel) and a **Building** phase (full deck workspace with AI-powered card assessment). The redesign also introduces a model split (Sonnet for conversation/skeleton, Haiku for extraction/assessment), structured commander options cards in the chat thread, drag-to-reassign category interaction, draft/concept deck deletion, and removal of the colour identity picker in favour of conversational capture. This spec supersedes the existing `brew-mode` and `brew-panel-v2` specs.

## Glossary

- **Brew_Mode**: The full deck-building experience within The Oracle, entered via the "+ Brew Deck" button, encompassing both the Exploration and Building phases
- **Exploration_Phase**: Phase 1 of Brew Mode where no commander is committed; the user converses with Oracle to discover strategy, preferences, and commander options while decisions are silently extracted to the Decision_Log
- **Building_Phase**: Phase 2 of Brew Mode where a commander has been committed; the right panel becomes the Deck_Workspace with categories, win conditions, card assessment, and suggestions
- **Decision_Log**: The right panel during Exploration Phase (260px) displaying extracted strategy decisions in three sections: Strategy, Parameters, and Constraints
- **Decision_Entry**: A single extracted decision within the Decision Log, containing a key (uppercase label), value, and source quote from the conversation
- **Decision_Extraction**: The background Haiku process that analyses each Sonnet response during exploration and extracts high-confidence decisions into the Decision Log
- **Commander_Options_Card**: A structured inline card rendered in the chat thread when Oracle surfaces commander suggestions, showing art, name, colour pips, description, ownership status, and a commit button per commander
- **Deck_Workspace**: The 280px-wide right panel rendered during Building Phase, containing win condition sections, category groups, card assessment, suggestions, and a persistent footer
- **Phase_Transition**: The moment a user commits to a commander (via ✓ button or conversational confirmation), immediately flipping from Exploration to Building phase
- **Topbar**: The header bar of Brew Mode displaying navigation, session title, mode badge, phase/commander info, and session status indicator
- **Concept_Tile**: A dashboard tile representing a saved exploration session that has no commander committed — stores the decision log for later resumption
- **Draft_Tile**: A dashboard tile representing a saved brew session with a committed commander but incomplete deck — displays dashed blue border and "Draft" badge
- **Deck_Card**: A card entry in the deck list with primary_category, additional_categories, ownership_status, cmc, type_line, oracle_text, and optional EDHREC/price data
- **Primary_Category**: The single functional category assigned to each card that determines panel placement and health counting
- **Additional_Categories**: Zero or more descriptive categories rendered as "also:" pills without affecting health counts
- **Health_Status**: Visual indicator on monitored category headers showing whether the category meets recommended thresholds
- **Card_Tooltip**: A hover-activated popover to the left of the panel showing card art, details, ownership, EDHREC %, and price
- **Inline_Assessment**: A click-activated expansion showing Haiku-generated pros, cons, fit score, and deck fit note for a card in context
- **Haiku_Model**: Claude Haiku 4.5 used for decision extraction, card assessment, and debrief investigation
- **Sonnet_Model**: Claude Sonnet 4.6 used for exploration conversation, skeleton generation, and debrief analysis
- **Prompt_Cache**: System prompt caching applied to both Sonnet and Haiku system prompts to reduce latency and cost across repeated calls within a session

## Requirements

### Requirement 1: Brew Mode Entry Point

**User Story:** As a user, I want the deck creation button labelled "+ Brew Deck" across all entry points, so that the action clearly communicates I'm entering a creative brewing session.

#### Acceptance Criteria

1. THE Dashboard SHALL display the deck creation button with the label "+ Brew Deck" (replacing the previous "+ New Deck" label)
2. THE Sidebar navigation SHALL display the deck creation item with the label "+ Brew Deck" (replacing the previous "+ New Deck" label)
3. WHEN the user clicks "+ Brew Deck" from either entry point, THE Brew_Mode SHALL navigate to the brew session page with no other behavioural changes to the entry flow

### Requirement 2: Two-Phase Architecture

**User Story:** As a deck builder, I want brew mode split into an exploration phase and a building phase, so that I can freely discover my strategy before committing to a commander and entering structured deck construction.

#### Acceptance Criteria

1. THE Brew_Mode SHALL begin in the Exploration_Phase with no commander committed
2. WHILE in Exploration_Phase, THE Topbar SHALL display: back navigation "[← Decks]", title "New brew", a blue "Brew" badge, phase label "Exploring", and a green session-active indicator "● Session active"
3. WHEN the user commits to a commander via the Commander_Options_Card ✓ button, THE Brew_Mode SHALL immediately transition to Building_Phase
4. WHEN the user commits to a commander by typing a commander name and Oracle confirms the selection, THE Brew_Mode SHALL immediately transition to Building_Phase
5. WHILE in Building_Phase, THE Topbar SHALL display: back navigation "[← Decks]", the committed commander name, a blue "Brew" badge, metadata strip (colour identity pips, bracket, archetype in muted text), and a green session-active indicator
6. THE Phase_Transition SHALL be immediate with no intermediate loading screen or confirmation modal

### Requirement 3: Exploration Phase — Decision Log Panel

**User Story:** As a deck builder, I want the right panel during exploration to show extracted decisions from our conversation, so that I can see my emerging strategy crystallise without interrupting the flow.

#### Acceptance Criteria

1. WHILE in Exploration_Phase, THE right panel SHALL render as a Decision_Log at 260px width
2. THE Decision_Log SHALL display three sections: "Strategy", "Parameters", and "Constraints"
3. EACH Decision_Entry SHALL display: a key in 9px uppercase muted text, a value in 11px #d4d4d0 text, and a source quote in 9px italic rgba(255,255,255,0.18) text
4. EACH Decision_Entry container SHALL have: background rgba(255,255,255,0.04), border 0.5px solid rgba(255,255,255,0.07), and rounded-md corners
5. WHEN a new Decision_Entry is added, THE entry SHALL animate with a blue tint background (rgba(55,138,221,0.06)) that fades to neutral over 3 seconds
6. THE Decision_Log SHALL display a "Commit to commander" button that is disabled until at least one commander has been surfaced in conversation
7. WHEN a commander has been discussed in the conversation, THE "Commit to commander" button SHALL become enabled
8. THE Decision_Log SHALL display a "Save concept · decide later" button that saves the current decision log as a Concept_Tile on the dashboard without committing a commander or generating a skeleton

### Requirement 4: Decision Extraction via Haiku

**User Story:** As a deck builder, I want my strategic decisions silently extracted from conversation, so that the decision log populates automatically without requiring me to manually enter anything.

#### Acceptance Criteria

1. WHEN the Sonnet_Model produces a response during Exploration_Phase, THE system SHALL invoke the Haiku_Model to extract decisions from that response
2. THE Decision_Extraction SHALL operate silently without user-visible loading states or confirmation prompts
3. THE Haiku_Model SHALL extract the following decision types: colour identity, bracket, archetype, playstyle, win approach, known card includes, and constraints
4. THE Decision_Extraction SHALL only surface high-confidence extractions (the model determines confidence internally)
5. THE extracted decisions SHALL be placed in the appropriate Decision_Log section: strategy-related entries under "Strategy", measurable parameters under "Parameters", and limitations/exclusions under "Constraints"
6. THE Haiku_Model system prompt SHALL use Prompt_Cache to avoid redundant prompt transmission across extraction calls within a session

### Requirement 5: Commander Options Card

**User Story:** As a deck builder, I want commander suggestions rendered as structured interactive cards in the chat, so that I can compare options visually and commit to one with a single click.

#### Acceptance Criteria

1. WHEN Oracle surfaces commander suggestions in conversation, THE chat thread SHALL render a Commander_Options_Card instead of plain text
2. THE Commander_Options_Card container SHALL have: background rgba(55,138,221,0.05), border 0.5px solid rgba(55,138,221,0.18)
3. EACH commander row within the card SHALL display: 32×44px card art, commander name, colour identity pips, a brief description, ownership status, and a "✓" commit button
4. THE ownership status SHALL display "You own this" in teal when the card exists in the user's collection, or "Not in collection" in muted text when it does not
5. WHEN the user clicks a "✓" commit button, THE Brew_Mode SHALL immediately trigger Phase_Transition with that commander
6. THE system SHALL validate all commander suggestions against Scryfall data before rendering the Commander_Options_Card (confirming card existence, legality as commander, and correct colour identity)

### Requirement 6: Building Phase — Deck Workspace Panel

**User Story:** As a deck builder, I want the right panel in building phase to be a full deck workspace with win conditions, categories, and AI assessment, so that I can construct and evaluate my deck without leaving the conversation.

#### Acceptance Criteria

1. WHILE in Building_Phase, THE right panel SHALL render as the Deck_Workspace at 280px width
2. THE Deck_Workspace header SHALL display: commander art (36×50px), commander name (12px/500), type line (10px muted), colour identity pips, and archetype strip from the Decision_Log on a blue-tinted background
3. THE Deck_Workspace SHALL display two sub-tabs: "Deck list" with card count and "Suggestions" with card count in blue
4. THE Deck_Workspace SHALL pin a "Win conditions" section at the top of the Deck List tab with teal gradient accent, showing cards with primary_category "Win Condition" — each entry displaying card name and how it closes the game
5. THE Deck_Workspace SHALL pin an "Alt win conditions" section below the primary, with amber gradient accent, showing cards with primary_category "Alt Win Condition" — each entry displaying card name and when it becomes relevant
6. THE Deck_Workspace SHALL display Category_Sections below win conditions, one per unique primary_category, with headers showing name, count, and Health_Status
7. THE Deck_Workspace footer SHALL persist at the bottom showing "[N] / 100 cards" and a "Save draft" button

### Requirement 7: Card Row and Interactions

**User Story:** As a deck builder, I want each card row to show ownership, categories, and CMC with hover and click interactions, so that I can quickly scan, evaluate, and act on individual cards.

#### Acceptance Criteria

1. EACH card row SHALL display from left to right: grip icon (drag handle), ownership dot (6px: teal=owned, amber=proxy, faint+border=not owned), card name (11px, ellipsis truncation), "also:" pills (blue, showing additional categories), CMC (10px muted, right-aligned)
2. WHEN the user hovers over a card row, THE Deck_Workspace SHALL display a Card_Tooltip to the left of the panel containing: card art, name, type line, oracle text, ownership badge, EDHREC inclusion %, price, and hint text "Click to see pros, cons & deck fit"
3. WHEN the user clicks a card row, THE Deck_Workspace SHALL expand an Inline_Assessment below the card, collapsing any previously expanded assessment
4. WHILE the Haiku_Model assessment call is in progress, THE Inline_Assessment SHALL display "● ● ● Assessing for this deck..."
5. WHEN the assessment is received, THE Inline_Assessment SHALL display: pros (green + icons, 2–3 items), cons (red − icons, 1–2 items), fit score bar (teal 8–10, amber 5–7, red 1–4 with 1–10 scale), fit note (2–3 sentences, deck-specific), and action buttons "Remove" and "Discuss"
6. WHEN a card has been previously assessed in the current session, THE Deck_Workspace SHALL load the result from cache without a new Haiku_Model call
7. WHEN the user clicks "Remove", THE Deck_Workspace SHALL remove the card, recalculate category counts and Health_Status, and update the footer card count
8. WHEN the user clicks "Discuss", THE Deck_Workspace SHALL focus the chat input with the card name pre-filled, initiating discussion about that card

### Requirement 8: Category Data Model

**User Story:** As a deck builder, I want each card to have one primary category for placement and health, plus optional additional categories for context, so that deck health tracking is accurate while cross-category synergies remain visible.

#### Acceptance Criteria

1. THE Deck_Card interface SHALL contain: card_name (string), primary_category (string, exactly one), additional_categories (string array, zero or more), ownership_status ('original' | 'proxy' | 'not_owned'), cmc (number), type_line (string), oracle_text (string), edhrec_inclusion (optional number), and price_ck (optional number)
2. THE Primary_Category SHALL determine which Category_Section the card appears in and SHALL be the only category counted toward Health_Status thresholds
3. THE Additional_Categories SHALL render as "also:" pills on the card row without affecting Health_Status or panel placement
4. WHEN pushing to Archidekt, THE system SHALL map primary_category to the first Archidekt category and additional_categories to remaining Archidekt categories
5. WHEN importing from Archidekt, THE system SHALL map the first category to primary_category and remaining categories to additional_categories

### Requirement 9: Drag to Reassign Category

**User Story:** As a deck builder, I want to drag a card to a different category header to reassign its primary role, so that I can reorganise my deck quickly without menus or modals.

#### Acceptance Criteria

1. THE card row grip icon SHALL initiate a drag interaction on mousedown/touchstart
2. WHILE a card is being dragged, THE source card row SHALL render at 0.4 opacity
3. THE only valid drop targets SHALL be Category_Section headers (not individual card positions or areas outside the panel)
4. WHILE a card is dragged over a valid Category_Section header, THE header SHALL display a blue dashed border indicating valid drop
5. WHEN a card is dropped on a different Category_Section header, THE system SHALL: update the card's primary_category to the target category, append the card to the bottom of the target section, recount source and target categories, recalculate Health_Status for affected categories, and display a Sonner toast "[Card] moved to [Category]" with a teal check for 2.2 seconds
6. WHEN a card is dropped on its current Category_Section header, THE system SHALL perform no operation
7. THE Drag_Reassign interaction SHALL only modify primary_category; additional_categories SHALL remain unchanged

### Requirement 10: Draft and Concept Deletion

**User Story:** As a deck builder, I want to delete draft and concept sessions from the dashboard and deck detail page, so that I can clean up incomplete brews without cluttering my workspace.

#### Acceptance Criteria

1. THE Draft_Tile on the dashboard SHALL display a dashed blue border and "Draft" badge
2. WHEN the user hovers over a Draft_Tile, THE tile SHALL reveal two actions: "Continue brewing" and "Delete draft"
3. WHEN the user clicks "Delete draft" on a Draft_Tile, THE tile SHALL display an inline confirmation within the tile bounds before proceeding
4. THE Concept_Tile on the dashboard SHALL reveal "Continue exploring" and "Delete concept" actions on hover, using the same deletion pattern as Draft_Tile
5. WHEN viewing a draft deck's detail page, THE page SHALL display a persistent banner between the health strip and tabs containing "Continue brewing" and "Delete draft" buttons
6. THE system SHALL NOT display any delete option for decks with status "active" anywhere in the application
7. THE decks table SHALL include a status column with allowed values: 'active', 'draft', 'concept' (default 'active')
8. THE brew_sessions table SHALL include a decision_log column for persisting concept session data

### Requirement 11: Model Assignment and Prompt Caching

**User Story:** As a deck builder, I want the system to use the right AI model for each task — Sonnet for creative conversation and skeleton generation, Haiku for fast extraction and assessment — so that I get quality responses where it matters and speed where it counts.

#### Acceptance Criteria

1. WHILE in Exploration_Phase conversation, THE system SHALL use the Sonnet_Model (Claude Sonnet 4.6) for generating responses
2. WHEN performing Decision_Extraction after each Sonnet response, THE system SHALL use the Haiku_Model (Claude Haiku 4.5)
3. WHEN generating the deck skeleton during Building_Phase (card lookup, EDHREC queries, recommendations), THE system SHALL use the Sonnet_Model
4. WHEN performing per-card Inline_Assessment (pros/cons/fit), THE system SHALL use the Haiku_Model
5. THE system SHALL apply Prompt_Cache to the Sonnet_Model system prompt across all calls within a session
6. THE system SHALL apply Prompt_Cache to the Haiku_Model system prompt across all calls within a session
7. WHEN performing debrief investigation (conversational diagnosis), THE system SHALL use the Haiku_Model
8. WHEN performing debrief analysis (ranked cut/add recommendations), THE system SHALL use the Sonnet_Model

### Requirement 12: Colour Identity Picker Removal

**User Story:** As a deck builder, I want colour identity captured through natural conversation and reflected in the decision log, so that I don't have to interact with a separate UI picker that interrupts the creative flow.

#### Acceptance Criteria

1. THE Brew_Mode SHALL NOT render a colour identity picker UI component at any point during the session
2. WHEN the user discusses colour preferences in conversation, THE Decision_Extraction SHALL capture the colour identity as a decision entry in the "Parameters" section of the Decision_Log
3. WHEN a commander is committed, THE system SHALL derive the deck's colour identity from the commander's colour identity (via Scryfall data) and display it in the Building_Phase topbar metadata strip

### Requirement 13: Suggestions Tab

**User Story:** As a deck builder, I want a suggestions tab showing AI-recommended cards grouped by their suggested primary category, so that I can discover cards that fit and add them with one click.

#### Acceptance Criteria

1. THE Suggestions tab SHALL display AI-suggested cards grouped by their suggested primary_category
2. EACH suggestion row SHALL display: ownership dot, card name, "also:" pills (if applicable), a "+" add button, and a reason line at 9px muted explaining the suggestion
3. WHEN the user clicks the "+" button on a suggestion, THE system SHALL add the card to the Deck List under the suggested primary_category, remove the card from the Suggestions tab, and update both tab counts and the footer card count
4. WHEN the user hovers over a suggestion row, THE system SHALL display the same Card_Tooltip as deck list card rows

### Requirement 14: Phase Transition Mechanics

**User Story:** As a deck builder, I want the transition from exploration to building to happen instantly when I commit to a commander, so that momentum isn't broken by loading screens or setup steps.

#### Acceptance Criteria

1. WHEN the user commits to a commander (via ✓ button or conversational confirmation), THE system SHALL immediately update the Topbar to show the commander name, colour pips, and metadata
2. WHEN Phase_Transition occurs, THE right panel SHALL immediately switch from the 260px Decision_Log to the 280px Deck_Workspace
3. WHEN Phase_Transition occurs, THE Deck_Workspace header SHALL populate with the committed commander's art, name, type line, colour pips, and archetype from the Decision_Log
4. WHEN Phase_Transition occurs, THE system SHALL begin skeleton generation using the Sonnet_Model, with the Decision_Log context informing card selection and category assignment
5. WHILE skeleton generation is in progress, THE Deck_Workspace SHALL display a loading state indicating deck construction is underway
