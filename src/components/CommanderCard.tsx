'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useCardHoverPreview } from './CardHoverPreview'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommanderData {
  id: string
  canonical_key: string
  display_name: string
  color_identity: string
  scryfall_id: string | null
  edhrec_rank: number | null      // Rank within color identity (1 = most popular in that color)
  edhrec_deck_count: number | null
  global_rank: number | null      // Rank across all commanders (1 = most popular overall)
  leadership_type: string
  owned: boolean
}

interface CommanderCardProps {
  commander: CommanderData
  /** Callback when card is clicked */
  onSelect?: (commander: CommanderData) => void
  /** Whether this card is currently selected */
  selected?: boolean
  /** Compact mode for search results */
  compact?: boolean
}

// ---------------------------------------------------------------------------
// Colour Bar (matches DeckTile)
// ---------------------------------------------------------------------------

const COLOUR_BAR_MAP: Record<string, { hex: string; label: string }> = {
  W: { hex: 'var(--mana-white)', label: 'White' },
  U: { hex: 'var(--mana-blue)', label: 'Blue' },
  B: { hex: 'var(--mana-black)', label: 'Black' },
  R: { hex: 'var(--mana-red)', label: 'Red' },
  G: { hex: 'var(--mana-green)', label: 'Green' },
}

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G']

// ---------------------------------------------------------------------------
// CommanderCard
// ---------------------------------------------------------------------------

/**
 * Card tile displaying a commander for selection.
 * Matches DeckTile styling: art at top (60%), dark footer with text + color bar.
 */
export function CommanderCard({
  commander,
  onSelect,
  selected = false,
  compact = false,
}: CommanderCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  // Build image URL from scryfall_id
  const imageUrl = commander.scryfall_id
    ? `https://cards.scryfall.io/art_crop/front/${commander.scryfall_id.charAt(0)}/${commander.scryfall_id.charAt(1)}/${commander.scryfall_id}.jpg`
    : null
  
  // Hover preview - uses large image
  const { triggerProps } = useCardHoverPreview({
    scryfallId: commander.scryfall_id,
    cardName: commander.display_name,
  })
  
  const handleClick = useCallback(() => {
    onSelect?.(commander)
  }, [onSelect, commander])
  
  // Parse color identity string into sorted array
  const colors = commander.color_identity 
    ? COLOUR_ORDER.filter(c => commander.color_identity.includes(c))
    : []
  const colourLabel = colors.map(c => COLOUR_BAR_MAP[c]?.label).filter(Boolean).join(', ')
  
  // Format color identity label for display
  const colorLabel = commander.color_identity || 'C'

  if (compact) {
    // Compact mode: horizontal row for partner selection overlay
    return (
      <button
        onClick={handleClick}
        {...triggerProps}
        className={cn(
          'w-full flex items-center gap-3 p-2 rounded-lg text-left',
          'bg-zinc-800/60 border transition-all',
          selected
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-zinc-700/50 hover:border-zinc-600',
          'hover:bg-zinc-700/60'
        )}
      >
        {/* Thumbnail */}
        <div className="w-10 h-14 rounded overflow-hidden bg-zinc-900 shrink-0">
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt=""
              className={cn(
                'w-full h-full object-cover transition-opacity',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
              <span className="text-[8px] text-zinc-600">?</span>
            </div>
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-zinc-200 truncate">
            {commander.display_name}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Colour bar inline */}
            {colors.length > 0 ? (
              <div className="flex h-1 w-12 gap-0.5 rounded-full overflow-hidden">
                {colors.map(c => {
                  const colour = COLOUR_BAR_MAP[c]
                  return (
                    <div
                      key={c}
                      className="h-full flex-1"
                      style={{ backgroundColor: colour?.hex }}
                    />
                  )
                })}
              </div>
            ) : (
              <div 
                className="h-1 w-12 rounded-full"
                style={{ 
                  background: 'linear-gradient(90deg, #6B6B6B 0%, #9A9A9A 50%, #6B6B6B 100%)'
                }}
              />
            )}
            {/* Rankings */}
            {commander.global_rank && (
              <span className="text-xs text-zinc-500">#{commander.global_rank}</span>
            )}
            {commander.edhrec_rank && (
              <span className="text-xs text-zinc-500">
                #{commander.edhrec_rank} {colorLabel}
              </span>
            )}
            {!commander.owned && (
              <span className="text-[10px] text-zinc-500 font-medium">
                Unowned
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  // Full card mode: matches DeckTile styling
  return (
    <button
      onClick={handleClick}
      {...triggerProps}
      className={cn(
        'group relative block w-full aspect-[236/260] min-w-[200px] overflow-hidden rounded-2xl',
        '[box-shadow:0px_1px_3px_rgba(0,0,0,0.4),0px_4px_8px_3px_rgba(0,0,0,0.2)]',
        'transition-all duration-200 ease-out text-left',
        'hover:-translate-y-1 hover:[box-shadow:0px_4px_8px_3px_rgba(0,0,0,0.4),0px_1px_3px_rgba(0,0,0,0.5)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected && 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-950'
      )}
      style={{
        backgroundColor: '#1A1A1A',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Commander art — 60% of card height */}
      <div className="relative h-[60%] overflow-hidden">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt=""
            className={cn(
              'h-full w-full object-cover brightness-[0.7] transition-all duration-200 ease-out',
              'group-hover:brightness-100 group-hover:scale-[1.03]',
              'motion-reduce:transition-none motion-reduce:group-hover:scale-100',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-zinc-800">
            <span className="text-xs text-zinc-600">No image</span>
          </div>
        )}
        
        {/* Ownership badge - subtle gray pill for unowned */}
        {!commander.owned && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-zinc-700/90 text-[10px] font-medium text-zinc-300">
            Unowned
          </div>
        )}
        
        {/* Hover overlay */}
        <div className={cn(
          'absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'flex items-end justify-center pb-3'
        )}>
          <span className="text-xs font-medium text-emerald-400">
            Select Commander
          </span>
        </div>
      </div>

      {/* Dark footer section — 40% of card height */}
      <div className="flex h-[40%] flex-col justify-between bg-[#1A1A1A] px-3 pt-3 pb-2">
        {/* Text content */}
        <div>
          {/* Commander name */}
          <h3 className="truncate text-[14px] font-semibold text-white leading-[18px]">
            {commander.display_name}
          </h3>
          
          {/* Rankings — global and color-specific */}
          <div className="mt-1 flex items-center gap-2 text-[12px] text-[#808080] leading-[15px]">
            {commander.global_rank && (
              <span>#{commander.global_rank}</span>
            )}
            {commander.edhrec_rank && commander.global_rank && (
              <span className="text-zinc-600">•</span>
            )}
            {commander.edhrec_rank && (
              <span>
                #{commander.edhrec_rank} {commander.color_identity ? commander.color_identity : 'C'}
              </span>
            )}
          </div>
        </div>

        {/* Colour identity bar — at bottom */}
        {colors.length > 0 ? (
          <div
            className="flex h-1 gap-0.5 rounded-full overflow-hidden"
            role="img"
            aria-label={colourLabel}
          >
            {colors.map(c => {
              const colour = COLOUR_BAR_MAP[c]
              if (!colour) return null
              return (
                <div
                  key={c}
                  className="h-full flex-1"
                  style={{ backgroundColor: colour.hex }}
                  aria-hidden="true"
                />
              )
            })}
          </div>
        ) : (
          /* Colorless — silver/gray gradient bar */
          <div
            className="h-1 rounded-full"
            style={{ 
              background: 'linear-gradient(90deg, #6B6B6B 0%, #9A9A9A 50%, #6B6B6B 100%)'
            }}
            role="img"
            aria-label="Colorless"
          />
        )}
      </div>
    </button>
  )
}
