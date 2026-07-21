/**
 * Foil Detection — Auto-detect foil cards from frame variance.
 *
 * Foil cards have a holographic metallic layer that causes:
 * - Color shifting (hue changes with viewing angle)
 * - Higher brightness variance between frames (iridescent shimmer)
 *
 * Detection strategy:
 * Compare hue distribution across multiple frames. Foil cards show
 * significantly higher variance in hue histogram because the metallic
 * layer shifts perceived colors as the card's angle changes (natural
 * hand movement provides the angle variation).
 *
 * Non-foil cards have stable hue distributions across frames because
 * printed ink doesn't change color with viewing angle.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum frames needed for reliable foil detection */
const MIN_FRAMES_FOR_DETECTION = 4

/** Hue variance threshold — above this = foil */
const FOIL_VARIANCE_THRESHOLD = 15.0

/** Number of hue histogram bins */
const HUE_BINS = 36 // 10 degrees per bin

// ---------------------------------------------------------------------------
// Core Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a set of frames shows a foil card.
 *
 * @param frames - Array of ImageData frames (same region across time)
 * @returns { isFoil: boolean, confidence: number, variance: number }
 */
export function detectFoil(frames: ImageData[]): {
  isFoil: boolean
  confidence: number
  variance: number
} {
  if (frames.length < MIN_FRAMES_FOR_DETECTION) {
    return { isFoil: false, confidence: 0, variance: 0 }
  }

  // Compute hue histogram for each frame
  const histograms = frames.map(frame => computeHueHistogram(frame))

  // Compute variance across histograms (how much the hue distribution changes between frames)
  const variance = computeHistogramVariance(histograms)

  const isFoil = variance > FOIL_VARIANCE_THRESHOLD
  // Confidence scales from 0 at threshold to 1 at 2x threshold
  const confidence = isFoil
    ? Math.min(1, (variance - FOIL_VARIANCE_THRESHOLD) / FOIL_VARIANCE_THRESHOLD)
    : 0

  return { isFoil, confidence, variance }
}

// ---------------------------------------------------------------------------
// Hue Histogram
// ---------------------------------------------------------------------------

/**
 * Compute a hue histogram from an ImageData.
 * Only counts pixels with sufficient saturation (to ignore gray/white areas).
 */
function computeHueHistogram(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData
  const histogram = new Float32Array(HUE_BINS)
  let totalPixels = 0

  // Sample every 4th pixel for speed (still statistically representative)
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min

    // Skip low-saturation pixels (gray, white, black — not color-informative)
    if (delta < 0.1) continue

    // Compute hue (0-360)
    let hue: number
    if (max === r) hue = 60 * (((g - b) / delta) % 6)
    else if (max === g) hue = 60 * ((b - r) / delta + 2)
    else hue = 60 * ((r - g) / delta + 4)
    if (hue < 0) hue += 360

    const bin = Math.min(Math.floor(hue / (360 / HUE_BINS)), HUE_BINS - 1)
    histogram[bin]++
    totalPixels++
  }

  // Normalize to percentages
  if (totalPixels > 0) {
    for (let i = 0; i < HUE_BINS; i++) {
      histogram[i] = histogram[i] / totalPixels
    }
  }

  return histogram
}

/**
 * Compute the mean variance across all histogram bins.
 * Higher variance = more hue shifting between frames = likely foil.
 */
function computeHistogramVariance(histograms: Float32Array[]): number {
  if (histograms.length < 2) return 0

  let totalVariance = 0

  for (let bin = 0; bin < HUE_BINS; bin++) {
    // Get all values for this bin across frames
    const values = histograms.map(h => h[bin])

    // Compute variance for this bin
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length

    totalVariance += variance
  }

  // Scale up for readability (raw variances are tiny fractions)
  return totalVariance * 1000
}
