'use client'
import { useEffect, useRef } from 'react'
import { AlertTriangle, ChevronLeft, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { DeckHealthResponse, HealthKind, HealthRoleKey, HealthRow, TypeCount } from '@/lib/deck-health'
import { GapDetail } from '@/components/GapDetail'
import { HeaderIcon, RangeMeter, VerdictMark, rowAriaLabel } from '@/components/deck-health-parts'

export interface DeckHealthPanelProps {
  open: boolean
  onClose: () => void
  data: DeckHealthResponse | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  deckId: number
  /** The row whose details are showing, or null for the overview. */
  selected: HealthKind | null
  onSelect: (kind: HealthKind | null) => void
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

const TYPE_LABELS: Record<TypeCount['type'], string> = {
  creature: 'Creatures',
  instant: 'Instants',
  sorcery: 'Sorceries',
  artifact: 'Artifacts',
  enchantment: 'Enchantments',
  planeswalker: 'Planeswalkers',
  land: 'Lands',
}

/** Card types for this commander, shown when there is no EDHREC average for the rows (spec whats-missing 5.5). */
function CardTypes({ data }: { data: DeckHealthResponse }) {
  return (
    <section aria-label="Card types" className="space-y-1">
      <h3 className="pt-1 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--text-secondary)' }}>
        Card types
      </h3>
      {data.typeCounts.length > 0 ? (
        <ul className="space-y-0.5 text-[length:var(--fs-sm)]" style={{ color: 'var(--text-primary)' }}>
          {data.typeCounts.map((t) => (
            <li key={t.type}>
              {TYPE_LABELS[t.type]}: you have {t.have ?? 0} · usually {Math.round(t.average)}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[length:var(--fs-xs)]" style={{ color: 'var(--text-secondary)' }}>
        {data.typeCountsLabel}
      </p>
    </section>
  )
}

const BOX = 'rounded-lg border px-3 py-3'

/** One row as a card in the overview. Every row opens its own details. */
function RowCard({ row, onOpen }: { row: HealthRow; onOpen: (kind: HealthKind) => void }) {
  const off = row.verdict === 'light' || row.verdict === 'heavy'
  return (
    <button
      type="button"
      onClick={() => onOpen(row.kind)}
      aria-label={rowAriaLabel(row)}
      className="block min-h-11 w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-2 focus-visible:outline-white"
      style={{ borderColor: off ? 'var(--signal-warning)' : 'var(--border-default)' }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.label}</span>
        <VerdictMark verdict={row.verdict} />
      </span>
      <RangeMeter row={row} />
      <span className="mt-1.5 block text-[length:var(--fs-sm)]" style={{ color: 'var(--text-primary)' }}>
        {row.verdict === null ? `${row.have} ${plural(row.have, 'card', 'cards')}. Every nonland card not counted in the five rows above. No range, no verdict.` : row.text}
      </span>
    </button>
  )
}

function Overview({ data, onOpen }: { data: DeckHealthResponse; onOpen: (kind: HealthKind) => void }) {
  const allIn = data.verdict.inRange === data.verdict.ranged
  const ranged = data.rows.filter((r) => r.range !== null)
  const gamePlan = data.rows.find((r) => r.kind === 'game_plan')
  return (
    <>
      <section aria-label="Verdict" className={BOX} style={{ borderColor: allIn ? 'var(--border-default)' : 'var(--signal-warning)' }}>
        <h3 className="flex items-center gap-1.5 text-base font-semibold" style={{ color: allIn ? 'var(--text-primary)' : 'var(--signal-warning)' }}>
          <HeaderIcon health={data} />
          <span>{data.verdict.headline}</span>
        </h3>
        <p className="mt-1" style={{ color: 'var(--text-primary)' }}>
          Each of the first five rows is checked against its range. Ranges are the Command Zone template for a 99-card deck.
        </p>
        {data.checkState === 'partial' && (
          <p role="status" className="mt-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-warning)' }}>
            Couldn&apos;t fully check. {data.unclassifiedCount} cards have no card text yet, so Oracle could not place them.
          </p>
        )}
      </section>
      {ranged.map((r) => (
        <RowCard key={r.kind} row={r} onOpen={onOpen} />
      ))}
      {gamePlan && <RowCard row={gamePlan} onOpen={onOpen} />}
      <section aria-label="For reference only" className="space-y-1">
        <h3 className="pt-1 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--text-secondary)' }}>
          For reference only: the average EDHREC deck for this commander
        </h3>
        <p className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
          {data.reference.available
            ? `${ranged.map((r) => `${r.label.replace(' / Mass Disruption', '')} ${r.reference ?? 0}`).join(', ')}. Not used for any verdict. ${data.reference.label}.`
            : `${data.reference.label}. Not used for any verdict.`}
        </p>
      </section>
      {!data.reference.available && data.typeCountsLabel && <CardTypes data={data} />}
    </>
  )
}

const FIRST_CARDS = 6

function RowDetail({ data, row, deckId }: { data: DeckHealthResponse; row: HealthRow; deckId: number }) {
  const off = row.verdict === 'light' || row.verdict === 'heavy'
  const shown = row.cards.slice(0, FIRST_CARDS)
  const more = row.cards.length - shown.length
  const isGamePlan = row.kind === 'game_plan'
  return (
    <>
      <div className={BOX} style={{ borderColor: off ? 'var(--signal-warning)' : 'var(--border-default)' }}>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <VerdictMark verdict={isGamePlan ? null : row.verdict} />
          <span className="font-normal" style={{ color: 'var(--text-primary)' }}>
            {row.have} {plural(row.have, 'card', 'cards')}
          </span>
        </h3>
        <RangeMeter row={row} />
        <p className="mt-1.5" style={{ color: 'var(--text-primary)' }}>
          {isGamePlan
            ? 'Every nonland card that is not counted in Lands, Ramp, Card Advantage, Targeted Removal or Board Wipes. It is a total, so it has no range and no verdict.'
            : row.text}
        </p>
        {isGamePlan && data.unclassifiedCount > 0 && (
          <p className="mt-1.5" style={{ color: 'var(--text-primary)' }}>
            {data.unclassifiedCount} of them {plural(data.unclassifiedCount, 'has', 'have')} no card text yet, so Oracle could not place {plural(data.unclassifiedCount, 'it', 'them')} anywhere else.
          </p>
        )}
        {isGamePlan && row.guide && (
          <p className="mt-1.5 text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
            The Command Zone template suggests about {row.guide.min} to {row.guide.max} here. That is a guide only.
          </p>
        )}
      </div>
      {row.range && (
        <div className={BOX} style={{ borderColor: 'var(--border-default)' }}>
          <h3 className="font-semibold">Range: {row.range.min} to {row.range.max}</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Default. The Command Zone template.</p>
        </div>
      )}
      {row.kind === 'lands' && (
        <div className={BOX} style={{ borderColor: 'var(--border-default)' }}>
          <h3 className="font-semibold">Mana sources: {data.manaSources.total}</h3>
          <p>{data.notes.manaSources.replace(/^Mana sources \d+: /, '')}</p>
          {data.manaSources.doubleFaced > 0 && (
            <p className="mt-1 text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
              A double-faced land card counts once in mana sources and is shown beside the land count. It does not change the {data.mainDeckCount} cards in the deck.
            </p>
          )}
        </div>
      )}
      {row.verdict === 'light' && row.role && (
        <section aria-label="Cards that could fill it" className="space-y-2">
          <h3 className="text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--text-secondary)' }}>Cards that could fill it</h3>
          <GapDetail key={row.role} deckId={deckId} role={row.role} embedded onBack={() => {}} />
        </section>
      )}
      <section aria-label="Cards counted here" className="space-y-1">
        <h3 className="text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--text-secondary)' }}>Cards counted here</h3>
        {shown.length > 0 ? (
          <>
            <ul className="text-[length:var(--fs-sm)]">
              {shown.map((c) => (
                <li key={c.name}>
                  {c.name}
                  {c.quantity > 1 ? ` ×${c.quantity}` : ''}
                </li>
              ))}
            </ul>
            {more > 0 && <p className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>and {more} more</p>}
          </>
        ) : (
          <p className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>None.</p>
        )}
      </section>
      {row.reference !== null && (
        <section aria-label="For reference only" className="space-y-1">
          <h3 className="text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--text-secondary)' }}>For reference only</h3>
          <p className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
            The average EDHREC deck for this commander has {row.reference}. Not used for any verdict.
          </p>
        </section>
      )}
    </>
  )
}

/**
 * Deck health panel: right-hand drawer (420px) on wide screens, bottom sheet (86% high) below 700px.
 * Overview (six rows, notes, EDHREC reference) or the details of one row.
 */
export function DeckHealthPanel({ open, onClose, data, isLoading, isError, onRetry, deckId, selected, onSelect }: DeckHealthPanelProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const first = useRef(true)
  const row = selected && data ? data.rows.find((r) => r.kind === selected) ?? null : null
  // Moving between the overview and a row puts focus on the title, as the mockup does.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (open) titleRef.current?.focus()
  }, [selected, open])
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="deck-health-panel"
          initialFocus={titleRef}
          className="fixed z-50 flex flex-col overflow-hidden outline-none max-[699px]:inset-x-0 max-[699px]:bottom-0 max-[699px]:h-[86%] max-[699px]:rounded-t-xl min-[700px]:inset-y-0 min-[700px]:right-0 min-[700px]:w-[420px]"
          style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
            <div className="min-w-0">
              {row && (
                <Button variant="ghost" size="sm" onClick={() => onSelect(null)} className="-ml-2 min-h-11">
                  <ChevronLeft aria-hidden="true" />
                  Deck health
                </Button>
              )}
              <DialogPrimitive.Title ref={titleRef} tabIndex={-1} className="text-base font-semibold outline-none" style={{ color: 'var(--text-primary)' }}>
                {row ? row.label : 'Deck health'}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="min-h-11 min-w-11" />}>
              <X aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {isLoading && (
              <p role="status" style={{ color: 'var(--text-secondary)' }}>
                Checking deck health…
              </p>
            )}
            {isError && !isLoading && (
              <div role="alert" className="space-y-2">
                <p className="flex items-center gap-1.5" style={{ color: 'var(--signal-critical)' }}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  Couldn&apos;t check deck health.
                </p>
                <p style={{ color: 'var(--text-secondary)' }}>Your cards haven&apos;t changed.</p>
                <Button variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
                  Try again
                </Button>
              </div>
            )}
            {data && !isError && !row && <Overview data={data} onOpen={onSelect} />}
            {data && !isError && row && <RowDetail key={row.kind} data={data} row={row} deckId={deckId} />}
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}
