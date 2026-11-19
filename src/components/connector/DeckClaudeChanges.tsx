'use client'
// The "Changes Claude made" part of a deck's History (DV-04): the same list, the same Undo and the same rows as Recent changes
// in the connector settings, filtered to one deck. It is not a second history; it reads the one change list.
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import { connectorKeys, fetchChanges, undoGroup, type UndoRefusal } from './api'
import { ChangeRow, type ChangeStatus } from './ChangeRow'
import { dayKey, dayLabel } from './format'
import { groupChanges } from './RecentChangesTab'
type UndoState = { status: ChangeStatus; busy?: boolean; refusal?: UndoRefusal | null; refusalText?: string | null; undoneAt?: string }
export function DeckClaudeChanges({ deckId, deckName, enabled }: { deckId: number; deckName: string; enabled: boolean }) {
  const qc = useQueryClient()
  const changes = useQuery({ queryKey: connectorKeys.deckChanges(deckId), queryFn: () => fetchChanges(deckId), enabled, retry: false })
  const [undoState, setUndoState] = useState<Record<string, UndoState>>({})
  const [announce, setAnnounce] = useState('')
  const groups = useMemo(() => groupChanges(changes.data ?? []), [changes.data])
  const byDay = useMemo(() => {
    const out: { key: string; label: string; groups: typeof groups }[] = []
    for (const g of groups) {
      const key = dayKey(g.at)
      const last = out[out.length - 1]
      if (last && last.key === key) last.groups.push(g)
      else out.push({ key, label: dayLabel(g.at), groups: [g] })
    }
    return out
  }, [groups])
  const doUndo = async (g: (typeof groups)[number]) => {
    setUndoState((s) => ({ ...s, [g.groupId]: { status: 'done', busy: true } }))
    const out = await undoGroup(g.groupId)
    if (out.ok) {
      setUndoState((s) => ({ ...s, [g.groupId]: { status: 'undone', undoneAt: new Date().toISOString() } }))
      toast(`Undone. ${deckName} is as it was before.`)
      setAnnounce(`Undone. ${deckName} is as it was before.`)
      qc.invalidateQueries({ queryKey: connectorKeys.changes })
      createDeckInvalidators(qc).invalidateDeck(String(deckId))
    } else if ('refused' in out) {
      setUndoState((s) => ({ ...s, [g.groupId]: { status: 'refused', refusal: out.refused, refusalText: out.text ?? null } }))
      setAnnounce("Can't undo this one. Nothing was changed.")
    } else {
      setUndoState((s) => ({ ...s, [g.groupId]: { status: 'failed' } }))
      setAnnounce("We couldn't undo this. Nothing was changed.")
    }
  }
  return (
    <section aria-labelledby="history-claude-h" className="space-y-2" data-testid="history-claude-changes">
      <div>
        <h3 id="history-claude-h" className="text-[length:var(--fs-sm)] font-medium text-foreground">Changes Claude made</h3>
        <p className="text-[length:var(--fs-xs)] text-muted-foreground">Newest first. You can undo a change for 7 days.</p>
      </div>
      <div role="status" aria-live="polite" className="sr-only">{announce}</div>
      {changes.isPending && enabled && (
        <div aria-busy="true" className="space-y-2">
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">Loading Claude&apos;s changes…</p>
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {changes.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--signal-critical)] p-3 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
          <span className="min-w-0 flex-1">We couldn&apos;t load Claude&apos;s changes. This doesn&apos;t mean there are none.</span>
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => changes.refetch()}>Try again</Button>
        </div>
      )}
      {changes.isSuccess && groups.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-[length:var(--fs-sm)] text-muted-foreground" data-testid="history-claude-empty">
          Claude hasn&apos;t changed {deckName} in the last 7 days.
        </p>
      )}
      {changes.isSuccess && byDay.map((day) => (
        <div key={day.key} className="space-y-2">
          <h4 className="text-[length:var(--fs-xs)] font-medium text-muted-foreground">{day.label}</h4>
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
  )
}
