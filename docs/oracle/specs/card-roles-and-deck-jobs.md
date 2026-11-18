# Spec: Card window, roles, deck jobs, deck rules and the Strategy tab (CC-26)

Role: Designer · Status: **DRAFT v2 for owner review. Nothing is built.** · 2026-11-18
Brief: `docs/oracle/briefs/card-roles-and-deck-jobs.md` (version 2, owner answers to Q1 to Q10 recorded). Audit: `docs/oracle/reports/2026-11-18-architect-card-roles-audit.md`.
Inputs: the owner's answers of 2026-11-18 (brief section 2), the new request "We also need somewhere to view the deck strategy. Let's update the strategy tab to accommodate this", `specs/vocabulary.md`, the allocation terminology rule, D-030 (honest loading and error states), D-034 and D-034a (every Claude change is recorded and undoable), CC-13 (Claude may change up to 120 cards per request, one-click undo per batch).
Mockup: `docs/oracle/mockups/card-roles-and-deck-jobs.html` (being updated in the next step to match this version).

What changed from version 1: the questions are answered; **Q6** (health now uses broad groups, section 10), **Q8** (Claude's proposals apply at once, section 7), and the **Strategy tab** is new (section 8). The card window (sections 4 to 6, 11) is unchanged apart from wording.

---

## 1. The problem, the principle, and what this covers

**The problem.** You and Claude cannot yet say what a card is for, in a way that is saved, shown and counted. Deck health guesses from card text and gets decks like Arti-facts wrong. The Strategy tab shows commander research and a collapsed settings box, but none of the deck's own plan: not which cards do what, not the rules that make this deck different, not what Claude has suggested, not why health says what it says.

**The principle.** One place per question (object-action mapping). A card's own details live in the card window. The deck's overall picture lives on the Strategy tab. Both show the same facts, the same words and the same "who decided" marks. Detail opens on demand (progressive disclosure): numbers first, reasons one click away. Every Claude change is visible, labelled and undoable (D-034).

**What this spec covers**
1. The **card window**: what opens when you click a card name in a deck, and every state it can be in.
2. **Editing** in place, and **Claude proposals** (applied at once, labelled, accept, change, dismiss, undo).
3. The **Strategy tab**: its sections, layouts for laptop and phone, states, flows and wording.
4. **Deck health in broad groups**, with the roll-up from universal roles and the reason behind every count.
5. Exact wording, and the three worked test decks.

Not covered: the stored data (Architect), build slices (brief section 9), and the brief's out-of-scope list (locked flag, role weights, copying rules between decks, bulk role pass, choosing another commander for comparison).

## 2. The idea in plain words

Every card carries up to three kinds of label. They are kept apart on purpose. Health groups are a fourth, broader layer built from them.

| Label | What it means | Same everywhere? | Example |
|---|---|---|---|
| **Universal role** (fine) | What the card is commonly known to do in any deck. | Yes. Same in every deck and every printing. | Sol Ring is Ramp. Lightning Bolt is Targeted removal. |
| **Category** | Your own grouping name for the card in one deck. Free text. | No. Per deck. | Sol Ring is filed under "Mana Rocks" in one deck and "Ramp" in another. A category called "Ramp" and the role Ramp can both be on one card. They do not affect each other. |
| **Deck job** and **Why it is here** | What the card does for this deck's plan, in one sentence. | No. Per deck. | Rhystic Study: Engine. "Draws a card whenever opponents cast spells." |
| **Health group** (broad) | The common deckbuilding group a card's roles add up to when health is counted. | Same rule everywhere; the counts are per deck. | Targeted removal and Board wipe both add to **Interaction**. |

A **deck rule** is a sentence on the deck that changes how several cards are read ("every artifact counts as a mana source"). It is not on a card. The card window shows the rules that apply to the card, and the Strategy tab lists all of them.

**Roll-up:** universal roles (fine) feed health groups (broad); this deck's jobs and rules then adjust the counts. Category names never change a count.

## 3. Words used on these screens

Existing words are reused as they are: **In deck**, **Planned**, **Brewing / Assembling / Playable** (deck status), **Checking…**, **Couldn't check**, **Try again**, **Recent changes**, **Pending**, **Made by AI**, **Original**, **Proxy**, **Light** (health). New words below. Add them to the shared vocabulary at close-out (brief section 6).

| Word | Where you see it | Meaning |
|---|---|---|
| **Universal role** | Card window section title | The common, deck-independent role of a card. |
| **Category in this deck** | Card window section title | Your own grouping name in this deck. |
| **Deck job** | Card window and Strategy tab | What the card does for this deck's plan. |
| **Why it is here** | Card window section title | One sentence explaining the job. |
| **Deck rules** / **Deck rules that apply** | Strategy tab section; card window section | Rules on this deck / those that cover this card. |
| **Counts as** | Card window section title | Which health groups the card adds to in this deck, and why. |
| **Health group** | Strategy tab, health section | One of Lands, Ramp, Card advantage, Interaction (plus Plan and win conditions when jobs are set). |
| **Set by you** | Small label on a value | You chose it, or you accepted or changed a proposal. |
| **Proposed by Claude** | Small label on a value | Claude suggested it and you have not looked at it yet. It is already applied and already counts. |
| **Claude's proposals** | Strategy tab bar and list | Everything Claude proposed that you have not yet looked at. |
| **Standard** | Small label on a universal role | Part of the shared baseline. Nobody on this account set it. **[New word, needs owner confirmation]** |
| **Worked out from card text** | Small label on a role | Nothing is set for this card yet. Oracle read the rules text and guessed. This stand-in goes away when roles cover the collection. |

Words not to use here: "Claim" or "Claimed" (retired in `vocabulary.md`), "Pull", "Active/Inactive", "Considering", "Utility", "primary category", "Draft" for a deck state. Say **Card advantage**, not "Draw", for the health group (the role is still **Card draw**). The card window and the Strategy tab never move, sleeve, assign or release a copy. Those stay in the existing card menus. They may show a card's placement as a read-only badge (In deck or Planned, with Original or Proxy), as the Cards tab does.

Note for Gene: `vocabulary.md` retires "Claimed" and "Reassign", while the allocation terminology rule still uses them as status and action words. This spec avoids both, so it works under either. The two documents should be reconciled separately.

## 4. Opening the card window

- **Computer:** clicking the card name in a deck opens the window. Hovering still shows the picture, as today. The card's menu also gets **Card details**. (Answer to Q9: OK.)
- **Phone:** tapping the name opens the same window instead of the full-screen picture. The picture sits at the top, so nothing is lost.
- From the Strategy tab, clicking a card name in any list (jobs, rules, health breakdown) opens the same window.
- The window always belongs to one card in one deck. Opening a card from the collection screen (no deck) is out of scope.
- Esc, the close button, or tapping outside closes it. Focus returns to the card name that opened it.

## 5. Card window layout

```
Computer (about 720 px wide)                    Phone (full-height sheet)
+----------------------------------------+      +---------------------------+
| Rhystic Study     [In deck · Original]   X |  | [card picture]            |
|----------------------------------------|      | Rhystic Study   [X]       |
| [card     |  UNIVERSAL ROLES            |      | In deck · Original        |
|  picture] |  (Card draw) (Stax/tax) [+] |      | UNIVERSAL ROLES           |
|           |  CATEGORY IN THIS DECK      |      | (Card draw) (Stax/tax) [+]|
|           |  Engines            [Edit]  |      | CATEGORY IN THIS DECK     |
|           |  DECK JOB                   |      | ...same sections, stacked |
|           |  [Engine v]  Set by you     |      +---------------------------+
|           |  WHY IT IS HERE             |
|           |  Draws whenever opponents.. |
|           |  DECK RULES THAT APPLY      |
|           |  None                       |
|           |  COUNTS AS                  |
|           |  Card advantage, from role  |
|           |  Saved                      |
+----------------------------------------+
```

Order of sections, top to bottom: picture and name with the placement badge; **Universal roles**; **Category in this deck**; **Deck job**; **Why it is here**; **Deck rules that apply**; **Counts as**. A line at the bottom shows the save state ("Saving…", "Saved", or the error in section 11). A small link under Deck job reads "See all jobs on the Strategy tab".

### 5.1 How "who decided" is shown

Shape and a word carry the meaning, never colour alone (D-012). This reuses the rule from `vocabulary.md`: a filled badge is settled, an outline badge is not yet decided.

- **Set by you:** filled chip or plain value, with the small label "Set by you".
- **Standard:** filled chip in the quiet style. The section note reads "Standard roles come from Oracle."
- **Proposed by Claude:** **outline** chip or value, a small robot icon (`smart_toy`), and the label "Proposed by Claude". A proposal also shows its one-line reason from Claude. It is already applied.
- **Worked out from card text:** outline chip with the label "Worked out from card text".

## 6. Card window sections

### 6.1 Universal roles

The 13 roles (Q1, agreed): Ramp, Fixing, Card draw, Card selection, Tutor, Targeted removal, Board wipe, Counterspell, Protection, Recursion, Graveyard hate, Stax/tax, Hand disruption. A card can hold several, with no main one (Q2, agreed).

- Each role is a chip: Set by you, Standard, Proposed by Claude, or Worked out from card text (5.1).
- **Add role** (+): opens a short list of the roles not already on the card. Choosing one adds a chip marked Set by you.
- **Remove:** each chip has an x. Removing a Standard role is saved as your own change and affects only you. A line appears: "You removed: Ramp. **Restore**".
- Lands may hold roles. A dual land can be Fixing. A land counts only in the **Lands** group of deck health, never as Ramp.
- A card in a deck's Maybeboard, or the commander, can be edited the same way.

Section note: "Roles are the same in every deck. Your own category names below don't change them."

### 6.2 Category in this deck

- Shows the current category, for example "Engines". A card can hold more than one category (the first is its main one, up to three in the app); the window shows them as chips with an **Edit** button, using the existing category edit rules.
- A category named "Ramp" is allowed on a card that also holds the role Ramp, and on a card that does not. (Q3: "A card can be ramp in both category and role.") The note says so.
- When a newly added card has no category, the suggestion comes from its first universal role (Sol Ring suggests "Ramp"), using your deck's own names where they exist: "Suggested: Ramp. **Use this**". It is never applied without a click.
- Note under it: "This is your name for the card in this deck. It doesn't change how the card is counted. A card can be Ramp here and also hold the role Ramp."

### 6.3 Deck job

- One job per card (Q4). A picker with the starting list: **Engine** (keeps producing value), **Enabler** (makes the plan possible), **Payoff** (rewards the plan), **Win condition** (ends the game), **Combo piece** (part of a specific combo), **Commander support** (protects or helps the commander), **Flex** (fills a slot, easy to swap). Each option shows its one-line meaning.
- **Add your own job** at the bottom of the picker: a text box, up to 40 characters. Once used, your name appears in this deck's picker and on the Strategy tab.
- **Clear job** returns the card to "No job set". Not every card needs a job (lands often have none).
- The list is a draft you and Claude refine together. Nothing in the window treats the seven as final.

### 6.4 Why it is here

- A single text box, up to 200 characters. Placeholder: "One sentence on what this card does for this deck."
- Saves when you leave the box or press Enter. A card can have a reason without a job, and a job without a reason.
- Job and reason are proposed and accepted together as a pair (section 7).

### 6.5 Deck rules that apply

- Lists the rules on this deck that cover this card. Each shows the rule sentence, "Set by you" or "Proposed by Claude", and, if it adds a count, "Counts as Ramp".
- Each row has **Edit rule** (opens the rule editor, section 9) and **Stop applying to this card** (takes only this card out of the rule).
- **Add a rule for this card** opens the rule editor with this card already chosen.
- A rule covers cards by **type** ("all artifacts") or by a **hand-picked list**. Matching on rules-text wording is later.

### 6.6 Counts as

The plain answer to "why does this card show up in my health numbers?" One line per health group, each with its reason. Examples:

- "Ramp, because of the deck rule: every artifact counts as a mana source."
- "Card advantage, from its role Card draw."
- "Interaction, from its role Targeted removal."
- "Interaction, from its roles Targeted removal and Counterspell. It counts once."
- "Interaction, from card text (no role set yet)."
- "Not counted. Lands have their own group, Lands."
- "Not counted. This card is in the Maybeboard." (Commander: "Not counted. The commander isn't part of these counts.")
- "Not counted in a health group. Its roles (Protection, Recursion) aren't counted in health yet."
- "No counts. This card has no role, job or rule that adds to a health group."

A card counts once in each health group it feeds, even if two of its roles feed the same group.

## 7. Claude proposals: applied at once, labelled, undoable

Claude can propose universal roles, a job with its reason, and deck rules. **Since the owner's answer to Q8 ("Give Claude more freedom for now. As long as I can Undo."), proposals are applied immediately** at sizes up to the direct limit of 120 cards per request (CC-13). Nothing waits for approval at normal sizes. Claude never overwrites something you set. If you have set a value and Claude proposes a different one, the proposal shows beside yours and yours stays in force until you choose.

### 7.1 States a value can be in

| State | What you see | Counts in health? |
|---|---|---|
| **Applied, labelled Proposed** (any request up to 120 cards) | Outline chip or value, robot icon, "Proposed by Claude", Claude's reason, buttons Accept, Change, Dismiss. | Yes, labelled "(N are still Proposed by Claude)" |
| **Set by you** | Plain, with "Set by you". | Yes |
| **Different suggestion beside yours** | Your value stays; below it "Claude suggests: …" with Use Claude's / Dismiss (7.5). | Your value counts |
| **Held for approval** (only a request over 120 cards, up to 200) | A grey note in the section: "Claude proposed this as part of a larger set of 150 changes. It is waiting for your approval and has not been applied." Button **Review in Pending**. No Accept, Change or Dismiss. | No |

A request over 200 cards is refused to Claude with a plain message; you see nothing. Held proposals expire after 24 hours; approval is for the whole set in Pending, after which each value becomes "Applied, labelled Proposed". This is the only approval wait left. **[Confirmed with owner in Q8: normal sizes apply at once.]**

### 7.2 Accept
- Button **Accept**. The value becomes yours: the label changes to "Set by you", the chip fills, "Saved" appears, the robot icon goes.
- For a job proposal, **Accept** takes the job and the reason together.
- On the Strategy tab, **Accept all** does this for every proposal in a batch or in one job's list, after a confirmation with the count (7.8).

### 7.3 Change
- Button **Change**. The value turns into the normal editor with Claude's value pre-filled. Nothing is saved until you press **Save change** or leave the field. Saving makes it "Set by you". **Cancel** leaves Claude's proposal as it was.
- If you change only the reason and keep Claude's job, the whole pair becomes "Set by you".

### 7.4 Dismiss
- Button **Dismiss** removes the proposal. The card goes back to what it had before (nothing, or your earlier value).
- Toast: "Dismissed Claude's proposal for Rhystic Study. **Undo**" (10 seconds, then from Recent changes for 7 days).
- Dismissed values are remembered, so Claude is told not to propose the same value again for this card in this deck. **[New behaviour, needs owner confirmation, section 17]**

### 7.5 A proposal next to a value you set

Example: you set the job of Rhystic Study to Payoff. Claude later proposes Engine.

```
DECK JOB
[Payoff v]  Set by you
   Claude suggests a different job: Engine
   "Rhystic Study keeps drawing cards all game."
   [Use Claude's]  [Dismiss]
```

**Use Claude's** replaces your value and records the change as yours, with the old value shown in Recent changes. Nothing changes until you press it.

### 7.6 Undo from Recent changes (one card, or a whole batch)

- Every proposal Claude applies shows in **Recent changes**. One request is one **batch**: "Claude proposed jobs for 51 cards in Arti-facts. **Undo all**". A single change shows as its own line with **Undo**. Undo is available for 7 days. One click undoes the whole batch (CC-13).
- Undo restores the value each card had before the batch. If it had nothing, the field returns to empty.
- Undo is refused for a card, in words, if that card's roles, job or rules were changed since: "This can't be undone because Rhystic Study has changed since. You can change it by hand in the card window."
- **Undo all with some cards changed since:** cards still as Claude left them are undone; cards you accepted or changed since are left alone and listed: "Undone for 39 cards. 12 cards you had accepted or changed were left as they are." **[New behaviour, needs owner confirmation, section 17]**
- Proposals you accepted or changed stay in Recent changes with the label "Accepted by you" or "Changed by you".

### 7.7 Your own edits and undo

Every edit you make saves immediately and shows "Saved" with an **Undo** button for 10 seconds. Recent changes lists Made by AI changes only, so your own edits do not appear there. The card window shows one line under each section, "Last changed by you · 14 Nov". Whether you want a full history of your own edits too is open (section 17).

### 7.8 Accept all: confirmation

"Accept all 51 proposals in Arti-facts? They become yours and Claude won't overwrite them. **Accept all** · **Cancel**". After accepting: toast "51 proposals accepted. **Undo**" for 10 seconds.

### 7.9 Tools Claude gets (for the owner to know, not to design)

Claude can read roles, jobs, reasons and rules on a deck's cards, and propose them for up to 120 cards per request (a card with a role and a job counts once; **[Architect to confirm against the existing limits]**). Each proposal carries the card, the value, a one-line reason and "Claude" as proposer. Claude cannot set the "Set by you" label and cannot approve its own held proposals.

## 8. The Strategy tab

The Strategy tab is the home of the deck's plan. It keeps everything it shows today and adds the sections the owner asked for.

### 8.1 What exists today and what changes

| Today (read from the app, 2026-11-18) | In this design |
|---|---|
| Commander overview, build picker, build strategy guide (only when a commander record is linked), category manager (only with a build picked) | Kept as is. Moved down into one section, **Commander guide**. |
| **Deck Intent**: win condition, playgroup, bracket, budget, frustrations, strategy notes, format. Collapsed by default; "Configure" or "Edit" button; "Configured" badge | Kept, same fields, same save. Shown as readable text, **open by default**, with Edit. Renamed **Deck intent** (lower case). |
| **Notes** | Kept at the bottom, unchanged. |
| Hidden on a phone | **Shown on a phone** (owner confirms, section 17). |
| No jobs, rules, proposals or health | **New sections:** Summary line, Claude's proposals, Deck jobs, Deck rules, Deck health. |
| On the three test decks nothing is set and no commander record is linked, so only the Deck Intent box and an empty Notes show | These become the empty-state examples (8.5). |

### 8.2 Sections, in order

1. **Summary line**
2. **Claude's proposals** (only when there are proposals to look at)
3. **Deck intent**
4. **Deck jobs**
5. **Deck rules**
6. **Deck health**
7. **Commander guide** (existing, unchanged)
8. **Notes** (existing, unchanged)

Reason for the order: the deck's own plan comes before general commander research, and what needs your attention (proposals) is first. Moving the existing sections is listed in the brief for approval.

### 8.3 Component inventory

| Component | What it is | Built on |
|---|---|---|
| `StrategySummaryLine` | Deck status badge (Brewing, Assembling or Playable, as on the deck header), bracket, "Typical numbers for [commander]", and counts "7 jobs set · 1 rule · 12 to look at". Each count is a link to its section. | `Badge` |
| `ProposalsBar` | Latest batches with count to look at, **Review**, **Accept all**, **Undo all**; "Show older batches". | `Button`, `Badge` |
| `DeckIntentSection` | The existing Deck Intent fields as text with Edit. | existing form |
| `DeckJobsSection` | Job rows with counts; each expands to a card list. Filter chips. | `accordion`, `Badge`, `pill-toggle` |
| `DeckRulesSection` | Rule list; Add rule; row actions. | `Button`, `dropdown-menu` |
| `RuleEditorDialog` | The add/edit rule window (section 9). | `dialog`, `Textarea`, `input`, `command` (card search) |
| `DeckHealthSection` | Group rows, source line, roll-up table, per-group card list. | `Badge`, `accordion` |
| `AskClaudeMenu` | Button with four ready prompts; fills the deck chat, you press Send. | `dropdown-menu`; the existing chat prefill |
| `CardWindow` | Sections 4 to 6. | `dialog` |

### 8.4 Layouts

**Computer** (content column at the app's normal width; sections are stacked full-width bands separated by a thin line, no nested boxes, D-014 quiet default).

```
Strategy
Arti-facts · [Assembling · 84/100 in deck]  Bracket not set
Typical numbers are for Mendicant Core, Guidelight (17,739 decks)
51 jobs set (51 proposed) · 1 rule · 52 to look at
--------------------------------------------------------------------
CLAUDE'S PROPOSALS
 Today 14:02  Claude proposed 51 jobs and 1 rule      52 to look at
 [Review] [Accept all] [Undo all]              [Show older batches]
--------------------------------------------------------------------
DECK INTENT                                                  [Edit]
 Strategy notes   Not set                      Bracket   Not set
 Win condition    Not set                      Budget    Not set
--------------------------------------------------------------------
DECK JOBS                  [Ask Claude to propose v]   Filter: All v
 Engine           8   ########           8 proposed
 Enabler         14   ##############    14 proposed
 Payoff           9   #########          9 proposed
 Win condition    3   ###                3 proposed
 Combo piece      4   ####               4 proposed
 Commander supp.  3   ###                3 proposed
 Flex            10   ##########        10 proposed
 No job set      33   (lands and others; fine)
   v Engine (8)   Skullclamp      "Turns every creature into cards"  (o) Proposed [Accept][Change][Dismiss]
--------------------------------------------------------------------
DECK RULES  1                              [Add rule] [Ask Claude]
 "These artifacts count as mana sources"   Covers 3 cards · counts as Ramp
 (o) Proposed by Claude   [Accept][Change][Dismiss]
 Copy to my other decks with this commander      Coming later
--------------------------------------------------------------------
DECK HEALTH         Using what's set for this deck (1 rule, 51 jobs)
 Lands            33  of 34 typical    common guide 36
 Ramp             11  of 16 typical    common guide 10     Light
 Card advantage   14  of 13 typical    common guide 10
 Interaction       3  of 4 typical     common guide 10
 Plan and win conditions  Plan cards 35 · Win conditions 3
 [How these roll up v]  [Chat about this]
--------------------------------------------------------------------
COMMANDER GUIDE (from EDHREC)   ... existing sections ...
NOTES                           ... existing ...
```

(The numbers in this picture are illustrative of one possible state; the real ones come from the app.)

**Phone** (one column; each section is a collapsible row whose closed state still shows its headline numbers; buttons at least 44 px).

```
Strategy              [Assembling]
Arti-facts
52 to look at
+--------------------------------+
| CLAUDE'S PROPOSALS         (52)|
| Claude proposed 51 jobs, 1 rule|
| [Review]  [Accept all]         |
| [Undo all]                     |
+--------------------------------+
| v Deck intent        Not set   |
| v Deck jobs      51 · 51 prop. |
| v Deck rules                 1 |
| v Deck health     Ramp: Light  |
| v Commander guide              |
| v Notes                    0   |
+--------------------------------+
```

On a phone, Review opens the jobs list filtered to Proposed; job rows are single lines (name, why in two lines at most), tapping a name opens the card window as a full-height sheet; Accept, Change and Dismiss move into a row menu (a "..." button) so the list stays readable. Sections open one at a time (the one you open closes the previous) so you aren't scrolling through all of them.

### 8.5 Section by section

#### Summary line
- Shows deck status using the existing automatic words and the existing deck header count. If the status can't be worked out: "Couldn't check status. **Try again**" (never a guess).
- "Typical numbers are for [commander]" is read only. For Rocco's Secret Sauce today it reads "Typical numbers are for Rocco, Cabaretti Caterer." A note: "This deck's plan is a different commander? Choosing another commander for comparison is coming later." **[Later: RQ-06]**
- Counts are links that scroll to the section.

#### Claude's proposals (bar)
- Appears only when at least one Claude proposal is still to look at (applied but not accepted, changed or dismissed) or a different suggestion sits beside a value you set.
- One row per batch (most recent three; "Show older batches" for the rest within 7 days). Each row: time, what ("51 jobs and 1 rule"), "N to look at", and buttons.
- **Review:** scrolls to the Deck jobs section filtered to Proposed (or the rules section if the batch was rules). On a phone, opens that list.
- **Accept all:** section 7.8. **Undo all:** section 7.6; confirmation line first: "Undo Claude's changes to 51 cards in Arti-facts? Each card goes back to what it had before." **Undo all** · **Cancel**.
- When all of a batch is looked at, the row stays 7 days with "All looked at" and, if undo is still allowed, "Undo all". When nothing is within 7 days, the bar disappears.
- Held-for-approval batches (over 120 cards) show here as "Waiting for your approval: 150 changes. **Review in Pending**" with no Accept or Undo.

#### Deck intent
- Same fields and same save as today. Read view shows each field's text or "Not set". **Edit** opens the same form as today. First visit and nothing set: see empty state below.

#### Deck jobs
- **Header:** "Deck jobs", total jobs set, a line "N proposed by Claude · M set by you", **Ask Claude to propose** (menu, 8.7), and a filter: **All, Proposed by Claude, Set by you, No job set**.
- **Overview rows:** one per job (the seven starting jobs plus any of your own names used in this deck), each with the card count, a simple bar (decorative; the number is the information), and a mix label "6 proposed · 2 yours". A last row **No job set** with its count and the quiet note "Fine for lands and filler. Not every card needs a job."
- **Expanding a row** lists its cards: card name (opens the card window), "Why it is here" (two lines, tap to read more), who set it (outline robot chip "Proposed by Claude" or filled "Set by you"), and for proposals the buttons Accept, Change (opens the card window on the Deck job section), Dismiss. A row header has **Accept all in Engine** for proposals in that job.
- **Moving a card between jobs** is done in the card window (Change). No drag and drop in this first version. **[No pointer-only interactions; every action is a button.]**
- Jobs are counted over the main deck; the Maybeboard has its own line "Maybeboard: 4 cards, 0 with a job".
- Own job names appear as extra rows; when its last card is cleared the row disappears.

#### Deck rules
- **Header:** "Deck rules", count, **Add rule**, **Ask Claude** (rules prompt).
- **Each row:** the rule sentence, who set it ("Set by you" or "Proposed by Claude" with Accept, Change, Dismiss), "Covers N cards" (click to expand the card list; each card opens the card window), "Counts as Ramp / Card advantage / Interaction" or "Counts as: nothing extra (explains the card, changes no count)", **Edit**, **Remove**.
- **Copy to my other decks with this commander:** a disabled text line under the list, "Coming later". No button. (Q5.)
- Rules belong to this deck, not the commander (Q5).
- The editor is section 9.

#### Deck health
- Full description in section 10. In the tab it shows: the source line, the four groups with have, typical, common guide and a Light marker, the Plan and win conditions line, **How these roll up**, a click-through list of cards per group, the change notice, and **Chat about this** (the existing question to the deck chat, sent at once, because it only asks a question).

#### Commander guide and Notes
- Existing sections, unchanged in content. Commander guide sits below because it is general research; your own sections come first. When no commander record is linked (as on the three test decks), the guide shows nothing, as today, plus one new line: "No commander record is linked to this deck, so commander research isn't shown. This doesn't affect jobs, rules or health."

### 8.6 States of the whole tab

Each section loads and fails on its own (D-030). The tab frame (title, summary line) shows at once with what is known.

| State | What you see |
|---|---|
| **A. Empty: nothing set** (the three test decks today) | Summary line: "Nothing set for this deck yet · 0 jobs · 0 rules". No proposals bar. Deck intent: "Not set" on each field and one line: "Say how this deck wins and what table it is for. Claude reads this when it advises you. **Edit**". Deck jobs: "No jobs set. A job says what a card does for this deck's plan, for example Engine or Payoff. **Set a job in the card window** or **Ask Claude to propose jobs**." Deck rules: "No rules yet. A rule is a sentence that changes how several cards are read here, for example 'every artifact counts as a mana source'. **Add rule** or **Ask Claude to propose rules**." Deck health: source line "Using common defaults. No roles, jobs or rules are set for this deck yet." and the four groups against the commander's typical numbers. Nothing is shown as a zero because it is unknown. |
| **B. Claude has just proposed a full deck** (for example 51 jobs and 1 rule applied at once) | Summary line counts "52 to look at". Proposals bar at the top with Review, Accept all, Undo all. Jobs overview filled, every row marked "proposed". Rules list shows the proposed rule with Accept, Change, Dismiss. Health source line: "Using what's set for this deck: 51 jobs, 1 rule. (52 are still Proposed by Claude.)" and, if a count moved, the change notice. Everything is already applied; nothing is waiting. A first-time hint line under the bar: "Claude has already applied these. Look them over and Accept what's right, or Undo all." |
| **C. Owner has edited** (some accepted, some changed, one different suggestion beside yours) | Bar shows the remaining "17 to look at" and a second line "1 card has a different suggestion from Claude. **Review**". Job rows show a mix "6 proposed · 2 yours". Accepted and changed values are filled "Set by you". Claude's batch row shows "Accepted 34 · Changed 2 · 15 to look at". Undo all still offered; it leaves your accepted and changed cards alone (7.6). |
| **D. Looked at and done** | No proposals bar. Jobs filled with "Set by you". Health source line "Using what you've set for this deck: 51 jobs, 1 rule." |
| **E. Loading** | Skeleton bands shaped like each section, each section title already visible. Screen-reader text: "Checking deck jobs." |
| **F. One section can't load** | In place of the section: "Couldn't load deck jobs. Nothing has changed. **Try again**." The other sections stay usable. A failed health check never shows a zero (10.5). |
| **G. Offline** | "You're offline. Changes can't be saved." Accept, Undo all and edits are disabled and say why; nothing shows "Saved" when it wasn't. |
| **H. Held for approval** (over 120 cards in one request) | Bar row "Waiting for your approval: 150 changes. **Review in Pending**". The sections show what they had before. |

### 8.7 Ask Claude to propose

Button with a menu of four ready prompts. Choosing one opens the deck chat and **fills in** the message; you press Send. (A prompt that can change up to 120 cards should not fire on a single click. **[Owner confirms, section 17.]**) The prompt names the deck and can be edited before sending. The menu appears on the proposals bar (when empty-state), in the Deck jobs header, in the Deck rules header, and in each empty state.

| Menu item | Ready prompt (exact text; `[deck]` is the deck name) |
|---|---|
| Propose roles | "Please propose universal roles for every card in [deck] that has none set. Use only the 13 roles. Don't change roles I set myself. When you're done, tell me how many cards you changed." |
| Propose jobs | "Please propose a deck job and a one-sentence reason for every card in [deck] that has a job to do. Use the starting jobs (Engine, Enabler, Payoff, Win condition, Combo piece, Commander support, Flex) or my own names if I've added any. Leave a card with no job if it doesn't need one, such as most lands. Don't change anything I set myself." |
| Propose rules | "Please look at [deck] and propose deck rules: short sentences about groups of cards that change what they are worth in this deck, for example 'every artifact counts as a mana source'. For each rule, say which cards it covers and which health group it counts toward, if any. Don't change rules I set myself." |
| Propose everything | "Please set up [deck] for me: propose universal roles, a deck job and reason for each card that needs one, and any deck rules that apply. Don't change anything I set myself. Give me one summary at the end." |

If the deck chat can't open: "Couldn't open the chat. Your deck hasn't changed. **Try again**." If the chat is already open with unsent text: the prompt is added on a new line, never replacing what you typed.

### 8.8 Flows

**Accept, Change, Dismiss on the tab.** Same as 7.2 to 7.4, per row or per list. Accept shows "Saved" and the row loses its robot icon; the summary counts and the bar update at once. Change opens the card window on the field. Dismiss shows the 10-second Undo toast.

**Undo a whole batch.** Bar, **Undo all**, confirmation with the count, then "Undone for 51 cards. Arti-facts is as it was before." with the partial wording from 7.6 when some cards were changed since. Focus returns to the bar's heading, and the change is announced to screen readers. If undo fails: "Couldn't undo. Nothing was changed. **Try again**." The batch is also in Recent changes.

**Add, edit, remove a rule.** Section 9. The rules list updates and, if the rule counts toward a group, the change notice appears in Deck health.

**Edit the strategy.** As today (Edit, fields, Save, "Strategy saved"). On failure: "Couldn't save the strategy. Your text is still here. **Try again**."

**Ask Claude.** 8.7.

**Keyboard.** All buttons, rows and menus are reachable with Tab. Rows expand with Enter or Space. A job row is a button with "Engine, 8 cards, 8 proposed by Claude, collapsed".

### 8.9 Data binding (what each element reads)

No contract exists yet; the Architect writes it from these needs. **No stored data is invented here.**

| Element | Needs |
|---|---|
| Deck intent, bracket, notes | Existing deck strategy and notes (unchanged). |
| Summary line status | The existing deck state check. |
| "Typical numbers are for" | The deck's commander and the existing typical-number source. |
| Deck jobs | Per card in this deck: job, reason, who proposed it (you or Claude), whether it is still to look at, which batch it came from. |
| Deck rules | Per rule: sentence, covers (type or card list), "counts as" group or none, who proposed it, still to look at, batch. |
| Claude's proposals bar | Batches from the change log (time, what, how many, how many still to look at), and whether Undo is still allowed. |
| Deck health | Universal roles per card, the roll-up table (section 10), jobs and rules, and the commander's typical numbers. |
| Dismissed proposals | A memory per card and deck of what you dismissed. |

## 9. Deck rules: the editor

A rule is made and managed on the Strategy tab (and from a card's window), because it covers many cards.

- **Add or edit a rule** (a window):
  1. **Rule**: one sentence, up to 200 characters. Example: "Every artifact counts as a mana source."
  2. **Covers**: either **All cards of a type** (a type picker: Artifact, Creature, Enchantment, Land and so on) or **Chosen cards** (a search box over this deck's cards, with chips).
  3. **Counts as** (optional): None, or one of Ramp, Card advantage, Interaction. This is what changes health counts. A rule with None changes no count; it only appears on the covered cards as a note.
  4. A live line under the form: "Covers 19 cards in this deck." and, if a group is chosen, "Ramp would go from 8 to 21 of 16 typical." The numbers are worked out by the app, not typed. **A land never counts as Ramp:** "2 of the 19 are lands and stay in Lands." A card already counted in that group is not counted twice: "4 are already counted as Ramp."
  5. Buttons **Save rule** and **Cancel**.
- **Remove a rule:** a confirmation: "Remove this rule? The cards it covers go back to their roles. Ramp would go from 11 to 8." **Remove rule** and **Cancel**. Undo for 10 seconds.
- **Rule too broad:** if a type rule covers more than half the deck, a warning shows before saving: "This rule covers 62 of 100 cards. Is that what you mean?" Saving is still allowed.
- Rules belong to this deck, not to its commander. A second deck with the same commander starts with no rules. Copying is later and shown as "Coming later".
- Claude's proposed rules appear in the same list with "Proposed by Claude" and Accept, Change, Dismiss on each row, and follow section 7.

## 10. Deck health in broad groups (Q6, changed)

### 10.1 The idea
When Oracle does not yet understand a deck's jobs, health speaks the common deckbuilding language: lands, ramp, card advantage, **interaction**. Interaction is targeted removal, board wipes, counterspells and similar, counted together against one recommended number. Fine-grained universal roles feed these broad groups. Jobs and rules then refine the counts for this deck.

### 10.2 The roll-up (this table is what the app and the mockup must match)

| Health group (broad) | Universal roles that feed it (fine) | Common number (guide) | Typical number used as the target |
|---|---|---|---|
| **Lands** | Not a role. Any card whose type is Land. A land never counts as Ramp. | 36 | Commander's typical land count, else 36 |
| **Ramp** | Ramp | 10 | Commander's typical ramp, else 10 |
| **Card advantage** | Card draw | 10 | Commander's typical draw, else 10 |
| **Interaction** | Targeted removal, Board wipe, Counterspell, Hand disruption | 10 | Commander's typical removal + typical wipes, else 10 |
| **Plan and win conditions** (only when jobs are set) | None. Deck jobs only: Engine, Enabler, Payoff, Combo piece (plan cards) and Win condition. | No judged number | None. Shown for information. |

Not counted in any group in the first version (they show in the card window only): **Fixing, Card selection, Tutor, Protection, Recursion, Graveyard hate, Stax/tax.**

Rules for the count:
- A card counts **once per group**, even when two of its roles feed the same group (a card that is both Targeted removal and Counterspell counts once in Interaction).
- Main deck only. The Maybeboard and the commander are not counted.
- Cards with no role yet use today's card-text reading as a stand-in: it can only produce Ramp, Card advantage (today's "draw"), Targeted removal and Board wipe. Because today's removal and wipes are summed into Interaction, **on day one the Interaction number equals today's Removal plus Wipes** (counted once per card).
- **Light** is unchanged: 2 or more short of the target. A target under 2 is never Light.
- The "typical" numbers come from the commander's EDHREC average, as today, summed for Interaction (removal + wipes). **[Open for the owner: which number is the target when both exist, section 17, item 1. This spec shows the commander's typical as the target and the common guide beside it.]**

### 10.3 How jobs and rules refine the groups
- A rule or job can say "counts as Ramp / Card advantage / Interaction" for chosen cards (adds them to that group once), or "does not count" (removes them from a group they would otherwise feed). The reason shows on the card ("Counts as") and in the group's card list.
- Jobs feed the **Plan and win conditions** group. Until at least one job is set, that line reads "Not counted until jobs are set."
- Targets do not change with jobs or rules in the first version. A deck-specific target is later.
- Once-per-turn cost reducers (a Sapphire Medallion type) count as Ramp.

### 10.4 What the section shows
- **Source line**, one of three:
  - Nothing set: "Using common defaults. No roles, jobs or rules are set for this deck yet. Counts come from each card's universal role, or from its card text where no role exists."
  - Some set: "Using what's set for this deck: 6 jobs, 1 rule. The rest uses common defaults."
  - With proposals: add "(2 are still Proposed by Claude.)"
- **A row per group:** "Interaction 9 of 9 typical · common guide 10", the **Light** marker where it applies (icon and word, not colour alone), and a short source note: "all from card roles", or "7 from roles, 2 from card text (no role set yet)", or "8 from roles, 5 from deck rules".
- **Click a group to see its cards.** Each card shows its reason, using the Counts as wording, and a tag: **Role**, **Rule**, **Job**, **Card text** or **Proposed**. Clicking a card opens its card window. The list is grouped by the universal role that put it there, so you see "Targeted removal 7 · Board wipe 2 · Counterspell 0 · Hand disruption 0".
- **How these roll up** (a small expandable table, the one in 10.2 with this deck's counts filled in):

```
HOW THESE ROLL UP                     this deck
Lands            Land cards                  37
Ramp             Ramp                        17
Card advantage   Card draw                    8
Interaction      Targeted removal             7
                 Board wipe                   2
                 Counterspell                 0
                 Hand disruption              0
                                       total  9 (a card counts once)
Not counted in health: Fixing, Card selection, Tutor, Protection,
Recursion, Graveyard hate, Stax/tax
```

- **Change notice.** When a deck's numbers change because a role, job or rule was set, accepted, dismissed or undone, the section shows until you dismiss it: "Ramp changed from 8 to 11 because of 1 new rule. **See what changed**". It lists the cards. Health numbers never move silently.
- **Unknown stays unknown.** Cards with no card data are counted in a line "5 cards couldn't be checked" (existing behaviour).

### 10.5 When data can't be loaded
Follows `vocabulary.md` section 5. The section shows "Couldn't check deck health. Your cards and settings haven't changed. **Try again**" and never a zero. If roles loaded but jobs or rules did not: "Showing counts from roles only. Couldn't load this deck's rules and jobs. **Try again**."

### 10.6 Sources and what is not confirmed
- Today's app guide (ramp 10, draw 10, removal 6, wipes 2, lands 36) is in the app. Where it came from is not recorded.
- **Not confirmed:** Rachel Weeks's number of interaction cards (the owner's message gave no number and the article was not read). The Command Zone template figures (about 10 ramp, 10 to 12 card advantage, about 10 targeted and about 3 mass disruption, 36 to 38 lands) are from memory, not checked. The Interaction guide of 10 is a design assumption between today's 8 and the template's roughly 13.
- No web page could be opened for this step. Before the numbers are locked, someone should check them against the two sources; it changes one number in the table and one line of wording.

## 11. Card window states

The window opens at once with the picture and name, which are already known. Each section loads on its own, so one slow or failed section doesn't block the others (D-030).

| Situation | What you see |
|---|---|
| **Loading, any section** | A skeleton shaped like the section. Section title is already visible. Words for screen readers: "Checking roles for Sol Ring". |
| **Whole window can't load** | Picture and name stay. Below: "Couldn't load this card's details. Nothing has changed. **Try again**." |
| **One section can't load** | In place of that section: "Couldn't load roles for Sol Ring. Nothing has changed. **Try again**." The other sections stay usable. |
| **Roles: none** | "No universal role. Many cards, such as a plain creature or a basic land, don't have one. **Add role**" |
| **Roles: none yet, text guess available** | Outline chips labelled Worked out from card text, with the note "Nothing is set for this card yet. Oracle read the card text." **Add role** sets a real role. |
| **No card data (S8, 115 cards)** | Banner: "No card data yet, so no role was worked out." Roles: "You can still set a role by hand. **Add role**". Counts as: "No count from card text. A role you set here will be counted." |
| **Category: none** | "No category. **Add a category**" (and the suggestion, if the card has a universal role). |
| **Job: none** | "No job set. **Set a job**. You can also ask Claude to propose jobs for this deck." (Link opens the Strategy tab menu.) |
| **Why: none** | Placeholder text only. No error. |
| **Rules: none** | "No deck rules apply to this card. **Add a rule for this card**" |
| **Saving** | "Saving…" at the bottom of the window; the changed control stays editable. |
| **Saved** | "Saved" at the bottom, and a 10-second **Undo** on the edit. |
| **Save failed** | "Couldn't save the job. Nothing was changed. **Try again**". What you entered stays on screen. Same pattern for roles, category, reason and rules. |
| **Changed while open** | "Claude or another screen changed this card while you had it open. Showing the latest." Your unsaved text stays below it with **Keep mine** and **Use latest**. |
| **Undo refused** | The reason in words (7.6). |
| **Rule effect can't be worked out** | "Couldn't work out the effect on health. You can still save the rule." The preview line is replaced, not left at zero. |
| **Card not in this deck any more** | "This card isn't in Arti-facts any more." with **Close**. |
| **Offline** | "You're offline. Changes can't be saved." Controls stay editable but Save is disabled; nothing is shown as "Saved" when it wasn't. |

Empty states appear only after a successful load. A failed load never shows an empty state.

## 12. Accessibility

- The card window and the rule editor are dialogs with a focus trap. Esc closes them. Focus goes to the close button on open and back to the opener on close.
- Every chip says its source in its accessible name: "Ramp, role, proposed by Claude, not yet accepted". The filled or outline shape is also said in words.
- Accept, Change, Dismiss and Undo are real buttons in tab order, in that order. After Accept, focus stays on the section title and "Saved" is announced. After Undo all, focus returns to the proposals bar heading and "Undone for 51 cards" is announced.
- Job rows, rule rows and health groups are disclosure buttons with their state in words ("Engine, 8 cards, collapsed"). Bars are decorative; the number is text.
- **Light** is icon plus word. Health group rows, status and "proposed" never use colour alone (D-012); any new colour pair must meet 4.5:1 for text and 3:1 for icons. The robot icon always comes with the words "Proposed by Claude". Greyscale test: outline and filled chips still differ.
- The Strategy tab's reading order is the section order in 8.2. Skeleton pulses and toasts respect reduced motion. On phone, each button is at least 44 px high.

## 13. Worked examples on the three test decks

Real facts below were read read-only from the app's data on 2026-11-18: all three decks have no strategy text, win condition, bracket, budget or notes, and no commander record linked; their card lists and numbers are from the audit. Numbers marked *illustrative* show a possible state; the app works out the real figures. Card text in quotes is example wording to show the layout, not a promise of what Claude will write.

### 13.1 Arti-facts (commander Mendicant Core, Guidelight): a rule that covers many cards

Today: 84 cards (16 short, known). Strategy tab is state A (empty): Deck intent "Not set", no jobs, no rules, health "Using common defaults". Health (broad groups) against the commander's typical numbers: Lands 33 of 34, Ramp **8 of 16 (Light)**, Card advantage 14 of 13, Interaction up to 3 of 4 (removal 2 + wipes 1). The commander-guide section shows only the line "No commander record is linked…".

1. **Ask Claude.** On Deck jobs you choose Ask Claude to propose, then **Propose everything**. The chat opens with the prompt filled in; you press Send.
2. **Claude applies at once.** Claude proposes jobs for the 51 cards that aren't lands (*illustrative*) and one rule. That is well under 120, so it is applied immediately and nothing waits for approval. The tab is now **state B**: the bar reads "Claude proposed 51 jobs and 1 rule · 52 to look at", Deck jobs shows Engine 8, Enabler 14, Payoff 9, Win condition 3, Combo piece 4, Commander support 3, Flex 10, and "No job set 33 (lands, fine)".
3. **The rule is too broad.** Claude proposed **"Every artifact counts as a mana source"**, counting as Ramp. The rule's own line reads (*illustrative*): "Covers 19 cards. 2 are lands (Ancient Den, Razortide Bridge) and stay in Lands. 4 are already counted as Ramp (Sol Ring, Arcane Signet, Azorius Signet, Mind Stone). Ramp would go from 8 to 21 of 16 typical." It would count Skullclamp and Whispersilk Cloak as mana, which isn't what you mean (the brief's known risk).
4. **You change it.** **Change**, then switch Covers to Chosen cards and keep the artifacts that really make mana (*illustrative*: 3). Sentence becomes "These artifacts count as mana sources." The preview reads "Ramp would go from 8 to 11 of 16 typical." You save. The rule is Set by you; the health section shows "Ramp changed from 8 to 11 because of 1 new rule. See what changed."
5. **Look over the jobs.** You expand Engine, find Skullclamp's reason "Turns every creature into cards" right, press **Accept**; you open Whispersilk Cloak and **Change** it to Flex. The batch row reads "Accepted 1 · Changed 2 (the rule and Whispersilk Cloak) · 49 to look at". You press **Accept all** for the rest after a quick read. **State D**.
6. **Open Sol Ring** (card window): Universal roles: Ramp (Standard). Category in this deck: Artifact. Deck rules that apply: the rule above only if Sol Ring is on its list. Counts as: "Ramp, from its role. The deck rule also covers it; it still counts once."
7. **Open an Equipment** that isn't on the list: Deck rules that apply: none. Counts as: "No counts."
8. **Health now** reads "Using what you've set for this deck: 51 jobs, 1 rule." Ramp 11 of 16 typical · common guide 10 (8 from roles, 3 from deck rules), still Light by 5; Interaction 3 of 4; Plan and win conditions "Plan cards 35 · Win conditions 3" (*illustrative*).

### 13.2 Murky Business (commander Myrkul, Lord of Bones): a rule that changes no count

Today: 101 cards (one over, known). Strategy tab state A. Health: Lands 37 of 35, Ramp **17 of 20 (Light)**, Card advantage 8 of 7, Interaction up to 9 of 9 (removal 7 + wipes 2).

**The rule: "A -1/-1 counter cost is free once the card is a non-creature enchantment."** The idea: when Myrkul turns a creature into an enchantment, putting a -1/-1 counter on it as a cost no longer shrinks or kills it, so the cost is free.

- Deck rules: **Add rule**. Rule sentence as above. **Covers: Chosen cards**: Devoted Druid and Cinderhaze Wretch (both real cards in this deck, filed as Creature). **Counts as: None**. The preview reads "Covers 2 cards. Health numbers don't change." Save.
- The Deck rules row reads: the sentence · Set by you · Covers 2 cards · "Counts as: nothing extra. It explains these cards and changes no count."
- Health source line: "Using common defaults. 1 rule is set; it doesn't change any count."
- Open Devoted Druid: Universal roles: Ramp (Standard). Category: Creature. Deck job: Engine, Proposed by Claude, "Makes mana every turn, and the counter cost is free once it is an enchantment." Deck rules that apply: the rule above, with Edit rule and Stop applying to this card. Counts as: "Ramp, from its role. The rule explains the card; it does not add a count."
- Open Cinderhaze Wretch: same rule line; its job and reason are empty until you or Claude set them.
- If you later want those two counted as ramp, edit the rule and set Counts as: Ramp. The preview shows the change and a change notice follows.

Why a rule and not a job: a job says what one card does. This sentence is true of two cards and can be extended, so it is saved once on the deck.

### 13.3 Rocco's Secret Sauce (commander Rocco, Cabaretti Caterer): the plan is not the commander

Today: 100 cards. State A. Health: Lands 36 of 35, Ramp **14 of 22 (Light)**, Card advantage 11 of 7, Interaction up to 4 of 6 (**Light**: removal 2 + wipes 2, against typical 5 + 1). The deck's plan is Norin the Wary; Rocco only fetches him.

- Summary line: "Typical numbers are for Rocco, Cabaretti Caterer." with the note that choosing another commander for comparison is coming later. Once that later change (RQ-06) exists, the line would read "Typical numbers are for Norin the Wary (you chose this)", and the Light markers would be judged against Norin's averages. Nothing in this spec depends on it.
- Deck jobs: Norin the Wary, **Engine**, Proposed by Claude: "The deck's plan: Norin leaves and returns again and again, and every enter or leave trigger in the deck fires each time." Rocco, Cabaretti Caterer (the commander): **Commander support**, "Fetches Norin and starts the plan." The job sits on the deck, not on Rocco, so it is right even though the commander is someone else.
- Deck rules: one rule with Counts as: None, "Cards that blink or flicker are part of the plan", covering a hand-picked list. A second deck with Rocco as commander would not carry this over. This is why rules belong to the deck.
- Health: "Using what's set for this deck: 3 jobs, 1 rule." The Interaction row stays "up to 4 of 6 typical · common guide 10 · all from card roles and card text" because nothing set here affects it. The opening of the group shows "Targeted removal 2 · Board wipe 2".
- The commander is not counted in health; Rocco's window says "Not counted. The commander isn't part of these counts."

## 14. Edge cases

- **A card in several decks:** universal roles are the same in each; category, job, reason and rules differ. Opening Sol Ring in Arti-facts shows the Arti-facts job and a line: "Job and rules are for Arti-facts only."
- **Several printings:** one card to Oracle. Roles never mention a printing.
- **Two-faced and split cards:** roles are for the whole card. Counts follow the front face today; the window says "Counted from the front face" when the back face would change the answer.
- **Claude and you edit the same field:** your edit wins ("Changed while open").
- **Claude proposes a role you already removed:** it is a proposal beside your removal. Accept restores it.
- **A rule covers a card you remove from the deck:** the rule keeps its other cards. If a hand-picked rule loses its last card: "This rule covers no cards. **Remove rule**" and it counts nothing.
- **Job names you invented:** a name used by one card stays in the picker for the deck. Clearing the last use removes it.
- **Very long reasons or rule sentences:** cut off at 200 characters with a live counter near the limit; pasted longer text is shortened and the box says "Shortened to 200 characters."
- **Duplicate role chips:** "Ramp is already on this card."
- **A card is both in a category named Ramp and holds the role Ramp:** it counts once in the Ramp group, and "Counts as" says "from its role".
- **A deck with a different number of cards than 100** (Murky Business 101, Arti-facts 84): health and jobs work on whatever is in the main deck; the summary line shows the deck's status word as usual.
- **Claude proposes for a deck while you have the Strategy tab open:** the tab updates and the bar appears with "Claude just proposed 51 jobs. **Show**" (announced, not stealing focus).
- **A batch is bigger than the screen can show:** job rows stay collapsed until opened; each list loads in pages of 25 cards with "Show more".
- **More than 120 cards in a request:** held for approval (7.1, state H). No wording about approval appears for normal sizes.

## 15. What was decided, and what stays the same

**Decided by the owner (2026-11-18), now built into this spec:** Q1 the 13 roles; Q2 several roles per card; Q3 categories and roles are separate and can both be Ramp; Q4 seven starting jobs, own names allowed, one job per card plus a why; Q5 rules and jobs are one family, rules belong to the deck; Q6 health uses broad groups with common numbers, refined by jobs and rules; Q7 Claude proposes roles for the three test decks first; Q8 Claude's proposals apply at once up to 120 cards, Undo for a whole batch; Q9 the window opens on clicking the name, computer and phone; Q10 build order window, roles, Claude proposing roles, jobs, rules, health last.

**Stays the same**
- The Cards tab list, except the card name now opens the window.
- Allocation actions (Sleeve, Assign, Release, Reassign) are not in the window or the Strategy tab.
- Trade and black binder rules are not part of this feature.
- Existing deck health "Light" rule (2 or more short), the commander's typical numbers, and the footer health strip's look; the strip's numbers come from the same groups once slice 7 ships.
- The Commander guide, the category manager and Notes keep their content.

## 16. Hand-off notes

- **Designer next (the mockup step):** update the HTML mockup to match this version: the card window states, the Strategy tab on laptop and phone for states A to D, the health roll-up table, Claude's proposals bar with Undo all, the rule editor with preview, and the three worked decks. Remove any wording that says Claude's proposals wait for approval at normal sizes.
- **Architect:** write the contract for the stored data from section 8.9; DB-1 to DB-4 are drafted on a throwaway copy first and need owner approval. Confirm how the 120-card limit counts a card with both a role and a job, and how a batch id and "still to look at" state are recorded.
- **Developer:** slice order in brief section 9. Slice 4 builds the Strategy tab frame with no new stored data; sections 8.5 Deck jobs, Deck rules and Deck health arrive in slices 5, 6 and 7.
- **Tester:** run the three worked examples in section 13, each state in 8.6 and 11, the batch Undo (including partial), and the greyscale and keyboard checks in section 12.

## 17. Still open for the owner (each with a recommendation)

The brief's section 7c lists five items; these are the three behaviour details this spec adds.

1. **Which number is the health target when the commander has typical numbers?** (brief 7c-1) Recommendation: the commander's typical is the target and the common guide is shown beside it; with no typical numbers, the common guide is the target. This spec is written that way.
2. **Do Claude's proposals count in health at once?** (brief 7c-2) Recommendation: yes, labelled; Undo removes them.
3. **Interaction membership:** includes Hand disruption and Counterspell, excludes Graveyard hate and Stax/tax. (brief 7c-3) Recommendation: as in 10.2.
4. **The Strategy tab on a phone** (brief 7c-4). Recommendation: yes.
5. **Ask Claude fills the chat and waits for Send** (brief 7c-5). Recommendation: yes.
6. **Your own edits: a full history?** The spec gives them a 10-second Undo and a "Last changed by you" line, and keeps Recent changes for Claude only. Recommendation: no for now.
7. **Remember what you dismissed so Claude doesn't propose it again for that card in that deck?** Recommendation: yes, to avoid nagging.
8. **Undo all when you have already accepted or changed some of the batch.** Recommendation: undo only the cards still as Claude left them, leave yours alone, and say which were left. The alternative is to refuse the whole undo, which is simpler but means one accepted card blocks the batch.
9. **Is "Standard" the right word for the shared baseline role?** Alternatives: "Common" or "Oracle's". Recommendation: keep "Standard".
