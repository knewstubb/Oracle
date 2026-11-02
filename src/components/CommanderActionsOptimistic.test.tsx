import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CardsTab } from './CardsTab'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckCard } from './CardGrid'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const row = (over: Partial<DeckCard>): DeckCard => ({
  id: 1, deck_id: 9, card_name: 'X', scryfall_id: 's', set_code: 'x', quantity: 1,
  categories: '["Creature"]', tags: '[]', is_commander: false, ...over,
})

/** Like the deck page: reads the deck through the shared cache key and hands it to the Cards tab. */
function Page({ deckId }: { deckId: string }) {
  const { data } = useQuery({
    queryKey: deckKeys.detail(deckId),
    queryFn: () => fetch(`/api/decks/${deckId}`).then((r) => r.json()),
  })
  if (!data) return null
  return <CardsTab cards={data.cards} deckId={data.deck.id} commanderName={data.deck.commander_name} showCommandZone deckTarget={100} />
}

interface Server {
  deck: { id: number; commander_name: string | null; commander_scryfall_id: string | null }
  cards: DeckCard[]
}

/** A tiny pretend server. `release` lets the test hold the save open to prove the screen changed first. */
function setup(initial: Server, opts: { failSave?: boolean; lead?: string[] } = {}) {
  const state = structuredClone(initial)
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => { release = r })
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('role=lead')) return Response.json({ eligible: opts.lead ?? [] })
    if (url.includes('role=')) return Response.json({ eligible: [] })
    if (url === '/api/decks/9/command-zone') {
      await gate
      if (opts.failSave) return Response.json({ error: 'Deck not found.' }, { status: 404 })
      const b = JSON.parse(String(init?.body))
      state.cards = state.cards.map((c) => ({ ...c, is_commander: c.id === b.primaryCardId }))
      state.deck.commander_name = state.cards.find((c) => c.id === b.primaryCardId)?.card_name ?? null
      return Response.json({ ok: true })
    }
    if (url === '/api/decks/9') return Response.json({ deck: state.deck, cards: state.cards })
    return Response.json({ cards: [] })
  })
  vi.stubGlobal('fetch', f)
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page deckId="9" />
    </QueryClientProvider>
  )
  return { f, state, release }
}

async function clickMenu(cardName: string, item: string) {
  const rowEl = (await screen.findAllByText(cardName))[0].closest('div.group') as HTMLElement
  await userEvent.click(rowEl.querySelector('button[aria-label="More actions"]') as HTMLElement)
  await userEvent.click(await screen.findByRole('button', { name: item }))
}

/** The text of the page, split at the section headings: which cards sit under "Commander (n)". */
const commanderSection = () => /Commander \((\d)\)/.exec(document.body.textContent ?? '')?.[0] ?? null

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('commander actions update the screen before the server answers', () => {
  it('Add as commander: the card is in the Commander section while the save is still running, and the deck is not re-downloaded', async () => {
    const { f, state, release } = setup(
      {
        deck: { id: 9, commander_name: null, commander_scryfall_id: null },
        cards: [row({ id: 1, card_name: 'Kraum', scryfall_id: 'k' }), row({ id: 2, card_name: 'Sol Ring', categories: '["Artifact"]' })],
      },
      { lead: ['Kraum'] }
    )
    await screen.findAllByText('Kraum')
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('role=lead'))).toBe(true))
    await new Promise((r) => setTimeout(r, 30))
    expect(commanderSection()).toBeNull()

    await clickMenu('Kraum', 'Add as commander')
    // Save has NOT finished (it is held open) and the card has already moved.
    await waitFor(() => expect(commanderSection()).toBe('Commander (1)'))
    expect(state.deck.commander_name).toBeNull()

    release()
    await waitFor(() => expect(state.deck.commander_name).toBe('Kraum'))
    await new Promise((r) => setTimeout(r, 50))
    expect(commanderSection()).toBe('Commander (1)')
    // One download of the deck (the first load) and no second one after the save.
    expect(f.mock.calls.filter((c) => c[0] === '/api/decks/9')).toHaveLength(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('Remove as commander: the card leaves the Commander section on click, before the save finishes', async () => {
    const { state, release } = setup({
      deck: { id: 9, commander_name: 'Kraum', commander_scryfall_id: 'k' },
      cards: [row({ id: 1, card_name: 'Kraum', is_commander: true, scryfall_id: 'k' }), row({ id: 2, card_name: 'Sol Ring', categories: '["Artifact"]' })],
    })
    await waitFor(() => expect(commanderSection()).toBe('Commander (1)'))
    await clickMenu('Kraum', 'Remove as commander')
    await waitFor(() => expect(commanderSection()).toBeNull())
    expect(state.deck.commander_name).toBe('Kraum') // server has not answered yet
    release()
    await waitFor(() => expect(state.deck.commander_name).toBeNull())
  })

  it('a failed save puts the card back and says so', async () => {
    const { release } = setup(
      {
        deck: { id: 9, commander_name: 'Kraum', commander_scryfall_id: 'k' },
        cards: [row({ id: 1, card_name: 'Kraum', is_commander: true, scryfall_id: 'k' }), row({ id: 2, card_name: 'Sol Ring', categories: '["Artifact"]' })],
      },
      { failSave: true }
    )
    await waitFor(() => expect(commanderSection()).toBe('Commander (1)'))
    await clickMenu('Kraum', 'Remove as commander')
    await waitFor(() => expect(commanderSection()).toBeNull())
    release()
    await waitFor(() => expect(commanderSection()).toBe('Commander (1)'))
    expect(toast.error).toHaveBeenCalledTimes(1)
    const message = String(vi.mocked(toast.error).mock.calls[0][0])
    expect(message).toContain('put back')
    expect(message).toContain('Kraum')
    expect(message).toContain('Deck not found.')
  })
})
