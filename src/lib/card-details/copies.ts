/**
 * Pure shaping of the user's physical copies of one card (matched on oracle_id, any printing) for the Copies tab.
 * State words follow the allocation convention: Open (free copy in storage), Claimed (held by another deck),
 * Proxy, In this deck. Actions: Sleeve here (Open copy), Move here (copy in another deck, slot Planned).
 */
import type { MoveHereDeckState } from '@/lib/move-here'
import type { CopyState } from './labels'

export interface CopyRow {
  id: number
  is_proxy: boolean
  missing: boolean | null
  condition: string | null
  finish: string | null
  printing_id: string | null
  /** The deck slot this copy sits in, if any. */
  deck_cards: Array<{ id: number; deck_id: number }> | null
  location: { name: string } | null
}

export interface DeckInfo {
  name: string
  state: MoveHereDeckState
}

export type CopyAction = 'sleeve_here' | 'move_here' | 'swap_in' | null

export interface CopyView {
  copyId: number
  isProxy: boolean
  finish: string | null
  condition: string | null
  printingId: string | null
  /** Set code and collector number of the copy's printing, when known. */
  printing: { setCode: string; collectorNumber: string } | null
  where: { kind: 'deck'; deckId: number; deckName: string; deckState: MoveHereDeckState } | { kind: 'storage'; name: string | null }
  state: CopyState
  action: CopyAction
}

export function shapeCopies(
  rows: readonly CopyRow[],
  opts: {
    deckId: number
    /** The copy now sleeved in the slot being viewed, or null when the slot is Planned. */
    slotCopyId: number | null
    decks: ReadonlyMap<number, DeckInfo>
    printings: ReadonlyMap<string, { setCode: string; collectorNumber: string }>
  },
): CopyView[] {
  const slotPlanned = opts.slotCopyId === null
  const out: CopyView[] = rows.map((row) => {
    const dc = row.deck_cards?.[0] ?? null
    const printing = row.printing_id ? opts.printings.get(row.printing_id) ?? null : null
    let where: CopyView['where']
    let state: CopyState
    let action: CopyAction = null
    if (dc) {
      const info = opts.decks.get(dc.deck_id)
      where = { kind: 'deck', deckId: dc.deck_id, deckName: info?.name ?? `Deck ${dc.deck_id}`, deckState: info?.state ?? 'brewing' }
    } else {
      where = { kind: 'storage', name: row.location?.name ?? null }
    }
    if (row.missing) {
      state = 'missing'
    } else if (dc && row.id === opts.slotCopyId) {
      state = 'in_this_deck'
    } else if (dc && dc.deck_id === opts.deckId) {
      // Sleeved in another slot of this same deck (a deck wanting two copies): not movable here.
      state = 'in_this_deck'
    } else if (dc) {
      if (row.is_proxy) state = 'proxy_elsewhere'
      else {
        state = 'claimed'
        if (slotPlanned) action = 'move_here'
      }
    } else {
      state = 'open'
      action = slotPlanned ? 'sleeve_here' : 'swap_in'
    }
    return {
      copyId: row.id,
      isProxy: row.is_proxy,
      finish: row.finish,
      condition: row.condition,
      printingId: row.printing_id,
      printing,
      where,
      state,
      action,
    }
  })
  const rank = (c: CopyView) => (c.state === 'in_this_deck' ? 0 : c.state === 'open' ? 1 : c.state === 'claimed' ? 2 : c.state === 'proxy_elsewhere' ? 3 : 4)
  return out.sort((a, b) => rank(a) - rank(b) || a.copyId - b.copyId)
}
