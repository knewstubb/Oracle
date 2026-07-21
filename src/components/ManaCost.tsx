'use client'

/**
 * ManaCost — renders a mana cost string (e.g. "{2}{W}{U}") as mana-font icons.
 *
 * Uses the mana-font package CSS classes:
 * - {W} → ms ms-w
 * - {U} → ms ms-u
 * - {B} → ms ms-b
 * - {R} → ms ms-r
 * - {G} → ms ms-g
 * - {1}, {2}, etc. → ms ms-1, ms ms-2
 * - {X} → ms ms-x
 * - {C} → ms ms-c (colorless)
 * - {W/U} → ms ms-wu (hybrid)
 * - {2/W} → ms ms-2w (hybrid generic)
 * - {W/P} → ms ms-wp (phyrexian)
 */

interface ManaCostProps {
  cost: string | null | undefined
  className?: string
}

/**
 * Parse a mana cost string like "{2}{W}{U}" into individual symbol codes.
 */
function parseManaCost(cost: string): string[] {
  const symbols: string[] = []
  const regex = /\{([^}]+)\}/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(cost)) !== null) {
    symbols.push(match[1])
  }

  return symbols
}

/**
 * Convert a mana symbol code to the mana-font CSS class.
 */
function symbolToClass(symbol: string): string {
  const s = symbol.toLowerCase()

  // Hybrid mana: {W/U} → ms-wu, {2/W} → ms-2w
  if (s.includes('/')) {
    const parts = s.split('/')
    // Phyrexian: {W/P} → ms-wp
    if (parts[1] === 'p') {
      return `ms ms-${parts[0]}p ms-cost`
    }
    return `ms ms-${parts.join('')} ms-cost`
  }

  // Standard symbols
  return `ms ms-${s} ms-cost`
}

export function ManaCost({ cost, className }: ManaCostProps) {
  if (!cost) return null

  const symbols = parseManaCost(cost)
  if (symbols.length === 0) return null

  return (
    <span className={`inline-flex items-center gap-px ${className ?? ''}`} aria-label={`Mana cost: ${cost}`}>
      {symbols.map((symbol, i) => (
        <i
          key={i}
          className={symbolToClass(symbol)}
          style={{ fontSize: '0.65rem' }}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}
