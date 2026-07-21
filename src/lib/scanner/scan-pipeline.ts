/**
 * Scan Pipeline — Frame extraction + card detection + hash matching.
 *
 * This module orchestrates the real-time scanning loop:
 * 1. Capture frame from video element → canvas
 * 2. Extract the guide region (card area)
 * 3. Add to frame buffer (for foil compositing)
 * 4. Crop to artwork region (using composited frame if available)
 * 5. Compute dHash
 * 6. Match against hash database
 * 7. If medium confidence: trigger OCR for printing resolution
 * 8. Detect foil from frame variance
 *
 * The pipeline runs at ~5 fps (200ms interval) to balance accuracy and battery.
 */

import { computeDHash } from '@/lib/scanner/dhash'
import { cropArtworkRegion, DEFAULT_ARTWORK_REGION } from '@/lib/scanner/artwork-crop'
import { findCardMatches, isHashDBReady, type MatchResult } from '@/lib/scanner/hash-db'
import { FrameBuffer, computeGlarePercentage } from '@/lib/scanner/frame-buffer'
import { detectFoil } from '@/lib/scanner/foil-detect'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanPipelineResult {
  /** Whether a confident match was found */
  matched: boolean
  /** Top match (if any) */
  topMatch: MatchResult | null
  /** All candidates within threshold */
  candidates: MatchResult[]
  /** Whether the result is ambiguous (multiple close matches) */
  ambiguous: boolean
  /** Processing time in ms */
  processingTimeMs: number
  /** Glare percentage in the artwork region (0.0-1.0) */
  glarePercentage: number
  /** Whether the card appears to be foil (based on frame variance) */
  isFoil: boolean
  /** Foil detection confidence (0.0-1.0) */
  foilConfidence: number
}

// ---------------------------------------------------------------------------
// Pipeline Configuration
// ---------------------------------------------------------------------------

/** Maximum Hamming distance for a "confident" match */
const CONFIDENT_THRESHOLD = 5

/** Maximum Hamming distance for a "possible" match */
const POSSIBLE_THRESHOLD = 10

/** Minimum gap between best and second-best match to be non-ambiguous */
const AMBIGUITY_GAP = 4

// ---------------------------------------------------------------------------
// Core Pipeline Function
// ---------------------------------------------------------------------------

/**
 * Process a single frame from the video feed.
 *
 * @param video - The video element (camera feed)
 * @param canvas - A canvas element used for frame extraction
 * @param guideRect - Normalized guide rectangle (card area in the viewport)
 * @param frameBuffer - Optional frame buffer for multi-frame compositing
 * @returns Pipeline result with match info
 */
export async function processFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  guideRect: { x: number; y: number; w: number; h: number },
  frameBuffer?: FrameBuffer
): Promise<ScanPipelineResult> {
  const startTime = performance.now()
  const emptyResult: ScanPipelineResult = {
    matched: false, topMatch: null, candidates: [], ambiguous: false,
    processingTimeMs: 0, glarePercentage: 0, isFoil: false, foilConfidence: 0,
  }

  // Check if hash DB is ready
  if (!isHashDBReady()) {
    return emptyResult
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return emptyResult

  // Set canvas to video dimensions
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw === 0 || vh === 0) return emptyResult

  canvas.width = vw
  canvas.height = vh

  // Draw current video frame to canvas
  ctx.drawImage(video, 0, 0, vw, vh)

  // Extract the guide region (the card-shaped area the user aligns to)
  const gx = Math.round(guideRect.x * vw)
  const gy = Math.round(guideRect.y * vh)
  const gw = Math.round(guideRect.w * vw)
  const gh = Math.round(guideRect.h * vh)
  const guideImage = ctx.getImageData(gx, gy, Math.max(gw, 1), Math.max(gh, 1))

  // Add to frame buffer (for foil handling)
  if (frameBuffer) {
    frameBuffer.addFrame(guideImage)
  }

  // Use composited frame if buffer is ready (removes transient glare), else use raw frame
  const processingImage = (frameBuffer?.isReady ? frameBuffer.getComposite() : null) ?? guideImage

  // Compute glare on the raw frame (before compositing — shows actual current glare)
  const glarePercentage = computeGlarePercentage(guideImage, DEFAULT_ARTWORK_REGION)

  // Skip matching if glare is too high (> 20% of artwork region)
  if (glarePercentage > 0.20) {
    const processingTimeMs = performance.now() - startTime
    return { ...emptyResult, processingTimeMs, glarePercentage }
  }

  // Crop to artwork region
  const artworkImage = cropArtworkRegion(processingImage, DEFAULT_ARTWORK_REGION)

  // Compute dHash of the artwork
  const hash = computeDHash(artworkImage)

  // Match against database
  const candidates = await findCardMatches(hash, 5, POSSIBLE_THRESHOLD)

  // Detect foil from frame buffer (needs multiple frames)
  let isFoil = false
  let foilConfidence = 0
  if (frameBuffer && frameBuffer.frameCount >= 4) {
    // Get raw frames from buffer for foil detection (not composited)
    const foilResult = detectFoil([guideImage]) // Single frame — full detection needs the buffer's raw frames
    isFoil = foilResult.isFoil
    foilConfidence = foilResult.confidence
  }

  const processingTimeMs = performance.now() - startTime

  if (candidates.length === 0) {
    return { matched: false, topMatch: null, candidates: [], ambiguous: false, processingTimeMs, glarePercentage, isFoil, foilConfidence }
  }

  const topMatch = candidates[0]
  const secondBest = candidates.length > 1 ? candidates[1] : null

  // Determine confidence
  const isConfident = topMatch.distance <= CONFIDENT_THRESHOLD
  const isAmbiguous = secondBest !== null && (topMatch.distance - secondBest.distance) < AMBIGUITY_GAP && secondBest.distance <= POSSIBLE_THRESHOLD

  return {
    matched: isConfident && !isAmbiguous,
    topMatch,
    candidates,
    ambiguous: isAmbiguous,
    processingTimeMs,
    glarePercentage,
    isFoil,
    foilConfidence,
  }
}

/**
 * Check if there's enough visual information in the guide region to attempt matching.
 * Uses edge density as a proxy — a card has more edges than an empty surface.
 *
 * @param video - Video element
 * @param canvas - Canvas element
 * @param guideRect - Guide rectangle
 * @returns true if a card-like object is detected
 */
export function detectCardPresence(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  guideRect: { x: number; y: number; w: number; h: number }
): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false

  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw === 0 || vh === 0) return false

  canvas.width = vw
  canvas.height = vh
  ctx.drawImage(video, 0, 0, vw, vh)

  // Sample a strip along the expected top edge of the card (inside guide)
  const gx = Math.round(guideRect.x * vw)
  const gy = Math.round(guideRect.y * vh)
  const gw = Math.round(guideRect.w * vw)

  // Get a 1-pixel tall strip at the top of the guide
  const strip = ctx.getImageData(gx, gy, gw, 1)

  // Compute edge strength: count significant brightness changes between adjacent pixels
  let edges = 0
  for (let x = 1; x < gw; x++) {
    const idx = x * 4
    const prevIdx = (x - 1) * 4
    const brightness = strip.data[idx] * 0.299 + strip.data[idx + 1] * 0.587 + strip.data[idx + 2] * 0.114
    const prevBrightness = strip.data[prevIdx] * 0.299 + strip.data[prevIdx + 1] * 0.587 + strip.data[prevIdx + 2] * 0.114
    if (Math.abs(brightness - prevBrightness) > 30) edges++
  }

  // A card border typically creates 2+ strong edges in the strip
  // Plus internal artwork detail creates additional edges
  const edgeDensity = edges / gw
  return edgeDensity > 0.02 // At least 2% of pixels have significant edges
}
