# Tasks: Mobile-Friendly Views

## Phase 1: Quick Wins (CSS-only)

### 1.1 Home Page Mobile Layout
- [x] Update `page.tsx` grid to single column on mobile (`grid-cols-1` default)
- [x] Verify DeckStatusCard touch targets are 44px+ (already using flex layout with 44px min)
- [x] Make folder chips row horizontally scrollable on mobile

### 1.2 Collection Page Mobile Layout  
- [x] Default to list view on mobile (detect via CSS or viewport width)
- [x] Make `CollectionToolbar` stack vertically on mobile
- [x] Ensure search bar is full-width on mobile
- [x] Make color filter chips horizontally scrollable

### 1.3 Deck Detail Mobile Layout
- [x] Hide parallax hero on mobile (`hidden sm:block`)
- [ ] Add compact header with commander name + color pips
- [x] Hide non-essential tabs on mobile (Analysis, Strategy, Upgrade, Combos, Workbench)
- [x] Default to "Cards" tab only on mobile (reordered tabs: Cards, Pull List first)

## Phase 2: Card List Compact Mode

### 2.1 CardsTab Compact View
- [x] Add compact row variant: name + status badge only (hides mana cost, price, set, category editor, kebab on mobile)
- [x] Remove card images from list on mobile (hover preview hidden)
- [x] Add tap-to-preview: modal with card image (MobileCardPreview component)
- [x] Ensure category headers are collapsible (already working)

### 2.2 Status Badge Simplification
- [x] Create simple status indicator (●/◐/○) for mobile (MobileStatusDot component)
- [x] Replace StatusChipPopover with simple badge on mobile
- [x] Keep full popover on desktop (no change)

## Phase 3: Global Search Mobile

### 3.1 Mobile Search Access
- [ ] Add search icon to mobile header (next to hamburger)
- [ ] Make search modal full-screen on mobile
- [ ] Ensure keyboard opens automatically on focus

### 3.2 Search Results Mobile
- [ ] Compact result rows: card name, owned qty, deck count
- [ ] Tap result to view card details

## Phase 4: Polish

### 4.1 Touch Target Audit
- [ ] Audit all interactive elements for 44px minimum
- [ ] Fix any undersized buttons/links

### 4.2 Performance
- [ ] Verify LCP < 3s on 4G throttled connection
- [ ] Reduce image sizes for mobile if needed

### 4.3 Testing
- [ ] Test on iPhone SE (375px)
- [ ] Test on iPhone 14 Pro (393px)
- [ ] Test on Android (various widths)
- [ ] Test PWA installed version
