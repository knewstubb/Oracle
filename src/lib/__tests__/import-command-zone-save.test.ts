import { describe, it, expect, vi } from 'vitest'
import {
  applyCommandZoneAfterImport,
  hasExtraRoles,
  parseImportCommandZone,
  resolveImportCommandZone,
  tagCommandZoneRows,
  type ResolvedImportZone,
} from '@/lib/import-command-zone-save'

const zone = (o: Partial<ResolvedImportZone>): ResolvedImportZone => ({
  primary: null, second: null, secondRole: null, companion: null, notes: [], ...o,
})

function refClient(rows: Array<{ name: string; type_line: string; oracle_text: string }>) {
  return { from: () => ({ select: () => ({ in: async () => ({ data: rows, error: null }) }) }) } as never
}

describe('parseImportCommandZone', () => {
  it('trims, ignores junk, returns undefined when empty', () => {
    expect(parseImportCommandZone({ commander: ' A ', second: 5, companion: '' })).toEqual({ commander: 'A', second: null, companion: null })
    expect(parseImportCommandZone({})).toBeUndefined()
    expect(parseImportCommandZone('x')).toBeUndefined()
  })
})

describe('resolveImportCommandZone', () => {
  const partnerA = { name: 'A', type_line: 'Legendary Creature', oracle_text: 'Partner' }
  const partnerB = { name: 'B', type_line: 'Legendary Creature', oracle_text: 'Partner' }
  const plain = { name: 'C', type_line: 'Legendary Creature', oracle_text: 'Flying' }
  it('accepts a legal partner pair', async () => {
    const z = await resolveImportCommandZone(refClient([partnerA, partnerB]), { commander: 'A', second: 'B' })
    expect(z).toMatchObject({ primary: 'A', second: 'B', secondRole: 'partner', notes: [] })
  })
  it('drops an illegal pair with a plain note', async () => {
    const z = await resolveImportCommandZone(refClient([partnerA, plain]), { commander: 'A', second: 'C' })
    expect(z.second).toBeNull()
    expect(z.notes[0]).toMatch(/was not set as a second commander/)
  })
  it('drops the second when card details are missing', async () => {
    const z = await resolveImportCommandZone(refClient([partnerA]), { commander: 'A', second: 'B' })
    expect(z.second).toBeNull()
    expect(z.notes).toHaveLength(1)
  })
  it('never makes the commander the companion', async () => {
    const z = await resolveImportCommandZone(refClient([]), { commander: 'A', companion: 'A' })
    expect(z.companion).toBeNull()
  })
  it('keeps a companion without any lookup', async () => {
    const z = await resolveImportCommandZone(refClient([]), { commander: 'A', companion: 'L' })
    expect(z.companion).toBe('L')
    expect(hasExtraRoles(z)).toBe(true)
  })
})

describe('tagCommandZoneRows', () => {
  it('tags second + companion rows', () => {
    const rows: Array<Record<string, unknown>> = [
      { card_name: 'A', is_commander: false }, { card_name: 'B', is_commander: false },
      { card_name: 'L', is_commander: false, categories: '["Creature"]' },
    ]
    const notes = tagCommandZoneRows(rows, zone({ primary: 'A', second: 'B', secondRole: 'background', companion: 'L' }))
    expect(notes).toEqual([])
    expect(rows[0].is_commander).toBe(true)
    expect(rows[1]).toMatchObject({ is_commander: true, command_zone_role: 'background' })
    expect(rows[2]).toMatchObject({ is_commander: false, command_zone_role: 'companion', categories: '["Sideboard"]' })
  })
  it('notes a row that is missing instead of throwing', () => {
    const notes = tagCommandZoneRows([{ card_name: 'A' }], zone({ primary: 'A', second: 'B', secondRole: 'partner', companion: 'L' }))
    expect(notes).toHaveLength(2)
  })
})

describe('applyCommandZoneAfterImport (legacy path)', () => {
  function client(rows: Array<{ id: number; card_name: string }>, rpcError: unknown = null) {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: rpcError })
    const chain: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'in']) chain[k] = () => chain
    chain.order = async () => ({ data: rows, error: null })
    return { rpc, c: { from: () => chain, rpc } as never }
  }
  it('does nothing for a commander-only import', async () => {
    const { rpc, c } = client([])
    expect(await applyCommandZoneAfterImport(c, 1, 'u', zone({ primary: 'A' }))).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
  it('calls set_deck_command_zone with the looked-up ids', async () => {
    const { rpc, c } = client([{ id: 7, card_name: 'A' }, { id: 8, card_name: 'L' }])
    expect(await applyCommandZoneAfterImport(c, 1, 'u', zone({ primary: 'A', companion: 'L' }))).toEqual([])
    expect(rpc).toHaveBeenCalledWith('set_deck_command_zone', {
      p_deck_id: 1, p_user_id: 'u', p_primary_card_id: 7, p_second_card_id: null, p_second_role: null, p_companion_card_id: 8,
    })
  })
  it('turns an RPC failure into a note', async () => {
    const { c } = client([{ id: 7, card_name: 'A' }, { id: 8, card_name: 'L' }], { message: 'x' })
    expect(await applyCommandZoneAfterImport(c, 1, 'u', zone({ primary: 'A', companion: 'L' }))).toHaveLength(1)
  })
})
