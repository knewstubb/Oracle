/**
 * GET/POST /api/collection/prices/refresh
 *
 * Thin trigger endpoint that invokes the Supabase Edge Function `ck-price-refresh`.
 * Does NOT block waiting for the refresh to complete — fires and returns immediately.
 *
 * Trigger modes:
 * - GET: Vercel Cron (validates Authorization header with CRON_SECRET)
 * - POST: Manual UI trigger (no special auth required for single-user app)
 *
 * Returns: { triggered: true, timestamp, edgeFunctionUrl } on success
 *
 * Validates: Requirements 6.4
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Edge Function URL construction
// ---------------------------------------------------------------------------

function getEdgeFunctionUrl(): string {
  const explicitUrl = process.env.SUPABASE_EDGE_FUNCTION_URL
  if (explicitUrl) {
    // If explicit base URL ends with /ck-price-refresh already, use as-is
    if (explicitUrl.endsWith('/ck-price-refresh')) {
      return explicitUrl
    }
    return `${explicitUrl.replace(/\/$/, '')}/ck-price-refresh`
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ck-price-refresh`
}

// ---------------------------------------------------------------------------
// Shared trigger logic
// ---------------------------------------------------------------------------

async function triggerEdgeFunction(): Promise<Response> {
  const edgeFunctionUrl = getEdgeFunctionUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return Response.json(
      { error: 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable' },
      { status: 500 }
    )
  }

  // Fire-and-forget: invoke the edge function but don't await the full response.
  // We send the request and return immediately to avoid Vercel timeout.
  try {
    const controller = new AbortController()
    // Give it 5 seconds to confirm the edge function accepted the request,
    // but don't wait for the full price refresh to complete.
    const timeoutId = setTimeout(() => controller.abort(), 5_000)

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    }).catch((err) => {
      // If we aborted due to timeout, that's expected — the edge function
      // is running but we're not waiting for it to finish.
      if (err instanceof Error && err.name === 'AbortError') {
        return null // treat as successfully triggered
      }
      throw err
    })

    clearTimeout(timeoutId)

    // If we got a response back within the timeout window, check if it
    // indicated an auth error or method rejection (these are fast failures).
    if (response && !response.ok && response.status < 500) {
      const body = await response.json().catch(() => ({}))
      return Response.json(
        {
          triggered: false,
          error: body?.error ?? `Edge function returned ${response.status}`,
          timestamp: new Date().toISOString(),
        },
        { status: response.status }
      )
    }

    // Either we got a 200/202, or we timed out (edge function still running).
    // Both mean the function was successfully triggered.
    return Response.json({
      triggered: true,
      timestamp: new Date().toISOString(),
      edgeFunctionUrl,
    })
  } catch (err) {
    return Response.json(
      {
        triggered: false,
        error: err instanceof Error ? err.message : 'Failed to invoke edge function',
        timestamp: new Date().toISOString(),
      },
      { status: 502 }
    )
  }
}

// ---------------------------------------------------------------------------
// GET handler — Vercel Cron trigger
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Vercel Cron sends an Authorization header with the CRON_SECRET.
  // If CRON_SECRET is configured, validate it. Otherwise allow unauthenticated
  // GET for local development.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json(
        { error: 'Unauthorized — invalid cron secret' },
        { status: 401 }
      )
    }
  }

  return triggerEdgeFunction()
}

// ---------------------------------------------------------------------------
// POST handler — Manual UI trigger
// ---------------------------------------------------------------------------

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  return triggerEdgeFunction()
}
