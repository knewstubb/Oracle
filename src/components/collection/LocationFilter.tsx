'use client'

import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StorageLocation {
  id: number
  name: string
  color: string
}

export interface LocationFilterProps {
  /** Currently selected location ID (null = show all) */
  selectedLocationId: number | null
  /** Called when filter changes */
  onChange: (locationId: number | null) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * LocationFilter — dropdown to filter collection by storage location.
 * Shows "All" + user's defined locations.
 */
export function LocationFilter({ selectedLocationId, onChange }: LocationFilterProps) {
  const { data: locations } = useQuery<StorageLocation[]>({
    queryKey: ['storage-locations'],
    queryFn: async () => {
      const res = await fetch('/api/settings/storage-locations')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Don't render if no locations defined
  if (!locations || locations.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      <MapPin className="size-3 shrink-0 text-[var(--text-tertiary)]" />
      <select
        value={selectedLocationId ?? ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
        className="appearance-none rounded-md border border-[var(--border-default)] bg-[var(--bg-canvas)] py-1 pl-2 pr-6 text-[length:var(--fs-md)] text-white"
        aria-label="Filter by storage location"
      >
        <option value="" className="bg-[var(--bg-surface)] text-white">All locations</option>
        <option value="unassigned" className="bg-[var(--bg-surface)] text-white">Unassigned</option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id} className="bg-[var(--bg-surface)] text-white">
            {loc.name}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Location Badge (for display in list rows)
// ---------------------------------------------------------------------------

export interface LocationBadgeProps {
  locationName: string | null
  locationColor: string | null
  className?: string
}

/**
 * Small badge showing storage location for a collection card.
 */
export function LocationBadge({ locationName, locationColor, className }: LocationBadgeProps) {
  if (!locationName) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium',
        className
      )}
      style={{
        backgroundColor: `${locationColor || '#6B7280'}20`,
        color: locationColor || '#6B7280',
      }}
    >
      <MapPin className="size-2.5" />
      {locationName}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Location Assign Dropdown (for per-card assignment)
// ---------------------------------------------------------------------------

export interface LocationAssignProps {
  /** Current location ID for this card */
  currentLocationId: number | null
  /** Collection entry ID */
  collectionId: number
  /** Called after successful assignment */
  onAssigned?: () => void
}

/**
 * Inline dropdown for assigning a storage location to a collection card.
 */
export function LocationAssign({ currentLocationId, collectionId, onAssigned }: LocationAssignProps) {
  const { data: locations } = useQuery<StorageLocation[]>({
    queryKey: ['storage-locations'],
    queryFn: async () => {
      const res = await fetch('/api/settings/storage-locations')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const handleChange = async (value: string) => {
    const locationId = value === '' ? null : parseInt(value, 10)

    const res = await fetch('/api/collection/assign-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionIds: [collectionId],
        storageLocationId: locationId,
      }),
    })

    if (res.ok) {
      onAssigned?.()
    }
  }

  if (!locations || locations.length === 0) return null

  return (
    <select
      value={currentLocationId ?? ''}
      onChange={(e) => handleChange(e.target.value)}
      className="appearance-none rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[length:var(--fs-xs)] text-[var(--text-secondary)]"
      aria-label="Assign storage location"
    >
      <option value="" className="bg-[var(--bg-surface)]">No location</option>
      {locations.map((loc) => (
        <option key={loc.id} value={loc.id} className="bg-[var(--bg-surface)]">
          {loc.name}
        </option>
      ))}
    </select>
  )
}
