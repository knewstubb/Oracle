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

/**
 * The commander's allowed second-slot kind and which cards have Companion are answered here (the deck-level check
 * is the first Companion request; later ones come from the picker); everything else goes to `impl`.
 */
function mockFetch(
  impl: (url: string, init?: RequestInit) => Response | Promise<Response>,
  kind: string | null = 'partner',
  companion: string[] = ['Lurrus of the Dream-Den'],
  failPickerCheck = false
) {
  let companionCalls = 0
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('role=second-kind')) return Response.json({ kind })
    if (url.includes('role=companion')) {
      companionCalls += 1
      if (failPickerCheck && companionCalls > 1) return new Response('{}', { status: 500 })
      const names: string[] = JSON.parse(String(init?.body)).names
      return Response.json({ eligible: names.filter((n) => companion.includes(n)) })
    }
    return impl(url, init)
  })
  vi.stubGlobal('fetch', f)
  return f
}

const isSave = (c: unknown[]) => String(c[0]).startsWith('/api/decks/')

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

  it('shows the companion slot when the deck has a Companion card, and no second slot until there is a commander', async () => {
    mockFetch(() => Response.json({}))
    wrap(<CommandZoneSlots deckId={9} cards={[lurrus]} commanderName={null} />)
    expect(await screen.findByText('No companion · Add')).toBeTruthy()
    expect(screen.queryByText('No partner or background · Add')).toBeNull()
  })

  it('shows no companion slot when no card in the deck has Companion', async () => {
    const f = mockFetch(() => Response.json({}), 'partner', [])
    wrap(<CommandZoneSlots deckId={9} cards={[primary, sol]} commanderName="Atraxa" />)
    expect(await screen.findByText('No partner · Add')).toBeTruthy()
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('role=companion'))).toBe(true))
    expect(screen.queryByText(/companion · Add/i)).toBeNull()
  })

  it('draws nothing when there is no slot to show', async () => {
    mockFetch(() => Response.json({}), null, [])
    const { container } = wrap(<CommandZoneSlots deckId={9} cards={[sol]} commanderName={null} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector('[data-testid="command-zone-slots"]')).toBeNull()
  })

  it('shows the companion by name, and a Partner slot only because the commander allows it', async () => {
    mockFetch(() => Response.json({}), 'partner')
    wrap(<CommandZoneSlots deckId={9} cards={[primary, companionRow]} commanderName="Atraxa" />)
    expect(screen.getByText('Companion · Yorion, Sky Nomad')).toBeTruthy()
    expect(await screen.findByText('No partner · Add')).toBeTruthy()
  })

  it.each([
    ['background', 'No background · Add'],
    ['partner_with', 'No partner with · Add'],
    ['friends_forever', 'No friends forever · Add'],
    ['doctors_companion', "No doctor's companion · Add"],
  ])('labels the second slot for what it is (%s)', async (kind, text) => {
    mockFetch(() => Response.json({}), kind)
    wrap(<CommandZoneSlots deckId={9} cards={[primary]} commanderName="Atraxa" />)
    expect(await screen.findByText(text)).toBeTruthy()
  })

  it('shows no second-commander slot when the commander allows none, but still the companion slot', async () => {
    const f = mockFetch(() => Response.json({}), null)
    wrap(<CommandZoneSlots deckId={9} cards={[primary, sol]} commanderName="Atraxa" />)
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(screen.queryByText(/No (partner|background)/)).toBeNull()
    expect(screen.queryByText(/companion · Add/i)).toBeNull()
  })

  it('shows a filled second commander even if detection says none', async () => {
    const partnerRow = card({ id: 5, card_name: 'Tymna', command_zone_role: 'partner', is_commander: true })
    mockFetch(() => Response.json({}), null)
    wrap(<CommandZoneSlots deckId={9} cards={[primary, partnerRow]} commanderName="Atraxa" />)
    expect(await screen.findByText('Tymna')).toBeTruthy()
  })

  it('shows the companion slot in a deck with no commander when a card has Companion', async () => {
    mockFetch(() => Response.json({}), null)
    wrap(<CommandZoneSlots deckId={9} cards={[lurrus, sol]} commanderName={null} />)
    expect(await screen.findByText('No companion · Add')).toBeTruthy()
  })

  it('picks a companion from the deck: PUT carries the primary id and the existing second commander', async () => {
    const f = mockFetch((url) =>
      url.includes('/api/commanders/eligible') ? Response.json({ eligible: ['Lurrus of the Dream-Den'] }) : Response.json({ deck_id: 9 })
    )
    wrap(<CommandZoneSlots deckId={9} cards={[primary, lurrus, sol]} commanderName="Atraxa" />)
    await userEvent.click(await screen.findByRole('button', { name: /No companion/ }))
    await userEvent.click(await screen.findByRole('option', { name: /Lurrus of the Dream-Den/ }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/decks/9/command-zone')).toBe(true))
    const put = f.mock.calls.find((c) => c[0] === '/api/decks/9/command-zone')!
    expect(put[1]?.method).toBe('PUT')
    expect(JSON.parse(String(put[1]?.body))).toEqual({ primaryCardId: 1, secondCardId: null, companionCardId: 2 })
  })

  it('does not list a Companion card whose move would drop a full deck below its size', async () => {
    mockFetch(() => Response.json({}))
    // Target 3, three main-list cards: moving Lurrus out would leave 2.
    wrap(<CommandZoneSlots deckId={9} cards={[primary, lurrus, sol]} commanderName="Atraxa" deckTarget={3} />)
    await userEvent.click(await screen.findByRole('button', { name: /No companion/ }))
    expect(await screen.findByText('No card in this deck has Companion')).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Lurrus/ })).toBeNull()
  })

  it('lists the Companion card when the deck has room (one over its size)', async () => {
    mockFetch(() => Response.json({}))
    wrap(<CommandZoneSlots deckId={9} cards={[primary, lurrus, sol]} commanderName="Atraxa" deckTarget={2} />)
    await userEvent.click(await screen.findByRole('button', { name: /No companion/ }))
    expect(await screen.findByRole('option', { name: /Lurrus/ })).toBeTruthy()
  })

  it('shows an error when the check fails', async () => {
    mockFetch(() => Response.json({}), 'partner', ['Lurrus of the Dream-Den'], true)
    wrap(<CommandZoneSlots deckId={9} cards={[primary, lurrus]} commanderName="Atraxa" />)
    await userEvent.click(await screen.findByRole('button', { name: /No companion/ }))
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
    await userEvent.click(await screen.findByRole('button', { name: /No partner/ }))
    await userEvent.click(await screen.findByRole('option', { name: /Lurrus/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Those two cannot be commanders together.'))
  })

  it('removing the companion asks first, and Keep does nothing', async () => {
    const f = mockFetch(() => Response.json({}))
    wrap(<CommandZoneSlots deckId={9} cards={[primary, companionRow]} commanderName="Atraxa" />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove companion Yorion, Sky Nomad' }))
    expect(screen.getByText('Remove Yorion, Sky Nomad from this deck?')).toBeTruthy()
    expect(f.mock.calls.some(isSave)).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(f.mock.calls.some(isSave)).toBe(false)
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
