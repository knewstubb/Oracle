'use client'
// DV-02: the Strategy block on the deck page. The whole block is one button that opens the Strategy window.
// Spec: docs/oracle/specs/deck-rail-strategy-tags.md section 2. (The rail does not exist yet, so for now the block sits
// above the tabs on the existing deck page; slice 3 moves it into the rail.)
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, WifiOff, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import { bracketName } from '@/lib/deck-bracket'
import { bracketWarning, type StrategyWindowData } from '@/lib/deck-strategy-window'
import { StrategyWindow, type SaveResult, type WindowValues } from './StrategyWindow'
import { useOnlineStatus } from './useOnlineStatus'
import { FOCUS_RING } from './focus'
export const strategyKey = (deckId: number) => [...deckKeys.detail(deckId), 'strategy-window'] as const
const SAVE_FAILED = "Couldn't save. Your changes are still here and nothing was lost. Check your connection. It will try again by itself."
async function fetchStrategy(deckId: number): Promise<StrategyWindowData> {
  const res = await fetch(`/api/decks/${deckId}/strategy-window`)
  if (!res.ok) throw new Error('Failed to load strategy')
  return res.json()
}
export interface StrategyBlockProps {
  deckId: number
  deckName: string
  /** Opens wherever History opens today (the deck's Version History window). */
  onSeeHistory: () => void
}
export function StrategyBlock({ deckId, deckName, onSeeHistory }: StrategyBlockProps) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [open, setOpen] = useState(false)
  const [announce, setAnnounce] = useState('')
  const blockRef = useRef<HTMLButtonElement | null>(null)
  const { data, isPending, isError, refetch, isFetching } = useQuery<StrategyWindowData>({
    queryKey: strategyKey(deckId),
    queryFn: () => fetchStrategy(deckId),
    staleTime: 60 * 1000,
    retry: 1,
    networkMode: 'always',
  })
  const save = async (changed: Partial<WindowValues>): Promise<SaveResult> => {
    let res: Response
    try {
      res = await fetch(`/api/decks/${deckId}/strategy-window`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      })
    } catch {
      return { ok: false, error: SAVE_FAILED }
    }
    if (!res.ok) {
      let message = SAVE_FAILED
      try {
        const body = (await res.json()) as { error?: string; code?: string }
        // A specific refusal the owner can act on (for example bracket 5 before the stored-data update) is shown as written.
        if (body.code === 'bracket_5_not_stored_yet' && body.error) message = `${body.error} Your changes are still here.`
        else if (res.status === 400 && body.error) message = `${body.error} Your changes are still here and nothing was lost.`
      } catch {
        /* keep the general message */
      }
      return { ok: false, error: message }
    }
    const { notSaved, ...fresh } = (await res.json()) as StrategyWindowData & { notSaved?: string[] }
    queryClient.setQueryData(strategyKey(deckId), fresh)
    if (!notSaved || notSaved.length === 0) setAnnounce('Strategy saved')
    return { ok: true, notSaved }
  }
  const saveOnLeave = (changed: Partial<WindowValues>) => {
    void fetch(`/api/decks/${deckId}/strategy-window`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changed),
      keepalive: true,
    }).catch(() => {})
  }
  const status = <span role="status" aria-live="polite" className="sr-only">{announce}</span>
  if (isPending && !isError) {
    return (
      <div className="w-full">
        <div aria-busy="true" className="w-full space-y-2 rounded-lg border border-border p-3" data-testid="strategy-block-loading">
          <p className="text-[length:var(--fs-md)] text-muted-foreground">Loading strategy…</p>
          <Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
          <Skeleton className="h-3 w-3/5 motion-reduce:animate-none" />
        </div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="w-full">
        <div className="flex w-full gap-2 rounded-lg border border-red-400 p-3 text-[length:var(--fs-md)]" data-testid="strategy-block-failed">
          <XCircle className="mt-0.5 size-5 shrink-0 text-red-300" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium text-red-300">Couldn&apos;t load your strategy.</p>
            <p className="text-muted-foreground">Nothing was changed. Your saved strategy is safe.</p>
            <button type="button" onClick={() => refetch()} aria-disabled={isFetching} className={cn('mt-2 inline-flex min-h-11 items-center rounded-md border border-[#8A8A93] px-4 font-medium', FOCUS_RING)}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
  const hasBracket = data.bracket !== null
  const name = bracketName(data.bracket)
  const empty = !hasBracket && !data.summary
  const warning = bracketWarning(data.bracket, data.implied)
  return (
    <div className="w-full">
      <button
        ref={blockRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        data-testid="strategy-block"
        className={cn(
          'flex min-h-11 w-full flex-col items-stretch gap-2 rounded-lg border p-3 text-left',
          empty ? 'border-dashed border-[#8A8A93]' : 'border-solid border-[#8A8A93]',
          FOCUS_RING,
        )}
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[length:var(--fs-md)] font-medium',
              hasBracket ? 'border-[#8A8A93]' : 'border-amber-400 text-amber-300',
            )}
          >
            {!hasBracket && <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />}
            {hasBracket ? (
              <>
                {/* The number is primary and always shown; the name drops off first when the space is short. */}
                <span className="shrink-0">Target bracket {data.bracket}</span>
                {name && <span className="min-w-0 truncate">· {name}</span>}
              </>
            ) : (
              <span>Target bracket: Not set</span>
            )}
          </span>
          {!online && (
            <span className="flex shrink-0 items-center gap-1 rounded-md border border-amber-400 px-2 py-1 text-[length:var(--fs-sm)] text-amber-300">
              <WifiOff className="size-3.5" aria-hidden="true" />
              Offline · showing saved copy
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center text-[length:var(--fs-sm)] text-muted-foreground">
            Edit
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </span>
        {data.summary ? (
          <span className="text-[length:var(--fs-md)]">{data.summary}</span>
        ) : (
          <span className="text-[length:var(--fs-md)] italic text-muted-foreground">Add a one-line summary of how this deck plays</span>
        )}
        {warning && (
          <span className="flex gap-2 text-[length:var(--fs-sm)] text-amber-300" data-testid="strategy-block-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{warning.text}</span>
          </span>
        )}
      </button>
      {status}
      <StrategyWindow
        open={open}
        deckName={deckName}
        data={data}
        online={online}
        onClose={() => setOpen(false)}
        onSave={save}
        onSaveOnLeave={saveOnLeave}
        onSeeHistory={onSeeHistory}
        finalFocusRef={blockRef}
      />
    </div>
  )
}
