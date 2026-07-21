/**
 * Difference Hash (dHash) — Perceptual hashing for card artwork matching.
 *
 * dHash works by:
 * 1. Resize image to 9x8 grayscale (9 wide to produce 8 horizontal gradients per row)
 * 2. Compare each pixel to its right neighbor: left < right = 1, else = 0
 * 3. Produces a 64-bit hash (8 rows x 8 comparisons)
 *
 * Properties:
 * - Invariant to uniform brightness/contrast changes
 * - Tolerant to minor color shifts (foil card hue variance)
 * - Fast: ~1ms per computation on mobile hardware
 * - Compact: 64 bits per card = 8 bytes stored
 *
 * Matching:
 * - Hamming distance = number of differing bits between two hashes
 * - Distance 0-5: very likely same artwork
 * - Distance 6-10: possible match (check candidates)
 * - Distance 11+: different artwork
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Resize width for dHash (one extra column for gradient computation) */
const HASH_WIDTH = 9
/** Resize height for dHash */
const HASH_HEIGHT = 8
/** Total bits in the hash */
export const HASH_BITS = 64

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Compute a 64-bit difference hash from an ImageData object.
 * The input can be any size — it will be resized to 9x8 internally.
 *
 * Uses a canvas-free approach: manually resamples via nearest-neighbor
 * for environments without OffscreenCanvas (e.g., Web Workers).
 */
export function computeDHash(imageData: ImageData): bigint {
  const { width, height, data } = imageData

  // Resize to 9x8 grayscale using bilinear sampling
  const small = resizeToGrayscale(data, width, height, HASH_WIDTH, HASH_HEIGHT)

  // Compute horizontal gradient hash
  let hash = 0n
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const leftPixel = small[y * HASH_WIDTH + x]
      const rightPixel = small[y * HASH_WIDTH + x + 1]
      if (leftPixel < rightPixel) {
        hash |= 1n << BigInt(y * 8 + x)
      }
    }
  }

  return hash
}

/**
 * Compute dHash from raw RGBA pixel data (Uint8ClampedArray) with known dimensions.
 * Convenience wrapper when you already have the raw buffer.
 */
export function computeDHashFromRGBA(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): bigint {
  const small = resizeToGrayscale(rgba, width, height, HASH_WIDTH, HASH_HEIGHT)

  let hash = 0n
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      if (small[y * HASH_WIDTH + x] < small[y * HASH_WIDTH + x + 1]) {
        hash |= 1n << BigInt(y * 8 + x)
      }
    }
  }

  return hash
}

/**
 * Compute Hamming distance between two 64-bit hashes.
 * Returns the number of differing bits (0 = identical, 64 = completely different).
 */
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b
  let count = 0
  while (xor > 0n) {
    count += Number(xor & 1n)
    xor >>= 1n
  }
  return count
}

/**
 * Convert a 64-bit hash to a 16-character hex string (for storage/transfer).
 */
export function hashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, '0')
}

/**
 * Parse a 16-character hex string back to a 64-bit hash.
 */
export function hexToHash(hex: string): bigint {
  return BigInt('0x' + hex)
}

// ---------------------------------------------------------------------------
// Internal: Bilinear Resize to Grayscale
// ---------------------------------------------------------------------------

/**
 * Resize RGBA pixel data to a smaller grayscale image using area averaging.
 * Returns a Float32Array of grayscale values (0-255) at the target size.
 */
function resizeToGrayscale(
  rgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Float32Array {
  const result = new Float32Array(dstWidth * dstHeight)

  const xRatio = srcWidth / dstWidth
  const yRatio = srcHeight / dstHeight

  for (let dy = 0; dy < dstHeight; dy++) {
    for (let dx = 0; dx < dstWidth; dx++) {
      // Compute the source region this destination pixel covers
      const srcX0 = Math.floor(dx * xRatio)
      const srcY0 = Math.floor(dy * yRatio)
      const srcX1 = Math.min(Math.floor((dx + 1) * xRatio), srcWidth - 1)
      const srcY1 = Math.min(Math.floor((dy + 1) * yRatio), srcHeight - 1)

      // Average all source pixels in this region (area sampling)
      let sum = 0
      let count = 0
      for (let sy = srcY0; sy <= srcY1; sy++) {
        for (let sx = srcX0; sx <= srcX1; sx++) {
          const idx = (sy * srcWidth + sx) * 4
          // Luminance: 0.299R + 0.587G + 0.114B
          sum += rgba[idx] * 0.299 + rgba[idx + 1] * 0.587 + rgba[idx + 2] * 0.114
          count++
        }
      }

      result[dy * dstWidth + dx] = count > 0 ? sum / count : 0
    }
  }

  return result
}
