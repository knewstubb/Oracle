import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { CommandZoneSlots } from './CommandZoneSlots'
import { CommanderActionsProvider, useCommanderActions } from '@/hooks/useCommanderActions'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckCard } from './CardGrid'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const NOTE = "No commander yet. Open a card's menu and choose 'Add as commander'."

const card = (over: Partial<DeckCard>): DeckCard => ({
  id: 1, deck_id: 9, card_name: 'X', scryfall_id: 's', set_code: 'x', quantity: 1,
  categories: '["Creature"]', tags: '[]', is_commander: false, ...over,
})
const kraum = card({ id: 2, card_name: 'Kraum, Ludevic’s Opus' })
const sol = card({ id: 3, card_name: 'Sol Ring', categories: '["Artifact"]' })
const atraxa = card({ id: 1, card_name: 'Atraxa', is_commander: true })

function stub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('role=second-kind')) return Response.json({ kind: null })
      if (url.includes('role=lead')) return Response.json({ eligible: ['Kraum, Ludevic’s Opus'] })
      if (url.includes('role=')) return Response.json({ eligible: [] })
      return Response.json({ ok: true })
    })
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('no-commander note in the Commander section', () => {
  it('is shown when the deck has no commander', async () => {
    stub()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CommandZoneSlots deckId={9} cards={[kraum, sol]} commanderName={null} heading />
      </QueryClientProvider>
    )
    expect((await screen.findByTestId('no-commander-note')).textContent).toBe(NOTE)
  })

  it('is shown even when no card is known to be a legal commander', async () => {
    stub()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CommandZoneSlots deckId={9} cards={[sol]} commanderName={null} heading />
      </QueryClientProvider>
    )
    expect(await screen.findByText(NOTE)).toBeTruthy()
  })

  it('is hidden when a commander is set', async () => {
    stub()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CommandZoneSlots deckId={9} cards={[atraxa, sol]} commanderName="Atraxa" heading />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.queryByTestId('no-commander-note')).toBeNull())
  })

  it('is hidden when only the commander name is set (no flagged card)', async () => {
    stub()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CommandZoneSlots deckId={9} cards={[kraum, sol]} commanderName="Kraum, Ludevic’s Opus" heading />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.queryByTestId('no-commander-note')).toBeNull())
  })

  it('disappears right after "Add as commander" (before the save finishes)', async () => {
    stub()
    const qc = new QueryClient()
    qc.setQueryData(deckKeys.detail(9), { deck: { commander_name: null, commander_scryfall_id: null }, cards: [kraum, sol] })

    // Reads the deck the way the deck page does, so the optimistic change reaches the note.
    function Page() {
      const { data } = useQuery({ queryKey: deckKeys.detail(9), queryFn: async () => null, staleTime: Infinity, initialData: qc.getQueryData(deckKeys.detail(9)) })
      const d = data as unknown as { deck: { commander_name: string | null }; cards: DeckCard[] }
      return (
        <CommanderActionsProvider deckId={9} cards={d.cards} commanderName={d.deck.commander_name} deckTarget={100}>
          <CommandZoneSlots deckId={9} cards={d.cards} commanderName={d.deck.commander_name} heading />
          <AddButton />
        </CommanderActionsProvider>
      )
    }
    function AddButton() {
      const actions = useCommanderActions()
      return (
        <button type="button" onClick={() => void actions?.run(kraum, { kind: 'add-commander', as: 'commander' })}>
          add kraum
        </button>
      )
    }

    render(
      <QueryClientProvider client={qc}>
        <Page />
      </QueryClientProvider>
    )
    expect(await screen.findByText(NOTE)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'add kraum' }))
    await waitFor(() => expect(screen.queryByText(NOTE)).toBeNull())
  })
})
