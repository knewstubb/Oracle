'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Sparkles, ArrowRightLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface InstanceRow {
  physicalCopyId: number
  setName: string
  setCode: string
  collectorNumber: string
  isFoil: boolean
  condition: string | null
  isProxy: boolean
  assignedDeckName: string | null
  storageLocationName: string | null
  storageLocationId: number | null
}

interface InstancesResponse {
  cardName: string
  oracleId: string
  instances: InstanceRow[]
  shortfall: number
}

interface StorageLocation {
  id: number
  name: string
  color: string
}

export interface InstancePanelProps {
  oracleId: string
  onClose: () => void
  // Selection model integration (optional — when provided, checkboxes render)
  isSelected?: (oracleId: string, physicalCopyId: number) => boolean
  toggleInstance?: (oracleId: string, physicalCopyId: number) => void
}

/* ─── Condition label helper ────────────────────────────────────────── */

function formatCondition(condition: string | null): string {
  if (!condition) return '—'
  const map: Record<string, string> = {
    near_mint: 'NM',
    lightly_played: 'LP',
    moderately_played: 'MP',
    heavily_played: 'HP',
    damaged: 'DMG',
  }
  return map[condition] || condition
}

/* ─── StorageLocationSelector ───────────────────────────────────────── */

function StorageLocationSelector({
  physicalCopyId,
  currentLocationId,
}: {
  physicalCopyId: number
  currentLocationId: number | null
}) {
  const queryClient = useQueryClient()

  const { data: locations } = useQuery<StorageLocation[]>({
    queryKey: ['storage-locations'],
    queryFn: async () => {
      const res = await fetch('/api/settings/storage-locations')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const assignMutation = useMutation({
    mutationFn: async (storageLocationId: number | null) => {
      const res = await fetch('/api/collection/assign-location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          physicalCopyId,
          storageLocationId,
        }),
      })
      if (!res.ok) throw new Error('Failed to assign location')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', 'instances'] })
    },
  })

  return (
    <select
      value={currentLocationId ?? ''}
      onChange={(e) => {
        const val = e.target.value
        assignMutation.mutate(val ? Number(val) : null)
      }}
      className="rounded px-1.5 py-0.5 text-[length:var(--fs-md)] bg-[rgba(255,255,255,0.05)] border border-[var(--border-default)] text-[var(--text-secondary)]"
      aria-label="Assign storage location"
    >
      <option value="" className="bg-[var(--bg-surface)]">None</option>
      {(locations || []).map((loc) => (
        <option key={loc.id} value={loc.id} className="bg-[var(--bg-surface)]">
          {loc.name}
        </option>
      ))}
    </select>
  )
}

/* ─── InstancePanel ─────────────────────────────────────────────────── */

export function InstancePanel({ oracleId, onClose, isSelected, toggleInstance }: InstancePanelProps) {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<InstancesResponse>({
    queryKey: ['collection', 'instances', oracleId],
    queryFn: async () => {
      const res = await fetch(`/api/collection/instances/${encodeURIComponent(oracleId)}`)
      if (!res.ok) throw new Error('Failed to load instance data')
      return res.json()
    },
    staleTime: 60 * 1000, // 1 minute — instance data changes more frequently
  })

  const addProxyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/collection/instances/add-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oracleId }),
      })
      if (!res.ok) throw new Error('Failed to add proxy')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', 'instances', oracleId] })
      queryClient.invalidateQueries({ queryKey: ['collection', 'rollup-v2'] })
    },
  })

  /* ─── Loading State ─────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader cardName="Loading..." onClose={onClose} />
        <div className="flex-1 p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-[rgba(255,255,255,0.04)]"
            />
          ))}
        </div>
      </div>
    )
  }

  /* ─── Error State ───────────────────────────────────────────────── */

  if (error || !data) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader cardName="Error" onClose={onClose} />
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-[length:var(--fs-md)] text-[var(--text-secondary)]">
            Failed to load instance data.
          </p>
        </div>
      </div>
    )
  }

  const { cardName, instances, shortfall } = data

  /* ─── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col h-full">
      <PanelHeader cardName={cardName} onClose={onClose} />

      {/* Shortfall actions */}
      {shortfall > 0 && (
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{
            background: 'rgba(245,158,11,0.06)',
            borderBottom: '0.5px solid rgba(245,158,11,0.15)',
          }}
        >
          <span
            className="text-[length:var(--fs-md)] font-medium"
            style={{ color: 'rgba(245,158,11,0.9)' }}
          >
            Shortfall: {shortfall}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => addProxyMutation.mutate()}
              disabled={addProxyMutation.isPending}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[length:var(--fs-md)] font-medium transition-colors hover:bg-[rgba(167,139,250,0.15)]"
              style={{
                color: 'rgba(167,139,250,0.9)',
                border: '0.5px solid rgba(167,139,250,0.3)',
              }}
              aria-label="Add proxy copy"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              Add Proxy
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[length:var(--fs-md)] font-medium transition-colors hover:bg-[rgba(107,138,255,0.15)]"
              style={{
                color: 'rgba(107,138,255,0.9)',
                border: '0.5px solid rgba(107,138,255,0.3)',
              }}
              aria-label="Reassign copies"
            >
              <ArrowRightLeft className="size-3" aria-hidden="true" />
              Reassign
            </button>
          </div>
        </div>
      )}

      {/* Instance list */}
      <div className="flex-1 overflow-y-auto">
        {instances.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[length:var(--fs-md)] text-[var(--text-tertiary)]">
            No physical copies found.
          </div>
        ) : (
          <div className="divide-y divide-[rgba(255,255,255,0.04)]">
            {instances.map((instance) => (
              <InstanceRowItem
                key={instance.physicalCopyId}
                instance={instance}
                oracleId={oracleId}
                isSelected={isSelected}
                toggleInstance={toggleInstance}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer summary */}
      <div className="flex items-center px-4 py-2 border-t border-[var(--border-subtle)]">
        <span className="text-[length:var(--fs-md)] text-[var(--text-tertiary)]">
          {instances.length} cop{instances.length !== 1 ? 'ies' : 'y'}
          {instances.filter(i => i.isProxy).length > 0 && (
            <> · {instances.filter(i => i.isProxy).length} proxy</>
          )}
          {instances.filter(i => i.assignedDeckName).length > 0 && (
            <> · {instances.filter(i => i.assignedDeckName).length} allocated</>
          )}
        </span>
      </div>
    </div>
  )
}

/* ─── PanelHeader ───────────────────────────────────────────────────── */

function PanelHeader({ cardName, onClose }: { cardName: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
      <h2 className="flex-1 truncate text-[length:var(--fs-md)] font-medium text-[var(--text-primary)]">
        {cardName}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
        aria-label="Close panel"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

/* ─── InstanceRowItem ───────────────────────────────────────────────── */

function InstanceRowItem({
  instance,
  oracleId,
  isSelected,
  toggleInstance,
}: {
  instance: InstanceRow
  oracleId: string
  isSelected?: (oracleId: string, physicalCopyId: number) => boolean
  toggleInstance?: (oracleId: string, physicalCopyId: number) => void
}) {
  const isAllocated = instance.assignedDeckName !== null
  const selectionEnabled = isSelected !== undefined && toggleInstance !== undefined
  const checked = selectionEnabled ? isSelected(oracleId, instance.physicalCopyId) : false

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{
        borderLeft: instance.isProxy
          ? '2px solid rgba(167,139,250,0.5)'
          : isAllocated
            ? '2px solid rgba(29,158,117,0.5)'
            : '2px solid transparent',
      }}
    >
      {/* Selection checkbox (only rendered when selection model is provided) */}
      {selectionEnabled && (
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleInstance(oracleId, instance.physicalCopyId)}
          className="size-3.5 shrink-0 cursor-pointer rounded accent-[rgba(107,138,255,0.9)]"
          aria-label={`Select ${instance.setName || instance.setCode || 'Unknown Set'} #${instance.collectorNumber || '?'}`}
        />
      )}
      {/* Set & collector info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="truncate text-[length:var(--fs-md)] font-medium text-[var(--text-primary)]"
            title={instance.setName}
          >
            {instance.setName || instance.setCode || 'Unknown Set'}
          </span>
          {instance.collectorNumber && (
            <span className="shrink-0 text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
              #{instance.collectorNumber}
            </span>
          )}
        </div>

        {/* Badges row */}
        <div className="mt-0.5 flex items-center gap-1.5">
          {instance.isFoil && (
            <span
              className="rounded px-1 py-px text-[9px] font-medium uppercase"
              style={{
                background: 'rgba(234,179,8,0.12)',
                color: 'rgba(234,179,8,0.8)',
                border: '0.5px solid rgba(234,179,8,0.2)',
              }}
            >
              Foil
            </span>
          )}
          {instance.isProxy && (
            <span
              className="rounded px-1 py-px text-[9px] font-medium uppercase"
              style={{
                background: 'rgba(167,139,250,0.12)',
                color: 'rgba(167,139,250,0.8)',
                border: '0.5px solid rgba(167,139,250,0.2)',
              }}
            >
              Proxy
            </span>
          )}
          <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
            {formatCondition(instance.condition)}
          </span>
        </div>
      </div>

      {/* Assignment / Storage */}
      <div className="shrink-0 text-right">
        {isAllocated ? (
          <span
            className={cn('rounded px-1.5 py-0.5 text-[length:var(--fs-md)]')}
            style={{
              background: 'rgba(29,158,117,0.1)',
              color: 'rgba(29,158,117,0.9)',
              border: '0.5px solid rgba(29,158,117,0.25)',
            }}
          >
            {instance.assignedDeckName}
          </span>
        ) : (
          <StorageLocationSelector
            physicalCopyId={instance.physicalCopyId}
            currentLocationId={instance.storageLocationId}
          />
        )}
      </div>
    </div>
  )
}
