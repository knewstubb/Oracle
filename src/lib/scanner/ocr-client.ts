/**
 * OCR Client — Collector Number Region Extraction + Edge Function Call
 *
 * Handles:
 * 1. Extracting the collector number region from a card image
 * 2. Converting to base64
 * 3. Sending to the OCR Edge Function
 * 4. Resolving the exact printing via Scryfall
 *
 * The collector number on modern MTG cards (post-2003) is located at the
 * bottom-left of the card, below the text box.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OCRResult {
  setCode: string | null
  collectorNumber: string | null
  rawText: string
  confidence: number
}

export interface PrintingResolution {
  scryfallId: string
  setCode: string
  collectorNumber: string
  cardName: string
}

// ---------------------------------------------------------------------------
// Collector Number Region
// ---------------------------------------------------------------------------

/**
 * Normalized coordinates of the collector number region on a modern-frame card.
 * Located at the bottom-left, below the text box.
 */
const COLLECTOR_REGION = {
  x: 0.05,
  y: 0.88,
  w: 0.55,
  h: 0.08,
}

/**
 * Extract the collector number region from a card image and return as base64.
 *
 * @param cardImage - Full card ImageData (from the guide region)
 * @param canvas - A canvas element to use for conversion
 * @returns Base64-encoded PNG of the collector number region
 */
export function extractCollectorRegionBase64(
  cardImage: ImageData,
  canvas: HTMLCanvasElement
): string {
  const { width, height } = cardImage

  const cropX = Math.round(COLLECTOR_REGION.x * width)
  const cropY = Math.round(COLLECTOR_REGION.y * height)
  const cropW = Math.round(COLLECTOR_REGION.w * width)
  const cropH = Math.round(COLLECTOR_REGION.h * height)

  // Draw the cropped region to canvas
  canvas.width = cropW
  canvas.height = cropH
  const ctx = canvas.getContext('2d')!

  // Create a temporary ImageData for the crop
  const cropData = new ImageData(cropW, cropH)
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcIdx = ((cropY + y) * width + (cropX + x)) * 4
      const dstIdx = (y * cropW + x) * 4
      cropData.data[dstIdx] = cardImage.data[srcIdx]
      cropData.data[dstIdx + 1] = cardImage.data[srcIdx + 1]
      cropData.data[dstIdx + 2] = cardImage.data[srcIdx + 2]
      cropData.data[dstIdx + 3] = 255
    }
  }

  ctx.putImageData(cropData, 0, 0)

  // Enhance contrast for better OCR (simple threshold)
  const enhanced = ctx.getImageData(0, 0, cropW, cropH)
  for (let i = 0; i < enhanced.data.length; i += 4) {
    const gray = enhanced.data[i] * 0.299 + enhanced.data[i + 1] * 0.587 + enhanced.data[i + 2] * 0.114
    const val = gray > 128 ? 255 : 0
    enhanced.data[i] = val
    enhanced.data[i + 1] = val
    enhanced.data[i + 2] = val
  }
  ctx.putImageData(enhanced, 0, 0)

  // Export as base64 PNG
  const dataUrl = canvas.toDataURL('image/png')
  return dataUrl.replace(/^data:image\/png;base64,/, '')
}

// ---------------------------------------------------------------------------
// OCR Edge Function Call
// ---------------------------------------------------------------------------

/**
 * Send a collector number region image to the OCR Edge Function.
 * Returns parsed set code and collector number.
 *
 * Gracefully returns null values if the function is unavailable or OCR fails.
 */
export async function callOCR(imageBase64: string): Promise<OCRResult> {
  try {
    const res = await fetch('/api/scan/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    })

    if (!res.ok) {
      return { setCode: null, collectorNumber: null, rawText: '', confidence: 0 }
    }

    const data = await res.json()
    return {
      setCode: data.set_code ?? null,
      collectorNumber: data.collector_number ?? null,
      rawText: data.raw_text ?? '',
      confidence: data.confidence ?? 0,
    }
  } catch {
    return { setCode: null, collectorNumber: null, rawText: '', confidence: 0 }
  }
}

// ---------------------------------------------------------------------------
// Printing Resolution via Scryfall
// ---------------------------------------------------------------------------

/**
 * Resolve an exact printing using set code + collector number via Scryfall.
 * Returns null if resolution fails.
 */
export async function resolvePrinting(
  setCode: string,
  collectorNumber: string
): Promise<PrintingResolution | null> {
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )

    if (!res.ok) return null

    const card = await res.json()
    return {
      scryfallId: card.id,
      setCode: card.set,
      collectorNumber: card.collector_number,
      cardName: card.name,
    }
  } catch {
    return null
  }
}

/**
 * Full OCR pipeline: extract region → call OCR → resolve printing.
 *
 * @param cardImage - Full card ImageData
 * @param canvas - Canvas for image conversion
 * @returns Resolved printing or null
 */
export async function ocrResolvePrinting(
  cardImage: ImageData,
  canvas: HTMLCanvasElement
): Promise<{ printing: PrintingResolution | null; ocrResult: OCRResult }> {
  const base64 = extractCollectorRegionBase64(cardImage, canvas)
  const ocrResult = await callOCR(base64)

  if (!ocrResult.setCode || !ocrResult.collectorNumber || ocrResult.confidence < 0.5) {
    return { printing: null, ocrResult }
  }

  const printing = await resolvePrinting(ocrResult.setCode, ocrResult.collectorNumber)
  return { printing, ocrResult }
}
