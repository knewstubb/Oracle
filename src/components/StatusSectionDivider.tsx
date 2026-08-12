'use client'

import { Check, FlaskConical, Archive } from 'lucide-react'

interface StatusSectionDividerProps {
  /** Direct label to display (takes precedence over status) */
  label?: string
  /** Optional count to show */
  count?: number
}

const LABEL_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  'Active': {
    icon: <Check className="size-4" />,
    color: 'var(--accent-primary)',
  },
  'Inactive': {
    icon: <Archive className="size-4" />,
    color: 'var(--text-muted)',
  },
  'Brewing': {
    icon: <FlaskConical className="size-4" />,
    color: '#378ADD',
  },
}

export function StatusSectionDivider({ label = 'Active', count }: StatusSectionDividerProps) {
  const config = LABEL_CONFIG[label] ?? { icon: null, color: 'var(--text-muted)' }

  return (
    <div className="flex items-center gap-4 py-6">
      {/* Left rule */}
      <div className="flex-1 h-px bg-[var(--border-subtle)]" />
      
      {/* Icon + label */}
      <div 
        className="flex items-center gap-2 text-[length:var(--fs-xs)] font-medium tracking-wider"
        style={{ color: config.color }}
      >
        {config.icon}
        <span>{label.toUpperCase()}</span>
        {count !== undefined && (
          <span className="text-muted-foreground">({count})</span>
        )}
      </div>
      
      {/* Right rule */}
      <div className="flex-1 h-px bg-[var(--border-subtle)]" />
    </div>
  )
}
