import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SECTION_LABEL_CLASS } from '@/lib/ui-tokens'

/**
 * One rail section: a muted 11px / 600 / uppercase label, 20px padding and a hairline above it.
 * Every rail section uses this so labels, padding and dividers stay identical.
 */
export function RailSection({ id, title, children, className, testId }: { id: string; title: string; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section aria-labelledby={id} data-testid={testId} className={cn('space-y-2 border-t border-white/[0.08] p-5', className)}>
      <h2 id={id} className={SECTION_LABEL_CLASS}>{title}</h2>
      {children}
    </section>
  )
}
