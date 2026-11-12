import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildOracleSystemPrompt } from './oracle-prompt'
import { decideCard, type CardFacts, type DeckFacts } from './chat-proposal-check'

const read = (p: string) => readFileSync(p, 'utf8')

describe('slice 4: no unconfirmed chat edits', () => {
  it('the sidebar stream handler no longer applies add_cards or remove_cards', () => {
    const src = read('src/contexts/OracleContext.tsx')
    expect(src).not.toContain("'add_cards'")
    expect(src).not.toContain("'remove_cards'")
    expect(src).not.toContain('/cards/batch')
  })

  it('the sidebar chat route forwards only status and proposal events', () => {
    const src = read('src/app/api/oracle/chat/route.ts')
    expect(src).not.toMatch(/event\.type === 'add_cards'/)
    expect(src).not.toMatch(/event\.type === 'remove_cards'/)
    expect(src).toContain("event.type === 'add_proposals'")
  })

  it('outside a deck the chat says to open a deck', () => {
    const prompt = buildOracleSystemPrompt({ type: 'general' } as never, '')
    expect(prompt).toContain('Open a deck and I can add cards to it.')
  })

  it('the plus button asks for the checks and shows the blocked reason', () => {
    const side = read('src/components/OracleSidebar.tsx')
    expect(side).toContain('checked: true')
    expect(side).toContain('res.status === 409')
    expect(read('src/app/api/decks/[id]/cards/route.ts')).toContain('body.checked === true')
  })

  it('the check the plus uses blocks a duplicate and an off-colour card', () => {
    const deck: DeckFacts = { deckName: 'Korvold', deckColours: 'BGR', mainKeys: new Set(['sol ring']), maybeKeys: new Set(), mainCount: 99 }
    const ring: CardFacts = { name: 'Sol Ring', oracleId: 'o1', colours: [], commanderLegal: true }
    expect(decideCard('Sol Ring', ring, deck).blockReason).toBe('in_deck')
    const white: CardFacts = { name: 'Swords to Plowshares', oracleId: 'o2', colours: ['W'], commanderLegal: true }
    expect(decideCard('Swords to Plowshares', white, deck).blockReason).toBe('outside_colours')
  })
})
