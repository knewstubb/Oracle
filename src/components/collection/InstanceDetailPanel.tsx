'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Unlink, Shuffle, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { CardHoverPreview } from '@/components/CardHoverPreview'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { StorageLocationSelect } from '@/components/collection/StorageLocationSelect'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface InstanceDetailPanelProps {
  oracleId: string
  cardName: string
  onClose: () => void
  // Selection model integration
  isInstanceSelected: (physicalCopyId: number) => boolean
  onToggleInstance: (physicalCopyId: number) => void
}

interface InstanceRow {
  physicalCopyId: number
  scryfallPrintingId: string | null
  setName: string
  collectorNumber: string
  isFoil: boolean
  condition: string | null
  isProxy: boolean
  assignedDeckName: string | null
  assignedDeckId: number | null
  assignedDeckStatus: string | null
  storageLocationId: number | null
  storageLocationName: string | null
}

interface ShortDeckEntry {
  deckCardsId: number
  deckId: number
  deckName: string
  deckStatus: string
}

interface FreeProxy {
  physicalCopyId: number
  setName: string
  condition: string | null
}

interface InstancePanelResponse {
  oracleId: string
  cardName: string
  instances: InstanceRow[]
  shortfall: number
  shortDecks: ShortDeckEntry[]
}

/* ─── Component ─────────────────────────────────────────────────────── */

/**
 * Right-side detail panel showing physical copy instances for a given oracle_id.
 *
 * Fetches real instance data from `/api/collection/instances/[oracleId]`.
 * Shows loading skeleton while fetching, per-instance checkboxes, proxy badges,
 * and assignment info (deck, storage, or unassigned).
 *
 * Per-instance actions: Unassign, Reassign (stub), Delete with inline confirm.
 * Short section: shows decks needing this card with Add Proxy / Reassign actions.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */
export function InstanceDetailPanel({
  oracleId,
  cardName,
  onClose,
  isInstanceSelected,
  onToggleInstance,
}: InstanceDetailPanelProps) {
  const queryClient = useQueryClient()
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery<InstancePanelResponse>({
    queryKey: ['instances', oracleId],
    queryFn: async () => {
      const res = await fetch(`/api/collection/instances/${oracleId}`)
      if (!res.ok) throw new Error('Failed to load instances')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  /* ─── Mutations ─────────────────────────────────────────────────── */

  const unassignMutation = useMutation({
    mutationFn: async (physicalCopyId: number) => {
      const res = await fetch('/api/collection/instances/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicalCopyId }),
      })
      if (!res.ok) throw new Error('Unassign failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances', oracleId] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      toast.success('Instance unassigned')
    },
    onError: () => toast.error('Failed to unassign'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (physicalCopyId: number) => {
      const res = await fetch('/api/collection/instances/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicalCopyId }),
      })
      if (!res.ok) throw new Error('Delete failed')
      return res.json()
    },
    onSuccess: () => {
      setConfirmingDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['instances', oracleId] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      toast.success('Instance deleted')
    },
    onError: () => toast.error('Failed to delete instance'),
  })

  return (
    <div className="flex flex-col overflow-hidden border-l border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
        <span className="flex-1 truncate text-[length:var(--fs-md)] font-medium text-[var(--text-primary)]">
          {cardName}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
          aria-label="Close detail panel"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Add proxy button */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)]">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
        >
          <Plus className="size-3.5" />
          Add Proxy
        </button>
      </div>

      {/* Instance list — split into sections */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingSkeleton />}
        {error && <ErrorState />}
        {data && data.instances.length === 0 && <EmptyState />}
        {data && data.instances.length > 0 && (
          <div className="flex flex-col">
            {/* Section: In decks (assigned copies + Short entries) */}
            {(() => {
              const inDeckInstances = data.instances.filter(i => i.assignedDeckName !== null)
              const inStorageInstances = data.instances.filter(i => i.assignedDeckName === null)
              return (
                <>
                  {(inDeckInstances.length > 0 || (data.shortDecks && data.shortDecks.length > 0)) && (
                    <div>
                      <h3 className="px-4 py-2 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-muted-foreground">
                        In decks
                      </h3>
                      {inDeckInstances.map((instance) => (
                        <InstanceRowItem
                          key={instance.physicalCopyId}
                          instance={instance}
                          cardName={data.cardName}
                          oracleId={oracleId}
                          isSelected={isInstanceSelected(instance.physicalCopyId)}
                          onToggleSelect={() => onToggleInstance(instance.physicalCopyId)}
                          isConfirmingDelete={confirmingDeleteId === instance.physicalCopyId}
                          onUnassign={() => unassignMutation.mutate(instance.physicalCopyId)}
                          onDelete={() => setConfirmingDeleteId(instance.physicalCopyId)}
                          onConfirmDelete={() => deleteMutation.mutate(instance.physicalCopyId)}
                          onCancelDelete={() => setConfirmingDeleteId(null)}
                          isUnassigning={unassignMutation.isPending && unassignMutation.variables === instance.physicalCopyId}
                          isDeleting={deleteMutation.isPending && deleteMutation.variables === instance.physicalCopyId}
                        />
                      ))}
                      {/* Short entries (decks needing this card) */}
                      {data.shortDecks && data.shortDecks.length > 0 && (
                        <>
                          {data.shortDecks.map((shortDeck) => (
                            <ShortDeckRow
                              key={shortDeck.deckCardsId}
                              shortDeck={shortDeck}
                              oracleId={oracleId}
                              cardName={data.cardName}
                              assignedInstances={inDeckInstances}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {/* Section: In storage (Sorted + Unsorted copies) */}
                  {inStorageInstances.length > 0 && (
                    <div className="border-t border-[var(--border-subtle)]">
                      <h3 className="px-4 py-2 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-muted-foreground">
                        In storage
                      </h3>
                      {inStorageInstances.map((instance) => (
                        <InstanceRowItem
                          key={instance.physicalCopyId}
                          instance={instance}
                          cardName={data.cardName}
                          oracleId={oracleId}
                          isSelected={isInstanceSelected(instance.physicalCopyId)}
                          onToggleSelect={() => onToggleInstance(instance.physicalCopyId)}
                          isConfirmingDelete={confirmingDeleteId === instance.physicalCopyId}
                          onUnassign={() => unassignMutation.mutate(instance.physicalCopyId)}
                          onDelete={() => setConfirmingDeleteId(instance.physicalCopyId)}
                          onConfirmDelete={() => deleteMutation.mutate(instance.physicalCopyId)}
                          onCancelDelete={() => setConfirmingDeleteId(null)}
                          isUnassigning={unassignMutation.isPending && unassignMutation.variables === instance.physicalCopyId}
                          isDeleting={deleteMutation.isPending && deleteMutation.variables === instance.physicalCopyId}
                        />
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

      </div>
    </div>
  )
}

/* ─── ShortDeckRow ──────────────────────────────────────────────────── */

interface ShortDeckRowProps {
  shortDeck: ShortDeckEntry
  oracleId: string
  cardName: string
  assignedInstances: InstanceRow[]
}

function ShortDeckRow({ shortDeck, oracleId, cardName, assignedInstances }: ShortDeckRowProps) {
  const queryClient = useQueryClient()
  const [showProxyPicker, setShowProxyPicker] = useState(false)
  const [showReassignDropdown, setShowReassignDropdown] = useState(false)
  const [confirmReassign, setConfirmReassign] = useState<{
    physicalCopyId: number
    sourceDeckName: string
  } | null>(null)

  // Fetch free proxies when picker is open
  const { data: proxyData, isLoading: proxiesLoading } = useQuery<{ proxies: FreeProxy[] }>({
    queryKey: ['free-proxies', cardName],
    queryFn: async () => {
      const res = await fetch(`/api/collection/instances/free-proxies?cardName=${encodeURIComponent(cardName)}`)
      if (!res.ok) throw new Error('Failed to load free proxies')
      return res.json()
    },
    enabled: showProxyPicker,
    staleTime: 30 * 1000,
  })

  // Assign mutation (reuses existing endpoint)
  const assignMutation = useMutation({
    mutationFn: async (physicalCopyId: number) => {
      const res = await fetch('/api/allocation/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckCardsId: shortDeck.deckCardsId,
          physicalCopyId,
        }),
      })
      if (!res.ok) throw new Error('Assign failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances', oracleId] })
      queryClient.invalidateQueries({ queryKey: ['collection', 'rollup-v2'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['free-proxies', cardName] })
      setShowProxyPicker(false)
      setShowReassignDropdown(false)
      setConfirmReassign(null)
      toast.success(`Assigned to ${shortDeck.deckName}`)
    },
    onError: () => toast.error('Failed to assign'),
  })

  const handleAddProxy = (proxy: FreeProxy) => {
    assignMutation.mutate(proxy.physicalCopyId)
  }

  const handleReassignFrom = (instance: InstanceRow) => {
    // Brew → Tier 3 → execute immediately
    if (instance.assignedDeckStatus === 'brew') {
      assignMutation.mutate(instance.physicalCopyId)
    } else {
      // Boxed → Tier 4 → show confirmation modal
      setConfirmReassign({
        physicalCopyId: instance.physicalCopyId,
        sourceDeckName: instance.assignedDeckName ?? 'Unknown deck',
      })
      setShowReassignDropdown(false)
    }
  }

  const handleConfirmReassign = () => {
    if (confirmReassign) {
      assignMutation.mutate(confirmReassign.physicalCopyId)
    }
  }

  const statusColor = getStatusColor(shortDeck.deckStatus)

  return (
    <div
      className="mx-4 my-2 rounded-lg p-3"
      style={{ border: '1.5px dashed rgba(255, 95, 31, 0.4)', background: 'rgba(255, 95, 31, 0.03)' }}
    >
      {/* Ghost card + deck info row */}
      <div className="flex items-center gap-3">
        {/* Ghost card placeholder */}
        <div
          className="shrink-0 rounded"
          style={{
            width: '40px',
            height: '56px',
            border: '1.5px dashed rgba(255, 95, 31, 0.3)',
            background: 'rgba(255, 95, 31, 0.05)',
          }}
        />
        {/* Deck name + status */}
        <div className="flex-1 min-w-0">
          <a
            href={`/decks/${shortDeck.deckId}`}
            className="block text-[length:var(--fs-base)] font-[number:var(--font-medium)] text-[var(--text-primary)] hover:underline"
          >
            {shortDeck.deckName}
          </a>
          <span
            className="inline-block rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium leading-none mt-0.5"
            style={{
              background: `${statusColor}20`,
              color: statusColor,
            }}
          >
            {shortDeck.deckStatus}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-2 flex items-center gap-2">
        {/* Add proxy button */}
        <button
          type="button"
          onClick={() => {
            setShowProxyPicker(!showProxyPicker)
            setShowReassignDropdown(false)
          }}
          disabled={assignMutation.isPending}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[rgba(29,158,117,0.1)] disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-3" />
          Add proxy
        </button>

        {/* Reassign from button */}
        {assignedInstances.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setShowReassignDropdown(!showReassignDropdown)
              setShowProxyPicker(false)
            }}
            disabled={assignMutation.isPending}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] disabled:pointer-events-none disabled:opacity-40"
          >
            <Shuffle className="size-3" />
            Reassign from
          </button>
        )}

        {assignMutation.isPending && (
          <Loader2 className="size-3 animate-spin text-[var(--text-tertiary)]" />
        )}
      </div>

      {/* Proxy picker sub-panel */}
      {showProxyPicker && (
        <div className="mt-2 rounded border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] p-2">
          {proxiesLoading && (
            <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">Loading proxies…</span>
          )}
          {proxyData && proxyData.proxies.length === 0 && (
            <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
              No proxies printed for this card yet
            </span>
          )}
          {proxyData && proxyData.proxies.length > 0 && (
            <div className="flex flex-col gap-1">
              {proxyData.proxies.map((proxy) => (
                <button
                  key={proxy.physicalCopyId}
                  type="button"
                  onClick={() => handleAddProxy(proxy)}
                  disabled={assignMutation.isPending}
                  className="flex items-center justify-between rounded px-2 py-1 text-[length:var(--fs-xs)] text-[var(--text-secondary)] transition-colors hover:bg-[rgba(29,158,117,0.1)] disabled:pointer-events-none disabled:opacity-40"
                >
                  <span>
                    {proxy.setName}
                    {proxy.condition ? ` (${proxy.condition})` : ''}
                  </span>
                  <span className="text-[var(--text-tertiary)]">#{proxy.physicalCopyId}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reassign from dropdown */}
      {showReassignDropdown && (
        <div className="mt-2 rounded border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] p-2">
          <div className="flex flex-col gap-1">
            {assignedInstances.map((instance) => (
              <button
                key={instance.physicalCopyId}
                type="button"
                onClick={() => handleReassignFrom(instance)}
                disabled={assignMutation.isPending}
                className="flex items-center justify-between rounded px-2 py-1 text-[length:var(--fs-xs)] text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] disabled:pointer-events-none disabled:opacity-40"
              >
                <span>{instance.assignedDeckName}</span>
                <span
                  className="rounded-full px-1 py-0.5 text-[length:10px] font-medium leading-none"
                  style={{
                    background: `${getStatusColor(instance.assignedDeckStatus ?? 'brew')}20`,
                    color: getStatusColor(instance.assignedDeckStatus ?? 'brew'),
                  }}
                >
                  {instance.assignedDeckStatus ?? 'brew'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation modal for Tier 4 (boxed) reassignment */}
      <ConfirmationModal
        open={confirmReassign !== null}
        onConfirm={handleConfirmReassign}
        onCancel={() => setConfirmReassign(null)}
        title="Reassign from boxed deck?"
        description={`This is the only copy of ${cardName} and it's currently in ${confirmReassign?.sourceDeckName ?? ''}. Removing it will make that deck incomplete. Continue?`}
        confirmLabel="Reassign"
        isLoading={assignMutation.isPending}
      />
    </div>
  )
}

/* ─── InstanceRowItem ───────────────────────────────────────────────── */

interface InstanceRowItemProps {
  instance: InstanceRow
  cardName: string
  oracleId: string
  isSelected: boolean
  onToggleSelect: () => void
  isConfirmingDelete: boolean
  onUnassign: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  isUnassigning: boolean
  isDeleting: boolean
}

function InstanceRowItem({
  instance,
  cardName,
  oracleId,
  isSelected,
  onToggleSelect,
  isConfirmingDelete,
  onUnassign,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  isUnassigning,
  isDeleting,
}: InstanceRowItemProps) {
  const queryClient = useQueryClient()
  const assignment = getAssignmentLabel(instance)
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const thumbRef = useRef<HTMLDivElement>(null)

  const scryfallSmallUrl = instance.scryfallPrintingId
    ? `https://cards.scryfall.io/small/front/${instance.scryfallPrintingId.charAt(0)}/${instance.scryfallPrintingId.charAt(1)}/${instance.scryfallPrintingId}.jpg`
    : null

  const handleMouseEnter = () => {
    if (thumbRef.current) {
      const rect = thumbRef.current.getBoundingClientRect()
      setPreviewPos({ x: rect.left, y: rect.top })
    }
    setShowPreview(true)
  }

  return (
    <div className="flex gap-3 px-4 py-2 border-b border-[rgba(255,255,255,0.04)]">
      {/* Checkbox */}
      <div className="flex items-start pt-1">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${instance.setName}`}
          className="size-3.5 cursor-pointer rounded accent-teal-500"
        />
      </div>

      {/* Thumbnail — card aspect ratio (5:7) with hover preview */}
      {scryfallSmallUrl && (
        <div
          ref={thumbRef}
          className="relative shrink-0"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={() => setShowPreview(false)}
        >
          <img
            src={scryfallSmallUrl}
            alt=""
            loading="lazy"
            className="h-[56px] w-[40px] shrink-0 rounded object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          {/* Hover preview — smart positioned via shared component */}
          {instance.scryfallPrintingId && (
            <CardHoverPreview
              scryfallId={instance.scryfallPrintingId}
              cardName={cardName}
              anchorX={previewPos.x}
              anchorY={previewPos.y}
              visible={showPreview}
            />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Primary: Assignment — clickable deck name navigates to deck profile */}
        {instance.assignedDeckId ? (
          <a
            href={`/decks/${instance.assignedDeckId}`}
            className="block text-[length:var(--fs-base)] font-[number:var(--font-medium)] text-[var(--text-primary)] hover:underline"
          >
            {assignment}
          </a>
        ) : (
          <div className="mt-0.5">
            <StorageLocationSelect
              physicalCopyId={instance.physicalCopyId}
              currentLocationId={instance.storageLocationId}
              currentLocationName={instance.storageLocationName}
              isAllocated={false}
              onAssigned={() => {
                // Refresh instance data after storage assignment
                queryClient.invalidateQueries({ queryKey: ['instances', oracleId] })
              }}
            />
          </div>
        )}

        {/* Secondary: Set + collector number */}
        <span className="block text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
          {instance.setName}{instance.collectorNumber && instance.collectorNumber !== '?' ? ` (${instance.collectorNumber})` : ''}
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {instance.isProxy && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium leading-none"
              style={{
                background: 'rgba(29, 158, 117, 0.15)',
                color: 'var(--accent-primary)',
              }}
            >
              Proxy
            </span>
          )}
          {instance.isFoil && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium leading-none"
              style={{
                background: 'rgba(167,139,250,0.15)',
                color: 'rgba(167,139,250,0.8)',
              }}
            >
              Foil
            </span>
          )}
        </div>

        {/* Action buttons */}
        {!isConfirmingDelete && (
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={onUnassign}
              disabled={isUnassigning || !instance.assignedDeckName}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-subtle)] disabled:pointer-events-none disabled:opacity-40"
              title={instance.assignedDeckName ? 'Unassign from deck' : 'Not assigned to a deck'}
            >
              {isUnassigning ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Unlink className="size-3" />
              )}
              Unassign
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-secondary)] transition-colors disabled:pointer-events-none disabled:opacity-40"
              title="Coming soon"
            >
              <Shuffle className="size-3" />
              Reassign
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors hover:bg-[rgba(226,75,74,0.1)]"
              style={{ color: 'rgba(226,75,74,0.8)' }}
              title="Delete this instance permanently"
            >
              <Trash2 className="size-3" />
              Delete
            </button>
          </div>
        )}

        {/* Inline delete confirmation */}
        {isConfirmingDelete && (
          <div
            className="mt-1.5 flex flex-col gap-1.5 rounded p-2 bg-[rgba(226,75,74,0.05)]"
            role="alertdialog"
            aria-label="Confirm deletion"
          >
            <span className="text-[length:var(--fs-base)] font-[number:var(--font-medium)] text-[rgba(255,255,255,0.7)]">
              Delete this copy permanently?
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors hover:bg-[rgba(226,75,74,0.25)] disabled:pointer-events-none disabled:opacity-50"
                style={{
                  background: 'rgba(226,75,74,0.15)',
                  color: '#E24B4A',
                  border: '0.5px solid rgba(226,75,74,0.3)',
                }}
              >
                {isDeleting && <Loader2 className="size-3 animate-spin" />}
                {isDeleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                disabled={isDeleting}
                className="rounded px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-subtle)] disabled:pointer-events-none disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>{/* end content */}
    </div>
  )
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function getAssignmentLabel(instance: InstanceRow): string {
  if (instance.assignedDeckName) {
    return instance.assignedDeckName
  }
  if (instance.storageLocationName) {
    return `Storage: ${instance.storageLocationName}`
  }
  return 'Unassigned'
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'brew': return '#60A5FA' // blue
    case 'boxed': return '#34D399' // green
    case 'archived': return '#9CA3AF' // gray
    default: return '#9CA3AF'
  }
}

/* ─── Loading / Error / Empty States ────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-[var(--border-subtle)]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-[rgba(255,255,255,0.04)]" />
        </div>
      ))}
    </div>
  )
}

function ErrorState() {
  return (
    <div className="p-4">
      <p className="text-[length:var(--fs-md)] text-[var(--text-secondary)]">
        Failed to load instances. Please try again.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="p-4">
      <p className="text-[length:var(--fs-md)] text-[var(--text-tertiary)]">
        No instances found for this card.
      </p>
    </div>
  )
}
