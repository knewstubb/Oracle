import { z } from 'zod'
import type { CollectionSummary } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import type { GroupedCollectionSummary, SummaryGroup } from '../../../../docs/oracle/contracts/connector-collection-search.types'
import { ROLE_ORDER } from '../../card-roles'
import { LookupFailed, lookupFailed, must, type ToolContext, type ToolOutput } from './common'
import { filterFields, refineFilters, type CollectionFilters } from './collection-filters'
import { ROLE_RULES_VERSION, findMatchingCopies } from './collection-query'
import type { NarrowRow } from './collection-view'

export const GROUPS_MAX = 60
export const GROUP_BY = ['type', 'colour', 'location', 'kind', 'role'] as const

export const collectionSummaryInput = z
  .strictObject({
    group_by: z.enum(GROUP_BY).optional().describe('Count the matching copies by type, colour, location, kind (original or proxy) or role. Role groups overlap: a card can have several roles.'),
    ...filterFields,
  })
  .superRefine(refineFilters)

async function count(ctx: ToolContext, table: string, refine?: (q: ReturnType<ToolContext['db']['select']>) => ReturnType<ToolContext['db']['select']>): Promise<number> {
  let q = ctx.db.select(table, 'id', { count: 'exact', head: true }).eq('user_id', ctx.userId)
  if (refine) q = refine(q)
  const r = await must(q)
  if (typeof r.count !== 'number') throw new LookupFailed()
  return r.count
}

const COLOUR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }
export const NO_FACTS = 'No facts'

export function colourLabel(letters: string | null | undefined): string {
  if (letters == null) return NO_FACTS
  if (letters === '') return 'Colourless'
  if (letters.length === 5) return 'Five colour'
  return [...letters].map((c) => COLOUR_NAMES[c]).join('/')
}

function locationLabel(r: NarrowRow): string {
  switch (r.place_kind) {
    case 'missing': return 'Missing'
    case 'in_hand': return 'In your hand'
    case 'deck': return `${r.deck_name ?? 'Unnamed deck'} (deck)`
    case 'storage': return r.storage_name ?? 'Unnamed storage'
    default: return 'Not placed'
  }
}

const EXTRA: Record<(typeof GROUP_BY)[number], string[]> = {
  type: ['primary_type'],
  colour: ['colour_letters'],
  location: ['place_kind', 'deck_name', 'storage_name'],
  kind: [],
  role: [],
}

const ROLE_LABEL = Object.fromEntries(ROLE_ORDER.map((r) => [r, r[0].toUpperCase() + r.slice(1)])) as Record<string, string>

function hasAnyFilter(i: z.infer<typeof collectionSummaryInput>): boolean {
  return Object.values(i).some((v) => v !== undefined)
}

async function legacySummary(ctx: ToolContext): Promise<ToolOutput> {
  const [distinctCards, totalCopies, proxyCopies, originalCopies, missingCopies, copiesInStorage, copiesInDecks] = await Promise.all([
    count(ctx, 'user_cards'),
    count(ctx, 'user_copies'),
    count(ctx, 'user_copies', (q) => q.eq('is_proxy', true)),
    count(ctx, 'user_copies', (q) => q.eq('is_proxy', false)),
    count(ctx, 'user_copies', (q) => q.eq('missing', true)),
    count(ctx, 'user_copies', (q) => q.not('location_id', 'is', null)),
    count(ctx, 'deck_cards', (q) => q.not('copy_id', 'is', null)),
  ])
  const body: CollectionSummary = { ok: true, distinctCards, totalCopies, proxyCopies, originalCopies, copiesInDecks, copiesInStorage, missingCopies }
  return body as unknown as ToolOutput
}

export async function getCollectionSummary(ctx: ToolContext, input: z.infer<typeof collectionSummaryInput> = {}): Promise<ToolOutput> {
  try {
    if (!hasAnyFilter(input)) return await legacySummary(ctx)

    const { group_by, ...filters } = input
    const groupBy = group_by ?? 'type'
    const match = await findMatchingCopies(ctx, filters as CollectionFilters, { extraCols: EXTRA[groupBy], classify: groupBy === 'role' })

    const tally = new Map<string, { copies: number; cards: Set<number> }>()
    const add = (label: string, r: NarrowRow) => {
      let g = tally.get(label)
      if (!g) tally.set(label, (g = { copies: 0, cards: new Set() }))
      g.copies++
      g.cards.add(r.card_id)
    }
    for (const r of match.rows) {
      if (groupBy === 'type') add(r.facts_available ? (r.primary_type ?? 'Other') : NO_FACTS, r)
      else if (groupBy === 'colour') add(r.facts_available ? colourLabel(r.colour_letters) : NO_FACTS, r)
      else if (groupBy === 'location') add(locationLabel(r), r)
      else if (groupBy === 'kind') add(r.is_proxy ? 'Proxy' : 'Original', r)
      else {
        const info = r.facts_available ? match.roleInfo?.get(r.card_name) : undefined
        if (!info || !info.hasText) add(NO_FACTS, r) // not checked: no library row or no rules text
        else if (info.roles.length === 0) add('No role', r) // checked, none of the four; lands land here
        else for (const role of info.roles) add(ROLE_LABEL[role], r)
      }
    }

    const all: SummaryGroup[] = [...tally.entries()]
      .map(([label, g]) => ({ label, copies: g.copies, distinctCards: g.cards.size }))
      .sort((a, b) => b.copies - a.copies || a.label.localeCompare(b.label))
    const usesRoles = groupBy === 'role' || !!filters.roles
    const notes = [
      groupBy === 'role' ? 'Role groups overlap: a card can have several roles, so the groups can add up to more than totalCopies. "No role" plus "No facts" plus the cards with any role make up the total.' : null,
      match.coverage?.note ?? null,
      ...match.notes,
    ].filter((n): n is string => !!n)

    const body: GroupedCollectionSummary = {
      ok: true,
      groupBy,
      totalCopies: match.rows.length,
      distinctCards: new Set(match.rows.map((r) => r.card_id)).size,
      groups: all.slice(0, GROUPS_MAX),
      groupsTruncated: all.length > GROUPS_MAX,
      ...(notes.length ? { note: notes.join(' ') } : {}),
      ...(usesRoles ? { roleRulesVersion: ROLE_RULES_VERSION } : {}),
    }
    return body as unknown as ToolOutput
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
