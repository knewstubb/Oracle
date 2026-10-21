import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ImportCardList } from './ImportCardList'
import { ImportNotices, useHiddenNotes } from './ImportNoticeLine'
import { ImportSummary } from './ImportSummary'
import { INITIAL_DEFAULTS } from './types'
import type { UiPreviewRow, RowFilter } from './types'
import type { ImportCopyEdits } from '../../../docs/oracle/contracts/import-row-editing.types'

vi.mock('./use-printing-languages', () => ({
  usePrintingLanguages: () => ({ status: 'done', languages: ['en'] }),
  clearPrintingLanguageCache: () => {},
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * estimateSize(), end: (i + 1) * estimateSize(), size: estimateSize() })),
    getTotalSize: () => count * estimateSize(),
    measure: () => {},
  }),
}))

function row(key: string, name: string, sourceIndex: number, isBasicLand = false): UiPreviewRow {
  return {
    rowKey: key,
    sourceIndex,
    sourceLines: [sourceIndex],
    cardName: name,
    setCode: 'mh3',
    collectorNumber: String(sourceIndex),
    scryfallId: key,
    oracleId: `o-${key}`,
    qty: 1,
    availableFinishes: ['nonfoil'],
    copies: [{ index: 0, sourceLine: sourceIndex, file: { finish: 'nonfoil', condition: 'near_mint', language: 'en' }, owner: {} }] as UiPreviewRow['copies'],
    isBasicLand,
  }
}

const ROWS = [row('z', 'Zada', 2), row('f', 'Forest', 3, true), row('a', 'Arcane Signet', 4)]

function List() {
  const [edits, setEdits] = useState<ImportCopyEdits>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<RowFilter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  return (
    <ImportCardList
      rows={ROWS}
      kind="deck"
      source="csv"
      defaults={INITIAL_DEFAULTS}
      copyEdits={edits}
      onCopyEditsChange={setEdits}
      openRowKeys={open}
      onOpenRowKeysChange={setOpen}
      filter={filter}
      onFilterChange={setFilter}
      query={query}
      onQueryChange={setQuery}
      selectedIds={selected}
      onSelectedIdsChange={setSelected}
    />
  )
}

const names = () => Array.from(document.querySelectorAll('[data-row-key]')).map((n) => n.getAttribute('data-row-key'))

describe('Sort', () => {
  it('starts on Import order, offers Name A–Z, and keeps open rows and ticks with their card', () => {
    render(<List />)
    const sort = screen.getByLabelText('Sort') as HTMLSelectElement
    expect(sort.value).toBe('file')
    expect(names()).toEqual(['z', 'f', 'a'])

    fireEvent.click(screen.getByRole('button', { name: 'Edit Zada' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Zada' }))
    fireEvent.change(sort, { target: { value: 'name' } })
    // Basics sort in with the rest.
    expect(names()).toEqual(['a', 'f', 'z'])
    expect(screen.getByRole('button', { name: 'Collapse Zada' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Zada' })).toBeChecked()
  })

  it('does not change the chip counts', () => {
    render(<List />)
    const before = screen.getByRole('button', { name: /^All/ }).textContent
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'name' } })
    expect(screen.getByRole('button', { name: /^All/ }).textContent).toBe(before)
  })

  it('starts on Import order again for a new list', () => {
    const { unmount } = render(<List />)
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'name' } })
    unmount()
    render(<List />)
    expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('file')
  })
})

const line = (i: number) => ({ sourceIndex: i, rawLine: `bad ${i}`, reason: 'unreadable' }) as never

function Notes({ count }: { count: number }) {
  const notes = useHiddenNotes()
  const unmatched = Array.from({ length: count }, (_, i) => line(i + 1))
  return (
    <>
      <ImportNotices unmatched={unmatched} tokens={[]} source="text" hidden={notes.hidden} onDismiss={notes.hide} />
      <ImportSummary
        rows={ROWS}
        kind="deck"
        genericBasics={false}
        defaults={INITIAL_DEFAULTS}
        copyEdits={{}}
        unmatchedCount={count}
        hiddenCount={notes.hidden.size}
        onShowHidden={notes.restoreAll}
      />
    </>
  )
}

describe('Not matched notes', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('shows one box for a single line, with Copy and a dismiss button', () => {
    render(<Notes count={1} />)
    expect(screen.getByText('1 line not matched')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
  })

  it('collapses 2 or more into one line; View lists them, Copy all copies every line', () => {
    render(<Notes count={3} />)
    expect(screen.getByText('3 lines not matched')).toBeInTheDocument()
    expect(screen.queryByText('bad 2')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('bad 1\nbad 2\nbad 3')
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(within(screen.getByRole('list', { name: 'Lines not matched' })).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument()
  })

  it('dismiss hides the note, the footer keeps the count and brings it back', () => {
    render(<Notes count={3} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss not matched note' }))
    expect(screen.queryByText('3 lines not matched')).toBeNull()
    expect(screen.getByText(/3 not matched/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show hidden notes (1)' }))
    expect(screen.getByText('3 lines not matched')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show hidden notes/ })).toBeNull()
  })
})
