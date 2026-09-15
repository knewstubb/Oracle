# Requirements: Deck Import — Missing Decks Bug Fix

## 1. Problem Statement
When importing decks from an Archidekt export, not all decks are visible in the import picker. This prevents the user from re-importing decks they want to track, forcing them to manually filter or re-enter missing ones. The scope of the missing decks is unclear — need investigation first.

## 2. Outcome
All decks present in the Archidekt export are visible and selectable in the deck import picker. The user can re-import their full collection of tracked decks without gaps.

## 3. Users
| User | Role |
|------|------|
| Owner (Brad) | Primary user importing Archidekt decks during collection setup and occasional re-syncs. |

## 4. Non-Functional Requirements
| ID | Requirement |
|----|-------------|
| NFR-1 | Missing-decks issue must be reproducible with a specific Archidekt export. |
| NFR-2 | Fix must not affect the existing happy-path of importing a single deck URL. |

## 5. User Stories & Acceptance Criteria

### 5.1 All decks visible in import picker

**US-5.1.1** As the owner, I want to see all decks from my Archidekt export in the deck import picker, so I can bring in my full collection without gaps.

#### Acceptance Criteria
- WHEN I upload an Archidekt collection export, THE SYSTEM SHALL make all decks present in the file available for selection.
- WHEN I select any deck from the picker and import it, THE SYSTEM SHALL successfully create or update the deck in my collection.
- WHEN I import all decks from a file, THE SYSTEM SHALL match the count and names of the original export.

## 6. In Scope
- Investigation: identify why decks are missing (API limit, parsing bug, filtering logic, pagination).
- Fix for the root cause.
- Verify fix works with the user's actual Archidekt collection.

## 7. Out of Scope
| Item | Reason |
|------|--------|
| Other import sources (Moxfield, etc.) | Only Archidekt has been reported as affected. |
| Redesign of import UX | Separate from fixing the missing-decks bug. |
| Performance optimization | Not reported as an issue. |

## 8. Open Questions
| # | Question | Impact |
|---|----------|--------|
| 1 | How many decks are missing, and what's the total count the user expects? | Need exact numbers to verify the fix. |
| 2 | Is the missing-decks issue consistent or intermittent? | Affects debugging approach. |
| 3 | Are missing decks stored in Archidekt with a different visibility status (private, archived)? | May explain why they don't appear. |

---

*Authored: 2026-09-14 by Delivery Lead (Gene)*
*Status: Draft, awaiting investigation spike*