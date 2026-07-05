// ---------------------------------------------------------------------------
// POST /api/archidekt/write-tags
//
// DORMANT: Playwright browser automation is decommissioned for Vercel deployment
// (supabase-migration Requirement 7). This route is retained but returns a 501
// indicating the feature is unavailable in the current deployment environment.
// Users should manually copy-paste deck lists to Archidekt instead.
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function POST(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  return Response.json(
    {
      success: false,
      error:
        'Playwright automation is dormant — Archidekt write-back is not available in this deployment. Please manually copy-paste your deck list to Archidekt.',
    },
    { status: 501 }
  )
}
