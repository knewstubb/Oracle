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

  it('shows the count instantly when + is clicked, before any request returns', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderSection([island(1), island(2)])
    expect(screen.getByTestId('generic-count').textContent).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Add one generic Island' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add one generic Island' }))
    expect(screen.getByTestId('generic-count').textContent).toBe('4')
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
