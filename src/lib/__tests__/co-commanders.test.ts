/**
 * Two commanders (partner, partner with, friends forever, doctor's companion, background) are equals:
 * colour identity = all commanders together, never the companion. Mock-only (no database).
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase } from '@/test/fake-supabase'

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/test/fake-supabase').fakeSupabase> }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'u1' }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/command-zone-pair-check', () => ({ checkSecondCommanderPair: async (_s: unknown, _d: unknown, _u: unknown, req: { secondRole: string | null }) => ({ ok: true, secondRole: req.secondRole ?? 'partner' }) }))

import { PUT } from '@/app/api/decks/[id]/command-zone/route'
import { GET as legalityGET } from '@/app/api/decks/[id]/legality/route'
import { syncDeckColourIdentity, loadDeckCommanders } from '@/lib/deck-colour-identity'
import { findCommanderCards } from '@/lib/commander-card-flag'
import { loadCommanderColours, type LookupClient } from '@/lib/owned-copy-lookup'
import { saveImportColourIdentity } from '@/lib/import-command-zone-save'
import { commanderChipText } from '@/lib/command-zone'
import { buildDeckChatPrompt } from '@/lib/deck-chat-prompt'
import { formatDeckSlotFactsForPrompt, buildDeckSlotFacts } from '@/lib/deck-chat-facts'

const world = () => ({
  decks: [{ id: 7, user_id: 'u1', format: 'commander', commander_name: 'Tymna the Weaver', colour_identity: 'WB' }],
  ref_cards: [
    { name: 'Tymna the Weaver', color_identity: 'W, B', commander_legal: true },
    { name: 'Thrasios, Triton Hero', color_identity: 'G, U', commander_legal: true },
    { name: 'Yorion, Sky Nomad', color_identity: 'W, U', commander_legal: true },
    { name: 'Rhystic Study', color_identity: 'U', commander_legal: true },
    { name: 'Sylvan Library', color_identity: 'G', commander_legal: true },
    { name: 'Sol Ring', color_identity: '', commander_legal: true },
  ],
  deck_cards: [
    { id: 1, deck_id: 7, user_id: 'u1', card_name: 'Tymna the Weaver', quantity: 1, categories: '["Creature"]', is_commander: true, command_zone_role: null },
    { id: 2, deck_id: 7, user_id: 'u1', card_name: 'Thrasios, Triton Hero', quantity: 1, categories: '["Creature"]', is_commander: true, command_zone_role: 'partner' },
    { id: 3, deck_id: 7, user_id: 'u1', card_name: 'Yorion, Sky Nomad', quantity: 1, categories: '["Sideboard"]', is_commander: false, command_zone_role: 'companion' },
    { id: 4, deck_id: 7, user_id: 'u1', card_name: 'Rhystic Study', quantity: 1, categories: '["Enchantment"]', is_commander: false, command_zone_role: null },
    { id: 5, deck_id: 7, user_id: 'u1', card_name: 'Sylvan Library', quantity: 1, categories: '["Enchantment"]', is_commander: false, command_zone_role: null },
    { id: 6, deck_id: 7, user_id: 'u1', card_name: 'Sol Ring', quantity: 1, categories: '["Artifact"]', is_commander: false, command_zone_role: null },
  ],
})

const params = { params: Promise.resolve({ id: '7' }) }

describe('partner pair colour union across the writers and readers', () => {
  it('command-zone PUT stores the union of both commanders (companion Yorion ignored)', async () => {
    h.db = fakeSupabase(world())
    h.db.tables.decks[0].colour_identity = ''
    const res = await PUT(new NextRequest('http://x/api', { method: 'PUT', body: JSON.stringify({ primaryCardId: 1, secondCardId: 2, secondRole: 'partner', companionCardId: 3 }) }), params)
    expect(res.status).toBe(200)
    expect(h.db.tables.decks[0].colour_identity).toBe('WUBG')
  })

  it('syncDeckColourIdentity fixes a stale single-commander value', async () => {
    h.db = fakeSupabase(world())
    expect(await syncDeckColourIdentity(h.db.client as never, 7, 'u1')).toBe('WUBG')
    expect(h.db.tables.decks[0].colour_identity).toBe('WUBG')
  })

  it('loadDeckCommanders lists both commanders as equals and never the companion', async () => {
    h.db = fakeSupabase(world())
    const info = await loadDeckCommanders(h.db.client as never, 7, 'u1')
    expect(info?.names.sort()).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver'])
    expect(info?.identity).toBe('WUBG')
  })

  it('import with two commanders writes both commanders colours', async () => {
    h.db = fakeSupabase(world())
    h.db.tables.decks[0].colour_identity = ''
    await saveImportColourIdentity(h.db.client as never, 7, 'u1', { primary: 'Tymna the Weaver', second: 'Thrasios, Triton Hero', secondRole: 'partner', companion: 'Yorion, Sky Nomad', notes: [] })
    expect(h.db.tables.decks[0].colour_identity).toBe('WUBG')
  })

  it('legality: two valid partners show no colour error even when the stored value is stale', async () => {
    h.db = fakeSupabase(world()) // stored 'WB' is stale: Rhystic (U) and Sylvan (G) must still be fine
    const res = await legalityGET(new NextRequest('http://x/api'), params)
    const body = await res.json()
    expect(body.issues).toEqual([])
    expect(body.isLegal).toBe(true)
  })

  it('legality: a card outside BOTH commanders is still flagged', async () => {
    h.db = fakeSupabase(world())
    h.db.tables.ref_cards.push({ name: 'Lightning Bolt', color_identity: 'R', commander_legal: true })
    h.db.tables.deck_cards.push({ id: 9, deck_id: 7, user_id: 'u1', card_name: 'Lightning Bolt', quantity: 1, categories: '["Instant"]', is_commander: false, command_zone_role: null })
    const body = await (await legalityGET(new NextRequest('http://x/api'), params)).json()
    expect(body.issues).toHaveLength(1)
    expect(body.issues[0]).toMatchObject({ cardName: 'Lightning Bolt', reason: 'color_identity' })
  })

  it('assistant colour lookup (owned-copy / spare browse) uses both commanders, not the companion', async () => {
    const w = world()
    const db = fakeSupabase({
      ...w,
      ref_printings: [
        { name: 'Tymna the Weaver', color_identity: ['W', 'B'] },
        { name: 'Thrasios, Triton Hero', color_identity: ['G', 'U'] },
        { name: 'Yorion, Sky Nomad', color_identity: ['W', 'U'] },
      ],
    })
    expect(await loadCommanderColours(db.client as unknown as LookupClient, 7)).toEqual(['B', 'G', 'U', 'W'])
  })
})

describe('commander section fallback and wording', () => {
  const rows = world().deck_cards

  it('old deck with only commander_name finds that card; both commanders found when only the partner is flagged', () => {
    const old = rows.map((r) => ({ ...r, is_commander: false, command_zone_role: null }))
    expect(findCommanderCards(old, 'Tymna the Weaver').map((r) => r.id)).toEqual([1])
    const onlyPartnerFlagged = rows.map((r) => (r.id === 1 ? { ...r, is_commander: false } : r))
    expect(findCommanderCards(onlyPartnerFlagged, 'Tymna the Weaver').map((r) => r.id).sort()).toEqual([1, 2])
    expect(findCommanderCards(rows, 'Tymna the Weaver').map((r) => r.id).sort()).toEqual([1, 2])
  })

  it('header chip shows both names; assistant text calls them both commanders', () => {
    expect(commanderChipText(['Tymna the Weaver', 'Thrasios, Triton Hero'])).toBe('Commander · Tymna the Weaver + Thrasios, Triton Hero')
    expect(commanderChipText([null])).toBeNull()
    const p = buildDeckChatPrompt('D', 'Tymna the Weaver', 'commander', 100, [], '', { commanderNames: ['Tymna the Weaver', 'Thrasios, Triton Hero'], colourIdentity: 'WUBG' })
    expect(p).toMatch(/Commanders: Tymna the Weaver and Thrasios, Triton Hero/)
    expect(p).toMatch(/colour identity: WUBG/)
    expect(p).not.toMatch(/primary|secondary/i)
    const facts = formatDeckSlotFactsForPrompt(buildDeckSlotFacts(rows.map((r) => ({ ...r, copy_id: null, scryfall_id: null, is_proxy: null })) as never, 'commander', 'Tymna the Weaver'))
    expect(facts).toMatch(/INCLUDES the commanders/)
  })
})
