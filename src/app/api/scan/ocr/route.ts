/**
 * POST /api/scan/ocr
 *
 * Proxy to the OCR Edge Function for collector number recognition.
 * Forwards the base64 image and returns parsed results.
 *
 * Falls back to a no-op response if the Edge Function is not deployed
 * or GOOGLE_CLOUD_VISION_KEY is not configured.
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

  // Get Supabase function URL from environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // No Supabase configured — return empty result gracefully
    return Response.json({
      set_code: null,
      collector_number: null,
      raw_text: '',
      confidence: 0,
    })
  }

  try {
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
      // Edge Function not deployed or errored — graceful fallback
      return Response.json({
        set_code: null,
        collector_number: null,
        raw_text: '',
        confidence: 0,
      })
    }

    const data = await res.json()
    return Response.json(data)
  } catch {
    // Network error — graceful fallback
    return Response.json({
      set_code: null,
      collector_number: null,
      raw_text: '',
      confidence: 0,
    })
  }
}
