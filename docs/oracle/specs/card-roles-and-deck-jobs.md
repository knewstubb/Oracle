# Spec: Card window, roles, deck jobs, strategy points and the layered Strategy tab (CC-26)
> Status note 2026-11-22 (audit clean-up): the Strategy tab described here was removed from the deck page; the strategy lives in the left rail and the Strategy window. Read the parts about a Strategy tab as history.

Role: Designer · Status: **DRAFT v3 for owner review. Nothing is built.** · 2026-11-18
Brief: `docs/oracle/briefs/card-roles-and-deck-jobs.md` (version 3, owner answers to Q1 to Q10 and the round 3 decisions D-a to D-d recorded). Audit: `docs/oracle/reports/2026-11-18-architect-card-roles-audit.md`.
Inputs: the owner's answers of 2026-11-18 (brief section 2), the new request "We also need somewhere to view the deck strategy. Let's update the strategy tab to accommodate this", `specs/vocabulary.md`, the allocation terminology rule, D-030 (honest loading and error states), D-034 and D-034a (every Claude change is recorded and undoable), CC-13 (Claude may change up to 120 cards per request, one-click undo per batch).
Mockup: `docs/oracle/mockups/card-roles-and-deck-jobs.html` (updated to match this version).

What changed from version 2 (owner decisions of 2026-11-18, round 3):
- **D-a, jobs and categories stay as two things** and are told apart: Category = where a card sits in the deck list, Job = why the card is in the deck. Two labelled fields with hints in the card window (6.2, 6.3, 6.7), a "Group by Category / Job" switch on the deck list (6.8), and no job clutter until Claude has proposed jobs.
- **D-b, the Strategy tab is one tab in three layers**: Build, Your strategy, Card jobs (section 8). The separate "Commander guide" section is gone. The Build layer holds the EDHREC build picker, its guide, its typical numbers and the category manager.
- **D-c, "rules" is now "strategy points"** everywhere. The free-text "strategy notes" box is now **Notes**. Remaining uses of the word "rules" in this spec are all about something else ("rules text" on cards, the allocation terminology rule, the Light rule, binder rules).
- **D-d, health numbers**: the picked build's typical numbers first, then the commander's all-builds average, then the common guide where there is no number (brief 7d item 1, **Answered** 2026-11-18: Agree), then the deck's strategy points and jobs adjust the counts; every number names its source (section 10).
- **D-060, Claude sets and maintains health targets from the deck's strategy** (owner-approved 2026-11-18). Health targets are no longer something the owner approves one by one. Claude sets each number from the deck's strategy and keeps it up to date, with a visible reason per number and Undo. The owner may override a number; Claude then leaves it alone until it is handed back. The fallback order where no strategy exists yet is unchanged: the build's numbers, the commander's all-builds average, the common guide. Category stays separate from jobs and strategy (sections 10.1, 10.3, 10.4, 13.4).
- **Deck strategy items (design round, 2026-11-18, contract `contracts/deck-strategy.md`; owner to confirm the open points there).** Your strategy becomes a short list of separate items (Aim, What the commander enables, Win condition, Play it like) next to the strategy points, each "Set by you" or "Proposed by Claude" (8.6). A job can say which item it serves, shown as a "Serves" line in the card window (6.3a). Claude's proposals are unconfirmed until you accept them and show the cards they are based on. Bracket is required. The health section says when your strategy changed after Claude set the numbers (10.4). Section 10.3 no longer says a job can change a count (owner decision: it never does).
Earlier changes, still in force: **Q6** (broad health groups), **Q8** (Claude's proposals apply at once, up to 120 cards, one-click undo of a batch).

---

## 1. The problem, the principle, and what this covers

**The problem.** You and Claude cannot yet say what a card is for, in a way that is saved, shown and counted. Deck health guesses from card text and gets decks like Arti-facts wrong. The Strategy tab shows commander research (the build and its guide) and a collapsed settings box as two unrelated parts, and none of the deck's own plan: not which cards do what, not the strategy points that make this deck different, not what Claude has suggested, not why health says what it says.

**The principle.** One place per question (object-action mapping). A card's own details live in the card window. The deck's overall picture lives on the Strategy tab. Both show the same facts, the same words and the same "who decided" marks. Detail opens on demand (progressive disclosure): numbers first, reasons one click away. Every Claude change is visible, labelled and undoable (D-034).

**What this spec covers**
1. The **card window**: what opens when you click a card name in a deck, and every state it can be in.
2. **Editing** in place, and **Claude proposals** (applied at once, labelled, accept, change, dismiss, undo).
3. The **Strategy tab**: one tab in three layers (Build, Your strategy, Card jobs), layouts for laptop and phone, states, flows and wording.
4. **Deck health in broad groups**, with the roll-up from universal roles, the source of every number (build, common guide, or adjusted by your strategy point) and the reason behind every count.
5. Exact wording, and the three worked test decks.

Not covered: the stored data (Architect), build slices (brief section 9), and the brief's out-of-scope list (locked flag, role weights, copying strategy points between decks, bulk role pass, choosing another commander for comparison).

## 2. The idea in plain words

Every card carries up to three kinds of label, and sits in a category. They are kept apart on purpose. Health groups are a fourth, broader layer built from them.

| Label | What it means | Same everywhere? | Example |
|---|---|---|---|
| **Universal role** (fine) | What the card is commonly known to do in any deck. | Yes. Same in every deck and every printing. | Sol Ring is Ramp. Lightning Bolt is Targeted removal. |
| **Category** | **Where the card sits in this deck's list.** Your own grouping name. Free text. | No. Per deck. | Sol Ring is filed under "Mana Rocks" in one deck and "Ramp" in another. A category called "Ramp" and the role Ramp can both be on one card. They do not affect each other. |
| **Job** (deck job) and **Why it is here** | **Why the card is in this deck.** Optional. Its reason is one sentence. | No. Per deck. | Rhystic Study: Engine. "Draws a card whenever opponents cast spells." |
| **Health group** (broad) | The common deckbuilding group a card's roles add up to when health is counted. | Same grouping everywhere; the counts are per deck. | Targeted removal and Board wipe both add to **Interaction**. |

A **strategy point** is a statement of the deck's strategy, with the cards or the card type it covers ("every artifact counts as a mana source"). It is saved on one deck, not on a card. The card window shows the strategy points that apply to the card, and the Strategy tab lists all of them.

**Category versus job, in one line each.** *Category: where it sits in the list.* *Job: why it is in the deck.* Sol Ring can be in the category "Mana Rocks" and have the job "Enabler". Section 6.7 says how the two are kept apart when their names overlap.

**Roll-up:** universal roles (fine) feed health groups (broad); the numbers each group is judged against come from the picked build first, then the commander's all-builds average, then the common guide; this deck's jobs and strategy points then adjust the counts. Category names never change a count.

## 3. Words used on these screens

Existing words are reused as they are: **In deck**, **Planned**, **Brewing / Assembling / Playable** (deck status), **Checking…**, **Couldn't check**, **Try again**, **Recent changes**, **Pending**, **Made by AI**, **Original**, **Proxy**, **Light** (health). New words below. Add them to the shared vocabulary at close-out (brief section 6).

| Word | Where you see it | Meaning |
|---|---|---|
| **Universal role** | Card window section title | The common, deck-independent role of a card. |
| **Category** | Card window field label, deck list "Group by", category manager | Where a card sits in this deck's list. Hint: "Category: where it sits in the list". |
| **Job** | Card window field label, Card jobs layer, deck list "Group by" | Why a card is in this deck. Hint: "Job: why it is in the deck". |
| **Why it is here** | Card window section title | One sentence explaining the job. |
| **Strategy points** / **Strategy points that apply** | Your strategy layer; card window section | Strategy points on this deck / those that cover this card. (Formerly "deck rules".) |
| **Notes** | Your strategy layer | The free-text box (formerly "strategy notes"). **Earlier notes** is today's dated list, kept under it. |
| **Build** | Strategy tab, layer 1 | The EDHREC build for the commander (for example Aggro), with its guide, typical numbers and starting categories. |
| **Your strategy** | Strategy tab, layer 2 | This deck's plan, strategy points and Notes. Refines the build. |
| **Card jobs** | Strategy tab, layer 3 | Every card's job. Refines your strategy. |
| **Common guide** / **from the Aggro build** / **adjusted by your strategy point** | Next to every health number | Where the number came from (section 10.4). |
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
- From the Strategy tab, clicking a card name in any list (jobs, strategy points, health breakdown) opens the same window.
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
|           |  CATEGORY                   |      | (Card draw) (Stax/tax) [+]|
|           |  where it sits in the list  |      | CATEGORY                  |
|           |  Engines            [Edit]  |      | where it sits in the list |
|           |  JOB                        |      | ...same sections, stacked |
|           |  why it is in the deck      |      +---------------------------+
|           |  [Engine v]  Set by you     |
|           |  WHY IT IS HERE             |
|           |  Draws whenever opponents.. |
|           |  STRATEGY POINTS THAT APPLY |
|           |  None                       |
|           |  COUNTS AS                  |
|           |  Card advantage, from role  |
|           |  Saved                      |
+----------------------------------------+
```

Order of sections, top to bottom: picture and name with the placement badge; **Universal roles**; **Category** (hint: where it sits in the list); **Job** (hint: why it is in the deck) with its **Serves** line (6.3a); **Why it is here**; **Strategy points that apply**; **Counts as**. A line at the bottom shows the save state ("Saving…", "Saved", or the error in section 11). A small link under Deck job reads "See all jobs on the Strategy tab".

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

### 6.2 Category (where the card sits in this deck's list)

- **Field label "Category"**, with the one-line hint under it in quiet text: **"Category: where it sits in the list"**. The label and hint are always visible, never only on hover, so the two fields cannot be mistaken for each other.

- Shows the current category, for example "Engines". A card can hold more than one category (the first is its main one, up to three in the app); the window shows them as chips with an **Edit** button, using the existing category edit behaviour.
- A category named "Ramp" is allowed on a card that also holds the role Ramp, and on a card that does not. (Q3: "A card can be ramp in both category and role.") The note says so.
- When a newly added card has no category, the suggestion comes from its first universal role (Sol Ring suggests "Ramp"), using your deck's own names where they exist: "Suggested: Ramp. **Use this**". It is never applied without a click.
- Note under it: "This is your name for the card in this deck. It doesn't change how the card is counted. A card can be Ramp here and also hold the role Ramp."

### 6.3 Job (why the card is in this deck)

- **Field label "Job"**, with the one-line hint under it in quiet text: **"Job: why it is in the deck"**. Always visible, directly below the Category field, in a visually separate block (own heading, own divider), so the two are read as two different questions.
- **Optional.** With no job set the field reads "No job set" and nothing else; it is never shown as an error or a gap.

- One job per card (Q4). A picker with the starting list: **Engine** (keeps producing value), **Enabler** (makes the plan possible), **Payoff** (rewards the plan), **Win condition** (ends the game), **Combo piece** (part of a specific combo), **Commander support** (protects or helps the commander), **Flex** (fills a slot, easy to swap). Each option shows its one-line meaning.
- **Add your own job** at the bottom of the picker: a text box, up to 40 characters. Once used, your name appears in this deck's picker and on the Strategy tab.
- **Clear job** returns the card to "No job set". Not every card needs a job (lands often have none).
- The list is a draft you and Claude refine together. Nothing in the window treats the seven as final.

### 6.3a Serves (which part of the strategy this job is for)
- **Shown only when the card has a job and a link exists.** One quiet line directly under the Job field: **"Serves: Urza makes mana from artifacts"** (the item's sentence, cut at about 60 characters with the full text on hover or tap). With a job and no link, nothing is shown, not even a prompt, except a small text button **Link to strategy** that appears only when the deck has at least one strategy item or strategy point. With no job there is no Serves line and no button.
- **Who set it** uses the usual labels: "Set by you" (filled) or "Proposed by Claude" (outline robot icon) with Accept, Change, Dismiss. An unconfirmed link reads "Serves (proposed, not confirmed): …".
- **Change** opens a small picker listing this deck's items (by kind: Aim, What the commander enables, Win condition, Play it like) and its strategy points, plus **No link**. Choosing one saves at once; "Saved" and the 10-second Undo as everywhere else. A link points at exactly one item or point.
- **A link never changes a count.** The Counts as section does not mention it, and the hint under the line says "This explains the job. It doesn't change any health count."
- If the item or point it served is later removed, the line disappears and nothing else changes.
- Phone: the line wraps to two lines; the picker is a full-width sheet.
### 6.4 Why it is here

- A single text box, up to 200 characters. Placeholder: "One sentence on what this card does for this deck."
- Saves when you leave the box or press Enter. A card can have a reason without a job, and a job without a reason.
- Job and reason are proposed and accepted together as a pair (section 7).

### 6.5 Strategy points that apply

- Lists the strategy points on this deck that cover this card. Each shows the strategy point sentence, "Set by you" or "Proposed by Claude", and, if it adds a count, "Counts as Ramp".
- Each row has **Edit strategy point** (opens the strategy point editor, section 9) and **Stop applying to this card** (takes only this card out of the strategy point).
- **Add a strategy point for this card** opens the strategy point editor with this card already chosen.
- A strategy point covers cards by **type** ("all artifacts") or by a **hand-picked list**. Matching on rules-text wording is later.

### 6.6 Counts as

The plain answer to "why does this card show up in my health numbers?" One line per health group, each with its reason. Examples:

- "Ramp, because of the deck strategy point: every artifact counts as a mana source."
- "Card advantage, from its role Card draw."
- "Interaction, from its role Targeted removal."
- "Interaction, from its roles Targeted removal and Counterspell. It counts once."
- "Interaction, from card text (no role set yet)."
- "Not counted. Lands have their own group, Lands."
- "Not counted. This card is in the Maybeboard." (Commander: "Not counted. The commander isn't part of these counts.")
- "Not counted in a health group. Its roles (Protection, Recursion) aren't counted in health yet."
- "No counts. This card has no role, job or strategy point that adds to a health group."

A card counts once in each health group it feeds, even if two of its roles feed the same group.

### 6.7 Category versus job: how the two are kept apart
Both stay (D-a, option A). A category can have the same words as a job, and nothing here changes that. How to avoid confusion:

1. **Two fields, two hints, always.** The card window never shows Category and Job as one combined field. Wherever either appears on its own (the category manager, the Card jobs layer, the deck list's "Group by"), its hint or heading says which question it answers.
2. **Never merged automatically.** Oracle never copies a category into a job, a job into a category, or renames one because of the other. Setting a job does not move the card between categories. Changing a category does not change the job. Undo of one never touches the other.
3. **A category named like a job** (example: a category called "Sacrifice payoffs", and the job "Payoff"). Both show exactly as you named them. Neither is flagged as a mistake.
4. **Claude may notice and say so, in a proposal.** If Claude sees a category whose name matches a job, it may add a line to its proposal and ask: "Your category Sacrifice payoffs looks like the job Payoff. Do you want me to propose Payoff as the job for these 9 cards?" The line appears in the chat reply and in the batch row on the Strategy tab. You answer yes or no. A yes proposes jobs only (labelled Proposed by Claude, undoable as a batch); the category is left as it is. A no is remembered for that category (the same memory as dismissed proposals, 7.4), so Claude does not ask again.
5. **The card window helps by showing both side by side.** Example for Sol Ring: *Category: Mana Rocks (where it sits in the list). Job: Enabler (why it is in the deck).*
6. **Deck list grouping** (6.8) is the one place where you can see the same cards arranged by either, one at a time, so you can compare them yourself.

### 6.8 Deck list: Group by Category or Job
- The deck list can be grouped by **Category** (the default, exactly as today) or by **Job**. The switch is a two-option toggle labelled "Group by".
- **Jobs stay out of the way until Claude has proposed some.** In a deck where no card has a job (the three test decks today), the deck list shows no "Group by" switch, no job headings, no "No job" markers and no empty job space. The Job field exists only in the card window ("No job set") and in the Card jobs layer of the Strategy tab, where its empty state offers to ask Claude. The switch appears as soon as one card has a job (set by you or proposed by Claude).
- **Grouped by Job:** headings are the job names, in the order of the starting list and then your own names, with the card count. Cards with no job go in a last group **No job set**. Each card still shows its category as a small label, so you do not lose where it sits.
- **Grouped by Category:** unchanged from today.
- The choice is remembered per deck and per device. Switching never changes any card. It is a view only.
- On a phone the toggle sits above the list with a 44 px target.

## 7. Claude proposals: applied at once, labelled, undoable

Claude can propose universal roles, a job with its reason, and deck strategy points. **Since the owner's answer to Q8 ("Give Claude more freedom for now. As long as I can Undo."), proposals are applied immediately** at sizes up to the direct limit of 120 cards per request (CC-13). Nothing waits for approval at normal sizes. Claude never overwrites something you set. If you have set a value and Claude proposes a different one, the proposal shows beside yours and yours stays in force until you choose.

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
- Undo is refused for a card, in words, if that card's roles, job or strategy points were changed since: "This can't be undone because Rhystic Study has changed since. You can change it by hand in the card window."
- **Undo all with some cards changed since:** cards still as Claude left them are undone; cards you accepted or changed since are left alone and listed: "Undone for 39 cards. 12 cards you had accepted or changed were left as they are." **[New behaviour, needs owner confirmation, section 17]**
- Proposals you accepted or changed stay in Recent changes with the label "Accepted by you" or "Changed by you".

### 7.7 Your own edits and undo

Every edit you make saves immediately and shows "Saved" with an **Undo** button for 10 seconds. Recent changes lists Made by AI changes only, so your own edits do not appear there. The card window shows one line under each section, "Last changed by you · 14 Nov". Whether you want a full history of your own edits too is open (section 17).

### 7.8 Accept all: confirmation

"Accept all 51 proposals in Arti-facts? They become yours and Claude won't overwrite them. **Accept all** · **Cancel**". After accepting: toast "51 proposals accepted. **Undo**" for 10 seconds.

### 7.9 Tools Claude gets (for the owner to know, not to design)

Claude can read roles, jobs, reasons and strategy points on a deck's cards, and propose them for up to 120 cards per request (a card with a role and a job counts once; **[Architect to confirm against the existing limits]**). Each proposal carries the card, the value, a one-line reason and "Claude" as proposer. Claude cannot set the "Set by you" label and cannot approve its own held proposals.

## 8. The Strategy tab: one tab, three layers

The Strategy tab is the home of the deck's strategy. Version 2 put the EDHREC build picker, its guide and the category manager in a separate "Commander guide" section below the owner's own sections. **That section is gone.** The tab is now one thing, organised in three layers from general to specific. Each layer refines the one before it.

### 8.1 What exists today and what changes

| Today (read from the app, 2026-11-18) | In this design |
|---|---|
| Commander overview, **build picker** (a dropdown plus build chips; "General (no specific build)" is one choice), the **build's strategy guide** from EDHREC. Shown only when a commander record is linked. | **Layer 1, Build.** Same content. |
| **Category manager** (only when a build is picked): core categories Ramp, Draw, Removal and Lands with the build's "recommended" counts and "below avg" and "above avg" markers, custom categories, overlap warnings, Add category, Sync to Archidekt. | **Layer 1, Build**, as "Categories". Same content and behaviour. |
| **Deck Intent**: win condition, playgroup (stored as "table context"), bracket, budget, frustrations, format, and a free-text box called "strategy notes". Collapsed by default; "Configure" or "Edit" button; "Configured" badge. | **Layer 2, Your strategy.** Same fields and same save. Shown as readable text, **open by default**, with Edit. The strategy notes box is renamed **Notes**. |
| **Notes**: a separate list of dated notes at the bottom. | Kept, moved under the Notes box in Your strategy as **Earlier notes** (**Answered** 2026-11-18: Agree, brief 7d item 2). |
| Hidden on a phone | **Shown on a phone** (owner confirms, section 17). |
| No jobs, strategy points, proposals or health | **New:** Summary line, Claude's proposals, **Strategy points** (in Your strategy), **Card jobs** (layer 3), **Deck health**. |
| The three test decks show only the Deck Intent box and an empty Notes, because no commander record is linked. | The same decks now show all three layers, with the Build layer explaining how to link a commander (8.5). |

### 8.2 The three layers, and how they read together

| Layer | In plain words | What is in it | It refines |
|---|---|---|---|
| **1. Build** (general) | "Most decks like this one are built this way." | The EDHREC build picked for the commander (for example Aggro or Tokens): its strategy guide, its typical numbers (lands, ramp, card draw, removal, wipes), its starting categories with your count beside each. | Nothing. It is the starting point. |
| **2. Your strategy** (this deck) | "Here is how I want to play it, and what is special about my list." | Win condition (the plan), bracket, budget, playgroup, frustrations, **Notes**, and the **strategy points**. | The build. Where your plan differs, yours is the one that applies. |
| **3. Card jobs** (each card) | "Because of that plan, this card is here for this reason." | Every card's job and why, how many per job, who proposed each. | Your strategy, one card at a time. |

Example (illustrative; Murky Business once a build is linked): *Build:* "Aggro: about 10 ramp, 10 removal, wins in the first six turns." *Your strategy:* "I turn creatures into enchantments with Myrkul" and the strategy point "A -1/-1 counter cost is free once the card is a non-creature enchantment." *Card jobs:* "Devoted Druid: Engine."

Each layer's heading carries a one-line reminder of this ("Refines the build", "Refines your strategy"), so the order is visible without reading this spec. **Deck health** sits below the layers and reads all three (section 10): the build's numbers set the targets, and your strategy points and jobs adjust the counts.

### 8.3 Sections, in order

1. **Summary line**
2. **Claude's proposals** (only when there are proposals to look at)
3. **Layer 1: Build**
4. **Layer 2: Your strategy** (fields, Strategy points, Notes with Earlier notes)
5. **Layer 3: Card jobs**
6. **Deck health**

Reason for the order: general to specific, with what needs your attention (proposals) first. Moving the existing sections is listed in the brief for approval.

### 8.4 Component inventory

| Component | What it is | Built on |
|---|---|---|
| `StrategySummaryLine` | Deck status badge (Brewing, Assembling or Playable, as on the deck header), bracket, "Build: Aggro for Myrkul" (or "No build yet"), and counts "7 jobs set · 1 strategy point · 12 to look at". Each count is a link to its section. | `Badge` |
| `ProposalsBar` | Latest batches with count to look at, **Review**, **Accept all**, **Undo all**; "Show older batches". | `Button`, `Badge` |
| `BuildLayer` | Wraps the existing `CommanderOverview`, the build picker, `StrategyGuide` and the category manager, plus the "No build yet" state and the **Link commander** step. | existing components |
| `YourStrategyLayer` | The strategy items list (`StrategyItemsList`: Aim, What the commander enables, Win conditions, Play it like), the remaining Deck Intent fields as text with Edit, then `StrategyPointsList`, then Notes. | existing form, `Badge`, `Button` |
| `ServesLine` and `ServesPicker` | The "Serves: …" line under the Job field and its small picker (6.3a). | `Badge`, `dropdown-menu` |
| `StrategyPointsList` and `StrategyPointEditorDialog` | The list and the add/edit window (section 9). | `Button`, `dropdown-menu`, `dialog`, `Textarea`, `input`, `command` (card search) |
| `CardJobsLayer` | Job rows with counts; each expands to a card list. Filter chips. | `accordion`, `Badge`, `pill-toggle` |
| `GroupBySwitch` | "Group by: Category / Job" on the deck list (6.8). | `pill-toggle` |
| `DeckHealthSection` | Group rows, source on every row, roll-up table, per-group card list. | `Badge`, `accordion` |
| `AskClaudeMenu` | Button with four ready prompts; fills the deck chat, you press Send. | `dropdown-menu`; the existing chat prefill |
| `CardWindow` | Sections 4 to 6. | `dialog` |

### 8.5 Layouts

**Computer** (content column at the app's normal width; layers are stacked full-width bands separated by a thin line, no nested boxes, D-014 quiet default).

```
Strategy
Arti-facts · [Assembling · 84/100 in deck]  Bracket not set  Build: none yet
51 jobs set (51 proposed) · 1 strategy point · 52 to look at
--------------------------------------------------------------------
CLAUDE'S PROPOSALS
 Today 14:02  Claude proposed 51 jobs and 1 strategy point   52 to look at
 [Review] [Accept all] [Undo all]              [Show older batches]
====================================================================
1  BUILD  (general)  "Most decks like this are built this way"
   No build yet. Link this deck's commander to see its EDHREC builds,
   typical numbers and starting categories.            [Link commander]
--------------------------------------------------------------------
2  YOUR STRATEGY  (this deck)  "Refines the build"            [Edit]
 Win condition  Not set                Bracket   Not set
 Playgroup      Not set                Budget    Not set
 STRATEGY POINTS  1              [Add strategy point] [Ask Claude]
  "These artifacts count as mana sources"  Covers 3 cards · counts as Ramp
  (o) Proposed by Claude   [Accept][Change][Dismiss]
  Copy to my other decks with this commander      Coming later
 NOTES
  Not set                              Earlier notes: none yet
====================================================================
3  CARD JOBS  (each card)  "Refines your strategy"   [Ask Claude to propose v]
 Engine           8   ########           8 proposed
 Enabler         14   ##############    14 proposed
 ...
 No job set      33   (lands and others; fine)
   v Engine (8)   Skullclamp  "Turns every creature into cards"  (o) Proposed [Accept][Change][Dismiss]
====================================================================
DECK HEALTH   reads all three layers
 Lands            33   target 36   common guide
 Ramp             11   target 10   common guide · 3 adjusted by your strategy point
 Card advantage   14   target 10   common guide
 Interaction       3   target 10   common guide                 Light
 [How these roll up v]  [Chat about this]
```

(The numbers in this picture are illustrative of one possible state; the real ones come from the app.)

**Phone** (one column; each layer is a collapsible row whose closed state still shows its headline; buttons at least 44 px).

```
Strategy              [Assembling]
Arti-facts
52 to look at
+--------------------------------+
| CLAUDE'S PROPOSALS         (52)|
| Claude proposed 51 jobs, 1 s.p.|
| [Review]  [Accept all]         |
| [Undo all]                     |
+--------------------------------+
| v 1 Build          No build yet|
| v 2 Your strategy    1 point   |
| v 3 Card jobs   51 · 51 prop.  |
| v Deck health    Ramp: Light   |
+--------------------------------+
```

On a phone, Review opens the Card jobs list filtered to Proposed; job rows are single lines (name, why in two lines at most), tapping a name opens the card window as a full-height sheet; Accept, Change and Dismiss move into a row menu (a "..." button) so the list stays readable. Layers open one at a time (the one you open closes the previous) so you aren't scrolling through all of them.

### 8.6 Section by section

#### Summary line
- Shows deck status using the existing automatic words and the existing deck header count. If the status can't be worked out: "Couldn't check status. **Try again**" (never a guess).
- Shows the build in words: "Build: Aggro for Myrkul, Lord of Bones", "Build: General for Myrkul" (when the picker is on General), or "No build yet".
- Counts are links that scroll to the section.

#### Claude's proposals (bar)
- Appears only when at least one Claude proposal is still to look at (applied but not accepted, changed or dismissed) or a different suggestion sits beside a value you set.
- One row per batch (most recent three; "Show older batches" for the rest within 7 days). Each row: time, what ("51 jobs and 1 strategy point"), "N to look at", and buttons.
- **Review:** scrolls to Card jobs filtered to Proposed (or to the Strategy points list if the batch was strategy points). On a phone, opens that list.
- **Accept all:** section 7.8. **Undo all:** section 7.6; confirmation line first: "Undo Claude's changes to 51 cards in Arti-facts? Each card goes back to what it had before." **Undo all** · **Cancel**.
- When all of a batch is looked at, the row stays 7 days with "All looked at" and, if undo is still allowed, "Undo all". When nothing is within 7 days, the bar disappears.
- Held-for-approval batches (over 120 cards) show here as "Waiting for your approval: 150 changes. **Review in Pending**" with no Accept or Undo.

#### Layer 1: Build
- **With a commander record linked** (not the case for the three test decks today): exactly today's content. Commander overview with build chips, the build picker ("General (no specific build)" and each build with its deck count), "12.4% of Myrkul decks", the build's **strategy guide**, and **Categories** (the category manager). The categories header says "Where cards sit in your list" so the word Category means the same thing here as in the card window (6.7). The build's typical numbers appear as the "/ 10" beside each core category, as today, and feed deck health (section 10).
- **With no commander record linked** (the three test decks): the layer is shown, not hidden. It reads: "No build yet. Link this deck's commander to see its EDHREC builds, typical numbers and starting categories. This doesn't affect Your strategy, Card jobs or health." Button **Link commander**.
  - **Link commander:** opens a small window with a search box filled with the deck's commander name (for example "Myrkul, Lord of Bones"). You choose the matching commander. Saving links the deck to that commander record; the build chips and picker then appear with "General (no specific build)" selected. **Nothing else about the deck changes.** [The deck can already store a commander record; the Architect confirms how the tab sets it.]
  - **Rocco's Secret Sauce:** the matching commander is Rocco, Cabaretti Caterer. Picking Norin the Wary as the reference commander is RQ-06 and not part of this feature. The window says so: "Choosing a different commander to compare against is coming later."
  - **No match:** "We couldn't find this commander in the EDHREC data. Nothing has changed. **Try again** or **Search for another name**."
  - **Save failed:** "Couldn't link the commander. Your deck hasn't changed. **Try again**."
- **Picking a build:** as today. While saving, a small spinner; failure: "Couldn't save the build. **Try again**." On success the build's guide, categories and numbers update and a change notice appears in Deck health if any target moved ("Interaction target changed from 10 to 7 because you picked the Aggro build").
- **Build picked but its guide can't load:** "Couldn't load the Aggro guide. Nothing has changed. **Try again**." The numbers the build carries still count.

#### Layer 2: Your strategy
- **Header:** "Your strategy", the reminder "Refines the build", **Edit**.
- **Strategy items (new).** A short list, at most 7, in this order, each one sentence. Group headings: **Aim** (one), **What the commander enables** (up to 3), **Win conditions** (up to 3), **Play it like** (optional, one: a reference commander such as "Norin the Wary"; read only for now, nothing is looked up from it). Each row shows the sentence, its label, and **Edit** / **Remove** for yours.
  - **Set by you:** filled label. **Proposed by Claude:** outline robot label, the text "Unconfirmed: Claude is assuming this", Accept, Change, Dismiss, and **"Based on:"** up to five card names (each opens the card window). Claude's reason (one line) sits under it. A proposal is already in use by Claude as an assumption, never as something you said. Example row: *Commander enables: Urza turns every artifact into mana. (Proposed by Claude · Unconfirmed · Based on Urza, Lord High Artificer; Sol Ring; Mind Stone)*.
  - **Claude's new wording for your item** shows under your item as "Claude suggests this wording instead" with Accept, Change, Dismiss. Your item stays as it is until you accept.
  - **An item names no cards.** Cards are linked only through strategy points (below) and through a card's "Serves" line (6.3a).
  - **Add item** (a small form: kind picker, one sentence up to 300 characters, **Save item**); a kind that is full is greyed with the reason ("3 of 3 used"). The deck's 8th item is refused: "This deck already has 7 strategy items. Remove or merge one first."
  - **Ask Claude** fills the chat with: "Please read [deck] and propose the Aim, what the commander enables and the win conditions as short items. Mark each as an assumption and tell me which cards you based it on. If the bracket isn't set, ask me first. Don't change anything I set myself."
  - **Empty:** "No strategy items yet. An item is one sentence about how this deck works, for example 'Urza turns every artifact into mana.' **Add item** or **Ask Claude**."
  - **Your written win condition** is now the first Win condition item, "Set by you" (it was copied; the old text is kept but no longer shown). If it was too long to copy (over 300 characters) it shows as a read-only line "Too long to copy. Split it into items." with **Add item**.
- **Bracket and the rest of the fields:** the read view shows each remaining field's text or "Not set": **Bracket (required, shown first)**, Playgroup, Budget, Frustrations, Format. An empty bracket shows "Not set. Claude will ask you." **Edit** opens today's form without the win condition box (it moved into the items).
- **Strategy points:** header "Strategy points", count, **Add strategy point**, **Ask Claude** (strategy points prompt).
  - **Each row:** the sentence, who set it ("Set by you" or "Proposed by Claude" with Accept, Change, Dismiss), "Covers N cards" (click to expand the card list; each card opens the card window), "Counts as Ramp / Card advantage / Interaction" or "Counts as: nothing extra (explains the card, changes no count)", **Edit**, **Remove**.
  - **Copy to my other decks with this commander:** a disabled text line under the list, "Coming later". No button. (Q5.)
  - Strategy points belong to this deck, not the commander (Q5). The editor is section 9.
- **A question, not a cut list:** when cards have no job, no link and no strategy point, one quiet line under the lists: "These 9 cards serve nothing yet. **Show them**." It is a question for you. Nothing is flagged, stored or cut because of it, and it is separate from any pet-card marking.
- **Notes:** the free-text box formerly called "strategy notes", now **Notes**: "Anything else about how you want to play this deck." Claude can add a dated paragraph at the end ("Claude, 2026-11-18: …") but never replaces your text. Under it, **Earlier notes** (today's dated notes list, unchanged). On failure to load the dated list: "Couldn't load earlier notes. **Try again**."
- **Empty (whole layer):** "Say how this deck wins and what table it is for. Claude reads this when it advises you. **Edit** or **Ask Claude**".
#### Layer 3: Card jobs
- **Header:** "Card jobs", the reminder "Refines your strategy", total jobs set, a line "N proposed by Claude · M set by you", **Ask Claude to propose** (menu, 8.8), and a filter: **All, Proposed by Claude, Set by you, No job set**.
- **Overview rows:** one per job (the seven starting jobs plus any of your own names used in this deck), each with the card count, a simple bar (decorative; the number is the information), and a mix label "6 proposed · 2 yours". A last row **No job set** with its count and the quiet note "Fine for lands and filler. Not every card needs a job."
- **Expanding a row** lists its cards: card name (opens the card window), "Why it is here" (two lines, tap to read more), who set it (outline robot chip "Proposed by Claude" or filled "Set by you"), and for proposals the buttons Accept, Change (opens the card window on the Job field), Dismiss. A row header has **Accept all in Engine** for proposals in that job.
- **Moving a card between jobs** is done in the card window (Change). No drag and drop in this first version. **[No pointer-only interactions; every action is a button.]**
- Jobs are counted over the main deck; the Maybeboard has its own line "Maybeboard: 4 cards, 0 with a job".
- Own job names appear as extra rows; when its last card is cleared the row disappears.
- **Empty (no jobs yet):** "No jobs set. A job says why a card is in this deck, for example Engine or Payoff. It is separate from a category, which is where the card sits in your list. **Set a job in the card window** or **Ask Claude to propose jobs**."

#### Deck health
- Full description in section 10. In the tab it shows: the source line, the four groups with have, target, **where the target came from** (Set by you, Set by Claude with its reason and an Undo, or a fallback source), and a Light marker, the Plan and win conditions line, **How these roll up**, a click-through list of cards per group, the change notice, and **Chat about this** (the existing question to the deck chat, sent at once, because it only asks a question).

### 8.7 States of the whole tab

Each section loads and fails on its own (D-030). The tab frame (title, summary line) shows at once with what is known.

| State | What you see |
|---|---|
| **A. Empty: nothing set, no build** (the three test decks today) | Summary line: "Nothing set for this deck yet · No build yet · 0 jobs · 0 strategy points". No proposals bar. **Build:** "No build yet. Link this deck's commander…" with **Link commander**. **Your strategy:** "Not set" on each field and the one-line prompt; Strategy points: "No strategy points yet. A strategy point is a statement of this deck's strategy that covers some cards, for example 'every artifact counts as a mana source'. **Add strategy point** or **Ask Claude to propose strategy points**."; Notes: "Not set". **Card jobs:** the empty wording (8.6). **Deck health:** source line "Using the common guide. No build is picked, and no roles, jobs or strategy points are set for this deck yet." and the four groups, each marked "common guide". Nothing is shown as a zero because it is unknown. |
| **B. Claude has just proposed a full deck** (for example 51 jobs and 1 strategy point applied at once) | Summary line counts "52 to look at". Proposals bar at the top with Review, Accept all, Undo all. Card jobs filled, every row marked "proposed". Strategy points shows the proposed one with Accept, Change, Dismiss. Health source line: "Using what's set for this deck: 51 jobs, 1 strategy point. (52 are still Proposed by Claude.)" and, if a count moved, the change notice. Everything is already applied; nothing is waiting. A first-time hint line under the bar: "Claude has already applied these. Look them over and Accept what's right, or Undo all." |
| **C. Owner has edited** (some accepted, some changed, one different suggestion beside yours) | Bar shows the remaining "16 to look at" and a second line "1 card has a different suggestion from Claude. **Review**". Job rows show a mix "6 proposed · 2 yours". Accepted and changed values are filled "Set by you". Claude's batch row shows "Accepted 34 · Changed 2 · 15 to look at". Undo all still offered; it leaves your accepted and changed cards alone (7.6). |
| **D. Looked at and done** | No proposals bar. Jobs filled with "Set by you". Health source line "Using what you've set for this deck: 51 jobs, 1 strategy point." |
| **E. Loading** | Skeleton bands shaped like each section, each section title already visible. Screen-reader text: "Checking card jobs." |
| **F. One section can't load** | In place of the section: "Couldn't load card jobs. Nothing has changed. **Try again**." The other sections stay usable. A failed health check never shows a zero (10.5). |
| **G. Offline** | "You're offline. Changes can't be saved." Accept, Undo all and edits are disabled and say why; nothing shows "Saved" when it wasn't. |
| **H. Held for approval** (over 120 cards in one request) | Bar row "Waiting for your approval: 150 changes. **Review in Pending**". The sections show what they had before. |
| **I. A build is picked** (a deck with a commander record and the Aggro build) | Build layer shows the guide, the build's numbers and the categories with "below avg" markers. Health rows say "from the Aggro build" next to each number the build has, and "common guide" where it has none. |

### 8.8 Ask Claude to propose

Button with a menu of four ready prompts. Choosing one opens the deck chat and **fills in** the message; you press Send. (A prompt that can change up to 120 cards should not fire on a single click. **[Owner confirms, section 17.]**) The prompt names the deck and can be edited before sending. The menu appears on the proposals bar (when empty-state), in the Card jobs header, in the Strategy points header, and in each empty state.

| Menu item | Ready prompt (exact text; `[deck]` is the deck name) |
|---|---|
| Propose roles | "Please propose universal roles for every card in [deck] that has none set. Use only the 13 roles. Don't change roles I set myself. When you're done, tell me how many cards you changed." |
| Propose jobs | "Please propose a deck job and a one-sentence reason for every card in [deck] that has a job to do. Use the starting jobs (Engine, Enabler, Payoff, Win condition, Combo piece, Commander support, Flex) or my own names if I've added any. Leave a card with no job if it doesn't need one, such as most lands. Don't change anything I set myself. If one of my category names looks like a job, tell me about it and ask; don't copy it across." |
| Propose strategy points | "Please look at [deck] and propose deck strategy points: short sentences about groups of cards that change what they are worth in this deck, for example 'every artifact counts as a mana source'. For each strategy point, say which cards it covers and which health group it counts toward, if any. Don't change strategy points I set myself." |
| Propose everything | "Please set up [deck] for me: propose universal roles, a deck job and reason for each card that needs one, and any deck strategy points that apply. Don't change anything I set myself. Give me one summary at the end." |

If the deck chat can't open: "Couldn't open the chat. Your deck hasn't changed. **Try again**." If the chat is already open with unsent text: the prompt is added on a new line, never replacing what you typed.

### 8.9 Flows

**Accept, Change, Dismiss on the tab.** Same as 7.2 to 7.4, per row or per list. Accept shows "Saved" and the row loses its robot icon; the summary counts and the bar update at once. Change opens the card window on the field. Dismiss shows the 10-second Undo toast.

**Undo a whole batch.** Bar, **Undo all**, confirmation with the count, then "Undone for 51 cards. Arti-facts is as it was before." with the partial wording from 7.6 when some cards were changed since. Focus returns to the bar's heading, and the change is announced to screen readers. If undo fails: "Couldn't undo. Nothing was changed. **Try again**." The batch is also in Recent changes.

**Add, edit, remove a strategy point.** Section 9. The strategy points list updates and, if the strategy point counts toward a group, the change notice appears in Deck health.

**Edit the strategy.** As today (Edit, fields, Save, "Strategy saved"). On failure: "Couldn't save the strategy. Your text is still here. **Try again**."

**Ask Claude.** 8.8.

**Keyboard.** All buttons, rows and menus are reachable with Tab. Rows expand with Enter or Space. A job row is a button with "Engine, 8 cards, 8 proposed by Claude, collapsed".

### 8.10 Data binding (what each element reads)

No contract exists yet; the Architect writes it from these needs. **No stored data is invented here.**

| Element | Needs |
|---|---|
| Your strategy fields, Notes and Earlier notes | Existing deck strategy, strategy notes (now shown as Notes) and dated notes (unchanged). |
| Summary line status | The existing deck state check. |
| Build layer | The deck's commander record and picked build (both already stored on the deck), the build's guide and averages (existing EDHREC data), and the deck's categories. |
| Health targets and their source words | The picked build's averages first (lands, ramp, card draw, removal, wipes), else the common guide numbers in section 10.2. |
| Deck list "Group by" | Each card's category (existing) and job (new). |
| Deck jobs | Per card in this deck: job, reason, who proposed it (you or Claude), whether it is still to look at, which batch it came from. |
| Strategy items | Per item: kind, sentence, reason, who set it, unconfirmed or confirmed, up to five "based on" cards, which item it would replace, still to look at, batch. |
| Serves line | Per card in this deck: the linked item or strategy point (its sentence), who set it, whether it is still to look at. Shown only with a job. |
| Strategy changed notice | The newest update time of the deck's strategy fields, items and strategy points against the newest update time of a number Claude set. Nothing extra is stored. |
| Deck strategy points | Per strategy point: sentence, covers (type or card list), "counts as" group or none, who proposed it, still to look at, batch. |
| Claude's proposals bar | Batches from the change log (time, what, how many, how many still to look at), and whether Undo is still allowed. |
| Deck health | Universal roles per card, the roll-up table (section 10), jobs and strategy points, and the picked build's averages (else the common guide numbers). |
| Dismissed proposals | A memory per card and deck of what you dismissed. |

## 9. Deck strategy points: the editor

A strategy point is made and managed in the Your strategy layer of the Strategy tab (and from a card's window), because it covers many cards.

- **Add or edit a strategy point** (a window):
  1. **Strategy point**: one sentence, up to 200 characters. Example: "Every artifact counts as a mana source."
  2. **Covers**: either **All cards of a type** (a type picker: Artifact, Creature, Enchantment, Land and so on) or **Chosen cards** (a search box over this deck's cards, with chips).
  3. **Counts as** (optional): None, or one of Ramp, Card advantage, Interaction. This is what changes health counts. A strategy point with None changes no count; it only appears on the covered cards as a note.
  4. A live line under the form: "Covers 19 cards in this deck." and, if a group is chosen, "Ramp would go from 8 to 21 of 10 (common guide)." The target named is whichever source applies to the deck (from the build, or common guide). The numbers are worked out by the app, not typed. **A land never counts as Ramp:** "2 of the 19 are lands and stay in Lands." A card already counted in that group is not counted twice: "4 are already counted as Ramp."
  5. Buttons **Save strategy point** and **Cancel**.
- **Remove a strategy point:** a confirmation: "Remove this strategy point? The cards it covers go back to their roles. Ramp would go from 11 to 8." **Remove strategy point** and **Cancel**. Undo for 10 seconds.
- **Strategy point too broad:** if a type strategy point covers more than half the deck, a warning shows before saving: "This strategy point covers 62 of 100 cards. Is that what you mean?" Saving is still allowed.
- Strategy points belong to this deck, not to its commander. A second deck with the same commander starts with no strategy points. Copying is later and shown as "Coming later".
- Claude's proposed strategy points appear in the same list with "Proposed by Claude" and Accept, Change, Dismiss on each row, and follow section 7.

## 10. Deck health in broad groups (Q6, changed; D-d)

### 10.1 The idea
Health speaks the common deckbuilding language: lands, ramp, card advantage, **interaction**. Interaction is targeted removal, board wipes, counterspells and similar, counted together against one number. Fine-grained universal roles feed these broad groups. Each group has a **count** (what the deck has) and a **target** (what it is judged against). They come from different places, and **the screen always says where**:

- **Claude sets the targets from the deck's strategy (D-060).** The strategy (what the commander enables, the aim, the win conditions) decides how much of each group the deck needs. An Urza deck needs little ramp because the deck makes its own; a Hearthhull deck needs many lands because it is landfall. Claude sets each number itself, keeps it up to date when the strategy changes, and shows a short reason next to it. The owner is not asked to approve numbers.
- **The target comes from, in order:** (0) **your own number**, if you typed over it, shown as "**Set by you**" (Claude leaves it alone until you hand it back); (0b) **Claude's number from the deck's strategy**, shown as "**Set by Claude**" with its reason; then the fallback order for a group with neither, used where the deck has no strategy yet or Claude has not set that group: (1) the picked build's typical numbers, shown as "**from the Aggro build**"; (2) where there is no build, or the build has no number for that group, the commander's all-builds EDHREC average, shown as "**from the all-builds average for Mendicant Core**" (**Answered** 2026-11-18, brief 7d item 1: Agree); (3) where that has no number either, the common guide, shown as "**common guide**".
- **The count comes from** each card's universal role (or from its card text where no role is set yet), and is then **adjusted by your strategy points and jobs**, shown as "**adjusted by your strategy point**" (or "adjusted by your jobs") with the number of cards moved.

[Confirmed in the app: health today picks its numbers in this order: the commander's EDHREC average deck, else an EDHREC estimate, else a general guide, and it does not look at the picked build.] [**Answered 2026-11-18, brief 7d item 1: Agree.** A deck with no build, or a build with no number for a group, keeps today's first two sources (the commander's all-builds EDHREC average, then the estimate) before the common guide, worded "from the all-builds average for Myrkul". The target order is build, all-builds average, common guide.]

### 10.2 The roll-up (this table is what the app and the mockup must match)

| Health group (broad) | Universal roles that feed it (fine) | Common guide (when no build number) | Build number (used first when a build is picked) |
|---|---|---|---|
| **Lands** | Not a role. Any card whose type is Land. A land never counts as Ramp. | 36 | The build's average lands |
| **Ramp** | Ramp | 10 | The build's average ramp |
| **Card advantage** | Card draw | 10 | The build's average card draw |
| **Interaction** | Targeted removal, Board wipe, Counterspell, Hand disruption | 10 | The build's average removal plus average wipes (used only when the build has both; otherwise the common guide) |
| **Plan and win conditions** (only when jobs are set) | None. Deck jobs only: Engine, Enabler, Payoff, Combo piece (plan cards) and Win condition. | No judged number | None. Shown for information. |

The build numbers are the "recommended" counts the app already carries from the build's averages [Confirmed in the app: the category manager reads them for Ramp, Draw, Removal and Lands, and each build also stores average wipes]. Reading them in deck health is new.

Not counted in any group in the first version (they show in the card window only): **Fixing, Card selection, Tutor, Protection, Recursion, Graveyard hate, Stax/tax.**

How the count works:
- A card counts **once per group**, even when two of its roles feed the same group (a card that is both Targeted removal and Counterspell counts once in Interaction).
- Main deck only. The Maybeboard and the commander are not counted.
- Cards with no role yet use today's card-text reading as a stand-in: it can only produce Ramp, Card advantage (today's "draw"), Targeted removal and Board wipe. Because today's removal and wipes are summed into Interaction, **on day one the Interaction count equals today's Removal plus Wipes** (counted once per card).
- **Light** is unchanged: 2 or more short of the target. A target under 2 is never Light.
- A build picked later moves the targets, and the change notice says so (10.4). The count does not change.

### 10.3 How the build, jobs and strategy points refine the groups
- **The deck's strategy sets the targets, through Claude (D-060).** Where there is no strategy yet, the build sets them, then the all-builds average, then the common guide (see 10.1).
- A strategy point (never a job; owner decision 2026-11-18) can say "counts as Ramp / Card advantage / Interaction" for chosen cards (adds them to that group once), or "does not count" (removes them from a group they would otherwise feed). These change the **count**, never the target. The reason shows on the card ("Counts as") and in the group's card list.
- Jobs feed the **Plan and win conditions** group. Until at least one job is set, that line reads "Not counted until jobs are set."
- A deck-specific target ("my stax deck wants 14 interaction") is what Claude now sets from the strategy; you can override it (10.4).
- **Category stays separate.** A category never sets, moves or overrides a target, and a target never changes a category (D-060, D-a).
- Once-per-turn cost reducers (a Sapphire Medallion type) count as Ramp.

### 10.4 What the section shows
- **Source line**, one of five:
  - Claude has set the targets from the strategy: "Targets are set by Claude from this deck's strategy. Each number says why. You can change any number; Claude then leaves it alone until you hand it back."
  - Nothing set, no build: "Using the common guide. No build is picked, and no roles, jobs or strategy points are set for this deck yet. Counts come from each card's universal role, or from its card text where no role exists."
  - Build picked, nothing else set: "Targets are from the Aggro build where it has a number, and the common guide where it has none. No jobs or strategy points are set yet."
  - Some set: "Using what's set for this deck: 6 jobs, 1 strategy point. Targets are from the Aggro build and the common guide."
  - With proposals: add "(2 are still Proposed by Claude.)"
- **Each target set by Claude shows its reason and an Undo.** Example: "Ramp: 6 · target 4 · Set by Claude · "Little ramp needed: Urza makes its own mana from artifacts." **Undo** **Change**". Undo puts back the number that was there before (the fallback number or your earlier number) and stays available from Recent changes for 7 days, as every Claude change (D-034a, D-063). A whole update after a strategy change is one batch with one Undo all.
- **Overriding a number.** **Change** lets you type your own number. The row then reads "Ramp: 6 · target 8 · **Set by you**" with the line "Claude will leave this number alone." and a **Hand back to Claude** button. Pressing it removes your override; Claude then sets the number again from the strategy (and says why). Claude never overwrites a number you set. If the strategy changes and Claude would have moved an overridden number, the notice says "Claude left Ramp (set by you) alone. It would suggest 5." with **Hand back to Claude**; this is information, not an approval step.
- **No approval step.** Nothing waits for you to approve a health number. A change by Claude is already applied, labelled, and undoable.
- **A row per group, with its sources:** "Ramp: 11 · target 10 · common guide · 3 added by your strategy point". The target source is one of "Set by you", "Set by Claude" (with its reason), "from the Aggro build", "from the all-builds average for Mendicant Core" or "common guide". The count note is one of "all from card roles", "7 from roles, 2 from card text (no role set yet)", "adjusted by your strategy point (+3)" or "adjusted by your jobs". The **Light** marker shows where it applies (icon and word, not colour alone).
- **Click a group to see its cards.** Each card shows its reason, using the Counts as wording, and a tag: **Role**, **Strategy point**, **Job**, **Card text** or **Proposed**. Clicking a card opens its card window. The list is grouped by the universal role that put it there, so you see "Targeted removal 7 · Board wipe 2 · Counterspell 0 · Hand disruption 0".
- **How these roll up** (a small expandable table, the one in 10.2 with this deck's counts and each group's target source filled in):

```
HOW THESE ROLL UP            this deck   target    target from
Lands            Land cards      37        36      common guide
Ramp             Ramp            17        10      common guide
Card advantage   Card draw        8        10      common guide
Interaction      Targeted removal 7
                 Board wipe       2
                 Counterspell     0
                 Hand disruption  0
                 total            9        10      common guide  (a card counts once)
Not counted in health: Fixing, Card selection, Tutor, Protection,
Recursion, Graveyard hate, Stax/tax
```
- **Strategy changed after Claude set the numbers.** When you change anything in Your strategy (an item, a strategy point, the written fields or Notes) after the newest number Claude set, a quiet line appears above the rows: **"You changed your strategy after Claude set these numbers (Aim, 2 days ago). Ask Claude to refresh them."** with the button **Ask Claude to refresh** (fills the deck chat; you press Send). It disappears when Claude sets a number again. It is worked out from update times; nothing is stored for it. If Claude has set no numbers yet but a strategy exists: "Claude hasn't set targets for this strategy yet. **Ask Claude**." Removing an item does not trigger the line (there is no update time to compare); the line never says it will. Not shown when every number is yours (overridden).
- **Bracket first.** If the deck has no bracket, the source line adds "No bracket set. Claude will ask you which one before it sets numbers. **Set bracket**." Targets are set from the bracket plus the strategy; the build, the all-builds average and the common guide are the fallback until then. **(New order; owner to confirm.)**
- **Change notice.** When a deck's numbers change, the section shows a notice until you dismiss it, and lists the cards or targets that moved. Health numbers never move silently. Causes: Claude updated a target because the strategy changed ("Claude lowered Ramp from 10 to 4 because the strategy now says the deck makes its own mana. **Undo**"); you overrode or handed back a target; a role, job or strategy point was set, accepted, dismissed or undone ("Ramp changed from 8 to 11 because of 1 new strategy point"); or a build was picked or changed ("Interaction target changed from 10 to 7 because you picked the Aggro build"). **See what changed**.
- **Unknown stays unknown.** Cards with no card data are counted in a line "5 cards couldn't be checked" (existing behaviour).

### 10.5 When data can't be loaded
Follows `vocabulary.md` section 5. If Claude's targets can't be loaded, the section shows the fallback numbers and says "Couldn't load the targets Claude set. Showing the build, average or common guide numbers. **Try again**"; it never shows a zero. The section shows "Couldn't check deck health. Your cards and settings haven't changed. **Try again**" and never a zero. If roles loaded but jobs or strategy points did not: "Showing counts from roles only. Couldn't load this deck's strategy points and jobs. **Try again**."

### 10.6 Sources and what is not confirmed
- Today's app guide for decks with no typical numbers (ramp 10, draw 10, removal 6, wipes 2, lands 36) is in the app. Where it came from is not recorded. These are the common-guide numbers used when no build gives one; they still need a source check.
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
| **Category: none** | Hint "Category: where it sits in the list". "No category. **Add a category**" (and the suggestion, if the card has a universal role). |
| **Job: none** | Hint "Job: why it is in the deck". "No job set. **Set a job**. You can also ask Claude to propose jobs for this deck." (Link opens the Strategy tab menu.) Never shown as an error. |
| **Why: none** | Placeholder text only. No error. |
| **Strategy points: none** | "No deck strategy points apply to this card. **Add a strategy point for this card**" |
| **Saving** | "Saving…" at the bottom of the window; the changed control stays editable. |
| **Saved** | "Saved" at the bottom, and a 10-second **Undo** on the edit. |
| **Save failed** | "Couldn't save the job. Nothing was changed. **Try again**". What you entered stays on screen. Same pattern for roles, category, reason and strategy points. |
| **Changed while open** | "Claude or another screen changed this card while you had it open. Showing the latest." Your unsaved text stays below it with **Keep mine** and **Use latest**. |
| **Undo refused** | The reason in words (7.6). |
| **Strategy point effect can't be worked out** | "Couldn't work out the effect on health. You can still save the strategy point." The preview line is replaced, not left at zero. |
| **Card not in this deck any more** | "This card isn't in Arti-facts any more." with **Close**. |
| **Offline** | "You're offline. Changes can't be saved." Controls stay editable but Save is disabled; nothing is shown as "Saved" when it wasn't. |

Empty states appear only after a successful load. A failed load never shows an empty state.

## 12. Accessibility

- The card window and the strategy point editor are dialogs with a focus trap. Esc closes them. Focus goes to the close button on open and back to the opener on close.
- Every chip says its source in its accessible name: "Ramp, role, proposed by Claude, not yet accepted". The filled or outline shape is also said in words.
- Accept, Change, Dismiss and Undo are real buttons in tab order, in that order. After Accept, focus stays on the section title and "Saved" is announced. After Undo all, focus returns to the proposals bar heading and "Undone for 51 cards" is announced.
- Job rows, strategy point rows and health groups are disclosure buttons with their state in words ("Engine, 8 cards, collapsed"). Bars are decorative; the number is text.
- **Light** is icon plus word. Health group rows, status and "proposed" never use colour alone (D-012); any new colour pair must meet 4.5:1 for text and 3:1 for icons. The robot icon always comes with the words "Proposed by Claude". Greyscale test: outline and filled chips still differ.
- The Strategy tab's reading order is the section order in 8.3. Skeleton pulses and toasts respect reduced motion. On phone, each button is at least 44 px high.

## 13. Worked examples on the three test decks
Real facts below were read read-only from the app's data on 2026-11-18: all three decks have no strategy text, win condition, bracket, budget or notes, and **no commander record or build linked**. Their card lists and counts are from the audit. Because there is no build, **the Build layer is empty for all three**, and health uses the common guide (10.1). Numbers marked *illustrative* show a possible state; the app works out the real figures. Card text in quotes is example wording to show the layout, not a promise of what Claude will write.
**Update 2026-11-18 (owner answered brief 7d items 1 and 2, Agree).** The worked examples below were written with the common guide as the target for decks with no build. With the owner's answer, those decks use the commander's all-builds average first (numbers in 13.0), so the "target" figures and the words "common guide" in 13.1 to 13.3 read "from the all-builds average" where that average has a number. The Designer should refresh the examples; the Architect's contract uses the new order.

**What the Strategy tab shows for a deck with no build** (all three decks today): the Build layer reads "No build yet. Link this deck's commander to see its EDHREC builds, typical numbers and starting categories. This doesn't affect Your strategy, Card jobs or health." Your strategy and Card jobs show their normal empty states (8.7, state A). Deck health says "Using the common guide" on every line.

**How the owner links a build.** Press **Link commander** in the Build layer, confirm the commander the app suggests from the deck (Myrkul, Lord of Bones; Rocco, Cabaretti Caterer; Mendicant Core, Guidelight), and save. The build picker appears with "General (no specific build)" selected; pick a build and the guide, the build's numbers and the categories fill in, and health targets switch to "from the [build name] build" with a change notice. Nothing in Your strategy or Card jobs changes.

Counts today against the common guide (Lands 36, Ramp 10, Card advantage 10, Interaction 10; Light means 2 or more short):

| | Murky Business | Rocco's Secret Sauce | Arti-facts |
|---|---|---|---|
| Lands | 37 of 36 | 36 of 36 | 33 of 36 (**Light**, 3 short) |
| Ramp | 17 of 10 | 14 of 10 | 8 of 10 (**Light**, 2 short) |
| Card advantage | 8 of 10 (**Light**, 2 short) | 11 of 10 | 14 of 10 |
| Interaction (removal + wipes, up to) | 9 of 10 | 4 of 10 (**Light**, 6 short) | 3 of 10 (**Light**, 7 short) |

The owner chose to keep the commander's all-builds average as a middle step (brief 7d item 1, **Answered** 2026-11-18), so with no build the targets read as they do in the audit today: Murky Business 35 / 20 / 7 / 9, Rocco's Secret Sauce 35 / 22 / 7 / 6, Arti-facts 34 / 16 / 13 / 4 (lands, ramp, card advantage, interaction), each marked "from the all-builds average".

### 13.1 Arti-facts (commander Mendicant Core, Guidelight): a strategy point that covers many cards

Today: 84 cards (16 short, known). Strategy tab is state A (empty, no build): Your strategy "Not set", no jobs, no strategy points, health "Using the common guide": Lands 33 of 36, Ramp **8 of 10 (Light)**, Card advantage 14 of 10, Interaction up to 3 of 10 (removal 2 + wipes 1).

1. **Ask Claude.** In the Card jobs header you choose Ask Claude to propose, then **Propose everything**. The chat opens with the prompt filled in; you press Send.
2. **Claude applies at once.** Claude proposes jobs for the 51 cards that aren't lands (*illustrative*) and one strategy point. That is well under 120, so it is applied immediately and nothing waits for approval. The tab is now **state B**: the bar reads "Claude proposed 51 jobs and 1 strategy point · 52 to look at", Card jobs shows Engine 8, Enabler 14, Payoff 9, Win condition 3, Combo piece 4, Commander support 3, Flex 10, and "No job set 33 (lands, fine)". The deck list gains the "Group by: Category / Job" switch now that jobs exist; it still opens grouped by Category.
3. **The strategy point is too broad.** Claude proposed **"Every artifact counts as a mana source"**, counting as Ramp. Its own line reads (*illustrative*): "Covers 19 cards. 2 are lands (Ancient Den, Razortide Bridge) and stay in Lands. 4 are already counted as Ramp (Sol Ring, Arcane Signet, Azorius Signet, Mind Stone). Ramp would go from 8 to 21 of 10 (common guide)." It would count Skullclamp and Whispersilk Cloak as mana, which isn't what you mean (the brief's known risk).
4. **You change it.** **Change**, then switch Covers to Chosen cards and keep the artifacts that really make mana (*illustrative*: 3). Sentence becomes "These artifacts count as mana sources." The preview reads "Ramp would go from 8 to 11 of 10 (common guide)." You save. The strategy point is Set by you; the health section shows "Ramp changed from 8 to 11 because of 1 new strategy point. See what changed."
5. **Look over the jobs.** You expand Engine, find Skullclamp's reason "Turns every creature into cards" right, press **Accept**; you open Whispersilk Cloak and **Change** it to Flex. The batch row reads "Accepted 1 · Changed 2 (the strategy point and Whispersilk Cloak) · 49 to look at". You press **Accept all** for the rest after a quick read. **State D**.
6. **Open Sol Ring** (card window): Universal roles: Ramp (Standard). **Category** (where it sits in the list): Artifact. **Job** (why it is in the deck): Enabler, Set by you. Strategy points that apply: the strategy point above only if Sol Ring is on its list. Counts as: "Ramp, from its role. The strategy point also covers it; it still counts once."
7. **Open an Equipment** that isn't on the list: Strategy points that apply: none. Counts as: "No counts."
8. **Health now** reads "Using what you've set for this deck: 51 jobs, 1 strategy point. Targets are from the common guide." Ramp **11 of 10** · common guide · adjusted by your strategy point (+3), no longer Light; Interaction 3 of 10 (Light); Plan and win conditions "Plan cards 35 · Win conditions 3" (*illustrative*).
9. **Link a build (optional, later).** Press **Link commander** in the Build layer and pick a build (*illustrative*: an artifacts build with typical ramp 14). Health now says "Ramp: 11 · target 14 · from the Artifacts build · adjusted by your strategy point (+3)", and Ramp is Light again by 3. A change notice says the Ramp target moved from 10 to 14 because of the build.

### 13.2 Murky Business (commander Myrkul, Lord of Bones): a strategy point that changes no count

Today: 101 cards (one over, known). Strategy tab state A (no build). Health, common guide: Lands 37 of 36, Ramp 17 of 10, Card advantage **8 of 10 (Light)**, Interaction up to 9 of 10 (removal 7 + wipes 2).

**The strategy point: "A -1/-1 counter cost is free once the card is a non-creature enchantment."** The idea: when Myrkul turns a creature into an enchantment, putting a -1/-1 counter on it as a cost no longer shrinks or kills it, so the cost is free.

- Your strategy, **Add strategy point**. Sentence as above. **Covers: Chosen cards**: Devoted Druid and Cinderhaze Wretch (both real cards in this deck, filed as Creature). **Counts as: None**. The preview reads "Covers 2 cards. Health numbers don't change." Save.
- The strategy point's row reads: the sentence · Set by you · Covers 2 cards · "Counts as: nothing extra. It explains these cards and changes no count."
- Health source line: "Using the common guide. 1 strategy point is set; it doesn't change any count."
- Open Devoted Druid: Universal roles: Ramp (Standard). **Category** (where it sits in the list): Creature. **Job** (why it is in the deck): Engine, Proposed by Claude, "Makes mana every turn, and the counter cost is free once it is an enchantment." Strategy points that apply: the strategy point above, with Edit strategy point and Stop applying to this card. Counts as: "Ramp, from its role. The strategy point explains the card; it does not add a count."
- Open Cinderhaze Wretch: same strategy point line; its job and reason are empty until you or Claude set them.
- If you later want those two counted as ramp, edit the strategy point and set Counts as: Ramp. The preview shows the change and a change notice follows ("adjusted by your strategy point").
- **Category versus job here.** Murky Business has every card filed under a type word (Creature, Land, Artifact). Devoted Druid's category is Creature and its job is Engine; they never merge. If you later add a category called "Engines", Claude may notice that it matches the job Engine and ask (6.7), and you answer yes or no.

Why a strategy point and not a job: a job says why one card is in the deck. This sentence is true of two cards and can be extended, so it is saved once on the deck.

### 13.3 Rocco's Secret Sauce (commander Rocco, Cabaretti Caterer): the plan is not the commander

Today: 100 cards. State A (no build). Health, common guide: Lands 36 of 36, Ramp 14 of 10, Card advantage 11 of 10, Interaction up to 4 of 10 (**Light**: removal 2 + wipes 2). The deck's plan is Norin the Wary; Rocco only fetches him.

- **Build layer:** "No build yet" with **Link commander**. The only commander record the app can offer is Rocco's. The window adds "Choosing a different commander to compare against, for example Norin the Wary, is coming later (RQ-06)." Once that later change exists, the Build layer would read "Build for Norin the Wary (you chose this)" and the health targets would come from a Norin build. Nothing in this spec depends on it.
- Card jobs: Norin the Wary, **Engine**, Proposed by Claude: "The deck's plan: Norin leaves and returns again and again, and every enter or leave trigger in the deck fires each time." Rocco, Cabaretti Caterer (the commander): **Commander support**, "Fetches Norin and starts the plan." The job sits on the deck, not on Rocco, so it is right even though the commander is someone else.
- Strategy points: one strategy point with Counts as: None, "Cards that blink or flicker are part of the plan", covering a hand-picked list. A second deck with Rocco as commander would not carry this over. This is why strategy points belong to the deck.
- Health: "Using what's set for this deck: 3 jobs, 1 strategy point. Targets are from the common guide." The Interaction row stays "4 · target 10 · common guide · all from card roles and card text" because nothing set here affects it. The opening of the group shows "Targeted removal 2 · Board wipe 2".
- The commander is not counted in health; Rocco's window says "Not counted. The commander isn't part of these counts."

### 13.4 Health targets from the strategy: Urza and Hearthhull (D-060; *illustrative*)
The three test decks above have no strategy text yet, so their health uses the fallback order. Once a deck has a strategy, Claude sets the targets from it. Two examples from the owner's own words:
- **An Urza deck.** Strategy: "Urza turns every artifact into mana, so the deck makes its own ramp." Claude sets **Ramp 4** (reason: "Little ramp needed: Urza makes its own mana from artifacts."), leaves Lands and Card advantage on the fallback numbers, and the health section shows "Ramp: 6 · target 4 · Set by Claude". You do nothing. If you disagree, you press **Change**, type 7, and the row reads "target 7 · Set by you. Claude will leave this number alone." Later the strategy changes; Claude updates the other numbers and the notice says "Claude left Ramp (set by you) alone. It would set 5." You press **Hand back to Claude** and the row reads "target 5 · Set by Claude" with a new reason.
- **A Hearthhull deck.** Strategy: "Landfall: play many lands and trigger payoffs." Claude sets **Lands 40** (reason: "Landfall deck: more land drops mean more triggers.") and a high Ramp for extra land drops. Pressing **Undo** on the Lands row returns it to the number it had before (for example "36, common guide").
- **A deck with no strategy yet.** Nothing is set by Claude. The rows read "from the Aggro build", "from the all-builds average for Myrkul" or "common guide", exactly as in 13.0 to 13.3.
A category called "Ramp" in the deck list does not move any of these numbers.
### 13.5 Strategy items on Yedora, Rocco's Secret Sauce and Murky Business (*illustrative wording*)
The same item kinds, the same strategy points and the same optional "Serves" link fit all three, with no new field and no special case. Table in `contracts/deck-strategy.md` section 20.
- **Murky Business (Myrkul).** What the commander enables: "Myrkul turns creatures into non-creature enchantments" (Proposed by Claude · Unconfirmed · Based on Devoted Druid, Cinderhaze Wretch). The strategy point from 13.2 stays a strategy point. Devoted Druid's card window: Job Engine, **Serves: Myrkul turns creatures into non-creature enchantments**.
- **Rocco's Secret Sauce.** Aim: "Win with a Norin the Wary engine." Play it like: "Norin the Wary" (read only). What the commander enables: "Rocco only fetches Norin." Norin's job Engine serves the Aim; Rocco's job Commander support serves the second line.
- **Yedora the Explorer.** The owner's corrected strategy text was not available to the Designer or Architect; it is entered the same way (Aim, What the commander enables, Win condition). Nothing about this deck needs a different item kind.
- Bracket is empty on all three: the Strategy tab shows "Not set. Claude will ask you." and Claude asks before it sets any number.

## 14. Edge cases

- **A card in several decks:** universal roles are the same in each; category, job, reason and strategy points differ. Opening Sol Ring in Arti-facts shows the Arti-facts job and a line: "Job and strategy points are for Arti-facts only."
- **Several printings:** one card to Oracle. Roles never mention a printing.
- **Two-faced and split cards:** roles are for the whole card. Counts follow the front face today; the window says "Counted from the front face" when the back face would change the answer.
- **Claude and you edit the same field:** your edit wins ("Changed while open").
- **Claude proposes a role you already removed:** it is a proposal beside your removal. Accept restores it.
- **A strategy point covers a card you remove from the deck:** the strategy point keeps its other cards. If a hand-picked strategy point loses its last card: "This strategy point covers no cards. **Remove strategy point**" and it counts nothing.
- **Job names you invented:** a name used by one card stays in the picker for the deck. Clearing the last use removes it.
- **Very long reasons or strategy point sentences:** cut off at 200 characters with a live counter near the limit; pasted longer text is shortened and the box says "Shortened to 200 characters."
- **Duplicate role chips:** "Ramp is already on this card."
- **A card is both in a category named Ramp and holds the role Ramp:** it counts once in the Ramp group, and "Counts as" says "from its role".
- **A deck with a different number of cards than 100** (Murky Business 101, Arti-facts 84): health and jobs work on whatever is in the main deck; the summary line shows the deck's status word as usual.
- **Claude proposes for a deck while you have the Strategy tab open:** the tab updates and the bar appears with "Claude just proposed 51 jobs. **Show**" (announced, not stealing focus).
- **A batch is bigger than the screen can show:** job rows stay collapsed until opened; each list loads in pages of 25 cards with "Show more".
- **A category named like a job** ("Sacrifice payoffs" and the job "Payoff"): both stay as named, nothing merges, Claude may ask (6.7).
- **A deck with no jobs at all:** the deck list has no "Group by" switch and no job markers (6.8). Setting the first job brings the switch in.
- **Group by Job with cards that have no job:** they gather under "No job set" at the end, each still showing its category label.
- **Commander linked but "General (no specific build)" picked:** the build has no numbers of its own, so health targets use the all-builds average (brief 7d item 1, Answered: Agree), then the common guide, and say which.
- **A build has no wipes average:** the Interaction target uses the common guide 10 and says "common guide" for that row; the other rows still say "from the Aggro build".
- **A build is changed after strategy points were set:** targets move, counts do not; a change notice names the new source (10.4).
- **Linking the commander fails or finds no match:** the Build layer stays as it was and says why (8.6).
- **More than 120 cards in a request:** held for approval (7.1, state H). No wording about approval appears for normal sizes.

## 15. What was decided, and what stays the same

**Decided by the owner (2026-11-18, round 3), built into this version:** D-a keep Category and Job as two things, told apart by hints, with a Group by switch and no job clutter; D-b one Strategy tab in three layers (Build, Your strategy, Card jobs); D-c "rules" is now "strategy points" and the strategy notes box is Notes; D-d health numbers come from the build first, then the common guide, then are adjusted by strategy points and jobs, with the source named on screen. **Amended by D-060 (owner-approved 2026-11-18): Claude sets and maintains the targets from the deck's strategy, with a reason per number, Undo, and an owner override that Claude leaves alone until handed back; D-d's order is the fallback where no strategy exists yet.**

**Decided by the owner earlier (2026-11-18), still built into this spec:** Q1 the 13 roles; Q2 several roles per card; Q3 categories and roles are separate and can both be Ramp; Q4 seven starting jobs, own names allowed, one job per card plus a why; Q5 strategy points and jobs are one family, strategy points belong to the deck; Q6 health uses broad groups with common numbers, refined by jobs and strategy points; Q7 Claude proposes roles for the three test decks first; Q8 Claude's proposals apply at once up to 120 cards, Undo for a whole batch; Q9 the window opens on clicking the name, computer and phone; Q10 build order window, roles, Claude proposing roles, jobs, strategy points, health last.

**Stays the same**
- The Cards tab list, except the card name now opens the window.
- Allocation actions (Sleeve, Assign, Release, Reassign) are not in the window or the Strategy tab.
- Trade and black binder rules are not part of this feature.
- Existing deck health "Light" rule (2 or more short), and the footer health strip's look (the targets now follow the build-first order in section 10); the strip's numbers come from the same groups once slice 7 ships.
- The build's guide and the category manager keep their content and now sit in the Build layer; Notes keeps its content (and gains the free-text box's new name) in Your strategy.

## 16. Hand-off notes

- **Designer:** the HTML mockup is updated to this version: the layered Strategy tab (states A to D, E to H, I, the phone view), the Group by Category / Job switch on the deck list, the card window with the Category and Job fields and hints, the health roll-up with sources, Claude's proposals bar with Undo all, the strategy point editor with preview, and the three worked decks.
- **Architect:** write the contract for the stored data from section 8.10; DB-1 to DB-4 are drafted on a throwaway copy first and need owner approval (the strategy points table is named "deck strategy points"). Confirm how the 120-card limit counts a card with both a role and a job, how a batch id and "still to look at" state are recorded, how the Link commander step sets the deck's commander record, and how deck health will read the picked build's averages (today it reads the commander's EDHREC average, then an estimate, then a general guide).
- **Developer:** slice order in brief section 9. Slice 4 builds the three-layer Strategy tab (moving the build picker, guide and category manager into the Build layer, and removing the old "Commander guide" section in the same task) with no new stored data; Card jobs, Strategy points and Deck health fill in through slices 5, 6 and 7.
- **Tester:** run the three worked examples in section 13, each state in 8.7 and 11, the Group by switch (absent with no jobs, present with jobs, no card changes on switching), the category-named-like-a-job case (6.7), the batch Undo (including partial), and the greyscale and keyboard checks in section 12.

## 17. Still open for the owner (each with a recommendation)

The brief's sections 7c and 7d list the owner choices; these are the behaviour details this spec adds.

1. **ANSWERED 2026-11-18: Agree.** **New, from D-d: a deck with no build picked.** Should health keep today's first two sources (the commander's all-builds EDHREC average, then the estimate) before the common guide? (brief 7d-1) Recommendation: yes, labelled "from the all-builds average". The owner agreed; the spec now follows it. It changes only the targets shown for decks with no build.
2. **ANSWERED 2026-11-18: Agree.** **New, from D-b: Notes.** The free-text box becomes Notes in Your strategy, and the dated list moves under it as "Earlier notes". (brief 7d-2) Recommendation: yes.
3. **Which number is the health target when the commander has typical numbers?** *Answered by D-d: the build first, then the common guide. Amended by D-060: Claude's number from the strategy comes first, then your override sits above it, and the build is the fallback.* (brief 7c-1)
4. **Do Claude's proposals count in health at once?** (brief 7c-2) Recommendation: yes, labelled; Undo removes them.
5. **Interaction membership:** includes Hand disruption and Counterspell, excludes Graveyard hate and Stax/tax. (brief 7c-3) Recommendation: as in 10.2.
6. **The Strategy tab on a phone** (brief 7c-4). Recommendation: yes.
7. **Ask Claude fills the chat and waits for Send** (brief 7c-5). Recommendation: yes.
8. **Your own edits: a full history?** The spec gives them a 10-second Undo and a "Last changed by you" line, and keeps Recent changes for Claude only. Recommendation: no for now.
9. **ANSWERED 2026-11-18: Agree** (owner's word "Agree"; chosen: for a role, Claude stays quiet about it for that card in every deck; jobs and strategy points are remembered per deck). **Remember what you dismissed so Claude doesn't propose it again for that card in that deck?** (Also used for "a category looks like a job" questions, 6.7.) Recommendation: yes, to avoid nagging.
10. **ANSWERED 2026-11-18: Agree** (owner's word "Agree"; chosen: undo the cards the owner has not touched and say which were left). **Undo all when you have already accepted or changed some of the batch.** Recommendation: undo only the cards still as Claude left them, leave yours alone, and say which were left. The alternative is to refuse the whole undo, which is simpler but means one accepted card blocks the batch.
11. **Is "Standard" the right word for the shared baseline role?** Alternatives: "Common" or "Oracle's". Recommendation: keep "Standard".
