'use client'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceTextProps {
  amount: number | null
  /** Prefix for advisor "buy" prices (D-035). */
  estimate?: boolean
  /** Dense columns show "—" with the full words as the accessible label. */
  dense?: boolean
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a price using the shared vocabulary (D-043).
 *
 * - Known prices: "$12.40" or "est. $12.40".
 * - Unknown prices: "Price unknown" in detail views, "—" in dense columns.
 *   Never shows $0.00.
 */
export function PriceText({
  amount,
  estimate,
  dense,
  className,
}: PriceTextProps) {
  if (amount === null) {
    if (dense) {
      return (
        <span
          className={cn('text-[length:var(--fs-sm)]', className)}
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Price unknown"
        >
          —
        </span>
      )
    }

    return (
      <span
        className={cn('text-[length:var(--fs-sm)]', className)}
        style={{ color: 'var(--text-secondary)' }}
      >
        Price unknown
      </span>
    )
  }

  const price = formatCurrency(amount)
  const display = estimate ? `est. ${price}` : price

  return (
    <span
      className={cn('text-[length:var(--fs-sm)]', className)}
      style={{ color: 'var(--text-secondary)' }}
    >
      {display}
    </span>
  )
}
