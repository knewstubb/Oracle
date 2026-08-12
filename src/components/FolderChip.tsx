'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Folder } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface FolderChipProps {
  id: number
  name: string
  count: number
  color?: string | null
  isSelected?: boolean
  onClick?: () => void
}

export function FolderChip({
  id,
  name,
  count,
  color,
  isSelected,
  onClick,
}: FolderChipProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const queryClient = useQueryClient()

  const moveMutation = useMutation({
    mutationFn: async (deckId: number) => {
      const res = await fetch(`/api/decks/${deckId}/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to move deck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      toast.success(`Moved to ${name}`)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-deck-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDragOver(true)
    }
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const deckId = e.dataTransfer.getData('application/x-deck-id')
    if (deckId) {
      moveMutation.mutate(parseInt(deckId, 10))
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'flex min-w-[140px] flex-col items-start gap-1 rounded-lg border px-4 py-3',
        'bg-[var(--bg-surface)] transition-colors hover:bg-[var(--bg-surface-hover)]',
        isSelected
          ? 'border-[var(--accent-primary)]'
          : 'border-[var(--border-default)]',
        isDragOver && 'border-[var(--accent-primary)] scale-105'
      )}
    >
      <div className="flex items-center gap-2">
        <Folder
          className="size-4"
          style={{ color: color ?? 'var(--text-muted)' }}
        />
        <span className="text-[length:var(--fs-sm)] font-medium text-foreground">
          {name}
        </span>
      </div>
      <span className="text-[length:var(--fs-xs)] text-muted-foreground">
        {count} {count === 1 ? 'deck' : 'decks'}
      </span>
    </button>
  )
}

export function NewFolderChip({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-[140px] items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5',
        'border-[var(--border-default)] bg-transparent',
        'transition-colors hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-subtle)]'
      )}
    >
      <span className="text-[length:var(--fs-sm)] text-muted-foreground">
        + New folder
      </span>
    </button>
  )
}
