import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrategyWindow, type StrategyWindowProps } from './StrategyWindow'
import type { StrategyWindowData } from '@/lib/deck-strategy-window'
const EMPTY: StrategyWindowData = { configured: false, bracket: null, summary: '', strategy: '', playgroup: '', updatedBy: null, updatedAt: null, canStoreNewFields: true, implied: null }
const SET: StrategyWindowData = { ...EMPTY, configured: true, bracket: 4, summary: 'Plants and recursion', strategy: 'Eat the graveyard.', playgroup: 'Friday pod', updatedBy: 'owner', updatedAt: '2026-11-19T10:00:00Z' }
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
  const view = render(
    <>
      <button type="button">Behind the window</button>
      <StrategyWindow {...props} />
    </>,
  )
  // The window moves focus in on open (a moment after it renders); wait for it so typing is not interrupted.
  await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true))
  return { props, user: userEvent.setup(), ...view }
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
    for (let i = 0; i < 8; i++) {
      expect(dialog().contains(document.activeElement)).toBe(true)
      seen.push((document.activeElement as HTMLElement).getAttribute('aria-label') ?? document.activeElement!.textContent ?? '')
      await user.tab()
    }
    expect(seen).toEqual(['4Optimized', 'Clear target', '', 'Eat the graveyard.', '', 'See in History', 'Cancel', 'Save'])
    expect(document.activeElement).toHaveAttribute('data-base-ui-focus-guard')
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
  it('Clear target returns to Not set', async () => {
    const { user } = await setup({ data: SET })
    await user.click(screen.getByRole('button', { name: 'Clear target' }))
    for (const r of screen.getAllByRole('radio')) expect(r).not.toBeChecked()
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
  it('Save sends all four fields and closes', async () => {
    const { user, props } = await setup({ data: SET })
    await user.click(screen.getByRole('radio', { name: /3Upgraded/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).toHaveBeenCalledWith({ bracket: 3, summary: 'Plants and recursion', strategy: 'Eat the graveyard.', playgroup: 'Friday pod' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
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
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).toHaveBeenCalled()
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
  it('shows placeholders, is marked busy, and Save is off with the reason read out', async () => {
    const { user, props } = await setup({ data: undefined })
    expect(dialog()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('strategy-window-loading')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAccessibleDescription('Save is off while the strategy loads.')
    await user.click(save)
    expect(props.onSave).not.toHaveBeenCalled()
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
  })
})
describe('Strategy window: failed save', () => {
  it('shows the failure as an alert, keeps everything typed, and the button reads Try again', async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ ok: false, error: "Couldn't save. Your changes are still here and nothing was lost. Check your connection and select Save to try again." }).mockResolvedValueOnce({ ok: true })
    const { user, props } = await setup({ data: EMPTY, onSave })
    await user.type(screen.getByLabelText('One-line summary'), 'My words')
    await user.click(screen.getByRole('radio', { name: /2Core/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save. Your changes are still here and nothing was lost.")
    expect(screen.getByLabelText('One-line summary')).toHaveValue('My words')
    expect(screen.getByRole('radio', { name: /2Core/ })).toBeChecked()
    expect(props.onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
  it('a save that throws is shown the same way', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network'))
    const { user } = await setup({ onSave })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save.")
  })
})
describe('Strategy window: offline', () => {
  it('says so, lets the owner keep typing, and turns Save off with the reason read out', async () => {
    const { user, props } = await setup({ data: SET, online: false })
    expect(dialog()).toHaveTextContent("You're offline. You can keep typing. Save is off until you're back online. Your text stays in this window.")
    expect(dialog()).toHaveTextContent("The card check can't update while you're offline.")
    await user.type(screen.getByLabelText('Playgroup (optional)'), ' and more')
    expect(screen.getByLabelText('Playgroup (optional)')).toHaveValue('Friday pod and more')
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAccessibleDescription("Save is off because you're offline.")
    await user.click(save)
    expect(props.onSave).not.toHaveBeenCalled()
  })
})
describe('Strategy window: stored data not updated yet', () => {
  it('says up front that the summary cannot be saved yet and that the rest can', async () => {
    await setup({ data: { ...EMPTY, canStoreNewFields: false } })
    expect(screen.getByTestId('summary-not-yet')).toHaveTextContent("The summary can't be saved yet.")
    expect(screen.getByTestId('summary-not-yet')).toHaveTextContent('Everything else in this window saves normally.')
  })
  it('after a save where only the summary was left out, the window stays open and says so', async () => {
    const onSave = vi.fn(async () => ({ ok: true as const, notSaved: ['summary'] }))
    const { user, props } = await setup({ data: { ...EMPTY, canStoreNewFields: false }, onSave })
    await user.type(screen.getByLabelText('One-line summary'), 'Hello')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(dialog()).toHaveTextContent('The one-line summary was not: Oracle can\'t store it yet.')
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
  it('Escape and Cancel close at once when nothing was changed', async () => {
    const { user, props } = await setup({ data: SET })
    await user.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
  it('with unsaved edits Escape asks first, focus lands on Keep editing, and Discard closes', async () => {
    const { user, props } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    await user.keyboard('{Escape}')
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Discard your changes?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByText('Discard your changes?')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
  it('clicking the dimmed background does nothing', async () => {
    const { user, props } = await setup({ data: SET })
    await user.type(screen.getByLabelText('Playgroup (optional)'), '!')
    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement
    await user.click(overlay)
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('Discard your changes?')).toBeNull()
  })
})
describe('Strategy window: Claude changed the deck while it is open (live refresh)', () => {
  const NEWER: StrategyWindowData = { ...SET, summary: 'Claude wrote this', updatedBy: 'claude' }
  it('shows no banner normally, and marks itself as safe to refresh behind', async () => {
    await setup({ data: SET })
    expect(screen.queryByTestId('strategy-claude-changed')).toBeNull()
    expect(dialog()).toHaveAttribute('data-live-refresh', 'allow')
  })
  it('shows "Claude changed this deck. Refresh" and keeps what was typed until Refresh is pressed', async () => {
    const onRefreshFromClaude = vi.fn(async () => NEWER)
    const { user, rerender, props } = await setup({ data: SET })
    const summary = screen.getByRole('textbox', { name: /summary/i })
    await user.clear(summary)
    await user.type(summary, 'My unsaved words')
    rerender(
      <>
        <button type="button">Behind the window</button>
        <StrategyWindow {...props} data={SET} claudeChanged onRefreshFromClaude={onRefreshFromClaude} />
      </>,
    )
    const banner = screen.getByTestId('strategy-claude-changed')
    expect(banner).toHaveTextContent('Claude changed this deck.')
    expect(banner).toHaveTextContent("Refresh replaces what you've typed here.")
    expect(summary).toHaveValue('My unsaved words')
    await user.click(within(banner).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(summary).toHaveValue('Claude wrote this'))
    expect(onRefreshFromClaude).toHaveBeenCalledTimes(1)
  })
})
