import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

const SUPPORTED_SCHEMA_VERSION = 1
const DEFAULT_SNAPSHOT_DIRECTORY = resolve(process.cwd(), 'data', 'commander-context')
const DEFAULT_MANIFEST_PATH = resolve(DEFAULT_SNAPSHOT_DIRECTORY, 'manifest.json')
const BUNDLED_ARTIFACT_NAME = 'commander-context-v1-20260912T042347921Z-ac2860ad2bc0.sqlite'
const BUNDLED_ARTIFACT_PATH = resolve(DEFAULT_SNAPSHOT_DIRECTORY, BUNDLED_ARTIFACT_NAME)

interface ManifestFile {
  schemaVersion: number
  generatedAt: string
  artifact: string
  sourceProjectRefHash: string
  sourceTables: {
    ref_build_cards: {
      rowCount: number
      maxUpdatedAt: string | null
      typeColumn: string
      sourceColumns: string[]
      contentSha256: string
    }
  }
  snapshotBytes: number
  sha256: string
  validation: {
    sqliteIntegrity: string
    rowCount: number
    uniqueRowCount: number
    contentSha256: string
    representativeBuildIds: string[]
    representativeQueriesChecked: number
    nullFlagsNormalizedToFalse: number
  }
}

export interface ValidatedCommanderContextManifest extends ManifestFile {
  manifestPath: string
  artifactPath: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Commander context manifest field ${field} must be an object`)
  return value
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Commander context manifest field ${field} must be a non-empty string`)
  }
  return value
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Commander context manifest field ${field} must be a finite number`)
  }
  return value
}

function parseManifest(value: unknown): ManifestFile {
  const root = requireRecord(value, 'root')
  const sourceTables = requireRecord(root.sourceTables, 'sourceTables')
  const buildCards = requireRecord(sourceTables.ref_build_cards, 'sourceTables.ref_build_cards')
  const validation = requireRecord(root.validation, 'validation')
  const sourceColumns = buildCards.sourceColumns
  const representativeBuildIds = validation.representativeBuildIds

  if (!Array.isArray(sourceColumns) || !sourceColumns.every(column => typeof column === 'string')) {
    throw new Error('Commander context manifest sourceColumns must be a string array')
  }
  if (!Array.isArray(representativeBuildIds) || !representativeBuildIds.every(id => typeof id === 'string')) {
    throw new Error('Commander context manifest representativeBuildIds must be a string array')
  }

  return {
    schemaVersion: requireNumber(root.schemaVersion, 'schemaVersion'),
    generatedAt: requireString(root.generatedAt, 'generatedAt'),
    artifact: requireString(root.artifact, 'artifact'),
    sourceProjectRefHash: requireString(root.sourceProjectRefHash, 'sourceProjectRefHash'),
    sourceTables: {
      ref_build_cards: {
        rowCount: requireNumber(buildCards.rowCount, 'sourceTables.ref_build_cards.rowCount'),
        maxUpdatedAt: buildCards.maxUpdatedAt === null
          ? null
          : requireString(buildCards.maxUpdatedAt, 'sourceTables.ref_build_cards.maxUpdatedAt'),
        typeColumn: requireString(buildCards.typeColumn, 'sourceTables.ref_build_cards.typeColumn'),
        sourceColumns,
        contentSha256: requireString(buildCards.contentSha256, 'sourceTables.ref_build_cards.contentSha256'),
      },
    },
    snapshotBytes: requireNumber(root.snapshotBytes, 'snapshotBytes'),
    sha256: requireString(root.sha256, 'sha256'),
    validation: {
      sqliteIntegrity: requireString(validation.sqliteIntegrity, 'validation.sqliteIntegrity'),
      rowCount: requireNumber(validation.rowCount, 'validation.rowCount'),
      uniqueRowCount: requireNumber(validation.uniqueRowCount, 'validation.uniqueRowCount'),
      contentSha256: requireString(validation.contentSha256, 'validation.contentSha256'),
      representativeBuildIds,
      representativeQueriesChecked: requireNumber(
        validation.representativeQueriesChecked,
        'validation.representativeQueriesChecked'
      ),
      nullFlagsNormalizedToFalse: requireNumber(
        validation.nullFlagsNormalizedToFalse,
        'validation.nullFlagsNormalizedToFalse'
      ),
    },
  }
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function loadAndValidateCommanderContextManifest(
  manifestPath = process.env.COMMANDER_CONTEXT_MANIFEST_PATH ?? DEFAULT_MANIFEST_PATH
): ValidatedCommanderContextManifest {
  const resolvedManifestPath = resolve(manifestPath)
  if (!existsSync(resolvedManifestPath)) {
    throw new Error(`Commander context manifest not found: ${resolvedManifestPath}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(resolvedManifestPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Commander context manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const manifest = parseManifest(parsed)
  if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported commander context schema version ${manifest.schemaVersion}; expected ${SUPPORTED_SCHEMA_VERSION}`
    )
  }
  if (manifest.artifact !== basename(manifest.artifact) || !manifest.artifact.endsWith('.sqlite')) {
    throw new Error('Commander context artifact must be a safe SQLite basename')
  }
  if (manifest.validation.sqliteIntegrity !== 'ok') {
    throw new Error('Commander context manifest does not record a successful integrity check')
  }

  const expectedCount = manifest.sourceTables.ref_build_cards.rowCount
  if (
    manifest.validation.rowCount !== expectedCount ||
    manifest.validation.uniqueRowCount !== expectedCount
  ) {
    throw new Error('Commander context manifest row counts are inconsistent')
  }
  if (
    manifest.validation.contentSha256 !==
    manifest.sourceTables.ref_build_cards.contentSha256
  ) {
    throw new Error('Commander context manifest content checksums are inconsistent')
  }

  const manifestDirectory = dirname(resolvedManifestPath)
  const usesBundledManifest = resolvedManifestPath === DEFAULT_MANIFEST_PATH
  if (usesBundledManifest && manifest.artifact !== BUNDLED_ARTIFACT_NAME) {
    throw new Error(
      `Commander context manifest artifact ${manifest.artifact} does not match bundled artifact ${BUNDLED_ARTIFACT_NAME}`
    )
  }

  const artifactPath = usesBundledManifest
    ? BUNDLED_ARTIFACT_PATH
    : resolve(manifestDirectory, manifest.artifact)
  if (dirname(artifactPath) !== manifestDirectory || !existsSync(artifactPath)) {
    throw new Error(`Commander context artifact not found: ${artifactPath}`)
  }
  if (statSync(artifactPath).size !== manifest.snapshotBytes) {
    throw new Error('Commander context artifact byte size does not match the manifest')
  }
  if (sha256(artifactPath) !== manifest.sha256) {
    throw new Error('Commander context artifact SHA-256 does not match the manifest')
  }

  return { ...manifest, manifestPath: resolvedManifestPath, artifactPath }
}
