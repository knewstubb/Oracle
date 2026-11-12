import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fixtures only. Never the owner's live data.
type Row = Record<string, unknown>
const state = vi.hoisted(() => ({ db: null as unknown, calls: [] as string[] }))

vi.mock('./supabase', () => ({ createAdminClient: vi.fn(() => state.db) }))
vi.mock('./mcp-client', () => ({ getMcpClient: vi.fn() }))

import { guideTargets, type CommanderTargets } from './commander-targets'
import { loadDeckHealth, type HealthClient, type TargetsProvider } from './deck-health-server'
import { loadDeckGap } from './deck-health-gap'
import { composeChatAnswer, loadDeckHealthForChat, summariseGap } from './deck-health-chat'
import { healthChatQuestion } from './deck-health-chat-question'
import {
  DECK_BUILDING_TOOLS,
  DECK_CHAT_CONTEXT,
  DECK_CHAT_ONLY_TOOLS,
  executeTool,
  getToolDefinitionsForContext,
  getToolDefinitions,
  isToolAllowedInContext,
} from './tool-registry'
import { DECK_HEALTH_RULES, SUGGEST_ONLY_RULES, buildDeckChatPrompt } from './deck-chat-prompt'
import { buildDeckChatAdditions } from './oracle-prompt'

vi.mock('./commander-targets-server', () => ({
  getCommanderTargets: vi.fn(async () => guideTargets('General guide')),
}))

/** In-memory fake database that records every call, so a test can prove nothing is written. */
function fakeDb(tables: Record<string, Row[]>): HealthClient {
  return {
    from(table: string) {
      state.calls.push(`from:${table}`)
      let data = [...(tables[table] ?? [])]
      const result = () => ({ data, error: null })
      const q: Record<string, unknown> = {
        select: () => { state.calls.push('select'); return q },
        eq: (col: string, v: unknown) => { data = data.filter((r) => r[col] === v); return q },
        in: (col: string, vs: unknown[]) => { data = data.filter((r) => vs.includes(r[col])); return q },
        ilike: (col: string, pattern: string) => {
          const lower = pattern.toLowerCase()
          const needle = lower.replace(/^%|%$/g, '')
          data = data.filter((r) => (lower.startsWith('%') ? String(r[col]).toLowerCase().includes(needle) : String(r[col]).toLowerCase().startsWith(needle)))
          return q
        },
        or: () => q,
        order: () => q,
        limit: (n: number) => { data = data.slice(0, n); return Promise.resolve(result()) },
        range: (a: number, b: number) => { data = data.slice(a, b + 1); return Promise.resolve(result()) },
        maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      }
      return q
    },
  }
}

const ref = (name: string, ci: string, type: string, text = '') => ({ name, color_identity: ci, type_line: type, oracle_text: text, mana_value: 2, edhrec_rank: 100 })
const dc = (id: number, deck: number, name: string, q = 1, extra: Row = {}) => ({ id, deck_id: deck, card_name: name, quantity: q, is_commander: false, copy_id: null, categories: null, command_zone_role: null, ...extra })

function world(): Record<string, Row[]> {
  return {
    decks: [
      { id: 1, user_id: 'u1', name: 'Mendicant', colour_identity: '', commander_name: 'Mendicant Core' },
      { id: 2, user_id: 'u1', name: 'Korvold', colour_identity: 'BGR' },
      { id: 3, user_id: 'u2', name: 'Their deck', colour_identity: 'R' },
    ],
    deck_cards: [
      dc(1, 1, 'Mendicant Core', 1, { is_commander: true }),
      dc(2, 1, 'In Deck Draw'),
      dc(3, 1, 'Sol Ring'),
      dc(4, 1, 'Mountain', 30),
      dc(7, 2, 'Held Draw', 1, { copy_id: 21 }),
    ],
    ref_printings: [{ name: 'Mendicant Core', color_identity: ['R'] }],
    user_cards: [
      { id: 10, user_id: 'u1', card_name: 'Spare Draw', oracle_id: 'o1' },
      { id: 11, user_id: 'u1', card_name: 'Held Draw', oracle_id: 'o2' },
      { id: 99, user_id: 'u2', card_name: 'Their Draw', oracle_id: 'o9' },
    ],
    user_copies: [
      { id: 20, user_id: 'u1', card_id: 10, is_proxy: false },
      { id: 21, user_id: 'u1', card_id: 11, is_proxy: false },
      { id: 98, user_id: 'u2', card_id: 99, is_proxy: false },
    ],
    ref_cards: [
      ref('Mendicant Core', 'R', 'Legendary Artifact Creature'),
      ref('In Deck Draw', 'R', 'Sorcery', 'Draw two cards.'),
      ref('Sol Ring', '', 'Artifact', '{T}: Add {C}{C}.'),
      ref('Mountain', 'R', 'Basic Land — Mountain'),
      ref('Spare Draw', 'R', 'Sorcery', 'Draw two cards.'),
      ref('Held Draw', 'R', 'Sorcery', 'Draw three cards.'),
      ref('Their Draw', 'R', 'Sorcery', 'Draw two cards.'),
    ],
  }
}

const edhrecTargets: CommanderTargets = {
  ...guideTargets('EDHREC average deck, 12,431 decks'),
  status: 'ok',
  source: 'edhrec_average',
  roles: [
    { role: 'ramp', typical: 10, cardsInRole: 20 },
    { role: 'draw', typical: 8, cardsInRole: 20 },
    { role: 'removal', typical: 8, cardsInRole: 20 },
    { role: 'wipes', typical: 2, cardsInRole: 5 },
  ],
  landsTypical: 36,
}

const fixedTargets = (t: CommanderTargets): TargetsProvider => async () => t
const withoutTime = <T extends { computedAt?: string }>(h: T) => ({ ...h, computedAt: undefined })

beforeEach(() => {
  state.calls = []
  state.db = fakeDb(world())
})

describe('get_deck_health returns the same numbers as the Deck health route', () => {
  for (const [name, targets] of [['EDHREC average deck', edhrecTargets], ['General guide', guideTargets('General guide')]] as const) {
    it(`${name}: roles, typical numbers, verdict and source label match`, async () => {
      const db = fakeDb(world())
      const route = await loadDeckHealth(db, 1, 'u1', { targets: fixedTargets(targets) })
      const chat = await loadDeckHealthForChat(db, 1, 'u1', null, { targets: fixedTargets(targets) })
      if (!route.ok || !chat.ok) throw new Error('expected ok')
      const { chatAnswer, ...chatHealth } = chat.result
      expect(withoutTime(chatHealth)).toEqual(withoutTime(route.health))
      expect(chatAnswer.sourceLine).toBe(targets.sourceLabel)
      expect(chatAnswer.headline).toBe(route.health.verdict.headline)
      expect(chatAnswer.subline).toBe(route.health.verdict.subline)
      expect(chatAnswer.lightRoles.map((r) => r.role)).toEqual(route.health.roles.filter((r) => r.state === 'light').map((r) => r.role))
      expect(chatAnswer.closing).toBe('Prices are estimates.')
    })
  }

  it('shows Light roles with the panel\'s own text and the source label in words', async () => {
    const db = fakeDb(world())
    const chat = await loadDeckHealthForChat(db, 1, 'u1', null, { targets: fixedTargets(edhrecTargets) })
    if (!chat.ok) throw new Error('expected ok')
    const removal = chat.result.roles.find((r) => r.role === 'removal')!
    expect(removal.state).toBe('light')
    expect(chat.result.chatAnswer.lightRoles).toContainEqual({ role: 'removal', text: `Removal: ${removal.text}` })
    expect(chat.result.chatAnswer.sourceLine).toBe('EDHREC average deck, 12,431 decks')
  })

  it('a role question adds that role\'s summary, equal to the gap route (spare, other deck name only, buy ideas)', async () => {
    const db = fakeDb(world())
    const gap = await loadDeckGap(db, 1, 'u1', 'draw', { targets: fixedTargets(guideTargets('General guide')) })
    const chat = await loadDeckHealthForChat(db, 1, 'u1', 'draw', { targets: fixedTargets(guideTargets('General guide')) })
    if (!gap.ok || !chat.ok) throw new Error('expected ok')
    const d = chat.result.roleDetail!
    expect(d).toEqual(summariseGap(gap.gap))
    expect(d.have).toBe(chat.result.roles.find((r) => r.role === 'draw')!.have)
    expect(d.spare.map((c) => c.name)).toEqual(['Spare Draw'])
    expect(d.inAnotherDeck).toEqual([{ name: 'Held Draw', deckName: 'Korvold' }])
    expect(d.buyUnavailableReason).toBe('thin_data')
    expect(d.buyIdeas).toEqual([])
    const text = JSON.stringify(chat.result)
    expect(text).not.toContain('Their Draw')
    expect(text).not.toMatch(/short by one|warning/i)
  })

  it('another user\'s deck is not found; a failure is a real error, not an all-fine answer', async () => {
    const db = fakeDb(world())
    const other = await loadDeckHealthForChat(db, 3, 'u1')
    expect(other).toEqual({ ok: false, status: 404, error: 'Deck not found' })
    const boom = await loadDeckHealthForChat(db, 1, 'u1', null, { targets: async () => { throw new Error('targets down') } })
    expect(boom).toEqual({ ok: false, status: 500, error: 'targets down' })
  })

  it('composeChatAnswer on a well covered deck lists no Light roles', () => {
    const answer = composeChatAnswer({
      verdict: { headline: 'Well covered', subline: '', usingGeneralGuide: false },
      strategy: { state: 'not_set', text: '' },
      sourceLine: 'EDHREC estimate, 900 decks',
      checkState: 'full',
      unclassifiedCount: 0,
      roles: [],
      typeCounts: [],
      typeCountsLabel: '',
      computedAt: '',
    })
    expect(answer.lightRoles).toEqual([])
    expect(answer.sourceLine).toBe('EDHREC estimate, 900 decks')
  })
})

describe('get_deck_health tool: registration and read-only behaviour', () => {
  it('is in DECK_CHAT_ONLY_TOOLS, offered only in the deck chat, and is not an editing tool', () => {
    expect(DECK_CHAT_ONLY_TOOLS.has('get_deck_health')).toBe(true)
    expect(DECK_BUILDING_TOOLS.has('get_deck_health')).toBe(false)
    expect(getToolDefinitionsForContext(DECK_CHAT_CONTEXT).map((t) => t.name)).toContain('get_deck_health')
    expect(getToolDefinitionsForContext('exploration').map((t) => t.name)).not.toContain('get_deck_health')
    expect(getToolDefinitions().map((t) => t.name)).not.toContain('get_deck_health')
    expect(isToolAllowedInContext('get_deck_health', 'workbench')).toBe(false)
    expect(isToolAllowedInContext('get_deck_health', DECK_CHAT_CONTEXT)).toBe(true)
  })

  it('existing owned-copies tools are still deck-chat-only and still offered', () => {
    const names = getToolDefinitionsForContext(DECK_CHAT_CONTEXT).map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['check_owned_copies', 'browse_spare_copies']))
    expect(DECK_CHAT_ONLY_TOOLS.has('check_owned_copies')).toBe(true)
    expect(DECK_CHAT_ONLY_TOOLS.has('browse_spare_copies')).toBe(true)
  })

  it('the deck chat has no add-a-card tool by default (suggest only)', () => {
    const names = getToolDefinitionsForContext(DECK_CHAT_CONTEXT, { deckChatEditEnabled: false }).map((t) => t.name)
    for (const t of DECK_BUILDING_TOOLS) expect(names).not.toContain(t)
  })

  it('its description says read-only and the input schema only takes a role', () => {
    const def = getToolDefinitionsForContext(DECK_CHAT_CONTEXT).find((t) => t.name === 'get_deck_health')!
    expect(def.description).toMatch(/^Read-only/)
    expect(Object.keys(def.input_schema.properties ?? {})).toEqual(['role'])
  })

  it('runs through executeTool with the same numbers as the route, and only reads', async () => {
    const res = await executeTool('get_deck_health', {}, { userId: 'u1', deckId: 1 })
    expect(res.is_error).toBe(false)
    const out = JSON.parse(res.content)
    const route = await loadDeckHealth(fakeDb(world()), 1, 'u1')
    if (!route.ok) throw new Error('expected ok')
    expect(out.roles).toEqual(route.health.roles)
    expect(out.sourceLine).toBe(route.health.sourceLine)
    expect(out.chatAnswer.closing).toBe('Prices are estimates.')
    // Read-only: only selects happened, no write, rpc or delete.
    expect(state.calls.filter((c) => c !== 'select' && !c.startsWith('from:'))).toEqual([])
  })

  it('with a role it adds the role summary', async () => {
    const res = await executeTool('get_deck_health', { role: 'draw' }, { userId: 'u1', deckId: 1 })
    expect(JSON.parse(res.content).roleDetail.role).toBe('draw')
  })

  it('refuses without a user or deck, rejects a bad role, and never guesses on failure', async () => {
    expect((await executeTool('get_deck_health', {}, { deckId: 1 })).is_error).toBe(true)
    expect((await executeTool('get_deck_health', {}, { userId: 'u1' })).is_error).toBe(true)
    expect((await executeTool('get_deck_health', { role: 'creature' }, { userId: 'u1', deckId: 1 })).is_error).toBe(true)
    const other = await executeTool('get_deck_health', {}, { userId: 'u1', deckId: 3 })
    expect(other.is_error).toBe(true)
    expect(other.content).toMatch(/do not guess/)
  })
})

describe('chat wording rules', () => {
  it('both chat prompts carry the health rules: call the tool, say the source, collaborator tone, suggest only', () => {
    const deckPrompt = buildDeckChatPrompt('Rocco', 'Rocco', 'commander', 1, [], '', { editToolsEnabled: false })
    const oraclePrompt = buildDeckChatAdditions({ editToolsEnabled: false, slotFacts: '' })
    for (const p of [deckPrompt, oraclePrompt]) {
      expect(p).toContain(DECK_HEALTH_RULES)
      expect(p).toContain(SUGGEST_ONLY_RULES)
    }
    expect(DECK_HEALTH_RULES).toContain('get_deck_health')
    expect(DECK_HEALTH_RULES).toContain('sourceLine')
    expect(DECK_HEALTH_RULES).toMatch(/collaborator and instructor/)
    expect(DECK_HEALTH_RULES).toContain('browse_spare_copies')
    expect(DECK_HEALTH_RULES).toContain('check_owned_copies')
    expect(DECK_HEALTH_RULES).toMatch(/propose_deck_cards/)
    expect(DECK_HEALTH_RULES).not.toMatch(/Never offer to add/)
  })

  it('the button questions are plain words', () => {
    expect(healthChatQuestion()).toBe('What is my deck missing? Check my deck health.')
    expect(healthChatQuestion('removal')).toBe('How is my removal looking? What could fill the gap?')
    expect(healthChatQuestion('lands')).toContain('lands')
  })
})
