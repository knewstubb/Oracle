'use client'

import { AlertTriangle, Check, MessageCircle, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StrategyRow } from '@/components/StrategyRow'
import type { DeckHealthResponse, DeckHealthRole, HealthRoleKey, TypeCount } from '@/lib/deck-health'
import { GapDetail } from '@/components/GapDetail'

export interface DeckHealthPanelProps {
  open: boolean
  onClose: () => void
  data: DeckHealthResponse | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  deckId: number
  /** The Light role whose gap detail is showing, or null for the overview. */
  gapRole: HealthRoleKey | null
  onGapRole: (role: HealthRoleKey | null) => void
  /** Opens the Oracle chat with a question about the deck (role null) or one role. Omitted: no Chat about this buttons. */
  onChat?: (role: HealthRoleKey | null) => void
}

function Meter({ role }: { role: DeckHealthRole }) {
  const max = Math.max(role.typical * 1.5, role.have, 1)
  return (
    <div
      aria-hidden="true"
      className="relative mt-1.5 h-1.5 rounded-full"
      style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${(role.have / max) * 100}%`,
          backgroundColor: role.state === 'light' ? 'var(--signal-warning)' : 'var(--text-secondary)',
        }}
      />
      <div
        className="absolute top-[-2px] h-2.5 w-0.5"
        style={{ left: `${(role.typical / max) * 100}%`, backgroundColor: 'var(--text-primary)' }}
      />
    </div>
  )
}

const SOURCE_SHORT: Record<DeckHealthRole['targetSource'], string> = {
  edhrec_average: 'EDHREC average deck',
  edhrec_estimate: 'EDHREC estimate',
  general_guide: 'General guide',
}

const TYPE_LABELS: Record<TypeCount['type'], string> = {
  creature: 'Creatures',
  instant: 'Instants',
  sorcery: 'Sorceries',
  artifact: 'Artifacts',
  enchantment: 'Enchantments',
  planeswalker: 'Planeswalkers',
  land: 'Lands',
}

/** Card types for this commander, shown when the role check uses the general guide (spec whats-missing 5.5). */
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

function RoleRow({ role, onOpen }: { role: DeckHealthRole; onOpen: (role: HealthRoleKey) => void }) {
  const light = role.state === 'light'
  const short = Math.max(0, role.typical - role.have)
  const className = 'block w-full rounded-lg border px-3 py-2.5 text-left'
  const style = { borderColor: light ? 'var(--signal-warning)' : 'var(--border-default)' }
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {role.label}
        </span>
        <span
          className="inline-flex items-center gap-1 text-[length:var(--fs-sm)]"
          style={{ color: light ? 'var(--signal-warning)' : 'var(--text-secondary)' }}
        >
          {light ? <AlertTriangle size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
          {light ? `Light, ${short} short` : 'On track'}
        </span>
      </div>
      <Meter role={role} />
      <div className="mt-1.5 text-[length:var(--fs-sm)]" style={{ color: 'var(--text-primary)' }}>
        {role.text}
      </div>
      <div className="text-[length:var(--fs-xs)]" style={{ color: 'var(--text-secondary)' }}>
        {SOURCE_SHORT[role.targetSource]}
      </div>
    </>
  )
  // A Light role opens its gap detail; a role on track is plain information.
  return light ? (
    <button
      type="button"
      onClick={() => onOpen(role.role)}
      aria-label={`${role.label}: light, ${short} short. ${role.text} See cards that fill it.`}
      className={`${className} min-h-11 cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-2 focus-visible:outline-white`}
      style={style}
    >
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  )
}

/**
 * Deck health panel: right-hand drawer (420px) on wide screens, bottom sheet (86% high) below 700px.
 * Overview (Strategy row, verdict card, counts by role), or the gap detail of one Light role.
 */
export function DeckHealthPanel({ open, onClose, data, isLoading, isError, onRetry, deckId, gapRole, onGapRole, onChat }: DeckHealthPanelProps) {
  const light = data?.verdict.headline !== 'Well covered'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="deck-health-panel"
          className="fixed z-50 flex flex-col overflow-hidden outline-none max-[699px]:inset-x-0 max-[699px]:bottom-0 max-[699px]:h-[86%] max-[699px]:rounded-t-xl min-[700px]:inset-y-0 min-[700px]:right-0 min-[700px]:w-[420px]"
          style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
            <DialogPrimitive.Title tabIndex={-1} className="text-base font-semibold outline-none" style={{ color: 'var(--text-primary)' }}>
              Deck health
            </DialogPrimitive.Title>
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" />}>
              <X aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {isLoading && !gapRole && (
              <p role="status" style={{ color: 'var(--text-secondary)' }}>
                Checking deck health…
              </p>
            )}

            {isError && !isLoading && !gapRole && (
              <div role="alert" className="space-y-2">
                <p className="flex items-center gap-1.5" style={{ color: 'var(--signal-critical)' }}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  Couldn&apos;t check deck health.
                </p>
                <p style={{ color: 'var(--text-secondary)' }}>Your cards haven&apos;t changed.</p>
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Try again
                </Button>
              </div>
            )}

            {gapRole && (
              <GapDetail key={gapRole} deckId={deckId} role={gapRole} onBack={() => onGapRole(null)} onChat={onChat ? () => onChat(gapRole) : undefined} />
            )}

            {data && !isError && !gapRole && (
              <>
                <StrategyRow text={data.strategy.text} />

                <section
                  aria-label="Verdict"
                  className="rounded-lg border px-3 py-3"
                  style={{ borderColor: light ? 'var(--signal-warning)' : 'var(--border-default)' }}
                >
                  <h3
                    className="flex items-center gap-1.5 text-base font-semibold"
                    style={{ color: light ? 'var(--signal-warning)' : 'var(--text-primary)' }}
                  >
                    {light ? <AlertTriangle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                    <span>{data.verdict.headline}</span>
                  </h3>
                  {data.verdict.subline && (
                    <p className="mt-1" style={{ color: 'var(--text-primary)' }}>
                      {data.verdict.subline}
                    </p>
                  )}
                  <p className="mt-1.5 text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
                    {data.sourceLine}
                  </p>
                  {data.checkState === 'partial' && (
                    <p role="status" className="mt-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-warning)' }}>
                      Couldn&apos;t fully check. {data.unclassifiedCount} cards have no card text yet, so counts may be low.
                    </p>
                  )}
                  {onChat && (
                    <Button variant="outline" size="sm" onClick={() => onChat(null)} className="mt-3 h-8 px-2.5 text-[length:var(--fs-sm)]">
                      <MessageCircle aria-hidden="true" />
                      Chat about this
                    </Button>
                  )}
                </section>

                <h3 className="pt-1 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Counts by role
                </h3>
                <div className="space-y-2">
                  {data.roles.map((r) => (
                    <RoleRow key={r.role} role={r} onOpen={onGapRole} />
                  ))}
                </div>
                {data.verdict.usingGeneralGuide && data.typeCountsLabel && <CardTypes data={data} />}
              </>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}
