'use client'

import type { StrategyBrief } from '@/types/brew'
import { ColourPips } from '@/components/ColourPips'

interface BrewBriefCardProps {
  brief: StrategyBrief
  onConfirm: () => void
  onEdit: () => void
}

function formatBudget(brief: StrategyBrief): string {
  const labels: Record<StrategyBrief['budgetPreference'], string> = {
    collection: 'Collection only',
    budget: 'Budget',
    unrestricted: 'Unrestricted',
  }
  const label = labels[brief.budgetPreference]
  if (brief.budgetPreference === 'budget' && brief.budgetCeiling != null) {
    return `${label} ($${brief.budgetCeiling})`
  }
  return label
}

export function BrewBriefCard({ brief, onConfirm, onEdit }: BrewBriefCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] p-4">
      {/* Commander + colour pips */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Commander</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {brief.commanderName}
          </span>
          <ColourPips colours={brief.colourIdentity} size={10} />
        </div>
      </div>

      {/* Primary Win Condition */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Primary Win Condition</span>
        <span className="text-sm text-foreground">{brief.primaryWinCondition}</span>
      </div>

      {/* Secondary Win Condition */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Secondary Win Condition</span>
        <span className="text-sm text-foreground">{brief.secondaryWinCondition}</span>
      </div>

      {/* Target Bracket */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Target Bracket</span>
        <span className="text-sm text-foreground">Bracket {brief.targetBracket}</span>
      </div>

      {/* Known Includes */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Known Includes</span>
        {brief.knownIncludes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {brief.knownIncludes.map((card) => (
              <span
                key={card}
                className="inline-block rounded-md bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-xs text-foreground"
              >
                {card}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground italic">None specified</span>
        )}
      </div>

      {/* Playstyle */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Playstyle</span>
        <span className="text-sm text-foreground">{brief.playstyleDescription}</span>
      </div>

      {/* Budget */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Budget</span>
        <span className="text-sm text-foreground">{formatBudget(brief)}</span>
      </div>

      {/* Action buttons */}
      <div className="mt-1 flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-lg bg-[var(--color-teal)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-[rgba(255,255,255,0.24)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Edit
        </button>
      </div>
    </div>
  )
}
