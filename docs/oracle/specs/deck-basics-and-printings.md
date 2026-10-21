# Basic lands, printing picker and generic sleeving — spec (rev 3)

Mockup: `docs/oracle/mockups/deck-basics-and-printings.html`. Also updates `import-review-controls.md` (toggle removed). Supersedes the "Generic basics" toggle in `manabox-import.md` (options line, §tooltips, focus order) and the merged basics line.

## 1. The problem
Basic lands were handled by a single "Generic basics" toggle that merged every Island into one count. The owner's model is different: generic basics are a permanent, unlimited version of each basic type; specific lands are real collection cards; a deck can mix both. The review screen and deck page need to show and edit that without confusion.

## 2. Principle
- **Recognition over recall:** "Generic" is a visible marker on the line itself, never a hidden setting.
- **One line, one thing:** each printing, and generic, is its own line. Never merged across printings.
- **Quiet default, loud exception (D-014):** generic lines look like normal rows plus one small tag.
- **Reuse (consistency):** one printing picker for every card on the review screen.

## 3. Component inventory
| Component | Props | Built on |
|---|---|---|
| `GenericTag` | none | `Badge` outline, text "Generic" |
| `BasicRowOpen` | row, kind (generic / specific) | existing row-open pattern |
| `PrintingPicker` | cardName, current, allowGeneric, onPick | Popover + Command list |
| `PrintingOption` | printing, finishes, selected | `CommandItem`, small finish chips |

## 4. Rules
- **Review list:** "Island ×6 Generic", "Island ZNR 267 ×2", "Island M21 262 ×1" are three rows. Generic rows show default art and the **Generic** tag, no set/number. Specific rows show set and number like any card. The Basics chip lists all of them; Sort and Find treat them as normal rows.
- **Generic row, collapsed:** "Island ×6 · Generic" plus an amber "◇ Unsleeved" tag only when the whole line is unsleeved (quiet when sleeved, D-014; colour plus icon plus text, D-012). A plain "11 Plains" in a file starts **Sleeved**.
- **Generic row, open:** Art (image only; default is a printing from your collection, chosen once and stored; "Choose art"), Finish, Language, **Sleeves**: a two-way Sleeved / Unsleeved control for the whole line (no partial counts). No Original/Proxy, no Condition. Finish, language and art apply to the whole line.
- **Sleeved state:** all or nothing per generic line. A generic imported as Unsleeved stays Unsleeved until set to Sleeved. Sleeving uses any real-world basic, so no collection copy is used and it is always possible. A sleeved generic line counts towards the deck being fully sleeved/playable; an unsleeved one makes it short ("Short: Island generics unsleeved"). Review bulk bar: "Set sleeving" on ticked rows.
- **Choosing art on a generic line:** image only. **You don't need to own the printing** and the line stays generic. Any printing can be picked.
- **Specific row, open:** a normal editable row (per-copy lines as in `import-row-editing.md`) plus a "Printing · ZNR 267 · Change printing" line (here the printing is a real card).
- **Printing picker:** title "Choose printing · {card}"; search "Search set or number"; "Default art (generic)" at top for basic lands only; then printings newest first, each with set name, number, year and finish chips (Non-foil, Foil, Etched). A finish the printing doesn't have is struck through and greyed. Choosing a printing that lacks the row's current finish switches the finish and shows the ↻ marker with tooltip (`import-review-controls.md` §14). Footer: "Showing 3 of 41 printings. Scroll or search for more."
- **Existing decks:** no special handling.
- **Removed:** the Generic basics toggle on the review screen, in the "Importing as" bar and elsewhere.
- **Deck page generic line:** count − / +, a Sleeved / Unsleeved control for the whole line, Remove, and "Add generic basic" (Plains, Island, Swamp, Mountain, Forest, Wastes). Deck status shows "Short: Island generics unsleeved" while unsleeved.
- **No swap feature** (owner, rev 3). To trade a generic for a specific land, remove one line and raise the other count.

## 5. States
| State | What shows |
|---|---|
| Generic row, collapsed / open | tag + default art / printing, finish, (language) |
| Specific row | as any card |
| Picker: browse / searching | list; filtered list |
| Picker: no match | "No printing matches “{text}”." |
| Picker: loading / failed | "Loading printings…" / "Couldn't load printings. Try again" |
| Printing lacks finish | finish chip struck through; row finish switches with ↻ |
| Generic: sleeved / unsleeved | no tag / amber "Unsleeved" tag |

## 6. Interactions and accessibility
Row click or caret opens as before. Picker: Tab to button, Enter opens, focus in search, arrows move, Enter picks, Escape closes and returns focus. Options are `role=option` with `aria-selected`; unavailable finishes read "Etched, not available". "Generic" is text, not colour (D-012). Contrast as earlier specs.

## 7. Data binding
- Printing lists and finish availability: Scryfall printings per card [Assumption, not checked in code]. Generic art needs the Architect.
- **Architect:** a generic line needs: count, finish, language, a sleeved flag for the whole line, and a stored art printing chosen once from the owner's collection. Sleeving a generic must not consume a collection copy. Deck "playable/short" must count generic sleeving [vocabulary.md: generic basics counted as sleeved; this changes].

## 8. Copy
"Generic" · "Default · from your collection" · "Choose art" · "Choose printing" · "Change printing" · "Search set or number" · "No printing matches “{text}”." · "Loading printings…" · "Couldn't load printings. Try again" · "Sleeved" · "Unsleeved" · "Short: {basic} generics unsleeved" · "Add generic basic" · "Remove".

## 9. Open questions
1. **Architect:** storage for generic line fields (§7) and how "random printing from your collection" is chosen when you own none.
2. Does "Unsleeved" on a generic mean "no real basic yet", and should the file's sleeved flag import as-is? Assumed yes.
3. `vocabulary.md` says generic basics count as sleeved: update to match (Scribe).
4. Is the "Short: Island generics unsleeved" wording right, or should it be one line for all basics?
5. Split the Basics chip into Generic / Specific? Not designed.
6. Old specs still mention the toggle: mark superseded (Scribe).
