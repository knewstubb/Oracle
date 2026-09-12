# Requirements Document

## Introduction

Monitor Mode is a deck health monitoring system that evaluates each Commander deck's structural completeness by classifying every card into functional categories (ramp, draw, removal, etc.) and comparing actual counts against configurable target thresholds. It surfaces a persistent health bar on the deck detail page showing green/amber/red status per category, with a single contextual note for the most severe issue. Health is computed automatically after every sync and on-demand via a manual recheck button.

The classification uses a three-tier approach: Archidekt category mapping first, oracle text heuristics second, and manual overrides third. Results are persisted in a `deck_health` table and threshold overrides are stored as JSON on `deck_strategy`.

## Glossary

- **Health_Engine**: The compute component that classifies cards into functional categories, compares counts against thresholds, and produces a health result per deck
- **Category_Classifier**: The three-tier classification pipeline that assigns each card a functional role using Archidekt categories, oracle text heuristics, and manual overrides
- **Health_Store**: The `deck_health` SQLite table that persists computed health results per deck
- **Health_Bar**: The UI component rendered between the deck header and tabs, displaying per-category health as coloured pills
- **Threshold_Set**: The collection of target ranges (min/max) for each functional category against which actual card counts are compared
- **Amber_Margin**: A configurable integer (default 1) defining how many cards below or above the target range a category can be before transitioning from green to amber status
- **Health_Status**: One of three states per category — green (within target), amber (within margin of target), red (outside margin)
- **Override_Map**: A JSON object stored on `deck_strategy.health_overrides` allowing per-deck threshold customisation

## Requirements

### Requirement 1: Health Persistence Schema

**User Story:** As a developer, I want computed health results stored in the database, so that the UI can render health state without recomputing on every page load.

#### Acceptance Criteria

1. THE Health_Store SHALL persist computed health results in a `deck_health` table with a foreign key reference to `decks(id)` and cascade deletion
2. THE Health_Store SHALL record the full health result as a JSON column containing per-category status, actual count, and target range
3. THE Health_Store SHALL record the timestamp of the most recent computation
4. THE Health_Store SHALL record the overall deck health status (green, amber, or red) as a text column derived from the most severe category status
5. WHEN a health computation completes, THE Health_Engine SHALL upsert the result into the Health_Store, replacing any previous result for that deck

### Requirement 2: Threshold Override Schema

**User Story:** As a deck builder, I want per-deck threshold overrides stored alongside my strategy data, so that my tuned decks use custom targets without affecting other decks.

#### Acceptance Criteria

1. THE Health_Store SHALL store per-deck threshold overrides in a nullable JSON column named `health_overrides` on the `deck_strategy` table
2. WHEN the `health_overrides` column is NULL, THE Health_Engine SHALL use the global default Threshold_Set for that deck
3. WHEN the `health_overrides` column contains valid JSON, THE Health_Engine SHALL merge the overrides with the global defaults, with overrides taking precedence for any specified category
4. THE Override_Map SHALL support specifying a custom min and max target for any subset of functional categories

### Requirement 3: Three-Tier Category Classification

**User Story:** As a deck builder, I want each card automatically classified into a functional category using a reliable multi-source approach, so that health status reflects the deck's actual composition without manual tagging of every card.

#### Acceptance Criteria

1. THE Category_Classifier SHALL classify each card using a three-tier pipeline evaluated in priority order: Archidekt category mapping, oracle text heuristics, manual override
2. WHEN a card has an Archidekt-assigned category that maps to a known functional role, THE Category_Classifier SHALL use that mapping as the primary classification
3. WHEN a card has no recognised Archidekt category mapping, THE Category_Classifier SHALL apply oracle text heuristic rules to infer a functional role from the card's type line and oracle text
4. WHEN a manual override exists for a specific card in a specific deck, THE Category_Classifier SHALL use the override value regardless of Archidekt category or heuristic result
5. THE Category_Classifier SHALL assign exactly one primary functional category to each non-land card for the purposes of health calculation
6. THE Category_Classifier SHALL classify cards into functional categories including but not limited to: Ramp, Draw, Removal, Interaction, Finisher, and deck-specific roles

### Requirement 4: Health Computation Triggers

**User Story:** As a deck builder, I want health to recompute automatically when my deck data changes and on demand when I request it, so that the health bar is always current without requiring manual intervention.

#### Acceptance Criteria

1. WHEN a deck sync completes for a deck, THE Health_Engine SHALL recompute health for that deck using the updated card data
2. WHEN a manual override is added or changed for a card in a deck, THE Health_Engine SHALL recompute health for that deck
3. WHEN the user activates the manual recheck button on the deck detail page, THE Health_Engine SHALL recompute health for that deck and update the Health_Store
4. THE Health_Engine SHALL compute health status by comparing actual card counts per category against the applicable Threshold_Set (global defaults merged with any Override_Map)
5. THE Health_Engine SHALL determine per-category Health_Status as green when actual count is within the target range, amber when within the Amber_Margin of the target range boundary, and red when outside the Amber_Margin

### Requirement 5: Health Bar UI

**User Story:** As a deck builder, I want a persistent visual summary of my deck's health between the header and tabs, so that I can see at a glance which categories are well-served and which need attention.

#### Acceptance Criteria

1. THE Health_Bar SHALL render between the deck header and the tab navigation on the deck detail page
2. THE Health_Bar SHALL display one pill per functional category, coloured green, amber, or red according to the category's Health_Status
3. WHEN a category pill is clicked, THE Health_Bar SHALL scroll the page to the corresponding category section within the deck view
4. THE Health_Bar SHALL remain visible on the deck detail page regardless of which tab is active
5. THE Health_Bar SHALL display the category name and actual count within each pill

### Requirement 6: Silent When Healthy Behaviour

**User Story:** As a deck builder, I want the health indicator to stay out of my way when everything is fine, so that I only receive guidance when something needs attention.

#### Acceptance Criteria

1. WHEN all categories are green, THE Health_Bar SHALL render the pill strip without any additional banner or alert message
2. WHEN one or more categories are amber or red, THE Health_Bar SHALL display a single contextual note identifying the most severe violation
3. THE Health_Bar SHALL determine the most severe violation by prioritising red categories over amber, and among equal severity, the category furthest from its target range
4. THE contextual note SHALL describe the specific issue in plain language including the category name, actual count, and expected range

### Requirement 7: Per-Deck Threshold Configuration

**User Story:** As a deck builder, I want to adjust category targets for individual decks, so that my combo deck with minimal ramp or my lands-matter deck with extra draw sources show accurate health.

#### Acceptance Criteria

1. WHEN the user modifies a threshold for a specific deck, THE Health_Engine SHALL persist the change to the Override_Map on that deck's `deck_strategy` row
2. WHEN a threshold override is saved, THE Health_Engine SHALL immediately recompute health for that deck using the updated thresholds
3. THE Override_Map SHALL allow the user to override the Amber_Margin on a per-deck basis in addition to category targets
4. WHEN the user removes an override for a category, THE Health_Engine SHALL revert that category to the global default threshold

### Requirement 8: Manual Recheck

**User Story:** As a deck builder, I want a button to force recomputation of health, so that I can verify changes to overrides or card data are reflected immediately.

#### Acceptance Criteria

1. THE Health_Bar SHALL include a recheck button accessible from the deck detail page
2. WHEN the user activates the recheck button, THE Health_Engine SHALL recompute health for that deck and persist the updated result to the Health_Store
3. WHILE health is being recomputed, THE Health_Bar SHALL display a loading state indicating computation is in progress
4. WHEN recomputation completes, THE Health_Bar SHALL update all pill colours and the contextual note to reflect the new result without requiring a full page reload
