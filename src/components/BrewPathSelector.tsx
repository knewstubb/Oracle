'use client'

import { Crown, Lightbulb } from 'lucide-react'

interface BrewPathSelectorProps {
  onSelectPath: (path: 'commander' | 'concept') => void
}

export function BrewPathSelector({ onSelectPath }: BrewPathSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
      <button
        type="button"
        onClick={() => onSelectPath('commander')}
        aria-label="Start with a Commander"
        className="group flex flex-col items-center gap-3 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] px-6 py-8 text-center transition-all duration-200 hover:border-[var(--color-teal)] hover:bg-[rgba(29,158,117,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] transition-colors group-hover:bg-[rgba(29,158,117,0.12)]">
          <Crown className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-[var(--color-teal)]" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          Start with a Commander
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose your commander first and build a strategy around their abilities.
        </p>
      </button>

      <button
        type="button"
        onClick={() => onSelectPath('concept')}
        aria-label="Start with a Concept"
        className="group flex flex-col items-center gap-3 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] px-6 py-8 text-center transition-all duration-200 hover:border-[var(--color-teal)] hover:bg-[rgba(29,158,117,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] transition-colors group-hover:bg-[rgba(29,158,117,0.12)]">
          <Lightbulb className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-[var(--color-teal)]" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          Start with a Concept
        </h3>
        <p className="text-sm text-muted-foreground">
          Describe a theme or strategy and let the AI find the perfect commander.
        </p>
      </button>
    </div>
  )
}
