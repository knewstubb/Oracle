/**
 * Does deck_cards.why_here exist yet? The column comes from a draft migration that is applied separately, so the
 * app probes for it. Postgres error 42703 (undefined column) means "not available". Any other error means unknown:
 * treated as not available, logged. The answer is cached for 60 seconds so a later apply shows up without a deploy.
 */
import type { RefClient } from '@/lib/ref-card-text'

export const WHY_MAX_LENGTH = 200
const CACHE_MS = 60_000

let cached: { value: boolean; at: number } | null = null

/** Test helper: forget the cached answer. */
export function resetWhyColumnCache(): void {
  cached = null
}

export async function whyColumnAvailable(supabase: RefClient, now: number = Date.now()): Promise<boolean> {
  if (cached && now - cached.at < CACHE_MS) return cached.value
  const { error } = await supabase.from('deck_cards').select('why_here').limit(1)
  let value: boolean
  if (!error) value = true
  else if ((error as { code?: string }).code === '42703') value = false
  else {
    console.error('[why-column] probe failed, treating Why as not available:', (error as { message?: string }).message)
    value = false
  }
  cached = { value, at: now }
  return value
}

/** Trim and validate a Why line. Empty after trimming means "no Why" (null). */
export function normaliseWhy(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (input === null) return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, error: 'why must be text or null' }
  const trimmed = input.trim()
  if (trimmed.length > WHY_MAX_LENGTH) return { ok: false, error: `why must be ${WHY_MAX_LENGTH} characters or fewer` }
  return { ok: true, value: trimmed === '' ? null : trimmed }
}
