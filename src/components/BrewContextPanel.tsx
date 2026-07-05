'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BrewPhase, DeckSkeleton } from '@/types/brew'
import type { Commander } from '@/components/CommanderSearch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrewContextPanelProps {
  phase: BrewPhase
  commander: Commander | null
  skeleton: DeckSkeleton | null
  onHintClick?: (hint: string) => void
  onSave?: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOURS = [
  { key: 'W', label: 'White', className: 'bg-[#F9FAF4] text-[#444]' },
  { key: 'U', label: 'Blue', className: 'bg-[#0E68AB] text-white' },
  { key: 'B', label: 'Black', className: 'bg-[#150B00] text-[#aaa] border border-[rgba(255,255,255,0.1)]' },
  { key: 'R', label: 'Red', className: 'bg-[#D3202A] text-white' },
  { key: 'G', label: 'Green', className: 'bg-[#00733E] text-white' },
]

const HINTS = [
  '"I want something aggressive that wins fast"',
  '"Something that combos off but isn\'t too competitive"',
  '"I have [[Sol Ring]] and want to build around it"',
  '"Suggest a commander from my collection"',
]

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BrewContextPanel({
  phase,
  commander,
  skeleton,
  onHintClick,
  onSave,
}: BrewContextPanelProps) {
  // Determine which state to show
  const hasCommander = !!commander || !!skeleton

  if (hasCommander) {
    return <ConfirmedPanel skeleton={skeleton} commander={commander} onSave={onSave} />
  }

  return <InvestigatingPanel onHintClick={onHintClick} />
}

// ---------------------------------------------------------------------------
// State 1: Investigating (no commander confirmed)
// ---------------------------------------------------------------------------

function InvestigatingPanel({
  onHintClick,
}: {
  onHintClick?: (hint: string) => void
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Panel content — hints only (colour identity captured via conversation extraction) */}
      <div className="flex-1 overflow-y-auto p-3.5">
        <HintsTab onHintClick={onHintClick} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hints Tab
// ---------------------------------------------------------------------------

function HintsTab({ onHintClick }: { onHintClick?: (hint: string) => void }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[rgba(255,255,255,0.25)]">
        Try saying...
      </div>
      <div className="flex flex-col gap-1.5">
        {HINTS.map((hint) => (
          <button
            key={hint}
            onClick={() => onHintClick?.(hint.replace(/^"|"$/g, ''))}
            className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2 text-left transition-colors hover:border-[rgba(55,138,221,0.2)] hover:bg-[rgba(55,138,221,0.06)] group"
          >
            <span className="text-[11px] leading-relaxed text-[rgba(255,255,255,0.35)] group-hover:text-[rgba(55,138,221,0.8)]">
              {hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// State 2: Commander confirmed / Skeleton building
// ---------------------------------------------------------------------------

function ConfirmedPanel({
  skeleton,
  commander,
  onSave,
}: {
  skeleton: DeckSkeleton | null
  commander: Commander | null
  onSave?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'skeleton' | 'commander'>('skeleton')

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-[rgba(255,255,255,0.06)]">
        <button
          onClick={() => setActiveTab('skeleton')}
          className={cn(
            'flex-1 py-2 text-center text-[11px] border-b-2 transition-colors',
            activeTab === 'skeleton'
              ? 'text-[#378ADD] border-b-[#378ADD]'
              : 'text-[rgba(255,255,255,0.3)] border-b-transparent'
          )}
        >
          Skeleton
        </button>
        <button
          onClick={() => setActiveTab('commander')}
          className={cn(
            'flex-1 py-2 text-center text-[11px] border-b-2 transition-colors',
            activeTab === 'commander'
              ? 'text-[#378ADD] border-b-[#378ADD]'
              : 'text-[rgba(255,255,255,0.3)] border-b-transparent'
          )}
        >
          Commander
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto p-3.5">
        {activeTab === 'skeleton' ? (
          <SkeletonTab skeleton={skeleton} onSave={onSave} />
        ) : (
          <CommanderTab commander={commander} skeleton={skeleton} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton Tab
// ---------------------------------------------------------------------------

interface SkeletonCategory {
  name: string
  owned: number
  target: number
  isGap: boolean
}

function SkeletonTab({
  skeleton,
  onSave,
}: {
  skeleton: DeckSkeleton | null
  onSave?: () => void
}) {
  if (!skeleton) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8">
        <p className="text-[11px] text-[rgba(255,255,255,0.3)]">Building skeleton...</p>
      </div>
    )
  }

  // Compute category stats from skeleton data
  const categories: SkeletonCategory[] = skeleton.categories.map((cat) => {
    const owned = cat.cards.filter((c) => c.ownershipStatus === 'owned').length
    const target = cat.cards.length
    const ratio = target > 0 ? owned / target : 1
    const isGap = ratio < 0.5
    return { name: cat.name, owned, target, isGap }
  })

  const totalOwned = categories.reduce((sum, c) => sum + c.owned, 0)
  const totalTarget = skeleton.totalCards

  return (
    <div className="flex flex-col gap-3.5">
      {/* Category rows */}
      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[rgba(255,255,255,0.25)]">
          Deck skeleton
        </div>
        <div className="flex flex-col">
          {categories.map((cat) => (
            <SkeletonCategoryRow key={cat.name} category={cat} />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-1.5 flex gap-2.5">
          <LegendItem colour="#1D9E75" label="Owned" />
          <LegendItem colour="rgba(255,255,255,0.15)" label="To acquire" />
          <LegendItem colour="#E24B4A" label="Gap" />
        </div>
      </div>

      {/* Divider */}
      <hr className="border-t border-[rgba(255,255,255,0.06)]" />

      {/* Collection coverage */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-[rgba(255,255,255,0.25)]">
          Collection coverage
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[22px] font-medium text-[#1D9E75]">{totalOwned}</span>
          <span className="text-[11px] text-[rgba(255,255,255,0.3)]">
            of ~{totalTarget} cards owned
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-sm bg-[rgba(255,255,255,0.07)]">
          <div
            className="h-full rounded-sm bg-[#1D9E75]"
            style={{ width: `${totalTarget > 0 ? Math.round((totalOwned / totalTarget) * 100) : 0}%` }}
          />
        </div>
        <div className="text-[10px] text-[rgba(255,255,255,0.25)]">
          ~{totalTarget - totalOwned} cards to acquire
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={onSave}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[rgba(55,138,221,0.35)] bg-[rgba(55,138,221,0.15)] px-2 py-2 text-[12px] font-medium text-[#378ADD] transition-colors hover:bg-[rgba(55,138,221,0.25)]"
      >
        <Save className="h-3.5 w-3.5" />
        Save as draft deck
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton Category Row
// ---------------------------------------------------------------------------

function SkeletonCategoryRow({ category }: { category: SkeletonCategory }) {
  const { name, owned, target, isGap } = category
  const fillPercent = target > 0 ? Math.round((owned / target) * 100) : 0

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 border-b border-[rgba(255,255,255,0.04)] py-1.5 last:border-b-0',
        isGap && 'mx-[-14px] bg-[rgba(226,75,74,0.05)] px-3.5'
      )}
    >
      <span
        className={cn(
          'flex-1 text-[11px]',
          isGap ? 'text-[#E24B4A]' : 'text-[rgba(255,255,255,0.4)]'
        )}
      >
        {name}
      </span>
      <div className="h-[3px] max-w-[60px] flex-1 overflow-hidden rounded-sm bg-[rgba(255,255,255,0.06)]">
        <div
          className={cn('h-full rounded-sm', isGap ? 'bg-[#E24B4A]' : 'bg-[#1D9E75]')}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <span
        className={cn(
          'min-w-[22px] text-right text-[10px]',
          isGap ? 'text-[#E24B4A]' : 'text-[#1D9E75]'
        )}
      >
        {owned}
      </span>
      <span className="text-[10px] text-[rgba(255,255,255,0.2)]">/ {target}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Legend Item
// ---------------------------------------------------------------------------

function LegendItem({ colour, label }: { colour: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-1.5 rounded-[1px]" style={{ background: colour }} />
      <span className="text-[9px] text-[rgba(255,255,255,0.25)]">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Commander Tab
// ---------------------------------------------------------------------------

function CommanderTab({
  commander,
  skeleton,
}: {
  commander: Commander | null
  skeleton: DeckSkeleton | null
}) {
  const name = commander?.name ?? skeleton?.commanderName ?? 'Commander'
  const typeLine = commander?.typeLine ?? ''
  const colours = commander?.colorIdentity ?? skeleton?.colourIdentity ?? []

  return (
    <div className="flex flex-col gap-3">
      {/* Art placeholder */}
      <div className="relative w-full overflow-hidden rounded-md" style={{ paddingTop: '60%' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1a2e] via-[#1a0d2e] to-[#0d2e1a]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <div className="text-[12px] font-medium text-white">{name}</div>
          {typeLine && (
            <div className="text-[10px] text-[rgba(255,255,255,0.5)]">{typeLine}</div>
          )}
        </div>
      </div>

      {/* Pips row */}
      {colours.length > 0 && (
        <div className="flex gap-1">
          {colours.map((c) => {
            const col = COLOURS.find((x) => x.key === c)
            return (
              <div
                key={c}
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium',
                  col?.className ?? 'bg-[#888780] text-white'
                )}
              >
                {c}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
