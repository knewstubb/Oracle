import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ImportDestinationPicker, buildOptions } from './ImportDestinationPicker'
import type { DestinationsResponse, ImportDestination } from '../../../docs/oracle/contracts/know-where-cards-are.types'

const DATA: DestinationsResponse = {
  unsorted: { locationId: 1 },
  storage: [
    { locationId: 5, name: 'Valuable binder', copyCount: 12 },
    { locationId: 3, name: 'Alphabetical box', copyCount: 1 },
  ],
  decks: [],
}

function setup(data: DestinationsResponse = DATA, value: ImportDestination = { kind: 'unsorted' }) {
  const onChange = vi.fn()
  const onRetry = vi.fn()
  const utils = render(
    <ImportDestinationPicker value={value} onChange={onChange} places={{ status: 'ready', data }} onRetry={onRetry} copyCount={40} />
  )
  return { onChange, onRetry, ...utils }
}

describe('ImportDestinationPicker', () => {
  it('defaults to Unsorted with the quiet default wording and note', () => {
    setup()
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveTextContent('Unsorted')
    expect(trigger).toHaveTextContent('default')
    expect(screen.getByRole('status')).toHaveTextContent('They land in Unsorted.')
  })

  it('lists Unsorted, then boxes and binders A to Z, never Missing or In your hand', () => {
    setup()
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toContain('Unsorted')
    expect(options[1]).toContain('Alphabetical box')
    expect(options[2]).toContain('Valuable binder')
    expect(screen.getByRole('group', { name: 'Boxes and binders' })).toBeInTheDocument()
    expect(screen.queryByText(/Missing/)).not.toBeInTheDocument()
    expect(screen.queryByText(/In your hand/)).not.toBeInTheDocument()
  })

  it('choosing a binder reports it; the chosen row is aria-selected', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: /Valuable binder/ }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'storage', locationId: 5 })
  })

  it('shows the binder note and the selected state', () => {
    setup(DATA, { kind: 'storage', locationId: 5 })
    expect(screen.getByRole('status')).toHaveTextContent('All 40 copies go straight into Valuable binder. Nothing is added to the Picklist.')
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: /Valuable binder/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows decks with an "N empty slots" hint when the list has them', () => {
    const options = buildOptions({
      ...DATA,
      decks: [
        { deckId: 2, name: 'Korvold', format: 'commander', emptySlots: 9, status: 'assembling' },
        { deckId: 3, name: 'Prosper', format: 'commander', emptySlots: 0, status: 'playable' },
      ],
    })
    expect(options.filter((o) => o.group === 'Decks').map((o) => o.hint)).toEqual([
      'Assembling · 9 empty slots',
      'Playable · no empty slots',
    ])
  })

  it('has no search with 8 or fewer places and a search with more', () => {
    setup()
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('search filters by name and explains an empty result', () => {
    const many: DestinationsResponse = {
      ...DATA,
      storage: Array.from({ length: 9 }, (_, i) => ({ locationId: i + 10, name: `Box ${i + 1}`, copyCount: i })),
    }
    setup(many)
    fireEvent.click(screen.getByRole('combobox'))
    const search = screen.getByRole('searchbox', { name: 'Search places' })
    fireEvent.change(search, { target: { value: 'box 7' } })
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText(/No place matches/)).toBeInTheDocument()
    expect(screen.getByText(/Missing and In your hand aren't places you can import into/)).toBeInTheDocument()
  })

  it('with no boxes or decks there is no picker, only the sentence', () => {
    setup({ unsorted: { locationId: 1 }, storage: [], decks: [] })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText(/no boxes, binders or decks yet/)).toBeInTheDocument()
  })

  it('loading disables the button; an error offers Try again and keeps Unsorted', () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <ImportDestinationPicker value={{ kind: 'unsorted' }} onChange={() => {}} places={{ status: 'loading' }} onRetry={onRetry} copyCount={3} />
    )
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('combobox')).toHaveTextContent('Loading your places…')
    rerender(
      <ImportDestinationPicker value={{ kind: 'unsorted' }} onChange={() => {}} places={{ status: 'error' }} onRetry={onRetry} copyCount={3} />
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your boxes, binders and decks.")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('Escape closes the list and returns focus to the button', () => {
    setup()
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
