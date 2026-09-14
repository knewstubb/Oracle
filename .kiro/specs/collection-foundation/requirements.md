# Requirements: Collection Foundation

> Status: Draft
> Last updated: 2026-09-12
> Owner: Product (interviewed) + Delivery Lead

## 1. Problem Statement

The Oracle tracks a Magic collection at the physical-copy (instance) level and allocates specific copies to deck slots. Over several months the model accreted features, and the ground-level data model has drifted from the intended mental model in three ways that undermine trust:

1. **A card can be in two places at once (or none).** Storage location and deck assignment are independent columns with no invariant tying them together.
2. **There is no explicit "planned vs sleeved" distinction.** Once a copy is assigned to a slot it is simply "assigned"; the system cannot represent "I intend this card here but the physical card has not moved yet."
3. **Physical movements are not consistently confirmed or atomic.** Some allocation flows are non-atomic, and decklist/AI-driven changes can move cards without warning or origin selection.

Until the foundation reflects the real-world rule — *a physical card is in exactly one place, and moving it is a deliberate, confirmed, atomic act* — higher-level features (health, upgrade, brew) sit on unstable ground.

## 2. Outcome

The data model and core flows provably match this mental model:

- Every physical copy (original or proxy) is in **exactly one location** at all times: a named storage location **or** a deck slot.
- A deck slot moves through **Empty → Planned → Sleeved**, and the system shows the right information at each stage.
- Every action that implies a **physical movement** is atomic and, where the user did not directly trigger that specific move or the source is ambiguous, is confirmed.

## 3. Users

| User | Role |
|------|------|
| Owner (single user) | Builds Commander decks, tracks a physical collection, imports from Archidekt for speed, uses AI to help build |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Any operation that changes a copy's location SHALL be atomic (all-or-nothing); no intermediate state may leave a copy in two locations or none. |
| NFR-2 | Location state SHALL have a single source of truth; derived and stored representations SHALL NOT be allowed to drift. |
| NFR-3 | The model SHALL remain instance-level: N physical copies of a card are N rows (generic basic lands excepted). |
| NFR-4 | Scryfall SHALL remain the source for card identity, printing IDs, and prices, read from local reference tables. |
| NFR-5 | Read-only integrity checks SHALL be runnable at any time to prove the invariants hold. |

## 5. User Stories & Acceptance Criteria

### 5.1 One location per card

**US-5.1.1** As the owner, I want every copy to be in exactly one place so my collection reflects physical reality.

#### Acceptance Criteria
- THE SYSTEM SHALL represent, for every `user_copies` row, exactly one current location: either a storage location or a single deck slot.
- WHEN a copy is sleeved into a deck, THE SYSTEM SHALL remove it from its storage location.
- WHEN a copy is removed/unsleeved from a deck, THE SYSTEM SHALL return it to a storage location.
- THE SYSTEM SHALL NOT permit a copy to be referenced as sleeved by more than one deck slot.
- A read-only check SHALL report zero copies that are in both a deck and storage, and zero sleeved copies that are in no location.

### 5.2 Storage locations with a default

**US-5.2.1** As the owner, I want a default place for unsorted cards and the ability to make binders/boxes.

#### Acceptance Criteria
- THE SYSTEM SHALL provide a default storage location for every user (the "unsorted" box).
- WHEN a copy has no deliberately chosen location, THE SYSTEM SHALL place it in the default storage location.
- THE SYSTEM SHALL allow creating, renaming, and choosing named storage locations (binder/box).
- Proxy copies SHALL have a storage location on the same terms as originals.

### 5.3 Slot lifecycle: Empty → Planned → Sleeved

**US-5.3.1** As the owner building a deck, I want each of the ~100 slots to progress from empty to planned to physically sleeved, showing the right info at each stage.

#### Acceptance Criteria
- A slot with no intended card SHALL be **Empty**; a named deck-card row with no assigned copy SHALL be **Planned**, never Empty.
- WHEN the owner names a card for a slot without moving a physical card, THE SYSTEM SHALL mark the slot **Planned** and show an allocation context: **Available**, **Alternate**, **Claimed**, **Unowned**, or the generic-land exception where applicable.
- WHEN a physical copy is placed in the deck, THE SYSTEM SHALL mark the slot **Sleeved** and show only whether the sleeved copy is **Original** or **Proxy**.
- THE SYSTEM SHALL derive lifecycle from copy assignment and allocation context from physical-copy availability/proxy state, with no independently-stored lifecycle or ownership status permitted to drift.

### 5.4 Confirmed, atomic movement

**US-5.4.1** As the owner, I want physical movements to be deliberate, match the import intent I selected, and never leave the collection in an impossible state.

#### Acceptance Criteria
- WHEN the owner clicks an explicit move/assign action, THE SYSTEM SHALL perform the move without a second confirmation because the source and target intent are already shown.
- WHEN the owner confirms **Built** import intent, THE SYSTEM SHALL treat that choice as confirmation that the imported list represents the physical deck and SHALL reconcile eligible free copies into that deck without individual per-card confirmations.
- A Built import SHALL NOT silently pull a copy from another deck. WHEN no eligible free copy can satisfy a requested slot, THE SYSTEM SHALL leave that slot Planned and return a structured conflict explaining the requested, assigned, and unresolved quantities and the reason.
- WHEN a manual allocation has multiple candidate source copies, THE SYSTEM SHALL require the owner to choose the source.
- WHEN the AI proposes adding or removing cards, THE SYSTEM SHALL require explicit owner confirmation before applying (current policy: always confirm).
- Every physical movement or release SHALL be applied atomically.

### 5.5 Import respects the lifecycle and physical reality

**US-5.5.1** As the owner, I want each import to state whether it is a theorycrafted list, an already-built deck, or new physical cards so the resulting lifecycle matches reality.

#### Acceptance Criteria
- WHEN the owner imports a **Theorycrafted** deck, THE SYSTEM SHALL create or update named deck-card slots as Planned, SHALL NOT create collection copies, and SHALL NOT move any physical copy.
- WHEN the owner imports a **Built** deck, THE SYSTEM SHALL preserve matching valid sleeve assignments, SHALL reconcile eligible free collection copies into newly required slots, and SHALL leave every unmatched slot Planned with a structured conflict rather than taking a copy from another deck.
- WHEN the owner imports **New cards**, THE SYSTEM SHALL atomically create the imported physical copies and assign them to the target deck; non-proxy copies SHALL be Sleeved/Original and proxy copies SHALL be Sleeved/Proxy.
- WHEN a Built reimport removes a previously Sleeved card, THE SYSTEM SHALL atomically release its copy to default storage because the imported list is the owner’s stated physical reality.
- WHEN a Theorycrafted reimport changes a list, THE SYSTEM SHALL NOT move or release physical copies; matching existing assignments remain Sleeved until the owner explicitly changes them.
- Collection import SHALL remain separate from deck import and SHALL create instance-level copies in the default (or specified) storage location without assigning them to a deck.

## 6. In Scope

- One-location invariant and its enforcement (atomic moves).
- Default + named storage locations, including for proxies.
- Explicit Planned vs Sleeved slot lifecycle and the redefined state display.
- Single source of truth for slot/location state; retiring drift.
- Confirmation rules: explicit-move (none), decklist change (warn), ambiguous origin (pick), AI (always).
- Import alignment with the lifecycle.
- Read-only integrity verification.

## 7. Out of Scope (parked)

| Item | Reason |
|------|--------|
| Missing/lost card handling | Explicitly parked as a later problem |
| Default storage location *per card* (auto-return to a card's home) | Nice-to-have later; not now |
| Locking copies in Built decks | Decided against — copies are pullable from anywhere, user chooses |
| Brew canvas, deck health, upgrade tab, price cron, PWA | Higher-level features; foundation first |
| Multi-user / RLS hardening | Tracked separately (TD-037) |

## 8. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Exact UI affordance for the origin-picker (inline vs modal) | Design detail, not model |

## 9. Provenance

- Authored from a structured product interview on 2026-09-12.
- Grounded against a read-only audit of the live schema and core flows (card-status, allocation RPCs, import engines, AI tool loop).
- Motivated by user request to verify the foundation matches intent before building further.
