'use client'

import { useState, useCallback } from 'react'
import { Check, TriangleAlert, LandPlot, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ManaBoxUnmatchedLine } from '../../../docs/oracle/contracts/manabox-import.types'
import type { ImportKind } from './types'
import { unmatchedReasonText } from './types'

export interface ImportResultProps {
  kind: ImportKind
  name: string
  inserted: number
  skipped: number
  basics: number
  proxies: number
  unsleeved: number
  unmatched: ManaBoxUnmatchedLine[]
  deckId?: number
  onOpenDeck?: () => void
  onViewCollection?: () => void
  onDismiss?: () => void
}

function plural(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? singular + 's'}`
}

export function ImportResult({
  kind,
  name,
  inserted,
  skipped,
  basics,
  proxies,
  unsleeved,
  unmatched,
  deckId,
  onOpenDeck,
  onViewCollection,
  onDismiss,
}: ImportResultProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const handleCopy = useCallback(async (line: ManaBoxUnmatchedLine) => {
    try {
      await navigator.clipboard.writeText(line.rawLine)
      setCopiedId(line.sourceIndex)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // ignore
    }
  }, [])

  const lines: Array<{ icon: React.ReactNode; text: React.ReactNode }> = []

  const first = `${kind === 'collection' ? plural(inserted, 'copy', 'copies') : plural(inserted, 'card')} added${kind === 'deck' ? ' · sleeved' : ''}${proxies > 0 ? ` · ${plural(proxies, 'proxy', 'proxies')}` : ''}`
  lines.push({ icon: <Check className="size-4 text-muted-foreground" aria-hidden="true" />, text: first })

  if (unsleeved > 0) {
    lines.push({ icon: <Check className="size-4 text-muted-foreground" aria-hidden="true" />, text: `${unsleeved} unsleeved` })
  }
  if (kind === 'deck' && basics > 0) {
    lines.push({ icon: <LandPlot className="size-4 text-muted-foreground" aria-hidden="true" />, text: plural(basics, 'basic') })
  }
  if (skipped > 0) {
    lines.push({ icon: <SkipForward className="size-4 text-muted-foreground" aria-hidden="true" />, text: `${plural(skipped, 'token')} skipped` })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 overflow-auto">
      <div className="m-auto flex w-full max-w-xl flex-col gap-3">
      <h3 className="text-center text-[length:var(--fs-lg)] font-medium">
        {kind === 'deck' ? `${name} imported` : 'Collection updated'}
      </h3>
      <ul className="mx-auto flex w-full flex-col gap-1 text-[length:var(--fs-sm)]">
        {lines.map((line, idx) => (
          <li key={idx} className="flex items-center gap-2">
            {line.icon}
            <span>{line.text}</span>
          </li>
        ))}
        {unmatched.map((line) => (
          <li
            key={line.sourceIndex}
            className="flex items-center gap-2 rounded-md border border-[var(--signal-warning)] bg-[var(--signal-warning-bg)] px-2 py-1 text-[length:var(--fs-xs)]"
          >
            <TriangleAlert className="size-4 shrink-0 text-[var(--signal-warning)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              <strong>1 not matched</strong>
              <span aria-hidden="true"> · </span>
              <code className="rounded bg-black/20 px-1 font-mono">{line.rawLine}</code>
              <span aria-hidden="true"> · </span>
              {unmatchedReasonText(line.reason)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(line)}
            >
              {copiedId === line.sourceIndex ? 'Copied' : 'Copy'}
            </Button>
          </li>
        ))}
      </ul>
      </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
        <Button type="button" variant="outline" onClick={onDismiss}>
          Close
        </Button>
        {kind === 'deck' && deckId && (
          <Button type="button" onClick={onOpenDeck}>
            Open deck
          </Button>
        )}
        {kind === 'collection' && (
          <Button type="button" onClick={onViewCollection}>
            View collection
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
  if (basics > 0) parts.push(`${basics} basic${basics === 1 ? '' : 's'}`)
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

