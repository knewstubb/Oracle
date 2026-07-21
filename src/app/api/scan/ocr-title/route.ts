/**
 * POST /api/scan/ocr-title
 *
 * OCR-based card name recognition.
 * Accepts a base64 image of the card's title region and returns the card name.
 *
 * Uses the same OCR Edge Function as collector number recognition,
 * but parses the result as a card title instead.
 *
 * Falls back gracefully if OCR is not configured.
 */

import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  let body: { image?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { image } = body
  if (!image) {
    return Response.json({ error: 'image (base64) is required' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json({ card_name: null, raw_text: '', confidence: 0 })
  }

  try {
    // Call the same OCR edge function — it returns raw_text from Google Cloud Vision
    const functionUrl = `${supabaseUrl}/functions/v1/ocr-collector-number`
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ image }),
    })

    if (!res.ok) {
      return Response.json({ card_name: null, raw_text: '', confidence: 0 })
    }

    const data = await res.json()
    const rawText = (data.raw_text ?? '').trim()

    if (!rawText) {
      return Response.json({ card_name: null, raw_text: '', confidence: 0 })
    }

    // The title region should contain the card name as the primary text.
    // Clean up common OCR artifacts and extract the card name.
    const cardName = parseCardTitle(rawText)

    return Response.json({
      card_name: cardName,
      raw_text: rawText,
      confidence: cardName ? 0.8 : 0,
    })
  } catch {
    return Response.json({ card_name: null, raw_text: '', confidence: 0 })
  }
}

/**
 * Parse the card title from raw OCR text of the title region.
 *
 * The title bar on a Magic card contains:
 * - The card name (left-aligned, largest text)
 * - The mana cost (right-aligned, usually symbols that OCR as circles/braces)
 *
 * Strategy:
 * 1. Take the first line of text (card name is always first/most prominent)
 * 2. Remove mana cost artifacts (numbers in braces, circles, etc.)
 * 3. Clean up common OCR errors
 */
function parseCardTitle(rawText: string): string | null {
  // Split into lines — card name is typically the first line
  const lines = rawText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)

  if (lines.length === 0) return null

  let title = lines[0]

  // Remove mana cost patterns that OCR might pick up from the right side
  // Common patterns: {3}{W}{U}, (3)(W)(U), numbers+letters at end
  title = title.replace(/[\{\(]\d*[WUBRG/CWUBRGX]*[\}\)]/gi, '')
  title = title.replace(/\s*[\{\(][^)}\]]*[\}\)]\s*/g, '')

  // Remove trailing numbers/symbols that look like mana cost
  title = title.replace(/\s+\d+\s*$/, '')

  // Clean up common OCR artifacts
  title = title.replace(/[|[\]{}()+*#@^~`]/g, '')
  title = title.replace(/\s{2,}/g, ' ')
  title = title.trim()

  // Must be at least 2 characters to be a valid card name
  if (title.length < 2) return null

  // If it's all numbers or single character, it's probably not a card name
  if (/^\d+$/.test(title)) return null

  return title
}
