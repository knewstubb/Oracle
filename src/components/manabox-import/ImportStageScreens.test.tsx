import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ManaBoxFilePicker } from './ManaBoxFilePicker'
import { ImportWorking } from './ImportWorking'
import { ImportResult } from './ImportResult'

const result = {
  kind: 'collection' as const,
  name: '',
  inserted: 10,
  skipped: 0,
  basics: 0,
  proxies: 0,
  unsleeved: 0,
  unmatched: [],
}

describe('upload stage', () => {
  const setup = (props = {}) => {
    const onFile = vi.fn()
    const onError = vi.fn()
    render(
      <ManaBoxFilePicker accept=".csv" extensions={['csv']} label="ManaBox .csv" kind="collection" showHelp onFile={onFile} onError={onError} {...props} />
    )
    return { onFile, onError }
  }

  it('shows the drop zone and both help cards', () => {
    setup()
    expect(screen.getByText('Drop your ManaBox file here')).toBeInTheDocument()
    expect(screen.getByText('Export from ManaBox')).toBeInTheDocument()
    expect(screen.getByText('What happens next')).toBeInTheDocument()
  })

  it('shows the drag-over state', () => {
    setup()
    const zone = screen.getByRole('region', { name: 'File drop zone' })
    fireEvent.dragOver(zone)
    expect(zone).toHaveAttribute('data-drag-over', 'true')
    expect(screen.getByText('Drop to import')).toBeInTheDocument()
  })

  it('rejects a wrong file type and an empty file', () => {
    const { onFile, onError } = setup()
    const input = screen.getByLabelText('Choose file')
    fireEvent.change(input, { target: { files: [new File(['x'], 'deck.pdf')] } })
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/isn't a ManaBox/))
    fireEvent.change(input, { target: { files: [new File([''], 'empty.csv')] } })
    expect(onError).toHaveBeenLastCalledWith(expect.stringMatching(/no cards/))
    expect(onFile).not.toHaveBeenCalled()
  })

  it('passes a good file through and shows an error banner', () => {
    const { onFile } = setup({ error: 'Oops' })
    expect(screen.getByRole('alert')).toHaveTextContent('Oops')
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [new File(['a'], 'ok.csv')] } })
    expect(onFile).toHaveBeenCalled()
  })
})

describe('working stages', () => {
  it('shows processing text with the file name', () => {
    render(<ImportWorking title="Reading your file…" detail="Matching 71 cards to Scryfall." fileName="my.csv" />)
    expect(screen.getByText('Reading your file…')).toBeInTheDocument()
    expect(screen.getByText(/Matching 71 cards/)).toBeInTheDocument()
    expect(screen.getByText('my.csv')).toBeInTheDocument()
  })

  it('shows progress units and a visible Cancel import', () => {
    const onCancel = vi.fn()
    render(<ImportWorking title="Adding to your collection…" processed={87} total={148} unit="copies" onCancel={onCancel} />)
    expect(screen.getByText(/87 of 148 copies/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('result screen', () => {
  it('shows a clean result with All originals and no Needs a look', () => {
    render(<ImportResult {...result} onViewCollection={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText('10 copies added')).toBeInTheDocument()
    expect(screen.getByText('All originals.')).toBeInTheDocument()
    expect(screen.queryByText('Needs a look')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View collection' })).toHaveFocus()
  })

  it('shows breakdown, notices and expandable unmatched lines', () => {
    const unmatched = [1, 2, 3, 4].map((i) => ({ sourceIndex: i, rawLine: `line ${i}`, reason: 'no_card' as const }))
    render(
      <ImportResult {...result} proxies={2} foils={3} unrecognisedValues={1} unlistedFinish={2} unmatched={unmatched} />
    )
    expect(screen.getByText('Proxies')).toBeInTheDocument()
    expect(screen.getByText('Foil')).toBeInTheDocument()
    expect(screen.getByText('Needs a look')).toBeInTheDocument()
    expect(screen.getByText(/4 cards couldn't be matched/)).toBeInTheDocument()
    expect(screen.queryByText('line 4')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all 4' }))
    expect(screen.getByText('line 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy unmatched lines' })).toBeInTheDocument()
  })
})
