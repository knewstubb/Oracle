# Design: Commander Context Snapshot

> Last updated: 2026-09-12
> Status: In Review
> Reference implementation: `src/lib/commander-build-data.ts`, `scripts/sync-edhrec-builds.ts`

## Design Goals

- Recover most commander-context database capacity without weakening deck foreign keys.
- Preserve API and AI behavior through a storage-agnostic repository.
- Make snapshot generation and publication deterministic, inspectable, and reversible.
- Prevent large reference data from entering browser bundles.

## Design Principles for This Feature

| Principle | Application |
|-----------|-------------|
| Thin identities, local payload | Keep commander/build UUID rows in Postgres; move bulky build-card payload |
| Shadow before cutover | Compare local and Supabase results while users still receive Supabase output |
| Immutable publication | Version, checksum, validate, and atomically rename snapshots |
| Explicit failure | Missing/corrupt snapshots never degrade into fabricated recommendations |
| Progressive migration | Move the 187 MB build-card table first; defer frequently refreshed context |

## Screens & Components

No user-facing layout or interaction changes.

### Component: Commander context exporter

A Node.js script reads `ref_build_cards` in deterministic order using paginated Supabase queries, writes a temporary SQLite database, builds indexes, validates counts and sampled query semantics, computes SHA-256, writes a manifest, then atomically renames both artifacts into `data/commander-context/`.

### Component: Build-card snapshot repository

A server-only module opens the SQLite database read-only and exposes the existing query semantics: cards by build, type and minimum inclusion rate; signature cards; staple cards; and batched synergy lookup by build/card names.

### Component: Source selector

`COMMANDER_CONTEXT_SOURCE` supports:

- `supabase` — current production behavior and rollback path.
- `shadow` — return Supabase results, query SQLite in parallel, and emit structured parity differences.
- `snapshot` — return SQLite results after manifest/checksum validation.

## Interactions

1. Operator runs the exporter against production reference tables.
2. Exporter validates rows/counts and publishes a new immutable artifact plus manifest.
3. Build includes the artifact through explicit Next.js output file tracing.
4. Deployment starts in `shadow` mode and compares representative queries.
5. After parity evidence passes, deployment switches to `snapshot` mode.
6. Only then is a storage-reclamation migration proposed for explicit approval.

## Accessibility Notes

No UI changes. Existing accessible components and copy remain unchanged.

## Design Decisions & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Snapshot format | SQLite | Monolithic JSON | Indexed filtered reads avoid loading the full dataset into each server process |
| Runtime | Node.js | Edge | `better-sqlite3` and filesystem access require Node.js |
| First migrated payload | `ref_build_cards` | All commander tables | Largest safe win; no scheduled writer currently refreshes it |
| Identity storage | Keep in Postgres | Move everything | Preserves `decks.commander_id`/`build_id` foreign keys for ~7 MB |
| Publication | Bundled immutable artifact initially | Runtime mutable file | Vercel filesystems are read-only and deployment artifacts are auditable |

---

## Architecture

### Overview

Production measured 504 MB total. The first increment moves `ref_build_cards` (187 MB total: 49 MB heap and 139 MB indexes) into a compact read-only SQLite artifact. `ref_edhrec_recommendations` is empty but retains 49 MB of indexes and is a separate low-risk reclamation candidate after dependency verification. Insights and taxonomy remain live until their weekly writer is redesigned.

### Components

| Component | Role | Location |
|-----------|------|----------|
| Exporter | Paginate, normalize, validate, publish | `scripts/export-commander-context.ts` |
| SQLite schema | Stable local query model and indexes | Created by exporter |
| Manifest validator | Verify schema version, counts, and checksum | `src/lib/commander-context/manifest.ts` |
| Snapshot repository | Read local build-card data | `src/lib/commander-context/snapshot-repository.ts` |
| Supabase repository | Preserve rollback/current source | `src/lib/commander-context/supabase-repository.ts` |
| Source selector | Supabase/shadow/snapshot policy | `src/lib/commander-context/repository.ts` |
| Existing facade | Keep current callers stable | `src/lib/commander-build-data.ts` |

### Snapshot Data Model

```sql
CREATE TABLE build_cards (
  build_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  card_type TEXT,
  synergy_score REAL,
  inclusion_rate REAL,
  position INTEGER,
  is_signature INTEGER NOT NULL,
  is_staple INTEGER NOT NULL,
  PRIMARY KEY (build_id, card_name)
);

CREATE INDEX build_cards_rank
  ON build_cards(build_id, synergy_score DESC, inclusion_rate DESC, position ASC);
```

Manifest fields:

- `schemaVersion`
- `generatedAt`
- `sourceProjectRefHash` (non-secret identifier hash)
- `sourceTables` with counts and maximum update timestamps
- `snapshotBytes`
- `sha256`

### State Management

The snapshot is immutable per deployment. A process-local singleton may hold the read-only SQLite handle. Source mode is a server-only environment variable. Shadow mismatches use structured logs with build ID, operation, source counts, and checksums; card payloads are not logged wholesale.

### Next.js and Vercel Packaging

Next.js 16 automatically externalizes `better-sqlite3` for Node.js server code. `next.config.ts` will use narrow `outputFileTracingIncludes` patterns for server routes that consume commander context, as documented by the installed Next.js 16 `output` guide. Build validation must inspect emitted trace files and deployed behavior before snapshot mode is enabled.

### Security Review

- Snapshot contains public/reference commander data only.
- No Supabase keys, user IDs, collection rows, decks, or auth data are written.
- Export requires server-side service credentials but artifacts do not retain them.
- Runtime opens SQLite read-only and validates checksum before use.
- Source project identity is hashed in the manifest to avoid embedding project configuration.

### Rollout

1. Generate and validate snapshot; keep production reads on Supabase.
2. Deploy in `shadow` mode and collect parity evidence.
3. Switch to `snapshot` mode with Supabase data intact.
4. Observe at least one normal usage/release cycle.
5. Present storage-reclamation migration and evidence for approval.
6. After approved cutover, retain the prior snapshot and rollback configuration.

### Rollback

Before table removal, set `COMMANDER_CONTEXT_SOURCE=supabase` and redeploy. After removal, rollback requires restoring the migrated table from the retained snapshot or deploying the previous database migration; therefore destructive cutover has its own approval gate and rehearsal.

### Trade-offs & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Bundle snapshot | Initial approach | Object storage + `/tmp` cache | Simpler and network-independent; switch if Vercel size evidence fails |
| Keep weekly data in DB | Yes initially | Snapshot all context now | Avoids redesigning scheduled publication in the first storage-recovery increment |
| SQLite native dependency | Reuse existing `better-sqlite3` | JSON shards | Efficient query semantics; Next.js 16 already treats package as server-external |

### Open Questions

- Actual generated SQLite size and emitted Vercel trace size.
- Shadow parity observation duration.
- Future artifact hosting when insights/taxonomy join the snapshot.
