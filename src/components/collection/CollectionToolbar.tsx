'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  LayoutGrid,
  LayoutList,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  SortField,
  SortDirection,
  StatusFilter as StatusFilterType,
  ColorIdentityMode,
} from '@/lib/collection-filters'
import { DEFAULT_SORT_DIRECTIONS } from '@/lib/collection-filters'

/* ─── Constants ─────────────────────────────────────────────────────── */

const VIEW_MODE_KEY = 'oracle:collection:viewMode'

const SORT_FIELD_LABELS: Record<SortField, string> = {
  dateUpdated: 'Date Updated',
  dateAdded: 'Date Added',
  quantity: 'Quantity',
  cardName: 'Card Name',
  rarity: 'Rarity',
  price: 'Price',
}

const SORT_FIELDS: SortField[] = [
  'dateUpdated',
  'dateAdded',
  'quantity',
  'cardName',
  'rarity',
  'price',
]

const STATUS_OPTIONS: { value: StatusFilterType; label: string }[] = [
  { value: 'fullyPlaced', label: 'Fully Placed' },
  { value: 'partiallyAvailable', label: 'Partially Available' },
  { value: 'unplaced', label: 'Unplaced' },
  { value: 'overAllocated', label: 'Over-Allocated' },
]

const COLOR_OPTIONS: { value: string; label: string; hex: string }[] = [
  { value: 'W', label: 'White', hex: '#F9FAF4' },
  { value: 'U', label: 'Blue', hex: '#0E68AB' },
  { value: 'B', label: 'Black', hex: '#150B00' },
  { value: 'R', label: 'Red', hex: '#D3202A' },
  { value: 'G', label: 'Green', hex: '#00733E' },
  { value: 'C', label: 'Colorless', hex: '#9CA3AF' },
]

/* ─── Types ─────────────────────────────────────────────────────────── */

export type ViewMode = 'list' | 'grid'

export interface CollectionToolbarProps {
  /** Current search query (controlled) */
  searchQuery: string
  /** Called when search query changes (debounced internally, but raw value exposed) */
  onSearchChange: (query: string) => void

  /** Current sort field */
  sortField: SortField
  /** Called when sort field changes */
  onSortFieldChange: (field: SortField) => void

  /** Current sort direction */
  sortDirection: SortDirection
  /** Called when sort direction changes */
  onSortDirectionChange: (direction: SortDirection) => void

  /** Current view mode */
  viewMode: ViewMode
  /** Called when view mode changes */
  onViewModeChange: (mode: ViewMode) => void

  /** Currently selected colors for filter */
  selectedColors: string[]
  /** Called when color selection changes */
  onColorsChange: (colors: string[]) => void

  /** Current color identity filter mode */
  colorMode: ColorIdentityMode
  /** Called when color mode changes */
  onColorModeChange: (mode: ColorIdentityMode) => void

  /** Currently active status filters */
  activeStatuses: StatusFilterType[]
  /** Called when status filter changes */
  onStatusChange: (statuses: StatusFilterType[]) => void
}

/* ─── Main Component ────────────────────────────────────────────────── */

export function CollectionToolbar({
  searchQuery,
  onSearchChange,
  sortField,
  onSortFieldChange,
  sortDirection,
  onSortDirectionChange,
  viewMode,
  onViewModeChange,
  selectedColors,
  onColorsChange,
  colorMode,
  onColorModeChange,
  activeStatuses,
  onStatusChange,
}: CollectionToolbarProps) {
  // ─── Internal debounced search ─────────────────────────────────
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external value → local on prop change (e.g. clear from parent)
  useEffect(() => {
    setLocalSearch(searchQuery)
  }, [searchQuery])

  const handleSearchInput = useCallback(
    (value: string) => {
      setLocalSearch(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onSearchChange(value)
      }, 300)
    },
    [onSearchChange]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ─── View mode persistence ─────────────────────────────────────
  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      onViewModeChange(mode)
      try {
        localStorage.setItem(VIEW_MODE_KEY, mode)
      } catch {
        // localStorage unavailable — silently skip
      }
    },
    [onViewModeChange]
  )

  // ─── Sort field change (also sets default direction for that field) ─
  const handleSortFieldChange = useCallback(
    (field: SortField) => {
      onSortFieldChange(field)
      onSortDirectionChange(DEFAULT_SORT_DIRECTIONS[field])
    },
    [onSortFieldChange, onSortDirectionChange]
  )

  const toggleDirection = useCallback(() => {
    onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')
  }, [sortDirection, onSortDirectionChange])

  return (
    <div
      className="flex flex-col gap-2 px-4 py-2.5"
      style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}
    >
      {/* ─── Top Row: Search + Sort + View Toggle ─────────────── */}
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative max-w-[260px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-[13px] -translate-y-1/2"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search cards..."
            value={localSearch}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="w-full rounded-md px-2.5 py-1.5 pl-[30px] text-xs text-white placeholder:text-[rgba(255,255,255,0.2)]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '0.5px solid rgba(255,255,255,0.1)',
            }}
            aria-label="Search cards by name"
          />
        </div>

        {/* Sort field selector */}
        <div className="relative">
          <select
            value={sortField}
            onChange={(e) => handleSortFieldChange(e.target.value as SortField)}
            className="appearance-none rounded-md py-1.5 pl-2.5 pr-7 text-xs text-white"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '0.5px solid rgba(255,255,255,0.1)',
            }}
            aria-label="Sort by field"
          >
            {SORT_FIELDS.map((field) => (
              <option key={field} value={field} className="bg-[#1a1a1a] text-white">
                {SORT_FIELD_LABELS[field]}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            aria-hidden="true"
          />
        </div>

        {/* Sort direction toggle */}
        <button
          type="button"
          onClick={toggleDirection}
          className="rounded-md p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.1)',
          }}
          aria-label={`Sort direction: ${sortDirection === 'asc' ? 'ascending' : 'descending'}`}
          title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDirection === 'asc' ? (
            <ArrowUpAZ className="size-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
          ) : (
            <ArrowDownAZ className="size-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
          )}
        </button>

        <div className="flex-1" />

        {/* View toggle (List/Grid) */}
        <div
          className="flex overflow-hidden rounded-md"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.08)',
          }}
        >
          <button
            type="button"
            className={cn(
              'p-[5px] text-[13px]',
              viewMode === 'list' ? 'text-[#1D9E75]' : 'text-[rgba(255,255,255,0.25)]'
            )}
            style={viewMode === 'list' ? { background: 'rgba(29,158,117,0.15)' } : undefined}
            onClick={() => handleViewModeChange('list')}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
          >
            <LayoutList className="size-4" />
          </button>
          <button
            type="button"
            className={cn(
              'p-[5px] text-[13px]',
              viewMode === 'grid' ? 'text-[#1D9E75]' : 'text-[rgba(255,255,255,0.25)]'
            )}
            style={viewMode === 'grid' ? { background: 'rgba(29,158,117,0.15)' } : undefined}
            onClick={() => handleViewModeChange('grid')}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid className="size-4" />
          </button>
        </div>
      </div>

      {/* ─── Bottom Row: Color Identity Filter + Status Filter ── */}
      <div className="flex items-center gap-3">
        <ColorIdentityFilter
          selectedColors={selectedColors}
          onColorsChange={onColorsChange}
          mode={colorMode}
          onModeChange={onColorModeChange}
        />

        <div
          className="h-4 w-px shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          aria-hidden="true"
        />

        <StatusFilterControl
          activeStatuses={activeStatuses}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  )
}

/* ─── ColorIdentityFilter Sub-component ─────────────────────────────── */

interface ColorIdentityFilterProps {
  selectedColors: string[]
  onColorsChange: (colors: string[]) => void
  mode: ColorIdentityMode
  onModeChange: (mode: ColorIdentityMode) => void
}

function ColorIdentityFilter({
  selectedColors,
  onColorsChange,
  mode,
  onModeChange,
}: ColorIdentityFilterProps) {
  const toggleColor = useCallback(
    (color: string) => {
      if (selectedColors.includes(color)) {
        onColorsChange(selectedColors.filter((c) => c !== color))
      } else {
        onColorsChange([...selectedColors, color])
      }
    },
    [selectedColors, onColorsChange]
  )

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Color identity filter">
      {/* Color buttons */}
      {COLOR_OPTIONS.map((color) => {
        const isSelected = selectedColors.includes(color.value)
        return (
          <button
            key={color.value}
            type="button"
            onClick={() => toggleColor(color.value)}
            className={cn(
              'flex size-[22px] items-center justify-center rounded-full transition-all',
              isSelected
                ? 'ring-1 ring-white/30'
                : 'hover:ring-1 hover:ring-white/20'
            )}
            style={{
              background: isSelected ? color.hex : 'rgba(255,255,255,0.04)',
              border: isSelected
                ? `1.5px solid ${color.hex === '#150B00' ? 'rgba(255,255,255,0.3)' : color.hex}`
                : '1px solid rgba(255,255,255,0.12)',
            }}
            aria-label={`${color.label}${isSelected ? ' (selected)' : ''}`}
            aria-pressed={isSelected}
            title={color.label}
          >
            <span
              className="text-[9px] font-bold leading-none"
              style={{
                color: isSelected
                  ? (color.value === 'B' || color.value === 'U' || color.value === 'G' ? '#fff' : '#1a1a1a')
                  : color.hex === '#150B00' ? 'rgba(255,255,255,0.5)' : color.hex,
                opacity: isSelected ? 1 : 0.7,
              }}
            >
              {color.value}
            </span>
          </button>
        )
      })}

      {/* Mode toggle */}
      <div
        className="ml-1 flex overflow-hidden rounded text-[10px]"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(255,255,255,0.1)',
        }}
        role="radiogroup"
        aria-label="Color filter mode"
      >
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'exact'}
          onClick={() => onModeChange('exact')}
          className={cn(
            'px-2 py-[3px] transition-colors',
            mode === 'exact'
              ? 'bg-[rgba(29,158,117,0.15)] text-[#1D9E75]'
              : 'text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.5)]'
          )}
        >
          Exact
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'includes'}
          onClick={() => onModeChange('includes')}
          className={cn(
            'px-2 py-[3px] transition-colors',
            mode === 'includes'
              ? 'bg-[rgba(29,158,117,0.15)] text-[#1D9E75]'
              : 'text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.5)]'
          )}
        >
          Includes
        </button>
      </div>
    </div>
  )
}

/* ─── StatusFilter Sub-component ────────────────────────────────────── */

interface StatusFilterControlProps {
  activeStatuses: StatusFilterType[]
  onStatusChange: (statuses: StatusFilterType[]) => void
}

function StatusFilterControl({
  activeStatuses,
  onStatusChange,
}: StatusFilterControlProps) {
  const toggleStatus = useCallback(
    (status: StatusFilterType) => {
      if (activeStatuses.includes(status)) {
        onStatusChange(activeStatuses.filter((s) => s !== status))
      } else {
        onStatusChange([...activeStatuses, status])
      }
    },
    [activeStatuses, onStatusChange]
  )

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Status filter">
      {STATUS_OPTIONS.map((option) => {
        const isActive = activeStatuses.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggleStatus(option.value)}
            className={cn(
              'rounded-full px-2.5 py-[4px] text-[11px] transition-colors',
              isActive
                ? 'border-[rgba(29,158,117,0.4)] bg-[rgba(29,158,117,0.1)] text-[#1D9E75]'
                : 'text-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.5)]'
            )}
            style={{
              border: isActive
                ? '0.5px solid rgba(29,158,117,0.4)'
                : '0.5px solid rgba(255,255,255,0.1)',
            }}
            aria-label={`${option.label}${isActive ? ' (active)' : ''}`}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Hook: useViewMode ─────────────────────────────────────────────── */

/**
 * Hook to read the persisted view mode from localStorage on mount.
 * Returns the initial value to use for the viewMode state.
 */
export function getPersistedViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'list'
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === 'list' || stored === 'grid') return stored
  } catch {
    // localStorage unavailable
  }
  return 'list'
}
