'use client'

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { LoadingSpinner } from './LoadingSpinner'
import { MaterialSymbol } from './MaterialSymbol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlotBadgeState =
  | 'original'
  | 'proxy'
  | 'available'
  | 'alt_available'
  | 'proxy_available'
  | 'unavailable'
  | 'unowned'
  | 'basic'
  | 'checking'
  | 'failed'

export interface SlotBadgeProps {
  state: SlotBadgeState
  /** Free-form reason line (e.g. "In Korvold", "Proxy in Korvold"). */
  reason?: string
  variant?: 'badge' | 'icon'
  size?: 'sm' | 'md'
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
  textToken?: string
  loud: boolean
  positive?: boolean
  filled: boolean
}

const STATE_CONFIG: Record<SlotBadgeState, StateConfig> = {
  original: {
    word: 'Original',
    icon: 'check',
    iconFilled: true,
    token: 'var(--state-original)',
    loud: false,
    filled: true,
  },
  proxy: {
    word: 'Proxy',
    icon: 'comedy_mask',
    iconFilled: true,
    token: 'var(--state-proxy)',
    bg: 'var(--state-proxy-bg)',
    loud: true,
    filled: true,
  },
  basic: {
    word: 'Basic',
    icon: 'landscape',
    iconFilled: false,
    token: 'var(--state-basic)',
    loud: false,
    filled: true,
  },
  available: {
    word: 'Available',
    icon: 'circle',
    iconFilled: false,
    token: 'var(--state-available)',
    loud: false,
    positive: true,
    filled: false,
  },
  alt_available: {
    word: 'Alt available',
    icon: 'swap_horiz',
    iconFilled: false,
    token: 'var(--state-alt-available)',
    loud: false,
    positive: true,
    filled: false,
  },
  proxy_available: {
    word: 'Proxy available',
    icon: 'comedy_mask',
    iconFilled: false,
    token: 'var(--state-proxy-available)',
    bg: 'var(--state-proxy-available-bg)',
    loud: true,
    filled: false,
  },
  unavailable: {
    word: 'Unavailable',
    icon: 'lock',
    iconFilled: false,
    token: 'var(--state-unavailable)',
    bg: 'var(--state-unavailable-bg)',
    loud: true,
    filled: false,
  },
  unowned: {
    word: 'Unowned',
    icon: 'do_not_disturb_on',
    iconFilled: false,
    token: 'var(--state-unowned)',
    bg: 'var(--state-unowned-bg)',
    loud: true,
    filled: false,
  },
  checking: {
    word: 'Checking…',
    icon: '',
    iconFilled: false,
    token: 'var(--state-checking)',
    loud: false,
    filled: false,
  },
  failed: {
    word: "Couldn't check",
    icon: 'error',
    iconFilled: false,
    token: 'var(--state-failed)',
    bg: 'var(--state-failed-bg)',
    textToken: 'var(--text-primary)',
    loud: true,
    filled: false,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function accessibleLabel(state: SlotBadgeState, reason?: string): string {
  const placement =
    state === 'original' || state === 'proxy' || state === 'basic'
      ? 'Sleeved'
      : 'Unsleeved'

  const config = STATE_CONFIG[state]
  const parts = [placement, config.word.toLowerCase()]
  if (reason) parts.push(reason)
  return parts.join(', ')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SlotBadge({
  state,
  reason,
  variant = 'badge',
  size = 'sm',
  onRetry,
  className,
}: SlotBadgeProps) {
  const config = STATE_CONFIG[state]
  const label = accessibleLabel(state, reason)

  // ── Icon-only variant ─────────────────────────────────────────────────
  if (variant === 'icon') {
    const badgeSize = size === 'md' ? 24 : 18
    const iconSize = size === 'md' ? 16 : 12

    const iconContent =
      state === 'checking' ? (
        <LoadingSpinner
          className="size-3"
          style={{ color: config.token }}
        />
      ) : (
        <MaterialSymbol
          name={config.icon}
          filled={config.iconFilled}
          style={{
            fontSize: iconSize,
            width: iconSize,
            height: iconSize,
            lineHeight: `${iconSize}px`,
            color:
              config.filled && !config.loud
                ? 'var(--bg-surface)'
                : config.token,
          }}
        />
      )

    const iconBadge = (
      <span
        className={cn(
          'inline-grid place-items-center rounded-full shrink-0',
          className
        )}
        style={{
          width: badgeSize,
          height: badgeSize,
          border: `1px solid ${config.token}`,
          backgroundColor: config.filled
            ? config.token
            : config.loud && config.bg
              ? config.bg
              : 'transparent',
        }}
        aria-label={label}
      >
        {iconContent}
      </span>
    )

    return (
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger render={iconBadge} />
          <TooltipContent>
            {config.word}
            {reason && (
              <span className="block text-xs opacity-80">{reason}</span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // ── Full badge variant ────────────────────────────────────────────────
  const wordColor =
    config.textToken ??
    (config.loud || config.positive
      ? 'var(--text-primary)'
      : 'var(--text-secondary)')

  return (
    <span className={cn('inline-flex flex-col items-start gap-0.5', className)}>
      <Badge
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium'
        )}
        style={{
          color: wordColor,
          backgroundColor: config.bg ?? 'transparent',
          border: config.filled
            ? '1px solid transparent'
            : `1px solid ${config.token}`,
        }}
      >
        <span aria-label={label}>
          {state === 'checking' ? (
            <LoadingSpinner className="size-3" style={{ color: config.token }} />
          ) : (
            <MaterialSymbol
              name={config.icon}
              filled={config.iconFilled}
              style={{ color: config.token }}
            />
          )}
          {config.word}
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
      {state === 'unavailable' && reason && (
        <span
          className="max-w-[24ch] truncate text-[length:var(--fs-xs)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          {reason}
        </span>
      )}
    </span>
  )
}
