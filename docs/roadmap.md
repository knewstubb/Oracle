# Product Roadmap — The Oracle

> Last updated: 2026-07-23
> Owned by: Product Manager

---

## Collection Management

- [x] CSV import (Archidekt, Moxfield, ManaBox, generic formats)
- [x] Instance-level physical copy tracking (one row per card)
- [x] Collection grid view + list/printing view
- [x] Search and filter by name, color identity, status
- [x] Collection CSV export (full backup with all fields)
- [x] Purchase price capture on import
- [x] Market price tracking (Scryfall-sourced)
- [x] Collection value banner (total value, gain/loss, top cards)
- [x] Manual price refresh button
- [x] Daily automated price refresh (Vercel cron)
- [x] Card scanning — camera with OCR capture (parked: needs GCV API key)
- [ ] Card search → location ("Where is my Rhystic Study?" — show every copy and where it lives)
- [ ] Wishlist / "Cards I Want" (per-deck or global, triggers on collection changes)
- [ ] Trade export (cards not in any deck, formatted for Cardsphere/Deckbox)

---

## Deck Management

- [x] Import from URL (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox)
- [x] Import from pasted text (MTGA format, generic "1 Card Name" per line)
- [x] Import from CSV
- [x] Deck lifecycle: Brewing → In Rotation → Graveyard
- [x] Deck format support (Commander, Oathbreaker, Brawl, etc.)
- [x] Delete deck (releases claimed cards)
- [x] Cards tab (categories masonry, table view, status-grouped view)
- [x] Deck health strip (category thresholds)
- [x] Mana curve + color pie analysis
- [x] Combo detection (Commander Spellbook integration)
- [x] AI upgrade suggestions (EDHREC-powered cut/add pairs)
- [x] AI strategy analysis (archetype identification)
- [x] Goldfish / playtesting mode (draw, mulligan, play zones)
- [x] AI-assisted deck building (Brew mode with tool-use loop)
- [x] Post-game debrief (structured analysis + recommendations)
- [x] Precon mod tracker (budget + rarity constraints)
- [x] Deck export (clipboard, MTGA format)
- [ ] "Can I Build This?" — pre-brew feasibility check (own/steal/buy breakdown)
- [ ] Per-deck budget breakdown (total value, top expensive cards, "without X it's $Y")
- [ ] Deck comparison / diff view (vs EDHREC average or another deck)

---

## Card Allocation (Core Engine)

- [x] Five-state status taxonomy: Original, Proxy, Available, Alternate, Claimed, Unowned
- [x] Fill slot (assign free copy from pool)
- [x] Claim card from another deck
- [x] Reassign between decks (atomic RPC)
- [x] Add proxy (create proxy copy + assign)
- [x] Replace proxy with original
- [x] Unassign card (return to pool)
- [x] Mark as missing (atomic RPC, unlinks from deck)
- [x] Mark as found (return to available pool)
- [x] Picklist (3-column resolution view)
- [x] Card Management page (shared/contested cards across decks)
- [x] Status chip popovers with contextual actions
- [x] Printing picker (visual grid, owned highlighted)
- [ ] Game Night readiness view ("which decks are grab-and-go?")
- [ ] One-tap swap suggestions for shared cards

---

## Storage & Organization

- [x] Binders (named physical locations)
- [x] Assign cards to binders
- [x] View binder contents
- [ ] Proxy print sheet (printable PDF grid at card dimensions)

---

## Mobile & PWA

- [x] PWA installable (manifest, standalone, home screen icons)
- [x] Mobile hamburger menu (slide-out drawer)
- [x] iOS safe-area-inset handling (top + bottom)
- [x] Version badge (v0.2.0, bottom-left)
- [x] Camera scanner UI (shutter button, OCR pipeline)

---

## Infrastructure & Quality

- [x] Supabase Auth (PKCE flow, middleware protection)
- [x] Admin client pattern (server-only, RLS bypassed)
- [x] Atomic RPCs for multi-row writes (assign, reassign, batch assign, mark missing)
- [x] Diff-based deck reimport (preserves allocation on resync)
- [x] Vercel deployment with cron
- [x] E2E test suite (55 Playwright tests)
- [x] GitHub Actions CI pipeline
- [x] Security audit + fixes (IDOR, headers, payload limits, fail-closed auth)
- [x] Design system tokens (Figma variables pushed via API)
- [x] Proportional color bar on deck tiles (reflects mana pip distribution)
- [x] useDeckQueryKeys hook (normalized cache keys)
- [ ] Rate limiting on AI/expensive endpoints (needs Vercel KV or Upstash)
- [ ] Remove `ignoreBuildErrors: true` + fix type errors
- [ ] Migrate components to useDeckQueryKeys (incremental)
- [ ] Update stale E2E test selectors (card-management.spec.ts)

---

## Design System & UI

- [x] Custom token system (spacing, typography, colors, radii)
- [x] shadcn/ui component library (base-nova style)
- [x] Material Symbols icon set
- [x] Mana Font + Keyrune (MTG-specific icons)
- [x] Dark mode (primary theme)
- [x] Deck tile redesign: icon-only status badges, dashed brewing border, desaturated graveyard
- [x] Figma project with variables (30 colors, 7 spacing, 9 type, 5 radius)
- [ ] Figma component library (Button started, more needed)
- [ ] Code Connect (Figma → React component mapping)
- [ ] Light mode (defined in CSS but unused)

---

## Parked

| Feature | Why parked | Resume when |
|---------|-----------|-------------|
| Camera scanner (OCR) | Needs GOOGLE_CLOUD_VISION_KEY in Supabase secrets | API key configured |
| Multi-user support | Single-user app. IDOR fixes done for future-proofing. | Decision to open signups |
| Format legality checking | Low priority for casual Commander | User requests it |
| Social / deck sharing | Not needed for personal use | Decision to go public |

---

## Progress Summary

**Built:** 62 items
**Remaining:** 16 items
**Parked:** 4 items

The app is functionally complete for daily use. The remaining items are quality-of-life improvements that make existing workflows faster (feasibility check, game night view, card search, proxy sheets).
