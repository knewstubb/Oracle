'use client'

import { CardImage } from '@/components/CardImage'
import { BuildSelector } from '@/components/BuildSelector'
import { formatPrice } from '@/lib/collection-printing-utils'

interface PersistentHeaderProps {
  deck: {
    id: number
    name: string
    commander_name: string
    commander_scryfall_id: string
    colour_identity: string
    card_count: number
    deck_type: string | null
    is_precon_mod?: boolean
    bracket: string | null
    format?: string
    salt_score?: number | null
  }
  totalCards: number
  proxyCount: number
  totalValue?: number
  actions?: React.ReactNode
}

export function PersistentHeader({ deck, totalCards, proxyCount, totalValue, actions }: PersistentHeaderProps) {
  return (
    <div
      className="sticky top-0 z-30 px-6 py-4"
      style={{ background: 'transparent' }}
    >
      <div className="mx-auto flex max-w-[var(--content-max-width)] items-center justify-between gap-4">
        {/* Left section: avatar + deck info */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Commander avatar */}
          <div className="shrink-0 h-9 w-9 overflow-hidden rounded-full">
            <CardImage
              scryfallId={deck.commander_scryfall_id}
              alt={`${deck.commander_name} avatar`}
              width={36}
              height={36}
              artCrop
              noPreview
              className="h-9 w-9 object-cover"
            />
          </div>

          {/* Deck name + badges + stats */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1
                className="truncate text-[length:var(--fs-3xl)] font-medium leading-tight"
              >
                {deck.name}
              </h1>

              {/* Precon mod badge */}
              {(deck.is_precon_mod || deck.deck_type === 'Precon Mod') && (
                <span
                  className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--fs-sm)] font-medium"
                  style={{
                    background: 'var(--signal-warning-bg)',
                    color: 'var(--signal-warning)',
                  }}
                >
                  Precon mod
                </span>
              )}
            </div>

            {/* Stats line */}
            <p className="mt-0.5 flex items-center gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
              <span>{totalCards} cards · {proxyCount} proxies</span>
              {deck.bracket && <span>· Bracket {deck.bracket}</span>}
              {totalValue != null && totalValue > 0 && <span>· {formatPrice(totalValue)}</span>}
              {deck.salt_score != null && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium"
                  style={{
                    // Color scale: 0-1 = green, 1-2 = yellow, 2+ = orange/red
                    background: deck.salt_score < 1 
                      ? 'rgba(29, 158, 117, 0.12)' 
                      : deck.salt_score < 2 
                        ? 'rgba(245, 158, 11, 0.12)'
                        : 'rgba(226, 75, 74, 0.12)',
                    color: deck.salt_score < 1
                      ? 'var(--signal-success)'
                      : deck.salt_score < 2
                        ? 'var(--signal-warning)'
                        : 'var(--signal-error)',
                  }}
                  title={`Salt Score: ${deck.salt_score.toFixed(2)} — Community "saltiness" rating from EDHREC (0-4 scale)`}
                >
                  <span aria-hidden="true">🧂</span>
                  {deck.salt_score.toFixed(1)}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right section: actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Build selector — only for Commander format */}
          {(!deck.format || deck.format === 'commander') && (
            <BuildSelector deckId={deck.id} />
          )}
          {actions}
        </div>
      </div>
    </div>
  )
}
