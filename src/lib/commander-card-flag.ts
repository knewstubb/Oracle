/**
 * The commander is a card on the list, flagged `is_commander` (same flag the partner / background
 * path uses; the primary commander keeps command_zone_role NULL). Pure planning plus a thin writer.
 * Only flags are changed: nothing is inserted or deleted.
 */
import { isCompanion, isSecondCommander } from './command-zone'

export interface FlagRow {
  id: number
  card_name: string
  categories?: string | null
  is_commander?: boolean | number | null
  command_zone_role?: string | null
}

function onMainList(r: FlagRow): boolean {
  return !(r.categories ?? '').includes('Maybeboard') && !isCompanion(r)
}

/** Card the deck's commander name refers to: exact name, main list, lowest id, not a partner/background/companion. */
export function findCommanderTarget(rows: FlagRow[], name: string): FlagRow | null {
  return (
    [...rows]
      .sort((a, b) => a.id - b.id)
      .find((r) => r.card_name === name && onMainList(r) && !isSecondCommander(r)) ?? null
  )
}

/** Which row gets the flag and which previous primary commander rows lose it. */
export function planCommanderFlags(rows: FlagRow[], name: string): { targetId: number | null; clearIds: number[] } {
  const target = findCommanderTarget(rows, name)
  if (!target) return { targetId: null, clearIds: [] }
  const clearIds = rows
    .filter((r) => r.id !== target.id && !!r.is_commander && !isCompanion(r) && !isSecondCommander(r))
    .map((r) => r.id)
  return { targetId: target.id, clearIds }
}

/** Minimal Supabase surface used here (the admin client satisfies it). */
interface FlagClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface FlagResult {
  /** The card row now flagged, or null when no card in the main list has that name. */
  markedId: number | null
  error?: string
}

/**
 * Flag the deck card named `name` as the commander and clear the flag on the previous primary commander.
 * The new flag is set first, so a failure part-way never leaves the deck with no commander card.
 * `name === null` clears the primary commander flag (partner/background/companion are untouched).
 */
export async function markCommanderCard(
  supabase: FlagClient,
  deckId: number,
  userId: string,
  name: string | null
): Promise<FlagResult> {
  try {
    const { data, error } = await supabase
      .from('deck_cards')
      .select('id, card_name, categories, is_commander, command_zone_role')
      .eq('deck_id', deckId)
      .eq('user_id', userId)
    if (error) return { markedId: null, error: String(error.message ?? error) }
    const rows = (data ?? []) as FlagRow[]

    const plan = name === null
      ? {
          targetId: null as number | null,
          clearIds: rows
            .filter((r) => !!r.is_commander && !isCompanion(r) && !isSecondCommander(r))
            .map((r) => r.id),
        }
      : planCommanderFlags(rows, name)

    if (plan.targetId !== null) {
      const { error: setErr } = await supabase
        .from('deck_cards')
        .update({ is_commander: true, command_zone_role: null })
        .eq('id', plan.targetId)
        .eq('deck_id', deckId)
        .eq('user_id', userId)
      if (setErr) return { markedId: null, error: String(setErr.message ?? setErr) }
    }
    if (plan.clearIds.length > 0) {
      const { error: clearErr } = await supabase
        .from('deck_cards')
        .update({ is_commander: false })
        .in('id', plan.clearIds)
        .eq('deck_id', deckId)
        .eq('user_id', userId)
      if (clearErr) return { markedId: plan.targetId, error: String(clearErr.message ?? clearErr) }
    }
    return { markedId: plan.targetId }
  } catch (e) {
    return { markedId: null, error: e instanceof Error ? e.message : 'Could not flag the commander card' }
  }
}

/**
 * Commander cards to show in the Commander section and to count: the flagged primary + partner/background
 * rows (never a companion). Old decks with only `commander_name` set fall back to the exact-name card.
 */
export function findCommanderCards<T extends FlagRow>(rows: T[], commanderName?: string | null): T[] {
  const flagged = rows.filter((r) => !!r.is_commander && !isCompanion(r) && onMainList(r))
  if (flagged.length > 0) return flagged
  if (!commanderName) return []
  const byName = findCommanderTarget(rows, commanderName)
  return byName ? [rows.find((r) => r.id === byName.id) as T] : []
}

/**
 * Group helper for the Cards tab: takes the commander card(s) out of whatever group they were in
 * (Creature, a cmc, a colour...) and puts them in a "Commander" group at the top. Works for every
 * group mode. Empty groups left behind are dropped. Cards already in a group literally called
 * "Commander" are merged in.
 */
export function withCommanderSection<T extends { id: number }>(
  groups: [string, T[]][],
  commanderCards: T[]
): [string, T[]][] {
  if (commanderCards.length === 0) return groups
  const ids = new Set(commanderCards.map((c) => c.id))
  const rest: [string, T[]][] = []
  const section: T[] = [...commanderCards]
  for (const [name, cards] of groups) {
    const kept = cards.filter((c) => !ids.has(c.id))
    if (name.toLowerCase() === 'commander') {
      section.push(...kept)
    } else if (kept.length > 0) {
      rest.push([name, kept])
    }
  }
  return [['Commander', section], ...rest]
}
