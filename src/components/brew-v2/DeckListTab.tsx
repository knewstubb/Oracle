'use client'

import { useMemo } from 'react'
import type { DeckCard, CategoryHealth } from '@/lib/brew-v2-types'
import { getCategoryCounts, getCategoryHealth } from '@/lib/brew-v2-deck-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeckListTabProps {
  cards: DeckCard[]
  categoryHealthTargets: Record<string, number | null>
  onCardClick: (cardName: string) => void
  expandedCard: string | null
  renderCardRow: (card: DeckCard) => React.ReactNode
  /** Drag-to-reassign: category currently being hovered as a drop target */
  dropTargetCategory?: string | null
  /** Drag-to-reassign: handler for dragover on a category header */
  onDragOver?: (e: React.DragEvent, category: string) => void
  /** Drag-to-reassign: handler for dragleave on a category header */
  onDragLeave?: () => void
  /** Drag-to-reassign: handler for drop on a category header */
  onDrop?: (targetCategory: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIN_CONDITION_CATEGORY = 'Win Condition'
const ALT_WIN_CONDITION_CATEGORY = 'Alt Win Condition'

// ---------------------------------------------------------------------------
// Health Status Dot Colors
// ---------------------------------------------------------------------------

function getHealthDotColor(status: CategoryHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'bg-teal-400'
    case 'low':
      return 'bg-amber-400'
    case 'high':
      return 'bg-red-400'
    case 'unmonitored':
    default:
      return 'bg-gray-500'
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DeckListTab({
  cards,
  categoryHealthTargets,
  onCardClick,
  expandedCard,
  renderCardRow,
  dropTargetCategory,
  onDragOver,
  onDragLeave,
  onDrop,
}: DeckListTabProps) {
  // Compute filtered card groups
  const winConditionCards = useMemo(
    () => cards.filter((c) => c.primary_category === WIN_CONDITION_CATEGORY),
    [cards]
  )

  const altWinConditionCards = useMemo(
    () => cards.filter((c) => c.primary_category === ALT_WIN_CONDITION_CATEGORY),
    [cards]
  )

  const remainingCards = useMemo(
    () =>
      cards.filter(
        (c) =>
          c.primary_category !== WIN_CONDITION_CATEGORY &&
          c.primary_category !== ALT_WIN_CONDITION_CATEGORY
      ),
    [cards]
  )

  // Group remaining cards by primary_category
  const categoryGroups = useMemo(() => {
    const groups: Record<string, DeckCard[]> = {}
    for (const card of remainingCards) {
      if (!groups[card.primary_category]) {
        groups[card.primary_category] = []
      }
      groups[card.primary_category].push(card)
    }
    return groups
  }, [remainingCards])

  // Compute health for all categories
  const deckState = useMemo(() => ({ cards, suggestions: [], isGenerating: false, canvasPositions: {}, explorationArchive: [] }), [cards])
  const healthEntries = useMemo(
    () => getCategoryHealth(deckState, categoryHealthTargets),
    [deckState, categoryHealthTargets]
  )
  const healthMap = useMemo(() => {
    const map: Record<string, CategoryHealth> = {}
    for (const entry of healthEntries) {
      map[entry.name] = entry
    }
    return map
  }, [healthEntries])

  const categoryCounts = useMemo(() => getCategoryCounts(deckState), [deckState])

  return (
    <div className="flex flex-col gap-1 overflow-y-auto">
      {/* Pinned: Win Conditions */}
      <PinnedSection
        title="Win conditions"
        accent="teal"
        cards={winConditionCards}
        onCardClick={onCardClick}
        expandedCard={expandedCard}
        renderCardRow={renderCardRow}
      />

      {/* Pinned: Alt Win Conditions */}
      <PinnedSection
        title="Alt win conditions"
        accent="amber"
        cards={altWinConditionCards}
        onCardClick={onCardClick}
        expandedCard={expandedCard}
        renderCardRow={renderCardRow}
      />

      {/* Dynamic category sections */}
      {Object.entries(categoryGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, categoryCards]) => (
          <CategorySection
            key={category}
            name={category}
            count={categoryCounts[category] ?? 0}
            health={healthMap[category] ?? { name: category, count: 0, target: null, status: 'unmonitored' }}
            cards={categoryCards}
            onCardClick={onCardClick}
            expandedCard={expandedCard}
            renderCardRow={renderCardRow}
            isDropTarget={dropTargetCategory === category}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          />
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pinned Section (Win Conditions)
// ---------------------------------------------------------------------------

interface PinnedSectionProps {
  title: string
  accent: 'teal' | 'amber'
  cards: DeckCard[]
  onCardClick: (cardName: string) => void
  expandedCard: string | null
  renderCardRow: (card: DeckCard) => React.ReactNode
}

function PinnedSection({
  title,
  accent,
  cards,
  onCardClick,
  expandedCard,
  renderCardRow,
}: PinnedSectionProps) {
  const gradientStyle =
    accent === 'teal'
      ? 'from-[rgba(45,212,191,0.08)] to-transparent'
      : 'from-[rgba(245,158,11,0.08)] to-transparent'

  const borderColor =
    accent === 'teal'
      ? 'border-l-teal-400/40'
      : 'border-l-amber-400/40'

  const titleColor =
    accent === 'teal'
      ? 'text-teal-300/80'
      : 'text-amber-300/80'

  return (
    <div
      className={`rounded-md border-l-2 bg-gradient-to-r ${gradientStyle} ${borderColor} mb-1`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${titleColor}`}>
          {title}
        </span>
        <span className="text-[9px] text-[rgba(255,255,255,0.3)]">
          ({cards.length})
        </span>
      </div>

      {/* Card rows */}
      {cards.length === 0 ? (
        <div className="px-2.5 pb-2 text-[10px] italic text-[rgba(255,255,255,0.2)]">
          No cards assigned
        </div>
      ) : (
        <div className="flex flex-col">
          {cards.map((card) => (
            <div
              key={card.card_name}
              onClick={() => onCardClick(card.card_name)}
              className="cursor-pointer"
            >
              {renderCardRow(card)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category Section
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  name: string
  count: number
  health: CategoryHealth
  cards: DeckCard[]
  onCardClick: (cardName: string) => void
  expandedCard: string | null
  renderCardRow: (card: DeckCard) => React.ReactNode
  /** Whether this section header is the active drop target */
  isDropTarget?: boolean
  /** Drag-to-reassign: handler for dragover on this category header */
  onDragOver?: (e: React.DragEvent, category: string) => void
  /** Drag-to-reassign: handler for dragleave on this category header */
  onDragLeave?: () => void
  /** Drag-to-reassign: handler for drop on this category header */
  onDrop?: (targetCategory: string) => void
}

function CategorySection({
  name,
  count,
  health,
  cards,
  onCardClick,
  expandedCard,
  renderCardRow,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
}: CategorySectionProps) {
  const healthDotColor = getHealthDotColor(health.status)

  // Blue dashed border when this header is a valid drop target (requirement 9.4)
  const dropTargetStyles = isDropTarget
    ? 'border-2 border-dashed border-blue-400'
    : ''

  return (
    <div className="mb-1">
      {/* Category Header — valid drop target */}
      <div
        className={`flex items-center gap-1.5 rounded-t-md border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 ${dropTargetStyles}`}
        data-category={name}
        onDragOver={onDragOver ? (e) => onDragOver(e, name) : undefined}
        onDragLeave={onDragLeave}
        onDrop={
          onDrop
            ? (e) => {
                e.preventDefault()
                onDrop(name)
              }
            : undefined
        }
      >
        <span className={`h-[6px] w-[6px] rounded-full ${healthDotColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.5)]">
          {name}
        </span>
        <span className="text-[9px] text-[rgba(255,255,255,0.25)]">
          {count}
        </span>
      </div>

      {/* Card rows */}
      {cards.length === 0 ? (
        <div className="px-2.5 py-1.5 text-[10px] italic text-[rgba(255,255,255,0.15)]">
          Empty
        </div>
      ) : (
        <div className="flex flex-col">
          {cards.map((card) => (
            <div
              key={card.card_name}
              onClick={() => onCardClick(card.card_name)}
              className="cursor-pointer"
            >
              {renderCardRow(card)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
