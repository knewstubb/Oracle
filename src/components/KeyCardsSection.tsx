import type { KeyCard } from '@/lib/rating-engine'

interface KeyCardsSectionProps {
  keyCards: KeyCard[]
}

const tierLabels: Record<KeyCard['priorityTier'], string> = {
  commander: 'Commander',
  combo: 'Combo',
  'multi-category': 'Multi-Role',
  synergy: 'Synergy',
}

const tierColors: Record<KeyCard['priorityTier'], string> = {
  commander: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  combo: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'multi-category': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  synergy: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
}

export function KeyCardsSection({ keyCards }: KeyCardsSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Key Cards</h3>
      <ol className="space-y-2">
        {keyCards.map((card, index) => (
          <li key={card.cardName} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{card.cardName}</span>
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${tierColors[card.priorityTier]}`}
                >
                  {tierLabels[card.priorityTier]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{card.reason}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
