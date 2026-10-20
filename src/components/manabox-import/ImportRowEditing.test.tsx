import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ImportCardList } from './ImportCardList'
import { ImportDefaultsBar } from './ImportDefaultsBar'
import { INITIAL_DEFAULTS } from './types'
import type { UiPreviewRow, RowFilter } from './types'
import type { ImportCopyEdits, ImportDefaults } from '../../../docs/oracle/contracts/import-row-editing.types'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        start: i * estimateSize(),
        end: (i + 1) * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measure: () => {},
  }),
}))

function row(
  key: string,
  name: string,
  files: Array<Record<string, string>>,
  availableFinishes: UiPreviewRow['availableFinishes'] = ['nonfoil', 'foil']
): UiPreviewRow {
  return {
    rowKey: key,
    sourceIndex: 2,
    sourceLines: [2],
    cardName: name,
    setCode: 'mh3',
    collectorNumber: '46',
    scryfallId: key,
    oracleId: `o-${key}`,
    qty: files.length,
    availableFinishes,
    copies: files.map((file, index) => ({ index, sourceLine: 2, file, owner: {} })) as UiPreviewRow['copies'],
    isBasicLand: false,
  }
}

const ROWS = [
  row('sol', 'Sol Ring', [{ finish: 'nonfoil', condition: 'near_mint', language: 'en' }]),
  row('rd', 'Rehearsed Debater', [
    { finish: 'nonfoil', condition: 'near_mint', language: 'en' },
    { finish: 'foil', condition: 'lightly_played', language: 'en' },
    { finish: 'nonfoil', condition: 'near_mint', language: 'en' },
  ]),
]

const TEXT_ROWS = [row('txt', 'Drake', [{}, {}])]

function Harness({
  rows = ROWS,
  kind = 'collection',
  source = 'csv',
}: {
  rows?: UiPreviewRow[]
  kind?: 'collection' | 'deck'
  source?: 'csv' | 'text'
}) {
  const [defaults, setDefaults] = useState<ImportDefaults>(INITIAL_DEFAULTS)
  const [edits, setEdits] = useState<ImportCopyEdits>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<RowFilter>('all')
  const [query, setQuery] = useState('')
  return (
    <>
      <ImportDefaultsBar defaults={defaults} onChange={setDefaults} />
      <ImportCardList
        rows={rows}
        kind={kind}
        source={source}
        defaults={defaults}
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
    </>
  )
}

const openRow = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` }))

describe('file-value dot (test 18)', () => {
  it('shows only on values from the file, clears on edit, never on the defaults bar', () => {
    render(<Harness />)
    openRow('Sol Ring')
    const line = within(screen.getByRole('group', { name: 'Copy 1 of 1' }))
    expect(line.getByLabelText('Copy 1 language (from your file)')).toBeInTheDocument()
    expect(line.getAllByTestId('file-dot').length).toBe(3)

    fireEvent.change(line.getByLabelText('Copy 1 language (from your file)'), { target: { value: 'ja' } })
    const after = within(screen.getByRole('group', { name: 'Copy 1 of 1' }))
    expect(after.getByLabelText('Copy 1 language')).toBeInTheDocument()
    expect(after.getAllByTestId('file-dot').length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    const bar = screen.getByRole('group', { name: 'Import defaults' })
    expect(within(bar).queryByTestId('file-dot')).toBeNull()
  })

  it('text rows use the same editor and never show a dot (test 19)', () => {
    render(<Harness rows={TEXT_ROWS} kind="deck" source="text" />)
    openRow('Drake')
    expect(screen.queryAllByTestId('file-dot')).toHaveLength(0)
    expect(screen.getByRole('group', { name: 'Copy 2 of 2' })).toBeInTheDocument()
  })
})

describe('collapsed tags, Edit/Done and apply-to-all (test 19)', () => {
  it('shows no tags on a default row and counted tags on a mixed row', () => {
    render(<Harness />)
    const sol = document.querySelector('[data-row-key="sol"]') as HTMLElement
    expect(sol.querySelectorAll('[data-tag]')).toHaveLength(0)
    expect(within(sol).getByText('Uses defaults')).toBeInTheDocument()
    const rd = document.querySelector('[data-row-key="rd"]') as HTMLElement
    expect(rd.querySelector('[data-tag="finish"]')).toHaveTextContent('1 Foil')
    expect(rd.querySelector('[data-tag="condition"]')).toHaveTextContent('1 LP')
  })

  it('toggles Edit and Done with aria-expanded', () => {
    render(<Harness />)
    const edit = screen.getByRole('button', { name: 'Edit Sol Ring' })
    expect(edit).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(edit)
    const done = screen.getByRole('button', { name: 'Done editing Sol Ring' })
    expect(done).toHaveAttribute('aria-expanded', 'true')
    expect(done).toHaveTextContent('Done')
  })

  it('offers apply-to-all only on copy 1 with 2+ copies, and has no Duplicate or Remove', () => {
    render(<Harness />)
    openRow('Sol Ring')
    expect(screen.queryByRole('button', { name: 'Make all copies like copy 1' })).toBeNull()
    openRow('Rehearsed Debater')
    const buttons = screen.getAllByRole('button', { name: 'Make all copies like copy 1' })
    expect(buttons).toHaveLength(1)
    expect(
      within(screen.getByRole('group', { name: 'Copy 1 of 3' })).getByRole('button', {
        name: 'Make all copies like copy 1',
      })
    ).toBe(buttons[0])
    expect(screen.queryByRole('button', { name: /duplicate|remove/i })).toBeNull()
  })

  it('shows only Finish (no language, condition) on an Unsleeved line', () => {
    render(<Harness kind="deck" />)
    openRow('Sol Ring')
    const line = screen.getByRole('group', { name: 'Copy 1 of 1' })
    fireEvent.click(within(line).getByRole('button', { name: 'Unsleeved' }))
    const after = screen.getByRole('group', { name: 'Copy 1 of 1' })
    expect(within(after).getByLabelText(/Copy 1 finish/)).toBeInTheDocument()
    expect(within(after).queryByLabelText(/Copy 1 language/)).toBeNull()
    expect(within(after).queryByLabelText(/Copy 1 condition/)).toBeNull()
  })

  it('hides Finish when the printing has only one finish', () => {
    render(<Harness rows={[row('one', 'Foil Only', [{ finish: 'foil' }], ['foil'])]} />)
    openRow('Foil Only')
    expect(screen.queryByLabelText(/Copy 1 finish/)).toBeNull()
  })

  it('marks a file finish Scryfall does not list', () => {
    render(<Harness rows={[row('odd', 'Odd Card', [{ finish: 'foil' }], ['nonfoil', 'etched'])]} />)
    openRow('Odd Card')
    expect(screen.getAllByText(/not listed by Scryfall/).length).toBeGreaterThan(0)
  })
})

describe('language edit keeps the row in place (test 20)', () => {
  it('stays in the same position, selected and open', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Rehearsed Debater' }))
    openRow('Rehearsed Debater')
    const keys = () => Array.from(document.querySelectorAll('[data-row-key]')).map((el) => el.getAttribute('data-row-key'))
    const before = keys()

    fireEvent.change(screen.getAllByLabelText(/Copy 1 language/)[0], { target: { value: 'ja' } })

    expect(keys()).toEqual(before)
    expect(screen.getByRole('checkbox', { name: 'Select Rehearsed Debater' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Done editing Rehearsed Debater' })).toBeInTheDocument()
  })
})

describe('bulk bar', () => {
  it('shows Mixed and "Applies to N of M copies" when some copies cannot take the change', () => {
    render(<Harness />)
    openRow('Rehearsed Debater')
    fireEvent.click(within(screen.getByRole('group', { name: 'Copy 2 of 3' })).getByRole('button', { name: 'Proxy' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Rehearsed Debater' }))
    expect(screen.getByText('Mixed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Set finish \/ condition \/ language/ }))
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'heavily_played' } })
    expect(screen.getByText(/Applies to 2 of 3 copies in 1 row/)).toBeInTheDocument()
  })
})
