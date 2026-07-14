'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, GripVertical, AlertCircle, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StorageLocation {
  id: number
  name: string
  description: string | null
  color: string
  sort_order: number
  created_at: string
}

const PRESET_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#6B7280', // grey
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StorageLocationsSettings() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6B7280')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  // Fetch locations
  const { data: locations, isLoading, error } = useQuery<StorageLocation[]>({
    queryKey: ['storage-locations'],
    queryFn: async () => {
      const res = await fetch('/api/settings/storage-locations')
      if (!res.ok) throw new Error('Failed to load storage locations')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const res = await fetch('/api/settings/storage-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to create')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-locations'] })
      setNewName('')
      setNewColor('#6B7280')
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: number; name: string; color: string }) => {
      const res = await fetch(`/api/settings/storage-locations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-locations'] })
      setEditingId(null)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/settings/storage-locations/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-locations'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
    },
  })

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return
    createMutation.mutate({ name: newName.trim(), color: newColor })
  }, [newName, newColor, createMutation])

  const handleStartEdit = useCallback((loc: StorageLocation) => {
    setEditingId(loc.id)
    setEditName(loc.name)
    setEditColor(loc.color)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editName.trim()) return
    updateMutation.mutate({ id: editingId, name: editName.trim(), color: editColor })
  }, [editingId, editName, editColor, updateMutation])

  const handleDelete = useCallback((id: number, name: string) => {
    if (window.confirm(`Delete "${name}"? Cards assigned to this location will become unassigned.`)) {
      deleteMutation.mutate(id)
    }
  }, [deleteMutation])

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-[length:var(--fs-md)] font-medium text-muted-foreground">Storage locations</h3>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="flex items-center gap-2 text-[length:var(--fs-md)] text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load storage locations.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Package className="size-4 text-muted-foreground" />
        <h3 className="text-[length:var(--fs-md)] font-medium text-muted-foreground">Storage locations</h3>
      </div>
      <p className="text-[length:var(--fs-md)] text-muted-foreground/70">
        Define where unallocated cards are physically stored. Cards in decks show their deck name instead.
      </p>

      {/* Existing locations */}
      <div className="divide-y divide-border rounded-lg border border-border">
        {locations?.length === 0 && (
          <div className="px-4 py-6 text-center text-[length:var(--fs-md)] text-muted-foreground">
            No storage locations defined yet.
          </div>
        )}

        {locations?.map((loc) => (
          <div key={loc.id} className="flex items-center gap-3 px-3 py-2">
            {editingId === loc.id ? (
              // Edit mode
              <>
                <ColorPicker value={editColor} onChange={setEditColor} />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                  className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-[length:var(--fs-md)] focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <Button size="sm" variant="ghost" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              // Display mode
              <>
                <GripVertical className="size-3.5 text-muted-foreground/40" />
                <div
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: loc.color }}
                />
                <span
                  className="flex-1 text-[length:var(--fs-md)] font-medium cursor-pointer hover:text-foreground/80"
                  onClick={() => handleStartEdit(loc)}
                >
                  {loc.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(loc.id, loc.name)}
                  className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${loc.name}`}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add new location */}
      <div className="flex items-center gap-2">
        <ColorPicker value={newColor} onChange={setNewColor} />
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New location name..."
          className="flex-1 rounded border border-border bg-transparent px-2 py-1.5 text-[length:var(--fs-md)] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreate}
          disabled={!newName.trim() || createMutation.isPending}
          className="gap-1"
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {/* Error messages */}
      {createMutation.error && (
        <p className="text-[length:var(--fs-md)] text-destructive">{(createMutation.error as Error).message}</p>
      )}
      {updateMutation.error && (
        <p className="text-[length:var(--fs-md)] text-destructive">{(updateMutation.error as Error).message}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Color Picker Sub-Component
// ---------------------------------------------------------------------------

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="size-6 rounded border border-border transition-colors hover:border-foreground/30"
        style={{ backgroundColor: value }}
        aria-label="Pick color"
      />
      {open && (
        <div className="absolute left-0 top-8 z-10 grid grid-cols-3 gap-1 rounded-lg border border-border bg-popover p-2 shadow-md">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => { onChange(color); setOpen(false) }}
              className={cn(
                'size-5 rounded-full border transition-transform hover:scale-110',
                value === color ? 'border-foreground ring-1 ring-foreground' : 'border-transparent'
              )}
              style={{ backgroundColor: color }}
              aria-label={color}
            />
          ))}
        </div>
      )}
    </div>
  )
}
