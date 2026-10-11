/**
 * Offline acceptance tests for the T-32 Collection F1 (active-view data
 * only) and F2 (single search pause, atomic parameter/page transitions)
 * fixes, per docs/oracle/contracts/collection-loading-solutions.md
 * sections 4, 5 and 7 (C27-F1-*, C27-F2-* cases), plus the R1/R2/R3
 * corrections from docs/oracle/reports/2026-09-29-orchestrator-first-implementation-review.md.
 *
 * All auth/database/network is mocked; no real fetch, browser or
 * provider request occurs. The Oracle context and page-header boundaries
 * are mocked directly (not mounted as real providers), and any fetch to
 * an endpoint not explicitly modeled here fails the test rather than
 * silently succeeding. Uses a real QueryClient so enable/cache behaviour
 * is genuine, and fake timers for the toolbar's single 300ms debounce.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PageHeaderConfig } from '@/contexts/PageHeaderContext'
import CollectionPage from './page'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

// The Oracle context is an external boundary unrelated to F1/F2 — mock it
// directly rather than mounting the real provider (which makes its own
// background session fetches).
vi.mock('@/contexts/OracleContext', () => ({ useOracleContext: vi.fn() }))

// The page header is also an external layout boundary. Capture each call so
// assertions can inspect the subtitle content without mounting the real
// provider/consumer tree.
const { headerCalls } = vi.hoisted(() => ({ headerCalls: [] as PageHeaderConfig[] }))
vi.mock('@/contexts/PageHeaderContext', () => ({
  usePageHeader: vi.fn((config: PageHeaderConfig) => { headerCalls.push(config) }),
}))

function lastHeaderSubtitleText(): string {
  const last = headerCalls[headerCalls.length - 1]
  if (!last?.subtitle) return ''
  return renderToStaticMarkup(last.subtitle as React.ReactElement)
}

/* ─── localStorage mock (jsdom in this runner has no localStorage) ──── */

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string): string | null => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i: number): string | null => Object.keys(store)[i] ?? null),
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

function mockViewport(isMobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isMobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

/* ─── Fixture rows ──────────────────────────────────────────────────── */

function rollupRow(cardName: string, cardDefinitionId: number) {
  return {
    cardDefinitionId,
    cardName,
    oracleId: `oracle-${cardDefinitionId}`,
    colorIdentity: [],
    isBasicLand: false,
    ownedQuantity: 1,
    inUseCount: 0,
    priceToAdd: null,
    printingSubgroups: [],
  }
}

function printingRow(cardName: string, id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    cardName,
    scryfallPrintingId: `printing-${id}`,
    setCode: 'ABC',
    setName: 'Alpha Beta Chi',
    isFoil: false,
    quantity: 1,
    colorIdentity: [],
    usedByCount: 0,
    usedByDecks: [],
    price: null,
    isProxy: false,
    originalQty: 1,
    proxyQty: 0,
    totalSupply: 1,
    activeDemand: 0,
    allocationState: 'unallocated' as const,
    manaCost: null,
    rarity: 'common',
    collectorNumber: '1',
    typeLine: 'Creature',
    addedAt: null,
    ...overrides,
  }
}

function rollupEnvelope(rows: ReturnType<typeof rollupRow>[], page = 1, totalCount = rows.length) {
  return {
    rows,
    totalCount,
    page,
    pageSize: 50,
    lastPriceRefresh: null,
    isPriceStale: false,
  }
}

function printingEnvelope(rows: ReturnType<typeof printingRow>[], page = 1, totalCount = rows.length) {
  return {
    rows,
    totalCount,
    page,
    pageSize: 100,
    lastPriceRefresh: null,
    isPriceStale: false,
  }
}

/** A rollup handler that supports real pagination across `pages` pages of 50. */
function paginatedRollupHandler(pages: number) {
  return (call: FetchCall) => {
    const page = Number(call.searchParams.get('page') ?? '1')
    const rows = Array.from({ length: 50 }, (_, i) => rollupRow(`Card ${page}-${i}`, page * 100 + i))
    return Promise.resolve(jsonResponse(rollupEnvelope(rows, page, pages * 50)))
  }
}

/** A printings handler that supports real pagination across `pages` pages of 100. */
function paginatedPrintingsHandler(pages: number) {
  return (call: FetchCall) => {
    const page = Number(call.searchParams.get('page') ?? '1')
    const rows = Array.from({ length: 100 }, (_, i) => printingRow(`Printing ${page}-${i}`, page * 1000 + i))
    return Promise.resolve(jsonResponse(printingEnvelope(rows, page, pages * 100)))
  }
}

/* ─── Fetch tracking ────────────────────────────────────────────────── */

interface FetchCall {
  url: string
  searchParams: URLSearchParams
}

let fetchCalls: FetchCall[]
let rollupHandler: (call: FetchCall) => Promise<Response>
let printingsHandler: (call: FetchCall) => Promise<Response>

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response
}

function defaultRollupHandler() {
  return jsonResponse(rollupEnvelope([rollupRow('Sol Ring', 1)]))
}

function defaultPrintingsHandler() {
  return jsonResponse(printingEnvelope([printingRow('Sol Ring', 1)]))
}

beforeEach(() => {
  // `shouldAdvanceTime` lets real elapsed time also tick fake timers, so
  // `@testing-library`'s `waitFor` polling (itself timer-based) still
  // progresses while we still fully control the toolbar's 300ms debounce
  // (and react-query's retry backoff) with explicit `vi.advanceTimersByTime`.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorageMock.clear()
  vi.clearAllMocks()
  headerCalls.length = 0
  fetchCalls = []
  rollupHandler = () => Promise.resolve(defaultRollupHandler())
  printingsHandler = () => Promise.resolve(defaultPrintingsHandler())
  mockViewport(false)

  global.fetch = vi.fn((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    const [path, query = ''] = urlStr.split('?')
    const call: FetchCall = { url: urlStr, searchParams: new URLSearchParams(query) }
    fetchCalls.push(call)

    if (path.includes('/api/collection/rollup') && !path.includes('/api/collection/rollup/')) {
      return rollupHandler(call)
    }
    if (path.includes('/api/collection/printings')) {
      return printingsHandler(call)
    }
    // The value banner mounts alongside the page and issues its own,
    // independent request — explicitly modeled rather than caught by a
    // generic fallback.
    if (path.includes('/api/collection/value')) {
      return Promise.resolve(jsonResponse({ totalMarketValue: 0, totalPurchaseValue: 0, gainLoss: 0, cardCount: 0, topCards: [] }))
    }
    // Any other request is unexpected for these tests and must fail loudly
    // rather than silently resolving with a fabricated success body.
    return Promise.reject(new Error(`Unexpected fetch in test: ${urlStr}`))
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function rollupCalls() {
  return fetchCalls.filter((c) => c.url.includes('/api/collection/rollup') && !c.url.includes('/api/collection/rollup/'))
}

function printingCalls() {
  return fetchCalls.filter((c) => c.url.includes('/api/collection/printings'))
}

function renderPage(queryDefaults: { retry?: number | boolean } = { retry: false }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 60 * 60 * 1000, ...queryDefaults } },
  })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <CollectionPage />
    </QueryClientProvider>
  )
  return { ...utils, queryClient }
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/* ─── F1: active-view data only ─────────────────────────────────────── */

describe('F1: active Collection data only', () => {
  it('C27-F1-01: cold saved list makes no rollup request, only printings', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'list')
    renderPage()

    // Immediately after mount, view resolution has not yet committed;
    // neither request should have started synchronously.
    expect(rollupCalls()).toHaveLength(0)

    await waitFor(() => {
      expect(printingCalls().length).toBeGreaterThan(0)
    })

    expect(rollupCalls()).toHaveLength(0)
    // PrintingListView virtualizes rows (no real layout in jsdom), so
    // assert against the footer summary rather than a rendered row.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*1\s*cards/)
    })
  })

  it('C27-F1-02: saved grid on mobile remains grid', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    mockViewport(true)
    renderPage()

    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    expect(printingCalls()).toHaveLength(0)
  })

  it('C27-F1-02: absent preference on mobile defaults to list', async () => {
    mockViewport(true)
    renderPage()

    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    expect(rollupCalls()).toHaveLength(0)
  })

  it('C27-F1-02: absent preference on desktop defaults to grid', async () => {
    mockViewport(false)
    renderPage()

    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    expect(printingCalls()).toHaveLength(0)
  })

  it('C27-F1-02: invalid stored preference falls back to grid without rewriting it', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'cards')
    renderPage()

    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    expect(printingCalls()).toHaveLength(0)
    // The invalid value is not silently rewritten to a valid one.
    expect(localStorageMock.getItem('oracle:collection:viewMode')).toBe('cards')
  })

  it('C27-F1-02: a storage-read exception falls back to the viewport default and logs once', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })
    mockViewport(true)
    renderPage()

    // Viewport default for a storage exception on a narrow screen is list.
    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    expect(rollupCalls()).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('C27-F1-03: switching view then returning reuses the cached result for an unchanged query', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()

    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    await screen.findByText('Sol Ring')

    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    const printingCallsAfterFirstSwitch = printingCalls().length

    fireEvent.click(screen.getByLabelText('Grid view'))
    // Grid data is already cached and fresh (staleTime 5min) — no refetch.
    await flushMicrotasks()
    const rollupCallsAfterReturn = rollupCalls().length

    fireEvent.click(screen.getByLabelText('List view'))
    await flushMicrotasks()

    // Fresh cached printing result is reused; no additional request needed.
    expect(printingCalls().length).toBe(printingCallsAfterFirstSwitch)
    expect(rollupCalls().length).toBe(rollupCallsAfterReturn)
  })

  it('C27-F1-04: invalidating collection while list is hidden (behind an active grid) does not fetch the hidden view; activating it afterward revalidates exactly once, showing the previous result with a refresh indication until the new data arrives', async () => {
    let printingFixtureCount = 1
    let deferNextPrinting = false
    let resolveDeferredPrinting: ((r: Response) => void) | undefined
    printingsHandler = () => {
      if (deferNextPrinting) {
        deferNextPrinting = false
        return new Promise<Response>((resolve) => { resolveDeferredPrinting = resolve })
      }
      return Promise.resolve(jsonResponse(printingEnvelope([printingRow('Sol Ring', 1)], 1, printingFixtureCount)))
    }
    localStorageMock.setItem('oracle:collection:viewMode', 'list')
    const { queryClient } = renderPage()

    // Load list for real, with an actual cached success (count 1).
    await waitFor(() => expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*1\s*cards/))
    expect(printingCalls()).toHaveLength(1)

    // Switch to grid and let it succeed for real too.
    fireEvent.click(screen.getByLabelText('Grid view'))
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    await screen.findByText('Sol Ring')

    // While list is hidden, its underlying data changes (a refetch would
    // now return a different count) and the collection cache is invalidated.
    printingFixtureCount = 7
    deferNextPrinting = true
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['collection'] })
    })

    // A disabled/hidden query is not refetched merely by invalidation.
    expect(printingCalls()).toHaveLength(1)

    // Activating list must now revalidate — exactly once.
    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => expect(printingCalls()).toHaveLength(2))

    // The previously loaded (now stale) result stays visible, with the
    // refreshing indication, while the revalidation is still in flight —
    // not a fabricated new count.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*1\s*cards/)
    })
    expect(document.querySelector('.opacity-70')).toBeTruthy()

    // Resolve the revalidation with the new fixture.
    await act(async () => {
      resolveDeferredPrinting?.(jsonResponse(printingEnvelope([printingRow('Sol Ring', 1)], 1, 7)))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*7\s*cards/)
    })
    expect(lastHeaderSubtitleText()).toContain('7 owned')
    // No extra fetch beyond the single revalidation.
    expect(printingCalls()).toHaveLength(2)
  })

  it('hidden late error for an inactive view is isolated from the active view', async () => {
    let rejectRollup: ((e: Error) => void) | undefined
    rollupHandler = () => new Promise<Response>((_resolve, reject) => {
      rejectRollup = reject
    })
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()

    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    // Grid's request is now in flight and deliberately left pending.

    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*1\s*cards/)
    })

    // The hidden grid query now fails late — the active list view must be
    // completely unaffected (no error state, no content swap).
    await act(async () => {
      rejectRollup?.(new Error('late hidden failure'))
      await Promise.resolve()
    })
    expect(screen.queryByText('Failed to load collection data.')).not.toBeInTheDocument()
    expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*1\s*cards/)
  })

  it('hidden late success for an inactive view (sharply different count/identity) is isolated from the active view', async () => {
    let resolveRollup: ((r: Response) => void) | undefined
    rollupHandler = () => new Promise<Response>((resolve) => { resolveRollup = resolve })
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()

    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    // Grid's request is now in flight and deliberately left pending.

    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*1\s*cards/)
    })

    // The hidden grid query now succeeds late, with a sharply different
    // count and row identity — the active list view must be unaffected.
    await act(async () => {
      resolveRollup?.(jsonResponse(rollupEnvelope(
        Array.from({ length: 5 }, (_, i) => rollupRow(`Hidden Card ${i}`, 900 + i)),
        1,
        999
      )))
      await Promise.resolve()
    })

    expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*1\s*cards/)
    expect(screen.queryByText('Hidden Card 0')).not.toBeInTheDocument()
    expect(lastHeaderSubtitleText()).not.toContain('999')
  })
})

/* ─── F2: one pause, atomic parameter/page transitions ──────────────── */

describe('F2: single search pause and atomic query/page transitions', () => {
  it('C27-F2-01: rapid typing and clearing commits once after a single 300ms pause', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    const callsBeforeTyping = rollupCalls().length

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'S' } })
    fireEvent.change(input, { target: { value: 'So' } })
    fireEvent.change(input, { target: { value: 'Sol' } })

    act(() => { vi.advanceTimersByTime(299) })
    await flushMicrotasks()
    expect(rollupCalls().length).toBe(callsBeforeTyping)

    act(() => { vi.advanceTimersByTime(1) })
    await waitFor(() => {
      const searchCalls = rollupCalls().filter((c) => c.searchParams.get('search') === 'Sol')
      expect(searchCalls.length).toBe(1)
    })
  })

  it('C27-F2-01: rapid type-then-clear back to the empty starting value commits no new (redundant) request', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    const callsBefore = rollupCalls().length

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Sol' } })
    fireEvent.change(input, { target: { value: 'Sol Ring' } })
    fireEvent.change(input, { target: { value: '' } })

    act(() => { vi.advanceTimersByTime(300) })
    await flushMicrotasks()

    // The single committed value equals the unchanged starting search —
    // no additional request is issued for it.
    expect(rollupCalls().length).toBe(callsBefore)
  })

  it('C27-F2-01: rapid type-then-clear back to a previously committed search commits no new (redundant) request', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Sol' } })
    act(() => { vi.advanceTimersByTime(300) })
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('search') === 'Sol')).toBe(true))
    const callsAfterFirstCommit = rollupCalls().length

    fireEvent.change(input, { target: { value: 'Sol Ring' } })
    fireEvent.change(input, { target: { value: 'Sol' } })
    act(() => { vi.advanceTimersByTime(300) })
    await flushMicrotasks()

    expect(rollupCalls().length).toBe(callsAfterFirstCommit)
  })

  it('clearing to empty after a committed search and further typing genuinely commits an empty search exactly once', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    const { queryClient } = renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Sol' } })
    act(() => { vi.advanceTimersByTime(300) })
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('search') === 'Sol')).toBe(true))
    const callsAfterSolCommit = rollupCalls().length

    // Invalidate the specific unfiltered ('' search) rollup cache entry, by
    // predicate rather than a hardcoded key, so the eventual empty-search
    // request below is proven to be a genuine new fetch rather than silent
    // cache reuse of the still-fresh initial mount query — this does not
    // change any cache rule, only proves the behaviour deterministically.
    await act(async () => {
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[1] === 'rollup' && query.queryKey[5] === '',
      })
    })
    // The active query (search: 'Sol') must not have been touched by that
    // predicate, so no unwanted refetch happens yet.
    expect(rollupCalls().length).toBe(callsAfterSolCommit)

    fireEvent.change(input, { target: { value: 'Sol Ring' } })
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.change(input, { target: { value: '' } })

    act(() => { vi.advanceTimersByTime(299) })
    await flushMicrotasks()
    expect(rollupCalls().length).toBe(callsAfterSolCommit)

    act(() => { vi.advanceTimersByTime(1) })
    await waitFor(() => {
      expect(rollupCalls().length).toBe(callsAfterSolCommit + 1)
    })
    const finalCall = rollupCalls()[rollupCalls().length - 1]
    expect(finalCall.searchParams.get('search') ?? '').toBe('')
    // No stray request was ever made for the abandoned "Sol Ring" value.
    expect(rollupCalls().some((c) => c.searchParams.get('search') === 'Sol Ring')).toBe(false)
  })

  it('C27-F2-02: settling a search from a later page resets to page 1 in the same request, no old-page request', async () => {
    rollupHandler = paginatedRollupHandler(3)
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))

    fireEvent.click(await screen.findByLabelText('Next page'))
    fireEvent.click(screen.getByLabelText('Next page'))
    await waitFor(() => {
      expect(rollupCalls().some((c) => c.searchParams.get('page') === '3')).toBe(true)
    })

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Sol Ring' } })
    act(() => { vi.advanceTimersByTime(300) })

    await waitFor(() => {
      expect(rollupCalls().some((c) => c.searchParams.get('search') === 'Sol Ring')).toBe(true)
    })

    // No request combines the new search with the stale page-3 value.
    const badRequest = rollupCalls().find(
      (c) => c.searchParams.get('search') === 'Sol Ring' && c.searchParams.get('page') === '3'
    )
    expect(badRequest).toBeUndefined()

    const searchRequest = rollupCalls().find((c) => c.searchParams.get('search') === 'Sol Ring')
    expect(searchRequest?.searchParams.get('page')).toBe('1')
  })

  it('C27-F2-02/atomic-both-pages: a search change also resets the hidden (inactive) view page, not only the active one', async () => {
    rollupHandler = paginatedRollupHandler(3)
    printingsHandler = paginatedPrintingsHandler(3)
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))

    // Advance the hidden (list) view's page while it is inactive by
    // switching to it, paging, then switching back.
    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    fireEvent.click(await screen.findByLabelText('Next page'))
    await waitFor(() => expect(printingCalls().some((c) => c.searchParams.get('page') === '2')).toBe(true))

    fireEvent.click(screen.getByLabelText('Grid view'))
    await flushMicrotasks()

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Sol Ring' } })
    act(() => { vi.advanceTimersByTime(300) })
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('search') === 'Sol Ring')).toBe(true))

    // Switch to list view: its page must have been reset to 1 by the
    // search commit, even though list was hidden at the time.
    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => {
      const call = printingCalls().find((c) => c.searchParams.get('search') === 'Sol Ring')
      expect(call).toBeDefined()
      expect(call?.searchParams.get('page')).toBe('1')
    })
  })

  it('a colour filter change resets both the active and inactive view pages, carrying the identical colour and committed search into both', async () => {
    rollupHandler = paginatedRollupHandler(3)
    printingsHandler = paginatedPrintingsHandler(3)
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))

    // Commit a search first, before navigating either view to a later
    // page, so the later page-3/page-2 navigation itself is what advances
    // the pages — the colour change below is then the only thing left
    // that can plausibly cause the reset being asserted.
    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Ring' } })
    act(() => { vi.advanceTimersByTime(300) })
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('search') === 'Ring')).toBe(true))

    // Advance grid to page 3 (still searching "Ring").
    fireEvent.click(await screen.findByLabelText('Next page'))
    fireEvent.click(screen.getByLabelText('Next page'))
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('page') === '3' && c.searchParams.get('search') === 'Ring')).toBe(true))
    await waitFor(() => expect(document.body.textContent).toMatch(/Page\s*3\s*of\s*3/))

    // Advance list to page 2 (also still searching "Ring"), then return to grid.
    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    fireEvent.click(await screen.findByLabelText('Next page'))
    await waitFor(() => expect(printingCalls().some((c) => c.searchParams.get('page') === '2' && c.searchParams.get('search') === 'Ring')).toBe(true))
    await waitFor(() => expect(document.body.textContent).toMatch(/Page\s*2\s*of\s*3/))
    fireEvent.click(screen.getByLabelText('Grid view'))
    await waitFor(() => expect(document.body.textContent).toMatch(/Page\s*3\s*of\s*3/))

    // Change colour on the active grid view — this is now the only event
    // that can have caused the page resets asserted below.
    fireEvent.click(screen.getByLabelText('Color identity filter'))
    fireEvent.click(screen.getByRole('button', { name: 'White' }))

    await waitFor(() => {
      const call = rollupCalls().find((c) => c.searchParams.get('colors') === 'W')
      expect(call).toBeDefined()
      expect(call?.searchParams.get('page')).toBe('1')
      expect(call?.searchParams.get('search')).toBe('Ring')
    })
    expect(rollupCalls().some((c) => c.searchParams.get('colors') === 'W' && c.searchParams.get('page') === '3')).toBe(false)

    // The inactive list view's page must also have been reset, with the
    // identical committed colour and search carried over on activation —
    // no intermediate request combining the new colour with its old page.
    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => {
      const call = printingCalls().find((c) => c.searchParams.get('colors') === 'W')
      expect(call).toBeDefined()
      expect(call?.searchParams.get('page')).toBe('1')
      expect(call?.searchParams.get('search')).toBe('Ring')
    })
    expect(printingCalls().some((c) => c.searchParams.get('colors') === 'W' && c.searchParams.get('page') === '2')).toBe(false)
  })

  it('C27-F2-03: a colour filter change while a search is pending uses the last committed search, immediately, at page 1', async () => {
    rollupHandler = paginatedRollupHandler(3)
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))

    fireEvent.click(await screen.findByLabelText('Next page'))
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('page') === '2')).toBe(true))

    // Begin typing but do not let the debounce settle yet.
    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Sol' } })

    // Open the colour filter and pick a colour before the pause elapses.
    fireEvent.click(screen.getByLabelText('Color identity filter'))
    fireEvent.click(screen.getByRole('button', { name: 'White' }))

    await waitFor(() => {
      const call = rollupCalls().find((c) => c.searchParams.get('colors') === 'W')
      expect(call).toBeDefined()
      // Uses the last committed search (empty, since "Sol" had not settled), at page 1.
      expect(call?.searchParams.get('search') ?? '').toBe('')
      expect(call?.searchParams.get('page')).toBe('1')
    })

    act(() => { vi.advanceTimersByTime(300) })
    await waitFor(() => {
      const call = rollupCalls().find((c) => c.searchParams.get('search') === 'Sol')
      expect(call).toBeDefined()
      expect(call?.searchParams.get('page')).toBe('1')
      expect(call?.searchParams.get('colors')).toBe('W')
    })
  })

  it('F2 view-transition: switching views while a search is still pending commits it once and applies it to the newly active view', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Ring' } })
    // Switch to list view before the 300ms pause elapses.
    fireEvent.click(screen.getByLabelText('List view'))
    act(() => { vi.advanceTimersByTime(300) })

    await waitFor(() => {
      const call = printingCalls().find((c) => c.searchParams.get('search') === 'Ring')
      expect(call).toBeDefined()
    })
    // The now-inactive grid view never received a request for this search.
    expect(rollupCalls().some((c) => c.searchParams.get('search') === 'Ring')).toBe(false)
  })

  it('C27-F2-05: a late response for an earlier search cannot replace the committed later result, with distinct totals, row identity, and the refreshing indication honestly shown throughout', async () => {
    let resolveFirst: ((r: Response) => void) | undefined
    let resolveSecond: ((r: Response) => void) | undefined
    rollupHandler = (call) => {
      const search = call.searchParams.get('search') ?? ''
      if (search === 'a') return new Promise<Response>((resolve) => { resolveFirst = resolve })
      if (search === 'ab') return new Promise<Response>((resolve) => { resolveSecond = resolve })
      return Promise.resolve(defaultRollupHandler())
    }
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    await screen.findByText('Sol Ring')

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'a' } })
    act(() => { vi.advanceTimersByTime(300) })
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('search') === 'a')).toBe(true))

    fireEvent.change(input, { target: { value: 'ab' } })
    act(() => { vi.advanceTimersByTime(300) })
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('search') === 'ab')).toBe(true))

    // Neither "a" nor "ab" has resolved yet — the previous ("Sol Ring")
    // result remains visible with the refreshing indication: a genuine
    // placeholder, not a fabricated new count.
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    expect(document.querySelector('.opacity-70')).toBeTruthy()

    await act(async () => {
      resolveSecond?.(jsonResponse(rollupEnvelope([rollupRow('Result B', 222)], 1, 22)))
      await Promise.resolve()
    })
    await screen.findByText('Result B')
    expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*22\s*cards/)

    // The earlier "a" request finally settles, long after "ab" committed —
    // it must not replace the already-visible, later committed result.
    await act(async () => {
      resolveFirst?.(jsonResponse(rollupEnvelope([rollupRow('Result A (stale)', 111)], 1, 11)))
      await Promise.resolve()
    })

    expect(screen.queryByText('Result A (stale)')).not.toBeInTheDocument()
    expect(screen.getByText('Result B')).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/Showing\s*1\s*of\s*22\s*cards/)
    expect(lastHeaderSubtitleText()).toContain('22 owned')
  })

  it('F2 reversed order: toggling sort direction reflects the server-provided row order and total, not a client re-sort', async () => {
    let direction = 'asc'
    rollupHandler = (call) => {
      direction = call.searchParams.get('sortDir') ?? 'asc'
      const rows = direction === 'asc'
        ? [rollupRow('Alpha', 1), rollupRow('Zulu', 2)]
        : [rollupRow('Zulu', 2), rollupRow('Alpha', 1)]
      return Promise.resolve(jsonResponse(rollupEnvelope(rows, 1, 2)))
    }
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    await screen.findByText('Alpha')

    const ascIndex = document.body.textContent!.indexOf('Alpha')
    const zuluIndexAsc = document.body.textContent!.indexOf('Zulu')
    expect(ascIndex).toBeLessThan(zuluIndexAsc)

    fireEvent.click(screen.getByLabelText(/Sort direction/))
    await waitFor(() => expect(direction).toBe('desc'))
    await waitFor(() => {
      const zuluIndex = document.body.textContent!.indexOf('Zulu')
      const alphaIndex = document.body.textContent!.indexOf('Alpha')
      expect(zuluIndex).toBeLessThan(alphaIndex)
    })
  })

  it('F2 sort-field reset (grid-initiated): a sort-field change requests page 1 with the field\'s default direction; the inactive list view\'s page is preserved and visibly restored', async () => {
    rollupHandler = paginatedRollupHandler(3)
    printingsHandler = paginatedPrintingsHandler(3)
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))

    // Advance grid to page 3.
    fireEvent.click(await screen.findByLabelText('Next page'))
    fireEvent.click(screen.getByLabelText('Next page'))
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('page') === '3')).toBe(true))

    // Advance the (currently hidden once we switch) list view to page 2.
    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    fireEvent.click(await screen.findByLabelText('Next page'))
    await waitFor(() => expect(printingCalls().some((c) => c.searchParams.get('page') === '2')).toBe(true))
    await waitFor(() => expect(document.body.textContent).toMatch(/Page\s*2\s*of\s*3/))

    // Return to grid (still on page 3) and change the sort field.
    fireEvent.click(screen.getByLabelText('Grid view'))
    await flushMicrotasks()
    fireEvent.change(screen.getByLabelText('Sort by field'), { target: { value: 'price' } })

    await waitFor(() => {
      const call = rollupCalls().find((c) => c.searchParams.get('sort') === 'price')
      expect(call).toBeDefined()
      expect(call?.searchParams.get('page')).toBe('1')
      // Default direction for price is desc (highest value first).
      expect(call?.searchParams.get('sortDir')).toBe('desc')
    })
    // No request combines the new sort field with the stale page-3 value.
    expect(rollupCalls().some((c) => c.searchParams.get('sort') === 'price' && c.searchParams.get('page') === '3')).toBe(false)

    // The inactive (list) view's page must not have been touched by the
    // grid-only sort-field change: switching back visibly shows page 2,
    // not a reset to page 1, and issues no new-field/old-page request.
    fireEvent.click(screen.getByLabelText('List view'))
    await waitFor(() => expect(document.body.textContent).toMatch(/Page\s*2\s*of\s*3/))
    expect(printingCalls().some((c) => c.searchParams.get('sort') === 'price')).toBe(false)
    expect(printingCalls().some((c) => c.searchParams.get('page') === '1' && c.searchParams.get('sort') === 'cardName' && fetchCalls.indexOf(c) > fetchCalls.findIndex((x) => x.searchParams.get('sort') === 'price'))).toBe(false)
  })

  it('F2 sort-field reset (list-initiated): a sort-field change on list requests page 1 with the field\'s default direction; the inactive grid view\'s page is preserved and visibly restored', async () => {
    rollupHandler = paginatedRollupHandler(3)
    printingsHandler = paginatedPrintingsHandler(3)
    localStorageMock.setItem('oracle:collection:viewMode', 'list')
    renderPage()
    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))

    // Advance list to page 2.
    fireEvent.click(await screen.findByLabelText('Next page'))
    await waitFor(() => expect(printingCalls().some((c) => c.searchParams.get('page') === '2')).toBe(true))

    // Advance the (currently hidden once we switch) grid view to page 3.
    fireEvent.click(screen.getByLabelText('Grid view'))
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    fireEvent.click(await screen.findByLabelText('Next page'))
    fireEvent.click(screen.getByLabelText('Next page'))
    await waitFor(() => expect(rollupCalls().some((c) => c.searchParams.get('page') === '3')).toBe(true))
    await waitFor(() => expect(document.body.textContent).toMatch(/Page\s*3\s*of\s*3/))

    // Return to list (still on page 2) and change the sort field.
    fireEvent.click(screen.getByLabelText('List view'))
    await flushMicrotasks()
    fireEvent.change(screen.getByLabelText('Sort by field'), { target: { value: 'price' } })

    await waitFor(() => {
      const call = printingCalls().find((c) => c.searchParams.get('sort') === 'price')
      expect(call).toBeDefined()
      expect(call?.searchParams.get('page')).toBe('1')
      // Default direction for price (printing sort context) is also desc.
      expect(call?.searchParams.get('sortDir')).toBe('desc')
    })
    // No request combines the new sort field with the stale page-2 value.
    expect(printingCalls().some((c) => c.searchParams.get('sort') === 'price' && c.searchParams.get('page') === '2')).toBe(false)

    // The inactive grid view's page must not have been touched: switching
    // back visibly shows page 3, not a reset to page 1.
    fireEvent.click(screen.getByLabelText('Grid view'))
    await waitFor(() => expect(document.body.textContent).toMatch(/Page\s*3\s*of\s*3/))
    expect(rollupCalls().some((c) => c.searchParams.get('sort') === 'price')).toBe(false)
  })

  it('C27-F2-06: a failed request shows the error state and Retry reloads the page', async () => {
    rollupHandler = () => Promise.resolve(jsonResponse({ error: 'Failed to load collection data' }, false))
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()

    await screen.findByText('Failed to load collection data.')

    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('a network failure automatically retries the exact query key once, and a subsequent success clears the error', async () => {
    let attempts = 0
    const seenSearchParamStrings: string[] = []
    rollupHandler = (call) => {
      attempts += 1
      seenSearchParamStrings.push(call.searchParams.toString())
      if (attempts === 1) {
        return Promise.resolve(jsonResponse({ error: 'Failed to load collection data' }, false))
      }
      return Promise.resolve(defaultRollupHandler())
    }
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    // Matches the app's real QueryClient default (one retry) rather than
    // the deterministic `retry: false` used elsewhere in this suite.
    renderPage({ retry: 1 })

    await waitFor(() => expect(attempts).toBe(1))
    // Let react-query's default retry backoff for attempt 0 (~1s) elapse.
    await act(async () => { vi.advanceTimersByTime(1500) })
    await waitFor(() => expect(attempts).toBe(2))

    // Exactly two attempts total, both against the identical query key —
    // no drift in the request's parameters between retries.
    expect(rollupCalls()).toHaveLength(2)
    expect(seenSearchParamStrings[0]).toBe(seenSearchParamStrings[1])

    await screen.findByText('Sol Ring')
    expect(screen.queryByText('Failed to load collection data.')).not.toBeInTheDocument()
  })

  it('a request that always fails automatically retries exactly once (no third attempt), showing an explicit failure with unknown, not falsely zero, counts', async () => {
    rollupHandler = () => Promise.resolve(jsonResponse({ error: 'Failed to load collection data' }, false))
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage({ retry: 1 })

    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    await act(async () => { vi.advanceTimersByTime(1500) })
    await waitFor(() => expect(rollupCalls()).toHaveLength(2))

    // Ample further deterministic time passes — no third automatic attempt.
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(rollupCalls()).toHaveLength(2)

    // An explicit failure is shown, not a fabricated empty success.
    await screen.findByText('Failed to load collection data.')
    expect(lastHeaderSubtitleText()).not.toContain('0 owned')
    expect(lastHeaderSubtitleText()).toContain('Loading...')
    expect(document.body.textContent).not.toMatch(/Showing\s*0\s*of\s*0\s*cards/)
  })

  it('unmount cancels the pending debounce timer without issuing a stale commit', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    const { unmount } = renderPage()
    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    const callsBefore = rollupCalls().length

    const input = screen.getByLabelText('Search cards by name')
    fireEvent.change(input, { target: { value: 'Sol' } })
    unmount()

    act(() => { vi.advanceTimersByTime(400) })
    expect(rollupCalls().length).toBe(callsBefore)
  })
})

/* ─── R2: unknown counts stay unknown until active-view data exists ─── */

describe('R2: header/footer counts never claim zero while the active first request is pending', () => {
  it('does not show "0 owned" or "Showing 0 of 0 cards" while the first list request is still pending', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'list')
    printingsHandler = () => new Promise<Response>(() => {})
    renderPage()

    await waitFor(() => expect(printingCalls().length).toBeGreaterThan(0))
    // Header subtitle must not present a resolved zero.
    expect(lastHeaderSubtitleText()).not.toContain('0 owned')
    expect(lastHeaderSubtitleText()).toContain('Loading...')
    // Footer must not present a resolved empty total either.
    expect(document.body.textContent).not.toMatch(/Showing\s*0\s*of\s*0\s*cards/)
  })

  it('does not show "0 owned" or "Showing 0 of 0 cards" while the first grid request is still pending', async () => {
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    rollupHandler = () => new Promise<Response>(() => {})
    renderPage()

    await waitFor(() => expect(rollupCalls().length).toBeGreaterThan(0))
    expect(lastHeaderSubtitleText()).not.toContain('0 owned')
    expect(document.body.textContent).not.toMatch(/Showing\s*0\s*of\s*0\s*cards/)
  })

  it('a genuinely empty result (data has arrived) may show zero', async () => {
    rollupHandler = () => Promise.resolve(jsonResponse(rollupEnvelope([], 1, 0)))
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Showing\s*0\s*of\s*0\s*cards/)
    })
    expect(lastHeaderSubtitleText()).toContain('0 owned')
  })

  it('a first-request failure keeps counts unknown rather than showing zero', async () => {
    rollupHandler = () => Promise.resolve(jsonResponse({ error: 'Failed to load collection data' }, false))
    localStorageMock.setItem('oracle:collection:viewMode', 'grid')
    renderPage()

    await screen.findByText('Failed to load collection data.')
    expect(lastHeaderSubtitleText()).not.toContain('0 owned')
    expect(document.body.textContent).not.toMatch(/Showing\s*0\s*of\s*0\s*cards/)
  })
})
