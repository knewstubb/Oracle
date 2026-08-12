'use client'

/**
 * LegalityBanner — Shows format legality issues for a deck
 * 
 * Displays a collapsible warning banner when the deck contains cards
 * that violate Commander format rules (banned cards, color identity violations,
 * or singleton violations).
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronUp, Ban, Palette, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LegalityIssue {
  cardName: string
  reason: 'banned' | 'color_identity' | 'over_limit'
  details: string
}

interface LegalityResponse {
  format: string
  isLegal: boolean
  issues: LegalityIssue[]
}

interface LegalityBannerProps {
  deckId: number
}

const REASON_ICONS: Record<string, React.ReactNode> = {
  banned: <Ban className="size-3.5" />,
  color_identity: <Palette className="size-3.5" />,
  over_limit: <Hash className="size-3.5" />,
}

const REASON_LABELS: Record<string, string> = {
  banned: 'Banned',
  color_identity: 'Color Identity',
  over_limit: 'Singleton',
}

export function LegalityBanner({ deckId }: LegalityBannerProps) {
  const [expanded, setExpanded] = useState(false)

  const { data, isLoading } = useQuery<LegalityResponse>({
    queryKey: ['deck-legality', deckId],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/legality`)
      if (!res.ok) throw new Error('Failed to check legality')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })

  // Don't show anything while loading or if deck is legal
  if (isLoading || !data || data.isLegal) {
    return null
  }

  const { issues } = data
  const bannedCount = issues.filter(i => i.reason === 'banned').length
  const colorCount = issues.filter(i => i.reason === 'color_identity').length
  const singletonCount = issues.filter(i => i.reason === 'over_limit').length

  return (
    <div
      className="mx-6 mb-4 rounded-lg border"
      style={{
        borderColor: 'rgba(226, 75, 74, 0.3)',
        background: 'rgba(226, 75, 74, 0.08)',
      }}
    >
      {/* Summary row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <AlertTriangle
          className="size-5 shrink-0"
          style={{ color: 'var(--signal-error)' }}
        />
        
        <div className="min-w-0 flex-1">
          <span className="text-[length:var(--fs-md)] font-medium" style={{ color: 'var(--signal-error)' }}>
            {issues.length} legality issue{issues.length !== 1 ? 's' : ''} found
          </span>
          
          {/* Issue type breakdown */}
          <div className="mt-0.5 flex flex-wrap gap-3 text-[length:var(--fs-sm)] text-muted-foreground">
            {bannedCount > 0 && (
              <span className="flex items-center gap-1">
                <Ban className="size-3" /> {bannedCount} banned
              </span>
            )}
            {colorCount > 0 && (
              <span className="flex items-center gap-1">
                <Palette className="size-3" /> {colorCount} color identity
              </span>
            )}
            {singletonCount > 0 && (
              <span className="flex items-center gap-1">
                <Hash className="size-3" /> {singletonCount} singleton
              </span>
            )}
          </div>
        </div>

        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded issue list */}
      {expanded && (
        <div className="border-t px-4 pb-3 pt-2" style={{ borderColor: 'rgba(226, 75, 74, 0.2)' }}>
          <ul className="space-y-2">
            {issues.map((issue, idx) => (
              <li
                key={`${issue.cardName}-${idx}`}
                className="flex items-start gap-2 text-[length:var(--fs-sm)]"
              >
                <span
                  className={cn(
                    'mt-0.5 flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium',
                    issue.reason === 'banned' && 'bg-red-500/20 text-red-400',
                    issue.reason === 'color_identity' && 'bg-amber-500/20 text-amber-400',
                    issue.reason === 'over_limit' && 'bg-purple-500/20 text-purple-400'
                  )}
                >
                  {REASON_ICONS[issue.reason]}
                  {REASON_LABELS[issue.reason]}
                </span>
                <div className="min-w-0">
                  <span className="font-medium">{issue.cardName}</span>
                  <span className="text-muted-foreground"> — {issue.details}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
