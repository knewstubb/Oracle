import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockSingle = vi.fn()
const mockLimit = vi.fn(() => ({ single: mockSingle }))
const mockOrder = vi.fn(() => ({ limit: mockLimit, single: mockSingle }))
const mockIlike = vi.fn(() => ({ order: mockOrder, single: mockSingle, limit: mockLimit }))
const mockIn = vi.fn(() => ({ order: mockOrder }))
const mockEq = vi.fn(() => ({ 
  single: mockSingle, 
  order: mockOrder, 
  ilike: mockIlike,
}))
const mockSelect = vi.fn(() => ({ 
  eq: mockEq, 
  ilike: mockIlike, 
  in: mockIn,
  single: mockSingle,
}))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}))

import {
  getCardByName,
  getCardByFuzzyName,
  getCardPrinting,
  getCardArtUrl,
  validateCommander,
  getCardEnrichment,
  getCardsByNames,
} from '../card-data'

describe('card-data utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCardByName', () => {
    it('returns card data when found', async () => {
      const mockCard = {
        name: 'Sol Ring',
        type_line: 'Artifact',
        mana_cost: '{1}',
        mana_value: 1,
        color_identity: '',
        can_be_commander: false,
        commander_legal: true,
      }
      
      mockSingle.mockResolvedValueOnce({ data: mockCard, error: null })
      
      const result = await getCardByName('Sol Ring')
      
      expect(result).toEqual(mockCard)
      expect(mockFrom).toHaveBeenCalledWith('ref_cards')
      expect(mockEq).toHaveBeenCalledWith('name', 'Sol Ring')
    })

    it('returns null when card not found', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      
      const result = await getCardByName('Nonexistent Card')
      
      expect(result).toBeNull()
    })

    it('handles DFC front-face lookup', async () => {
      // First exact match fails
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      // Then ilike match succeeds
      mockSingle.mockResolvedValueOnce({ 
        data: { name: 'Delver of Secrets // Insectile Aberration', type_line: 'Creature' }, 
        error: null 
      })
      
      const result = await getCardByName('Delver of Secrets // Insectile Aberration')
      
      expect(result).not.toBeNull()
      expect(result?.name).toBe('Delver of Secrets // Insectile Aberration')
    })
  })

  describe('validateCommander', () => {
    it('returns valid for legal commanders', async () => {
      const mockCommander = {
        name: 'Muldrotha, the Gravetide',
        type_line: 'Legendary Creature — Elemental Avatar',
        can_be_commander: true,
        commander_legal: true,
        color_identity: 'BGU',
      }
      
      mockSingle.mockResolvedValueOnce({ data: mockCommander, error: null })
      
      const result = await validateCommander('Muldrotha, the Gravetide')
      
      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.card.name).toBe('Muldrotha, the Gravetide')
      }
    })

    it('returns invalid for non-commander cards', async () => {
      const mockCard = {
        name: 'Sol Ring',
        type_line: 'Artifact',
        can_be_commander: false,
        commander_legal: true,
      }
      
      mockSingle.mockResolvedValueOnce({ data: mockCard, error: null })
      
      const result = await validateCommander('Sol Ring')
      
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.reason).toContain('cannot be used as a commander')
      }
    })

    it('returns invalid for cards not in database', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      // Case-insensitive fallback
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      // Partial match fallback
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      
      const result = await validateCommander('Unknown Card')
      
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.reason).toBe('Card not found in database')
      }
    })
  })

  describe('getCardEnrichment', () => {
    it('returns enrichment data for valid cards', async () => {
      const mockCard = {
        name: 'Lightning Bolt',
        type_line: 'Instant',
        mana_value: 1,
        color_identity: 'R',
      }
      
      mockSingle.mockResolvedValueOnce({ data: mockCard, error: null })
      
      const result = await getCardEnrichment('Lightning Bolt')
      
      expect(result).toEqual({
        name: 'Lightning Bolt',
        cmc: 1,
        type_line: 'Instant',
        color_identity: ['R'],
      })
    })

    it('parses multi-color identity correctly', async () => {
      const mockCard = {
        name: 'Muldrotha, the Gravetide',
        type_line: 'Legendary Creature — Elemental Avatar',
        mana_value: 6,
        color_identity: 'BGU',
      }
      
      mockSingle.mockResolvedValueOnce({ data: mockCard, error: null })
      
      const result = await getCardEnrichment('Muldrotha, the Gravetide')
      
      expect(result?.color_identity).toEqual(['B', 'G', 'U'])
    })

    it('returns null for unknown cards', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      
      const result = await getCardEnrichment('Unknown Card')
      
      expect(result).toBeNull()
    })
  })

  describe('getCardArtUrl', () => {
    it('returns art_crop URL from printing', async () => {
      const mockPrinting = {
        name: 'Sol Ring',
        image_uri_art_crop: 'https://cards.scryfall.io/art_crop/sol-ring.jpg',
      }
      
      mockSingle.mockResolvedValueOnce({ data: mockPrinting, error: null })
      
      const result = await getCardArtUrl('Sol Ring')
      
      expect(result).toBe('https://cards.scryfall.io/art_crop/sol-ring.jpg')
      expect(mockFrom).toHaveBeenCalledWith('ref_printings')
    })

    it('returns null when printing not found', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      
      const result = await getCardArtUrl('Unknown Card')
      
      expect(result).toBeNull()
    })
  })
})
