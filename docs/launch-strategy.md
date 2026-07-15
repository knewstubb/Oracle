# The Oracle — Product Launch Strategy

> Draft: 2026-07-14
> Status: Internal planning document

---

## 1. Executive Summary

The Oracle is a physical card management system for MTG Commander players who own real collections and want to track which specific card is in which deck, which are proxied, and which are available. It's not a deck builder that happens to have a collection feature — it's a collection system that happens to build decks.

The core differentiator vs. Archidekt/Moxfield/ManaBox: **instance-level physical fidelity**. One row per physical card. Not "I own 3 Sol Rings" but "Sol Ring #1 is in Muldrotha, Sol Ring #2 is in the binder, Sol Ring #3 is a proxy in Gitrog." Nobody else does this.

---

## 2. Competitive Gap Analysis

### Feature Matrix

| Feature | The Oracle | Archidekt | Moxfield | ManaBox | Deckbox | MTGGoldfish |
|---------|-----------|-----------|----------|---------|---------|-------------|
| **Instance-level tracking** | One row per card | Quantity-based | Quantity-based | Quantity-based | Quantity | None |
| **Physical allocation** (which copy in which deck) | Per-copy FK | Per-name labels | Not tracked | Not tracked | Partial | None |
| **Proxy tracking** (which specific copies are proxies) | Per-instance is_proxy | Tag-based (fragile) | No | No | No | No |
| **Storage locations** | Per-instance FK | No | No | No | Partial (boxes) | No |
| **Contention detection** (card in 2+ decks, only 1 copy) | "Claimed" status | No | No | No | No | No |
| **AI deck builder** | Tool-use loop (EDHREC, Scryfall, Spellbook) | No | No | No | No | No |
| **AI post-game debrief** | Structured analysis + recommendations | No | No | No | No | No |
| **Deck health monitoring** | Category thresholds + strip | Basic stats | Basic stats | Basic | No | Basic |
| **Upgrade suggestions** (EDHREC-powered) | Cut/add pairs with pricing | No | No | No | No | Yes |
| **Goldfish/playtesting** | Not built | Yes | Yes | Yes (simulator) | No | Yes |
| **Mobile app** | Web only | Web | Web | Native (primary) | No | No |
| **Card scanning** (camera) | No | No | No | Yes (core feature) | No | No |
| **Social/community** | Single-user | Public decks, comments | Public decks, follows | Limited | Trading | Limited |
| **Pricing data** | Card Kingdom | Multi-source | Multi-source | Multi-source | Yes | Yes |
| **Format legality checking** | Not built | Yes | Yes | Yes | No | Yes |
| **Multi-user / sharing** | Single-user | Yes | Yes | Yes | Yes | Yes |
| **Precon mod tracking** | Budget + rarity constraints | No | No | No | No | No |
| **Import from other platforms** | Archidekt + Moxfield + CSV | N/A | Archidekt import | CSV | CSV | CSV |

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

## 8. Timeline to Public Launch

| Phase | Duration | Focus |
|-------|----------|-------|
| **Now + 2 weeks** | Phase A: Interactive chips + reassignment |
| **+2 to +4 weeks** | Goldfish MVP + format legality |
| **+4 to +5 weeks** | Mobile responsive pass + rate limiting + monitoring |
| **+5 to +6 weeks** | Landing page + soft launch (10-20 invites) |
| **+6 to +8 weeks** | Bug fixes from soft launch + stability hardening |
| **+8 weeks** | Public launch (Reddit, Product Hunt, creator outreach) |

**Conservative total: 8 weeks from today to public launch.**

Assumes:
- Building full-time (or near it) with AI tooling
- Goldfishing is MVP-scoped (no rules engine)
- Don't block on multi-user RLS (launch single-tenant first)
- Chris Wilson / LSS conversations happen in parallel

---

## 9. Launch Checklist

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
