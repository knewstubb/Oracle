// The bordered box used for warning rows in the rail (Cards legality problems, Deck health warnings).
import type { ReactNode } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const PROBLEM_LIST_CLASS = 'space-y-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2'
export const PROBLEM_ROW_CLASS = 'flex items-center gap-2 text-[12px] font-medium'

/** Row content: icon slot (amber warning, green check, or an empty spacer of the same width), text, optional right-aligned figure. */
export function ProblemRowContent({ text, right, icon = 'warning' }: { text: string; right?: ReactNode; icon?: 'warning' | 'ok' | 'none' }) {
  return (
    <>
      {icon === 'warning' && <AlertTriangle size={16} aria-hidden="true" className="shrink-0" style={{ color: 'var(--signal-warning)' }} />}
      {icon === 'ok' && <Check size={16} aria-hidden="true" className="shrink-0" style={{ color: 'var(--signal-success)' }} data-testid="health-ok-icon" />}
      {icon === 'none' && <span aria-hidden="true" className="size-4 shrink-0" data-testid="health-icon-spacer" />}
      <span className="min-w-0 flex-1 truncate" title={text}>{text}</span>
      {right && <span className="shrink-0">{right}</span>}
    </>
  )
}

export function ProblemList({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <ul className={cn(PROBLEM_LIST_CLASS, className)} data-testid={testId}>
      {children}
    </ul>
  )
}
