import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrategyTab } from './StrategyTab'

vi.mock('@/components/CommanderOverview', () => ({ CommanderOverview: () => null }))
vi.mock('@/components/StrategyGuide', () => ({ StrategyGuide: () => <div>Guide</div> }))

const build = {
  id: 'b1', archetype: 'aggro', theme: null, edhrecThemeSlug: null, deckCount: 10, deckPercentage: 5,
  avgLands: 36, avgRamp: 10, avgDraw: 10, avgRemoval: 8, avgWipes: 2, avgCreatures: 20, avgArtifacts: 5,
  avgEnchantments: 5, avgInstants: 5, avgSorceries: 5, avgPlaneswalkers: 1,
}

beforeEach(() => {
  global.fetch = vi.fn(async (url: string) => {
    const body = String(url).includes('/builds')
      ? { commanderId: 'c1', commanderName: 'Cmd', colorIdentity: 'G', builds: [build], count: 1 }
      : String(url).includes('/insights')
        ? { commanderId: 'c1', commanderName: 'Cmd', insights: [], byType: {}, filters: {} }
        : { notes: [] }
    return { ok: true, status: 200, json: async () => body }
  }) as never
})

describe('StrategyTab', () => {
  it('no longer shows the Deck Intent form, but keeps the build picker and category manager', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StrategyTab deckId={1} deckType={null} commanderName="Cmd" commanderId="c1" buildId="b1" cards={[]} />
      </QueryClientProvider>
    )
    expect(await screen.findByText('Categories')).toBeTruthy()
    expect(await screen.findByText('General (no specific build)')).toBeTruthy()
    expect(screen.getByText('Add category')).toBeTruthy()
    expect(screen.queryByText('Deck Intent')).toBeNull()
    expect(screen.queryByText('Configure')).toBeNull()
    expect(screen.queryByText('Win condition', { selector: 'span,label' })).toBeNull()
    expect(screen.queryByText('Budget mode')).toBeNull()
    const urls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.endsWith('/api/decks/1/strategy'))).toBe(false)
  })
})
