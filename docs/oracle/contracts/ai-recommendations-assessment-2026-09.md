# AI recommendations assessment — September 2026 (T-19)

> **Status: ASSESSMENT — not an approved implementation contract.** Nothing here adopts a vendor, changes a locked decision, or authorises code, migrations or data changes. It is input for T-15 (advisor tool contract), T-28 (state/action contract) and future owner approval.
>
> Author: Architect · Date: 2026-09-29 · Base: `task/t19-ai-assessment-20260929` @ `0a74e8e` plus uncommitted Orchestrator documents present in the worktree.
>
> Evidence tags: `[Confirmed: path]` = read in this worktree; `[Executed]` = I ran it offline in this task; `[Approximate]` = inferred, not proven; `[Vendor]` / `[Independent]` = external source, URL in §4.1 and §11. Code capability is kept separate from deployed data coverage: I had no live database access, so row counts come only from local snapshots or research exports.

---

## 0. Findings in brief

1. **The live assistant mostly gives model guesses around a thin layer of data.** The two live paths are the sidebar advisor and the new-deck flow. The skeleton step gets only the commander name, colours and a chat-derived decision log; the model writes its own card names, rules text, type lines and mana values `[Confirmed: src/app/api/brew/skeleton/route.ts]`. The most grounded pipeline, which selects only from supplied EDHREC and collection lists, exists only in unwired routes `[Confirmed: src/app/api/ai/brew/generate/route.ts, src/lib/brew-prompts.ts]`.
2. **Advice is not read-only today.** The sidebar applies `add_cards`/`remove_cards` events straight to the deck with no confirmation step `[Confirmed: src/contexts/OracleContext.tsx ~L566–600]`. The "refresh upgrades" action deletes stored suggestions and writes an empty list `[Confirmed: src/app/api/decks/[id]/upgrade/refresh/route.ts]`.
3. **Ownership facts given to the AI cannot express the approved vocabulary** (D-025/D-026/D-030). Proxies are invisible and printing and finish are hard-coded. Any deck row, including Maybeboard, counts as an allocation. Several AI-facing ownership queries are not scoped to the user `[Confirmed: src/lib/card-repository.ts; src/app/api/ai/recommend/route.ts; src/app/api/ai/brew/generate/route.ts]`.
4. **Card facts are incomplete for rules reasoning.** `ref_cards` is keyed by name, with no `oracle_id`, card faces, produced mana or current legality source `[Confirmed: src/types/supabase.ts]`. Two live code paths still query `mtg_cards`, which was renamed to `ref_cards` on 2026-07-30 and has no compatibility view. The skeleton therefore silently falls back to model-invented metadata, and the fuzzy lookup falls through to other sources `[Confirmed: supabase/migrations/20260730044951_rename_tables_prefix_convention.sql; src/app/api/brew/skeleton/route.ts L252–285; src/lib/tool-registry.ts L1495–1510]`.
5. **Commander data is a popularity-first sample.** The local snapshot holds exactly 50 cards for each of 1,885 builds, selected **by inclusion rate** `[Executed: snapshot query] [Confirmed: scripts/sync-edhrec-builds.ts L48, L427]`. The live EDHREC tool sorts by inclusion and probably reads the wrong JSON shape `[Approximate]`.
6. **Four incompatible role/category systems exist, and the live one is single-label.** Run on verified rules text, it labels Rampant Growth and Cultivate "Tutor", Pitiless Plunderer "Ramp", and Blood Artist and Viscera Seer "Other" `[Executed]`. The existing archetype rule detector labels 645 of 1,885 builds "combo" and contradicts EDHREC on 369 `[Confirmed: research/edhrec-sync/archetype-analysis-report.md]`.
7. **Feedback signals exist but are never read back.** Upgrade apply/skip is logged. Debrief tables exist but have no code consumers. Preferences, when missing, are silently replaced by invented defaults: bracket 3–4, combos allowed, prefer owned `[Confirmed: src/lib/user-preferences.ts]`.
8. **Jev (TypeSafe AI) is real and is a classifier, not a generator.** Verdict: **not recommended yet**; a bounded offline trial for card tagging only becomes worthwhile after data and evaluation gates (§4.6). The main quality problems are data, retrieval and verification, which no model swap fixes.

---

## 1. System map

### 1.1 User-facing AI journeys

| Journey | Status | Entry → server | Model(s) | Data the model actually receives | Output handling / validation | D-016 | Key defects |
|---|---|---|---|---|---|---|---|
| Oracle sidebar advisor (chat) | **Live** — `OracleSidebar` is mounted in the app layout `[Confirmed: src/app/layout.tsx]` | `OracleContext` → `POST /api/oracle/chat` `[Confirmed: src/contexts/OracleContext.tsx ~L500]` | Default id `deepseek-v4-pro` → `deepseek-chat`. The "V4 Flash" label maps to the same `deepseek-chat`, so the labels are misleading `[Confirmed: src/lib/ai-models.ts]` | System prompt, preferences block, tools on request (§1.2). The commander is looked up by exact `display_name`, so partner decks likely miss `[Approximate]` | Tool loop, maximum 10 iterations `[Confirmed: src/lib/tool-executor.ts]`. The frontend regex-parses `{{commander:Name\|pitch}}` from prose `[Confirmed: src/components/CommanderSuggestionCard.tsx ~L205]` and **auto-applies** add/remove events to `/api/decks/{id}/cards/batch` `[Confirmed: OracleContext ~L566–600]` | Violation (prose regex) | Advice changes decks without confirmation. The DeepSeek adapter strips tool-call markup that arrives as text, so those tool calls are **silently dropped** rather than executed `[Confirmed: src/lib/adapters/deepseek-adapter.ts L95–175]` |
| New deck: brew chat | **Live** `[Confirmed: src/app/new-deck/page.tsx L853]` | `/api/brew/session`, `/api/brew/chat` | DeepSeek default, with tools; then Haiku `claude-haiku-4-5-20251001` extracts decisions | Chat history plus tools | Decisions are extracted from prose by stripping code fences and running `JSON.parse` `[Confirmed: src/app/api/brew/chat/route.ts ~L474–595]` | Violation | Decisions are extracted after the fact instead of being emitted as structured tool output. The session is read with the admin client and no user check `[Confirmed]` |
| New deck: skeleton | **Live** `[Confirmed: new-deck/page.tsx L674]` | `/api/brew/skeleton` | Sonnet `claude-sonnet-4-6`, **no tools** | Commander name, colour identity, decision log, preferences. "Owned only" / "prioritise owned" tell the model to use the collection **but never pass it** `[Confirmed: skeleton/route.ts prompt ~L20–110]` | `parseSkeleton` parses fenced JSON `[Confirmed: ~L415]`. Enrichment queries `mtg_cards` (renamed; fails) and only fills blanks, so model-invented rules text survives `[Confirmed: ~L252–285]`. No name resolution, legality or colour-identity check | Violation | Highest hallucination exposure of any path |
| New deck: save | Live | `/api/brew/save` | none | Skeleton | Writes deck | n/a | Inherits unvalidated names |
| Deck page: Upgrade tab | Live (reads stored rows) | `/api/decks/{id}/upgrade`, `/apply`, `/skip` | none at request time | Precomputed `deck_upgrades` rows; unclear how they were produced `[Approximate: legacy offline engine + load-postgres]` | Apply/skip is written to `upgrade_change_log` `[Confirmed]` | n/a | Stale by construction; nothing regenerates them |
| Deck page: Upgrade refresh | Live and **destructive** | `/api/decks/{id}/upgrade/refresh` | none | — | Deletes the deck's `deck_upgrades` and writes an empty list (TODO stub) `[Confirmed]` | n/a | One click wipes suggestions |
| Deck page: Analysis / Strategy / Combos / Overview | Live (reads stored text) | `deck_ratings`, `deck_combos`, `deck_mana_analysis`, `deck_overview_content` | none at request time | Stored text | Display only | n/a | Stale; not linked to card identity |
| Deck page: Health strip | Live, deterministic | `health-engine` + `category-classifier` | none | Deck cards | Deterministic | n/a | Single-label classifier (§1.5) |
| Card group categories | Live | `/api/cards/suggest-categories` | none | `scryfall-category-mapping` + `scryfall-tags-data` | Deterministic | n/a | The Scryfall tag data folder is gitignored and absent, so suggestions degrade `[Approximate]` |
| Smart search | Live, no LLM | `/api/ai/search` | none | Scryfall search with colour limit plus ownership counts | Deterministic | n/a | — |
| `/api/ai/recommend` | **Dead** (no UI caller) | — | MCP `buildAround` / `suggestCuts` | Ownership from non-proxy copies, admin client, **no `user_id` filter** `[Confirmed]` | Regex over MCP markdown | Violation | Unsafe to rewire as-is |
| `/api/ai/build-deck`, `/api/ai/mana-analysis` | Dead | — | — | — | — | — | — |
| `/api/ai/brew/*` (start/investigate/generate/refine/save/confirm/session) | Dead | — | Haiku | `generate` is the **most grounded**: `ref_build_cards` via `commander-build-data`, Scryfall-tag slots, `data/knowledge` guides, collection `[Confirmed]` | Regex JSON parsing (investigate/refine/generate) | Violation | Collection query uses `limit(200)`, no user filter and no colour filter. Build choice is by keyword substring, falling back to the most popular build. "Staple" means inclusion ≥50 or synergy ≥30 |
| `/api/brew/assess`, `/extract`, `/commit`, `/positions` | Dead | — | — | — | `assess` uses regex JSON parsing | Violation | — |
| `/api/decks/{id}/chat` | Dead (`DeckChatTab` is not mounted) | — | — | — | — | — | — |

Offline engines (`scripts/generate-upgrade-data.ts`, `detect-dead-weight.ts`, `compute-deck-ratings.ts`) read and write a legacy local SQLite database, `data/oracle.db`, which is absent and gitignored, and call MCP `[Confirmed]`. They cannot run as-is.

### 1.2 Tools available to the advisor model `[Confirmed: src/lib/tool-registry.ts]`

| Tool | Source | What is dropped or wrong |
|---|---|---|
| `get_deck_cards` | `deck_cards` | Returns name, quantity, primary category, mana, type, price. **No rules text, keywords, commander flag or Maybeboard distinction** |
| `collection_lookup` | `card-repository.ts` | Non-proxy copies only. `set_code: null` and `foil: false` are hard-coded. Every deck row counts as `allocation_status: 'original'` and `copy_id` is ignored, so it **cannot produce** Available / Alt available / Proxy available / Unavailable / Unowned |
| `mtg_commander_recommend` | Live EDHREC JSON (undocumented endpoint) | Sorted by inclusion, capped at 20. The parser reads top-level lists, whereas every ingestion script reads `container.json_dict.cardlists`, so results are probably empty `[Approximate]`. Partner slugs untested |
| `mtg_combos_search` | Commander Spellbook `/variants` | Limit 8, popularity order. No filter for the user's combo preference |
| `get_commander_insights` | `ref_commander_insights` | Markdown text only, top 20 by "confidence". `card_mentions` is null in the Korvold sample, so there are no card links `[Confirmed: research/edhrec-sync/korvold-data-dump.txt]` |
| `validate_cards_for_commander` | `ref_cards` via `ilike` | One commander only (no partner/background union). `%` and `_` act as wildcards |
| `card_fuzzy_lookup` | `mtg_cards` (renamed), then `ref_printings`, then the Scryfall fuzzy API | Supabase errors are ignored. The "valid commander" test is "Legendary and Creature", which is wrong for Backgrounds and "can be your commander" cards |
| `mtg_top_commanders` | Internal commanders search | — |
| `add_cards_to_deck` / removal | `apply_ai_deck_delta` RPC | Adds unassigned slots with `copy_id` NULL, so no automatic allocation, which is good. There is **no AI provenance** on the list change (D-009) `[Confirmed: supabase/migrations/20260912162000_atomic_collection_boundary.sql ~L1024–1046]` |

### 1.3 Structured-output (D-016) violations still present `[Executed: repository search]`

Prose/regex/fence parsing appears in:
- **Live paths:** `src/app/api/brew/chat/route.ts`, `src/app/api/brew/skeleton/route.ts`, `src/components/CommanderSuggestionCard.tsx`, and `src/lib/adapters/deepseek-adapter.ts` (tool-call markup stripped from text).
- **Dead paths:** `src/app/api/ai/brew/{generate,investigate,refine}/route.ts`, `src/app/api/brew/assess/route.ts`, `src/lib/mcp-client.ts`.

The prior audit missed the commander-card block in the sidebar.

### 1.4 Where facts become model guesses

| Point | What should be fact | What happens now |
|---|---|---|
| Skeleton card list | Real cards with verified text, type, mana value, legality | The model recalls names and writes rules text itself |
| "Owned only" build | The user's free originals and proxies | The model is told to respect ownership but never receives it |
| Advisor rules claims | Oracle text by face | `get_deck_cards` has no rules text, so the model relies on memory |
| Commander plan | Commander abilities → engines | No parsed commander profile; insights are unlinked prose |
| Pairing legality | Union colour identity for partners/backgrounds | Validation takes one commander |
| Preferences | "Unknown" when unset | Replaced by invented defaults (bracket 3–4, combos allowed, prefer owned) |
| Ownership wording | D-025 labels from a T-28 source | Model prose built from an incompatible lookup |

### 1.5 Duplicate and incompatible classifiers

| Classifier | Labels | Used by |
|---|---|---|
| `category-classifier.ts` | Single label: Ramp / Draw / Removal / Interaction / Finisher / Board Wipe / Recursion / Tutor / Protection / Other. Order: override → Archidekt map → first matching regex | Health strip, deck tabs |
| `rating-engine.ts classifyCard` | Multi-label, different set: tutor, drawEngine, recursion, removal, counterspell, boardWipe, fastMana | Ratings |
| Skeleton prompt | Win Condition, Alt Win Condition, Lands, plus free-form | Live skeleton |
| `scryfall-category-mapping.ts` + scripts (`archetype-detection-rules`, `theme-archetype-mappings`, `edhrec-tag-mappings`, `scryfall-tag-mappings`) | Tags → categories; regex theme counts | Suggest-categories; offline |
| `ref_taxonomy` | archetype / mechanic / tribe / keyword / color, linked **only to commanders** (`ref_commander_taxonomy`) — there is no card-level mechanic table | Insights |

`[Executed]` The live single-label `inferFromOracleText` on verified Scryfall rules text (temporary script, pure function, no database):

| Card | Real function (verified text) | Classifier says |
|---|---|---|
| Rampant Growth, Cultivate | Land ramp ("search… put onto the battlefield") | **Tutor** |
| Pitiless Plunderer | Death-triggered Treasure maker (aristocrats payoff) | **Ramp** (matched Treasure reminder text) |
| Deadly Dispute | Sacrifice outlet as a cost, plus draw and a Treasure | **Ramp** |
| Revel in Riches | Alternative win condition | **Ramp** |
| Blood Artist, Viscera Seer, Teysa Karlov, Mayhem Devil | Drain payoff / sacrifice outlet / death-trigger doubler / sacrifice payoff | **Other** |
| Mondrak, Glory Dominus | Token doubler | **Protection** |
| Shatterskull Smashing // Shatterskull, the Hammer Pass | Removal **and** land (modal double-faced) | **Ramp** (faces joined) |
| Light Up the Stage | Impulse card advantage | **Other** |

The regex archetype detector over-fires (645/1,885 builds "combo", 469 "enchantress", 821 "artifacts") and contradicts EDHREC's own tag on 369 builds `[Confirmed: research/edhrec-sync/archetype-analysis-report.md]`. Staples such as Sol Ring and Arcane Signet in every top-50 list likely drive the artifact count `[Approximate]`.

---

## 2. Data inventory

States: **Stored** (a table or file exists), **On demand** (fetched live), **Derived**, **Stale**, **Absent**, **Not passed** (exists but the AI never receives it).

| Data family | Where | State | Reaches the AI? | Notes |
|---|---|---|---|---|
| Canonical rules text | `ref_cards.oracle_text` (by name) | Stored; loaded from a legacy AllPrintings import `[Confirmed: scripts/sync-card-keywords.ts, scripts/load-postgres.ts]` | Only via validate/insights; not via `get_deck_cards` | No `oracle_id` on `ref_cards`. `ref_printings` has `oracle_id` but no rules text |
| Card faces (MDFC, adventure, transform, split) | — | **Absent** as structure | No | Face-level land/spell roles are lost (§1.5 Shatterskull) |
| Keywords | `ref_cards.keywords[]` (union across printings) | Stored | Partly | Scryfall keyword lists mix mechanics and token words. For example, Prosper's are `Treasure, Deathtouch`, with nothing about exile `[Executed]` |
| Unkeyworded mechanics (event/zone/restriction) | — | **Absent** | No | Needs the parser/tag model in §5 |
| Produced mana | — | Absent in `ref_cards` | No | Scryfall's `produced_mana` lists all colours for Treasure makers (Pitiless Plunderer, Smothering Tithe), so it must not be read as "is ramp" `[Executed]` |
| Commander legality / banned list | `ref_cards.commander_legal`, `ref_printings.legality_commander` | Stored; freshness unknown `[Approximate]` | Validation only | Dockside Extortionist, Mana Crypt and Jeweled Lotus are **banned** today `[Executed: Scryfall]` |
| Commander identity and pairing | `ref_commanders` (`leadership_type`, colour identity), `commander-resolver.ts` (partner, partner with, friends forever, background, doctor) | Stored / code | Resolver not used by AI validation | — |
| Commander → archetype/theme | `ref_commander_builds`, `ref_commander_taxonomy`, `ref_commander_insights` | Stored (EDHREC sync, 2026-08-05) | Insights as prose only | Sample dump: `Scryfall ID: null`, similar commanders empty `{}`, YouTube insight with confidence 0.95 `[Confirmed: korvold-data-dump.txt]` |
| Card → role/mechanic tags | — | **Absent** (commander-level only) | No | The core gap for commander-specific coverage |
| EDHREC inclusion/synergy by build | `ref_build_cards` (94,250 rows), snapshot `data/commander-context/*.sqlite` | Stored, updated up to 2026-08-06 `[Confirmed: manifest.json]` | Only through the dead generate path | Exactly 50 cards per build, **chosen by inclusion**. `is_signature` 60,971 and `is_staple` 61,386 rows (about 65% each), so the flags do not discriminate `[Executed]` |
| EDHREC per-commander recommendations | `ref_edhrec_recommendations` | **Stale/deprecated**; the sync script says the table was removed `[Confirmed: scripts/sync-edhrec-data.ts L544]` but it remains in the generated types | Not used | — |
| Combos | Commander Spellbook, on demand | On demand | Chat tool | No user combo policy applied |
| Deck composition, curve, mana | `deck_cards` + health engine | Stored / derived | Name/category/mana only | No rules text or face data |
| Prices | `ref_printings` (Scryfall), `card_kingdom_prices` | Stored (daily cron) | `get_deck_cards` price | — |
| Owned originals / proxies | `user_copies.is_proxy`, `proxy_for_card_id` | Stored | **Proxies not passed** | D-025/D-026 labels impossible from current tool |
| Printing / finish | `user_copies.printing_id`, `finish` | Stored | **Not passed** (hard-coded) | D-003/D-004 |
| Physical availability / location | `user_copies.location_id`, `deck_cards.copy_id` | Stored | **Not passed** | T-28 will define it |
| Preferences | `user_preferences` (not in generated types) | Stored if present, **otherwise defaults are invented and inserted** | Yes (prompt block) | Conflicts with "missing preferences are missing inputs" |
| Per-deck strategy | `deck_strategy` (bracket, budget, win condition, frustration, table context) | Stored | **Not passed** — `format-strategy-prompt.ts` has no callers `[Executed: search]` | — |
| Accepted / rejected advice | `upgrade_change_log` (apply/skip with reason) | Stored | **Never read back** | Usable later as weak labels |
| Game / debrief | `debrief_sessions`, `debrief_actions` | Tables exist, **no code consumers** | No | Nothing to learn from yet |
| Knowledge guides | `data/knowledge/` (25 archetype guides, colours, fundamentals) | Stored files | Dead generate path only | Useful as curated package definitions |
| Scryfall tagger tags | `data/scryfall-tags/` | **Absent** (gitignored) | No | Suggest-categories degrades |

---

## 3. What each lever would actually fix

| Current weakness | Better model | Better supplied data | Better retrieval/ranking | Better verification |
|---|---|---|---|---|
| Invented card names/text in skeletons | Marginal | **Yes** (pass real candidates) | **Yes** (select from pool) | **Yes** (resolve every name) |
| Wrong colour/legality with partners | No | Yes (pair union) | — | **Yes** (hard filter) |
| Banned cards suggested (e.g. Dockside) | No | **Yes** (current legality) | — | **Yes** |
| Generic staples crowd out specialist cards | No | Partly (full lists, synergy) | **Yes** (commander-specific scoring, diversity) | — |
| Conditional rule errors (cast vs play, nontoken) | Somewhat | **Yes** (parsed restrictions by face) | — | **Yes** (claim check) |
| Wrong ownership/availability wording | No | **Yes** (T-28 facts incl. proxies) | — | **Yes** (labels only from facts) |
| Silent tool drop (DeepSeek) | Provider choice | — | — | **Yes** (fail loudly) |
| Mis-roles (Rampant Growth = Tutor) | Could help (tagging) | **Yes** (multi-label model) | — | Gold-set tests |
| Advice changes deck unasked | No | — | — | **Product/safety fix** |
| Sparse/new commanders | Somewhat (reasoning) | **Yes** (rules-derived profile) | Yes (package retrieval without EDHREC) | Honest-unknown checks |

Most failures come from data, retrieval and verification, not the model.

---

## 4. Jev

### 4.1 Identity (verified 2026-09-29)

- **Jev is TypeSafe AI's first "System One" model**, launched in early access on 15 September 2026 and announced by founder Diogo Almeida `[Vendor: https://typesafe.ai/blog/introducing-system-one-models-and-jev]`. The current version is `jev-1.13.0`; the `jev-latest` and `jev-preview` aliases both point to it `[Vendor: https://docs.typesafe.ai/models.md]`.
- The LangChain relationship is an **integration**, not ownership. LangChain ships `langchain-typesafe` with `TypeSafeClassifier` and experimental routing/guardrail middleware `[Vendor/partner: https://www.langchain.com/blog/building-a-harness-with-jev]`.
- **"Noul" is the real name** of the yes/no question type, not a typo `[Vendor: https://docs.typesafe.ai/api.md]`.
- The backlog label "Jev (TypeSafe AI System One model)" is therefore correct.

### 4.2 What Jev is and is not

| Property | Evidence |
|---|---|
| Task type | Takes a text/JSON **state** plus typed **questions** and returns **Choice** (≤255 options, probabilities + confidence), **Score** (2–10 ordered levels) or **Noul** (probability of yes). **It does not generate text** and is not a chat model `[Vendor: api.md; https://docs.typesafe.ai/introduction/coding-agents.md]` |
| Not | Not embeddings, not a generator, not fine-tunable: "not fine-tuned or LoRA-adapted with customer data"; domain knowledge must be supplied in state and criteria `[Vendor: models.md]` |
| Limits | 64k tokens per request; 32k for state plus the longest question; text only; 250k tokens/s and 1,200 requests/min, "adjusting dynamically… can change without notice" `[Vendor: models.md]` |
| Price | $0.042 per million input tokens; output free `[Vendor: models.md]` |
| Access | Early access / waitlist; also OpenRouter and Vercel AI Gateway `[Independent review, below]` |
| SDKs | Python `typesafe-sdk`; JavaScript/TypeScript `@typesafe-ai/sdk` (Node ≥20) `[Vendor: https://docs.typesafe.ai/sdk/javascript.md]` |
| Data handling | Not trained on customer requests. DPA and privacy policy apply; zero data retention only for enterprise `[Vendor: https://docs.typesafe.ai/legal.md; https://typesafe.ai/legal/data-processing]`. The default retention period was not stated in the DPA text I reviewed |
| Known weaknesses (vendor's own list) | Literal reading; math/counting; date comparison; **indirection / multi-hop**; accuracy falls with large irrelevant state; adversarial content; contradictory criteria; no structural invariants between related questions; no generation `[Vendor: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md]` |

### 4.3 Evidence by tier

- **Vendor claims:** "193.6× faster, 444.6× cheaper" on the vendor's own workflow evals, where the reference answers are the average of two frontier models. The vendor itself says these are "on the higher end of real world gains" and that the workflows were built by its own staff. "Can't hallucinate" means **no type errors** (schema guaranteed), not correct answers.
- **Independent evidence I fetched and read:**
  - **Phishing benchmark** (2,000 emails, reproducible): Jev 62.6% accuracy vs Claude Haiku 4.5 81.3%; ECE 0.154 vs 0.097; 239 ms vs 687 ms p50; $0.038 vs $0.462 per 1,000. Decomposing the task into five signal questions plus a small regression reached about 95%, but a plain regex rule reached 91.6%, and the same five questions asked of Haiku did comparably well `[Independent: https://github.com/anisselbd/jev-phishing-bench]`.
  - **Review of evidence eight days after launch** (dev.to, 2026-09-23). Grades the studies; the preprints it cites are unrefereed. Its findings:
    - Jev is level with mid-price LLMs and 6.5–11.5 points behind frontier models in the cleanest comparison.
    - In one 200-item comparison, DeepSeek V4.1 Flash scored 76.0% vs Jev 72.5%, within noise. Oracle already uses DeepSeek.
    - Jev's calibration is good on familiar English tasks, off elsewhere, and largely fixed by one fitted temperature on 50 to a few hundred labels.
    - `[Independent/secondary: https://dev.to/gde/jev-after-eight-days-of-independent-tests-level-with-mid-price-llms-behind-the-frontier-1kln]`
  - Other search-engine results (additional blogs) were **not** opened and verified, so they are excluded.
- **My own measurements:** none. Paid or API benchmarking was not authorised, and no Oracle data was sent anywhere.

### 4.4 Fit against Oracle's four jobs

| Job | Fit | Reason |
|---|---|---|
| 1. Multi-label card mechanic/role tagging | **Possible — best of the four** | One Noul per (card face, tag) over **public** rules text suits the product. Literal reading is an advantage for rules text. Calibrated probabilities allow "flag for review" bands. But many tags are deterministically parseable from regular rules wording (§5.3; share unmeasured `[Approximate]`), and the vendor says it is weak at indirection ("whenever you sacrifice a permanent" → does a Treasure count?). It cannot be fine-tuned on MTG. Cost is not Oracle's bottleneck: tagging about 30k cards is a one-off batch in either approach |
| 2. Commander/archetype relevance and ranking | **Weak–possible as one rerank feature** | The vendor's rerank cookbook shows gains over BM25 in another domain. Commander relevance is multi-hop (ability → resource → card), which is a stated weakness. It would be at most one signal among deterministic package matches and EDHREC evidence |
| 3. Context-sensitive interactions and conditional rules | **Poor** | Needs rules reasoning across two cards' text, with restrictions and zones; this is the stated indirection weakness. Once restrictions are parsed into fields, matching is deterministic and needs no model |
| 4. Explaining adds/cuts and trade-offs | **Not applicable** | Jev does not generate text |

### 4.5 Options compared (at most three)

| | **A. Fix the current architecture (recommended)** | **B. A + Jev as a narrow tagging/verification stage** | **C. A + learned retrieval/rerank (embeddings + trained ranker)** |
|---|---|---|---|
| What | Verified card facts by face → deterministic tag parser → curated packages → EDHREC as evidence → existing LLM with forced tool output for explanation (and offline long-tail tagging) → validation | As A, with Jev Nouls proposing tags for cards the parser cannot cover, gated by confidence and human spot checks | As A, plus an embedding index over card facts and a ranker trained on EDHREC co-occurrence and accept/skip history |
| Quality | Highest attributable gains (§3); uses what exists | Same as A plus possibly faster long-tail tagging; accuracy unproven for MTG | Better recall for off-meta cards; ranker risks learning popularity; single-user feedback is too sparse |
| Semantic coverage | Rules-derived; extensible tags | Adds probability on fuzzy tags | Adds similarity-based discovery |
| Operational burden | Low–medium (existing providers) | Medium: new vendor, early access, changing rate limits, alias drift (pin versions) | Medium–high: index refresh, training pipeline |
| Speed / cost | Offline tagging batch; runtime cost = current chat | Tagging very cheap (~$0.04/Mtok) [Vendor]; runtime unchanged | Moderate |
| Privacy | Public card text only goes to providers already in use | Public card text only; no user data | Local or provider embeddings of public text |
| Maintainability | One vocabulary, one parser, tests | Plus a vendor dependency and threshold re-tuning when versions change | Plus model lifecycle |

### 4.6 Verdict

**Not recommended yet.** Confidence that "not now" is right: **medium-high**. Confidence about Jev's eventual value for tagging: **low-medium** (no MTG evidence exists).

**Disqualifiers today:**
1. Oracle's blocking problems are unsafe auto-apply, missing card facts, incompatible ownership data and no evaluation set. Jev addresses none of them.
2. It is not a generator, so it cannot replace the advisor or skeleton model.
3. It cannot be domain-tuned.
4. It is in early access and rate limits change without notice.
5. Independent accuracy is mid-tier, comparable to the DeepSeek model Oracle already uses.

**Gates before a trial is worth running:**
- G1: face-aware, `oracle_id`-keyed card facts.
- G2: the unified tag vocabulary plus a deterministic parser.
- G3: a frozen gold set (§7).
- G4: owner approval of a vendor account and spend (public card text only).

**Bounded trial design (not executed):**
- Task: tag the long-tail semantic tags the parser leaves unknown (for example `sacrifice_outlet`, `death_payoff`, `impulse_draw`, `token_doubler`, `treasure_consumer`) on the frozen card gold set.
- Size: about 400 face-level items × about 25 tags. State = the card's public rules text only. One Noul per tag, with literal criteria including boundary cases.
- Arms (identical items and tags):
  - (i) deterministic parser alone;
  - (ii) the current LLM with forced tool output;
  - (iii) Jev;
  - (iv) parser + Jev only where the parser says unknown.
- Pin `jev-1.13.0`. Fit thresholds on the dev half and report on the test half.
- **Success:**
  - per-tag precision ≥ 0.92 and macro-F1 ≥ the LLM arm − 0.02;
  - expected calibration error ≤ 0.08 after one temperature fit;
  - at a confidence gate that auto-accepts ≥ 60% of items, precision ≥ 0.97;
  - total cost ≤ 20% of the LLM arm.
- **Failure:** any of the above missed, or conditional-restriction errors (cast/play, token/nontoken, controller) exceed the LLM arm's.
- **Evidence that would change the verdict:** passing this trial, a published MTG-rules benchmark, a fine-tuning or domain option, or stable general-availability terms.

---

## 5. Commander-specific coverage model (proposal)

### 5.1 Principles

- Recommend at **card identity** (`oracle_id`, face-aware). Map to physical copies only through T-28 facts (D-001/D-003/D-004).
- Keep four provenance classes separate on every fact:
  - **D** deterministic (parsed from rules text and type line);
  - **E** externally evidenced (EDHREC, Commander Spellbook, Scryfall tagger, curated guides);
  - **S** statistically inferred (co-occurrence, synergy lift);
  - **M** model-inferred (LLM or Jev).
  
  Owner overrides are a fifth, highest-priority class, **O**.
- Tags are **multi-label with roles**, never one category per card. A card can be both *producer* and *consumer* of a resource.
- Finite tags cannot prove coverage of every emergent interaction. The system must say "unknown" and route to rules-text reasoning with verification rather than claim completeness.

### 5.2 Proposed entities (conceptual; the schema belongs to a later contract)

| Entity | Key | Content |
|---|---|---|
| Card face facts | `oracle_id` + face index | Name, type line, supertypes/subtypes, mana cost/value, rules text, keywords, produced mana, legality snapshot, layout; source data version |
| Mechanic assertion | card face + tag + role | Tag (e.g. `treasure`), role (`produces` / `consumes` / `payoff` / `enabler` / `outlet` / `protects` / `doubles`), restrictions (§5.3), provenance class, confidence 0–1, evidence reference, parser/model version, created date |
| Commander profile | commander `oracle_id` set (pair-aware) | Union colour identity; parsed **engines** (trigger event + object filter + controller + zone + frequency → effect); supported plans with evidence (EDHREC build share, curated guide); anti-synergies |
| Package | slug | Name, required roles (e.g. "Treasure aristocrats" = Treasure producers + sacrifice outlets + sacrifice payoffs + card flow), minimum density per role, knowledge-guide reference, version |
| Recommendation evidence | recommendation id | Candidate, commander/plan, matched engine(s), roles, score components, sources, verification result |

Tags and packages are versioned. Re-tagging creates new assertions and never overwrites them. Conflicts are kept and resolved by precedence: O > D > E > S > M, then by confidence.

### 5.3 Restriction vocabulary (deterministic where the text is regular)

- **Event verbs:** cast vs **play** (play includes lands), enters, dies (creature only) vs **sacrifice** (any permanent), leaves, attacks, deals combat damage, draws, discards, mills, is put into a graveyard, exiled from library/graveyard, becomes target.
- **Object filters:** creature / permanent / artifact / enchantment / land / nonland / **token vs nontoken** / subtype (Vampire, Ninja, Treasure) / "another".
- **Controller:** you / opponent / each player / "a player".
- **Zones:** hand, library, graveyard, exile, command zone. Eminence works "in the command zone or on the battlefield".
- **Frequency:** "first … each turn", "once each turn", "additional time", "until end of turn" vs "until the end of your next turn".
- **Modes and faces:** modal choices ("choose Khans or Dragons"), adventure, modal double-faced cards, transform. Tags attach to the face or mode that has them.
- **Pairing:** partner, partner with, friends forever, background, doctor's companion (already in `commander-resolver.ts`).

### 5.4 Pipeline

| Stage | Type | Detail |
|---|---|---|
| 1. Candidate pool | Retrieval | Union of: package matches on the commander's engines (D/E tags); EDHREC build lists (**full lists**, not top-50-by-inclusion); curated guide cards; owned free cards. The user's collection is a *source*, not a filter, unless the user chooses owned-only |
| 2. Hard filters | **Hard constraints** | Real `oracle_id`; commander-legal now; within union colour identity; singleton except exempt cards; not already in the main deck; house rules the user actually stated (no combos / stax / extra turns / mass land destruction) |
| 3. Package retrieval | Deterministic | Match candidate assertions to commander engines with restrictions: for example, Prosper's engine requires **play** + **from exile**; Korvold's requires **you sacrifice** + **any permanent** |
| 4. Commander-specific score | Configurable | Engine match strength × role need × evidence (EDHREC synergy, **not** inclusion), with a **specificity bonus** for cards whose value depends on this commander, and a penalty for generic colour staples beyond a capped slot count |
| 5. Diversity and role coverage | Configurable | Fill missing roles from deck analysis; cap any one package's share unless the user chose that plan; count each card once per role. A card is weighted by its **best** role plus a smaller secondary credit, to avoid double counting |
| 6. Deck-level rerank | Configurable | Actual deck: curve, land count, colour sources, redundancy, chosen plan, budget (if stated), bracket (if stated). Pair every add with a cut or open slot |
| 7. Explanation | LLM, **forced tool output** (D-016) | Output fields: card `oracle_id`, reason codes (engine matched, role filled), rules quote reference, ownership **label from facts only**, confidence, unknowns |
| 8. Validation | **Hard** | Re-resolve every name; recheck legality and colour identity; check each rules claim against assertions; ownership labels come only from the T-28 source (D-025/D-030); combo flag via Commander Spellbook when combos are not opted in; reject rather than repair |

**Anti-patterns avoided:**
- *Popularity loop:* inclusion is never used as a label or as the main score.
- *Circular evaluation:* gold relevance comes from rules and the owner, not EDHREC (§7).
- *Staples crowding:* capped staple slots plus the specificity bonus.
- *Double counting:* best-role weighting.
- *Unrequested combos:* labelled and separated, never silently included.

### 5.5 Hard cases

- **New set / sparse commander:** no EDHREC data is needed. The profile comes from parsed engines, and candidates from package tags. Explanations must say "little community data yet". Example: Vraska, Soul of Stone (§6).
- **Off-meta plans:** a user-stated plan overrides build popularity. Packages exist independently of EDHREC themes.
- **Conflicting evidence:** keep both. For example, EDHREC tags a Korvold build "aggro" while card analysis says "combo"; surface the conflict as lower confidence and prefer D over E over S.
- **Unknown mechanics:** a new keyword without a parser rule becomes an `unknown_mechanic` assertion. The card is still retrievable by text similarity, and explanations must not invent its behaviour.

### 5.6 Worked example: Prosper vs Korvold (verified rules text, Scryfall, 2026-09-29)

- **Prosper, Tome-Bound (B/R):**
  - Mystic Arcanum: "At the beginning of your end step, exile the top card of your library. Until the end of your next turn, you may **play** that card."
  - Pact Boon: "Whenever you **play** a card **from exile**, create a Treasure token."
  - Engine = **play from exile → Treasure**. *Play* includes lands, so a land played from exile also makes a Treasure.
- **Korvold, Fae-Cursed King (B/R/G):** "Whenever Korvold enters or attacks, sacrifice another permanent. Whenever you **sacrifice a permanent**, put a +1/+1 counter on Korvold and draw a card."
  - Engine = **any permanent you sacrifice → counter + card**. Treasures are ideal fodder.

| Card (verified text) | Prosper | Korvold | Why the same card gets different roles |
|---|---|---|---|
| Light Up the Stage — exile top two; "you may play those cards" until the end of your next turn | **Engine enabler** (up to two Treasures, lands included) | Generic card flow | Only Prosper's event is *play from exile* |
| Jeska's Will — both modes if you control a commander; second mode exiles three you "may play" | **Enabler + ritual** | Ritual only | Mode 2 feeds Prosper |
| Outpost Siege — Khans mode: exile top card each upkeep, "may play that card" | **Enabler (Khans mode)** | Weak (Dragons mode pings when creatures leave) | Mode-aware tagging required |
| Professional Face-Breaker — makes Treasure on combat damage; "Sacrifice a Treasure: exile top card… may play" | **Enabler and Treasure consumer** (self-loop) | **Sacrifice outlet for Treasures** | Same text, two roles |
| Pitiless Plunderer — "Whenever another creature you control dies, create a Treasure" | Minor (Treasure producer) | **Fodder regeneration** (each creature sacrifice → Treasure → another sacrifice) | Korvold values sacrifice chains |
| Deadly Dispute — sacrifice an artifact or creature as an additional cost; draw two; Treasure | Card flow; spends a Treasure | **Outlet + fodder** (triggers Korvold, refunds a Treasure) | "As an additional cost to cast" counts as you sacrificing |
| Mayhem Devil — "Whenever a player sacrifices a permanent", 1 damage | **Payoff** for spending Treasures | **Core payoff** | Both, via different producers |
| Blood Artist — "this creature or another creature dies" | Weak (Treasure sacrifice is not a creature dying) | Payoff **only for creature sacrifices** | *Dies* ≠ *sacrifice a permanent* |
| Chaos Wand — cast an opponent's exiled instant/sorcery "without paying" | **Triggers Pact Boon** (you cast a card from exile; ownership irrelevant) | Irrelevant | A naive "exile from *your* library" rule would miss it |
| Dockside Extortionist | **Banned** | **Banned** | Hard filter, even though the stored Korvold insight calls it the "first upgrade" `[Confirmed: korvold-data-dump.txt]` |

With today's data, an EDHREC top-50-by-inclusion list for either commander would mostly overlap on black-red staples. Only the engine-plus-restriction model separates "exile-play density" (Prosper) from "sacrifice-fodder density" (Korvold).

---

## 6. Commander coverage matrix (16 commanders; five use repository fixtures)

"Fixture" = named in repository tests/scripts: Muldrotha (`src/app/new-deck/page.test.tsx`, brew tests); Korvold (`src/lib/rating-engine*.test.ts`, `brew-v2-session.test.ts`); Prosper, Tymna/Thrasios, Wilson (`scripts/test-commander-resolver.ts`). All rules text below is from the public Scryfall API on 2026-09-29. EDHREC coverage in Oracle's database is `[Approximate]`: the snapshot has only build IDs, so presence cannot be confirmed per commander offline.

| # | Commander(s) | Fixture | Colours | Pairing | Engine (verified) | Plans / overlaps | Key restriction to respect | What the current path can know | Needed |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Prosper, Tome-Bound | Yes | BR | — | Play from exile → Treasure | Exile-play, Treasure, aristocrats | *play* (lands count); *from exile*; "until end of your next turn" | Name, colours; Scryfall keywords say "Treasure" but nothing about exile | Engine parser; exile-play tags |
| 2 | Korvold, Fae-Cursed King | Yes | BRG | — | You sacrifice a permanent → counter + draw | Treasure aristocrats, tokens, lands | *sacrifice* any permanent (not only creatures) | Insights prose (stale, cites a banned card) | Sacrifice-role tags; legality refresh |
| 3 | Muldrotha, the Gravetide | Yes | BGU | — | Play a land and **cast** one permanent spell of each type from graveyard each turn | Self-mill, permanents value | Permanent **spells** only; one per type | Name, colours | Permanent-type counts; self-mill tags |
| 4 | Tymna the Weaver + Thrasios, Triton Hero | Yes | WUBG | Partner | Tymna: pay X life, draw X (X = opponents dealt combat damage); Thrasios: {4} scry/land/draw | Midrange, combo shells | **Union** colour identity; single-commander validation rejects blue/green cards | One-commander validation | Pair-aware profile |
| 5 | Wilson, Refined Grizzly + Candlekeep Sage | Yes | GU | Background | Ward/trample body; Sage gives the commander ETB/LTB draw | Voltron, value | Background supplies blue, making Mystic Remora legal | "Legendary + Creature" test wrongly handles Backgrounds | Background-aware validation |
| 6 | Edgar Markov | — | RWB | — | **Eminence**: cast another Vampire spell (command zone or battlefield) → 1/1 Vampire token | Vampire tribal, go-wide | *cast* a Vampire *spell* (tokens don't trigger); works from command zone | Name | Subtype + eminence zone tags |
| 7 | Urza, Lord High Artificer | — | U | — | Tap an artifact: add U; {5}: exile top card, play free | Artifacts, combo | Own artifact abilities matter (Collector Ouphe is anti-synergy) | Classifier: Ouphe = Other | Anti-synergy assertions |
| 8 | Krenko, Mob Boss | — | R | — | Tap: X goblin tokens, X = Goblins you control | Goblin tokens | Counts Goblins; tokens | Name | Token-doubler tag (Mondrak is misclassified as Protection) |
| 9 | Teysa Karlov | — | WB | — | Death-caused triggers trigger an additional time; creature tokens gain vigilance/lifelink | Aristocrats | Doubles **death** triggers only; token vs nontoken payoffs differ | Classifier: Other | Death-trigger + token filters |
| 10 | Atraxa, Praetors' Voice | — | WUBG | — | End step proliferate | +1/+1 counters, superfriends, poison | Counter *kind* matters (Hardened Scales only +1/+1 on creatures) | Name | Counter-kind tags |
| 11 | The Gitrog Monster | — | BG | — | Extra land drop; land cards to graveyard → draw; sacrifice a land each upkeep | Lands matter | "put into your graveyard from anywhere" (discard, mill, sacrifice) | Classifier: Cultivate = Tutor | Land-to-graveyard tags |
| 12 | Sythis, Harvest's Hand | — | GW | — | **Cast** an enchantment spell → gain 1, draw | Enchantress | *cast* only (reanimated/flickered enchantments don't trigger) | Name | Cast-vs-put distinction |
| 13 | Kinnan, Bonder Prodigy | — | GU | — | Tap a **nonland permanent** for mana → extra mana of that type | Mana creatures/rocks, combo | Dark Ritual doesn't count (not a permanent) | Classifier: Birds = Ramp only | Produced-mana-by-permanent tags |
| 14 | Yuriko, the Tiger's Shadow | — | UB | — | Commander ninjutsu; Ninja combat damage → reveal top card, drain by its mana value | Ninjas, high-MV top-deck | Mana value arithmetic belongs in code | Name | Subtype + evasion tags |
| 15 | Lathril, Blade of the Elves | — | BG | — | Combat damage → that many Elf tokens; tap ten Elves: drain 10 | Elf tribal | Needs Elves count (tokens count) | Name | Subtype density |
| 16 | **Vraska, Soul of Stone** (new; releases 2026-10-02) | — | RUW | — | Cast a **noncreature** spell → 1/1 Sculpture **Treasure artifact creature** token | Spellslinger + artifacts + Treasure | Tokens are creatures **and** Treasures: sacrificing one for mana is a creature dying and a sacrifice | **No EDHREC data** (after the 2026-08-06 snapshot) | Rules-only profile; honest "little data" |

---

## 7. Worked and negative examples (grounded in verified text)

| # | Card → commander | Verdict | Rules reason | Existing data that supports it | Can the current path know? | Representation needed |
|---|---|---|---|---|---|---|
| 1 | Light Up the Stage → Prosper | **Fit (engine)** | Exiles two; "you may play those cards" → Pact Boon per card, lands included | EDHREC build lists may include it `[Approximate]` | No (classifier: Other) | play-from-exile tag |
| 2 | Chaos Wand → Prosper | Fit (subtle) | You cast an opponent's exiled card; "play a card from exile" ignores ownership | None | No | Controller-agnostic exile-cast tag |
| 3 | Blood Artist → Korvold (Treasure build) | **Partial** | Triggers on creatures dying, not on Treasure sacrifices | Insights mention aristocrats | No (Other) | dies ≠ sacrifice |
| 4 | Dockside Extortionist → Korvold | **Reject** | Banned in Commander | Stored insight recommends it | Only if the legality data is current `[Approximate]` | Current legality snapshot; insight staleness flag |
| 5 | Grim Haruspex / Midnight Reaper → Krenko or Teysa token decks | **Weak** | "another **nontoken** creature" / "a **nontoken** creature" — token deaths do nothing | — | No (Draw) | token/nontoken filter |
| 6 | Pitiless Plunderer → Teysa | **Fit** | "another creature you control dies" includes tokens; Teysa doubles the trigger | — | No (Ramp) | death-trigger + doubler roles |
| 7 | Mystic Remora → Wilson + Candlekeep Sage | **Legal only because of the Background** | Blue comes from the Background | — | No (one-commander check) | Pair union |
| 8 | Esper Sentinel → Tymna + Thrasios | Legal (W from Tymna); tax/draw piece | "first noncreature spell each turn" — once per opponent turn | — | Colour check fails for the pair | Frequency tag; pair union |
| 9 | Collector Ouphe → Urza or Kinnan | **Anti-synergy** | "Activated abilities of artifacts can't be activated" — stops your own rocks/Treasures | Listed as artifact hate in the rating engine | Partially | Anti-synergy assertion vs commander engine |
| 10 | Dark Ritual → Kinnan | **No engine value** | Kinnan needs a nonland **permanent** tapped for mana | — | No | Permanent-mana producer tag |
| 11 | Hardened Scales → Atraxa | **Plan-dependent** | Affects only +1/+1 counters on creatures, not loyalty or poison | EDHREC plan share | No | Counter-kind tags + chosen plan |
| 12 | Shatterskull Smashing → any red deck | Counts as **removal and land** | Modal double-faced: sorcery face / land face | — | No (Ramp; faces joined) | Face-level facts; land-count rules |
| 13 | Cultivate → Gitrog | Ramp, not a Gitrog payoff | Lands go to battlefield/hand, not the graveyard | — | No (Tutor) | Zone-destination tags |
| 14 | Cemetery Gatekeeper → Edgar Markov | Fit (tribal) | It is a Vampire; casting it triggers Eminence | Subtype on type line | Partially | Subtype + eminence tags |
| 15 | Reckless Fireweaver → Vraska, Soul of Stone | **Fit** (no community data needed) | Each Sculpture token is an artifact entering → 1 damage to each opponent | None (new commander) | No | Rules-derived engine match |
| 16 | Pitiless Plunderer → Vraska, Soul of Stone | **Reject** | Black; outside RUW colour identity | — | Yes (if colour identity is checked) | Hard filter |

None of these are model outputs. They are the **expected** judgments that a gold set would encode.

---

## 8. Evaluation plan

### 8.1 Gold set (held out, versioned)

- **Card-tag set:** about 400 **face-level** items, stratified across the matrix commanders' relevant cards, negatives from §7, all layouts, and about 50 new-set cards released after the EDHREC snapshot. Labels: tag + role + restrictions.
- **Commander relevance set:** the 16 commanders × about 30 candidates, graded 0–3 from rules and plan (not from EDHREC inclusion), including specialist and generic staples.
- **Interaction assertions:** about 150 yes/no claims (e.g. "Blood Artist triggers when Korvold sacrifices a Treasure" = no).
- **Ownership fixtures:** synthetic, from the T-28 contract, never the owner's live collection.
- **Versioning:** gold-set version, Scryfall data date, rules-text hash per face, label author (owner / architect), and an agreement check on 20%.
- **Leakage controls:**
  - split **by commander** (8 dev / 8 test) and freeze the test set before any tuning;
  - no EDHREC inclusion in relevance labels (avoids circularity);
  - LLM- or Jev-produced labels are never gold unless human-verified;
  - the new-set holdout checks generalisation.

### 8.2 Metrics and proposed thresholds

| Criterion | Metric | Proposed threshold | Owner calibration? |
|---|---|---|---|
| Real card identity | Share of shown suggestions resolving to an `oracle_id` | 100% (hard) | No |
| Legality | Colour identity (pair-aware) + banned + singleton | 100% (hard) | No |
| Ownership accuracy | Label equals the T-28 fixture; failed lookups never shown as Unowned (D-030) | 100% (hard) | No |
| Factual interaction accuracy | Precision of explanation claims vs assertions | ≥ 95% | Yes |
| Conditional-rule errors | cast/play, token/nontoken, controller, zone, frequency, face | ≤ 2% of claims | Yes |
| Tagging | Micro-F1 deterministic families / semantic roles | ≥ 0.95 / ≥ 0.85; per-tag precision ≥ 0.90 when used as a filter | No |
| Relevance | nDCG@10, precision@10 (grade ≥ 2) | ≥ baseline + 0.10; ≥ 0.70 | Yes |
| Commander specificity | Share of top-20 that is not a generic colour staple | ≥ 50% | Yes |
| Useful diversity / role coverage | Every flagged missing role present in the top 20; no single package > 40% unless chosen | Pass | Yes |
| Actionable adds/cuts | Each add paired with a cut or slot; curve/land counts consistent | 100% structural; owner acceptance ≥ 60% in a shadow review | Yes |
| Honest unknowns | Sparse/unknown cases disclosed; zero fabricated statistics | 100% | No |
| Preference fit | Zero violations of stated house rules; missing preferences not assumed | 100% | No |
| Unrequested combos | Surfaced only labelled and separated | 100% | Yes (default policy) |
| Reliability | Silent tool drops; stream/tool failures | 0; ≤ 1% | No |
| Latency / cost | p95 advisor turn; cost per *accepted* recommendation | p95 ≤ 8 s; track | Yes |

### 8.3 Baselines and ablations

- **Baselines:**
  - (a) strong LLM only, with name + colours (the current skeleton);
  - (b) existing deterministic classifiers + EDHREC inclusion order;
  - (c) EDHREC synergy order;
  - (d) the proposed pipeline;
  - (e) (d) with Jev tagging (trial only).
- **Ablation ladder (change one factor at a time on the same gold set):**
  - **Data:** A0 current → A1 verified face-level facts → A2 multi-label tags → A3 commander profile.
  - **Retrieval/ranking:** inclusion order → package retrieval → plus specificity/diversity rerank.
  - **Model:** DeepSeek / Sonnet / Haiku for explanation; parser / LLM / Jev for tagging.
  - **Verification:** off → on.
- Report each delta separately so gains are attributable. Executed checks in this task are listed in the report, and none of the above has been run.

---

## 9. Product-rule integration and T-28 requirements

- Semantic recommendation happens at `oracle_id`. Printing, finish and copy choices come only from T-28 (D-001/D-003/D-004).
- The AI consumes, and never computes or invents, the D-025 labels: Available / Unavailable / Alt available / Proxy available / Unowned. Sleeved/Unsleeved and Original/Proxy stay separate. Generic basics follow D-032 with no fictional inventory. Purchase advice uses the D-027 original-shortage view, so owned usable originals come before "buy". A failed lookup is shown as unknown (D-030).
- **Requirements for T-28 (not a competing contract):**
  - a read-only per-card availability query by `oracle_id` for the current user and deck, returning the label, reason/source and eligible copy summaries;
  - an explicit "unknown/failed" state;
  - a batch form for up to about 100 candidates;
  - proposal objects that later actions (M3) can reference, with `source = ai` provenance (D-009) and undo.
- **D-016:** every model decision is emitted as tool/JSON-schema output and validated; no prose parsing. **D-017:** curve warnings stay cross-referenced messages.

---

## 10. Prioritised improvement sequence (recommendation input, not a dispatch)

| # | Step | Lever | Depends on | Risk |
|---|---|---|---|---|
| 1 | Make advice read-only: stop sidebar auto-apply (propose, then confirm); disable the destructive upgrade-refresh stub; fail loudly on dropped tool calls; fix model labels | Verification/safety | Owner confirmation (see report) | Low |
| 2 | Scope all AI-facing ownership/deck queries to the user; retire or quarantine the dead unscoped routes | Data/safety | — | Low |
| 3 | Face-aware, `oracle_id`-keyed card facts (faces, produced mana, current legality) and one name resolver; replace `mtg_cards` references | Data | Architect contract + migration approval | Medium |
| 4 | Feed the advisor/skeleton real inputs: deck cards with rules text, pair-aware commander, `deck_strategy`, explicit "unset" preferences, T-28 availability | Data | T-28 | Medium |
| 5 | Rewire grounded generation (reuse `ai/brew/generate` + the grounded prompt) behind forced tool output and stage-8 validation | Retrieval + verification | 3, 4 | Medium |
| 6 | EDHREC as evidence: fix the live parser, keep full lists with synergy, version snapshots, flag stale insights | Data/retrieval | Data-licence check | Medium |
| 7 | One multi-label tag vocabulary + deterministic restriction parser; commander profiles; packages from `data/knowledge` | Data/retrieval | 3 | Medium |
| 8 | Gold set v1 + offline harness; run the smallest experiment: the A0→A3 data ablation on the 8 test commanders with the current model | Evaluation | 3, 7 | Low |
| 9 | Optional Jev tagging trial (§4.6) | Model | G1–G4 | Vendor |
| 10 | Later: learned rerank from accept/skip + debrief once volume exists; M3 actions via T-28 | Retrieval | Data volume, M3 | Medium |

Reuse now: the `commander-resolver` pairing logic, the `commander-context` snapshot repository, the `data/knowledge` guides, the Commander Spellbook client, the atomic AI delta RPC (no allocation), the upgrade apply/skip log, and the grounded prompt in `brew-prompts.ts`.

---

## 11. Sources (accessed 2026-09-29)

- TypeSafe launch post: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- TypeSafe docs: https://docs.typesafe.ai/introduction/quickstart · https://docs.typesafe.ai/api.md · https://docs.typesafe.ai/models.md · https://docs.typesafe.ai/model-jaggedness/jev-1.13.md · https://docs.typesafe.ai/introduction/coding-agents.md · https://docs.typesafe.ai/sdk/javascript.md · https://docs.typesafe.ai/legal.md · https://typesafe.ai/legal/data-processing · https://docs.typesafe.ai/llms.txt
- LangChain integration post: https://www.langchain.com/blog/building-a-harness-with-jev
- Independent: https://github.com/anisselbd/jev-phishing-bench · https://dev.to/gde/jev-after-eight-days-of-independent-tests-level-with-mid-price-llms-behind-the-frontier-1kln
- Card rules: Scryfall API `POST https://api.scryfall.com/cards/collection` (73 public card names) and `GET /cards/search` (recent commanders). Only public card names were sent.
