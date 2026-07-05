import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CommanderSearch } from './CommanderSearch'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

const mockCommanders = {
  cards: [
    {
      name: 'Muldrotha, the Gravetide',
      manaCost: '{3}{B}{G}{U}',
      typeLine: 'Legendary Creature — Elemental Avatar',
      oracleText: 'During each of your turns, you may play a permanent card...',
      owned: true,
      ownedCount: 1,
    },
    {
      name: 'Atraxa, Praetors\' Voice',
      manaCost: '{G}{W}{U}{B}',
      typeLine: 'Legendary Creature — Phyrexian Angel Horror',
      oracleText: 'Flying, vigilance, deathtouch, lifelink...',
      owned: false,
      ownedCount: 0,
    },
  ],
}

describe('CommanderSearch', () => {
  const mockOnSelect = vi.fn()
  const mockOnNext = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.restoreAllMocks()
    mockOnSelect.mockClear()
    mockOnNext.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders search input and Next button', () => {
    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    expect(screen.getByLabelText('Search commanders')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument()
  })

  it('shows default prompt when no query entered', () => {
    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    expect(screen.getByText(/Search for a legendary creature/)).toBeInTheDocument()
  })

  it('Next button is disabled until a commander is selected', () => {
    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const nextBtn = screen.getByRole('button', { name: /Next/i })
    expect(nextBtn).toBeDisabled()
  })

  it('debounces search by 300ms', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCommanders),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'sultai' } })

    // Not called immediately
    expect(global.fetch).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  it('searches with legendary creature filter appended', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCommanders),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'sultai' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/ai/search', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('t:legendary t:creature f:commander'),
      }))
    })
  })

  it('shows results grid of legendary creatures', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCommanders),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'graveyard' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
      expect(screen.getByText("Atraxa, Praetors' Voice")).toBeInTheDocument()
    })

    // Results use listbox/option roles
    expect(screen.getByRole('listbox', { name: 'Commander results' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('click selects a commander with accent border and Selected badge', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCommanders),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'graveyard' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
    })

    // Click to select
    const options = screen.getAllByRole('option')
    fireEvent.click(options[0])

    // Should show "Selected" badge
    expect(screen.getByText('Selected')).toBeInTheDocument()

    // aria-selected should be true
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    // onSelect callback called
    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Muldrotha, the Gravetide' })
    )
  })

  it('Next button becomes enabled after selection', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCommanders),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'graveyard' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
    })

    // Select a commander
    fireEvent.click(screen.getAllByRole('option')[0])

    // Next should now be enabled
    const nextBtn = screen.getByRole('button', { name: /Next/i })
    expect(nextBtn).not.toBeDisabled()

    // Click Next
    fireEvent.click(nextBtn)
    expect(mockOnNext).toHaveBeenCalledTimes(1)
  })

  it('has Collection only toggle', () => {
    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const toggle = screen.getByRole('switch', { name: /Collection only/i })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('sends collectionOnly flag when toggle is on', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cards: [] }),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    // Enable collection only
    fireEvent.click(screen.getByRole('switch', { name: /Collection only/i }))

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'elf' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/ai/search', expect.objectContaining({
        body: expect.stringContaining('"collectionOnly":true'),
      }))
    })
  })

  it('shows loading skeleton while fetching', async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'ramp' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Loading results' })).toBeInTheDocument()
    })
  })

  it('shows no results message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cards: [] }),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'xyznonexistent' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByText(/No commanders found/)).toBeInTheDocument()
    })
  })

  it('shows error with retry button on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'MCP timeout' }),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
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

  it('keyboard Enter selects a commander option', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCommanders),
    })

    render(<CommanderSearch onSelect={mockOnSelect} onNext={mockOnNext} />)

    const input = screen.getByLabelText('Search commanders')
    fireEvent.change(input, { target: { value: 'graveyard' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    })

    const firstOption = screen.getAllByRole('option')[0]
    fireEvent.keyDown(firstOption, { key: 'Enter' })

    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Muldrotha, the Gravetide' })
    )
    expect(screen.getByText('Selected')).toBeInTheDocument()
  })
})
