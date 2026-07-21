'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmationModal } from '@/components/ConfirmationModal'

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
  /** When true, "Assign to storage" is disabled (selection includes in-deck copies) */
  hasInDeckCopies?: boolean
}

/* ─── BulkActionBar ─────────────────────────────────────────────────── */

/**
 * Persistent bottom bar that appears when selection count > 0.
 * Provides "Assign to storage", "Mark as missing", "Delete" actions,
 * and "Clear selection".
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */
export function BulkActionBar({ selectedCount, selectedIds, onClear, onSuccess, hasInDeckCopies = false }: BulkActionBarProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
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
      queryClient.invalidateQueries({ queryKey: ['storage'] })
      setSelectedLocationId('')
      onClear()
      onSuccess()
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to assign cards')
    },
  })

  // Bulk mark as missing mutation
  const bulkMissing = useMutation({
    mutationFn: async (physicalCopyIds: number[]) => {
      const results = await Promise.allSettled(
        physicalCopyIds.map(async (id) => {
          const res = await fetch(`/api/physical-copies/${id}/missing`, { method: 'POST' })
          if (!res.ok) throw new Error(`Failed for copy ${id}`)
          return res.json()
        })
      )
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      return { succeeded, failed }
    },
    onSuccess: (data) => {
      if (data.failed > 0) {
        toast.warning(`Marked ${data.succeeded} as missing, ${data.failed} failed`)
      } else {
        toast.success(`Marked ${data.succeeded} card${data.succeeded !== 1 ? 's' : ''} as missing`)
      }
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['storage'] })
      onClear()
      onSuccess()
    },
    onError: () => toast.error('Failed to mark as missing'),
  })

  // Bulk delete mutation
  const bulkDelete = useMutation({
    mutationFn: async (physicalCopyIds: number[]) => {
      const results = await Promise.allSettled(
        physicalCopyIds.map(async (id) => {
          const res = await fetch('/api/collection/instances/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ physicalCopyId: id }),
          })
          if (!res.ok) throw new Error(`Failed for copy ${id}`)
          return res.json()
        })
      )
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      return { succeeded, failed }
    },
    onSuccess: (data) => {
      setShowDeleteConfirm(false)
      if (data.failed > 0) {
        toast.warning(`Deleted ${data.succeeded}, ${data.failed} failed`)
      } else {
        toast.success(`Deleted ${data.succeeded} card${data.succeeded !== 1 ? 's' : ''}`)
      }
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['storage'] })
      onClear()
      onSuccess()
    },
    onError: () => {
      setShowDeleteConfirm(false)
      toast.error('Failed to delete cards')
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

  const isPending = bulkAssign.isPending || bulkMissing.isPending || bulkDelete.isPending

  return (
    <>
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
          disabled={hasInDeckCopies || isPending}
          className="h-7 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] outline-none transition-colors disabled:opacity-40"
          aria-label="Storage location"
          title={hasInDeckCopies ? 'Cannot assign to storage while selection includes in-deck copies' : undefined}
        >
          <option value="">Select location...</option>
          {locations?.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {/* Assign to storage button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleAssign}
          disabled={!selectedLocationId || hasInDeckCopies || isPending}
          style={{
            background: selectedLocationId && !hasInDeckCopies ? 'rgba(45,212,191,0.15)' : undefined,
            color: selectedLocationId && !hasInDeckCopies ? 'rgb(45,212,191)' : undefined,
            borderColor: selectedLocationId && !hasInDeckCopies ? 'rgba(45,212,191,0.3)' : undefined,
          }}
          title={hasInDeckCopies ? 'Cannot assign to storage while selection includes in-deck copies' : undefined}
        >
          {bulkAssign.isPending ? 'Assigning...' : 'Assign to storage'}
        </Button>

        {/* Mark as missing button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => bulkMissing.mutate(selectedIds)}
          disabled={isPending}
          style={{
            background: 'rgba(234,179,8,0.1)',
            color: 'rgb(234,179,8)',
            borderColor: 'rgba(234,179,8,0.25)',
          }}
        >
          {bulkMissing.isPending ? 'Marking...' : 'Mark as missing'}
        </Button>

        {/* Delete button */}
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isPending}
        >
          Delete
        </Button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clear selection button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isPending}
        >
          Clear selection
        </Button>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmationModal
        open={showDeleteConfirm}
        onConfirm={() => bulkDelete.mutate(selectedIds)}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Delete selected cards?"
        description={`This will permanently delete ${selectedCount} card${selectedCount !== 1 ? 's' : ''} from your collection. This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={bulkDelete.isPending}
      />
    </>
  )
}
