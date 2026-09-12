# Card Scanning Research & Implementation Plan

## How existing scanners work

### The three recognition approaches

Based on research into ManaBox, TCGplayer (Roca Vision), TCGSync, and open-source implementations, card recognition uses three fundamental approaches — often combined:

**1. Perceptual hashing of artwork region**
- Extract the artwork rectangle from the camera frame (known position relative to card edges)
- Compute a perceptual hash (pHash, dHash, or average hash) — a 64-256 bit fingerprint that captures visual structure while being tolerant to brightness/contrast changes
- Compare against a pre-computed hash database of all ~100K unique card artworks
- Hamming distance determines match quality — under 10 bits difference = strong match
- **Strengths:** Fast (O(1) lookup with locality-sensitive hashing), works offline, tolerant to minor color shifts
- **Weaknesses:** Cannot distinguish set/printing when same artwork is reused across sets (Lightning Bolt has 30+ printings with same art)

**2. OCR on card text regions**
- Extract the card name region (top of card) and collector number region (bottom left)
- Run OCR (Tesseract, Azure Computer Vision, or a custom model)
- Card name → fuzzy match against Scryfall card database
- Collector number + set code → exact Scryfall lookup via `/cards/{set}/{collector_number}`
- **Strengths:** Definitively identifies the exact printing (set + collector number)
- **Weaknesses:** Foil glare often obscures text; OCR on small text at phone-camera angles is unreliable; non-English cards need multilingual support

**3. Deep learning feature embeddings (modern approach)**
- Feed the full card image (or artwork region) through a CNN/ViT model trained on card images
- Output is a dense embedding vector (512-2048 dimensions)
- Nearest-neighbor search against an index of all known printings
- Models: CLIP, fine-tuned ResNet/EfficientNet, or custom architectures
- **Strengths:** Can distinguish printings by frame design, set symbol, collector number position — not just artwork. Most robust to distortion.
- **Weaknesses:** Requires model hosting (or client-side ONNX/TF.js inference), larger initial payload, needs training data

### What ManaBox specifically does

From ManaBox's documentation and observed behavior:
- **Art-based detection:** "The scanner detects cards using the art" (confirmed in their FAQ)
- **Set disambiguation as a second step:** when multiple printings share artwork, the user taps the set icon to select the correct one, OR they can "lock" to a specific set
- **No explicit OCR mentioned** — they rely on artwork matching with manual set disambiguation
- This is a pragmatic choice: artwork matching is fast and works well for ~90% of cards. The remaining 10% (reprints with identical art) need manual selection.

### What TCGplayer/Roca Vision does

From TCGplayer's documentation:
- **Full-card visual recognition** (not just artwork) — powered by Roca Vision, which has processed 700M+ cards
- **Confidence scoring:** GOOD (~100%), FAIR (~98%), POOR (likely wrong)
- **Known weaknesses:** special foils (surge, etched, confetti), basic lands, tokens, reprints across similar sets, non-English cards, stamped promos, Alpha/Beta cards
- **Requires flatbed scanning or dedicated ADF scanner** — not a phone camera app (they recommend Ricoh fi-8170 ADF scanner)
- This is an enterprise/merchant solution, not consumer-grade phone scanning

### TCGSync's multi-engine approach

TCGSync bundles three recognition engines:
1. **TinEye** — reverse image search; best for "is this the same physical card" verification
2. **Ximilar** — visual AI for product recognition; good at set disambiguation
3. **Their own TCG engine** — optimized for messy real-world scans (angled, glare, partial occlusion)

Key insight: they argue these are three different problems, and one engine optimized for all three is worse at each than three specialized engines.

---

## The foil card problem

### Why foils are hard

Foil cards have a holographic metallic layer beneath the printed ink. This creates:

1. **Specular highlights** — mirror-like reflections that completely obscure portions of the image under any direct light source
2. **Color shifting** — the metallic layer causes the perceived colors to shift depending on viewing angle (iridescence)
3. **Reduced contrast** — the foil substrate reduces the contrast between ink and background, making text and art boundaries less distinct
4. **Non-uniform distortion** — different card regions may have different amounts of glare depending on the card's curvature and the light angle

### How existing apps handle foils

- **ManaBox:** Relies on artwork detection. Since artwork is printed ON TOP of the foil layer, the artwork region is less affected than the border/text. Works reasonably well if the user avoids direct glare on the artwork area. User can tilt the card to find an angle without glare.
- **TCGplayer/Roca Vision:** Explicitly lists "special foils (surge foils, etched foils, confetti foils)" as challenging. Regular foils work OK because the card frame structure is still visible. Special foils with different texturing patterns are harder.
- **User guidance:** TCGplayer recommends "scan at a 45 degree angle or press the flash symbol" — angling reduces specular reflection.

### Approaches to handle foils

**A. Preprocessing — specular highlight detection and masking**
- Detect oversaturated/white pixels in the camera frame (threshold > 240 on all channels)
- Mask those regions before computing the hash/embedding
- Only match against non-masked portions of the artwork
- Trade-off: reduces matching information, but prevents false matches from glare

**B. Multi-frame capture**
- Capture 3-5 frames while the user holds the card
- Natural hand movement shifts the glare position between frames
- Composite the frames by taking the median pixel value at each position — this eliminates transient specular highlights while preserving the stable card image
- This is the most effective approach for phone cameras

**C. Polarization-aware guidance (simple)**
- Guide the user to tilt the card slightly: "Tilt card away from light source"
- The UI shows a real-time glare indicator (percentage of frame that's oversaturated)
- Only capture when glare falls below a threshold

**D. Focus on artwork region only**
- The artwork is the least affected by foiling because it's printed on top
- Crop to just the artwork rectangle for matching
- Accept that set disambiguation requires OCR of the collector number (harder on foils) or manual selection

**E. Foil-specific model fine-tuning**
- Train the embedding model on foil card images specifically
- Include foil variants in the training set so the model learns to look past the holographic layer
- Pair with non-foil versions of the same card during training (contrastive learning)

### Recommended foil strategy for The Oracle

**Primary:** Multi-frame median compositing (B) + artwork-region focus (D)
**Secondary:** Specular highlight masking (A) as a fallback
**User experience:** Show a real-time quality indicator and guide the user to reduce glare before capture

---

## Implementation plan for The Oracle

### Architecture decision: client-side vs server-side

| Factor | Client-side (browser) | Server-side (API) |
|--------|----------------------|-------------------|
| Latency | Instant (no network) | 200-500ms per card |
| Offline use | Works at LGS with bad WiFi | Requires network |
| Model size | 10-50MB initial download | No client download |
| Accuracy | Limited by mobile hardware | Can use larger models |
| Cost | Zero marginal cost | Compute cost per scan |
| Privacy | Card images never leave device | Images sent to server |

**Recommendation:** Hybrid approach
- **Client-side** for card detection (finding the card rectangle in the frame) and perceptual hashing (fast ~90% match)
- **Server-side** for disambiguation and OCR fallback (collector number extraction for exact printing)

### Phase 1: MVP (art-hash matching in browser)

**Goal:** Identify the card name from camera feed. Accept manual set selection for reprints.

**Stack:**
- `navigator.mediaDevices.getUserMedia()` for camera access
- Canvas API for frame extraction and image processing
- Client-side perceptual hash computation (pHash in JavaScript — ~5ms per frame)
- Pre-built hash database from Scryfall bulk data (artwork hashes, ~2MB compressed)
- Locality-sensitive hashing (LSH) for sub-millisecond database lookup

**Flow:**
1. User opens scanner → camera feed starts in a viewfinder
2. Every 200ms: extract frame → detect card rectangle (edge detection) → crop to artwork region
3. Compute pHash of artwork → LSH lookup → top-5 candidates by Hamming distance
4. If top candidate distance < threshold AND next-best is significantly worse → auto-match
5. If ambiguous (multiple printings, same art) → show set picker
6. On match: create `physical_copies` row via existing import API

**Card rectangle detection (client-side):**
- Look for the card's rounded rectangle shape against a contrasting background
- Approach: Canny edge detection → contour finding → approximate polygon → perspective warp to standard orientation
- Alternative: train a lightweight object detection model (YOLOv8-nano, ~3MB) to find the card bounding box
- Simplest MVP: just guide the user to align the card within a fixed frame overlay (like a credit card scanner)

**Hash database build script:**
- Download Scryfall bulk data (all printings with artwork)
- For each printing: crop to artwork region (known pixel coordinates per card frame era) → compute pHash
- Store as: `{ scryfall_id, card_name, set_code, collector_number, pHash }`
- Compress with gzip → serve as static JSON (~2-4MB)
- Update monthly when new sets release

### Phase 2: OCR for exact printing (server-side)

**Goal:** Automatically determine set + collector number to identify exact printing.

**Stack:**
- Server-side OCR endpoint (Supabase Edge Function or Next.js API route)
- Tesseract.js (runs in Deno on Edge Functions) or Google Cloud Vision API
- Region extraction: crop the bottom-left area of the card (collector number region)

**Flow:**
1. After Phase 1 identifies the card name → client sends cropped collector-number region to server
2. Server runs OCR → extracts text like "042/271" or "42"
3. Combined with set symbol recognition (the expansion symbol icon) → exact printing identified
4. Return Scryfall ID for the specific printing

**Collector number region:**
- Post-2003 modern frame: bottom-left corner, format `{number}/{total} · {set_code} · {language} · {rarity}`
- The three-letter set code + collector number uniquely identifies a printing
- Scryfall endpoint: `/cards/{set}/{collector_number}` gives exact match

### Phase 3: Foil handling + multi-frame

**Goal:** Reliably scan foil cards without manual intervention.

**Implementation:**
1. **Glare detection overlay:** Compute per-frame glare percentage (pixels above saturation threshold). Show red/yellow/green indicator.
2. **Multi-frame compositing:** Buffer 5 frames over 1 second. Median-filter them to remove transient specular highlights. Use the composited image for hash matching.
3. **Adaptive region selection:** If the artwork region has >15% glare pixels, fall back to OCR of the card name (top region) + collector number (bottom).
4. **Foil flag detection:** If the card's surface shows characteristic iridescent color shifts across frames → set `is_foil: true` on the resulting physical_copies row.

**Detecting foil vs non-foil:**
- Compare color channel histograms across multiple frames at slightly different angles
- Foil cards show significantly more variation in hue distribution between frames
- Non-foil cards show stable color distribution across frames
- This gives us the foil flag without asking the user

### Phase 4: Batch scanning mode

**Goal:** Scan a stack of cards rapidly (ManaBox-style continuous feed).

**Implementation:**
- Continuous capture mode: process every frame, auto-detect when a new card enters the viewfinder
- Visual/audio feedback on each successful scan (sound cues at price thresholds, like ManaBox)
- Card change detection: compare current frame's hash to previous match — if Hamming distance exceeds threshold, a new card is present
- Auto-add to collection or deck (user selects target before starting batch scan)

---

## Integration with The Oracle

### Data flow

```
Camera → Card Detection → Artwork Crop → pHash Match
                                            ↓
                              Card identified (oracle_id)
                                            ↓
                              Set picker (if ambiguous) OR OCR fallback
                                            ↓
                              Exact printing (scryfall_id)
                                            ↓
                              ensureCardDefinition() + create physical_copies
                                            ↓
                              Collection updated → Picklist recalculates
```

### UI placement

- **Collection page:** "Scan cards" button next to the existing "Import CSV" button
- **Deck page (Cards tab):** "Scan to add" option in the AddCardSearch area
- **Standalone scanner page:** `/scan` route for batch scanning sessions

### Existing infrastructure leverage

- `ensureCardDefinition()` — already handles oracle_id → card_definitions upsert
- `physical_copies` insert — same as collection CSV import creates
- Scryfall bulk data — already seeded in `oracle_to_printings` table
- `useCollectionRollup` / `useCollectionPrintings` — already invalidated after imports

### Technical risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Hash database size too large for mobile | Use LSH with bucket-based lookup; compress aggressively; lazy-load per-set |
| Camera API inconsistencies across browsers | Use existing `getUserMedia` polyfills; test on Safari iOS specifically |
| Low-light LGS environment | Guide user to use phone flash as fill light; increase ISO sensitivity |
| Cards in sleeves | Sleeve reflection is another glare source — multi-frame compositing helps |
| Borderless/full-art cards | Different artwork crop coordinates per frame era; detect frame type first |
| Double-faced cards | Scan back face → match → prompt "flip to scan other side?" |

### Estimated effort

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1 (MVP) | Camera + pHash + hash DB + basic UI | 2-3 weeks |
| Phase 2 (OCR) | Server-side OCR + set disambiguation | 1-2 weeks |
| Phase 3 (Foil) | Multi-frame + glare detection + foil flag | 1-2 weeks |
| Phase 4 (Batch) | Continuous scanning + auto-detect new card | 1 week |

### Build vs buy considerations

- **Ximilar** offers a TCG recognition API (paid, per-scan pricing) — could be used as Phase 2 server-side fallback while building our own
- **Scryfall image data** is free for fan projects — we can build the hash DB from their bulk download
- **TensorFlow.js** + ONNX Runtime Web allow running models client-side — no per-scan cost
- **No existing "plug and play" web SDK** for MTG card scanning exists — this would be a differentiator for The Oracle

---

## Sources

- [ManaBox Scanner FAQ](https://manabox.app/guides/scanner/faq/) — art-based detection approach
- [TCGplayer Scan & Identify](https://help.tcgplayer.com/hc/en-us/articles/27303183354007) — Roca Vision, 700M+ cards processed, confidence scoring
- [TCGSync three-engine approach](https://tcgsync.com/blog/card-recognition-three-engines) — TinEye + Ximilar + custom engine
- [GrimbiXcode/mtgscan](https://github.com/GrimbiXcode/mtgscan) — OCR collector number approach
- [hj3yoo/mtg_card_detector](https://github.com/hj3yoo/mtg_card_detector) — pHash on artwork region
- [GathererImageGatherer](https://github.com/Machine-Learning-Labs/GathererImageGatherer) — perceptual hash database builder
- [Hierarchical Adaptive Filtering Network (CVPR 2025)](https://openaccess.thecvf.com/content/CVPR2025/) — specular highlight removal for flat surfaces with text
- [takescake.com](https://takescake.com/posts/ai-vision-card-scanner-multimodal) — multimodal AI approach using Ollama/vision models

Content was rephrased for compliance with licensing restrictions.


---

## Web-only vs native app tradeoffs

### Downsides of browser-only approach

| Concern | Impact | Severity |
|---------|--------|----------|
| Camera control | No manual focus/exposure/white balance — harder to manage foil glare | Medium |
| Performance | WASM/TF.js inference 3-5x slower than native Core ML/NNAPI | Medium (fine for < 50 cards/session) |
| Batch scan rate | ~3-5 cards/sec vs 10-15 native | Low (most users scan < 50 at a time) |
| UX friction | Browser tab, permissions prompt, no home screen icon by default | Low (PWA mitigates) |
| Missing APIs | No haptics, no reliable background audio, no always-on processing | Low |
| Safari iOS | Historically slow to adopt camera features, throttles background tabs | Medium |

### Why web-first is still the right call

- Zero install friction (share a URL at LGS, anyone can scan immediately)
- Single codebase, instant deploys, no App Store review
- PWA gives home screen icon + persistent camera permissions
- The 80/20: most sessions are 10-50 cards, not 1000. Browser perf is fine at that volume.
- If demand warrants it, extract to native companion later — same API, same data model.

---

## OCR as backup verification layer

### Confidence-tiered pipeline

```
Frame captured
    |
[Stage 1: pHash match — client-side, ~5ms]
    → top candidate + Hamming distance
    |
Distance < 5   → HIGH confidence → auto-accept (unique printing)
Distance 5-12  → MEDIUM → trigger OCR verification
Distance > 12  → LOW → OCR is primary, pHash is hint
    |
[Stage 2: OCR — server-side, ~200ms]
    → Crop bottom-left (collector number region)
    → Extract: collector_number + set_code
    → Scryfall lookup: /cards/{set}/{collector_number}
    |
pHash == OCR result?  → CONFIRMED (highest confidence)
pHash != OCR result?  → OCR wins (more specific)
OCR fails (glare)?    → pHash result stands + set picker
```

### OCR hosting options

| Option | Accuracy | Latency | Cost |
|--------|----------|---------|------|
| Supabase Edge Function + Tesseract WASM | Good | ~200ms | Free (compute only) |
| Google Cloud Vision API | Excellent | ~150ms | ~$1.50/1000 calls |
| Azure Computer Vision | Excellent | ~200ms | ~$1/1000 calls |
| Client-side Tesseract.js | Fair | ~1-3s | Free |

**Recommendation:** Supabase Edge Function with Tesseract WASM for MVP (zero marginal cost, good enough accuracy on collector numbers). Upgrade to Cloud Vision if accuracy is insufficient.

### Foil-specific OCR behavior

- Artwork region (pHash) is printed ON TOP of foil layer → less affected
- Collector number region (OCR target) is bottom-left, often catches glare
- Strategy: pHash always runs. OCR is opportunistic — confirms when readable, gracefully degrades when not.
- Foil cards get `scan_confidence: 'high'` (pHash only) vs non-foils getting `scan_confidence: 'verified'` (pHash + OCR confirmed)

### Data model addition

```sql
-- On physical_copies table (or a scan_metadata sidecar)
ALTER TABLE physical_copies ADD COLUMN scan_confidence TEXT;
-- Values: 'verified' (pHash + OCR agree), 'high' (pHash confident), 'unconfirmed' (ambiguous)
```

Users can bulk-review `unconfirmed` printings later if they care about exact set attribution.


---

## Post-implementation findings (2026-07-22)

### What we learned from building and testing

**1. art_crop vs normal images — critical mismatch**

The initial hash DB was built from Scryfall's `art_crop` images (just the artwork rectangle, ~626x457). The camera captures a full card (frame + text + artwork). Even with a perfect artwork-region crop, the camera's version includes frame elements at the edges, producing completely different dHash values. Distance was 20+ for correct cards.

**Fix:** Rebuilt the hash DB using `normal` images (full card face, 488x680). Now both the DB and camera are hashing the same visual content.

**2. Perspective distortion — the real killer**

Even with matching image types, a card held in hand is never perfectly perpendicular to the camera. 5-10° of tilt was enough to change the dHash by 10+ bits (out of 64), pushing correct matches above the confidence threshold.

**Fix:** Added lightweight perspective correction:
- Scan from each edge inward to find the strongest brightness gradient (card border)
- Map the detected quadrilateral to a standard 240x336 rectangle via bilinear interpolation
- Hash the flattened image

This is not as robust as OpenCV's contour detection + `warpPerspective`, but avoids the 8MB WASM bundle. Falls back to center-crop if edge detection fails.

**3. The `detectCardPresence` gate was too strict**

The original card-presence check (edge density > 2%) blocked the matching loop entirely on many backgrounds. Removed it — the matching loop now runs continuously when the DB is loaded. The confidence threshold is the real gate.

**4. Guide rect coordinate mismatch**

The CSS guide overlay uses viewport-relative sizing (`70vw`, `aspect-ratio`), but the video uses `object-cover` which crops differently depending on device aspect ratio. Hardcoded normalized coordinates in video-frame space don't match where the guide appears visually.

**Partial fix:** Use a generous center crop (60% width, 70% height) that captures the card regardless of exact guide alignment. The perspective correction then refines the actual card position within that region.

**5. iOS Safari limitations confirmed**

- `torch` not available via `getCapabilities()` on any iOS browser (all use WebKit)
- `getUserMedia` resolution constraints are hints, not guarantees
- No programmatic focus control

### Current pipeline (as built)

```
Camera (getUserMedia 1280x720)
    ↓
Video element (object-cover display)
    ↓
Canvas: draw frame, extract center 60% × 70%
    ↓
Frame buffer: add to 5-frame ring buffer
    ↓
Median composite (removes transient foil glare)
    ↓
Perspective correction:
  - Detect card edges (gradient scan from 4 sides)
  - Flatten quad → 240×336 rectangle (bilinear interpolation)
  - Fallback: center-crop if detection fails
    ↓
Compute dHash (9×8 grayscale → 64-bit horizontal gradient hash)
    ↓
LSH lookup (8 tables × 8-bit segments, ~800 candidates checked)
    ↓
Confidence check:
  - Distance ≤ 8: confident match → auto-accept
  - Distance 9-14: possible match → show in debug/candidates
  - Distance > 14: no match
  - Ambiguity gap < 3: ambiguous → don't auto-accept
    ↓
Success: flash screen, show card name, add to session
Failure: continue scanning (200ms loop)
```

### What's still uncertain

1. **Whether perspective correction + full-card hashes is accurate enough.** The new hash DB hasn't been tested yet (was still building at session end). If distances are still 10+ for correct cards, may need:
   - Looser thresholds (12 instead of 8)
   - Better perspective correction (proper contour detection)
   - Switch to an angle-invariant matching method (average hash, or server-side embedding)

2. **Printing disambiguation.** dHash matches cards by visual appearance. Cards with the same artwork across sets will hash identically — needs OCR of collector number or set symbol as a secondary step. Currently not wired into the auto-detect flow (only available via the printing picker post-scan).

3. **Performance on low-end phones.** The perspective correction adds pixel-level computation (grayscale + gradient scan + bilinear interpolation for ~80K pixels) every 200ms. Untested on older devices. May need to reduce frame rate or skip perspective correction on low-end hardware.

### Recommendations for next iteration

- Test with the new hash DB first. If matching works at distance <8, the current approach is viable.
- If not: consider switching the hash method from dHash to pHash (DCT-based, more robust to minor geometric transforms) or aHash (even simpler, more tolerant).
- Long-term: a small CNN embedding model (e.g., MobileNetV3 fine-tuned on card images) running via ONNX Runtime Web would be the most robust approach — but requires training data and a ~5MB model download.

### Sources (additional)

- Cross-industry research compiled 2026-07-22 (TCG, sports card, document scanners)
- Key finding: every serious scanner does perspective correction before matching. Our initial version skipped this step.
- iOS Safari WebRTC limitations confirmed: no torch, no zoom, no focus control via constraints.
- OpenCV.js bundle size: ~8MB WASM. Avoided in favor of custom lightweight approach.

Content was rephrased for compliance with licensing restrictions.
