'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export interface StorageLocationSelectProps {
  /** Physical copy ID to assign a location to */
  physicalCopyId: number
  /** Current storage_location_id (null = unassigned) */
  currentLocationId: number | null
  /** Current storage location name for display */
  currentLocationName: string | null
  /** Whether the physical copy is allocated to a deck */
  isAllocated: boolean
  /** Deck name if allocated (shown instead of selector) */
  assignedDeckName?: string | null
  /** Called after successful assignment to refresh parent data */
  onAssigned?: () => void
  /** Optional additional className */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * StorageLocationSelect — per-instance storage location assignment control.
 *
 * For unallocated copies:
 *   Shows a dropdown populated with the user's storage_locations.
 *   Allows assign, change, or clear storage_location_id.
 *
 * For allocated copies (assigned to a deck):
 *   Displays the deck name instead of the dropdown.
 *   storage_location_id is preserved on the physical copy but not editable here.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 */
export function StorageLocationSelect({
  physicalCopyId,
  currentLocationId,
  currentLocationName,
  isAllocated,
  assignedDeckName,
  onAssigned,
  className,
}: StorageLocationSelectProps) {
  const queryClient = useQueryClient()
  const [optimisticLocationId, setOptimisticLocationId] = useState<number | null | undefined>(undefined)

  // Fetch user's storage locations
  const { data: locations } = useQuery<StorageLocation[]>({
    queryKey: ['storage-locations'],
    queryFn: async () => {
      const res = await fetch('/api/settings/storage-locations')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Mutation to assign/clear location
  const assignMutation = useMutation({
    mutationFn: async (storageLocationId: number | null) => {
      const res = await fetch('/api/collection/assign-location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicalCopyId, storageLocationId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Assignment failed' }))
        throw new Error(err.error || 'Assignment failed')
      }
      return res.json()
    },
    onMutate: (storageLocationId) => {
      // Optimistic update
      setOptimisticLocationId(storageLocationId)
    },
    onSuccess: () => {
      setOptimisticLocationId(undefined)
      // Invalidate relevant queries so parent data refreshes
      queryClient.invalidateQueries({ queryKey: ['collection', 'rollup-v2'] })
      queryClient.invalidateQueries({ queryKey: ['collection', 'instances'] })
      onAssigned?.()
    },
    onError: () => {
      // Revert optimistic update
      setOptimisticLocationId(undefined)
    },
  })

  // The effective location ID (optimistic or actual)
  const effectiveLocationId = optimisticLocationId !== undefined
    ? optimisticLocationId
    : currentLocationId

  // ─── Allocated: show deck name, omit storage location selector ───
  if (isAllocated) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[length:var(--fs-xs)] font-medium',
          className
        )}
        style={{ color: 'rgba(107,138,255,0.9)' }}
        title={assignedDeckName ? `Assigned to ${assignedDeckName}` : 'Allocated to a deck'}
      >
        {assignedDeckName || 'Allocated'}
      </span>
    )
  }

  // ─── Unallocated: show storage location selector ─────────────────

  // If no locations are defined, show the current name or "None"
  if (!locations || locations.length === 0) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 text-[length:var(--fs-xs)] text-[var(--text-tertiary)]', className)}
      >
        <MapPin className="size-2.5" />
        {currentLocationName || 'None'}
      </span>
    )
  }

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <MapPin
        className="size-2.5 shrink-0 text-[var(--text-tertiary)]"
      />
      <select
        value={effectiveLocationId ?? ''}
        onChange={(e) => {
          const value = e.target.value
          const locationId = value === '' ? null : parseInt(value, 10)
          assignMutation.mutate(locationId)
        }}
        disabled={assignMutation.isPending}
        className={cn(
          'appearance-none rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 py-0.5 text-[length:var(--fs-xs)] transition-colors',
          effectiveLocationId ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]',
          assignMutation.isPending && 'opacity-50'
        )}
        aria-label={`Storage location for copy ${physicalCopyId}`}
      >
        <option value="" className="bg-[var(--bg-surface)] text-[var(--text-secondary)]">
          None
        </option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id} className="bg-[var(--bg-surface)] text-[var(--text-secondary)]">
            {loc.name}
          </option>
        ))}
      </select>
    </div>
  )
}
