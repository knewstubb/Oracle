import { describe, expect, it, vi } from 'vitest'
import { countsAsSleeved, isGenericSlot, pickGenericArt, getBasicLandDefaultScryfallId } from '@/lib/basic-lands'
import { computeDeckReadiness } from '@/lib/deck-readiness'
import { GenericBasicsError, setGenericBasicCount, updateGenericLine, type GenericClient } from '@/lib/generic-basics'
import { shortGenericsText } from '@/components/PicklistV2'

const ISLAND_ART = 'island-art-1'

/** A tiny fake admin client: records the RPC call and the deck_cards update filters. No database is touched. */
function fakeClient(opts: { printingName?: string; updated?: number } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: { count: 3 }, error: null })
  const filters: Array<[string, unknown]> = []
  const updates: unknown[] = []
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (k: string, v: unknown) => {
      filters.push([k, v])
      return q
    }
    q.maybeSingle = () =>
      Promise.resolve({
        data: table === 'ref_printings' ? { scryfall_id: ISLAND_ART, name: opts.printingName ?? 'Island', set_code: 'znr' } : null,
        error: null,
      })
    q.update = (u: unknown) => {
      updates.push(u)
      return {
        eq: (k: string, v: unknown) => {
          filters.push([k, v])
          const u2: Record<string, unknown> = {}
          u2.eq = (k2: string, v2: unknown) => {
            filters.push([k2, v2])
            return u2
          }
          u2.select = () => Promise.resolve({ data: Array.from({ length: opts.updated ?? 2 }, (_, i) => ({ id: i })), error: null })
          return u2
        },
      }
    }
    // user_copies lookup resolves to an empty list
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
    return q
  }
  const client = { from: (t: string) => chain(t), rpc } as unknown as GenericClient
  return { client, rpc, filters, updates }
}

describe('generic helpers', () => {
  it('isGenericSlot reads the flag, not an empty scryfall id', () => {
    expect(isGenericSlot({ is_generic: true })).toBe(true)
    expect(isGenericSlot({ is_generic: false })).toBe(false)
    expect(isGenericSlot(null)).toBe(false)
  })

  it('countsAsSleeved: copy, sleeved generic yes; unsleeved generic no', () => {
    expect(countsAsSleeved({ copy_id: 5 })).toBe(true)
    expect(countsAsSleeved({ is_generic: true, generic_sleeved: true })).toBe(true)
    expect(countsAsSleeved({ is_generic: true })).toBe(true)
    expect(countsAsSleeved({ is_generic: true, generic_sleeved: false })).toBe(false)
    expect(countsAsSleeved({ copy_id: null })).toBe(false)
  })

  it('pickGenericArt: seeded random among owned; none owned falls back to the default', () => {
    expect(pickGenericArt('Island', ['a', 'b', 'c'], () => 0)).toBe('a')
    expect(pickGenericArt('Island', ['a', 'b', 'c'], () => 0.99)).toBe('c')
    expect(pickGenericArt('Island', [], () => 0.5)).toBe(getBasicLandDefaultScryfallId('Island'))
  })
})

describe('computeDeckReadiness', () => {
  const copy = (n: number) => Array.from({ length: n }, (_, i) => ({ copy_id: i + 1 }))
  const generics = (n: number, sleeved: boolean) =>
    Array.from({ length: n }, () => ({ is_generic: true, generic_sleeved: sleeved }))

  it('a complete deck with sleeved generics is Playable; sleeved count includes them', () => {
    const r = computeDeckReadiness([...copy(64), ...generics(36, true)], 100)
    expect(r).toMatchObject({ size: 100, sleeved: 100, state: 'playable' })
  })

  it('unsleeved generics make a complete deck Assembling, counted toward size not sleeved', () => {
    const r = computeDeckReadiness([...copy(64), ...generics(36, false)], 100)
    expect(r).toMatchObject({ size: 100, sleeved: 64, unsleevedGenerics: 36, state: 'assembling' })
  })

  it('an incomplete deck is a draft', () => {
    expect(computeDeckReadiness([...copy(10)], 100).state).toBe('draft')
  })
})

describe('shortGenericsText', () => {
  it('names each basic', () => {
    expect(shortGenericsText(['Island'])).toBe('Short: Island generics unsleeved')
    expect(shortGenericsText(['Island', 'Swamp'])).toBe('Short: Island, Swamp generics unsleeved')
    expect(shortGenericsText([])).toBeNull()
  })
})

describe('setGenericBasicCount', () => {
  it('rejects bad names and counts before calling the database', async () => {
    const { client, rpc } = fakeClient()
    await expect(setGenericBasicCount(client, { deckId: 1, userId: 'u', cardName: 'Sol Ring', count: 1 })).rejects.toBeInstanceOf(GenericBasicsError)
    await expect(setGenericBasicCount(client, { deckId: 1, userId: 'u', cardName: 'Island', count: -1 })).rejects.toBeInstanceOf(GenericBasicsError)
    await expect(setGenericBasicCount(client, { deckId: 1, userId: 'u', cardName: 'Island', count: 1.5 })).rejects.toBeInstanceOf(GenericBasicsError)
    await expect(setGenericBasicCount(client, { deckId: 1, userId: 'u', cardName: 'Island', count: 1, finish: 'sparkly' })).rejects.toBeInstanceOf(GenericBasicsError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('stores default art at write time and scopes the call to the user', async () => {
    const { client, rpc } = fakeClient()
    await setGenericBasicCount(client, { deckId: 7, userId: 'owner-1', cardName: 'Island', count: 4 })
    expect(rpc).toHaveBeenCalledWith(
      'set_generic_basic_count',
      expect.objectContaining({ p_deck_id: 7, p_user_id: 'owner-1', p_card_name: 'Island', p_count: 4 })
    )
    const args = rpc.mock.calls[0][1]
    expect(args.p_scryfall_id).toBe(getBasicLandDefaultScryfallId('Island'))
  })

  it('rejects art that is not a printing of that basic', async () => {
    const { client, rpc } = fakeClient({ printingName: 'Forest' })
    await expect(
      setGenericBasicCount(client, { deckId: 1, userId: 'u', cardName: 'Island', count: 1, scryfallId: ISLAND_ART })
    ).rejects.toMatchObject({ status: 400 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps a missing deck to 404', async () => {
    const { client, rpc } = fakeClient()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'deck_not_found' } })
    await expect(setGenericBasicCount(client, { deckId: 9, userId: 'u', cardName: 'Island', count: 1 })).rejects.toMatchObject({ status: 404 })
  })
})

describe('updateGenericLine', () => {
  it('sleeves the whole line, scoped by deck, user, generic flag and name', async () => {
    const { client, filters, updates } = fakeClient({ updated: 3 })
    const result = await updateGenericLine(client, { deckId: 5, userId: 'owner-1', cardName: 'Island', sleeved: false })
    expect(result).toEqual({ updated: 3 })
    expect(updates[0]).toEqual({ generic_sleeved: false })
    expect(filters).toEqual(
      expect.arrayContaining([
        ['deck_id', 5],
        ['user_id', 'owner-1'],
        ['is_generic', true],
        ['card_name', 'Island'],
      ])
    )
  })

  it('refuses copy-like or flag keys and empty updates', async () => {
    const { client } = fakeClient()
    await expect(
      updateGenericLine(client, { deckId: 1, userId: 'u', cardName: 'Island', sleeved: true, extra: { copy_id: 3 } })
    ).rejects.toMatchObject({ status: 400 })
    await expect(updateGenericLine(client, { deckId: 1, userId: 'u', cardName: 'Island' })).rejects.toMatchObject({ status: 400 })
  })

  it('returns 404 when the user has no such generic line', async () => {
    const { client } = fakeClient({ updated: 0 })
    await expect(updateGenericLine(client, { deckId: 1, userId: 'other', cardName: 'Island', sleeved: true })).rejects.toMatchObject({ status: 404 })
  })
})
