/**
 * OCR Collector Number — Supabase Edge Function
 *
 * Accepts a base64-encoded image of a card's collector number region
 * and returns the parsed set code + collector number.
 *
 * Strategy:
 * 1. Primary: Google Cloud Vision API (if GOOGLE_CLOUD_VISION_KEY env is set)
 * 2. Fallback: Simple pattern extraction from OCR text
 *
 * The collector number region on modern MTG cards (post-2003) contains:
 *   "042/271 · MKM · EN · R"
 *   or: "42 MKM EN R"
 *   or: "042/271" with set symbol nearby
 *
 * Input: POST { image: string (base64) }
 * Output: { set_code: string | null, collector_number: string | null, raw_text: string, confidence: number }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OCRResult {
  set_code: string | null
  collector_number: string | null
  raw_text: string
  confidence: number
}

// ---------------------------------------------------------------------------
// Google Cloud Vision OCR
// ---------------------------------------------------------------------------

async function ocrViaGoogleVision(imageBase64: string, apiKey: string): Promise<string> {
  const body = {
    requests: [{
      image: { content: imageBase64 },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      imageContext: {
        languageHints: ['en'],
      },
    }],
  }

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    throw new Error(`Google Vision API error: ${res.status}`)
  }

  const data = await res.json()
  const text = data.responses?.[0]?.fullTextAnnotation?.text ?? ''
  return text.trim()
}

// ---------------------------------------------------------------------------
// Text Parsing — Extract set code and collector number from OCR text
// ---------------------------------------------------------------------------

/**
 * Parse raw OCR text to extract collector number and set code.
 *
 * Common patterns on modern MTG cards:
 * - "042/271 · MKM · EN · R"
 * - "42/271 MKM EN R"
 * - "042 MKM"
 * - "42/271"
 * - "153/287·DSK·EN·U"
 *
 * Set codes are always 3-4 uppercase letters.
 * Collector numbers are 1-3 digits, optionally followed by /total.
 */
function parseCollectorInfo(rawText: string): { setCode: string | null; collectorNumber: string | null; confidence: number } {
  const text = rawText.toUpperCase().replace(/[·•]/g, ' ').replace(/\s+/g, ' ').trim()

  // Pattern 1: "NNN/NNN SET" or "NNN SET"
  const pattern1 = /(\d{1,4})(?:\/\d{1,4})?\s+([A-Z]{3,5})\b/
  const match1 = text.match(pattern1)
  if (match1) {
    return { collectorNumber: match1[1], setCode: match1[2], confidence: 0.9 }
  }

  // Pattern 2: "SET NNN/NNN" (some older printings)
  const pattern2 = /\b([A-Z]{3,5})\s+(\d{1,4})(?:\/\d{1,4})?/
  const match2 = text.match(pattern2)
  if (match2) {
    return { collectorNumber: match2[2], setCode: match2[1], confidence: 0.85 }
  }

  // Pattern 3: Just collector number "NNN/NNN"
  const pattern3 = /\b(\d{1,4})\/(\d{1,4})\b/
  const match3 = text.match(pattern3)
  if (match3) {
    return { collectorNumber: match3[1], setCode: null, confidence: 0.6 }
  }

  // Pattern 4: Isolated 3-4 letter code that looks like a set
  const pattern4 = /\b([A-Z]{3,4})\b/
  const match4 = text.match(pattern4)
  if (match4 && !['THE', 'AND', 'FOR', 'ALL'].includes(match4[1])) {
    return { collectorNumber: null, setCode: match4[1], confidence: 0.4 }
  }

  return { collectorNumber: null, setCode: null, confidence: 0 }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { image } = body as { image?: string }

    if (!image) {
      return new Response(JSON.stringify({ error: 'image (base64) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Strip data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')

    let rawText = ''
    const gcvKey = Deno.env.get('GOOGLE_CLOUD_VISION_KEY')

    if (gcvKey) {
      // Use Google Cloud Vision
      rawText = await ocrViaGoogleVision(base64Data, gcvKey)
    } else {
      // No OCR API configured — return empty result
      const result: OCRResult = {
        set_code: null,
        collector_number: null,
        raw_text: '',
        confidence: 0,
      }
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse the OCR text
    const parsed = parseCollectorInfo(rawText)

    const result: OCRResult = {
      set_code: parsed.setCode?.toLowerCase() ?? null,
      collector_number: parsed.collectorNumber,
      raw_text: rawText,
      confidence: parsed.confidence,
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
