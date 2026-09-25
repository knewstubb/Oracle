# Oracle — locked decisions register

Locked means: build on it, don't relitigate it. To change one, an agent raises a challenge in its report; only the owner can unlock. The Orchestrator records changes here after approval.

## Data model
- **D-001** Three core tables: `user_cards`, `user_copies`, `deck_cards`. Proxies are `user_copies` rows with `is_proxy = true`, not a separate table. *(Updated 2026-09-25: owner chose the `user_` prefix to match the deployed schema and avoid a wide rename refactor.)*
- **D-002** Deck lifecycle has exactly three states: Brew / Boxed / Archived. *(Under review 2026-09-25: owner deferred the decision; no change until M1 exit test is complete.)*
- **D-003** `scryfall_id` (printing) and `oracle_id` (canonical card) are never interchangeable. Resolution functions are discrete and unit-tested.
- **D-004** Finish (`nonfoil` / `foil` / `etched`) is an independent attribute on the physical copy. *(Updated 2026-09-25: owner chose `nonfoil` as the common term.)*
- **D-005** Maybeboard is modelled as a separate `deck_cards` relation.
- **D-006** Clean slate beats complex migration: when the schema changes significantly, prefer flush-and-rebuild over a convoluted migration (owner approval required each time).

## Allocation
- **D-007** The destructive clear-and-recompute Allocation Resolver is retired as a write path. Its compute layer is reused as a suggestion engine that proposes allocations without writing them.

## Brew Canvas
- **D-008** Free-drag with snap-to-grid at launch.
- **D-009** Drag-to-assign is the single placement mechanic. Every placement carries a `source` parameter (e.g. `manual`, `ai`) so undo, validation and audit logging are shared across manual and AI placement.
- **D-010** Secondary category is shown as a badge.
- **D-011** No phase gates on conversation in Brew mode. Commit lives on the candidate card itself; candidates and committed cards are different visual object types.

## Visual language and accessibility
- **D-012** Ownership state is encoded with colour plus a label or icon, never colour alone (WCAG 1.4.1).
- **D-013** Status hues stay outside the WUBRG palette so they never read as mana identity.
- **D-014** Quiet default, loud exception: the normal owned state is visually quiet; proxy, over-allocated and unowned states carry the visual weight.
- **D-015** Controls sit visually inside the scope they act on (object-action mapping). Dashed borders mean empty drop zones, never clickable actions.

## AI features
- **D-016** Structured data from LLMs comes via tool use or a JSON sidecar block. No regex parsing of prose.
- **D-017** Category-count vs curve-target conflict (EDHREC archetype data vs Karsten CMC maths) is handled with cross-referenced warning messages, not a full category-by-CMC target matrix.

## Import and collection parity
- **D-018** Archidekt maybeboard and sideboard cards are both imported into Oracle's maybeboard relation (`deck_cards` with the maybeboard relation per D-005). *(Locked 2026-09-26 after T-13 M1 exit test.)*
- **D-019** Archidekt proxy labels are **not** automatically honoured during built-deck import. Proxy status is set manually in Oracle. *(Locked 2026-09-26 after T-13 M1 exit test.)*
- **D-020** Import does **not** run an automatic allocation pass. Unassigned `deck_cards` slots remain planned until the user explicitly assigns them. *(Locked 2026-09-26 after T-13 M1 exit test.)*
- **D-021** Copy assignments must match the exact printing (`scryfall_id`) when possible. Instance-level accuracy is a core concept: the app must know exactly which physical copy is in which deck. *(Locked 2026-09-26 after T-13 M1 exit test.)*

## Open — not locked; do not build on these without owner input
- **O-001** Moxfield import path: needs a direct curl test of `api.moxfield.com/v2/decks/all/{id}` before committing.
- **O-002** Multi-user scale: connection pooling, indexes, concurrent-write races and external API rate limits are unvalidated.
- **O-003** Mana curve slider (single slider for target average CMC driving curve target and land count) — roadmap, not specced.
- **O-004** Post-game debrief and passive deck health monitoring — roadmap, not specced.
