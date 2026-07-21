/**
 * Artwork Crop Utility — Extract the artwork region from a card frame.
 *
 * MTG card frames have the artwork at a known position relative to the
 * card boundaries. By cropping to just the artwork, we:
 * - Exclude the frame/border (which varies by set/era)
 * - Exclude the text box (which varies by language)
 * - Focus on the unique element: the illustration
 *
 * The artwork region coordinates are expressed as normalized fractions
 * of the card width/height (0.0 to 1.0).
 */

// ---------------------------------------------------------------------------
// Frame Era Definitions
// ---------------------------------------------------------------------------

export interface ArtworkRegion {
  /** Normalized X position of top-left corner (0 = left edge) */
  x: number
  /** Normalized Y position of top-left corner (0 = top edge) */
  y: number
  /** Normalized width */
  w: number
  /** Normalized height */
  h: number
}

/**
 * Modern frame (2003–present): standard card with artwork in the upper portion.
 * This covers 90%+ of cards in a typical Commander collection.
 */
export const MODERN_FRAME: ArtworkRegion = {
  x: 0.065,
  y: 0.115,
  w: 0.87,
  h: 0.44,
}

/**
 * Pre-modern frame (1993–2003): slightly different proportions.
 */
export const PRE_MODERN_FRAME: ArtworkRegion = {
  x: 0.07,
  y: 0.10,
  w: 0.86,
  h: 0.46,
}

/**
 * Borderless / Extended art: artwork extends to or near the edges.
 */
export const BORDERLESS_FRAME: ArtworkRegion = {
  x: 0.02,
  y: 0.02,
  w: 0.96,
  h: 0.55,
}

/**
 * Full-art land: artwork covers most of the card.
 */
export const FULL_ART_FRAME: ArtworkRegion = {
  x: 0.02,
  y: 0.02,
  w: 0.96,
  h: 0.80,
}

/** Default region to use (modern frame covers the vast majority of cards) */
export const DEFAULT_ARTWORK_REGION = MODERN_FRAME

// ---------------------------------------------------------------------------
// Crop Functions
// ---------------------------------------------------------------------------

/**
 * Extract the artwork region from an ImageData as a new ImageData.
 *
 * @param source - Full card image as ImageData
 * @param region - Normalized artwork coordinates (defaults to modern frame)
 * @returns New ImageData containing just the artwork region
 */
export function cropArtworkRegion(
  source: ImageData,
  region: ArtworkRegion = DEFAULT_ARTWORK_REGION
): ImageData {
  const { width, height, data } = source

  const cropX = Math.round(region.x * width)
  const cropY = Math.round(region.y * height)
  const cropW = Math.round(region.w * width)
  const cropH = Math.round(region.h * height)

  // Clamp to source bounds
  const safeW = Math.min(cropW, width - cropX)
  const safeH = Math.min(cropH, height - cropY)

  const result = new ImageData(safeW, safeH)

  for (let y = 0; y < safeH; y++) {
    for (let x = 0; x < safeW; x++) {
      const srcIdx = ((cropY + y) * width + (cropX + x)) * 4
      const dstIdx = (y * safeW + x) * 4
      result.data[dstIdx] = data[srcIdx]
      result.data[dstIdx + 1] = data[srcIdx + 1]
      result.data[dstIdx + 2] = data[srcIdx + 2]
      result.data[dstIdx + 3] = data[srcIdx + 3]
    }
  }

  return result
}

/**
 * Extract artwork from a canvas element's context.
 * Useful when working directly with a video frame drawn to canvas.
 *
 * @param ctx - Canvas 2D context with the card image drawn
 * @param canvasWidth - Width of the canvas
 * @param canvasHeight - Height of the canvas
 * @param region - Normalized artwork coordinates
 * @returns ImageData of the artwork region
 */
export function cropArtworkFromCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  region: ArtworkRegion = DEFAULT_ARTWORK_REGION
): ImageData {
  const cropX = Math.round(region.x * canvasWidth)
  const cropY = Math.round(region.y * canvasHeight)
  const cropW = Math.round(region.w * canvasWidth)
  const cropH = Math.round(region.h * canvasHeight)

  return ctx.getImageData(cropX, cropY, cropW, cropH)
}

// ---------------------------------------------------------------------------
// Guide Region Extraction
// ---------------------------------------------------------------------------

/**
 * Given the video dimensions and guide rect position, extract the guide area
 * from a video frame drawn to canvas.
 *
 * The guide rect is the card-shaped overlay shown to the user.
 * This crops the video frame to just the area inside the guide.
 *
 * @param ctx - Canvas context with video frame drawn at full resolution
 * @param videoWidth - Natural video width
 * @param videoHeight - Natural video height
 * @param guideRect - The guide rectangle in normalized coordinates (relative to viewport)
 */
export function extractGuideRegion(
  ctx: CanvasRenderingContext2D,
  videoWidth: number,
  videoHeight: number,
  guideRect: { x: number; y: number; w: number; h: number }
): ImageData {
  const x = Math.round(guideRect.x * videoWidth)
  const y = Math.round(guideRect.y * videoHeight)
  const w = Math.round(guideRect.w * videoWidth)
  const h = Math.round(guideRect.h * videoHeight)

  return ctx.getImageData(x, y, Math.max(w, 1), Math.max(h, 1))
}
