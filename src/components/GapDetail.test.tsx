import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GapDetail } from './GapDetail'
import type { DeckHealthGap } from '@/lib/deck-health-gap'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const gap = (over: Partial<DeckHealthGap> = {}): DeckHealthGap => ({
  role: 'draw',
  label: 'Draw',
  have: 3,
  typical: 10,
  inDeckCount: 3,
  inDeckCards: [{ name: 'Night\'s Whisper', quantity: 1 }],
  spare: [{ name: 'Spare Draw', typeLine: 'Sorcery', status: 'SPARE', otherDeckName: null, spareCopies: 1, printingId: 'abcd1234-0000-0000-0000-000000000000', detailLine: 'Draws two cards.' }],
  inAnotherDeck: [{ name: 'Held Draw', typeLine: 'Sorcery', status: 'IN_ANOTHER_DECK', otherDeckName: 'Korvold', spareCopies: 0, printingId: null, detailLine: null }],
  coloursKnown: true,
  spareTotal: 1,
  inAnotherDeckTotal: 1,
  ...over,
})

function renderGap(fetchImpl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <GapDetail deckId={7} role="draw" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('GapDetail', () => {
  it('shows a loading state while the request is out', () => {
    renderGap(() => new Promise(() => {}))
    expect(screen.getByRole('status')).toHaveTextContent('Looking through your cards')
  })

  it('loading is visible text, not only a coloured block that can vanish on the dark panel', () => {
    renderGap(() => new Promise(() => {}))
    expect(screen.getByText('Looking through your cards…')).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('with the app default query settings, a failing request shows the error within a few seconds (no minute of silence)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'timeout' }, 504)))
    const client = new QueryClient() // app defaults, retry not overridden
    render(
      <QueryClientProvider client={client}>
        <GapDetail deckId={7} role="draw" onBack={() => {}} />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent("Couldn't check your cards")
  })

  it('never hangs silently: a request that never answers is cancelled and shows the error with Try again', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
      })))
      const client = new QueryClient()
      render(
        <QueryClientProvider client={client}>
          <GapDetail deckId={7} role="draw" onBack={() => {}} />
        </QueryClientProvider>,
      )
      expect(screen.getByRole('status')).toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(21_000) })
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check your cards")
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the heading, spare first, then the other-deck marker with the deck name only', async () => {
    renderGap(() => json(gap()))
    expect(await screen.findByRole('heading', { name: 'Draw' })).toBeInTheDocument()
    expect(screen.getByText('Spare Draw')).toBeInTheDocument()
    expect(screen.getByText('In Korvold')).toBeInTheDocument()
    const html = document.body.innerHTML
    expect(html.indexOf('Spare Draw')).toBeLessThan(html.indexOf('Held Draw'))
    expect(screen.getByRole('button', { name: /See the 3 draw cards already in this deck/ })).toBeInTheDocument()
  })

  it('row: thumbnail, then name with the badge at the far right on the same line, then the short detail line', async () => {
    renderGap(() => json(gap()))
    await screen.findByText('Spare Draw')
    const row = screen.getByText('Spare Draw').closest('li')!
    const thumb = row.querySelector('[data-testid="gap-thumb"]')!
    expect(row.firstElementChild).toBe(thumb)
    expect(thumb.querySelector('img')).not.toBeNull()
    expect(thumb.querySelector('img')!.getAttribute('loading')).toBe('lazy')
    const nameLine = screen.getByText('Spare Draw').closest('div')!
    expect(nameLine.className).toContain('justify-between')
    const badge = nameLine.querySelector('[data-testid="gap-badge"]')!
    expect(badge).toHaveTextContent('Available')
    expect(nameLine.lastElementChild).toBe(badge)
    expect(screen.getByText('Spare Draw').className).toContain('truncate')
    expect(row.querySelector('[data-testid="gap-line"]')).toHaveTextContent('Draws two cards.')
  })

  it('hover on the thumbnail shows the full card and leaving hides it; focus does the same; no image means no popover', async () => {
    renderGap(() => json(gap()))
    await screen.findByText('Spare Draw')
    const thumb = screen.getByText('Spare Draw').closest('li')!.querySelector('[data-testid="gap-thumb"]') as HTMLElement
    const portalImg = () => document.getElementById('card-hover-preview-img') as HTMLImageElement | null
    const portal = () => document.getElementById('card-hover-preview-portal') as HTMLElement | null

    fireEvent.mouseEnter(thumb, { clientX: 50, clientY: 50 })
    expect(portalImg()!.src).toContain('/large/front/a/b/abcd1234-0000-0000-0000-000000000000.jpg')
    fireEvent.mouseLeave(thumb)
    expect(portal()!.style.opacity).toBe('0')

    portalImg()!.src = ''
    fireEvent.focus(thumb)
    expect(portalImg()!.src).toContain('abcd1234-0000-0000-0000-000000000000')
    fireEvent.blur(thumb)
    expect(portal()!.style.opacity).toBe('0')

    const noImg = screen.getByText('Held Draw').closest('li')!.querySelector('[data-testid="gap-thumb"]') as HTMLElement
    expect(noImg.getAttribute('tabindex')).toBeNull()
    portalImg()!.src = ''
    fireEvent.mouseEnter(noImg, { clientX: 50, clientY: 50 })
    expect(portalImg()!.getAttribute('src') ?? '').not.toContain('abcd1234')
  })

  it('row without an image: plain box, no broken image, still shows name, badge and keeps layout', async () => {
    renderGap(() => json(gap()))
    await screen.findByText('Held Draw')
    const row = screen.getByText('Held Draw').closest('li')!
    const thumb = row.querySelector('[data-testid="gap-thumb"]')!
    expect(thumb.querySelector('img')).toBeNull()
    expect(row.querySelector('[data-testid="gap-line"]')).toBeNull()
    expect(screen.getByText('In Korvold').closest('[data-testid="gap-badge"]')).not.toBeNull()
  })

  it('tapping a card name opens the existing card preview, and it can be closed', async () => {
    renderGap(() => json(gap()))
    const name = await screen.findByRole('button', { name: 'Spare Draw' })
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => name.click())
    expect(screen.getByRole('dialog', { name: 'Card preview: Spare Draw' })).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'Close preview' }).click())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says so when you own nothing that fits', async () => {
    renderGap(() => json(gap({ spare: [], inAnotherDeck: [], spareTotal: 0, inAnotherDeckTotal: 0 })))
    expect(await screen.findByText("You don't own a card that adds draw.")).toBeInTheDocument()
  })

  it('shows a real error with Try again when the request fails', async () => {
    renderGap(() => json({ error: 'boom' }, 500))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't check your cards")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByTestId('gap-error-reason')).toHaveTextContent('server error 500')
  })

  it('shows "network error" when the request cannot be made', async () => {
    renderGap(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await screen.findByTestId('gap-error-reason')).toHaveTextContent('network error')
  })

  it('shows "unexpected reply" for a malformed reply', async () => {
    renderGap(() => json({ nonsense: true }))
    expect(await screen.findByTestId('gap-error-reason')).toHaveTextContent('unexpected reply')
  })
})
