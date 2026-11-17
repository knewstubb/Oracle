# Spec: Claude connector screens (Gate 3)

Mockup: `docs/oracle/mockups/claude-connector.html`. Brief: `docs/oracle/briefs/claude-connector.md` (section 0 approved items 1-10 win). Audit: `docs/oracle/reports/2026-11-16-architect-claude-connector-audit.md`.
Status: draft for owner approval. Nothing is built.

## 1. The problem
The owner will let a Claude app change Oracle from a phone, away from the computer. Claude's own "Allow" prompt can be switched off, so the owner needs a place inside Oracle that (a) shows the connector is on and lets them cut it off, (b) shows what Claude changed and lets them undo it, (c) holds big edits and deck-to-deck moves until the owner says yes, and (d) never makes a moved card look lost or a failed lookup look like "nothing happened".

## 2. Principle
- **Visibility of system status (Nielsen 1) and honesty (D-030):** active, off, expired, loading, empty and failed are separate states; failure is never "none".
- **User control and freedom (Nielsen 3):** Undo on every change; Approve/Decline on every pending one; one-tap off-switch.
- **Object-action mapping (D-015):** the switch is inside the connection card, Undo inside its row, Approve/Decline inside the pending card.
- **Quiet default, loud exception (D-014):** the pending chip only appears when something waits; applied changes are plain rows.
- **Reuse, don't invent:** the moved-card state is an existing Planned slot (section 8).

## 3. Where it lives
New page **Settings → Claude connector** with three tabs: **Connection**, **Recent changes**, **Setup guide**. A small chip "N Claude is waiting for your yes" shows in the app header only while something is pending, and opens Recent changes. Phone: tabs scroll horizontally; the chip sits in the header. Deep link from the chip must work on phone.

### 3.1 Connection tab
Components: connection card (shadcn `Card`, `Switch`, `Badge`), notice (`Alert`), "What Claude can and can't do" panel (`Card`), "Where it's connected" card.
- **Active:** badge "● Active", switch On, line "Claude is connected as {email}. Last used {time}, from {Claude app}."
- **Off:** badge "○ Off", switch Off.
- Toggling **off** takes effect immediately, with no confirm dialog (turning off is the safe direction). Server revokes the connector's access; Claude's next request gets "not connected". Notice: "Claude can no longer reach Oracle. Any Claude chat that asks now gets 'not connected'. To use it again, switch this back on and reconnect from Claude." Toast: "Claude is switched off."
- Toggling **on** from Off: no sign-in needed here; it re-enables the link, and if the Claude side signed out it moves to the expired state.
- Pending changes when switched off: they are kept but cannot be approved to run until on? **Decision:** switching off also cancels all waiting requests ("Cancelled: Claude was switched off"). Nothing applies.
- **Expired login:** alert "Claude's sign-in has expired. Claude can't reach Oracle until you reconnect. Nothing was changed while it was signed out." Badge "! Needs reconnecting", button "Show me how to reconnect" (opens Setup guide). Claude's side message: "Oracle says your sign-in has expired. Please reconnect Oracle in Claude's connector settings, then ask again."
- **Loading:** switch disabled, badge "Checking…". **Error reading status:** alert "We couldn't check whether Claude is connected. It may still be." with Try again. Never show "Off" on failure.
- **Switch failed:** switch returns to its previous position, alert "We couldn't switch Claude off. Try again. If it keeps failing, change your Oracle password." (Off-switch failing must be loud.)

### 3.2 Sign-in step (first connection)
Oracle's normal sign-in page, preceded by a card "Claude is asking to connect". Lists what is allowed: read decks and collection; make small changes you can undo; ask first before big changes or moving a card between decks; and "It will never be able to delete a deck or take a card out of your collection." Buttons "Sign in and allow" and "Cancel". Footer "Didn't start this? Close this page. Nothing is shared until you sign in." Wrong password uses the normal sign-in error. Cancel returns to Claude with "not connected".

### 3.3 Setup guide tab
Accordion (shadcn `Accordion`): Claude on the web (open by default), desktop, phone, Claude Code. Top notice: "Start on the web or desktop. The phone app can't add a new connector yet; once you add it on the web or desktop it shows up on your phone." Copyable connector address with "Copy address" (toast "Address copied"). Claude Code shows the one command in a copyable block. Footer: "Claude's menus change from time to time. If a step looks different, look for 'connectors' in Claude's settings." Steps are written in plain words; the words "MCP", "OAuth" and "token" never appear.

## 4. Recent changes tab
Order: pending section (section 5) first, then applied changes newest first grouped by day. Window: 7 days; caption "Showing the last 7 days. Older changes are kept in Oracle's record but can't be undone here."

**Row** (component `ChangeRow`): plain-words sentence with deck and card in bold, one extra consequence sentence where useful, time + which Claude app, Undo button. Props: `summary`, `consequence?`, `deckName`, `cardName`, `at`, `client`, `status` (done / undone / refused / pending), `refusalReason?`.

Copy per kind of change:
| Change | Sentence |
|---|---|
| Add to deck | "Added {card} to {deck}. It is on the list, Planned. No copy was moved." |
| Remove from deck | "Took {card} out of {deck}'s main list. The copy went back to storage; it is still in your collection." |
| Move to/from maybeboard | "Moved {card} to {deck}'s maybeboard. The copy went back to storage." |
| Original/Proxy | "Marked your {card} in {deck} as an {Original/Proxy} (it was a {Proxy/Original})." |
| Add to collection | "Added {card} to your collection ({n} copy, in Unsorted)." |
| Sleeve a free copy | "Put a free copy of {card} into {deck}." |
| Move between decks | "Moved {card} from {A} to {B} at {time}." (CC-13: no approval; owner-only Undo for 7 days). Old moves you approved keep: "Moved {card} from {A} to {B} (you approved this at {time})." |
| Several cards, one request | one row: "Cut 15 cards from {deck}." plus "See the 15 cards" disclosure |

**States**
- **Undo (default):** button "Undo". Press: button shows busy, then row becomes **Undone** (greyed, tag "✓ Undone, {time}", line "{deck} is as it was before."), toast "Undone. {Card} is off {deck}'s list." Row stays in the list.
- **Undo refused:** button stays but is `aria-disabled` with the reason in the row (never only a tooltip): "Can't undo this one. You have changed {deck} since: {what changed, with date}. Undoing it now could break the deck. You can take it out by hand on the deck page." plus "Open {deck}". Refusal reasons are always specific ("{card} was sleeved with a copy on 14 Nov", "that card was moved to Korvold on 14 Nov").
- **Undo failed (technical):** inline "We couldn't undo this. Nothing was changed. Try again." (differs from refused; never says undone).
- **Expired window:** after 7 days the row leaves the list.
- **Empty (loaded fine):** "Claude hasn't changed anything in the last 7 days" / "When Claude adds, removes or moves a card, it will show up here with an Undo button."
- **Error:** alert "We couldn't load Claude's recent changes. This doesn't mean there are none." with Try again. The empty state is only ever rendered after a successful empty answer (D-030).
- **Loading:** two skeleton rows + "Loading Claude's recent changes…" (`aria-busy`).
- **Group undo:** a multi-card change undoes as one row; if part cannot be undone, the whole undo is refused with the reason (all or nothing).

## 5. Pending approvals
Section at top of Recent changes titled "Waiting for your yes" with count. Banner above: "Only you can approve these. Claude can ask, but it can't say yes for you. That's true even if Claude's own 'ask me first' prompts are switched off. Nothing below has happened yet."

Two kinds (`PendingCard`, shadcn `Card` + `Badge` + `Button`):
1. **Moving a card** (badge "⏸ Moving a card · waiting"): title "Move {card} from {A} to {B}?". Two side-by-side boxes (stacked on phone, losing deck first): deck name with "(loses a card)" / "(gains a card)", In deck count before → after, what happens to the slot, deck status before → after (reusing Assembling/Playable wording; computed by the existing readiness calculation). Line "Nothing is lost or duplicated. The copy exists once and is in one deck."
2. **Big edit** (badge "⏸ Big edit · waiting"): title "{Cut/Add/Change} {n} cards {from/to} {deck}?", scrollable card list, deck size before → after and In deck before → after, "The copies go back to storage, not deleted." when removing.

Buttons: primary "Approve move" / "Approve all {n}", secondary danger-outlined "Decline". Approve applies at once; the card then appears in the applied list with Undo (and a toast "Approved. {summary}"). Decline discards; Claude is told "the owner said no".
- **Already stale at approval** (deck changed since Claude asked): approve is refused, card shows "Couldn't apply. {specific reason}. Nothing was moved. Ask Claude again." and the buttons become "Dismiss".
- **Expired:** after 24 h with no answer: "Expired. Nobody answered within 24 hours. Nothing changed." (**new decision, section 11**.)
- **Switched off or login expired** while waiting: cancelled, shown as "Cancelled".
- **Partial approvals:** none. A big edit is all or nothing (decline and ask Claude to make it smaller).
- **Phone width:** one column, cards stacked, buttons are two equal halves at least 44px tall, deck-effect boxes stacked, long lists collapsed behind "See the {n} cards". No horizontal scroll at 360px.
- **Header chip:** "{n} Claude is waiting for your yes", shown only while n > 0, on every screen; opens this section.
- Claude cannot approve: enforced in Oracle (approval only from a signed-in Oracle session, never from the connector). The banner states it; the spec never relies on Claude's prompt (audit sections 4 and 7).

## 6. "What Claude can and can't do" panel
On the Connection tab. Two columns (stacked on phone), each item with a **✓** or **✕** icon plus words. Copy is in the mockup, section 5. Required: "Take any card out of your collection" appears under Claude can't; no screen anywhere offers a remove-from-collection control for Claude. Removing a card from a deck always says "the copy went back to storage". Final line: "These limits are enforced by Oracle, not by Claude's own prompts, so they hold even if Claude is set to never ask."

Caveat to confirm (report, question 1): Undo of "Added {card} to your collection" removes a copy Claude added. That is the owner undoing, not Claude, but it is a collection removal.

## 7. Interactions
Pointer: tap tab, switch, Undo, Approve, Decline, disclosure, accordion, copy.
Keyboard: Tab order is page tabs → connection card (switch) → panel; in lists each row's button in DOM order (newest first), pending cards before applied rows. Switch toggles on Space/Enter. Tabs follow arrow-key navigation. Accordion Enter/Space. No drag anywhere in this feature, so no drag equivalent is needed.
After Undo/Approve/Decline, focus moves to the next row's action (or the list heading when none remain); a polite live region announces the result. Toasts use `role="status"`; errors use `role="alert"`.

## 8. How the moved card reuses planned/placed slots (owner words: In deck / Planned, D-025; renamed from Sleeved / Unsleeved on 2026-11-17)
The audit's reading (brief section 0, "How rules 9 and 10 sit") is used as is: on a cross-deck move the copy attaches to the destination slot and the source slot goes back to a planned slot. In the original deck's Cards tab the slot:
- sits under **Planned**, with the existing outline badge **🔒 Unavailable** and reason line **In {deck}** [Confirmed vocabulary: `docs/oracle/specs/vocabulary.md` section 3.2, Unavailable = owned, every copy in another deck];
- gets a link "Open {deck}" (the existing "Move from {deck}" action is already in its menu, D-033);
- gets **one added quiet line** of history, only when Claude moved it: "Was in this deck. Claude moved this copy to {deck} on {date}, {time} (you approved it)." This is a note on an existing state, not a new slot or badge. If the Architect's contract shows `reassign_to_deck` does not leave the source slot planned (brief marks this [Approximate]), the contract must fix that; the design does not change.
Compared with a normal placed card: filled quiet "✓ Original" badge under **In deck**. Compared with a normal planned card: outline "○ Available" (a free copy exists). A planned card that is Unavailable for another reason looks identical but has no history line.
Deck counts: list size unchanged; In deck count drops by one.

Data needed (Architect to confirm, not provided by an existing contract): a way to know a slot lost its copy to a Claude-approved move (log row id, time) and the destination deck name.

## 9. Data binding (needs contract; nothing exists yet)
| Element | Field needed | Source |
|---|---|---|
| Connector active / last used / client | connector status, last-used time, client name | new, Architect |
| Change rows | `ai_change_log`: action, deck, card, copy, summary text, created_at, undone_at, group id, client | audit section 2 (proposed) |
| Undo refused reason | reason string from undo function | audit section 2 |
| Pending items | pending change: kind, decks, before/after In deck counts, deck status before/after, card list, expires_at | audit section 7 |
| Deck status before/after | existing readiness calculation | `computeDeckReadiness` per audit |
| Moved-card history line | change-log row for that slot | as above |
Plain-words sentences are generated server-side (one place) so the app and Claude say the same thing.

## 10. Accessibility
- D-012: every state is colour + icon/label: ● Active / ○ Off / ! Needs reconnecting; ⏸ waiting; ✓ Undone; ✕ Declined; ⌛ Expired; 🔒 Unavailable. Icons are decorative (`aria-hidden`) beside text. In the build use the existing icon set, not emoji.
- D-013: amber (existing warning hue) for waiting, red for errors, green accent for active; none are WUBRG.
- Contrast: all new pairs use existing tokens: text #E8E8EA on #1A1A1E ≈ 14:1; secondary #9C9CA3 on #1A1A1E ≈ 6.2:1; button text on #E8E8EA fill (#111) ≈ 15:1. Tints (15%) sit behind primary text only, never coloured text. [Approximate: ratios calculated by hand, not by tool; Tester to verify.]
- Targets ≥ 44px. Focus ring 2px white, visible on all controls. Switch: `role="switch"` + `aria-checked`, name "Let Claude use Oracle". Disabled Undo uses `aria-disabled` and keeps the reason in a `aria-describedby` text. Scrollable card list is focusable with a label. Reduced motion removes shimmer and switch animation. Live regions for undo/approve results. Skeleton `aria-busy`.
- Phone: all content reflows at 360px; no horizontal scrolling except the tab strip.

## 11. Open questions for the owner
See the report (three questions). Decisions I made that need confirmation: pending requests expire after 24 h; switching off cancels waiting requests; undone rows stay visible; switch off has no confirm step; "Undone" for an added-collection copy (question 1).

## 12. Deleted or replaced when this ships
Nothing visible is replaced. The 24-hour limit on `chat_card_proposals` Undo does not apply to this list (separate log, audit section 2).


## CC-13 update (2026-11-17)
Up to 120 cards in one request go straight through (121 to 200 wait for the owner; over 200 refused); 500 changes an hour; moves between decks go straight through with 7-day Undo that only the owner can use. A whole deck build is one request, so it has one Undo, and the toast after a multi-card Undo reads "Undone. {n} changes reversed." Setup guide and the can/can't lists say the same.

## CC-18a update (2026-11-17)
Claude can make a read-only buying list of what the decks are missing, with Scryfall price estimates (not shop prices; no Card Kingdom). The Claude can list says so; the Claude can't list says it cannot buy cards or keep a wishlist yet (the wishlist, CC-18b, needs its own screen first). Contract: `contracts/claude-connector-cc18-buying-list.md`.
