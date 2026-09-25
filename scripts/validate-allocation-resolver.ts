/**
 * Validate Allocation Resolver (read-only)
 *
 * Runs the V2 allocation suggestion engine against real deck data without
 * writing anything. Outputs a JSON validation report to stdout.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *     npx tsx scripts/validate-allocation-resolver.ts <userId>
 *
 * Constraints:
 *   - No calls to allocation_clear_active_decks or any destructive RPC.
 *   - No writes to deck_cards, user_copies, or any allocation-related table.
 *   - Only SELECT-style reads through the suggestion engine functions.
 */

import { createClient } from '@supabase/supabase-js'
import { getBatchRankedCandidates, getRankedCandidates } from '@/lib/allocation-candidates'
import type { RankedCandidate, EnrichedSupplyEntry } from '@/lib/allocation-candidates'
import { isBasicLand } from '@/lib/basic-lands'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const userId = process.argv[2]
if (!userId) {
  console.error('Usage: npx tsx scripts/validate-allocation-resolver.ts <userId>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface CardValidation {
  deckCardsId: number
  cardName: string
  candidates: RankedCandidate[]
  candidateCount: number
  topTier: number | null
  topIsAutoSelectable: boolean | null
  issues: string[]
}

interface DeckValidation {
  deckId: number
  deckName: string
  status: string | null
  isActive: boolean
  allocate: boolean
  totalCards: number
  resolvedCards: number
  unresolvedCards: number
  cards: CardValidation[]
  issues: string[]
}

interface ValidationReport {
  userId: string
  decksExamined: number
  totalUnresolvedSlots: number
  totalCandidatesGenerated: number
  decks: DeckValidation[]
  globalIssues: string[]
  runtimeErrors: string[]
}

function validateCandidateSort(candidates: RankedCandidate[]): string[] {
  const issues: string[] = []
  for (let i = 1; i < candidates.length; i++) {
    const prev = candidates[i - 1]
    const curr = candidates[i]
    if (prev.tier > curr.tier) {
      issues.push(`Sort violation at index ${i}: tier ${prev.tier} before ${curr.tier}`)
    } else if (prev.tier === curr.tier && prev.withinTierScore < curr.withinTierScore) {
      issues.push(`Within-tier sort violation at index ${i}: score ${prev.withinTierScore} before ${curr.withinTierScore}`)
    }
  }
  return issues
}

function validateCandidateSemantics(c: RankedCandidate, expectedName: string): string[] {
  const issues: string[] = []
  if (c.tier === 5) {
    if (c.entry.physicalCopyId !== -1) {
      issues.push('Tier 5 candidate should be synthetic (physicalCopyId = -1)')
    }
  } else {
    if (c.entry.physicalCopyId < 1) {
      issues.push(`Tier ${c.tier} candidate has invalid physicalCopyId ${c.entry.physicalCopyId}`)
    }
  }
  if (c.autoSelectable && c.tier > 2) {
    issues.push(`Tier ${c.tier} candidate incorrectly marked autoSelectable`)
  }
  if (!c.autoSelectable && c.tier <= 2) {
    issues.push(`Tier ${c.tier} candidate should be autoSelectable`)
  }
  return issues
}

async function main() {
  const report: ValidationReport = {
    userId,
    decksExamined: 0,
    totalUnresolvedSlots: 0,
    totalCandidatesGenerated: 0,
    decks: [],
    globalIssues: [],
    runtimeErrors: [],
  }

  try {
    // Fetch decks for this user. The "allocate" flag is not consistently set
    // in existing data, so we validate against all decks rather than filtering
    // it out and reporting nothing.
    const { data: decks, error: deckErr } = await supabase
      .from('decks')
      .select('id, name, status, is_active, allocate')
      .eq('user_id', userId)
      .order('id')

    if (deckErr) {
      console.error(JSON.stringify({ error: `Failed to fetch decks: ${deckErr.message}` }, null, 2))
      process.exit(1)
    }

    if (!decks || decks.length === 0) {
      console.log(JSON.stringify({ ...report, globalIssues: ['No decks found for user'] }, null, 2))
      return
    }

    report.decksExamined = decks.length

    for (const deck of decks) {
      const deckIssues: string[] = []
      const deckResult: DeckValidation = {
        deckId: deck.id,
        deckName: deck.name,
        status: deck.status,
        isActive: deck.is_active,
        allocate: deck.allocate,
        totalCards: 0,
        resolvedCards: 0,
        unresolvedCards: 0,
        cards: [],
        issues: deckIssues,
      }

      const { data: deckCards, error: cardsErr } = await supabase
        .from('deck_cards')
        .select('id, card_name, copy_id, scryfall_id')
        .eq('deck_id', deck.id)
        .eq('user_id', userId)
        .order('card_name')

      if (cardsErr) {
        deckIssues.push(`Failed to fetch deck_cards: ${cardsErr.message}`)
        report.decks.push(deckResult)
        continue
      }

      const cards = deckCards ?? []
      // Match picklist semantics: generic basic lands (basic land name + no specific printing)
      // are considered satisfied and do not need candidate resolution.
      const isGenericLand = (c: any) => isBasicLand(c.card_name) && !c.scryfall_id
      deckResult.totalCards = cards.length
      deckResult.resolvedCards = cards.filter(c => c.copy_id !== null || isGenericLand(c)).length
      const unresolved = cards.filter(c => c.copy_id === null && !isGenericLand(c))
      deckResult.unresolvedCards = unresolved.length
      report.totalUnresolvedSlots += unresolved.length

      if (unresolved.length === 0) continue

      const unresolvedNames = Array.from(new Set(unresolved.map(c => c.card_name)))

      let candidatesByName: Map<string, RankedCandidate[]>
      try {
        candidatesByName = await getBatchRankedCandidates(unresolvedNames, userId)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        report.runtimeErrors.push(`getBatchRankedCandidates failed for deck ${deck.id}: ${message}`)
        deckIssues.push(`Candidate generation failed: ${message}`)
        report.decks.push(deckResult)
        continue
      }

      const grouped = new Map<string, number[]>()
      for (const row of unresolved) {
        const existing = grouped.get(row.card_name)
        if (existing) existing.push(row.id)
        else grouped.set(row.card_name, [row.id])
      }

      for (const [cardName, deckCardsIds] of grouped) {
        const candidates = candidatesByName.get(cardName) ?? []
        report.totalCandidatesGenerated += candidates.length

        const sortIssues = validateCandidateSort(candidates)
        const semanticIssues: string[] = []
        for (const c of candidates) {
          semanticIssues.push(...validateCandidateSemantics(c, cardName))
        }

        // Demand check: if there are N unresolved slots for this card, at least
        // N distinct physical copies should ideally be available in Tiers 1-2 for
        // auto-assign to succeed. We report when supply of auto-selectable copies
        // is less than demand.
        const autoSelectable = candidates.filter(c => c.autoSelectable && c.entry.physicalCopyId > 0)
        const demandIssues: string[] = []
        if (autoSelectable.length < deckCardsIds.length) {
          demandIssues.push(
            `Demand (${deckCardsIds.length} slots) exceeds auto-selectable supply (${autoSelectable.length})`
          )
        }

        const top = candidates[0] ?? null
        for (const deckCardsId of deckCardsIds) {
          deckResult.cards.push({
            deckCardsId,
            cardName,
            candidates,
            candidateCount: candidates.length,
            topTier: top?.tier ?? null,
            topIsAutoSelectable: top?.autoSelectable ?? null,
            issues: [...sortIssues, ...semanticIssues, ...demandIssues],
          })
        }
      }

      report.decks.push(deckResult)
    }

    // Spot-check single-card candidate API for a card known to be in collection
    try {
      const { data: anyCopy } = await supabase
        .from('user_copies')
        .select('id, card_id, user_cards!user_copies_card_id_fkey(card_name)')
        .eq('user_id', userId)
        .limit(1)
        .single()

      if (anyCopy && (anyCopy.user_cards as any)?.card_name) {
        const cardName = (anyCopy.user_cards as any).card_name
        const singleCandidates = await getRankedCandidates(cardName, userId, null)
        const singleIssues = validateCandidateSort(singleCandidates)
        if (singleIssues.length > 0) {
          report.globalIssues.push(`Single-card API sort issues for "${cardName}": ${singleIssues.join('; ')}`)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      report.runtimeErrors.push(`Single-card spot check failed: ${message}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    report.runtimeErrors.push(`Unexpected top-level error: ${message}`)
  }

  console.log(JSON.stringify(report, null, 2))
}

main()
