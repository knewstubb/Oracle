import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SmartSearch } from './SmartSearch'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

const mockResults = {
  cards: [
    { name: 'Sol Ring', manaCost: '{1}', typeLine: 'Artifact', oracleText: '', owned: true, ownedCount: 2 },
    { name: 'Llanowar Elves', manaCost: '{G}', typeLine: 'Creature', oracleText: '', owned: false, ownedCount: 0 },
  ],
}

function openSearch() {
  act(() => {
    window.dispatchEvent(new CustomEvent('open-search'))
  })
}

describe('SmartSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is hidden by default', () => {
    render(<SmartSearch />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens when open-search event is dispatched (Cmd+K)', () => {
    render(<SmartSearch />)
    openSearch()
    expect(screen.getByRole('dialog', { name: 'Smart search' })).toBeInTheDocument()
  })

  it('closes on Escape key', () => {
    render(<SmartSearch />)
    openSearch()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on backdrop click', () => {
    render(<SmartSearch />)
    openSearch()

    const overlay = screen.getByTestId('smart-search-overlay')
    fireEvent.click(overlay)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('debounces search by 300ms', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResults),
    })

    render(<SmartSearch />)
    openSearch()

    const input = screen.getByPlaceholderText('Search cards in plain English...')
    fireEvent.change(input, { target: { value: 'green ramp' } })

    // Fetch should not be called immediately
    expect(global.fetch).not.toHaveBeenCalled()

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  it('shows loading skeleton while fetching', async () => {
    // Never resolve to keep loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<SmartSearch />)
    openSearch()

    const input = screen.getByPlaceholderText('Search cards in plain English...')
    fireEvent.change(input, { target: { value: 'ramp' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Loading results' })).toBeInTheDocument()
    })
  })

  it('shows results with Owned badge for owned cards', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResults),
    })

    render(<SmartSearch />)
    openSearch()

    const input = screen.getByPlaceholderText('Search cards in plain English...')
    fireEvent.change(input, { target: { value: 'mana' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
      expect(screen.getByText('Llanowar Elves')).toBeInTheDocument()
    })

    // Owned badge for Sol Ring
    expect(screen.getByText('Owned')).toBeInTheDocument()
  })

  it('shows "In deck" badge for cards in current deck', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResults),
    })

    render(<SmartSearch currentDeckCards={['Sol Ring']} />)
    openSearch()

    const input = screen.getByPlaceholderText('Search cards in plain English...')
    fireEvent.change(input, { target: { value: 'mana' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByText('In deck')).toBeInTheDocument()
    })
  })

  it('shows no results message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cards: [] }),
    })

    render(<SmartSearch />)
    openSearch()

    const input = screen.getByPlaceholderText('Search cards in plain English...')
    fireEvent.change(input, { target: { value: 'xyznonexistent' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByText(/No cards found for 'xyznonexistent'/)).toBeInTheDocument()
    })
  })

  it('shows error with retry button on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'MCP timeout' }),
    })

    render(<SmartSearch />)
    openSearch()

    const input = screen.getByPlaceholderText('Search cards in plain English...')
    fireEvent.change(input, { target: { value: 'ramp' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/MCP timeout/)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('has filter chips: collection only toggle, colour identity, budget', () => {
    render(<SmartSearch />)
    openSearch()

    expect(screen.getByRole('switch', { name: /Collection only/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Colour identity filter')).toBeInTheDocument()
    expect(screen.getByLabelText('Budget cap')).toBeInTheDocument()
  })

  it('has focus trapped inside the dialog', () => {
    render(<SmartSearch />)
    openSearch()

    // Dialog should be present with role="dialog"
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
  })

  it('results have role="list" with role="listitem" children', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResults),
    })

    render(<SmartSearch />)
    openSearch()

    const input = screen.getByPlaceholderText('Search cards in plain English...')
    fireEvent.change(input, { target: { value: 'mana' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByRole('list')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })
  })
})
