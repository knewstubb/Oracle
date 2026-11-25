# Report: card-info-vs-claude-use
Role: Architect (read-only investigation)
Status: DONE
Task as received: reconcile everything that can be shown or saved on the card window against how Claude will read and write that information, and recommend how the information should be structured. Owner decisions listed in the brief are not re-opened.

## Summary for the owner

**Claude cannot yet see or save most of what the card window shows.** Today Claude can read a card's category and its type, and it can change categories. It cannot read stored roles, jobs, strategy points or health targets, because those tools are not built yet. Claude also cannot read your strategy text at all (win condition, playgroup, notes), yet it can overwrite your notes.

**The bigger gap is the deck strategy itself.** The design stores strategy as free text (win condition, notes) and as "strategy points", but a strategy point must name cards or a card type. A statement like "Urza wins with an artifact combo, so it needs little ramp" has nowhere to be saved in a form Claude can reason over. Nothing links a card's job to the strategy it serves. For example: Skullclamp's job is "Engine", but nothing records which part of the strategy that engine feeds.

**Recommendation in one line.** Give Claude one "read the whole deck" view ordered strategy, jobs, cards, health. Add a small optional link from each job to the strategy it serves, and let a strategy statement exist without naming cards. The first part needs no database change. The second part needs one.

## 1. Table: every field on the card window, and what the deck holds that relates to it

Key. **Whose**: Card = a fact about the card, same everywhere. Owner/card = your choice per card, same in every deck. Owner/card/deck = your choice for this card in this deck. Deck = belongs to the deck. **Writer**: O owner, C Claude, S system. **Claude today**: R read, W write, none.

### 1a. The card window as built and as designed

| Field | Whose | Writer | Claude today | After which slice | What Claude uses it for |
|---|---|---|---|---|---|
| Picture, name, printing | Card | S (import, sleeve) | R: `get_deck` card rows. W: only by adding or removing cards (`add_cards_to_deck`, `remove_cards_from_deck`) | no change | Identify the card |
| Placement badge (In deck / Planned, Original / Proxy) | Owner/card/deck, set by system actions | O, C (sleeve, proxy tools), S | R: `get_deck`, `list_deck_cards_by_ownership`. W: `sleeve_free_copy`, `make_slot_original`, `create_proxy_for_slot` | no change | Judge what is buildable, buying list |
| Supertype, card type, subtype (read-only list in the window) | Card | S | R as one type-line sentence inside the card facts of `get_deck` and `search_collection`. Not split into three lists. W: none, correct | no change | Land-first rule, "all artifacts" strategy points, tribal fit |
| Mana cost, mana value, colours, rules text (not shown as text in the window, only in the picture) | Card | S | R: facts block; rules text only when `include_rules_text` is true | no change | Judge fit with the commander, find mechanics |
| **Category** (one, where it sits in the list) | Owner/card/deck | O, C | R: `get_deck`, as a list of names. W: `set_card_category`, 1 to 5 names per card | slice 3/5 adds it to `get_card_labels` | Sorting and display only. It must not drive counts (S8, S19) |
| **Universal roles** (13) | Owner/card (the same in every deck for this user) | O, C proposes, S baseline (empty at start) | R: only the old four text-guessed roles (Ramp, Draw, Removal, Wipes) in `get_deck_health`, `search_collection`, `get_collection_summary`. Stored roles are not exposed. W: none | **Slice 3** (`get_card_labels`, `propose_card_labels`) | What a card does in any deck. Counts toward health. Spotting duplicates when proposing cuts |
| **Job** | Owner/card/deck | O, C proposes | R none, W none | Tables exist (DB-3). Claude tools in **slice 3** (the same `propose_card_labels` call carries jobs); window and Strategy tab in **slice 5** | Why this card is in this deck. Judge fit with the strategy, find cards with no purpose, propose cuts |
| **Why it is here** (one sentence, 200 characters) | Owner/card/deck | O, C proposes with the job | none | same as Job | Explain a cut or keep to the owner in the owner's words |
| Proposal label ("Set by you" / "Proposed by Claude") and its reason | Owner/card/deck | S | none | Slice 3 read: `from`, `state`, `beside` fields. Claude can never set "Set by you" | Know what the owner has settled and not overwrite it |
| **Strategy points that apply** | Deck (shown per card) | O, C proposes | none | **Slice 6** (`get_strategy_points`, `propose_strategy_points`) | The deck's own rules about groups of cards |
| **Counts as** (which health groups the card adds to, and why) | Derived, per card per deck | S | none. `get_deck_health` returns group totals only | **Slice 7** (updated `get_deck_health`) | Explain a number, judge whether a card is pulling weight |
| Save state, 10-second Undo, "Last changed by you" | Screen only | S | none | Claude's own changes: `undo_change` and `list_recent_changes` work today | Not needed, except Claude's undo |

### 1b. What the deck holds that relates to those fields

| Deck-level information | Whose | Writer | Claude today | After which slice | What Claude uses it for |
|---|---|---|---|---|---|
| Commander (name, colours, rules text) | Deck | O, C (`set_deck_setup`, `create_deck`) | R: summary and the commander's card row | no change | "What the commander enables". Claude has to work this out itself every time. It is not stored |
| Win condition, playgroup, budget, frustrations, format notes (Deck Intent) | Deck | O | **none**. Not in any tool [Confirmed: grep of `src/lib/connector` finds only `strategy_notes` and `bracket`, both in `edit-tools.ts`] | No tool planned in the contract | The aim of the deck. Needed to judge every job |
| Notes (`strategy_notes`) | Deck | O, C | W only: `set_deck_setup` replaces the whole text [Confirmed: `src/lib/connector/tools/edit-tools.ts` lines 127 and 360]. R: none | No read tool planned | Same as above. Today Claude can wipe your notes blind (undoable for 7 days) |
| Earlier notes (dated list) | Deck | O | none | none planned | Context only |
| Bracket | Deck | O, C | R and W [Confirmed: `bracket.ts`, `set_deck_setup`] | no change | Power level of proposals |
| Picked build, its guide and typical numbers (EDHREC) | Deck | O | Only indirectly, as a source line in `get_deck_health` | Slice 7 (source on every number) | Fallback targets. The three test decks have no commander record or build linked [Confirmed: contract section 2] |
| Strategy points | Deck | O, C | none | Slice 6 | See above |
| Health targets (4 numbers, a reason each, set by Claude or owner, previous value) | Deck | C sets, O overrides | none | **Slice 7** (`set_health_targets`, `get_deck_health`) | Set from the strategy; judge "light" |
| Health counts | Derived | S | R: old four groups with text-guessed roles | Slice 7 | Judge balance |
| Recent changes and batches | Deck | S | R: `list_recent_changes`, `get_change_status`. W: `undo_change` | covers new kinds without change | Explain and undo what Claude did |

Tag note: tables for roles, jobs, strategy points and health targets are described as applied in the investigation brief; the earlier approval pack says "not applied" [Confirmed: `docs/oracle/reports/2026-11-18-db-roles-approval-pack.md` line 4]. The built card window already reads stored roles [Confirmed: `src/components/CardWindow.tsx` RolesSection, `src/lib/card-window-stored-roles*.ts`], so at least the roles table is live. I did not check the live database (read-only, no database access used). [Approximate]

What is actually built in the card window today [Confirmed: `src/components/CardWindow.tsx`]: category (one, with Edit), roles (stored, editable), type lists (read-only), and the line "Jobs and strategy points are coming". No job, why, strategy points, or counts-as yet.

## 2. Gaps and mismatches

### 2a. Claude would need it but it is not stored or not exposed
1. **Claude cannot read the owner's strategy text.** Win condition, playgroup, frustrations, budget, notes and dated notes have no read tool. This is the input D-060 says every health number is derived from. [Confirmed: `src/lib/connector/tools/*` contains no reader; `get_deck` returns summary and cards only]
2. **Claude can overwrite notes without reading them.** `set_deck_setup` "replaces the old notes" [Confirmed: tool description in `src/lib/connector/tools/index.ts`]. Undoable, but the owner would see their notes disappear.
3. **A strategy statement that names no cards cannot be saved.** A strategy point requires either a card type or a list of cards [Confirmed: `supabase/drafts/20261118120300_roles_db4_strategy_points.draft.sql` `deck_strategy_points_covers`; `covers_kind NOT NULL`]. So "what the commander enables", "the aim" and "win conditions" can only live in the free-text Notes or the Win condition box. Claude would reason over prose it cannot even read yet.
4. **Nothing links a job to the strategy.** A job is a name (free text, 40 characters) plus a sentence [Confirmed: `20261118120200_roles_db3_deck_card_jobs.draft.sql`]. A strategy point lists the cards it covers by type or list, but that list does not say what job those cards do. Claude cannot ask "which cards serve no part of the strategy" or "which strategy point has no payoff".
5. **Commander-enabled mechanics are nowhere stored.** Claude has to re-derive them from the commander's rules text on every conversation, and may derive them differently each time. The owner cannot see or correct what Claude assumed.
6. **Health targets and overrides cannot be read until slice 7.** Claude's `set_health_targets` learns about an owner override only by being refused (`left_alone`) [Confirmed: contract section 8.6]. It should know before it plans.
7. **No tool exposes per-card "counts as" reasons** until slice 7.

### 2b. Stored, but Claude cannot see it
- Stored roles, jobs, strategy points, targets: no read tools yet (slices 3, 6, 7).
- `deck_cards` also holds `tags`, `dead_weight_flag` and `dead_weight_reason` [Confirmed live per contract section 2]. I did not find them in the connector tools [Approximate]. If the "dead weight" flag is a cut signal the owner relies on, Claude should see it, and it overlaps with the job "Flex".

### 2c. Two fields giving Claude conflicting signals
1. **Different role words from different tools until slice 8.** `search_collection` and `get_collection_summary` speak four roles (Ramp, Draw, Removal, Wipes), text-guessed, lands never have one. `get_card_labels` will speak 13. The same card can be "no role" in one tool and "Ramp, Fixing" in another. [Confirmed: tool descriptions in `src/lib/connector/tools/index.ts`; contract 8.1]
2. **The tool wording still tells Claude to use roles as categories.** `add_cards_to_deck` says to give every card "a role category (for example Ramp, Card Draw, Removal...)" and that unlabelled cards land under "Other". The owner decision, and the already-built rule, is that a new card starts in its type's category, land first [Confirmed: `docs/oracle/reports/2026-11-18-developer-default-category-rule.md`]. Following the tool text, Claude would put Sol Ring in "Ramp" and Skullclamp in "Draw", which blurs category with role.
3. **Category count.** Claude's `set_card_category` accepts 1 to 5 categories, and the spec (6.2) allows up to three chips. The owner decided the window shows one category only. A card Claude gives two categories would show one in the window and both in the deck list.
4. **The spec still suggests a category from the first role** ("Sol Ring suggests Ramp", spec 6.2) while the owner's rule is the type category. One of them is out of date, and it is the spec.
5. **Jobs and counts.** The spec (10.3) says "a strategy point or job can say counts as Ramp"; the contract (S12) says only strategy points change counts and jobs feed only the "Plan and win conditions" line. The built design follows the contract. Claude must be told the contract version, or it may expect a job to move a number.
6. **Job names count by spelling.** The Plan group counts only Engine, Enabler, Payoff, Combo piece and Win condition, case-insensitively. A Claude-invented job such as "Sacrifice outlet" counts nowhere, and the owner sees a job that "does nothing". [Confirmed: contract 7.1]
7. **Category, job and role can all say "Ramp"** on one card. The design handles this by never merging (spec 6.7), but Claude needs the rule stated in its tool text, or it will treat three agreeing labels as one stronger signal.
8. **A role is the same in every deck, a job is per deck.** A Claude role proposal made while working on Arti-facts is saved for the owner's card everywhere, and changes health in other decks that hold the card. The label records the deck it came from, but the owner is not told it reaches other decks. [Confirmed: `user_card_roles` has `proposed_in_deck_id`, `20261118120000_roles_db1_card_roles.draft.sql`]

### 2d. Hard to undo or hard to explain
1. **Targets depend on jobs and points that may later be undone.** Claude sets a target from the strategy, citing its own proposed jobs. If the owner undoes the job batch, the target stays with a reason that now cites something that is gone. Each target is a separate change batch from the jobs.
2. **"Claude keeps targets up to date" only happens when Claude is in a conversation.** The connector is request-driven, there is no background work. If the owner edits the win condition by hand in Oracle, targets do not move. D-060 reads as if they do.
3. **Proposed values count at once** (contract 7.3), so health numbers move before the owner has looked at anything. This was the owner's choice (Q8), but the owner sees a number change with no card they chose behind it unless "N are still Proposed by Claude" is shown next to it. It is specified; it needs to be built that way.
4. **Undo is all-or-nothing for Claude, partial for the owner.** Claude's `undo_change` refuses the whole batch if any card changed since; the owner's Undo all skips changed cards [Confirmed: contract 6.3]. Claude saying "I'll undo that" may be refused where the owner's button works. Claude's tool text should say so.
5. **A job sits under the card's identity, not its slot.** Two copies of one basic land share one job; a card removed and re-added gets its job back [Confirmed: contract S7, 3.3]. Surprising only for basics and re-adds, and probably fine.
6. **The spec promises "Stop applying to this card"** on a strategy point (6.5). A point that covers a whole card type has no exclusion list in the table [Confirmed: DB-4 columns]. Not buildable as written without a data change. [Approximate: the spec may mean converting the point to a card list]

## 3. Recommended structure

### 3a. What Claude reads in one call to understand a deck
A single "deck brief" read (a new read tool, or an expansion of `get_deck`; this is code, not a database change). In plain words, one answer holding, in this order:
1. **The deck**: name, commander with its rules text, colours, bracket, status, and which build is picked (or none).
2. **The strategy**: the win condition, the aim, playgroup, frustrations, notes, and every strategy statement with the cards or type it covers, who set it and whether it is still to look at.
3. **The targets**: for each of the four groups, the number, its source, its reason, who set it (so Claude sees an owner override before it plans), the current count and whether it is light.
4. **Every card**: one row with slot number, name, type line, one category, effective roles (each marked yours, standard or Claude's), job and reason (marked yours or Claude's), the strategy statements covering it, and which groups it counts toward.
5. **What is waiting**: proposals still to look at, and the last few batches Claude can undo.

A 100-card deck fits one answer today (`get_deck` already does this at 150 per page). Adding roles, job and reason per card is the same size order as `get_card_labels`, which is planned for 150 per page.

### 3b. The order Claude should reason in
1. **Strategy**: read what the commander enables, the aim and the win conditions. If any is missing, Claude writes it down as a proposal and asks, before judging cards.
2. **Jobs**: for each card, ask "what is this for, in this strategy?" and propose a job with a one-sentence reason that names the strategy item it serves.
3. **Cards**: with jobs set, find cards with no job or one that serves nothing, plan cuts and additions. Roles are used here for duplicates and balance.
4. **Health**: last, set the four targets from the strategy, each with a reason that quotes what it relied on. Counts come from roles, then strategy point effects.

### 3c. What should change

**No database change (code, tool text, spec wording):**
- C1. Add the deck-brief read described above, including the strategy text (closes 2a-1, 2a-6).
- C2. Make `set_deck_setup` notes add to the notes, or require Claude to read them first, so notes are never wiped blind (2a-2).
- C3. Rewrite the `add_cards_to_deck` and `set_card_category` tool text: category is where the card sits (start in the type category, land first); never copy a role into a category; one category per card (2c-2, 2c-3).
- C4. Say in the Claude tool text: jobs never change counts; prefer the seven starting job names; a custom name counts nowhere (2c-5, 2c-6).
- C5. Show on the Strategy tab "Claude's targets were set before your latest change to the strategy, jobs or strategy points. Ask Claude to refresh them." Derived from update times, no new storage (2d-2). Keeps D-060 honest: Claude refreshes only when asked.
- C6. State on every Claude role proposal that it applies to the card in all decks (2c-8).
- C7. Update the spec: remove "suggest category from role" (2c-4), and remove "or job" from health counts (2c-5). Expose the old 4-role words as "text guess" in tool text until slice 8 (2c-1).
- C8. In the card window, show the job's "serves" line (see below) once it exists; no other change to the layout. The category-versus-job two-block layout and "one category only" already match the owner decisions.

**Needs a new database change (flag for owner approval, not drafted):**
- **DB-6a. Let a strategy statement exist without naming cards.** Add a type to a strategy point (for example: aim, what the commander enables, win condition, counting rule) and let `covers` be empty for the first three. DB-4 requires covers today. This gives Claude structured strategy in place of prose, and gives the Strategy tab a home for "what the commander enables".
- **DB-6b. Link a job to the strategy statement it serves.** One optional reference on each job row (card in this deck, to a strategy statement). It lets Claude list cards that serve nothing, and lets the card window say "Serves: win by artifact combo". It is optional so existing jobs and the seven names keep working. Alternative without a database change: Claude names the statement in the reason sentence. That works for reading but cannot be counted or checked, and it breaks when the owner edits the statement.
- **DB-6c (only if kept in the spec).** An exclusion list on a type-wide strategy point for "Stop applying to this card". Recommendation: do not build; convert the point to a chosen-card list when the owner removes one card, which needs no change.

Sequence recommendation: build the read and the notes safety first (no database), run Claude's first proposal pass on Arti-facts in slice 3, and then decide DB-6a and DB-6b with real examples in hand. If Claude's reasons name the strategy well enough in prose, DB-6b can wait.

## 4. Open decisions for the owner

1. **When Claude judges a card, should the deck's aim, win conditions and "what the commander enables" be short separate items you can see and edit, or stay as your own written text?** Recommendation: short separate items, each editable and labelled "Set by you" or "Proposed by Claude". You would see, for example, three lines under Your strategy: "Aim: win by combo with artifacts", "Commander enables: Urza makes mana from artifacts", "Win condition: infinite loop". Trade-off: one more thing to look over, and one database change (DB-6a).
2. **Should each card's job say which part of the strategy it serves?** Recommendation: yes, optional. The card window would show "Job: Engine. Serves: Urza makes mana from artifacts." Without it, Claude can only tell if a job fits by reading your words each time.
3. **Should a job ever change the health counts?** Recommendation: no. Only strategy points change counts (the built design). A card's job explains why it is there; its role and strategy points decide what it counts as. Example: Skullclamp is an Engine and counts as Card advantage through its role, not through its job.
4. **When Claude proposes a role for a card while working on one deck, should it apply to that card in all your decks?** Recommendation: yes, because roles are the same in every deck, but say so every time. Example: Claude marks Sol Ring as Ramp while working on Arti-facts, and Korvold's numbers change too. The alternative is per-deck roles, which contradicts "universal".
5. **If you edit a deck's strategy yourself, should Oracle tell you that Claude's health numbers are out of date and may need refreshing?** Recommendation: yes, a quiet note and a prompt to ask Claude. Claude can only update numbers when you are talking to it.
6. **Should Claude be allowed to replace your Notes?** Recommendation: no. Claude may add to your notes, not replace them. Today it can replace them without reading them.
7. **Should Claude use only the seven starting jobs unless you ask for a new one?** Recommendation: yes. A made-up job name does not appear in the Plan counts, so the card looks like it does nothing.
8. **Should a card on its own be allowed in more than one category when Claude files it?** Recommendation: no, one category only, to match the window. The tool and the spec still allow up to five and three.
9. **Do you rely on the "dead weight" flag when cutting cards, and should Claude see it?** Recommendation: yes, if you use it, since it overlaps with the Flex job. I could not confirm where or whether it is used. [Approximate]

## Files read
`docs/oracle/specs/card-roles-and-deck-jobs.md` (sections 1 to 13), `docs/oracle/contracts/card-roles-and-deck-jobs.md` (sections 0 to 10), `docs/oracle/briefs/card-roles-and-deck-jobs.md` (slice table), `docs/oracle/decisions.md` (D-034, D-034a, D-059, D-060), the five drafts `supabase/drafts/20261118120000` to `120400`, `src/lib/connector/tools/index.ts`, `edit-tools.ts`, `get-deck.ts`, `bracket.ts`, `src/components/CardWindow.tsx`, `src/lib/card-window-roles.ts`, `docs/oracle/reports/2026-11-18-developer-default-category-rule.md`, `docs/oracle/reports/2026-11-18-db-roles-approval-pack.md`. The types file was not read separately; the contract describes it.

## Verification
- Read-only: no code, database or server changes. Only this report and its copy were written.
