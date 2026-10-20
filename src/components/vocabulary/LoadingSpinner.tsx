'use client'

import { cn } from '@/lib/utils'

export interface LoadingSpinnerProps {
  className?: string
  style?: React.CSSProperties
}

/**
 * Small scoped spinner for loading badge / state text.
 * Respects prefers-reduced-motion via the global motion reset.
 */
export function LoadingSpinner({ className, style }: LoadingSpinnerProps) {
  return (
    <svg
      className={cn('animate-spin motion-reduce:animate-none', className)}
      style={style}
      viewBox="0 0 16 16"
      fill="none"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
