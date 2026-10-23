import { describe, it, expect } from 'vitest'
import {
  fileCommandZone,
  hasCompanionKeyword,
  limitCompanions,
  retagCompanions,
  type BoardCandidate,
} from '@/lib/import-command-zone'
import { eligibleSecondNames, type CommanderCardFacts } from '@/lib/commander-eligibility'
import { buildDeckPreview, type ManaBoxCardFacts, type ManaBoxResolver } from '@/lib/manabox-import'

const c = (name: string, board?: BoardCandidate['board']): BoardCandidate => ({
  cardName: name, oracleId: `o-${name}`, scryfallId: `s-${name}`, board,
})

describe('E-22 retag', () => {
  const text = new Map<string, string | null>([['lurrus of the dream-den', 'Companion — Each permanent card in your starting deck has MV 2 or less.\nLifelink']])
  it('re-tags a Companion-keyword card in the commander section when another commander exists', () => {
    const r = retagCompanions([c('Atraxa', 'commander'), c('Lurrus of the Dream-Den', 'commander')], text)
    expect(r.candidates.map((x) => x.board)).toEqual(['commander', 'companion'])
    expect(r.notes[0]).toMatch(/is a companion/)
  })
  it('leaves a lone commander alone, even with the keyword', () => {
    expect(retagCompanions([c('Lurrus of the Dream-Den', 'commander')], text).candidates[0].board).toBe('commander')
  })
  it('leaves a card with no card text alone', () => {
    expect(retagCompanions([c('A', 'commander'), c('B', 'commander')], new Map()).candidates.map((x) => x.board)).toEqual(['commander', 'commander'])
  })
  it('detects the keyword only at the start of a line', () => {
    expect(hasCompanionKeyword("Doctor's companion")).toBe(false)
    expect(hasCompanionKeyword('Companion — x')).toBe(true)
  })
})

describe('more than one companion', () => {
  it('first stays, the rest go to the maybeboard with a note', () => {
    const r = limitCompanions([c('A', 'companion'), c('B', 'companion'), c('C', 'companion')])
    expect(r.candidates.map((x) => x.board)).toEqual(['companion', 'maybeboard', 'maybeboard'])
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0]).toMatch(/B, C were put on the maybeboard/)
  })
  it('the same companion twice is not demoted', () => {
    expect(limitCompanions([c('A', 'companion'), c('A', 'companion')]).candidates.map((x) => x.board)).toEqual(['companion', 'companion'])
  })
})

describe('file command zone (pre-tick)', () => {
  it('reads up to two commanders and one companion', () => {
    const z = fileCommandZone([c('P', 'commander'), c('Q', 'commander'), c('R', 'commander'), c('L', 'companion'), c('M', 'companion')])
    expect(z.commanders.map((x) => x.name)).toEqual(['P', 'Q'])
    expect(z.companion?.name).toBe('L')
  })
  it('is empty when the file marks nothing', () => {
    expect(fileCommandZone([c('X')])).toEqual({ commanders: [], companion: null })
  })
})

describe('second-commander eligibility list', () => {
  const f = (name: string, type: string, text: string): CommanderCardFacts & { name: string } => ({
    name, type_line: type, oracle_text: text, power: '1', toughness: '1', commander_legal: true,
  })
  const m = new Map([
    ['partner b', f('Partner B', 'Legendary Creature — Elf', 'Partner')],
    ['plain legend', f('Plain Legend', 'Legendary Creature — Elf', 'Flying')],
    ['a background', f('A Background', 'Legendary Enchantment — Background', 'Commander creatures you own have haste.')],
  ])
  it('lists only cards that pair legally', () => {
    const partner = { name: 'Partner A', type_line: 'Legendary Creature', oracle_text: 'Partner' }
    expect(eligibleSecondNames(partner, ['Partner B', 'Plain Legend', 'A Background'], m)).toEqual(['Partner B'])
    const chooser = { name: 'Chooser', type_line: 'Legendary Creature', oracle_text: 'Choose a Background' }
    expect(eligibleSecondNames(chooser, ['Partner B', 'Plain Legend', 'A Background'], m)).toEqual(['A Background'])
  })
})

describe('Arena fixture with a Companion heading (preview)', () => {
  const resolver: ManaBoxResolver = {
    async resolveByScryfallId() { return null },
    async resolveBySetCollector() { return null },
    async resolveByName(name: string) {
      const facts: ManaBoxCardFacts = { oracleId: `o-${name}`, scryfallId: `s-${name}`, cardName: name, setCode: 'xxx', layout: 'normal', typeLine: 'Creature' }
      return facts
    },
  } as unknown as ManaBoxResolver

  const arena = 'Commander\n1 Atraxa, Praetors\' Voice\n\nCompanion\n1 Lurrus of the Dream-Den\n\nDeck\n1 Sol Ring\n'

  it('pre-ticks the companion, keeps it out of the unmatched list, drops the old interim note', async () => {
    const p = await buildDeckPreview({ fileName: 'arena.txt', textContent: arena }, resolver)
    expect(p.companion?.name).toBe('Lurrus of the Dream-Den')
    expect(p.commanders?.map((x) => x.name)).toEqual(["Atraxa, Praetors' Voice"])
    expect((p.notes ?? []).join(' ')).not.toMatch(/kept in the main list; set it up/)
    expect((p.notes ?? []).join(' ')).toMatch(/ticked as the companion/)
  })

  it('E-22: re-tags a companion listed with the commanders using card text', async () => {
    const txt = 'Commander\n1 Atraxa\n1 Lurrus of the Dream-Den\n'
    const p = await buildDeckPreview(
      { fileName: 'x.txt', textContent: txt },
      resolver,
      async () => new Map([['lurrus of the dream-den', 'Companion — Each permanent card has MV 2 or less.']])
    )
    expect(p.commanders?.map((x) => x.name)).toEqual(['Atraxa'])
    expect(p.companion?.name).toBe('Lurrus of the Dream-Den')
  })

  it('two companions: first ticked, the other goes to the maybeboard', async () => {
    const p = await buildDeckPreview({ fileName: 'x.txt', textContent: 'Companion\n1 Lurrus of the Dream-Den\n1 Yorion, Sky Nomad\n' }, resolver)
    expect(p.companion?.name).toBe('Lurrus of the Dream-Den')
    expect(p.rows.find((r) => r.cardName === 'Yorion, Sky Nomad')?.board).toBe('maybeboard')
    expect((p.notes ?? []).join(' ')).toMatch(/one companion/)
  })
})
