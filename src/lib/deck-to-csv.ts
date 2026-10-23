/**
 * A deck fetched from a link (Archidekt, Moxfield, ...) turned into a CSV the shared import
 * review already reads (contracts/import-formats.md §3.2). The `Board` column carries the section
 * (Commander / Maybeboard) so maybeboard cards follow the same rules as pasted lists (D-018, D-022).
 */
import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'

const HEADER = ['Name', 'Set code', 'Collector number', 'Quantity', 'Scryfall ID', 'Board', 'Proxy']

function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function line(card: NormalizedCard, board: string): string {
  return [
    cell(card.cardName),
    cell(card.setCode ?? ''),
    cell(card.collectorNumber ?? ''),
    String(card.quantity),
    cell(card.scryfallId ?? ''),
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
