# Requirements: Collection Trust & Security

> **Correction (2026-09-14):** This spec originally assumed collection-replace safety (TD-026) was still an open critical risk. Tracing the actual code found it was already implemented and hosted-verified under the `collection-foundation` spec (see that spec's delivery log, 2026-09-12/14). TD-026 is now marked `resolved` in the tech debt register. Section 5.1 below is retained to document what's proven to already work, but its acceptance criteria describe existing shipped behavior, not new work. The one genuinely open item under 5.1 is progress visibility (US-5.1.2).

## 1. Problem Statement
The user is moving from prototype work to a stable personal application they can trust day-to-day. This spec originally covered two gaps; one turned out to already be closed:

1. **Collection replace/re-sync progress visibility.** ~~Collection replace/re-sync is unsafe~~ — already fixed (see correction above). What remains: replacing a collection gives no real progress feedback during the (now safe) validate-then-swap operation.
2. **Database has no per-user security boundary.** With up to 10 people potentially sharing this app, cross-account access is prevented only by the app code's filters, not a database-level guarantee. If a bug slips through the app layer, someone else could read or modify their collection.

The security gap must be closed before the app can be considered safe for shared use. The progress-visibility gap is a trust/usability improvement, not a safety fix.

## 2. Outcome
- Replacing a collection shows real progress (total count, live processed count, final stats) instead of an opaque "importing..." state. (The underlying atomicity guarantee — all-or-nothing, old data untouched on failure — is already true today and out of scope for new work.)
- A second person's login cannot access the first person's data at the database level, regardless of app-code bugs.

## 3. Users
| User | Role |
|------|------|
| Owner (Brad) | Single primary user who needs the app to be reliable enough for daily collection management. |
| Friend/Co-user | Up to 9 other people who may share the app with their own collections, requiring strict data isolation. |

## 4. Non-Functional Requirements
| ID | Requirement |
|----|-------------|
| NFR-1 | Collection replace must be atomic — either fully succeeds or fully fails, with no intermediate state visible to the user. |
| NFR-2 | Security boundary must be enforced at the database level (Row Level Security), not just in app code. |
| NFR-3 | Changes must preserve the existing data schema; no destructive migrations that would require re-uploading the collection. |
| NFR-4 | Solution must work with the current ~2,500-card collection volume without performance degradation. |

## 5. User Stories & Acceptance Criteria

### 5.1 Collection replacement (safety already shipped; progress visibility open)

**US-5.1.1 (already satisfied, no new work)** As the owner, I want to replace my entire collection from an Archidekt/Moxfield export file, so that I can resync after scanning new cards without risking data loss.

#### Acceptance Criteria — verified against current code, 2026-09-14
- WHEN I upload a replacement collection file, THE SYSTEM SHALL validate every row completely (card names resolve, quantities are positive integers) before any existing data is modified. ✓ `executeInstanceLevelImport` resolves the full file before any RPC call.
- WHEN validation passes for the entire file, THE SYSTEM SHALL replace the old collection with the new one in a single database transaction. ✓ `replace_collection` → `apply_collection_sync`, one transaction, advisory-locked.
- WHEN validation fails for any row, THE SYSTEM SHALL reject the import entirely and leave my existing collection untouched. ✓ confirmed by code trace; no RPC is invoked on resolution failure.
- WHEN the import succeeds, THE SYSTEM SHALL return a clear count of cards added/removed/changed. ✓ `inserted_count`/`removed_count` returned by the RPC.

**US-5.1.2 (genuinely open)** As the owner, I want to see progress while importing my collection, so I understand how much work remains and whether it's working.

#### Acceptance Criteria
- WHEN I upload a collection file, THE SYSTEM SHALL display the total number of cards to import upfront.
- WHEN the import is validating/running, THE SYSTEM SHALL display the current count of cards processed in real time.
- WHEN the import completes, THE SYSTEM SHALL show final counts (added/removed/unchanged) clearly.

**US-5.1.3 (already satisfied, no new work)** As the owner, I want to understand what happens to my deck allocations when I replace my collection, so I can plan accordingly.

#### Acceptance Criteria
- WHEN I replace my collection, THE SYSTEM SHALL document that deck allocations will be cleared and must be re-established via the existing Built-deck reconciliation flow.
- WHEN I replace my collection, THE SYSTEM SHALL NOT attempt to preserve manual per-card edits (storage location, notes, purchase price, missing flags) — this is a known limitation of Option A.

### 5.2 Database security boundary

**US-5.2.1** As a co-user, I want my collection to be completely inaccessible to other users at the database level, so that app bugs cannot accidentally expose my data.

#### Acceptance Criteria
- WHEN a second user logs in, THE SYSTEM SHALL enforce that they can only read/write rows where `user_id` matches their authenticated ID.
- WHEN a bug in the app code omits the `user_id` filter, THE DATABASE SHALL reject the query with a permissions error.
- WHEN testing with two test accounts, THE SYSTEM SHALL demonstrate complete isolation: neither account can see the other's cards, decks, or copies.

**US-5.2.2** As the owner, I want to enable Row Level Security without breaking my existing access or requiring a data migration.

#### Acceptance Criteria
- WHEN RLS policies are enabled, THE SYSTEM SHALL continue to allow the owner's full access to their own data.
- WHEN RLS policies are enabled, THE SYSTEM SHALL NOT require re-uploading the collection or any other manual data fix.
- WHEN RLS policies are enabled, THE SYSTEM SHALL allow service-role operations (like collection replacement) to continue working for administrative tasks.

## 6. In Scope
- Async job + polling progress reporting for collection replace (the genuinely open piece of US-5.1).
- Row Level Security policies on all user-owned tables (`user_cards`, `user_copies`, `decks`, `deck_cards`).
- Service-role exemptions for administrative operations.
- Two-account test proving isolation.
- Tech debt register correction (TD-026 → resolved).

**Already shipped, verified, no new work required:**
- Atomic validation-then-swap collection replacement (Option A) — see US-5.1.1 correction above.

**Checked and found genuinely missing (add to scope):**
- `CollectionImportButton` has no confirmation/warning step before running a replace import — it silently wipes and rebuilds the collection with no "this will replace everything, allocations will be cleared" notice. US-5.1.3's acceptance criteria are not met by the current UI; this needs actual copy added, not just documentation.

## 7. Out of Scope
| Item | Reason |
|------|--------|
| True incremental diffing (Option B) | Deferred until manual-edit preservation becomes a pain point; Option A fixes the critical data-loss risk. |
| Full multi-tenant infrastructure (beyond RLS) | Beyond what's needed for up to 10 users sharing a single app instance. |
| Audit logging, backup systems, disaster recovery | Covered by the personal-app-scope convention; user's export files serve as backup. |
| Performance optimization beyond current volume | Current ~2,500 cards performs acceptably. |
| Deck import missing-decks bug | Known issue tracked separately — not all decks from Archidekt are visible during import. See `deck-import-missing-decks-fix` spec. |

## 8. Open Questions
| # | Question | Impact |
|---|----------|--------|
| 1 | Should the collection replacement preserve the "missing" flag on cards? | If not preserved, missing cards will need to be re-marked after a reimport. |
| 2 | Should we add a "dry run" mode that shows what would change before applying? | Nice-to-have for user confidence, but adds complexity. |
| 3 | How to handle partial failures during the swap transaction? | Already covered by atomic transaction rollback, but worth explicit testing. |

## Reference Documents
- Roadmap: `docs/roadmap-foundations-first.md`
- Technical Debt: TD-026 (collection replace safety), TD-037 (RLS)
- Personal Application Scope convention

---

*Authored: 2026-09-14 by Delivery Lead (Gene)*
*Status: Draft*