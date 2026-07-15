'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { CardImage } from '@/components/CardImage'
import { StatusBadge } from '@/components/StatusBadge'
import type { DeckStatus } from '@/lib/deck-status'
import { cn } from '@/lib/utils'

export type HealthPipStatus = 'ok' | 'warn' | 'crit'

export interface DeckTileProps {
  id: number
  name: string
  commanderName: string
  commanderScryfallId: string
  colourIdentity: string[]
  cardCount?: number
  deckType?: string | null
  healthStatus?: Array<HealthPipStatus>
  proxyCount?: number
  isDraft?: boolean
  status?: DeckStatus
  /** For Boxed decks: resolved/total count. Undefined for non-Boxed or when not computed. */
  completeness?: { resolved: number; total: number } | null
  /** Whether this deck's cards are allocated against the collection. */
  allocate?: boolean
}

const COLOUR_BAR_MAP: Record<string, { hex: string; label: string }> = {
  W: { hex: 'var(--mana-white)', label: 'White' },
  U: { hex: 'var(--mana-blue)', label: 'Blue' },
  B: { hex: 'var(--mana-black)', label: 'Black' },
  R: { hex: 'var(--mana-red)', label: 'Red' },
  G: { hex: 'var(--mana-green)', label: 'Green' },
}

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G']

const PIP_COLOUR_MAP: Record<HealthPipStatus, string> = {
  ok: '#1D9E75',
  warn: '#EF9F27',
  crit: '#E24B4A',
}

const PIP_LABEL_MAP: Record<HealthPipStatus, string> = {
  ok: 'healthy',
  warn: 'warning',
  crit: 'critical',
}

export function DeckTile({
  id,
  name,
  commanderName,
  commanderScryfallId,
  colourIdentity,
  cardCount,
  deckType,
  healthStatus,
  proxyCount,
  isDraft,
  status,
  completeness,
  allocate,
}: DeckTileProps) {
  const [isHovered, setIsHovered] = useState(false)
  const sorted = COLOUR_ORDER.filter((c) => colourIdentity.includes(c))
  const colourLabel = sorted.map((c) => COLOUR_BAR_MAP[c]?.label).filter(Boolean).join(', ')

  // Health pips: show only categories with violations (warn/crit), max 3 before truncation
  // If all ok: show single "✓" text instead of pips
  const showHealthPips = healthStatus && healthStatus.length > 0 && !isDraft
  const allOk = showHealthPips && healthStatus!.every((s) => s === 'ok')
  const violationPips = showHealthPips ? healthStatus!.filter((s) => s !== 'ok') : []
  const displayPips = violationPips.slice(0, 3)
  const truncatedCount = violationPips.length - 3

  return (
    <div
      className={cn(
        'group relative block overflow-hidden rounded-2xl bg-card',
        '[box-shadow:0px_1px_3px_rgba(0,0,0,0.4),0px_4px_8px_3px_rgba(0,0,0,0.2)]',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:[box-shadow:0px_4px_8px_3px_rgba(0,0,0,0.4),0px_1px_3px_rgba(0,0,0,0.5)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background',
        isDraft && 'border border-dashed border-[rgba(55,138,221,0.3)]'
      )}
    >
      {/* Commander art — 50% opacity, full on hover, with hover overlay */}
      <div
        className="relative aspect-[4/3] overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardImage
          scryfallId={commanderScryfallId}
          alt={`${commanderName} card art`}
          width={400}
          height={300}
          artCrop
          noPreview
          className="h-full w-full object-cover opacity-50 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />

        {/* Hover overlay — only over the art section */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center gap-3 bg-black/70 transition-opacity duration-200',
            isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          aria-hidden={!isHovered}
        >
          <Link
            href={`/decks/${id}?debrief=true`}
            className="rounded-lg bg-[rgba(29,158,117,0.2)] px-3 py-1.5 text-[length:var(--fs-sm)] font-medium text-[#1D9E75] border border-[rgba(29,158,117,0.4)] hover:bg-[rgba(29,158,117,0.3)] transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            Post-game
          </Link>
          <Link
            href={`/decks/${id}`}
            className="rounded-lg bg-[rgba(255,255,255,0.1)] px-3 py-1.5 text-[length:var(--fs-sm)] font-medium text-white/80 border border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.15)] transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            Open
          </Link>
        </div>
      </div>

      {/* Info section */}
      <div className="px-4 pb-3 pt-3">
        <Link
          href={`/decks/${id}`}
          aria-label={`${name} — ${commanderName}`}
          className="block focus-visible:outline-none"
        >
          <h3 className="truncate text-[length:var(--fs-lg)] font-medium text-foreground leading-tight">
            {name}
          </h3>
          <p className="mt-0.5 truncate text-[length:var(--fs-md)] text-muted-foreground">
            {commanderName}
          </p>
        </Link>

        {/* Health pips row */}
        {showHealthPips && (
          <div
            className="mt-1.5 flex items-center gap-1"
            role="img"
            aria-label={
              allOk
                ? 'Deck health: all categories healthy'
                : `Deck health: ${violationPips.length} ${violationPips.length === 1 ? 'issue' : 'issues'}`
            }
          >
            {allOk ? (
              <span className="text-[length:var(--fs-sm)] font-medium text-[#1D9E75]" aria-hidden="true">
                ✓
              </span>
            ) : (
              <>
                {displayPips.map((status, i) => (
                  <span
                    key={i}
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: PIP_COLOUR_MAP[status] }}
                    aria-label={PIP_LABEL_MAP[status]}
                  />
                ))}
                {truncatedCount > 0 && (
                  <span className="text-[length:var(--fs-xs)] text-muted-foreground/70">
                    +{truncatedCount}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Proxy count */}
        {proxyCount !== undefined && proxyCount > 0 && (
          <p className="mt-1 text-right text-[length:var(--fs-xs)] text-muted-foreground/60">
            {proxyCount} {proxyCount === 1 ? 'proxy' : 'proxies'}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {status && <StatusBadge status={status} className="text-[length:var(--fs-xs)]" />}
          {/* Unplayable badge — Built decks with incomplete resolution */}
          {status === 'boxed' && completeness && completeness.resolved < completeness.total && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium"
              style={{ color: 'var(--status-over)', background: 'rgba(255, 95, 31, 0.12)' }}
              aria-label={`Unplayable: ${completeness.resolved} of ${completeness.total} cards resolved`}
            >
              <AlertTriangle className="size-3" aria-hidden="true" />
              Unplayable · {completeness.resolved}/{completeness.total}
            </span>
          )}
          {/* Sandbox badge — Boxed deck with allocate manually off (atypical) */}
          {status === 'boxed' && allocate === false && (
            <span className="inline-flex items-center rounded-full bg-[rgba(255,255,255,0.08)] px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-muted-foreground">
              Sandbox
            </span>
          )}
          {deckType === 'Precon Mod' && (
            <span className="inline-flex items-center rounded-full bg-green-900/30 px-2 py-0.5 text-[length:var(--fs-xs)] font-medium uppercase text-green-300">
              Precon Mod
            </span>
          )}
          {!status && isDraft ? (
            <span className="inline-flex items-center rounded-full bg-[var(--accent-primary-bg)] px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--accent-primary)]">
              Draft
            </span>
          ) : (
            cardCount !== undefined && (
              <span className="text-[length:var(--fs-sm)] text-muted-foreground/70">
                {cardCount} Cards
              </span>
            )
          )}
        </div>
      </div>

      {/* Colour identity bars — inside the card with margin */}
      {sorted.length > 0 && (
        <div
          className="mx-3 mb-3 flex gap-1 overflow-hidden rounded-full"
          role="img"
          aria-label={colourLabel || 'Colourless'}
        >
          {sorted.map((c) => {
            const colour = COLOUR_BAR_MAP[c]
            if (!colour) return null
            return (
              <div
                key={c}
                className="h-1.5 flex-1 first:rounded-l-full last:rounded-r-full"
                style={{ backgroundColor: colour.hex }}
                aria-hidden="true"
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
