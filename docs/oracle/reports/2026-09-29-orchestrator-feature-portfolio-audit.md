# Report: feature-portfolio-audit
Role: Orchestrator
Status: DONE
Task as received: Can you look at all the docs I have created relating to all the features I have talked about. Do a full audit of everything and compare it to existing features in other similar apps. I want you to give me a full report on the pros and cons as well as the roadmap requerd to deliver them. Which ones are absolutely essential and which are nice to have

## Summary for the owner

**Finish the connected workflow before expanding the feature list: know what you own, assemble a deck confidently, get useful commander-specific advice, and act on it safely.** Oracle already has many of the supporting pieces, but inconsistent meanings, incomplete connections and conflicting documentation make it feel less finished than its feature count suggests. Physical deck assembly and collection-aware AI are not unique in the market; Oracle's opportunity is to make them work especially well together, including proxies and deciding which originals are worth buying.

## Recommendation at a glance

| Priority | What belongs here | What this means for you |
|---|---|---|
| **Essential foundation** | Accurate copies and locations; reliable imports; working search; clear Sleeve/Move/Proxy actions; the pick list; basics; readiness; original shortages; honest loading/errors; usable mobile assembly; export and recovery | You can trust Oracle when finding cards, assembling decks and deciding what to buy. |
| **Essential to Oracle's purpose** | Commander-specific, collection-aware advice; real-card and availability checks; explanations; safe accept/change/undo | Oracle helps you build and improve your own decks, rather than being another collection spreadsheet or generic chatbot. |
| **Valuable next** | Targeted bulk work; saved views; buying-list export; useful deck comparisons; a simple game-night view; lightweight playtesting | Fewer repetitive steps once the foundation works. Choose these from actual friction, not a competitor checklist. |
| **Nice to have / later** | Elaborate canvas expansion; native scanner/apps; full simulator; price alerts; set completion; trading; voice; extensive theming; post-game analytics | Useful in particular situations, but each competes with finishing the core experience. Existing working features need not be removed. |
| **Conditional** | Shared accounts, household collections, public decks, collaboration, billing and public-service operations | Some become mandatory before sharing or charging; they are not prerequisites for a good personal tool. |

**Recommended product promise:** "Oracle knows the cards you own, helps you put the right copies into your decks, and explains how to improve those decks for their commanders."

Example: you own one original Sol Ring, sleeved in Korvold, and one proxy in Prosper. Oracle should tell you where both are, let you deliberately move the original without changing Korvold's deck list, and show that another original could replace the proxy. Its advice should then address what Prosper actually needs, not recommend the same popular staples to every commander.

## Scope, evidence and limits

This is a **feature-portfolio audit**, not a claim that every historical acceptance criterion has been tested or every deployed screen has passed an end-to-end review.

The inventory covers **503 repository documents/artifacts, 495 distinct contents, approximately 4.24 MB**, captured before adding this report and its index updates. It includes tracked and untracked Markdown, text and HTML under the repository, excluding ignored files. There are **46 specification-family directories, 44 requirements/spec entry documents, and 27 HTML mockups representing 20 distinct HTML contents**. Those categories overlap; they are not additive feature counts.

| Inventory group | Files | Treatment |
|---|---:|---|
| Feature requirements, design and delivery records | 169 | Feature-index review, requirement headings and targeted detailed specifications; grouped into the capability portfolio below. |
| AI knowledge documents | 123 | Catalogued as inputs to the recommendation system, not counted as 123 features. Their detailed usefulness/coverage belongs to the separate AI assessment. |
| Delivery and decision-history reports | 75 | Used to distinguish current decisions, historical implementation and later corrections. Not all historical acceptance criteria were re-executed. |
| Visual mockups outside current governance | 26 | All distinct HTML mockups inspected for feature/navigation/action labels without executing their scripts; seven duplicate pairs identified. One additional HTML mockup is in the governance group. |
| Operational/agent references | 25 | Catalogued; role and approval boundaries applied. |
| Product/operational references | 25 | Included in the feature and authority map. |
| Current governance, contracts and plans | 21 | Current decisions and approved plans take precedence over incompatible older proposals. |
| Historical research documents | 15 | Treated as historical evidence and idea sources, not current competitive facts. |
| Product research documents | 13 | Ideas consolidated; important competitive claims checked against public primary sources. |
| Research data/output artifacts | 11 | Catalogued as research assets, not shipped functionality. |
| **Total** | **503** | Full path, size, checksum and exact-duplicate inventory in the [companion CSV](2026-09-29-feature-document-inventory.csv). |

**Review depth:** all inventory files were read for metadata and content hashes. Semantic review covered the feature-index summaries, feature requirement/title families, roadmaps, current decisions/plans, distinct mockup labels and targeted detailed documents. This is not a line-by-line review of all 4.24 MB, nor a full review of every knowledge article.

**Current implementation:** "Present" means a reachable implementation was found in the inspected local source; it does not certify hosted behaviour. "Partial" means some implementation exists but the whole described workflow is not established. "Proposed" means a documented idea, not a delivery promise. "Removed/deferred" means historical work must not be counted as current. Evidence references O01-O16 are in the appendix.

**Competition:** public documentation was checked on 2026-09-29. Documented capability is different from independently tested quality. Moxfield blocked direct browser access; several smaller services exposed only minimal pages or errors. Unknown is not the same as absent. No competitor account, paid trial or private collection upload was used.

**Parallel work:** the separate T-19 AI/Jev, T-27 loading and T-28 behaviour-contract handoffs are not treated as completed results here. This audit maps their dependencies; it does not substitute for their assessments or assume their unmerged work is in the app.

## 1. State of Oracle: strengths and weaknesses

| Area | What is good | What holds it back | Assessment |
|---|---|---|---|
| Physical collection | A real copy model, printings/finishes, originals/proxies, import and storage-related operations already exist. | The user-facing views do not consistently express the same availability and placement rules. | A valuable foundation that needs consolidation, not replacement. O01-O03, O10-O12. |
| Deck management | Cards, folders, history, export, legality warnings, analysis, combos and strategy surfaces are already wired. | Older roadmaps misclassify several as missing; some exposed tabs are hidden on mobile, and old lifecycle language remains. | Preserve and finish what is useful instead of rebuilding it from stale specifications. O05, O07-O09. |
| Assembly | Pick-list and assignment flows already exist, with physical-copy choices rather than just ownership totals. | The approved Sleeve/Move/Proxy/basic-land rules and precise source locations need one coherent experience. | The next highest-value product slice. O01, O06, O11-O12. |
| Search and collection browsing | Grid/list views, filters, prices and global search/locator pieces exist. | Collection status selection is not connected to the result queries; the locator searches deck membership rather than every physical location. | Basic controls must do what they appear to do before adding more filters. O02, O06. |
| AI | Existing conversations, recommendation/analysis routes, data integrations and knowledge assets provide substantial material. | A screen or a large knowledge folder does not prove commander coverage, correct availability or useful advice. | Evaluate and improve the existing system before choosing a new engine. O13; T-19. |
| Reliability and speed | Some import progress/error reporting and pricing freshness presentation already exist. | Incorrect empty/default states, incomplete error presentation, repeated data work and weak quality gates undermine trust. | Treat correctness and perceived speed together; no new timing claims are made here. O02-O03, O10, O12, O15. |
| Product documentation | Many ideas, decisions and detailed designs have been captured. | Multiple conflicting "current" roadmaps and stale competitive matrices can send agents in the wrong direction. | A single current decision/backlog index is essential for unattended work. O01, H01-H07. |

**Do not use a percentage-complete score.** The older documents count different things, combine proposals with implementation, and sometimes count removed work as built. A reliable end-to-end workflow is a more useful measure than "68 features" or a competitor-parity percentage.

## 2. What similar apps actually establish

### Corrected competitive comparison

| App/source | Publicly documented strengths | Limitation or trade-off for Oracle's needs | What Oracle should learn |
|---|---|---|---|
| **ManaBox** | Collection binders and separate wishlists; physical decks built from binders or other decks; exact set/foil matching and alternative versions; moving cards; disassembly that preserves the list; scanning; offline search; simulator; trading. C03-C06. | Mobile-first; its FAQ says desktop is in development. Cloud sync and backup are different offerings. The reviewed guides do not establish Oracle's exact proxy/original-shortage rules or internal copy guarantees. | The strongest documented benchmark for the physical assembly workflow. Do not claim Oracle invented this category. |
| **Archidekt** | Deckbuilding, search, custom categories/templates, batch edits, printing optimisation, import/export, collection features, playtesting, EDHREC recommendations and live collaboration. C01-C02, C10. | Those sources do not establish Oracle's complete physical-copy/location/shortage workflow. No hands-on comparison of assignment integrity was performed. | Mature editing conveniences are expected, not differentiators. Category packages and printing choice are useful patterns. |
| **Moxfield** | An important deckbuilding ecosystem comparator and a documented EDHREC data source. C08, C11. | Direct help/browser access was blocked. Fine-grained current feature claims could not be independently checked in this pass; user feedback is not proof a feature is absent or present. | Keep it in a future hands-on benchmark. Do not build priorities from unverified crosses in the older matrix. |
| **TopDecked** | Its rendered official site advertises builder, analysis, synergy discovery, simulator, collection/value, cross-device sync, deep card search, rules, life tracking and event tools. C07. | These are advertised capabilities, not a demonstrated exact-copy assembly or commander-advice benchmark. Its broader event scope is unnecessary for Oracle's personal MVP. | Cross-device continuity and clear basic tools matter; tournament tooling does not automatically belong in Oracle. |
| **Deckbox** | Inventory/deck management, exact printing/finish/condition information, storage-oriented tags, wishlists from deck needs, built-deck trade exclusions, trade tools and premium mobile scanning. C09. | Many advanced features are paid. The reviewed page does not establish Oracle's proposed advisor or its exact sleeve/shortage semantics. | Strong reference for inventory detail, wishlists and trade separation. The old "no mobile/scanner" claim is wrong. |
| **EDHREC + Commander Spellbook** | Commander/theme/typal/role discovery and filters; a specialised combo catalogue. EDHREC explains that its deck corpus is incomplete and reflects imported decks with delay. C10-C12. | Popularity is not a complete mechanics model, and inclusion in a combo is not proof the combo fits this deck. These are inputs, not a complete collection manager. | Reuse specialist data with provenance and conditions; add the user's actual collection, strategy and constraints. |
| **Riffle Zone** | The official site advertises collection-aware AI, commander advice, exact-copy deck registration, physical pull lists, storage hierarchy, proxies and household sharing. C13. | Marketing breadth does not prove reliable execution, recommendation quality or adoption. No account-based verification was performed. | Oracle's proposed combination already has direct advertised competition. The advantage must be demonstrated workflow quality, not an unsupported uniqueness claim. |
| **ManaCurve, ManaGate, Planeskeeper** | Current pages advertise some combination of collection/deck tools and AI. ManaCurve publishes archetype-generation updates; ManaGate documents AI operations/imports; Planeskeeper's metadata describes collection, AI analysis and iOS/web sync. C14-C16. | Uneven evidence depth; marketing and changelog claims were not validated with real decks. ManaCurve's published beta dates are time-sensitive. | Watchlist for AI evaluation and positioning, not a basis for copying a large feature list. |

**Corrections to the old research:**

- Archidekt is not missing playtesting, EDHREC recommendations or live collaboration.
- ManaBox is not missing a simulator, trade tools or physical-deck assembly from other locations.
- Deckbox should not be described as lacking a mobile/scanning option.
- Collection-aware AI and exact-copy pull lists cannot credibly be described as uncontested territory.
- "Commander-specific insights" is too broad a uniqueness claim: distinguish statistical suggestions, deck-specific reasoning, mechanics coverage and collection-aware feasibility.
- A competitor's undocumented capability must remain **unverified**, not receive a confident "not implemented" mark.

### Oracle's defensible direction

**Compete on the complete decision, not the number of features:** "What should I change, why does it fit this commander, do I own it, where is it, what will moving it affect, and would buying another original help?"

The potential strengths are the approved simple language, explicit physical movements, honest proxy/original accounting and commander-specific explanations in one place. The risks are maintaining several data feeds, overestimating AI quality, and spending effort on broad parity while the core workflow remains confusing.

This is a product recommendation, not a claim that competitors cannot do the same thing.

## 3. Complete capability portfolio

The rows consolidate overlapping specifications and historical ideas into capability groups. They are **not individual implementation tickets**, and a low expansion priority never means deleting a useful existing feature. H01-H07 identify the source-document families; O references identify implementation evidence.

### A. Essential foundation: finish before expanding

| ID / capability | Current position | Benefit | Cost, caution and delivery priority |
|---|---|---|---|
| F01. Correct card identity, printing, finish and physical copies | Present foundation; consistency work remains. O01-O03. | Counts refer to real originals/proxies, not ambiguous card names. | Essential. Wrong identifiers contaminate importing, prices, availability and advice. Phase A. |
| F02. Trustworthy import and re-import | Present, including streamed collection progress and multiple deck-source branches; current external roundtrips not re-tested. O03. | Bring existing collection/decks across without manual reconstruction. | Essential. Validate supported formats, previews, duplicate handling and failures. Do not silently promise every historical source still works. Phase A. |
| F03. Everyday add/edit/remove inventory and deck entries | Partial across existing card, copy and deck controls. O02, O07, O11. | Keep Oracle correct after buying, changing or removing cards. | Essential. Adding a list entry must not invent ownership; removing an entry must not delete the owned copy. Phase A. |
| F04. Search, filters, sorting, pagination and consistent views | Present/partial; collection status filtering is disconnected. O02. | Find the right cards quickly and trust the displayed subset. | Essential. Finish the shared basic behaviour first; advanced custom search is F32. Phase A. |
| F05. "Where is every copy?" | Partial: global locator identifies deck memberships, not all storage-held copies. O05-O06, O10. | Find a specific original or proxy in a deck or binder. | Essential for the stated pick-list workflow. Show actual physical location separately from decks that merely want the card. Phase A. |
| F06. Sleeve, Un-sleeve and Move | Existing actions with older semantics; shared approved contract in preparation. O01, O11-O12. | Explicitly assemble decks without secretly taking cards from another. | Essential. A move updates both decks; donor entry remains Unsleeved. Phase A. |
| F07. Pick list as the assembly workspace | Present under the deck's Sleeve List tab; redesign not yet approved. O07, O11-O12. | Know exactly what to take from which place and what still needs a choice. | Essential, not a secondary diagnostic table. Include original/proxy and alternative-printing choices. Phase A. |
| F08. Existing proxy versus Proxy action | Partial; approved distinction awaits coherent delivery. O01, O12. | Sleeve a proxy you already own, or create one new proxy and sleeve it. | Essential. Never create another copy when using an existing proxy. Printable output is a separate optional feature. Phase A. |
| F09. Generic basics and tracked basics | Existing support plus newly approved behaviour. O01, O07, O12. | Generic Islands/Swamps count as Sleeved automatically, without inventory busywork. | Essential. No fabricated copies, pulls or shortages. Deliberately tracked printings still use normal copy controls. Phase A. |
| F10. Draft / Assembling / Playable readiness | Older lifecycle controls still present; final rules approved. O01, O07. | Distinguish an incomplete list from a full list that needs sleeving. | Essential. Exactly 100 including commander(s), with Maybeboard excluded; basics/proxies follow approved coverage rules. Keep detailed legality separate. Phase A. |
| F11. Commander legality and metadata honesty | Present banner/checks, but incomplete metadata can be skipped and errors hidden. O07. | Spot genuinely unsuitable cards without pretending unknown information is valid. | Essential for supported Commander usage and AI output. Do not turn readiness into a new comprehensive rules engine or introduce false certainty. Phase A/B. |
| F12. Maybeboard and safe release | Present membership concept; approved release behaviour needs consistent wiring. O01, O07, O12. | Keep ideas without keeping their physical cards tied up. | Essential. Moving a Sleeved card to Maybeboard releases its copy. No Maybeboard demand in readiness or original shortages. Phase A. |
| F13. Folders versus Break down | Folders already present; lifecycle/action consolidation remains. O01, O07, O09. | Organise old decks without accidentally dismantling them. | Essential. Folder changes do not move cards; Break down explicitly releases them. Phase A. |
| F14. Original shortages and proxy usage | Older shared-card/ownership surfaces exist; the approved original-shortage definition is new work. O01, O12. | See where another original would reduce proxy use or competing demand. | Essential to the owner's clarified buying workflow. Proxies never cancel original shortage; the list does not warn, reserve, buy or change readiness. Phase A. |
| F15. Loading, empty, stale and failed states | Partial and inconsistent. O02-O03, O10, O12. | Know whether Oracle is thinking, empty, outdated or unable to load. | Essential. Correctly shaped skeletons and scoped spinners, with retry and retained context where safe. Never show failed lookup as Unowned or Playable. Phase A. |
| F16. Shared components and accessibility | Shared primitives/components exist; language and interaction drift remain. O05, O12, H04. | The same chip, row, menu or confirmation behaves the same everywhere. | Essential. Focus, labels, keyboard access, contrast and non-colour signals matter more than a new visual brand. Phase A. |
| F17. Mobile assembly and core collection use | Responsive pieces exist; several deck tools are hidden on mobile. O07. | Use the phone beside binders and decks, where the physical work happens. | Essential core journey, not immediate parity for every analysis screen or a native app. Phase A. |
| F18. Portable collection/deck export | Present. Collection CSV omits relationships needed for a full restore. O04, O07. | Leave Oracle or inspect your own card/deck information elsewhere. | Essential. Label export honestly and verify promised fields. Do not describe it as a complete backup. Phase A. |
| F19. Recovery appropriate to reliance on Oracle | Deck-list snapshots exist; full collection/location/assignment recovery is not established by CSV export. O04, O08. | Avoid losing irreplaceable manual work. | Essential before Oracle is the sole trusted record. Current owner-approved rebuild posture remains in force; restore scope and stronger guarantees need explicit approval. Phase A gate. |
| F20. Reliable release checks and diagnosis | Tests/workflows exist, but earlier same-session checks found failures and typechecking is not enforced by the build. O15. | Changes do not silently break another screen or alter real data during testing. | Essential enabler. Isolated fixtures, accountable errors and meaningful checks; do not run mutable tests against production. Phase A and every later phase. |
| F21. Accurate, understandable card/price data | Card data, prices and freshness indicators exist. O02-O04, O13. | Recognise the correct version and understand an indicative buying cost. | Essential baseline. Unknown/stale price is not zero; printing, finish, currency and original/proxy valuation must be clear. Price-investment tooling is optional. Phase A/B. |

### B. Essential to the Oracle advisor promise

These are essential capabilities for the proposed product, not permission to implement them ahead of the existing contracts and owner gates.

| ID / capability | Current position | Benefit | Cost, caution and delivery priority |
|---|---|---|---|
| F22. Commander discovery and "what can I build?" | Existing exploration/brew surfaces and data; effectiveness under assessment. O13. | Start from owned cards, a commander or a preferred play style. | Essential advisor entry point. Collection feasibility must use real supply, not just name overlap. Phase B. |
| F23. Current deck and collection context | Existing integrations; completeness/freshness under T-19 review. O13. | Recommendations match this deck and the cards actually available now. | Essential. Separate owned/free, elsewhere, alternate original, proxy and buying choices without treating them as interchangeable. Phase B. |
| F24. Mechanics, roles, archetypes and supporting packages | Existing categories, knowledge and external sources; coverage not established. O13, H03. | Cover a commander's relevant plans, including less-popular and conditional interactions. | Essential. Multi-label relationships, enablers/payoffs and insufficient-support cases; a popular-card list or one primary category is not enough. Phase B. |
| F25. Real, legal and correctly identified suggestions | Existing AI paths; factual acceptance must be demonstrated. O07, O13. | No invented cards, wrong printings or obviously invalid suggestions. | Essential. Validate facts outside free-form prose and distinguish unavailable metadata from passing validation. Phase B. |
| F26. Explanations, cuts, costs and user constraints | Existing strategy/upgrade surfaces; usefulness not certified. O07, O13. | Understand why a card fits, what to cut, and the budget/proxy trade-off. | Essential. Explain uncertainty and package costs; avoid a fake precise power score. Phase B, actions in C. |
| F27. Reliable conversation and saved work | Shared sidebar, sessions and autosave-related implementation exist. O05, O13. | Resume a brew without losing decisions or applying advice to the wrong deck. | Essential basic continuity. Automatic naming, retention and extra history conveniences can follow; conflicting old retention specs need resolution before use. Phase B. |
| F28. Measured recommendation quality and source freshness | Assessment underway; no new quality result claimed. O13; T-19. | Know whether an engine change actually improves advice. | Essential enabler. Held-out commanders, coverage gaps, counterexamples, latency/cost and traceable sources. A bigger model alone is not a product fix. Phase B. |
| F29. Safe accept/add/cut/swap and undo | Some mutation/history pieces exist; complete advisor workflow is M3 work. O08, O13, O01. | Turn useful advice into an intentional, reversible deck change. | Essential to completing the promise. Preview actual changes; no silent copy moves or collection edits. Phase C. |
| F30. Attribution and conflict-safe action history | Placement-source decision and history mechanisms exist; cross-workflow completeness needs verification. O01, O08. | Know what changed through AI, import or a manual choice. | Essential for safe actions. Undo of a list edit is not permission to steal back a copy moved elsewhere later. Phase C. |

**Jev is a candidate, not a recommendation yet.** T-19 must establish what the current product actually offers, whether it can use the required data, and whether it beats or complements the existing approach. Adopting it, paying for trials, or sending it private collection data is not authorised by this report.

### C. Valuable next: choose from real friction

| ID / capability | Current position | Benefit | Cost, caution and delivery priority |
|---|---|---|---|
| F31. Targeted bulk actions | Real storage/Missing/delete handlers are mounted in Card Management through the allocation page; not the current Collection page. O11. | Avoid repeating the same safe edit for many copies. | Finish/reuse existing work, not another bulk bar. Retired Missing behaviour must not be expanded. Broad bulk work stays behind its M4 gate unless reprioritised. Phase D. |
| F32. Rich filters and search syntax | Detailed unified-filter requirements exist; complete cross-screen delivery not established. H02; O02. | Find combinations such as cheap green creatures with useful rules text. | Valuable after basic filtering works. Clearly distinguish supported syntax from full Scryfall compatibility. Phase D. |
| F33. Saved views, column choices and preferences | Richly documented in list-view mockups; full delivery not established. H02, H05. | Return to "free originals" or another useful subset without rebuilding filters. | Valuable, but saved configurations multiply maintenance and compatibility work. Start with a few proven views. Phase D. |
| F34. Original-shortage shopping export and vendor links | Existing export/price pieces; complete approved shortage-to-buylist flow not established. O04, O12. | Turn "an extra original would help" into a practical purchase list. | High-value follow-on to F14. Show quantities and affected decks; never auto-buy or assume marketplace stock. Phase D. |
| F35. General wishlist and acquisition tracking | Import reconciliation has an instance wishlist flag, not a complete global wishlist. O16. | Save future purchases unrelated to immediate assembly. | Valuable, but must stay separate from owned inventory and original-shortage calculation. Phase D. |
| F36. Game-night dashboard and deck recency | Existing deck tiles/folders; broader dashboard specification mixes old and proposed rules. O09, H02. | See what is Playable and what needs physical work before leaving. | Valuable, small initial scope. Do not add warning-heavy feeds or show proxy usage as unplayability. Phase D. |
| F37. Deck copying, reusable packages and templates | Documented ideas and category features; complete clone/package workflow not established. H01-H02, O07. | Try a variation or reuse a mana/ramp package without starting over. | Valuable. Clone the list, not the same physical assignment into two decks. Phase D. |
| F38. Version comparison and clear restore UX | Named snapshots and restore already wired. O08. | Understand changes and recover a previous list. | Preserve existing history. Improve comparison and consequences rather than implementing "version history" again. Physical locations are not historical list state. Phase C/D. |
| F39. Strategy notes, primers and manual category overrides | Strategy/category surfaces exist. O07, O13. | Record the deck's intended plan and correct misleading classifications. | Valuable for context and personal understanding. Keep user intent separate from AI-inferred facts. Phase B/D. |
| F40. Budget and upgrade comparison | Price/upgrade surfaces exist; complete scenario comparison not established. O07, O13. | Compare a cheap improvement with a more expensive package. | Valuable. Prioritise total additional spend and what is already owned, not just printed deck value. Phase D. |
| F41. Lightweight goldfishing | Deferred; no active goldfish screen found in current route/tab inventory. O07, H01-H02. | Check opening hands, mana and early sequencing. | Useful after advice/actions work. Start with opening-hand and draw simulation, not full Magic rules automation. Phase D candidate. |
| F42. Saved import sources and selective extra import formats | Multiple source branches exist; saved-source convenience is documented separately. O03, H02. | Revisit a known external list with less typing. | Valuable when actually used. Saving a link is not two-way sync; re-import remains explicit. Extra supported formats need real roundtrip examples. Phase D. |

### D. Nice to have or intentionally deferred

| ID / capability | Current position | Benefit | Why it should not displace the foundation |
|---|---|---|---|
| F43. Expanded Brew Canvas | Existing canvas-related work and locked future direction; M4 remains parked. O01, O13, H02. | Visual package-building and spatial organisation. | Keep the approved direction. More dragging, layouts and interaction complexity do not fix unreliable advice or copy state. Deliver at the approved M4 gate, not as an M2 dependency. |
| F44. Full game/rules simulator | Research/spec ideas, not established current functionality. H01-H02. | Deeper playtesting inside Oracle. | Large rules and interaction surface; mature alternatives already cover basic testing. Much higher cost than F41. |
| F45. Post-game debrief and learning loop | Historical feature cut; residual references are not a delivered workflow. H01-H03, O07. | Turn actual game observations into targeted improvement ideas. | Useful only with manageable, trustworthy input. Avoid presenting sparse game notes as causal proof that a card is bad. Revisit after M3. |
| F46. Playgroup results and local-meta analytics | Historical/product ideas, not established current functionality. H01, H03. | Tailor recommendations to a regular pod's decks and preferences. | Requires sustained game logging and careful interpretation; not a prerequisite for commander-specific advice. |
| F47. Precon catalogue and modification tracker | Tracker removed; catalogue proposals are separate. H01-H02. | Start from a known product and explain changes from it. | Useful for a particular deck-building habit, but needs accurate versioned lists and provenance. Do not count old mockups as shipped. |
| F48. Extra content ingestion and AI distillation | Existing research/knowledge assets; value of each extra source unproven. H03, O13. | Bring new mechanics explanations and strategy perspectives into advice. | Expand only when the evaluation exposes a gap. Respect licensing/terms, source dates and contradictory advice; more text can worsen retrieval. |
| F49. Proxy print-sheet generation | Proposed separately from physical proxy records/actions. H01, H03, H05. | Prepare actual printouts conveniently. | Useful convenience, not necessary to model/sleeve an existing proxy. Output quality, print sizing and permitted artwork/content need their own scope. |
| F50. Native card scanning | Removed; current-source scanner import is a different capability. H01-H02. | Capture acquisitions with a camera. | Recognition, variant/finish confirmation and device support are substantial. Prefer reliable import from existing scanners first. |
| F51. Deeper storage hierarchy, binder pages/pockets, QR/NFC | Basic location management exists; advanced physical addressing is proposed. O10, H01, H05. | Find cards in larger physical collections with less searching. | Add levels only when named binder/box locations prove insufficient. QR and NFC need practical label workflows, not just data fields. |
| F52. Lending, inventory walkthroughs and photos | Research ideas; no complete workflow established. H01, H03. | Track loans, check storage and document valuable cards. | Physical-state implications need deliberate design. Do not reintroduce the retired Missing UX through an unapproved audit feature. |
| F53. Set completion and collector dashboards | Proposed in collection research/roadmaps. H01, H03. | See progress towards a set or variant collection. | Different job from assembling Commander decks; variant definitions and totals add complexity. |
| F54. Price history, gain/loss and portfolio analysis | Current price/value pieces exist; full historical accuracy not established. O02, H01-H03. | Understand changes in collection value. | Historical snapshots, acquisition costs and condition/finish make this a finance project. Do not invent past values from today's snapshot. |
| F55. Price alerts and collection notifications | Proposed. H01-H03. | Notice buying opportunities without repeatedly checking. | Needs reliable historical/threshold data and notification controls; a useful shortage list should come first. |
| F56. Trade lists, matching and marketplace optimisation | Proposed; competitor research provides patterns. H01, H03. | Sell/trade unused cards or compare purchase routes. | Adds seller, condition, fees, shipping and stock complexity. Start with explicit exports rather than a marketplace. |
| F57. Offline reading and full offline edits | PWA metadata/specification exists; offline guarantees not established. O14, H02. | Check lists without reception; eventually work offline. | Read-only cached data can be scoped first and labelled stale. Offline assignment writes need conflict resolution before they can be trusted. |
| F58. Native desktop/mobile apps | Proposed; the current app is web-based. O05, H01-H03. | Platform integration and an app-store presence. | A good mobile web assembly flow is essential; multiple native clients are not. Separate platform maintenance is expensive. |
| F59. Voice, conversation search, sharing and advanced session polish | Mostly future enhancements around existing chat. H02-H03, O13. | More convenient ways to retrieve and enter ideas. | Do not place these ahead of context accuracy, saving and response quality. |
| F60. Many model choices and provider-specific tuning | Model-selection work already exists; usefulness of expansion unproven. H02, O13. | Trade speed, cost and reasoning style. | Preserve working choices, but judge changes with F28. Provider count is not a quality metric. |
| F61. Light theme, motion, rebranding and advanced design tooling | Tokens/dark theme/component work exists; expansion is optional. H04. | Personal preference and smoother visual presentation. | Accessibility and reusable patterns are essential; a new theme, Storybook or Figma integration is not automatically necessary. |
| F62. Power/bracket estimates and richer health dashboards | Health/analysis surfaces exist; broad scoring ambitions exceed demonstrated accuracy. O07, O13, H01-H03. | Help discuss expectations and notice deck imbalances. | Keep rules/source versions clear and uncertainty visible. Avoid false precision or conflating power, legality, originality and readiness. |

### E. Conditional on choosing a shared/public product

These are not authorised by this audit. The existing owner-scoped data design must be preserved now so that sharing is not blocked later.

| ID / capability | Current position | Benefit | Gate / trade-off |
|---|---|---|---|
| F63. Multi-user accounts, isolation and safe operations | Authentication and owner-scoped data exist; public readiness not established. O01, O15. | Another person can use Oracle without seeing or changing someone else's cards. | **Essential before a second user.** Independently verify permissions, all mutation paths, recovery, abuse controls and supportability; this is not a completed security assessment. |
| F64. Shared household collections and lending permissions | Proposed. H03. | Coordinate cards belonging to multiple people. | A shared pool needs ownership, consent and concurrent-movement rules. Do not simply remove user separation. |
| F65. Public decks, profiles, primers and discovery | Proposed public-product scope. H03. | Share creations and learn from others. | Privacy defaults, publishing controls and content/moderation obligations. Personal deck export already supplies much of the immediate value. |
| F66. Live collaboration and shared sessions | Proposed; competitors demonstrate demand. H02-H03. | Build together in real time. | Concurrency and attribution are substantial; simultaneous physical assignment is harder than shared text editing. |
| F67. Billing, quotas and cost controls | Proposed commercial scope. H03. | Sustain a service with expensive AI/data operations. | Billing is necessary only if charging. Cost limits and abuse protection must be ready before public expensive endpoints, whether paid or free. |
| F68. Public API, plugins and webhooks | Ideas in operational/product roadmaps. H01, H03. | Connect other tools without manual transfers. | Authentication, versioning, support and data-exposure obligations; not a personal-MVP dependency. |
| F69. Two-way external sync | Historical proposals conflict with the current local-authoritative, explicit-action direction. H02-H03, O01. | Keep multiple deck platforms aligned. | Conflict resolution and physical-state ambiguity can destroy trust. Do not revive silent recompute, Notion writes or external mutations from old runbooks. |
| F70. Life counter, tournament/social tooling, localisation and digital/non-Commander collections | Broad expansion ideas/comparator features, not current Commander-core requirements. H01-H03. | Serve more situations and audiences. | Separate product scope. Support observed personal needs first; adding formats or digital ownership must not weaken the physical Commander model. |

### Retired or replaced ideas: not a hidden implementation backlog

| Older idea | Current direction | What must be preserved |
|---|---|---|
| Claimed / unallocated / considering / Plan proxy as competing status systems | Approved availability plus Sleeved/Unsleeved; Original/Proxy; explicit actions | Old labels are not implementation authority. Do not collapse availability, placement and copy type into one field. |
| Built/Brewing/Graveyard as readiness | Draft / Assembling / Playable; folders organise retired decks | Existing saved decks and physical assignments, with approved migration handling when needed. |
| Missing as a routine owner-facing state/action | Retired from future UX | Existing excluded records cannot be deleted or made eligible automatically. O-008 remains an approval dependency. |
| Proxy supply eliminating an original shortage | Shortage counts originals needed, including proxy-filled requirements | A Playable deck can still contribute to a purchasing opportunity. No new readiness warning. |
| Any unsleeved demand reserving a copy | Unsleeved entries do not reserve physical copies | Informational demand/shortage visibility without changing another deck. |
| Archive automatically breaking down a deck | Folder organisation and Break down are separate | Moving a deck into a folder must not move its cards. |
| Automatic destructive reallocation or silent Notion updates | Explicit approved actions; local data authority | Historical command catalogues must not be executed as current instructions. |

## 4. Proposed delivery roadmap

**This is a proposal for review, not an amendment to the locked roadmap.** The current roadmap still orders M2 advisor, M3 act on advice, M4 canvas and M5 sharing. The owner has separately authorised the named quality-pass preparation. Implementation, actual mockups, stored-data changes, merges, deployments and milestone changes keep their existing approval gates.

Relative sizes indicate coordination/integration scope, not dates: **S** is a bounded documentation or isolated improvement; **M** is a coherent workflow across a few surfaces; **L** is a cross-surface/data/UX slice requiring several reviewed handoffs. More model tokens do not eliminate owner review, deployment evidence or integration testing.

### Phase 0: align the delivery map

**Outcome:** every agent knows which decisions and task states to follow. **Size: S.**

Reconcile the stale M1/M2 marker discrepancy and stale reconciliation-deployment note using the owner gates and existing deployment record; preserve history. Use this report to mark old comparison/roadmap material as historical, not to replace the approved milestone order. Turn the chosen Phase A scope into bounded tasks only after approval.

**Exit:** one unambiguous current milestone/task ledger; source-backed feature state; active T-19/T-27/T-28 work not duplicated. The requested portfolio audit is complete at this phase; the product changes below are not.

### Phase A: trustworthy collection and physical assembly

**Outcome:** importing, finding, sleeving, moving, making a proxy and breaking down behave consistently. **Size: L; split into reviewed slices, not one bulk rewrite.**

| Slice | Existing work / dependency | Deliverable |
|---|---|---|
| A1. Behaviour contract | T-28; D-002, D-005, D-025-D-033; resolve the old Missing-data disposition before any eligibility conversion | One shared account of states, actions, supply, basics, shortages and both-deck consequences. |
| A2. Pick-list-first UX | T-25/T-29/T-30 follow the reviewed contract; T-26 follows approved T-25 | Owner-reviewed assembly, shortages and basic-land screens using common rows, actions and status components. |
| A3. Implementation and consistency | Reviewed contract plus approved actual mockups; new backend/frontend work still needs authorisation | Wire collection, deck cards, pick list, locator, imports and reconciliation to the same behaviour; preserve existing folders/history/legality. |
| A4. Speed and honest loading | T-27 can investigate independently now; optimisation follows safe measurement and approved scope | Collection first, then deck navigation and assembly/reconciliation; scoped loading/error states without stale physical information. |
| A5. Trust and release gate | Isolated test data, reliable checks and agreed recovery scope | Show correct results for success, failure, repeated actions and competing attempts; keep a clear record of what is deployed. |

**Acceptance examples, not substitute specifications:**

- One free original requested by two Unsleeved decks: neither reserves it. After sleeving it into one, the other immediately has the correct location/availability.
- Move an original from Korvold to Prosper: Prosper becomes Sleeved, Korvold keeps an Unsleeved list entry, and both screens refresh.
- Using an existing proxy creates no copy. The Proxy action creates exactly one new proxy and sleeves it.
- A complete 100-card list with a commander and required Unsleeved slots is Assembling. All required coverage becomes Playable. An incomplete/overfull list is Draft under the approved simplified readiness rule; detailed legality remains separate.
- Thirty generic basics add no physical copies or outstanding pulls. A deliberately tracked basic still follows its actual copy.
- One original plus one proxy for two deck requirements produces an original shortfall of one. Two sleeved proxies plus one usable original free still means one additional original is needed, not two.
- Moving a sleeved card to Maybeboard releases the copy. Moving a deck to a folder does not; Break down does.
- A failed ownership fetch produces a visible failure/retry state, not Unowned. A failed storage load does not look like an empty collection.
- Status filters change the displayed results and retain their meaning between grid/list views. The pick list names actual copy locations.
- Target **usable content within 2 seconds initially and 0.5 seconds on a warm return**, measured on a verified safe environment with declared data size, device/network conditions, cache state and sample distribution. These are approved targets, not achieved results; a skeleton appearing is not usable content.
- The same assembly journey works on a phone without relying on hover-only controls.

**Stop/go:** no broad UI replacement before the contract and actual mockups are approved. No production timing experiment that can alter data. No transition that silently deletes or re-enables old excluded copies. Owner approves any changed reliance/recovery promise.

### Phase B: an advisor that earns trust

**Outcome:** useful suggestions for the actual commander, deck and collection, with clear reasons and availability. **Size: L.**

T-19 informs T-15's advisor/data contract and T-16's reviewed suggestion experience; T-17/T-18 implement the approved contracts. The final availability presentation must also align with T-28. Research and non-conflicting preparation can continue in parallel; this report does not authorise starting those implementation tasks.

**Recommended evaluation gate:** preserve the existing M2 exit test on three of the owner's real decks, and propose adding T-19's varied **at least 12-commander** coverage matrix with a held-out subset. A held-out commander is one not used while tuning the approach, so it tests whether the method generalises.

Separate the results:

| Must be factually correct | Must be evaluated for usefulness |
|---|---|
| Real card identities; supported Commander rules; known/unknown metadata; current copy availability and source; supported price/finish information; no silent writes | Relevant mechanics and secondary archetypes; conditional packages; sensible cuts; budget fit; less-popular useful cards; explanations; owner preference alignment |

For example, a sacrifice commander should distinguish disposable creatures, sacrifice outlets and rewards, rather than merely counting cards tagged "sacrifice". A spell-copy commander should not receive every card that mentions casting without checking whether copied spells trigger it. The benchmark should deliberately include such near-misses.

Agree quality thresholds from the measured baseline rather than inventing a pass percentage now. Do not select Jev on a marketing claim or a single impressive output. Compare the existing approach, the candidate and a suitable hybrid under the same cases, latency and ongoing cost assumptions.

**Stop/go:** factual checks pass, usefulness improvements are demonstrated, owner reviews the actual suggestions, and any provider/privacy/licensing change is explicitly approved.

### Phase C: safe action on advice

**Outcome:** preview an add/cut/swap, accept it deliberately, and undo it without corrupting physical state. **Size: M-L. Maps to M3.**

Reuse existing deck mutations and version infrastructure where appropriate. Cover Maybeboard, explicit sleeve/move choices, source attribution, cancellation, repeated submission and an intervening edit. A deck-list restore must explain its physical effects rather than pretending it restores historical inventory.

**Exit:** the owner accepts and undoes a real suggestion; the list, copy locations, shortage view and affected decks remain correct. No AI response or "Accept" button silently takes another deck's card.

### Phase D: selected convenience and deeper building

**Outcome:** reduce recurring manual work without broad feature accumulation. **Size: choose S/M increments; canvas remains its own larger M4 slice.**

Use the parity/friction log to pick the next few improvements. My recommended first candidates are shortage shopping export, narrowly useful bulk maintenance, saved views and clearer version comparison. Choose lightweight goldfishing if real deck-building sessions show that it would change decisions.

Keep M4's approved Brew Canvas direction and owner-reviewed interactions. Do not use the "nice to have for MVP" label as permission to cancel it or start it early. Reconsider debrief and precon work only after the central advice/action loop is working.

**Exit per item:** demonstrate the specific repeated task it shortens; preserve the core workflow; avoid adding a new permanent surface for a rarely used operation.

### Phase E: explicit decision on sharing

**Outcome:** either keep a strong personal tool or deliberately prepare a shared service. **Size: L if selected. Maps to M5.**

Before another user: independently verify isolation, permissions and simultaneous actions; provide appropriate recovery, onboarding, privacy controls, limits on expensive operations, monitoring and support. Add billing only if charging. Household sharing, public discovery and live collaboration each need their own product decision.

**Stop/go:** the owner chooses audience and acceptable operating cost; access/data safety is demonstrated in an isolated environment. This audit does not certify public-launch readiness.

### Dependency summary

```text
Current decisions + reviewed T-28
  -> T-25 / T-29 / T-30 pick-list, shortage and basic-land UX
  -> approved T-25 -> T-26 reusable components
  -> approved implementation slices -> verified assembly

Safe environment -> T-27 measurements -> targeted speed/loading changes

T-19 assessment + reviewed availability contract
  -> T-15 tools/data + T-16 reviewed suggestion UX
  -> T-17 / T-18 advisor -> owner-approved M2 exit
  -> M3 safe actions/undo -> M4 building conveniences/canvas
  -> explicit M5 sharing decision
```

This shows technical/product dependencies, not permission to skip the milestone-marker resolution or owner gates.

## 5. Documentation corrections and maintenance

| Finding | Why it matters | Disposition |
|---|---|---|
| Current roadmap says M1 CURRENT; task ledger says M2 CURRENT | An unattended agent can either block useful work or start the wrong milestone. | Existing O-006 remains open. Do not silently declare a milestone transition in this report. |
| T-24 row retains a draft-deployment note, while O-005 records later deployment | Can cause duplicate migration work or inaccurate claims about hosted state. | Reconcile against the deployment record; do not redeploy from an old summary. |
| Older roadmap counts Goldfish, Debrief and Precon Mod Tracker as built | Creates false completion and maintenance assumptions. | Current product-index/source review does not establish active screens; preserve them as deferred/removed history. |
| Folders, version history, legality, export and locator are sometimes listed as missing | Encourages duplicate builds. | Record what already exists and the remaining workflow gap. Locator is not yet "all physical copies"; history is not full inventory recovery. |
| "Bulk actions missing" hides existing Card Management handlers | Leads to another implementation of the same operations. | Reuse and align the allocation-page implementation; do not assume it is mounted on Collection. |
| Earlier import-safety/progress findings predate later changes | Reopens resolved problems as if they were newly confirmed. | Current route/engine contains streamed progress and an atomic replacement RPC path. Hosted transaction correctness was not re-tested by this audit. |
| Old comparison tables assert unsupported absences and numerical completeness | Distorts differentiation and priorities. | Add historical/superseded notices and point to this evidence-qualified audit. |
| Dashboard/readiness and taxonomy specifications conflict with new owner decisions | Old acceptance criteria could recreate warnings, reservations or old labels. | Current decisions D-025-D-033 win; old specifications need reconciliation before any handoff uses them. |
| Sidebar specification contradicts itself on retention (30 versus 90 days) and naming timing | An implementation cannot satisfy both versions. | Resolve only when changing that behaviour; do not silently choose a value in a feature audit. |
| Archived material sometimes claims to be authoritative; command catalogues describe obsolete mutations | Archive status alone is not enough to establish safe instructions. | Current decisions/contracts take precedence. Preserve useful historical intent, never execute legacy write sequences. |
| Duplicate mockups and repeated research blur the size of the backlog | Inflates scope and makes the same idea look like several features. | Inventory exact duplicates; consolidate references without deleting original history in this task. |

Recommended ongoing rule: every new feature entry should state **current versus proposed behaviour, owner approval, source evidence, dependencies, and a visible exit example**. A report, route, screenshot or mockup alone is not proof of a complete shipped workflow.

## 6. Evidence appendix

### Implementation evidence

All paths are repository-relative. These are source-backed observations, not claims of fresh hosted end-to-end verification.

| Ref | Evidence and conclusion |
|---|---|
| O01 | [Confirmed: docs/oracle/decisions.md; docs/oracle/status.md; docs/oracle/roadmap.md] Current product rules, approval gates, M1/M2 marker conflict, scoped T-19/T-27/T-28 authorisations and deployment-history note. |
| O02 | [Confirmed: src/app/collection/page.tsx] Grid/list/import/export/value/freshness surfaces are wired. `activeStatuses` does not reach the data hooks. Rollup remains enabled alongside the printing-list query; some printing counts are page-derived. These are correctness/performance investigation inputs, not measured timing results. |
| O03 | [Confirmed: src/app/api/collection/import/route.ts; src/lib/import-engine-v2.ts; src/app/api/decks/import/preview/route.ts] Collection replace streams progress/error messages and uses `executeInstanceLevelImport`; the engine calls `replace_collection` and checks its result. Deck preview contains multiple source branches. This is not proof all third-party formats or the hosted RPC were freshly exercised. |
| O04 | [Confirmed: src/app/api/collection/export/route.ts] CSV exports per-copy card/printing/finish/condition/proxy/purchase fields but not physical copy IDs, storage or assignment relationships/history. Therefore it is not a complete relational backup. |
| O05 | [Confirmed: src/app/layout.tsx; src/components/TopNav.tsx; src/components/MainContentWrapper.tsx] Current mounted navigation, global Oracle sidebar, SmartSearch and CardLocator. Legacy `Sidebar.tsx` is not the authority for current navigation. |
| O06 | [Confirmed: src/components/CardLocator.tsx; src/app/api/cards/locate/route.ts] Locator is globally available, but its route queries `deck_cards` and groups deck membership with a physical-copy indicator. It does not enumerate copies held in storage; null ownership status is defaulted to `original`. |
| O07 | [Confirmed: src/app/decks/[id]/page.tsx; src/components/LegalityBanner.tsx; src/app/api/decks/[id]/legality/route.ts] Export, history, legality and Cards/Sleeve List/Workbench/Analysis/Combos/Upgrade/Strategy tabs are mounted. Several tab triggers are hidden on mobile. Legality uses Commander-oriented checks, skips some missing metadata, and the banner does not present all failure/unknown cases. No active Goldfish/Debrief/Precon tracker tab was found in the inspected route/component inventory. |
| O08 | [Confirmed: src/components/VersionHistoryPanel.tsx; src/app/api/decks/[id]/versions/[versionId]/restore/route.ts] Named snapshots and restore exist. Restore snapshots the current list, applies a deck delta and releases assigned copies before removing slots; it is not a historical physical-location restoration. |
| O09 | [Confirmed: src/app/page.tsx] Folder controls, creation and deck filtering are implemented. The older dashboard specification is not the current readiness contract. |
| O10 | [Confirmed: src/app/storage/page.tsx] Location tiles/counts/Unsorted and management exist. The query can throw, but the component uses data/loading rather than an explicit error display; a failed load can be presented through empty/default UI. |
| O11 | [Confirmed: src/app/allocation/page.tsx; src/components/collection/CollectionRollupTab.tsx; src/components/collection/BulkActionBar.tsx] Card Management mounts the rollup tab and bulk bar with real storage/Missing/delete handlers. These are not merely absent stubs and are not mounted by the current Collection page. |
| O12 | [Confirmed: docs/oracle/reports/2026-09-29-orchestrator-state-of-the-nation.md; docs/oracle/plans/01-behaviour-and-actions.md; docs/oracle/plans/02-components-and-screens.md; docs/oracle/plans/03-loading-performance.md] Prior same-session code-grounded findings and approved direction: status drift, lookup fallbacks, eligibility inconsistency, legacy pick-list status checks and incomplete donor refresh. Relevant implementation includes `card-status.ts`, `allocation-candidates.ts`, `PicklistV2.tsx` and card/status components; these were not re-audited as a new contract here. |
| O13 | [Confirmed: src/app/decks/[id]/page.tsx; .kiro/specs/product-spec.md; docs/oracle/reports/2026-09-29-orchestrator-dispatch-ai-assessment.md] AI-facing UI/integration families and historical feature inventory exist; the dispatched fresh AI assessment covers actual data paths, tools, Jev and recommendation coverage. No fresh assertion that every knowledge document is ingested or useful is made. |
| O14 | [Confirmed: public/manifest.json; .kiro/specs/pwa-infrastructure/requirements.md] PWA metadata/specification exists. Installability, offline availability and offline mutation safety were not certified; they must not be inferred from the manifest. |
| O15 | [Confirmed: docs/oracle/reports/2026-09-29-orchestrator-state-of-the-nation.md; next.config.ts; docs/roadmap/infrastructure.md] Earlier same-session focused validation reported 94 tests, 89 passing/5 pre-existing failures, and typecheck failures. `ignoreBuildErrors` is enabled. The infrastructure document describes an unsafe production-targeted E2E history; current safe measurement/test-target proof is delegated, not assumed. No application tests were rerun for this documentation-only audit. |
| O16 | [Confirmed: src/app/api/onboarding/reconciliation/instance/wishlist/route.ts] A per-import-instance wishlist flag exists. It is not evidence of a general global wishlist, original-shortage list or purchasing workflow. |

### Documentation provenance

| Ref | Source families |
|---|---|
| H01 | `docs/roadmap.md`, `docs/roadmap/*.md`, `docs/roadmap-foundations-first.md`: collection, decks, allocation, storage, data, mobile, design and operational ideas. Completion/prioritisation claims are historical unless reconciled with current decisions/source. |
| H02 | `.kiro/specs/product-spec.md`, `.kiro/specs/SPEC-VALIDITY-AUDIT.md`, the 46 inventoried specification-family directories and archived material. Covers filters, decks dashboard, shared sidebar, copies, imports, brew, monitor, mobile, PWA and removed/deferred features. |
| H03 | `research/docs/product/*.md`, `research/docs/*.md`, `docs/oracle/contracts/jev-research-2026-09.md`, AI knowledge and research assets. Product positioning, commands, content strategy, collection/deck studies, AI and launch proposals. Old Jev material is input to fresh T-19 verification, not a current adoption verdict. |
| H04 | `docs/roadmap/design-system.md`, `docs/design/`, UI overhaul/token/component specifications and current review plans. Accessibility, common controls, responsive behaviour, Figma and optional design-tool expansion. |
| H05 | `research/docs/ui-design/`, `research/docs/product/ui-design/`, `docs/oracle/mockups/`. Covers list/grid/grouped views, pick lists, shared cards, storage, global search, wishlist, custom views, copy detail and historical brew/debrief/strategy concepts. Seven exact HTML duplicates; mockups are not deployed screens. |
| H06 | `docs/feature-matrix.md`, `docs/competitive-positioning.md`, `docs/COMPETITIVE-AUDIT-FINDINGS.md`, `docs/competitive-audit-research.md`. Older comparisons corrected/qualified by current primary-source research in this report. |
| H07 | `AGENTS.md`, `.paseo/agents/orchestrator.md`, `docs/oracle/decisions.md`, `docs/oracle/status.md`, `docs/oracle/roadmap.md`, current contracts/plans/reports. Current authority and approval boundaries. |

### Public sources checked

All sources below were accessed on 2026-09-29. Descriptions are paraphrases, not reproduced help content.

| Ref | Primary source | What it supports / limitation |
|---|---|---|
| C01 | [Archidekt](https://archidekt.com/) | Official homepage metadata describes search, import/export, collection, playtester, pricing and EDHREC recommendations. |
| C02 | [Archidekt FAQ](https://archidekt.com/faq) | Categories/templates, multiple views, batch editing, printing optimisation, saving and live collaboration. |
| C03 | [ManaBox](https://manabox.app/) and [FAQ](https://manabox.app/guides/general/faq/) | Scanner, offline search, simulator, prices, trade tool; platforms, backup versus subscription cloud sync and desktop-development statement. |
| C04 | [ManaBox collection getting started](https://manabox.app/guides/collection/getting-started/) | Binders, lists/wishlists and registered physical decks are distinct concepts. |
| C05 | [ManaBox deck getting started](https://manabox.app/guides/decks/getting-started/) | Collection-aware filtering, basic-land controls, statistics, price presentation and simulator. |
| C06 | [ManaBox collection decks](https://manabox.app/guides/decks/collection-decks/) | Build from collection, sources in binders/other decks, exact set/foil matching, alternate versions, moves, deck updates and disassembly. Strongest direct physical-workflow comparison. |
| C07 | [TopDecked](https://www.topdecked.com/) | Official public homepage rendered in an anonymous browser; `/features` redirected here. Advertised features, not hands-on quality results. |
| C08 | [Moxfield help](https://moxfield.com/help) and [tagging primer](https://moxfield.com/decks/AWxPrpOTvE6gSuVcz0Xlwg/primer) | Limited retrieval; direct browser help request returned 403. The [feedback item](https://moxfield.nolt.io/776) was user commentary, not implementation proof. |
| C09 | [Deckbox Premium](https://deckbox.org/premium) | Inventory/deck/trade capabilities, metadata, wishlists, built-deck handling, mobile scanning and paid-tier terms. Old "no scanner" descriptions are not current. |
| C10 | [EDHREC digital deckbuilding guide](https://edhrec.com/articles/digital-deckbuilding-the-how-to-guide-to-building-a-commander-deck-using-edhrec-archidekt-and-commander-spellbook) | Commander/themes/typal, filtering and role browsing, Archidekt categories/packages and ecosystem workflow. |
| C11 | [EDHREC FAQ](https://edhrec.com/faq) | Data sources, collection cadence and corpus limitations; invalid-list exclusion. |
| C12 | [Commander Spellbook](https://commanderspellbook.com/) | Official identity as an EDH combo search engine; detailed integration/coverage is not independently benchmarked here. |
| C13 | [Riffle Zone](https://riffle.zone/) | Advertised collection-aware AI, physical-copy registration/storage/pull lists, proxies and household features. Vendor claims only; no assertion of recommendation accuracy or current account-level availability. |
| C14 | [ManaCurve](https://manacurve.app/) | Public archetype-generation changelog and dated beta information. No measured quality or general feature-completeness verdict. |
| C15 | [ManaGate](https://www.managate.app/) | Official FAQ documents imports, AI operation categories, price refresh, supported formats and privacy claims. Not independently verified. |
| C16 | [Planeskeeper](https://planeskeeper.dev/) | Official metadata advertises collection tracking, AI analysis and iOS/web sync. Detailed physical-copy workflow unverified. |

Other names from the historical research remain **limited-evidence comparators**, not confidently scored alternatives: [EchoMTG](https://www.echomtg.com/) exposed only limited text; [ManaTrove](https://manatrove.app/) returned 530; [WaxCache](https://www.waxcache.com/) returned 429; [Dragon Shield](https://mtg.dragonshield.com/) and [TCGplayer mobile](https://www.tcgplayer.com/mobile-app) exposed insufficient content for a fresh detailed comparison. Blocks were not bypassed. Search-generated claims conflicting with primary pages were discarded.

## Changed files

- `docs/oracle/reports/2026-09-29-orchestrator-feature-portfolio-audit.md` - owner-requested capability audit, corrected comparison, priorities, proposed roadmap and evidence.
- `docs/oracle/reports/2026-09-29-feature-document-inventory.csv` - complete pre-report 503-file inventory with exact-duplicate provenance.
- `docs/README.md` - directs readers to current decisions, task status, approved roadmap and this audit; keeps historical sources clearly labelled.
- `docs/roadmap.md` - historical-scope notice without rewriting the old feature checklist.
- `docs/feature-matrix.md` - warns against treating old feature ticks and absences as current.
- `docs/competitive-positioning.md` - points to the corrected current comparison.
- `docs/COMPETITIVE-AUDIT-FINDINGS.md` - flags superseded positioning/completion claims.
- `docs/competitive-audit-research.md` - marks earlier research as historical.
- `docs/oracle/status.md` - records completed owner-requested T-31 audit and proposed-roadmap review boundary.

## New decisions made (need owner confirmation)

- **None enacted.** The essential/optional ranking and phased delivery sequence above are recommendations for review, not approved implementation or milestone changes.
- Proposed stronger acceptance criteria for recovery and the AI benchmark require confirmation before becoming new release promises.
- No vendor selected; no public launch, new paid service, private-data sharing, application change, migration, merge or deployment approved by this audit.

## Assumptions

- Oracle remains a personal Commander tool, with sharing a later explicit choice.
- Current locked decisions and the owner's approved three quality plans override incompatible historical designs.
- A source-wired feature is evidence of implementation, not automatic proof of hosted correctness or full acceptance coverage.
- Preserving and finishing existing useful features is preferable to replacing them merely because an old backlog calls them absent.
- The 503-file inventory is a dated snapshot taken before this report/index work; sizes and hashes of documents edited by this task will intentionally differ afterward.

## Challenges to locked decisions

- None. The proposed prioritisation does not revoke D-008-D-011's Brew Canvas direction, expand D-017 into a full category-by-mana-cost target matrix, or reverse the approved readiness, proxy, shortage or data-authority rules.
- M1/M2 and deployment-marker inconsistencies are documentation drift recorded in O-006, not grounds for an agent to declare a milestone change.

## Open questions

- Owner review of the proposed priority order and any stronger recovery/AI acceptance gates; the audit itself is not blocked.
- Existing O-008: what should happen to previously excluded/Missing copies before that concept is removed? Do not delete or make them available by assumption.
- T-19: verified Jev suitability and recommendation-coverage results. T-27: safe runtime baseline. T-28: reviewed shared behaviour contract. Their results may refine estimates and acceptance criteria.
- Public audience, pricing and household-sharing scope remain intentionally undecided.

## Verification

- Repository document inventory - 503 files, 495 unique content hashes, 4,242,577 bytes; feature-family and HTML duplicate counts recorded above.
- Source inspection - mounted navigation, collection queries/export/import, deck tabs/history/legality, folders, locator, storage and bulk-action reachability checked; source claims separated from historical claims.
- Public-source inspection - primary-source comparisons and retrieval limitations recorded; no third-party login, private-data upload or access-control bypass.
- Local HTML inspection - distinct mockup headings/actions extracted without executing scripts or fetching embedded resources.
- `python3` read-only inventory/link/evidence checks - passed: 503 inventory entries, 495 unique contents, 4,242,577 bytes, exactly seven expected document changes since the snapshot, 70 capability IDs, 39 evidence/source IDs, confirmed evidence paths and 39 local links. The persisted CSV matches the generated snapshot byte for byte.
- `git --no-pager diff --check` - passed; final source-control inspection confirms documentation-only changes for this audit and preserves earlier uncommitted work.
- Application/runtime validation - not performed for this documentation-only audit; prior same-session test results are explicitly attributed rather than presented as a fresh pass. No live mutations or deployments.
