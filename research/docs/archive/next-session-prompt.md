# Next Session Prompt for @Gene

## Context

The Oracle is a Commander MTG deck management web app (Next.js 16 App Router, Supabase, TanStack Query, Tailwind, shadcn/ui). Deployed on Vercel at `oracle-alpha-two.vercel.app`. Supabase project: `udocxsyzzvrceiuupprj`.

Key docs:
- Product spec: `specs/product-spec.md`
- User guide: `docs/user-guide.md`
- Tech debt register: `specs/tech-debt-register.md`
- Card scanning spec: `specs/card-scanning/`
- Card scanning research: `docs/card-scanning-research.md`

## What was shipped in the last session (2026-07-22)

### Scanner improvements
- **Perspective correction** (`src/lib/scanner/perspective.ts`) — edge detection + bilinear flatten before hashing
- **Hash DB rebuild** — script updated to use `normal` (full card face) images instead of `art_crop`. Build was running at end of session (~22% done, ~2.5 hours remaining)
- **Debug overlay** — green text in bottom-left showing DB status, match results, distances
- Scan pipeline now: capture → extract guide region → frame buffer → perspective flatten → dHash → LSH match

### Price tracking MVP
- `purchase_price_usd` + `purchased_at` columns on physical_copies
- `/api/collection/value` — total market value, gain/loss, top 10 cards
- `CollectionValueBanner` component on collection page
- `/api/collection/refresh-prices` — batch refresh from Scryfall
- Purchase price auto-set during scan confirm

### PWA
- `manifest.json` with standalone display, theme color, icons
- Apple web app meta tags
- App is installable to home screen

### Other
- Mobile hamburger menu (slide-out drawer)
- Storage → Binders rename (UI only)
- Printing picker (visual grid, owned highlighted with location, search by set)
- Alternate badge state (available vs alternate printing distinction)
- Safe-area-inset fix for iOS address bar

## What needs to happen next

### 1. CRITICAL: Check hash DB build and commit (5 min)

The hash DB rebuild was running at session end. Check if it finished:
```bash
ls -lh the-oracle/public/scan/hash-db.json
# Should be ~7-8MB if complete
# Check entry count:
python3 -c "import json; d=json.load(open('the-oracle/public/scan/hash-db.json')); print(f'{len(d)} entries')"
```

If it's done (53,699 entries), commit and push:
```bash
cd the-oracle
git add public/scan/hash-db.json
git commit -m "data: hash-db rebuilt with full card images (fixes scanner matching)"
git push origin main
```

If it's NOT done or was interrupted, resume:
```bash
cd the-oracle
npx tsx scripts/build-hash-db.ts --resume
```

### 2. Test scanner end-to-end (30 min)

Once the new hash DB is deployed, test with a real card:
- Navigate to /scan on a phone
- Wait for debug text to show "DB ready: 53699 cards"
- Hold a card in the guide frame
- Debug text should show "Best: [Card Name] (d=X)" — distance should be <8 for a match
- If matching works: screen flashes, card name appears. Success!

**If still not matching well:**
- Check the distances in debug text. If they're 10-14, perspective correction is helping but not enough — may need to loosen threshold to 12
- If distances are 20+, the perspective flatten isn't working for your setup — may need to try a different approach (server-side matching or switch to embedding model)

### 3. Remove debug overlay (5 min)

Once scanner is confirmed working, remove the green debug text from ScannerViewfinder (the `debugInfo` state + display).

### 4. Price tracking polish

- Add a "Refresh Prices" button in the collection page header (calls `/api/collection/refresh-prices`)
- Consider Vercel Cron to auto-refresh daily (add to `vercel.json`)
- Purchase price is currently only set on scan — should also set on CSV import

### 5. Scanner V2: Verify/Sync mode

The second scan mode (compare physical deck against Oracle's records) is specced but not built. This is the next major feature.

## Architectural notes

- Supabase admin client bypasses RLS — all server queries use `createAdminClient()`
- TanStack Query key for deck data: `['decks', deckId]` where deckId is STRING from URL params. Always invalidate both string and number variants.
- Card slot statuses: `'original' | 'proxy' | 'available' | 'alternate' | 'claimed' | 'unowned' | 'generic_land'`
- Deck statuses: `'brewing' | 'in_rotation' | 'graveyard'`
- Scanner pipeline: camera → guide crop → frame buffer (median composite) → perspective flatten → dHash → LSH lookup → confidence check → auto-accept or manual fallback
- Hash DB: 53,699 entries, dHash of full card `normal` images from Scryfall
- Delivery log hook fires on Stop — checks delivery log, tech debt, product spec, steering, AND user guide

## Known issues (tech debt)

- **TD-017** (HIGH): Hash DB matching accuracy — perspective correction added but untested with the new full-card DB. May need threshold tuning.
- **TD-016** (MEDIUM): Query key string/number fragility — recommend `useDeckQueryKeys()` hook
- **TD-012-014**: Undo, Add Proxy, and Mark-as-Missing non-atomic writes (lower priority)
