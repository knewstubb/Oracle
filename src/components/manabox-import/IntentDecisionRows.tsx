'use client'

import { cn } from '@/lib/utils'
import type { IntentChange, IntentCopyView } from '@/lib/import-intent'
import { MOVE_FROM, MOVE_SKIP, MOVE_SKIP_TITLE, PRINTING_ADD, PRINTING_USE, printingNeedsChoice, printingLabel } from './import-copy'

/**
 * Inline decisions for one card (spec §5 and §6). Never a modal; sits under the card's row.
 * - Held only in other deck(s): "{Card}: copy will be moved from" [deck…] [Skip]. One deck is pre-picked.
 * - Owned in another printing: "{Card}: you own it as X; this deck lists Y…" [Use my X] [Add this printing].
 */
export function IntentDecisionRows({
  cardName,
  views,
  disabled,
  onChange,
}: {
  cardName: string
  views: IntentCopyView[]
  disabled?: boolean
  onChange: (index: number, change: IntentChange) => void
}) {
  const withDecision = views.filter((v) => !v.generic && (v.move || v.printing))
  if (withDecision.length === 0) return null
  return (
    <div className="flex flex-col gap-1 pb-1.5 pl-[62px] pr-2.5">
      {withDecision.map((v) => {
        const prefix = views.length > 1 ? `Copy ${v.index + 1}: ` : ''
        return (
          <div
            key={v.index}
            role="group"
            aria-label={`${prefix}${cardName}: needs a decision`}
            className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-canvas)] px-2 py-1 text-[length:var(--fs-xs)]"
          >
            {v.move && (
              <>
                <span>
                  <b className="font-medium">{prefix}{cardName}:</b> {MOVE_FROM}
                </span>
                <span className="inline-flex flex-wrap gap-1">
                  {v.move.candidates.map((c) => (
                    <ChoiceButton
                      key={c.deckId}
                      pressed={v.move?.chosen === c.deckId}
                      disabled={disabled}
                      onClick={() => onChange(v.index, { move: { kind: 'move', fromDeckId: c.deckId } })}
                    >
                      {c.deckName}
                    </ChoiceButton>
                  ))}
                  <ChoiceButton
                    pressed={v.move.chosen === 'skip'}
                    disabled={disabled}
                    title={MOVE_SKIP_TITLE}
                    onClick={() => onChange(v.index, { move: { kind: 'skip' } })}
                  >
                    {MOVE_SKIP}
                  </ChoiceButton>
                </span>
              </>
            )}
            {v.printing && (
              <span>
                <b className="font-medium">{prefix}{cardName}:</b>{' '}
                you own {printingLabel(v.printing.owned)}; this list has {printingLabel(v.printing.listed)}. Tick Add to add the listed printing instead.
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ChoiceButton({
  pressed,
  disabled,
  title,
  onClick,
  children,
}: {
  pressed: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2.5 text-[length:var(--fs-xs)] hover:bg-[var(--bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50',
        pressed
          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-bg)] text-foreground'
          : 'border-[var(--border-default)] text-muted-foreground'
      )}
    >
      {children}
    </button>
  )
}
