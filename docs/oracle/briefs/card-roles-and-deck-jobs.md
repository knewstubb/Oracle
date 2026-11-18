# Brief: Card roles, deck jobs, strategy points and the layered Strategy tab (Gate 1, owner answers recorded, FOR FINAL APPROVAL)
Author: requirements subagent for Gene. First draft 2026-11-18; **version 2 on 2026-11-18** records the owner's answers to the ten questions and adds the Strategy tab; **version 3 on 2026-11-18** records four further owner decisions (section 2d): jobs and categories both stay and are clearly told apart, builds and strategy become one layered Strategy tab, "rules" becomes "strategy points", and health numbers name their source. Built from the owner's conversation, Claude's feedback of 2026-11-17, and the Architect audit (`reports/2026-11-18-architect-card-roles-audit.md`).
Status: **Answers recorded, waiting for the owner's final approval of section 7c (five small confirmations) and the one new choice in section 7d. Nothing is built. No database change is applied or approved.** Replaces the open parts of RQ-01, RQ-03, RQ-05, RQ-12 and the deck-job part of RQ-04, and takes in parts of RQ-06 and RQ-07 (last section).

## 1. What this is, in plain words
Today Oracle guesses what a card does (ramp, draw, removal, wipes) by reading its rules text each time, and nothing you or Claude decide is saved. This feature adds four things:
1. A fixed **universal role** for every card (Sol Ring is ramp everywhere).
2. A **deck job and reason** for each card in one deck (this card is the engine, and here is why). A job is *why the card is in the deck*. It is not the same as a **category**, which is *where the card sits in your deck list*. Both stay (section 7a).
3. **Strategy points** for a deck: statements of the deck's strategy that change what cards are worth there (for example, every artifact is a mana source).
4. **One Strategy tab, in three layers from general to specific**: **Build** (the EDHREC build for the commander), **Your strategy** (plan, win conditions, bracket, budget, playgroup, Notes and the strategy points), and **Card jobs** (what each card is for, which follows from the strategy). Each layer refines the one before it. Claude's proposals and deck health sit alongside the layers.

A small card window, opened by clicking a card name, shows and edits all of this for one card. **Deck health** stops guessing. Where you have picked a build, its typical numbers come first. Where there is no build, or no number for a group, widely-used common numbers apply (lands, ramp, card advantage, interaction). Your strategy points and jobs then adjust the counts. The screen always says which source a number came from.

## 2. Owner decisions
### 2a. Earlier conversation (2026-11-18, quoted)
1. **Two layers.** "there is this fixed global label of 'ramp' this is universal across everything and then per deck category customisation". Your example: Sol Ring is commonly known as ramp, but "i might have a custom category for it in my deck".
2. **Deck jobs.** "I like the idea of claude being able to propose and we work together to develop it. This should be editable in the app."
3. **Locked flag (pet card Claude must never cut).** "Skip for now. This can come later."
4. **Commander strategy points.** "I think this should be similar to the deck jobs. Potentially one in the same?"
5. **Where it shows.** "They should be visible in the modal when a card is clicked on. We need a basic modal to test this."
6. **Deck health counts.** "I think this needs to be tied into the rules/jobs. But for decks where these are not set we should go with the generic values that people follow."
7. **Test decks.** "Myrkul, rocco, mendicant" (decks: Murky Business, Rocco's Secret Sauce, Arti-facts).

### 2b. Answers to the ten questions (2026-11-18, quoted). Every question is now ANSWERED.
The first draft had twelve questions. Two of them (where roles are stored, and the split between shared and personal data) were technical and were not put to you; they are in section 7b and nothing in them changes what you see. The remaining ten are numbered as you answered them.

| # | Question (short) | Your answer | Status |
|---|---|---|---|
| Q1 | The list of universal roles | "Agree." (the 13 shared roles; engine and finisher move to deck jobs) | **Answered** |
| Q2 | Can a card hold several roles? | "Yes." | **Answered** |
| Q3 | Roles versus your own categories | "Agree. A card can be ramp in both category and role." A deck category named Ramp and the universal role ramp can both apply. They stay two separate layers. | **Answered** |
| Q4 | Deck jobs: starting list | "This sounds fine for now." (seven starting jobs, one job per card plus a why, your own names allowed) | **Answered** |
| Q5 | Deck strategy points and deck jobs | "Agree." (one family; a strategy point is saved on a deck) | **Answered** |
| Q6 | Deck health when nothing is set | **Changed from the recommendation.** "I think health should use more generic values when the jobs are not understood. For example Rachel Weeks suggests that targeted removal and board wipes are both interaction and every deck needs [n] interaction cards." | **Answered, rewritten in 7** |
| Q7 | Where roles come from | "OK." (Claude proposes roles for the three test decks first; a bulk pass later by separate approval) | **Answered** |
| Q8 | How Claude proposes, and how much freedom | **Changed from the recommendation.** "Give Claude more freedom for now. As long as I can Undo." | **Answered, rewritten in 7** |
| Q9 | The card window | "OK." (opens on clicking the card name, computer and phone) | **Answered** |
| Q10 | Build order | "OK." (window, roles, Claude proposing roles, jobs, strategy points, health last) | **Answered** |

### 2c. Earlier request (2026-11-18, quoted)
"We also need somewhere to view the deck strategy. Let's update the strategy tab to accommodate this." The answer to this is section 7 (Strategy tab) and the slice plan in section 9.

### 2d. Owner decisions, round 3 (2026-11-18, quoted). These change the first design.
Your words: "We need to consider how job and category relate. Is it confusing to manage both? We currently have the set build (taken from EDHREC) for each commander. This should be bundled in with the deck rules/strategy. I prefer the term strategy over rules but are you proposing these as different things?" Your answers to the options offered: "1. A" and "2. Yes".

| # | Decision | What it means on screen |
|---|---|---|
| D-a | **Jobs and categories: keep both, and make the difference obvious** (option A). | **Category** = where a card sits in the deck list (your grouping). **Job** = why the card is in the deck. The card window shows two separate labelled fields with a one-line hint each. The deck list can be grouped by Category (the default) or by Job. Jobs are optional and stay out of the way until Claude has proposed some. |
| D-b | **Builds and strategy are one thing.** | The EDHREC build picker, its strategy guide and the category manager stop being a separate "Commander guide" section below your own sections. The Strategy tab is one tab with three layers, general to specific: **Build**, **Your strategy**, **Card jobs**. |
| D-c | **"Rules" becomes "strategy".** | What the first design called "deck rules" is now **strategy points**. Your existing free-text strategy notes box is now called **Notes**, so the two do not clash. |
| D-d | **Health numbers: the build's typical numbers first.** | A deck with a build uses the build's typical numbers first. With no build, or no number for a group, the common groups apply. Your strategy points and jobs then adjust the counts. Every number says where it came from. |

**Naming, so the words do not clash.** "Strategy" is the name of the tab. "Your strategy" is the middle layer of that tab. A **strategy point** is one statement inside Your strategy. **Notes** is the free-text box (today called "strategy notes"). Item RQ-05 now reads "strategy points per deck" (it was "commander rules"). Your earlier quote in 2a item 6, "the rules/jobs", is left as you said it.

**Items from the first design that this changes.** Section 7 Q5 (name only), Q6 (health numbers and sources), the Strategy tab (now layers), and 7c item 1 (answered by D-d; one smaller choice is left in 7d). Everything else you answered (Q1 to Q10, Claude applying at once up to 120 cards with one-click undo of a whole batch, and the confirmations in 7c items 2 to 5) is unchanged.

## 3. What exists today (from the audit and a fresh read-only look, plain words)
- Oracle knows four roles (ramp, draw, removal, wipes), worked out from rules text on the spot. Nothing is saved per card or per deck. Lands never get a role.
- A card's deck category is a free label. In the three test decks every card is filed under a type word (Creature, Land, Artifact and so on); none is filed under Ramp or Removal. Categories play no part in the health counts.
- A "default category" guess exists for almost every card in the shared card library (Sol Ring = Ramp). Its quality has not been checked, it allows only one main label per card, and it is stored by card name rather than by the card's identity.
- Clicking a card name in a deck does nothing on a computer (only a hover picture). On a phone it opens a full-screen picture. So the card window is new.
- Claude can already re-file a card under another category, with undo for 7 days. It cannot read or set roles, jobs or strategy points. Since CC-13 Claude may change up to 120 cards in one request, with one-click undo for the whole request; above 120 (up to 200) it waits for your approval.
- 115 owned cards have no card text in the library (Claude counted 86, a different way of counting). They cannot be given a role automatically until that is fixed (CC-10).
- **The Strategy tab today** [Confirmed in the app]. It shows, top to bottom: a commander overview and a build picker (only when the deck has a commander record linked), the build's strategy guide from EDHREC, a category manager (only when a build is picked; its core categories Ramp, Draw, Removal and Lands already show "recommended" counts taken from the build's averages, with "below avg" and "above avg" markers), **Deck Intent** (win condition, playgroup, bracket, budget, frustrations, strategy notes; collapsed by default), and **Notes** (a list of dated notes). The build part and your own part are separate sections with no link between them. It does not show deck health, jobs, strategy points or Claude's proposals. On a phone the Strategy tab is hidden. The reference ("secret") commander idea (RQ-06) is not built.
- **The three test decks have an empty Strategy tab today.** A read-only check on 2026-11-18 found: no win condition, no playgroup, no bracket, no budget, no notes, and no commander record linked, so the commander overview and build picker do not even appear. That makes them the real "nothing set" examples.
- Current health numbers for the three test decks. The "typical" number today is the commander's overall EDHREC average across all builds (the app finds it by commander name even with no commander record linked). Under the new order of sources (section 7, Q6) a deck with no build picked would use the common guide instead; see 7d. Have / typical, as the app counts today and how they would sit in the new broad groups (the Interaction row adds today's Removal and Wipes; it can only be lower if one card is both):

| | Murky Business (Myrkul) | Rocco's Secret Sauce (Rocco, Norin the Wary deck) | Arti-facts (Mendicant Core) |
|---|---|---|---|
| Ramp | 17 / 20 | 14 / 22 | 8 / 16 |
| Draw (new name: Card advantage) | 8 / 7 | 11 / 7 | 14 / 13 |
| Removal | 7 / 7 | 2 / 5 | 2 / 3 |
| Wipes | 2 / 2 | 2 / 1 | 1 / 1 |
| **Interaction (new: removal + wipes)** | **up to 9 / 9** | **up to 4 / 6 (light)** | **up to 3 / 4** |
| Lands | 37 / 35 | 36 / 35 | 33 / 34 |

## 4. Scenarios
| # | Who / when | What they have | What they want |
|---|---|---|---|
| S1 | Owner, any deck | Sol Ring in one deck filed under "Mana Rocks" and in another under "Ramp" | The card window shows the universal role "Ramp" in both, and each deck keeps its own category name. Both count as ramp. |
| S2 | Owner, Arti-facts | A deck full of artifacts; health says 8 ramp, typical is 16 | A strategy point "every artifact counts as a mana source" (like Urza in Stax on Stax) so the count reflects the deck, and the screen says "adjusted by your strategy point", and the card window says why each card counts. |
| S3 | Owner, Murky Business | Myrkul; Devoted Druid and Cinderhaze Wretch cost a -1/-1 counter | A deck strategy point saying that cost is free here once the card is a non-creature enchantment, shown on those cards. |
| S4 | Owner, Rocco's Secret Sauce | A deck whose real plan is Norin the Wary; Rocco only fetches him | Strategy points and jobs belong to this deck's plan, not to Rocco as a commander. The Build layer shows which commander the numbers are for (Rocco today), with a note that comparing with Norin is a later change (RQ-06). |
| S5 | Owner asks Claude "give every card in Arti-facts a job and a reason" | 84 cards, no jobs | Claude applies the jobs straight away (84 is under the 120 limit), each marked "Proposed by Claude". The owner looks them over on the Strategy tab, accepts, changes or dismisses them, or undoes the whole batch with one click. |
| S6 | Owner clicks Rhystic Study | A job from Claude | Owner changes the job and edits the reason. The card now says "Set by you". Claude never overwrites it later; it can only propose a different one beside it. |
| S7 | Owner, any deck with nothing set and no build picked | No build, no jobs, no strategy points | Health shows the broad groups with common numbers (lands, ramp, card advantage, interaction) and says plainly on every line "common guide". |
| S8 | Owner clicks a card with no card data | One of the 115 | The window opens, says "No card data yet, so no role was worked out", and still lets the owner set a role by hand. |
| S9 | Owner opens the Strategy tab of a deck with nothing set | Murky Business today | Each section explains in plain words what it is for and offers one clear next step (write the strategy, set jobs, add a strategy point, ask Claude). Nothing looks broken or empty by mistake. |
| S10 | Owner asks Claude to propose for a full deck | 100 cards, jobs, a strategy point | The Strategy tab shows a "Claude's proposals" bar: how many are not yet looked at, with **Review**, **Accept all** and **Undo all**. Nothing is waiting for approval; everything is already applied and labelled. |
| S11 | Owner wants to know why Interaction says 4 | A deck with Light interaction | The health section shows which cards make up the 4, split by universal role, and which jobs or strategy points changed the count. |
| S12 | Owner does not like Claude's pass | A whole batch applied | One click on **Undo all** returns every card in that batch to what it had before. |
| S13 | Owner on a phone | The Strategy tab is hidden today | The Strategy tab can be opened on a phone, with the same layers stacked. |
| S14 | Owner, any deck, wants to know the difference between a category and a job | Sol Ring filed under the category "Mana Rocks", with the job "Enabler" | The card window shows two labelled fields: "Category: where it sits in the list" and "Job: why it is in the deck". The deck list can be grouped by Category (default) or by Job. |
| S15 | Owner has a category named like a job | A category called "Sacrifice payoffs" and a job called "Payoff" | Oracle never merges them. Claude may notice the match and say so in a proposal, and the owner decides (section 7a). |
| S16 | Owner opens the Strategy tab of Arti-facts, Murky Business or Rocco's Secret Sauce | No commander record, so no build | The Build layer is empty and says how to link the commander's EDHREC record and pick a build. Your strategy and Card jobs work without it. Health uses the common guide and says so. |
| S17 | Owner picks the Aggro build for a commander | A build with typical numbers and starting categories | The Build layer shows its guide and numbers. Health now says "from the Aggro build" next to each number the build has, and your strategy points and jobs adjust them. |

## 5. What must never happen
- A role, job or strategy point changing without a record the owner can see and undo (D-034).
- Claude overwriting something the owner set by hand.
- A Claude proposal being counted or shown as if the owner had decided it, without the "Proposed by Claude" label.
- Your custom category names appearing in anything shared between users.
- A card's role being tied to one printing (Sol Ring in five printings must be one card to Oracle).
- Health numbers for a deck changing without the owner being told what changed and why.
- A health number shown as zero or "fine" when the check failed (D-030). A failed check says it could not check.
- A broad group count that hides what is in it: every number on the Strategy tab can be opened to see its cards.
- A category and a job being merged, renamed or copied into each other automatically, even when their names match.
- A health number shown without saying where it came from (build, common guide, or adjusted by a strategy point).
- Empty job screens cluttering a deck that has no jobs. Jobs stay out of the way until Claude has proposed some.
- Anything in the owner's real data changing before the database changes in section 9 are approved.

## 6. New words (to be added once to the shared vocabulary at close-out)
- **Universal role**: what a card is commonly known to do in any deck (ramp, removal, and so on). The same everywhere. (fine-grained)
- **Health group**: a broad, widely-used deckbuilding group that deck health counts: Lands, Ramp, Card advantage, Interaction. Several universal roles feed one group. (broad)
- **Category**: where a card sits in this deck's list. Your own grouping label, free text, unchanged from today. Hint on screen: "Category: where it sits in the list". A category named "Ramp" and the universal role Ramp can both be on one card.
- **Job** (deck job): why a card is in this deck, in terms of the deck's plan (engine, enabler, payoff and so on). Set per card, per deck. Optional. Hint on screen: "Job: why it is in the deck".
- **Why it is here**: one short sentence explaining the job.
- **Strategy point**: one statement of this deck's strategy, with the cards or the card type it covers ("every artifact counts as a mana source"). Saved on one deck, proposable by Claude, editable in the app, shown in the card window on each covered card. (The first design called this a "deck rule".)
- **Notes**: the free-text box for anything else about how you want to play the deck. (Today called "strategy notes".)
- **Build**: an EDHREC build for the commander (for example Aggro or Tokens), with its strategy guide, typical numbers and starting categories.
- **The three layers of the Strategy tab**: **Build** (general), **Your strategy** (this deck), **Card jobs** (each card). Each refines the one before it.
- **Number source**: the words next to a health number that say where it came from: "from the Aggro build", "common guide", or "adjusted by your strategy point".
- **Counts as**: the health groups a card contributes to in this deck, and the reason.
- **Proposed by**: Claude or you. A Claude proposal is **Proposed** until you accept or change it. It is already applied and already counts; Undo removes it.
- **Claude's proposals** (a bar and list on the Strategy tab): everything Claude proposed that you have not yet looked at.

## 7. The decisions in detail
Each question: your answer first, what it means on screen, then anything left to confirm.

### Q1. Universal role list. ANSWERED: agree.
The 13 roles are: ramp, fixing, card draw, card selection, tutor, targeted removal, board wipe, counterspell, protection, recursion, graveyard hate, stax/tax, hand disruption. Board wipe is its own role. Engine and finisher move to deck jobs; mill becomes a card property; "utility" is dropped. A land may hold roles (a dual land is fixing), but health keeps counting lands in their own Lands group and does not count them as ramp, as today.

### Q2. Several roles per card. ANSWERED: yes.
A card may hold several roles with no "main" one (Rhystic Study is card draw and stax/tax). In health, a card counts once in each **group** it feeds, even when two of its roles feed the same group (a card that is both targeted removal and counterspell counts once in Interaction).

### Q3. Roles and your categories. ANSWERED: agree, and "a card can be ramp in both category and role".
They are two separate layers. Sol Ring can sit in your category "Ramp" and also hold the universal role ramp; neither changes the other. Health counts come from universal roles, jobs and strategy points, never from category names. When a card is added, its category is suggested from its first universal role, and Claude reuses your deck's own names. Trade-off you accepted: a card you file under "Ramp" that is not truly ramp does not count as ramp unless a job or strategy point says it does.

### Q4. Deck jobs: starting list. ANSWERED: "This sounds fine for now."
One job per card, plus a free "why", and you can add your own job names in a deck. Starting list, a draft to develop with Claude: **Engine** (keeps producing value), **Enabler** (makes the plan possible), **Payoff** (rewards the plan), **Win condition** (ends the game), **Combo piece** (part of a specific combo), **Commander support** (protects or helps the commander), **Flex** (fills a slot, easy to swap). Job names are stored as text so the list can grow.

### Q5. Strategy points and jobs are one family. ANSWERED: agree.
A job says what one card does in this deck. A strategy point says something about many cards at once. Both are your notes on a deck, both can be proposed by Claude, both show in the card window and on the Strategy tab. A strategy point is saved on a deck, not on a commander, because Rocco's Secret Sauce is a Norin deck. A strategy point covers either all cards of one type (every artifact) or a hand-picked list. Copying a strategy point to your other decks with the same commander is later (shown on the Strategy tab as "coming later").

### Q6. Deck health: where the numbers come from. ANSWERED, CHANGED, and changed again by D-d (2026-11-18): the build first, then common groups, then your strategy.
**Your answer, in my words:** when Oracle does not yet understand a deck's jobs, health should speak the common deckbuilding language: "interaction" (targeted removal, board wipes, counterspells and the like) with one recommended count, next to ramp, card advantage and lands, and not the fine-grained roles.

**Where each number comes from, in this order (D-d).** The screen says which one it used, line by line.
1. **The build's typical numbers, first.** A deck with a build picked (for example Aggro) is judged against that build's averages. The app already carries these: the build's average lands, ramp, card draw and removal, and wipes [Confirmed in the app: the category manager shows them as "recommended" counts]. The Interaction target is the build's removal plus wipes, used only when the build has both. Words on screen: **"from the Aggro build"**. (Today health ignores the picked build and uses the commander's overall average; reading the picked build is new.)
2. **Common groups, where there is no build or the build has no number for that group.** Lands 36, Ramp 10, Card advantage 10, Interaction 10 (still needing a source check, below). Words on screen: **"common guide"**.
3. **Your strategy points and jobs then adjust the counts** (the "have" number, not the target). Words on screen: **"adjusted by your strategy point"**, with the cards that moved.

A deck can mix sources: lands from the build and interaction from the common guide, when the build has no wipes average. The roll-up below is how cards are counted into the groups, whatever the source of the target.

**How cards are counted (the roll-up).** Fine-grained universal roles feed broad health groups. The groups are what health counts and shows. A deck's jobs and strategy points then adjust the counts for that deck.

| Health group (broad) | Universal roles that feed it (fine) | Common guide (used when there is no build number) | Build number (used first when a build is picked) |
|---|---|---|---|
| **Lands** | Not a role. Any card with the land type. A land never counts as ramp. | 36 | Build's average lands |
| **Ramp** | Ramp | 10 | Build's average ramp |
| **Card advantage** | Card draw | 10 | Build's average card draw |
| **Interaction** | Targeted removal, Board wipe, Counterspell, Hand disruption | 10 | Build's average removal + average wipes |
| **Plan and win conditions** (shown only when jobs are set) | No roles feed it. It comes from deck jobs only: Engine, Enabler, Payoff, Combo piece, Win condition. | No judged number. Shown for information; a rough 30 plan cards is mentioned as a template figure. | None |

Universal roles that feed no group in the first version, and only show in the card window: **Fixing, Card selection, Tutor, Protection, Recursion, Graveyard hate, Stax/tax.** Reason: the common templates do not count them, and counting them would make a stax or tutor-heavy deck look healthier than it is. They can be added later, or a deck strategy point can say "counts as interaction" for a stax deck.

**What changes against today.** Today's four lines (Ramp, Draw, Removal, Wipes) become Ramp, Card advantage and one Interaction line (removal and wipes together, with counterspells and hand disruption added once those roles are set). The card-text reading stays only as a stand-in for cards with no role yet, so on day one the numbers equal today's (Interaction = Removal + Wipes), and they move when roles are filled in. Each move is announced (health numbers never change silently).

**Where jobs and strategy points refine it.**
- A strategy point or job can say "counts as ramp / card advantage / interaction" for chosen cards (adds them to that group once) or "does not count" (removes them). The reason shows next to the card.
- Jobs also feed the "Plan and win conditions" group, which does not exist until jobs are set.
- Targets come from the build, else the common guide (above). Strategy points and jobs change the counts, not the targets. A deck-specific target ("my stax deck wants 14 interaction") is a later option, not in the first version.
- Once-per-turn cost reducers (Sapphire Medallion type) count as ramp, which is the RQ-12 trigger.

**Sources for the numbers, and what is not confirmed.** I could not open web pages in this step, so I am not quoting any source as if I had read it.
- Today's app guide for decks with no typical numbers: ramp 10, draw 10, removal 6, wipes 2, lands 36. [Confirmed: it is in the app's health code; where it came from is not recorded.]
- Rachel Weeks, as you quoted: targeted removal and board wipes are both interaction, and every deck needs a set number of interaction cards. **[Not confirmed: the number was not given, and I have not read her article.]**
- The Command Zone's deckbuilding template (lands, ramp, card advantage, targeted disruption, mass disruption, plan cards): from memory it asks for roughly 10 ramp, 10 to 12 card advantage, about 10 targeted and about 3 mass disruption, and 36 to 38 lands. **[Not confirmed: from memory, not checked against the video or page.]**
- The Interaction number 10 is **my assumption**: it sits between today's 8 (removal 6 + wipes 2) and a roughly 13 from the template (10 + 3).
- Before the numbers are locked, someone should check the two sources and replace "not confirmed" with the real figures. This is a one-line change in the design.

**Weights** (a one-shot spell counting less than a repeating engine, RQ-03) are not in the first version. Every card counts once per group.

### Q7. Where roles come from. ANSWERED: OK.
Claude proposes roles for the roughly 285 cards in the three test decks while you chat. You see the quality in the card window and fix what is wrong. Only after you are happy does a bulk pass cover the rest of your collection (a separate approval, because it writes shared data and costs usage). The old "default category" guess is only a hint to compare against. Cards with no card data wait for CC-10, but you can set their role by hand now.

### Q8. How Claude proposes, and how much freedom. ANSWERED, CHANGED: more freedom, as long as you can Undo.
**Your answer:** "Give Claude more freedom for now. As long as I can Undo."
- **Applied at once.** Claude's proposals of roles, jobs, reasons and strategy points are applied immediately, up to **120 cards per request** (the direct limit set by CC-13). They are marked **Proposed by Claude**. There is no waiting for your approval at normal sizes.
- **Undo.** Each proposal appears in Recent changes. A whole request is one batch with one **Undo all** click. The Strategy tab shows the same batch bar. Undo is available for 7 days, and is refused in words if the card has changed since.
- **Keeps from before.** Claude never overwrites a value you set. It can propose a different one, which shows beside yours; yours stays in force until you choose. In the card window you can **Accept** (it becomes yours), **Change** (edit it) or **Dismiss**.
- **The approval path stays above the limit only.** A request over 120 cards (and up to 200) is held for your approval as today, for 24 hours; over 200 is refused with a plain message. Nothing new is added to that path.
- **Proposed values count in health straight away, labelled** ("2 are still Proposed by Claude"). Undo removes them. This follows from "applied at once"; it is listed for confirmation in 7c-2.
- **Assumption for the Architect:** a request that proposes a role and a job for the same card counts that card once towards the 120. To be confirmed against the limits already in place.

### Q9. The card window. ANSWERED: OK.
It opens when you click the card name, on computer and phone, with the picture at the top. Hover pictures stay. Also reachable from the card menu ("Card details"). Contents, top to bottom: picture and name; **Universal roles** (chips; add or remove); **Category in this deck** (edit); **Deck job** and **Why it is here**; **Deck strategy points that apply**; **Counts as**; **Proposed by Claude / Set by you**, with Accept, Change and Dismiss when it is a proposal. Every edit saves straight away and shows "Saved". The window does not move, sleeve or release copies; those stay in the existing menus.

### Q10. Build order. ANSWERED: OK.
Window, then roles, then Claude proposing roles, then jobs, then strategy points, then health last. The Strategy tab is built alongside, one section at a time (section 9).

### The Strategy tab: one tab, three layers, general to specific (rewritten by D-b)
The Strategy tab answers "what is this deck trying to do, and how well is it set up for it?" Before, the build picker, its guide and the category manager sat in a separate "Commander guide" section below your own sections, with no link to them. Now they are the first layer of one tab. Read it top to bottom as general to specific:

1. **Build** (the most general). The EDHREC build picked for the commander, for example Aggro or Tokens: the build's strategy guide, its typical numbers (lands, ramp, card draw, removal, wipes) and its starting categories, shown with your count next to each (the category manager). *In words: "Most Aggro decks for Myrkul look like this."*
2. **Your strategy** (this deck). Your plan and win condition, bracket, budget, playgroup, frustrations, the **Notes** box, and the **strategy points** (statements like "every artifact is a mana source" with the cards they cover). *In words: "Here is how I want to play it, and what is special about my list."* It refines the build: where your plan differs from the build's, yours is the one that applies.
3. **Card jobs** (each card). What every card is for, which follows from the strategy: how many cards per job, who proposed each, and **Ask Claude to propose jobs**. *In words: "Because the plan is X, this card is the engine."* It refines your strategy one card at a time.

**An example of the layers reading together** (illustrative, for Murky Business once a build is linked). Build: "Aggro: decks like this run about 10 ramp and 10 removal and win in the first six turns." Your strategy: "I win by turning creatures into enchantments with Myrkul; a -1/-1 counter cost is free once a card is a non-creature enchantment" (a strategy point). Card jobs: "Devoted Druid: Engine, because it makes mana and its counter cost is free here." Each layer narrows the one before: the build gives the general shape, your strategy says where this deck differs, and the card jobs say what each card is for because of that.

Alongside the layers, at the top: a **summary line** (deck status, bracket, which build is picked, counts such as "7 jobs set, 1 strategy point, 12 proposals to look at") and **Claude's proposals** (how many are not yet looked at, with Review, Accept all and **Undo all**). Below the layers: **Deck health**, which reads all three layers (the build's numbers first, then your strategy points and jobs adjust the counts, and every number names its source).

**When there is no build** (the three test decks today have no commander record linked, so no build). The Build layer is not hidden. It says "No build yet. Link this deck's commander to see its EDHREC builds, typical numbers and starting categories" with a **Link commander** step, then the build picker appears. Your strategy and Card jobs work fully without a build; health uses the common guide and says "common guide" on each line. Linking is a small new step (the deck can already store a commander record; the Architect confirms how the tab does it).

An **Ask Claude to propose** entry (on the proposals bar and in each empty section) opens the deck chat with a ready-written prompt; you press Send. Empty layers explain themselves in plain words. The Strategy tab also becomes visible on a phone, with the same three layers stacked.

**Notes.** Two things on the tab are called notes today: the free-text "strategy notes" box inside Deck Intent, and a separate list of dated notes at the bottom. To stop the clash, the box is renamed **Notes** and sits in Your strategy; the dated list moves under it as "Earlier notes" (same content). See 7d, item 2.

## 7a. Jobs and categories: how to tell them apart (D-a, option A)
Both stay. They answer different questions.

| | Category | Job |
|---|---|---|
| Answers | Where does this card sit in my deck list? | Why is this card in my deck? |
| Who sets it | You (free text, as today) | Claude proposes, you accept or change (or you set it) |
| Required | Every card has one in practice (today's behaviour) | Optional. Many cards (most lands) have none |
| Example | Sol Ring: category "Mana Rocks" | Sol Ring: job "Enabler" |

**On screen.** In the card window they are two separate, clearly labelled fields: "**Category**: where it sits in the list" and "**Job**: why it is in the deck". The deck list can be grouped by **Category** (the default, as today) or by **Job**. **Jobs stay out of the way until Claude has proposed some**: a deck with no jobs shows no job grouping, no empty job rows and no "no job" markers in the list. The Job field appears only in the card window and the Strategy tab's Card jobs layer. Once jobs exist, the "Group by: Category / Job" switch appears on the deck list.

**When a category is named like a job** (for example you have a category called "Sacrifice payoffs", and the job list has "Payoff"). Oracle **never merges them automatically**, never copies one into the other, and never changes a category because a job was set (or the other way round). Claude **may notice the match and say so in a proposal**, for example: "Your category Sacrifice payoffs looks like the job Payoff. Do you want me to propose Payoff as the job for these 9 cards?" You answer yes or no; a yes sets jobs only, and leaves the category as it is. The two hints on the card window keep the meaning apart even when the words overlap.

## 7b. Technical choices (not put to you; no change to what you see)
- **Stored once per card identity, shared baseline plus your own changes.** Sol Ring has one set of roles in all printings; your changes are yours only. (First-draft Q8, recommendation A.)
- **Split into shared and yours from the start.** Shared: the universal role baseline. Yours: your role changes, categories, jobs, reasons, strategy points, who proposed what. Custom category names and strategy points never go in shared data, so a public version needs no redo. (First-draft Q10, recommendation A.)
If you disagree with either, say so; otherwise the Architect proceeds on these.

## 7c. Left for the owner to confirm (five small items, each with a recommendation)
1. **Which number is the health target?** *Answered by D-d (section 2d): the build's typical numbers first, then the common guide. One smaller choice is left in 7d, item 1.*
2. **Do Claude's proposals count in health straight away?** Recommendation: yes, labelled, and Undo removes them (it follows from "apply at once"). The alternative is to count only what you accepted; the health numbers would then stay unchanged until you click through every card.
3. **Are Hand disruption and Counterspell part of Interaction, while Graveyard hate and Stax/tax are not?** Recommendation: yes, as in the table in Q6. Counterspells and "similar" matched your example; stax and graveyard hate vary too much between decks to count by default.
4. **Show the Strategy tab on a phone?** Recommendation: yes (today it is hidden), with the sections stacked.
5. **"Ask Claude to propose": fill in the chat message and wait for you to press Send, or send it at once?** Recommendation: fill it in and wait, because one press can change up to 120 cards. The existing health "Chat about this" buttons send at once; they only ask a question.

Four smaller behaviours in the design spec (section 17, items 6 to 9) also need a yes or no, each with a recommendation: whether your own edits need a full history (no for now); whether Claude remembers what you dismissed (yes); what "Undo all" does when you have already accepted some of the batch (undo the rest, leave yours alone); and whether "Standard" is the right word for the shared baseline role (keep it).

## 7d. New choices that came with the round 3 decisions (each with a recommendation)
1. **A deck with no build picked: should health keep using the commander's overall EDHREC average (today's behaviour) before the common guide?** Today health ignores the picked build and uses the commander's average deck, then an estimate, then a general guide [Confirmed in the app]. Your decision says no build means the common guide, and the design follows that. Recommendation: **yes, keep the overall average as a middle step**, worded "from the all-builds average for Mendicant Core". Without it, Arti-facts would be judged on Ramp against 10 instead of 16 and on Interaction against 10 instead of 4, until you link a build. With it, nothing about the three decks gets worse while they have no build. The choice changes only the numbers shown for decks with no build.
2. **Notes.** Recommendation: the free-text box (today "strategy notes") becomes **Notes** in Your strategy, and today's dated notes list moves under it as "Earlier notes". The alternative is to keep the dated list as its own section below, which leaves two things on the tab with similar names.

## 8. Out of scope for this feature
- **Locked flag** (pet card Claude must never suggest cutting; the second half of RQ-04). Later item, per decision 3.
- Role weights (one-shot versus repeating, mana cost; RQ-03). Later slice.
- Health groups for the roles that feed none (Fixing, Card selection, Tutor, Protection, Recursion, Graveyard hate, Stax/tax), and deck-specific targets.
- Copying strategy points to other decks of the same commander (shown as "coming later"); matching strategy points by card wording.
- Choosing a different commander's EDHREC data for a deck (RQ-06). The Build layer shows which commander the numbers are for, read only. Picking one (for example Norin for Rocco's Secret Sauce) needs a new stored setting and is a later small slice. Linking the deck's own commander (section 7) is in scope.
- Merging categories into jobs, or jobs into categories, in any form (D-a). Claude can only mention a match in a proposal.
- Changing what the build's guide says or how EDHREC data is fetched. Only where it appears changes.
- Writing the deck's strategy text, win conditions or bracket for you (RQ-07 content). The Strategy tab makes them easy to enter; filling them in stays with you and Claude chat.
- Search by role in the app screens (Claude's existing role filter keeps working).
- The bulk role pass for the whole collection (needs its own approval, after the test decks).
- Fixing the 115 cards with no card data (CC-10) and decks not at 100 cards (RQ-11).
- Commander Spellbook combo detection for "combo piece" (later).
- Card allocation actions (Sleeve, Assign, Release, Reassign) and Trade/Black binder rules.
- Producing and needing tags (RQ-10) beyond roles.

## 9. Proposed sliced build plan
Sizes: **S** = one screen change, about a day or less; **M** = one new behaviour with stored data; **L** = touches many screens or runs a large data job. Each slice is shown to the owner on the three test decks before the next starts. Every database change below **needs owner approval, is never applied by an agent without it, and is first tried on a throwaway test copy** (as for CC-25). Nothing here has been applied.

Your order (window, roles, Claude proposing roles, jobs, strategy points, health last) is kept. The Strategy tab arrives in slice 4 as its three layers and then fills in one layer at a time, so it is never half-empty.

| Slice | What you can test after it | Size | Database change? |
|---|---|---|---|
| 1. Basic card window | Click a card in Murky Business, Rocco's Secret Sauce or Arti-facts; see picture, category (editable now), and today's computed roles, read-only. Phone tap opens it too. | S | No |
| 2. Universal roles stored and editable | Add and remove universal roles on a card in the window; "Set by you". Shared baseline plus personal changes. | M | **Yes, DB-1 (needs owner approval):** a shared table of roles per card identity, a personal table of your role changes, and the proposer and "looked at" state on each. |
| 3. Claude proposes roles | Ask Claude to propose roles for a test deck; applied at once up to 120 cards, "Proposed by Claude"; Accept/Change/Dismiss in the window; Undo all from Recent changes. New Claude tools to read and propose. | M | **Yes, DB-2 (needs owner approval):** allow the change log to record the new kinds of change and group a batch for one-click undo. The held-for-approval list is only used above 120 cards, as today. |
| 4. Strategy tab, one tab in three layers | The tab opens on a phone and is organised as **Build** (the EDHREC build picker, its guide, typical numbers and the category manager, moved up from the old "Commander guide" section), **Your strategy** (today's Deck Intent fields shown as readable text and open by default, plus **Notes**), and an empty **Card jobs** layer with its wording. Summary line; empty-state wording (including the "No build yet, link the commander" step); **Ask Claude to propose** (fills the chat); **Claude's proposals bar** with Review, Accept all and Undo all (covers role proposals from slice 3). The old separate "Commander guide" section is removed in this slice. | M | **No** new stored data. It reads what slices 1 to 3 already store. Linking a commander record uses a field the deck already has [Confirmed in the app: the deck update already accepts a commander record]; the Architect confirms. |
| 5. Deck jobs and reasons | Card window shows **Category** and **Job** as two labelled fields with their hints; job picker and "why" in the window; **Card jobs** layer on the Strategy tab (cards per job, who proposed what); the deck list's **Group by: Category / Job** switch (shown only once jobs exist; Category stays the default); Claude proposes jobs for a whole deck, applied at once, and may mention a category named like a job; first working session to refine the job list together. | M | **Yes, DB-3 (needs owner approval):** a per-deck, per-card table for job, reason, proposer and "looked at" state (yours only), plus the change-log kind, plus a memory of dismissed proposals. |
| 6. Strategy points | **Strategy points** in the Your strategy layer and in the card window; strategy points by card type or hand-picked list; Claude proposes strategy points for the three decks (Arti-facts artifacts, Myrkul counter cost, Rocco/Norin). | M | **Yes, DB-4 (needs owner approval)**, may be combined with DB-3: a per-deck strategy points table (named "deck strategy points"; yours only), plus the change-log kind. |
| 7. Health in broad groups, with sources | **Deck health** with the four groups, roll-up and reason per count; each number says "from the Aggro build", "common guide" or "adjusted by your strategy point"; "Counts as" in the window; the footer health strip uses the same numbers; Arti-facts' ramp is re-checked against whichever target applies (10 from the common guide, or 16 if 7d item 1 is yes). Health last, as you asked. | M | No |
| 8. Clean-up and bulk pass (separate approvals) | Bulk role pass over the collection and EDHREC candidates; removal of the old four-role list, the old default-category guess and the empty tag columns; vocabulary and decisions updated at close-out. | L | **Yes, only if the unused columns are dropped (needs owner approval, D-006 style).** The bulk pass writes shared data and needs its own approval. |

**What the Strategy tab needs from the database (flagged for owner approval, never applied).** Nothing of its own. Everything it shows is read from DB-1 to DB-4 plus today's tables: today's strategy settings and build data (unchanged), the change log and its batches (for Undo all), and the deck's cards. Three details must be built into those tables, so please approve them together with DB-1 to DB-4: (a) each proposed role, job and strategy point records **who proposed it** and whether it is **still to look at**; (b) each batch has an **id** so one click can undo it; (c) dismissed proposals are **remembered** per card and deck. The later "compare with another commander" (RQ-06) would need one more stored setting on the deck; it is outside this plan.

Slices 1, 4 and 7 change no stored data. Slice 3 needs slice 2; slice 4 needs slice 3; slice 7 needs slices 2 to 6 for the full effect but can run earlier with roles only (a reasonable cut if you want to see Arti-facts' ramp early; the owner's order keeps it last). The old path is deleted in the same task as the new one ships, as the process requires: the text-reading stand-in stays only until slice 8.

## 10. Risks and assumptions
- **Assumption:** "Mendicant" means the deck Arti-facts (commander Mendicant Core, Guidelight), "Rocco" means Rocco's Secret Sauce, "Myrkul" means Murky Business, the only decks with those commanders.
- **Assumption:** the 13-role list from RQ-01 is the starting point; the old list's Engine and Finisher become deck jobs.
- **Assumption:** the shared baseline is read-only to users; only the owner's personal changes are written in the app.
- **Assumption:** the Interaction number 10 and the roll-up membership are proposals, not confirmed from a source (see Q6).
- Risk: with Claude applying up to 120 proposals at once, a poor first pass touches a whole deck before you look. Mitigation: everything is labelled, counts are announced when they move, and Undo all is one click and sits on the Strategy tab as well as in Recent changes.
- Risk: the quality of Claude's proposed roles is unknown until slice 3; the stand-in keeps numbers stable meanwhile.
- Risk: a strategy point by card type ("every artifact") may count too many cards. In Arti-facts it would also sweep in two artifact lands and cards that make no mana. The strategy point editor previews the effect before saving and the card window shows why each card counts.
- Risk: the 115 cards with no card data stay unclassified until CC-10.
- Risk: the Strategy tab changes a screen you may know. The build picker, the build's guide and the category manager move up into the Build layer, the Deck Intent fields move into Your strategy, and the strategy notes box is renamed Notes. Nothing is removed, and the order is listed for your approval in section 7.
- Risk: a category and a job with the same name could look like duplicates. Mitigation: two labelled fields with hints, no automatic merging, and the group-by switch (section 7a).
- Risk: a deck with no build loses today's typical numbers if 7d item 1 is answered no. Mitigation: health names "common guide" on every line, so nothing looks like a build number by mistake.

## 11. Next gates
Owner confirms section 7c and 7d and approves the brief. Then Designer mockup of the card window and the layered Strategy tab (covering S1 to S17), then Architect follow-up for the exact stored data (the audit above covers what exists; DB-1 to DB-4 drafts, tried on a throwaway copy first), then Developer slices 1 to 8, Tester after each, Gene close-out.

## 12. Suggested decision text and backlog changes for Gene
This section is for Gene to apply after owner approval. The brief did not edit those files.

**Suggested new decisions (numbers for Gene to assign; the register ends at D-059).**
- **D-060 Two layers of card labels, and category versus job.** Every card has universal roles, the same in every deck and for every printing (stored per card identity, D-003). Each deck may file a card under its own category names, including one named like a role; category names never change health counts on their own. Universal roles are a shared baseline; a user's changes are personal. **Category = where a card sits in the deck list; job = why the card is in the deck. Both are kept, shown as two labelled fields with hints, and never merged automatically, even when a category is named like a job; Claude may point out a match in a proposal.** The deck list groups by Category (default) or by Job; jobs are optional and stay out of the way until Claude has proposed some. (Q1 to Q3, D-a; owner 2026-11-18.)
- **D-061 Universal role list.** The 13 roles: ramp, fixing, card draw, card selection, tutor, targeted removal, board wipe, counterspell, protection, recursion, graveyard hate, stax/tax, hand disruption. A card may hold several; no "main" role. Engine, finisher and combo piece are deck jobs, not roles.
- **D-062 Deck jobs and strategy points are one family.** A deck job (one per card per deck, with a "why it is here") and a strategy point (a statement of the deck's strategy with the cards or card type it covers) are saved on one deck, owned by one user. Both can be proposed by Claude, edited in the app, and shown in the card window and on the Strategy tab. Strategy points belong to a deck, not a commander (Rocco's Secret Sauce is a Norin the Wary deck). The word "rules" is retired for this concept (D-c). The free-text box is called Notes. (Q4, Q5, D-c.)
- **D-063 Who proposed it, and Claude's freedom.** Every role, job, reason and strategy point records its proposer (owner or Claude). Claude's proposals are applied at once up to the direct limit (120 cards per request, CC-13), labelled Proposed by Claude, undoable per batch for 7 days; above that they wait for approval as D-034a says. Claude never overwrites a value the owner set. (Q8, owner 2026-11-18. Note D-034a still says "about 10"; CC-13 already changed it to 120 and a Gene amendment is pending, so amend both together.)
- **D-064 Deck health counts broad groups; the build's numbers come first.** Health shows four groups: Lands, Ramp, Card advantage, Interaction (targeted removal, board wipe, counterspell, hand disruption), plus Plan and win conditions once jobs are set. Universal roles feed groups; a card counts once per group. **Targets come, in order, from the picked build's typical numbers, then the common guide** (lands 36, ramp 10, card advantage 10, interaction 10; where there is no build or no number for a group). The deck's strategy points and jobs then adjust the counts. **Every number states its source** ("from the Aggro build", "common guide", "adjusted by your strategy point"). Card-text reading stays only as a stand-in for cards with no role. Role weights are later. **Common numbers need confirming against sources before locking.** (Q6, D-d.) *Pending owner answer 7d item 1: whether the commander's all-builds average is a middle step for decks with no build.*
- **D-065 Card window.** Clicking a card name in a deck opens a card window with universal roles, deck category, deck job and reason, applicable deck strategy points, "counts as", and who proposed it; all editable in place. (Q9.)
- **D-066 The Strategy tab is one tab in three layers, general to specific.** **Build** (the EDHREC build for the commander, its guide, typical numbers and starting categories), **Your strategy** (plan, win condition, bracket, budget, playgroup, Notes and strategy points), and **Card jobs**. Each layer refines the one before it. It replaces the separate "Commander guide" section. Claude's proposals and deck health sit alongside. Available on a phone. (D-b, owner 2026-11-18.)
Gene records only what the owner approves, with the date.

**status.md changes (suggested).**
- Add a new backlog line **CC-26 Card roles, deck jobs, strategy points and the layered Strategy tab**: brief `briefs/card-roles-and-deck-jobs.md`, audit `reports/2026-11-18-architect-card-roles-audit.md`, spec `specs/card-roles-and-deck-jobs.md`, mockup `mockups/card-roles-and-deck-jobs.html`; status "Owner answers recorded 2026-11-18 (round 3: jobs and categories kept apart, builds folded into the Strategy tab, rules renamed strategy points, health sources named); design updated; awaiting final approval of brief sections 7c and 7d"; slices 1 to 8 per section 9; slices 2, 3, 5 and 6 each need a database change approved by the owner first; related to CC-10, CC-11, CC-13, CC-22. **CC-26 (or whichever item Gene keeps for it) now also covers the Strategy tab itself, including folding the build picker, the build's guide and the category manager into it (slice 4).** If an existing backlog item covers the Strategy tab or the build picker, fold it into CC-26 and mark it so.
- **RQ-12** (card labels overhaul): **now covered by CC-26.** Mark "REPLACED by CC-26 (brief 2026-11-18, answers recorded)". The once-per-turn cost reducer wish is met by Q6.
- **RQ-01** (universal roles): FOLDED into CC-26 (Q1, Q2 answered).
- **RQ-02** (taxonomy clean-up): FOLDED into CC-26; document clean-up at close-out.
- **RQ-03** (role modifiers/weights): kept as a separate later item "after CC-26 slice 7".
- **RQ-04** (deck jobs, why, locked flag): jobs and "why it is here" FOLDED into CC-26 slice 5, kept apart from categories (D-a); the **locked flag stays a later item** (owner: "Skip for now").
- **RQ-05** (now reads **"strategy points per deck"**; it was "commander rules"): FOLDED into CC-26 slice 6 as strategy points, one family with jobs, saved on the deck. Owner's examples (Urza, Myrkul, Yedora) become test strategy points; Urza belongs to Stax on Stax, so the test decks use the Arti-facts and Myrkul equivalents. Keep the id RQ-05.
- **RQ-06** (secret commander): **touched.** The Build layer shows which commander the build and numbers are for, read only (slice 4), and a deck can link its own commander record there. Choosing a different (reference) commander, for example Norin for Rocco's Secret Sauce, remains RQ-06, needs a stored setting, and stays open; once built, the Build layer is where it would be chosen.
- **RQ-07** (fill in strategy, intent, win conditions, bracket for all decks): **touched.** The Your strategy layer (slice 4) is where this content is entered and read, with clear empty states, and the strategy notes box is now called Notes. Writing the content stays with the owner. The read-only check that the suggestion engine and deck chat read the saved strategy stays under RQ-07.
- **RQ-10** (produces/needs tags): stays separate; reuse the same Claude proposal approach.
- **CC-10** (cards without card data): prerequisite for the bulk pass in slice 8 only.
- **CC-11** (categories for the connector): FOLDED into CC-26 (slices 3, 5, 6).
- **CC-13** (Claude's limits): reused as is (120 direct, 200 held, undo per batch). No change to CC-13 is requested.
- **CC-22** (done, wording only): note that the suggested default category now comes from the first universal role.
- Add later item **"Locked flag (pet card Claude must not suggest cutting)"**, owner-deferred 2026-11-18.
- Mark `category-management.md` and `suggested-categories.md` superseded by this brief once approved.
- Update `vocabulary.md` at close-out: "rules" for the deck-level idea is retired in favour of "strategy points"; "Notes" replaces "strategy notes"; Category and Job get the one-line hints in section 7a.
- Add the new words in section 6 to the shared vocabulary at close-out; note that "Proposed by Claude" is already applied.
