import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseCommanderOverview,
  parseDeckAnalysis,
  parseSuggestCuts,
  parseSuggestManaBase,
  parseThemeSearch,
  parseBuildAround,
  parseSearchCards,
  parseFormatSearch,
  McpToolError,
} from './mcp-client'

// ---------------------------------------------------------------------------
// We test the public parse functions directly — they are the core logic of
// this module. The wrapper functions (commanderOverview, deckAnalysis, etc.)
// are thin callTool + parse combos that would require a live MCP server.
// ---------------------------------------------------------------------------

describe('McpToolError', () => {
  it('includes tool name and message', () => {
    const err = new McpToolError('deck_analysis', 'timeout')
    expect(err.name).toBe('McpToolError')
    expect(err.tool).toBe('deck_analysis')
    expect(err.message).toContain('deck_analysis')
    expect(err.message).toContain('timeout')
  })
})

describe('parseCommanderOverview', () => {
  it('parses a JSON response', () => {
    const raw = JSON.stringify({
      name: 'Muldrotha, the Gravetide',
      mana_cost: '{3}{B}{G}{U}',
      color_identity: ['B', 'G', 'U'],
      type_line: 'Legendary Creature — Elemental Avatar',
      oracle_text: 'During each of your turns, you may play...',
      combos: [
        { cards: ['Muldrotha', 'Lion\'s Eye Diamond'], result: 'Infinite mana' },
      ],
      staples: [
        { name: 'Spore Frog', synergy: 0.42, inclusion: 0.78 },
      ],
    })

    const result = parseCommanderOverview(raw)
    expect(result.name).toBe('Muldrotha, the Gravetide')
    expect(result.manaCost).toBe('{3}{B}{G}{U}')
    expect(result.colorIdentity).toEqual(['B', 'G', 'U'])
    expect(result.typeLine).toBe('Legendary Creature — Elemental Avatar')
    expect(result.combos).toHaveLength(1)
    expect(result.combos[0].result).toBe('Infinite mana')
    expect(result.staples).toHaveLength(1)
    expect(result.staples[0].name).toBe('Spore Frog')
    expect(result.staples[0].synergy).toBe(0.42)
    expect(result.raw).toBe(raw)
  })

  it('parses a markdown text response with sections', () => {
    const raw = `Muldrotha, the Gravetide
# Combos
- **[123-456]** LED, Muldrotha
  Produces: Infinite mana
- **[789-012]** Animate Dead, Muldrotha
  Produces: Infinite loop`

    const result = parseCommanderOverview(raw)
    expect(result.name).toBe('Muldrotha, the Gravetide')
    expect(result.combos).toHaveLength(2)
    expect(result.combos[0].cards).toContain('LED')
    expect(result.combos[0].result).toBe('Infinite mana')
    expect(result.raw).toBe(raw)
  })

  it('handles card names with commas in combos', () => {
    const raw = `Test
# Combos
- **[796-1762-2438]** Wilhelt, the Rotcleaver, Poppet Stitcher // Poppet Factory, Carrion Feeder
  Produces: Infinite +1/+1 counters`

    const knownCards = ['Wilhelt, the Rotcleaver', 'Poppet Stitcher // Poppet Factory', 'Carrion Feeder']
    const result = parseCommanderOverview(raw, knownCards)
    expect(result.combos).toHaveLength(1)
    expect(result.combos[0].cards).toHaveLength(3)
    expect(result.combos[0].cards[0]).toBe('Wilhelt, the Rotcleaver')
    expect(result.combos[0].cards[1]).toBe('Poppet Stitcher // Poppet Factory')
    expect(result.combos[0].cards[2]).toBe('Carrion Feeder')
  })

  it('handles empty/malformed input gracefully', () => {
    const result = parseCommanderOverview('')
    expect(result.name).toBe('')
    expect(result.combos).toEqual([])
    expect(result.staples).toEqual([])
  })
})

describe('parseDeckAnalysis', () => {
  it('parses a JSON response', () => {
    const raw = JSON.stringify({
      mana_curve: { '1': 8, '2': 14, '3': 12, '4': 7, '5': 4 },
      color_distribution: { B: 30, G: 25, U: 20 },
      total_cards: 100,
      average_cmc: 2.8,
      combos: [{ cards: ['A', 'B'], result: 'Win' }],
      bracket: '3',
      strengths: ['Strong recursion', 'Good removal'],
      weaknesses: ['Weak to graveyard hate'],
    })

    const result = parseDeckAnalysis(raw)
    expect(result.totalCards).toBe(100)
    expect(result.averageCmc).toBe(2.8)
    expect(result.bracket).toBe('3')
    expect(result.strengths).toContain('Strong recursion')
    expect(result.weaknesses).toContain('Weak to graveyard hate')
    expect(result.combos).toHaveLength(1)
    expect(result.manaCurve['2']).toBe(14)
  })

  it('parses a markdown text response', () => {
    const raw = `# Strengths
- Good card draw
- Efficient removal
# Weaknesses
- Slow mana base
# Bracket
3`

    const result = parseDeckAnalysis(raw)
    expect(result.strengths).toContain('Good card draw')
    expect(result.weaknesses).toContain('Slow mana base')
  })

  it('handles empty input', () => {
    const result = parseDeckAnalysis('')
    expect(result.totalCards).toBe(0)
    expect(result.combos).toEqual([])
  })
})


describe('parseSuggestCuts', () => {
  it('parses a JSON response with cuts array', () => {
    const raw = JSON.stringify({
      cuts: [
        { name: 'Colossal Dreadmaw', reason: 'Low synergy, high CMC' },
        { name: 'Cancel', reason: 'Strictly worse than Counterspell' },
      ],
    })

    const result = parseSuggestCuts(raw)
    expect(result.cuts).toHaveLength(2)
    expect(result.cuts[0].name).toBe('Colossal Dreadmaw')
    expect(result.cuts[1].reason).toContain('Counterspell')
  })

  it('parses numbered bold list from MCP output', () => {
    const raw = `# Suggested Cuts for Wilhelt, the Rotcleaver

1. **Arcane Signet** — Synergy: 7%, Inclusion: 91%
2. **Sol Ring** — Synergy: 6%, Inclusion: 94%
3. **Carrion Feeder** — Synergy: 56%, Inclusion: 62%`

    const result = parseSuggestCuts(raw)
    expect(result.cuts).toHaveLength(3)
    expect(result.cuts[0].name).toBe('Arcane Signet')
    expect(result.cuts[0].reason).toBe('Synergy: 7%, Inclusion: 91%')
    expect(result.cuts[1].name).toBe('Sol Ring')
    expect(result.cuts[2].name).toBe('Carrion Feeder')
  })

  it('filters out URL/status lines from MCP output', () => {
    const raw = `# Suggested Cuts
[Commander Spellbook](https://commanderspellbook.com): OK
[EDHREC](https://edhrec.com): OK

1. **Sol Ring** — Synergy: 6%, Inclusion: 94%`

    const result = parseSuggestCuts(raw)
    expect(result.cuts).toHaveLength(1)
    expect(result.cuts[0].name).toBe('Sol Ring')
  })

  it('handles empty input', () => {
    const result = parseSuggestCuts('')
    expect(result.cuts).toEqual([])
  })
})

describe('parseSuggestManaBase', () => {
  it('parses a JSON response', () => {
    const raw = JSON.stringify({
      lands: [
        { name: 'Command Tower', reason: 'Fixes all colours' },
        { name: 'Breeding Pool', reason: 'UG dual' },
      ],
    })

    const result = parseSuggestManaBase(raw)
    expect(result.lands).toHaveLength(2)
    expect(result.lands[0].name).toBe('Command Tower')
  })

  it('parses bullet-point text', () => {
    const raw = `- Command Tower — Fixes all colours
- Breeding Pool — UG dual`

    const result = parseSuggestManaBase(raw)
    expect(result.lands).toHaveLength(2)
    expect(result.lands[0].name).toBe('Command Tower')
    expect(result.lands[0].reason).toBe('Fixes all colours')
  })
})

describe('parseThemeSearch', () => {
  it('parses a JSON response', () => {
    const raw = JSON.stringify({
      cards: [
        {
          name: 'Sakura-Tribe Elder',
          mana_cost: '{1}{G}',
          type_line: 'Creature — Snake Shaman',
          reason: 'Ramp + sacrifice synergy',
        },
      ],
    })

    const result = parseThemeSearch(raw)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].name).toBe('Sakura-Tribe Elder')
    expect(result.cards[0].manaCost).toBe('{1}{G}')
  })

  it('returns empty cards for non-JSON text', () => {
    const result = parseThemeSearch('Some plain text response')
    expect(result.cards).toEqual([])
    expect(result.raw).toBe('Some plain text response')
  })
})

describe('parseBuildAround', () => {
  it('parses a JSON response', () => {
    const raw = JSON.stringify({
      cards: [
        {
          name: 'Animate Dead',
          mana_cost: '{1}{B}',
          type_line: 'Enchantment — Aura',
          role: 'enabler',
        },
      ],
    })

    const result = parseBuildAround(raw)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].role).toBe('enabler')
  })

  it('returns empty cards for non-JSON text', () => {
    const result = parseBuildAround('No JSON here')
    expect(result.cards).toEqual([])
  })
})

describe('parseSearchCards', () => {
  it('parses a JSON response with cards array', () => {
    const raw = JSON.stringify({
      cards: [
        {
          name: 'Sol Ring',
          mana_cost: '{1}',
          type_line: 'Artifact',
          oracle_text: '{T}: Add {C}{C}.',
        },
      ],
    })

    const result = parseSearchCards(raw)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].name).toBe('Sol Ring')
    expect(result.cards[0].oracleText).toContain('Add')
  })

  it('parses a JSON response with data array (Scryfall style)', () => {
    const raw = JSON.stringify({
      data: [
        {
          name: 'Lightning Bolt',
          mana_cost: '{R}',
          type_line: 'Instant',
          oracle_text: 'Deal 3 damage.',
        },
      ],
    })

    const result = parseSearchCards(raw)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].name).toBe('Lightning Bolt')
  })
})

describe('parseFormatSearch', () => {
  it('parses a JSON response', () => {
    const raw = JSON.stringify({
      cards: [
        {
          name: 'Swords to Plowshares',
          mana_cost: '{W}',
          type_line: 'Instant',
          oracle_text: 'Exile target creature.',
        },
      ],
    })

    const result = parseFormatSearch(raw)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].name).toBe('Swords to Plowshares')
  })

  it('handles embedded JSON in markdown code block', () => {
    const raw = `Here are the results:
\`\`\`json
{"cards": [{"name": "Path to Exile", "mana_cost": "{W}", "type_line": "Instant", "oracle_text": "Exile target creature."}]}
\`\`\`
`

    const result = parseFormatSearch(raw)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].name).toBe('Path to Exile')
  })

  it('returns empty cards for plain text with no card lines', () => {
    const result = parseFormatSearch('No results found')
    expect(result.cards).toEqual([])
  })

  it('parses MCP markdown card lines with mana costs', () => {
    const raw = `## Commander Cards: Mana ramp effects
Found 3 result(s):

  Sol Ring {1} -- Artifact ($1.39)
  Rampant Growth {1}{G} -- Sorcery ($0.38)
  Reliquary Tower -- Land ($2.93)

*Data: Scryfall bulk data (Oracle Cards)*`

    const result = parseFormatSearch(raw)
    expect(result.cards).toHaveLength(3)
    expect(result.cards[0].name).toBe('Sol Ring')
    expect(result.cards[0].manaCost).toBe('{1}')
    expect(result.cards[0].typeLine).toBe('Artifact')
    expect(result.cards[1].name).toBe('Rampant Growth')
    expect(result.cards[1].manaCost).toBe('{1}{G}')
    expect(result.cards[2].name).toBe('Reliquary Tower')
    expect(result.cards[2].manaCost).toBe('')
    expect(result.cards[2].typeLine).toBe('Land')
  })
})
