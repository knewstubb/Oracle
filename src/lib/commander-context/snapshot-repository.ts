import Database from 'better-sqlite3'
import { loadAndValidateCommanderContextManifest } from './manifest'
import {
  normalizeAndSortBuildCards,
  type BuildCard,
  type BuildCardQuery,
  type CommanderBuildCardRepository,
  type StoredBuildCard,
} from './types'

const SYNERGY_BATCH_SIZE = 200

type SqliteDatabase = InstanceType<typeof Database>

interface SqliteBuildCardRow {
  card_name: string
  card_type: string | null
  synergy_score: number | null
  inclusion_rate: number | null
  position: number | null
  is_signature: number
  is_staple: number
}

function mapRow(row: SqliteBuildCardRow): StoredBuildCard {
  return {
    cardName: row.card_name,
    cardType: row.card_type,
    synergyScore: row.synergy_score,
    inclusionRate: row.inclusion_rate,
    position: row.position,
    isSignature: row.is_signature === 1,
    isStaple: row.is_staple === 1,
  }
}

export class SnapshotBuildCardRepository implements CommanderBuildCardRepository {
  private readonly db: SqliteDatabase
  readonly version: string

  constructor() {
    const manifest = loadAndValidateCommanderContextManifest()
    this.version = manifest.sha256
    this.db = new Database(manifest.artifactPath, { readonly: true, fileMustExist: true })
    this.db.pragma('query_only = ON')

    const integrity = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      this.db.close()
      throw new Error('Commander context snapshot failed its runtime integrity check')
    }

    const count = this.db.prepare('SELECT COUNT(*) AS count FROM build_cards').get() as { count: number }
    if (count.count !== manifest.validation.rowCount) {
      this.db.close()
      throw new Error('Commander context snapshot row count does not match its manifest')
    }
  }

  private loadRows(
    buildId: string,
    filters: { cardType?: string; minInclusionRate?: number; signature?: boolean; staple?: boolean } = {}
  ): StoredBuildCard[] {
    const clauses = ['build_id = ?']
    const parameters: Array<string | number> = [buildId]

    if (filters.cardType) {
      clauses.push('LOWER(card_type) = LOWER(?)')
      parameters.push(filters.cardType)
    }
    if (filters.minInclusionRate !== undefined) {
      clauses.push('inclusion_rate >= ?')
      parameters.push(filters.minInclusionRate)
    }
    if (filters.signature) clauses.push('is_signature = 1')
    if (filters.staple) clauses.push('is_staple = 1')

    const rows = this.db.prepare(`
      SELECT card_name, card_type, synergy_score, inclusion_rate,
             position, is_signature, is_staple
      FROM build_cards
      WHERE ${clauses.join(' AND ')}
    `).all(...parameters) as SqliteBuildCardRow[]

    return rows.map(mapRow)
  }

  async getBuildCards(buildId: string, options: BuildCardQuery = {}): Promise<BuildCard[]> {
    const rows = this.loadRows(buildId, {
      cardType: options.cardType,
      minInclusionRate: options.minInclusionRate,
    })
    return normalizeAndSortBuildCards(rows, 'synergy', options.limit)
  }

  async getSignatureCards(buildId: string, limit = 20): Promise<BuildCard[]> {
    return normalizeAndSortBuildCards(
      this.loadRows(buildId, { signature: true }),
      'synergy',
      limit
    )
  }

  async getStapleCards(buildId: string, limit = 30): Promise<BuildCard[]> {
    return normalizeAndSortBuildCards(
      this.loadRows(buildId, { staple: true }),
      'inclusion',
      limit
    )
  }

  async getSynergyScores(
    buildId: string,
    cardNames: readonly string[]
  ): Promise<ReadonlyMap<string, number>> {
    const scores = new Map<string, number>()

    for (let offset = 0; offset < cardNames.length; offset += SYNERGY_BATCH_SIZE) {
      const batch = cardNames.slice(offset, offset + SYNERGY_BATCH_SIZE)
      if (batch.length === 0) continue
      const placeholders = batch.map(() => '?').join(', ')
      const rows = this.db.prepare(`
        SELECT card_name, synergy_score
        FROM build_cards
        WHERE build_id = ? AND card_name IN (${placeholders})
      `).all(buildId, ...batch) as Array<{ card_name: string; synergy_score: number | null }>

      for (const row of rows) {
        if (row.synergy_score !== null) scores.set(row.card_name, row.synergy_score)
      }
    }

    return scores
  }
}

let singleton: SnapshotBuildCardRepository | undefined

export function getSnapshotBuildCardRepository(): SnapshotBuildCardRepository {
  singleton ??= new SnapshotBuildCardRepository()
  return singleton
}
