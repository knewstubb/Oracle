# Brief: Oracle as a daily-use deck workbench (Gate 1, DRAFT for owner approval)
Author: drafted 2026-11-11 from an owner interview. Status: **APPROVED by owner 2026-11-11 (including the additions in sections 10, 10a and S9). Nothing built; next step is the Gate 2 audit.**
Supersedes nothing. Widens `use-what-i-own.md` (its slice (c) is folded into priority 2 below).

## 1. What this is, in plain words
Brad wants to open Oracle every time he works on a deck and trust it. Archidekt is out of date for him, so Oracle has to be where his decks and cards live. The AI should act as a collaborator and instructor, not a template: it helps him understand why a deck works, and he builds his own version.

## 2. Finish line (owner's words, summarised)
A month from now: he looks at a deck he is building and quickly sees what it is missing, whether he owns a fix, and what he could buy with prices. He can tell whether a card raises or lowers the deck's power level. When he buys cards, importing them tells him which decks they fit and walks him through putting them away.

## 3. Priority order (owner choice: "what's missing" first)
1. **What's missing view** on a deck: verdict on top, counts below, with targets tailored to the commander and the deck's build, plus a short reason ("decks built around this commander usually run about 8 removal; you have 3"). Each gap is clickable and leads to owned cards that fill it (spare first); the chat answers the same question.
2. **Owned-card and buy suggestions:** spare, in another deck (with warning), or buy (estimated price, labelled). If nothing owned fits, say so, then suggest buys.
3. **Where every card is** with a combined move checklist (section 6).
4. **Proxy ranking** for single real copies (section 7).

Supporting: search (section 8), tags (section 9), deck goal sentence and drift check (section 5), power bracket (section 10), tokens list, mana curve and colour balance, import flow (section 11).

## 4. Scenarios
| # | Who / when | What he has | What he wants |
|---|---|---|---|
| S1 | At home, building a deck | A deck with gaps | A verdict and counts for what is missing, tailored to this deck |
| S2 | Looking at a gap | Owned and unowned cards | Owned cards that fill it, spare first; if none, buy suggestions with prices |
| S3 | After buying cards | A batch of new cards | Which decks they fit, and a checklist to put them away |
| S4 | A card he owns only once | Several decks want it | A ranked list of decks with tier and one-line reason |
| S5 | Choosing a new commander | 17 existing decks | Overlap with his existing archetypes, playstyles he does not cover, and how much he already owns |
| S6 | A new set releases | Existing decks | A list of new cards that fit, shown as "new" on the deck badge |
| S7 | Moving cards around in real life | Oracle's picture of where cards are | A checklist grouped by where he walks, with found/placed ticks |
| S8 | A card is not where Oracle says | A checklist item | "Can't find it": flagged missing, Oracle asks where to look next |
| S9 | In a game store, phone in hand | A card in front of him | A fast search: do I own it (and where), and what is it worth |

## 5. Deck goal sentence and drift
- Every deck has **one sentence** saying what it is trying to do. Oracle drafts it from the commander and the stored community builds for that commander; the owner confirms or edits it once.
- If a deck blends builds, Oracle blends the typical numbers from the closest builds. The owner can override with a custom target.
- The sentence can be adjusted to what he owns.
- **Drift check:** a view of how many cards support the goal and which do not. No per-card nagging when adding.
- **Fit band** on each card: core / supports / loose fit / off-plan, with the reason shown on tap. Bands, not numbers.
- Test idea (open): agree a set of known decks and check the bands against the owner's own judgement before relying on them. The vector trial (closed, not a go) is a reason to verify.

## 6. Card locations and the move checklist
- A card is in a deck, the alphabetical box, the lands box, or the valuable binder. Page or slot is an optional later addition.
- **Valuable binder:** valuable cards can still go into decks like any other. The price threshold is set by the owner and can change.
- **One combined checklist**, grouped by where he goes ("box: take these; Korvold: put in these, take out those, return to box").
- **Two ticks per move:** found it, placed it. Each tick updates Oracle immediately. Between the ticks the card shows as **in your hand**.
- If he stops part-way, ticked moves stay done; unticked cards stay where Oracle last had them.
- **Can't find it:** the card is flagged missing and Oracle asks where to look next, keeping the flag until it turns up.
- **Proxies** are tracked like any card. The checklist suggests swaps where a real copy is better placed elsewhere.
- Works on phone and laptop; the checklist must be easy one-handed.

## 7. Proxy ranking
For a card he owns once: a ranked list of decks with a tier (essential / good fit / nice to have) and a one-line reason. Shown on the card ("own 1, wanted by 4 decks") and on the deck (flags on proxies: "a real copy exists but a deck needs it more"). Goal: minimise proxies.

## 8. Deck building and search
- Starting a deck: pick a commander and see typical builds, build from scratch, or import a list, or a mix.
- **AI role:** asks questions and explains the engine, reacts to his ideas. Shows the popular template only when he asks, labelled as such.
- **Search:** by name, by effect, and by plain description ("rewards me for making tokens"). Plain description matters most. Results are ordered by fit with this deck's goal, with a switch to "owned first". Each result shows whether he owns it, where it is, its fit band for this deck, and any other deck that wants it more.
- **Lands:** curve and colour balance, plus a mana base check now. Land suggestions from his collection later.
- **Deck states:** Unowned cards / **Under construction** (renamed from Assembling) / Playable, plus a global Use proxies toggle (D-059). A deck is playable if legal. There is no "mark as done"; decks keep evolving, and a summary (goal, bracket, gaps, unowned cards) is always visible.
- **New cards:** a list after each set, plus a quiet badge on the deck when something strong exists. A spoiler-season heads-up is later.

## 9. Tags
- Role tags (ramp, removal, draw and so on) suggested automatically from the commander and build, plus his own tags.
- Auto tags apply immediately and are marked "auto". His edits are never overwritten; a re-tag touches auto tags only.
- A card can have several tags and counts in every group on the tag view; the deck total stays at 100.

## 10. Power level
Each deck shows a bracket from 1 to 5. Each suggested card shows whether it raises or lowers the deck's bracket. A target bracket per deck is optional; if set, Oracle warns when a card would push past it.

### 10a. Power ceiling, optimisation level, upgrading vs optimising (owner direction 2026-11-11)
Each deck is assessed on two separate measures, mapped to the official brackets (1 Exhibition to 5 cEDH):
- **Power ceiling:** how explosive the deck can be: fast mana, win conditions, and hard bracket triggers. Triggers: the count of official Game Changers (none in brackets 1 to 2, up to 3 in bracket 3, unlimited in 4 to 5), mass land denial, chained extra turns, and two-card combos that can win before turn 6.
- **Optimisation level:** how smoothly the deck runs its own plan: card ratios (lands, cheap ramp, repeatable draw, removal), mana curve, tutor density, interaction density (aim for about 40% instant-speed answers), and draw consistency.
- A **goldfish clock** (a solo test of how fast the deck wins with no opposition) gives median win turn versus best-case turn, to separate typical speed from ceiling.
- **Upgrading** raises the ceiling or win speed (compact combos, fast mana, scalable engines) and may move the deck up a bracket. **Optimising** improves consistency and ratios without raising the ceiling or the bracket.
- Every suggestion is labelled **upgrade** or **optimise**. A card that would raise the bracket is marked as an upgrade. Combined with the optional target bracket, optimise-only suggestions never push a deck past its target.
- Owner-supplied thresholds (Game Changer limits, 40% interaction, turn 6) are starting values to verify against the current official bracket rules in the audit, since the Game Changers list and rules change.
- **Power data source:** Scrollvault has a web bracket checker; no public data access is confirmed. Architect to check whether it can be used (terms and technical access). If not, Oracle computes the same measures itself from Game Changers, combo data (Commander Spellbook is already integrated) and card roles.

## 11. Import and keeping data current
- Initial big load, then small regular imports, plus single cards added by hand.
- Small import: one-line preview ("5 cards, all matched") and one confirm; full review only when something needs attention.
- After import: which decks the cards fit best, and a put-away checklist.
- Scan wins over Oracle's data, with a list of differences he can untick (as designed today).
- **Import history:** any past import can be undone.
- He trusts ManaBox scans, so no extra handling for mismatches.

## 12. Tokens
A list of tokens each deck can create. No ownership tracking for now (he is not scanning tokens).

## 12a. Quick lookup in a store (S9)
A fast card search that works well on a phone: type a name, see at once whether he owns it, how many, where each copy is (deck, box, binder), whether any copy is a proxy, and its current estimated price (labelled as an estimate; unknown is never shown as zero). It should also show which decks want it, so he knows if buying makes sense.

## 13. What must never happen
- Suggesting a card he does not own as if he did; showing an unknown price as zero or as a fact.
- A move that silently loses a card or leaves another deck short without saying so.
- Overwriting his own tags or goal sentence.
- Advice that pushes him back to the popular template without saying so.
- Testing against his live data (use the test account).
- Choices that block a later public multi-user version.

## 14. Parked (owner choices)
Post-game debrief; similar-card search outside his collection (vector trial closed); token ownership; page-level locations; spoiler-season heads-up; land suggestions from collection.

## 15. Open questions for the Architect audit (Gate 2)
- What already exists for each item above (many parts are already built: do not assume they are missing).
- Where "typical numbers per commander" come from (community builds stored per commander; most build card lists are empty today).
- Power bracket data: source and accuracy; whether Scrollvault can be used at all; check the current official bracket rules (Game Changers list and limits).
- Whether "in your hand" and the box / lands box / binder locations fit the current data model without a schema change.
- Whether a fit band can be judged reliably, and how to test it.

## 16. New words (to add to vocabulary.md on approval)
- **In your hand:** picked up for a move but not yet placed.
- **Under construction:** deck state replacing "Assembling".
- **Goal sentence:** the one line saying what a deck is trying to do.
- **Fit band:** core / supports / loose fit / off-plan.
- **Drift check:** summary of cards that do not serve the goal.
- **Power ceiling / optimisation level:** how explosive a deck can be versus how smoothly it runs its plan.
- **Upgrade / optimise:** a change that raises the ceiling (upgrade) versus one that only improves consistency (optimise).
- **Goldfish clock:** solo test of how fast a deck wins with no opposition.

## 17. Owner answers to the Gate 2 audit questions (2026-11-11)
Audit: `reports/2026-11-11-architect-daily-use-audit.md`. These supersede anything above that disagrees.
1. **Role numbers per commander:** derived by classifying EDHREC top cards by card text, cached per commander, and labelled with their source ("based on N EDHREC cards"). Where data is thin: show type counts only, say "no role data for this commander yet", and show a generic target labelled "general guide". Never invent a number.
2. **Tags and strategy:** a new deck shows the generic role tags (ramp, draw, removal, wipes) until a strategy is agreed. Once the goal sentence is confirmed, the deck's own tags replace them (for example Mendicant: Fast Start, Artifact flood, Construct payoff), each with a suggested target the owner can change. A deck uses one set or the other. Oracle proposes a starting strategy and draft sentence from the stored build themes (all 1,885 builds have a theme; 6,459 strategy notes exist).
3. **Bracket warnings:** only cards labelled "upgrade" warn; optimise cards never do.
4. **"In your hand" is a real system location, not a label.** Ticking "found" takes the card out of its source deck at once (the deck shows short by one). It can be placed in a deck or location, or put back anywhere. This replaces the audit's "derived state" recommendation.
5. **Goldfish clock: parked.** Show official bracket triggers and Oracle's own ratios first.
6. **System locations:** In your hand, Missing, and Unsorted (existing name kept; used for new imports). Cards in Missing cannot be allocated to a deck and are excluded from "spare". A deck that loses a card to Missing keeps it as a planned slot, shows short by one, and Oracle suggests a proxy or a spare copy. **Owner approved bringing Missing back** (reverses D-028 for this purpose).
7. **Valuable binder:** no price limit and no automatic suggestions. The binder is a location the owner fills by hand. (Replaces the price-threshold idea in section 6.)
8. **Game Changers list changes:** existing decks stay as they are and show a banner ("bracket may now be 4"). Game Changers are stored as dated data, not hard-coded. Next possible change: 2026-11-30.

**Decisions for Gene to reconcile at close-out (owner-approved in chat 2026-11-11):** D-028 reversed for the Missing system location; D-039 extended (a card removed from a deck for a move goes to In your hand until placed). `decisions.md` is not edited yet.
**Correction for status.md:** the vector trial left 450 `ref_build_cards` rows (150 each for 3 builds), not 150.

## 18. Phasing (owner agreed 2026-11-11)
Step by step; the owner tries each phase before the next starts. Each phase gets its own Gate 3 mockup, Gate 4 slices and owner click-through.
1. ~~Quick wins (store lookup, import history/undo, small-import fast path)~~ **Skipped for now (owner: can live without).** Parked in status.md.
2. **What's missing view (CURRENT):** role numbers per commander from EDHREC, verdict plus counts, clickable gaps leading to spare cards then buy ideas, honest fallback (answer 1), generic tags until a strategy exists. Fixes the all-red health result.
3. Know where cards are: system locations (In your hand, Missing, Unsorted), combined checklist, found/placed ticks. Needs a schema change and owner approval of the stored-data change first.
4. Goal sentence, deck-specific tags, fit bands (tested against the owner's own judgement before being relied on).
5. Proxy ranking, plain-description search, power ceiling and upgrade vs optimise.
6. Later: new-set suggestions, tokens list, commander discovery.

## 19. Phase 2 design answers (owner, 2026-11-11)
Mockup `mockups/whats-missing.html`, spec `specs/whats-missing.md`, report `reports/2026-11-11-designer-phase2-whats-missing.md`.
- The view is named **Deck gaps** (not "What's missing") so it cannot clash with the Missing location in Phase 3.
- A role shows **Light** when it is 2 or more short of the typical number (7 of 8 reads "On track").
- Buy ideas are collapsed with a count when owned options exist; they open by themselves when nothing owned fits.
- With thin data, no buy ideas are shown; a plain sentence says why.
