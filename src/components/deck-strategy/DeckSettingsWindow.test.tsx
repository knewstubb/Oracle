import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckSettingsHost } from './DeckSettingsHost'
import { StrategyBlock } from './StrategyBlock'
import { RailHealth } from '@/components/deck-rail/RailHealth'
import { buildDeckHealth } from '@/lib/deck-health'
import type { HealthSettings } from '@/lib/deck-health-settings'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const STRATEGY = { configured: false, bracket: null, summary: '', strategy: '', playgroup: '', updatedBy: null, updatedAt: null, canStoreNewFields: true, implied: null }
const HEALTH = buildDeckHealth([
  { cardName: 'Forest', quantity: 36, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
  ...Array.from({ length: 8 }, (_, i) => ({ cardName: `Rock ${i}`, quantity: 1, typeLine: 'Artifact', oracleText: '{T}: Add {G}.', inMainDeck: true })),
])
let cards: Array<{ categories: string; quantity: number }>
const CARDS0 = [
  { categories: 'Mana Rocks', quantity: 1 },
  { categories: 'Mana Rocks', quantity: 1 },
  { categories: 'Finishers, Beaters', quantity: 1 },
]

let stored: HealthSettings
let available: boolean
let puts: Array<Record<string, unknown>>

beforeEach(() => {
  available = true
  cards = CARDS0
  puts = []
  stored = {
    available: true,
    mode: 'default',
    overrides: {},
    categories: [
      { id: 1, name: 'Mana Rocks', min: 2, max: 4, proposed: null },
      { id: 2, name: 'Tutors', min: null, max: null, proposed: { min: 3, max: 5 } },
      { id: 3, name: 'Finishers', min: null, max: null, proposed: null },
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/health-settings')) {
        if (!available) return init?.method === 'PUT' ? json(503, { available: false, mode: 'default', error: "Saving targets isn't available yet." }) : json(200, { available: false, mode: 'default', overrides: {}, categories: [] })
        if (init?.method === 'PUT') {
          const b = JSON.parse(String(init.body))
          puts.push(b)
          if (b.action === 'set_mode') stored = { ...stored, mode: b.mode }
          if (b.action === 'set_override') stored = { ...stored, overrides: { ...stored.overrides, [b.kind]: { min: b.min, max: b.max } } }
          if (b.action === 'set_range') stored = { ...stored, categories: stored.categories.map((c) => (c.id === b.id ? { ...c, min: b.min, max: b.max } : c)) }
          if (b.action === 'confirm_proposal') stored = { ...stored, categories: stored.categories.map((c) => (c.id === b.id && c.proposed ? { ...c, min: c.proposed.min, max: c.proposed.max, proposed: null } : c)) }
          if (b.action === 'decline_proposal') stored = { ...stored, categories: stored.categories.map((c) => (c.id === b.id ? { ...c, proposed: null } : c)) }
          return json(200, stored)
        }
        return json(200, stored)
      }
      if (url.endsWith('/health')) return json(200, HEALTH)
      if (url.endsWith('/strategy-window')) return json(200, STRATEGY)
      return json(404, {})
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <DeckSettingsHost deckId={7} deckName="Yedora" cards={cards} onSeeHistory={() => {}}>
        <StrategyBlock deckId={7} />
        <RailHealth deckId={7} cards={cards} />
      </DeckSettingsHost>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('Deck settings window', () => {
  it('Edit on Strategy & bracket opens it on the Strategy tab; Edit on Deck health opens it on the Deck health tab', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Edit strategy' }))
    const dlg = await screen.findByRole('dialog', { name: 'Deck settings' })
    expect(within(dlg).getByRole('tab', { name: 'Strategy' })).toHaveAttribute('aria-selected', 'true')
    expect(within(dlg).getByLabelText('One-line summary')).toBeVisible()
    await user.click(within(dlg).getAllByRole('button', { name: 'Close' })[1])
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Deck settings' })).toBeNull())
    await user.click(await screen.findByRole('button', { name: 'Edit deck health' }))
    const again = await screen.findByRole('dialog', { name: 'Deck settings' })
    expect(within(again).getByRole('tab', { name: 'Deck health' })).toHaveAttribute('aria-selected', 'true')
    expect(await within(again).findByRole('radio', { name: /Default values/ })).toBeVisible()
    expect(within(again).queryByLabelText('One-line summary')).toBeNull()
  })
  it('switches tabs and keeps one dialog; Escape closes and focus returns to the Edit link', async () => {
    const user = setup()
    const edit = await screen.findByRole('button', { name: 'Edit deck health' })
    await user.click(edit)
    const dlg = await screen.findByRole('dialog', { name: 'Deck settings' })
    await user.click(within(dlg).getByRole('tab', { name: 'Strategy' }))
    expect(within(dlg).getByLabelText('One-line summary')).toBeVisible()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Deck settings' })).toBeNull())
    await waitFor(() => expect(edit).toHaveFocus())
  })
})

describe('Deck health tab', () => {
  async function openTab() {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Edit deck health' }))
    const dlg = await screen.findByRole('dialog', { name: 'Deck settings' })
    await within(dlg).findByRole('radio', { name: /Default values/ })
    return { user, dlg }
  }
  it('default pane lists the five targets with N now, Game Plan as total only, and the EDHREC reference line', async () => {
    const { dlg } = await openTab()
    const pane = within(dlg).getByTestId('health-default-pane')
    for (const n of ['Ramp', 'Card Advantage', 'Targeted Removal', 'Board Wipes', 'Lands']) {
      expect(within(pane).getByLabelText(`${n} minimum`)).toBeInTheDocument()
      expect(within(pane).getByLabelText(`${n} maximum`)).toBeInTheDocument()
    }
    expect(within(pane).getByLabelText('Ramp minimum')).toHaveValue('10')
    expect(within(pane).getByLabelText('Lands maximum')).toHaveValue('38')
    expect(pane).toHaveTextContent('8 now')
    expect(pane).toHaveTextContent('Total only, no target')
    expect(pane).toHaveTextContent('You can change a range for this deck. The other decks keep the defaults.')
    expect(within(dlg).getByTestId('health-reference')).toBeInTheDocument()
  })
  it('changing a range saves after leaving the field', async () => {
    const { dlg } = await openTab()
    const min = within(dlg).getByLabelText('Ramp minimum')
    fireEvent.change(min, { target: { value: '8' } })
    fireEvent.blur(min)
    await waitFor(() => expect(puts).toContainEqual({ action: 'set_override', kind: 'ramp', min: 8, max: 12 }))
  })
  it('shows a message and does not save when the minimum is above the maximum', async () => {
    const { dlg } = await openTab()
    const min = within(dlg).getByLabelText('Ramp minimum')
    fireEvent.change(min, { target: { value: '20' } })
    fireEvent.blur(min)
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('The minimum can’t be more than the maximum.')
    expect(puts.filter((p) => p.action === 'set_override')).toEqual([])
  })
  it('the mode radio saves at once, and Custom -> Default -> Custom keeps the categories and their targets', async () => {
    const { user, dlg } = await openTab()
    await user.click(within(dlg).getByRole('radio', { name: /Custom categories/ }))
    await waitFor(() => expect(puts).toContainEqual({ action: 'set_mode', mode: 'custom' }))
    const pane = await within(dlg).findByTestId('health-custom-pane')
    expect(within(pane).getByLabelText('Mana Rocks minimum')).toHaveValue('2')
    expect(within(pane).getByLabelText('Mana Rocks maximum')).toHaveValue('4')
    expect(within(pane).getByTestId('health-cat-mana rocks')).toHaveTextContent('2 now')
    await user.click(within(dlg).getByRole('radio', { name: /Default values/ }))
    await waitFor(() => expect(puts).toContainEqual({ action: 'set_mode', mode: 'default' }))
    expect(within(dlg).getByTestId('health-default-pane')).toBeInTheDocument()
    await user.click(within(dlg).getByRole('radio', { name: /Custom categories/ }))
    const back = await within(dlg).findByTestId('health-custom-pane')
    expect(within(back).getByLabelText('Mana Rocks minimum')).toHaveValue('2')
    expect(within(back).getByTestId('health-cat-tutors')).toHaveTextContent('Claude proposes 3 to 5')
    expect(stored.categories).toHaveLength(3)
  })
  it('custom rows: a proposal with Confirm and Decline, a No target row with Set target', async () => {
    stored = { ...stored, mode: 'custom' }
    const { user, dlg } = await openTab()
    const tutors = await within(dlg).findByTestId('health-cat-tutors')
    expect(within(tutors).getByRole('button', { name: 'Decline Tutors proposal' })).toBeInTheDocument()
    const finishers = within(dlg).getByTestId('health-cat-finishers')
    expect(finishers).toHaveTextContent('No target')
    expect(finishers).toHaveTextContent('1 now')
    await user.click(within(finishers).getByRole('button', { name: 'Set target for Finishers' }))
    expect(within(finishers).getByLabelText('Finishers minimum')).toBeInTheDocument()
    await user.click(within(tutors).getByRole('button', { name: 'Confirm Tutors proposal' }))
    await waitFor(() => expect(puts).toContainEqual({ action: 'confirm_proposal', id: 2 }))
    await waitFor(() => expect(within(dlg).getByTestId('health-cat-tutors')).toHaveTextContent('Tutors'))
    expect(within(within(dlg).getByTestId('health-cat-tutors')).getByLabelText('Tutors minimum')).toHaveValue('3')
  })
  it('REPRO World Breaker: a deck whose cards carry categories but with nothing stored lists them with counts, no Commander', async () => {
    const real: Array<[string, number]> = [['Land', 41], ['Ramp', 21], ['Land Recursion', 12], ['Sacrifice Engines', 12], ['Removal & Wipes', 11], ['Card Advantage', 11], ['Landfall Payoffs', 8], ['Sacrifice Payoffs', 7], ['Commander', 1]]
    cards = real.map(([categories, quantity]) => ({ categories, quantity }))
    stored = { ...stored, mode: 'custom', categories: [] }
    const { user, dlg } = await openTab()
    const pane = await within(dlg).findByTestId('health-custom-pane')
    expect(within(pane).queryByText('No categories yet. Add one below.')).toBeNull()
    const rows = within(pane).getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(rows).toHaveLength(8)
    expect(rows[0]).toContain('Land')
    expect(rows[0]).toContain('41 now')
    expect(rows[1]).toContain('Ramp')
    expect(rows.some((r) => r.includes('Commander'))).toBe(false)
    expect(within(pane).getByTestId('health-cat-ramp')).toHaveTextContent('No target')
    // A first target creates the stored row.
    await user.click(within(pane).getByRole('button', { name: 'Set target for Ramp' }))
    await user.type(within(pane).getByLabelText('Ramp minimum'), '10')
    await user.type(within(pane).getByLabelText('Ramp maximum'), '12')
    fireEvent.blur(within(pane).getByLabelText('Ramp maximum'))
    await waitFor(() => expect(puts).toContainEqual({ action: 'add_category', name: 'Ramp', min: 10, max: 12 }))
  })
  it('a stored target whose category has no cards stays listed with a note and can be removed', async () => {
    stored = { ...stored, mode: 'custom' }
    const { user, dlg } = await openTab()
    const tutors = await within(dlg).findByTestId('health-cat-tutors')
    expect(tutors).toHaveTextContent('0 now')
    expect(tutors).toHaveTextContent('No cards in this category right now.')
    await user.click(within(tutors).getByRole('button', { name: 'Remove Tutors' }))
    await waitFor(() => expect(puts).toContainEqual({ action: 'remove_category', id: 2 }))
  })
  it('declining a proposal leaves the row at No target', async () => {
    stored = { ...stored, mode: 'custom' }
    const { user, dlg } = await openTab()
    await user.click(await within(dlg).findByRole('button', { name: 'Decline Tutors proposal' }))
    await waitFor(() => expect(puts).toContainEqual({ action: 'decline_proposal', id: 2 }))
    await waitFor(() => expect(within(dlg).getByTestId('health-cat-tutors')).toHaveTextContent('No target'))
  })
  it('Confirm and Decline are only in the window, never in the rail', async () => {
    stored = { ...stored, mode: 'custom' }
    setup()
    await screen.findByTestId('health-see-all')
    expect(screen.queryByRole('button', { name: /confirm|decline/i })).toBeNull()
  })
  it('with the stored data missing it shows the defaults read-only with one line and no error', async () => {
    available = false
    const { dlg } = await openTab()
    expect(within(dlg).getByTestId('health-unavailable')).toHaveTextContent("Saving targets isn't available yet.")
    expect(within(dlg).getByLabelText('Ramp minimum')).toBeDisabled()
    expect(within(dlg).getByRole('radio', { name: /Custom categories/ })).toBeDisabled()
    expect(within(dlg).queryByRole('alert')).toBeNull()
    expect(puts).toEqual([])
  })
  it('the rail still shows the six default rows under See all when the stored data is missing', async () => {
    available = false
    setup()
    const rows = await screen.findByTestId('health-rows')
    await userEvent.setup().click(screen.getByTestId('health-see-all'))
    expect(within(rows).getAllByRole('button')).toHaveLength(6)
  })
})
