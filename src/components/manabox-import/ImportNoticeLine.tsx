'use client'

import { useState, useCallback } from 'react'
import { TriangleAlert, Info, SkipForward, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ManaBoxSkippedToken, ManaBoxUnmatchedLine } from '../../../docs/oracle/contracts/manabox-import.types'
import type { ImportSource } from './types'
import { sourceLabel, unmatchedReasonText } from './types'

export interface ImportNoticeLineProps {
  tone: 'warning' | 'info'
  unmatched?: ManaBoxUnmatchedLine
  tokens?: ManaBoxSkippedToken[]
  source: ImportSource
  /** Hide this note for this review only. */
  onDismiss?: () => void
}

/** The ✕ that hides a note. It sits inside the note it acts on. */
function DismissButton({ label, onClick }: { label: string; onClick?: () => void }) {
  if (!onClick) return null
  return (
    <Button type="button" variant="ghost" size="icon-xs" aria-label={label} title={label} onClick={onClick}>
      <X className="size-3.5" aria-hidden="true" />
    </Button>
  )
}

/** Which notes the owner has hidden during this review. Not remembered once the review closes. */
export function useHiddenNotes() {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const hide = useCallback((id: string) => {
    setHidden((prev) => new Set(prev).add(id))
    // Focus moves to the footer link that brings hidden notes back.
    requestAnimationFrame(() => document.getElementById('import-show-hidden-notes')?.focus())
  }, [])
  const restoreAll = useCallback(() => setHidden(new Set()), [])
  return { hidden, hide, restoreAll }
}

export function ImportNoticeLine({ tone, unmatched, tokens, source, onDismiss }: ImportNoticeLineProps) {
  const [showTokens, setShowTokens] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const text = unmatched?.rawLine ?? tokens?.map((t) => t.rawLine).join('\n') ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }, [unmatched, tokens])

  if (tone === 'warning' && unmatched) {
    return (
      <div
        role="group"
        aria-label="Not matched"
        className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-[var(--signal-warning)] bg-[var(--signal-warning-bg)] px-2.5 py-1.5 text-[length:var(--fs-sm)]"
      >
        <TriangleAlert className="size-4 shrink-0 text-[var(--signal-warning)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          <strong>1 row not matched</strong>
          <span aria-hidden="true"> · </span>
          {sourceLabel(source, unmatched.sourceIndex)}{' '}
          <code className="rounded bg-black/20 px-1 font-mono text-[length:var(--fs-xs)]">
            {unmatched.rawLine}
          </code>
          <span aria-hidden="true"> · </span>
          {unmatchedReasonText(unmatched.reason)}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <DismissButton label="Dismiss not matched note" onClick={onDismiss} />
      </div>
    )
  }

  if (tokens && tokens.length > 0) {
    const count = tokens.length
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[length:var(--fs-sm)] text-muted-foreground">
          <SkipForward className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {count} {count === 1 ? 'token' : 'tokens'} skipped
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowTokens((s) => !s)}
            aria-expanded={showTokens}
          >
            {showTokens ? 'Hide' : 'Show'}
          </Button>
          <DismissButton label="Dismiss skipped tokens note" onClick={onDismiss} />
        </div>
        {showTokens && (
          <div className="flex flex-col gap-0.5 pl-8">
            {tokens.map((token) => (
              <div
                key={token.sourceIndex}
                className="text-[length:var(--fs-sm)] text-muted-foreground"
              >
                {sourceLabel(source, token.sourceIndex)}{' '}
                <code className="rounded bg-black/20 px-1 font-mono text-[length:var(--fs-xs)]">
                  {token.rawLine}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}

export interface ImportNoticesProps {
  unmatched: ManaBoxUnmatchedLine[]
  tokens: ManaBoxSkippedToken[]
  source: ImportSource
  hidden?: Set<string>
  onDismiss?: (id: string) => void
}

/** Two or more unmatched lines collapse into one summary line with View / Copy all / ✕. */
function UnmatchedSummary({
  unmatched,
  source,
  onDismiss,
}: {
  unmatched: ManaBoxUnmatchedLine[]
  source: ImportSource
  onDismiss?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // ignore
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        role="group"
        aria-label="Not matched"
        className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--signal-warning)] bg-[var(--signal-warning-bg)] px-2.5 py-1.5 text-[length:var(--fs-sm)]"
      >
        <TriangleAlert className="size-4 shrink-0 text-[var(--signal-warning)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          <strong>{unmatched.length} rows not matched</strong>
          <span aria-hidden="true"> · </span>
          they won&apos;t be imported
        </span>
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'View'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => copy('all', unmatched.map((l) => l.rawLine).join('\n'))}
        >
          {copied === 'all' ? 'Copied' : 'Copy all'}
        </Button>
        <DismissButton label="Dismiss not matched note" onClick={onDismiss} />
      </div>
      {open && (
        <ul aria-label="Rows not matched" className="max-h-28 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          {unmatched.map((line) => (
            <li
              key={line.sourceIndex}
              className="flex min-w-0 items-center gap-2 border-b border-[var(--border-subtle)] px-2.5 py-1 text-[length:var(--fs-xs)] last:border-b-0"
            >
              <span className="shrink-0 text-muted-foreground">{sourceLabel(source, line.sourceIndex)}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-black/20 px-1 font-mono">{line.rawLine}</code>
              <span className="shrink-0 text-muted-foreground">{unmatchedReasonText(line.reason)}</span>
              <Button type="button" variant="ghost" size="xs" onClick={() => copy(String(line.sourceIndex), line.rawLine)}>
                {copied === String(line.sourceIndex) ? 'Copied' : 'Copy'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ImportNotices({ unmatched, tokens, source, hidden, onDismiss }: ImportNoticesProps) {
  const showUnmatched = unmatched.length > 0 && !hidden?.has('unmatched')
  const showTokens = tokens.length > 0 && !hidden?.has('tokens')
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {showUnmatched &&
        (unmatched.length === 1 ? (
          <ImportNoticeLine
            tone="warning"
            unmatched={unmatched[0]}
            source={source}
            onDismiss={onDismiss && (() => onDismiss('unmatched'))}
          />
        ) : (
          <UnmatchedSummary unmatched={unmatched} source={source} onDismiss={onDismiss && (() => onDismiss('unmatched'))} />
        ))}
      {showTokens && (
        <ImportNoticeLine tone="info" tokens={tokens} source={source} onDismiss={onDismiss && (() => onDismiss('tokens'))} />
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {hidden?.has('unmatched') && unmatched.length > 0
          ? `Note hidden. ${unmatched.length} ${unmatched.length === 1 ? 'row' : 'rows'} still not matched.`
          : ''}
      </div>
    </div>
  )
}

export interface ImportValueNoticeLinesProps {
  unrecognised: number
  unlistedFinish: number
  hidden?: Set<string>
  onDismiss?: (id: string) => void
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** One counted line per kind of value that needed attention. Nothing shows when all counts are 0. */
export function ImportValueNoticeLines({
  unrecognised,
  unlistedFinish,
  hidden,
  onDismiss,
}: ImportValueNoticeLinesProps) {
  const lines: { id: string; text: string }[] = []
  if (unrecognised > 0) {
    lines.push({
      id: 'value:unrecognised',
      text: `${unrecognised} ${plural(unrecognised, 'value', 'values')} in your file ${plural(unrecognised, 'was', 'were')} not recognised, so your defaults ${plural(unrecognised, 'was', 'were')} used.`,
    })
  }
  if (unlistedFinish > 0) {
    lines.push({
      id: 'value:unlisted',
      text: `${unlistedFinish} ${plural(unlistedFinish, 'copy has', 'copies have')} a finish Scryfall doesn't list for that printing. ${plural(unlistedFinish, 'It was', 'They were')} kept as in your file.`,
    })
  }
  const shown = lines.filter((l) => !hidden?.has(l.id))
  if (shown.length === 0) return null
  return (
    <div className="flex min-w-0 flex-col gap-1" role="group" aria-label="Notes about your file">
      {shown.map((line) => (
        <div
          key={line.id}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[length:var(--fs-sm)] text-muted-foreground"
        >
          <Info className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{line.text}</span>
          <DismissButton label="Dismiss note" onClick={onDismiss && (() => onDismiss(line.id))} />
        </div>
      ))}
    </div>
  )
}

/** How many value notes exist (so the footer can count hidden ones correctly). */
export function valueNoteIds(n: { unrecognised: number; unlistedFinish: number }): string[] {
  const ids: string[] = []
  if (n.unrecognised > 0) ids.push('value:unrecognised')
  if (n.unlistedFinish > 0) ids.push('value:unlisted')
  return ids
}

/** How many of the notes now on screen the owner has hidden. */
export function countHiddenNotes(
  hidden: Set<string>,
  preview: { unmatched: unknown[]; skippedTokens: unknown[]; notices?: { unrecognisedCondition?: number; unrecognisedLanguage?: number; unrecognisedFinish?: number } },
  finish: { unlistedFinish: number }
): number {
  const ids = [
    ...(preview.unmatched.length > 0 ? ['unmatched'] : []),
    ...(preview.skippedTokens.length > 0 ? ['tokens'] : []),
    ...valueNoteIds({
      unrecognised:
        (preview.notices?.unrecognisedCondition ?? 0) +
        (preview.notices?.unrecognisedLanguage ?? 0) +
        (preview.notices?.unrecognisedFinish ?? 0),
      ...finish,
    }),
  ]
  return ids.filter((id) => hidden.has(id)).length
}
