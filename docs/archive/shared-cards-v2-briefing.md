# Shared Cards / ProxyAllocationPanel → V2 — Prep Briefing for Gene

> Status: prep only — do not start this with Gene until the taxonomy rename has shipped and been verified. This document exists so the next piece of work is ready to hand over immediately, not so two features run in parallel.

## 1. What's already decided (real, from `docs/refactoring-audit.md`, Q2 / Phase 2)

Migration confirmed. Once done, delete: `src/lib/allocation.ts`, `src/lib/allocation-resolver.ts`, `src/lib/allocation-store.ts`, `src/lib/collection-reallocator.ts`, `src/app/api/proxy-allocate/route.ts`, and drop the `proxy_allocations` table.

## 2. What I found checking the actual code — this changes the shape of the work

The audit doc's framing ("two non-reconciled views of the same data") is *directionally* right but not precisely right, and the precision matters for scoping. I read the live files:

**`/api/shared-cards` (the main data route) is already substantially V2.** It queries `deck_cards` and `physical_copies` directly — not `proxy_allocations` — to compute which cards appear in 2+ decks, owned counts, and per-printing/per-deck breakdowns. This is not legacy code sitting untouched; someone already migrated the core listing.

**One real bug in that already-migrated route, worth fixing as part of this work:** it determines whether a deck's copy is a proxy by string-matching `"proxy"` inside the `tags` field (`(tags.get(id) || '').toLowerCase().includes('proxy')`), rather than reading `deck_cards.ownership_status` directly. That's a fragile, indirect signal for something the schema already states cleanly. Once the taxonomy rename lands (ownership becomes a clean `'original'` / `'proxy'` value via `card-status.ts`), this should be swapped to read that directly.

**`ProxyAllocationPanel.tsx` is the actual legacy piece**, and it does something narrower than instance-level reallocation: it's a per-**card-name** "which deck gets Original, which get Proxy" role toggle — radio buttons per deck, writing to `proxy_allocations` via `POST /api/proxy-allocate` → `commitAllocation()` in `allocation.ts`. It has no concept of a specific physical copy moving between decks — it's a labeling decision, not a reallocation. The button is literally labeled "Apply to Archidekt," but the write-back to Archidekt itself is dormant (per the route's own guard comment, referencing the `deck-authority-split` spec) — today it only writes `proxy_allocations` locally.

## 3. The actual recommendation — don't design this from scratch

The taxonomy work currently in progress already solved the real underlying need here. Per its delivery log, Dieter designed a **Picklist Claimed row** with Tier 3 (no confirmation) / Tier 4 (confirmation modal) / Tier 5 (print proxy) interaction patterns for moving a specific physical copy from one deck to another, with both decks' Playable/Unplayable state recomputing immediately — this is a strict superset of what `ProxyAllocationPanel` does today, and it operates at the correct level (physical copy instance) instead of the wrong one (card name + role label).

**Recommendation to put to Marty:** don't spec a new interaction for Shared Cards V2. Spec it as: replace `ProxyAllocationPanel`'s role-toggle UI with the same Claimed-detection and Tier 3/4/5 picklist pattern already built for taxonomy, reusing the same component (`CardSlotBadge` per the taxonomy delivery log) rather than inventing a parallel one. The Shared Cards page's job becomes surfacing contention (which it already does, via the real `/api/shared-cards` route) and linking into the same reallocation mechanism the Picklist uses — not maintaining its own separate allocation UI and write path.

This should shrink the scope of Phase 2 considerably from what the audit doc implied — it's much more "delete the old panel and route, wire the existing Picklist pattern in its place" than "design and build a new reallocation UI."

## 4. Resolved since first draft

- **Archidekt write-back: removed.** Decision made — don't expect users to keep two sources of truth in sync. This means, beyond the Phase 2 deletion list in Section 1: also delete `/api/shared-cards/allocations` and `/api/shared-cards/allocations/preview` (both exist solely to surface `proxy_allocations`' `written_to_archidekt`/`written_at`/`assigned_at` fields), and drop that tracking entirely rather than porting it anywhere. Worth a quick check of the `deck-authority-split` spec (`.kiro/specs/deck-authority-split/`) since the dormant guard comment in `proxy-allocate/route.ts` references its Requirements 6.1/6.2 — confirm whether closing this out also closes something open in that spec, or whether it's unrelated.
- **"Role" — fully redundant, not carried forward.** It's V1's per-card-name "which deck has the Original" declaration, a workaround for not having instance-level tracking. `deck_cards.ownership_status` already does this correctly, per slot, per deck, without a manual declaration. No aggregation or summary view is needed on top of the taxonomy's per-slot Original/Proxy states — Role simply has no V2 equivalent to design, because the thing it worked around no longer exists.

## 5. Still open

- None on the product side. The remaining unknowns are Margaret's to confirm during architecture (exact deletion list completeness, whether `deck-authority-split` needs a follow-up), not further product decisions.

## 5. When to actually start this

Only after taxonomy has shipped, been verified against its release gate, and closed out in `product-spec.md` / `tech-debt-register.md`. At that point, hand this document to Gene alongside the finished taxonomy spec as prior art — Dieter and Margaret should be pointed at the taxonomy `design.md`'s Picklist/Claimed sections directly, not asked to redesign the same interaction.
