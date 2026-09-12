# Delivery Log — PWA Infrastructure

> Feature: PWA Infrastructure
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-22 — Feature Shipped

**Context:** PWA installability shipped for mobile home screen access.

**What shipped:**
- `manifest.json` with app name, icons (192px, 512px), theme color
- Standalone display mode (no browser chrome)
- Mobile hamburger menu replacing sidebar on narrow viewports
- Slide-out drawer with all navigation + sign out
- iOS safe-area-inset handling (top + bottom)
- Version badge (v0.2.0, bottom-left)

**Decisions made:**
- No offline support (complexity vs. value for single-user)
- No push notifications (not needed)
- Hamburger threshold at 768px

**Refs:**
- Spec: `specs/pwa-infrastructure/`
- Manifest: `public/manifest.json`
- Component: `src/components/MobileHeader.tsx`
