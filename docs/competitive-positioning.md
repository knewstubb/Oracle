# The Oracle: Competitive Positioning Summary

> Audit Date: 2026-09-15
> Competitors: Archidekt, Moxfield, Manabox
> Context: Personal MTG collection + deck-building application

---

## Executive Summary

Archidekt, Moxfield, and Manabox serve the MTG deck-building and collection-tracking market with overlapping but differentiated features:

- **Archidekt**: Desktop-first, drag-and-drop focused, strong embedding/sharing ecosystem
- **Moxfield**: Feature-rich, collaborative, playtest-enabled, strongest tech integration
- **Manabox**: Mobile-first app, simplest UX, best for quick brewing on phone

**The Oracle's positioning**: Personal, collection-first, commander-focused insights engine (currently under development).

---

## Feature Parity Checklist

### Must-Have Features (Present in All 3 or 2/3)
The following features define user expectations and are table-stakes for credibility:

- [x] **Card search with multi-field filtering** (color, type, mana, rarity, format)
  - All three: ✓ at minimum level
  - The Oracle: ✓ partially (basic search, no advanced filters yet)
  - **Implication**: Users expect 5-7 filter dimensions. The Oracle needs to expand beyond basic search.

- [x] **Deck statistics** (mana curve, color distribution)
  - All three: ✓
  - The Oracle: ✓ (curves rendered)
  - **Implication**: These are non-negotiable. Good implementation expected.

- [x] **Collection import/export** (CSV, plaintext, format-specific)
  - All three: ✓ (at least CSV + one format)
  - The Oracle: ✓ (CSV import built)
  - **Implication**: Collection is the data foundation. Import parity is critical.

- [x] **Multiple printing display** (all printings of a card with set, rarity, price)
  - All three: ✓
  - The Oracle: ✓ (printing selector implemented)
  - **Implication**: Users expect to see all legal printings and choose which to "own."

- [x] **Format enforcement** (Commander: 100 card, 1-of rule)
  - All three: ✓
  - The Oracle: ✓ (Commander rules enforced)
  - **Implication**: Deck validity is table-stakes. No shortcuts here.

- [x] **Price data** (TCGPlayer or equivalent)
  - All three: ✓
  - The Oracle: ~ (pricing data exists in schema, not yet UI-surfaced)
  - **Implication**: Users expect to see card costs and deck totals. Implement before broad release.

- [x] **Proxy flagging** (mark cards as owned/proxied/needed)
  - All three: ✓
  - The Oracle: ✓ (proxy tracking in allocation model)
  - **Implication**: Core to collection accuracy. Well-implemented.

### Differentiation Opportunities (1-2 platforms)

**Real-Time Collaborative Deck Editing** (Moxfield only)
- User expectation: Not yet table-stakes (only one platform has it)
- Complexity: Medium-high (requires operational infrastructure, conflict resolution)
- The Oracle: Deferred (current scope: personal app)
- **Note**: Could become table-stakes in 2–3 years if adoption spreads

**Global Collection Sync** (Moxfield)
- Current expectation: Growing but not universal
- Problem solved: "Cards in Deck X and Deck Y both reference the same copy"
- The Oracle: Currently per-deck; could be enhanced for multi-deck allocation
- **Gap identified**: Archidekt and Manabox don't sync globally either—this is an *opportunity*, not a must-have yet

**Playtest/Draw Simulator** (Moxfield only)
- Current expectation: Niche but valuable
- Problem solved: Test mana curve without external tools
- The Oracle: Not in current scope; could differentiate later
- **Note**: TTS and other simulators exist; not a blocker for credibility

**Mobile-Optimized App** (Manabox)
- Current expectation: Optional but growing
- Problem solved: Brew decks on phone while traveling
- The Oracle: Web-first, responsive design; full mobile app not current scope
- **Gap identified**: Responsive design parity would be competitive; native app is a longer-term option

**Discord Embed Integration** (Moxfield)
- Current expectation: Nice-to-have for community users
- Problem solved: Share deck previews in Discord without clicking away
- The Oracle: Not in scope; low priority for personal app
- **Note**: Could be low-lift to implement if sharing features expand

---

## Feature-by-Feature Breakdown

### 1. Deck Building Workflow

| Dimension | Archidekt | Moxfield | Manabox | The Oracle (Current) |
|-----------|-----------|----------|---------|---------------------|
| **Primary UX** | Drag-and-drop cards into categories | Search + quantity spinner + list | Mobile swipe + tap to add | Search + drag-drop category allocation |
| **Quantity Control** | Spinner in card row | Spinner in list | Slider/+- buttons | Spinner in row |
| **Speed** | Fast for targeted adds; slower for many cards | Fast for sequential adds | Fastest (mobile optimized) | Comparable to Archidekt |
| **Learning Curve** | Familiar (desktop paradigm) | Familiar (search-first) | Immediate (mobile native) | Moderate |

**The Oracle Status**: Drag-drop + search is implemented and competitive. No changes needed for MVP.

---

### 2. Card Search & Filtering

| Filter Type | Archidekt | Moxfield | Manabox | The Oracle |
|-------------|-----------|----------|---------|-----------|
| Text (card name) | ✓ | ✓ | ✓ | ✓ |
| Color (WUBRG) | ✓ | ✓ | ✓ | ✓ |
| Type (creature, instant, etc.) | ✓ | ✓ | ✓ | ✓ |
| Mana cost range | ✓ | ✓ | ✓ | ✗ (low priority) |
| Power/toughness range | ✓ | ✓ | ✓ | ✗ (low priority) |
| Rarity | ✓ | ✓ | ✓ | ✗ (low priority) |
| Format legality | ✓ | ✓ | ✓ | ✓ |
| Rules text search | ✗ | ✓ | ✗ | ✗ (defer) |
| Keyword search | ✗ | ✗ | ✗ | ✗ (defer) |

**Gap for The Oracle**: Mana cost, P/T, rarity filters are low-priority but expected by power users. Defer to Phase 2.

---

### 3. Collection Management

| Feature | Archidekt | Moxfield | Manabox | The Oracle |
|---------|-----------|----------|---------|-----------|
| **Collection Tracking** | Per-deck | Global (synced) | Global | Per-deck (current) → Global (opportunity) |
| **Import Formats** | CSV, MODO, Scryfall | CSV, Arena, MODO, Scryfall, plaintext | CSV, manual, camera | CSV, plaintext |
| **Owned/Missing Status** | Per-card in deck | Per-card globally | Per-card globally | Per-copy (slot-level) |
| **Proxy Flagging** | ✓ | ✓ | ✓ | ✓ |
| **Collection Search** | ✓ | ✓ | ✓ | ✓ (groups view) |

**Key Insight**: The Oracle's per-copy allocation model (original/claimed/proxy) is *more granular* than competitors. This is a strength, not a weakness—emphasize it.

**Gap**: Global collection sync (cards across all decks) would reduce redundancy. Opportunity but not MVP-critical.

---

### 4. Card Detail & Printing Selection

| Feature | Archidekt | Moxfield | Manabox | The Oracle |
|---------|-----------|----------|---------|-----------|
| **Printing Display** | All printings with set, rarity | All printings with filters | All printings with set, rarity | ✓ All printings shown |
| **Price Per Printing** | ✓ TCGPlayer | ✓ Multi-source | ✓ TCGPlayer | ~ Stored but not UI-surfaced |
| **Printing Selection** | Click to swap in deck | Click to swap | Click to swap | ✓ Implemented |
| **Full Rules Text** | ✓ | ✓ | ✓ | ✓ |
| **Flavor Text** | ✗ | ✓ | ✓ | ✗ (not needed) |
| **Legality Badges** | ✓ | ✓ | ✓ | ✓ |

**The Oracle Status**: Strong. Implement price display UI before Phase 2 release.

---

### 5. Deck Organization

| Feature | Archidekt | Moxfield | Manabox | The Oracle |
|---------|-----------|----------|---------|-----------|
| **Deck List** | Flat with tags | Nested folders | Tags + folders | Flat (current) |
| **Description/Notes** | ✓ | ✓ | ✓ | ✓ |
| **Format Selection** | ✓ | ✓ | ✓ | ✓ |
| **Custom Categories** | Sections within deck | Fixed (MB/SB/MB) | Auto-grouped by type | ✓ Category system |

**The Oracle Status**: Adequate for MVP. Nested folders (Moxfield) is a nice-to-have for users with 50+ decks—defer.

---

### 6. Sharing & Public Features

| Feature | Archidekt | Moxfield | Manabox | The Oracle |
|---------|-----------|----------|---------|-----------|
| **Public/Private Toggle** | ✓ | ✓ | ✓ | ~ (personal-only in MVP) |
| **Searchable Public Decks** | ✓ | ✓ | ✗ Link-only | ✗ Personal-only |
| **Comment/Discussion** | ✓ | ✓ | ~ | ✗ (defer) |
| **Fork/Clone Deck** | ✓ | ✓ | ✗ | ✗ (personal app) |
| **Export Formats** | Multiple | Multiple | Basic | ~ Building |
| **Discord Embed** | ✗ | ✓ | ✗ | ✗ (defer) |
| **Real-Time Collab** | ✗ | ✓ | ✗ | ✗ (defer) |

**The Oracle Status**: Personal-only in MVP is intentional. Sharing/public features deferred per scope convention.

---

### 7. Advanced Analysis & Tools

| Feature | Archidekt | Moxfield | Manabox | The Oracle |
|---------|-----------|----------|---------|-----------|
| **Mana Curve** | ✓ | ✓ | ✓ | ✓ |
| **Color Distribution** | ✓ | ✓ | ✓ | ✓ |
| **Threat Count/Density** | ✗ | ✓ | ✗ | ~ (partial: removal count) |
| **Playtest Simulator** | ✗ | ✓ | ✗ | ✗ (defer) |
| **Mulling Statistics** | ✗ | ✓ | ✗ | ✗ (defer) |
| **Format Validation** | ✓ | ✓ | ✓ | ✓ |
| **Legality Lock** | ✗ | ✓ | ✗ | ~ (warn but don't block) |

**The Oracle Opportunity**: Commander-specific analysis (synergy score, budget alternatives, archetype match) is not present in *any* competitor. This is a strong differentiator if developed.

---

## Competitive Analysis: The Oracle's Positioning

### Strengths vs. Competitors

1. **Commander-first design** — All competitors are format-agnostic. The Oracle is optimized for Commander, which is the largest Magic format.

2. **Collection-linked deck allocation** — Competitors track "owned" globally; The Oracle tracks *specific copies* and *allocation slots*. More powerful for edge cases (proxy vs. original, multi-deck conflicts).

3. **Curated commander insights** — Building insights engine (EDHREC sync, build archetypes, card recommendations). None of the three competitors have this depth for commanders.

4. **Personal-app focus** — No public database overhead, no multi-tenant complexity. Can optimize UX for a single user's collection and playgroup.

### Weaknesses vs. Competitors

1. **Search filtering** — Competitors have 7–9 filter dimensions; The Oracle has 4–5. Add mana cost, P/T, rarity for parity.

2. **Global collection sync** — Competitors (especially Moxfield) sync owned cards across all decks. The Oracle is currently per-deck. Consider raising priority for Phase 2.

3. **Playtest/simulator** — Only Moxfield has this. Not urgent for MVP but valuable for brewers. Defer to Phase 2 or later.

4. **Mobile optimization** — Manabox leads with mobile-first. The Oracle is responsive but web-first. Not critical for MVP; can evolve.

5. **Community/sharing features** — Archidekt and Moxfield both have public deck discovery, forking, comments. The Oracle is personal-only. Intentional for MVP; plan for Phase 2+ if expanding.

### Market Gaps (Not Addressed by Any Competitor)

1. **Commander-specific recommendations** (build archetypes, synergy analysis, budget alternatives)
2. **Collection optimization** (redundancy flagging, multi-deck allocation hints, budget allocation)
3. **Playgroup integration** (who plays what, threat meta analysis)
4. **Proxy management at scale** (flagging, tracking, print-ready generation)

---

## Recommendations for The Oracle

### Phase 1 (MVP) — Parity + Foundation
- [ ] Expand card search: add mana cost, P/T, rarity filters
- [ ] Surface price data in deck view (TCGPlayer total deck cost)
- [ ] Ensure all competitors' export formats work (plaintext, Archidekt link)
- [ ] Finalize allocation UI (original/claimed/proxy states clear to user)
- [ ] Pricing: Keep all collection and pricing data offline (no per-request API calls)

### Phase 2 (Differentiation) — Commander-Specific Value
- [ ] **Commander insights engine** (synergy, budget alternatives, staple identification by build archetype)
- [ ] **Global collection sync** (deduplicate owned cards across decks, show allocation conflicts)
- [ ] **Deck composition analysis** (threat density, removal count, interaction ratios)
- [ ] **Playtest lite** (draw simulator, mulligan tracking, basic statistics)

### Phase 3+ (Optional) — Ecosystem
- [ ] Mobile app (native iOS/Android or React Native wrapper)
- [ ] Collaborative deck editing (shared link, version history)
- [ ] Public deck sharing + discovery (if pivoting to multi-user)
- [ ] Discord/Moxfield/Archidekt sync (import/export integration)
- [ ] Proxy print generation (PDF with card images)

---

## Competitive Moat

The Oracle can defensibly differentiate on:

1. **Commander expertise** — Deep insights into builds, synergies, metas that generic deck builders don't have
2. **Collection-as-first-class** — Sophisticated allocation model (original/claimed/proxy) is unique
3. **Personal app focus** — Optimized UX for a single user's full collection and playstyle, without multi-tenant overhead
4. **Integration with user's playgroup** — Potential to understand what their pod plays and optimize for that meta

---

## Conclusion

The Oracle is well-positioned for MVP parity with search refinement and pricing display. The competitive moat comes from Commander-specific insights and sophisticated collection allocation, not from copying Moxfield's collaborativeness or Manabox's mobile polish.

Focus on depth for one user and one format (Commander), not breadth across formats and multiple users.

