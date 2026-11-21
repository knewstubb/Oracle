'use client'
// The Strategy & bracket block in the deck rail: a label, one Edit link, a bracket box and the summary line.
// Edit opens Deck settings on the Strategy tab (the window is mounted once by DeckSettingsHost).
import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, WifiOff, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { bracketName } from '@/lib/deck-bracket'
import { bracketWarning, type StrategyWindowData } from '@/lib/deck-strategy-window'
import { fetchStrategy, strategyKey, useOpenDeckSettings } from './DeckSettingsHost'
import { useOnlineStatus } from './useOnlineStatus'
import { FOCUS_RING } from './focus'
export interface StrategyBlockProps {
  deckId: number
}
export function StrategyBlock({ deckId }: StrategyBlockProps) {
  const online = useOnlineStatus()
  const openSettings = useOpenDeckSettings()
  const blockRef = useRef<HTMLButtonElement | null>(null)
  const { data, isPending, isError, refetch, isFetching } = useQuery<StrategyWindowData>({
    queryKey: strategyKey(deckId),
    queryFn: () => fetchStrategy(deckId),
    staleTime: 60 * 1000,
    retry: 1,
    networkMode: 'always',
  })
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
  const warning = bracketWarning(data.bracket, data.implied)
  const openWindow = () => openSettings('strategy', blockRef.current)
  return (
    <div className="w-full space-y-1" data-testid="strategy-block">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-medium uppercase text-[var(--text-secondary)]">Strategy &amp; bracket</h2>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="flex shrink-0 items-center gap-1 rounded-md border border-amber-400 px-2 py-1 text-[length:var(--fs-sm)] text-amber-300">
              <WifiOff className="size-3.5" aria-hidden="true" />
              Offline · showing saved copy
            </span>
          )}
          <button
            ref={blockRef}
            type="button"
            aria-haspopup="dialog"
            aria-label="Edit strategy"
            onClick={openWindow}
            className={cn('flex min-h-11 items-center px-1 text-[10px] font-medium tracking-[0.8px] text-[var(--accent-primary)] underline-offset-2 hover:underline', FOCUS_RING)}
          >
            Edit
          </button>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-canvas)] text-[24px] font-semibold"
          title={bracketName(data.bracket) ?? undefined}
          data-testid="bracket-box"
        >
          {hasBracket ? data.bracket : '–'}
        </span>
        <p className="min-w-0 flex-1 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
          {data.summary || 'Add a bracket and a one-line summary of how this deck plays'}
        </p>
      </div>
      {warning && (
        <p className="flex gap-2 text-[length:var(--fs-sm)] text-amber-300" data-testid="strategy-block-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{warning.text}</span>
        </p>
      )}
    </div>
  )
}
