import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import { DeckMenu } from './DeckMenu'

const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
beforeEach(() => { fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

function setup(onOpenHistory = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeckMenu deckId={7} deckName="Yedora" cards={[]} onOpenHistory={onOpenHistory} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onOpenHistory }
}

describe('DeckMenu', () => {
  it('lists Export, History, Delete deck in that order, Delete last', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'More deck actions' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Export', 'History', 'Delete deck'])
  })

  it('History calls the callback', async () => {
    const { user, onOpenHistory } = setup()
    await user.click(screen.getByRole('button', { name: 'More deck actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'History' }))
    expect(onOpenHistory).toHaveBeenCalledTimes(1)
  })

  it('Delete deck opens the confirmation and deletes nothing until confirmed', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'More deck actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete deck' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/permanently delete the deck/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/decks/7', { method: 'DELETE' })
  })

  it('Escape closes the menu and returns focus to the button', async () => {
    const { user } = setup()
    const trigger = screen.getByRole('button', { name: 'More deck actions' })
    await user.click(trigger)
    await screen.findAllByRole('menuitem')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})
