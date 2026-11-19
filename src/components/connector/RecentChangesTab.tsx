'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  connectorKeys, decidePending, fetchChanges, fetchPending, undoGroup,
  type ChangeRowData, type PendingItem, type UndoRefusal,
} from './api'
import { ChangeRow, type ChangeStatus } from './ChangeRow'
import { PendingCard } from './PendingCard'
import { dayKey, dayLabel } from './format'

interface ChangeGroup {
  groupId: string
  rows: ChangeRowData[]
  at: string
}

export function groupChanges(rows: ChangeRowData[]): ChangeGroup[] {
  const map = new Map<string, ChangeRowData[]>()
  for (const r of rows) map.set(r.group_id, [...(map.get(r.group_id) ?? []), r])
  return [...map.entries()]
    .map(([groupId, rs]) => ({ groupId, rows: rs, at: rs.reduce((m, r) => (r.created_at > m ? r.created_at : m), rs[0].created_at) }))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
}

function ErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--signal-critical)] p-3 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
      <span className="min-w-0 flex-1">{message}</span>
      <Button type="button" variant="outline" className="min-h-[44px]" onClick={onRetry}>Try again</Button>
    </div>
  )
}

function SkeletonRows({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="space-y-2">
      <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">{label}</p>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

type UndoState = { status: ChangeStatus; busy?: boolean; refusal?: UndoRefusal | null; refusalText?: string | null; undoneAt?: string }

export function RecentChangesTab() {
  const qc = useQueryClient()
  const changes = useQuery({ queryKey: connectorKeys.changes, queryFn: () => fetchChanges(), retry: false })
  const pending = useQuery({ queryKey: connectorKeys.pending, queryFn: fetchPending, retry: false })

  const [undoState, setUndoState] = useState<Record<string, UndoState>>({})
  const [busyPending, setBusyPending] = useState<Record<string, 'approve' | 'decline'>>({})
  const [localPending, setLocalPending] = useState<Record<string, Partial<PendingItem> & { stale?: string | null; hidden?: boolean }>>({})
  const [announce, setAnnounce] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: connectorKeys.changes })
    qc.invalidateQueries({ queryKey: connectorKeys.pending })
    qc.invalidateQueries({ queryKey: connectorKeys.pendingCount })
  }, [qc])

  /** After a row's action disappears, move focus to the next action in the list, else to the heading. */
  const focusNext = useCallback((fromEl: Element | null) => {
    requestAnimationFrame(() => {
      const all = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-action]:not([disabled])') ?? [])
      const idx = fromEl ? all.findIndex((el) => fromEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) : -1
      const target = idx >= 0 ? all[idx] : all[all.length - 1]
      ;(target ?? headingRef.current)?.focus()
    })
  }, [])

  const undoMutation = useMutation({ mutationFn: (g: ChangeGroup) => undoGroup(g.groupId) })

  const doUndo = async (g: ChangeGroup) => {
    const first = g.rows[0]
    const trigger = document.activeElement
    setUndoState((s) => ({ ...s, [g.groupId]: { status: 'done', busy: true } }))
    const out = await undoMutation.mutateAsync(g)
    if (out.ok) {
      setUndoState((s) => ({ ...s, [g.groupId]: { status: 'undone', undoneAt: new Date().toISOString() } }))
      const msg = g.rows.length > 1 ? `Undone. ${g.rows.length} changes reversed.` : `Undone. ${first.card_name} is off ${first.deck_name ?? 'the deck'}'s list.`
      toast(msg)
      setAnnounce(`Undone. ${first.deck_name ?? 'The deck'} is as it was before.`)
      qc.invalidateQueries({ queryKey: connectorKeys.changes })
      focusNext(trigger)
    } else if ('refused' in out) {
      setUndoState((s) => ({ ...s, [g.groupId]: { status: 'refused', refusal: out.refused, refusalText: out.text ?? null } }))
      setAnnounce("Can't undo this one. Nothing was changed.")
    } else {
      setUndoState((s) => ({ ...s, [g.groupId]: { status: 'failed' } }))
      setAnnounce("We couldn't undo this. Nothing was changed.")
    }
  }

  const decide = async (item: PendingItem, action: 'approve' | 'decline') => {
    const trigger = document.activeElement
    setBusyPending((b) => ({ ...b, [item.id]: action }))
    const out = await decidePending(item.id, action)
    setBusyPending((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== item.id)))
    if (out.ok) {
      if (action === 'approve') {
        const msg = `Approved. ${out.summary ?? item.summary ?? item.title ?? 'The change was applied.'}`
        toast(msg)
        setAnnounce(msg)
        setLocalPending((l) => ({ ...l, [item.id]: { hidden: true } }))
      } else {
        setAnnounce('Declined. Nothing changed. Claude was told no.')
        setLocalPending((l) => ({ ...l, [item.id]: { status: 'declined', decided_at: new Date().toISOString() } }))
      }
      refreshAll()
      focusNext(trigger)
    } else {
      const reason = out.reason ?? (out.stale ? 'The deck changed since Claude asked' : "Something went wrong, so it wasn't applied")
      setLocalPending((l) => ({ ...l, [item.id]: { stale: reason } }))
      setAnnounce(`Couldn't apply. ${reason}. Nothing was moved.`)
    }
  }

  const pendingItems = useMemo(() => {
    const merged = (pending.data ?? [])
      .map((p) => ({ ...p, ...localPending[p.id] }) as PendingItem & { stale?: string | null; hidden?: boolean })
      .filter((p) => !p.hidden)
    return merged.sort((a, b) => Number(b.status === 'waiting') - Number(a.status === 'waiting'))
  }, [pending.data, localPending])
  const waitingCount = pendingItems.filter((p) => p.status === 'waiting' && !p.stale).length

  const groups = useMemo(() => groupChanges(changes.data ?? []), [changes.data])
  const byDay = useMemo(() => {
    const out: { key: string; label: string; groups: ChangeGroup[] }[] = []
    for (const g of groups) {
      const key = dayKey(g.at)
      const last = out[out.length - 1]
      if (last && last.key === key) last.groups.push(g)
      else out.push({ key, label: dayLabel(g.at), groups: [g] })
    }
    return out
  }, [groups])

  const loading = changes.isPending && pending.isPending
  const hasPending = pendingItems.length > 0
  const changesEmpty = changes.isSuccess && groups.length === 0
  const everythingEmpty = changesEmpty && pending.isSuccess && !hasPending

  return (
    <div ref={listRef} className="space-y-6" data-testid="recent-changes">
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">Recent changes</h2>
      <div role="status" aria-live="polite" className="sr-only">{announce}</div>

      {loading && <SkeletonRows label="Loading Claude's recent changes…" />}

      {/* Pending first. Its own error never hides the applied list, and an error is never shown as "none". */}
      {pending.isError && (
        <ErrorAlert message="We couldn't check whether Claude is waiting for your yes. This doesn't mean nothing is waiting." onRetry={() => pending.refetch()} />
      )}
      {hasPending && (
        <section id="waiting" aria-labelledby="waiting-h" className="space-y-3">
          <h3 id="waiting-h" className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)]">
            Waiting for your yes{waitingCount > 0 ? ` (${waitingCount})` : ''}
          </h3>
          <div className="flex items-start gap-2 rounded-lg border border-[var(--border-default)] p-3 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              <b>Only you can approve these.</b>{' '}Claude can ask, but it can&apos;t say yes for you. That&apos;s true even if Claude&apos;s own
              &quot;ask me first&quot; prompts are switched off. Nothing below has happened yet.
            </p>
          </div>
          {pendingItems.map((p) => (
            <PendingCard
              key={p.id}
              item={p}
              staleReason={p.stale}
              busy={busyPending[p.id] ?? null}
              onApprove={(i) => decide(i, 'approve')}
              onDecline={(i) => decide(i, 'decline')}
              onDismiss={(i) => setLocalPending((l) => ({ ...l, [i.id]: { hidden: true } }))}
            />
          ))}
        </section>
      )}

      {changes.isError && (
        <ErrorAlert message="We couldn't load Claude's recent changes. This doesn't mean there are none." onRetry={() => changes.refetch()} />
      )}

      {changes.isPending && !loading && <SkeletonRows label="Loading Claude's recent changes…" />}

      {everythingEmpty && (
        <div className="rounded-lg border border-[var(--border-subtle)] p-6 text-center" data-testid="changes-empty">
          <p className="text-[length:var(--fs-base)] font-medium text-[var(--text-primary)]">Claude hasn&apos;t changed anything in the last 7 days</p>
          <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            When Claude adds, removes or moves a card, it will show up here with an Undo button.
          </p>
        </div>
      )}

      {changes.isSuccess && groups.length > 0 && (
        <section aria-labelledby="applied-h" className="space-y-4">
          <div>
            <h3 id="applied-h" className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)]">Changes Claude made</h3>
            <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
              Showing the last 7 days. Older changes are kept in Oracle&apos;s record but can&apos;t be undone here.
            </p>
          </div>
          {byDay.map((day) => (
            <div key={day.key} className="space-y-2">
              <h4 className="text-[length:var(--fs-sm)] font-medium text-[var(--text-secondary)]">{day.label}</h4>
              <ul className="space-y-2">
                {day.groups.map((g) => {
                  const first = g.rows[0]
                  const local = undoState[g.groupId]
                  const allUndone = g.rows.every((r) => r.undone_at)
                  const blocker = g.rows.find((r) => r.undo_blocker)?.undo_blocker ?? null
                  const status: ChangeStatus = local?.status ?? (allUndone ? 'undone' : blocker ? 'refused' : 'done')
                  return (
                    <ChangeRow
                      key={g.groupId}
                      summary={first.summary ?? `${first.card_name}${first.deck_name ? ` in ${first.deck_name}` : ''}`}
                      consequence={first.consequence}
                      reason={first.claude_reason}
                      deckName={first.deck_name}
                      deckId={first.deck_id}
                      cardName={first.card_name}
                      at={g.at}
                      client={first.client_name}
                      status={status}
                      busy={local?.busy}
                      undoneAt={local?.undoneAt ?? first.undone_at}
                      refusal={local?.refusal ?? blocker}
                      refusalText={local?.refusal ? (local.refusalText ?? null) : first.refusal_text}
                      cards={first.cards ?? (g.rows.length > 1 ? g.rows.map((r) => r.card_name) : undefined)}
                      onUndo={() => doUndo(g)}
                    />
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
