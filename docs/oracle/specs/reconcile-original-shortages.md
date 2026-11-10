# Spec: Reconcile — original-copy shortages (T-29)

Role: Designer · Status: **for owner review** · Mockup: [`../mockups/reconcile-original-shortages.html`](../mockups/reconcile-original-shortages.html)
Rules: D-012, D-013, D-014, D-015, D-025, D-027, D-029, D-030, D-032, D-037 (and D-005, D-028).
Builds on: the existing Reconcile page [Confirmed: src/app/reconcile/page.tsx, src/components/reconcile/OverusedCardRow.tsx]. Calculation change is T-37 (Developer).
Context: [How Oracle manages cards today](card-management-system-overview.md).

---

## 1. The problem

The owner plays many decks with proxies standing in for cards he owns too few originals of. He wants one place that answers: **"Which cards am I relying on proxies (or empty slots) for, and how many more originals would cover every deck?"** Today's Reconcile page cannot answer that. It ignores slots filled by a proxy, so a deck that is fully Playable on proxies disappears; and it hides cards with no original owned at all, which are exactly the cards he is most reliant on proxies for [Confirmed: src/lib/reconcile-overuse.ts — `ownershipStatus === 'proxy'` slots are skipped; cards with `originalsOwned < 1` are dropped]. It also says "Active / Brew" per deck, a distinction D-029 removes.

Example: Sol Ring is in Korvold, Prosper and Atraxa. He owns one original and has sleeved two proxies. All three decks are Playable, yet he is two originals short. Today that card does not appear.

## 2. Principles

| Principle | How it shows up |
|---|---|
| **Match between system and the real world** (Nielsen #2) | Counts use the owner's own nouns: *originals owned*, *proxies sleeved*, *more originals needed*. No "overused", "demand" or "supply". |
| **Recognition rather than recall** (Nielsen #6) | Each row states all four facts that justify the number, so the owner never has to work out why a card is short. The arithmetic is visible: *needed in decks 3 − originals owned 1 = 2 more*. |
| **Quiet default, loud exception** (D-014) | Only the headline "N more originals needed" and Proxy copies carry colour. Originals sleeved are neutral text. |
| **Progressive disclosure** | Card-level answer first (left column); per-deck evidence second (right column). Copy-by-copy detail is an optional expansion (choice I-6). |
| **Object–action mapping** (D-015) | Deck links sit on each deck row; filters sit in the sidebar they filter; sort sits above the list it sorts. |
| **Informational, never corrective** (D-027) | Nothing on the page changes deck lists, assignments or readiness. The page shows no deck readiness badges. |

## 3. Behaviour rules (what the page counts)

These restate D-027 / D-037 as the page will present them. **T-37 implements the calculation.**

- **Needed in decks** = every main-deck slot for the card across **all** decks (D-029), whatever fills it: an original, a proxy, or nothing (Unsleeved). Maybeboard does not count (D-005). Generic basic lands never count (D-032); specifically tracked basic-land printings do.
- **Originals owned** = every original copy of the card, **any printing** (D-037 card-level matching — confirm, choice I-9), whether sleeved in a deck or in storage. Proxies never count.
- **More originals needed** = needed in decks − originals owned. A card appears only when this is 1 or more.
- **Proxies sleeved** = slots across these decks filled by a proxy copy. Informational; it does not change the number needed.
- **Spare proxies** (proxies in storage) are not "proxies sleeved". Shown only as a secondary note when present.
- A card with **no original owned** appears whenever any deck slot needs it (D-037 example: Mana Crypt sleeved as a proxy in one deck, no original → 1 more needed). On this page, say "No original owned", **not** "Unowned": under D-025 Unowned means neither an original nor a proxy is owned, and many of these cards have proxies.

Worked examples (all appear in the mockup):

| Card | Needed in decks | Originals owned | Proxies sleeved | Unsleeved | More needed | Note shown |
|---|---|---|---|---|---|---|
| Sol Ring | 3 | 1 (in Korvold) | 2 | 0 | **2** | — |
| Mana Crypt | 1 | 0 | 1 | 0 | **1** | No original owned |
| Dockside Extortionist | 2 | 0 | 2 | 0 | **2** | No original owned |
| Arcane Signet | 3 | 2 (1 in Atraxa, 1 in storage) | 2 | 0 | **1** | 1 original in storage could replace a proxy |
| Smothering Tithe | 2 | 1 (in Korvold) | 0 | 1 | **1** | — |
| Cyclonic Rift | 2 | 1 (in Yuriko) | 1 | 0 | **1** | 1 spare proxy in storage |
| Rhystic Study | 2 | 2 | 0 | 0 | 0 | *Not shown* — enough originals |

## 4. Layout

Desktop (≥1024px): the current two-column shell is kept — 300px sticky sidebar, list on the right, max width 1220px.

```
┌ Reconcile ─────────────────────────────────────────────────────────────┐
│ Cards your decks need more originals of than you own. Proxies don't    │
│ count as originals.                                                    │
├──────────────┬─────────────────────────────────────────────────────────┤
│ Sidebar      │ Summary strip:  8 more originals · 6 cards · 8 proxies │
│  All short.. │ sleeved · 2 cards with no original                      │
│  No original │ [Search cards…]                       Sort [Most needed]│
│  ─ Decks ─   │ ┌ card row ───────────────────────────────────────────┐ │
│  Atraxa  2   │ │ [img] Sol Ring          │ Atraxa      1 × Proxy  ↗ │ │
│  Korvold 4   │ │ ⚠ 2 more originals      │ Korvold     1 × Original ↗│ │
│  ...         │ │ Needed 3 · Owned 1 ·    │ Prosper     1 × Proxy  ↗ │ │
│              │ │ Proxies sleeved 2       │                          │ │
│              │ └─────────────────────────────────────────────────────┘ │
└──────────────┴─────────────────────────────────────────────────────────┘
```

Below 1024px the sidebar becomes a horizontally scrollable row of filter chips above the list (same items, same order); card rows stack (card facts on top, deck rows beneath), as the current row already does at the `md` breakpoint.

## 5. Component inventory

| Component | Change | Props | Builds on |
|---|---|---|---|
| `ReconcilePage` | Revise | — | existing page; `PageHeader` context |
| `ShortageSummary` (new) | Quiet one-line totals above the list | `totalNeeded`, `cardCount`, `proxiesSleeved`, `noOriginalCount` | plain `<p>`/`<dl>`; no shadcn primitive |
| `ShortageToolbar` (new) | Search + sort | `query`, `onQueryChange`, `sort`, `onSortChange` | shadcn `Input`, `Select` |
| `NavItem` | Reuse unchanged | `selected`, `onClick`, `icon`, `title`, `subtitle`, `count` | existing button [Confirmed: src/components/reconciliation/ReconciliationNav.tsx] |
| `ShortageCardRow` (rename of `OverusedCardRow`) | Revise | `card: ShortageCard`, `focusDeckId?: number` | `Card`-style surface; `Badge`; `useCardHoverPreview` |
| `ShortfallBadge` (new) | Headline "N more originals needed" | `count` | shadcn `Badge` + `AlertTriangle` icon |
| `CardFactsList` (new) | Needed / Owned / Proxies sleeved line | `needed`, `originalsOwned`, `originalsInStorage`, `proxiesSleeved`, `spareProxies` | `<dl>` |
| `NoOriginalTag` (new) | "No original owned" | — | shadcn `Badge variant="outline"` + `CircleSlash` icon |
| `ShortageDeckRow` (new, extracted) | One row per deck using the card | `deck: ShortageDeckEntry`, `isFocus`, `isOther` | `<li>` with Next `Link` |
| `CopyTypeChip` (new, shared candidate) | "Original" / "Proxy" / "Unsleeved" with quantity | `kind: 'original' \| 'proxy' \| 'unsleeved'`, `count` | shadcn `Badge` + icon; intended to be reused by pick list (T-25) |
| `ReplaceHint` (new) | "1 original in storage could replace a proxy." | `count` | text + `Info` icon |
| `ShortageSkeleton` (revise) | Loading shape | — | shadcn `Skeleton` |

Removed: the dashed-border "Also wanted by" deck chip (dashed borders are reserved for empty drop zones, D-015) and the "Active / Brew" labels (D-029).

## 6. States

### Page-level

| State | What the owner sees |
|---|---|
| **Loading (first load)** | Sidebar skeleton (3 nav items + 4 deck items) and three card-row skeletons shaped like a row: 63×88 thumbnail block, two text bars on the left, three deck-row bars on the right (D-030). Summary strip shows a single 240px bar. |
| **Refreshing** (data already shown) | Content stays. A 14px spinner and "Updating…" appear right of the summary strip; `aria-busy="true"` on the list. |
| **Error** | Bordered panel (solid, not dashed) with `AlertCircle` in `--signal-critical`: title + reason + **Try again** button. Never shown as "no shortages" (D-030). If a refresh fails while content is shown, keep the content and show an inline banner above the list: "Couldn't refresh. Showing results from [time]." + **Try again**. |
| **Empty (success, no shortages)** | Quiet panel, solid border, `CheckCircle2` in `--text-secondary`. Copy in §9. Sidebar is hidden (nothing to filter). |
| **Filter gives no rows** | e.g. search "zzz": "No cards match "zzz"." + **Clear search** link button. Sidebar stays. |
| **Deck selected** | Header changes to the deck name; list = short cards that deck uses (choice I-3); that deck's row is first and marked "This deck". |

### Card-row domain states

| Domain state | Treatment |
|---|---|
| Short, some originals owned | `ShortfallBadge` (amber + icon + words). Facts line in secondary text. |
| Short, **no original owned** | Same badge, plus `NoOriginalTag` (neutral outline + icon). "Originals owned" reads "None". Not called Unowned (D-025). |
| Original free in storage while a proxy is sleeved | `ReplaceHint` under the facts (choice I-1 decides if it becomes an action). |
| Spare proxy in storage | Facts line adds "· 1 spare proxy" in secondary text. Never added to "Proxies sleeved". |
| Shortage only from Unsleeved slots (no proxies) | Proxies sleeved shows "0"; deck rows show the Unsleeved chip. |
| Multiple copies in one deck (e.g. Casual deck with 4×) | Deck row chips show quantities: "2 × Original", "2 × Proxy". |
| Card image missing | Grey 63×88 placeholder (current behaviour); name still visible. |
| Long card or deck name | Truncate with ellipsis; full name in `title` and in the accessible name. |

### Element states

| Element | Default | Hover | Focus-visible | Active | Disabled |
|---|---|---|---|---|---|
| NavItem | transparent border | `--bg-surface-hover` | 2px ring `--accent-primary` (5.12:1) | — | n/a |
| NavItem selected | `--bg-surface-hover` + `--border-default`, `aria-current` | same | ring | — | n/a |
| Deck link (row) | deck name `--text-primary`, ↗ icon `--text-secondary` | underline + `--bg-surface-hover` row | ring around the link | — | n/a |
| Search input | shadcn default | — | ring | — | while first loading |
| Sort select | shadcn default | hover bg | ring | open list | while first loading |
| Try again button | shadcn `outline` | hover bg | ring | pressed | while retrying, label "Retrying…" + spinner |

There are no drag interactions, candidates or committed objects on this page (D-009/D-011 do not apply).

## 7. Interactions

| # | Interaction | Pointer | Keyboard | Result |
|---|---|---|---|---|
| 1 | Choose a filter | click NavItem | Tab to it, Enter/Space | List filters; header and count update; focus stays on the item; live region announces "Showing 4 cards for Korvold". |
| 2 | Filter "No original owned" | click | Enter/Space | Only cards with 0 originals. (Choice I-5.) |
| 3 | Search | type in field | type; **Esc** clears | Filters by card name, case-insensitive, as you type (150 ms debounce). Combines with the sidebar filter. |
| 4 | Sort | open Select, pick | Tab, Space/Enter to open, ↑/↓, Enter | Reorders. Options: Most originals needed (default), Most proxies sleeved, Card name A–Z. Ties break by name. (Choice I-4.) |
| 5 | Open a deck | click deck name on a deck row | Tab to link, Enter | Navigates to `/decks/[id]` in the same tab (choice I-2). Back returns to Reconcile with filter, search and sort kept (held in the URL query). |
| 6 | Card preview | hover thumbnail | focus the card name (it becomes focusable) | Existing large card preview [Confirmed: src/components/CardHoverPreview]. Esc closes. |
| 7 | Expand copy details (only if I-6 = include) | click "Show copies" | Enter/Space on the button (`aria-expanded`) | Lists each original and proxy with printing, finish and where it is (deck or storage location). |
| 8 | Retry after error | click Try again | Enter | Refetches; button shows "Retrying…". |
| 9 | Data changed elsewhere | — | — | Page refetches when the tab regains focus (existing 60s stale time); shows "Updating…" while it does. |

Tab order: page header → sidebar items (top to bottom) → search → sort → for each card row: card name → each deck link → (Show copies). Skip link "Skip to card list" before the sidebar when more than 6 decks.

## 8. Data binding

There is **no T-28 contract file** in the repository to cite; per `status.md`, D-027/D-037 supply the rules for this scope. The page today reads `GET /api/reconcile/overused` → `OveruseResult` [Confirmed: src/app/api/reconcile/overused/route.ts, src/lib/reconcile-overuse.ts]. T-37 must change the calculation and add the fields marked **new**.

| UI element | Field | Status |
|---|---|---|
| Card name, thumbnail, preview | `cardName`, `scryfallId` (any representative printing) | exists |
| Grouping key ("same card") | `oracleId` | **new** — current grouping is by `cardName`; D-003 says canonical card = `oracle_id`. `deck_cards` has no `oracle_id` [Confirmed: src/types/supabase.ts], so T-37 must resolve it (Architect to confirm how). |
| Needed in decks | `slotsWanting` | exists — **rule changes**: include proxy-filled slots |
| Originals owned | `originalsOwned` | exists — **rule changes**: count any printing; include copies formerly marked Missing (D-028: they now behave as ordinary owned copies; today the query filters `missing = false`) |
| Originals in storage | `originalsInStorage` | **new** (originals not sleeved in any main-deck slot) |
| More originals needed | `overBy` | exists — **rule changes**: keep cards with `originalsOwned = 0` |
| Proxies sleeved (card total) | `proxiesSleeved` | **new** |
| Spare proxies | `spareProxies` | **new** (proxy copies not sleeved anywhere) |
| No original owned tag | derived `originalsOwned === 0` | — |
| Replace hint count | derived `min(originalsInStorage, proxiesSleeved)` | — |
| Deck row: name, link | `decks[].deckId`, `decks[].deckName` | exists |
| Deck row chips | `decks[].originalsSleeved`, `decks[].proxiesSleeved`, `decks[].unsleeved` | **new** (replace `sleeved`; `slots` stays and equals their sum) |
| Remove | `decks[].isActive` | no longer displayed (D-029) |
| Sidebar deck counts | derived client-side (as today) | — |
| Summary strip | derived client-side: Σ`overBy`, card count, Σ`proxiesSleeved`, count of `originalsOwned = 0` | — |
| Copy details (I-6 only) | per copy: printing (`scryfallId`, set), `finish`, `isProxy`, deck or storage location | **new**, only if I-6 is approved |

Proxy detection for a slot should come from the assigned copy (`user_copies.is_proxy` via `copy_id`), not only `deck_cards.ownership_status` — Developer/Architect to confirm which is authoritative.

## 9. Copy

| Where | String |
|---|---|
| Page title | Reconcile *(choice I-7)* |
| Page subtitle | Cards your decks need more originals of than you own. Proxies don't count as originals. |
| Summary strip | **{n}** more originals needed · {c} cards · {p} proxies sleeved · {z} with no original owned *(omit any part that is 0, except the first)* |
| Sidebar: all | **All shortages** — "Every card you're short of" |
| Sidebar: no original | **No original owned** — "Only played as proxies or empty slots" |
| Sidebar: decks heading | Decks |
| Sidebar: deck subtitle | {p} proxies sleeved *(or "No proxies sleeved")* |
| List header (all) | All shortages *(no subtitle; the totals line below covers it)* |
| List header (no original) | No original owned — "{c} cards · {n} more originals needed" |
| List header (deck) | {Deck name} — "{c} short cards in this deck. Counts cover all decks." |
| Search placeholder | Search cards |
| Sort label / options | Sort · Most originals needed · Most proxies sleeved · Card name A–Z |
| Shortfall badge | {n} more original needed / {n} more originals needed |
| Facts line | Needed in decks {d} · Originals owned {o} *(or "None")* · Proxies sleeved {p} |
| Facts addition | ({s} in storage) after originals owned, when s > 0 · "· {x} spare proxy/proxies" when x > 0 |
| No original tag | No original owned |
| Replace hint | {k} original in storage could replace a proxy. / {k} originals in storage could replace proxies. |
| Deck row chips | {q} × Original · {q} × Proxy · {q} × Unsleeved *(the "{q} ×" is omitted when q = 1)* |
| Deck row focus label | This deck |
| Deck link accessible name | Open {deck name} |
| Empty (success) | **No original shortages.** You own enough originals for every card in your decks. |
| Empty (no decks) | **No decks yet.** Shortages appear here once your decks list cards. |
| No search match | No cards match "{q}". · Clear search |
| Error (first load) | **Couldn't load shortages.** {reason} · Try again |
| Error (refresh) | Couldn't refresh. Showing results from {h:mm}. · Try again |
| Updating | Updating… |

Pluralisation follows the count everywhere ("1 more original", "2 more originals").

## 10. Accessibility

Contrast (WCAG 2.1, on `--bg-surface` #1A1A1E unless stated):

| Pair | Ratio | Use | Result |
|---|---|---|---|
| `--text-primary` #E8E8EA | 14.18:1 | names, chip labels | AA |
| `--text-secondary` #9C9CA3 | 6.36:1 (5.88 on hover bg) | facts, subtitles | AA |
| `--signal-warning` #EF9F27 on `--signal-warning-bg` (≈#3A2E1F) | 6.07:1 | shortfall badge | AA |
| `--status-proxy` #4A93A0 on surface | 4.93:1 | Proxy chip **border + icon** only | AA non-text (≥3:1) and text-capable |
| `--status-proxy` text on its own 18% tint | 3.86:1 | — | **Fails AA for small text → not used.** Proxy chip label is `--text-primary`. |
| `--accent-primary` focus ring | 5.12:1 | focus | AA non-text |
| `--signal-critical` #E24B4A | 4.41:1 | error icon only; error text is `--text-primary` | AA non-text |
| `--text-tertiary` #6E6E76 | 3.43:1 | not used for any text on this page | — |

No new colours are introduced; all are existing tokens [Confirmed: src/styles/tokens.css].

**D-012 (colour plus label/icon):** every state carries words: shortfall badge = amber + ⚠ icon + "2 more originals needed"; Proxy chip = proxy-colour border + mask icon + "Proxy"; Original chip = neutral + "Original"; Unsleeved chip = neutral + empty-circle icon + "Unsleeved"; no original = outline + ⊘ icon + "No original owned". Greyscale test: all states remain distinguishable by text.
**D-013:** amber (`--signal-warning`) and proxy teal are existing status tokens. Proxy teal (#4A93A0) sits near mana blue (#6BA5C4); the label and icon carry the meaning, so it cannot be misread as colour identity (noted under Challenges in the report, not changed here).
**D-014:** Original chips and the facts line are neutral; only the shortfall badge and Proxy chips carry colour.
**D-015:** No dashed borders. Deck links live on their deck row; filters in the sidebar; sort above the list.

Screen readers:
- Sidebar: `<nav aria-label="Shortage filters">`; selected item `aria-current="true"`; count read as "{title}, {n} cards".
- List: `<section aria-label="{header}">` containing `<ul>`; each card row is an `<li>` with `aria-labelledby` = card name.
- Shortfall badge text is real text (not `aria-label` only). Facts use `<dl>` so "Originals owned: None" is read as a pair.
- Deck rows: `<ul aria-label="Decks using {card}">`; chip text read in full, e.g. "Atraxa, 1 Proxy, Open Atraxa".
- A polite live region announces filter/search result counts and "Updating…" / "Couldn't refresh".
- Icons are `aria-hidden`; the adjacent text carries the meaning.
- Respect `prefers-reduced-motion`: skeleton pulse and spinner become static.

## 11. Interaction choices for owner approval

Each has a recommendation; the mockup shows the recommended option, with toggles for I-1, I-3 and I-6.

| # | Question (behaviour) | Recommended | Alternatives |
|---|---|---|---|
| I-1 | Should a row let you act, or only inform? | **Inform only**, with links to the decks. The "original in storage could replace a proxy" note tells you; you swap it on the deck. | (b) Add a **Swap in original** button on the deck row using a proxy when an original is in storage — explicit, one click, still never automatic. (c) Add a **Buy** link with a Scryfall estimate price (D-035). |
| I-2 | Where does a deck link open? | **Same tab**, Back returns with your filters kept. | New tab. |
| I-3 | When you pick a deck, which cards show? | **Every short card that deck uses**, with that deck's row marked "This deck" — e.g. Korvold shows Sol Ring even though Korvold holds the original, because the shortage involves it. | Only cards that deck is filling with a proxy or leaving Unsleeved. |
| I-4 | Default order? | **Most originals needed** first. | Most proxies sleeved; Card name A–Z. |
| I-5 | A "No original owned" filter in the sidebar? | **Yes.** | No — rely on the tag in each row. |
| I-6 | Show copy-by-copy detail (printing, finish, where each copy is)? | **Not in this version**; the facts line already says how many originals are in storage. | Add a "Show copies" expander per card (needs extra data). |
| I-7 | Page name? | **Keep "Reconcile"**, so the menu doesn't change. | Rename to "Original shortages". |
| I-8 | Search by card name? | **Yes.** | No. |
| I-9 | Does **any** original printing count? (D-037 asks for this confirmation.) | **Yes** — a Revised Sol Ring covers a deck that lists the Commander Masters Sol Ring. | Only the exact printing the deck lists counts, so a deck wanting a Borderless Sol Ring stays short even if you own a different Sol Ring original. |
| I-10 | Totals strip at the top? | **Yes** — e.g. "8 more originals needed · 6 cards · 8 proxies sleeved". | No. |
| I-11 | Show spare proxies (in storage, unused)? | **Yes, as a small note** — never counted as sleeved. | Hide them. |

## 12. Open questions

All decisions above that are not already locked are listed as I-1 to I-11. In addition:
1. Developer/Architect: authoritative "this slot holds a proxy" signal (`copy_id → user_copies.is_proxy` vs `deck_cards.ownership_status`).
2. Architect: how T-37 obtains `oracle_id` for deck slots (needed for I-9 card-level matching; `deck_cards` stores only `scryfall_id` and `card_name`).
