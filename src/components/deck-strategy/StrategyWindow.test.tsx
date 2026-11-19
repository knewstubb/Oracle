import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrategyWindow, type StrategyWindowProps } from './StrategyWindow'
import type { StrategyWindowData } from '@/lib/deck-strategy-window'
import { AUTOSAVE_PAUSE_MS } from '@/hooks/useAutosave'

const EMPTY: StrategyWindowData = { configured: false, bracket: null, summary: '', strategy: '', playgroup: '', updatedBy: null, updatedAt: null, canStoreNewFields: true, implied: null }
const SET: StrategyWindowData = { ...EMPTY, configured: true, bracket: 4, summary: 'Plants and recursion', strategy: 'Eat the graveyard.', playgroup: 'Friday pod', updatedBy: 'owner', updatedAt: '2026-11-19T10:00:00Z' }

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

const pause = (ms = AUTOSAVE_PAUSE_MS) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

function tree(props: StrategyWindowProps) {
  return (
    <>
      <button type="button">Behind the window</button>
      <StrategyWindow {...props} />
    </>
  )
}
async function setup(over: Partial<StrategyWindowProps> = {}) {
  const props: StrategyWindowProps = {
    open: true,
    deckName: 'Yedora, the Explorer',
    data: EMPTY,
    online: true,
    onClose: vi.fn(),
    onSave: vi.fn(async () => ({ ok: true as const })),
    onSeeHistory: vi.fn(),
    ...over,
  }
  const view = render(tree(props))
  // The window moves focus in on open (a moment after it renders); wait for it so typing is not interrupted.
  await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true))
  const rerenderWith = (next: Partial<StrategyWindowProps>) => view.rerender(tree({ ...props, ...next }))
  return { props, user: userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) }), rerenderWith, ...view }
}
const dialog = () => screen.getByRole('dialog')
describe('Strategy window: dialog basics', () => {
  it('is a labelled dialog with the deck name and the five brackets, number first', async () => {
    await setup()
    expect(screen.getByRole('dialog', { name: 'Strategy' })).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('Yedora, the Explorer. Claude reads this when it advises you.')
    const radios = within(screen.getByRole('radiogroup', { name: 'Target bracket' })).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['1Exhibition', '2Core', '3Upgraded', '4Optimized', '5cEDH'])
  })
  it('focus starts on the first bracket when none is chosen, and on the chosen one when there is one', async () => {
    const a = await setup()
    await waitFor(() => expect(screen.getByRole('radio', { name: /1Exhibition/ })).toHaveFocus())
    a.unmount()
    await setup({ data: SET })
    await waitFor(() => expect(screen.getByRole('radio', { name: /4Optimized/ })).toHaveFocus())
  })
  it('is modal: the page behind is hidden, and Tab walks every control then reaches the trap edge, not the page', async () => {
    // jsdom has no layout, so the trap's wrap-around itself is checked in a browser (see the report); here we check
    // the parts jsdom can see: modal flag, page behind hidden, and Tab order inside the window.
    const { user } = await setup({ data: SET })
    expect(dialog()).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Behind the window').closest('[aria-hidden="true"]')).not.toBeNull()
    const seen: string[] = []
    for (let i = 0; i < 7; i++) {
      expect(dialog().contains(document.activeElement)).toBe(true)
      seen.push((document.activeElement as HTMLElement).getAttribute('aria-label') ?? document.activeElement!.textContent ?? '')
      await user.tab()
    }
    expect(seen).toEqual(['4Optimized', 'Clear target', '', 'Eat the graveyard.', '', 'See in History', 'Close'])
    // Past the last control, focus is at the trap edge (a guard) or has wrapped to the window's first control (the top Close).
    expect(document.activeElement?.hasAttribute('data-base-ui-focus-guard') || dialog().contains(document.activeElement)).toBe(true)
    expect(screen.getByText('Behind the window')).not.toHaveFocus()
  })
  it('arrow keys move and select the bracket', async () => {
    const { user } = await setup({ data: SET })
    await waitFor(() => expect(screen.getByRole('radio', { name: /4Optimized/ })).toHaveFocus())
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: /5cEDH/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /5cEDH/ })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: /1Exhibition/ })).toBeChecked()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: /5cEDH/ })).toBeChecked()
  })
  it('Clear target returns to Not set and saves at once', async () => {
    const { user, props } = await setup({ data: SET })
    await user.click(screen.getByRole('button', { name: 'Clear target' }))
    for (const r of screen.getAllByRole('radio')) expect(r).not.toBeChecked()
    expect(props.onSave).toHaveBeenCalledWith({ bracket: null })
  })
  it('every button is at least 44px tall by class (min-h-11 = 44px) and has a visible focus ring', async () => {
    await setup({ data: SET })
    for (const b of within(dialog()).getAllByRole('button')) {
      expect(b.className, b.textContent ?? b.getAttribute('aria-label') ?? '').toMatch(/min-h-(11|14)/)
      expect(b.className).toMatch(/focus-visible:outline-white/)
    }
  })
})
describe('Strategy window: empty', () => {
  it('has no target, empty fields, no warning, and says nothing is saved yet with no History link', async () => {
    await setup()
    for (const r of screen.getAllByRole('radio')) expect(r).not.toBeChecked()
    expect(screen.getByLabelText('One-line summary')).toHaveValue('')
    expect(screen.getByLabelText('Strategy', { selector: 'textarea' })).toHaveValue('')
    expect(screen.getByLabelText('Playgroup (optional)')).toHaveValue('')
    expect(screen.getByTestId('bracket-warning-region')).toBeEmptyDOMElement()
    expect(screen.getByTestId('strategy-footer')).toHaveTextContent('Not saved yet. Nothing in History.')
    expect(screen.queryByRole('button', { name: 'See in History' })).toBeNull()
  })
})
describe('Strategy window: set', () => {
  it('shows the saved values and "Last changed by you · 19 Nov · See in History"', async () => {
    await setup({ data: SET })
    expect(screen.getByRole('radio', { name: /4Optimized/ })).toBeChecked()
    expect(screen.getByLabelText('One-line summary')).toHaveValue('Plants and recursion')
    expect(screen.getByLabelText('Strategy', { selector: 'textarea' })).toHaveValue('Eat the graveyard.')
    expect(screen.getByLabelText('Playgroup (optional)')).toHaveValue('Friday pod')
    expect(screen.getByTestId('strategy-footer')).toHaveTextContent('Last changed by you · 19 Nov ·')
    expect(screen.getByRole('button', { name: 'See in History' })).toBeInTheDocument()
  })
  it('says by Claude when Claude changed it last, and gives only the date when the database cannot say who', async () => {
    const a = await setup({ data: { ...SET, updatedBy: 'claude' } })
    expect(screen.getByTestId('strategy-footer')).toHaveTextContent('Last changed by Claude · 19 Nov')
    a.unmount()
    await setup({ data: { ...SET, updatedBy: null } })
    expect(screen.getByTestId('strategy-footer')).toHaveTextContent('Last changed · 19 Nov')
  })
  it('See in History closes the window and opens History', async () => {
    const { user, props } = await setup({ data: SET })
    await user.click(screen.getByRole('button', { name: 'See in History' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onSeeHistory).toHaveBeenCalledTimes(1)
  })
  it('has no Save, Cancel or discard prompt anywhere', async () => {
    const { user } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
    expect(dialog().textContent).not.toMatch(/discard your changes|Refresh replaces/i)
  })
})
describe('Strategy window: bracket exceeded', () => {
  const implied = { minimumBracket: 4, basedOn: '4 Game Changers' }
  it('shows the warning with an icon-and-words sentence and what it is based on, live as the picker changes', async () => {
    const { user } = await setup({ data: { ...SET, bracket: 3, implied } })
    const region = screen.getByTestId('bracket-warning-region')
    expect(region).toHaveAttribute('role', 'status')
    expect(region).toHaveTextContent('Cards in this deck imply at least Bracket 4. Your target is Bracket 3.')
    expect(region).toHaveTextContent('Based on: 4 Game Changers.')
    expect(region.querySelector('svg')).not.toBeNull()
    await user.click(screen.getByRole('radio', { name: /4Optimized/ }))
    expect(region).toBeEmptyDOMElement()
    await user.click(screen.getByRole('radio', { name: /2Core/ }))
    expect(region).toHaveTextContent('Your target is Bracket 2.')
  })
  it('saving is allowed with the warning showing, and nothing about the window says anything is restricted', async () => {
    const { user, props } = await setup({ data: { ...SET, bracket: 3, implied } })
    await user.click(screen.getByRole('radio', { name: /2Core/ }))
    expect(props.onSave).toHaveBeenCalledWith({ bracket: 2 })
    expect(dialog().textContent).not.toMatch(/restrict|only suggest|recommended for your bracket|filtered/i)
  })
  it('no warning when no target is set, and none when nothing is counted yet', async () => {
    const a = await setup({ data: { ...SET, bracket: null, implied } })
    expect(screen.getByTestId('bracket-warning-region')).toBeEmptyDOMElement()
    a.unmount()
    await setup({ data: { ...SET, bracket: 3, implied: null } })
    expect(screen.getByTestId('bracket-warning-region')).toBeEmptyDOMElement()
  })
})
describe('Strategy window: loading', () => {
  it('shows placeholders, is marked busy, and shows no save line yet', async () => {
    await setup({ data: undefined })
    expect(dialog()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('strategy-window-loading')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByTestId('save-status')).toBeNull()
  })
  it('takes the saved values once they arrive', async () => {
    const view = await setup({ data: undefined })
    view.rerender(
      <>
        <button type="button">Behind the window</button>
        <StrategyWindow {...view.props} data={SET} />
      </>,
    )
    expect(screen.getByLabelText('One-line summary')).toHaveValue('Plants and recursion')
    expect(screen.queryByTestId('updated-by-claude')).toBeNull()
  })
})
describe('Strategy window: autosave', () => {
  it('saves a moment after typing stops, sends only that field, and says Saved', async () => {
    const { user, props } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    expect(props.onSave).not.toHaveBeenCalled()
    await pause()
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledWith({ playgroup: 'Friday pod!' })
    expect(screen.getByTestId('save-status')).toHaveTextContent(/Saved at/)
    expect(props.onClose).not.toHaveBeenCalled()
  })
  it('leaving a field saves at once', async () => {
    const { user, props } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    await user.tab()
    expect(props.onSave).toHaveBeenCalledWith({ playgroup: 'Friday pod!' })
  })
  it('the bracket saves the moment it is picked, alone', async () => {
    const { user, props } = await setup({ data: SET })
    await user.click(screen.getByRole('radio', { name: /3Upgraded/ }))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledWith({ bracket: 3 })
  })
  it('shows Saving… while a save is out', async () => {
    let finish: (r: { ok: true }) => void = () => {}
    const onSave = vi.fn(() => new Promise<{ ok: true }>((res) => (finish = res)))
    const { user } = await setup({ data: SET, onSave })
    await user.click(screen.getByRole('radio', { name: /3Upgraded/ }))
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saving…')
    await act(async () => finish({ ok: true }))
    expect(screen.getByTestId('save-status')).toHaveTextContent(/Saved at/)
  })
  it('a failed save keeps the text, says so, shows the reason, and Try again saves it', async () => {
    let failing = true
    const onSave = vi.fn(async () => (failing ? { ok: false as const, error: "Couldn't save. Your changes are still here and nothing was lost." } : { ok: true as const }))
    const { user, props } = await setup({ data: EMPTY, onSave })
    fireEvent.change(screen.getByLabelText('One-line summary'), { target: { value: 'My words' } })
    await pause()
    expect(screen.getByTestId('save-status')).toHaveTextContent("Couldn't save. Your text is still here.")
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Your changes are still here and nothing was lost.")
    expect(screen.getByLabelText('One-line summary')).toHaveValue('My words')
    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onSave).toHaveBeenLastCalledWith({ summary: 'My words' })
    await waitFor(() => expect(screen.getByTestId('save-status')).toHaveTextContent(/Saved at/))
    expect(props.onClose).not.toHaveBeenCalled()
  })
  it('a save that throws is shown the same way', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network'))
    const { user } = await setup({ onSave })
    await user.type(screen.getByLabelText('Playgroup (optional)'), 'x')
    await pause()
    expect(screen.getByTestId('save-status')).toHaveTextContent("Couldn't save.")
  })
})

describe('Strategy window: offline', () => {
  it('says so, lets the owner keep typing, sends nothing, and saves when back online', async () => {
    const { user, props, rerenderWith } = await setup({ data: SET, online: false })
    expect(dialog()).toHaveTextContent("You're offline. You can keep typing. Your changes will save when you're back online. Your text stays in this window.")
    expect(dialog()).toHaveTextContent("The card check can't update while you're offline.")
    await user.type(screen.getByLabelText('Playgroup (optional)'), ' and more')
    expect(screen.getByLabelText('Playgroup (optional)')).toHaveValue('Friday pod and more')
    await pause(AUTOSAVE_PAUSE_MS * 2)
    expect(props.onSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('save-status')).toHaveTextContent("Offline. Will save when you're back")
    rerenderWith({ online: true })
    await pause(0)
    expect(props.onSave).toHaveBeenCalledWith({ playgroup: 'Friday pod and more' })
  })
})

describe('Strategy window: stored data not updated yet', () => {
  it('says up front that the summary cannot be saved yet and that the rest can', async () => {
    await setup({ data: { ...EMPTY, canStoreNewFields: false } })
    expect(screen.getByTestId('summary-not-yet')).toHaveTextContent("The summary can't be saved yet.")
    expect(screen.getByTestId('summary-not-yet')).toHaveTextContent('Everything else in this window saves normally.')
  })
  it('after a save where only the summary was left out, the window stays open, says so, and keeps the text', async () => {
    const onSave = vi.fn(async () => ({ ok: true as const, notSaved: ['summary'] }))
    const { user, props } = await setup({ data: { ...EMPTY, canStoreNewFields: false }, onSave })
    await user.type(screen.getByLabelText('One-line summary'), 'Hello')
    await pause()
    expect(dialog()).toHaveTextContent("The one-line summary was not: Oracle can't store it yet.")
    expect(screen.getByLabelText('One-line summary')).toHaveValue('Hello')
    expect(props.onClose).not.toHaveBeenCalled()
  })
  it('hides nothing when the database can store it', async () => {
    await setup()
    expect(screen.queryByTestId('summary-not-yet')).toBeNull()
  })
})

describe('Strategy window: summary counter and limits', () => {
  it('counts as text, and reads "limit reached" at 120', async () => {
    const { user } = await setup()
    const field = screen.getByLabelText('One-line summary')
    expect(screen.getByTestId('summary-counter')).toHaveTextContent('0 / 120')
    await user.type(field, 'x'.repeat(73))
    expect(screen.getByTestId('summary-counter')).toHaveTextContent('73 / 120')
    await user.type(field, 'y'.repeat(60))
    expect(field).toHaveValue('x'.repeat(73) + 'y'.repeat(47))
    expect(screen.getByTestId('summary-counter')).toHaveTextContent('120 / 120 · limit reached')
  })
})

describe('Strategy window: closing', () => {
  it('Escape and Close close at once when nothing was changed, and save nothing', async () => {
    const { user, props } = await setup({ data: SET })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1))
    await user.click(screen.getAllByRole('button', { name: 'Close' })[1])
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(2))
    expect(props.onSave).not.toHaveBeenCalled()
  })
  it('closing in the middle of typing saves first, then closes (both Close buttons and Escape)', async () => {
    for (const how of ['top', 'bottom', 'escape'] as const) {
      const { user, props, unmount } = await setup({ data: SET })
      await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
      if (how === 'escape') await user.keyboard('{Escape}')
      else await user.click(screen.getAllByRole('button', { name: 'Close' })[how === 'top' ? 0 : 1])
      await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1))
      expect(props.onSave).toHaveBeenCalledWith({ playgroup: 'Friday pod!' })
      unmount()
    }
  })
  it('when it cannot save, asks "This didn\'t save." with focus on Keep editing; Keep editing keeps the text', async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, error: 'down' }))
    const { user, props } = await setup({ data: SET, onSave })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    await user.keyboard('{Escape}')
    const ask = await screen.findByRole('alertdialog', { name: "This didn't save." })
    expect(ask).toHaveTextContent("This didn't save.")
    expect(props.onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByLabelText('Playgroup (optional)')).toHaveValue('Friday pod!')
    expect(props.onClose).not.toHaveBeenCalled()
  })
  it('Close anyway closes and drops what could not be saved', async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, error: 'down' }))
    const { user, props } = await setup({ data: SET, onSave })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    await user.click(screen.getAllByRole('button', { name: 'Close' })[1])
    await user.click(await screen.findByRole('button', { name: 'Close anyway' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Playgroup (optional)')).toHaveValue('Friday pod')
  })
  it('See in History saves first, then closes and opens History', async () => {
    const { user, props } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    await user.click(screen.getByRole('button', { name: 'See in History' }))
    await waitFor(() => expect(props.onSeeHistory).toHaveBeenCalledTimes(1))
    expect(props.onSave).toHaveBeenCalledWith({ playgroup: 'Friday pod!' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
  it('See in History with nothing changed just closes and opens History', async () => {
    const { user, props } = await setup({ data: SET })
    await user.click(screen.getByRole('button', { name: 'See in History' }))
    await waitFor(() => expect(props.onSeeHistory).toHaveBeenCalledTimes(1))
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onSave).not.toHaveBeenCalled()
  })
  it('clicking the dimmed background does nothing', async () => {
    const { user, props } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement
    await user.click(overlay)
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('Strategy window: Claude changed the deck while it is open (live refresh)', () => {
  const CLAUDE: StrategyWindowData = { ...SET, summary: 'Claude wrote this', strategy: 'Claude rewrote the plan.', updatedBy: 'claude', updatedAt: '2026-11-19T11:00:00Z' }
  it('marks itself as safe to refresh behind', async () => {
    await setup({ data: SET })
    expect(dialog()).toHaveAttribute('data-live-refresh', 'allow')
  })
  it('fields nobody touched take Claude\'s values and say "Updated by Claude"; no Refresh button', async () => {
    const { rerenderWith } = await setup({ data: SET })
    rerenderWith({ data: CLAUDE })
    expect(screen.getByLabelText('One-line summary')).toHaveValue('Claude wrote this')
    expect(screen.getByLabelText('Strategy', { selector: 'textarea' })).toHaveValue('Claude rewrote the plan.')
    expect(screen.getAllByTestId('updated-by-claude')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
    expect(screen.queryByTestId('strategy-claude-rewrote')).toBeNull()
  })
  it('the "Updated by Claude" note goes away at the next edit of that field', async () => {
    const { rerenderWith, user } = await setup({ data: SET })
    rerenderWith({ data: CLAUDE })
    await user.type(screen.getByLabelText('One-line summary'), '!')
    expect(screen.getAllByTestId('updated-by-claude')).toHaveLength(1)
  })
  it('a refresh never replaces a field that is waiting to save', async () => {
    const { rerenderWith, user } = await setup({ data: SET })
    await user.type(screen.getByLabelText('One-line summary'), '!')
    rerenderWith({ data: CLAUDE })
    expect(screen.getByLabelText('One-line summary')).toHaveValue('Plants and recursion!')
  })
  it('the window\'s own save coming back changes nothing the owner typed since', async () => {
    const { rerenderWith, user } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    await pause()
    await user.type(screen.getByLabelText('Playgroup (optional)'), '?')
    rerenderWith({ data: { ...SET, playgroup: 'Friday pod!', updatedBy: 'owner' } })
    expect(screen.getByLabelText('Playgroup (optional)')).toHaveValue('Friday pod!?')
    expect(screen.queryByTestId('strategy-claude-rewrote')).toBeNull()
    expect(screen.queryByTestId('updated-by-claude')).toBeNull()
  })
  it('Claude rewrote the Strategy while the owner has typing waiting: both are kept and the owner chooses', async () => {
    const { rerenderWith, user } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Strategy', { selector: 'textarea' }), ' More.')
    rerenderWith({ data: CLAUDE })
    const note = screen.getByTestId('strategy-claude-rewrote')
    expect(note).toHaveAttribute('role', 'status')
    expect(note).toHaveTextContent('Claude rewrote this')
    expect(screen.getByTestId('claude-version')).toHaveTextContent('Claude rewrote the plan.')
    expect(screen.getByLabelText('Strategy', { selector: 'textarea' })).toHaveValue('Eat the graveyard. More.')
    for (const name of ["Use Claude's", 'Keep mine']) expect(within(note).getByRole('button', { name }).className).toMatch(/min-h-11/)
  })
  it('Use Claude\'s replaces the text and drops the typing, which is not saved afterwards', async () => {
    const { rerenderWith, user, props } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Strategy', { selector: 'textarea' }), ' More.')
    rerenderWith({ data: CLAUDE })
    await user.click(screen.getByRole('button', { name: "Use Claude's" }))
    expect(screen.getByLabelText('Strategy', { selector: 'textarea' })).toHaveValue('Claude rewrote the plan.')
    expect(screen.queryByTestId('strategy-claude-rewrote')).toBeNull()
    await pause(AUTOSAVE_PAUSE_MS * 2)
    expect(props.onSave).not.toHaveBeenCalled()
  })
  it('Keep mine keeps the typing and its save is a normal save of only that field', async () => {
    const { rerenderWith, user, props } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Strategy', { selector: 'textarea' }), ' More.')
    rerenderWith({ data: CLAUDE })
    await user.click(screen.getByRole('button', { name: 'Keep mine' }))
    expect(screen.queryByTestId('strategy-claude-rewrote')).toBeNull()
    expect(screen.getByLabelText('Strategy', { selector: 'textarea' })).toHaveValue('Eat the graveyard. More.')
    await pause(0)
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledWith({ strategy: 'Eat the graveyard. More.' })
  })
})
