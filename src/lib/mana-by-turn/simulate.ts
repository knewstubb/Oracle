// Monte Carlo of the first turns on the play: how much mana is available each turn.
import type { RailCard } from '@/lib/deck-rail-stats'
import { hashSeed, mulberry32, shuffle } from './prng'
import { simCardFromRail, type SimCard } from './card-facts'

export interface SimOptions {
  games?: number
  turns?: number
  /** Treat every land as entering untapped (the dashed comparison line). */
  allUntapped?: boolean
  seed?: number
}

const MIN_LANDS = 2
const MAX_LANDS = 5
const MULLIGAN_CAP = 100

/** Seed from the sorted "name:qty" list plus commander names, so the same deck gives the same chart. */
export function seedForDeck(cards: RailCard[], commanderNames: string[]): number {
  const parts = cards.map((c) => `${c.card_name}:${c.quantity || 1}`).sort()
  return hashSeed([...parts, '|', ...[...commanderNames].sort()])
}

interface Plan {
  castIdx: number[]
  castCost: number
  /** Mana gained this turn from one-shots, as counted in the chart. */
  gain: number
}

/** Greedy spend: ramp and one-shots cheapest first, then draw spells with what is left. */
function plan(pool: number, hand: SimCard[]): Plan {
  const spells = hand.map((card, idx) => ({ card, idx })).filter((s) => s.card.kind !== 'land' && s.card.kind !== 'other')
  const byCost = (a: { card: SimCard }, b: { card: SimCard }) => a.card.cost - b.card.cost
  const first = spells.filter((s) => s.card.kind === 'ramp' || s.card.kind === 'oneShot').sort(byCost)
  const second = spells.filter((s) => s.card.kind === 'draw').sort(byCost)
  let remaining = pool
  let castCost = 0
  let gain = 0
  const castIdx: number[] = []
  for (const s of [...first, ...second]) {
    if (s.card.cost > remaining) continue
    remaining -= s.card.cost
    castCost += s.card.cost
    castIdx.push(s.idx)
    if (s.card.kind === 'oneShot') {
      remaining += s.card.produced
      gain += s.card.ritual ? s.card.produced - s.card.cost : s.card.produced
    }
  }
  return { castIdx, castCost, gain }
}

function drawHand(deck: SimCard[], rand: () => number): SimCard[] {
  let hand: SimCard[] = []
  for (let attempt = 0; attempt < MULLIGAN_CAP; attempt++) {
    shuffle(deck, rand)
    hand = deck.slice(deck.length - 7)
    const lands = hand.filter((c) => c.kind === 'land').length
    if (lands >= MIN_LANDS && lands <= MAX_LANDS) break
  }
  deck.length = Math.max(0, deck.length - 7)
  return hand
}

/** Returns, for each turn, the mana available in every simulated game. */
export function simulateManaByTurn(
  cards: RailCard[],
  commanderNames: string[],
  options: SimOptions = {},
): number[][] {
  const games = options.games ?? 5000
  const turns = options.turns ?? 7
  const allUntapped = options.allUntapped ?? false
  const rand = mulberry32(options.seed ?? seedForDeck(cards, commanderNames))
  const commanderSet = new Set(commanderNames)

  const library: SimCard[] = []
  const zone: SimCard[] = []
  const seenCommander = new Set<string>()
  for (const card of cards) {
    if (commanderSet.has(card.card_name)) {
      if (!seenCommander.has(card.card_name)) zone.push(simCardFromRail(card, true))
      seenCommander.add(card.card_name)
      continue
    }
    const sim = simCardFromRail(card)
    for (let i = 0; i < (card.quantity || 1); i++) library.push(sim)
  }

  const out: number[][] = Array.from({ length: turns }, () => [])
  for (let g = 0; g < games; g++) {
    const deck = library.slice()
    let hand = [...drawHand(deck, rand), ...zone]
    let landMana = 0
    let rampMana = 0
    for (let t = 1; t <= turns; t++) {
      if (t > 1 && deck.length > 0) hand.push(deck.pop() as SimCard)
      const base = landMana + rampMana
      const playsUntapped = (c: SimCard) => allUntapped || c.tap === 'untapped' || (c.tap === 'conditional' && t > 2)
      const lands = hand.filter((c) => c.kind === 'land').sort((a, b) => b.produced - a.produced)
      const untappedLand = lands.find(playsUntapped)
      const tappedLand = lands.find((c) => !playsUntapped(c))
      let land: SimCard | undefined
      if (untappedLand && tappedLand) {
        const withUntapped = plan(base + untappedLand.produced, hand).castCost
        const withTapped = plan(base, hand).castCost
        land = withUntapped > withTapped ? untappedLand : tappedLand
      } else {
        land = untappedLand ?? tappedLand
      }
      let pool = base
      if (land) {
        if (playsUntapped(land)) pool += land.produced
        landMana += land.produced
        hand.splice(hand.indexOf(land), 1)
      }
      const turnPlan = plan(pool, hand)
      out[t - 1].push(pool + turnPlan.gain)
      const cast = new Set(turnPlan.castIdx)
      const drawn: SimCard[] = []
      for (const idx of turnPlan.castIdx) {
        const card = hand[idx]
        if (card.kind === 'ramp') rampMana += card.produced
        for (let d = 0; d < card.draws && deck.length > 0; d++) drawn.push(deck.pop() as SimCard)
      }
      hand = hand.filter((_, i) => !cast.has(i)).concat(drawn)
    }
  }
  return out
}
