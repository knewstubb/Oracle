'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ManaBoxUnmatchedLine } from '../../../docs/oracle/contracts/manabox-import.types'
import type { ImportKind } from './types'
import { unmatchedReasonText } from './types'
import {
  buildNeedsLook,
  buildResultBreakdown,
  resultHeadline,
  unmatchedLinesText,
  visibleUnmatched,
} from '@/lib/import-result'

export interface ImportResultProps {
  kind: ImportKind
  name: string
  inserted: number
  skipped: number
  basics: number
  proxies: number
  unsleeved: number
  /** Copies imported with a foil or etched finish (included in the counts above). */
  foils?: number
  /** Values in the file the app couldn't use (carried from the review step). */
  unrecognisedValues?: number
  /** Copies whose file finish Scryfall doesn't list. */
  unlistedFinish?: number
  unmatched: ManaBoxUnmatchedLine[]
  deckId?: number
  onOpenDeck?: () => void
  onViewCollection?: () => void
  onDismiss?: () => void
  /** Deck imports: a short note about the commander, shown after the breakdown. */
  commanderSlot?: React.ReactNode
}

export function ImportResult({
  kind,
  name,
  inserted,
  skipped,
  basics,
  proxies,
  unsleeved,
  foils = 0,
  unrecognisedValues = 0,
  unlistedFinish = 0,
  unmatched,
  deckId,
  onOpenDeck,
  onViewCollection,
  onDismiss,
  commanderSlot,
}: ImportResultProps) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(unmatchedLinesText(unmatched))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }, [unmatched])

  const { headline, sub } = resultHeadline(kind, inserted, name)
  const breakdown = buildResultBreakdown({ kind, inserted, proxies, foils, tokensSkipped: skipped, unsleeved, basics })
  const notices = buildNeedsLook({ unrecognisedValues, unlistedFinish, unmatchedCount: unmatched.length })
  const { shown, hidden } = visibleUnmatched(unmatched, expanded)
  const primary =
    kind === 'deck' ? (deckId ? { label: 'Open deck', onClick: onOpenDeck } : null) : { label: 'View collection', onClick: onViewCollection }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="m-auto flex w-full max-w-[460px] flex-col gap-4">
          <div role="status" className="flex flex-col items-center gap-1.5 text-center">
            <span className="mb-1 grid size-[52px] place-items-center rounded-full bg-[rgba(29,158,117,0.16)] text-[var(--accent-primary)]">
              <Check className="size-7" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h3 className="text-[length:var(--fs-xl,20px)] font-medium">{headline}</h3>
            <p className="text-muted-foreground">{sub}</p>
          </div>

          {breakdown.rows.length > 0 && (
            <ul aria-label="Breakdown" className="rounded-[10px] border border-[var(--border-subtle)]">
              {breakdown.rows.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 last:border-b-0"
                >
                  <span className="flex flex-1 items-center gap-1.5">
                    {row.key === 'proxies' && <span aria-hidden="true" className="text-[var(--status-proxy)]">◆</span>}
                    {row.key === 'foil' && <span aria-hidden="true">★</span>}
                    <span className={row.key === 'proxies' ? 'text-[var(--status-proxy)]' : undefined}>{row.label}</span>
                    {row.note && <small className="text-[length:var(--fs-xs)] text-muted-foreground">— {row.note}</small>}
                  </span>
                  <span className="font-medium tabular-nums">{row.value}</span>
                </li>
              ))}
            </ul>
          )}
          {breakdown.allOriginals && <p className="text-center text-muted-foreground">All originals.</p>}

          {commanderSlot}

          {notices.length > 0 && (
            <section aria-label="Needs a look" className="flex flex-col gap-1.5">
              <div className="flex items-center text-[length:var(--fs-xs)] text-muted-foreground">
                <h4 className="flex-1">Needs a look</h4>
                {unmatched.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? 'Copied' : 'Copy unmatched lines'}
                  </Button>
                )}
              </div>
              {notices.map((notice) => (
                <div
                  key={notice.key}
                  className="flex items-start gap-2 rounded-lg border border-[var(--signal-warning)] bg-[var(--signal-warning-bg)] px-2.5 py-1.5 text-[length:var(--fs-xs)]"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--signal-warning)]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <span>{notice.text}</span>
                    {notice.key === 'unmatched' && (
                      <ul className="mt-1.5 flex flex-col gap-0.5">
                        {shown.map((line) => (
                          <li key={line.sourceIndex} className="flex items-center gap-1.5">
                            <code className="min-w-0 truncate rounded bg-black/25 px-1 font-mono">{line.rawLine}</code>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0 text-muted-foreground">{unmatchedReasonText(line.reason)}</span>
                          </li>
                        ))}
                        {hidden > 0 && (
                          <li>
                            <button
                              type="button"
                              className="underline underline-offset-2 hover:text-foreground"
                              onClick={() => setExpanded(true)}
                            >
                              Show all {unmatched.length}
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
        <Button type="button" variant="outline" onClick={onDismiss}>
          Close
        </Button>
        {primary && (
          <Button ref={primaryRef} type="button" onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  )
}

export interface ImportResultLineProps {
  inserted: number
  skipped: number
  basics: number
  proxies: number
  unsleeved: number
  unmatched: ManaBoxUnmatchedLine[]
  onDismiss: () => void
}

export function ImportResultLine({
  inserted,
  skipped,
  basics,
  proxies,
  unsleeved,
  unmatched,
  onDismiss,
}: ImportResultLineProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const hasIssue = unmatched.length > 0

  const parts: string[] = [`${inserted} cards added`]
  if (proxies > 0) parts.push(`${proxies} proxy${proxies === 1 ? '' : 'ies'}`)
  if (unsleeved > 0) parts.push(`${unsleeved} unsleeved`)
  if (basics > 0) parts.push(`${basics} basic${basics === 1 ? '' : 's'} (generic)`)
  if (skipped > 0) parts.push(`${skipped} token${skipped === 1 ? '' : 's'} skipped`)

  const handleCopy = useCallback(async () => {
    const text = unmatched.map((u) => u.rawLine).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(-1)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // ignore
    }
  }, [unmatched])

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-[length:var(--fs-sm)]',
        hasIssue
          ? 'border-[var(--signal-warning)] bg-[var(--signal-warning-bg)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
      )}
    >
      {hasIssue ? (
        <TriangleAlert className="size-4 shrink-0 text-[var(--signal-warning)]" aria-hidden="true" />
      ) : (
        <Check className="size-4 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">
        <strong>Imported</strong>
        <span aria-hidden="true"> · </span>
        {parts.join(' · ')}
        {unmatched.map((u) => (
          <span key={u.sourceIndex}>
            <span aria-hidden="true"> · </span>
            <strong>1 not matched</strong>{' '}
            <code className="rounded bg-black/20 px-1 font-mono">{u.rawLine}</code>
          </span>
        ))}
      </span>
      {unmatched.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
          {copiedId === -1 ? 'Copied' : 'Copy'}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label="Dismiss import result"
      >
        ×
      </Button>
    </div>
  )
}

