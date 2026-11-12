import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardGroupSection } from './CardGroupSection'
import { applyStatusPatch } from '@/lib/generic-status-patch'
import type { DeckCard } from './CardGrid'

vi.mock('@/components/GenericArtPicker', () => ({
  GenericArtPicker: ({ open }: { open: boolean }) => (open ? <div role="dialog">Art picker</div> : null),
}))

function island(id: number, extra: Partial<DeckCard> = {}): DeckCard {
  return {
    id,
    card_name: 'Island',
    quantity: 1,
    categories: '["Land"]',
    scryfall_id: 'aaaaaaaa-0000-0000-0000-000000000000',
    is_generic: true,
    generic_sleeved: true,
    ...extra,
  } as unknown as DeckCard
}

function renderSection(cards: DeckCard[]) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <CardGroupSection
        groupName="Land"
        groupCards={cards}
        statusMap={new Map()}
        lifecycleMap={new Map()}
        deckId={1}
        availableCategories={[]}
        physicalCopyMap={new Map()}
        onCategoryChange={() => {}}
      />
    </QueryClientProvider>
  )
}

describe('generic line on the deck page', () => {
  it('shows a visible Change art button that opens the picker', () => {
    renderSection([island(1), island(2)])
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Change art…' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('has no + / − buttons; the count is a plain number in the same column as other rows', () => {
    renderSection([island(1), island(2)])
    expect(screen.queryByRole('button', { name: /Add one generic/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove one generic/ })).toBeNull()
    expect(screen.queryByRole('img')).toBeNull() // no broken art thumbnail
    expect(screen.getByTestId('generic-count').className).toContain('w-4')
    expect(screen.getByTestId('generic-count').className).toContain('text-right')
  })

  it('click the count, type a number, Enter: shows it instantly and sends one request with that total', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderSection([island(1), island(2)])
    fireEvent.click(screen.getByTestId('generic-count'))
    const input = screen.getByTestId('generic-count-input') as HTMLInputElement
    expect(input.value).toBe('2')
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByTestId('generic-count-input')).toBeNull()
    expect(screen.getByTestId('generic-count').textContent).toBe('7')
    await new Promise((r) => setTimeout(r, 450))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/decks/1/generic-basics')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ cardName: 'Island', count: 7 })
    vi.unstubAllGlobals()
  })

  it('leaving the box (blur) saves too', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderSection([island(1), island(2)])
    fireEvent.click(screen.getByTestId('generic-count'))
    const input = screen.getByTestId('generic-count-input')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    expect(screen.getByTestId('generic-count').textContent).toBe('5')
    await new Promise((r) => setTimeout(r, 450))
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).count).toBe(5)
    vi.unstubAllGlobals()
  })

  it('Escape cancels: the number is unchanged and nothing is sent, even though blur follows', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderSection([island(1), island(2)])
    fireEvent.click(screen.getByTestId('generic-count'))
    const input = screen.getByTestId('generic-count-input')
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(screen.getByTestId('generic-count').textContent).toBe('2')
    await new Promise((r) => setTimeout(r, 450))
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('rejects text, negatives and decimals: keeps the old number, sends nothing', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderSection([island(1), island(2)])
    for (const bad of ['abc', '-1', '2.5', '']) {
      fireEvent.click(screen.getByTestId('generic-count'))
      const input = screen.getByTestId('generic-count-input')
      fireEvent.change(input, { target: { value: bad } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(screen.getByTestId('generic-count').textContent).toBe('2')
    }
    await new Promise((r) => setTimeout(r, 450))
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('0 is allowed (removes the line)', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderSection([island(1), island(2)])
    fireEvent.click(screen.getByTestId('generic-count'))
    fireEvent.change(screen.getByTestId('generic-count-input'), { target: { value: '0' } })
    fireEvent.keyDown(screen.getByTestId('generic-count-input'), { key: 'Enter' })
    expect(screen.getByTestId('generic-count').textContent).toBe('0')
    await new Promise((r) => setTimeout(r, 450))
    vi.unstubAllGlobals()
  })

  it('shows Unsleeved when any row of the line is unsleeved', () => {
    renderSection([island(1), island(2, { generic_sleeved: false })])
    expect(screen.getByRole('button', { name: /generics are unsleeved/ })).toBeInTheDocument()
  })
})

describe('instant status patch', () => {
  const base = { counts: { size: 100, generic_land: 10, generic_unsleeved: 0, sleeved: 100, planned: 0, unsleevedGenericNames: [] as string[] } }
  it('unsleeving moves the line out of sleeved and names the basic', () => {
    const out = applyStatusPatch(base, { unsleeveFlip: 'unsleeve', amount: 10, name: 'Island' })!
    expect(out.counts.generic_unsleeved).toBe(10)
    expect(out.counts.sleeved).toBe(90)
    expect(out.counts.unsleevedGenericNames).toEqual(['Island'])
  })
  it('adding a sleeved generic raises size and sleeved', () => {
    const out = applyStatusPatch(base, { size: 1, generic: 1, sleeved: true })!
    expect(out.counts.size).toBe(101)
    expect(out.counts.sleeved).toBe(101)
  })
})
