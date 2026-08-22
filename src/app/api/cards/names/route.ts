/**
 * GET /api/cards/names
 * 
 * Returns a list of all card names in the database for client-side auto-bracketing.
 * Cached heavily since card names don't change often.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// Cache the names in memory (refreshed on server restart)
let cachedNames: string[] | null = null
let cacheTime = 0
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

export async function GET() {
  // Check memory cache
  if (cachedNames && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json(
      { names: cachedNames },
      { 
        headers: { 
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' 
        } 
      }
    )
  }
  
  const supabase = createAdminClient()
  
  // Get all unique card names from ref_cards
  const { data, error } = await supabase
    .from('ref_cards')
    .select('name')
    .order('name')
  
  if (error) {
    console.error('[cards/names] Error fetching card names:', error)
    return NextResponse.json({ error: 'Failed to fetch card names' }, { status: 500 })
  }
  
  const names = data.map(row => row.name)
  
  // Update cache
  cachedNames = names
  cacheTime = Date.now()
  
  return NextResponse.json(
    { names },
    { 
      headers: { 
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' 
      } 
    }
  )
}
