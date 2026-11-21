import { describe, expect, it } from 'vitest'
import type { RailCard } from '@/lib/deck-rail-stats'
import { simulateManaByTurn } from './simulate'

const land = (n: string, q: number, text: string | null = null): RailCard => ({ card_name: n, quantity: q, type_line: 'Land', oracle_text: text })
const filler = (q: number): RailCard => ({ card_name: 'Bear', quantity: q, type_line: 'Creature - Bear', mana_cost: '{1}{G}', oracle_text: null })
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

describe('simulateManaByTurn', () => {
  it('is deterministic for a fixed seed', () => {
    const deck = [land('Forest', 36), filler(63)]
    expect(simulateManaByTurn(deck, [], { games: 200, seed: 7 })).toEqual(simulateManaByTurn(deck, [], { games: 200, seed: 7 }))
  })

  it('a deck of all lands gives one land per turn', () => {
    const out = simulateManaByTurn([land('Forest', 99)], [], { games: 50, seed: 1 })
    out.forEach((turn, i) => turn.forEach((v) => expect(v).toBe(i + 1)))
  })

  it('a 99-land deck with no spells has mana equal to turn number', () => {
    const out = simulateManaByTurn([land('Forest', 99)], [], { games: 50 })
    expect(mean(out[6])).toBe(7)
  })

  it('mulligan keeps only 2 to 5 land hands, so turn 1 has a land almost always', () => {
    const out = simulateManaByTurn([land('Forest', 36), filler(63)], [], { games: 500, seed: 3 })
    expect(out[0].every((v) => v === 1)).toBe(true)
  })

  it('tapped lands lower turn 1 mana; all-untapped is never below', () => {
    const deck = [land('Forest', 20), land('Gate', 16, 'Gate enters tapped.\n{T}: Add {G}.'), filler(63)]
    const real = simulateManaByTurn(deck, [], { games: 1000, seed: 5 })
    const free = simulateManaByTurn(deck, [], { games: 1000, seed: 5, allUntapped: true })
    expect(mean(real[0])).toBeLessThan(mean(free[0]))
    real.forEach((turn, i) => expect(mean(free[i])).toBeGreaterThanOrEqual(mean(turn)))
  })

  it('conditional lands are tapped on turns 1 and 2 only', () => {
    const deck = [land('Check', 99, 'Check enters tapped unless you control a Forest.\n{T}: Add {G}.')]
    const out = simulateManaByTurn(deck, [], { games: 20, seed: 2 })
    expect(mean(out[0])).toBe(0)
    expect(mean(out[2])).toBe(3)
  })

  it('Sol Ring raises later turns', () => {
    const sol: RailCard = { card_name: 'Sol Ring', quantity: 1, type_line: 'Artifact', mana_cost: '{1}', oracle_text: '{T}: Add {C}{C}.' }
    const without = simulateManaByTurn([land('Forest', 36), filler(63)], [], { games: 1000, seed: 9 })
    const withSol = simulateManaByTurn([land('Forest', 36), filler(62), sol], [], { games: 1000, seed: 9 })
    expect(mean(withSol[6])).toBeGreaterThan(mean(without[6]))
  })

  it('a one-shot adds mana only on the turn it is cast', () => {
    const ritual: RailCard = { card_name: 'Dark Ritual', quantity: 40, type_line: 'Instant', mana_cost: '{B}', oracle_text: 'Add {B}{B}{B}.' }
    const out = simulateManaByTurn([land('Swamp', 59), ritual], [], { games: 300, seed: 4 })
    expect(mean(out[0])).toBeGreaterThan(1)
  })

  it('a commander that is ramp is available from the start', () => {
    const cmd: RailCard = { card_name: 'Rock Lord', quantity: 1, type_line: 'Legendary Artifact', mana_cost: '{1}', oracle_text: '{T}: Add {C}{C}.' }
    const out = simulateManaByTurn([land('Forest', 99), cmd], ['Rock Lord'], { games: 20, seed: 1 })
    expect(mean(out[1])).toBe(4)
  })
})
