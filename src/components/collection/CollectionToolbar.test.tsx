import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CollectionToolbar, getPersistedViewMode } from './CollectionToolbar'
import type { CollectionToolbarProps } from './CollectionToolbar'

/* ─── localStorage mock ─────────────────────────────────────────────── */

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

/* ─── Helpers ───────────────────────────────────────────────────────── */

function renderToolbar(overrides: Partial<CollectionToolbarProps> = {}) {
  const defaults: CollectionToolbarProps = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    sortField: 'dateUpdated',
    onSortFieldChange: vi.fn(),
    sortDirection: 'desc',
    onSortDirectionChange: vi.fn(),
    viewMode: 'list',
    onViewModeChange: vi.fn(),
    selectedColors: [],
    onColorsChange: vi.fn(),
    colorMode: 'exact',
    onColorModeChange: vi.fn(),
    activeStatuses: [],
    onStatusChange: vi.fn(),
    ...overrides,
  }
  return { ...render(<CollectionToolbar {...defaults} />), props: defaults }
}

/* ─── Tests ─────────────────────────────────────────────────────────── */

describe('CollectionToolbar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Search input', () => {
    it('renders a search input', () => {
      renderToolbar()
      expect(screen.getByLabelText('Search cards by name')).toBeInTheDocument()
    })

    it('debounces search by 300ms', () => {
      const onSearchChange = vi.fn()
      renderToolbar({ onSearchChange })

      const input = screen.getByLabelText('Search cards by name')
      fireEvent.change(input, { target: { value: 'sol' } })

      // Not called yet
      expect(onSearchChange).not.toHaveBeenCalled()

      // Advance 299ms — still not called
      act(() => { vi.advanceTimersByTime(299) })
      expect(onSearchChange).not.toHaveBeenCalled()

      // Advance 1ms more (total 300ms) — now called
      act(() => { vi.advanceTimersByTime(1) })
      expect(onSearchChange).toHaveBeenCalledWith('sol')
      expect(onSearchChange).toHaveBeenCalledTimes(1)
    })

    it('displays the current search query', () => {
      renderToolbar({ searchQuery: 'existing' })
      const input = screen.getByLabelText('Search cards by name') as HTMLInputElement
      expect(input.value).toBe('existing')
    })
  })

  describe('Sort field selector', () => {
    it('displays all rollup sort field options by default', () => {
      renderToolbar()
      const select = screen.getByLabelText('Sort by field') as HTMLSelectElement
      expect(select.options).toHaveLength(6)
      expect(select.options[0].text).toBe('Date Updated')
      expect(select.options[3].text).toBe('Card Name')
      expect(select.options[5].text).toBe('Price')
    })

    it('displays printing sort field options when sortContext is printing', () => {
      renderToolbar({ sortContext: 'printing', sortField: 'cardName' })
      const select = screen.getByLabelText('Sort by field') as HTMLSelectElement
      expect(select.options).toHaveLength(5)
      expect(select.options[0].text).toBe('Card Name')
      expect(select.options[1].text).toBe('Quantity')
      expect(select.options[2].text).toBe('Set')
      expect(select.options[3].text).toBe('Price')
      expect(select.options[4].text).toBe('Used By')
    })

    it('calls onSortFieldChange when field changes', () => {
      const onSortFieldChange = vi.fn()
      const onSortDirectionChange = vi.fn()
      renderToolbar({ onSortFieldChange, onSortDirectionChange })

      const select = screen.getByLabelText('Sort by field')
      fireEvent.change(select, { target: { value: 'cardName' } })

      expect(onSortFieldChange).toHaveBeenCalledWith('cardName')
      // Also sets default direction for that field
      expect(onSortDirectionChange).toHaveBeenCalledWith('asc')
    })

    it('uses printing default directions when sortContext is printing', () => {
      const onSortFieldChange = vi.fn()
      const onSortDirectionChange = vi.fn()
      renderToolbar({ sortContext: 'printing', sortField: 'cardName', onSortFieldChange, onSortDirectionChange })

      const select = screen.getByLabelText('Sort by field')
      fireEvent.change(select, { target: { value: 'usedByCount' } })

      expect(onSortFieldChange).toHaveBeenCalledWith('usedByCount')
      expect(onSortDirectionChange).toHaveBeenCalledWith('desc')
    })
  })

  describe('Sort direction toggle', () => {
    it('toggles between asc and desc', () => {
      const onSortDirectionChange = vi.fn()
      renderToolbar({ sortDirection: 'desc', onSortDirectionChange })

      const btn = screen.getByTitle('Descending')
      fireEvent.click(btn)

      expect(onSortDirectionChange).toHaveBeenCalledWith('asc')
    })
  })

  describe('View toggle', () => {
    it('renders list and grid buttons', () => {
      renderToolbar()
      expect(screen.getByLabelText('List view')).toBeInTheDocument()
      expect(screen.getByLabelText('Grid view')).toBeInTheDocument()
    })

    it('calls onViewModeChange and persists to localStorage', () => {
      const onViewModeChange = vi.fn()
      renderToolbar({ onViewModeChange })

      fireEvent.click(screen.getByLabelText('Grid view'))

      expect(onViewModeChange).toHaveBeenCalledWith('grid')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('oracle:collection:viewMode', 'grid')
    })

    it('highlights the active view mode', () => {
      renderToolbar({ viewMode: 'grid' })
      const gridBtn = screen.getByLabelText('Grid view')
      expect(gridBtn).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('Color identity filter', () => {
    it('renders WUBRG + Colorless buttons', () => {
      renderToolbar()
      expect(screen.getByLabelText('White')).toBeInTheDocument()
      expect(screen.getByLabelText('Blue')).toBeInTheDocument()
      expect(screen.getByLabelText('Black')).toBeInTheDocument()
      expect(screen.getByLabelText('Red')).toBeInTheDocument()
      expect(screen.getByLabelText('Green')).toBeInTheDocument()
      expect(screen.getByLabelText('Colorless')).toBeInTheDocument()
    })

    it('toggles a color on click', () => {
      const onColorsChange = vi.fn()
      renderToolbar({ selectedColors: ['W'], onColorsChange })

      // Add a color
      fireEvent.click(screen.getByLabelText('Blue'))
      expect(onColorsChange).toHaveBeenCalledWith(['W', 'U'])
    })

    it('removes a color on click when already selected', () => {
      const onColorsChange = vi.fn()
      renderToolbar({ selectedColors: ['W', 'U'], onColorsChange })

      fireEvent.click(screen.getByLabelText('White (selected)'))
      expect(onColorsChange).toHaveBeenCalledWith(['U'])
    })

    it('switches between Exact and Includes modes', () => {
      const onColorModeChange = vi.fn()
      renderToolbar({ colorMode: 'exact', onColorModeChange })

      fireEvent.click(screen.getByText('Includes'))
      expect(onColorModeChange).toHaveBeenCalledWith('includes')
    })
  })

  describe('Status filter', () => {
    it('renders all status options', () => {
      renderToolbar()
      expect(screen.getByText('Fully Placed')).toBeInTheDocument()
      expect(screen.getByText('Partially Available')).toBeInTheDocument()
      expect(screen.getByText('Unplaced')).toBeInTheDocument()
      expect(screen.getByText('Over-Allocated')).toBeInTheDocument()
    })

    it('toggles status on click', () => {
      const onStatusChange = vi.fn()
      renderToolbar({ activeStatuses: [], onStatusChange })

      fireEvent.click(screen.getByText('Unplaced'))
      expect(onStatusChange).toHaveBeenCalledWith(['unplaced'])
    })

    it('removes status on click when already active', () => {
      const onStatusChange = vi.fn()
      renderToolbar({ activeStatuses: ['fullyPlaced', 'unplaced'], onStatusChange })

      fireEvent.click(screen.getByLabelText('Fully Placed (active)'))
      expect(onStatusChange).toHaveBeenCalledWith(['unplaced'])
    })
  })
})

describe('getPersistedViewMode', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('returns "list" when nothing stored', () => {
    localStorageMock.getItem.mockReturnValue(null)
    expect(getPersistedViewMode()).toBe('list')
  })

  it('returns stored value when valid', () => {
    localStorageMock.getItem.mockReturnValue('grid')
    expect(getPersistedViewMode()).toBe('grid')
  })

  it('returns "list" when stored value is invalid', () => {
    localStorageMock.getItem.mockReturnValue('cards')
    expect(getPersistedViewMode()).toBe('list')
  })
})
