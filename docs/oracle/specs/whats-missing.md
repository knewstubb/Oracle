# Spec: What's missing view (Phase 2 of the daily-use deck advisor)

Role: Designer · Gate 3 · Status: **Draft for owner review** · 2026-11-11
Mockup: `docs/oracle/mockups/whats-missing.html` (scenario and device switches at the top; laptop and phone layouts use the same page).
Inputs: brief `docs/oracle/briefs/daily-use-deck-advisor.md` (sections 3, 4 S1/S2, 5, 9, 17, 18), audit `docs/oracle/reports/2026-11-11-architect-daily-use-audit.md` (areas 3, 4, 9, 15a), `docs/oracle/specs/vocabulary.md`.
Scope: Phase 2 only. Goal sentence, deck-specific tags, fit bands, move checklist and proxy ranking are out of scope.

## 1. The problem
The deck page's health strip shows nine role pills against fixed global targets. On Brad's real data every one is red, because role counts are read from card types, not roles, so the strip says nothing true. It also never says where to look next. Brad wants to open a deck and quickly know what it is missing, whether he owns a fix, and what a buy would cost, without reading a table.

## 2. Principle
- **Progressive disclosure:** a one-line verdict in the strip, then counts, then cards, each one tap deeper.
- **Visibility of system status and honesty about data (Nielsen 1, 9):** every target says where its number comes from. Thin data is stated, never papered over.
- **Quiet default, loud exception (D-014):** an on-track role is quiet text with a tick. Only a light role gets amber.
- **Object-action mapping:** a gap is the thing you tap; the answer (cards that fill it) is what opens.

## 3. What changes on the deck page
Built on the existing `HealthStrip` and `HealthPill`; no new page, tab or navigation.

1. **Strip.** A **verdict chip** is added at its left, then the role pills, then a "What's missing" text button at the right. Pills show `Role have/typical` (for example `Removal 3/8`). Pills are limited to the four generic role tags: **Ramp, Draw, Removal, Wipes** (brief section 17, answer 2). Interaction, Finisher, Recursion, Tutor and Protection pills are hidden until a strategy exists (Phase 4).
2. **Panel.** Clicking the verdict chip, "What's missing" or a pill opens the panel. Laptop: a right-hand drawer, 420px, over the deck. Phone and any frame narrower than 700px: a bottom sheet at 86% height. The deck stays visible behind it and is not rearranged.
3. **Old pill behaviour is kept as a link.** The old "jump to the Cards tab and scroll to this role" now lives inside a gap as "See the 3 removal cards already in this deck".
4. **Chat.** The Chat tab answers the same question with the same words and numbers; each gap in the answer is a button that opens the same panel (section 6).

## 4. Component inventory
| Component | Props | Builds on |
|---|---|---|
| `HealthStrip` (changed) | `deckId`, `onPillClick` becomes `onOpenGap(roleId \| null)` | existing |
| `VerdictChip` (new, small) | `verdict: {light, head, moreCount}`, `onClick` | `Button` |
| `HealthPill` (changed) | adds `typical`, `isGeneralGuide`; shows `have/typical` | existing |
| `MissingPanel` (new) | `deckId`, `gapId?`, `onClose` | `Sheet` (side=right on laptop, side=bottom on phone) |
| `RoleRow` | role, have, typical, source, status | `Button` (light) or plain `div` (on track) |
| `GapCardRow` | card, group `spare \| other \| buy`, deck?, price? | existing `SlotBadge` from the vocabulary spec |
| `BuyIdeas` | cards, `defaultOpen` | `Collapsible` |
| Chat answer block | verdict, light roles as buttons | existing `DeckChatTab` message |

## 5. Wording
Vocabulary (`docs/oracle/specs/vocabulary.md`): **Available** (spare), **Unavailable · In [deck]** (other deck), **Unowned** (buy), **est.** price prefix, **Price unknown**, **Checking…**, **Couldn't check**. New words proposed (see report): **Spare**, **Light**, **On track**, **General guide**, **Buy ideas**.

### 5.1 Verdict
Rule: take the roles that are light (section 5.2), order by how many cards short, name up to two.
- None light: **Well covered**. Sub-line: "Every role is at or near what decks like this usually run. Nothing to fix."
- One or two: **Light on removal** / **Light on draw and removal**.
- More than two: the chip adds "+1 more". The panel lists all of them.
- Sub-line: "Draw is 4 short. Removal is 5 short. Wipes are 2 short. Ramp is on track."
- With a general guide: head ends "(general guide)".

### 5.2 Light or on track (default, see report question 1)
A role is **Light** when you have 2 or more fewer than the typical number. Within 1 short, or above, is **On track**. Being over is never a problem and gets no colour. There is no red state: "light" is advice, not an error, so the all-red result goes away.

### 5.3 Reason line (every role, every place)
- Commander data: "Decks built around Atraxa usually run about 8; you have 3. Based on 186 EDHREC cards."
- Strip line under the verdict: "Compared with decks built around Atraxa · based on 186 EDHREC cards".
- General guide: "General guide: most decks run about 6 removal. You have 2. Not specific to Ghyrson Starn." The label **General guide** also appears as a small tag next to the section and the verdict.
- The number "about N" is always followed by its source. If no source exists, no number is shown (section 8).

### 5.4 Gap detail (tap a light role)
Title: role name. Header block: "Removal: 3 of about 8" plus the reason line. Then, in order:
1. **Spare (3)**: "Owned originals that are free right now." Badge **Available**.
2. **In another deck (1)**: "You own these, but each is in a different deck." Badge **Unavailable · In Wilhelt**, plus the line "Using it here leaves Wilhelt one short. Nothing moves until you decide."
3. **Buy ideas (3) · prices are estimates**: badge **Unowned**, "In 58% of Atraxa decks on EDHREC", price "est. $4.50" with "Scryfall estimate", or "Price unknown". Footer: "Estimates come from Scryfall and can be out of date. Cards come from what decks for this commander run most."

Open/closed: Buy ideas are **collapsed** when any owned card is listed and **open** when none is.
Nothing owned fits: a callout "**You don't own any card that adds draw and fits this deck.** Proxies and cards outside Atraxa's colours are not counted." appears above the buy ideas.
Every suggestion respects the commander's colour identity. Proxies and planned slots are not counted as owned (as `check_owned_copies` already does).
No add, move or buy button: Phase 2 is suggest-only (D-007, D-034). Tapping a card name uses the existing card preview.

### 5.5 Thin data
Trigger: fewer classifiable EDHREC cards than a threshold set by the Architect (mockup uses 9 as thin).
- Panel verdict sub-line source: "No role data for Ghyrson Starn yet (only 9 EDHREC cards could be read). Showing type counts and a general guide."
- Role targets use the generic target tagged **General guide**.
- A **Card types** block lists "You have 36 · builds average 36" for lands, creatures and so on, with "Type averages are from 4 stored builds for Ghyrson Starn." If there are no stored builds, the block is replaced by "No stored builds for Ghyrson Starn yet."
- Owned fillers still show (they need no popularity data).
- Buy ideas are replaced by "**No buy ideas yet.** We have no popularity data for Ghyrson Starn, so we can't say which cards decks like this run. Nothing is guessed." (see report question 3).

### 5.6 Healthy deck
Chip: tick + "Well covered", neutral. Pills: tick, grey text, no fill. The panel shows the verdict and rows, all plain (not clickable), with no cards listed.

## 6. Chat
- Question chips or typed text such as "What is my deck missing?" produce the same verdict, numbers and source line.
- Each light role is a full-width button: "Removal: 3 of about 8 · 3 spare" or "· 1 in another deck" or "· none owned". It opens the panel on that gap.
- Closing line: "I only suggest. Nothing in your deck changes. Prices are estimates."
- In thin-data decks the chat says: "I don't have role data for [commander] yet, so I'm using a general guide, not a number for this commander."
- The panel's footer button "Ask the chat about this" switches to the Chat tab and sends the question.
- Wording and numbers must come from one shared source so the strip, panel and chat never disagree.

## 7. States
| State | Behaviour |
|---|---|
| Loading | Strip shows four grey skeleton pills; screen readers hear "Checking what this deck is missing…" Never shows ticks or zeroes. |
| Couldn't check | Strip: error icon + "Couldn't check what this deck is missing." + **Try again**. Panel: same words + "Your cards haven't changed." Never a pass, never 0. |
| Healthy | section 5.6 |
| Light role | amber, warning icon, word "Light" |
| On track | tick, word "On track" |
| Thin data | section 5.5 |
| Gap with spare / other / nothing owned / buy | section 5.4 |
| Unknown price | "Price unknown" (never $0) |
| Out of date | "Last checked 10:42" with **Refresh** (shared vocabulary pattern) |
| Hover / focus / active | rows and pills lift to the surface-hover colour; 2px white focus ring; pressed state same as hover |
| Disabled | none; nothing in this view is disabled |

## 8. What must never happen (checked against the brief)
- A card suggested as if owned: only Available, Unavailable and Unowned badges; each group is named.
- An unknown price as 0 or as a fact: "Price unknown", and "est." plus "Scryfall estimate" on every price.
- Moving a card from another deck without saying: every other-deck card carries the warning.
- An invented number: a number appears only with its source (N EDHREC cards, N stored builds) or the **General guide** label.
- Pushing him to the popular template without saying: buy ideas say they come from what decks for this commander run most.

## 9. Interactions
Pointer: tap or click chip, pill, "What's missing" or a light row to open; Back returns to the overview; X or tapping the dimmed deck closes. Phone: swipe down on the grab handle closes (optional; X and Back always work).
Keyboard: Tab through strip (chip, pills, link), Enter or Space opens. Focus moves to the panel heading. Tab stays within the panel while it is open (it is a dialog); Esc closes and returns focus to what opened it. Back is a button first in tab order. Buy ideas toggles with Enter or Space.
Drag: none.

## 10. Data binding
| Element | Source |
|---|---|
| Role counts `have` | classifier fed card text (replaces the `oracleText: null` shortcut) [Confirmed: `src/app/api/decks/[id]/health/route.ts`, `src/lib/category-classifier.ts`] |
| Typical numbers, N | classified EDHREC top cards per commander, cached (audit 15a, brief section 17 answer 1). **No contract exists yet:** needs `role target {role, typical, sourceCardCount, sourceLabel}` per commander |
| Type counts, build count | `ref_commander_builds` [Confirmed: audit 15a] |
| Generic target | `DEFAULT_THRESHOLDS` [Confirmed: `src/lib/health-engine.ts`] as fallback only |
| Spare / another deck / unowned | `check_owned_copies`, `browse_spare_copies` [Confirmed: `src/lib/owned-copy-lookup.ts`, `src/lib/spare-copy-browse.ts`] |
| Prices | `ref_printings` USD via `src/lib/price-store.ts`; null means "Price unknown" |
| Buy-idea popularity % | EDHREC top cards (`getCommanderTopCards`) |
| Role of each owned/buy card | the same classifier, so the number on the pill and the cards listed agree |
**Blocked for build until the Architect provides:** (a) the role-target contract above and the "thin" threshold, (b) a per-card role result for candidate cards, (c) a colour-identity filter on spare and buy lists.

## 11. Accessibility
- Contrast on the real tokens: text `#E8E8EA` on surface `#1A1A1E` is 14.2:1; secondary text `#9C9CA3` is 6.4:1; amber `#EF9F27` is 8.0:1 on surface and 8.5:1 on canvas; magenta `#F0339E` is 4.7:1 on surface but 4.3:1 on hover, so it is used for the Unowned icon and border only (3:1 needed), and the word is in primary text. `--text-tertiary` (3.4:1) is not used for any text.
- D-012: every status is colour plus icon plus word: Light (amber, triangle, "Light"), On track (tick, "On track"), Available (ring), Unavailable (lock, "In Wilhelt"), Unowned (minus-circle, "Unowned").
- D-013: no new hue. Amber is the existing warning. Red is used only for "Couldn't check" icons, not for gaps.
- Pills: accessible name is a sentence ("Removal 3 of 8, light, 5 short"). Meter bars are `aria-hidden` because the text carries the same facts.
- Panel: `role="dialog"` with label, focus placed on the heading, focus returned on close. Strip loading uses `role="status"`; failure `role="alert"`.
- Touch: all controls 44px high on phone. Strip pills scroll sideways rather than shrinking.
- Reduced motion: the skeleton shimmer stops.

## 12. Phone and laptop
One layout rule: below 700px of width the strip becomes the verdict chip on top, pills in one scrolling row below, and the panel is a bottom sheet; above it the strip is a single row and the panel is a right drawer. No content differs between sizes, only arrangement. On phone the chip is the main target.

## 13. Deleted or replaced when this ships
- The five non-generic pill categories in the strip (until Phase 4).
- The pill-click jump becomes a link inside the gap (section 3).
- `oracleText: null` in the health route and the red/amber/red status mapping for roles.

## 14. Open questions
See the report: three, each with an example.
