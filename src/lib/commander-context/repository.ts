import { createHash } from 'node:crypto'
import { getSnapshotBuildCardRepository, type SnapshotBuildCardRepository } from './snapshot-repository'
import { SupabaseBuildCardRepository } from './supabase-repository'
import type {
  BuildCard,
  BuildCardQuery,
  CommanderBuildCardRepository,
} from './types'

export type CommanderContextSource = 'supabase' | 'shadow' | 'snapshot'

function payloadDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function comparableScores(scores: ReadonlyMap<string, number>): Array<[string, number]> {
  return [...scores.entries()].sort(([left], [right]) => left.localeCompare(right))
}

class ShadowBuildCardRepository implements CommanderBuildCardRepository {
  private shadow: SnapshotBuildCardRepository | undefined
  private shadowError: unknown

  constructor(
    private readonly primary: CommanderBuildCardRepository,
    private readonly createShadow: () => SnapshotBuildCardRepository
  ) {}

  private getShadow(): SnapshotBuildCardRepository {
    if (this.shadow) return this.shadow
    if (this.shadowError) throw this.shadowError

    try {
      this.shadow = this.createShadow()
      return this.shadow
    } catch (error) {
      this.shadowError = error
      throw error
    }
  }

  private async compare<T>(
    operation: string,
    buildId: string,
    metadata: Record<string, unknown>,
    primaryPromise: Promise<T>,
    shadowOperation: () => Promise<T>,
    comparable: (value: T) => unknown,
    count: (value: T) => number
  ): Promise<T> {
    const startedAt = Date.now()
    const [primaryResult, shadowResult] = await Promise.allSettled([
      primaryPromise,
      Promise.resolve().then(shadowOperation),
    ])

    if (primaryResult.status === 'rejected') throw primaryResult.reason

    if (shadowResult.status === 'rejected') {
      console.warn('[commander-context]', JSON.stringify({
        event: 'shadow_parity',
        operation,
        status: 'shadow_error',
        buildId,
        ...metadata,
        primaryCount: count(primaryResult.value),
        snapshotVersion: this.shadow?.version ?? null,
        durationMs: Date.now() - startedAt,
        error: shadowResult.reason instanceof Error
          ? shadowResult.reason.message
          : String(shadowResult.reason),
      }))
      return primaryResult.value
    }

    const primaryComparable = comparable(primaryResult.value)
    const shadowComparable = comparable(shadowResult.value)
    const primarySha256 = payloadDigest(primaryComparable)
    const shadowSha256 = payloadDigest(shadowComparable)
    const status = primarySha256 === shadowSha256 ? 'match' : 'mismatch'
    const event = {
      event: 'shadow_parity',
      operation,
      status,
      buildId,
      ...metadata,
      primaryCount: count(primaryResult.value),
      shadowCount: count(shadowResult.value),
      primarySha256,
      shadowSha256,
      snapshotVersion: this.shadow?.version ?? null,
      durationMs: Date.now() - startedAt,
    }

    if (status === 'match') console.info('[commander-context]', JSON.stringify(event))
    else console.warn('[commander-context]', JSON.stringify(event))

    return primaryResult.value
  }

  getBuildCards(buildId: string, options: BuildCardQuery = {}): Promise<BuildCard[]> {
    return this.compare(
      'getBuildCards',
      buildId,
      {
        limit: options.limit ?? null,
        cardType: options.cardType ?? null,
        minInclusionRate: options.minInclusionRate ?? null,
      },
      this.primary.getBuildCards(buildId, options),
      () => this.getShadow().getBuildCards(buildId, options),
      value => value,
      value => value.length
    )
  }

  getSignatureCards(buildId: string, limit = 20): Promise<BuildCard[]> {
    return this.compare(
      'getSignatureCards',
      buildId,
      { limit },
      this.primary.getSignatureCards(buildId, limit),
      () => this.getShadow().getSignatureCards(buildId, limit),
      value => value,
      value => value.length
    )
  }

  getStapleCards(buildId: string, limit = 30): Promise<BuildCard[]> {
    return this.compare(
      'getStapleCards',
      buildId,
      { limit },
      this.primary.getStapleCards(buildId, limit),
      () => this.getShadow().getStapleCards(buildId, limit),
      value => value,
      value => value.length
    )
  }

  getSynergyScores(
    buildId: string,
    cardNames: readonly string[]
  ): Promise<ReadonlyMap<string, number>> {
    return this.compare(
      'getSynergyScores',
      buildId,
      { inputCount: cardNames.length },
      this.primary.getSynergyScores(buildId, cardNames),
      () => this.getShadow().getSynergyScores(buildId, cardNames),
      comparableScores,
      value => value.size
    )
  }
}

export function createCommanderBuildCardRepository(
  mode: CommanderContextSource
): CommanderBuildCardRepository {
  if (mode === 'supabase') return new SupabaseBuildCardRepository()
  if (mode === 'snapshot') return getSnapshotBuildCardRepository()
  if (mode === 'shadow') {
    return new ShadowBuildCardRepository(
      new SupabaseBuildCardRepository(),
      getSnapshotBuildCardRepository
    )
  }
  throw new Error(`Unsupported COMMANDER_CONTEXT_SOURCE: ${String(mode)}`)
}

let singleton: CommanderBuildCardRepository | undefined
let singletonMode: CommanderContextSource | undefined

export function getCommanderBuildCardRepository(): CommanderBuildCardRepository {
  const configured = process.env.COMMANDER_CONTEXT_SOURCE ?? 'supabase'
  if (!['supabase', 'shadow', 'snapshot'].includes(configured)) {
    throw new Error(`Unsupported COMMANDER_CONTEXT_SOURCE: ${configured}`)
  }
  const mode = configured as CommanderContextSource

  if (!singleton || singletonMode !== mode) {
    singleton = createCommanderBuildCardRepository(mode)
    singletonMode = mode
  }

  return singleton
}
