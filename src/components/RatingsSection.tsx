'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AttributeScores, ContributingCards } from '@/lib/rating-engine'

interface RatingsSectionProps {
  scores: AttributeScores
  contributingCards: ContributingCards
}

interface AttributeConfig {
  key: keyof AttributeScores
  label: string
  groups: { label: string; field: keyof ContributingCards }[]
}

const ATTRIBUTES: AttributeConfig[] = [
  {
    key: 'consistency',
    label: 'Consistency',
    groups: [
      { label: 'Tutors', field: 'tutors' },
      { label: 'Draw Engines', field: 'drawEngines' },
    ],
  },
  {
    key: 'resilience',
    label: 'Resilience',
    groups: [
      { label: 'Recursion', field: 'recursion' },
    ],
  },
  {
    key: 'interaction',
    label: 'Interaction',
    groups: [
      { label: 'Removal', field: 'removal' },
      { label: 'Counterspells', field: 'counterspells' },
      { label: 'Board Wipes', field: 'boardWipes' },
    ],
  },
  {
    key: 'speed',
    label: 'Speed',
    groups: [
      { label: 'Fast Mana', field: 'fastMana' },
    ],
  },
]

export function RatingsSection({ scores, contributingCards }: RatingsSectionProps) {
  return (
    <section aria-label="Deck attribute ratings">
      <h2 className="mb-4 text-[length:var(--fs-lg)] font-medium">Attribute Ratings</h2>
      <div className="space-y-4">
        {ATTRIBUTES.map((attr) => (
          <AttributeRow
            key={attr.key}
            config={attr}
            score={scores[attr.key]}
            contributingCards={contributingCards}
          />
        ))}
      </div>
    </section>
  )
}

function AttributeRow({
  config,
  score,
  contributingCards,
}: {
  config: AttributeConfig
  score: number
  contributingCards: ContributingCards
}) {
  const [expanded, setExpanded] = useState(false)
  const percentage = (score / 10) * 100

  // Check if there are any cards to show
  const hasCards = config.groups.some(
    (g) => contributingCards[g.field].length > 0
  )

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          disabled={!hasCards}
          className="flex w-full items-center gap-3 text-left disabled:cursor-default"
          aria-expanded={expanded}
          aria-controls={`${config.key}-details`}
        >
          <span className="w-5 shrink-0 text-muted-foreground">
            {hasCards ? (
              expanded ? (
                <ChevronDown className="size-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4" aria-hidden="true" />
              )
            ) : (
              <span className="inline-block size-4" />
            )}
          </span>
          <span className="w-28 shrink-0 text-[length:var(--fs-md)] font-medium">
            {config.label}
          </span>
          <div
            className="relative h-4 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={1}
            aria-valuemax={10}
            aria-label={`${config.label} score: ${score} out of 10`}
          >
            <div
              className="h-full rounded-full bg-primary/70 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-[length:var(--fs-md)] font-medium tabular-nums">
            {score}/10
          </span>
        </button>
      </div>

      {expanded && hasCards && (
        <div
          id={`${config.key}-details`}
          className="ml-8 mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-3"
        >
          {config.groups.map((group) => {
            const cards = contributingCards[group.field]
            if (cards.length === 0) return null
            return (
              <div key={group.field}>
                <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
                  {group.label} ({cards.length})
                </p>
                <p className="mt-0.5 text-[length:var(--fs-sm)] text-foreground/80">
                  {cards.join(', ')}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
