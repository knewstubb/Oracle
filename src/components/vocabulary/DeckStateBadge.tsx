'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { LoadingSpinner } from './LoadingSpinner'
import { MaterialSymbol } from './MaterialSymbol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeckState = 'draft' | 'assembling' | 'playable' | 'checking' | 'failed'

export interface DeckStateBadgeProps {
  state: DeckState
  /** Number of cards currently sleeved in the deck. */
  sleeved: number
  /** Required deck size for the format; null for Casual. */
  required: number | null
  /** Number of proxy cards sleeved in the deck. */
  proxyCount?: number
  onRetry?: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Configuration — words, icons, tokens (D-043)
// ---------------------------------------------------------------------------

type StateConfig = {
  word: string
  icon: string
  iconFilled: boolean
  token: string
  bg?: string
}

const STATE_CONFIG: Record<DeckState, StateConfig> = {
  draft: {
    word: 'Draft',
    icon: 'edit_note',
    iconFilled: false,
    token: 'var(--state-draft)',
  },
  assembling: {
    word: 'Assembling',
    icon: 'clock_loader_40',
    iconFilled: true,
    token: 'var(--state-assembling)',
  },
  playable: {
    word: 'Playable',
    icon: 'check_circle',
    iconFilled: true,
    token: 'var(--state-playable)',
  },
  checking: {
    word: 'Checking…',
    icon: '',
    iconFilled: false,
    token: 'var(--state-checking)',
  },
  failed: {
    word: "Couldn't check",
    icon: 'error',
    iconFilled: false,
    token: 'var(--state-failed)',
    bg: 'var(--state-failed-bg)',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(
  state: DeckState,
  sleeved: number,
  required: number | null
): string {
  if (state === 'failed') {
    return required !== null ? `—/${required}` : '—'
  }

  const count = required !== null ? `${sleeved}/${required}` : `${sleeved}`

  if (state === 'assembling') {
    return `${count} sleeved`
  }

  return count
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeckStateBadge({
  state,
  sleeved,
  required,
  proxyCount = 0,
  onRetry,
  className,
}: DeckStateBadgeProps) {
  const config = STATE_CONFIG[state]

  const suffix =
    state === 'playable' && proxyCount > 0
      ? `${proxyCount} proxies`
      : formatCount(state, sleeved, required)

  const showSuffix = state !== 'checking' && (state !== 'playable' || proxyCount > 0)

  return (
    <Badge
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium',
        className
      )}
      style={{
        color: state === 'failed' ? 'var(--text-primary)' : config.token,
        backgroundColor: config.bg ?? 'transparent',
        border:
          state === 'failed'
            ? '1px solid var(--state-failed)'
            : '1px solid transparent',
      }}
    >
      <span aria-label={`${config.word}${showSuffix ? ` · ${suffix}` : ''}`}>
        {state === 'checking' ? (
          <LoadingSpinner
            className="size-3"
            style={{ color: config.token }}
          />
        ) : (
          <MaterialSymbol
            name={config.icon}
            filled={config.iconFilled}
            style={{ color: config.token }}
          />
        )}
        {config.word}
        {showSuffix && ` · ${suffix}`}
        {state === 'failed' && onRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRetry()
            }}
            className="ml-1 underline underline-offset-2 focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            Try again
          </button>
        )}
      </span>
    </Badge>
  )
}
