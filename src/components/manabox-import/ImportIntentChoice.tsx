'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'
import type { ImportIntent } from '../../../docs/oracle/contracts/import-intent.types'
import { INTENT_OPTIONS, INTENT_QUESTION, INTENT_CHOOSE_ERROR } from './import-copy'

export interface ImportIntentChoiceProps {
  value: ImportIntent | null
  onChange: (intent: ImportIntent) => void
  /** Show "Choose one to continue." under the cards. */
  showError?: boolean
  disabled?: boolean
}

/**
 * "What's this deck?": three radio cards, nothing pre-selected. Native radios, so the arrow keys
 * move and select within the group (spec §10).
 */
export function ImportIntentChoice({ value, onChange, showError, disabled }: ImportIntentChoiceProps) {
  const labelId = useId()
  const errorId = useId()
  const name = useId()
  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-[length:var(--fs-md)] font-medium">
        {INTENT_QUESTION}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={showError ? errorId : undefined}
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {INTENT_OPTIONS.map((opt) => {
          const checked = value === opt.value
          return (
            <label
              key={opt.value}
              data-intent={opt.value}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                'hover:border-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]',
                'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent-primary)]',
                checked
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-bg)]'
                  : 'border-[var(--border-default)]',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-[var(--accent-primary)]"
              />
              <span className="flex min-w-0 flex-col">
                <span className={cn('text-[length:var(--fs-md)]', checked ? 'font-bold' : 'font-medium')}>
                  {opt.label}
                </span>
                <span className="text-[length:var(--fs-xs)] text-muted-foreground">{opt.description}</span>
              </span>
            </label>
          )
        })}
      </div>
      {showError && !value && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-[length:var(--fs-xs)] text-foreground">
          <span aria-hidden="true" className="text-[var(--signal-critical)]">⚠</span>
          {INTENT_CHOOSE_ERROR}
        </p>
      )}
    </div>
  )
}
