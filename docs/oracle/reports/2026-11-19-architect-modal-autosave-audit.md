# Report: modal-autosave-audit
Role: Architect
Status: DONE
Task as received: "I also want autosave for all modals rather than save buttons" (owner, 2026-11-19). Read-only inventory of every modal, dialog, sheet and popover with a confirm button, a classification, autosave rules, a structure recommendation, owner questions and a slice order.

## Summary for the owner

Only one window in the app is a real "type, then press Save" form today: the new Strategy window (bracket, one-line summary, Strategy text, playgroup). The card window (Category and roles) already saves at once, and the storage-location rename on the Storage page is a row on the page, not a window. Everything else with a confirm button creates something, moves cards, deletes, or runs many actions, so it should keep its button. For example: "Create deck", "Delete deck?" and "Apply All (12)" stay as buttons, because pressing them is the decision.

Recommendation: make the Strategy window save by itself, with a small "Saved" note and a "Couldn't save, Try again" note, and make it the pattern for any later edit-in-place window. The one real risk is Claude: it can add a paragraph to your Strategy while the window is open, so autosave must never overwrite what Claude just wrote.

## 1. Answer first

1. Class A (safe to autosave): the Strategy window. The card window (Category, roles) and the card-row category popover are class A and already save at once. The storage-location rename and colour edit is class A but is a row on the Storage page, not a window. No category manager window exists to convert.
2. Class C (mixed): "Edit card instance" (printing, finish, language).
3. Class B (keep an explicit button): all other windows listed in section 3.
4. One shared autosave hook is the right structure. It would be used by exactly one window at first, plus the Storage rename. The card window already has its own working pattern that the hook should copy (Saving, Saved plus Undo, Couldn't save plus Try again).
5. The live-refresh job (docs for it do not exist yet: the task folder `.agents/tasks/oracle_app-live-refresh-2026-11-19` is empty [Confirmed: directory listing]) must change its protection rule from "do not refresh while the window has unsaved edits" to "do not refresh a field the owner is typing in or a save in flight". See section 5.

## 2. Evidence: how things work today

- Strategy window: [Confirmed: src/components/deck-strategy/StrategyWindow.tsx] Keeps a local draft copy of four fields. Save and Cancel buttons. Closing with edits shows "Discard your changes?" (Keep editing / Discard). Click outside does nothing. Save is off while loading or offline. After a successful save it closes.
- Its save: [Confirmed: src/components/deck-strategy/StrategyBlock.tsx `save`, src/app/api/decks/[id]/strategy-window/route.ts PUT, src/lib/deck-strategy-window-server.ts `saveStrategyWindow`] One request, one write to one row. It cannot fail halfway. The window sends all four fields every time. The server already accepts any subset of fields and touches only the ones sent [Confirmed: src/lib/deck-strategy-window.ts `validateWindowInput`]. Before the stored-data update the summary is dropped and reported back as "not saved" (the app already shows an amber note).
- Reversibility of Strategy saves: no Undo, and owner saves are not written to History [Approximate: no history write found in `saveStrategyWindow`; the footer says "Not saved yet. Nothing in History" and "Last changed by you · date"]. Claude's changes do appear in History with a reason and Undo [Confirmed: src/components/VersionHistoryPanel.tsx comment at line ~178].
- Claude and the same data: [Confirmed: src/lib/connector/tools/edit-tools.ts] Claude can set commander, summary, playgroup and bracket, and can only add a dated paragraph to the end of the Strategy text ("never replaces or edits the owner's text"). It reads the existing text first, then writes. Overlap rule today: none. If the owner opens the window, Claude appends a paragraph, then the owner saves, the owner's older copy of the Strategy text overwrites Claude's paragraph. This already exists with Save, and autosave would make it more likely because the window stays open longer.
- Refresh today: [Confirmed: src/hooks/useRefreshOnTabReturn.ts, src/components/providers.tsx] The only refresh is "when you return to the tab", skipped while a save is running. It does not reset an open window.
- Strategy window and refresh: [Confirmed: StrategyWindow.tsx] The draft is copied from saved data once, when the window opens (or when loading finishes). Later refreshes do not touch the draft, but "unsaved edits" is computed as "draft differs from the latest saved data". So after a live refresh brings in a change by Claude, the window would wrongly think the owner has unsaved edits. With autosave this comparison goes away.
- Card window: [Confirmed: src/components/CardWindow.tsx `CardWindow.commit`, `RolesSection.save`] Category saves on change: "Saving…", then "Saved" with Undo for 10 seconds, or "Couldn't save the category. Nothing was changed." with Try again. Roles save at once, show at once, and go back with a message if the save fails. The "Edit / Done" button only opens or closes the picker; it does not save.

## 3. Inventory

Each row: window, how the owner opens it, what it edits, closed without saving, how it saves, reversible, Claude overlap, class.

### Class A: edit in place

| Window | Opened by | Edits | Closed without saving | Saves how | Reversible | Claude overlap | Class |
|---|---|---|---|---|---|---|---|
| Strategy window | Deck page, side rail, click the Strategy block [Confirmed: StrategyBlock.tsx] | Bracket, one-line summary (max 120), Strategy text, playgroup | Asks "Discard your changes?" | One request, one row, all-or-nothing | No Undo; not in History [Approximate] | Yes: Claude sets bracket, summary, playgroup, appends to Strategy | A |
| Card window: Category | Cards tab, click a card (or the card's menu, "Details") [Confirmed: CardWindow.tsx] | The card's category in this deck | Nothing to lose; already saved | One request per change, already autosaves | Undo for 10 s | Claude can change categories | A, already done |
| Card window: Roles | Same window | Card roles (owner add/remove) | Already saved | One request per click, optimistic | Reverts on failure; remove again to undo [Approximate] | Claude can assign roles | A, already done |
| Card row category popover (tag icon on hover) | Cards tab, hover a card row, click the tag icon [Confirmed: CardGroupSection.tsx ~430] | Primary and extra categories | Nothing to lose | Saves and closes on pick | Re-pick | Claude can change | A, already done |
| Brew canvas "Edit Categories" | Brew canvas card, pencil icon [Confirmed: CanvasDeckCard.tsx ~149] | Categories of a brew card | Nothing to lose | Saves and closes on pick | Re-pick | Not applicable (brew session) | A, already done |
| Storage location rename and colour | Storage page, location list, Edit on a row [Confirmed: src/components/settings/storage-locations-settings.tsx] | Name and colour | Cancel throws away the edit | One request per location | Edit again | No | A, but it is a page row, not a window. Out of the modal scope; same hook would fit later |

Not a window, nothing to convert: the category manager in the Strategy tab shows Edit and Delete icons with no action wired to them [Confirmed: src/components/StrategyTab.tsx ~530]. Settings has no forms: it has Clear All Data (confirmation) and links [Confirmed: src/app/settings/page.tsx].

### Class C: mixed

| Window | Opened by | Edits | Closed without saving | Saves how | Reversible | Claude | Class |
|---|---|---|---|---|---|---|---|
| Edit card instance | Cards tab, card row menu, "Edit card instance" [Confirmed: CardGroupSection.tsx ~490, ~642] | Printing, finish, language of the copy in this deck | Silently discarded | One request, one change set | Not by Undo [Approximate] | Possible | C. Finish and language are in-place edits. Changing the printing may swap which copy fills the slot, which is a commit. Recommend keeping Save for now; revisit after the Strategy window proves the pattern |

### Class B: keep an explicit button

| Window | Opened by | Why it stays |
|---|---|---|
| New deck (Create Deck) [NewDeckModal.tsx] | Decks screen, New deck | Creates a deck |
| New Folder (Create Folder) [CreateFolderModal.tsx] | Decks screen, New folder | Creates a folder |
| Import deck, import collection, import review [DeckImportButton.tsx, ManaBoxCollectionImportDialog.tsx, ManaBoxDeckImportFlow.tsx] | Decks / Collection, Import | Commits many rows; has review steps and a discard guard |
| Delete deck confirmations [DeckTile.tsx, DeleteDeckButton.tsx] | Deck tile menu, or deck page "..." menu | Irreversible |
| Remove card / Remove cards [CardGroupSection.tsx ~509, CardsTab.tsx ~2043] | Card row menu, or select cards then Remove | Destructive (cards: "cannot be undone") |
| Auto-Categorize, Apply All [CardsTab.tsx ~1705] | Cards tab toolbar | Many requests; can stop halfway. Single-suggestion clicks apply at once |
| Category Suggestions, Apply [CardGroupSection.tsx ~1695] | Card row menu | Accepting a suggestion |
| Move to Category (bulk) [CardsTab.tsx ~1998] | Select cards, Move | Bulk move |
| Add Proxy Copies (bulk) [CardsTab.tsx ~2071] | Select cards, Add proxies | Creates proxy copies |
| Where does this copy go? Confirm [LocationPickerModal.tsx] | When a copy is freed (remove, unassign, replace) | Commits where a physical copy goes; the code forces an explicit choice |
| Status chip popover actions: Sleeve, Assign, Add proxy, Replace with original, plus the "Continue" confirm when sleeving from another deck [StatusChipPopover.tsx] | Card row, status chip | Moves or creates copies |
| Restore Version, Save a version [VersionHistoryPanel.tsx] | Deck "..." menu, History | Replaces the whole deck / creates a snapshot |
| Replace current skeleton [BrewCanvas.tsx ~210] | Brew canvas, pick a different commander | Replaces cards, "cannot be undone" |
| Clear All Data [settings/page.tsx] | Settings, Developer Tools | Wipes everything |
| Delete copy inline confirm [InstanceDetailPanel.tsx ~837] | Collection, card detail panel | Deletes a copy |
| Approve / Decline requests [connector/PendingCard.tsx] | Settings, Claude connector (a page, not a window) | Approving applies Claude's big change |
| Dead-weight Dismiss popover [CardGrid.tsx ~100] | Card grid badge | One-off action, not a form |

Already instant, no Save button (leave alone): Generic art picker (click a printing) [GenericArtPicker.tsx], commander and command-zone pickers [CommandZoneSlots.tsx, CommanderPicker.tsx, ReviewCommanderSelect.tsx], deck picker [DeckPickerPopover.tsx]. Read-only, nothing to save: Deck health panel [DeckHealthPanel.tsx], card search overlays, mobile menus.

Not checked in depth: Picklist and import row editors are screens and sub-controls inside the import flow, not separate windows with a Save button [Approximate].

## 4. Autosave rules for class A

1. When it saves. Text fields (summary, Strategy, playgroup): save about 1.5 seconds after the owner stops typing, and also at once when the field loses focus or the window closes. Pick-from-a-list controls (bracket, Clear target): save at once on click. Why: typing is many small changes, so one save per pause avoids dozens of requests; leaving a field alone would lose text if the owner closes the window or the laptop sleeps first. Example: you type a Strategy paragraph and pause; 1.5 seconds later "Saved". You click bracket 3: "Saved" straight away.
2. What the owner sees. One small status line at the bottom of the window (where the Save button was): "Saving…", then "Saved" (with the time it was last changed). Same wording and place as the card window, so it reads the same everywhere. A "Saved" note is announced to screen readers.
3. A failed save. The status line turns red: "Couldn't save the summary. Your text is still here. Try again" with a button. The app also retries by itself once, after 5 seconds, and again whenever the owner edits the field. The text is never cleared on failure. Offline: the line says "Offline. Will save when you're back" and saves when the connection returns.
4. Close and Escape. Just close. Everything is already saved, so the "Discard your changes?" bar is removed. The one exception: if a save is running or has failed, Close first waits briefly, then if it still fails asks "This didn't save. Keep editing / Close anyway". Cancel and Save buttons are removed; one Close button stays.
5. Fields with limits. The summary stops at 120 characters while typing, with the existing counter. Invalid values are never sent: a field that fails a rule (for example bracket 5 before the stored-data update) shows its own message and keeps the last saved value in the saved copy, while the typed text stays on screen. An empty field is valid and saves as empty.
6. Undo or Revert. No Revert button. Instead, offer the card window's pattern: after a save, an "Undo" link for 10 seconds that puts back the previous value of that one field. Reason: with no Cancel button, a slip (deleting a paragraph) needs a way back. Longer-term safety comes from History, but owner Strategy saves are not in History today [Approximate]; the owner should decide on that (question 2).
7. Two saves overlapping. Saves for the same window go one at a time, in order; only the newest text is sent if several pile up. A save that returns after a newer one is ignored. Example: you type, pause, type again while the first save is still running: the app waits, then saves once more with everything.
8. Send only what changed. Each save sends only the fields the owner touched (the server already supports this). This is what stops the owner's window from overwriting Claude's bracket or playgroup change.
9. Claude changes data while the window is open. Fields the owner has not touched since they opened it update on screen when Claude changes them, with a small "Updated by Claude" note. A field the owner is in the middle of editing is not replaced. The Strategy text is the special case: Claude only appends a paragraph. If Claude appended while the owner has a pending edit, the next save must not drop it. Recommendation: before saving the Strategy text, the server compares against what the owner started from; if it changed, it keeps Claude's new paragraph and adds the owner's edit, and tells the window to show the combined text.

## 5. Autosave and the live-refresh job

Today the live-refresh plan (not in the repo yet) protects "unsaved edits in open windows". With autosave there are almost never unsaved edits, so the rule becomes:

- Refresh may run any time. It never closes, resets or reloads an open window.
- It never replaces the text of a field that is focused or has a pending or running save. That field keeps the owner's text; the save then runs on top.
- It does replace every other field, and the Strategy block behind the window.
- The window must stop computing "has unsaved edits" by comparing the typed copy to refreshed data [Confirmed: StrategyWindow.tsx `dirty`]. With autosave "dirty" means only "a save is pending or failed".
- While a save is running the existing rule stays: tab-return refresh is skipped during a running save [Confirmed: useRefreshOnTabReturn.ts]. The live refresh should apply the same rule so a refresh cannot bring back an older value that has just been replaced.

## 6. Shared mechanism: yes, one hook

One shared hook, not copies in each window. It owns: the draft, the pause timer, one save at a time, the "Saving / Saved / Couldn't save / Offline" state, the 10-second Undo, and the "do not overwrite a field the owner is in" rule for incoming refreshes. A small status-line component sits beside it so all windows look the same.

Where: `src/hooks/useAutosave.ts` (hook) and `src/components/SaveStatus.tsx` (status line), next to the existing hooks and the card window. The Strategy window passes it a save function (the existing request in StrategyBlock) and the field list. The card window's existing code is the model and can move onto the hook later; do not rewrite it as part of this.

Honest sizing: with only one window to convert, the hook's value is the rules above being written once and tested once (timer, ordering, retry, refresh interaction). Do not build a generic form system.

## 7. Questions for the owner (behaviour, recommendation first)

1. When should typed text save? Recommended: after a short pause (about 1.5 seconds) and when you leave the field or close the window. Alternative: only when you leave the field (fewer saves, but text typed just before closing relies on the close-save). Example: you type a Strategy paragraph and switch to the card list without clicking anywhere: with the recommended rule it is already saved.
2. Should your Strategy edits appear in History, and should there be an Undo? Recommended: a 10-second "Undo" link in the window after each save, and a History entry for owner changes the same way Claude's show (one entry per burst of typing, not per keystroke). Alternative: Undo link only, no History entry. Trade-off: History entries show you what changed over time; without them you can only step back for 10 seconds.
3. If Claude adds to your Strategy while the window is open, what should you see? Recommended: both are kept, and a note appears: "Claude added a paragraph. It was kept." Alternative: your window shows a "Claude changed this, reload?" bar and pauses saving until you choose. Trade-off: the recommended way never stops you typing; the alternative makes the choice explicit but interrupts you.

## 8. Slice order and size (per docs/oracle/process.md: a slice is one screen or one behaviour; the owner sees each before the next)

Prerequisite: the live-refresh slice defines how refreshes reach open windows. Slice 1 below can be built first with the rule in section 5, but the "update untouched fields" behaviour (rule 9) waits for live-refresh to land. Nothing here needs a database change.

1. Slice A (size M): `useAutosave` hook and `SaveStatus` line, built and tested alone: pause timer, one save at a time, retry, offline, Undo. No screen changes.
2. Slice B (size M): Strategy window moves onto the hook. Remove Save, Cancel, the "Discard your changes?" bar and the dirty comparison; send only changed fields; 120-character and bracket-5 messages kept. Tests: existing StrategyWindow.test.tsx (275 lines) is rewritten for the new behaviour.
3. Slice C (size S to M): the Claude overlap. Server keeps Claude's appended paragraph when the owner's save started from older text; window shows "Claude added a paragraph". Needs question 3 answered. Depends on live-refresh.
4. Slice D (size S, optional): storage-location rename and colour autosave on the Storage page. Waits until the owner asks.
5. Not planned: Edit card instance (class C) and every class B window. Revisit Edit card instance only if the owner asks after Slice B.

## 9. Assumptions

- "All modals" means every window with a confirm button. I read the request as "edit-in-place windows should not need Save", not "Create deck should create itself".
- The live-refresh job has no files yet; section 5 describes the rule it should adopt, not code that exists.
- History not recording owner Strategy saves is [Approximate]; I found no history write in the save code but did not search the database.

## Changed files
- .agents/tasks/modal-autosave-audit/report.md — this report
- docs/oracle/reports/2026-11-19-architect-modal-autosave-audit.md — copy of this report

## New decisions made (need owner confirmation)
- Class A is the Strategy window only (plus windows that already autosave). Class B windows keep their buttons. See questions in section 7.

## Challenges to locked decisions
- none

## Open questions
- The three in section 7.

## Verification
- Read-only: no code, database or server changes. Claims are tagged with source files above.
