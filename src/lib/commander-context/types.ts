import { Buffer } from 'node:buffer'

export interface BuildCard {
  cardName: string
  cardType: string
  synergyScore: number
  inclusionRate: number
  position: number
  isSignature: boolean
  isStaple: boolean
}

export interface BuildCardQuery {
  limit?: number
  cardType?: string
  minInclusionRate?: number
}

export interface StoredBuildCard {
  cardName: string
  cardType: string | null
  synergyScore: number | null
  inclusionRate: number | null
  position: number | null
  isSignature: boolean | null
  isStaple: boolean | null
}

export interface CommanderBuildCardRepository {
  getBuildCards(buildId: string, options?: BuildCardQuery): Promise<BuildCard[]>
  getSignatureCards(buildId: string, limit?: number): Promise<BuildCard[]>
  getStapleCards(buildId: string, limit?: number): Promise<BuildCard[]>
  getSynergyScores(buildId: string, cardNames: readonly string[]): Promise<ReadonlyMap<string, number>>
}

export type BuildCardSort = 'synergy' | 'inclusion'

export function normalizeBuildCard(row: StoredBuildCard): BuildCard {
  return {
    cardName: row.cardName,
    cardType: row.cardType ?? 'unknown',
    synergyScore: row.synergyScore ?? 0,
    inclusionRate: row.inclusionRate ?? 0,
    position: row.position ?? 0,
    isSignature: row.isSignature ?? false,
    isStaple: row.isStaple ?? false,
  }
}

function compareText(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

function compareBySynergy(a: BuildCard, b: BuildCard): number {
  return (
    b.synergyScore - a.synergyScore ||
    b.inclusionRate - a.inclusionRate ||
    a.position - b.position ||
    compareText(a.cardName, b.cardName)
  )
}

function compareByInclusion(a: BuildCard, b: BuildCard): number {
  return (
    b.inclusionRate - a.inclusionRate ||
    b.synergyScore - a.synergyScore ||
    a.position - b.position ||
    compareText(a.cardName, b.cardName)
  )
}

export function normalizeAndSortBuildCards(
  rows: readonly StoredBuildCard[],
  sort: BuildCardSort,
  limit?: number
): BuildCard[] {
  const cards = rows.map(normalizeBuildCard)
  cards.sort(sort === 'inclusion' ? compareByInclusion : compareBySynergy)

  if (limit === undefined) return cards
  return cards.slice(0, Math.max(0, limit))
}
