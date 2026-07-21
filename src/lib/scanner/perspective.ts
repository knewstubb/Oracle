/**
 * Perspective Correction — Flatten a tilted card to a straight-on rectangle.
 *
 * When a card is held in front of the camera, it's almost never perfectly
 * flat and perpendicular. Even 5-10° of tilt changes the dHash significantly.
 * This module detects the card's actual boundary within a frame and transforms
 * it to a standard rectangle.
 *
 * Approach:
 * 1. Find high-contrast edges in the guide region (card border against background)
 * 2. Fit a quadrilateral to the detected edges
 * 3. Apply a projective (perspective) transform to map the quad to a rectangle
 *
 * The transform is done entirely with Canvas 2D API — no OpenCV dependency.
 * For the perspective mapping, we use a bilinear interpolation approach
 * that maps each pixel in the output from its corresponding position in the
 * source quadrilateral.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Point {
  x: number
  y: number
}

interface Quad {
  topLeft: Point
  topRight: Point
  bottomRight: Point
  bottomLeft: Point
}

// ---------------------------------------------------------------------------
// Card Edge Detection
// ---------------------------------------------------------------------------

/**
 * Detect the card's bounding quadrilateral within an ImageData.
 *
 * Strategy: scan inward from each edge to find where brightness changes sharply
 * (card border against darker/lighter background). This works because the user
 * is holding a card against a contrasting surface (table, playmat).
 *
 * Returns approximate corner positions, or null if detection fails.
 */
export function detectCardQuad(imageData: ImageData): Quad | null {
  const { width, height, data } = imageData

  // Convert to grayscale for edge analysis
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4
    gray[i] = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114)
  }

  // Find edges by scanning from each side toward center
  // Look for the strongest gradient (biggest brightness jump)
  const topEdge = findHorizontalEdge(gray, width, height, 'top')
  const bottomEdge = findHorizontalEdge(gray, width, height, 'bottom')
  const leftEdge = findVerticalEdge(gray, width, height, 'left')
  const rightEdge = findVerticalEdge(gray, width, height, 'right')

  // If any edge detection failed, fall back to full frame
  if (topEdge < 0 || bottomEdge < 0 || leftEdge < 0 || rightEdge < 0) {
    return null
  }

  // Sanity check: the detected region should be at least 40% of the frame
  const detectedW = rightEdge - leftEdge
  const detectedH = bottomEdge - topEdge
  if (detectedW < width * 0.4 || detectedH < height * 0.4) {
    return null
  }

  return {
    topLeft: { x: leftEdge, y: topEdge },
    topRight: { x: rightEdge, y: topEdge },
    bottomRight: { x: rightEdge, y: bottomEdge },
    bottomLeft: { x: leftEdge, y: bottomEdge },
  }
}

/**
 * Scan horizontally to find an edge (top or bottom of card).
 * Returns the Y coordinate of the edge, or -1 if not found.
 */
function findHorizontalEdge(
  gray: Uint8Array,
  width: number,
  height: number,
  direction: 'top' | 'bottom'
): number {
  const step = direction === 'top' ? 1 : -1
  const start = direction === 'top' ? 0 : height - 1
  const end = direction === 'top' ? Math.floor(height * 0.4) : Math.floor(height * 0.6)

  // Sample multiple columns for robustness
  const sampleCols = [
    Math.floor(width * 0.25),
    Math.floor(width * 0.5),
    Math.floor(width * 0.75),
  ]

  let bestEdge = -1
  let bestGradient = 0

  for (let y = start; direction === 'top' ? y < end : y > end; y += step) {
    let totalGradient = 0
    for (const col of sampleCols) {
      const nextY = y + step
      if (nextY < 0 || nextY >= height) continue
      const curr = gray[y * width + col]
      const next = gray[nextY * width + col]
      totalGradient += Math.abs(next - curr)
    }

    if (totalGradient > bestGradient && totalGradient > 60) {
      bestGradient = totalGradient
      bestEdge = y
    }
  }

  return bestEdge
}

/**
 * Scan vertically to find an edge (left or right of card).
 * Returns the X coordinate of the edge, or -1 if not found.
 */
function findVerticalEdge(
  gray: Uint8Array,
  width: number,
  height: number,
  direction: 'left' | 'right'
): number {
  const step = direction === 'left' ? 1 : -1
  const start = direction === 'left' ? 0 : width - 1
  const end = direction === 'left' ? Math.floor(width * 0.4) : Math.floor(width * 0.6)

  // Sample multiple rows
  const sampleRows = [
    Math.floor(height * 0.25),
    Math.floor(height * 0.5),
    Math.floor(height * 0.75),
  ]

  let bestEdge = -1
  let bestGradient = 0

  for (let x = start; direction === 'left' ? x < end : x > end; x += step) {
    let totalGradient = 0
    for (const row of sampleRows) {
      const nextX = x + step
      if (nextX < 0 || nextX >= width) continue
      const curr = gray[row * width + x]
      const next = gray[row * width + nextX]
      totalGradient += Math.abs(next - curr)
    }

    if (totalGradient > bestGradient && totalGradient > 60) {
      bestGradient = totalGradient
      bestEdge = x
    }
  }

  return bestEdge
}

// ---------------------------------------------------------------------------
// Perspective Transform
// ---------------------------------------------------------------------------

/** Standard output size for the flattened card image */
const OUTPUT_WIDTH = 240
const OUTPUT_HEIGHT = 336 // 5:7 ratio (card aspect)

/**
 * Flatten a detected card quad to a standard rectangle.
 *
 * Uses bilinear interpolation to map each pixel in the output rectangle
 * back to its corresponding position in the source quadrilateral.
 *
 * @param source - Original image containing the tilted card
 * @param quad - The detected card corners
 * @returns A new ImageData with the card flattened to OUTPUT_WIDTH x OUTPUT_HEIGHT
 */
export function flattenCard(source: ImageData, quad: Quad): ImageData {
  const { width: srcW, data: srcData } = source
  const result = new ImageData(OUTPUT_WIDTH, OUTPUT_HEIGHT)

  for (let dy = 0; dy < OUTPUT_HEIGHT; dy++) {
    for (let dx = 0; dx < OUTPUT_WIDTH; dx++) {
      // Normalize destination coordinates to [0, 1]
      const u = dx / (OUTPUT_WIDTH - 1)
      const v = dy / (OUTPUT_HEIGHT - 1)

      // Bilinear interpolation of source position from quad corners
      const srcX = bilerp(
        quad.topLeft.x, quad.topRight.x,
        quad.bottomLeft.x, quad.bottomRight.x,
        u, v
      )
      const srcY = bilerp(
        quad.topLeft.y, quad.topRight.y,
        quad.bottomLeft.y, quad.bottomRight.y,
        u, v
      )

      // Sample source pixel (nearest neighbor for speed)
      const sx = Math.round(srcX)
      const sy = Math.round(srcY)

      if (sx >= 0 && sx < source.width && sy >= 0 && sy < source.height) {
        const srcIdx = (sy * srcW + sx) * 4
        const dstIdx = (dy * OUTPUT_WIDTH + dx) * 4
        result.data[dstIdx] = srcData[srcIdx]
        result.data[dstIdx + 1] = srcData[srcIdx + 1]
        result.data[dstIdx + 2] = srcData[srcIdx + 2]
        result.data[dstIdx + 3] = 255
      }
    }
  }

  return result
}

/**
 * Bilinear interpolation between four corner values.
 */
function bilerp(
  tl: number, tr: number,
  bl: number, br: number,
  u: number, v: number
): number {
  const top = tl + (tr - tl) * u
  const bottom = bl + (br - bl) * u
  return top + (bottom - top) * v
}

// ---------------------------------------------------------------------------
// Combined: Detect + Flatten
// ---------------------------------------------------------------------------

/**
 * Detect the card in a frame and flatten it. Returns the flattened image,
 * or the center-cropped frame if card detection fails (graceful fallback).
 */
export function detectAndFlatten(frameData: ImageData): ImageData {
  const quad = detectCardQuad(frameData)

  if (quad) {
    return flattenCard(frameData, quad)
  }

  // Fallback: center-crop to approximate card area (no perspective correction)
  const { width, height } = frameData
  const cropX = Math.round(width * 0.1)
  const cropY = Math.round(height * 0.05)
  const cropW = Math.round(width * 0.8)
  const cropH = Math.round(height * 0.9)

  const result = new ImageData(cropW, cropH)
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcIdx = ((cropY + y) * width + (cropX + x)) * 4
      const dstIdx = (y * cropW + x) * 4
      result.data[dstIdx] = frameData.data[srcIdx]
      result.data[dstIdx + 1] = frameData.data[srcIdx + 1]
      result.data[dstIdx + 2] = frameData.data[srcIdx + 2]
      result.data[dstIdx + 3] = 255
    }
  }

  return result
}
