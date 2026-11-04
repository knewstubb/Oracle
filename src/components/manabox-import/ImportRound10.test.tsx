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
  usePrintingLanguages: () => ({ status: 'done', languages: ['en', 'ja'] }),
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

describe('basic lands are editable (Round 11)', () => {
  const basic = {
    rowKey: 'b',
    sourceIndex: 3,
    sourceLines: [3],
    cardName: 'Swamp',
    setCode: 'abc',
    collectorNumber: '9',
    scryfallId: 'b',
    oracleId: 'o-b',
    qty: 2,
    availableFinishes: ['nonfoil', 'foil'],
    copies: [
      { index: 0, sourceLine: 3, file: {}, owner: {} },
      { index: 1, sourceLine: 3, file: {}, owner: {} },
    ],
    isBasicLand: true,
  } as unknown as UiPreviewRow

  function renderBasic(generic: boolean, onChangeCopy = vi.fn(), onChangeAllCopies = vi.fn()) {
    const resolved = resolveRowCopies(basic, INITIAL_DEFAULTS, {}, 'b')
    render(
      <ImportRowEditor
        row={basic}
        resolved={resolved}
        kind="deck"
        defaults={INITIAL_DEFAULTS}
        open
        selected={false}
        generic={generic}
        onToggleOpen={() => {}}
        onToggleSelect={() => {}}
        onChangeCopy={onChangeCopy}
        onChangeAllCopies={onChangeAllCopies}
        onApplyAll={() => {}}
      />
    )
    return { onChangeCopy, onChangeAllCopies }
  }

  it('Generic basic row: one line edits all copies (finish, Unsleeved) and shows Choose art', () => {
    const { onChangeAllCopies } = renderBasic(true)
    expect(screen.getByRole('button', { name: /Collapse Swamp/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Copy 2 finish')).toBeNull()
    fireEvent.change(screen.getByLabelText('Copy 1 finish'), { target: { value: 'foil' } })
    expect(onChangeAllCopies).toHaveBeenCalledWith([0, 1], { finish: 'foil' })
    fireEvent.click(screen.getByRole('button', { name: 'Unsleeved' }))
    expect(onChangeAllCopies).toHaveBeenCalledWith([0, 1], { type: 'unsleeved' })
    expect(screen.getByRole('button', { name: /art/i })).toBeInTheDocument()
  })

  it('Specific basic row (names a printing): full edits, same as any card, no Basic tag', () => {
    renderBasic(false)
    expect(screen.queryByText('Basic')).toBeNull()
    expect(screen.getByLabelText('Copy 1 language')).toBeInTheDocument()
    expect(screen.getByLabelText('Copy 1 finish')).toBeInTheDocument()
    expect(screen.getByLabelText('Copy 1 condition')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Copy 1 type' })).toBeInTheDocument()
  })
})

describe('finish fallback marker (replaces the banner)', () => {
  it('collapsed row shows no amber note; the finish chip already says Foil', () => {
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
    expect(
      screen.queryByLabelText('Default finish not available; using Foil')
    ).not.toBeInTheDocument()
  })

  it('no longer shows the default-finish banner', () => {
    render(<ImportValueNoticeLines unrecognised={0} unlistedFinish={0} />)
    expect(screen.queryByText(/default finish/)).toBeNull()
  })
})

describe('Ignore basic lands switch in the Importing as bar', () => {
  it('shows the switch (on) with only the basics count beside it', () => {
    const onChange = vi.fn()
    render(
      <ImportDefaultsBar
        defaults={INITIAL_DEFAULTS}
        onChange={() => {}}
        ignoreBasics={{ on: true, count: 12, onChange }}
      />
    )
    const sw = screen.getByRole('switch', { name: 'Ignore basic lands' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('12 basics')).toBeInTheDocument()
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('hides the count while off', () => {
    render(
      <ImportDefaultsBar
        defaults={INITIAL_DEFAULTS}
        onChange={() => {}}
        ignoreBasics={{ on: false, count: 12, onChange: () => {} }}
      />
    )
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText('12 basics')).toBeNull()
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
