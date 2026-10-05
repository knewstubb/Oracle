'use client'

import { Check, Layers, PackageCheck, PackageX } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ReconciliationSelection = 'owned' | 'unowned' | `deck:${number}`

export interface ReconciliationNavDeck {
  deckId: number
  deckName: string
  isActive: boolean
  /** Unresolved conflict printings in this deck. */
  unresolved: number
}

interface ReconciliationNavProps {
  selected: ReconciliationSelection
  onSelect: (selection: ReconciliationSelection) => void
  decks: ReconciliationNavDeck[]
  ownedUnresolved: number
  unownedUnresolved: number
}

function CountPill({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ color: 'var(--signal-success)', background: 'var(--signal-success-bg)' }}
        aria-label="All resolved"
      >
        <Check className="size-3" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span
      className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[length:var(--fs-xs)] font-semibold leading-5"
      style={{ color: 'var(--signal-warning)', background: 'var(--signal-warning-bg)' }}
      aria-label={`${count} need a decision`}
    >
      {count}
    </span>
  )
}

interface NavItemProps {
  selected: boolean
  onClick: () => void
  icon?: React.ReactNode
  title: string
  subtitle?: string
  count: number
}

function NavItem({ selected, onClick, icon, title, subtitle, count }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        selected
          ? 'border-[var(--border-default)] bg-[var(--bg-surface-hover)]'
          : 'border-transparent hover:bg-[var(--bg-surface-hover)]'
      )}
    >
      {icon && (
        <span className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--fs-md)] font-medium text-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
            {subtitle}
          </span>
        )}
      </span>
      <CountPill count={count} />
    </button>
  )
}

export function ReconciliationNav({
  selected,
  onSelect,
  decks,
  ownedUnresolved,
  unownedUnresolved,
}: ReconciliationNavProps) {
  return (
    <nav aria-label="Reconciliation lists" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <NavItem
          selected={selected === 'owned'}
          onClick={() => onSelect('owned')}
          icon={<PackageCheck className="size-4" />}
          title="All owned"
          subtitle="Cards you have in your collection"
          count={ownedUnresolved}
        />
        <NavItem
          selected={selected === 'unowned'}
          onClick={() => onSelect('unowned')}
          icon={<PackageX className="size-4" />}
          title="All unowned"
          subtitle="Cards you still need"
          count={unownedUnresolved}
        />
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-1.5 px-3 pb-1 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          <Layers className="size-3" aria-hidden="true" />
          Decks
        </h2>
        {decks.map((deck) => (
          <NavItem
            key={deck.deckId}
            selected={selected === `deck:${deck.deckId}`}
            onClick={() => onSelect(`deck:${deck.deckId}`)}
            title={deck.deckName}
            subtitle={deck.isActive ? 'Active' : 'Brew'}
            count={deck.unresolved}
          />
        ))}
      </div>
    </nav>
  )
}
