# MTG Functional Card Category Taxonomy

Reference for classifying cards by oracle text into functional deckbuilding roles. Each category lists a definition, inclusion signals, exclusions, and known overlaps with other categories.

## Classification Methodology

### Primary vs. Secondary

**Primary category** = the effect that represents the card's main resource investment (mana cost, card, timing) and the reason it's included in a deck.

**Secondary category** = a stapled effect that's real but incidental to why the card is played.

**Example:** A creature with "When this enters, draw a card" is primarily a creature/body; card draw is secondary. A sorcery that says "Draw two cards. You may discard a card" is primarily draw; the discard clause is secondary (self-discard, usually for graveyard synergy, not disruption).

### Modal and Multi-Clause Cards

For modal spells ("choose one — / • ... / • ..."), tag each mode as its own category rather than forcing one primary. For cards with an ETB/static plus an activated ability, treat each clause independently and rank by which one justifies the card's cost.

### This is Not a Keyword-Matching Problem

Oracle text phrasing for the same functional effect varies enormously (compare "destroy target creature" vs. "exile target creature, then that player creates a 1/1"). A regex/keyword layer will get you partial coverage; treat it as a first-pass filter and use an LLM pass for anything with ambiguous or absent trigger phrases (especially triggered/replacement effects with unusual templating).

### Known Overlap Pairs to Disambiguate

- Land tutors (ramp vs. tutor)
- Bounce (removal vs. tempo/utility)
- Mill (discard/disruption vs. its own category)
- Bulk removal (removal vs. board wipe as a removal subtype)
- Bulk protection (fog effects — protection vs. removal-prevention)

### Variants

Some categories have **variants** that apply across multiple base categories. Rather than creating separate top-level categories, variants are expressed as `category:variant` notation.

**Common variants:**
- `:mass` — affects multiple targets ("each", "all") — applies to Removal, Protection, Draw, Discard
- `:tempo` — temporary effect (bounce, tap-down) — applies to Removal, Protection
- `:conditional` — requires conditions to function — applies to Counterspells, Removal

---

## Core Categories

### Ramp

**Definition:** Primary effect increases mana available this turn or in future turns beyond the normal one-land-per-turn baseline, or reduces the cost of spells you cast.

**Include:** Land search that puts a land onto the battlefield (not just hand); mana rocks/artifacts that tap for mana; mana dorks (creatures that tap for mana); rituals (temporary burst mana); cost-reduction static/triggered abilities ("spells you cast cost {1} less").

**Signals:** "search your library for a ... land card and put it onto the battlefield," "{T}: Add {—}," "costs {X} less to cast," "add {C}{C}."

**Exclude:** Land search that goes to hand only (classify as tutor, or land tutor as its own sub-tag); lands that merely enter tapped with no other benefit; mana fixing with no net increase (dual lands, filter lands) — tag as utility, not ramp, unless it also increases total mana.

**Overlap:** Land tutors — if the searched card is specifically a land, tag ramp; if it's any nonland permanent, tag tutor. Cards that do both ("search for a basic land or a Mountain") stay ramp.

**Land examples:** Gaea's Cradle (ramp — taps for more than one mana), Ancient Tomb (ramp — 2 mana for 1 land), Nykthos (ramp — devotion-based).

---

### Card Draw / Card Advantage

**Definition:** Primary effect increases the number of cards in hand or otherwise nets the caster more usable resources than were spent.

**Include:** "Draw a/N card(s)"; draw-per-trigger engines; impulse draw ("exile the top card, you may play it"); life-for-cards effects; symmetrical draw where the caster structurally benefits more.

**Signals:** "draw a card," "draw N cards," "exile the top card of your library. You may play it," "investigate," "surveil" (borderline — see note).

**Exclude / flag as filtering, not advantage:** Effects that draw and discard/mill in equal measure with no net card gain (looting, rummaging, surveil) — these improve card quality, not card count. Tag these as utility unless the discard is itself a separate value engine (e.g., a card designed around discarding).

**Overlap:** Card selection (scry, surveil) is a distinct near-category; only tag as draw if a card physically moves to hand.

**Variants:** `draw:mass` — effects that draw for each player or draw large numbers at once.

---

### Removal

**Definition:** Primary effect neutralizes an opposing permanent's ability to function on the battlefield — via destruction, exile, stat reduction to zero, or return to library/hand against the controller's interest.

**Include:** Destroy effects; exile effects; -X/-X or damage-based kill spells; fight effects; sacrifice-forcing effects ("target player sacrifices a creature"); tuck effects (put into library).

**Signals:** "destroy target," "exile target," "gets -X/-X," "deals X damage to target creature/planeswalker," "fight," "sacrifices a creature."

**Variants:**
- `removal:mass` — "destroy all creatures," "exile each creature" (board wipes)
- `removal:tempo` — bounce effects, tap-down ("return to hand," "doesn't untap")

**Exclude:** Combat tricks that pump your own creature to win a fight you initiated (tag utility, not removal, unless the card's stated purpose is clearly removal-oriented, e.g., "target creature you control fights target creature an opponent controls").

**Overlap — bounce:** "Return target creature to its owner's hand" is temporary removal (tempo), not permanent removal. Tag as `removal:tempo` — do not conflate with permanent removal in aggregate counts.

**Land examples:** Maze of Ith (removal:tempo — effectively removes an attacker from combat), Strip Mine (removal — destroys lands).

---

### Counterspells

**Definition:** Primary effect stops a spell from resolving by countering it on the stack.

**Include:** All variants — hard counters, conditional counters (counter unless pay {X}), counter-with-tax, counter targeting a spell subtype (creature spell, noncreature spell, activated/triggered ability).

**Signals:** "counter target spell," "counter target [type] spell," "counter target activated or triggered ability."

**Variants:**
- `counterspell:conditional` — "counter unless controller pays {X}"
- `counterspell:ability` — counters activated/triggered abilities, not spells

**Exclude:** Effects that counter abilities but not spells — tag as `counterspell:ability` since they don't answer the same threats.

**Overlap:** None significant; this category is textually unambiguous, one of the few that's reliably keyword-matchable.

---

### Tutors

**Definition:** Primary effect searches a library (or occasionally another zone) for a card matching stated criteria and moves it to hand, battlefield, graveyard, or top of library.

**Include:** "Search your library for a card," restricted-criteria searches ("search for a creature card," "search for an Equipment card").

**Signals:** "search your library for a," "search your library for up to N cards."

**Exclude:** Searches specifically and only for basic land cards — tag as ramp, not tutor (see Ramp overlap note). Searches for any land (not just basic) fall under ramp too, since the intent is mana, not selection.

**Overlap:** Disambiguate by target type: land-only search → ramp; nonland or land-or-nonland → tutor. A card searching for "a land or nonland artifact" should get both tags.

---

### Protection

**Definition:** Primary effect prevents a permanent, player, or spell from being destroyed, damaged, targeted, or otherwise negatively affected — without removing or countering the opposing threat itself.

**Include:** Hexproof/indestructible/protection-from granting effects; damage prevention ("prevent all damage that would be dealt to target creature"); fog effects ("prevent all combat damage this turn"); "can't be countered" grants; ward-granting effects.

**Signals:** "gains hexproof," "gains indestructible," "protection from," "prevent all damage," "can't be the target of," "ward."

**Variants:**
- `protection:mass` — fog effects, "all creatures you control gain hexproof"
- `protection:self` — cards that protect only themselves

**Exclude:** Removal spells that happen to also protect (e.g., exile-and-return effects used defensively) — tag by primary intent/cost efficiency, not incidental use case.

**Overlap:** Fog effects sit at the boundary of protection and removal-prevention; keep them in protection since they don't affect the opposing permanent's existence, only the damage step.

**Land examples:** Glacial Chasm (protection — prevents damage to you), Yavimaya Hollow (protection — regenerates creatures).

---

### Recursion

**Definition:** Primary effect returns a card from the graveyard (or exile) to hand, battlefield, or library, restoring a previously spent resource.

**Include:** Reanimation ("return target creature card from your graveyard to the battlefield"); graveyard-to-hand effects; graveyard-to-library ("shuffle target card from your graveyard into your library").

**Signals:** "return target ... card from your graveyard to," "from a graveyard to the battlefield."

**Exclude:** Flashback/escape/other cast-from-graveyard keywords on the card itself — that's the card recurring itself, not the card's function; only tag recursion when the card's stated effect targets other cards.

**Overlap:** Reanimator-style effects that bring back a creature can double as removal-adjacent value (tempo swing) but stay primarily recursion.

**Land examples:** Volrath's Stronghold (recursion — returns creatures to top of library), Academy Ruins (recursion — returns artifacts).

---

### Discard / Hand Disruption

**Definition:** Primary effect forces an opponent to discard cards from hand, or otherwise strips/reveals information or resources from an opponent's hand.

**Include:** "Target player discards a card"; reveal-hand-and-choose effects; hand-size reduction.

**Signals:** "discards a card," "discards N cards," "reveals their hand."

**Variants:** `discard:mass` — "each opponent discards," wheel effects that force discard before draw.

**Exclude:** Mill ("puts cards from library into graveyard") targets the library, not the hand — recommend a separate `mill` tag rather than folding into discard, since they answer different threats (mill matters for graveyard/self-mill decks, discard matters for hand disruption strategy).

**Overlap:** Self-discard for value (discarding your own cards to enable graveyard synergies) is not hand disruption — tag as utility/recursion-enabler, since it targets your own resources by choice.

---

### Engine

**Definition:** Primary effect multiplies, doubles, or fundamentally amplifies other effects in a deck — the card doesn't do one thing but makes everything else more powerful.

**Include:** Doubling effects (Doubling Season, Panharmonicon); untap enablers that allow repeated activations (Seedborn Muse, Wilderness Reclamation); persistent value generators that scale with game actions (Rhystic Study, Smothering Tithe); copy effects on a repeatable body.

**Signals:** "double," "additional," "whenever an opponent," "at the beginning of each," "untap all."

**Exclude:** One-shot doublers or copy effects (those are utility or combo enablers). Engine implies persistent, repeatable amplification.

**Overlap:** Many engines also provide card advantage or ramp — tag engine as primary when the amplification effect is load-bearing (you built around it), tag the resource type as secondary.

**Land examples:** Cabal Coffers (engine — scales with swamp count), Nykthos (engine/ramp — scales with devotion).

---

### Finisher

**Definition:** Primary effect is designed to end the game — massive damage, alternate win condition, or board state that forces concession.

**Include:** Craterhoof Behemoth (lethal damage enabler); Torment of Hailfire (scalable win condition); Thassa's Oracle (alternate win); Insurrection (steal-and-swing); cards with "you win the game" text.

**Signals:** "you win the game," "each opponent loses X life," "trample" + massive power scaling, "gain control of all creatures."

**Exclude:** Cards that are *part* of a win but don't finish alone (combo pieces) — those are deck-level, not card-level classifications.

**Overlap:** Many finishers are also creatures or sorceries — tag finisher as primary when the card's cost/inclusion is justified by its game-ending potential, not its body or utility.

---

### Utility / Value

**Definition:** Default category for effects that don't primarily fit the above — the card does something board- or resource-relevant but isn't ramp, draw, removal, counter, tutor, protection, recursion, discard, engine, or finisher.

**Include:** Token generation; sacrifice outlets; anthem/static buff effects; mana fixing without net increase; card selection without net card gain (scry, surveil); stax/taxing effects; untap effects; copy effects not tied to a specific combo; graveyard hate; lifegain.

**Recommended sub-tags:**
- `utility:tokens` — creates creature tokens
- `utility:fixing` — mana color fixing without ramp
- `utility:stax` — taxing or restricting opponents
- `utility:selection` — scry, surveil, top-deck manipulation
- `utility:sac-outlet` — enables sacrificing your own permanents
- `utility:anthem` — static buffs to your creatures
- `utility:hate` — graveyard hate, artifact hate, enchantment hate
- `utility:lifegain` — life gain as primary effect

**Note:** Because this is the catch-all, it will absorb misclassifications. The sub-tags help maintain useful resolution.

**Land examples:** Urborg, Tomb of Yawgmoth (utility:fixing), Command Tower (utility:fixing), Reliquary Tower (utility — no max hand size), Bojuka Bog (utility:hate).

---

### Mill

**Definition:** Primary effect puts cards from a player's library into their graveyard.

**Include:** "Target player mills N cards"; "put the top N cards of target player's library into their graveyard"; self-mill for graveyard strategies.

**Signals:** "mills," "put into their graveyard from the top of their library."

**Overlap:** Self-mill is often an enabler for recursion or reanimator strategies — tag mill as primary only if the card's purpose is the mill effect itself, not just filling your own graveyard incidentally.

---

### Combo Pieces (Deck-Level Only)

**Definition:** A card whose primary deckbuilding purpose is participation in a defined two-or-more-card interaction that produces a degenerate or game-ending result (infinite combat, infinite mana, infinite damage/mill, alternate win condition).

**Why this doesn't fit a per-card text classifier:** Nothing in a single card's oracle text marks it as a "combo piece" — that status is entirely relational to what else is in the deck. Kiki-Jiki, Mirror Breaker is just an untap/copy effect in isolation; it's only a combo piece in the presence of a creature with an ETB that can end the game when copied.

**Recommendation:** Implement as a deck-level pass that checks the card pool against a known combo database (e.g., Commander Spellbook's API) rather than trying to infer it from text. This is a per-deck category override, not a global default.

**Weak per-card signal (optional):** Flag cards with infinite-adjacent primitives (untap effects, cost-reduction-to-zero, "copy" effects, damage-doubling) as `combo:enabler-potential`, but label it clearly as a heuristic, not a determination.

---

## Schema

### Per-Card (Global Default)

Stored in `card_metadata.default_category`:

```json
{
  "primary": "ramp",
  "secondary": ["utility:fixing"],
  "confidence": "high",
  "notes": "Sol Ring — quintessential mana rock"
}
```

### Per-Deck Override

Stored in `deck_cards.categories` (JSON), overrides the global default for this specific deck:

```json
{
  "primary": "finisher",
  "secondary": ["ramp"],
  "override_reason": "In this landfall deck, Lotus Cobra enables lethal turns"
}
```

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| `primary` | string | Single primary category |
| `secondary` | string[] | Additional relevant categories |
| `confidence` | `high` \| `medium` \| `low` | Classifier confidence (for review triage) |
| `notes` | string | Edge-case reasoning |
| `override_reason` | string | (Per-deck only) Why this differs from global |

---

## Category Reference Table

| Category | Variants | Keyword-Matchable | Notes |
|----------|----------|-------------------|-------|
| Ramp | — | Partial | Land tutors need disambiguation |
| Draw | `:mass` | Partial | Exclude filtering (loot/surveil) |
| Removal | `:mass`, `:tempo` | Partial | Bounce = tempo, not permanent |
| Counterspell | `:conditional`, `:ability` | High | Most reliable category |
| Tutor | — | Partial | Exclude land-only searches |
| Protection | `:mass`, `:self` | Partial | Includes fog effects |
| Recursion | — | Partial | Only tag if targets other cards |
| Discard | `:mass` | Partial | Exclude self-discard |
| Engine | — | Low | Requires understanding of scaling |
| Finisher | — | Low | Game-ending intent, not text |
| Utility | Many sub-tags | Low | Catch-all, use sub-tags |
| Mill | — | High | Distinct from discard |
| Combo | — | None | Deck-level only |

---

## Implementation Notes

### Phase 1: Global Defaults
1. LLM batch classification of `card_metadata` (~30K cards)
2. Store as JSONB in `default_category` column
3. High-confidence only; low-confidence cards get `utility` + flag for review

### Phase 2: Per-Deck Overrides
1. UI for editing card category within a deck
2. Store override in `deck_cards.categories`
3. Display logic: use override if present, else fall back to global

### Phase 3: Combo Detection
1. Integrate Commander Spellbook API
2. Deck-level analysis flags combo pieces
3. User can confirm/dismiss combo tags

---

## Running the Classification Script

### Prerequisites

1. **Apply the migration** to add the `default_category` JSONB column:
   ```bash
   # Via Supabase CLI (if working)
   supabase db push
   
   # Or run directly in Supabase SQL editor:
   ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS default_category JSONB;
   ```

2. **Environment variables** must be set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`

### Usage

```bash
cd the-oracle

# Test with a small batch first (dry run)
npx tsx scripts/classify-card-categories.ts --dry-run --limit=10

# Run on a limited set to verify results
npx tsx scripts/classify-card-categories.ts --limit=50

# Full classification (all cards without existing categories)
npx tsx scripts/classify-card-categories.ts

# Re-classify all cards (including those already categorized)
npx tsx scripts/classify-card-categories.ts --force
```

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Show classifications without writing to database |
| `--limit=N` | Process only N cards (useful for testing) |
| `--force` | Re-classify cards that already have `default_category` |

### Cost Estimate

- Uses Claude Haiku (`claude-haiku-4-5-20251001`) for cost efficiency
- ~20 cards per API call
- For 2,400 cards: ~120 API calls
- Estimated cost: ~$0.10–0.20 (Haiku is very cheap)

### Output

The script shows:
- Progress through batches
- Sample classifications from each batch
- Category distribution summary
- Confidence distribution (high/medium/low)

### Troubleshooting

**"Missing env vars"** — Ensure `.env.local` has all three required variables.

**API rate limits** — The script has a 500ms delay between LLM calls. Increase `RATE_LIMIT_DELAY` if needed.

**Low confidence results** — Cards with unusual templating or modal effects may get `low` confidence. Review these manually or re-run with adjusted prompts.

---

## Provenance

- **Authored:** 2026-07-26
- **Maintained by:** Developer
- **Update trigger:** New edge cases discovered, category refinements needed
