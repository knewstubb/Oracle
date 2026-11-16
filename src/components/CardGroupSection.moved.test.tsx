import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardGroupSection } from './CardGroupSection'
import type { DeckCard } from './CardGrid'

afterEach(() => vi.unstubAllGlobals())

const card = (id: number, name: string) =>
  ({ id, card_name: name, quantity: 1, categories: '["Artifact"]', scryfall_id: null }) as unknown as DeckCard

function renderSection() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ ok: true, moved: [{ slot_id: 2, card_name: 'Sol Ring', moved_to_deck_id: 9, moved_to_deck_name: 'Korvold', at: '2026-11-14T10:55:00Z', client_name: 'Claude', approved_by_owner: true }] }),
  }))
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CardGroupSection groupName="Artifact" groupCards={[card(1, 'Arcane Signet'), card(2, 'Sol Ring')]} statusMap={new Map()}
        lifecycleMap={new Map()} deckId={4} physicalCopyMap={new Map()} />
    </QueryClientProvider>,
  )
}

describe('moved-card state in the original deck', () => {
  it('shows Unavailable, In {deck}, Open link and the history line only on the moved slot', async () => {
    renderSection()
    expect(await screen.findByText('In Korvold')).toBeInTheDocument()
    expect(screen.getAllByTestId('moved-slot-note')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Open Korvold' })).toHaveAttribute('href', '/decks/9')
    expect(screen.getByText(/Was sleeved here\. Claude moved this copy to Korvold/)).toBeInTheDocument()
  })
})
