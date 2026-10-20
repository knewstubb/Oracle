'use client'

import { useState, useCallback } from 'react'
import { TriangleAlert, Info, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ManaBoxSkippedToken, ManaBoxUnmatchedLine } from '../../../docs/oracle/contracts/manabox-import.types'
import type { ImportSource } from './types'
import { sourceLabel, unmatchedReasonText } from './types'

export interface ImportNoticeLineProps {
  tone: 'warning' | 'info'
  unmatched?: ManaBoxUnmatchedLine
  tokens?: ManaBoxSkippedToken[]
  source: ImportSource
}

export function ImportNoticeLine({ tone, unmatched, tokens, source }: ImportNoticeLineProps) {
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
          <strong>1 not matched</strong>
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
}

export function ImportNotices({ unmatched, tokens, source }: ImportNoticesProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {unmatched.map((line) => (
        <ImportNoticeLine key={line.sourceIndex} tone="warning" unmatched={line} source={source} />
      ))}
      {tokens.length > 0 && <ImportNoticeLine tone="info" tokens={tokens} source={source} />}
    </div>
  )
}
