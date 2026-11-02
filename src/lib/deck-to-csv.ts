/**
 * A deck fetched from a link (Archidekt, Moxfield, ...) turned into a CSV the shared import
 * review already reads (contracts/import-formats.md §3.2). The `Board` column carries the section
 * (Commander / Maybeboard) so maybeboard cards follow the same rules as pasted lists (D-018, D-022).
 */
import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'
import { isBasicLand } from '@/lib/basic-lands'

const HEADER = ['Name', 'Set code', 'Collector number', 'Quantity', 'Scryfall ID', 'Board', 'Proxy']

function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function line(card: NormalizedCard, board: string): string {
  // Basic lands from a link become generic basics (D-048, on by default): no printing is named.
  const basic = isBasicLand(card.cardName)
  return [
    cell(card.cardName),
    cell(basic ? '' : card.setCode ?? ''),
    cell(basic ? '' : card.collectorNumber ?? ''),
    String(card.quantity),
    cell(basic ? '' : card.scryfallId ?? ''),
    board,
    card.isProxy ? 'true' : '',
  ].join(',')
}

export function deckToCsv(deck: Pick<NormalizedDeck, 'cards' | 'maybeboard'>): string {
  const lines = [HEADER.join(',')]
  for (const card of deck.cards) lines.push(line(card, card.isCommander ? 'Commander' : ''))
  for (const card of deck.maybeboard ?? []) lines.push(line(card, 'Maybeboard'))
  return lines.join('\n') + '\n'
}

export function deckCsvFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return `${safe || 'Imported Deck'}.csv`
}
