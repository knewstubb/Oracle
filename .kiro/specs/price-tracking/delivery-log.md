# Delivery Log — Price Tracking

> Feature: Price Tracking
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-22 — Feature Shipped

**Context:** Price tracking MVP shipped with collection banner and per-card prices.

**What shipped:**
- Collection value banner: total value, gain/loss, card count, top card
- Per-card price display in all card rows (deck + collection)
- Per-deck value in header stats
- Manual "Refresh Prices" button with spinner and toast
- Daily automated cron at 10:00 UTC via Vercel
- Collection CSV export (bonus feature shipped same day)

**Decisions made:**
- Scryfall as price source (free, comprehensive)
- Prices stored on `ref_printings` for simple joins
- Gain/loss requires purchase price (optional field)
- 30-60 second refresh time acceptable

**Related:**
- Daily Price Cron
- Collection CSV Export
- Scryfall Printings Cache

**Refs:**
- Spec: `specs/price-tracking/`
- Component: `src/components/collection/CollectionValueBanner.tsx`
