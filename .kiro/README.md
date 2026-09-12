# Kiro Agent Team

A reusable set of AI agents, steering conventions, and product-level documents designed to run a structured software delivery process inside [Kiro](https://kiro.dev). Drop this into any project's `.kiro/` directory (or `~/.kiro/` for cross-project use) and you have a full team ready to go.

## The Team

| Alias | Role | Named after | What they own |
|-------|------|-------------|---------------|
| **Marty** | Product Manager | Marty Cagan | Problem discovery, requirements.md (EARS notation), success metrics, scope |
| **Dieter** | UI/UX Designer | Dieter Rams | User flows, interaction specs, visual design, accessibility, UX section of design.md |
| **Margaret** | Fullstack Developer | Margaret Hamilton | Architecture section of design.md, tasks.md, implementation, tests |
| **Charity** | DevOps Engineer | Charity Majors | Operations section of design.md, CI/CD, infrastructure, observability, security, cost |
| **James** | Tester | James Bach | Test strategy, test-plan.md, automation, exploratory testing, release gate |
| **Gene** | Delivery Lead | Gene Kranz | Handoff gating, issue triage, loop-back orchestration, delivery-log.md, living spec, debt register |
| **Peter** | Talent Manager | Peter Drucker | Capability audits, steering file hygiene, feedback-driven learning, persona edits |

## How it works

### The delivery flow

```
You → Marty (PM) → Dieter (Designer) ┐
                                      ├→ Margaret (Dev) + Charity (DevOps) in parallel → James (Tester) → Release
                                      ┘
```

**Gene** (Delivery Lead) gates every handoff and triages issues. **Peter** (Talent Manager) audits capabilities before implementation and turns feedback into lasting team improvements.

### Starting a new feature

1. **Invoke Gene** (the Delivery Lead). He orchestrates everything from here.
2. Gene prompts you for context (users, outcomes, constraints) — answer once, not piecemeal.
3. Gene invokes Marty (PM) to produce `requirements.md`.
4. At each handoff, Gene checks the deliverable against the quality bar, then **asks you to approve before moving on**. You can request changes, approve, or tell Gene to auto-approve the remaining handoffs.
5. Each subsequent role is invoked only after you've signed off on the previous deliverable.
6. At release, Gene updates the living spec and captures any tech debt.

You can also invoke any agent directly if you need a specific piece of work outside the full flow.

### When things go wrong

Bugs and issues get triaged by Gene using the routing playbook (`convention-handoff-routing.md`). He diagnoses root cause — not symptom — and routes to the right role. If a fix requires multiple roles (e.g., Designer specs a missing state → Developer implements → Tester re-verifies), Gene orchestrates the loop-back and logs it.

### Giving feedback

When you're unhappy with output or notice a recurring problem, tell Peter (Talent Manager). He diagnoses whether it's a persona gap, skill gap, convention gap, or workflow gap, and proposes the smallest change that prevents recurrence. All changes are logged in `_feedback-log.md`.

## Directory structure

```
agents/
├── delivery-lead.md          Gene — orchestration & triage
├── devops-engineer.md         Charity — platform & operations
├── fullstack-developer.md     Margaret — architecture & implementation
├── product-manager.md         Marty — requirements & scope
├── talent-manager.md          Peter — team capability & learning
├── tester.md                  James — test strategy & quality gate
└── ui-ux-designer.md          Dieter — UX design & accessibility

specs/
├── product-spec.md            Living spec — product-level summary of shipped features
├── tech-debt-register.md      Product-wide technical debt tracker
└── <feature>/                 Per-feature spec folder (created per feature)
    ├── requirements.md            Marty's deliverable
    ├── design.md                  Shared: Dieter (UX) + Margaret (Architecture) + Charity (Operations)
    ├── tasks.md                   Margaret's implementation plan
    ├── test-plan.md               James's test strategy
    ├── capability-audit.md        Peter's gap analysis
    └── delivery-log.md            Kelly's audit trail

steering/
├── _feedback-log.md           Append-only team learning log (Peter)
├── convention-handoff-routing.md   Who owns what — the routing playbook (always loaded)
├── convention-living-spec.md       Rules for the product-level living spec (always loaded)
└── convention-tech-debt-register.md Rules for the tech debt register (always loaded)
```

## Steering conventions

Three steering files are loaded on every interaction (`inclusion: always`):

| File | Purpose |
|------|---------|
| `convention-handoff-routing.md` | The team's shared routing playbook — forward chain, gate definitions, triage taxonomy |
| `convention-living-spec.md` | How the product-level living spec is structured and maintained |
| `convention-tech-debt-register.md` | How tech debt is logged, categorised, and reviewed |

Agent personas (`agents/*.md`) are `inclusion: manual` — they load only when you invoke that specific agent.

## Product-level documents

Two documents track the product as a whole, not individual features:

- **`specs/product-spec.md`** — The living spec. A summarised view of every shipped feature. Updated by Gene at feature close-out, reviewed by Marty for accuracy. Read this to understand what the product *is* right now.

- **`specs/tech-debt-register.md`** — Every known shortcut, deferred improvement, and accepted risk. Any agent can log entries; Gene ensures nothing falls through; Marty prioritises paydown.

## Setting up in a new project

1. Copy this directory structure into your project's `.kiro/` folder (or symlink for cross-project use).
2. Invoke Gene to start your first feature.
3. As features ship, the living spec and debt register build up automatically.
4. When Peter (Talent Manager) identifies skill gaps, he'll create `skill-*.md` and `context-*.md` steering files — these grow organically with the project.

## Tips

- **Start with Gene.** He'll ask you the right questions and invoke the right agents in order. You don't need to remember the flow.
- **Answer context questions once.** Gene batches them into a single structured ask per phase. Don't drip-feed — give him everything at once.
- **Trust the gates.** If Gene blocks a handoff, the gap is real. Fix it upstream rather than pushing a half-deliverable downstream.
- **Feed Peter.** When something annoys you or the same mistake recurs, tell Peter. He turns one-off pain into permanent team knowledge.
- **Keep the debt register honest.** Log debt at the moment you create it, not "later." Later never comes.
- **Don't skip the PM.** It's tempting to jump straight to design or code. Marty's discovery phase is where you prevent building the wrong thing.
