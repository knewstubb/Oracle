/**
 * Mana Analysis Utilities
 *
 * Parses mana cost strings and calculates pip requirements
 * for accurate land source recommendations.
 *
 * Mana cost format examples:
 * - "{W}{W}{U}" → 2 white pips, 1 blue pip
 * - "{2}{B}{B}" → 2 black pips (generic mana ignored for color)
 * - "{X}{G}{G}{G}" → 3 green pips
 * - "{W/U}" → hybrid, counts as 0.5 for each color
 * - "{2/W}" → two-brid, counts as 1 white pip
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipCount {
  W: number
  U: number
  B: number
  R: number
  G: number
  C: number // colorless (e.g., Eldrazi)
  generic: number
  total: number
}

export interface ColorRequirements {
  /** Total pips of each color across all cards */
  totalPips: PipCount
  /** Cards requiring double (or more) colored pips at each CMC */
  doublePipCards: Array<{
    cardName: string
    color: string
    pipCount: number
    cmc: number
  }>
  /** Cards requiring triple colored pips */
  triplePipCards: Array<{
    cardName: string
    color: string
    pipCount: number
    cmc: number
  }>
  /** Per-color statistics */
  colorStats: Record<string, {
    totalPips: number
    cardCount: number
    avgPipsPerCard: number
    maxPips: number
    maxPipCard: string
  }>
}

export interface LandRecommendation {
  color: string
  colorName: string
  currentSources: number
  recommendedSources: number
  status: 'ok' | 'low' | 'high'
  pipPercentage: number
  message: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = ['W', 'U', 'B', 'R', 'G'] as const
type Color = typeof COLORS[number]

const COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless',
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a mana cost string into pip counts.
 * Handles: {W}, {U}, {B}, {R}, {G}, {C}, {X}, {1-20}, {W/U} hybrids, {2/W} two-brids
 */
export function parseManaCost(manaCost: string | null | undefined): PipCount {
  const result: PipCount = {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
    generic: 0,
    total: 0,
  }

  if (!manaCost) return result

  // Match all mana symbols: {X}, {1}, {W}, {W/U}, {2/W}, etc.
  const symbols = manaCost.match(/\{[^}]+\}/g) || []

  for (const symbol of symbols) {
    const inner = symbol.slice(1, -1) // Remove { and }

    if (inner === 'X') {
      // X costs don't count toward pip requirements
      continue
    }

    if (/^\d+$/.test(inner)) {
      // Generic mana: {1}, {2}, etc.
      result.generic += parseInt(inner, 10)
      result.total += parseInt(inner, 10)
      continue
    }

    if (inner === 'C') {
      // Colorless mana (Eldrazi)
      result.C += 1
      result.total += 1
      continue
    }

    if (inner.includes('/')) {
      // Hybrid mana
      const parts = inner.split('/')

      if (/^\d+$/.test(parts[0])) {
        // Two-brid: {2/W} - count as 1 colored pip (player likely pays color)
        const color = parts[1] as Color
        if (color in result && color !== 'C') {
          result[color] += 1
        }
        result.total += 1
      } else {
        // Color hybrid: {W/U} - count as 0.5 for each color
        // For land recommendations, we count each half
        for (const part of parts) {
          const color = part as Color
          if (color in result && color !== 'C') {
            result[color] += 0.5
          }
        }
        result.total += 1
      }
      continue
    }

    // Single color pip
    const color = inner as Color
    if (color in result && color !== 'generic' && color !== 'total') {
      result[color] += 1
      result.total += 1
    }
  }

  return result
}

/**
 * Calculate CMC from mana cost string.
 */
export function calculateCMC(manaCost: string | null | undefined): number {
  if (!manaCost) return 0

  const symbols = manaCost.match(/\{[^}]+\}/g) || []
  let cmc = 0

  for (const symbol of symbols) {
    const inner = symbol.slice(1, -1)

    if (inner === 'X') {
      // X counts as 0 for CMC calculation
      continue
    }

    if (/^\d+$/.test(inner)) {
      cmc += parseInt(inner, 10)
      continue
    }

    if (inner.includes('/')) {
      // Hybrid costs count as 1 CMC
      cmc += 1
      continue
    }

    // Single pip = 1 CMC
    cmc += 1
  }

  return cmc
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze color requirements for a set of cards.
 */
export function analyzeColorRequirements(
  cards: Array<{ card_name: string; mana_cost?: string | null; quantity?: number }>
): ColorRequirements {
  const totalPips: PipCount = {
    W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0, total: 0,
  }

  const doublePipCards: ColorRequirements['doublePipCards'] = []
  const triplePipCards: ColorRequirements['triplePipCards'] = []

  const colorStats: ColorRequirements['colorStats'] = {}
  for (const color of COLORS) {
    colorStats[color] = {
      totalPips: 0,
      cardCount: 0,
      avgPipsPerCard: 0,
      maxPips: 0,
      maxPipCard: '',
    }
  }

  for (const card of cards) {
    const qty = card.quantity || 1
    const pips = parseManaCost(card.mana_cost)
    const cmc = calculateCMC(card.mana_cost)

    // Aggregate total pips (multiplied by quantity)
    for (const color of [...COLORS, 'C'] as const) {
      totalPips[color] += pips[color] * qty
    }
    totalPips.generic += pips.generic * qty
    totalPips.total += pips.total * qty

    // Track per-color stats and multi-pip requirements
    for (const color of COLORS) {
      if (pips[color] > 0) {
        colorStats[color].totalPips += pips[color] * qty
        colorStats[color].cardCount += qty

        if (pips[color] > colorStats[color].maxPips) {
          colorStats[color].maxPips = pips[color]
          colorStats[color].maxPipCard = card.card_name
        }

        // Track double and triple pip cards
        if (pips[color] >= 3) {
          triplePipCards.push({
            cardName: card.card_name,
            color,
            pipCount: pips[color],
            cmc,
          })
        } else if (pips[color] >= 2) {
          doublePipCards.push({
            cardName: card.card_name,
            color,
            pipCount: pips[color],
            cmc,
          })
        }
      }
    }
  }

  // Calculate averages
  for (const color of COLORS) {
    const stats = colorStats[color]
    if (stats.cardCount > 0) {
      stats.avgPipsPerCard = stats.totalPips / stats.cardCount
    }
  }

  return { totalPips, doublePipCards, triplePipCards, colorStats }
}

/**
 * Generate land source recommendations based on pip requirements.
 *
 * Uses the Frank Karsten mana base heuristics:
 * - For reliable early colored mana, you want roughly:
 *   - 14 sources for 90% T1 (single pip)
 *   - 18 sources for 90% T2 double pip
 *   - 22 sources for 90% T3 triple pip
 *
 * For Commander (100-card, ~37 lands), we scale proportionally.
 * General rule: colored sources ≈ (color's pip % × total lands)
 * with a minimum floor to ensure playability.
 */
export function calculateLandRecommendations(
  colorRequirements: ColorRequirements,
  currentLandCounts: Record<string, number>,
  totalLands: number,
  deckColorIdentity: string
): LandRecommendation[] {
  const { totalPips, doublePipCards, triplePipCards, colorStats } = colorRequirements

  // Calculate total colored pips (exclude generic and colorless)
  const totalColoredPips = COLORS.reduce((sum, c) => sum + totalPips[c], 0)

  if (totalColoredPips === 0) {
    return [] // Colorless deck or no mana costs available
  }

  // Parse deck's color identity
  const deckColors = new Set(
    deckColorIdentity
      .split('')
      .filter((c) => COLORS.includes(c as Color))
  )

  const recommendations: LandRecommendation[] = []

  for (const color of COLORS) {
    if (!deckColors.has(color)) continue // Skip colors not in identity

    const pips = totalPips[color]
    const pipPercentage = pips / totalColoredPips

    // Base recommendation: proportional to pip percentage
    let recommended = Math.round(pipPercentage * totalLands)

    // Adjust for multi-pip requirements
    const hasDoublePip = doublePipCards.some((c) => c.color === color)
    const hasTriplePip = triplePipCards.some((c) => c.color === color)

    if (hasTriplePip) {
      // Triple pip cards need ~22 sources in 60-card for T3 reliability
      // In 100-card, that scales to about 37 sources, but we cap at deck's mana base
      recommended = Math.max(recommended, Math.min(22, Math.round(totalLands * 0.6)))
    } else if (hasDoublePip) {
      // Double pip cards need ~18 sources for T2 reliability
      // In Commander, ~16-18 sources per major color
      recommended = Math.max(recommended, Math.min(18, Math.round(totalLands * 0.5)))
    }

    // Minimum floor: at least 6 sources for any color in identity
    recommended = Math.max(6, recommended)

    // Cap at total lands (can't have more sources than lands)
    recommended = Math.min(recommended, totalLands)

    const current = currentLandCounts[color] || 0
    const diff = current - recommended

    let status: 'ok' | 'low' | 'high' = 'ok'
    let message = ''

    if (diff < -3) {
      status = 'low'
      message = `Add ${-diff} more ${COLOR_NAMES[color]} sources`
    } else if (diff > 5) {
      status = 'high'
      message = `Consider cutting ${diff} ${COLOR_NAMES[color]} sources`
    } else {
      message = 'On target'
    }

    recommendations.push({
      color,
      colorName: COLOR_NAMES[color],
      currentSources: current,
      recommendedSources: recommended,
      status,
      pipPercentage,
      message,
    })
  }

  return recommendations.sort((a, b) => b.recommendedSources - a.recommendedSources)
}

/**
 * Analyze lands to count color sources.
 * Basic lands provide 1 source each. Dual lands provide 1 source for each color.
 * Fetch lands, shocks, etc. are all counted as providing their colors.
 */
export function countLandSources(
  lands: Array<{ card_name: string; quantity?: number }>,
  deckColorIdentity: string
): Record<string, number> {
  const sources: Record<string, number> = {
    W: 0, U: 0, B: 0, R: 0, G: 0, C: 0,
  }

  // Basic land patterns
  const BASIC_PATTERNS: Record<string, Color> = {
    plains: 'W',
    island: 'U',
    swamp: 'B',
    mountain: 'R',
    forest: 'G',
    wastes: 'C' as Color, // Colorless basic
  }

  // Snow basics
  const SNOW_BASICS: Record<string, Color> = {
    'snow-covered plains': 'W',
    'snow-covered island': 'U',
    'snow-covered swamp': 'B',
    'snow-covered mountain': 'R',
    'snow-covered forest': 'G',
  }

  // Dual land color pairs (fetchable duals, shocks, etc.)
  const DUAL_PATTERNS: Array<[RegExp, Color[]]> = [
    // Shocklands
    [/hallowed fountain/i, ['W', 'U']],
    [/watery grave/i, ['U', 'B']],
    [/blood crypt/i, ['B', 'R']],
    [/stomping ground/i, ['R', 'G']],
    [/temple garden/i, ['G', 'W']],
    [/godless shrine/i, ['W', 'B']],
    [/steam vents/i, ['U', 'R']],
    [/overgrown tomb/i, ['B', 'G']],
    [/sacred foundry/i, ['R', 'W']],
    [/breeding pool/i, ['G', 'U']],
    // Original duals
    [/tundra/i, ['W', 'U']],
    [/underground sea/i, ['U', 'B']],
    [/badlands/i, ['B', 'R']],
    [/taiga/i, ['R', 'G']],
    [/savannah/i, ['G', 'W']],
    [/scrubland/i, ['W', 'B']],
    [/volcanic island/i, ['U', 'R']],
    [/bayou/i, ['B', 'G']],
    [/plateau/i, ['R', 'W']],
    [/tropical island/i, ['G', 'U']],
    // Fetchlands (count as providing all colors they can fetch)
    [/flooded strand/i, ['W', 'U']],
    [/polluted delta/i, ['U', 'B']],
    [/bloodstained mire/i, ['B', 'R']],
    [/wooded foothills/i, ['R', 'G']],
    [/windswept heath/i, ['G', 'W']],
    [/marsh flats/i, ['W', 'B']],
    [/scalding tarn/i, ['U', 'R']],
    [/verdant catacombs/i, ['B', 'G']],
    [/arid mesa/i, ['R', 'W']],
    [/misty rainforest/i, ['G', 'U']],
    // Triomes
    [/raffine's tower|obscura/i, ['W', 'U', 'B']],
    [/xander's lounge|maestros/i, ['U', 'B', 'R']],
    [/ziatora's proving|riveteers/i, ['B', 'R', 'G']],
    [/jetmir's garden|cabaretti/i, ['R', 'G', 'W']],
    [/spara's headquarters|brokers/i, ['G', 'W', 'U']],
    [/indatha triome/i, ['W', 'B', 'G']],
    [/ketria triome/i, ['U', 'R', 'G']],
    [/raugrin triome/i, ['U', 'R', 'W']],
    [/savai triome/i, ['R', 'W', 'B']],
    [/zagoth triome/i, ['B', 'G', 'U']],
    // Command Tower and similar (all colors in identity)
    [/command tower/i, 'ALL'],
    [/city of brass/i, 'ALL'],
    [/mana confluence/i, 'ALL'],
    [/exotic orchard/i, 'ALL'],
    [/forbidden orchard/i, 'ALL'],
    [/reflecting pool/i, 'ALL'],
    [/chromatic lantern/i, 'ALL'], // Not a land but sometimes counted
  ]

  // Parse deck colors
  const deckColors = deckColorIdentity.split('').filter((c) => COLORS.includes(c as Color)) as Color[]

  for (const land of lands) {
    const name = land.card_name.toLowerCase()
    const qty = land.quantity || 1

    // Check basic lands first
    let matched = false
    for (const [pattern, color] of Object.entries(BASIC_PATTERNS)) {
      if (name === pattern || name.endsWith(` ${pattern}`)) {
        sources[color] += qty
        matched = true
        break
      }
    }
    if (matched) continue

    // Check snow basics
    for (const [pattern, color] of Object.entries(SNOW_BASICS)) {
      if (name === pattern) {
        sources[color] += qty
        matched = true
        break
      }
    }
    if (matched) continue

    // Check dual patterns
    for (const [regex, colors] of DUAL_PATTERNS) {
      if (regex.test(name)) {
        if (colors === 'ALL') {
          for (const color of deckColors) {
            sources[color] += qty
          }
        } else {
          for (const color of colors as Color[]) {
            sources[color] += qty
          }
        }
        matched = true
        break
      }
    }
    if (matched) continue

    // Fallback: if land name contains a color word, count it
    // This handles lands like "Selesnya Sanctuary" or "Azorius Chancery"
    const colorWords: Array<[RegExp, Color[]]> = [
      [/azorius|dimir|selesnya|orzhov|boros|simic|izzet|golgari|rakdos|gruul/i, []], // Will match below
      [/plains|white/i, ['W']],
      [/island|blue/i, ['U']],
      [/swamp|black/i, ['B']],
      [/mountain|red/i, ['R']],
      [/forest|green/i, ['G']],
    ]

    // Guild names
    if (/azorius/i.test(name)) { sources.W += qty; sources.U += qty; continue }
    if (/dimir/i.test(name)) { sources.U += qty; sources.B += qty; continue }
    if (/rakdos/i.test(name)) { sources.B += qty; sources.R += qty; continue }
    if (/gruul/i.test(name)) { sources.R += qty; sources.G += qty; continue }
    if (/selesnya/i.test(name)) { sources.G += qty; sources.W += qty; continue }
    if (/orzhov/i.test(name)) { sources.W += qty; sources.B += qty; continue }
    if (/izzet/i.test(name)) { sources.U += qty; sources.R += qty; continue }
    if (/golgari/i.test(name)) { sources.B += qty; sources.G += qty; continue }
    if (/boros/i.test(name)) { sources.R += qty; sources.W += qty; continue }
    if (/simic/i.test(name)) { sources.G += qty; sources.U += qty; continue }

    // Shard/Wedge names
    if (/esper/i.test(name)) { sources.W += qty; sources.U += qty; sources.B += qty; continue }
    if (/grixis/i.test(name)) { sources.U += qty; sources.B += qty; sources.R += qty; continue }
    if (/jund/i.test(name)) { sources.B += qty; sources.R += qty; sources.G += qty; continue }
    if (/naya/i.test(name)) { sources.R += qty; sources.G += qty; sources.W += qty; continue }
    if (/bant/i.test(name)) { sources.G += qty; sources.W += qty; sources.U += qty; continue }
    if (/abzan|necra/i.test(name)) { sources.W += qty; sources.B += qty; sources.G += qty; continue }
    if (/jeskai|raka/i.test(name)) { sources.U += qty; sources.R += qty; sources.W += qty; continue }
    if (/sultai|ana/i.test(name)) { sources.B += qty; sources.G += qty; sources.U += qty; continue }
    if (/mardu|dega/i.test(name)) { sources.R += qty; sources.W += qty; sources.B += qty; continue }
    if (/temur|ceta/i.test(name)) { sources.G += qty; sources.U += qty; sources.R += qty; continue }

    // If no pattern matched, count as providing all deck colors (for utility lands)
    // This is a safe assumption for lands in the deck
    // Actually, don't auto-count - might be colorless utility lands
  }

  return sources
}

/**
 * Format pip count as a visual display string.
 * E.g., "WWU" for 2 white, 1 blue
 */
export function formatPipDisplay(pips: PipCount): string {
  let result = ''
  for (const color of COLORS) {
    const count = Math.floor(pips[color])
    result += color.repeat(count)
    // Handle half pips from hybrids
    if (pips[color] % 1 >= 0.5) {
      result += `(${color})`
    }
  }
  if (pips.C > 0) {
    result += 'C'.repeat(Math.floor(pips.C))
  }
  return result || '—'
}
