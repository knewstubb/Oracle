import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ImportWhereTheyWent } from './ImportWhereTheyWent'
import { toast } from 'sonner'
import type { ImportPlacementResult } from '../../../docs/oracle/contracts/know-where-cards-are.types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const base: ImportPlacementResult = { destination: { kind: 'unsorted', id: 1, name: 'Unsorted' }, total: 2, placedInStorage: 2 }

function mount(placement: ImportPlacementResult, listJson: unknown = { created: [{}, {}], unchanged: [], skipped: [] }) {
  let release: () => void = () => {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const f = vi.fn((url: string, _init?: RequestInit) => {
    if (String(url) === '/api/import/destinations') {
      return Promise.resolve(new Response(JSON.stringify({ storage: [{ locationId: 2, name: 'Box A' }], decks: [{ deckId: 3, name: 'Korvold' }] }), { status: 200 }))
    }
    return new Promise<Response>((res) => { release = () => res(new Response(JSON.stringify(listJson), { status: 200 })) })
  })
  vi.stubGlobal('fetch', f)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ImportWhereTheyWent placement={placement} />
    </QueryClientProvider>,
  )
  return { f, release: () => release() }
}

describe('Add all on the import result', () => {
  it('shows no button when nothing landed in Unsorted', () => {
    mount({ ...base, destination: { kind: 'storage', id: 2, name: 'Box A' }, unsortedCopyIds: [] })
    expect(screen.queryByRole('button', { name: /to the Picklist/ })).toBeNull()
  })

  it('offers only this import\'s copies, disabled until a place is chosen', async () => {
    mount({ ...base, unsortedCopyIds: [11, 12], unsortedCardNames: ['Sol Ring', 'Cultivate'] })
    const btn = screen.getByRole('button', { name: 'Add all 2 to the Picklist' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('sends exactly those ids and ignores a second click while saving', async () => {
    const { f, release } = mount({ ...base, unsortedCopyIds: [11, 12], unsortedCardNames: ['Sol Ring', 'Cultivate'] })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Deck: Korvold' })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Where these cards should go'), { target: { value: 'd3' } })
    const btn = screen.getByRole('button', { name: 'Add all 2 to the Picklist' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(f.mock.calls.filter((c) => c[0] === '/api/moves/lists')).toHaveLength(1))
    const posts = f.mock.calls.filter((c) => c[0] === '/api/moves/lists')
    expect(JSON.parse(posts[0][1]!.body as string).items.map((i: { copyId: number }) => i.copyId)).toEqual([11, 12])
    release()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })
})
