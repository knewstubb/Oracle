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
import { createServerClient } from './supabase'

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
  input: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const tool = registry.get(name)
  if (!tool) {
    return { content: `Unknown tool: ${name}`, is_error: true }
  }
  return tool.execute(input)
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
      // First get the card to find its rulings URI
      const cardRes = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`,
        { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
      )
      if (!cardRes.ok) {
        return { content: `Card "${cardName}" not found on Scryfall`, is_error: true }
      }
      const card = await cardRes.json()

      // Fetch rulings
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

// --- Comprehensive rules: AI training knowledge (MCP removed) ---
registry.set('mtg_rules_search', {
  definition: {
    name: 'mtg_rules_search',
    description: 'Search the comprehensive rules by section number or keyword. Uses built-in knowledge of MTG comprehensive rules.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Rule number (e.g. "704.5k") or keyword to search for (e.g. "commander damage", "state-based actions")',
        },
      },
      required: ['query'],
    },
  },
  execute: async (input) => {
    // The AI already has comprehensive rules in its training data.
    // Return a prompt that tells it to use its knowledge.
    return {
      content: `[System: Use your training knowledge of the MTG Comprehensive Rules to answer the query "${input.query}". You have extensive knowledge of the rules document including section numbers. Cite the relevant rule numbers in your response.]`,
      is_error: false,
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

// --- Commander validation: Supabase mtg_cards table (works on Vercel + local) ---
registry.set('mtg_commander_deck', {
  definition: {
    name: 'mtg_commander_deck',
    description: 'Validate commander legality — confirms the card exists, is legendary, is Commander-legal, and returns colour identity. Uses local card database for instant results.',
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
      const supabase = createServerClient()
      const { data, error } = await supabase
        .from('mtg_cards' as any)
        .select('name, type_line, color_identity, mana_cost, edhrec_rank, commander_legal, is_legendary, is_creature')
        .ilike('name', input.commander_name as string)
        .limit(1)
        .maybeSingle()

      if (error) throw new Error(error.message)

      if (!data) {
        return { content: `✗ Card "${input.commander_name}" not found in database`, is_error: false }
      }

      const canBeCommander = (data.is_legendary && data.is_creature) || (data.type_line?.toLowerCase().includes('can be your commander'))

      if (!canBeCommander) {
        return {
          content: `✗ ${data.name} — NOT a valid Commander\n  Reason: Not a Legendary Creature\n  Type: ${data.type_line}`,
          is_error: false,
        }
      }

      if (!data.commander_legal) {
        return {
          content: `✗ ${data.name} — NOT a valid Commander\n  Reason: Banned in Commander`,
          is_error: false,
        }
      }

      const rank = data.edhrec_rank ? ` (EDHREC rank: #${data.edhrec_rank})` : ''
      const ci = data.color_identity || 'Colorless'
      return {
        content: `✓ ${data.name} — Valid Commander${rank}\n  Type: ${data.type_line}\n  Colour Identity: ${ci}\n  Mana Cost: ${data.mana_cost}`,
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
    description: 'Get the most popular commanders for a specific colour identity, ranked by EDHREC deck count (number of registered decks). Use this when the user asks "what are the top/most popular X commanders".',
    input_schema: {
      type: 'object',
      properties: {
        color_identity: {
          type: 'string',
          description: 'Colour identity to filter by. Use WUBRG letters: "W" for mono-white, "U" for mono-blue, "B" for mono-black, "R" for mono-red, "G" for mono-green, "U,B" for Dimir, "W,U,B" for Esper, etc. Also accepts guild/shard names like "dimir", "esper", "gruul".',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (default: 10)',
        },
      },
      required: ['color_identity'],
    },
  },
  execute: async (input) => {
    try {
      const limit = (input.limit as number) || 10
      const rawCI = input.color_identity as string

      // Map colour identity to EDHREC slug
      const slug = resolveEdhrecColorSlug(rawCI)
      if (!slug) {
        return { content: `Could not resolve colour identity "${rawCI}" to an EDHREC page. Use WUBRG letters (e.g. "U,B") or guild names (e.g. "dimir").`, is_error: true }
      }

      // Fetch from EDHREC's public JSON API (ranked by deck count)
      const res = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`, {
        headers: { 'User-Agent': 'The-Oracle/1.0' },
      })

      if (!res.ok) {
        return { content: `EDHREC returned ${res.status} for slug "${slug}". Try a different colour identity format.`, is_error: true }
      }

      const json = await res.json()

      // Handle redirects (e.g. "ub" → "dimir")
      if (json.redirect) {
        const redirectSlug = json.redirect.replace('/commanders/', '')
        const redirectRes = await fetch(`https://json.edhrec.com/pages/commanders/${redirectSlug}.json`, {
          headers: { 'User-Agent': 'The-Oracle/1.0' },
        })
        if (!redirectRes.ok) {
          return { content: `EDHREC redirect to "${redirectSlug}" failed (${redirectRes.status}).`, is_error: true }
        }
        const redirectJson = await redirectRes.json()
        return formatEdhrecCommanderResults(redirectJson, rawCI, limit)
      }

      return formatEdhrecCommanderResults(json, rawCI, limit)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Top commanders lookup failed'
      return { content: `Error: ${msg}`, is_error: true }
    }
  },
})

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

// --- Card types: Supabase mtg_cards lookup (replaces MCP) ---
registry.set('mtg_cardtypes_get', {
  definition: {
    name: 'mtg_cardtypes_get',
    description: 'Get detailed card type information including subtypes and supertypes',
    input_schema: {
      type: 'object',
      properties: {
        card_name: {
          type: 'string',
          description: 'The card name to get type information for',
        },
      },
      required: ['card_name'],
    },
  },
  execute: async (input) => {
    try {
      const supabase = createServerClient()
      const { data, error } = await supabase
        .from('mtg_cards' as any)
        .select('name, type_line, color_identity, mana_cost, mana_value, oracle_text, power, toughness, edhrec_rank')
        .ilike('name', input.card_name as string)
        .limit(1)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) return { content: `Card "${input.card_name}" not found`, is_error: false }

      const lines = [
        `${data.name}`,
        `Type: ${data.type_line}`,
        `Mana Cost: ${data.mana_cost || 'None'} (CMC: ${data.mana_value})`,
        `Colour Identity: ${data.color_identity || 'Colorless'}`,
        data.power ? `P/T: ${data.power}/${data.toughness}` : null,
        data.oracle_text ? `Text: ${data.oracle_text}` : null,
        data.edhrec_rank ? `EDHREC Rank: #${data.edhrec_rank}` : null,
      ].filter(Boolean)

      return { content: lines.join('\n'), is_error: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Card lookup failed'
      return { content: `Card type error: ${msg}`, is_error: true }
    }
  },
})

// ---------------------------------------------------------------------------
// Local Tool: collection_lookup
// ---------------------------------------------------------------------------

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
  execute: async (input) => {
    try {
      const repo = getCardRepository()
      const cardNames = input.card_names as string[]
      const colourIdentity = input.colour_identity as string[] | undefined

      // Get owned cards — either by colour identity filter or by specific names
      let ownedCards
      if (colourIdentity && colourIdentity.length > 0) {
        ownedCards = await repo.getCardsByColourIdentity(colourIdentity)
      } else {
        ownedCards = await repo.getOwnedCards(cardNames)
      }

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
      const msg = err instanceof Error ? err.message : 'Collection lookup failed'
      return { content: `Collection lookup error: ${msg}`, is_error: true }
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
      const supabase = createServerClient()
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

      // --- Step 3: Fallback to Scryfall fuzzy API (for very new cards not yet in our DB) ---
      const res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(fuzzyName)}`,
        { headers: { 'User-Agent': 'The-Oracle/1.0' } }
      )

      if (res.ok) {
        const card = await res.json()
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

      // --- Step 4: Scryfall autocomplete as last resort ---
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
    description: 'Display commander candidates on the brew canvas. ALWAYS call this tool when you recommend or list commanders for the user to choose from. This makes them appear as visual cards on the canvas with "Commit" buttons. If you mention commanders without calling this tool, they will NOT appear on the canvas.',
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
                description: 'The exact card name as printed (e.g. "Krenko, Mob Boss")',
              },
              color_identity: {
                type: 'array',
                items: { type: 'string' },
                description: 'Colour identity as WUBRG letters (e.g. ["R"] for mono-red)',
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
    const commanders = input.commanders as Array<{ name: string; color_identity?: string[] }>
    const names = commanders.map(c => c.name).join(', ')
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
