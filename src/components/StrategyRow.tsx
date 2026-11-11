'use client'

export interface StrategyRowProps {
  /** Text from the health response, for example "Not set yet, using the general guide". */
  text: string
}

/**
 * Phase 4 placeholder. Shows the strategy as "Not set yet" and a greyed "Set strategy" control that does nothing.
 * There is no editor and no link to one in Phase 2.
 */
export function StrategyRow({ text }: StrategyRowProps) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <div>
        <div className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
          Strategy
        </div>
        <div className="text-[length:var(--fs-base)]" style={{ color: 'var(--text-primary)' }}>
          {text}
        </div>
      </div>
      <button
        type="button"
        aria-disabled="true"
        onClick={(e) => e.preventDefault()}
        className="flex shrink-0 cursor-not-allowed flex-col items-end text-[length:var(--fs-sm)] underline"
        style={{ color: 'var(--text-secondary)' }}
      >
        Set strategy
        <span className="text-[length:var(--fs-xs)] no-underline">Phase 4 · not built yet</span>
      </button>
    </div>
  )
}
