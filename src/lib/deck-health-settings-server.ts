/**
 * Server side of Deck settings > Deck health: reads and writes the deck's health settings.
 * The stored tables come from a draft change the owner applies later (supabase/drafts/20261121100000_deck_health_settings),
 * so every read and write has to work before it exists: a missing table is a normal state ("not available yet"), never an error.
 * Writes go only through the route, which checks the owner. Switching mode never deletes custom rows.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_SETTINGS,
  OVERRIDE_PREFIX,
  RANGED_KINDS,
  UNAVAILABLE_SETTINGS,
  categoryKey,
  validateCategoryName,
  validateRange,
  type CustomCategory,
  type HealthMode,
  type HealthSettings,
} from './deck-health-settings'
import type { RangedKind } from './deck-health'

interface DbError {
  code?: string
  message?: string
}
/** Postgres says the table is not there (before the owner applies the change). */
export function isMissingTable(err: DbError | null | undefined): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === 'PGRST205') return true
  return /relation .* does not exist|could not find the table/i.test(err.message ?? '')
}

interface CategoryRow {
  id: number
  kind: string | null
  name: string
  min_cards: number | null
  max_cards: number | null
  proposed_min: number | null
  proposed_max: number | null
  sort_order: number | null
}
const COLS = 'id, kind, name, min_cards, max_cards, proposed_min, proposed_max, sort_order'

export type LoadSettingsResult = { ok: true; settings: HealthSettings } | { ok: false; error: string }

export function toSettings(mode: string | null | undefined, rows: CategoryRow[]): HealthSettings {
  const overrides: HealthSettings['overrides'] = {}
  const categories: CustomCategory[] = []
  for (const r of [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)) {
    if (r.kind) {
      if ((RANGED_KINDS as readonly string[]).includes(r.kind) && r.min_cards !== null && r.max_cards !== null) overrides[r.kind as RangedKind] = { min: r.min_cards, max: r.max_cards }
      continue
    }
    categories.push({
      id: r.id,
      name: r.name,
      min: r.min_cards,
      max: r.max_cards,
      proposed: r.proposed_min !== null && r.proposed_max !== null ? { min: r.proposed_min, max: r.proposed_max } : null,
    })
  }
  return { available: true, mode: mode === 'custom' ? 'custom' : 'default', overrides, categories }
}

export async function loadHealthSettings(supabase: SupabaseClient, userId: string, deckId: number): Promise<LoadSettingsResult> {
  const s = await supabase.from('deck_health_settings').select('mode').eq('deck_id', deckId).eq('user_id', userId).maybeSingle()
  if (s.error) return isMissingTable(s.error) ? { ok: true, settings: UNAVAILABLE_SETTINGS } : { ok: false, error: s.error.message ?? 'Could not load targets' }
  const c = await supabase.from('deck_health_categories').select(COLS).eq('deck_id', deckId).eq('user_id', userId)
  if (c.error) return isMissingTable(c.error) ? { ok: true, settings: UNAVAILABLE_SETTINGS } : { ok: false, error: c.error.message ?? 'Could not load targets' }
  return { ok: true, settings: toSettings((s.data as { mode?: string } | null)?.mode ?? DEFAULT_SETTINGS.mode, (c.data ?? []) as CategoryRow[]) }
}

export type HealthSettingsAction =
  | { action: 'set_mode'; mode: HealthMode }
  | { action: 'set_override'; kind: RangedKind; min: number; max: number }
  | { action: 'clear_override'; kind: RangedKind }
  | { action: 'add_category'; name: string; min?: number | null; max?: number | null }
  | { action: 'rename_category'; id: number; name: string }
  | { action: 'remove_category'; id: number }
  | { action: 'set_range'; id: number; min: number; max: number }
  | { action: 'confirm_proposal'; id: number }
  | { action: 'decline_proposal'; id: number }

export type ParseResult = { ok: true; value: HealthSettingsAction } | { ok: false; error: string }

export function parseAction(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Nothing to save.' }
  const b = body as Record<string, unknown>
  const id = () => (typeof b.id === 'number' && Number.isInteger(b.id) && b.id > 0 ? b.id : null)
  const kind = () => (typeof b.kind === 'string' && (RANGED_KINDS as readonly string[]).includes(b.kind) ? (b.kind as RangedKind) : null)
  switch (b.action) {
    case 'set_mode':
      return b.mode === 'default' || b.mode === 'custom' ? { ok: true, value: { action: 'set_mode', mode: b.mode } } : { ok: false, error: 'Pick Default values or Custom categories.' }
    case 'set_override': {
      const k = kind()
      if (!k) return { ok: false, error: 'Unknown category.' }
      const r = validateRange(b.min, b.max)
      return r.ok ? { ok: true, value: { action: 'set_override', kind: k, ...r.range } } : r
    }
    case 'clear_override': {
      const k = kind()
      return k ? { ok: true, value: { action: 'clear_override', kind: k } } : { ok: false, error: 'Unknown category.' }
    }
    case 'add_category': {
      const n = validateCategoryName(b.name)
      if (!n.ok) return n
      const hasRange = b.min !== undefined && b.min !== null && b.max !== undefined && b.max !== null
      if (!hasRange) return { ok: true, value: { action: 'add_category', name: n.name } }
      const r = validateRange(b.min, b.max)
      return r.ok ? { ok: true, value: { action: 'add_category', name: n.name, ...r.range } } : r
    }
    case 'rename_category': {
      const i = id()
      const n = validateCategoryName(b.name)
      if (i === null) return { ok: false, error: 'Unknown category.' }
      return n.ok ? { ok: true, value: { action: 'rename_category', id: i, name: n.name } } : n
    }
    case 'remove_category':
    case 'confirm_proposal':
    case 'decline_proposal': {
      const i = id()
      return i === null ? { ok: false, error: 'Unknown category.' } : { ok: true, value: { action: b.action, id: i } }
    }
    case 'set_range': {
      const i = id()
      if (i === null) return { ok: false, error: 'Unknown category.' }
      const r = validateRange(b.min, b.max)
      return r.ok ? { ok: true, value: { action: 'set_range', id: i, ...r.range } } : r
    }
    default:
      return { ok: false, error: 'Unknown change.' }
  }
}

export type SaveSettingsResult =
  | { ok: true; settings: HealthSettings }
  | { ok: false; status: 400 | 404 | 409 | 500 | 503; error: string; available?: false }

const UNAVAILABLE: SaveSettingsResult = { ok: false, status: 503, error: "Saving targets isn't available yet.", available: false }

export async function saveHealthSettings(supabase: SupabaseClient, userId: string, deckId: number, a: HealthSettingsAction, now = new Date()): Promise<SaveSettingsResult> {
  const stamp = now.toISOString()
  const fail = (e: DbError | null): SaveSettingsResult | null => {
    if (!e) return null
    if (isMissingTable(e)) return UNAVAILABLE
    if (e.code === '23505') return { ok: false, status: 409, error: 'This deck already has a category with that name.' }
    return { ok: false, status: 500, error: e.message ?? 'Could not save' }
  }
  const finish = async (): Promise<SaveSettingsResult> => {
    const r = await loadHealthSettings(supabase, userId, deckId)
    return r.ok ? { ok: true, settings: r.settings } : { ok: false, status: 500, error: r.error }
  }
  const own = (id: number) => supabase.from('deck_health_categories').select(COLS).eq('id', id).eq('deck_id', deckId).eq('user_id', userId).is('kind', null).maybeSingle()

  if (a.action === 'set_mode') {
    const e = fail((await supabase.from('deck_health_settings').upsert({ deck_id: deckId, user_id: userId, mode: a.mode, updated_at: stamp }, { onConflict: 'deck_id' })).error)
    return e ?? finish()
  }
  if (a.action === 'set_override') {
    const row = { deck_id: deckId, user_id: userId, kind: a.kind, name: `${OVERRIDE_PREFIX}${a.kind}`, min_cards: a.min, max_cards: a.max, updated_at: stamp }
    const e = fail((await supabase.from('deck_health_categories').upsert(row, { onConflict: 'deck_id,kind' })).error)
    return e ?? finish()
  }
  if (a.action === 'clear_override') {
    const e = fail((await supabase.from('deck_health_categories').delete().eq('deck_id', deckId).eq('user_id', userId).eq('kind', a.kind)).error)
    return e ?? finish()
  }
  if (a.action === 'add_category') {
    const existing = await supabase.from('deck_health_categories').select(COLS).eq('deck_id', deckId).eq('user_id', userId).is('kind', null)
    const ef = fail(existing.error)
    if (ef) return ef
    const rows = (existing.data ?? []) as CategoryRow[]
    if (rows.some((r) => categoryKey(r.name) === categoryKey(a.name))) return { ok: false, status: 409, error: 'This deck already has a category with that name.' }
    const sort = rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 1
    const e = fail(
      (await supabase.from('deck_health_categories').insert({ deck_id: deckId, user_id: userId, kind: null, name: a.name, min_cards: a.min ?? null, max_cards: a.max ?? null, sort_order: sort })).error,
    )
    return e ?? finish()
  }
  // The rest change one custom category: it must exist, on this deck, for this owner.
  const found = await own(a.id)
  const ff = fail(found.error)
  if (ff) return ff
  const row = found.data as CategoryRow | null
  if (!row) return { ok: false, status: 404, error: 'Category not found' }
  const table = () => supabase.from('deck_health_categories')
  const scope = <T extends { eq: (k: string, v: unknown) => T }>(q: T) => q.eq('id', a.id).eq('deck_id', deckId).eq('user_id', userId)
  if (a.action === 'remove_category') {
    const e = fail((await scope(table().delete())).error)
    return e ?? finish()
  }
  if (a.action === 'rename_category') {
    const others = await supabase.from('deck_health_categories').select('id, name').eq('deck_id', deckId).eq('user_id', userId).is('kind', null)
    const of = fail(others.error)
    if (of) return of
    if (((others.data ?? []) as { id: number; name: string }[]).some((r) => r.id !== a.id && categoryKey(r.name) === categoryKey(a.name))) return { ok: false, status: 409, error: 'This deck already has a category with that name.' }
    const e = fail((await scope(table().update({ name: a.name, updated_at: stamp }))).error)
    return e ?? finish()
  }
  if (a.action === 'set_range') {
    const e = fail((await scope(table().update({ min_cards: a.min, max_cards: a.max, updated_at: stamp }))).error)
    return e ?? finish()
  }
  if (a.action === 'confirm_proposal') {
    if (row.proposed_min === null || row.proposed_max === null) return { ok: false, status: 409, error: 'There is no proposal to confirm.' }
    const e = fail((await scope(table().update({ min_cards: row.proposed_min, max_cards: row.proposed_max, proposed_min: null, proposed_max: null, proposed_by: null, updated_at: stamp }))).error)
    return e ?? finish()
  }
  // decline_proposal
  const e = fail((await scope(table().update({ proposed_min: null, proposed_max: null, proposed_by: null, updated_at: stamp }))).error)
  return e ?? finish()
}
