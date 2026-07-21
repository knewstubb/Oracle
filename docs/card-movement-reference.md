# Card Movement Reference

What every action that moves a card actually does, where it lives in the UI, and whether it's built. Compiled by reading the actual code (not the specs) on 2026-07-16 — this reflects what's true today, not what was planned. Terminology ratified 2026-07-16, revised same day after review.

## 1. Vocabulary

- **Card** — the abstract card, independent of printing. "Sol Ring" as a concept. `card_definitions`, keyed by Scryfall's `oracle_id`.
- **Printing** — one specific print run of a Card. "Sol Ring (Commander 2021)." `scryfall_printing_id`.
- **Copy** — one specific real-or-proxy object you own, of a Card, usually tied to a Printing. `physical_copies`.
- **Location** — wherever a Copy currently sits: a specific storage location ("Box 3") or "Unsorted" if none is set. Not a "home" and nothing about it is permanent — it's just the current value of `physical_copies.storage_location_id`, changed by Relocate, and by nothing else.
- **Slot** — a labeled container on a deck's list with an acceptance rule: "accepts 1x of Card = Sol Ring." `deck_cards`. A Slot is not bonded to any particular Copy — it just asks "is a matching Copy currently sitting here, yes or no." When a Copy leaves, the Slot doesn't lose anything of its own; it goes back to being an empty container waiting for the next Copy that fits the rule. This is exactly why Reassign/Claim/Fill are one-way with no auto-refill: the system was never tracking a bond between a specific Slot and a specific Copy, only whether the rule is currently satisfied.
- **Missing** — a flag on a Copy (`missing = true`), not a Location and not a Slot state. Unlinks it from any Slot it was in, excludes it from every count and candidate pool, reversible via Mark Found. See the open question below — this flag currently ignores Location, which is probably wrong.

**Correction from the first draft:** the "library book with a permanent call number" framing overstated it. There's no separate "permanent home" distinct from "current location" — Location just *is* wherever the Copy currently sits. The real point worth keeping is narrower: Reassign changes which Slot references a Copy; it never touches that Copy's Location field. Those are two different pieces of data, updated by two different actions, and nothing bundles them today.

**Open question, not yet resolved:** should a Missing Copy's Location get cleared or overridden (effectively "Missing" becomes a value Location can hold), instead of silently keeping whatever shelf it was last on? Today it's the latter — `markCopyMissing()` only flips the `missing` boolean and unlinks any deck Slot; `storage_location_id` is left untouched. That means a Missing Copy still claims to be in Box 3 even though "missing" is the whole reason you can't trust that. Flagged in the punch list.

## 2. Standardized action names

| Your term | Standardized name | Status |
|---|---|---|
| Initial migration (Archidekt/Moxfield/CSV, empty account) | **Migrate Collection** — one-time bootstrap, collection + decks together | ✅ Built — `app/onboarding`, `/api/onboarding/moxfield/*`. [Guessing] I couldn't find an enforced "blocks unless the account is empty" check — may be product convention (new accounts land here) rather than a hard gate. Confirm if you want it actually enforced |
| Add a deck to Oracle for the first time (any time, not just during migration) | **Add Deck** | ✅ Built — `/api/decks/import` |
| Update collection via csv/txt | **Collection Reimport** | ✅ Built — `/api/collection/import`. Verified: this computes a full delta (`added`/`removed`/`quantityChanged`) against the source file, so anything not in the new file is removed. That's replace-to-match, correctly named Reimport, not a merge-only Import |
| Re-sync a deck already in Oracle against its source | **Deck Reimport** | ✅ Built — `/api/decks/[id]/reimport`. This name already existed in the code — Collection and Storage are now aligned to it, not the other way round |
| Update storage location via csv/txt | **Storage Reimport** | 🔴 Not built. Named now for consistency with the other two |
| Add to deck — via Search | **Add to Deck (Search)** | ⚠️ [Guessing] No card-search-and-add picker found anywhere — only a chat-based AI builder (`brew-v2/ChatPanel`). Confirm this doesn't already exist |
| Add to deck — via Txt | **Add to Deck (Txt)** | Probably the same path as Add Deck, not a separate single-card action — confirm intent |
| Add to deck — via Reassign | *(folds into Reassign)* | ⚠️ **Correction**: Reassign cannot introduce a Card to a deck that doesn't already list it. The destination deck must already have an open Slot for that Card |
| Remove card from deck | **Remove** — deletes the Slot | 🔴 Frontend wired, backend route missing (404s today) |
| Move Copy to another deck | **Reassign** — destination chosen, source Slot goes back to unresolved | ✅ Built |
| Move Copy out of a deck | **Unassign** — now with a destination choice (see §5) | ✅ Built, being extended |
| Move Copy to a different Location | **Relocate** — `PATCH /api/collection/assign-location` | ✅ Built, not yet exposed as its own single step from a deck Slot |
| Add a new proxy Copy | **Add Proxy** | ✅ Built in 3 places, 2 redundant. New requirement added — see §4 and punch list |
| Swap Copy with another deck or Location | **Swap** | ⚠️ Only exists narrowly (proxy ↔ a specific storage original) |
| Delete card from collection | **Delete** — permanently removes the Copy | ✅ Built |
| Mark card as missing | **Mark Missing** / **Mark Found** | ✅ Built. See open question in §1 |
| Mark card as buylist | **Add to Buylist** (not "Mark") | 🔴 Not built. Tags an empty Slot, not an existing Copy — build against `deck_cards`, not `physical_copies` |

## 3. The five Slot states (+ Missing, which isn't one)

From `lib/card-status.ts`, the single source of truth the whole app reads from:

| State | Meaning |
|---|---|
| **Original** | Slot currently has a real, owned Copy sitting in it |
| **Proxy** | Slot currently has a proxy Copy sitting in it |
| **Open** | Slot is empty, but a free Copy of this Card exists somewhere in your collection |
| **Claimed** | Slot is empty, Copies of this Card exist, but all are sitting in other Slots |
| **Unowned** | Slot is empty and you don't own a single Copy of this Card anywhere |
| **generic_land** | Basic land, exempt from all of this — never tracked |

## 4. Every action, what it actually does, and whether it works

"Leaves a gap?" = does the *other* side of the move end up unresolved, requiring a separate action to fill it later.

| Action | What moves | Endpoint | Leaves a gap? | Where in the UI | Status |
|---|---|---|---|---|---|
| **Fill** | A known free Copy → this Slot | `POST /api/allocation/assign` (tier 1–2) | No (target only) | Cards Tab status chip, Picklist | ✅ Working |
| **Claim (Tier 3)** | A Copy currently sitting in another *Brew*-status deck's Slot → this Slot | same endpoint, `tier: 3` | **Yes** — source Slot goes back to unresolved, no auto-refill | Cards Tab, Picklist | ✅ Working |
| **Claim (Tier 4)** | Same, but source deck is Boxed/Built | same endpoint, with confirmation modal | **Yes** | Cards Tab, Picklist | ✅ Working |
| **Add Proxy (Tier 5, slot-scoped)** | New proxy Copy created → placed directly in this Slot | `POST /api/allocation/assign` `createProxy:true` — *also* a near-identical separate endpoint `POST /api/allocation/add-proxy` | No | Cards Tab status chip (Open/Claimed/Unowned) | 🔴 **Dead stub**, AND missing a requirement: needs a way to copy/download the source Printing's image for home printing (we're not printing it for them). That needs a Printing chosen first — currently proxies are created with `scryfall_printing_id = null` by explicit design ("printing picker out of scope"). That decision needs to be reversed for this to work at all |
| **Reassign** | This specific Copy → an empty Slot in a different deck | `POST /api/allocation/reassign-to-deck` | **Yes**, by design — code comment: *"do NOT trigger any auto-resolution of the resulting gap. The gap stays unresolved."* | Cards Tab, Instance Panel | ✅ Working |
| **Replace with original ("Swap," narrow)** | Proxy sitting in this Slot ↔ a specific original Copy at a Location, both in one move | `POST /api/allocation/replace-with-original` | **No** — atomic single update, Slot never empty | Cards Tab, Instance Panel | ✅ Working. Only handles proxy ↔ storage-original — no general deck-to-deck swap exists |
| **Mark Missing** | Copy flagged `missing=true`, unlinked from whatever Slot it sat in. Location field is *not* updated — open question, see §1 | `POST /api/physical-copies/[id]/missing` | **Yes** | Instance Panel (working) / Cards Tab (dead stub) | ⚠️ **Split** — real backend; wired in one surface, a no-op button in the other |
| **Mark Found** | `missing=false`, returns to the free pool | `DELETE /api/physical-copies/[id]/missing` | N/A | Collection missing-copies list | ✅ Working |
| **Remove** | Deletes the Slot itself (deck no longer wants this Card) | `DELETE /api/decks/[id]/cards/[cardId]` | N/A | Cards Tab kebab menu | 🔴 **Broken** — no backend route exists at that path. 404s today |
| **Unassign** | Pull a Copy out of the Slot it's sitting in, back to unresolved | `POST /api/collection/instances/unassign` | **Yes** | Instance Panel | ✅ Working today with no destination choice — extend per §5 |
| **Relocate** | Change a Copy's Location — independent of which Slot, if any, currently references it | `PATCH /api/collection/assign-location` | N/A | Storage page (implied — not confirmed wired from Cards Tab) | ✅ Built, endpoint exists |
| **Delete** | Unlink from any Slot, then permanently delete the `physical_copies` row | `POST /api/collection/instances/delete` | **Yes** (if a Slot referenced it) | Instance Panel (inline confirm) | ✅ Working |
| **Add Proxy (collection-level)** | New proxy Copy created, lands Unsorted — no Slot references it | `POST /api/collection/instances/add-proxy` | N/A | Instance Panel ("shortfall" prompt) | ✅ Working. Same Printing-image requirement as above applies here too |
| **Assign free copy (from Storage)** | A free Copy → an empty Slot in a chosen deck, initiated from the Storage page | `POST /api/allocation/assign-free-copy` | No | Storage location detail page | ✅ Working |
| **Undo** | Reverses the last Fill/Claim — back to free/Unsorted, or restores the exact previous Slot (blocked if claimed elsewhere since) | `POST /api/allocation/undo` | — | Cards Tab, Picklist (toast action) | ✅ Working |
| **Auto-assign all Brew decks** | Bulk Fill (Tier 1–2 only) across every unresolved Slot in every Brew-stage deck. Never touches Boxed/Archived. Never clears existing assignments | `POST /api/allocation/resolve` | No | Allocation page | ✅ Working |
| **Bulk actions** (multi-select) | Assign-to-Location/Move, Mark Missing, Delete | `BulkActionBar` | varies | Storage / Collection multi-select | ✅ Working. Reassign, Fill, Claim, Add Proxy explicitly excluded from bulk — each needs a per-card decision |
| **Archidekt import/diff** | Reconciles a deck's whole Slot list against an imported decklist — creates/deletes Slots in bulk | `lib/deck-cards-diff.ts` | — | Deck Reimport | ✅ Working. Only path that reliably sets a Printing on every Slot it creates |
| **AI brew save / Upgrade-apply add / Debrief-action add** | Creates one new empty Slot, Card name only — no Copy involved, no Printing set | 3 separate insert paths | — | Brew save, Upgrade tab, Debrief mode | ✅ Working, but the source of the Printing/thumbnail gap flagged earlier — 3 of 4 Slot-creation paths never set a Printing |
| **Legacy: per-card-name role toggle** | Labels which deck "should" get Original vs Proxy — doesn't move a specific Copy at all | `POST /api/proxy-allocate` → `proxy_allocations` table | — | `ProxyAllocationPanel` (Shared Cards, old) | 🗄️ Legacy — your own briefing doc says this is superseded by Claim (Tier 3/4). Archidekt write-back already dormant |

## 5. Unassign, resolved direction

Previously flagged as a gap (no single action moved a Copy from a deck straight to a chosen Location). Now decided: **Unassign should offer a destination choice** — either pick a specific Location, or default to Unsorted if the user doesn't. This mirrors how Replace-with-original already prompts for the outgoing proxy's destination. Still needs building — Unassign's current implementation takes no destination parameter at all and leaves the Copy's existing Location field untouched.

## 6. Primary vs secondary, by state

**Original** (real Copy assigned)
- Primary: **Reassign**.
- Secondary: **Mark Missing** (loss/damage), **Remove** (once the broken route is fixed).

**Proxy** (proxy Copy assigned)
- Primary: **Replace with original** — the happy path.
- Secondary: **Reassign** (move the proxy itself), **Mark Missing**, **Remove**.

**Open** (free Copy exists)
- Primary: **Fill**.
- Secondary: **Add Proxy** — unusual, valid if you want to keep the original elsewhere.

**Claimed** (Copies exist, all sitting in other Slots)
- Primary: **Claim** — lowest-friction holder first (Tier 3 beats Tier 4).
- Secondary: **Add Proxy**, **Add to Buylist** (not built).

**Unowned** (no Copies anywhere)
- Primary: **Add Proxy**.
- Secondary: **Add to Buylist** (not built).

## 7. The Reassign / Claim / Swap distinction, restated plainly

- **Reassign** and **Claim** are the same mechanism wearing two hats — one initiated from the Card's current Slot ("I'm done with this here, send it elsewhere"), one initiated from the destination ("I want this, pull it from wherever it's sitting"). Both are one-way by design: the losing Slot goes back to being an empty container and nothing refills it automatically.
- **Swap** — two specific Copies trading places, neither Slot ever empty — currently exists in exactly one narrow form: proxy-in-a-Slot ↔ a specific original at a Location. A general version (deck-to-deck, or deck-to-a-specific-Location) doesn't exist yet. New work, not a wiring fix.

## 8. Punch list — what to fix, in order of cheapness

1. **Remove is broken** — the route doesn't exist. Highest priority; a missing file, not a design question.
2. **Mark Missing and Add Proxy are dead stubs in Cards Tab** — fully built and working in the Instance Panel. Wiring fix, not new development.
3. **Two near-duplicate "create a proxy and assign to a Slot" endpoints** — collapse to one.
4. **The Printing/thumbnail gap** — 3 of 4 Slot-creation paths never set a Printing. Now a harder blocker than before: Add Proxy's new image-copy/download requirement needs a Printing to exist at all.
5. **Unassign needs a destination choice** — decided direction in §5, not yet built.
6. **General-purpose Swap** — real, scoped new feature. Needs a decision on deck-to-deck vs deck-to-Location scope before it goes to Kiro.
7. **Missing ignores Location** — marking a Copy Missing doesn't update or flag its Location, so it still claims to be on a shelf you can no longer trust. Open question in §1, needs a decision.
