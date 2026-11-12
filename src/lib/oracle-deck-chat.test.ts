import { describe, it, expect, vi } from 'vitest'

const state: { rows: Array<Record<string, unknown>>; joinFails: boolean } = { rows: [], joinFails: false }

function chain(table: string, cols = '') {
  const q: Record<string, unknown> = {}
  const result = () => {
    if (table === 'decks') return { data: { id: 7, name: 'D', commander_name: 'C', colour_identity: 'BG' }, error: null }
    if (table === 'deck_cards') {
      if (cols.includes('user_copies') && state.joinFails) return { data: null, error: { message: 'join failed' } }
      return { data: state.rows, error: null }
    }
    return { data: [], error: null }
  }
  q.eq = () => q
  q.in = () => q
  q.order = () => q
  q.single = () => Promise.resolve(result())
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res)
  return q
}

vi.mock('./mcp-client', () => ({ getMcpClient: vi.fn() }))
vi.mock('./supabase', () => ({
  createAdminClient: vi.fn(() => ({ from: (t: string) => ({ select: (c: string) => chain(t, c) }) })),
}))

import { buildOracleSystemPrompt } from './oracle-prompt'
import {
  DECK_CHAT_CONTEXT,
  executeTool,
  getToolDefinitionsForContext,
  isToolAllowedInContext,
} from './tool-registry'
import { classifyDeckCardCopy } from './deck-chat-facts'

const ctx = { type: 'deck' as const, deckId: 7, deckName: 'D', commanderName: 'C' }
const facts = '=== PROXIES AND GAPS (this deck) ===\nProxies sleeved in this deck (1):\n  - Sol Ring'

describe('oracle assistant prompt with a deck context', () => {
  const off = buildOracleSystemPrompt(ctx, '', null, { deckChat: { editToolsEnabled: false, slotFacts: facts } })

  it('includes the proxy/gap facts block', () => {
    expect(off).toContain('PROXIES AND GAPS')
    expect(off).toContain('Sol Ring')
  })
  it('proposes cards by default: no modify instructions, strict rules present', () => {
    expect(off).not.toContain('=== MODIFYING THE DECK ===')
    expect(off).toContain('PROPOSING CARDS')
    expect(off).toContain('propose_deck_cards')
    expect(off).toContain('Never say a card was added until the owner clicks Add')
  })
  it('has the owned-copy instruction in Spare, another deck, Buy order with warning', () => {
    expect(off).toContain('check_owned_copies')
    expect(off.indexOf('1. Spare')).toBeLessThan(off.indexOf('2. In another deck'))
    expect(off.indexOf('2. In another deck')).toBeLessThan(off.indexOf('3. Buy'))
    expect(off).toContain('ALWAYS show each deck name and its warning')
    expect(off).toContain('estimate')
  })
  it('keeps the modify text (not deleted) when the setting is on, and drops suggest-only', () => {
    const on = buildOracleSystemPrompt(ctx, '', null, { deckChat: { editToolsEnabled: true, slotFacts: facts } })
    expect(on).toContain('=== MODIFYING THE DECK ===')
    expect(on).not.toContain('PROPOSING CARDS')
  })
  it('is unchanged without deck chat options or outside a deck', () => {
    const plain = buildOracleSystemPrompt(ctx, '', null)
    expect(plain).toContain('=== MODIFYING THE DECK ===')
    expect(plain).not.toContain('PROXIES AND GAPS')
    const general = buildOracleSystemPrompt({ type: 'general' }, '', null, { deckChat: { editToolsEnabled: false, slotFacts: facts } })
    expect(general).not.toContain('PROXIES AND GAPS')
  })
})

describe('tools for the assistant with a deck context', () => {
  const names = (o?: { deckChatEditEnabled?: boolean }) => getToolDefinitionsForContext(DECK_CHAT_CONTEXT, o).map(t => t.name)
  it('offers the owned-copy lookup, hides edit tools by default', () => {
    const n = names({ deckChatEditEnabled: false })
    expect(n).toContain('check_owned_copies')
    expect(n).toContain('get_deck_cards')
    for (const t of ['add_cards_to_deck', 'remove_cards_from_deck', 'update_deck_card']) expect(n).not.toContain(t)
  })
  it('edit tools return when switched on', () => {
    expect(names({ deckChatEditEnabled: true })).toContain('add_cards_to_deck')
  })
  it('outside a deck context the lookup is not offered and behaviour is as before', () => {
    expect(getToolDefinitionsForContext('general').map(t => t.name)).not.toContain('check_owned_copies')
    expect(isToolAllowedInContext('add_cards_to_deck', 'workbench')).toBe(true)
    expect(isToolAllowedInContext('add_cards_to_deck', 'general')).toBe(false)
  })
})

describe('classifyDeckCardCopy', () => {
  const base = { card_name: 'Sol Ring', categories: '{"primary_category":"Ramp"}', copy_id: null, scryfall_id: 'x', is_proxy: null }
  it('covers each state', () => {
    expect(classifyDeckCardCopy({ ...base, copy_id: 1, is_proxy: true })).toBe('proxy')
    expect(classifyDeckCardCopy({ ...base, copy_id: 1, is_proxy: false })).toBe('real')
    expect(classifyDeckCardCopy({ ...base, copy_id: 1 })).toBe('unknown')
    expect(classifyDeckCardCopy(base)).toBe('no_copy_sleeved')
    expect(classifyDeckCardCopy({ ...base, card_name: 'Forest', scryfall_id: null })).toBe('generic_basic_land')
    expect(classifyDeckCardCopy({ ...base, categories: '{"primary_category":"Maybeboard"}' })).toBe('maybeboard')
  })
})

describe('get_deck_cards returns copy status', () => {
  const rows = [
    { id: 1, card_name: 'Sol Ring', quantity: 1, categories: '{"primary_category":"Ramp"}', set_code: 'c', scryfall_id: 'a', copy_id: 5, user_copies: { is_proxy: true } },
    { id: 2, card_name: 'Arcane Signet', quantity: 1, categories: '{"primary_category":"Ramp"}', set_code: 'c', scryfall_id: 'b', copy_id: 6, user_copies: { is_proxy: false } },
    { id: 3, card_name: 'Cultivate', quantity: 1, categories: '{"primary_category":"Ramp"}', set_code: 'c', scryfall_id: 'c', copy_id: null, user_copies: null },
  ]
  const run = async () => {
    const res = await executeTool('get_deck_cards', { deck_id: 7 }, { userId: 'u' })
    return JSON.parse(res.content).cards_by_category.Ramp as Array<{ name: string; copy_status: string }>
  }
  it('marks proxy, real and no copy', async () => {
    state.rows = rows; state.joinFails = false
    const cards = await run()
    expect(cards.map(c => c.copy_status)).toEqual(['proxy', 'real', 'no_copy_sleeved'])
  })
  it('says unknown (not real) if the proxy lookup fails', async () => {
    state.rows = rows.map(({ copy_id: _c, user_copies: _u, ...r }) => r); state.joinFails = true
    const cards = await run()
    expect(cards.every(c => c.copy_status === 'unknown')).toBe(true)
  })
})
