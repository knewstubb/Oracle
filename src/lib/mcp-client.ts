import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface CommanderOverviewResult {
  name: string
  manaCost: string
  colorIdentity: string[]
  typeLine: string
  oracleText: string
  combos: { cards: string[]; result: string }[]
  staples: { name: string; synergy: number; inclusion: number }[]
  raw: string
}

export interface DeckAnalysisResult {
  manaCurve: Record<string, number>
  colorDistribution: Record<string, number>
  totalCards: number
  averageCmc: number
  combos: { cards: string[]; result: string }[]
  bracket: string
  strengths: string[]
  weaknesses: string[]
  raw: string
}

export interface SuggestCutsResult {
  cuts: { name: string; reason: string }[]
  raw: string
}

export interface SuggestManaBaseResult {
  lands: { name: string; reason: string }[]
  raw: string
}

export interface ThemeSearchResult {
  cards: { name: string; manaCost: string; typeLine: string; reason: string }[]
  raw: string
}

export interface BuildAroundResult {
  cards: { name: string; manaCost: string; typeLine: string; role: string }[]
  raw: string
}

export interface SearchCardsResult {
  cards: { name: string; manaCost: string; typeLine: string; oracleText: string }[]
  raw: string
}

export interface FormatSearchResult {
  cards: { name: string; manaCost: string; typeLine: string; oracleText: string }[]
  raw: string
}

// ---------------------------------------------------------------------------
// MCP Client singleton
// ---------------------------------------------------------------------------

let clientInstance: Client | null = null
let transportInstance: StdioClientTransport | null = null
let connectPromise: Promise<void> | null = null

/** Reset the singleton so the next call creates a fresh connection. */
function resetClient() {
  clientInstance = null
  transportInstance = null
  connectPromise = null
}

/**
 * Returns a connected MCP client. Creates one on first call and reuses it.
 * Automatically reconnects if the previous connection was lost.
 */
export async function getMcpClient(): Promise<Client> {
  if (clientInstance && connectPromise) {
    try {
      await connectPromise
      return clientInstance
    } catch {
      // Previous connection failed — reset and create a new one
      console.warn('[mcp-client] Previous connection failed, reconnecting...')
      resetClient()
    }
  }

  const transport = new StdioClientTransport({
    command: 'uvx',
    args: ['mtg-mcp-server'],
    env: {
      ...process.env,
      MTG_MCP_ENABLE_EDHREC: 'true',
      MTG_MCP_ENABLE_BULK_DATA: 'true',
    },
  })

  const client = new Client({
    name: 'the-oracle',
    version: '0.1.0',
  })

  // Clean up singleton when the transport process exits unexpectedly
  transport.onclose = () => {
    console.warn('[mcp-client] Transport closed, will reconnect on next call')
    resetClient()
  }

  transportInstance = transport
  clientInstance = client
  connectPromise = client.connect(transport)
  await connectPromise

  return client
}

/**
 * Disconnect the MCP client and clean up resources.
 */
export async function closeMcpClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.close()
  }
  resetClient()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Call an MCP tool and return the text content from the response.
 * Throws on tool-level errors.
 */
async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const MAX_RETRIES = 2

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = await getMcpClient()
      const result = await client.callTool({ name: toolName, arguments: args })

      if (result.isError) {
        const msg =
          result.content && Array.isArray(result.content)
            ? result.content
                .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
                .map((c) => c.text)
                .join('\n')
            : 'Unknown MCP tool error'
        throw new McpToolError(toolName, msg)
      }

      const textParts = (result.content as { type: string; text?: string }[])
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string)

      return textParts.join('\n')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const isConnectionError =
        message.includes('Connection closed') ||
        message.includes('EPIPE') ||
        message.includes('not connected') ||
        message.includes('fetch failed') ||
        message.includes('-32000')

      if (isConnectionError && attempt < MAX_RETRIES) {
        console.warn(`[mcp-client] Connection lost calling "${toolName}", reconnecting (attempt ${attempt + 1})...`)
        resetClient()
        // Wait briefly for the server to reinitialize
        await new Promise(resolve => setTimeout(resolve, 1500))
        continue
      }

      throw err
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new McpToolError(toolName, 'Max retries exceeded')
}

export class McpToolError extends Error {
  constructor(
    public readonly tool: string,
    message: string,
  ) {
    super(`MCP tool "${tool}" failed: ${message}`)
    this.name = 'McpToolError'
  }
}

// ---------------------------------------------------------------------------
// Typed wrapper functions
// ---------------------------------------------------------------------------

/**
 * Comprehensive commander profile: card details, combos, EDHREC staples.
 */
export async function commanderOverview(
  commanderName: string,
  knownCardNames?: string[],
): Promise<CommanderOverviewResult> {
  const raw = await callTool('commander_overview', {
    commander_name: commanderName,
  })
  return parseCommanderOverview(raw, knownCardNames)
}

/**
 * Full decklist health check: mana curve, colors, combos, bracket, synergy.
 * When strategyContext is provided, it's prepended to the decklist as a context
 * note so the analysis tool can consider strategy intent.
 */
export async function deckAnalysis(
  decklist: string[],
  commanderName: string,
  strategyContext?: string | null,
): Promise<DeckAnalysisResult> {
  // When strategy context is available, prepend it as a note card entry
  // so the MCP tool has access to the deck builder's intent
  const enrichedDecklist = strategyContext
    ? [`[STRATEGY_CONTEXT] ${strategyContext}`, ...decklist]
    : decklist

  const raw = await callTool('deck_analysis', {
    decklist: enrichedDecklist,
    commander_name: commanderName,
  })
  return parseDeckAnalysis(raw, decklist)
}

/**
 * Identify the weakest cards to cut from a commander decklist.
 */
export async function suggestCuts(
  decklist: string[],
  commanderName: string,
  numCuts = 5,
): Promise<SuggestCutsResult> {
  const raw = await callTool('suggest_cuts', {
    decklist,
    commander_name: commanderName,
    num_cuts: numCuts,
  })
  return parseSuggestCuts(raw)
}

/**
 * Suggest a mana base for a decklist based on colour pip distribution.
 */
export async function suggestManaBase(
  decklist: string[],
  format: string,
): Promise<SuggestManaBaseResult> {
  const raw = await callTool('suggest_mana_base', {
    decklist,
    format,
  })
  return parseSuggestManaBase(raw)
}

/**
 * Find cards matching a theme (mechanical, tribal, or abstract).
 */
export async function themeSearch(
  theme: string,
  options?: {
    colorIdentity?: string
    format?: string
    limit?: number
    maxPrice?: number
  },
): Promise<ThemeSearchResult> {
  const raw = await callTool('theme_search', {
    theme,
    ...(options?.colorIdentity && { color_identity: options.colorIdentity }),
    ...(options?.format && { format: options.format }),
    ...(options?.limit && { limit: options.limit }),
    ...(options?.maxPrice && { max_price: options.maxPrice }),
  })
  return parseThemeSearch(raw)
}

/**
 * Find synergistic cards for build-around cards in a format.
 */
export async function buildAround(
  cards: string[],
  format: string,
  options?: { budget?: number; limit?: number },
): Promise<BuildAroundResult> {
  const raw = await callTool('build_around', {
    cards,
    format,
    ...(options?.budget && { budget: options.budget }),
    ...(options?.limit && { limit: options.limit }),
  })
  return parseBuildAround(raw)
}

/**
 * Search for cards using Scryfall syntax.
 */
export async function searchCards(
  query: string,
  options?: { limit?: number; page?: number },
): Promise<SearchCardsResult> {
  const raw = await callTool('scryfall_search_cards', {
    query,
    ...(options?.limit && { limit: options.limit }),
    ...(options?.page && { page: options.page }),
  })
  return parseSearchCards(raw)
}

/**
 * Search for legal cards in a format using natural language.
 */
export async function formatSearch(
  format: string,
  query: string,
  options?: {
    colorIdentity?: string
    maxPrice?: number
    rarity?: string
    limit?: number
  },
): Promise<FormatSearchResult> {
  const raw = await callTool('bulk_format_search', {
    format,
    query,
    ...(options?.colorIdentity && { color_identity: options.colorIdentity }),
    ...(options?.maxPrice && { max_price: options.maxPrice }),
    ...(options?.rarity && { rarity: options.rarity }),
    ...(options?.limit && { limit: options.limit }),
  })
  return parseFormatSearch(raw)
}

// ---------------------------------------------------------------------------
// Parsers — defensive extraction from MCP text responses
// ---------------------------------------------------------------------------

/**
 * Try to extract a JSON block from a text response.
 * MCP tools often return markdown with embedded JSON.
 */
function tryParseJson(text: string): unknown | null {
  // Try direct parse first
  try {
    return JSON.parse(text)
  } catch {
    // noop
  }
  // Try to find a JSON block in markdown
  const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1])
    } catch {
      // noop
    }
  }
  return null
}

/**
 * Extract bullet-point items from text. Handles "- item" and "* item".
 */
function extractBulletItems(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => /^\s*[-*•]\s+/.test(line))
    .map((line) => line.replace(/^\s*[-*•]\s+/, '').trim())
    .filter(Boolean)
}

/**
 * Extract named sections from markdown-style text.
 * Returns a map of heading → content.
 */
function extractSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const parts = text.split(/^#{1,3}\s+/m)
  for (const part of parts) {
    const newline = part.indexOf('\n')
    if (newline === -1) continue
    const heading = part.slice(0, newline).trim().toLowerCase()
    const content = part.slice(newline + 1).trim()
    if (heading) sections[heading] = content
  }
  return sections
}

export function parseCommanderOverview(raw: string, knownCardNames?: string[]): CommanderOverviewResult {
  const json = tryParseJson(raw)
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    return {
      name: String(j.name ?? ''),
      manaCost: String(j.mana_cost ?? j.manaCost ?? ''),
      colorIdentity: Array.isArray(j.color_identity ?? j.colorIdentity)
        ? (j.color_identity ?? j.colorIdentity) as string[]
        : [],
      typeLine: String(j.type_line ?? j.typeLine ?? ''),
      oracleText: String(j.oracle_text ?? j.oracleText ?? ''),
      combos: parseComboArray(j.combos),
      staples: parseStapleArray(j.staples),
      raw,
    }
  }

  // Fallback: extract from text
  const sections = extractSections(raw)
  return {
    name: extractFirstLine(raw) || '',
    manaCost: '',
    colorIdentity: [],
    typeLine: '',
    oracleText: '',
    combos: parseCombosFromText(sections['combos'] ?? '', knownCardNames),
    staples: [],
    raw,
  }
}

export function parseDeckAnalysis(raw: string, knownCardNames?: string[]): DeckAnalysisResult {
  const json = tryParseJson(raw)
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    return {
      manaCurve: (j.mana_curve ?? j.manaCurve ?? {}) as Record<string, number>,
      colorDistribution: (j.color_distribution ?? j.colorDistribution ?? {}) as Record<string, number>,
      totalCards: Number(j.total_cards ?? j.totalCards ?? 0),
      averageCmc: Number(j.average_cmc ?? j.averageCmc ?? 0),
      combos: parseComboArray(j.combos),
      bracket: String(j.bracket ?? ''),
      strengths: Array.isArray(j.strengths) ? j.strengths.map(String) : [],
      weaknesses: Array.isArray(j.weaknesses) ? j.weaknesses.map(String) : [],
      raw,
    }
  }

  // Parse markdown format from MCP
  const sections = extractSections(raw)

  // Extract bracket: "**Bracket:** E" or "Bracket: Mid"
  const bracketMatch = raw.match(/\*\*Bracket:\*\*\s*(\S+)/i) ?? raw.match(/Bracket:\s*(\S+)/i)
  const bracket = bracketMatch ? bracketMatch[1] : (sections['bracket'] ?? sections['power level'] ?? '')

  // Extract average CMC: "**Average mana value:** 2.8"
  const avgMatch = raw.match(/\*\*Average mana value:\*\*\s*([\d.]+)/i) ?? raw.match(/Average (?:mana value|CMC):\s*([\d.]+)/i)
  const averageCmc = avgMatch ? parseFloat(avgMatch[1]) : 0

  // Parse combos from "**[id]** Card1, Card2\n  Produces: result" format
  const combos = parseMcpCombos(raw, knownCardNames)

  return {
    manaCurve: {},
    colorDistribution: {},
    totalCards: 0,
    averageCmc,
    combos,
    bracket,
    strengths: extractBulletItems(sections['strengths'] ?? ''),
    weaknesses: extractBulletItems(sections['weaknesses'] ?? ''),
    raw,
  }
}

export function parseSuggestCuts(raw: string): SuggestCutsResult {
  const json = tryParseJson(raw)
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    const cuts = Array.isArray(j.cuts)
      ? j.cuts.map((c: unknown) => {
          const item = c as Record<string, unknown>
          return { name: String(item.name ?? ''), reason: String(item.reason ?? '') }
        })
      : []
    return { cuts, raw }
  }

  const cuts: { name: string; reason: string }[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    // Skip headers, empty lines, status/URL lines
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('*Data:') || trimmed.startsWith('---')) continue
    if (trimmed.includes('](http') || trimmed.match(/^\[.+\]\(.+\)/)) continue
    if (trimmed.includes('commanderspellbook') || trimmed.includes('edhrec.com') || trimmed.includes('scryfall.com')) continue

    // Match: "1. **Card Name** — Synergy: X%, Inclusion: Y%"
    const numberedBold = trimmed.match(/^(?:\d+\.\s*|\-\s*)\*\*(.+?)\*\*\s*[—\-]\s*(.+)$/)
    if (numberedBold) {
      cuts.push({ name: numberedBold[1].trim(), reason: numberedBold[2].trim() })
      continue
    }
    // Match: "1. Card Name — reason"
    const numbered = trimmed.match(/^(\d+)\.\s+(.+?)\s*[—]\s*(.+)$/)
    if (numbered) {
      cuts.push({ name: numbered[2].trim(), reason: numbered[3].trim() })
    }
  }
  return { cuts, raw }
}

export function parseSuggestManaBase(raw: string): SuggestManaBaseResult {
  const json = tryParseJson(raw)
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    const lands = Array.isArray(j.lands)
      ? j.lands.map((l: unknown) => {
          const item = l as Record<string, unknown>
          return { name: String(item.name ?? ''), reason: String(item.reason ?? '') }
        })
      : []
    return { lands, raw }
  }

  const items = extractBulletItems(raw)
  const lands = items.map((item) => {
    const sep = item.match(/\s*[—:]\s*/)
    if (sep && sep.index !== undefined) {
      return {
        name: item.slice(0, sep.index).trim(),
        reason: item.slice(sep.index + sep[0].length).trim(),
      }
    }
    return { name: item, reason: '' }
  })
  return { lands, raw }
}

export function parseThemeSearch(raw: string): ThemeSearchResult {
  const json = tryParseJson(raw)
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    const cards = Array.isArray(j.cards)
      ? j.cards.map((c: unknown) => {
          const item = c as Record<string, unknown>
          return {
            name: String(item.name ?? ''),
            manaCost: String(item.mana_cost ?? item.manaCost ?? ''),
            typeLine: String(item.type_line ?? item.typeLine ?? ''),
            reason: String(item.reason ?? ''),
          }
        })
      : []
    return { cards, raw }
  }

  return { cards: [], raw }
}

export function parseBuildAround(raw: string): BuildAroundResult {
  const json = tryParseJson(raw)
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    const cards = Array.isArray(j.cards)
      ? j.cards.map((c: unknown) => {
          const item = c as Record<string, unknown>
          return {
            name: String(item.name ?? ''),
            manaCost: String(item.mana_cost ?? item.manaCost ?? ''),
            typeLine: String(item.type_line ?? item.typeLine ?? ''),
            role: String(item.role ?? ''),
          }
        })
      : []
    return { cards, raw }
  }

  // Parse markdown: "- **Name** {cost} -- Type ($price)"
  const cards = parseCardLines(raw)
    .map((c) => ({ ...c, role: '', oracleText: undefined }))
    .map(({ name, manaCost, typeLine }) => ({ name, manaCost, typeLine, role: '' }))

  // Also try bold-name lines: "- **Name** {cost} -- Type ($price)"
  if (cards.length === 0) {
    const boldCards: { name: string; manaCost: string; typeLine: string; role: string }[] = []
    for (const line of raw.split('\n')) {
      const match = line.trim().match(/^-\s+\*\*(.+?)\*\*\s+(\{[^}]+\}(?:\{[^}]+\})*)\s+--\s+(.+?)(?:\s+\(\$[\d.]+\))?$/)
      if (match) {
        boldCards.push({ name: match[1].trim(), manaCost: match[2].trim(), typeLine: match[3].trim(), role: '' })
        continue
      }
      // No mana cost: "- **Name** -- Type ($price)"
      const noManaMatch = line.trim().match(/^-\s+\*\*(.+?)\*\*\s+--\s+(.+?)(?:\s+\(\$[\d.]+\))?$/)
      if (noManaMatch) {
        boldCards.push({ name: noManaMatch[1].trim(), manaCost: '', typeLine: noManaMatch[2].trim(), role: '' })
      }
    }
    if (boldCards.length > 0) return { cards: boldCards, raw }
  }

  return { cards, raw }
}

export function parseSearchCards(raw: string): SearchCardsResult {
  const json = tryParseJson(raw)
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    const cards = Array.isArray(j.cards ?? j.data)
      ? ((j.cards ?? j.data) as unknown[]).map((c: unknown) => {
          const item = c as Record<string, unknown>
          return {
            name: String(item.name ?? ''),
            manaCost: String(item.mana_cost ?? item.manaCost ?? ''),
            typeLine: String(item.type_line ?? item.typeLine ?? ''),
            oracleText: String(item.oracle_text ?? item.oracleText ?? ''),
          }
        })
      : []
    return { cards, raw }
  }

  const cards = parseCardLines(raw)
  return { cards, raw }
}

export function parseFormatSearch(raw: string): FormatSearchResult {
  const json = tryParseJson(raw)
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    const cards = Array.isArray(j.cards ?? j.data)
      ? ((j.cards ?? j.data) as unknown[]).map((c: unknown) => {
          const item = c as Record<string, unknown>
          return {
            name: String(item.name ?? ''),
            manaCost: String(item.mana_cost ?? item.manaCost ?? ''),
            typeLine: String(item.type_line ?? item.typeLine ?? ''),
            oracleText: String(item.oracle_text ?? item.oracleText ?? ''),
          }
        })
      : []
    return { cards, raw }
  }

  // Fallback: parse markdown lines like "  Sol Ring {1} -- Artifact ($1.39)"
  const cards = parseCardLines(raw)
  return { cards, raw }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function parseComboArray(combos: unknown): { cards: string[]; result: string }[] {
  if (!Array.isArray(combos)) return []
  return combos.map((c: unknown) => {
    const item = c as Record<string, unknown>
    return {
      cards: Array.isArray(item.cards) ? item.cards.map(String) : [],
      result: String(item.result ?? ''),
    }
  })
}

function parseStapleArray(
  staples: unknown,
): { name: string; synergy: number; inclusion: number }[] {
  if (!Array.isArray(staples)) return []
  return staples.map((s: unknown) => {
    const item = s as Record<string, unknown>
    return {
      name: String(item.name ?? ''),
      synergy: Number(item.synergy ?? 0),
      inclusion: Number(item.inclusion ?? item.inclusion_rate ?? 0),
    }
  })
}

function parseCombosFromText(
  text: string,
  knownCardNames?: string[],
): { cards: string[]; result: string }[] {
  if (!text) return []
  return parseMcpCombos(text, knownCardNames)
}

/**
 * Parse combos from MCP markdown format:
 *   - **[796-1762-2438]** Card1, Card2, Card3
 *     Produces: Infinite mana, Infinite ETB
 */
function parseMcpCombos(text: string, knownCardNames?: string[]): { cards: string[]; result: string }[] {
  const combos: { cards: string[]; result: string }[] = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Match: "- **[id]** Card1, Card2, Card3" or "**[id]** Card1, Card2"
    const comboMatch = line.match(/^[-*]?\s*\*\*\[[\w-]+\]\*\*\s+(.+)$/)
    if (comboMatch) {
      const cardsPart = comboMatch[1].trim()
      const cards = knownCardNames
        ? splitCardNamesWithKnownList(cardsPart, knownCardNames)
        : splitCardNamesFallback(cardsPart)

      // Check next line for "Produces:" result
      let result = ''
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim()
        const producesMatch = nextLine.match(/^Produces:\s*(.+)$/i)
        if (producesMatch) {
          result = producesMatch[1].trim()
          i++ // skip the produces line
        }
      }

      if (cards.length > 0) {
        combos.push({ cards, result })
      }
    }
  }

  return combos
}

/**
 * Split combo text into card names using a known card name list.
 * Greedily matches known names (longest first) against the text.
 */
function splitCardNamesWithKnownList(text: string, knownNames: string[]): string[] {
  const cards: string[] = []
  // Sort longest first so "Poppet Stitcher // Poppet Factory" matches before "Poppet Stitcher"
  const sorted = [...knownNames].sort((a, b) => b.length - a.length)
  let remaining = text

  while (remaining.length > 0) {
    remaining = remaining.replace(/^,\s*/, '').trim()
    if (!remaining) break

    let matched = false
    for (const name of sorted) {
      if (remaining.toLowerCase().startsWith(name.toLowerCase())) {
        cards.push(name)
        remaining = remaining.slice(name.length)
        matched = true
        break
      }
    }

    if (!matched) {
      // No known name matched — take everything up to the next comma as a fallback
      const nextComma = remaining.indexOf(',')
      if (nextComma === -1) {
        cards.push(remaining.trim())
        break
      } else {
        cards.push(remaining.slice(0, nextComma).trim())
        remaining = remaining.slice(nextComma)
      }
    }
  }

  return cards.filter(Boolean)
}

/**
 * Fallback: split on ", " but try to keep card names with commas together.
 * Uses a simple heuristic — not perfect, but better than naive split.
 */
function splitCardNamesFallback(text: string): string[] {
  // Split on ", " but rejoin fragments that look like title suffixes
  // (e.g., "the Rotcleaver", "Lord High Artificer", "Thran Physician")
  const parts = text.split(', ')
  const cards: string[] = []
  let current = ''

  for (const part of parts) {
    if (!current) {
      current = part
      continue
    }
    // Common MTG name patterns after comma: "the X", "Lord X", "Fabled X", etc.
    // Also: if the part doesn't look like a standalone card name (too short, starts with "the/of/a")
    const lowerPart = part.toLowerCase()
    if (
      lowerPart.startsWith('the ') ||
      lowerPart.startsWith('of ') ||
      lowerPart.startsWith('a ') ||
      lowerPart.startsWith('an ') ||
      // Check if it's a known title suffix pattern
      /^(lord|lady|fabled|master|grand|high|great|first|last|who|that|bearer|bringer|keeper|warden|slayer|seeker)\b/i.test(part)
    ) {
      current += ', ' + part
    } else {
      cards.push(current.trim())
      current = part
    }
  }
  if (current.trim()) cards.push(current.trim())

  return cards
}

function extractFirstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0)
  return line?.trim() ?? ''
}

/**
 * Parse card lines from MCP markdown output.
 * Handles formats like:
 *   "  Sol Ring {1} -- Artifact ($1.39)"
 *   "  Rampant Growth {1}{G} -- Sorcery ($0.38)"
 *   "  Reliquary Tower -- Land ($2.93)"
 */
function parseCardLines(
  text: string,
): { name: string; manaCost: string; typeLine: string; oracleText: string }[] {
  const cards: { name: string; manaCost: string; typeLine: string; oracleText: string }[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    // Match: Name {cost} -- Type ($price)  OR  Name -- Type ($price)
    const match = trimmed.match(
      /^(.+?)\s+(\{[^}]+\}(?:\{[^}]+\})*)\s+--\s+(.+?)(?:\s+\(\$[\d.]+\))?$/,
    )
    if (match) {
      cards.push({
        name: match[1].trim(),
        manaCost: match[2].trim(),
        typeLine: match[3].trim(),
        oracleText: '',
      })
      continue
    }
    // No mana cost variant: Name -- Type ($price)
    const noManaMatch = trimmed.match(
      /^(.+?)\s+--\s+(.+?)(?:\s+\(\$[\d.]+\))?$/,
    )
    if (noManaMatch) {
      cards.push({
        name: noManaMatch[1].trim(),
        manaCost: '',
        typeLine: noManaMatch[2].trim(),
        oracleText: '',
      })
    }
  }

  return cards
}
