/**
 * Saving the command zone chosen on the import review (contract command-zone-roles §4, slice 7).
 * The owner's picks arrive as card NAMES: a commander, an optional second commander, an optional companion.
 * The pair is re-checked here against card text (the review's tick can be stale), and an illegal second commander
 * is dropped with a plain note rather than failing the whole import.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifySecondCommander, secondRoleFor, type PairCardFacts } from '@/lib/commander-pairing'
import { COMPANION_CATEGORY } from '@/lib/command-zone'
import { lookupDeckColourIdentity } from '@/lib/deck-colour-identity'

export interface ImportCommandZone {
  commander?: string | null
  second?: string | null
  companion?: string | null
}

export interface ResolvedImportZone {
  primary: string | null
  second: string | null
  secondRole: 'partner' | 'background' | null
  companion: string | null
  notes: string[]
}

/** Reads and trims the request value; anything that is not a short string is ignored. */
export function parseImportCommandZone(raw: unknown): ImportCommandZone | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() !== '' && v.length <= 200 ? v.trim() : null)
  const zone = { commander: pick(r.commander), second: pick(r.second), companion: pick(r.companion) }
  return zone.commander || zone.second || zone.companion ? zone : undefined
}

export async function resolveImportCommandZone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  zone: ImportCommandZone | undefined
): Promise<ResolvedImportZone> {
  const out: ResolvedImportZone = { primary: zone?.commander ?? null, second: null, secondRole: null, companion: null, notes: [] }
  if (!zone) return out
  // A companion is never the commander or the second commander.
  if (zone.companion && zone.companion !== zone.commander && zone.companion !== zone.second) out.companion = zone.companion

  if (zone.second && zone.commander && zone.second !== zone.commander) {
    const { data } = await supabase.from('ref_cards').select('name, type_line, oracle_text').in('name', [zone.commander, zone.second])
    const byName = new Map<string, PairCardFacts>()
    for (const f of data ?? []) byName.set((f as PairCardFacts).name as string, f as PairCardFacts)
    const a = byName.get(zone.commander)
    const b = byName.get(zone.second)
    if (!a || !b) {
      out.notes.push(`${zone.second} was not set as a commander because its card details could not be checked. You can set it on the deck page.`)
    } else {
      const role = secondRoleFor(b)
      const verdict = verifySecondCommander(a, b, role)
      if (verdict.ok) {
        out.second = zone.second
        out.secondRole = role
      } else {
        out.notes.push(`${zone.second} was not set as a commander: ${verdict.reason}`)
      }
    }
  }
  return out
}

type RpcRow = Record<string, unknown>

/** Tags the insert rows for the wrapper RPC `import_deck_with_intent_roles`. Pure; returns a note if a row is missing. */
export function tagCommandZoneRows(rows: RpcRow[], zone: ResolvedImportZone): string[] {
  const notes: string[] = []
  const first = (name: string) => rows.find((r) => r.card_name === name)
  if (zone.second) {
    const p = zone.primary ? first(zone.primary) : undefined
    const s = first(zone.second)
    if (p && s && p !== s) {
      p.is_commander = true
      s.is_commander = true
      s.command_zone_role = zone.secondRole
    } else {
      notes.push(`${zone.second} could not be set as a commander because it is not in the deck.`)
    }
  }
  if (zone.companion) {
    const c = first(zone.companion)
    if (c) {
      c.is_commander = false
      c.command_zone_role = 'companion'
      c.categories = JSON.stringify([COMPANION_CATEGORY])
    } else {
      notes.push(`${zone.companion} could not be set as the companion because it is not in the deck.`)
    }
  }
  return notes
}

/** True when the zone has anything beyond a plain commander (the part the existing save does not cover). */
export function hasExtraRoles(zone: ResolvedImportZone): boolean {
  return zone.second !== null || zone.companion !== null
}

/**
 * Legacy (non-intent) save: after the cards are written, find the rows by name and call `set_deck_command_zone`.
 * Not atomic with the import; a failure comes back as a note, the deck itself is already saved.
 */
export async function applyCommandZoneAfterImport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  deckId: number,
  userId: string,
  zone: ResolvedImportZone
): Promise<string[]> {
  if (!hasExtraRoles(zone)) return []
  const names = [zone.primary, zone.second, zone.companion].filter((n): n is string => !!n)
  const { data, error } = await supabase
    .from('deck_cards')
    .select('id, card_name')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .in('card_name', names)
    .order('id')
  if (error) return ['The command zone could not be set after the import. You can set it on the deck page.']
  const idOf = (name: string | null) => (name ? (data ?? []).find((r: { id: number; card_name: string }) => r.card_name === name)?.id ?? null : null)
  const primaryId = idOf(zone.primary)
  const secondId = idOf(zone.second)
  const companionId = idOf(zone.companion)
  if (zone.second && (primaryId === null || secondId === null)) {
    return ['Both commanders could not be set after the import. You can set it on the deck page.']
  }
  const { error: rpcError } = await supabase.rpc('set_deck_command_zone', {
    p_deck_id: deckId,
    p_user_id: userId,
    p_primary_card_id: primaryId,
    p_second_card_id: zone.second ? secondId : null,
    p_second_role: zone.second ? zone.secondRole : null,
    p_companion_card_id: companionId,
  })
  if (rpcError) return ['The command zone could not be set after the import. You can set it on the deck page.']
  return []
}

/**
 * When the owner picked two commanders on the import review, the deck's colour identity is the colours of BOTH
 * (a companion never counts). Best effort: a failed lookup leaves the stored value alone and never fails the import.
 */
export async function saveImportColourIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  deckId: number,
  userId: string,
  zone: ResolvedImportZone
): Promise<void> {
  if (!zone.second || !zone.primary) return
  try {
    const identity = await lookupDeckColourIdentity(supabase, [zone.primary, zone.second])
    if (identity === null) return
    await supabase.from('decks').update({ colour_identity: identity }).eq('id', deckId).eq('user_id', userId)
  } catch {
    // ignored on purpose
  }
}
