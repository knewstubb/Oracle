import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase'
import {
  normalizeAndSortBuildCards,
  type BuildCard,
  type BuildCardQuery,
  type CommanderBuildCardRepository,
  type StoredBuildCard,
} from './types'

const SYNERGY_BATCH_SIZE = 200
const BUILD_CARD_PROJECTION = [
  'card_name',
  'category',
  'synergy_score',
  'inclusion_rate',
  'position',
  'is_signature',
  'is_staple',
].join(', ')

interface SupabaseBuildCardRow {
  card_name: string
  category: string | null
  synergy_score: number | string | null
  inclusion_rate: number | string | null
  position: number | null
  is_signature: boolean | null
  is_staple: boolean | null
}

function nullableNumber(value: number | string | null): number | null {
  if (value === null) return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function mapRow(row: SupabaseBuildCardRow): StoredBuildCard {
  return {
    cardName: row.card_name,
    cardType: row.category,
    synergyScore: nullableNumber(row.synergy_score),
    inclusionRate: nullableNumber(row.inclusion_rate),
    position: row.position,
    isSignature: row.is_signature,
    isStaple: row.is_staple,
  }
}

function logSourceError(operation: string, buildId: string, message: string): void {
  console.error('[commander-context]', JSON.stringify({
    event: 'source_error',
    source: 'supabase',
    operation,
    buildId,
    message,
  }))
}

export class SupabaseBuildCardRepository implements CommanderBuildCardRepository {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient = createAdminClient() as unknown as SupabaseClient) {
    this.client = client
  }

  private async loadBuildRows(buildId: string, operation: string): Promise<StoredBuildCard[]> {
    const { data, error } = await this.client
      .from('ref_build_cards')
      .select(BUILD_CARD_PROJECTION)
      .eq('build_id', buildId)

    if (error) {
      logSourceError(operation, buildId, error.message)
      return []
    }

    return ((data ?? []) as unknown as SupabaseBuildCardRow[]).map(mapRow)
  }

  async getBuildCards(buildId: string, options: BuildCardQuery = {}): Promise<BuildCard[]> {
    let rows = await this.loadBuildRows(buildId, 'getBuildCards')

    if (options.cardType) {
      const cardType = options.cardType.toLowerCase()
      rows = rows.filter(row => row.cardType?.toLowerCase() === cardType)
    }
    if (options.minInclusionRate !== undefined) {
      rows = rows.filter(
        row => row.inclusionRate !== null && row.inclusionRate >= options.minInclusionRate!
      )
    }

    return normalizeAndSortBuildCards(rows, 'synergy', options.limit)
  }

  async getSignatureCards(buildId: string, limit = 20): Promise<BuildCard[]> {
    const rows = (await this.loadBuildRows(buildId, 'getSignatureCards'))
      .filter(row => row.isSignature === true)
    return normalizeAndSortBuildCards(rows, 'synergy', limit)
  }

  async getStapleCards(buildId: string, limit = 30): Promise<BuildCard[]> {
    const rows = (await this.loadBuildRows(buildId, 'getStapleCards'))
      .filter(row => row.isStaple === true)
    return normalizeAndSortBuildCards(rows, 'inclusion', limit)
  }

  async getSynergyScores(
    buildId: string,
    cardNames: readonly string[]
  ): Promise<ReadonlyMap<string, number>> {
    const scores = new Map<string, number>()
    if (cardNames.length === 0) return scores

    for (let offset = 0; offset < cardNames.length; offset += SYNERGY_BATCH_SIZE) {
      const batch = cardNames.slice(offset, offset + SYNERGY_BATCH_SIZE)
      const { data, error } = await this.client
        .from('ref_build_cards')
        .select('card_name, synergy_score')
        .eq('build_id', buildId)
        .in('card_name', batch)

      if (error) {
        logSourceError('getSynergyScores', buildId, error.message)
        continue
      }

      for (const row of (data ?? []) as unknown as Array<{
        card_name: string
        synergy_score: number | string | null
      }>) {
        const synergy = nullableNumber(row.synergy_score)
        if (synergy !== null) scores.set(row.card_name, synergy)
      }
    }

    return scores
  }
}
