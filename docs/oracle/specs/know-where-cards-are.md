# Spec: Know where cards are (Phase 3) — Picklist, In your hand, Missing, Unsorted, chat proposal cards

Role: Designer · Status: **Draft for owner review (Gate 3)** · 2026-11-12
Mockup: `docs/oracle/mockups/know-where-cards-are.html` (open in a browser; device switch Laptop/Phone; screens 1, 1b, 2 to 6; screens 1 and 1b are working demos).
**Naming (owner decision 2026-11-13):** there is one concept, the **Picklist**. The earlier "Move checklist" and the per-deck "Sleeve List" tab are merged into it. Sections 4 to 9 below were written when the all-decks list was called the "move checklist"; where they say "checklist" they mean the **all-decks Picklist view**. **Section 20 is the current design of the Picklist (per-deck tab and all-decks view) and wins on conflict.**
Brief: `docs/oracle/briefs/daily-use-deck-advisor.md` sections 4 (S3, S7, S8), 6, 17 (answers 4, 6, 7), 18.
Inputs: D-009, D-011, D-012 to D-015, D-020, D-025, D-039 (extended by owner chat 2026-11-11), D-059; `specs/vocabulary.md`; `specs/whats-missing.md` (visual language reused); `contracts/chat-add-cards.md`; the Developer report `reports/2026-11-12-developer-chat-add-cards.md`.
No data contract exists yet for system locations or moves. This spec states the data it needs (section 10) and decides nothing about storage.

---

## 1. The problem
Brad moves cards between boxes and decks by hand, on his feet, often with a phone in one hand. Oracle only knows where a card is at the moment he tells it. Today a move is a single click that changes Oracle instantly, long before the card has physically moved, so the two drift apart. When he stops half-way, gets distracted, or can't find a card, Oracle is wrong and he stops trusting it. He needs a list that follows the walk, records each step as it happens, always shows what is currently in his hand, and handles "I can't find it" without losing the card or leaving a deck silently short.

## 2. Principle
- **Match the system to the real world (Nielsen 2):** the all-decks Picklist is ordered by where he walks, and Oracle's picture changes at the same two moments the physical card does (picked up, put down).
- **Visibility of system status (Nielsen 1):** the card in transit is always visible as *In your hand*, on every screen, never inferred.
- **Error prevention and recovery (Nielsen 5, 9):** every tick can be un-ticked; "Can't find it" is a first-class outcome, not an error; nothing is deleted.
- **Quiet default, loud exception (D-014):** done rows go quiet; In your hand and Missing carry colour only while true.
- **Chunking for one-handed use (Fitts's law):** one 48px primary control per row, at the right-hand edge, rows grouped by stop, one stop open at a time on a phone.
- **Object-action mapping (D-015):** "Found all" and "Placed all" sit inside the stop they act on.

## 3. Scope map (what is on which screen)
| # | Screen | New or changed | Mockup screen |
|---|---|---|---|
| 1 | Picklist, all decks (walking order) | New. Page under Storage, also reachable from a "Picklist" item in the main nav and from Unsorted and from decks | 1 |
| 1b | Picklist tab on a deck (Available, Needs moving, Unowned) | Replaces the "Sleeve List" tab. See section 20 | 1b |
| 2 | In your hand | New. A global chip, a pinned side panel on the Picklist (laptop), a bottom bar on the Picklist (phone), and a drawer/sheet from anywhere | 2 |
| 3 | Missing | New system place page; plus a "short" slot on a deck | 3, 3b |
| 4 | Unsorted | Existing page extended; import result gets a hand-off to the Picklist | 4 |
| 5 | Empty, error, loading | Section 8 | 5 |
| 6 | Chat proposal cards | Existing component; refinements only | 6 |

The Storage page gets a row of three **system places** at the top: *In your hand*, *Missing*, *Unsorted* (today only Unsorted is pinned [Confirmed: src/app/storage/page.tsx]). They sit above the boxes and binders so they are never mistaken for a box you made. Each tile shows a count and is quiet at zero. In your hand has a violet border when above zero; Missing has an amber border when above zero.

## 4. The all-decks Picklist (S7, S3) — formerly "Move checklist"

### 4.1 What a move is
One card, one source place, one destination place. Source and destination can each be a deck, a box, the lands box, the valuable binder, or Unsorted. A card taken out of a deck with nowhere to go gets a "Put back" move whose destination is its box (D-039: removed copies return to storage). Example: Lightning Greaves leaves Korvold and goes to Alphabetical box.

### 4.2 Layout: stops
The list is a column of **stops**, one per place he must visit. A stop is a collapsible group (shadcn `Collapsible`/`details`) with the place name, its type (Deck, Box, System place), a progress chip ("2 of 3") and a chevron. Inside a stop, two optional sections:
- **Take from here (n)**: moves whose source is this place. One tick each: **Found it**.
- **Put in here (n)** (or **Put back here** when every move is a return): moves whose destination is this place. One tick each: **Placed it** (**Put back** for returns).

A move therefore appears twice, once at its source stop (where he finds it) and once at its destination stop (where he places it). Between the two, the row shows the violet *In your hand* badge in both places. Example: Sol Ring shows under Alphabetical box as "Take" and under Korvold as "Put in".

**Stop order (default):** Unsorted first (the pile on the desk), then boxes and binders A to Z, then decks A to Z. This is a guess about the room; reordering is Open question Q4. Example of why order matters: Korvold needs Cultivate, which is in Prosper. Korvold's "Put in" row for Cultivate says *Not picked up yet · from Prosper* and its Placed it button is disabled until Prosper's Found it is ticked.

**Per-stop bulk actions:** *Found all n* in the Take header, *Placed all n* in the Put-in header. Only count rows that are eligible. No confirmation; each affected row stays individually un-tickable.

### 4.3 The two ticks and what Oracle does
| Tick | Oracle changes immediately | Row afterwards |
|---|---|---|
| **Found it** | The card leaves its source (deck slot or box) and becomes *In your hand*. The source deck now shows it as short by one while it is in hand. | Source row: Found it pressed, badge *In your hand*, text "for Korvold". Destination row: Placed it becomes available. |
| **Placed it** | The card goes to the destination. A deck slot becomes in deck (original or proxy, as the copy is; wording provisional, see section 19); a box simply holds it. | Both rows show a quiet green *Placed* badge; stop progress updates. |
| Un-tick **Placed** | Card returns to *In your hand*. | |
| Un-tick **Found** (only if not placed) | Card returns to where Oracle had it, if that slot is still free. If not, the out-of-date state (section 8) explains. | |
| **Can't find it** | See section 6. | |

If he stops part-way, ticked moves stay done and unticked cards stay where Oracle last had them (brief section 6). Cards in his hand stay in his hand; the chip and the panel keep saying so.

### 4.4 Row anatomy (all rows)
Left: card name (existing hover preview on laptop, long-press preview on phone), a meta line (destination or source, plus badges: *Proxy* where the copy is a proxy per `specs/vocabulary.md`). Right: the tick button. Under the tick on the Take rows: a text button **Can't find it** (44px tall).

On a phone the row stacks: name and meta on the first line, the tick button and **Can't find it** on the second line, the tick button taking the larger share, 48px tall minimum, to keep thumbs off the card name.

### 4.5 Header and progress
Title "Picklist · all decks". Under it: "n of N placed" (plus "· m missing" when any). A thin progress bar. One line of help: "Ticks save straight away. Found takes the card out of its deck in Oracle at once." Shown every time (it is the one surprising thing); it is a single quiet line, not a banner.

### 4.6 Where a Picklist entry comes from (entry points)
1. **After an import:** the Unsorted page and the import result offer **Add all n to the Picklist** (section 7).
2. **From a deck:** the primary action is now **Move here** (section 19), an instant move. **Add to Picklist** stays only as a small secondary option for when he wants to walk the shelves. Owner decision 2026-11-13.
3. **Hand-built:** from any card's menu, "Add to Picklist" with a destination picker (reuse the location picker, `LocationPickerModal` [Approximate: exists in src/components]).
4. A **Moves** item in the main nav with a count of open moves (quiet; hidden at zero).

Removing a move that is not yet picked up: row overflow menu **Remove from Picklist**. A picked-up move cannot be removed; he places it or uses *Put it somewhere else* in the hand panel.

### 4.7 Suggested swaps (proxy ranking) — out of Phase 3
The brief wants the Picklist to suggest swaps where a real copy is better placed elsewhere. That depends on proxy ranking (Phase 5). Phase 3 treats proxies as ordinary rows; the row type "Suggested swap" is reserved, not designed.

## 5. In your hand

### 5.1 Meaning
A real place in Oracle (owner answer 4): the card is in no deck and no box. It can be placed at its planned destination, placed somewhere else, or returned. Only the owner moves it out.

### 5.2 Where it is always visible
| Place | Laptop | Phone |
|---|---|---|
| **App bar chip** "In your hand · n" (violet border, hand icon) | Right end of the top bar, on every screen, only while n > 0 | Same; opens a bottom sheet |
| **Picklist screen** | Sticky right column, always open, 320px, shows every carried card with its destination | Sticky bar at the bottom of the screen ("In your hand · 3" + **See cards**); the app-bar chip is hidden on this screen to avoid duplication |
| **Deck page** | The slot carries the *In your hand* badge and "Short by 1 while it is in your hand"; header chip "1 in your hand" | Same |
| **Storage page** | System-place tile | Same |

Opening the chip shows a drawer (laptop, 400px, from the right) or a bottom sheet (phone, 86% height), both modal with Escape and a close button.

### 5.3 Panel contents
Header: hand icon, "In your hand · n". One line: "Picked up from Alphabetical box, Prosper. Not in any deck or box in Oracle until placed." Each card: name, "from A → for B", a **Placed it** button (**Put back** for returns) at its planned destination, and a **Put it somewhere else…** select listing every deck and box. Choosing a place puts the card there at once and removes it from the Picklist, with a toast naming the place.

### 5.4 Colour
New token **`--status-in-hand` #9D8DF1** (violet): outside WUBRG (D-013), distinct from the proxy teal, unowned pink, and amber. Contrast: 6.2:1 on `--bg-surface`, 5.7:1 on hover, 4.9:1 on its own 15% tint. Per the vocabulary rule, badge **words** stay `--text-primary` (11.2:1 on the tint); the violet is used for the border, tint and icon only. Hand icon plus the words "In your hand" always accompany the colour (D-012). Stale hand (section 8): the same violet, nothing louder.

## 6. Missing (S8)

### 6.1 Can't find it
On a Take row, **Can't find it** immediately flags the card **Missing**. No confirmation (it is reversible); a toast confirms. The row becomes: *Missing* badge, "move paused", and an inline amber panel **Where to look next**:
- "Oracle had it in Korvold. Try, in this order:" a numbered list of up to three places.
- **Found it somewhere** (asks where it is now, see 6.3) and **Actually, I have it** (puts it In your hand and continues the move).
- Note: "Stays Missing until you find it. It can't be put in a deck and doesn't count as spare."

The destination's Put-in row shows *Missing · This slot stays planned* and no tick.

### 6.2 Where to look next: what the list contains
Ordered, de-duplicated, max three, each a place name he can walk to:
1. Places the card was last recorded in before its current place (for example "Prosper (it was moved there recently)").
2. Unsorted.
3. The box it normally lives in; else decks that play its colours.
If Oracle has no history for the card: "Oracle has no history for this card. Try Unsorted, then each box, then the decks that play its colours." Never an invented place. Needs location history (section 10).

### 6.3 The Missing place (page)
Reached from the Storage tile, the Missing prompt on a deck, and the Picklist. Lists each missing card as a card: name, amber *Missing* badge, "Last in Korvold · flagged 3 Nov", the same **Where to look next** list, and actions:
- **Found it**: asks "Where is it now?" with the place picker; the card goes straight there (one step, since he is holding it) and the deck's short slot fills.
- **See Korvold**: opens the deck at the short slot.
- **Spare copy:** "none" or the spare's place, with **Make a proxy** (existing Proxy action) when none.
No delete or "give up" action in Phase 3 (Q6). Empty state in section 8.

### 6.4 How a deck shows a short slot (answer 6)
The slot stays in the list. Row layout, top to bottom: card name; a line **"Short by 1. Your only copy is Missing."**; a disclosure **Where to look next** (the same list); actions **Use a spare copy** (only if a spare exists; otherwise it opens a toast "You own no spare Chromatic Lantern."), **Make a proxy**, **Found it**. Right edge: amber outline badge *Missing* with the search icon. The row gets the `--bg-surface` background to lift it, no other colour. If a spare exists the line adds "You have a spare in Alphabetical box." and **Use the spare copy** is primary; it adds a move to the Picklist.

Deck header: an amber outline chip "1 short · Missing" and, when relevant, a violet chip "1 in your hand". The deck stays **Assembling** (not "Unowned cards") because he does own the card; see Q2.

Amber is used for Missing everywhere (slot badge, tile border, prompt), matching the vocabulary's "Unavailable" amber; the icon (magnifier with a slash) and the word separate the two.

## 7. Unsorted and new imports

- **Meaning:** the holding place for cards just imported, until put away. Existing name kept. Quiet system place: neutral colour, inbox icon, count.
- **How imports land:** by default every new copy is in Unsorted. The owner can pick one other place for the whole import (section 21), and then the copies go there instead. When any copies are in Unsorted, the import result's last line reads "Import finished: 12 cards added to Unsorted." with **Add all 12 to the Picklist** and **Later**. "Later" leaves them in Unsorted; nothing is lost. When the owner picked a binder, a box or a deck, only the copies that ended up in Unsorted are offered (section 21.7).
- **Suggested destination per card** (the owner can change it in a select):
  1. A deck with a planned slot waiting for it (named: "Prosper (planned slot waiting)").
  2. Else the lands box for lands, or Alphabetical box for the rest ("no deck needs it").
  Valuable binder is in the select but never suggested (answer 7).
- **Page:** grouped by import ("Imported 12 Nov · 12 cards", newest first), each row: name, suggested place, destination select, **Add to Picklist**. "+ 8 more / Show all". New rows carry no badge; being in Unsorted is the status.
- **Picklist:** Unsorted is the first stop; its Take rows are the pile on the desk. Cards ticked Found leave Unsorted at once (they are In your hand).
- Footer line: "n cards from Unsorted are already on your Picklist."
- A card that was only partly handled stays in Unsorted; no timer, no nag (D-014).

## 8. States (default, hover, focus, active, disabled, loading, empty, error, domain)

### 8.1 Control states
| Control | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Tick button | surface-hover fill, 1px border, empty 20px square | border to `--text-secondary` | 2px white ring (existing) | pressed: green tint, green border, filled green square with tick | 45% opacity, `aria-disabled`, tapping shows a toast ("Pick it up first.") |
| Stop header | surface | surface-hover | white ring | open: chevron rotated | — |
| Chip/button | as `specs/whats-missing.md` | | | | |

### 8.2 Domain states of a move row
| State | Take row | Put-in row |
|---|---|---|
| To find | Found it unticked; Can't find it visible | *Not picked up yet · from X*; Placed it disabled |
| In your hand | Found it pressed; *In your hand* badge | *In your hand · from X*; Placed it enabled |
| Placed | Found it pressed and disabled; *Placed in X* green | *Placed*; pressed |
| Missing | *Missing · move paused* + look-next panel | *Missing · slot stays planned* |
| Saving | button pressed, dimmed, label "Saving…", `aria-busy` | same |

### 8.3 Empty, loading, error (exact strings; all shown in mockup screen 5)
| Where | Text |
|---|---|
| All-decks Picklist loading | Three grey skeleton rows; status text "Loading your moves…" (screen readers hear it). Never a zero or an empty message while loading. |
| All-decks Picklist empty | **Nothing to move.** "Moves you add from a deck, or after an import, show up here." |
| All-decks Picklist couldn't load | **Couldn't load your moves.** "Your cards haven't changed." **Try again** |
| All-decks Picklist all done | **All 7 moves done.** "Nothing is in your hand and nothing is missing." **Clear the list** (variant: "n moves done. 1 card is still in your hand." / "… 1 card is Missing.") |
| Tick couldn't save | **Couldn't save that. Sol Ring is still where Oracle had it.** **Try again**. The tick un-ticks itself. Offline: "No connection. This tick isn't saved." |
| Move out of date | **Sol Ring isn't in Alphabetical box any more.** "Oracle now has it in Prosper." **Take it from Prosper instead** / **Remove from Picklist** |
| In your hand empty | "You aren't carrying anything. When you tick Found on a card, it appears here until you place it." |
| In your hand left over (> 12 hours) | **Still in your hand since yesterday.** "Place them or put them back so Oracle matches the shelf." No auto-return (Q3). |
| Couldn't place | **Couldn't place Sol Ring. It is still in your hand.** **Try again** |
| Missing empty | **Nothing is missing.** "If you can't find a card while moving things, tick Can't find it on the Picklist and it will appear here." |
| Missing: no history | see 6.2 |
| Unsorted empty | **Nothing in Unsorted.** "New imports land here." |
| Unsorted loading | Skeleton rows; "Loading Unsorted…" |
| Import landed, list failed | **12 cards were added, but we couldn't open Unsorted.** "Your cards are safe." **Try again** |
| Deck short, spare exists | "Short by 1. Your copy is Missing. You have a spare Chromatic Lantern in Alphabetical box." **Use the spare copy** |

Out-of-date snapshots follow the existing pattern: "Last checked 10:42" with **Refresh**, shown at the top of the Picklist when the page has been open more than 10 minutes (the phone and the laptop can both be open).

## 9. Interactions

### 9.1 Pointer and touch
- Tap/click a tick to toggle; tap again to undo. Whole-stop collapse on header tap. Phone: one stop opens by default (the first incomplete); opening another does not close it (he may need to compare).
- **Found all / Placed all:** one tap, no confirm, undoable per row.
- **Can't find it:** one tap; no confirm.
- Hand chip: tap opens the drawer/sheet; tap the scrim or close to dismiss.
- No drag interaction is needed. D-009 (drag-to-assign is the placement mechanic for decks) is unaffected: this Picklist records physical moves; drag-to-assign still plans deck slots.

### 9.2 Keyboard
- Tab order: header, Refresh, each stop header, then within a stop each row's tick, then Can't find it, then the stop's bulk links. Hand panel last on laptop (it is `aside` after the main region); on phone the bottom bar is last.
- Stop header: Enter/Space toggles. Tick: Space/Enter. Escape closes the hand drawer and returns focus to the chip.
- After ticking, focus stays on the same button (no re-render focus loss; the mockup keeps scroll position). After Can't find it, focus moves to **Found it somewhere** in the new panel.

### 9.3 Live announcements
A polite live region announces results: "Sol Ring is in your hand. Alphabetical box is now short by one." / "Sol Ring placed in Korvold." / "Sol Ring flagged Missing." / "Couldn't save that."

## 10. Data binding (no contract exists yet)
No contract covers Phase 3. Fields the UI needs; the Architect decides shape. Nothing here is a data-model decision.

| UI element | Needs | Status |
|---|---|---|
| System places In your hand, Missing, Unsorted | A place for a copy that is none of deck, box, binder, with three named kinds; count per kind | **Needed.** Today a copy is in one deck slot or one storage location [Confirmed: docs/oracle/specs/card-management-system-overview.md]; Unsorted today is "no location and no deck" [Confirmed: src/app/api/storage/overview/route.ts] |
| Moves (Picklist rows) | A stored list of pending moves: copy, source, destination, step (to find / in hand / placed / missing), created time | **Needed** (assumption: moves persist so the phone and laptop agree) |
| Where to look next | Previous places of a copy (history) | **Needed**; else the generic fallback in 6.2 |
| Last flagged date, "last in X" | Time a copy entered Missing and the place it left | **Needed** |
| Hand "since yesterday" | Time a copy entered In your hand | **Needed** |
| Import grouping | An import batch id on new copies | Unknown; fallback is a flat list by date |
| Import destination (section 21) | The import call accepts one destination for the whole import: Unsorted, a storage location, or a deck; and returns counts per outcome (filled planned slot, added as new slot, sent to Unsorted) plus which cards went to Unsorted and why | **Needed** (Architect). Today the collection import writes copies with no location [Confirmed: src/components/manabox-import/ManaBoxCollectionImportDialog.tsx calls the import; Approximate: destination not inspected] |
| Places for the picker | Every storage location and deck with name, kind, deck state, count of cards, and count of open planned slots; Missing and In your hand excluded | Mostly exists (storage overview, deck list); open-slot count **needed** |
| Before-import preview for a deck | For the file's copies and one deck: how many match a planned slot, how many are not listed, how many the deck already has filled. Matching by card (`oracle_id`), not printing | **Needed**; if too slow the note shows without numbers (21.4) |
| Suggested destination | A deck slot with no copy (planned) matching the card (existing planned-slot data) | [Confirmed: planned slots are `deck_cards` with no copy, D-020] |
| Short slot, "spare exists" | Spare copies exclude Missing and In your hand | **Needed** (owner answer 6) |
| Copy type, proxy | `user_copies.is_proxy` | [Confirmed: AGENTS.md] |

## 11. Component inventory
| Component | Props | Built on |
|---|---|---|
| `MoveChecklist` (rename `AllDecksPicklist`; see section 20.11) | `moves`, `places`, `onTick(moveId, step)`, `onCantFind(moveId)`, `loading`, `error` | page; `Collapsible` |
| `MoveStop` | `place`, `takes`, `puts`, `open`, `onToggle`, `onFoundAll`, `onPlacedAll` | `Collapsible`, `Badge` |
| `MoveRow` | `move`, `side: 'take'\|'put'`, `state`, `saving`, `error` | row; shadcn `Button` (toggle, `aria-pressed`) |
| `TickButton` | `label`, `pressed`, `disabled`, `busy`, `describedBy` | `Toggle`/`Button` |
| `LookNextPanel` | `card`, `ideas: string[]`, `onFoundSomewhere`, `onActuallyHave` | `Alert` (amber) |
| `HandChip` | `count`, `onOpen` | `Button` |
| `HandPanel` | `cards`, `places`, `onPlace`, `onPutElsewhere`, `variant: 'column'\|'drawer'\|'sheet'` | `Sheet`, `Select` |
| `HandBar` | `count`, `onOpen` | sticky bar |
| `SystemPlaceTile` | `kind`, `count`, `attention` | tile |
| `ShortSlotRow` | `card`, `reason`, `ideas`, `spare?`, `onUseSpare`, `onProxy`, `onFound` | extends the deck slot row and the `SlotBadge` pattern with a *Missing* and an *In your hand* state |
| `UnsortedImportGroup` | `batch`, `rows`, `onAddAll`, `onAddOne` | list; `Select` |
| `ImportResultHandoff` | `count`, `fits`, `onAddAll`, `onLater` | `Alert` (accent) |
| `ImportDestinationPicker` (section 21) | `places`, `value`, `onChange`, `status: 'loading'\|'ready'\|'error'\|'none'` | `Popover` + `Command` (searchable list); bottom `Sheet` on phone |
| `ImportDestinationNote` | `deck`, `preview: {fill, new, unsorted} \| null`, `status`, `sizeWarning?` | `Alert` (accent) |
| `ImportWhereTheyWent` | `destination`, `counts`, `unsortedCards` | result-screen block; `Collapsible` for "Show which" |

New states for the shared `SlotBadge` (vocabulary spec): **Missing** (`--signal-warning`, `search_off` icon, outline) and **In your hand** (`--status-in-hand`, `back_hand` icon, filled tint).

## 12. Accessibility
- D-012: every colour state is colour plus icon plus word: In your hand (violet, hand, words), Missing (amber, magnifier-slash, words), Unowned (pink, minus-circle, words), Done (green, tick, words).
- Contrast (new pairs): violet on surface 6.2, on hover 5.7, on tint 4.9; text-primary on violet tint 11.2; amber 8.0 (words stay text-primary); accent green `#1D9E75` on surface 5.1 (non-text pressed state needs 3:1); a tick mark `#0b0b0d` on green 5.8.
- Targets: tick 48px, other buttons 44px on phone; 32px minimum for compact controls on laptop (WCAG 2.2 AA 24px).
- Tick button: `aria-pressed`; label always visible ("Found it"). The checkbox shape is decorative. Disabled ticks use `aria-disabled` and a described-by reason ("Pick it up first, at Prosper").
- Stop headers: button with `aria-expanded`; progress chip reads "2 of 3 done".
- Hand drawer/sheet: `role="dialog"`, `aria-modal`, focus moved to the close button, Escape closes, focus returns to the opener.
- Live region as section 9.3. Reduced motion: skeleton shimmer off.
- Reading order matches visual order; the hand column follows the main list.

## 13. Chat proposal cards (Add / Add all / Not now / Undo): refinements only

Reviewed against `src/components/ChatProposalCards.tsx` and `contracts/chat-add-cards.md`. Behaviour, states and strings of the contract stay. What I would change, and why. All are visual or wording; the mockup (screen 6) shows as-built next to refined, with working Add, Add all, Not now and Undo.

| # | As built [Confirmed: src/components/ChatProposalCards.tsx] | Refinement | Reason |
|---|---|---|---|
| R1 | Button reads "Add to {deck name}" on every row; a long deck name ("Korvold, Fae-Cursed King") squeezes the text column | Name the deck once in a group header "Suggestions for Korvold"; each button just **Add** (accessible name keeps "Add Sol Ring to Korvold") | Less repetition; fits narrow chat panels. **Changed from the contract's button wording; confirm (Q7)** |
| R2 | Buttons are about 24px high with "Not now" a bare grey text link | Both are real buttons: 44px on phone and touch, 32px on laptop in the chat panel; Add is the accent-tinted primary, Not now is a normal secondary | Fitts's law, WCAG target size |
| R3 | Ownership is one line of grey text for all cases | Use the shared badges: *In Prosper* (amber lock) when the owned copy is elsewhere, *Unowned* (pink minus-circle) when not owned, nothing extra when spare; keep the existing sentence beside it | D-012 and the vocabulary; "you don't own this" is a loud exception |
| R4 | Raw Tailwind colours (emerald, amber, zinc-500/400/800) | Use tokens (`--accent`, `--signal-warning`, `--text-secondary`, `--bg-surface`). "Goes in: Ramp" and "Not now" are zinc-500 on dark at about 3.4:1 | Fails WCAG 1.4.3 for small text (needs 4.5); token drift |
| R5 | Reason line and "Goes in" are both grey | Reason line in `--text-primary`; "Goes in" in `--text-secondary` | The reason is the message; the category is detail |
| R6 | Blocked card: amber text only, same card style as ready | Warning icon plus reason, de-emphasised (transparent card, subtle border), sorted after ready cards; no buttons (unchanged) | Quiet default; scanning |
| R7 | "Add all (3)" | **Add all 3** plus a **Not now** beside it that hides the whole list | The count is clearer unbracketed; there is no way to dismiss the list at once today |
| R8 | Not now removes the card with no trace; when all are dismissed the list vanishes | Leave "3 suggestions hidden. **Show again**" (nothing stored beyond the proposal status, as in the contract) | Recoverability (Nielsen 3, 9) |
| R9 | The Added state replaces the button; focus is lost | Move focus to **Undo** (single add) or to the receipt's **Undo all** (batch); receipt is a polite live region (already so) | Keyboard and screen-reader users lose their place otherwise |
| R10 | Undo shown without mention of the 24 hour limit | Receipt adds "Undo works for 24 hours." After it expires, the receipt reads "Added. To remove it, use the card's menu in the deck." | Honest about when Undo stops working |
| R11 | Card name is plain text; contract 2.3 says hover preview | Reuse the existing card hover preview; long-press on phone | Contract conformance, consistent with the rest of the app |
| R12 | Row layout keeps buttons in a right column even on a narrow panel | Under about 360px, buttons drop under the text, full width, 44px | Narrow chat side panel and phone |
| R13 | Sending: every row disabled | Same, plus `aria-busy` on the list and the label "Adding…" kept | Status visibility |

**Unchanged on purpose:** the single use of Add as the only way to change the deck; "Nothing changes in your deck until you tap Add" is shown in the group header; the receipt wording ("Added Sol Ring to Korvold. Your copy is still in Prosper."); blocked cards never get Add.

## 14. Copy bank (labels, exact)
Found it · Placed it · Put back · Can't find it · Found all {n} · Placed all {n} · In your hand · Missing · Unsorted · Where to look next · Found it somewhere · Actually, I have it · Put it somewhere else… · Remove from Picklist · Add to Picklist · Add all {n} to the Picklist · Later · Use a spare copy · Make a proxy · Put these cards in · Going into {deck} · {n} filled planned slots · {n} added as new · {n} sent to Unsorted · "Short by 1. Your only copy is Missing." · "Ticks save straight away. Found takes the card out of its deck in Oracle at once."

## 15. What must never happen (checked against the brief, section 13)
- A move that silently leaves a deck short: every Found shows the source deck short at once ("Short by 1 while it is in your hand"), and every Missing shows the short slot with a reason.
- Losing a card: In your hand and Missing are places, not deletions; nothing here deletes anything.
- A Missing or in-hand card offered as a spare: both are excluded (needs data, section 10).
- Colour alone: section 12.
- Testing against live data: unchanged; save-path tests use the test account.

## 16. Deleted or replaced when this ships
- The **Move from X** action on a deck slot becomes **Move here** (primary, still instant, now with an Undo toast and no confirmation dialog), plus a small secondary **Add to Picklist**. The earlier proposal (checklist as primary, "Move in Oracle only" as secondary) is withdrawn.
- The words "Sleeve", "Sleeve List", "Sleeved" and "Unsleeved" go (section 19).
- Nothing else in this spec replaces existing screens. The existing Unsorted tile stays and gains two siblings.

## 17. Open questions for the owner (behaviour, recommendation first)
- **Q1. Answered 2026-11-13:** the main action on a deck is **Move here**, instant. See section 19. New questions from it are Q8 to Q10 below.
- **Q2. A deck with a Missing card.** Recommendation: stays **Assembling** with an amber "1 short · Missing" chip. Example: Korvold loses Chromatic Lantern; it still reads Assembling, not "Unowned cards", because you do own it. The alternative is "Unowned cards", which would put it on a buy list; that would be wrong while you might still find it.
- **Q3. Cards left in your hand.** Recommendation: never move them automatically; after 12 hours the panel says "Still in your hand since yesterday". The alternative is Oracle quietly putting them back, which would hide a real card from you.
- **Q4. Stop order.** Recommendation: Unsorted, boxes A to Z, decks A to Z, no reordering in this phase. Option: let you drag stops into your own walking order, remembered between sessions (needs a keyboard way to reorder too).
- **Q5. Signal on the shelf.** Ticks need a connection. Recommendation: show "No connection. This tick isn't saved." and keep the row unticked. The alternative (save ticks and send later) needs a bigger build; say if your shelf has poor signal.
- **Q6. A card that never turns up.** Phase 3 has no "give up on it" action; the card stays Missing. Say if you want one later (it would affect your collection counts).
- **Q7. Chat Add button.** Recommendation: **Add** with the deck named once in the header (R1). Alternative: keep "Add to Korvold" in full.

## 18. Assumptions (not decided here)
- A move persists, so a phone and a laptop show the same list.
- Hand, Missing and Unsorted are places a copy can be in (owner answer 4 and 6); the storage shape is the Architect's call.
- Proxies move exactly like originals.
- "Spare" means a free copy in a box and excludes Missing and In your hand.
- The order of "Where to look next" is derived from recorded history where it exists; if it does not, the generic fallback is used.
- The Picklist is for one user's items; nothing here prevents a public multi-user version.

## 19. Move here (amendment, owner decision 2026-11-13) and wording

Mockup: screen "3c Move here" (laptop and phone), plus the chat card in screen 6.

### 19.1 What it is
When a card's chosen copy is in **another deck**, its row in this deck shows a primary **Move here**. One click moves that copy into this deck at once, in Oracle only. There is no In your hand step, no Picklist entry and no confirmation dialog. Clicking it means the card is physically being moved now, so Oracle creates **no reminder, list or nagging** about it.

### 19.2 Placement on a deck row
- Row text: "Your copy is in Prosper." with the quiet badge **Planned · in Prosper** (provisional wording, 19.7).
- Right end of the row: primary **Move here** (accent, no icon), then a small text button **Add to Picklist**. Move here is always the leftmost, largest action.
- **Add to deck** (planned slot only) is unchanged. If the only copy is in another deck, Move here appears on that row straight after the add, and in the chat receipt (R-card "Added", section 13).
- Phone: the row stacks. Move here is a full-width 44 px button under the text; Add to Picklist sits below it as a text link.
- Keyboard and screen reader: the button's accessible name is "Move Cultivate here from Prosper".

### 19.3 Undo
- A toast: **Moved from Prosper. Undo**, 8 seconds, pauses on hover and focus, announced politely. On phone it sits above the bottom bar.
- Undo puts the copy back in the source deck, exactly as it was.
- The row also keeps a quiet inline "Moved from Prosper · Undo" for the rest of the visit, so Undo does not depend on a vanishing toast.
- Two quick moves give two toasts; the newest shows first, Undo applies to its own move only.

### 19.4 The row afterwards
Badge becomes **In deck** (original or proxy as the copy is). Buttons disappear. A quiet "Moved from Prosper" note remains with the inline Undo. No amber, no warning.

### 19.5 If the source deck is built or Playable
Example: Rhystic Study lives in Atraxa, a Playable deck. The row says "Atraxa is Playable, so it will become Assembling." before the click. After the click the toast reads **Moved from Atraxa. Atraxa is now Assembling. Undo**. No dialog, because the owner wants one click; the cost is that the warning is read before, not asked after. Atraxa shows its slot as Planned and short by one; nothing else changes. Needs confirmation (Q8).

### 19.6 Several copies in several decks
Example: Smothering Tithe, 3 copies. Move here becomes a **split button**: the main part moves the default copy, the small arrow opens a list of copies ("Prosper · Assembling", "Atraxa · Playable", "Edgar Markov (proxy) · Playable"). The line under the card says which was picked and why. Default order: copies in decks that are not Playable first, originals before proxies, then A to Z. The chosen copy is always named on the button's accessible name. Needs confirmation (Q9). On phone the list opens as a bottom sheet with 44 px rows.
If the only copies are In your hand or Missing, Move here is not shown; the In your hand and Missing sections apply.

### 19.7 Wording changes (owner decision)
- Tab **Sleeve List** becomes **Picklist** (the per-deck tab and the move checklist are merged; section 20).
- Button **Sleeve** becomes **Placed it**.
- Labels **Sleeved / Unsleeved**: the owner has not chosen. Recommendation, provisional and used in the mockup: **In deck** and **Planned**. Alternatives to weigh: "Placed / Not placed".
- Screens affected (existing app, for Gene and the Architect): the deck page tab; the picklist confirm dialog and its failure message; the status chip popover button, confirm and failure message; the collection card detail confirm; the reconciliation choice buttons, conflict cards and summary; the overused cards row; the deck cards tab, group sections and grid; the slot and deck state badges; every ManaBox import screen (row editor, card list, summary, result, deck import, collection import); the onboarding page. `vocabulary.md` (D-025) also needs Gene's update. This spec and the mockup use the provisional words everywhere.

### 19.8 Components
`MoveHereButton` (props: `card`, `copy`, `fromDeck`, `onMove`, `busy`), `CopyChooser` (split-button menu / phone sheet, `copies`, `selected`), `UndoToast` (`message`, `onUndo`, `durationMs`), `MovedNote` (inline Undo). All built on shadcn `Button`, `DropdownMenu`, `Sheet`, `Sonner`/toast already in the app [Approximate].

### 19.9 States
Default, hover, focus (2 px ring), active, **busy** ("Moving…", button disabled, row not duplicated), **error** ("Couldn't move Cultivate. It is still in Prosper. Try again." with a Try again button; nothing changes), **out of date** (the copy has moved elsewhere since the page loaded: "Cultivate is no longer in Prosper." and the row refreshes), and **offline** ("No connection. Nothing was moved.").

### 19.10 Touchpoints elsewhere
Deck health "other decks" rows and the chat Added receipt show the same Move here. Source deck's Deck health reflects the new short slot on its next view. No new Picklist or hand entries are made.

### 19.11 Additional open questions
- **Q8.** Moving out of a Playable deck: toast names the change, no dialog (recommended, matches one click) or keep a confirm for Playable only (safer, slower).
- **Q9.** Default copy when several exist: non-Playable decks first, originals before proxies, then A to Z (recommended).
- **Q10.** Labels for Sleeved/Unsleeved (19.7).

---

## 20. The Picklist: one concept, two views (owner decision 2026-11-13)

### 20.1 Definition and naming
The **Picklist** is the one place that says what to pick, move or buy. The per-deck "Sleeve List" tab and the move checklist are merged. Two views of the same saved list:
- **Per deck** (tab **Picklist**): everything needed to complete that deck. Mockup screen 1b.
- **All decks** (section 4): the combined Picklist in walking order. Mockup screen 1.

Words: tab **Picklist**; button **Sleeve** becomes **Placed it**; **Found it** stays; **In deck** / **Planned** stay provisional (Q10). "Move checklist" is retired.

### 20.2 Per-deck layout and order
Top to bottom:
1. **Summary (sticky):** "92 of 100 ready", then "3 available · 2 need moving · 3 unowned", a progress bar, and one line such as "Walking and moving can get this deck to 97 of 100. The last 3 need buying." Header action **Add all {n} to the all-decks Picklist** (becomes a Done badge when nothing is left off the walk).
2. **Available**: owned cards free in boxes or Unsorted. Pick and place.
3. **Needs moving**: owned copies sitting in other decks.
4. **Unowned**: cards you do not own.

Order rationale: easiest with no side effects first, then actions that affect another deck, then the ones that cost money. It follows the left-to-right order of the existing three columns. Groups are stacked and collapsible at every width (replaces the existing three columns; Q11). Each group header has an icon, name, one-line description and a badge ("n left", Done, None). On phone only the first group with work is open.

### 20.3 Progress: "N of M ready"
All three groups are required to finish the deck, so progress counts all of them. **Ready** means the card is in the deck (provisional label In deck). A card still Planned, in your hand or Missing is not ready. M is the deck size. The summary never shows "0 of 0" while loading. Q12 and Q16.

### 20.4 Rows and actions per group
**Available.** Name, badge, "free in {place}". Rows are grouped by place in walking order. Ticks **Found it** then **Placed it**. Placed it is enabled without Found it and records both steps (Q13). Quiet link **Can't find it**; the card stays in its group with the Missing badge and the look-next prompt (section 6).

**Needs moving.** Grouped "From Prosper · Assembling". Badge "Planned · in Prosper". Primary **Move here** (section 19: instant, 8 second Undo toast, inline "Moved from X · Undo", no reminders, no walk item). Quiet **Walk it instead** reveals **Found it** and **Placed it**, the optional shelf flow with the In your hand step (sections 4 to 7). Placed it is disabled until Found it ("Pick it up first, at {place}"). Several copies use the copy chooser (19.6). A Playable source is named before and after the click (19.5).

**Unowned.** Name, pink **Unowned** badge with the minus-circle icon (never colour alone, D-012), price or "Price unknown" ("est." per `PriceText`). Checkbox **On my wishlist**; action **Make a proxy** (existing). Footer: "To finish: about $69.20 · 1 card unpriced", "2 of 3 on your wishlist", link **See buy ideas** (opens What's missing, "Buy ideas"). Help line: "Bought it? Import it and choose this deck under Put these cards in. The cards fill the slots straight away." with the link **Import cards for {deck}**, which opens the import with this deck already chosen (section 21.3; Q17 covers whether to build the link).

Cards In your hand or Missing stay in the group they came from with that badge; there is no fourth group. A card taken out of this deck shows "Short by {n} while cards are in your hand".

### 20.5 How the all-decks view relates
- One saved list (`move_items`, Architect's contract). **Ticks are shared**: anything ticked in either view appears in both.
- All-decks holds cards "on the walk": added by **Add all {n} to the all-decks Picklist**, by **Add to Picklist** on a card, or automatically when Found it or Placed it is ticked. It is ordered by stop: Unsorted, boxes A to Z, decks A to Z.
- **Move here** creates no walk item. **Unowned cards never appear** in the all-decks view; it shows a footnote "{n} unowned cards in Korvold aren't listed here. Open the deck's Picklist." (Q15).

### 20.6 Unowned, the wishlist and buy ideas
Unowned connects to buying lightly. It offers a per-card wishlist tick, a price, a running total and a link to What's missing (Buy ideas, section "whats-missing"). It does **not** design a shopping feature: no cart, no store links, no mark-as-bought, no wishlist page. A separate wishlist feature is a **later open question** (Q14). Needs data: a wishlist flag for unowned deck cards (today the flag exists only on import claims and is inert) and a Scryfall price.

### 20.7 States
| State | Behaviour |
|---|---|
| Loading | Skeleton rows; "Loading your Picklist…"; progress hidden |
| Deck empty | "No cards in this deck yet. Import cards from a URL or paste a list to start building your Picklist." |
| Complete | "Nothing left to pick. Every card this deck needs is in it. 100 of 100 ready." with a tick icon |
| Empty group | Available: "Nothing to pick up. Every card you own for this deck is already in it or in another deck." Needs moving: "Nothing to move from other decks." Unowned: "You own everything this deck needs." |
| Couldn't load | "Couldn't load this deck's Picklist. Your cards haven't changed." **Try again** |
| Search, no match | "No cards match “{x}”." (existing search box stays) |
| Prices unavailable | "Prices aren't available right now." Rows keep "Price unknown" |
| Wishlist save error | "Couldn't save that. {Card} is not on your wishlist." Tick reverts |
| Move error / out of date / offline | As 19.9 |
| Busy | Row button "Moving…" or tick pending, row not duplicated |

### 20.8 Mobile
Groups stacked, summary sticky. **Move here** is a full-width 44 px button; ticks are 48 px; the wishlist target is 44 px; the copy chooser is a bottom sheet. Nothing scrolls sideways.

### 20.9 Interactions and keyboard
Tab order: summary, header action, each group header (Enter or Space toggles), then rows left to right. Ticks are toggle buttons. After a Move here the focus moves to the next row; the Undo toast is reachable by keyboard and announced politely.

### 20.10 Data binding
- `move_items` for shared ticks and the walk list. Needs a Placed-without-Found transition (Q13).
- Ready count: cards in the deck over deck size; Architect to confirm it matches the deck header (Q16).
- Wishlist flag for unowned deck cards, and Scryfall price (new).
- Move here uses the existing instant move with undo (section 19).

### 20.11 Components
`DeckPicklist`, `PicklistSummary` (progress), `PicklistGroup` (collapsible), `PicklistRow` with variants Available, NeedsMoving, Unowned; reuses `MoveHereButton`, `CopyChooser`, `UndoToast`, `MovedNote` (19.8) and the existing `WishlistCheckbox`. `MoveChecklist` is renamed `AllDecksPicklist`. Replaces the existing `PicklistV2` columns, its confirm dialogs and its "Sleeve" strings.

### 20.12 Accessibility
Progress bar has `role=progressbar` with value, min, max and a text label ("92 of 100 ready"). Ticks use `aria-pressed`. Every state pairs colour with an icon and a word (D-012). Group headers are buttons with `aria-expanded`. Toasts use a polite live region. Targets are at least 44 px on phone, 24 px minimum on laptop.

### 20.13 Copy
Tab Picklist · Available · Needs moving · Unowned · {n} of {m} ready · Found it · Placed it · Move here · Walk it instead · Can't find it · On my wishlist · Make a proxy · See buy ideas · Add all {n} to the all-decks Picklist · Add to Picklist · Remove from Picklist · Price unknown. Messages are in 20.7.

### 20.14 Open questions
- **Q11.** Stacked collapsible groups instead of the existing three columns (recommended), or keep columns on laptop.
- **Q12.** Does "ready" mean in the deck only (recommended), and where do In your hand and Missing cards sit (stay in their group, recommended).
- **Q13.** One tap Placed it from Available, skipping Found it (recommended); Architect to confirm the transition.
- **Q14.** A separate wishlist feature later (page, totals, mark as bought). Not designed here.
- **Q15.** All-decks scope: opt-in by add or tick (recommended) or everything for every deck.
- **Q16.** Architect: wishlist flag data for unowned deck cards; whether "N of M ready" matches the deck header count.

---

## 21. Import: choose where the cards go (owner decision 2026-11-13)

Mockup screen 4b (laptop and phone, working picker, result, and state switches); extra states are in screen 5.

### 21.1 The problem
Every import lands in Unsorted, so cards bought for a deck, or expensive cards that belong in a binder, always need a second trip: open Unsorted, find them, move them. The owner already knows where they are going when he imports.

### 21.2 Principle
Put the decision where the knowledge is (the moment of import), keep the default as the safe place (D-014 quiet default), and report exactly what happened (Nielsen 1, visibility of system status; 5, error prevention). One choice for the whole import, never per card, so the screen does not grow (progressive disclosure).

### 21.3 Where it lives
- **Collection import, review step** (the existing "Import cards" dialog, where the file is read and reviewed): a new row **Put these cards in**, directly under the "Importing as: Non-foil · Near Mint · English  Change" bar and above the card list. Not hidden inside "Change": where cards end up matters more than their finish, so it is always visible, but at the default it is a single quiet line ("Unsorted · default").
- **Deck import ("Import deck") does not get the picker.** "I bought it" already puts every card into the deck being created; "I built it" and "I'm planning it" add no new copies. Confirm in Q18.
- **Onboarding import**: no picker (a new owner has no boxes or decks to choose). Same behaviour as the "no places yet" state below.
- **From a deck**: the Unowned footer on the deck's Picklist offers **Import cards for {deck}**, opening the same dialog with that deck already chosen. Optional (Q17); the picker works without it.

### 21.4 The picker
- A button that opens a searchable list (combobox). Closed it shows the place's icon and name plus a hint (for example "Assembling · 7 open slots"); the default reads "Unsorted · default".
- **Groups, in this order:** Unsorted · Boxes and binders · Decks. Within a group, A to Z. Boxes and binders show their card count; decks show their state and open planned slots ("Playable · no open slots").
- **Never listed:** Missing, In your hand. They are not real places to put things.
- **Search:** the search box appears when there are more than 8 places in total; below that the plain list is clearer. Matches names anywhere in the word; groups with no match disappear.
- **Phone:** the list opens as a bottom sheet (rows 48 px, search box 44 px, the sheet scrolls, a dimmed backdrop closes it). The search box is not focused automatically on phone, so the keyboard does not cover the list.
- **Keyboard:** Tab to the button; Enter or Space or Down opens it and focuses the search (laptop) or the chosen row; Up and Down move through rows, from the first row Up returns to the search box; Enter or Space chooses; Escape closes and returns focus to the button; typing filters.

### 21.5 Default and the deck-destination note
- **Default:** Unsorted, every time the dialog opens (not remembered, so a leftover choice never sends tonight's import to last week's deck).
- **Box or binder chosen:** one grey line: "All 8 copies go straight into Valuable binder. Nothing is added to the Picklist."
- **Unsorted chosen:** "They land in Unsorted. Put them away later from the Picklist."
- **Deck chosen:** an accent note appears before the owner imports:
  - **Going into Korvold**
  - Each copy fills Korvold's matching planned slot.
  - A card Korvold doesn't list is added as a new slot with the copy.
  - A card Korvold already has filled goes to Unsorted instead.
  - **From this file:** 5 would fill planned slots · 2 would be added as new · 1 would go to Unsorted. (Zero parts are left out. Updates when the deck changes.)
  - If new slots push the deck past its size: "Adding 2 new slots takes Korvold to 102 cards. A Commander deck is 100." Warns only (Q20).
- **Footer:** the existing **Import cards** button keeps its label. Beside it a live line says "8 copies · 7 into Korvold, 1 to Unsorted" (or "8 copies · to Valuable binder"). Cancel is unchanged.
- Rule for several copies: copies are placed one at a time in file order. 2 Sol Rings in the file and Korvold wants 1: the first fills the slot, the second goes to Unsorted. A card the deck doesn't list: the first copy becomes a new slot, later copies of it go to Unsorted (Q19 covers basic lands).

### 21.6 The result screen
Existing result keeps its tick, headline ("8 copies added", "to your collection") and breakdown. A new block **Where they went** sits under the headline, and states every count, left out when zero, always adding up to the total:
- Deck: heading "Where they went: Korvold"; line **5 filled planned slots, 2 added as new, 1 sent to Unsorted**. If any went to Unsorted, **Show which one went to Unsorted** opens a short list with the reason ("Sol Ring · Korvold already has it").
- Box or binder: "8 put in Valuable binder".
- Unsorted: "8 put in Unsorted".
Plural rules: "1 filled planned slot", "2 filled planned slots".

### 21.7 How this works with "Add all {n} to the Picklist"
The offer covers only cards sitting in Unsorted, because those are the only ones that still need walking somewhere.
| Chosen | Offer |
|---|---|
| Unsorted | As before: "8 cards are in Unsorted." **Add all 8 to the Picklist** and **Later** |
| Box or binder | None. The result says nothing was sent to Unsorted, so nothing to add. Putting them in the binder is the "put away" |
| Deck, some sent to Unsorted | "1 card is in Unsorted." **Add 1 to the Picklist** (copy: "Add all {n}" only when n is 2 or more) and **Later** |
| Deck, none sent to Unsorted | None |
The cards that filled planned slots are already placed, so they need no Picklist entry. Copies that filled a slot create no Move row; Unsorted rows are unchanged from section 7.

### 21.8 States
| State | Behaviour |
|---|---|
| Default | Picker closed, "Unsorted · default", one grey line |
| Hover, focus | Border lightens; focus ring as other controls; rows highlight on hover and focus |
| Open | List with groups; selected row has a tick and a tinted background |
| Loading places | Button disabled, reads "Loading your places…"; "Cards go to Unsorted unless you choose a place."; Import cards stays enabled |
| Couldn't load places | Alert under the button: "Couldn't load your boxes, binders and decks." "Cards will go to Unsorted. You can put them away later." **Try again**. Import cards stays enabled |
| No boxes, binders or decks yet | No picker: "Put these cards in: Unsorted. You have no boxes, binders or decks yet to choose from." |
| Search, no match | "No place matches “{x}”." with "Clear the search to see all {n} places. Missing and In your hand aren't places you can import into." |
| Deck check loading | In the note, a skeleton line and "Checking {deck}…"; import allowed |
| Deck check failed | "Couldn't check {deck}. You can still import. The result will say exactly where each card went." **Try again** |
| Deck over size | Amber warning line, import allowed |
| Place removed before saving | After import: "{Place} no longer exists. 8 copies went to Unsorted instead." "Nothing was lost." **Open Unsorted** |
| Some copies couldn't be placed | "7 of 8 went into Korvold. 1 couldn't be placed and went to Unsorted." The result line counts it under "sent to Unsorted". Nothing is lost |
| Everything sent to Unsorted | "Korvold already had all 8. 8 sent to Unsorted." |
| Import itself fails | Existing error; no copies are half-placed (Architect: one all-or-nothing save per import) |
Whenever a placement cannot be made, the copy goes to Unsorted, never dropped. There is no empty-picker dead end.

### 21.9 Mobile
Picker button full width, 44 px. Opens as a bottom sheet. The note and the three lines wrap; the preview line may take 2 to 3 lines. Footer: live line above, Cancel and Import cards side by side, each at least 44 px. Result: Where they went block full width, Picklist offer buttons side by side at 44 px.

### 21.10 Accessibility
- The picker is a combobox with an accessible name "Put these cards in" and its current value read with it; the list is a listbox with named groups; the chosen row has `aria-selected`.
- Not colour alone (D-012): the deck note has a title and words; the warning has an icon and words; the state in the list ("Playable", "Assembling") is text.
- The footer line and the deck preview are polite live regions (`role=status`); the result headline is announced on arrival; focus lands on **View collection** as today.
- Contrast: amber icon on the note and text-primary body reuse pairs already checked in section 12; the accent-tinted note keeps text-primary (11.2:1 on tint).
- Targets 44 px on phone, 32 px minimum on laptop.

### 21.11 Data binding
See the section 10 rows "Import destination", "Places for the picker" and "Before-import preview". Counts on the result come from the import's response, not recomputed in the screen, so the result is always what really happened.

### 21.12 Copy (exact)
Put these cards in · Unsorted · default · Loading your places… · Going into {deck} · Each copy fills {deck}'s matching planned slot. · A card {deck} doesn't list is added as a new slot with the copy. · A card {deck} already has filled goes to Unsorted instead. · From this file: {n} would fill planned slots · {n} would be added as new · {n} would go to Unsorted. · Where they went · {n} filled planned slots, {n} added as new, {n} sent to Unsorted · {n} put in {place} · Show which one went to Unsorted · {n} cards are in Unsorted. · Add all {n} to the Picklist · Add 1 to the Picklist · Later. Errors as in 21.8.

### 21.13 Open questions for the owner (recommendation first)
- **Q17. A shortcut from a deck.** Recommendation: add **Import cards for Korvold** to the deck's Picklist footer, opening the import with Korvold already chosen. You would see the same import screen with the place filled in. Alternative: no shortcut; you pick the deck yourself each time. Trade-off: one more link on the deck versus one more choice on the import.
- **Q18. Deck import.** Recommendation: no picker there. "I bought it" puts every card in the new deck already. Alternative: add a picker to "I built it" so copies that are not yet in a box could be put somewhere. That would change a flow you have already approved.
- **Q19. Basic lands.** Recommendation: basics ignore the "already filled" rule; every copy fills a slot or becomes a new slot, since a deck holds many. Example: 10 Forests in the file and Korvold lists 6: 6 fill slots, 4 become new. The alternative sends all but the planned count to Unsorted.
- **Q20. A deck that would grow past its size.** Recommendation: warn, then import anyway ("Adding 2 new slots takes Korvold to 102 cards"). Alternative: send the extra new cards to Unsorted instead, so a 100-card deck never becomes 102. Trade-off: you never lose control of the deck size, but "straight to the deck" no longer always means straight to the deck.
- **Q21. Which decks appear.** Recommendation: every deck, including Playable ones (marked "no open slots"; new cards would be added as new slots). Alternative: hide Playable decks, since nothing is waiting there. Archived decks, if any, stay hidden.
- **Q22. Remembering the choice.** Recommendation: always start at Unsorted, no memory, so one late-night import cannot land in the wrong deck. Alternative: remember the last place for the session.
- **Q23. Architect.** Does one import call take a destination and return the three counts, with one all-or-nothing save? Can the before-import preview be answered quickly for a big file?

