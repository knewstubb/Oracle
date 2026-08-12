'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  History,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Minus,
  RefreshCw,
  Loader2,
  Save,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import {
  type DeckVersion,
  type VersionDiff,
  getTriggerDescription,
} from '@/lib/deck-versions'
import { deckKeys, createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import { cn } from '@/lib/utils'

interface VersionHistoryPanelProps {
  deckId: number
  deckName: string
}

interface VersionsResponse {
  versions: DeckVersion[]
  count: number
}

export function VersionHistoryPanel({ deckId, deckName }: VersionHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<DeckVersion | null>(null)

  const queryClient = useQueryClient()

  // Fetch versions
  const { data, isLoading, error, refetch } = useQuery<VersionsResponse>({
    queryKey: [...deckKeys.detail(String(deckId)), 'versions'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/versions`)
      if (!res.ok) throw new Error('Failed to load versions')
      return res.json()
    },
    enabled: isOpen,
    staleTime: 30 * 1000, // 30s — versions change infrequently
  })

  // Create manual snapshot
  const createMutation = useMutation({
    mutationFn: async (versionName?: string) => {
      const res = await fetch(`/api/decks/${deckId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_type: 'manual',
          trigger_details: versionName ? `Named: ${versionName}` : 'Manual snapshot',
          version_name: versionName || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create snapshot')
      }
      return res.json()
    },
    onSuccess: (result) => {
      toast.success(`Snapshot created (v${result.version_number})`)
      setSnapshotName('')
      refetch()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create snapshot')
    },
  })

  // Restore version (replaces deck_cards with snapshot)
  const restoreMutation = useMutation({
    mutationFn: async (versionId: number) => {
      const res = await fetch(`/api/decks/${deckId}/versions/${versionId}/restore`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to restore version')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Version restored successfully')
      setRestoreTarget(null)
      // Invalidate deck data to refresh cards
      const { invalidateDeck } = createDeckInvalidators(queryClient)
      invalidateDeck(String(deckId))
      refetch()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to restore version')
    },
  })

  const handleCreateSnapshot = useCallback(() => {
    createMutation.mutate(snapshotName.trim() || undefined)
  }, [createMutation, snapshotName])

  const handleRestoreVersion = useCallback(() => {
    if (restoreTarget) {
      restoreMutation.mutate(restoreTarget.id)
    }
  }, [restoreMutation, restoreTarget])

  const toggleExpanded = (versionId: number) => {
    setExpandedVersionId((prev) => (prev === versionId ? null : versionId))
  }

  const formatVersionLabel = (version: DeckVersion): string => {
    if (version.version_name) {
      return `v${version.version_number}: ${version.version_name}`
    }
    const date = new Date(version.created_at)
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    })
    return `v${version.version_number} (${dateStr})`
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-[length:var(--fs-md)]"
            aria-label="View version history"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">History</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {/* Create new snapshot */}
            <div className="space-y-2">
              <label
                htmlFor="snapshot-name"
                className="text-[length:var(--fs-sm)] font-medium text-foreground"
              >
                Save Current State
              </label>
              <div className="flex gap-2">
                <Input
                  id="snapshot-name"
                  placeholder="Optional name..."
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSnapshot()
                  }}
                />
                <Button
                  onClick={handleCreateSnapshot}
                  disabled={createMutation.isPending}
                  size="sm"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>

            {/* Version list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[length:var(--fs-sm)] font-medium text-foreground">
                  Snapshots
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="h-7 px-2"
                >
                  <RefreshCw
                    className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')}
                  />
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                <div className="rounded-lg bg-destructive/10 p-3 text-[length:var(--fs-sm)] text-destructive">
                  Failed to load versions. {(error as Error).message}
                </div>
              ) : data?.versions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <Clock className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-[length:var(--fs-sm)] text-muted-foreground">
                    No snapshots yet
                  </p>
                  <p className="text-[length:var(--fs-xs)] text-muted-foreground">
                    Snapshots are created automatically on import, bulk changes, and
                    milestones
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.versions.map((version) => (
                    <VersionItem
                      key={version.id}
                      version={version}
                      isExpanded={expandedVersionId === version.id}
                      onToggle={() => toggleExpanded(version.id)}
                      onRestore={() => setRestoreTarget(version)}
                      isLatest={
                        version.version_number ===
                        Math.max(...(data.versions.map((v) => v.version_number) || [0]))
                      }
                      formatLabel={formatVersionLabel}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation modal */}
      <ConfirmationModal
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Restore Version?"
        description={
          restoreTarget
            ? `This will replace all cards in "${deckName}" with the snapshot from ${formatVersionLabel(restoreTarget)}. A new snapshot will be created before restoring so you can undo this.`
            : ''
        }
        confirmLabel="Restore"
        variant="warning"
        onConfirm={handleRestoreVersion}
        isLoading={restoreMutation.isPending}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// VersionItem — individual version row with expandable diff
// ---------------------------------------------------------------------------

interface VersionItemProps {
  version: DeckVersion
  isExpanded: boolean
  onToggle: () => void
  onRestore: () => void
  isLatest: boolean
  formatLabel: (v: DeckVersion) => string
}

function VersionItem({
  version,
  isExpanded,
  onToggle,
  onRestore,
  isLatest,
  formatLabel,
}: VersionItemProps) {
  const date = new Date(version.created_at)
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card transition-colors',
        isExpanded && 'border-primary/30'
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-accent/50"
      >
        <div className="shrink-0 pt-0.5">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[length:var(--fs-sm)]">
              v{version.version_number}
            </span>
            {version.version_name && (
              <span className="truncate text-[length:var(--fs-sm)] text-muted-foreground">
                {version.version_name}
              </span>
            )}
            {isLatest && (
              <Badge variant="secondary" className="text-[length:var(--fs-xs)]">
                Current
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[length:var(--fs-xs)] text-muted-foreground">
            <span>{dateStr}</span>
            <span>·</span>
            <span>{timeStr}</span>
            <span>·</span>
            <span>{getTriggerDescription(version.trigger_type, version.trigger_details)}</span>
          </div>
          {version.diff_from_previous && (
            <DiffBadges diff={version.diff_from_previous} />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {/* Summary stats */}
          <div className="flex gap-4 text-[length:var(--fs-xs)] text-muted-foreground">
            <span>{version.card_count} cards</span>
            <span>{version.creature_count} creatures</span>
            <span>{version.land_count} lands</span>
          </div>

          {/* Diff details */}
          {version.diff_from_previous && (
            <DiffDetails diff={version.diff_from_previous} />
          )}

          {/* Actions */}
          {!isLatest && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onRestore()
                }}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Restore
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DiffBadges — compact diff summary
// ---------------------------------------------------------------------------

function DiffBadges({ diff }: { diff: VersionDiff }) {
  if (diff.added_count === 0 && diff.removed_count === 0 && diff.changed_count === 0) {
    return null
  }

  return (
    <div className="mt-1 flex items-center gap-1.5">
      {diff.added_count > 0 && (
        <Badge
          variant="outline"
          className="h-5 gap-0.5 border-green-500/30 bg-green-500/10 px-1.5 text-green-600 dark:text-green-400"
        >
          <Plus className="h-3 w-3" />
          {diff.added_count}
        </Badge>
      )}
      {diff.removed_count > 0 && (
        <Badge
          variant="outline"
          className="h-5 gap-0.5 border-red-500/30 bg-red-500/10 px-1.5 text-red-600 dark:text-red-400"
        >
          <Minus className="h-3 w-3" />
          {diff.removed_count}
        </Badge>
      )}
      {diff.changed_count > 0 && (
        <Badge
          variant="outline"
          className="h-5 gap-0.5 border-yellow-500/30 bg-yellow-500/10 px-1.5 text-yellow-600 dark:text-yellow-400"
        >
          ~{diff.changed_count}
        </Badge>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DiffDetails — expanded diff view showing card names
// ---------------------------------------------------------------------------

function DiffDetails({ diff }: { diff: VersionDiff }) {
  const hasChanges =
    diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0

  if (!hasChanges) {
    return (
      <p className="text-[length:var(--fs-xs)] text-muted-foreground italic">
        Initial snapshot
      </p>
    )
  }

  return (
    <div className="space-y-2 text-[length:var(--fs-xs)]">
      {diff.added.length > 0 && (
        <div>
          <p className="font-medium text-green-600 dark:text-green-400">
            Added ({diff.added.length})
          </p>
          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
            {diff.added.slice(0, 5).map((name) => (
              <li key={name} className="flex items-center gap-1">
                <Plus className="h-3 w-3 text-green-500" />
                {name}
              </li>
            ))}
            {diff.added.length > 5 && (
              <li className="text-muted-foreground/70">
                +{diff.added.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {diff.removed.length > 0 && (
        <div>
          <p className="font-medium text-red-600 dark:text-red-400">
            Removed ({diff.removed.length})
          </p>
          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
            {diff.removed.slice(0, 5).map((name) => (
              <li key={name} className="flex items-center gap-1">
                <Minus className="h-3 w-3 text-red-500" />
                {name}
              </li>
            ))}
            {diff.removed.length > 5 && (
              <li className="text-muted-foreground/70">
                +{diff.removed.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {diff.changed.length > 0 && (
        <div>
          <p className="font-medium text-yellow-600 dark:text-yellow-400">
            Changed ({diff.changed.length})
          </p>
          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
            {diff.changed.slice(0, 5).map((name) => (
              <li key={name}>{name}</li>
            ))}
            {diff.changed.length > 5 && (
              <li className="text-muted-foreground/70">
                +{diff.changed.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
