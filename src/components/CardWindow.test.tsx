import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardGroupSection } from './CardGroupSection'
import { CardWindowProvider } from './CardWindow'
import { parseCategoriesCapped, type StructuredCategories } from '@/lib/categoryUtils'
import type { DeckCard } from './CardGrid'
import type { CardSlotStatus, DeckCardLifecycle } from '@/lib/card-status'

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const rest = { ...props }
    delete rest.blurDataURL
    delete rest.unoptimized
    delete rest.priority
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

const SOL = {
  id: 1, deck_id: 4, card_name: 'Sol Ring', quantity: 1, categories: '["Ramp"]',
  scryfall_id: 'abcd0000-0000-0000-0000-000000000001', set_code: 'c21', tags: '', is_commander: false,
} as unknown as DeckCard
const SIGNET = {
  id: 2, deck_id: 4, card_name: 'Arcane Signet', quantity: 1, categories: '["Ramp"]',
  scryfall_id: 'abcd0000-0000-0000-0000-000000000002', set_code: 'c21', tags: '', is_commander: false,
} as unknown as DeckCard

let rolesResponse: { ok: boolean; body: unknown } = { ok: true, body: { kind: 'roles', roles: ['ramp'] } }

beforeEach(() => {
  rolesResponse = { ok: true, body: { kind: 'roles', roles: ['ramp'] } }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/roles')) {
      return { ok: rolesResponse.ok, status: rolesResponse.ok ? 200 : 500, json: async () => rolesResponse.body }
    }
    // status chip / moved-slot lookups: nothing relevant to this test
    return { ok: true, status: 200, json: async () => ({ ok: true, moved: [] }) }
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A small stand-in for the Cards tab: live cards in state, grouped by main category, one save path. */
function Harness({ onSave, failSave = false }: { onSave: (id: number, c: StructuredCategories) => void; failSave?: boolean }) {
  const [cards, setCards] = useState<DeckCard[]>([SOL, SIGNET])
  const statusMap = new Map<number, CardSlotStatus>([[1, 'original'], [2, 'available']])
  const lifecycleMap = new Map<number, DeckCardLifecycle>([[1, 'sleeved'], [2, 'planned']])
  const groups = new Map<string, DeckCard[]>()
  for (const c of cards) {
    const key = parseCategoriesCapped(c.categories).primary_category
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const save = async (cardId: number, categories: StructuredCategories) => {
    onSave(cardId, categories)
    if (failSave) throw new Error('nope')
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, categories: JSON.stringify([categories.primary_category, ...categories.additional_categories]) } : c)))
  }
  return (
    <CardWindowProvider
      deckId={4}
      cards={cards}
      statusMap={statusMap}
      lifecycleMap={lifecycleMap}
      availableCategories={['Ramp', 'Draw', 'Other']}
      onSaveCategories={save}
    >
      {[...groups.entries()].map(([name, groupCards]) => (
        <CardGroupSection
          key={name}
          groupName={name}
          groupCards={groupCards}
          statusMap={statusMap}
          lifecycleMap={lifecycleMap}
          deckId={4}
          physicalCopyMap={new Map()}
          availableCategories={['Ramp', 'Draw', 'Other']}
          onCategoryChange={(id, c) => void save(id, c)}
        />
      ))}
    </CardWindowProvider>
  )
}

function renderHarness(props: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const onSave = vi.fn()
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness onSave={onSave} {...props} />
    </QueryClientProvider>,
  )
  return { onSave, ...view }
}

describe('card window', () => {
  it('opens from a click on the card name and shows category and today\'s roles read-only', async () => {
    renderHarness()
    expect(screen.queryByTestId('card-window')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    const win = await screen.findByTestId('card-window')
    expect(within(win).getByRole('heading', { name: 'Category' })).toBeInTheDocument()
    expect(within(win).getByText('Category: where it sits in the list')).toBeInTheDocument()
    expect(within(win).getByTestId('card-window-category')).toHaveTextContent('Ramp')
    expect(within(win).getByRole('heading', { name: 'Roles (read-only for now)' })).toBeInTheDocument()
    expect(within(win).getByText(/Setting roles comes next/)).toBeInTheDocument()
    expect(await within(win).findByTestId('card-window-role')).toHaveTextContent('Ramp')
    expect(within(win).getByText('Jobs and strategy points are coming')).toBeInTheDocument()
    // nothing for later slices
    expect(within(win).queryByText(/Proposed by Claude/)).not.toBeInTheDocument()
    expect(within(win).queryByText(/Counts as/i)).not.toBeInTheDocument()
    expect(within(win).queryByText(/^Job$/)).not.toBeInTheDocument()
    expect(within(win).getByText(/In deck|Original/)).toBeInTheDocument()
  })

  it('opens from the card menu item "Card details"', async () => {
    const user = userEvent.setup()
    renderHarness()
    await user.click(screen.getAllByRole('button', { name: 'More actions' })[0])
    await user.click(screen.getByRole('button', { name: 'Card details' }))
    expect(await screen.findByTestId('card-window')).toBeInTheDocument()
  })

  it('closes with Escape', async () => {
    const user = userEvent.setup()
    renderHarness()
    await user.click(screen.getAllByTestId('card-name-button')[0])
    await screen.findByTestId('card-window')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('card-window')).not.toBeInTheDocument())
  })

  it('moves focus into the window (the close button) and labels it', async () => {
    renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    const dialog = await screen.findByRole('dialog', { name: 'Sol Ring' })
    expect(dialog).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close card details' })).toHaveFocus())
  })

  it('a category change saves through the list\'s save path and the list updates', async () => {
    const user = userEvent.setup()
    const { onSave } = renderHarness()
    await user.click(screen.getAllByTestId('card-name-button')[0]) // Sol Ring is first in the Ramp group
    const win = await screen.findByTestId('card-window')
    await user.click(within(win).getByRole('button', { name: 'Edit' }))
    await user.selectOptions(within(win).getByRole('combobox', { name: 'Main category' }), 'Draw')
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(1, { primary_category: 'Draw', additional_categories: [] }))
    // the window shows the new category and "Saved"; the list now has a Draw group
    await waitFor(() => expect(within(win).getByTestId('card-window-category')).toHaveTextContent('Draw'))
    expect(await within(win).findByText('Saved')).toBeInTheDocument()
    expect(document.getElementById('category-draw')).not.toBeNull()
    // Undo puts it back through the same save path
    await user.click(within(win).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(1, { primary_category: 'Ramp', additional_categories: [] }))
  })

  it('shows an error and keeps the old category when the save fails', async () => {
    const user = userEvent.setup()
    renderHarness({ failSave: true })
    await user.click(screen.getAllByTestId('card-name-button')[0])
    const win = await screen.findByTestId('card-window')
    await user.click(within(win).getByRole('button', { name: 'Edit' }))
    await user.selectOptions(within(win).getByRole('combobox', { name: 'Main category' }), 'Draw')
    expect(await within(win).findByText(/Couldn't save the category\. Nothing was changed\./)).toBeInTheDocument()
    expect(within(win).getByTestId('card-window-category')).toHaveTextContent('Ramp')
  })

  it('shows a clear message when the roles lookup fails, and the rest stays usable', { timeout: 10_000 }, async () => {
    rolesResponse = { ok: false, body: { error: 'x' } }
    renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    const win = await screen.findByTestId('card-window')
    expect(await within(win).findByText(/Couldn't load roles for Sol Ring\. Nothing has changed\./, undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(within(win).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(within(win).getByRole('button', { name: 'Edit' })).toBeEnabled()
  })

  it('says so when no role was found, and for a land', async () => {
    rolesResponse = { ok: true, body: { kind: 'roles', roles: [] } }
    const first = renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    expect(await screen.findByText(/No role found\./)).toBeInTheDocument()
    first.unmount()
    rolesResponse = { ok: true, body: { kind: 'land' } }
    renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    expect(await screen.findByText('Lands have no roles.')).toBeInTheDocument()
  })

  it('shows supertypes, card types and subtypes as separate groups, and hides an empty group', async () => {
    rolesResponse = { ok: true, body: { kind: 'roles', roles: [], types: { supertypes: ['Legendary', 'Snow'], cardTypes: ['Artifact', 'Creature'], subtypes: [] } } }
    renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    const win = await screen.findByTestId('card-window')
    const sup = await within(win).findByTestId('card-window-supertypes')
    expect(within(sup).getByText('Supertypes')).toBeInTheDocument()
    expect(within(sup).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Legendary', 'Snow'])
    expect(within(within(win).getByTestId('card-window-card-types')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Artifact', 'Creature'])
    expect(within(win).queryByTestId('card-window-subtypes')).not.toBeInTheDocument()
  })
  it('makes one roles lookup for both the roles and the type groups', async () => {
    rolesResponse = { ok: true, body: { kind: 'roles', roles: ['ramp'], types: { supertypes: [], cardTypes: ['Artifact'], subtypes: [] } } }
    renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    await screen.findByTestId('card-window-card-types')
    const calls = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.filter((c) => String(c[0]).includes('/roles'))
    expect(calls).toHaveLength(1)
  })
  it('a click on the checkbox, quantity or status chip does not open it', async () => {
    renderHarness()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Arcane Signet' }))
    fireEvent.click(screen.getAllByText('1')[0])
    const chip = screen.getAllByRole('button').find((b) => /status/i.test(b.getAttribute('aria-label') ?? ''))
    if (chip) fireEvent.click(chip)
    expect(screen.queryByTestId('card-window')).not.toBeInTheDocument()
  })

  it('on a phone it opens as a full-height sheet with the picture above the sections', async () => {
    const mql = (query: string) => ({
      matches: query.includes('max-width'), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })
    vi.stubGlobal('matchMedia', mql)
    window.matchMedia = mql as unknown as typeof window.matchMedia
    renderHarness()
    // phone rows have no menu button; the name tap opens the window
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    const win = await screen.findByTestId('card-window')
    expect(win.className).toContain('max-sm:h-dvh')
    expect(win.className).toContain('max-sm:rounded-none')
    const img = within(win).getByAltText('Sol Ring')
    const heading = within(win).getByRole('heading', { name: 'Category' })
    expect(img.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(win.querySelector('.sm\\:flex-row')).not.toBeNull() // stacks on a phone, side by side from sm up
  })
})
