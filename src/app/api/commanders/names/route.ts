/**
 * GET /api/commanders/names
 * 
 * Returns a list of all legal commander names from ref_commanders.
 * Used for client-side validation of quick build buttons.
 * Cached heavily since commander legality doesn't change often.
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
  
  // Get all legal commander names
  const { data, error } = await supabase
    .from('ref_commanders')
    .select('display_name')
    .eq('legal_commander', true)
    .order('display_name')
  
  if (error) {
    console.error('[commanders/names] Error fetching commander names:', error)
    return NextResponse.json({ error: 'Failed to fetch commander names' }, { status: 500 })
  }
  
  const names = data.map(row => row.display_name)
  
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
