'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { MaterialSymbol } from './MaterialSymbol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Finish = 'nonfoil' | 'foil' | 'etched'

export interface FinishTagProps {
  finish: Finish
  /** Render the normally-hidden "Nonfoil" label (detail panels / columns). */
  showNonfoil?: boolean
  className?: string
}

// ---------------------------------------------------------------------------
// Configuration — words, icons, tokens (D-043)
// ---------------------------------------------------------------------------

const FINISH_CONFIG: Record<
  Finish,
  { word: string; icon?: string; iconFilled?: boolean }
> = {
  nonfoil: { word: 'Nonfoil' },
  foil: { word: 'Foil', icon: 'auto_awesome', iconFilled: false },
  etched: { word: 'Etched', icon: 'texture', iconFilled: false },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinishTag({ finish, showNonfoil, className }: FinishTagProps) {
  if (finish === 'nonfoil' && !showNonfoil) {
    return null
  }

  const config = FINISH_CONFIG[finish]

  return (
    <Badge
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium',
        className
      )}
      style={{
        color: 'var(--text-secondary)',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
      }}
    >
      {config.icon && (
        <MaterialSymbol
          name={config.icon}
          filled={config.iconFilled}
          style={{ color: 'var(--text-secondary)' }}
        />
      )}
      {config.word}
    </Badge>
  )
}
