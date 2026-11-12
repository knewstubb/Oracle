import { describe, it, expect, vi } from 'vitest'

vi.mock('./mcp-client', () => ({ getMcpClient: vi.fn() }))
vi.mock('./supabase', () => ({ createAdminClient: vi.fn(() => { throw new Error('no real DB in tests') }) }))

import {
  DECK_CHAT_CONTEXT,
  DECK_CHAT_EDIT_TOOLS_ENV,
  getToolDefinitionsForContext,
  isDeckChatEditToolsEnabled,
  isToolAllowedInContext,
} from './tool-registry'
import { buildDeckChatPrompt } from './deck-chat-prompt'

const EDIT = ['add_cards_to_deck', 'remove_cards_from_deck', 'update_deck_card']
const names = (o?: { deckChatEditEnabled?: boolean }) =>
  getToolDefinitionsForContext(DECK_CHAT_CONTEXT, o).map(t => t.name)

describe('deck chat edit tools gate', () => {
  it('is off by default', () => {
    expect(isDeckChatEditToolsEnabled({})).toBe(false)
    expect(isDeckChatEditToolsEnabled({ [DECK_CHAT_EDIT_TOOLS_ENV]: 'false' })).toBe(false)
    expect(isDeckChatEditToolsEnabled({ [DECK_CHAT_EDIT_TOOLS_ENV]: '1' })).toBe(false)
  })

  it('can be switched on with the one setting', () => {
    expect(isDeckChatEditToolsEnabled({ [DECK_CHAT_EDIT_TOOLS_ENV]: 'true' })).toBe(true)
  })

  it('hides edit tools from the deck chat when off, keeps read tools', () => {
    const off = names({ deckChatEditEnabled: false })
    for (const t of EDIT) expect(off).not.toContain(t)
    expect(off).toContain('get_deck_cards')
  })

  it('offers edit tools again when switched on (ability kept)', () => {
    const on = names({ deckChatEditEnabled: true })
    expect(on).toContain('add_cards_to_deck')
    expect(on).toContain('remove_cards_from_deck')
  })

  it('refuses edit tools at dispatch when off, allows others', () => {
    expect(isToolAllowedInContext('add_cards_to_deck', DECK_CHAT_CONTEXT, { deckChatEditEnabled: false })).toBe(false)
    expect(isToolAllowedInContext('add_cards_to_deck', DECK_CHAT_CONTEXT, { deckChatEditEnabled: true })).toBe(true)
    expect(isToolAllowedInContext('get_deck_cards', DECK_CHAT_CONTEXT, { deckChatEditEnabled: false })).toBe(true)
  })

  it('does not change other contexts', () => {
    expect(isToolAllowedInContext('add_cards_to_deck', 'exploration')).toBe(false)
    expect(isToolAllowedInContext('add_cards_to_deck', 'workbench')).toBe(true)
  })
})

describe('deck chat prompt', () => {
  const build = (editToolsEnabled: boolean) =>
    buildDeckChatPrompt('Rocco', 'Rocco', 'commander', 1, [{ name: 'Sol Ring', category: 'Ramp', quantity: 1 }], '', { editToolsEnabled })

  it('proposes cards by default wording (the chat cannot add, only the owner can)', () => {
    const p = build(false)
    expect(p).toContain('PROPOSING CARDS')
    expect(p).toContain('You cannot add anything yourself')
    expect(p).not.toContain('You cannot change the deck')
  })

  it('drops the suggest-only block when edit tools are on', () => {
    expect(build(true)).not.toContain('PROPOSING CARDS')
  })
})
