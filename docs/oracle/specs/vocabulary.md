# Spec: Shared vocabulary — one word, colour and badge per fact (T-25)

Role: Designer · Phase 3 (Shared words and building blocks) · Status: **Draft for owner review** · 2026-10-12
Mockup: `docs/oracle/mockups/vocabulary.html` (open in a browser; has a "Today vs Agreed" switch and a greyscale check).
Inputs: D-002, D-012–D-015, D-025–D-027, D-030, D-032, D-037, D-040, D-041; the 2026-09-29 vocabulary-starting-point and card/deck-state-permutations reports; the T-46 card-facts audit.
Follow-on: T-26 specifies the reusable components (badge, row, menus, skeletons) that implement this spec. This spec fixes the *words, colours, icons and rules*; T-26 fixes the *component API*.
**Rename note (2026-11-17, owner approved):** Sleeved -> In deck, Unsleeved -> Planned; code values unchanged (`sleeved`, `planned`, `sleevedCount` and similar stay). The action **Sleeve** and the verb "sleeving" are kept for the act itself. Section 4 records the retired names.

---

## 1. The problem

The same fact about a card or deck is shown with different words, colours and icons on different screens. Today a proxy is blue on the Cards tab, purple in the card popover, amber in the Brew tooltip, teal in the collection and light-teal in import — five colours for one fact. A deck is "Active/Inactive" in the header, a green/amber/red dot on its tile, "Brew/Active" in onboarding and "Brewing" in old components. Cards say "Planned · In decks", "Already claimed", "Claim", "Reassign" and "Not owned" for overlapping ideas. Worse, three places turn "we couldn't check" into a confident answer: an unknown card status becomes **Available** on the Cards tab, a failed copy lookup becomes **Unowned** on the pick list, and a deck whose check failed shows the green "ready" dot. Brad cannot trust what a badge means without knowing which screen he is on.

## 2. Principles

- **Consistency and standards (Nielsen #4):** one fact → one word → one colour → one icon, on every screen.
- **Colour is never the only signal (WCAG 1.4.1, D-012):** every state carries a word and an icon; the mockup's greyscale switch must still read correctly.
- **Status hues stay out of the mana palette (D-013):** no green, blue, red, cream or grey-black hue as a card/deck status colour. Brand green (`--accent-primary`) is reserved for primary buttons, focus rings and links.
- **Quiet default, loud exception (D-014):** the normal case (an original in the deck, a nonfoil copy, a known price) is plain neutral text. Colour is spent only on things Brad may need to act on: Proxy, Unavailable, Unowned, and checks that failed.
- **Shape encodes placement (redundant coding):** a **filled** badge means a physical copy is In deck in this slot; an **outline** badge means the slot is Planned and the badge describes what *could* fill it.
- **Visibility of system status (Nielsen #1) and honesty (D-030):** "checking", "couldn't check" and "out of date" are states in their own right, never silently replaced by an answer.
- **Object-action mapping (D-015):** action words name the thing they act on ("Move from Korvold", "Remove from deck").

---

## 3. The vocabulary table

Every fact a card or deck can show. **Word** is the exact visible text (sentence case). **Colour** is an existing token from `src/styles/tokens.css` / `src/app/globals.css` (dark theme, which is the only theme the app renders [Confirmed: src/app/layout.tsx]); no new colours are introduced. **Icon** names are Material Symbols, the set the current status badge already uses [Confirmed: src/components/CardSlotBadge.tsx]. "Loud" items get a 15% colour tint fill or a coloured border; "quiet" items get neither.

| Fact | Word (exact) | One-line meaning | Colour token (icon + border) | Icon | Weight · shape | Where it appears |
|---|---|---|---|---|---|---|
| **Copy type** | Original | This physical card is a real printed card. | `--text-secondary` | `check` | Quiet · filled when in deck | Card rows/tiles in a deck, collection copy rows, pick-list sources, hover preview |
| | Proxy | This physical card is a proxy you made (D-026). | `--status-proxy` | `comedy_mask` (filled) | Loud · filled when in deck | Same as Original; deck header count "6 proxies" |
| **Placement** (of a deck slot) | In deck | A specific physical copy is in this deck slot. | — (expressed by the filled badge shape + copy type) | — | Group heading, filter, screen-reader text | Cards tab group heading "In deck (82)", filters, import question (D-031), SR label "In deck, original" |
| | Planned | The card is on the deck list but no physical copy is in it yet. It does not reserve a copy (D-025). | — (outline badge shape) | — | Group heading, filter, SR text | Cards tab group heading "Planned (18)", filters, import question, SR label "Planned, available" |
| **Availability** (Planned slots only; one headline, priority left→right per D-025) | Available | A free original of the requested printing is in storage. | `--text-primary` | `circle` (ring) | Quiet-positive · outline | Planned card badge, pick list, advisor "owned & free" |
| | Alt available | No free requested printing, but a free original of another printing is in storage. | `--text-primary` | `swap_horiz` | Quiet-positive · outline | Same |
| | Proxy available | No free original, but a proxy you already own is free in storage. Not the Proxy *action* (D-026). | `--status-proxy` | `comedy_mask` (outline) | Loud · outline | Same |
| | Unavailable | You own copies, but none is free — each is in another deck. Always followed by the reason. | `--signal-warning` | `lock` | Loud · outline | Same, plus reason line "In Korvold" / "Proxy in Korvold" / "In 2 decks" |
| | Unowned | You own no original and no proxy of this card. | `--status-unowned` | `do_not_disturb_on` | Loud · outline | Same; search results; advisor "buy" group |
| | Basic | A generic basic land; counts as In deck automatically (D-032). | `--text-secondary` | `landscape` | Quiet · filled | Basic-land rows in a deck; never in the pick list |
| **Ownership outside a deck** (search, suggestions with no target deck) | Owned ×N | You own N copies (originals + proxies) in any printing. | `--text-secondary` | `check` | Quiet | Card search, commander search, Brew suggestions |
| | Unowned | You own none. | `--status-unowned` | `do_not_disturb_on` | Loud | Same |
| **Deck status** (automatic; see 3.4) | Brewing | None of the deck's cards is In deck (sleeved). An empty list is Brewing. | `#8F51D5` purple (tile badge) | `FlaskConical` (flask) | Quiet | Deck tile (round badge, label "Brewing"), deck pickers, Import picker. With count, e.g. "Brewing · 0/100" |
| | Assembling | Some, but not all, of the deck's cards are In deck. Also: a full list with every card In deck but more or fewer than the format's size (for Commander, 99 or 101 cards is Assembling, never Playable). | `--signal-warning` amber `#EF9F27` | `Construction` | Quiet | Same, e.g. "Assembling · 87/100" |
| | Playable | A Commander deck with exactly 100 cards (commander included) and every one In deck (originals and/or proxies; generic basics marked sleeved count). Other formats: see 3.4. | `--accent-primary` green | `Check` (tick) | Quiet-positive | Same, e.g. "Playable · 6 proxies" when proxies are used |
| | *(Casual rule)* | A Casual deck has no size rule: Brewing when none is In deck, Playable when it has cards and every card is In deck, otherwise Assembling. | as above | as above | — | Count reads "40 cards (M sleeved)" (no "/target") |
| **Checking** (any fact above) | Checking… | We're still working it out. Not an answer. | `--text-secondary` | spinner (scoped) or skeleton | Quiet | Anywhere a badge, count or deck state is loading (§5) |
| | Couldn't check | The lookup failed. We don't know — this is *not* Unowned, empty, or Playable. | `--signal-critical` (icon only; words in `--text-primary`) | `error` | Loud | Replaces the badge/state it couldn't compute; always offers **Try again** |
| | Out of date | Showing the last result we had; a refresh failed or data changed since. | `--signal-warning` (icon only) | `history` | Loud-ish | Small notice beside the stale area: "Last checked 10:42" + **Refresh** |
| | Unknown | We have no information and are not trying to get it (e.g. no legality data for a format). | `--text-secondary` | `help` | Quiet | Legality, bracket, salt score, etc. |
| **Price** (Scryfall only, D-040) | $12.40 | Known Scryfall price for this printing and finish. | `--text-secondary` | none | Quiet | Card rows, collection, hover, totals |
| | Price unknown | Scryfall has no price for this printing/finish. Never shown as $0.00. | `--text-secondary` | none | Quiet | Detail views say "Price unknown"; dense columns show "—" with the same words as tooltip/SR label; totals say "$412.50 · 3 cards unpriced" |
| | est. | Prefix for advisor "buy" prices (D-035). | — | none | Quiet | Advisor only, e.g. "est. $12.40" |
| **Finish** (D-004, D-041) | Nonfoil | A normal, non-shiny finish. | `--text-secondary` | none | Quiet — hidden in compact rows | Shown as a word in detail panels, finish columns and printing pickers; omitted in compact rows (the default) |
| | Foil | Foil finish. | `--text-secondary` | `auto_awesome` | Quiet tag | Compact rows, tiles, detail panels, printing pickers |
| | Etched | Etched-foil finish. Never shown as "Foil". | `--text-secondary` | `texture` | Quiet tag | Same |

### 3.1 Badge anatomy (applies to every row above)

```
[icon] Word            ← always both; colour on icon + border/tint only
       reason line     ← Unavailable only: "In Korvold", "Proxy in Korvold", "In 2 decks"
```

- Word text uses `--text-primary` (loud and quiet-positive items) or `--text-secondary` (quiet items). Coloured words fail contrast on the tinted fill (see §9), so colour lives on the icon and border.
- **Filled** (In deck): 15% tint of the token behind, no border. Quiet filled badges (Original, Basic) use no tint.
- **Outline** (Planned): transparent fill, 1px solid border in the token colour. Never dashed — dashed is reserved for empty drop zones (D-015).
- Compact/icon-only variant (dense grids, mobile): icon in a 18/24px circle, same fill/border rule, with the word in the tooltip and the accessible name. Icon-only is allowed only where a legend or the full badge is one click away.
- Tile border (grid view): the same token as a 2px **solid** border; quiet states have the default border. Today's dashed proxy/alternate tile borders go.

### 3.2 Planned headline rule (D-025)

Show one headline, choosing the first that is true: **Available → Alt available → Proxy available → Unavailable → Unowned**. Every other usable option stays in the card's action menu. Example: Prosper's Sol Ring slot is Planned; a free proxy is in storage and an original is in Korvold → headline **Proxy available**; the menu also offers **Move from Korvold**.

### 3.4 Deck status (automatic; owner decision 2026-11-18)

A deck's status is worked out from its cards every time they change. Nobody sets it by hand, and there is no Active / Inactive switch anywhere (the Decks page, the deck page and Claude included).

- **Counted cards:** the deck's list without the Maybeboard and Sideboard. "In deck" (sleeved) means the card has an assigned copy (original or proxy) or is a generic basic marked sleeved. This is the same rule as the deck page header and the tile's "(N sleeved)", so the three never disagree.
- **Brewing:** none of the counted cards is In deck.
- **Assembling:** some, but not all, are In deck, or all are In deck but the list is not the right size.
- **Playable:** a Commander deck with exactly 100 counted cards (commander included), all 100 In deck. 101 cards, all In deck, is Assembling. 99 cards, all In deck, is Assembling.
- **Other formats (open for owner confirmation):** Playable when every counted card is In deck and the list meets the format's size: exactly the target where the format has an exact size, at least the target where it has a minimum (60 for Standard, Modern and the like), and any list with at least one card for formats with no target (Casual). Brewing and Assembling work as above.
- **Tile badge (top-right, round, same size for all three):** Brewing = purple flask (`#8F51D5`); Assembling = construction icon on amber (`--signal-warning`); Playable = green tick (`--accent-primary`). Each badge has an accessible label and a tooltip with the word ("Brewing", "Assembling", "Playable"); icon plus word, never colour alone (D-012).
- **Tile text:** unchanged, "N/target (M sleeved)".
- **Order on the Decks page:** A to Z (owner question open: Playable first?).

### 3.3 Action words (for consistency with the states)

| Action | Exact label | Meaning |
|---|---|---|
| Sleeve | Sleeve | Put a chosen free copy into this slot. |
| Unsleeve | Unsleeve | Return the copy to storage; the card stays on the list (Planned). |
| Move | Move from [deck] / Move to [deck] | Take a copy out of one deck into another; the donor's slot becomes Planned. Confirm: "Move Sol Ring from Korvold to Prosper? Korvold will become Assembling." (only name the state change if it actually changes). |
| Proxy | Proxy | Make a new proxy of the requested printing and finish and sleeve it here (D-026, D-038, D-041). Accessible name: "Make a proxy of Sol Ring and sleeve it in Prosper". |
| Replace | Replace with original | Swap a proxy in the deck for a free original; the proxy returns to storage. |
| Remove | Remove from deck | Take the card off the list; any copy returns to storage (D-039). Never deletes a collection copy. |
| Break down | Break down | Return every copy in the deck to storage; the list is kept. |

### Deck list words (added with UX-03 and UX-05, owner approved 2026-11-20)
| Word | Meaning |
|---|---|
| **Deck order** | The one saved sequence of the owner's decks, set by dragging. Every list of decks shows it. A new deck goes last. |
| **Rename** | Changing a deck's name by clicking it on its tile or on the deck page. |

### Claude connector words (added at Gate 5, owner-approved 2026-11-17)

| Word | Meaning |
|---|---|
| **Connector** | The plug-in that lets a Claude app use Oracle's data. Switched on or off in Oracle. |
| **Made by AI** | A change recorded as coming from Claude (or Oracle's chat), so it can be listed and undone. |
| **Recent changes** | The screen listing what Claude changed, with Undo for 7 days. |
| **Pending** | A big edit or card move waiting for the owner's yes in Oracle; expires after 24 hours. |
| **Needs reconnecting** | The connector was switched off (which signs Claude out on purpose); switching it back on needs Claude to sign in again. |
| **Wanted, now elsewhere** | A deck slot whose card was moved to another deck; the plan keeps it and shows where it is now. |
| **Brewing / Assembling / Playable** (deck status) | What Claude says about a deck's status. It is automatic, never set by hand, so Claude never says "active", "inactive" or "not marked active by you". Claude also gives the deck's In deck (sleeved) count, the same number as the Decks page tile. |

---

## 4. Retired words

These must disappear from everything Brad can see (labels, headings, tooltips, toasts, confirmations, screen-reader labels). Internal code names may stay (D-025 note) unless a batch touches them anyway.

| Retired word | Where it meant something | Replace with |
|---|---|---|
| **Planned ·** as a prefix ("Planned · Available", "Planned · In decks", "saved as Planned" as an import mode) | The old combined label for a deck slot with no physical copy plus its availability | Retired as a prefix. **Planned** alone is now the approved state word for a slot with no physical copy (2026-11-17): use it as the heading/filter, with the availability headline (Available, Alt available, …) on the badge. Never write "Planned · Available". |
| **Sleeved** / **Unsleeved** (as state words: headings, filters, counts, badges, import choices) | A slot with a physical copy in it / a slot with none | **In deck** / **Planned** (owner approved 2026-11-17). The action **Sleeve** and the verb "sleeving" stay for the act of putting a copy into a slot. Code values (`sleeved`, `planned`, `sleevedCount`) are unchanged. |
| **Claimed** / **Claim** / "Already claimed" / "In decks" (as a status) / "claim per card" | All copies are in other decks; or the act of taking one | State: **Unavailable** + reason "In Korvold". Action: **Move from Korvold**. Import result "12 claimed" → "12 in deck". |
| **Reassign** / "Reassigned" | Moving a copy to another deck | **Move to [deck]** / toast "Moved Sol Ring to Prosper" |
| **Considering** | (Proposed once, never shipped — 0 uses in `src/`) | Must not be introduced. Use **Planned**. Undecided cards belong in the **Maybeboard** (D-005). |
| **Brewing / In rotation** (the old manual deck lifecycle, `decks.status`) | A deck still being worked on, or a deck you play (removed) | The automatic **Brewing** status now means only one thing: none of the deck's cards is In deck. It replaced the word Draft on 2026-11-18, because a draft means a card draft in Magic. "Brew" now survives only as the activity of building a deck (the Brew Canvas and AI brew screen were removed 2026-11-22). |
| **Active / Inactive** (toggle, tile, header, "N Active decks", "Sleeve from Active deck?") | A manual flag for decks you play (removed) | Automatic **Brewing / Assembling / Playable**. No manual toggle. Moving a copy out of another deck never asks for confirmation by deck status. |
| **Green / amber / red health** as a deck status ("Ready to play", "Needs attention", "Missing cards" dot) | Tile colour showing readiness | Readiness badge with icon + word + count. The category checks on the deck page (Ramp, Draw … ok/warn/critical) are a separate analysis, not a deck status; they keep icons and words. |
| **Missing** (copy state, "Mark missing", "Missing cards") | Lost copies | Gone (D-028). Previously missing copies behave as ordinary owned copies. "Missing cards" on a tile → the readiness word. |
| **Graveyard** (deck status) | Retired decks | Gone (D-029). No fourth state. "Graveyard" as the MTG zone (themes, tags, "Graveyard value" prompt) stays — that's game vocabulary. |
| **Card Kingdom** | Second price source | Gone (D-040). Prices are Scryfall only. Already removed from visible UI (T-47); only a code comment remains. |
| *Inconsistent, not retired:* "Not owned", "Alternate", "Alternate printing available", "Built / theorycrafted", "Fully placed / Unplaced / Partially available / Over-allocated / Alloc", "Add proxy", "Proxy only" | Various | **Unowned**, **Alt available**, **Alt available**, **In deck / Planned** (D-031), "All in deck / Some in deck / None in deck / Short" + column "In deck", **Proxy**, "Proxy available" or "Proxy in [deck]" |

---

## 5. Shared loading, empty and error states (D-030)

### 5.1 Rule zero
A failed or unfinished lookup is shown as **Checking…** or **Couldn't check**. It must never fall back to a real answer: not **Unowned**, not **Available**, not an empty list ("Nothing left to pull"), not a zero count, not **Playable**, not $0.00. If code needs a default while waiting, the default is "Checking…".

### 5.2 Skeleton or spinner?

| Situation | Use | Example |
|---|---|---|
| First load of primary content whose shape is known | **Skeleton shaped like the content** (same row height, badge pill, card aspect) | Deck grid → deck-tile skeletons (art block + two text lines + count), not square cards. Cards tab → row skeletons with a badge-pill placeholder. |
| Primary content is on screen; a secondary fact is still loading inside it | **Scoped skeleton or spinner on just that element** | Rows render with names immediately; each status badge shows a small badge-shaped skeleton until its status arrives. Price cell shows a short bar. |
| A user action is running | **Spinner inside the control that started it**; that control is disabled; the rest of the screen stays usable | "Sleeve" button shows a spinner and "Sleeving…"; other rows still work. |
| Background refresh with data already shown | **Nothing** while it runs; keep the data. If it fails → **Out of date** notice | Pick list refreshes after a move; if refresh fails: "Last checked 10:42 · Refresh". |
| Whole page cannot render anything useful | Page-level skeleton (shaped), then page-level error | Deck page before the deck itself loads. |

Never use a full-page spinner once any primary content can be shown. Pick-list copy locations, copy type and action eligibility are primary, not secondary (D-030).

### 5.3 Exact copy

| Situation | Words |
|---|---|
| Badge loading | Checking… (SR: "Checking availability of Sol Ring") |
| Badge failed | Couldn't check · **Try again** — tooltip: "We couldn't check your copies of Sol Ring. Nothing has changed." |
| Section failed (e.g. pick list, card statuses) | "Couldn't check availability for this deck. Your cards and sleeves haven't changed." **Try again** |
| Deck tile/header failed | Couldn't check (in place of Brewing/Assembling/Playable); count shows "—/100" |
| Stale | "Last checked 10:42" **Refresh**. If a refresh failed: "Couldn't refresh — showing results from 10:42." **Try again** |
| Count unknown | "—" with accessible name "Unknown" (never 0) |
| Price unknown | "Price unknown" (detail) / "—" (column, tooltip "Price unknown") / totals "$412.50 · 3 cards unpriced" |
| Action failed (toast) | "Couldn't sleeve Sol Ring. Nothing was changed." **Try again** (replace bare "Failed to …" toasts as each batch touches them) |

### 5.4 Empty states (only after a successful check)

| Screen | Words |
|---|---|
| Pick list, nothing to pull | "Nothing left to pull — every card in Prosper is in the deck." |
| Planned group empty | "Every card is in the deck." |
| Collection empty | "No cards yet. Import your collection to get started." **Import** |
| Search no results | "No cards match "sol r"." |
| Decks empty | "No decks yet." **New deck** · **Import** |

---

## 6. Component inventory (hand-off to T-26)

T-26 owns the full API; this is the minimum this spec needs. All build on shadcn/ui primitives already in `src/components/ui/`.

| Component | Props (minimum) | shadcn base | Replaces |
|---|---|---|---|
| `SlotBadge` | `state: 'original'|'proxy'|'available'|'alt_available'|'proxy_available'|'unavailable'|'unowned'|'basic'|'checking'|'failed'`, `reason?`, `variant: 'badge'|'icon'`, `onRetry?` | `Badge`, `Tooltip` | `CardSlotBadge`, `OwnershipBadge`, `ProxyBadge`, `MobileStatusDot`, brew-v2 dots, `GenericLandBadge` |
| `DeckStateBadge` | `state: 'brewing'|'assembling'|'playable'|'checking'|'failed'`, `sleeved`, `required|null`, `proxyCount`, `checkedAt?` | `Badge` | DeckTile dot/flask, `ActiveToggle`, `StatusBadge` |
| `FinishTag` | `finish: 'nonfoil'|'foil'|'etched'`, `showNonfoil?` | `Badge` | ad-hoc "Foil" spans |
| `PriceText` | `amount: number|null`, `estimate?`, `dense?` | — | `formatPrice` call sites |
| `CheckNotice` | `kind: 'failed'|'stale'`, `checkedAt?`, `onRetry` | `Button` | ad-hoc "Failed to …"/"Unable to …" text |
| Shaped skeletons | `DeckTileSkeleton`, `CardRowSkeleton`, `BadgeSkeleton` | `Skeleton` | square-card root skeleton |

## 7. States and interactions

- **Default / hover / focus:** badges that open the card-action popover are buttons: hover raises the tint to 25%; keyboard focus shows the standard 2px `--ring` outline; Enter/Space opens the popover. Non-interactive badges are not focusable.
- **Tooltip:** every icon-only badge has a tooltip with the word (and reason) on hover *and* on keyboard focus.
- **Disabled:** a badge whose action is unavailable (e.g. while saving) keeps its colour and shows no hover change; the popover's buttons show their own disabled state.
- **Loading / error / stale:** as §5. **Try again** is a real button reachable by Tab.
- **Domain states:** all in §3. Over-allocation = an original-copy shortage, shown on Reconcile/collection as "Short 2" with `lock`-free wording (`--signal-warning`, `warning` icon), informational only (D-027/D-037) — never a deck badge.

## 8. Data binding

| Element | Source today | Gap |
|---|---|---|
| Original / Proxy | `user_copies.is_proxy` via `CardSlotWithStatus.isProxy` [Confirmed: src/lib/card-status.ts] | — |
| In deck / Planned | `CardSlotWithStatus.lifecycle` (`sleeved` / `planned` → shown as In deck / Planned) [Confirmed: src/lib/card-status.ts] | — |
| Available / Alt available / Unavailable / Unowned | `CardSlotStatus` `available` / `alternate` / `claimed` / `unowned` [Confirmed: src/lib/card-status.ts] | Lookups return `unowned` on error (T-46 U1/U2); must return an explicit failure. |
| Unavailable reason | `holders[].deckName`, `isProxy` [Confirmed: src/app/api/decks/[id]/card-actions/[cardName]/route.ts] | Not in the batch status call used for badges. |
| **Proxy available** | none | **Needed:** per planned slot, whether a free owned proxy exists (T-28 supply contract). Blocked for build until it exists. |
| **Brewing / Assembling / Playable** | inputs exist (card count, format rules in `src/lib/format-config.ts`, commander, completeness resolved/total on deck tiles [Confirmed: src/components/DeckTile.tsx]) | **Needed:** `readiness`, `sleevedCount`, `requiredCount|null` (null for Casual), `proxyCount`, and a failure signal (T-28 / Phase 6). |
| Checking / Couldn't check / Out of date | client query state (loading, error, last-updated time) | Server routes must surface failure instead of defaults. |
| Finish | `user_copies.finish`, `deck_cards.requested_finish` [Confirmed: src/types/supabase.ts] | Several screens still read the deprecated `isFoil` boolean, which turns Etched into "Foil" (T-46 F3). |
| Price | `price_usd`, `price_usd_foil` (null = unknown) [Confirmed: src/types/supabase.ts]; `formatPrice(null)` → "—" [Confirmed: src/lib/collection-printing-utils.ts] | Deck total treats null as $0 [Confirmed: src/app/decks/[id]/page.tsx:199]. |

Contracts consulted: `docs/oracle/contracts/import-reconciliation-redesign.md`, `allocation-suggestion-engine.md`, `placement-source.md`. None yet defines readiness or proxy supply; the T-28 contract (in review) is expected to.

## 9. Accessibility

Contrast measured against the app's surfaces (`--bg-surface` #1A1A1E, row hover `--bg-surface-hover` #212126, canvas #131316):

| Token | On surface | On 15% tint | Use allowed |
|---|---|---|---|
| `--text-primary` #E8E8EA | 14.2 | 9.4 | All badge words |
| `--text-secondary` #9C9CA3 | 6.4 | 5.0 | Quiet words and icons |
| `--status-proxy` #4A93A0 | 4.9 | 4.1 | Icon + border only (≥3:1 non-text) |
| `--status-unowned` #F0339E | 4.7 | 4.0 | Icon + border only |
| `--signal-warning` #EF9F27 | 8.0 | 6.1 | Icon, border, and words |
| `--signal-critical` #E24B4A | 4.4 | 3.8 | Icon only; words in `--text-primary` |
| `--text-tertiary` #6E6E76 | 3.4 | — | Icons, skeletons, ≥18px text only |
| `--status-owned` #5F5E5A | 2.7 | — | **Not used** (fails 3:1) |

- **D-012:** every state has a word and an icon; filled/outline shape adds a third cue. The mockup's greyscale switch demonstrates this.
- **D-013 hue check:** status hues used — proxy teal 189°, unowned magenta 326°, warning amber 36°, critical red 0° (icon only). Not used for status: `--accent-primary` (161°, next to mana green 150°) and `--status-over` (17°, next to mana red 14°). Proxy teal is 12° from mana blue (201°); see Question 4.
- **Screen readers:** badge accessible name = "[Placement], [state]" plus reason, e.g. "Planned, unavailable, in Korvold". Never expose internal words (today: "status: claimed").
- **Focus order:** in a card row: card name → badge (if interactive) → row actions menu.
- **Motion:** skeleton pulse and spinners respect reduced motion (already global [Confirmed: src/app/globals.css]).

---

## 10. Where the app uses retired or inconsistent words and colours today

Read-only grep of `src/` on 2026-10-12 (branch base `31b3b53`). Tests are listed with their component. Batches share **no files** with each other, and are ordered by what Brad sees most. "Absorbs" means an open T-46 batch touches the same files and should be done in the same change, so no file has two owners.

### V0 — Shared badge, tokens and skeletons (prerequisite) · **small**
- `src/styles/tokens.css` — add *aliases only* (no new colours), e.g. `--state-unavailable: var(--signal-warning)`, so components stop hard-coding hex.
- New component files from T-26 (`SlotBadge`, `DeckStateBadge`, `FinishTag`, `PriceText`, `CheckNotice`, shaped skeletons).

### V1 — Deck tiles on the Decks page · **medium** · depends on V0 + readiness data (Question 2)
| File | Shows today | Agreed |
|---|---|---|
| `src/components/DeckTile.tsx` | Corner dot green/amber/red with the **same check icon for all three** (colour alone, D-012); green = brand green (D-013); purple flask `#8F51D5` for Brewing (done 2026-11-18: three badges, see 3.4); "cards" vs "slots"; aria "Ready to play / Needs attention / Missing cards"; **no completeness data → green** (D-030) | `DeckStateBadge`: Brewing · 82/100 / Assembling · 87/100 in deck / Playable; Couldn't check on failure; no glow |
| `src/app/page.tsx` | Header "N Active decks"; Active decks sorted first | Done 2026-11-18: no Active subtitle; one list, A to Z |
| `src/app/loading.tsx` | Square-card skeleton grid for the Decks page | Deck-tile-shaped skeleton |

### V2 — Card badges on the deck's Cards tab · **medium** · depends on V0; absorbs T-46 Batch 2's `CardsTab` part
| File | Shows today | Agreed |
|---|---|---|
| `src/components/CardSlotBadge.tsx` | "Planned · Available/Alternate/In decks/Unowned"; Original in brand green (loud, mana-green hue); Proxy `#489ADE` (mana-blue hue); In decks `#F5880B`; Unowned `#EF44BF`; dashed tile borders for proxy/alternate | §3 words, tokens and shapes; solid borders |
| `src/components/CardsTab.tsx` | Group headings "Planned · Available / Alternate / In decks / Unowned"; grid labels "Planned · In Decks"; **unknown status defaults to Available** (`?? 'available'`, ~L227, ~L1260); `#F5880B`; unused `OwnershipBadge` import | Headings "In deck (n)" / "Planned (n)" then by headline; Checking… while unknown |
| `src/components/CardGroupSection.tsx` | Mobile dots "Planned · Claimed"; colours `--signal-info` and `--signal-error` **don't exist** (render uncoloured) | `SlotBadge` icon variant |

### V3 — Status lookups stop guessing · **medium** · absorbs the rest of T-46 Batch 2; no visible words, but V2/V4 depend on it
| File | Today | Agreed |
|---|---|---|
| `src/lib/card-status.ts` | Seeds every card "unowned" and returns that on query error (T-46 U2); no "proxy available" state | Explicit failure; add proxy-available once T-28 lands |
| `src/app/api/cards/builder-status/route.ts` | `?? 'unowned'` fallback | Failure, not Unowned |
| `src/app/api/decks/route.ts` | Deck-list completeness on failure feeds tiles | Failure signal so tiles show Couldn't check |

### V4 — Deck page header · **medium** · depends on V0 + readiness data
| File | Shows today | Agreed |
|---|---|---|
| `src/components/ActiveToggle.tsx` | "Active / Inactive" toggle; toasts "Deck marked as Active/Inactive" | Removed 2026-11-18 (component and route deleted) |
| `src/app/decks/[id]/page.tsx` | Renders the toggle; deck value counts unknown prices as $0 | Readiness badge; value via `PriceText` total |
| `src/components/PersistentHeader.tsx` | "100 cards · 6 proxies · $X" (value hidden when 0); salt score uses undefined `--signal-error` | "Assembling · 87/100 in deck · 6 proxies · $412.50 · 3 unpriced" |
| `src/components/HealthStrip.tsx`, `src/components/HealthPill.tsx` | Category checks coloured with undefined `--color-teal/amber/red` (render uncoloured) | Same words/icons; tokens `--text-secondary` / `--signal-warning` / `--signal-critical` |

### V5 — Card action popover and card popover · **small** · absorbs T-46 Batch 9's `StatusChipPopover` part
| File | Shows today | Agreed |
|---|---|---|
| `src/components/StatusChipPopover.tsx` | aria "status: claimed"; "Reassign" ×3, toast "Reassigned"; "Sleeve from Active deck?"; "Add proxy", toast "Added proxy"; checks `deckStatus === 'brewing'` | "Move to [deck]", "Move from [deck]?", "Proxy", SR names per §9; no Brewing logic |
| `src/components/CardPopover.tsx`, `src/components/ProxyBadge.tsx` | Proxy badge in purple `#e158ff` | `SlotBadge` Proxy |

### V6 — Pick list · **medium** · absorbs T-46 Batch 2's pick-list part
| File | Shows today | Agreed |
|---|---|---|
| `src/components/PicklistV2.tsx` | Columns "In storage / In decks / Unowned"; legend "In decks" with `#489ADE/#F5880B/#EF44BF/#25513B`; "Sleeve from Active deck?"; deck labels "Brewing / Active"; a failed lookup lands cards in **Unowned** (T-46 U1) | Headline words; "Move from [deck]?"; deck state words; Couldn't check section |
| `src/app/api/decks/[id]/picklist/route.ts` | Failed candidate lookup → empty candidates | Explicit failure |

### V7 — Hover previews and card links in chat · **small**
| File | Shows today | Agreed |
|---|---|---|
| `src/components/CardHoverPreview.tsx` | Proxy `#489ADE`, Unowned `#EF44BF`; "Proxy only" | Tokens; "Proxy available" / "Proxy in [deck]" |
| `src/lib/render-card-links.tsx` | Same hex colours | Tokens |

### V8 — Collection and storage · **medium** · Phase 4 overlap; excludes `PrintingListView`/`CollectionGridView` (T-46 Batch 8 owns them and should use §3 finish words)
| File | Shows today | Agreed |
|---|---|---|
| `src/components/collection/CollectionToolbar.tsx` | Filters "Fully Placed / Partially Available / Unplaced / Over-Allocated" (not wired, O-007) | "All in deck / Some in deck / None in deck / Short" |
| `src/components/collection/RollupRow.tsx` | aria "Over-allocated / Fully / Partially allocated / Unallocated"; `--status-over` orange (mana-red hue) | Same new words; `--signal-warning` + `warning` icon |
| `src/components/collection/RollupListPane.tsx` | Column "Alloc" | "In deck" |
| `src/components/collection/InstanceDetailPanel.tsx` | "Claim" button, "Reassign", toast "Reassigned to target deck"; Foil chip in non-token purple; Etched shown as "Foil" | "Move from [deck]", "Move to [deck]"; `FinishTag` |
| `src/app/storage/[locationId]/page.tsx` | " · Foil" from the old boolean (Etched → Foil) | `FinishTag` |

### V9 — Deck import and onboarding · **large** · Phase 5 overlap (confirm timing with Gene)
| File | Shows today | Agreed |
|---|---|---|
| `src/components/DeckImportButton.tsx` | "I have this deck built" / "This is theorycrafted" / "Save the decklist as Planned, with no physical allocation" | "In deck — the cards are in the deck box" / "Planned — just the list" (D-031) |
| `src/components/DeckImportProgressList.tsx` | "Planned · N cards" / "N claimed · N cards"; `#14b8a6`, `#ef9f27` | "Planned · N cards" / "N in deck · N cards" |
| `src/app/onboarding/page.tsx` | Per-deck picker "Brew / Active" (amber/teal); "All Brew / All Active"; "Active = physically built … creates a claim per card. Brew = saved as Planned" | "Planned / In deck"; "All planned / All in deck"; plain explanation |
| `src/components/ui/pill-toggle.tsx` | Tones amber `#ef9f27`, teal `#14b8a6` (non-token, mana-green side) | Token tones; neutral for Planned |
| `src/components/reconciliation/StateButtonGroup.tsx` | Planned shown loud amber | Quiet |
| `src/components/reconciliation/ConflictCard.tsx` (+ `__tests__/ConflictCard.test.tsx`) | "Already claimed", "Alternate printing available" | "Unavailable · In [deck]", "Alt available" |
| `src/components/reconciliation/ReconciliationSummary.tsx` | Toast "…because the copy is allocated elsewhere" | "…because it's in [deck]" |
| `src/components/collection/CollectionImportButton.tsx` | "need Built-deck reconciliation afterward" | "Decks will need their cards put back in afterwards" |
| `src/lib/deck-import.ts` | Error text "Claimed by X"; history label "(built mode)" | "In X"; "(in deck)" |

### V10 — Reconcile deck list and card finder · **small** · T-29 may replace Reconcile; skip files T-29 rewrites
| File | Shows today | Agreed |
|---|---|---|
| `src/app/reconcile/page.tsx`, `src/components/reconciliation/ReconciliationNav.tsx`, `src/components/reconcile/OverusedCardRow.tsx` | Deck subtitle "Active / Brew"; `#14b8a6` | Deck state word; tokens |
| `src/components/CardLocator.tsx` | "Inactive" tag on decks | Removed 2026-11-18 |

### V11 — Advisor, Brew and search ownership marks · **medium** · Phase 8/9 overlap
| File | Shows today | Agreed |
|---|---|---|
| `src/components/OwnershipBadge.tsx` (+ test) | "Not owned"; light-theme classes `teal-600/amber-600` on a dark app; aria "Original claimed by" | `SlotBadge` / "Owned ×N" / "Unowned" |
| `src/components/UpgradeTab.tsx`, `src/components/RecommendationCard.tsx` | Use the above | Follow |
| `src/components/brew-v2/CardTooltip.tsx` | "Owned" teal, **Proxy amber**, "Not owned", "Generic land" indigo | §3 |
| `src/components/brew-v2/CardRow.tsx`, `src/components/brew-v2/SuggestionsTab.tsx` | Teal dot "Owned" / "Not owned" | §3 |
| `src/components/generic-land-badge.tsx` | Indigo light-theme pill | Basic |
| `src/components/SmartSearch.tsx`, `src/components/CommanderSearch.tsx` | Loud green "Owned" badge (quiet default, mana-green) | Quiet "Owned ×N" |
| `src/components/CommanderCard.tsx` | "Unowned" grey pill (shows for every commander when lookup fails, T-46 U4) | `SlotBadge` Unowned; Couldn't check |

### V12 — Remove unused old-status code and the components showcase · **small** · Brad rarely sees
| File | Today | Agreed |
|---|---|---|
| `src/components/StatusFilter.tsx` (+test), `StatusControl.tsx` (+test), `StatusBadge.tsx`, `StatusSectionDivider.tsx`, `DeckStatusCard.tsx`, `DraftDeckTile.tsx` (+test), `DraftSessionTile.tsx` | Not rendered anywhere; contain Brewing / Active / Inactive / green-amber-red | Delete |
| `src/lib/deck-status.ts`, `src/app/api/decks/[id]/status/route.ts` | Deprecated brewing / in_rotation status | Delete once nothing calls it |
| `src/app/settings/components/page.tsx` (linked from Settings) | "Brewing", "Unowned (Red)", "Purple: Brewing", "Claim from built deck" | Rebuild as a live gallery of §3, or remove |

Already clean: "Considering" (0 uses), "Card Kingdom" (comment only, T-47), "Missing" as a copy state (only the DeckTile aria label above and two server error strings in `src/app/api/collection/assign-location/route.ts` and `instances/bulk-assign/route.ts`, which become unreachable once D-028 is implemented), "Graveyard" as a deck status (remaining uses are the MTG zone).

---

## 11. Questions for Brad

1. **Should an in-deck card's badge just say "Original" or "Proxy"?** Recommend yes — the solid badge already means "in the deck", and the list is grouped under "In deck" and "Planned". Example: Sol Ring in the deck as a proxy shows **Proxy**, not "In deck · Proxy". Alternative: always show both words — clearer for a newcomer, but twice the text on every row.
2. **(Answered 2026-11-18: tiles show the automatic Brewing / Assembling / Playable badges, see 3.4. Still open: should Playable decks sort first?)** Original question: until the app can work out Brewing / Assembling / Playable, what should deck tiles show? Recommend removing Active/Inactive and the coloured dot now and showing only "87/100 in deck"; the state word arrives with the deck-lists phase. Example: Korvold's tile reads "Korvold · 87/100 in deck" with no badge. Alternative: keep Active/Inactive until then — familiar, but Phase 3's check would still find the old words. Also: once states exist, should Playable decks sort first, then Assembling, then Brewing? Recommend yes.
3. **(Answered 2026-11-18: three distinct badge colours, purple, amber and green, each with its own icon and label.)** Original question: should Playable decks stand out, or should only problems stand out? Recommend keeping all three deck states calm (neutral grey, different icons) and saving colour for things you must act on, like an Unowned card or a failed check. Example: a Playable deck shows a quiet tick; a deck whose check failed shows a red alert icon. Alternative: give Playable a colour — easier to scan, but every colour near green reads as mana.
4. **Does the teal Proxy colour ever look like "blue card" to you?** Recommend keeping the existing teal, always with the mask icon, because it is the only teal-ish status and the mask makes it unmistakable. Example: in a blue Teferi deck, proxy rows show teal mask badges next to blue mana symbols. If they blur together, the alternative is to show proxies in neutral grey with the mask icon only.
5. **Should normal (nonfoil) cards show no finish label in busy lists?** Recommend yes: only Foil and Etched get a small tag; the word "Nonfoil" appears in detail panels and finish columns. Example: a deck list row reads "Sol Ring · Foil" for the foil copy and just "Sol Ring" for the normal one.
6. **Should the collection's "Over-allocated" become the same "Short" word Reconcile uses?** Recommend yes: "Short 2" means two more originals are needed, matching Reconcile (D-037). Example: Sol Ring in three decks, one original owned → collection and Reconcile both say "Short 2".

## Type line (added 2026-11-18; inserted after section 11, section numbers unchanged)
A card's type line has a fixed order: **supertypes, then card types, then a dash, then subtypes.** The app reads it by position, so a word is a subtype because it sits after the dash, not because of what it spells.
Example: `Legendary Creature — Elf Druid`. Legendary is the supertype, Creature is the card type, Elf and Druid are subtypes.
| Group | Words | What it means |
|---|---|---|
| Supertype | Basic, Legendary, Snow (also World, Ongoing, Elite, Host) | Adds a special rule. |
| Card type | Artifact, Battle, Creature, Enchantment, Instant, Kindred, Land, Planeswalker, Sorcery (also Conspiracy, Dungeon, Phenomenon, Plane, Scheme, Vanguard) | The main category; decides how the card is played. |
| Subtype | Elf, Druid, Forest, Equipment, Aura... | A tag other cards can look for. |
Rules the app follows:
- **Legendary** means the "legend rule" (one Legendary permanent with the same name at a time). It is not a limit on copies in a deck.
- **Basic** is a supertype. "Any number in a deck" is a separate rule: Commander decks are singleton except for basic lands. Example: Snow-Covered Swamp is `Basic, Snow Land — Swamp`, so it is Basic and Snow.
- **Several card types are allowed.** Example: `Artifact Creature — Golem` is both an Artifact and a Creature. Counts and filters count it under both; the places that need a single group use it under Creature.
- **Two faces** are joined by `//`. Each face is read on its own. Example: `Instant // Land` is an Instant on the front and a Land on the back, and is not a land on the battlefield.
- **Kindred** is the current name of Tribal. Old text saying Tribal is read as Kindred.
- Missing subtypes are normal: `Artifact —` with nothing after the dash means no subtypes.
Where the app shows each group:
- Collection list "Type" column: all card types of the front face (for example `Artifact Creature`).
- Card window: three small groups, Supertypes, Card types and Subtypes (all faces).
- Deck page "Group: Type" and deck health: one group per card, or counted under each card type (health).
- Collection filters: `Basic` (Collection page) and `Hide Basics` (Allocation page).
- Claude: `basic`, `snow`, `legendary`, `types` (15), `subtypes`.
Source: the Magic Comprehensive Rules (section 205) as understood from the owner's 2026-11-18 decision. Not verified offline.
---
## 12. Open questions (for Gene / Architect, not Brad)

- Readiness (`readiness`, `sleevedCount`, `requiredCount`, `proxyCount`) and proxy supply are needed before V1, V4 and the Proxy available badge can be built honestly (T-28 / Phase 6). Should Phase 3 compute an interim readiness from existing counts, or ship Question 2's count-only tile?
- V9 (import) overlaps Phase 5 and V8 (collection) overlaps Phase 4. Do them now with words only, or fold into those phases?
- Retire T-46 Batch 2 and the `StatusChipPopover` half of Batch 9 in favour of V2/V3/V5/V6, so each file has one owner.

---
## 13. PROPOSED additions, awaiting owner approval (added 2026-11-19, planning round)
**Nothing in this section is approved or in force.** It is a proposal only, from the 2026-11-19 owner direction; the owner decides. No other section of this file was changed. Source: `briefs/card-tags-and-deck-slot-why.md`, `specs/deck-rail-strategy-tags.md`.

Three new words, each used in one place:

| Word | Proposed meaning | Where it appears | Status |
|---|---|---|---|
| **Tag** | What a card does in any deck. Global (same in every deck), read-only, one list shared by all cards with the same oracle id. Example: Sol Ring has the Tag "ramp"; Warren Soultrader has "sacrifice outlet", "token generator" and "ramp". Two layers: broad Tags and mechanic Tags. | Read-only chips on card details (at most five shown), the Tag filter in collection search and in Claude's collection search | Proposed, awaiting owner approval |
| **Category** | The owner's own grouping of cards inside one deck list. Exists today; meaning unchanged. | Deck list columns, "Group: Category" | Proposed to record here; awaiting owner approval |
| **Why** | One line (optional) saying why this card is in this deck. Per card slot in one deck, free text. Claude may fill an empty Why; changing a Why the owner wrote goes through History with Undo. | Card details inside a deck | Proposed, awaiting owner approval |

Proposed retirements, in **new** documents only (older documents keep their wording until the owner approves otherwise):
- **role** (use Tag).
- **job** (the Card jobs idea is dropped in the proposal).
- **strategy point** (dropped in the proposal; the free-text box is called Strategy).

Also proposed for the new Strategy window (not new vocabulary rows, listed so they are decided together): bracket names 1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH; "Target bracket" for the bracket the owner sets.

