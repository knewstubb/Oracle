'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatRelativeTime(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function SyncStatus() {
  const queryClient = useQueryClient()

  const { data: status } = useQuery<{ lastSyncedAt: string | null }>({
    queryKey: ['sync-status'],
    queryFn: () => fetch('/api/sync/status').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const syncMutation = useMutation({
    mutationFn: () => fetch('/api/sync').then(r => {
      if (!r.ok) throw new Error('Sync failed')
      return r.json()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      queryClient.invalidateQueries({ queryKey: ['shared-cards'] })
      queryClient.invalidateQueries({ queryKey: ['sync-status'] })
    },
  })

  const isSyncing = syncMutation.isPending
  const isError = syncMutation.isError

  let label: string
  if (isSyncing) {
    label = 'Syncing...'
  } else if (isError) {
    label = 'Sync failed'
  } else if (status?.lastSyncedAt) {
    label = `Synced ${formatRelativeTime(status.lastSyncedAt)}`
  } else {
    label = 'Not synced'
  }

  return (
    <button
      type="button"
      onClick={() => syncMutation.mutate()}
      disabled={isSyncing}
      aria-label={isSyncing ? 'Syncing in progress' : 'Sync now'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150',
        'motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'disabled:pointer-events-none',
        isError
          ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
          : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
      )}
    >
      {isSyncing ? (
        <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
      ) : isError ? (
        <AlertCircle className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <RefreshCw className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      )}
      <span>{label}</span>
    </button>
  )
}
