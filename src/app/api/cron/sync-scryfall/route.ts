/**
 * GET /api/cron/sync-scryfall
 *
 * Vercel Cron endpoint — triggers the Supabase Edge Function to sync Scryfall printings.
 * Runs at 10:00 AM UTC daily (after Scryfall's ~09:00 UTC bulk data update).
 *
 * The actual sync work happens in the Edge Function which has longer execution time limits.
 * This route just triggers it and reports the result.
 *
 * Note: For the initial bulk load (~100K cards), run the local script instead:
 *   npx tsx scripts/sync-scryfall-printings.ts
 */

import { NextRequest } from 'next/server'

export const maxDuration = 300 // 5 minutes — Edge Function may take a while

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: 'Missing Supabase config' }, { status: 500 })
  }

  try {
    // Call the Supabase Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/scryfall-sync`
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('[sync-scryfall] Edge Function failed:', result)
      return Response.json(
        { error: 'Edge Function failed', details: result },
        { status: response.status }
      )
    }

    console.log('[sync-scryfall] Sync complete:', result)
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sync-scryfall] Failed to trigger Edge Function:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
