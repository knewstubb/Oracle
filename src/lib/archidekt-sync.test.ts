import { describe, it, expect, beforeEach, vi } from 'vitest'
import { writeAllocationDiffToArchidekt, retryFailedWrites } from './archidekt-sync'
import type { ArchidektPlaywrightClient, WriteResult } from './archidekt-sync'
import type { AllocationDiff } from './allocation-store'
import type { AllocationRecord } from './allocation-resolver'

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

// In-memory store for deck_allocations
let allocationsStore: Array<{
  card_name: string
  deck_id: number
  role: string
  written_to_archidekt: boolean
  written_at: string | null
}>

// Mock the Supabase module
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'deck_allocations') {
        return {
          select: (columns: string) => ({
            eq: (col: string, val: unknown) => {
              // First filter: written_to_archidekt = false
              if (col === 'written_to_archidekt' && val === false) {
                const filtered = allocationsStore.filter(a => !a.written_to_archidekt)
                return {
                  eq: (_col2: string, _val2: unknown) => {
                    // Second filter: user_id (passthrough — single-user, all rows match)
                    return Promise.resolve({ data: filtered, error: null })
                  },
                  then: (resolve: (v: { data: typeof filtered; error: null }) => void) => resolve({ data: filtered, error: null }),
                }
              }
              return {
                eq: () => Promise.resolve({ data: allocationsStore, error: null }),
                then: (resolve: (v: { data: typeof allocationsStore; error: null }) => void) => resolve({ data: allocationsStore, error: null }),
              }
            },
          }),
          update: (updates: Record<string, unknown>) => ({
            eq: (col1: string, val1: unknown) => ({
              eq: (col2: string, val2: unknown) => ({
                eq: (_col3: string, _val3: unknown) => {
                  // Apply update to matching rows (col3 is user_id — passthrough for single-user)
                  for (const row of allocationsStore) {
                    const match1 = col1 === 'card_name' ? row.card_name === val1 : row.deck_id === val1
                    const match2 = col2 === 'deck_id' ? row.deck_id === val2 : row.card_name === val2
                    if (match1 && match2) {
                      if ('written_to_archidekt' in updates) row.written_to_archidekt = updates.written_to_archidekt as boolean
                      if ('written_at' in updates) row.written_at = updates.written_at as string
                    }
                  }
                  return Promise.resolve({ error: null })
                },
              }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
    },
  }),
}))

// ---------------------------------------------------------------------------
// Mock Playwright Client
// ---------------------------------------------------------------------------

/**
 * Creates a mock ArchidektPlaywrightClient for testing.
 * The textStore simulates what Archidekt returns for each deck's import text.
 * When setImportText is called, it updates the store.
 */
function createMockClient(textStore: Map<number, string>, options?: {
  failOnSet?: number[]  // deck IDs that throw on setImportText
  failOnGet?: number[]  // deck IDs that throw on getImportText
}): ArchidektPlaywrightClient {
  return {
    async getImportText(deckId: number): Promise<string> {
      if (options?.failOnGet?.includes(deckId)) {
        throw new Error(`Failed to get import text for deck ${deckId}`)
      }
      return textStore.get(deckId) ?? ''
    },
    async setImportText(deckId: number, text: string): Promise<void> {
      if (options?.failOnSet?.includes(deckId)) {
        throw new Error(`Failed to set import text for deck ${deckId}`)
      }
      textStore.set(deckId, text)
    },
  }
}

function makeEmptyDiff(): AllocationDiff {
  return {
    added: [],
    removed: [],
    originalToProxy: [],
    proxyToOriginal: [],
    unchanged: [],
  }
}

function makeRecord(cardName: string, deckId: number, role: 'original' | 'proxy'): AllocationRecord {
  return {
    cardName,
    deckId,
    role,
    scryfallId: null,
    setCode: null,
    collectorNumber: null,
    priorityOverride: false,
  }
}

function seedAllocations(allocations: { card_name: string; deck_id: number; role: string; written_to_archidekt?: boolean }[]) {
  for (const alloc of allocations) {
    allocationsStore.push({
      card_name: alloc.card_name,
      deck_id: alloc.deck_id,
      role: alloc.role,
      written_to_archidekt: alloc.written_to_archidekt ?? false,
      written_at: null,
    })
  }
}

// ---------------------------------------------------------------------------
// Tests: writeAllocationDiffToArchidekt
// ---------------------------------------------------------------------------

describe('writeAllocationDiffToArchidekt', () => {
  beforeEach(() => {
    allocationsStore = []
  })

  it('returns empty array when diff has no changes', async () => {
    const diff = makeEmptyDiff()
    const textStore = new Map<number, string>()
    const client = createMockClient(textStore)

    const results = await writeAllocationDiffToArchidekt(diff, client)

    expect(results).toEqual([])
  })

  it('marks cards as proxy when role changes from original to proxy', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp]\n1x Forest (cmm) [Lands]')

    const client = createMockClient(textStore)

    const diff = makeEmptyDiff()
    diff.originalToProxy.push(makeRecord('Sol Ring', 1, 'proxy'))

    const results = await writeAllocationDiffToArchidekt(diff, client)

    expect(results).toHaveLength(1)
    expect(results[0].deckId).toBe(1)
    expect(results[0].success).toBe(true)
    expect(results[0].cardsWritten).toBe(1)
    expect(results[0].cardsVerified).toBe(1)

    // Verify the text was modified to include proxy markers
    const updatedText = textStore.get(1)!
    expect(updatedText).toContain('^Proxy,#e158ff^')
    expect(updatedText).toContain('Proxy')

    // Verify allocation store was updated
    const row = allocationsStore.find(a => a.card_name === 'Sol Ring' && a.deck_id === 1)!
    expect(row.written_to_archidekt).toBe(true)
    expect(row.written_at).toBeTruthy()
  })

  it('unmarks proxy when role changes from proxy to original', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'original', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp,Proxy]  ^Proxy,#e158ff^\n1x Forest (cmm) [Lands]')

    const client = createMockClient(textStore)

    const diff = makeEmptyDiff()
    diff.proxyToOriginal.push(makeRecord('Sol Ring', 1, 'original'))

    const results = await writeAllocationDiffToArchidekt(diff, client)

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].cardsWritten).toBe(1)
    expect(results[0].cardsVerified).toBe(1)

    // Verify the proxy markers were removed
    const updatedText = textStore.get(1)!
    expect(updatedText).not.toContain('^Proxy,#e158ff^')
    expect(updatedText).not.toContain('[Proxy]')
    // Should still have the Ramp category
    expect(updatedText).toContain('[Ramp]')
  })

  it('groups changes by deck (one navigation per deck)', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: false },
      { card_name: 'Arcane Signet', deck_id: 1, role: 'proxy', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp]\n1x Arcane Signet (cmm) [Ramp]\n1x Forest (cmm) [Lands]')

    const getCallCount = { count: 0 }
    const client: ArchidektPlaywrightClient = {
      async getImportText(deckId: number): Promise<string> {
        getCallCount.count++
        return textStore.get(deckId) ?? ''
      },
      async setImportText(deckId: number, text: string): Promise<void> {
        textStore.set(deckId, text)
      },
    }

    const diff = makeEmptyDiff()
    diff.originalToProxy.push(makeRecord('Sol Ring', 1, 'proxy'))
    diff.originalToProxy.push(makeRecord('Arcane Signet', 1, 'proxy'))

    const results = await writeAllocationDiffToArchidekt(diff, client)

    expect(results).toHaveLength(1) // Only one deck processed
    expect(results[0].cardsWritten).toBe(2)
    // getImportText called twice: once for reading, once for verification
    expect(getCallCount.count).toBe(2)
  })

  it('handles multiple decks in a single diff', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: false },
      { card_name: 'Sol Ring', deck_id: 2, role: 'original', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp]')
    textStore.set(2, '1x Sol Ring (cmm) [Ramp,Proxy]  ^Proxy,#e158ff^')

    const client = createMockClient(textStore)

    const diff = makeEmptyDiff()
    diff.originalToProxy.push(makeRecord('Sol Ring', 1, 'proxy'))
    diff.proxyToOriginal.push(makeRecord('Sol Ring', 2, 'original'))

    const results = await writeAllocationDiffToArchidekt(diff, client)

    expect(results).toHaveLength(2)

    const deck1Result = results.find(r => r.deckId === 1)!
    const deck2Result = results.find(r => r.deckId === 2)!

    expect(deck1Result.success).toBe(true)
    expect(deck2Result.success).toBe(true)

    // Deck 1 should now have proxy markers
    expect(textStore.get(1)).toContain('^Proxy,#e158ff^')
    // Deck 2 should have proxy markers removed
    expect(textStore.get(2)).not.toContain('^Proxy,#e158ff^')
  })

  it('handles newly added allocation records', async () => {
    seedAllocations([
      { card_name: 'Lightning Bolt', deck_id: 1, role: 'proxy', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Lightning Bolt (m21) [Removal]')

    const client = createMockClient(textStore)

    const diff = makeEmptyDiff()
    diff.added.push(makeRecord('Lightning Bolt', 1, 'proxy'))

    const results = await writeAllocationDiffToArchidekt(diff, client)

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(textStore.get(1)).toContain('^Proxy,#e158ff^')
  })

  it('records failure when client throws on one deck but others succeed', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: false },
      { card_name: 'Forest', deck_id: 2, role: 'proxy', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp]')
    textStore.set(2, '1x Forest (cmm) [Lands]')

    // Deck 1 will fail on setImportText
    const client = createMockClient(textStore, { failOnSet: [1] })

    const diff = makeEmptyDiff()
    diff.originalToProxy.push(makeRecord('Sol Ring', 1, 'proxy'))
    diff.originalToProxy.push(makeRecord('Forest', 2, 'proxy'))

    const results = await writeAllocationDiffToArchidekt(diff, client)

    expect(results).toHaveLength(2)

    const deck1Result = results.find(r => r.deckId === 1)!
    const deck2Result = results.find(r => r.deckId === 2)!

    // Deck 1 should fail
    expect(deck1Result.success).toBe(false)
    expect(deck1Result.error).toContain('Failed to set import text')
    expect(deck1Result.cardsWritten).toBe(0)

    // Deck 2 should succeed
    expect(deck2Result.success).toBe(true)
    expect(deck2Result.cardsWritten).toBe(1)

    // Verify allocation store: deck 1 should still be unwritten
    const deck1Alloc = allocationsStore.find(a => a.card_name === 'Sol Ring' && a.deck_id === 1)!
    expect(deck1Alloc.written_to_archidekt).toBe(false)

    // Deck 2 should be written
    const deck2Alloc = allocationsStore.find(a => a.card_name === 'Forest' && a.deck_id === 2)!
    expect(deck2Alloc.written_to_archidekt).toBe(true)
  })

  it('reports verification failure when write succeeds but read-back does not match', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: false },
    ])

    // Simulate: setImportText appears to succeed, but getImportText returns the old text
    const originalText = '1x Sol Ring (cmm) [Ramp]'
    const client: ArchidektPlaywrightClient = {
      async getImportText(_deckId: number): Promise<string> {
        // Always return original text (simulates write not persisting)
        return originalText
      },
      async setImportText(_deckId: number, _text: string): Promise<void> {
        // Silently "succeeds" but doesn't actually persist
      },
    }

    const diff = makeEmptyDiff()
    diff.originalToProxy.push(makeRecord('Sol Ring', 1, 'proxy'))

    const results = await writeAllocationDiffToArchidekt(diff, client)

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain('Verification failed')
    expect(results[0].cardsWritten).toBe(1) // Write was attempted
    expect(results[0].cardsVerified).toBe(0) // But verification failed

    // Allocation store should NOT be marked as written
    const row = allocationsStore.find(a => a.card_name === 'Sol Ring' && a.deck_id === 1)!
    expect(row.written_to_archidekt).toBe(false)
  })

  it('handles card not found in import text gracefully', async () => {
    seedAllocations([
      { card_name: 'Nonexistent Card', deck_id: 1, role: 'proxy', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp]')

    const client = createMockClient(textStore)

    const diff = makeEmptyDiff()
    diff.originalToProxy.push(makeRecord('Nonexistent Card', 1, 'proxy'))

    const results = await writeAllocationDiffToArchidekt(diff, client)

    // The write will "succeed" (no error thrown) but verification will fail
    // because the card isn't in the text to verify
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].cardsVerified).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: retryFailedWrites
// ---------------------------------------------------------------------------

describe('retryFailedWrites', () => {
  beforeEach(() => {
    allocationsStore = []
  })

  it('returns empty array when no unwritten records exist', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: true },
    ])

    const textStore = new Map<number, string>()
    const client = createMockClient(textStore)

    const results = await retryFailedWrites(client)

    expect(results).toEqual([])
  })

  it('picks up unwritten records and retries them', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: false },
      { card_name: 'Arcane Signet', deck_id: 1, role: 'original', written_to_archidekt: true },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp]\n1x Arcane Signet (cmm) [Ramp]')

    const client = createMockClient(textStore)

    const results = await retryFailedWrites(client)

    expect(results).toHaveLength(1)
    expect(results[0].deckId).toBe(1)
    expect(results[0].success).toBe(true)
    expect(results[0].cardsWritten).toBe(1)

    // Sol Ring should now have proxy markers
    expect(textStore.get(1)).toContain('^Proxy,#e158ff^')
    // Arcane Signet should NOT have been touched (it was already written)
    expect(textStore.get(1)).not.toMatch(/Arcane Signet.*\^Proxy/)

    // Allocation store should be updated
    const row = allocationsStore.find(a => a.card_name === 'Sol Ring' && a.deck_id === 1)!
    expect(row.written_to_archidekt).toBe(true)
  })

  it('groups retries by deck for efficiency', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: false },
      { card_name: 'Mana Crypt', deck_id: 1, role: 'proxy', written_to_archidekt: false },
      { card_name: 'Forest', deck_id: 2, role: 'proxy', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp]\n1x Mana Crypt (cmm) [Ramp]')
    textStore.set(2, '1x Forest (cmm) [Lands]')

    const client = createMockClient(textStore)

    const results = await retryFailedWrites(client)

    expect(results).toHaveLength(2) // Two decks processed
    const deck1Result = results.find(r => r.deckId === 1)!
    const deck2Result = results.find(r => r.deckId === 2)!

    expect(deck1Result.cardsWritten).toBe(2)
    expect(deck2Result.cardsWritten).toBe(1)
  })

  it('handles partial failure during retry (some decks fail)', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', written_to_archidekt: false },
      { card_name: 'Forest', deck_id: 2, role: 'proxy', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp]')
    textStore.set(2, '1x Forest (cmm) [Lands]')

    // Deck 2 fails on get
    const client = createMockClient(textStore, { failOnGet: [2] })

    const results = await retryFailedWrites(client)

    expect(results).toHaveLength(2)

    const deck1Result = results.find(r => r.deckId === 1)!
    const deck2Result = results.find(r => r.deckId === 2)!

    expect(deck1Result.success).toBe(true)
    expect(deck2Result.success).toBe(false)
    expect(deck2Result.error).toContain('Failed to get import text')
  })

  it('retries original-role records correctly (removes proxy markers)', async () => {
    seedAllocations([
      { card_name: 'Sol Ring', deck_id: 1, role: 'original', written_to_archidekt: false },
    ])

    const textStore = new Map<number, string>()
    textStore.set(1, '1x Sol Ring (cmm) [Ramp,Proxy]  ^Proxy,#e158ff^')

    const client = createMockClient(textStore)

    const results = await retryFailedWrites(client)

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)

    // Proxy markers should be removed
    const updatedText = textStore.get(1)!
    expect(updatedText).not.toContain('^Proxy,#e158ff^')
    expect(updatedText).not.toContain('Proxy')
    expect(updatedText).toContain('[Ramp]')
  })
})
