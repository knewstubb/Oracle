import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddToPicklistProvider, AddAllBar, AddOneButton } from './AddToPicklist'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const cards = [{ copyId: 5, cardName: 'Sol Ring' }, { copyId: 6, cardName: 'Cultivate' }]
function mount(list: { status: number; json: unknown } = { status: 200, json: { created: [{}, {}], unchanged: [], skipped: [] } }) {
  const f = vi.fn((url: string) => {
    const u = String(url)
    if (u === '/api/import/destinations') return Promise.resolve(new Response(JSON.stringify({ storage: [{ locationId: 2, name: 'Box A' }], decks: [{ deckId: 3, name: 'Korvold' }] }), { status: 200 }))
    return Promise.resolve(new Response(JSON.stringify(list.json), { status: list.status }))
  })
  vi.stubGlobal('fetch', f)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AddToPicklistProvider>
        <AddAllBar cards={cards} />
        <AddOneButton card={cards[0]} />
      </AddToPicklistProvider>
    </QueryClientProvider>,
  )
  return f
}
const pick = async (v: string) => {
  await waitFor(() => expect(screen.getByRole('option', { name: 'Deck: Korvold' })).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Where these cards should go'), { target: { value: v } })
}

describe('Add to Picklist (Unsorted page)', () => {
  it('buttons stay off until a place is chosen', async () => {
    mount()
    await waitFor(() => expect(screen.getByRole('option', { name: 'Box: Box A' })).toBeTruthy())
    expect((screen.getByRole('button', { name: 'Add all 2 to the Picklist' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Add to Picklist: Sol Ring' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('Add all sends every copy id with the chosen deck', async () => {
    const f = mount()
    await pick('d3')
    fireEvent.click(screen.getByRole('button', { name: 'Add all 2 to the Picklist' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/moves/lists')).toBe(true))
    const body = JSON.parse(f.mock.calls.find((c) => c[0] === '/api/moves/lists')![1]!.body as string)
    expect(body.items).toEqual([
      { copyId: 5, cardName: 'Sol Ring', to: { kind: 'deck', deckId: 3 } },
      { copyId: 6, cardName: 'Cultivate', to: { kind: 'deck', deckId: 3 } },
    ])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 cards added to the Picklist for Korvold.'))
  })
  it('Add to Picklist on one row sends just that copy to the chosen box', async () => {
    const f = mount({ status: 200, json: { created: [{}], unchanged: [], skipped: [] } })
    await pick('l2')
    fireEvent.click(screen.getByRole('button', { name: 'Add to Picklist: Sol Ring' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/moves/lists')).toBe(true))
    expect(JSON.parse(f.mock.calls.find((c) => c[0] === '/api/moves/lists')![1]!.body as string).items).toEqual([{ copyId: 5, cardName: 'Sol Ring', to: { kind: 'location', locationId: 2 } }])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 card added to the Picklist for Box A.'))
  })
  it('names the cards that were left off and why', async () => {
    mount({ status: 200, json: { created: [{}], unchanged: [], skipped: [{ message: 'Cultivate is already on another step' }] } })
    await pick('d3')
    fireEvent.click(screen.getByRole('button', { name: 'Add all 2 to the Picklist' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 card added to the Picklist for Korvold. Left off: Cultivate is already on another step.'))
  })
  it('a refusal shows the plain message', async () => {
    mount({ status: 500, json: { error: 'failed', message: "Couldn't save that. Those cards are still where Oracle had it." } })
    await pick('d3')
    fireEvent.click(screen.getByRole('button', { name: 'Add all 2 to the Picklist' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Those cards are still where Oracle had it."))
  })
})
