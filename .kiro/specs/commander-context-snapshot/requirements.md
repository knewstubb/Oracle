# Requirements: Commander Context Snapshot

## 1. Problem Statement

The production Supabase database is approximately 504 MB, above the nominal 500 MB Free-plan database allowance. Shared commander context accounts for roughly 275 MB, dominated by `ref_build_cards` at 187 MB and a deprecated empty `ref_edhrec_recommendations` relation retaining 49 MB of index storage. This read-mostly reference payload competes with authoritative user collection data for database capacity.

Commander and build identity rows cannot simply be removed: `decks.commander_id` and `decks.build_id` reference them. Runtime APIs also combine commander context with live user ownership, deck, printing, and price data.

## 2. Outcome

Serve bulky commander context from a versioned, immutable, server-only SQLite snapshot while preserving existing API behavior and stable commander/build UUIDs. Reclaim Supabase storage only after snapshot parity, deployment packaging, fallback, and freshness behavior are proven.

The first cutover targets `ref_build_cards` and the deprecated recommendation relation, which together account for approximately 236 MB. Insights and taxonomy remain in Supabase until their weekly publication workflow can atomically produce and deploy a replacement snapshot.

## 3. Users

| User | Role |
|------|------|
| Deck builder | Receives the same build recommendations and synergy data without knowing its storage source |
| Operator | Generates, validates, publishes, rolls back, and audits snapshots |
| Developer | Uses one repository interface instead of table-specific reads |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Snapshot reads SHALL execute only in the Node.js server runtime and SHALL never ship the dataset to the browser. |
| NFR-2 | The snapshot SHALL preserve build UUIDs and all fields used by current API and AI consumers. |
| NFR-3 | Snapshot publication SHALL be atomic: generate to a temporary file, validate, then rename and publish a checksum manifest. |
| NFR-4 | The runtime SHALL support `supabase`, `shadow`, and `snapshot` source modes for rollout and rollback. |
| NFR-5 | Supabase rows SHALL NOT be removed until representative and aggregate parity checks pass in a deployed environment. |
| NFR-6 | Next.js output tracing SHALL explicitly include the snapshot for every server route that reads it. |
| NFR-7 | The snapshot SHALL be reproducible from documented source jobs and include source timestamps, row counts, schema version, and SHA-256 checksum. |
| NFR-8 | No user-owned collection, deck, allocation, or authentication data SHALL enter the snapshot. |

## 5. User Stories & Acceptance Criteria

### 5.1 Generate a versioned snapshot

**US-5.1.1** As an operator, I want to export commander context deterministically so that the deployed artifact can be audited and regenerated.

#### Acceptance Criteria
- WHEN the exporter runs, THE SYSTEM SHALL paginate beyond PostgREST's 1,000-row limit.
- WHEN export completes, THE SYSTEM SHALL record source table counts, generation time, schema version, and checksum.
- WHEN any row is malformed or counts do not reconcile, THE SYSTEM SHALL reject publication and preserve the previous snapshot.
- WHEN the same logical source is exported twice, THE SYSTEM SHALL produce equivalent query results.

### 5.2 Preserve build-card behavior

**US-5.2.1** As a deck builder, I want build recommendations to behave identically after storage migration.

#### Acceptance Criteria
- WHEN a build is selected, THE SYSTEM SHALL return the same cards, ordering, inclusion rates, synergy scores, positions, signature flags, and staple flags as Supabase.
- WHEN filtering by card type or minimum inclusion rate, THE SYSTEM SHALL preserve current semantics.
- WHEN a build has no cards, THE SYSTEM SHALL return an empty result rather than fall back to unrelated data.

### 5.3 Safe rollout and rollback

**US-5.3.1** As an operator, I want to compare and switch sources without deleting production data so that discrepancies cannot silently reach users.

#### Acceptance Criteria
- WHEN source mode is `supabase`, THE SYSTEM SHALL preserve current behavior.
- WHEN source mode is `shadow`, THE SYSTEM SHALL return Supabase results and report snapshot parity differences without exposing snapshot output to users.
- WHEN source mode is `snapshot`, THE SYSTEM SHALL serve the validated local snapshot.
- WHEN the snapshot is absent, corrupt, or has a checksum mismatch, THE SYSTEM SHALL fail visibly or use the explicitly configured Supabase rollback path; it SHALL NOT return invented recommendations.
- WHEN rollback is required before table removal, THE SYSTEM SHALL switch back to Supabase by configuration only.

### 5.4 Reclaim database storage

**US-5.4.1** As an operator, I want to remove redundant database payload after cutover so that authoritative user data has capacity to grow.

#### Acceptance Criteria
- WHEN deployed snapshot parity and rollback gates pass, THE SYSTEM SHALL produce a reviewed migration for removing or truncating migrated payload.
- WHEN destructive cutover is proposed, THE SYSTEM SHALL present measured before/after size evidence and require explicit approval.
- WHEN identity rows are still referenced by decks, THE SYSTEM SHALL preserve `ref_commanders` and `ref_commander_builds` rows and constraints.

## 6. In Scope

- Versioned SQLite snapshot and manifest.
- `ref_build_cards` export, local repository, shadow comparison, and runtime cutover.
- Next.js output tracing and server-only enforcement.
- Deprecated `ref_edhrec_recommendations` storage reclamation after dependency verification.
- A phased design for later insight/taxonomy migration.

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Moving `ref_commanders` or `ref_commander_builds` identity rows | Deck foreign keys provide valuable integrity for little storage cost |
| User collection/deck data | Must remain authoritative and transactional in Postgres |
| Browser-side snapshot access | Would expose/download a large reference dataset |
| Immediate removal of insights/taxonomy | Existing weekly sync needs an atomic artifact-publication replacement first |
| Automatic destructive cutover | Requires separate evidence and user approval |

## 8. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Does the generated SQLite artifact stay within Vercel function/deployment limits? | Determines bundled file versus versioned object storage |
| 2 | What parity observation window is sufficient before storage reclamation? | Determines cutover timing |
| 3 | Should future insight/taxonomy snapshots trigger a redeploy or be fetched by version? | Determines freshness workflow |
