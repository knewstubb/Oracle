import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImportRowEditor } from './ImportRowEditor'
import { ImportDefaultsBar } from './ImportDefaultsBar'
import { ImportValueNoticeLines } from './ImportNoticeLine'
import { ReviewCommanderSelect } from './ReviewCommanderSelect'
import { DeckImportOptions } from './DeckImportOptions'
import { resolveRowCopies } from '@/lib/import-copies'
import { INITIAL_DEFAULTS } from './types'
import type { UiPreviewRow } from './types'

vi.mock('./use-printing-languages', () => ({
  usePrintingLanguages: () => ({ status: 'done', languages: ['en'] }),
  clearPrintingLanguageCache: () => {},
}))

const FOIL_ONLY_ROW = {
  rowKey: 'f',
  sourceIndex: 2,
  sourceLines: [2],
  cardName: 'Foil Only Card',
  setCode: 'abc',
  collectorNumber: '1',
  scryfallId: 'f',
  oracleId: 'o-f',
  qty: 1,
  availableFinishes: ['foil'],
  copies: [{ index: 0, sourceLine: 2, file: {}, owner: {} }],
  isBasicLand: false,
} as unknown as UiPreviewRow

describe('finish fallback marker (replaces the banner)', () => {
  it('marks the row with the resulting finish and explains it', () => {
    const resolved = resolveRowCopies(FOIL_ONLY_ROW, INITIAL_DEFAULTS, {}, 'f')
    render(
      <ImportRowEditor
        row={FOIL_ONLY_ROW}
        resolved={resolved}
        kind="deck"
        defaults={INITIAL_DEFAULTS}
        open={false}
        selected={false}
        generic={false}
        onToggleOpen={() => {}}
        onToggleSelect={() => {}}
        onChangeCopy={() => {}}
        onApplyAll={() => {}}
      />
    )
    const mark = screen.getByLabelText('Default finish not available; using Foil')
    expect(mark).toHaveAttribute('title', 'Default finish not available; using Foil')
  })

  it('no longer shows the default-finish banner', () => {
    render(<ImportValueNoticeLines unrecognised={0} unlistedFinish={0} />)
    expect(screen.queryByText(/default finish/)).toBeNull()
  })
})

describe('Generic basics lives in the Importing as bar', () => {
  it('shows the switch with the basics count and reports changes', () => {
    const onChange = vi.fn()
    render(
      <ImportDefaultsBar
        defaults={INITIAL_DEFAULTS}
        onChange={() => {}}
        basics={{ qty: 36, generic: true, onChange }}
      />
    )
    const toggle = screen.getByRole('switch', { name: 'Generic basics' })
    expect(toggle).toBeChecked()
    expect(screen.getByText('36')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(onChange.mock.calls[0][0]).toBe(false)
  })

  it('the Name/Format row has no count line and no "commander picked next"', () => {
    render(
      <DeckImportOptions
        name="x"
        onNameChange={() => {}}
        format="commander"
        onFormatChange={() => {}}
        commanderSlot={<span>slot</span>}
      />
    )
    expect(screen.queryByText(/commander picked next/)).toBeNull()
    expect(screen.queryByText(/\d+\/100/)).toBeNull()
    expect(screen.getByText('slot')).toBeInTheDocument()
  })
})

describe('ReviewCommanderSelect', () => {
  const cards = [
    { name: 'Atraxa, Praetors\u2019 Voice', scryfallId: 'a' },
    { name: 'Sol Ring', scryfallId: 's' },
  ]
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ eligible: ['Atraxa, Praetors\u2019 Voice'] })))
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('starts as "No commander", lists only eligible cards and reports the pick', async () => {
    const onChange = vi.fn()
    render(<ReviewCommanderSelect cards={cards} value={null} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /Commander.*No commander/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Commander.*No commander/ }))
    const option = await screen.findByRole('option', { name: 'Atraxa, Praetors\u2019 Voice' })
    expect(screen.queryByRole('option', { name: 'Sol Ring' })).toBeNull()
    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith(cards[0])
  })

  it('offers a clear "No commander" choice', async () => {
    const onChange = vi.fn()
    render(<ReviewCommanderSelect cards={cards} value={cards[0]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Commander.*Atraxa/ }))
    await waitFor(() => expect(screen.getByRole('option', { name: 'No commander' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('option', { name: 'No commander' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('says so when nothing in the deck can be a commander', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ eligible: [] }))))
    render(<ReviewCommanderSelect cards={cards} value={null} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Commander.*No commander/ }))
    expect(await screen.findByText('No card in this deck can be a commander.')).toBeInTheDocument()
  })
})
