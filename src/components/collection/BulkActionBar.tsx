'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface StorageLocation {
  id: number
  name: string
  color: string | null
}

interface BulkActionBarProps {
  selectedCount: number
  selectedIds: number[] // flat array of all selected physical_copy_ids
  onClear: () => void
  onSuccess: () => void // called after successful bulk action (for query invalidation)
}

/* ─── BulkActionBar ─────────────────────────────────────────────────── */

/**
 * Persistent bottom bar that appears when selection count > 0.
 * Provides "Assign to storage" with a location picker dropdown and "Clear selection".
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */
export function BulkActionBar({ selectedCount, selectedIds, onClear, onSuccess }: BulkActionBarProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('')
  const queryClient = useQueryClient()

  // Fetch available storage locations
  const { data: locations } = useQuery<StorageLocation[]>({
    queryKey: ['storage-locations'],
    queryFn: async () => {
      const res = await fetch('/api/settings/storage-locations')
      if (!res.ok) throw new Error('Failed to load storage locations')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Bulk assign mutation
  const bulkAssign = useMutation({
    mutationFn: async ({ physicalCopyIds, storageLocationId }: { physicalCopyIds: number[]; storageLocationId: number }) => {
      const res = await fetch('/api/collection/instances/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicalCopyIds, storageLocationId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Bulk assign failed' }))
        throw new Error(err.error || 'Bulk assign failed')
      }
      return res.json() as Promise<{ updated: number }>
    },
    onSuccess: (data) => {
      toast.success(`Assigned ${data.updated} card${data.updated !== 1 ? 's' : ''} to storage`)
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['storage-locations'] })
      setSelectedLocationId('')
      onClear()
      onSuccess()
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to assign cards')
    },
  })

  const handleAssign = () => {
    if (!selectedLocationId) {
      toast.error('Select a storage location first')
      return
    }
    if (selectedIds.length === 0) return

    bulkAssign.mutate({
      physicalCopyIds: selectedIds,
      storageLocationId: Number(selectedLocationId),
    })
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 h-[var(--row-height)] border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
    >
      {/* Selection count — aria-live for assistive tech */}
      <span
        className="text-[length:var(--fs-md)] font-medium tabular-nums text-[var(--text-secondary)]"
        role="status"
        aria-live="polite"
      >
        {selectedCount} selected
      </span>

      {/* Storage location picker */}
      <select
        value={selectedLocationId}
        onChange={(e) => setSelectedLocationId(e.target.value ? Number(e.target.value) : '')}
        className="h-7 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] outline-none transition-colors"
        aria-label="Storage location"
      >
        <option value="">Select location...</option>
        {locations?.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </select>

      {/* Assign to storage button */}
      <button
        type="button"
        onClick={handleAssign}
        disabled={!selectedLocationId || bulkAssign.isPending}
        className="rounded px-2.5 py-1 text-[length:var(--fs-md)] font-medium transition-colors disabled:opacity-40"
        style={{
          background: selectedLocationId ? 'rgba(45,212,191,0.15)' : 'var(--bg-canvas)',
          color: selectedLocationId ? 'rgb(45,212,191)' : 'var(--text-secondary)',
          border: `0.5px solid ${selectedLocationId ? 'rgba(45,212,191,0.3)' : 'var(--border-subtle)'}`,
        }}
      >
        {bulkAssign.isPending ? 'Assigning...' : 'Assign to storage'}
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clear selection button */}
      <button
        type="button"
        onClick={onClear}
        className="rounded px-2 py-1 text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
      >
        Clear selection
      </button>
    </div>
  )
}
