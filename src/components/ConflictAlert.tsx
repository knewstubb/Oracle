'use client'

import { AlertTriangle } from 'lucide-react'

export interface ConflictAlertProps {
  affectedDeckName: string
  cardName: string
}

/**
 * Inline amber warning rendered on recommendation cards when adding a card
 * would create a proxy conflict in another deck.
 *
 * Validates: Requirements 6.2, 6.4, 6.5
 */
export function ConflictAlert({ affectedDeckName, cardName }: ConflictAlertProps) {
  return (
    <div
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[length:var(--fs-sm)] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Adding <strong>{cardName}</strong> would move the original from{' '}
        <strong>{affectedDeckName}</strong>, creating a proxy there.
      </span>
    </div>
  )
}
