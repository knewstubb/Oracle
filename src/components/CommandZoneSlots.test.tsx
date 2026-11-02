import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CommandZoneSlots, findPrimaryRow } from './CommandZoneSlots'
import type { DeckCard } from './CardGrid'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const card = (over: Partial<DeckCard>): DeckCard => ({
  id: 1, deck_id: 9, card_name: 'X', scryfall_id: 's', set_code: 'x', quantity: 1,
  categories: '["Creature"]', tags: '[]', is_commander: false, ...over,
})

const primary = card({ id: 1, card_name: 'Atraxa', is_commander: true })
const lurrus = card({ id: 2, card_name: 'Lurrus of the Dream-Den' })
const sol = card({ id: 3, card_name: 'Sol Ring' })
const companionRow = card({ id: 4, card_name: 'Yorion, Sky Nomad', categories: '["Sideboard"]', command_zone_role: 'companion' })

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const f = vi.fn(async (url: string, init?: RequestInit) => impl(url, init))
  vi.stubGlobal('fetch', f)
  return f
}

describe('findPrimaryRow', () => {
  it('prefers the flagged row, falls back to the commander name, ignores companion/second', () => {
    expect(findPrimaryRow([lurrus, primary], null)?.id).toBe(1)
    expect(findPrimaryRow([lurrus, sol], 'Sol Ring')?.id).toBe(3)
    expect(findPrimaryRow([companionRow], 'Yorion, Sky Nomad')).toBeNull()
    expect(findPrimaryRow([lurrus], null)).toBeNull()
  })
})

describe('CommandZoneSlots', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('shows empty slots, and no second-commander slot until there is a commander', () => {
    wrap(<CommandZoneSlots deckId={9} cards={[lurrus]} commanderName={null} />)
    expect(screen.getByText('No companion · Add')).toBeTruthy()
    expect(screen.queryByText('No second commander · Add')).toBeNull()
  })

  it('shows the companion by name', () => {
    wrap(<CommandZoneSlots deckId={9} cards={[primary, companionRow]} commanderName="Atraxa" />)
    expect(screen.getByText('Companion · Yorion, Sky Nomad')).toBeTruthy()
    expect(screen.getByText('No second commander · Add')).toBeTruthy()
  })

  it('picks a companion from the deck: PUT carries the primary id and the existing second commander', async () => {
    const f = mockFetch((url) =>
      url.includes('/api/commanders/eligible') ? Response.json({ eligible: ['Lurrus of the Dream-Den'] }) : Response.json({ deck_id: 9 })
    )
    wrap(<CommandZoneSlots deckId={9} cards={[primary, lurrus, sol]} commanderName="Atraxa" />)
    await userEvent.click(screen.getByRole('button', { name: /No companion/ }))
    await userEvent.click(await screen.findByRole('option', { name: /Lurrus of the Dream-Den/ }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/decks/9/command-zone')).toBe(true))
    const put = f.mock.calls.find((c) => c[0] === '/api/decks/9/command-zone')!
    expect(put[1]?.method).toBe('PUT')
    expect(JSON.parse(String(put[1]?.body))).toEqual({ primaryCardId: 1, secondCardId: null, companionCardId: 2 })
  })

  it('shows the empty message when no deck card has Companion', async () => {
    mockFetch(() => Response.json({ eligible: [] }))
    wrap(<CommandZoneSlots deckId={9} cards={[primary, sol]} commanderName="Atraxa" />)
    await userEvent.click(screen.getByRole('button', { name: /No companion/ }))
    expect(await screen.findByText('No card in this deck has Companion')).toBeTruthy()
  })

  it('shows an error when the check fails', async () => {
    mockFetch(() => new Response('{}', { status: 500 }))
    wrap(<CommandZoneSlots deckId={9} cards={[primary, sol]} commanderName="Atraxa" />)
    await userEvent.click(screen.getByRole('button', { name: /No companion/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not check/)
  })

  it('shows the refusal in plain words when the server refuses the pair', async () => {
    const { toast } = await import('sonner')
    mockFetch((url) =>
      url.includes('/api/commanders/eligible')
        ? Response.json({ eligible: ['Lurrus of the Dream-Den'] })
        : Response.json({ error: 'Those two cannot be commanders together.' }, { status: 422 })
    )
    wrap(<CommandZoneSlots deckId={9} cards={[primary, lurrus]} commanderName="Atraxa" />)
    await userEvent.click(screen.getByRole('button', { name: /No second commander/ }))
    await userEvent.click(await screen.findByRole('option', { name: /Lurrus/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Those two cannot be commanders together.'))
  })

  it('removing the companion asks first, and Keep does nothing', async () => {
    const f = mockFetch(() => Response.json({}))
    wrap(<CommandZoneSlots deckId={9} cards={[primary, companionRow]} commanderName="Atraxa" />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove companion Yorion, Sky Nomad' }))
    expect(screen.getByText('Remove Yorion, Sky Nomad from this deck?')).toBeTruthy()
    expect(f).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(f).not.toHaveBeenCalled()
    expect(screen.getByText('Companion · Yorion, Sky Nomad')).toBeTruthy()
  })

  it('confirming removal deletes the companion card', async () => {
    const f = mockFetch(() => Response.json({}))
    wrap(<CommandZoneSlots deckId={9} cards={[primary, companionRow]} commanderName="Atraxa" />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove companion Yorion, Sky Nomad' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(f).toHaveBeenCalledWith('/api/decks/9/cards/4', { method: 'DELETE' }))
  })
})
