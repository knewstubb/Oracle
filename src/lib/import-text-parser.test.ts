import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyHeading, parseListText } from '@/lib/import-text-parser'
import { parseTextDecklist, isTextParseError } from '@/lib/text-deck-parser'
import { parseManaBoxText } from '@/lib/manabox-import'

const DIR = resolve(process.cwd(), 'docs/oracle/samples/import-formats')
const fixture = (name: string) => readFileSync(resolve(DIR, name), 'utf8')
const boards = (text: string) => parseListText(text).lines.map((l) => [l.cardName, l.board])

describe('section words (§5), table-driven', () => {
  const cases: Array<[string, string]> = [
    ['Commander', 'commander'],
    ['Commanders', 'commander'],
    ['Commander(s)', 'commander'],
    ['Command Zone', 'commander'],
    ['General', 'commander'],
    ['Deck', 'main'],
    ['Main', 'main'],
    ['Mainboard', 'main'],
    ['Main Deck', 'main'],
    ['Maindeck', 'main'],
    ['Library', 'main'],
    ['Maybeboard', 'maybeboard'],
    ['Maybe', 'maybeboard'],
    ['Considering', 'maybeboard'],
    ['Consider', 'maybeboard'],
    ['Maybe Board', 'maybeboard'],
    ['Wishlist', 'maybeboard'],
    ['Sideboard', 'maybeboard'],
    ['Side Board', 'maybeboard'],
    ['Side', 'maybeboard'],
    ['Sb', 'maybeboard'],
    ['Companion', 'companion'],
    ['Companions', 'companion'],
  ]
  it.each(cases)('%s -> %s', (word, board) => {
    expect(classifyHeading(word)).toEqual({ kind: 'board', board })
    expect(classifyHeading(word.toUpperCase())).toEqual({ kind: 'board', board })
    expect(classifyHeading(`${word}:`)).toEqual({ kind: 'board', board })
    expect(classifyHeading(`//${word}`)).toEqual({ kind: 'board', board })
    expect(classifyHeading(`${word} (15)`)).toEqual({ kind: 'board', board })
  })

  it('a quantity in front means it is a card, never a heading (E-4)', () => {
    expect(classifyHeading('1 Commander')).toBeNull()
    expect(classifyHeading('1 Island')).toBeNull()
  })

  it('tokens, odd boards and groupings', () => {
    expect(classifyHeading('Tokens')).toEqual({ kind: 'tokens' })
    expect(classifyHeading('Token')).toEqual({ kind: 'tokens' })
    for (const w of ['Attractions', 'Stickers', 'Contraptions', 'Acorn']) {
      expect(classifyHeading(w)).toEqual({ kind: 'odd' })
    }
    for (const w of ['Lands', 'Creatures', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Planeswalkers', 'Ramp', 'Removal']) {
      expect(classifyHeading(w)).toEqual({ kind: 'grouping' })
    }
  })

  it('every section word sets the board for the cards under it', () => {
    for (const [word, board] of cases) {
      const lines = parseListText(`${word}\n1 Sol Ring`).lines
      expect(lines[0].board, word).toBe(board)
    }
  })

  it('a blank line does not end a named section', () => {
    expect(boards('Sideboard\n1 A\n\n1 B')).toEqual([
      ['A', 'maybeboard'],
      ['B', 'maybeboard'],
    ])
  })

  it('type groupings leave the section unchanged', () => {
    expect(boards('Maybeboard\nLands (3)\n1 A\nCreatures\n1 B')).toEqual([
      ['A', 'maybeboard'],
      ['B', 'maybeboard'],
    ])
  })

  it('attractions go to the maybeboard with a warning', () => {
    const r = parseListText('Attractions\n1 Some Attraction')
    expect(r.lines[0].board).toBe('maybeboard')
    expect(r.warnings.join(' ')).toMatch(/not a normal deck card/)
  })

  it('tokens: every line under the heading is skipped and counted', () => {
    const r = parseListText('1 Sol Ring\nTokens\n1 Goblin\n2 Treasure\nDeck\n1 Island')
    expect(r.skippedTokens.map((t) => t.rawLine)).toEqual(['1 Goblin', '2 Treasure'])
    expect(r.lines.map((l) => l.cardName)).toEqual(['Sol Ring', 'Island'])
  })
})

describe('line-level forms (§5)', () => {
  it('SB: puts one line on the maybeboard and leaves the section alone', () => {
    expect(boards('1 A\nSB: 1 B\n1 C')).toEqual([
      ['A', 'main'],
      ['B', 'maybeboard'],
      ['C', 'main'],
    ])
    expect(boards('1 A\nSB 2 B')).toEqual([
      ['A', 'main'],
      ['B', 'maybeboard'],
    ])
  })

  it('CMDR: / Commander: prefix marks one commander line', () => {
    expect(boards('CMDR: 1 A\nCommander: 1 B\n1 C')).toEqual([
      ['A', 'commander'],
      ['B', 'commander'],
      ['C', 'main'],
    ])
  })

  it('tags: [Commander], [Commander{top}], [Maybeboard{noDeck}], [Sideboard]', () => {
    expect(
      boards('1 A [Commander]\n1 B [Commander{top}]\n1 C [Maybeboard{noDeck}{noPrice}]\n1 D [Sideboard]\n1 E [Ramp,Removal]')
    ).toEqual([
      ['A', 'commander'],
      ['B', 'commander'],
      ['C', 'maybeboard'],
      ['D', 'maybeboard'],
      ['E', 'main'],
    ])
  })

  it('end-of-line comments #commander and // commander', () => {
    expect(boards('1 A #commander\n1 B // commander\n1 C # just a note')).toEqual([
      ['A', 'commander'],
      ['B', 'commander'],
      ['C', 'main'],
    ])
  })

  it('a DFC keeps its // and is not read as a comment', () => {
    expect(parseListText('1 Fire // Ice').lines[0].cardName).toBe('Fire // Ice')
    expect(parseListText('1 Adventurous Eater // Have a Bite (SOS) 72').lines[0]).toMatchObject({
      cardName: 'Adventurous Eater // Have a Bite',
      setCode: 'SOS',
      collectorNumber: '72',
    })
  })

  it('a // or # line is a heading only when its word is a section word', () => {
    expect(boards('//Maybeboard\n1 A\n// just a comment\n# another\n1 B')).toEqual([
      ['A', 'maybeboard'],
      ['B', 'maybeboard'],
    ])
  })

  it('line-level tag beats the section; maybeboard beats commander with a warning', () => {
    expect(boards('Sideboard\n1 A [Commander]')).toEqual([['A', 'commander']])
    const r = parseListText('Commander\nSB: 1 A [Commander]')
    expect(r.lines[0].board).toBe('maybeboard')
    expect(r.warnings.join(' ')).toMatch(/marked more than one way/)
  })

  it('line-level SB: inside a Deck block wins (E-8)', () => {
    expect(boards('Deck\n1 A\nSB: 1 B')).toEqual([
      ['A', 'main'],
      ['B', 'maybeboard'],
    ])
  })
})

describe('card line (§6.1)', () => {
  it('set codes run 2-6 characters', () => {
    expect(parseListText('1 Sol Ring (30A) 12').lines[0]).toMatchObject({ setCode: '30A', collectorNumber: '12' })
    expect(parseListText('1 Sol Ring (PLST) CMR-472').lines[0]).toMatchObject({ setCode: 'PLST', collectorNumber: 'CMR-472' })
    expect(parseListText('1 Sol Ring (PMEIID) 5').lines[0].setCode).toBe('PMEIID')
  })

  it('collector numbers are kept verbatim', () => {
    for (const num of ['191', '191a', '★', '12★', 'P12']) {
      expect(parseListText(`1 Abrade (BLC) ${num}`).lines[0].collectorNumber).toBe(num)
    }
  })

  it('Deckstats [SET#NUM] form', () => {
    expect(parseListText('1 [CMM#400] Sol Ring # comment').lines[0]).toMatchObject({
      cardName: 'Sol Ring',
      setCode: 'CMM',
      collectorNumber: '400',
    })
  })

  it('quantity forms: 1, 1x, 1 x, tab, non-breaking space, CRLF, BOM', () => {
    const text = '\uFEFF1 A\r\n2x B\r\n3 x C\r\n4\tD\r\n5\u00A0E\r\n'
    expect(parseListText(text).lines.map((l) => [l.quantity, l.cardName])).toEqual([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
      [4, 'D'],
      [5, 'E'],
    ])
  })

  it('a name that starts with x is not eaten by the quantity (1 Xenagos)', () => {
    expect(parseListText('1 Xenagos, God of Revels').lines[0].cardName).toBe('Xenagos, God of Revels')
  })

  it('E-19: quantity 0 and quantity over 100 are unmatched', () => {
    const r = parseListText('0 A\n1 B\n101 C')
    expect(r.lines.map((l) => l.cardName)).toEqual(['B'])
    expect(r.badLines.map((b) => b.rawLine)).toEqual(['0 A', '101 C'])
  })
})

describe('edge cases', () => {
  it('E-3: a no-quantity line is unmatched when other lines have quantities', () => {
    const r = parseListText('1 Sol Ring\nCultivate Tree Of Life')
    expect(r.badLines.map((b) => b.rawLine)).toEqual(['Cultivate Tree Of Life'])
  })

  it('E-3: a file where no line has a quantity is a name list, one each', () => {
    const r = parseListText(fixture('mtggoldfish-deck.txt'))
    expect(r.lines.map((l) => [l.quantity, l.cardName])).toEqual([
      [1, 'Sol Ring'],
      [1, 'Command Tower'],
      [1, 'Arcane Signet'],
      [1, 'Cultivate'],
    ])
    expect(r.badLines).toEqual([])
  })

  it('unknown single-word headings are ignored with a warning and the board is unchanged', () => {
    const r = parseListText('Sideboard\nMisc\n1 A\nStuff (4)\n1 B')
    expect(r.lines.map((l) => [l.cardName, l.board])).toEqual([
      ['A', 'maybeboard'],
      ['B', 'maybeboard'],
    ])
    expect(r.warnings).toHaveLength(2)
    expect(r.badLines).toEqual([])
  })

  it('E-4/E-5: cards named like section words are cards', () => {
    const r = parseListText(fixture('edge-section-words-as-card-names.txt'))
    expect(r.lines.map((l) => l.cardName)).toEqual([
      'Commander Info',
      'Sideboard Specialist',
      'Island',
      'Wastes',
    ])
    expect(r.lines.every((l) => l.board === 'main')).toBe(true)
    // `Sol Ring` with no quantity is unmatched; `Lands (36)` and `Other` are ignored groupings.
    expect(r.badLines.map((b) => b.rawLine)).toEqual(['Sol Ring'])
  })

  it('E-1/E-6/E-8: conflicting sections fixture', () => {
    const r = parseListText(fixture('edge-conflicting-sections.txt'))
    expect(r.lines.map((l) => [l.cardName, l.board])).toEqual([
      ['Atraxa, Praetors\' Voice', 'commander'],
      ['Tymna the Weaver', 'maybeboard'],
      ['Sol Ring', 'commander'],
      ['Sol Ring', 'main'],
      ['Cultivate', 'main'],
      ['Sol Ring', 'maybeboard'],
      ['Cyclonic Rift', 'maybeboard'],
    ])
    expect(r.warnings.join(' ')).toMatch(/Cyclonic Rift/)
  })

  it('E-7: a very large Commander section warns', () => {
    const text = 'Commander\n' + Array.from({ length: 100 }, (_, i) => `1 Card ${i}`).join('\n')
    expect(parseListText(text).warnings.join(' ')).toMatch(/unusually large/)
  })

  it('A-1: an untitled block after a blank line stays in the main deck, with one note', () => {
    const r = parseListText(fixture('mtgo-sb-prefix.txt'))
    expect(r.lines.map((l) => [l.cardName, l.board])).toEqual([
      ['Lightning Bolt', 'main'],
      ['Sol Ring', 'main'],
      ['Island', 'main'],
      ['Negate', 'maybeboard'],
      ['Cyclonic Rift', 'maybeboard'],
      ['Counterspell', 'main'],
    ])
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0]).toMatch(/kept in the main deck/)
  })

  it('E-21: the first card of an untitled list stays main', () => {
    expect(boards('1 Atraxa\n1 Sol Ring').every(([, b]) => b === 'main')).toBe(true)
  })
})

describe('format fixtures', () => {
  it('Arena commander list', () => {
    expect(boards(fixture('mtgarena-commander.txt'))).toEqual([
      ["Atraxa, Praetors' Voice", 'commander'],
      ['Sol Ring', 'main'],
      ['Command Tower', 'main'],
      ['Cultivate', 'main'],
      ['Lurrus of the Dream-Den', 'companion'],
      ['Cyclonic Rift', 'maybeboard'],
    ])
  })

  it('Moxfield: SIDEBOARD: and Maybeboard headings, blank lines between blocks', () => {
    expect(boards(fixture('moxfield-deck.txt'))).toEqual([
      ["Atraxa, Praetors' Voice", 'main'], // untitled first card stays main (E-21)
      ['Sol Ring', 'main'],
      ['Arcane Signet', 'main'],
      ['Command Tower', 'main'],
      ['Cultivate', 'main'],
      ['Cyclonic Rift', 'maybeboard'],
      ['Rhystic Study', 'maybeboard'],
    ])
  })

  it('Archidekt text: categories, proxy label, finish markers, flags stripped', () => {
    const lines = parseListText(fixture('archidekt-deck.txt')).lines
    expect(lines.map((l) => [l.cardName, l.board])).toEqual([
      ["Atraxa, Praetors' Voice", 'commander'],
      ['Sol Ring', 'main'],
      ['Arcane Signet', 'main'],
      ['Command Tower', 'main'],
      ['Cyclonic Rift', 'maybeboard'],
      ['Swords to Plowshares', 'maybeboard'],
      ['Adventurous Eater // Have a Bite', 'main'],
    ])
    expect(lines[2].proxy).toBe(true)
    expect(lines[1].proxy).toBeUndefined()
  })

  it('Deckstats: //Commander, //Main, //Maybeboard, SB:, [SET#NUM], trailing comment', () => {
    const lines = parseListText(fixture('deckstats-deck.txt')).lines
    expect(lines.map((l) => [l.cardName, l.board, l.setCode, l.collectorNumber])).toEqual([
      ["Atraxa, Praetors' Voice", 'commander', 'C16', '28'],
      ['Sol Ring', 'main', 'CMM', '400'],
      ['Command Tower', 'main', '', ''],
      ['Rhystic Study', 'commander', '', ''],
      ['Cyclonic Rift', 'maybeboard', '', ''],
      ['Negate', 'maybeboard', '', ''],
      ['Cultivate', 'maybeboard', 'CMM', '245'],
    ])
  })

  it('E-20: curly quotes survive parsing (normalised only for lookup)', () => {
    expect(parseListText('1 Jaya’s Immolating Inferno').lines[0].cardName).toBe('Jaya’s Immolating Inferno')
  })
})

describe('regression: Sideboard/Maybeboard cards never reach the main list (§1 fault)', () => {
  const text = [
    'Commander',
    '1 Atraxa, Praetors\' Voice',
    '',
    'Deck',
    '1 Sol Ring',
    '',
    'Sideboard',
    '1 Negate',
    '',
    'Maybeboard',
    '1 Cyclonic Rift',
    'SB: 1 Counterspell',
  ].join('\n')

  it('parseTextDecklist puts them in the maybeboard relation', () => {
    const result = parseTextDecklist(text, 'x')
    expect(isTextParseError(result)).toBe(false)
    if (isTextParseError(result)) return
    expect(result.deck.cards.map((c) => c.cardName)).toEqual(["Atraxa, Praetors' Voice", 'Sol Ring'])
    expect(result.deck.maybeboard?.map((c) => c.cardName)).toEqual(['Negate', 'Cyclonic Rift', 'Counterspell'])
    expect(result.deck.commander?.cardName).toBe("Atraxa, Praetors' Voice")
    expect(result.deck.cards[0].isCommander).toBe(true)
  })

  it('a blank line no longer ends the Commander section (§5)', () => {
    const result = parseTextDecklist('Commander\n1 A\n\n1 B', 'x')
    if (isTextParseError(result)) throw new Error('unexpected')
    expect(result.deck.cards.map((c) => c.isCommander)).toEqual([true, true])
  })

  it('parseManaBoxText exposes the board too', () => {
    const r = parseManaBoxText(text)
    expect(r.lines.filter((l) => l.board === 'maybeboard').map((l) => l.cardName)).toEqual([
      'Negate',
      'Cyclonic Rift',
      'Counterspell',
    ])
  })

  it('an all-maybeboard paste is not an error', () => {
    expect(isTextParseError(parseTextDecklist('Sideboard\n1 A', 'x'))).toBe(false)
  })
})
