'use client'

import { Swords } from 'lucide-react'
import { CardImage } from '@/components/CardImage'

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
  }
  totalCards: number
  proxyCount: number
  onDebriefClick?: () => void
  actions?: React.ReactNode
}

export function PersistentHeader({ deck, totalCards, proxyCount, onDebriefClick, actions }: PersistentHeaderProps) {
  return (
    <div
      className="sticky top-0 z-30 border-b border-border bg-background px-6 py-4"
    >
      <div className="flex items-center justify-between gap-4">
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
                className="truncate text-[16px] font-medium leading-tight"
              >
                {deck.name}
              </h1>

              {/* Precon mod badge */}
              {(deck.is_precon_mod || deck.deck_type === 'Precon Mod') && (
                <span
                  className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--fs-sm)] font-medium"
                  style={{
                    background: 'rgba(239,159,39,0.15)',
                    color: '#EF9F27',
                  }}
                >
                  Precon mod
                </span>
              )}
            </div>

            {/* Stats line */}
            <p className="mt-0.5 text-[length:var(--fs-sm)] text-muted-foreground">
              {totalCards} cards · {proxyCount} proxies
              {deck.bracket && ` · Bracket ${deck.bracket}`}
            </p>
          </div>
        </div>

        {/* Right section: actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Post-game debrief button */}
          <button
            type="button"
            onClick={onDebriefClick}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[length:var(--fs-md)] font-medium transition-colors"
            style={{
              background: 'rgba(29,158,117,0.15)',
              border: '0.5px solid rgba(29,158,117,0.4)',
              color: '#1D9E75',
            }}
          >
            <Swords className="h-4 w-4" aria-hidden="true" />
            Post-game debrief
          </button>

          {/* Additional actions slot */}
          {actions}
        </div>
      </div>
    </div>
  )
}
