/**
 * Frame Buffer + Median Compositing
 *
 * Maintains a ring buffer of recent camera frames and provides a median-composited
 * output that removes transient specular highlights (foil glare).
 *
 * How it works:
 * - Buffer stores the last N frames (default 5)
 * - Each pixel position: take the median R, G, B value across all buffered frames
 * - Transient highlights (which appear in 1-2 frames at a given position due to hand movement)
 *   are eliminated because the median ignores outliers
 * - The stable card content (which is consistent across all frames) is preserved
 *
 * This is the primary foil handling strategy — it requires no model, no preprocessing,
 * just natural hand movement while holding the card.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default number of frames to buffer */
const DEFAULT_BUFFER_SIZE = 5

// ---------------------------------------------------------------------------
// Frame Buffer Class
// ---------------------------------------------------------------------------

export class FrameBuffer {
  private buffer: ImageData[] = []
  private maxSize: number

  constructor(maxSize: number = DEFAULT_BUFFER_SIZE) {
    this.maxSize = maxSize
  }

  /**
   * Add a frame to the buffer. Drops the oldest frame if buffer is full.
   */
  addFrame(frame: ImageData): void {
    this.buffer.push(frame)
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift()
    }
  }

  /**
   * Get the current number of buffered frames.
   */
  get frameCount(): number {
    return this.buffer.length
  }

  /**
   * Check if the buffer has enough frames for reliable compositing.
   * Requires at least 3 frames for median to be meaningful.
   */
  get isReady(): boolean {
    return this.buffer.length >= 3
  }

  /**
   * Compute the median-composited frame from the buffer.
   * Returns null if fewer than 3 frames are buffered.
   *
   * For each pixel position, takes the median R, G, B value across all frames.
   * This eliminates transient specular highlights (foil glare) while preserving
   * the stable card content.
   */
  getComposite(): ImageData | null {
    if (!this.isReady) return null

    const frames = this.buffer
    const { width, height } = frames[0]

    // Verify all frames have same dimensions
    if (!frames.every(f => f.width === width && f.height === height)) {
      return null
    }

    const result = new ImageData(width, height)
    const numFrames = frames.length
    const values = new Uint8Array(numFrames)

    for (let i = 0; i < width * height * 4; i += 4) {
      // Red channel median
      for (let f = 0; f < numFrames; f++) values[f] = frames[f].data[i]
      result.data[i] = medianUint8(values, numFrames)

      // Green channel median
      for (let f = 0; f < numFrames; f++) values[f] = frames[f].data[i + 1]
      result.data[i + 1] = medianUint8(values, numFrames)

      // Blue channel median
      for (let f = 0; f < numFrames; f++) values[f] = frames[f].data[i + 2]
      result.data[i + 2] = medianUint8(values, numFrames)

      // Alpha = 255
      result.data[i + 3] = 255
    }

    return result
  }

  /**
   * Clear the buffer (e.g., when a new card is detected and we start fresh).
   */
  clear(): void {
    this.buffer = []
  }

  /**
   * Get the most recent raw frame (for display or non-composited operations).
   */
  getLatestFrame(): ImageData | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null
  }
}

// ---------------------------------------------------------------------------
// Glare Detection
// ---------------------------------------------------------------------------

/**
 * Compute the percentage of pixels in an image region that are "glared"
 * (oversaturated — all channels near 255).
 *
 * @param imageData - Image to analyze
 * @param region - Optional sub-region (normalized coordinates). Defaults to full image.
 * @returns Glare percentage (0.0 to 1.0)
 */
export function computeGlarePercentage(
  imageData: ImageData,
  region?: { x: number; y: number; w: number; h: number }
): number {
  const { width, height, data } = imageData

  const startX = region ? Math.round(region.x * width) : 0
  const startY = region ? Math.round(region.y * height) : 0
  const endX = region ? Math.round((region.x + region.w) * width) : width
  const endY = region ? Math.round((region.y + region.h) * height) : height

  let saturated = 0
  let total = 0

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]

      total++
      // A pixel is "glared" if all channels are above 240
      if (r > 240 && g > 240 && b > 240) {
        saturated++
      }
    }
  }

  return total > 0 ? saturated / total : 0
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Compute median of a Uint8Array (partial sort — only finds middle element).
 * Uses insertion sort for small arrays (5 elements = fast).
 */
function medianUint8(values: Uint8Array, count: number): number {
  // For small arrays, simple insertion sort is faster than fancy algorithms
  const sorted = values.slice(0, count).sort()
  const mid = Math.floor(count / 2)
  if (count % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  return sorted[mid]
}
