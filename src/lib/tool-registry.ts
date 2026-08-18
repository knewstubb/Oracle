// @ts-nocheck
// ---------------------------------------------------------------------------
// Brew AI Tools — Tool Registry
// ---------------------------------------------------------------------------
// Module-level Map<string, RegisteredTool> populated at import time.
// Adding a new tool requires: define schema, implement executor, register both.
// ---------------------------------------------------------------------------

import type {
  RegisteredTool,
  AnthropicToolDefinition,
  ToolExecutionResult,
} from './tool-types'
import type { OwnedCardInfo } from './card-repository'
import { getMcpClient } from './mcp-client'
import { getCardRepository } from './card-repository'
import { scryfallSearch } from './scryfall-cache'
import { getCommanderStaples, formatEDHRECResponse } from './edhrec-client'
import { validateCommander, formatCommanderValidation, searchCards, formatSearchResults } from './scryfall-client'
import { findCombosForCard, formatComboResults } from './spellbook-client'
import { createAdminClient } from './supabase'

// ---------------------------------------------------------------------------
// Registry Core
// ---------------------------------------------------------------------------

const registry = new Map<string, RegisteredTool>()

/** Get all tool definitions for the Anthropic API `tools` parameter */
export function getToolDefinitions(): AnthropicToolDefinition[] {
  return Array.from(registry.values()).map(t => t.definition)
}

/** Execute a tool by name, returning the result */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context?: { userId?: string }
): Promise<ToolExecutionResult> {
  const tool = registry.get(name)
  if (!tool) {
    return { content: `Unknown tool: ${name}`, is_error: true }
  }
  return tool.execute(input, context)
}

// ---------------------------------------------------------------------------
// MCP-Proxied Tool Helper
// ---------------------------------------------------------------------------

function registerMcpTool(
  name: string,
  mcpToolName: string,
  description: string,
  inputSchema: AnthropicToolDefinition['input_schema']
) {
  registry.set(name, {
    definition: { name, description, input_schema: inputSchema },
    execute: async (input) => {
      try {
        const client = await getMcpClient()
        const result = await client.callTool({ name: mcpToolName, arguments: input })
        if (result.isError) {
          const msg = (result.content as any[])
            ?.filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n') || 'MCP tool error'
          return { content: msg, is_error: true }
        }
        const text = (result.content as any[])
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n') || ''
        return { content: text, is_error: false }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'MTG data service unavailable'
        return {
          content: `MTG data service unavailable — try again or ask without tool verification. (${msg})`,
          is_error: true,
        }
      }
    },
  })
}

// ---------------------------------------------------------------------------
// MCP Tool Registrations
// ---------------------------------------------------------------------------

// --- Card rulings: Direct Scryfall API (replaces MCP) ---
registry.set('mtg_ruling_search', {
  definition: {
    name: 'mtg_ruling_search',
    description: 'Get official rulings for a specific card. Returns dated judge rulings explaining card interactions.',
    input_schema: {
      type: 'object',
      properties: {
        card_name: {
          type: 'string',
          description: 'The name of the card to search rulings for',
        },
      },
      required: ['card_name'],
    },
  },
  execute: async (input) => {
    try {
      const cardName = input.card_name as string
      
      // Try DB-first lookup
      const { getRulingsByCardName } = await import('@/lib/card-data')
      const dbRulings = await getRulingsByCardName(cardName)
      
      if (dbRulings.length > 0) {
        const lines = [`Rulings for ${cardName} (${dbRulings.length} total):\n`]
        for (const r of dbRulings) {
          lines.push(`[${r.published_at}] ${r.comment}`)
        }
        return { content: lines.join('\n'), is_error: false }
      }
      
      // Fallback to Scryfall API for cards not in our DB
      const cardRes = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`,
        { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
      )
      if (!cardRes.ok) {
        return { content: `Card "${cardName}" not found`, is_error: true }
      }
      const card = await cardRes.json()

      // Fetch rulings from Scryfall
      const rulingsRes = await fetch(card.rulings_uri, {
        headers: { 'User-Agent': 'TheOracle/0.1.0' },
      })
      if (!rulingsRes.ok) {
        return { content: `Could not fetch rulings for "${cardName}"`, is_error: true }
      }
      const rulingsData = await rulingsRes.json()
      const rulings = rulingsData.data || []

      if (rulings.length === 0) {
        return { content: `No rulings found for ${cardName}.`, is_error: false }
      }

      const lines = [`Rulings for ${card.name} (${rulings.length} total):\n`]
      for (const r of rulings) {
        lines.push(`[${r.published_at}] ${r.comment}`)
      }
      return { content: lines.join('\n'), is_error: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rulings lookup failed'
      return { content: `Rulings error: ${msg}`, is_error: true }
    }
  },
})

// --- EDHREC: Direct client (replaces MCP) ---
registry.set('mtg_commander_recommend', {
  definition: {
    name: 'mtg_commander_recommend',
    description: 'Get EDHREC top cards for a commander with synergy data and inclusion rates',
    input_schema: {
      type: 'object',
      properties: {
        commander_name: {
          type: 'string',
          description: 'Full commander name (e.g. "Muldrotha, the Gravetide")',
        },
        category: {
          type: 'string',
          description: 'Optional: filter by card type (creatures, enchantments, artifacts, instants, sorceries, lands, planeswalkers)',
        },
      },
      required: ['commander_name'],
    },
  },
  execute: async (input) => {
    try {
      const data = await getCommanderStaples(
        input.commander_name as string,
        { cardType: input.category as string | undefined, limit: 20 }
      )
      return { content: formatEDHRECResponse(data), is_error: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'EDHREC lookup failed'
      return { content: `EDHREC error: ${msg}`, is_error: true }
    }
  },
})

// --- Combo search: Direct Commander Spellbook API (replaces MCP) ---
registry.set('mtg_combos_search', {
  definition: {
    name: 'mtg_combos_search',
    description: 'Find known combo interactions from Commander Spellbook for one or more cards. Returns card combos with step-by-step descriptions.',
    input_schema: {
      type: 'object',
      properties: {
        card_name: {
          type: 'string',
          description: 'Card name to search for combos involving this card',
        },
        color_identity: {
          type: 'string',
          description: 'Optional: filter by color identity (e.g. "sultai", "BUG", "wubrg")',
        },
      },
      required: ['card_name'],
    },
  },
  execute: async (input) => {
    try {
      const combos = await findCombosForCard(
        input.card_name as string,
        { colorIdentity: input.color_identity as string | undefined, limit: 8 }
      )
      return { content: formatComboResults(input.card_name as string, combos), is_error: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Combo search failed'
      return { content: `Commander Spellbook error: ${msg}`, is_error: true }
    }
  },
})

// --- Commander validation: Check ref_commanders table (authoritative source) ---
registry.set('mtg_commander_deck', {
  definition: {
    name: 'mtg_commander_deck',
    description: 'Validate commander legality — confirms the card exists in the ref_commanders table (authoritative source), returns colour identity and EDHREC stats. Use this to verify any commander before recommending.',
    input_schema: {
      type: 'object',
      properties: {
        commander_name: {
          type: 'string',
          description: 'The commander name to validate',
        },
      },
      required: ['commander_name'],
    },
  },
  execute: async (input) => {
    try {
      const supabase = createAdminClient()
      const commanderName = input.commander_name as string
      
      // First check ref_commanders (authoritative source for legal commanders)
      const { data: commander, error: cmdError } = await supabase
        .from('ref_commanders')
        .select('display_name, color_identity, edhrec_rank, edhrec_deck_count, legal_commander')
        .ilike('display_name', commanderName)
        .limit(1)
        .maybeSingle()

      if (cmdError) throw new Error(cmdError.message)

      if (commander) {
        // Found in ref_commanders — this is authoritative
        if (!commander.legal_commander) {
          return {
            content: `✗ ${commander.display_name} — NOT a valid Commander\n  Reason: Banned in Commander format`,
            is_error: false,
          }
        }
        
        const rank = commander.edhrec_rank ? `#${commander.edhrec_rank}` : 'unranked'
        const deckCount = commander.edhrec_deck_count ? `${commander.edhrec_deck_count.toLocaleString()} decks` : 'new'
        const ci = commander.color_identity || 'Colorless'
        return {
          content: `✓ ${commander.display_name} — Valid Commander\n  Colour Identity: ${ci}\n  EDHREC: ${rank} (${deckCount})`,
          is_error: false,
        }
      }

      // Not in ref_commanders — check ref_cards for more info
      const { data: card, error: cardError } = await supabase
        .from('ref_cards')
        .select('name, type_line, color_identity, oracle_text, is_legendary, is_creature, commander_legal')
        .ilike('name', commanderName)
        .limit(1)
        .maybeSingle()

      if (cardError) throw new Error(cardError.message)

      if (!card) {
        return { content: `✗ Card "${commanderName}" not found in database. Try card_fuzzy_lookup to find the exact name.`, is_error: false }
      }

      // Card exists but not in ref_commanders — explain why
      const reasons: string[] = []
      if (!card.is_legendary) reasons.push('not legendary')
      if (!card.is_creature && !card.oracle_text?.toLowerCase().includes('can be your commander')) {
        reasons.push('not a creature and lacks "can be your commander" text')
      }
      if (!card.commander_legal) reasons.push('banned in Commander')

      if (reasons.length > 0) {
        return {
          content: `✗ ${card.name} — NOT a valid Commander\n  Reason: ${reasons.join(', ')}\n  Type: ${card.type_line}`,
          is_error: false,
        }
      }

      // Card seems legal but not in ref_commanders — might be a sync issue
      return {
        content: `⚠ ${card.name} — May be a valid Commander but not in our commanders database yet\n  Type: ${card.type_line}\n  Colour Identity: ${card.color_identity || 'Colorless'}\n  Note: This card may be newly released. The ref_commanders table syncs daily.`,
        is_error: false,
      }
    } catch (err) {
      // Fallback to Scryfall API if DB query fails
      try {
        const result = await validateCommander(input.commander_name as string)
        return { content: formatCommanderValidation(result), is_error: false }
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Commander validation failed'
        return { content: `Validation error: ${msg}`, is_error: true }
      }
    }
  },
})

// --- Top commanders by colour: Supabase mtg_cards ranked by EDHREC ---
registry.set('mtg_top_commanders', {
  definition: {
    name: 'mtg_top_commanders',
    description: 'Get popular commanders filtered by color identity, archetype, theme, or tribe. Use for specific requests like "show me aristocrats commanders" or "what are the top green commanders". For generic "build a deck" requests, use random=true to show diverse options.',
    input_schema: {
      type: 'object',
      properties: {
        color_identity: {
          type: 'string',
          description: 'Colour identity to filter by. Use WUBRG letters: "W" for mono-white, "U" for mono-blue, "B" for mono-black, "R" for mono-red, "G" for mono-green, "UB" for Dimir, "WUB" for Esper, etc. Also accepts guild/shard names like "dimir", "esper", "gruul". Optional — omit for any color.',
        },
        archetype: {
          type: 'string',
          description: 'Archetype/playstyle to filter by: aristocrats, blink, voltron, combo, control, aggro, reanimator, tokens, spellslinger, etc.',
        },
        theme: {
          type: 'string',
          description: 'Theme/mechanic to filter by: artifacts, enchantments, graveyard, counters, treasure, sacrifice, landfall, etc.',
        },
        tribe: {
          type: 'string',
          description: 'Creature tribe to filter by: elves, goblins, zombies, dragons, vampires, merfolk, humans, etc.',
        },
        random: {
          type: 'boolean',
          description: 'If true, return random commanders from top 500 (good for generic "build a deck" requests). Default false.',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (default: 6)',
        },
      },
      required: [],
    },
  },
  execute: async (input) => {
    try {
      const limit = (input.limit as number) || 6
      const rawCI = input.color_identity as string | undefined
      const archetype = input.archetype as string | undefined
      const theme = input.theme as string | undefined
      const tribe = input.tribe as string | undefined
      const random = input.random as boolean | undefined

      // Build query params for the commanders/search API
      const params = new URLSearchParams()
      
      if (rawCI) {
        const normalizedCI = normalizeColorIdentity(rawCI)
        if (normalizedCI) {
          params.set('colors', normalizedCI)
        }
      }
      
      if (archetype) {
        params.set('archetype', archetype)
      }
      
      if (theme) {
        params.set('theme', theme)
      }
      
      if (tribe) {
        params.set('tribe', tribe)
      }
      
      if (random) {
        params.set('random', 'true')
      }
      
      // Use the internal API which handles taxonomy filtering
      const apiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/commanders/search?${params.toString()}`
      const res = await fetch(apiUrl)
      
      if (!res.ok) {
        // Fallback to direct DB query if API fails
        return await fallbackDirectQuery(rawCI, limit)
      }
      
      const data = await res.json()
      const commanders = (data.commanders || []).slice(0, limit)
      
      if (commanders.length === 0) {
        const filters = [rawCI, archetype, theme, tribe].filter(Boolean).join(', ')
        return { 
          content: `No commanders found matching: ${filters || 'any criteria'}. Try broadening your search.`, 
          is_error: false 
        }
      }
      
      // Format results
      const filterDesc = [
        rawCI ? rawCI : null,
        archetype ? `${archetype} archetype` : null,
        theme ? `${theme} theme` : null,
        tribe ? `${tribe} tribe` : null,
      ].filter(Boolean).join(', ') || 'all colors/strategies'
      
      const lines = [`${random ? 'Random selection of' : 'Top'} ${commanders.length} commanders for ${filterDesc}:\n`]
      
      for (let i = 0; i < commanders.length; i++) {
        const cmd = commanders[i]
        const deckCount = cmd.edhrec_deck_count ? `${cmd.edhrec_deck_count.toLocaleString()} decks` : ''
        const owned = cmd.owned ? ' ✓ owned' : ''
        lines.push(`${i + 1}. ${cmd.display_name} (${cmd.color_identity || 'C'}) — ${deckCount}${owned}`)
      }
      
      return { content: lines.join('\n'), is_error: false }
      
    } catch (err) {
      console.error('[mtg_top_commanders] Error:', err)
      return { content: `Error fetching commanders: ${err instanceof Error ? err.message : String(err)}`, is_error: true }
    }
  },
})

// Fallback direct query when API is unavailable
async function fallbackDirectQuery(rawCI: string | undefined, limit: number) {
  const supabase = createAdminClient()
  
  let query = supabase
    .from('ref_commanders')
    .select('display_name, color_identity, edhrec_rank, edhrec_deck_count')
    .eq('legal_commander', true)
    .not('edhrec_rank', 'is', null)
    .order('edhrec_rank', { ascending: true })
    .limit(limit)
  
  if (rawCI) {
    const normalizedCI = normalizeColorIdentity(rawCI)
    if (normalizedCI) {
      query = query.eq('color_identity', normalizedCI)
    }
  }
  
  const { data: localCommanders, error } = await query
  
  if (error || !localCommanders || localCommanders.length === 0) {
    return { content: `Could not find commanders. Try a different search.`, is_error: true }
  }
  
  const lines = [`Top ${localCommanders.length} commanders${rawCI ? ` for ${rawCI}` : ''}:\n`]
  for (let i = 0; i < localCommanders.length; i++) {
    const cmd = localCommanders[i]
    const deckCount = cmd.edhrec_deck_count ? `${cmd.edhrec_deck_count.toLocaleString()} decks` : ''
    lines.push(`${i + 1}. ${cmd.display_name} (${cmd.color_identity || 'C'}) — ${deckCount}`)
  }
  
  return { content: lines.join('\n'), is_error: false }
}

// Legacy tool kept for backwards compatibility - remove the old implementation
registry.delete('mtg_top_commanders_legacy')

/** Normalize colour identity input to sorted WUBRG format (e.g., "dimir" → "UB") */
function normalizeColorIdentity(input: string): string {
  if (!input) return ''
  const normalized = input.trim().toLowerCase()
  
  // Map guild/shard names to WUBRG (no commas - API expects "WUB" not "W,U,B")
  const nameToWubrg: Record<string, string> = {
    'mono-white': 'W', 'white': 'W', 'w': 'W',
    'mono-blue': 'U', 'blue': 'U', 'u': 'U',
    'mono-black': 'B', 'black': 'B', 'b': 'B',
    'mono-red': 'R', 'red': 'R', 'r': 'R',
    'mono-green': 'G', 'green': 'G', 'g': 'G',
    'colorless': '', 'c': '',
    // Two-colour
    'azorius': 'WU', 'wu': 'WU', 'uw': 'WU',
    'dimir': 'UB', 'ub': 'UB', 'bu': 'UB',
    'rakdos': 'BR', 'br': 'BR', 'rb': 'BR',
    'gruul': 'RG', 'rg': 'RG', 'gr': 'RG',
    'selesnya': 'GW', 'gw': 'GW', 'wg': 'GW',
    'orzhov': 'WB', 'wb': 'WB', 'bw': 'WB',
    'izzet': 'UR', 'ur': 'UR', 'ru': 'UR',
    'golgari': 'BG', 'bg': 'BG', 'gb': 'BG',
    'boros': 'RW', 'rw': 'RW', 'wr': 'RW',
    'simic': 'GU', 'gu': 'GU', 'ug': 'GU',
    // Three-colour
    'esper': 'WUB', 'wub': 'WUB',
    'grixis': 'UBR', 'ubr': 'UBR',
    'jund': 'BRG', 'brg': 'BRG',
    'naya': 'RGW', 'rgw': 'RGW',
    'bant': 'GWU', 'gwu': 'GWU',
    'abzan': 'WBG', 'wbg': 'WBG',
    'jeskai': 'URW', 'urw': 'URW',
    'sultai': 'BGU', 'bgu': 'BGU',
    'mardu': 'RWB', 'rwb': 'RWB',
    'temur': 'GUR', 'gur': 'GUR',
    // Four-colour
    'yore-tiller': 'WUBR', 'wubr': 'WUBR',
    'glint-eye': 'UBRG', 'ubrg': 'UBRG',
    'dune-brood': 'BRGW', 'brgw': 'BRGW',
    'ink-treader': 'RGWU', 'rgwu': 'RGWU',
    'witch-maw': 'GWUB', 'gwub': 'GWUB',
    // Five-colour
    'five-color': 'WUBRG', 'wubrg': 'WUBRG', '5c': 'WUBRG',
  }
  
  if (nameToWubrg[normalized]) {
    return nameToWubrg[normalized]
  }
  
  // Try parsing as WUBRG letters (with or without commas/spaces)
  const letters = normalized.replace(/[^wubrgc]/gi, '').toUpperCase()
  if (letters) {
    // Sort in WUBRG order (no commas)
    const order = 'WUBRG'
    const sorted = letters.split('').sort((a, b) => order.indexOf(a) - order.indexOf(b))
    return sorted.join('')
  }
  
  return normalized.toUpperCase()
}

/** Format EDHREC commander JSON response into readable output */
function formatEdhrecCommanderResults(
  json: { container?: { json_dict?: { cardlists?: Array<{ cardviews?: Array<{ name: string; num_decks: number; rank: number; url: string }> }> } } },
  rawCI: string,
  limit: number
): { content: string; is_error: boolean } {
  const cardlists = json.container?.json_dict?.cardlists
  if (!cardlists || cardlists.length === 0) {
    return { content: `No commanders found for colour identity "${rawCI}" on EDHREC.`, is_error: false }
  }

  // The first cardlist contains the ranked commanders
  const commanders = cardlists[0]?.cardviews ?? []
  if (commanders.length === 0) {
    return { content: `No commanders found for colour identity "${rawCI}" on EDHREC.`, is_error: false }
  }

  const capped = commanders.slice(0, limit)
  const lines = [`Top ${capped.length} commanders for ${rawCI} (by EDHREC deck count):\n`]
  for (const cmd of capped) {
    lines.push(`${cmd.rank}. ${cmd.name} — ${cmd.num_decks.toLocaleString()} decks | https://edhrec.com${cmd.url}`)
  }
  lines.push(`\nSource: EDHREC (live data)`)
  return { content: lines.join('\n'), is_error: false }
}

/** Resolve user input (WUBRG letters, guild names, etc.) to EDHREC URL slug */
function resolveEdhrecColorSlug(input: string): string | null {
  const normalized = input.trim().toLowerCase()

  // Direct guild/shard/wedge name mapping
  const nameMap: Record<string, string> = {
    'mono-white': 'mono-white', 'white': 'mono-white', 'w': 'mono-white',
    'mono-blue': 'mono-blue', 'blue': 'mono-blue', 'u': 'mono-blue',
    'mono-black': 'mono-black', 'black': 'mono-black', 'b': 'mono-black',
    'mono-red': 'mono-red', 'red': 'mono-red', 'r': 'mono-red',
    'mono-green': 'mono-green', 'green': 'mono-green', 'g': 'mono-green',
    'colorless': 'colorless', 'c': 'colorless',
    // Two-colour guilds
    'azorius': 'azorius', 'wu': 'azorius', 'uw': 'azorius',
    'dimir': 'dimir', 'ub': 'dimir', 'bu': 'dimir',
    'rakdos': 'rakdos', 'br': 'rakdos', 'rb': 'rakdos',
    'gruul': 'gruul', 'rg': 'gruul', 'gr': 'gruul',
    'selesnya': 'selesnya', 'gw': 'selesnya', 'wg': 'selesnya',
    'orzhov': 'orzhov', 'wb': 'orzhov', 'bw': 'orzhov',
    'izzet': 'izzet', 'ur': 'izzet', 'ru': 'izzet',
    'golgari': 'golgari', 'bg': 'golgari', 'gb': 'golgari',
    'boros': 'boros', 'rw': 'boros', 'wr': 'boros',
    'simic': 'simic', 'gu': 'simic', 'ug': 'simic',
    // Three-colour shards/wedges
    'esper': 'esper', 'wub': 'esper',
    'grixis': 'grixis', 'ubr': 'grixis',
    'jund': 'jund', 'brg': 'jund',
    'naya': 'naya', 'rgw': 'naya',
    'bant': 'bant', 'gwu': 'bant',
    'abzan': 'abzan', 'wbg': 'abzan',
    'jeskai': 'jeskai', 'urw': 'jeskai',
    'sultai': 'sultai', 'bgu': 'sultai',
    'mardu': 'mardu', 'rwb': 'mardu',
    'temur': 'temur', 'gur': 'temur',
    // Four-colour (Nephilim names)
    'yore-tiller': 'yore-tiller', 'wubr': 'yore-tiller',
    'glint-eye': 'glint-eye', 'ubrg': 'glint-eye',
    'dune-brood': 'dune-brood', 'brgw': 'dune-brood',
    'ink-treader': 'ink-treader', 'rgwu': 'ink-treader',
    'witch-maw': 'witch-maw', 'gwub': 'witch-maw',
    // Five-colour
    'five-color': 'five-color', 'wubrg': 'five-color', '5c': 'five-color', '5-color': 'five-color',
  }

  // Try direct name match first
  if (nameMap[normalized]) return nameMap[normalized]

  // Try stripping commas/spaces and matching letter combos
  const letters = normalized.replace(/[^wubrgc]/g, '')
  if (nameMap[letters]) return nameMap[letters]

  // Sort letters and try again (handles any ordering like "b,u" → "bu" → dimir)
  const sorted = letters.split('').sort().join('')
  if (nameMap[sorted]) return nameMap[sorted]

  // Fallback: try the raw input as a slug (in case user typed "dimir" directly)
  return normalized.replace(/\s+/g, '-') || null
}

// --- Search commanders by keyword: Search ref_commanders table ---
registry.set('search_commanders', {
  definition: {
    name: 'search_commanders',
    description: 'Search for commanders by name keyword. Use this when the user asks about commanders from a specific set, franchise (Marvel, DC, etc.), or theme that you don\'t have in your training data. This searches the live database which includes all recent releases.',
    input_schema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Keyword to search for in commander names (e.g., "Spider", "Iron Man", "Thor", "Hearthhull", "spacecraft")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
      },
      required: ['keyword'],
    },
  },
  execute: async (input) => {
    try {
      const keyword = input.keyword as string
      const limit = (input.limit as number) || 10

      const supabase = createAdminClient()
      const { data: commanders, error } = await supabase
        .from('ref_commanders')
        .select('display_name, color_identity, edhrec_rank, edhrec_deck_count')
        .ilike('display_name', `%${keyword}%`)
        .eq('legal_commander', true)
        .order('edhrec_rank', { ascending: true, nullsFirst: false })
        .limit(limit)

      if (error) {
        throw new Error(`Commander search failed: ${error.message}`)
      }

      if (!commanders || commanders.length === 0) {
        return { content: `No commanders found matching "${keyword}".`, is_error: false }
      }

      const lines = [`Found ${commanders.length} commander(s) matching "${keyword}":\n`]
      for (const cmd of commanders) {
        const deckCount = cmd.edhrec_deck_count ? `${cmd.edhrec_deck_count.toLocaleString()} decks` : 'new'
        lines.push(`- ${cmd.display_name} | ${cmd.color_identity || 'Colorless'} | ${deckCount}`)
      }
      lines.push(`\nUse [[Commander Name]] brackets when mentioning these to the user.`)
      return { content: lines.join('\n'), is_error: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Commander search failed'
      return { content: `Error: ${msg}`, is_error: true }
    }
  },
})

// --- Brackets: AI training knowledge (static data) ---
registry.set('mtg_commander_brackets', {
  definition: {
    name: 'mtg_commander_brackets',
    description: 'Get bracket system power level criteria and guidelines for evaluating deck power',
    input_schema: {
      type: 'object',
      properties: {
        bracket: {
          type: 'number',
          description: 'Optional: specific bracket number (1-4) to get criteria for',
        },
      },
    },
  },
  execute: async (input) => {
    const bracket = input.bracket as number | undefined
    const guidelines = `Commander Bracket System (2024+):

Bracket 1: Precon-level. No fast mana beyond Sol Ring. No tutors. No infinite combos. Primarily the cards that came in the box.

Bracket 2: Upgraded precon / focused casual. Some tutors allowed (creature/land tutors OK). No infinite combos. Mana base may include some fetches/duals. Cards up to ~$20.

Bracket 3: Optimized casual. Tutors allowed. Efficient interaction (counters, removal). Fast mana beyond Sol Ring (Mana Crypt, etc). May have infinite combos that require 3+ pieces. This is the most common bracket for established playgroups.

Bracket 4: High-power / competitive-adjacent. All strategies legal. Fast combo wins. Stax/resource denial. Competitive mana bases. 2-card infinite combos. Turn 3-5 threat of winning.

Note: The bracket system is a social contract tool — discuss with your playgroup. Cards like Rhystic Study, Smothering Tithe, Dockside Extortionist are commonly discussed bracket boundaries.`

    if (bracket && bracket >= 1 && bracket <= 4) {
      const lines = guidelines.split('\n\n')
      const specific = lines.find(l => l.startsWith(`Bracket ${bracket}:`))
      return { content: specific || guidelines, is_error: false }
    }
    return { content: guidelines, is_error: false }
  },
})

// ---------------------------------------------------------------------------
// Local Tool: validate_cards_for_commander
// ---------------------------------------------------------------------------

registry.set('validate_cards_for_commander', {
  definition: {
    name: 'validate_cards_for_commander',
    description:
      'Validate that cards are legal in a commander\'s color identity. Use this BEFORE suggesting cards to ensure they can actually go in the deck. Returns which cards are legal, illegal, or unknown.',
    input_schema: {
      type: 'object',
      properties: {
        commander_name: {
          type: 'string',
          description: 'The commander name to validate against',
        },
        card_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Card names to check for color identity legality',
        },
      },
      required: ['commander_name', 'card_names'],
    },
  },
  execute: async (input) => {
    try {
      const supabase = createAdminClient()
      const commanderName = input.commander_name as string
      const cardNames = input.card_names as string[]

      // Get commander's color identity
      const { data: commander } = await supabase
        .from('ref_cards')
        .select('name, color_identity')
        .ilike('name', commanderName)
        .limit(1)
        .maybeSingle()

      if (!commander) {
        return {
          content: `Commander "${commanderName}" not found in database. Cannot validate color identity.`,
          is_error: true,
        }
      }

      // Parse commander color identity (e.g., "WBR" → ['W', 'B', 'R'])
      const commanderColors = new Set(
        (commander.color_identity || '').split('').filter((c: string) => 'WUBRG'.includes(c))
      )

      // Get color identity for each card
      const results: Array<{
        card_name: string
        legal: boolean
        card_colors: string
        reason?: string
      }> = []

      for (const cardName of cardNames) {
        const { data: card } = await supabase
          .from('ref_cards')
          .select('name, color_identity')
          .ilike('name', cardName)
          .limit(1)
          .maybeSingle()

        if (!card) {
          results.push({
            card_name: cardName,
            legal: false,
            card_colors: '?',
            reason: 'Card not found in database',
          })
          continue
        }

        // Parse card color identity
        const cardColors = (card.color_identity || '').split('').filter((c: string) => 'WUBRG'.includes(c))
        
        // Check if all card colors are in commander's identity
        const illegalColors = cardColors.filter((c: string) => !commanderColors.has(c))
        
        if (illegalColors.length > 0) {
          results.push({
            card_name: card.name,
            legal: false,
            card_colors: card.color_identity || 'C',
            reason: `Contains ${illegalColors.join(', ')} which is not in ${commander.name}'s identity (${commander.color_identity || 'C'})`,
          })
        } else {
          results.push({
            card_name: card.name,
            legal: true,
            card_colors: card.color_identity || 'C',
          })
        }
      }

      const legal = results.filter(r => r.legal)
      const illegal = results.filter(r => !r.legal)

      const summary = [
        `Color identity check for ${commander.name} (${commander.color_identity || 'C'}):`,
        ``,
        `Legal (${legal.length}): ${legal.map(r => r.card_name).join(', ') || 'none'}`,
        ``,
        `Illegal (${illegal.length}):`,
        ...illegal.map(r => `  - ${r.card_name} (${r.card_colors}): ${r.reason}`),
      ]

      return { content: summary.join('\n'), is_error: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Validation failed'
      return { content: `Color identity validation error: ${msg}`, is_error: true }
    }
  },
})

// ---------------------------------------------------------------------------
// Local Tool: collection_lookup
// ---------------------------------------------------------------------------

registry.set('search_owned_cards', {
  definition: {
    name: 'search_owned_cards',
    description:
      'Search the user\'s collection by card type or subtype. Use this when the user asks "what curses do I own", "show me my sagas", "list my equipment", etc. Returns all owned cards matching the type.',
    input_schema: {
      type: 'object',
      properties: {
        type_keyword: {
          type: 'string',
          description: 'Card type or subtype to search for (e.g., "Curse", "Saga", "Equipment", "Creature", "Enchantment")',
        },
        colour_identity: {
          type: 'array',
          items: { type: 'string', enum: ['W', 'U', 'B', 'R', 'G'] },
          description: 'Optional: filter to cards within this colour identity (for commander deck building)',
        },
      },
      required: ['type_keyword'],
    },
  },
  execute: async (input, context) => {
    try {
      const userId = context?.userId
      if (!userId) {
        return { content: 'Collection search requires authentication — userId not available', is_error: true }
      }
      
      const repo = getCardRepository(userId)
      const typeKeyword = input.type_keyword as string
      const colourIdentity = input.colour_identity as string[] | undefined

      console.log('[search_owned_cards] Searching for type:', typeKeyword, 'colours:', colourIdentity, 'userId:', userId)

      const results = await repo.searchOwnedByType(typeKeyword, colourIdentity)

      console.log('[search_owned_cards] Found:', results.length, 'cards')

      if (results.length === 0) {
        return {
          content: `No ${typeKeyword}s found in your collection${colourIdentity ? ` within colour identity ${colourIdentity.join('')}` : ''}.`,
          is_error: false,
        }
      }

      const lines = [
        `Found ${results.length} ${typeKeyword}${results.length > 1 ? 's' : ''} in your collection:`,
        '',
        ...results.map(r => `- ${r.card_name} (qty: ${r.quantity})`),
      ]

      return { content: lines.join('\n'), is_error: false }
    } catch (err) {
      console.error('[search_owned_cards] Error:', err)
      const msg = err instanceof Error ? err.message : 'Collection search failed'
      return { content: `Collection search error: ${msg}`, is_error: true }
    }
  },
})

registry.set('collection_lookup', {
  definition: {
    name: 'collection_lookup',
    description:
      'Query the user\'s card collection for ownership data. Returns quantity owned, set code, foil status, and deck allocations for each card. Cards not in the collection are returned with "not_owned" status.',
    input_schema: {
      type: 'object',
      properties: {
        card_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'One or more card names to check ownership for',
        },
        colour_identity: {
          type: 'array',
          items: { type: 'string', enum: ['W', 'U', 'B', 'R', 'G'] },
          description: 'Optional: filter owned cards by colour identity subset',
        },
      },
      required: ['card_names'],
    },
  },
  execute: async (input, context) => {
    try {
      const userId = context?.userId
      if (!userId) {
        return { content: 'Collection lookup requires authentication — userId not available', is_error: true }
      }
      
      const repo = getCardRepository(userId)
      const cardNames = input.card_names as string[]
      const colourIdentity = input.colour_identity as string[] | undefined

      console.log('[collection_lookup] Querying for cards:', cardNames, 'userId:', userId)

      // Get owned cards — either by colour identity filter or by specific names
      let ownedCards
      if (colourIdentity && colourIdentity.length > 0) {
        ownedCards = await repo.getCardsByColourIdentity(colourIdentity)
      } else {
        ownedCards = await repo.getOwnedCards(cardNames)
      }

      console.log('[collection_lookup] Found owned cards:', ownedCards.length)

      // Build a lookup map of owned cards
      const ownedMap = new Map<string, OwnedCardInfo>(
        ownedCards.map(c => [c.card_name.toLowerCase(), c])
      )

      // Build result for each requested card name
      const results = await Promise.all(
        cardNames.map(async (name) => {
          const owned = ownedMap.get(name.toLowerCase())
          if (!owned) {
            return {
              card_name: name,
              status: 'not_owned' as const,
              quantity: 0,
              set_code: null,
              foil: false,
              allocations: [],
            }
          }

          // Get deck allocations for this card
          const allocations = await repo.getDeckAllocations(name)

          return {
            card_name: owned.card_name,
            status: 'owned' as const,
            quantity: owned.quantity,
            set_code: owned.set_code,
            foil: owned.foil,
            allocations: allocations.map(a => ({
              deck_name: a.deck_name,
              quantity: a.quantity,
              is_commander: a.is_commander,
              allocation_status: a.allocation_status,
            })),
          }
        })
      )

      return { content: JSON.stringify(results, null, 2), is_error: false }
    } catch (err) {
      console.error('[collection_lookup] Error:', err)
      const msg = err instanceof Error ? err.message : 'Collection lookup failed'
      return { content: `Collection lookup error: ${msg}`, is_error: true }
    }
  },
})

// ---------------------------------------------------------------------------
// Local Tool: list_user_decks
// ---------------------------------------------------------------------------

registry.set('list_user_decks', {
  definition: {
    name: 'list_user_decks',
    description:
      'List all the user\'s Commander decks with basic info. Returns deck name, commander, card count, and active status for each deck. Use this when the user asks about their decks, wants to compare them, or is viewing the deck list page.',
    input_schema: {
      type: 'object',
      properties: {
        include_inactive: {
          type: 'boolean',
          description: 'Whether to include inactive/archived decks. Default is false (only active decks).',
        },
      },
    },
  },
  execute: async (input, context) => {
    try {
      const userId = context?.userId
      if (!userId) {
        return { content: 'Deck list requires authentication — userId not available', is_error: true }
      }
      
      const includeInactive = (input?.include_inactive as boolean) || false
      const supabase = createAdminClient()
      
      // Query decks - the table has commander_name and card_count directly
      let query = supabase
        .from('decks')
        .select('id, name, commander_name, colour_identity, card_count, is_active, last_synced_at')
        .eq('user_id', userId)
        .order('is_active', { ascending: false })
        .order('last_synced_at', { ascending: false, nullsFirst: false })
      
      if (!includeInactive) {
        query = query.eq('is_active', true)
      }
      
      const { data: decks, error } = await query
      
      if (error) {
        console.error('[list_user_decks] Query error:', error)
        throw new Error(`Failed to fetch decks: ${error.message}`)
      }
      
      if (!decks || decks.length === 0) {
        return {
          content: includeInactive 
            ? 'You don\'t have any decks yet.'
            : 'You don\'t have any active decks. Try asking with include_inactive: true to see archived decks.',
          is_error: false,
        }
      }
      
      // Format output
      const deckList = decks.map(deck => ({
        id: deck.id,
        name: deck.name,
        commander: deck.commander_name || 'No commander set',
        color_identity: deck.colour_identity || 'Colorless',
        card_count: deck.card_count ?? 0,
        is_active: deck.is_active,
        last_updated: deck.last_synced_at,
      }))
      
      return { content: JSON.stringify(deckList, null, 2), is_error: false }
    } catch (err) {
      console.error('[list_user_decks] Error:', err)
      const msg = err instanceof Error ? err.message : 'Deck list failed'
      return { content: `Deck list error: ${msg}`, is_error: true }
    }
  },
})

// ---------------------------------------------------------------------------
// Local Tool: deck_context
// ---------------------------------------------------------------------------

registry.set('deck_context', {
  definition: {
    name: 'deck_context',
    description:
      'Query the current brew session deck state. In building phase, returns card list with categories, counts, and health status. In exploration phase, returns the decision log.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'number',
          description: 'The brew session ID to query deck state for',
        },
      },
      required: ['session_id'],
    },
  },
  execute: async (input) => {
    try {
      const repo = getCardRepository()
      const sessionId = input.session_id as number

      // Try building-phase deck context first
      const deckContext = await repo.getDeckContext(sessionId)
      if (deckContext) {
        return { content: JSON.stringify(deckContext, null, 2), is_error: false }
      }

      // Fall back to exploration-phase decision log
      const decisionLog = await repo.getDecisionLog(sessionId)
      if (decisionLog) {
        return {
          content: JSON.stringify({
            phase: 'exploration',
            decision_log: decisionLog,
          }, null, 2),
          is_error: false,
        }
      }

      // Neither found — session invalid or empty
      return {
        content: 'Session not found or deck is empty. No deck state or decision log exists for this session.',
        is_error: true,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deck context query failed'
      return { content: `Deck context error: ${msg}`, is_error: true }
    }
  },
})

// ---------------------------------------------------------------------------
// Local Tool: get_commander_insights
// ---------------------------------------------------------------------------

registry.set('get_commander_insights', {
  definition: {
    name: 'get_commander_insights',
    description:
      'Get curated strategy insights for a commander from expert sources (articles, videos, podcasts). Returns build variants, key card recommendations, strategy tips, and common pitfalls. Use this when discussing commander strategy or exploring build directions.',
    input_schema: {
      type: 'object',
      properties: {
        commander_name: {
          type: 'string',
          description: 'The commander name to get insights for (e.g., "Muldrotha, the Gravetide")',
        },
        insight_type: {
          type: 'string',
          enum: ['strategy', 'card_recommendation', 'build_variant', 'pitfall', 'all'],
          description: 'Optional: filter by insight type. Default is "all".',
        },
      },
      required: ['commander_name'],
    },
  },
  execute: async (input) => {
    try {
      const commanderName = input.commander_name as string
      const insightType = (input.insight_type as string) || 'all'
      
      const supabase = createAdminClient()
      
      // First, find the commander in ref_commanders
      const { data: commander, error: cmdError } = await supabase
        .from('ref_commanders')
        .select('id, display_name, color_identity, leadership_type')
        .ilike('display_name', commanderName)
        .limit(1)
        .maybeSingle()
      
      if (cmdError) {
        throw new Error(`Commander lookup failed: ${cmdError.message}`)
      }
      
      if (!commander) {
        // Try partial match
        const { data: partialMatch } = await supabase
          .from('ref_commanders')
          .select('id, display_name, color_identity, leadership_type')
          .ilike('display_name', `%${commanderName}%`)
          .limit(1)
          .maybeSingle()
        
        if (!partialMatch) {
          return {
            content: `No insights found for "${commanderName}". This commander may not have curated strategy content yet.`,
            is_error: false,
          }
        }
        
        // Use partial match
        return await fetchInsights(supabase, partialMatch, insightType)
      }
      
      return await fetchInsights(supabase, commander, insightType)
    } catch (err) {
      console.error('[get_commander_insights] Error:', err)
      const msg = err instanceof Error ? err.message : 'Insights lookup failed'
      return { content: `Commander insights error: ${msg}`, is_error: true }
    }
  },
})

async function fetchInsights(
  supabase: ReturnType<typeof createAdminClient>,
  commander: { id: string; display_name: string; color_identity: string; leadership_type: string },
  insightType: string
): Promise<{ content: string; is_error: boolean }> {
  // Query insights for this commander
  let query = supabase
    .from('ref_commander_insights')
    .select('*')
    .eq('commander_id', commander.id)
    .order('confidence', { ascending: false, nullsFirst: false })
  
  if (insightType !== 'all') {
    query = query.eq('insight_type', insightType)
  }
  
  const { data: insights, error: insightsError } = await query.limit(20)
  
  if (insightsError) {
    throw new Error(`Insights query failed: ${insightsError.message}`)
  }
  
  if (!insights || insights.length === 0) {
    return {
      content: `No curated insights found for ${commander.display_name}. Consider using mtg_commander_recommend for EDHREC data instead.`,
      is_error: false,
    }
  }
  
  // Group insights by type
  const byType = new Map<string, typeof insights>()
  for (const insight of insights) {
    const type = insight.insight_type
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type)!.push(insight)
  }
  
  // Format output
  const lines: string[] = [
    `## Strategy Insights: ${commander.display_name}`,
    `Colour Identity: ${commander.color_identity} | Type: ${commander.leadership_type}`,
    '',
  ]
  
  // Order: build_variant first (if any), then strategy, card_recommendation, pitfall
  const typeOrder = ['build_variant', 'strategy', 'card_recommendation', 'pitfall']
  
  for (const type of typeOrder) {
    const typeInsights = byType.get(type)
    if (!typeInsights || typeInsights.length === 0) continue
    
    const header = {
      build_variant: '### Build Variants',
      strategy: '### Strategy Tips',
      card_recommendation: '### Key Card Recommendations',
      pitfall: '### Common Pitfalls',
    }[type] || `### ${type}`
    
    lines.push(header)
    
    for (const insight of typeInsights) {
      const source = insight.source_title ? ` (${insight.source_title})` : ''
      const variant = insight.build_variant ? `[${insight.build_variant}] ` : ''
      lines.push(`- ${variant}${insight.content}${source}`)
      
      // Include card mentions if present
      if (insight.card_mentions && insight.card_mentions.length > 0) {
        lines.push(`  Cards mentioned: ${insight.card_mentions.map(c => `[[${c}]]`).join(', ')}`)
      }
    }
    lines.push('')
  }
  
  // Add sources summary
  const uniqueSources = new Set(insights.map(i => i.source_title).filter(Boolean))
  if (uniqueSources.size > 0) {
    lines.push(`---`)
    lines.push(`Sources: ${Array.from(uniqueSources).join(', ')}`)
  }
  
  return { content: lines.join('\n'), is_error: false }
}

// ---------------------------------------------------------------------------
// Local Tool: card_fuzzy_lookup
// ---------------------------------------------------------------------------

registry.set('card_fuzzy_lookup', {
  definition: {
    name: 'card_fuzzy_lookup',
    description:
      'Resolve an approximate or misspelled card name to the exact card. Use this when the user types a card name that might be misspelled, abbreviated, or informal (e.g., "blech" → "Blech, Loafing Pest", "bob" → "Dark Confidant"). Searches the local card database first, then falls back to Scryfall.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The approximate/fuzzy card name to resolve (e.g., "blech", "tymna", "bob")',
        },
      },
      required: ['name'],
    },
  },
  execute: async (input) => {
    try {
      const fuzzyName = input.name as string

      // --- Step 1: Try exact ilike match from our Supabase mtg_cards table ---
      const supabase = createAdminClient()
      const { data: exactMatch } = await supabase
        .from('mtg_cards' as any)
        .select('name, type_line, color_identity, mana_cost, mana_value, oracle_text, edhrec_rank, is_legendary, is_creature, commander_legal')
        .ilike('name', fuzzyName)
        .limit(1)
        .maybeSingle()

      if (exactMatch) {
        return { content: formatCardResult(exactMatch, fuzzyName), is_error: false }
      }

      // --- Step 2: Try partial match (name contains the search term) ---
      const { data: partialMatches } = await supabase
        .from('mtg_cards' as any)
        .select('name, type_line, color_identity, mana_cost, mana_value, oracle_text, edhrec_rank, is_legendary, is_creature, commander_legal')
        .ilike('name', `%${fuzzyName}%`)
        .eq('commander_legal', true)
        .order('edhrec_rank', { ascending: true, nullsFirst: false })
        .limit(5)

      if (partialMatches && partialMatches.length > 0) {
        if (partialMatches.length === 1) {
          return { content: formatCardResult(partialMatches[0], fuzzyName), is_error: false }
        }
        const lines = [`Found ${partialMatches.length} cards matching "${fuzzyName}":\n`]
        for (const card of partialMatches) {
          const cmdStatus = (card.is_legendary && card.is_creature) ? '✓ Commander' : ''
          lines.push(`- ${card.name} | ${card.type_line} | ${card.color_identity ?? 'Colorless'} ${cmdStatus}`)
        }
        return { content: lines.join('\n'), is_error: false }
      }

      // --- Step 3: Try printings local table (has all cards with prices/images) ---
      const { data: localPrinting } = await supabase
        .from('ref_printings')
        .select('name, type_line, color_identity, mana_cost, cmc, legality_commander')
        .ilike('name', `%${fuzzyName}%`)
        .eq('legality_commander', 'legal')
        .eq('digital', false)
        .order('released_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (localPrinting) {
        const isLegendary = localPrinting.type_line?.includes('Legendary')
        const isCreature = localPrinting.type_line?.includes('Creature')
        const commanderLegal = isLegendary && isCreature ? '✓ Valid Commander' : '✗ Not a valid commander'

        const lines = [
          `Resolved: "${fuzzyName}" → ${localPrinting.name}`,
          `Type: ${localPrinting.type_line}`,
          `Mana: ${localPrinting.mana_cost || 'None'} (CMC: ${localPrinting.cmc})`,
          `Colour Identity: ${localPrinting.color_identity?.join('') || 'Colorless'}`,
          `Commander: ${commanderLegal}`,
        ].filter(Boolean)
        return { content: lines.join('\n'), is_error: false }
      }

      // --- Step 4: Fallback to Scryfall fuzzy API (for very new cards not yet in our DB) ---
      // Add game:paper filter to exclude digital-only cards
      const res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(fuzzyName)}`,
        { headers: { 'User-Agent': 'The-Oracle/1.0' } }
      )

      if (res.ok) {
        const card = await res.json()
        
        // Skip digital-only cards
        if (card.digital) {
          return { content: `"${fuzzyName}" resolves to ${card.name}, but this is a digital-only card (not available in paper).`, is_error: false }
        }
        
        const isLegendary = card.type_line?.includes('Legendary')
        const isCreature = card.type_line?.includes('Creature')
        const commanderLegal = isLegendary && isCreature ? '✓ Valid Commander' : '✗ Not a valid commander'

        const lines = [
          `Resolved: "${fuzzyName}" → ${card.name} (from Scryfall — not yet in local DB)`,
          `Type: ${card.type_line}`,
          `Mana: ${card.mana_cost || 'None'} (CMC: ${card.cmc})`,
          `Colour Identity: ${card.color_identity?.join('') || 'Colorless'}`,
          `Commander: ${commanderLegal}`,
          card.oracle_text ? `Text: ${card.oracle_text}` : null,
        ].filter(Boolean)
        return { content: lines.join('\n'), is_error: false }
      }

      // --- Step 5: Scryfall autocomplete as last resort ---
      const autoRes = await fetch(
        `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(fuzzyName)}`,
        { headers: { 'User-Agent': 'The-Oracle/1.0' } }
      )
      if (autoRes.ok) {
        const autoData = await autoRes.json()
        if (autoData.data && autoData.data.length > 0) {
          return {
            content: `No exact match for "${fuzzyName}". Did you mean:\n${autoData.data.slice(0, 5).map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')}`,
            is_error: false,
          }
        }
      }

      return { content: `No card found matching "${fuzzyName}" in database or Scryfall`, is_error: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fuzzy lookup failed'
      return { content: `Card lookup error: ${msg}`, is_error: true }
    }
  },
})

/** Format a card result from the mtg_cards table */
function formatCardResult(
  card: { name: string; type_line: string | null; color_identity: string | null; mana_cost: string | null; mana_value: number | null; oracle_text: string | null; edhrec_rank: number | null; is_legendary: boolean | null; is_creature: boolean | null; commander_legal: boolean | null },
  searchTerm: string
): string {
  const canBeCommander = card.is_legendary && card.is_creature
  const commanderStatus = canBeCommander ? '✓ Valid Commander' : '✗ Not a valid commander'
  const rank = card.edhrec_rank ? ` (EDHREC #${card.edhrec_rank})` : ''

  const lines = [
    `Resolved: "${searchTerm}" → ${card.name}${rank}`,
    `Type: ${card.type_line}`,
    `Mana: ${card.mana_cost || 'None'} (CMC: ${card.mana_value ?? 0})`,
    `Colour Identity: ${card.color_identity || 'Colorless'}`,
    `Commander: ${commanderStatus}${card.commander_legal ? '' : ' (BANNED)'}`,
    card.oracle_text ? `Text: ${card.oracle_text}` : null,
  ].filter(Boolean)

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Local Tool: scryfall_search
// ---------------------------------------------------------------------------

registry.set('scryfall_search', {
  definition: {
    name: 'scryfall_search',
    description:
      'Search for Magic cards using Scryfall search syntax. Use for complex card queries that need specific filters (type, color, CMC, keywords, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Scryfall search syntax query (e.g., "t:creature c:bg cmc<=3")',
        },
      },
      required: ['query'],
    },
  },
  execute: async (input) => {
    try {
      const query = input.query as string
      const data = await scryfallSearch(query)
      return { content: JSON.stringify(data, null, 2), is_error: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scryfall search failed'
      return { content: `Scryfall search error: ${msg}`, is_error: true }
    }
  },
})

// ---------------------------------------------------------------------------
// Display Tool: display_commander_candidates
// ---------------------------------------------------------------------------
// This is a "display" tool — it doesn't fetch data, it declares structured
// output. When the model calls this, the tool loop captures the arguments and
// the chat route emits them as a `candidates` SSE event to the frontend.
// The frontend reads this directly into candidateCards state — no regex needed.
// ---------------------------------------------------------------------------

registry.set('display_commander_candidates', {
  definition: {
    name: 'display_commander_candidates',
    description: 'Display commander candidates on the brew canvas. ALWAYS call this tool when you recommend or list commanders for the user to choose from. This makes them appear as visual cards on the canvas with "Commit" buttons. If you mention commanders without calling this tool, they will NOT appear on the canvas. For partner commanders, include both names in a single entry using the partner_name field.',
    input_schema: {
      type: 'object',
      properties: {
        commanders: {
          type: 'array',
          description: 'Array of commander candidates to display on the canvas',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The exact card name as printed (e.g. "Krenko, Mob Boss"). For partners, this is the first commander.',
              },
              partner_name: {
                type: 'string',
                description: 'For partner commanders only: the exact name of the second partner (e.g. "Tymna the Weaver" when paired with "Thrasios, Triton Hero")',
              },
              color_identity: {
                type: 'array',
                items: { type: 'string' },
                description: 'Combined colour identity as WUBRG letters. For partners, this is the union of both commanders\' identities.',
              },
              leadership_type: {
                type: 'string',
                enum: ['single', 'partner', 'partner_with', 'friends_forever', 'background'],
                description: 'Type of commander configuration. Defaults to "single" if not specified.',
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['commanders'],
    },
  },
  execute: async (input) => {
    // This tool is a passthrough — the structured data is captured by the
    // tool executor and forwarded as a `candidates` SSE event.
    // The execute function just acknowledges receipt.
    const commanders = input.commanders as Array<{ name: string; partner_name?: string; color_identity?: string[]; leadership_type?: string }>
    const names = commanders.map(c => c.partner_name ? `${c.name} & ${c.partner_name}` : c.name).join(', ')
    return {
      content: `Displayed ${commanders.length} commander candidates on canvas: ${names}`,
      is_error: false,
    }
  },
})

// ---------------------------------------------------------------------------
// Display Tool: add_cards_to_deck
// ---------------------------------------------------------------------------
// Allows the AI to directly add cards to the deck canvas during building phase.
// Like display_commander_candidates, this is a "display" tool — the tool loop
// captures the arguments and emits them as an `add_cards` SSE event.
// ---------------------------------------------------------------------------

registry.set('add_cards_to_deck', {
  definition: {
    name: 'add_cards_to_deck',
    description: 'Add cards directly to the deck canvas during the building phase. Call this when the user asks you to add cards, or when you are recommending cards and the user confirms they want them added. Each card needs a name and category.',
    input_schema: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          description: 'Array of cards to add to the deck',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The exact card name as printed (e.g. "Sol Ring")',
              },
              category: {
                type: 'string',
                description: 'The functional category for this card (e.g. "Ramp", "Draw", "Removal", "Protection", "Finisher", "Combo", "Utility")',
              },
            },
            required: ['name', 'category'],
          },
        },
      },
      required: ['cards'],
    },
  },
  execute: async (input) => {
    const cards = input.cards as Array<{ name: string; category: string }>
    const names = cards.map(c => c.name).join(', ')
    return {
      content: `Added ${cards.length} cards to the deck canvas: ${names}`,
      is_error: false,
    }
  },
})

// ---------------------------------------------------------------------------
// Display Tool: remove_cards_from_deck
// ---------------------------------------------------------------------------
// Allows the AI to remove cards from the deck during editing.
// Like add_cards_to_deck, this emits a `remove_cards` SSE event that the
// frontend handles to call the deck API.
// ---------------------------------------------------------------------------

registry.set('remove_cards_from_deck', {
  definition: {
    name: 'remove_cards_from_deck',
    description: 'Remove cards from the deck. Call this when the user asks you to remove or cut specific cards from the deck.',
    input_schema: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          description: 'Array of cards to remove from the deck',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The exact card name as printed (e.g. "Sol Ring")',
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['cards'],
    },
  },
  execute: async (input) => {
    const cards = input.cards as Array<{ name: string }>
    const names = cards.map(c => c.name).join(', ')
    return {
      content: `Removed ${cards.length} cards from the deck: ${names}`,
      is_error: false,
    }
  },
})
