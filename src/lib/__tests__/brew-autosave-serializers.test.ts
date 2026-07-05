// ---------------------------------------------------------------------------
// Brew Autosave Serializers — Unit Tests
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest'
import {
  serializeMessages,
  deserializeMessages,
  serializeDecisionLog,
  deserializeDecisionLog,
  serializeDeckState,
  deserializeDeckState,
} from '@/lib/brew-autosave-serializers'
import type { ChatMessage } from '@/lib/debrief-types'
import type { DecisionLog, DeckState } from '@/lib/brew-v2-types'

describe('serializeMessages', () => {
  it('serializes messages with role, content, ISO timestamp, and cost', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Hello', timestamp: 1700000000000, cost: 0 },
      { id: '2', role: 'assistant', content: 'Hi there', timestamp: 1700000001000, cost: 0.02 },
    ]

    const json = serializeMessages(messages)
    const parsed = JSON.parse(json)

    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({
      role: 'user',
      content: 'Hello',
      timestamp: '2023-11-14T22:13:20.000Z',
      cost: 0,
    })
    expect(parsed[1]).toEqual({
      role: 'assistant',
      content: 'Hi there',
      timestamp: '2023-11-14T22:13:21.000Z',
      cost: 0.02,
    })
  })

  it('caps at 500 messages, keeping the most recent', () => {
    const messages: ChatMessage[] = Array.from({ length: 600 }, (_, i) => ({
      id: `msg-${i}`,
      role: 'user' as const,
      content: `Message ${i}`,
      timestamp: 1700000000000 + i * 1000,
      cost: 0,
    }))

    const json = serializeMessages(messages)
    const parsed = JSON.parse(json)

    expect(parsed).toHaveLength(500)
    // First preserved message should be index 100 (600 - 500)
    expect(parsed[0].content).toBe('Message 100')
    expect(parsed[499].content).toBe('Message 599')
  })

  it('trims content to 50k characters', () => {
    const longContent = 'x'.repeat(60_000)
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: longContent, timestamp: 1700000000000, cost: 0 },
    ]

    const json = serializeMessages(messages)
    const parsed = JSON.parse(json)

    expect(parsed[0].content).toHaveLength(50_000)
  })

  it('maps system role to assistant', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'system', content: 'System msg', timestamp: 1700000000000, cost: 0 },
    ]

    const json = serializeMessages(messages)
    const parsed = JSON.parse(json)

    expect(parsed[0].role).toBe('assistant')
  })

  it('defaults cost to 0 when undefined', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Hello', timestamp: 1700000000000 },
    ]

    const json = serializeMessages(messages)
    const parsed = JSON.parse(json)

    expect(parsed[0].cost).toBe(0)
  })
})

describe('deserializeMessages', () => {
  it('deserializes valid JSON into ChatMessage[]', () => {
    const json = JSON.stringify([
      { role: 'user', content: 'Hello', timestamp: '2023-11-14T22:13:20.000Z', cost: 0 },
      { role: 'assistant', content: 'Hi', timestamp: '2023-11-14T22:13:21.000Z', cost: 0.01 },
    ])

    const result = deserializeMessages(json)

    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toBe('Hello')
    expect(result[0].timestamp).toBe(new Date('2023-11-14T22:13:20.000Z').getTime())
    expect(result[0].cost).toBe(0)
    expect(result[1].cost).toBe(0.01)
  })

  it('returns empty array on null input', () => {
    expect(deserializeMessages(null)).toEqual([])
  })

  it('returns empty array on malformed JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(deserializeMessages('not json')).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns empty array when JSON is not an array', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(deserializeMessages('{"foo": "bar"}')).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('serializeDecisionLog', () => {
  it('serializes the full DecisionLog structure', () => {
    const log: DecisionLog = {
      strategy: [{ id: 's1', key: 'ARCHETYPE', value: 'Aristocrats', sourceQuote: 'I like sac', timestamp: 1700000000000 }],
      parameters: [{ id: 'p1', key: 'BUDGET', value: '$100', sourceQuote: 'around $100', timestamp: 1700000001000 }],
      constraints: [],
    }

    const json = serializeDecisionLog(log)
    const parsed = JSON.parse(json)

    expect(parsed.strategy).toHaveLength(1)
    expect(parsed.strategy[0].key).toBe('ARCHETYPE')
    expect(parsed.parameters).toHaveLength(1)
    expect(parsed.constraints).toEqual([])
  })
})

describe('deserializeDecisionLog', () => {
  it('deserializes valid JSON into DecisionLog', () => {
    const json = JSON.stringify({
      strategy: [{ id: 's1', key: 'A', value: 'B', sourceQuote: 'C', timestamp: 123 }],
      parameters: [],
      constraints: [],
    })

    const result = deserializeDecisionLog(json)
    expect(result.strategy).toHaveLength(1)
    expect(result.strategy[0].id).toBe('s1')
  })

  it('returns default empty log on null input', () => {
    const result = deserializeDecisionLog(null)
    expect(result).toEqual({ strategy: [], parameters: [], constraints: [] })
  })

  it('returns default empty log on malformed JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = deserializeDecisionLog('not valid json')
    expect(result).toEqual({ strategy: [], parameters: [], constraints: [] })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns default empty log when structure is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = deserializeDecisionLog(JSON.stringify({ strategy: 'not an array' }))
    expect(result).toEqual({ strategy: [], parameters: [], constraints: [] })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('serializeDeckState', () => {
  it('serializes cards, suggestions, canvasPositions, explorationArchive', () => {
    const state: DeckState = {
      cards: [{ card_name: 'Sol Ring', primary_category: 'Ramp', additional_categories: [], ownership_status: 'original', cmc: 1, type_line: 'Artifact', oracle_text: '' }],
      suggestions: [],
      isGenerating: true,
      canvasPositions: { 'Sol Ring': { id: 'Sol Ring', x: 100, y: 200, type: 'deck', updatedAt: 123 } },
      explorationArchive: [],
    }

    const json = serializeDeckState(state)
    const parsed = JSON.parse(json)

    expect(parsed.cards).toHaveLength(1)
    expect(parsed.cards[0].card_name).toBe('Sol Ring')
    expect(parsed.canvasPositions['Sol Ring'].x).toBe(100)
    expect(parsed).not.toHaveProperty('isGenerating')
  })

  it('excludes isGenerating from serialized output', () => {
    const state: DeckState = {
      cards: [],
      suggestions: [],
      isGenerating: true,
      canvasPositions: {},
      explorationArchive: [],
    }

    const json = serializeDeckState(state)
    const parsed = JSON.parse(json)

    expect(Object.keys(parsed)).toEqual(['cards', 'suggestions', 'canvasPositions', 'explorationArchive'])
    expect(parsed).not.toHaveProperty('isGenerating')
  })
})

describe('deserializeDeckState', () => {
  it('deserializes valid JSON into DeckState with isGenerating=false', () => {
    const json = JSON.stringify({
      cards: [{ card_name: 'Sol Ring', primary_category: 'Ramp', additional_categories: [], ownership_status: 'original', cmc: 1, type_line: 'Artifact', oracle_text: '' }],
      suggestions: [],
      canvasPositions: {},
      explorationArchive: [],
    })

    const result = deserializeDeckState(json)

    expect(result.cards).toHaveLength(1)
    expect(result.isGenerating).toBe(false)
  })

  it('always returns isGenerating=false even if present in JSON', () => {
    const json = JSON.stringify({
      cards: [],
      suggestions: [],
      canvasPositions: {},
      explorationArchive: [],
      isGenerating: true,
    })

    const result = deserializeDeckState(json)
    expect(result.isGenerating).toBe(false)
  })

  it('returns default DeckState on null input', () => {
    const result = deserializeDeckState(null)
    expect(result).toEqual({
      cards: [],
      suggestions: [],
      isGenerating: false,
      canvasPositions: {},
      explorationArchive: [],
    })
  })

  it('returns default DeckState on malformed JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = deserializeDeckState('{{invalid')
    expect(result).toEqual({
      cards: [],
      suggestions: [],
      isGenerating: false,
      canvasPositions: {},
      explorationArchive: [],
    })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('handles partial valid structure gracefully', () => {
    const json = JSON.stringify({ cards: [{ card_name: 'Test' }] })

    const result = deserializeDeckState(json)

    expect(result.cards).toHaveLength(1)
    expect(result.suggestions).toEqual([])
    expect(result.canvasPositions).toEqual({})
    expect(result.explorationArchive).toEqual([])
    expect(result.isGenerating).toBe(false)
  })
})
