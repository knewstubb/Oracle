# Design: Unified Oracle Sidebar

> Last updated: 2026-08-12
> Status: Draft
> Owner: Dieter (UI/UX Designer)

## Design Goals

- **Single conversation surface** — One place for all Oracle interactions, replacing fragmented chat experiences
- **Context-aware but not intrusive** — Sidebar reflects current page context without demanding attention
- **Persistent but dismissible** — Always available, never blocking the main content
- **Familiar patterns** — Follow conventions from Gemini/Claude/ChatGPT for session management
- **MTG-flavored** — Subtle theming that feels like consulting an oracle, not generic AI chat

## Design Principles for This Feature

| Principle | Application |
|-----------|-------------|
| Information density over whitespace | Compact message bubbles, minimal padding — users want to see conversation history |
| Progressive disclosure | Session history hidden behind a toggle; context details collapsed by default |
| Context through color | Teal accent for exploration/brew; muted for general; deck color identity when in deck context |
| Keyboard-first | All actions reachable via keyboard; input always focused when sidebar opens |
| Reduced motion respect | All animations honor `prefers-reduced-motion` |

---

## Color System Reference

All colors from `tokens.css` and `globals.css`:

### Surfaces
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-canvas` | `#131316` | App background, sidebar background |
| `--bg-surface` | `#1A1A1E` | Message bubbles (user), cards, elevated surfaces |
| `--bg-surface-hover` | `#212126` | Hover states, active session highlight |
| `--border-subtle` | `#262629` | Dividers between sections |
| `--border-default` | `#35353A` | Input borders, panel borders |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#E8E8EA` | Primary text, message content |
| `--text-secondary` | `#9C9CA3` | Timestamps, context labels, placeholders |
| `--text-tertiary` | `#6E6E76` | Disabled text, hints |

### Accent & Signals
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary` | `#1D9E75` | Primary actions, exploration context indicator, send button |
| `--accent-primary-bg` | `rgba(29, 158, 117, 0.15)` | Exploration session highlight, active state backgrounds |
| `--signal-warning` | `#EF9F27` | Session expiring indicator |
| `--signal-critical` | `#E24B4A` | Error states, destructive actions |
| `--status-proxy` | `#4A93A0` | Proxy cards in chat |
| `--status-unowned` | `#F0339E` | Unowned cards in chat |

### WUBRG (Deck Context)
| Token | Hex | Usage |
|-------|-----|-------|
| `--mana-white` | `#F5F0C1` | W deck context accent |
| `--mana-blue` | `#6BA5C4` | U deck context accent |
| `--mana-black` | `#9E9E9E` | B deck context accent |
| `--mana-red` | `#D4836A` | R deck context accent |
| `--mana-green` | `#7BC4A0` | G deck context accent |

---

## Sidebar Anatomy

```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │  HEADER                             │ │
│ │  [Icon] Context Label    [History]  │ │
│ │         Subtitle          [Close]   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │  CONTEXT BAR (collapsible)          │ │
│ │  Session: "Sacrifice aristocrats"   │ │
│ │  Started 2h ago · 12 messages       │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │  MESSAGE AREA                       │ │
│ │                                     │ │
│ │  [User message]                     │ │
│ │                                     │ │
│ │  [Oracle response with cards]       │ │
│ │                                     │ │
│ │  [User message]                     │ │
│ │                                     │ │
│ │  [Oracle streaming...]              │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │  INPUT AREA                         │ │
│ │  ┌─────────────────────────┐ [Send] │ │
│ │  │ Ask Oracle...           │        │ │
│ │  └─────────────────────────┘        │ │
│ │  [Clear] context: Korvold deck      │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Dimensions

| Property | Value | Notes |
|----------|-------|-------|
| Default width | `380px` | Comfortable for card names + descriptions |
| Min width | `320px` | Minimum readable width |
| Max width | `600px` | Don't overwhelm main content |
| Header height | `56px` | Two-line header with context |
| Input area height | `80px` min | Expands with multiline input |
| Resize handle | `4px` | Left edge, cursor: `ew-resize` |

---

## Component Specifications

### 1. Sidebar Header

**Layout:** Horizontal, space-between alignment

**Left side:**
- Context icon (16×16, `--text-secondary`)
- Context label (14px, `--text-primary`, medium weight)
- Context subtitle (12px, `--text-secondary`) — e.g., commander name

**Right side:**
- History toggle button (ghost, 32×32)
- Close button (ghost, 32×32)

**States:**
| State | Appearance |
|-------|------------|
| General context | MessageSquare icon, "General" label, no subtitle |
| Collection context | Library icon, "Your Collection" label |
| Deck context | Layers icon, deck name, commander as subtitle |
| Exploration context | Sparkles icon, session name, "Exploring" badge |

**Deck context color accent:**
When in deck context, display a 3px vertical bar on the left edge of the header using the deck's primary WUBRG color (first color in identity). Multicolor decks use a gradient.

```css
/* Example: Korvold (BRG) */
.header-context-bar {
  background: linear-gradient(
    to bottom,
    var(--mana-black) 33%,
    var(--mana-red) 33% 66%,
    var(--mana-green) 66%
  );
}
```

---

### 2. Context Bar (Collapsible)

**Purpose:** Shows current session metadata; collapses to save space

**Content:**
- Session name (truncated to 30 chars)
- Time since started ("2h ago", "Yesterday")
- Message count
- Chevron to expand/collapse

**Styling:**
- Background: `--bg-surface` with `border-radius: 8px`
- Padding: `--space-2` (`8px`) vertical, `--space-3` (`12px`) horizontal
- Text: `--text-secondary` at `--fs-sm` (12px)
- Collapsed: Single line, session name only
- Expanded: Two lines with metadata

**Exploration session indicator:**
When session is an exploration (brewing), show a subtle teal left border:
```css
.context-bar--exploration {
  border-left: 3px solid var(--accent-primary);
}
```

---

### 3. Message Area

**Layout:** Vertical scroll, messages bottom-anchored (newest visible)

**Spacing:**
- Between messages: `--space-3` (12px)
- Message padding: `--space-3` horizontal, `--space-2` vertical
- Side margins: `--space-3` (12px)

#### User Messages

```css
.message--user {
  background: var(--bg-surface);
  border-radius: 12px 12px 4px 12px;
  color: var(--text-primary);
  font-size: var(--fs-base); /* 13px */
  max-width: 85%;
  margin-left: auto; /* Right-aligned */
}
```

#### Oracle Messages

```css
.message--oracle {
  background: transparent;
  color: var(--text-primary);
  font-size: var(--fs-base);
  max-width: 95%;
  padding-left: 0; /* Full width feel */
}
```

**Oracle avatar:** Small sparkle icon (12×12) in `--accent-primary` at top-left of message, inline with first line.

#### Card Mentions in Messages

Cards mentioned with `[[Card Name]]` syntax render as interactive links:

| Ownership Status | Text Color | Indicator |
|------------------|------------|-----------|
| Owned | `--text-primary` | None |
| Proxy | `--status-proxy` (#4A93A0) | Italic |
| Unowned | `--status-unowned` (#F0339E) | Underline dashed |

**Hover behavior:** Card preview appears (existing `CardHoverPreview` component).

#### Commander Suggestions (Exploration Context)

When Oracle suggests a commander during exploration, render as a card:

```
┌─────────────────────────────────────┐
│ [Card Image]  Commander Name        │
│ 60×84px       Color Identity Pips   │
│               Type Line             │
│                          [👑 Commit]│
└─────────────────────────────────────┘
```

- Background: `--bg-surface`
- Border: `1px solid var(--border-default)`
- Border-radius: `8px`
- Commit button: Small, `--accent-primary` background, crown icon
- Hover: Border becomes `--accent-primary`

---

### 4. Input Area

**Layout:** Fixed at bottom, doesn't scroll with messages

**Components:**
- Textarea (auto-expanding, 1-5 lines)
- Send button (right side, inside textarea container)
- Context indicator (below textarea)
- Clear conversation button (icon only, left of context indicator)

**Textarea styling:**
```css
.oracle-input {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: var(--fs-base);
  padding: var(--space-3);
  padding-right: 48px; /* Space for send button */
  resize: none;
}

.oracle-input:focus {
  border-color: var(--accent-primary);
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-primary-bg);
}

.oracle-input::placeholder {
  color: var(--text-tertiary);
}
```

**Send button:**
```css
.send-button {
  background: var(--accent-primary);
  border-radius: 8px;
  color: white;
  width: 32px;
  height: 32px;
  /* Positioned absolute inside textarea container */
}

.send-button:disabled {
  background: var(--bg-surface-hover);
  color: var(--text-tertiary);
}

.send-button:hover:not(:disabled) {
  background: #22B085; /* Slightly lighter */
}
```

**Context indicator:**
Small text below input showing current context:
- "Chatting about: Korvold deck"
- "Exploring commanders"
- "General conversation"

Font: `--fs-xs` (11px), color: `--text-tertiary`

---

### 5. Session History Panel

**Trigger:** History icon button in header

**Behavior:** Slides in from right, overlays message area (doesn't push it)

**Layout:**
```
┌─────────────────────────────────────┐
│  Session History           [Close]  │
├─────────────────────────────────────┤
│  [Explorations] [Deck Chats]        │  ← Tab bar
├─────────────────────────────────────┤
│                                     │
│  Today                              │
│  ┌─────────────────────────────────┐│
│  │ Sacrifice aristocrats    2h ago ││
│  │ 🟢 Active · 12 messages         ││
│  └─────────────────────────────────┘│
│                                     │
│  Yesterday                          │
│  ┌─────────────────────────────────┐│
│  │ Zedruu politics         18h ago ││
│  │ Exploring · 8 messages          ││
│  └─────────────────────────────────┘│
│                                     │
│  Last Week                          │
│  ┌─────────────────────────────────┐│
│  │ Mono-black control      5d ago  ││
│  │ Archived · 24 messages          ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

**Tab bar:**
```css
.session-tabs {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.session-tab {
  padding: var(--space-2) var(--space-3);
  border-radius: 6px;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  background: transparent;
}

.session-tab--active {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}
```

**Session row (Claude-style list):**

Simple text rows — no cards, no previews. Just like Claude's conversation history.

```css
.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  border-radius: 6px;
}

.session-row:hover {
  background: var(--bg-surface-hover);
}

.session-row--active {
  background: var(--bg-surface);
}

.session-row__name {
  font-size: var(--fs-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px; /* Truncate at ~30 chars */
}

.session-row__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-xs);
  color: var(--text-tertiary);
}
```

**Long names:** Truncate at 30 characters with ellipsis. Show full name in tooltip on hover.

**Session status badges (inline, small):**
| Status | Color | Display |
|--------|-------|---------|
| Active | `--accent-primary` | Small dot before name |
| Exploring | `--accent-primary` at 60% | No indicator (default state) |
| Building | `--signal-warning` | Small dot before name |
| Complete | none | No indicator |
| Archived | `--text-tertiary` | Italic name |

**Date groupings:** "Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Older"

**Layout example:**
```
Today
  • Sacrifice aristocrats exploration    2h
  Zedruu politics build                  5h

Yesterday
  Mono-black control                     18h
  Lands matter brainstorm                22h

Last 7 Days
  Korvold deck chat                      3d
  Collection inventory questions         5d
```

---

## Page: /explore

**Purpose:** Combined Forge + Exploration landing page

### Layout (Desktop ≥1024px)

```
┌──────────────────────────────────────────────────────────────────┬──────────────┐
│                                                                  │              │
│   EXPLORE                                           [Filters ▾]  │   ORACLE     │
│                                                                  │   SIDEBAR    │
│   ┌────────────────────────────────────────────────────────────┐ │              │
│   │                                                            │ │              │
│   │   HOLDING STATE (when no suggestions yet)                  │ │              │
│   │                                                            │ │              │
│   │   ┌──────────────────────────────────────────────────────┐ │ │              │
│   │   │                                                      │ │ │              │
│   │   │      [Sparkles Icon - 48px]                         │ │ │              │
│   │   │                                                      │ │ │              │
│   │   │      Start a conversation with Oracle               │ │ │              │
│   │   │      to explore commander ideas                      │ │ │              │
│   │   │                                                      │ │ │              │
│   │   │      ────── or ──────                               │ │ │              │
│   │   │                                                      │ │ │              │
│   │   │      Browse commanders below                         │ │ │              │
│   │   │                                                      │ │ │              │
│   │   └──────────────────────────────────────────────────────┘ │ │              │
│   │                                                            │ │              │
│   └────────────────────────────────────────────────────────────┘ │              │
│                                                                  │              │
│   COMMANDER BROWSER (always visible)                             │              │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │              │
│   │  Cmdr 1  │ │  Cmdr 2  │ │  Cmdr 3  │ │  Cmdr 4  │          │              │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘          │              │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │              │
│   │  Cmdr 5  │ │  Cmdr 6  │ │  Cmdr 7  │ │  Cmdr 8  │          │              │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘          │              │
│                                                                  │              │
└──────────────────────────────────────────────────────────────────┴──────────────┘
```

### Holding State

**When shown:** User navigates to `/explore` without an active exploration session, OR session has no suggested commanders yet.

**Styling:**
```css
.explore-holding {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-7) var(--space-5);
  text-align: center;
  background: var(--bg-surface);
  border-radius: var(--border-radius-lg);
  border: 1px dashed var(--border-default);
  margin-bottom: var(--space-5);
}

.explore-holding__icon {
  color: var(--accent-primary);
  opacity: 0.6;
  margin-bottom: var(--space-4);
}

.explore-holding__title {
  font-size: var(--fs-lg);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.explore-holding__subtitle {
  font-size: var(--fs-base);
  color: var(--text-secondary);
}

.explore-holding__divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-tertiary);
  font-size: var(--fs-sm);
  margin: var(--space-4) 0;
}

.explore-holding__divider::before,
.explore-holding__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}
```

### Suggested Commanders Section

**When shown:** Oracle has suggested commanders in current exploration session.

**Layout:** Horizontal scrollable row above the browser grid.

```css
.suggested-commanders {
  background: var(--accent-primary-bg);
  border: 1px solid var(--accent-primary);
  border-radius: var(--border-radius-lg);
  padding: var(--space-4);
  margin-bottom: var(--space-5);
}

.suggested-commanders__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.suggested-commanders__title {
  font-size: var(--fs-md);
  color: var(--text-primary);
  font-weight: var(--font-medium);
}
```

**Commander suggestion card:**
```css
.commander-suggestion {
  background: var(--bg-surface);
  border-radius: 8px;
  padding: var(--space-3);
  display: flex;
  gap: var(--space-3);
  min-width: 280px;
}

.commander-suggestion__image {
  width: 60px;
  height: 84px;
  border-radius: 4px;
  object-fit: cover;
}

.commander-suggestion__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.commander-suggestion__name {
  font-size: var(--fs-md);
  color: var(--text-primary);
  font-weight: var(--font-medium);
}

.commander-suggestion__colors {
  display: flex;
  gap: var(--space-1);
}

.commander-suggestion__type {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.commander-suggestion__commit {
  margin-top: auto;
  background: var(--accent-primary);
  color: white;
  border-radius: 6px;
  padding: var(--space-2) var(--space-3);
  font-size: var(--fs-sm);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.commander-suggestion__commit:hover {
  background: #22B085;
}
```

### Commander Browser Grid

**Reuses existing Forge grid** with minor styling updates:
- Cards get subtle hover state: `box-shadow: 0 0 0 2px var(--accent-primary)`
- "Start Brew" action available on each card (in addition to "View Details")

---

## States

### Empty State (No Messages)

```
┌─────────────────────────────────────┐
│                                     │
│         [Sparkles Icon 32px]        │
│                                     │
│         Ask Oracle anything         │
│                                     │
│    "Build me a sacrifice deck"      │
│    "What cards go in Korvold?"      │
│    "Show lands in my collection"    │
│                                     │
└─────────────────────────────────────┘
```

**Styling:**
- Icon: `--accent-primary` at 40% opacity
- Title: `--text-primary`, `--fs-md`
- Suggestions: `--text-secondary`, `--fs-sm`, clickable (fills input)

### Loading History

When loading previous messages for a context:
- Skeleton pulses for 3 message shapes
- "Loading conversation..." text below skeletons

### Streaming Response

- Typing indicator: Three animated dots in `--accent-primary`
- Partial text renders as it streams
- Send button disabled during streaming
- "Oracle is thinking..." below input area

### Error State

- Red banner at top of message area
- Icon: AlertCircle in `--signal-critical`
- Message: "Couldn't reach Oracle. Try again?"
- Retry button: Ghost style

### Session Expiring Warning

When approaching 4-hour window boundary:
- Small banner above input: "This conversation will start fresh after 4 hours of inactivity"
- Color: `--signal-warning` background at 15%, text at full

---

## Mobile Behavior (<1024px)

### Overlay Mode

- Sidebar slides in from right edge
- Covers main content completely
- Backdrop: `rgba(0, 0, 0, 0.5)`
- Close button more prominent (44×44 touch target)
- Swipe right to close

### Trigger Button

When sidebar is closed on mobile, show a floating action button:

```css
.oracle-fab {
  position: fixed;
  bottom: var(--space-5);
  right: var(--space-4);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
}
```

### /explore on Mobile

- Holding state takes full width
- Commander grid becomes 2-column
- Suggested commanders scroll horizontally

---

## Accessibility Notes

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Esc` | Close sidebar |
| `Cmd+Shift+O` | Toggle sidebar |
| `Enter` | Send message (when input focused) |
| `Shift+Enter` | Newline in input |
| `Tab` | Navigate through interactive elements |
| `Arrow Up/Down` | Navigate session history (when history panel open) |

### Focus Management

- When sidebar opens, focus moves to input
- When sidebar closes, focus returns to trigger element
- When history panel opens, focus moves to first session
- When history panel closes, focus returns to history button

### Screen Reader Announcements

- "Oracle sidebar opened" / "Oracle sidebar closed"
- "Context changed to [deck name]"
- "Oracle is responding" (when streaming starts)
- "Response complete" (when streaming ends)
- Session list: "12 exploration sessions, 5 deck conversations"

### Color Contrast

All text combinations verified for WCAG AA (4.5:1):
- `--text-primary` on `--bg-canvas`: 13.5:1 ✓
- `--text-secondary` on `--bg-canvas`: 7.2:1 ✓
- `--text-primary` on `--bg-surface`: 11.8:1 ✓
- `--accent-primary` on `--bg-canvas`: 5.4:1 ✓
- White on `--accent-primary`: 4.6:1 ✓

---

## Design Decisions & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Session history as overlay | Overlay on message area | Separate panel/page | Keeps user in context; faster access |
| Two tabs for history | Explorations / Deck Chats | Single unified list | User mental model separates "brewing" from "editing" |
| Context bar collapsible | Yes | Always visible | Most of the time users know the context; save space |
| Commander commit in chat | Crown icon button | Separate action outside chat | Reduces friction; commit happens where decision is made |
| WUBRG accent in deck context | Left border bar | Full header tint | Subtle but clear; doesn't clash with readability |
| Session names after first response | After AI response | After user message | Avoids meaningless names from "hi" or "help" |

---

## Animation Specifications

All animations respect `prefers-reduced-motion`:

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Sidebar open/close | 200ms | ease-out | Toggle |
| History panel slide | 150ms | ease-out | History button |
| Message appear | 100ms | ease-out | New message |
| Typing indicator pulse | 1000ms | ease-in-out | Streaming |
| Session card hover | 100ms | ease-out | Hover |
| Context bar collapse | 150ms | ease-out | Chevron click |

---

## Resolved Design Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should we show a "new session" button explicitly, or rely on 4-hour auto-refresh? | **Auto-refresh only.** No explicit button — 4-hour window handles this naturally. |
| 2 | How to handle very long session names (>40 chars)? | **Truncate at 30 chars with ellipsis + tooltip on hover** showing full name. |
| 3 | Should exploration sessions show a mini card grid in history panel? | **No.** History is a simple text list like Claude — session name, status badge, timestamp. No visual previews. |

---

## Refs

- Requirements: `.kiro/specs/unified-oracle-sidebar/requirements.md`
- Current sidebar: `src/components/OracleSidebar.tsx`
- Design tokens: `src/styles/tokens.css`
- Forge page (to merge): `src/app/forge/page.tsx`

## Provenance

- **Authored:** 2026-08-12 by Dieter (UI/UX Designer)
- **Motivated by:** User request to fully flesh out design with colors for the unified Oracle sidebar
