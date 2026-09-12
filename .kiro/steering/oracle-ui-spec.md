---
inclusion: manual
---

# Oracle — UI Spec

Companion to oracle-product-spec.md. Covers all UX/UI decisions from design sessions.
Read alongside the product spec — this document does not repeat backend/API decisions.
When this document conflicts with the product spec on UI matters, this document takes precedence.

## Design System Foundations

- Primary colour: #1D9E75 (teal) — selected states, primary actions, ownership originals, health indicators
- Amber: #EF9F27 — warnings, proxies, precon mod tracker
- Red: #E24B4A — critical health violations, cut cards
- Blue: #378ADD — brew mode accent (distinct from debrief teal)
- Background: #0f0f0f — page
- Surface: #161616 — sidebar
- Card: rgba(255,255,255,0.04) — elevated surface
- Border default: rgba(255,255,255,0.06)
- Border emphasis: rgba(255,255,255,0.1)

Typography: All labels sentence case. No ALL CAPS except abbreviated deck codes. Two weights only: 400 regular, 500 medium.

Spacing: 8pt grid. Component internal gaps in px (8, 12, 16). Vertical rhythm in rem.

Border radius: var(--border-radius-md) (8px) for controls, var(--border-radius-lg) (12px) for cards and panels.

Accessibility: No state distinguished by colour alone — icons and symbols always accompany colour coding (WCAG 1.4.1).

## Navigation Structure

### Sidebar (global — unchanged)

```
The Oracle
─────────────
Decks           (existing)
Shared Cards    (existing)
Collection      (updated — see Collection View section)
Search          (existing)
+ New Deck      (existing — also triggers Brew mode)
─────────────
Sync            (bottom, existing)
```

### Deck detail — five tabs (replaces existing eight tabs)

| Tab | Replaces | Notes |
|-----|----------|-------|
| Cards | Cards + List | Merged with toggle |
| Analysis | Overview + Mana | Consolidated analytics |
| Combos | Combos | Unchanged |
| Upgrade | Upgrade | Expanded |
| Strategy | Strategy + Categories | Expanded |

Overview tab is eliminated. Its content distributes: attribute ratings → Analysis, key cards → Cards, primer/strategy text → Strategy.

Tab order is fixed — Cards · Analysis · Combos · Upgrade · Strategy. Do not allow reordering.

## Persistent Header — All Deck Detail Pages

The deck detail header and health strip are persistent across all five tabs. They do not scroll away.

### Topbar layout

```
[Commander avatar 36px] [Deck name 16px/500] [Precon badge — amber, only if precon mod]
                         [100 cards · 27 proxies · Bracket 3]
                                                     [Post-game debrief btn] [Open in Archidekt link]
```

"Post-game debrief" button:
- Always visible in the topbar on all existing decks
- Style: background: rgba(29,158,117,0.15), border: 0.5px solid rgba(29,158,117,0.4), teal text, sword icon
- Triggers OracleChat in debrief mode (full-page takeover, not modal)
- Does NOT require Strategy Canvas to be filled in

Precon mod badge:
- Amber pill: background: rgba(239,159,39,0.15), color: #EF9F27
- Text: "Precon mod"
- Only renders when decks.is_precon_mod = true

### Health strip

Sits between topbar and tab nav. Persistent across all tabs.

```
[✓ Ramp 10] [⚠ Draw 5] [✓ Removal 8] [✓ Lands 38] [✓ Win cons 3]
   ⚠ Draw is low for bracket 3
```

Pill states:
- ok: teal icon + text (color: #1D9E75)
- warn: amber triangle icon + text (color: #EF9F27) — within 1 of threshold
- crit: red circle-alert icon + text (color: #E24B4A) — outside threshold

Behaviour:
- Each pill clickable — navigates to Cards tab and scrolls to that category
- Silent when all healthy — pills still show but in muted teal
- Contextual note appears right-aligned only when at least one violation exists
- One note maximum — most severe violation wins
- Note format: ⚠ [Category] is low for bracket [N]. Consider adding [N]–[N] more [category] effects.
- Strip background: rgba(255,255,255,0.02)

## Cards Tab

Merges existing Cards and List tabs. List view is the default.

### Toolbar

```
[Search input — flex 1, max 260px] [Proxies only chip] [Sort chip]    [List | Grid toggle]
```

### Ownership filter chips (below toolbar, always visible)

```
[✓ All — 100] [● Originals — 73] [◐ Proxies — 27] [○ Not owned — 0]
```

Active chip: teal accent. Inactive: neutral.

### View toggle

- List view default (list icon active in teal)
- Grid view alternate (grid icon)

### List view

Cards grouped by Archidekt category. Each category as collapsible section.

Category header row:
```
[Category name — 11px/500 uppercase muted] [count] [fill bar] [health warning icon] [chevron]
```

Card row:
```
[Card name 12px] [Type — muted 10px] [CMC — muted 10px right] [Ownership badge]
```

### Ownership badges

| Status | Symbol | Style |
|--------|--------|-------|
| Original | ● Original | background: rgba(29,158,117,0.15), teal text |
| Proxy | ◐ Proxy | background: rgba(239,159,39,0.15), amber text |
| Not owned | ○ Not owned | background: rgba(255,255,255,0.05), muted text |

Proxy badge is tappable — shows tooltip: "Original held by [Deck Name]"

### Grid view

5-column grid. Cards grouped by category with category label above each group.
- Full art background
- Corner dot: teal filled (original), amber filled (proxy), empty circle (not owned)
- Hover overlay reveals card name and ownership dot label

### Summary footer (both views)

```
● 73 originals    ◐ 27 proxies    ○ 0 not owned
```

## Analysis Tab

Replaces Overview and Mana tabs. Pure read-only analytics.

### Top row — 4 stat cards

```
[Total Cards: 100] [Avg CMC: 2.85] [Proxies: 27 — amber] [Bracket: 3]
```

### Two-column layout

Left — Attribute ratings (Consistency, Resilience, Interaction, Speed, Card advantage)
Right — Mana curve (bar chart, teal bars, 1·2·3·4·5·6+)

Left — Colour pips panel
Right — Category distribution panel

## Upgrade Tab

### Layout (top to bottom)

1. Last debrief banner (if session exists)
2. Toolbar (Sort, filter chips, refresh)
3. Upgrade candidates list (cut/add cards with actions)
4. Fresh analysis prompt
5. Change log

### Upgrade card anatomy

```
[Priority N]  [impact bar]                              [source badge]
──────────────────────────────────────────────────────────────────────
CUT                               │  ADD
[Card name 13px/500]              │  [Card name 13px/500]
[Reason — win condition framing]  │  [Reason — win condition framing]
[Ownership badge]                 │  [Ownership badge] [EDHREC %] [price]
──────────────────────────────────────────────────────────────────────
[✓ Make change]  [Skip]                           [Discuss in debrief]
```

## Strategy Tab

### Precon mod tracker (precon mod decks only)

- Swaps used row with pip visualization (10 pips, pip 1 locked for Sol Ring)
- Rarity slots grid (4 columns: Mythic, Rare, Uncommon, Common)
- Budget row with progress bar
- Sol Ring confirmation row (locked checkbox)

### Deck intent (all decks)

Two-column field grid with win condition, bracket, table context, frustrations, budget mode, format type, strategy notes.

### Category manager (all decks)

- Core categories (locked): Ramp, Draw, Removal, Lands, Win Condition
- Custom categories (editable, draggable)
- Overlap detection warnings
- "Sync to Archidekt" button with confirmation

## OracleChat Shell

Full-page interface for Debrief and Brew modes. Not a modal.

### Layout

- Topbar with back button, deck/mode info, session controls
- Two-panel: Left conversation thread (flex-1), Right context panel (220px fixed)
- Bottom text input with send button

### Debrief mode

- Teal accent throughout
- Right panel: Brief tab + Progress tab
- Recommendation cards inline in thread

### Brew mode

- Blue (#378ADD) accent throughout
- Right panel state 1 (investigating): Identity tab + Hints tab
- Right panel state 2 (commander confirmed): Skeleton tab + Commander tab

## Collection View (/collection)

Two tabs: Collection (existing grid) · Allocation (new ownership table)

### Allocation tab

- Sidebar filter by deck (180px)
- Main table with card rows and deck columns
- Deck cells show O (teal) / P (amber) / empty
- Reassign button on proxy/conflict rows
- Pagination (100 rows per page)

## AI Model Configuration

| Role | Model | Model ID |
|------|-------|----------|
| Fast (investigator) | Claude Haiku 4.5 | claude-haiku-4-5-20251001 |
| Heavy (analyst) | Claude Sonnet 4.6 | claude-sonnet-4-6 |

Environment variable: ANTHROPIC_API_KEY in .env.local
SDK: @anthropic-ai/sdk

## Precon Mod Data Model

```sql
ALTER TABLE decks ADD COLUMN is_precon_mod BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS precon_mod_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  swaps_used INTEGER DEFAULT 1,
  sol_ring_removed BOOLEAN DEFAULT FALSE,
  rarity_mythic_used INTEGER DEFAULT 0,
  rarity_rare_used INTEGER DEFAULT 0,
  rarity_uncommon_used INTEGER DEFAULT 0,
  rarity_common_used INTEGER DEFAULT 0,
  budget_spent REAL DEFAULT 0.0,
  updated_at TEXT NOT NULL
);
```
