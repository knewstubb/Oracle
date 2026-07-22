# Conversational Commands

This document maps natural language user intents to The Oracle's API routes and Kiro agent hooks. It serves as a reference for how commands are interpreted and routed to the correct endpoints.

## Command Reference

### Story 1: Collection Management

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| Import collection | "import my collection", "sync collection", "update my collection from CSV" | POST | `/api/collection/import?apply=true` | Reads `data/collection.csv`, applies to DB |
| Import + reallocate | "import and reallocate", "full import" | POST | `/api/collection/import?apply=true&reallocate=true` | Also reruns allocation resolver + health |
| Preview collection changes | "what changed in my collection?", "show me the delta", "preview import" | POST | `/api/collection/import` | Returns delta without modifying DB |
| Check card ownership | "do I own [card]?", "is [card] in my collection?" | GET | `/api/collection?search=[card]` | Returns matching entries with quantities |
| Check copy count | "how many copies of [card]?", "how many [card] do I have?" | GET | `/api/collection?search=[card]` | Same route, quantity in response |
| Filter by color identity | "all cards in color identity UW", "show me my Simic cards" | GET | `/api/collection?identity=W,U` | Comma-separated WUBRG letters |
| Filter by type | "show me my creatures", "what artifacts do I own?" | GET | `/api/collection?type=Creature` | Card type filter |
| Collection stats | "how big is my collection?", "collection summary" | GET | `/api/collection/stats` | Total cards, unique names, last import |
| Collection rollup | "show me my collection with prices", "collection value" | GET | `/api/collection/rollup` | Full card-level rollup with CK pricing |
| Proxy collection view | "show me my proxies" | GET | `/api/collection/rollup?tab=proxies` | Filters to physical copies marked as proxy |
| Refresh prices | "update card prices", "refresh CK prices" | POST | `/api/collection/prices/refresh` | Triggers Supabase Edge Function (fire-and-forget) |

### Story 2: Deck Sync

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| Sync all decks | "sync my decks", "refresh all decks" | GET | `/api/sync` | Re-reads all decks from Archidekt API |
| Full sync cycle | "full sync", "reconcile everything" | POST | `/api/sync/full` | Reconcile + allocate + health recompute |
| Sync status | "when was last sync?" | GET | `/api/sync/status` | Last sync timestamp |
| Reimport a deck | "reimport [deck name] from Archidekt" | POST | `/api/decks/[id]/reimport` | Destructive — requires `{ confirmed: true }` |

### Story 3: Cross-Deck Inventory

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| Show shared cards | "which cards are in multiple decks?", "shared cards" | GET | `/api/shared-cards` | Default: cards in 2+ decks |
| Filter by deck count | "which cards are in 3+ decks?" | GET | `/api/shared-cards?minDecks=3` | Adjustable threshold |
| Filter by type | "show me shared creatures" | GET | `/api/shared-cards?type=Creature` | Type filter |
| Filter by color | "shared green cards" | GET | `/api/shared-cards?identity=G` | Color identity filter |
| Combined filters | "creatures in 3+ decks that are green" | GET | `/api/shared-cards?minDecks=3&type=Creature&identity=G` | Filters compose |
| Which decks has a card? | "what decks is Sol Ring in?" | GET | `/api/cards/[name]/decks` | Returns all decks containing that card |

### Story 4: Proxy Allocation

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| View current allocations | "show me current allocations", "where are my originals?" | GET | `/api/allocation` | Allocation state (multiple view modes) |
| Allocation by deck | "show allocations for Arti-facts" | GET | `/api/allocation?view=deck&deckId=[id]` | Per-deck allocation view |
| Proxy report | "show me the proxy report" | GET | `/api/allocation?view=proxy-report` | Summary of all proxy situations |
| Assign original (preview) | "put the real [card] in [deck]" | POST | `/api/shared-cards/allocations/preview` | Returns preview of what would change |
| Assign original (confirm) | "yes", "confirm" | POST | `/api/proxy-allocate` | Only after preview shown |
| Reassign original | "move the real [card] from [deck A] to [deck B]" | POST | `/api/allocation/reassign` | Pin original to target deck, rerun resolver |
| Move card between decks | "move [card] to [deck]" | POST | `/api/allocation/move` | Preview/confirm card movement with allocation cascade |
| Set deck priority | "make [deck] highest priority" | PUT | `/api/allocation/priority` | Affects allocation resolver order |

### Story 5: Deck Management

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| List all decks | "show me my decks" | GET | `/api/decks` | Includes draft sessions |
| Deck detail | "show me [deck name]" | GET | `/api/decks/[id]` | Full card list + allocation status |
| Delete draft deck | "delete [draft deck name]" | DELETE | `/api/decks/[id]` | Only works for draft/concept status |
| Add notes | "note for [deck]: [content]" | POST | `/api/decks/[id]/notes` | Appends timestamped note |
| Deck health | "how healthy is [deck]?" | GET | `/api/decks/[id]/health` | green/amber/red with category breakdown |
| Recheck health | "recheck health for [deck]" | POST | `/api/decks/[id]/health/recheck` | Force recompute |
| Deck strategy | "show me [deck]'s strategy" | GET | `/api/decks/[id]/strategy` | Win condition, bracket, constraints |
| Update strategy | "set [deck] bracket to 3" | PUT | `/api/decks/[id]/strategy` | Updates deck strategy fields |
| View documentation | "show me the strategy doc for [deck]" | GET | `/api/decks/[id]/documentation` | Structured deck docs |
| Update documentation | "update [deck] mulligan guide" | PUT | `/api/decks/[id]/documentation` | Upserts individual doc fields |

### Story 6: Upgrade & Debrief

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| View upgrades | "show upgrade candidates for [deck]" | GET | `/api/decks/[id]/upgrade` | Candidates + change log |
| Apply upgrade | "swap [cut] for [add] in [deck]" | POST | `/api/decks/[id]/upgrade/apply` | Records in change log |
| Skip upgrade | "skip that suggestion" | POST | `/api/decks/[id]/upgrade/skip` | Marks as skipped |
| Start debrief | "debrief [deck]", "what's wrong with [deck]?" | POST | `/api/ai/debrief/start` | Begins investigation session |
| View dead weight | "show dead weight in [deck]" | GET | `/api/decks/[id]/dead-weight` | Cards flagged as underperforming |

### Story 7: Brew Mode

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| Start new deck | "new deck", "brew a deck", "let's build something" | POST | `/api/brew/session` | Creates brew session |
| Continue brewing | (conversation in brew mode) | POST | `/api/brew/chat` | SSE-streamed AI conversation |
| Generate skeleton | "generate the deck list" | POST | `/api/brew/skeleton` | SSE-streamed 99-card generation |
| Save deck | "save this deck", "commit as draft" | POST | `/api/brew/save` | Saves to decks + deck_cards |
| Delete brew session | "abandon this brew" | DELETE | `/api/brew-sessions/[id]` | Removes incomplete session |

### Story 8: Precon Tracking

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| View precon diff | "what did I change from the precon?" | GET | `/api/decks/[id]/precon-diff` | Cards added/removed vs original |
| Precon compliance | "am I within precon mod rules?" | GET | `/api/decks/[id]/precon-mod-state` | Swaps, budget, rarity compliance |

### Story 9: Meta / Help

| Intent | Example Phrases | Method | API Route | Notes |
|--------|----------------|--------|-----------|-------|
| Help | "what can you do?", "help", "commands" | — | — | Oracle responds with capability summary |
| Status | "what's the current state?", "system status" | GET | `/api/collection/stats` + `/api/sync/status` | Combined status |

---

## Kiro Agent Hooks (Automated Behaviours)

These hooks trigger automatically based on conversation content — no explicit user command needed.

### Card Ownership Check
- **Trigger:** Message mentions adding a specific card to a deck or discusses card ownership/allocation
- **Behaviour:** Queries `oracle.db` to check: (1) does the user own the card, (2) is it in other decks, (3) would adding it create a proxy situation
- **Output:** Ownership context included in response (free to slot in / would proxy somewhere / needs purchase)

### Allocation Resolver Pre-Run
- **Trigger:** Message involves generating, updating, or pushing deck lists to Notion
- **Behaviour:** Runs allocation resolver (`buildAllocationInput` → `computeAllocations` → `applyAllocationOutput`) to ensure proxy/original statuses are current
- **Output:** Silent — ensures data correctness before deck list generation

### Deck Modification Sync
- **Trigger:** Deck modifications agreed upon in conversation (cards added/removed/swapped)
- **Behaviour:** Updates `deck_cards` table → reruns allocation resolver → regenerates deck list → writes to Notion page → updates Card Count property
- **Output:** Confirms changes applied

### Card Count Verification
- **Trigger:** Deck list written to a Notion page during conversation
- **Behaviour:** Compares Notion page Card Count property against actual total from deck_cards
- **Output:** Corrects Card Count if mismatched

---

## Write Operations & Confirmation Flow

All operations that modify the database destructively or make irreversible changes follow a **preview → confirm** pattern.

### Proxy Allocation

```
User: "put the real Sol Ring in Arti-facts"

Oracle: Here's what that would change:
  • Sol Ring in Arti-facts: proxy → original
  • Sol Ring in Rocco's Secret: original → proxy
  • Sol Ring in Enchantress: remains proxy

  Confirm? (yes/no/cancel)

User: "yes"

Oracle: Done. Allocated Sol Ring:
  ✓ Arti-facts — original
  ✓ Rocco's Secret — proxy
  ✓ Enchantress — proxy
```

### Collection Import

```
User: "import my collection"

Oracle: Found collection.csv. Here's the delta since last import:
  • 12 cards added
  • 3 cards removed
  • 5 quantity changes

  Apply these changes? (yes/no)

User: "yes"

Oracle: Collection updated. 2,723 entries now cached locally.
```

### Deck Reimport

```
User: "reimport World Breaker from Archidekt"

Oracle: ⚠️  Re-importing "World Breaker" will overwrite all local edits
  (card changes, proxy allocations, printing selections, categories)
  with the current Archidekt version. This cannot be undone.

  Confirm? (yes/no)

User: "yes"

Oracle: Done. World Breaker reimported — 100 cards, synced at 2026-07-02T10:30:00Z.
```

### Reassigning an Existing Allocation

```
User: "move the real Rhystic Study from Enchantress to Ice Queen"

Oracle: Here's what that would change:
  • Rhystic Study in Ice Queen: proxy → original
  • Rhystic Study in Enchantress: original → proxy

  Confirm? (yes/no/cancel)
```

### Batch Allocation

```
User: "allocate all Sol Rings — originals in Arti-facts and Rocco's Secret"

Oracle: You own 2x Sol Ring, and it appears in 5 decks.
  Assigning originals to Arti-facts and Rocco's Secret.
  The remaining 3 decks get proxy status:
  • Enchantress — proxy
  • World Breaker — proxy
  • A Rot to Process — proxy

  Confirm? (yes/no/cancel)
```

---

## Error Recovery

### Error States & Recovery Phrases

| Error State | Oracle Reports | Recovery Options |
|-------------|---------------|-----------------|
| CSV file missing | "No collection.csv found in data/." | User action: export CSV from Archidekt |
| CSV format invalid | "collection.csv is missing required columns: [list]." | "try again" after fixing the file |
| Archidekt API unreachable | "Can't reach Archidekt right now. Using cached deck data." | "retry", "use cached" |
| Database error | "Database error: [detail]." | "retry" |
| Edge function timeout | "Price refresh triggered but still running." | Wait — it's fire-and-forget |
| Reimport failed | "Re-import failed: [detail]" | "retry" |
| Over-allocation warning | "You're assigning 3 originals but only own 2 copies." | "yes" (allows), "no" (cancel) |

### Recovery Phrases

| Phrase | Meaning | Behaviour |
|--------|---------|-----------|
| "retry" / "try again" | Re-attempt the last failed operation | Replays the previous API call |
| "skip" / "skip that one" | Skip the failed item, continue | Marks item skipped, proceeds |
| "cancel" / "never mind" | Abandon the current operation | Discards preview, returns to idle |
| "use cached" / "use local" | Fall back to locally cached data | Queries local DB instead of refreshing |
| "undo" / "revert" | Reverse the last completed operation | Only supported for allocation changes |
| "status" / "what happened?" | Show the result of the last operation | Replays last result summary |

---

## Context & Conversation State

The Oracle maintains context within a conversation:

- **Active deck**: When discussing a specific deck, subsequent commands assume that deck
- **Last operation**: Recovery phrases reference the most recent action
- **Preview state**: After showing a preview, "yes"/"confirm" applies it; "no"/"cancel" discards it
- **Intent resolution**: Deck names are fuzzy-matched against cached deck list

### Name Resolution

| Input | Resolution | Source |
|-------|-----------|--------|
| Exact card name | Direct match | `collection.card_name` or `deck_cards.card_name` |
| Partial card name | Fuzzy match, confirm if ambiguous | SQL LIKE query |
| Deck name | Fuzzy match against `decks.name` | Decks table |
| Deck nickname | Match against known aliases | Conversation context |
| "this deck" / "that one" | Last-referenced deck in conversation | Conversation state |

---

## Dormant Features

These features exist in the codebase but are not operational:

| Feature | Reason | User Alternative |
|---------|--------|-----------------|
| Push to Archidekt (proxy tags, deck creation) | Playwright decommissioned for Vercel deployment | Manual copy-paste deck lists to Archidekt |
| Notion sync | Removed from codebase | N/A — deck documentation now stored in `deck_documentation` table |
