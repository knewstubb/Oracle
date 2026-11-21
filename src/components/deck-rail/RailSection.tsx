import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SECTION_LABEL_CLASS } from '@/lib/ui-tokens'
/**
 * One rail section: a muted 10px / 500 / uppercase label, 16px padding, 12px between items and a hairline above it.
 * Every rail section uses this so labels, padding and dividers stay identical. `action` is a link at the right of the label (Edit).
 */
export function RailSection({ id, title, children, className, testId, action }: { id: string; title: string; children: ReactNode; className?: string; testId?: string; action?: ReactNode }) {
  return (
    <section aria-labelledby={id} data-testid={testId} className={cn('space-y-3 border-t border-[var(--border-subtle)] p-4', className)}>
      {action ? (
        <div className="flex items-center justify-between gap-2">
          <h2 id={id} className={SECTION_LABEL_CLASS}>{title}</h2>
          {action}
        </div>
      ) : (
        <h2 id={id} className={SECTION_LABEL_CLASS}>{title}</h2>
      )}
      {children}
    </section>
  )
}
