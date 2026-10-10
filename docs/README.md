# The Oracle Documentation

Use this index to find current product and operational documentation. Source and verified deployed behaviour establish what exists; the current decisions register establishes what is intended.

## Start Here

- [Current decisions](oracle/decisions.md) — approved product meanings and behaviour.
- [Current task status](oracle/status.md) and [approved roadmap](oracle/roadmap.md) — delivery scope and owner gates. The milestone-marker discrepancy is recorded as O-006; named preparation exceptions do not authorise a milestone transition.
- [Feature portfolio audit and proposed roadmap](oracle/reports/2026-09-29-orchestrator-feature-portfolio-audit.md) — September 29 feature state, corrected competitor research, essential versus optional work, and proposals awaiting review.
- [Behaviour](oracle/plans/01-behaviour-and-actions.md), [components/screens](oracle/plans/02-components-and-screens.md), and [loading](oracle/plans/03-loading-performance.md) — current owner-review plans; implementation and mockups retain approval gates.
- [User guide](user-guide.md) — existing workflow reference; check older terminology against current decisions.
- [Historical product roadmap](roadmap.md) — broad feature/idea inventory, not the current milestone authority.
- [Infrastructure & quality roadmap](roadmap/infrastructure.md) and [September 3 migration audit](audits/collection-migration-readiness-2026-09-03.md) — historical findings to reconcile with later fixes and deployment evidence, not an automatically current go/no-go verdict.
- [Card movement reference](card-movement-reference.md) — earlier movement reference; current decisions/contracts take precedence.

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
| What does the app do now? | `src/`, actual mounted surfaces, and verified deployed behaviour |
| What behaviour/data model is approved? | `oracle/decisions.md` and current contracts under `oracle/contracts/`; verify deployment against `oracle/status.md` and Supabase evidence |
| Why was a feature designed this way? | Current decisions/contracts first; `.kiro/specs/<feature>/` and delivery history for earlier intent |
| Is the collection safe to migrate or recover? | Current source, deployment and recovery evidence; reconcile historical audits with later fixes and the owner's accepted data-reliance scope |
| What work may start? | `oracle/roadmap.md`, `oracle/status.md`, explicit scoped authorisations and owner gates |
| What other ideas have been discussed? | The feature portfolio audit, historical `roadmap/`, specifications and product research; proposals are not approvals |

When behavior changes, update the relevant feature spec/delivery log and this documentation in the same logical change. Do not call CSV export a complete backup unless a tested round-trip reconstructs all required relational state.
