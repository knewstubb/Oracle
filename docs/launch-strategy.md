# The Oracle — Product Launch Strategy

> Draft: 2026-07-14
> Status: Internal planning document
> Revised: 2026-07-15 — Section 8's aggressive 8-week public-launch timeline is superseded. Confirmed direction: personal-use-first. Multi-user and monetization infrastructure (RLS retrofit, billing, usage metering) are deferred until an explicit decision to open signups — not abandoned, just unscheduled. Sections 1-7 and 10 remain valid strategy for when that decision is made. Section 9's checklist is future-facing, not active work. Section 11 added: codebase audit findings from the card-allocation redesign.

---

## 1. Executive Summary

The Oracle is a physical card management system for MTG Commander players who own real collections and want to track which specific card is in which deck, which are proxied, and which are available. It's not a deck builder that happens to have a collection feature — it's a collection system that happens to build decks.

The core differentiator vs. Archidekt/Moxfield/ManaBox: **instance-level physical fidelity**. One row per physical card. Not "I own 3 Sol Rings" but "Sol Ring #1 is in Muldrotha, Sol Ring #2 is in the binder, Sol Ring #3 is a proxy in Gitrog." Nobody else does this.

---

## 2. Competitive Gap Analysis

### Feature Matrix

#### Established Players

| Feature | The Oracle | Archidekt | Moxfield | ManaBox | Deckbox | EchoMTG |
|---------|-----------|-----------|----------|---------|---------|---------|
| **Instance-level tracking** | One row per card | Quantity-based | Quantity-based | Quantity-based | Quantity | Per-printing |
| **Physical allocation** (which copy in which deck) | Per-copy FK | Per-name labels | "Strict Assignment" (3yr in progress) | Not tracked | Partial | Partial (lists) |
| **Proxy tracking** (which specific copies are proxies) | Per-instance is_proxy | Tag-based (fragile) | No | No | No | No |
| **Storage locations** | Per-instance FK | No | Binders (quantity) | No | Partial (boxes) | No |
| **Contention detection** (card in 2+ decks, only 1 copy) | "Claimed" status | No | No | No | No | No |
| **AI deck builder** | Tool-use loop (EDHREC, Scryfall, Spellbook) | No | No | No | No | No |
| **AI post-game debrief** | Structured analysis + recommendations | No | No | No | No | No |
| **Deck health monitoring** | Category thresholds + strip | Basic stats | Basic stats | Basic | No | Basic |
| **Upgrade suggestions** (EDHREC-powered) | Cut/add pairs with pricing | No | No | No | No | No |
| **Goldfish/playtesting** | Not built | Yes | Yes | Yes (simulator) | No | No |
| **Mobile app** | Web only | Web | Web | Native (primary) | No | Native |
| **Card scanning** (camera) | No | No | No | Yes (core feature) | No | Yes |
| **Social/community** | Single-user | Public decks, comments | Public decks, follows | Limited | Trading | Public pages |
| **Pricing data** | Card Kingdom | Multi-source | Multi-source | Multi-source | Yes | Multi-source (core) |
| **Format legality checking** | Not built | Yes | Yes | Yes | No | No |
| **Multi-user / sharing** | Single-user | Yes | Yes | Yes | Yes | Yes |
| **Precon mod tracking** | Budget + rarity constraints | No | No | No | No | No |
| **Import from other platforms** | Archidekt + Moxfield + CSV | N/A | Archidekt import | CSV | CSV | Archidekt/CSV |

#### Emerging Competitors (2025-2026)

| Feature | The Oracle | ManaCurve | Riffle Zone | ManaTrove | Planeskeeper | WaxCache |
|---------|-----------|-----------|-------------|-----------|--------------|----------|
| **Instance-level tracking** | One row per card | Unknown (beta) | Unknown (waitlist) | Per-printing | Per-card | Per-card + slot |
| **Physical allocation** | Per-copy FK w/ contention | "Copy pressure" visibility | Collection-aware (claims) | Named collections | "Synced across phone/web" | Box/binder/slot |
| **Proxy tracking** | Per-instance is_proxy | Unknown | Unknown | No | Unknown | No |
| **Storage locations** | Per-instance FK | No | LGS store integration | Named collections (deck/binder/box) | Unknown | Core feature (QR labels) |
| **Contention detection** | "Claimed" status + picklist | "Copy pressure visible" | Missing-cards list | No | No | No |
| **AI features** | Full (brew + debrief + upgrade) | No | AI advisor + upgrader | No | AI strategy analysis | No |
| **Build from owned cards** | Yes | Yes (core feature) | Yes (core feature) | No | Yes | No |
| **EDHREC integration** | Tool-use (live) | Unknown | Inline + Recommander | No | No | No |
| **Commander-first** | Yes | Yes | Yes | No (general MTG) | Yes | No (all TCGs) |
| **Pricing data** | Card Kingdom | Unknown | Store price checking | Scryfall (EUR/USD) | Unknown | Market prices |
| **Launch status** | Deployed (single-user) | Beta | Waitlist | Live (early) | Dev/beta | Live |
| **Target user** | Physical collector w/ 3+ decks | Collection-first brewer | All-in-one deckbuilder | Value-tracking collector | Mobile-first player | Physical card organizer |

#### Competitive Positioning Summary

| Competitor | Their edge | Their gap (our advantage) |
|-----------|-----------|--------------------------|
| **Archidekt** | Largest user base, social features, playtesting | No instance-level tracking, no AI, no storage locations |
| **Moxfield** | Clean UX, strong community, collection binders | "Strict Assignment" stuck 3+ years, quantity-based schema |
| **ManaBox** | Camera scanning, native mobile, smooth UX | No allocation, no deck-status awareness, no contention |
| **EchoMTG** | Price tracking depth, camera scanning, mobile | No allocation model, finance-focused not play-focused |
| **ManaCurve** | Collection-first deck building, copy pressure | Unknown depth of allocation model, no AI, likely no proxy tracking |
| **Riffle Zone** | EDHREC inline, AI advisor, store price checking | Waitlist-only (unshipped), no confirmed instance-level, deckbuilder-first |
| **ManaTrove** | Per-printing tracking, EUR/USD history, clean | Value-tracking only, no deck allocation, no deck building |
| **Planeskeeper** | Mobile + web sync, AI analysis | Early stage, unclear depth of allocation model |
| **WaxCache** | Physical location tracking (QR labels), multi-TCG | Not Commander-focused, no deck building, no contention detection |

### Key Gaps to Close Before Launch

| Gap | Severity | Effort | Notes |
|-----|----------|--------|-------|
| **Goldfishing / playtesting** | High | Large (2-3 weeks) | Core expected feature for any deck tool. Users goldfish to test mana curves and opening hands. Without it, serious brewers won't switch. |
| **Format legality** | Medium | Medium (1 week) | Scryfall already has ban/restrict data. Surface it as a per-deck check. Don't build format-specific rules engines yet — just "this card is banned in Commander." |
| **Mobile responsiveness** | Medium | Medium (1 week) | Not a native app, but the web app needs to be usable on phone for "at the LGS" scenarios (checking what's in a deck, marking cards Missing). |
| **Multi-user** | Low for MVP | Large | Single-user is fine for launch if positioned as "personal collection management." Social features are a V2 play. |
| **Card scanning** | Low | Large (requires ML/camera API) | ManaBox's killer feature. Don't compete on this axis initially — CSV import is the onramp. |

---

## 3. Technical & Infrastructure Requirements

### Current Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Next.js 16 (App Router), React 19, TanStack Query | Production-ready |
| Styling | Tailwind CSS, shadcn/ui, custom tokens.css | Complete design system |
| Database | Supabase Postgres (managed) | ~3400 physical_copies, 31 tables |
| Auth | Supabase Auth (PKCE flow) | Single-user, works |
| AI | Anthropic Claude, Google Gemini, DeepSeek | Tool-use loop, SSE streaming |
| Hosting | Vercel (frontend) + Supabase (backend) | Deployed |
| External APIs | Scryfall, EDHREC, Commander Spellbook, Card Kingdom | Direct REST calls |

### Infrastructure for Launch

| Requirement | Current State | What's Needed | Monthly Cost |
|-------------|--------------|---------------|--------------|
| **Vercel Pro** (60s function timeout, team features) | Hobby (free) | Upgrade to Pro | $20/mo |
| **Supabase Pro** (8GB DB, 250 connections, daily backups) | Free tier (500MB, 60 connections) | Upgrade to Pro | $25/mo |
| **Supabase additional bandwidth** (if >5GB egress) | 2GB included | May need add-on at scale | $0-10/mo |
| **AI API costs** (Claude/Gemini per-token) | Pay-per-use | Budget ceiling per user/month | ~$5-20/mo at 50 users |
| **Domain + SSL** | Vercel-managed | Custom domain | $15/year |
| **Error monitoring** (Sentry or similar) | None | Add for production stability | $0 (free tier) to $26/mo |
| **Uptime monitoring** | None | Add (BetterStack, Checkly) | $0-10/mo |

**Total estimated monthly cost at launch (< 50 users): $50-85/mo**
**At 500 users: $100-250/mo** (Supabase scales linearly, AI costs grow with usage)

### Stability Requirements Before Launch

| Category | What's Needed |
|----------|---------------|
| Error boundary coverage | Every page has error.tsx (already done) |
| Automated testing | Classification engine tested (done). Need: E2E smoke tests for critical paths |
| Database backups | Supabase Pro includes daily backups. Point-in-time recovery on Pro tier. |
| Rate limiting | Per-user rate limits on AI endpoints (prevent abuse/cost runaway) |
| Graceful degradation | AI features fail silently. External API failures don't crash the app. |
| Migration safety | All migrations tested before remote push. Rollback scripts documented. |
| Performance baseline | Card-statuses < 500ms. Collection rollup < 1s. Import < 120s. |
| RLS enforcement | Currently bypassed (admin client). For multi-user: enable proper RLS. Major security work. |

### RLS: The Big Multi-User Blocker

Currently ALL server-side queries use createAdminClient() which bypasses RLS. User isolation is done via .eq('user_id', userId) in application code. This works for single-user but is a security risk for multi-user.

Required for multi-user launch:
1. Switch from admin client to user-scoped client
2. Verify all RLS policies (migration 003 created them, never tested multi-user)
3. Audit every query for user_id scoping (~60+ queries)

Effort: 1-2 weeks. Can defer if launching invite-only single-tenant.

---

## 4. Monetisation Model

### Recommended: Freemium with Usage-Based AI Tier

| Tier | Price | What's Included |
|------|-------|-----------------|
| **Free** | $0 | Full collection + allocation + deck management. 5 decks. No AI features. |
| **Core** | $5/mo | Unlimited decks, full AI brew + debrief, upgrade suggestions, storage management |
| **Collector** | $12/mo | Everything in Core + priority support, bulk operations, advanced analytics, API access |

Break-even (covering infra): ~$85/mo = 17 Core subscribers.

### Revenue Projections

| Users | Paying (20% conversion) | Revenue/mo |
|-------|-------------------------|------------|
| 100 | 20 | $100-240 |
| 500 | 100 | $500-1,200 |
| 2,000 | 400 | $2,000-4,800 |
| 10,000 | 2,000 | $10,000-24,000 |

---

## 5. Marketing Strategy

### Community Demand Validation

The problem The Oracle solves — "where is my specific card, which deck has it, and what's available?" — is one of the most frequently requested features across the MTG tooling ecosystem. Research into community forums, feature request trackers, and competitor feedback boards reveals strong, persistent, unmet demand.

**Moxfield Feature Request Board (nolt.io) — The Clearest Signal**

Moxfield's public feedback board has at least **8 separate feature requests** all describing the exact problem The Oracle solves:

- [#776 "Add Strict Assignment to Collections"](https://moxfield.nolt.io/776) — The flagship request. Users want to know where cards are located across decks. Example given: "Sol Ring [6 owned] (Deck 1, Deck 2, Deck 3)." Status: **In Progress** for 3+ years. Comments include frustration: "This was a feature request 3+ years ago, I don't think they know how to do it." One commenter offered to donate development time.
- [#1027 "Show if card is In Use"](https://moxfield.nolt.io/1027) — "I own 4 Swiftfoot Boots, 3 are in built decks. Show me 1 available." The user independently designed The Oracle's exact taxonomy: deck status tags ("brewing", "built", "retired") determining allocation. The commenter uses a special binder per-deck as a workaround.
- [#1605 "Track cards in decks in collection"](https://moxfield.nolt.io/1605) — "The specific version of a card does matter!" — validates instance-level fidelity. Notes: "Everybody is talking about it."
- [#1962 "Active Decks & available cards"](https://moxfield.nolt.io/1962) — "I don't want to swap cards, so show me if a card is already used in other active decks." Merged into #776.
- [#1878 "Introduce an 'in Use' state"](https://moxfield.nolt.io/1878) — "When building a new deck, I do not know if the card is already in use in another deck."
- [#421 "Strict Assignment"](https://moxfield.nolt.io/421) — Describes a "check in/out system" — cards marked as being in certain decks or in collection. Almost word-for-word The Oracle's allocation model.
- [#1291 "See what cards are currently in decks"](https://moxfield.nolt.io/1291), [#1242 "Colored tick for card owned but in another deck"](https://moxfield.nolt.io/1242), [#1299 "Show owned but used"](https://moxfield.nolt.io/1299) — All variations of the same need.

Key takeaway: Moxfield marked "Strict Assignment" as **In Progress** over 3 years ago. It hasn't shipped. Their quantity-based schema makes this architecturally hard — they'd need to track *which specific copy* is where, not just "you own N of this card."

**Moxfield GitHub (moxfield-public/issues/3) — Early Signal (2020)**

The very third issue ever opened on Moxfield's public repo was "User Inventory" requesting per-printing tracking and the ability to see "how many copies I have that aren't in a deck, as well as what decks any copies I own are currently in."

**MTGSalvation Forum Threads (2011-2015) — Perennial Problem**

Multiple long-running threads discuss the pain of sharing cards between Commander decks:

- ["System for sharing cards between decks?"](https://www.mtgsalvation.com/forums/magic-fundamentals/magic-general/325348-system-for-sharing-cards-between-decks) (2011) — The solution proposed was physical proxies with notes marking which deck holds the original.
- ["Best way to share cards between decks?"](https://www.mtgsalvation.com/forums/the-game/commander-edh/545349-best-way-to-share-cards-between-decks) (2014) — "It's a pain in the ass to swap them back and forth. Most people proxy cards they already own because swapping is annoying."
- ["Sharing cards among commander decks"](https://www.mtgsalvation.com/forums/the-game/commander-edh/600936-sharing-cards-among-commander-decks) (2015) — Users suggest altered cards, paper slips in sleeves, or just buying duplicates.
- ["How do you all have multiple decks at the same time?"](https://www.mtgsalvation.com/forums/commander-edh/198211) (2011) — "Do you switch cards around, proxy cards you own, or own extra copies of everything?" — This is literally The Oracle's problem statement.

**Reddit r/EDH (373k members) — The Audience**

The proxy-for-owned-cards discussion is one of the most common recurring threads on r/EDH. A [curated FAQ list](https://ikhat.gitbook.io/workspace/reddit/faqs/proxies) documents dozens of posts from 2018-2019 alone with titles like "Proxy for expensive cards when already owning one?" This pattern hasn't stopped — it surfaces every few weeks.

The r/mpcproxies subreddit (57k members) exists primarily because people want physical proxies for cards they own but don't want to swap between decks. That's 57,000 people actively solving the problem The Oracle makes unnecessary to solve physically.

**Emerging Competitors — The Market is Waking Up**

Several new tools are explicitly targeting this space, validating the opportunity:

- **[ManaCurve.app](https://manacurve.app/)** — "Build Commander decks from the cards you own. Keeps copy pressure visible as your decks change." Tagline directly mirrors The Oracle's positioning. Currently in beta.
- **[Riffle Zone](https://riffle.zone/)** — Waitlist-only. Explicitly calls out the problem: "Your collection is in ManaBox. Your decks are in Moxfield. They don't talk to each other." Includes AI advisor and collection-aware building.
- **[ManaTrove.app](https://manatrove.app/)** — Collection tracker with per-printing tracking, group cards into named collections (one per deck, binder, or box). Focused on value tracking more than allocation.
- **[Planeskeeper.dev](https://planeskeeper.dev/)** — "Track every card, build smarter decks, AI analysis." Mobile + web sync.
- **[ManaGate.app](http://managate.app/)** — "Handles deck building, live pricing, and the 5,000-card binder you swore you'd organize."
- **[WaxCache.com](https://www.waxcache.com/)** — Sports/TCG card management that "connects each card to the box, binder, slot, or QR label where it actually lives." Storage-location tracking for physical cards — validates The Oracle's storage feature.

None of these have shipped instance-level allocation with contention detection. Most are in beta/waitlist. The Oracle is ahead architecturally.

**Summary: Demand Strength**

| Signal | Strength | Notes |
|--------|----------|-------|
| Moxfield feature requests (8+ threads, 3+ years) | Very strong | Direct validation. Users describe The Oracle's exact features. |
| MTGSalvation threads (2011-2015, recurring) | Strong | Proves this is a perennial pain, not a fad. 10+ year old problem still unsolved. |
| Reddit r/EDH proxy discussions | Strong | 373k-member sub, proxy-for-owned recurring monthly. |
| r/mpcproxies existence (57k members) | Moderate | Indirect validation — people printing proxies because swapping is painful. |
| Moxfield "In Progress" for 3 years | Very strong | Proves the problem is hard to retrofit. Schema moat confirmed. |
| 5+ new competitors emerging (2025-2026) | Strong | Market timing is right. Multiple teams see the same gap. |
| ManaCurve.app exact overlap | Strong | Direct competitor validation — but no contention detection or instance-level fidelity. |

**Implications for launch:**
1. The problem is real, recurring, and well-articulated by users.
2. Moxfield's inability to ship "Strict Assignment" after 3+ years validates the schema moat thesis.
3. Timing is good — competitors are emerging but none have shipped instance-level allocation.
4. The Reddit post strategy should reference these existing discussions. Don't pitch cold — respond to the pain point with a solution.
5. The "proxy for cards you own" angle is the sharpest hook. 57k+ people in r/mpcproxies are solving physically what The Oracle solves digitally.

---

### Positioning

**Tagline:** "Every card has an address."

**30-second pitch:** "Archidekt tells you what's in your decks. The Oracle tells you which *specific card* is in which deck, which are proxies, which are in your binder, and which decks are fighting over the same Sol Ring. If you own physical cards and play multiple Commander decks, you've been solving this with spreadsheets. Stop."

### Target Audience (Narrowest Viable)

Commander players with 3+ decks and a physical collection worth tracking. They already use Archidekt/Moxfield for deck building but manage allocation mentally or via spreadsheets.

Signals they exist:
- Reddit threads asking "how do you track which cards are in which deck?"
- Commander Discord servers with "proxy policy" discussions
- People maintaining Google Sheets with deck/card/location mappings
- The "one of each" crowd who refuse to buy duplicates

### Channel Strategy

| Channel | Approach | Cost |
|---------|----------|------|
| **Reddit** (r/EDH, r/mtg, r/CompetitiveEDH) | Show the problem then the solution. "Here's my Sol Ring allocation across 9 decks" screenshot. Not an ad — a genuine tool share. | $0 |
| **Commander content creators** (YouTube/Twitch) | Free Collector tier to 5-10 creators with large Commander audiences. They show it during "deck tech" videos. | $0 (free accounts) |
| **Twitter/X MTG community** | Before/after: "My old spreadsheet vs. The Oracle" posts. | $0 |
| **Commander Discord servers** | Join existing communities (PlayEDH, cEDH, etc.), offer the tool when allocation questions come up. | $0 |
| **LGS partnerships** (Auckland first) | Demo at local game stores. QR code table tents. | $50 for printed materials |
| **Product Hunt launch** | One-shot visibility spike. Good for developer-adjacent audience. | $0 |

### The Chris Wilson (Path of Exile) Angle

Chris Wilson is a known Magic collector in Auckland. If you have a warm introduction path:

**The ask:** Not "use my product" — instead: "I built this for my own Commander collection. Would love 30 minutes of your feedback as someone who collects at scale. If it's useful to you, great. If not, I'd value knowing what's missing."

Why it matters:
- Social proof from a known NZ tech founder who collects MTG
- He understands building tools for niche communities (PoE was exactly this)
- If he uses it and mentions it, worth more than any paid marketing
- He may have thoughts on the "tool for collectors" vs "tool for players" positioning

Don't pitch as investor. He's a user/advisor contact.

### The Flesh and Blood Angle

Legend Story Studios (LSS) is based in Auckland. FaB has the same physical-card-management problem — possibly worse because it's a younger game with less tooling.

The Oracle's architecture is card-game-agnostic at the schema level. physical_copies, card_definitions, deck_cards don't have MTG-specific columns. The MTG-specific parts are: AI tools (EDHREC, Scryfall), format rules, and oracle_id resolution.

What a FaB version would need:
- FaB card database (replace Scryfall with FaB API or third-party)
- FaB-specific deck rules (hero, equipment slots, pitch values instead of mana)
- New AI tool integrations
- Same allocation, same instance tracking, same contention detection

Strategy: Build the MTG version first, prove the model, then approach LSS with: "We solved physical card allocation for Commander. Want us to build the same thing for FaB?" Partnership conversation, not competitor.

---

## 6. Defensive Positioning

### What Happens When Archidekt Adds "Allocation"

They will — eventually. But their structural disadvantage is:

1. **Quantity-based schema.** They track "you own 3 Sol Rings" not "Sol Ring #1, #2, #3." Adding instance-level tracking is a schema-level breaking change — migrating millions of users' data from aggregated quantities to individual rows. This is 6-12 months of work even if they started today.

2. **Multi-user first.** Their architecture optimizes for public deck sharing and social features. Adding per-instance physical tracking to a system designed for "how many do you own" is genuinely hard.

3. **AI is additive, not structural.** If they add AI deck building, it doesn't change the fundamental gap (they can't tell you WHICH Sol Ring is in WHICH deck).

**Your moat is the schema decision.** Instance-level tracking is an architectural bet that's expensive to retrofit and cheap to build fresh.

### What You Can't Defend

- AI features (replicable with API partnerships)
- Pricing data (same APIs available to everyone)
- Deck stats/charts (commoditized)

### What IS Defensible

- Instance-level fidelity (schema moat)
- The allocation model (Claimed/Picklist/Playable — all derive from instance-level)
- Speed of iteration as a solo developer with AI tooling
- NZ-based community access (LGS, LSS, Chris Wilson network)

---

## 7. Goldfishing — Minimum Viable Scope

| Feature | Effort | Notes |
|---------|--------|-------|
| Shuffle deck (virtual) | Small | Random permutation of 100-card list |
| Draw opening 7 | Small | Display 7 cards from the top |
| Mulligan (London — draw 7, put N back) | Medium | "Put back" UI needed |
| Draw step (draw 1) | Small | Next card from library |
| Play card (move to "battlefield" zone) | Medium | Click/drag to zone |
| Tap/untap | Small | Toggle state on battlefield cards |
| Life counter | Small | +/- buttons |
| Card zones (hand, battlefield, graveyard, exile, command zone) | Medium | Zone management UI |

**Total estimate: 2-3 weeks for functional goldfish mode.**

What you DON'T need for MVP:
- Rules enforcement (player manages their own game state)
- Multiplayer (it's solitaire by definition)
- Mana tracking / auto-tap
- Triggered abilities / stack
- AI opponent

Architecture: Entirely client-side. No database writes, no server calls (except loading the deck list). Pure React state machine with card zones.

---

## 8. Near-Term Roadmap (Personal-Use-First — supersedes the timeline below)

**Direction confirmed 2026-07-15:** this started as a personal tool, a friend independently confirmed the same pain points, and paid multi-user is now a real possibility — but not a scheduled one. Priority is getting the tool right for personal use first, without foreclosing multi-user/paid later. Stay compatible, don't build the infrastructure yet.

**Guiding rule:** every new or modified database query stays scoped by `user_id`, as a standing convention — cheap now, and it's the only thing that actually prevents new isolation debt while other work continues. No dedicated RLS retrofit, billing integration, or usage-metering build is scheduled. When the decision to open signups is made, the RLS retrofit is smaller than Section 3 implies — migration 003 already created the policies, the work is switching to a user-scoped client and verifying them, not building RLS from scratch.

### Phase 1 — In progress

| Item | Status |
|------|--------|
| Card allocation & storage redesign (interactive status chips, Storage nav, deck/card/storage action matrix, Picklist stub replacement) | Complete — all 17 tasks delivered, release gate passed (2026-07-15) |

### Phase 2 — Next up (small, mostly wiring, not new build)

| Item | Why |
|------|-----|
| Consolidate/delete dead code surfaced by the card-allocation work (see Section 11) | Prevents building further on duplicated or broken foundations |
| Wire `MissingToggle`/`MissingCopyRow` into the Collection page | Fully built, zero consumers — the taxonomy-rename work's "Show Missing" toggle was never actually connected |
| Wire `StorageLocationsSettings` into Settings (or the new Storage nav) | Fully built, working CRUD against a real API — currently unreachable by any route |
| Wire `DecisionCard` and `ExplorationArchive` into the live Brew Canvas | Both already built; `BrewCanvas.tsx` has two literal placeholder comments waiting for them — a likely concrete contributor to "brew is clunky" |

### Phase 3 — Brew process refinement

Broader pass beyond the two-component wiring fix above. Scope not yet defined — needs real use to identify what's clunky beyond the two known gaps.

### Phase 4 — Net-new product work, prioritized by personal value over acquisition value

| Item | Notes |
|------|-------|
| System-wide AI, single entry point | Five non-brew AI endpoints already exist (recommend, build-deck, deck-scan, search, mana-analysis) plus Debrief — consolidation/exposure, not new AI capability |
| Goldfishing | Scope already defined in Section 7 — estimate unchanged at 2-3 weeks |
| Buylist / sell-to-vendor comparison | Genuinely net-new — confirmed no buylist or sell-side code exists anywhere |
| Onboarding/migration refinement + walkthroughs | Deprioritized below the above — primarily benefits future users joining later, not current personal use |

### Ongoing hygiene, not phase-gated

- Rate limiting on AI endpoints — cost-control hygiene given AI surface is expanding either way; worth doing soon, not a blocker for anything above
- `user_id` scoping convention on all new/modified queries (see Guiding rule above)

### Deferred until an explicit decision to open signups — not scheduled, not abandoned

- RLS retrofit (Section 3)
- Billing integration, Terms of Service / Privacy Policy, usage-metering system
- Mobile responsive pass, error/uptime monitoring, soft launch, public launch, marketing execution (Sections 5, 6, 9, 10 remain valid — just not active work)

---

### Original 8-week public-launch timeline (superseded, kept for reference)

| Phase | Duration | Focus |
|-------|----------|-------|
| **Now + 2 weeks** | Phase A: Interactive chips + reassignment |
| **+2 to +4 weeks** | Goldfish MVP + format legality |
| **+4 to +5 weeks** | Mobile responsive pass + rate limiting + monitoring |
| **+5 to +6 weeks** | Landing page + soft launch (10-20 invites) |
| **+6 to +8 weeks** | Bug fixes from soft launch + stability hardening |
| **+8 weeks** | Public launch (Reddit, Product Hunt, creator outreach) |

Original assumptions: building full-time with AI tooling, goldfishing MVP-scoped, don't block on multi-user RLS, Chris Wilson/LSS conversations in parallel. Superseded by the phased plan above, not deleted — the goldfish scope and RLS-deferral instinct were already right.

---

## 9. Launch Checklist (deferred — revisit when launch is actually scheduled)

### Pre-Launch

- [ ] Goldfish/playtesting feature (draw 7, mulligan, draw step, zones)
- [ ] Format legality indicator on deck detail
- [ ] Mobile responsive pass (Cards Tab, Decks Grid, Collection)
- [ ] Rate limiting on AI endpoints
- [ ] Error monitoring (Sentry free tier)
- [ ] Uptime monitoring
- [ ] Terms of Service + Privacy Policy
- [ ] Vercel Pro upgrade
- [ ] Supabase Pro upgrade
- [ ] Landing page with waitlist

### Soft Launch (10-20 Users)

- [ ] Invite Commander players from local pod/LGS
- [ ] Monitor: import success rate, AI cost per user, error rates
- [ ] Collect feedback on allocation model
- [ ] Fix bugs from real usage
- [ ] Performance under multi-user load

### Public Launch

- [ ] Reddit post (r/EDH) — show, don't pitch
- [ ] Product Hunt listing
- [ ] Content creator outreach
- [ ] Chris Wilson intro (if available)
- [ ] Discord presence

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Archidekt adds basic allocation | Medium (6-12mo) | Medium | Ship first, build switching cost via data depth |
| Scryfall API rate limiting / changes | Low | High | Cache aggressively, implement fallback sources |
| AI costs spiral with user growth | Medium | Medium | Per-user daily caps, usage-based pricing tier |
| Chris Wilson says no | Medium | Low | Multiple marketing channels, don't depend on one person |
| Single-user architecture limits growth | High (by design) | Medium | Launch single-tenant, RLS work after product-market fit |
| FaB partnership doesn't materialise | Medium | Low | FaB is upside, not core strategy |

---

## 11. Codebase Audit Findings (2026-07-15)

Surfaced while designing the card-allocation redesign. One correction to Section 3, plus a full dead-code inventory.

### Correction to Section 3

`allocation-resolver.ts`/`allocation-store.ts` aren't mentioned in Section 3, but a prior tech-debt note (Shared Cards V2 delivery log) flagged them as having "4+ consumers, separate cleanup." That undersold the problem: they write to `deck_allocations`, which migration 010 made read-only. Any remaining consumer is calling a function whose writes silently no-op — this is effectively dead code, not open tech debt, just not yet confirmed and deleted.

### Confirmed dead, safe to delete (pending a final grep-sweep verification pass — same discipline as the taxonomy-rename release gate, don't skip it)

| File(s) | Why |
|---|---|
| `allocation-resolver.ts`, `allocation-store.ts` | v1 — broken, writes to a read-only table |
| `allocation-resolver-v2.ts`, `allocation-store-v2.ts` | v2 — never wired in; only referenced by stale `vi.mock()` calls in two test files for a code path that no longer exists |
| `Picklist.tsx` | Standalone, never imported — more complete than the live embedded version (real undo, real Tier 4 confirmation) — should be swapped in, not deleted, see Gene's card-allocation brief |
| `DeckListTable.tsx` | Only referenced by a test file |
| 14 top-level panel components: `OverviewPanel`, `StrategyCanvas`, `RecommendationsPanel`, `ManaCurvePanel`, `ManaAnalysisPanel`, `DeckStats`, `HealthBar`, `CategoriesPanel`, `PreconDiffPanel`, `UpgradePanel`, `AllocationTab`, `AllocationFailureBanner`, `DeckImportModal`, `DeckScanPanel`, `ThemeToggle` | Confirmed superseded by the five-tab consolidation (`CardsTab`/`AnalysisTab`/`CombosPanel`/`UpgradeTab`/`StrategyTab`) — checked directly against the live import list in `decks/[id]/page.tsx` |
| 4 `components/collection/*` files: `CollectionListView`, `LocationFilter`, `RollupView`, `UsedByCell` | Likely superseded by live `CollectionGridView`/`CollectionToolbar` |
| 6 `lib/*.ts` files: `collection-utils.ts`, `rating-store.ts`, `upgrade-strategy-data.ts`, `price-refresh.ts`, `brew-v2-categories.ts`, `brew-validators.ts`, `concurrency-limiter.ts` | No consumers found; `upgrade-strategy-data.ts` likely superseded by live `upgrade-candidates.ts`/`upgrade-pairing.ts` |

### Needs wiring, not deleting (see Phase 2, Section 8)

`MissingToggle.tsx`, `MissingCopyRow.tsx`, `StorageLocationsSettings.tsx`, `DecisionCard.tsx`, `ExplorationArchive.tsx`.

### Needs a judgment call before either fate

7 files in `components/brew-v2/` with no placeholder marker pointing to them, unlike `DecisionCard`/`ExplorationArchive` above: `CandidateCard.tsx`, `CardRow.tsx`, `CardTooltip.tsx`, `ConceptTile.tsx`, `DeckListTab.tsx`, `InlineAssessment.tsx`, `SuggestionsTab.tsx`. Likely earlier exploratory drafts, not confirmed unfinished work — worth a skim before deciding to delete or resume.
