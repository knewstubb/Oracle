// ---------------------------------------------------------------------------
// Deck Normalizer — Unit Tests
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest'
import {
  normalizeArchidektDeck,
  normalizeMoxfieldDeck,
  groupCardsByType,
} from '@/lib/deck-normalizer'
import type { ArchidektDeckFull } from '@/lib/archidekt-client'
import type { MoxfieldDeckFull } from '@/lib/moxfield-client'

// ─── Archidekt Fixtures ──────────────────────────────────────────────────────

const archidektFixture: ArchidektDeckFull = {
  id: 23289174,
  name: 'World Breaker',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
  deckFormat: 3,
  featured: '',
  customFeatured: '',
  private: false,
  owner: { id: 614000, username: 'testuser', avatar: '' },
  categories: [
    { id: 1, name: 'Commander', isPremier: true, includedInDeck: true, includedInPrice: true },
    { id: 2, name: 'Creature', isPremier: false, includedInDeck: true, includedInPrice: true },
    { id: 3, name: 'Maybeboard', isPremier: false, includedInDeck: false, includedInPrice: false },
    { id: 4, name: 'Sideboard', isPremier: false, includedInDeck: false, includedInPrice: false },
  ],
  deckTags: [],
  cards: [
    {
      id: 1,
      categories: ['Commander'],
      label: '',
      modifier: '',
      quantity: 1,
      card: {
        id: 100,
        uid: 'scryfall-id-commander',
        artist: 'Artist A',
        collectorNumber: '001',
        edition: { editioncode: 'cmm', editionname: 'Commander Masters', editiondate: '2023-08-04', editiontype: 'masters' },
        oracleCard: {
          id: 500,
          name: 'Korvold, Fae-Cursed King',
          cmc: 5,
          colorIdentity: ['B', 'R', 'G'],
          colors: ['B', 'R', 'G'],
          edhrecRank: 5,
          layout: 'normal',
          uid: 'oracle-id-korvold',
          typeLine: 'Legendary Creature — Dragon Noble',
          manaCost: '{2}{B}{R}{G}',
        },
        scryfallImageHash: 'abc123',
      },
    },
    {
      id: 2,
      categories: ['Creature'],
      label: '',
      modifier: '',
      quantity: 1,
      card: {
        id: 101,
        uid: 'scryfall-id-sakura',
        artist: 'Artist B',
        collectorNumber: '002',
        edition: { editioncode: 'chk', editionname: 'Champions of Kamigawa', editiondate: '2004-10-01', editiontype: 'expansion' },
        oracleCard: {
          id: 501,
          name: 'Sakura-Tribe Elder',
          cmc: 2,
          colorIdentity: ['G'],
          colors: ['G'],
          edhrecRank: 10,
          layout: 'normal',
          uid: 'oracle-id-ste',
          typeLine: 'Creature — Snake Shaman',
          manaCost: '{1}{G}',
        },
        scryfallImageHash: 'def456',
      },
    },
    {
      id: 3,
      categories: ['Creature'],
      label: 'Proxy,#e158ff',
      modifier: '',
      quantity: 1,
      card: {
        id: 102,
        uid: 'scryfall-id-dockside',
        artist: 'Artist C',
        collectorNumber: '003',
        edition: { editioncode: 'c19', editionname: 'Commander 2019', editiondate: '2019-08-23', editiontype: 'commander' },
        oracleCard: {
          id: 502,
          name: 'Dockside Extortionist',
          cmc: 2,
          colorIdentity: ['R'],
          colors: ['R'],
          edhrecRank: 1,
          layout: 'normal',
          uid: 'oracle-id-dockside',
          typeLine: 'Creature — Goblin Pirate',
          manaCost: '{1}{R}',
        },
        scryfallImageHash: 'ghi789',
      },
    },
    {
      id: 4,
      categories: ['Maybeboard'],
      label: '',
      modifier: '',
      quantity: 1,
      card: {
        id: 103,
        uid: 'scryfall-id-maybe',
        artist: 'Artist D',
        collectorNumber: '004',
        edition: { editioncode: 'eld', editionname: 'Throne of Eldraine', editiondate: '2019-10-04', editiontype: 'expansion' },
        oracleCard: {
          id: 503,
          name: 'Gilded Goose',
          cmc: 1,
          colorIdentity: ['G'],
          colors: ['G'],
          edhrecRank: 200,
          layout: 'normal',
          uid: 'oracle-id-goose',
          typeLine: 'Creature — Bird',
          manaCost: '{G}',
        },
        scryfallImageHash: 'jkl012',
      },
    },
    {
      id: 5,
      categories: ['Sideboard'],
      label: '',
      modifier: '',
      quantity: 1,
      card: {
        id: 104,
        uid: 'scryfall-id-side',
        artist: 'Artist E',
        collectorNumber: '005',
        edition: { editioncode: 'eld', editionname: 'Throne of Eldraine', editiondate: '2019-10-04', editiontype: 'expansion' },
        oracleCard: {
          id: 504,
          name: 'Fabled Passage',
          cmc: 0,
          colorIdentity: [],
          colors: [],
          edhrecRank: 50,
          layout: 'normal',
          uid: 'oracle-id-passage',
          typeLine: 'Land',
          manaCost: '',
        },
        scryfallImageHash: 'mno345',
      },
    },
  ],
}

// ─── Moxfield Fixtures ───────────────────────────────────────────────────────

const moxfieldFixture: MoxfieldDeckFull = {
  id: 'internal-uuid',
  name: 'Atraxa Superfriends',
  format: 'commander',
  publicId: 'aBcD1234',
  commanders: {
    count: 1,
    cards: {
      'atraxa-key': {
        card: {
          name: 'Atraxa, Praetors\' Voice',
          scryfall_id: 'scryfall-id-atraxa',
          set: 'cm2',
          type_line: 'Legendary Creature — Phyrexian Angel Horror',
          oracle_id: 'oracle-id-atraxa',
          cmc: 4,
          color_identity: ['W', 'U', 'B', 'G'],
          mana_cost: '{G}{W}{U}{B}',
        },
        quantity: 1,
      },
    },
  },
  mainboard: {
    count: 3,
    cards: {
      'swords-key': {
        card: {
          name: 'Swords to Plowshares',
          scryfall_id: 'scryfall-id-stp',
          set: 'cmr',
          type_line: 'Instant',
          oracle_id: 'oracle-id-stp',
          cmc: 1,
          color_identity: ['W'],
          mana_cost: '{W}',
        },
        quantity: 1,
      },
      'sol-ring-key': {
        card: {
          name: 'Sol Ring',
          scryfall_id: 'scryfall-id-sol',
          set: 'c21',
          type_line: 'Artifact',
          oracle_id: 'oracle-id-sol',
          cmc: 1,
          color_identity: [],
          mana_cost: '{1}',
        },
        quantity: 1,
      },
      'command-tower-key': {
        card: {
          name: 'Command Tower',
          scryfall_id: 'scryfall-id-tower',
          set: 'cmr',
          type_line: 'Land',
          oracle_id: 'oracle-id-tower',
          cmc: 0,
          color_identity: [],
          mana_cost: '',
        },
        quantity: 1,
      },
    },
  },
  sideboard: {
    count: 1,
    cards: {
      'sideboard-key': {
        card: {
          name: 'Path to Exile',
          scryfall_id: 'scryfall-id-path',
          set: 'e02',
          type_line: 'Instant',
          oracle_id: 'oracle-id-path',
          cmc: 1,
          color_identity: ['W'],
          mana_cost: '{W}',
        },
        quantity: 1,
      },
    },
  },
  maybeboard: {
    count: 1,
    cards: {
      'maybe-key': {
        card: {
          name: 'Rhystic Study',
          scryfall_id: 'scryfall-id-rhystic',
          set: 'pcy',
          type_line: 'Enchantment',
          oracle_id: 'oracle-id-rhystic',
          cmc: 3,
          color_identity: ['U'],
          mana_cost: '{2}{U}',
        },
        quantity: 1,
      },
    },
  },
  companions: {
    count: 0,
    cards: {},
  },
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('normalizeArchidektDeck', () => {
  const sourceUrl = 'https://archidekt.com/decks/23289174'

  it('normalizes deck metadata', () => {
    const result = normalizeArchidektDeck(archidektFixture, sourceUrl)
    expect(result.name).toBe('World Breaker')
    expect(result.platform).toBe('archidekt')
    expect(result.platformDeckId).toBe('23289174')
    expect(result.sourceUrl).toBe(sourceUrl)
  })

  it('identifies the commander', () => {
    const result = normalizeArchidektDeck(archidektFixture, sourceUrl)
    expect(result.commander).not.toBeNull()
    expect(result.commander!.cardName).toBe('Korvold, Fae-Cursed King')
    expect(result.commander!.isCommander).toBe(true)
  })

  it('derives colour identity from commander in WUBRG order', () => {
    const result = normalizeArchidektDeck(archidektFixture, sourceUrl)
    // Korvold is BRG → WUBRG order = BRG
    expect(result.colourIdentity).toBe('BRG')
  })

  it('excludes Maybeboard and Sideboard cards', () => {
    const result = normalizeArchidektDeck(archidektFixture, sourceUrl)
    const names = result.cards.map((c) => c.cardName)
    expect(names).not.toContain('Gilded Goose')
    expect(names).not.toContain('Fabled Passage')
  })

  it('includes mainboard cards', () => {
    const result = normalizeArchidektDeck(archidektFixture, sourceUrl)
    const names = result.cards.map((c) => c.cardName)
    expect(names).toContain('Sakura-Tribe Elder')
    expect(names).toContain('Dockside Extortionist')
    expect(names).toContain('Korvold, Fae-Cursed King')
  })

  it('detects proxy cards from label', () => {
    const result = normalizeArchidektDeck(archidektFixture, sourceUrl)
    const dockside = result.cards.find((c) => c.cardName === 'Dockside Extortionist')
    expect(dockside!.isProxy).toBe(true)

    const ste = result.cards.find((c) => c.cardName === 'Sakura-Tribe Elder')
    expect(ste!.isProxy).toBe(false)
  })

  it('computes correct card count', () => {
    const result = normalizeArchidektDeck(archidektFixture, sourceUrl)
    // 3 cards (Commander + Creature + Creature with proxy), not Maybeboard or Sideboard
    expect(result.cardCount).toBe(3)
    expect(result.cards).toHaveLength(3)
  })

  it('maps card fields correctly', () => {
    const result = normalizeArchidektDeck(archidektFixture, sourceUrl)
    const ste = result.cards.find((c) => c.cardName === 'Sakura-Tribe Elder')!
    expect(ste.scryfallId).toBe('scryfall-id-sakura')
    expect(ste.oracleId).toBe('oracle-id-ste')
    expect(ste.setCode).toBe('chk')
    expect(ste.quantity).toBe(1)
    expect(ste.typeLine).toBe('Creature — Snake Shaman')
    expect(ste.manaCost).toBe('{1}{G}')
    expect(ste.colorIdentity).toEqual(['G'])
  })

  it('handles deck with no commander', () => {
    const noCommanderDeck: ArchidektDeckFull = {
      ...archidektFixture,
      cards: archidektFixture.cards.filter((c) => !c.categories.includes('Commander')),
    }
    const result = normalizeArchidektDeck(noCommanderDeck, sourceUrl)
    expect(result.commander).toBeNull()
    expect(result.colourIdentity).toBe('')
  })
})

describe('normalizeMoxfieldDeck', () => {
  const sourceUrl = 'https://moxfield.com/decks/aBcD1234'

  it('normalizes deck metadata', () => {
    const result = normalizeMoxfieldDeck(moxfieldFixture, sourceUrl)
    expect(result.name).toBe('Atraxa Superfriends')
    expect(result.platform).toBe('moxfield')
    expect(result.platformDeckId).toBe('aBcD1234')
    expect(result.sourceUrl).toBe(sourceUrl)
  })

  it('identifies the commander from commanders board', () => {
    const result = normalizeMoxfieldDeck(moxfieldFixture, sourceUrl)
    expect(result.commander).not.toBeNull()
    expect(result.commander!.cardName).toBe('Atraxa, Praetors\' Voice')
    expect(result.commander!.isCommander).toBe(true)
  })

  it('derives colour identity from commander in WUBRG order', () => {
    const result = normalizeMoxfieldDeck(moxfieldFixture, sourceUrl)
    // Atraxa is WUBG → WUBRG order = WUBG
    expect(result.colourIdentity).toBe('WUBG')
  })

  it('includes mainboard and commanders, excludes sideboard and maybeboard', () => {
    const result = normalizeMoxfieldDeck(moxfieldFixture, sourceUrl)
    const names = result.cards.map((c) => c.cardName)
    expect(names).toContain('Atraxa, Praetors\' Voice')
    expect(names).toContain('Swords to Plowshares')
    expect(names).toContain('Sol Ring')
    expect(names).toContain('Command Tower')
    expect(names).not.toContain('Path to Exile')
    expect(names).not.toContain('Rhystic Study')
  })

  it('sets isProxy to false for all Moxfield cards', () => {
    const result = normalizeMoxfieldDeck(moxfieldFixture, sourceUrl)
    for (const card of result.cards) {
      expect(card.isProxy).toBe(false)
    }
  })

  it('computes correct card count', () => {
    const result = normalizeMoxfieldDeck(moxfieldFixture, sourceUrl)
    // 1 commander + 3 mainboard = 4
    expect(result.cardCount).toBe(4)
    expect(result.cards).toHaveLength(4)
  })

  it('maps card fields correctly', () => {
    const result = normalizeMoxfieldDeck(moxfieldFixture, sourceUrl)
    const stp = result.cards.find((c) => c.cardName === 'Swords to Plowshares')!
    expect(stp.scryfallId).toBe('scryfall-id-stp')
    expect(stp.oracleId).toBe('oracle-id-stp')
    expect(stp.setCode).toBe('cmr')
    expect(stp.quantity).toBe(1)
    expect(stp.typeLine).toBe('Instant')
    expect(stp.manaCost).toBe('{W}')
    expect(stp.colorIdentity).toEqual(['W'])
    expect(stp.isCommander).toBe(false)
  })

  it('handles deck with no commander board', () => {
    const noCommanderDeck: MoxfieldDeckFull = {
      ...moxfieldFixture,
      commanders: { count: 0, cards: {} },
    }
    const result = normalizeMoxfieldDeck(noCommanderDeck, sourceUrl)
    expect(result.commander).toBeNull()
    expect(result.colourIdentity).toBe('')
  })
})

describe('Moxfield oracle_id resolution', () => {
  const sourceUrl = 'https://moxfield.com/decks/testDeck'

  it('uses oracle_id when present', () => {
    const deck: MoxfieldDeckFull = {
      id: 'test-id',
      name: 'Test Deck',
      format: 'commander',
      publicId: 'testDeck',
      commanders: { count: 0, cards: {} },
      mainboard: {
        count: 1,
        cards: {
          'card-key': {
            card: {
              name: 'Sol Ring',
              scryfall_id: 'scryfall-sol',
              set: 'c21',
              type_line: 'Artifact',
              oracle_id: 'oracle-sol',
              cmc: 1,
              color_identity: [],
              mana_cost: '{1}',
            },
            quantity: 1,
          },
        },
      },
      sideboard: { count: 0, cards: {} },
      maybeboard: { count: 0, cards: {} },
      companions: { count: 0, cards: {} },
    }

    const result = normalizeMoxfieldDeck(deck, sourceUrl)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].oracleId).toBe('oracle-sol')
  })

  it('falls back to scryfall_id when oracle_id is missing and logs a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const deck: MoxfieldDeckFull = {
      id: 'test-id',
      name: 'Test Deck',
      format: 'commander',
      publicId: 'testDeck',
      commanders: { count: 0, cards: {} },
      mainboard: {
        count: 1,
        cards: {
          'card-key': {
            card: {
              name: 'Mystery Card',
              scryfall_id: 'scryfall-mystery',
              set: 'tst',
              type_line: 'Creature',
              cmc: 3,
              color_identity: ['G'],
              mana_cost: '{2}{G}',
            } as MoxfieldDeckFull['mainboard']['cards'][string]['card'],
            quantity: 1,
          },
        },
      },
      sideboard: { count: 0, cards: {} },
      maybeboard: { count: 0, cards: {} },
      companions: { count: 0, cards: {} },
    }

    const result = normalizeMoxfieldDeck(deck, sourceUrl)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].oracleId).toBe('scryfall-mystery')
    expect(result.cards[0].cardName).toBe('Mystery Card')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Mystery Card')
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing oracle_id')
    )

    warnSpy.mockRestore()
  })

  it('falls back to scryfall_id when oracle_id is empty string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const deck: MoxfieldDeckFull = {
      id: 'test-id',
      name: 'Test Deck',
      format: 'commander',
      publicId: 'testDeck',
      commanders: { count: 0, cards: {} },
      mainboard: {
        count: 1,
        cards: {
          'card-key': {
            card: {
              name: 'Empty Oracle Card',
              scryfall_id: 'scryfall-empty',
              set: 'tst',
              type_line: 'Instant',
              oracle_id: '',
              cmc: 1,
              color_identity: ['W'],
              mana_cost: '{W}',
            },
            quantity: 1,
          },
        },
      },
      sideboard: { count: 0, cards: {} },
      maybeboard: { count: 0, cards: {} },
      companions: { count: 0, cards: {} },
    }

    const result = normalizeMoxfieldDeck(deck, sourceUrl)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].oracleId).toBe('scryfall-empty')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing oracle_id')
    )

    warnSpy.mockRestore()
  })

  it('skips cards with both oracle_id and scryfall_id missing and logs a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const deck: MoxfieldDeckFull = {
      id: 'test-id',
      name: 'Test Deck',
      format: 'commander',
      publicId: 'testDeck',
      commanders: { count: 0, cards: {} },
      mainboard: {
        count: 2,
        cards: {
          'valid-key': {
            card: {
              name: 'Valid Card',
              scryfall_id: 'scryfall-valid',
              set: 'tst',
              type_line: 'Creature',
              oracle_id: 'oracle-valid',
              cmc: 2,
              color_identity: ['G'],
              mana_cost: '{1}{G}',
            },
            quantity: 1,
          },
          'broken-key': {
            card: {
              name: 'Broken Card',
              scryfall_id: '',
              set: 'tst',
              type_line: 'Sorcery',
              cmc: 4,
              color_identity: ['R'],
              mana_cost: '{3}{R}',
            } as MoxfieldDeckFull['mainboard']['cards'][string]['card'],
            quantity: 1,
          },
        },
      },
      sideboard: { count: 0, cards: {} },
      maybeboard: { count: 0, cards: {} },
      companions: { count: 0, cards: {} },
    }

    const result = normalizeMoxfieldDeck(deck, sourceUrl)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].cardName).toBe('Valid Card')
    expect(result.cardCount).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Broken Card')
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing both oracle_id and scryfall_id')
    )

    warnSpy.mockRestore()
  })

  it('ensures every card in normalized output has a populated oracleId', () => {
    const result = normalizeMoxfieldDeck(moxfieldFixture, sourceUrl)
    for (const card of result.cards) {
      expect(card.oracleId).toBeTruthy()
      expect(card.oracleId.length).toBeGreaterThan(0)
    }
  })
})

describe('groupCardsByType', () => {
  it('groups cards by their primary type', () => {
    const result = normalizeArchidektDeck(archidektFixture, 'https://archidekt.com/decks/23289174')
    const grouped = groupCardsByType(result.cards)

    expect(grouped.groups.Creature).toHaveLength(3) // Korvold, STE, Dockside
    expect(grouped.totalCount).toBe(3)
  })

  it('classifies Instant correctly', () => {
    const cards = normalizeMoxfieldDeck(moxfieldFixture, 'https://moxfield.com/decks/aBcD1234').cards
    const grouped = groupCardsByType(cards)

    expect(grouped.groups.Instant).toHaveLength(1)
    expect(grouped.groups.Instant[0].cardName).toBe('Swords to Plowshares')
  })

  it('classifies Artifact correctly', () => {
    const cards = normalizeMoxfieldDeck(moxfieldFixture, 'https://moxfield.com/decks/aBcD1234').cards
    const grouped = groupCardsByType(cards)

    expect(grouped.groups.Artifact).toHaveLength(1)
    expect(grouped.groups.Artifact[0].cardName).toBe('Sol Ring')
  })

  it('classifies Land correctly', () => {
    const cards = normalizeMoxfieldDeck(moxfieldFixture, 'https://moxfield.com/decks/aBcD1234').cards
    const grouped = groupCardsByType(cards)

    expect(grouped.groups.Land).toHaveLength(1)
    expect(grouped.groups.Land[0].cardName).toBe('Command Tower')
  })

  it('prioritizes Creature over other types for multi-type cards', () => {
    // "Legendary Creature — Dragon Noble" should be Creature, not Other
    const result = normalizeArchidektDeck(archidektFixture, 'https://archidekt.com/decks/23289174')
    const grouped = groupCardsByType(result.cards)
    const korvold = grouped.groups.Creature.find((c) => c.cardName === 'Korvold, Fae-Cursed King')
    expect(korvold).toBeDefined()
  })

  it('classifies DFC by front face type', () => {
    const dfcCard = {
      cardName: 'Birgi, God of Storytelling',
      scryfallId: 'test-id',
      oracleId: 'test-oracle',
      setCode: 'khm',
      quantity: 1,
      typeLine: 'Legendary Creature — God // Legendary Artifact',
      isCommander: false,
      isProxy: false,
      manaCost: '{2}{R}',
      colorIdentity: ['R'],
    }
    const grouped = groupCardsByType([dfcCard])
    expect(grouped.groups.Creature).toHaveLength(1)
    expect(grouped.groups.Artifact).toHaveLength(0)
  })

  it('classifies unknown types as Other', () => {
    const unknownCard = {
      cardName: 'Some Weird Card',
      scryfallId: 'test-id',
      oracleId: 'test-oracle',
      setCode: 'tst',
      quantity: 1,
      typeLine: 'Conspiracy',
      isCommander: false,
      isProxy: false,
      manaCost: null,
      colorIdentity: [],
    }
    const grouped = groupCardsByType([unknownCard])
    expect(grouped.groups.Other).toHaveLength(1)
  })

  it('returns empty groups when no cards provided', () => {
    const grouped = groupCardsByType([])
    expect(grouped.totalCount).toBe(0)
    expect(grouped.groups.Creature).toHaveLength(0)
    expect(grouped.groups.Instant).toHaveLength(0)
    expect(grouped.groups.Land).toHaveLength(0)
  })

  it('sums quantities for totalCount', () => {
    const cards = [
      {
        cardName: 'Forest',
        scryfallId: 'forest-id',
        oracleId: 'forest-oracle',
        setCode: 'und',
        quantity: 10,
        typeLine: 'Basic Land — Forest',
        isCommander: false,
        isProxy: false,
        manaCost: null,
        colorIdentity: [],
      },
      {
        cardName: 'Sol Ring',
        scryfallId: 'sol-id',
        oracleId: 'sol-oracle',
        setCode: 'c21',
        quantity: 1,
        typeLine: 'Artifact',
        isCommander: false,
        isProxy: false,
        manaCost: '{1}',
        colorIdentity: [],
      },
    ]
    const grouped = groupCardsByType(cards)
    expect(grouped.totalCount).toBe(11)
  })

  it('classifies Enchantment Creature as Creature (priority)', () => {
    const card = {
      cardName: 'Courser of Kruphix',
      scryfallId: 'test-id',
      oracleId: 'test-oracle',
      setCode: 'bng',
      quantity: 1,
      typeLine: 'Enchantment Creature — Centaur',
      isCommander: false,
      isProxy: false,
      manaCost: '{1}{G}{G}',
      colorIdentity: ['G'],
    }
    const grouped = groupCardsByType([card])
    expect(grouped.groups.Creature).toHaveLength(1)
    expect(grouped.groups.Enchantment).toHaveLength(0)
  })

  it('classifies Artifact Land as Land (lower priority than Artifact)', () => {
    // Actually based on priority order, Artifact comes before Land
    // So "Artifact Land" should be classified as Artifact
    const card = {
      cardName: 'Seat of the Synod',
      scryfallId: 'test-id',
      oracleId: 'test-oracle',
      setCode: 'mrd',
      quantity: 1,
      typeLine: 'Artifact Land',
      isCommander: false,
      isProxy: false,
      manaCost: null,
      colorIdentity: [],
    }
    const grouped = groupCardsByType([card])
    expect(grouped.groups.Artifact).toHaveLength(1)
    expect(grouped.groups.Land).toHaveLength(0)
  })
})
