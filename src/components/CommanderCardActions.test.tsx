import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardGroupSection } from './CardGroupSection'
import { CommanderActionsProvider } from '@/hooks/useCommanderActions'
import type { DeckCard } from './CardGrid'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const card = (over: Partial<DeckCard>): DeckCard => ({
  id: 1, deck_id: 9, card_name: 'X', scryfall_id: 's', set_code: 'x', quantity: 1,
  categories: '["Creature"]', tags: '[]', is_commander: false, ...over,
})

const tymna = card({ id: 1, card_name: 'Tymna the Weaver', is_commander: true })
const kraum = card({ id: 2, card_name: 'Kraum, Ludevic’s Opus' })
const sol = card({ id: 3, card_name: 'Sol Ring', categories: '["Artifact"]' })
const lurrus = card({ id: 4, card_name: 'Lurrus of the Dream-Den' })

interface Answers {
  lead?: string[]
  second?: string[]
  companion?: string[]
  kind?: string | null
}

function stub(a: Answers) {
  const f = vi.fn(async (url: string) => {
    if (url.includes('role=second-kind')) return Response.json({ kind: a.kind ?? null })
    if (url.includes('role=lead')) return Response.json({ eligible: a.lead ?? [] })
    if (url.includes('role=second')) return Response.json({ eligible: a.second ?? [] })
    if (url.includes('role=companion')) return Response.json({ eligible: a.companion ?? [] })
    return Response.json({ deck_id: 9 })
  })
  vi.stubGlobal('fetch', f)
  return f
}

function Deck({ cards, commanderName, target = 100 }: { cards: DeckCard[]; commanderName: string | null; target?: number }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <CommanderActionsProvider deckId={9} cards={cards} commanderName={commanderName} deckTarget={target}>
        <CardGroupSection
          groupName="All"
          groupCards={cards}
          statusMap={new Map()}
          lifecycleMap={new Map()}
          deckId={9}
          physicalCopyMap={new Map()}
        />
      </CommanderActionsProvider>
    </QueryClientProvider>
  )
}

/** Opens the "More actions" menu of the row that holds this card and returns the commander-related items shown. */
async function menuFor(cardName: string): Promise<string[]> {
  const row = screen.getByText(cardName).closest('[role="listitem"], div.group') as HTMLElement
  const kebab = row.querySelector('button[aria-label="More actions"]') as HTMLElement
  await userEvent.click(kebab)
  const shown = screen
    .queryAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter((t) => /(Add|Remove) as (commander|partner|background|companion)$/.test(t))
  if (kebab.getAttribute('aria-expanded') === 'true') await userEvent.click(kebab)
  return shown
}

afterEach(() => vi.unstubAllGlobals())

describe('commander actions on card menus', () => {
  it('commander card: only "Remove as commander"; other cards get nothing they are not valid for', async () => {
    stub({ second: [], companion: [] })
    render(<Deck cards={[tymna, sol]} commanderName="Tymna the Weaver" />)
    expect(await menuFor('Tymna the Weaver')).toEqual(['Remove as commander'])
    expect(await menuFor('Sol Ring')).toEqual([])
  })

  it('no commander: a legal commander gets "Add as commander", an ordinary card does not', async () => {
    const f = stub({ lead: ['Kraum, Ludevic’s Opus'] })
    render(<Deck cards={[kraum, sol]} commanderName={null} />)
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('role=lead'))).toBe(true))
    await waitFor(async () => expect(await menuFor('Kraum, Ludevic’s Opus')).toEqual(['Add as commander']))
    expect(await menuFor('Sol Ring')).toEqual([])
  })

  it('with a commander: a valid partner gets "Add as partner"; a card that does not pair gets nothing', async () => {
    const f = stub({ second: ['Kraum, Ludevic’s Opus'], kind: 'partner' })
    render(<Deck cards={[tymna, kraum, sol]} commanderName="Tymna the Weaver" />)
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('role=second-kind'))).toBe(true))
    await waitFor(async () => expect(await menuFor('Kraum, Ludevic’s Opus')).toEqual(['Add as partner']))
    expect(await menuFor('Sol Ring')).toEqual([])
  })

  it('"Choose a Background" commander: only a Background gets "Add as background"', async () => {
    const bg = card({ id: 6, card_name: 'Raised by Giants', categories: '["Enchantment"]' })
    const f = stub({ second: ['Raised by Giants'], kind: 'background' })
    render(<Deck cards={[tymna, bg, kraum]} commanderName="Tymna the Weaver" />)
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('role=second-kind'))).toBe(true))
    await waitFor(async () => expect(await menuFor('Raised by Giants')).toEqual(['Add as background']))
    expect(await menuFor('Kraum, Ludevic’s Opus')).toEqual([])
  })

  it('"Add as companion" only on a card with the Companion ability', async () => {
    const f = stub({ companion: ['Lurrus of the Dream-Den'], kind: null })
    render(<Deck cards={[tymna, lurrus, sol]} commanderName="Tymna the Weaver" />)
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('role=companion'))).toBe(true))
    await waitFor(async () => expect(await menuFor('Lurrus of the Dream-Den')).toEqual(['Add as companion']))
    expect(await menuFor('Sol Ring')).toEqual([])
  })

  it('no "Add as companion" when it would drop a full deck below its size', async () => {
    const f = stub({ companion: ['Lurrus of the Dream-Den'] })
    render(<Deck cards={[tymna, lurrus, sol]} commanderName="Tymna the Weaver" target={3} />)
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('role=companion'))).toBe(true))
    await new Promise((r) => setTimeout(r, 30))
    expect(await menuFor('Lurrus of the Dream-Den')).toEqual([])
  })

  it('"Remove as commander" saves through the command-zone route and leaves the card in the deck', async () => {
    const f = stub({})
    const partner = card({ id: 2, card_name: 'Thrasios', is_commander: true, command_zone_role: 'partner' })
    render(<Deck cards={[tymna, partner, sol]} commanderName="Tymna the Weaver" />)
    const row = screen.getByText('Tymna the Weaver').closest('[role="listitem"], div.group') as HTMLElement
    await userEvent.click(row.querySelector('button[aria-label="More actions"]') as HTMLElement)
    await userEvent.click(screen.getByRole('button', { name: 'Remove as commander' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/decks/9/command-zone')).toBe(true))
    const put = f.mock.calls.find((c) => c[0] === '/api/decks/9/command-zone')! as unknown as [string, RequestInit]
    expect(put[1].method).toBe('PUT')
    expect(JSON.parse(String(put[1].body))).toEqual({ primaryCardId: 2, secondCardId: null, companionCardId: null })
    // Never deleted: no card DELETE call.
    expect(f.mock.calls.some((c) => (c as unknown[])[1] && ((c as unknown[])[1] as RequestInit).method === 'DELETE')).toBe(false)
  })

  it('no commander actions at all outside a commander deck (no provider)', async () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <CardGroupSection groupName="All" groupCards={[kraum]} statusMap={new Map()} lifecycleMap={new Map()} deckId={9} physicalCopyMap={new Map()} />
      </QueryClientProvider>
    )
    expect(await menuFor('Kraum, Ludevic’s Opus')).toEqual([])
  })
})
