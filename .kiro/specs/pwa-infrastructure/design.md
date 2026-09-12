# Design: PWA Infrastructure

> Last updated: 2026-07-22
> Status: Final
> Reference implementation: `public/manifest.json`

## Design Goals

- Native-like mobile experience
- Easy installation from browser
- Proper iOS safe area handling
- Consistent dark theme branding

## Manifest Configuration

```json
{
  "name": "The Oracle",
  "short_name": "Oracle",
  "description": "MTG Commander Deck Manager",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0A0A0B",
  "theme_color": "#0A0A0B",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## Mobile Navigation

### Hamburger Menu

```tsx
// Shown when viewport < 768px
<MobileHeader>
  <Logo />
  <HamburgerButton onClick={openDrawer} />
</MobileHeader>
```

### Slide-Out Drawer

```tsx
<Drawer side="right">
  <DrawerContent>
    <nav>
      <NavLink to="/decks">Decks</NavLink>
      <NavLink to="/allocation">Cards</NavLink>
      <NavLink to="/collection">Collection</NavLink>
      <NavLink to="/new-deck">Brew Deck</NavLink>
      <NavLink to="/settings">Settings</NavLink>
    </nav>
    <SignOutButton />
  </DrawerContent>
</Drawer>
```

## iOS Safe Areas

```css
/* Top safe area (notch/dynamic island) */
padding-top: env(safe-area-inset-top);

/* Bottom safe area (home indicator) */
padding-bottom: env(safe-area-inset-bottom);
```

## Key Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| No service worker | Yes | Full offline | Complexity not justified for single-user |
| Right-side drawer | Yes | Left-side | Right thumb reach on mobile |
| 768px breakpoint | Yes | 640px | Matches Tailwind md breakpoint |

## Components

- `MobileHeader.tsx` — Hamburger menu header
- `Sidebar.tsx` — Desktop sidebar (hidden on mobile)
- `layout.tsx` — Responsive layout switching

## Provenance

- Authored: 2026-07-22
- Shipped: 2026-07-22
