// Commander brackets, one place. The NUMBER is primary everywhere; the name is added only where there is room.
// Names are the owner's (2026-11-19): 1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized (US spelling), 5 cEDH.
export const BRACKETS = [
  { number: 1, name: 'Exhibition' },
  { number: 2, name: 'Core' },
  { number: 3, name: 'Upgraded' },
  { number: 4, name: 'Optimized' },
  { number: 5, name: 'cEDH' },
] as const
export const BRACKET_MIN = 1
export const BRACKET_MAX = 5
/** A bracket is a whole number 1 to 5. Anything else (empty, "Bracket 3", 7) is not a value. */
export function parseBracket(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= BRACKET_MIN && raw <= BRACKET_MAX ? raw : null
  if (typeof raw === 'string') {
    const m = /^\s*([1-5])\s*$/.exec(raw)
    return m ? Number(m[1]) : null
  }
  return null
}
export function bracketName(n: number | null | undefined): string | null {
  return BRACKETS.find((b) => b.number === n)?.name ?? null
}
/** "3 Upgraded" (number first). Only the number when the name is not wanted. */
export function bracketLabel(n: number, withName = true): string {
  const name = bracketName(n)
  return withName && name ? `${n} ${name}` : String(n)
}
