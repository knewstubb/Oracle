# The Oracle Documentation

Use this index to find current product and operational documentation. Runtime code remains the final source of truth when a document is stale.

## Start Here

- [Collection migration readiness audit](audits/collection-migration-readiness-2026-09-03.md) — current go/no-go decision, blockers, cleanup classification, and required product decisions.
- [User guide](user-guide.md) — current end-user workflows.
- [Roadmap](roadmap.md) — product roadmap; verify completion claims against code and the readiness audit.
- [Infrastructure & quality roadmap](roadmap/infrastructure.md) — operational controls and outstanding quality work.
- [Card movement reference](card-movement-reference.md) — allocation terminology and supported card movement flows.

## Domain References

- [Category taxonomy](category-taxonomy.md)
- [Deck taxonomy](deck-taxonomy.md)
- [EDHREC sync](edhrec-sync.md)
- [Insight schema](insight-schema.md)

## Design Documents

Documents under [`design/`](design/) describe design intent and may include planned or superseded behavior. They are not automatically evidence that a feature shipped.

## Authority and Maintenance

| Question | Authoritative source |
|---|---|
| What does the app do now? | `src/` and deployed behavior |
| What schema is intended? | `.kiro/steering/schema-card-data.md`, verified against deployed Supabase |
| Why was a feature designed this way? | `.kiro/specs/<feature>/` and delivery log |
| Is the collection safe to migrate? | Latest document under `docs/audits/` |
| What is planned? | `docs/roadmap/` |

When behavior changes, update the relevant feature spec/delivery log and this documentation in the same logical change. Do not call CSV export a complete backup unless a tested round-trip reconstructs all required relational state.
