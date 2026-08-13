'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ColourPips } from './ColourPips'
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
  edhrec_rank: number | null
  edhrec_deck_count: number | null
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
// CommanderCard
// ---------------------------------------------------------------------------

/**
 * Card tile displaying a commander for selection.
 * Shows commander art, name, color pips, and ownership status.
 * Magenta border indicates unowned commanders.
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
  
  // Parse color identity string into array
  const colors = commander.color_identity ? commander.color_identity.split('') : []
  
  // Format deck count for display
  const deckCountDisplay = commander.edhrec_deck_count
    ? commander.edhrec_deck_count >= 1000
      ? `${(commander.edhrec_deck_count / 1000).toFixed(1)}k decks`
      : `${commander.edhrec_deck_count} decks`
    : null

  if (compact) {
    // Compact mode: horizontal row for search results
    return (
      <button
        onClick={handleClick}
        {...triggerProps}
        className={cn(
          'w-full flex items-center gap-3 p-2 rounded-lg text-left',
          'bg-zinc-800/60 border transition-all',
          selected
            ? 'border-emerald-500 bg-emerald-500/10'
            : commander.owned
              ? 'border-zinc-700/50 hover:border-zinc-600'
              : 'border-fuchsia-500/50 hover:border-fuchsia-400',
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200 truncate">
              {commander.display_name}
            </span>
            <ColourPips colours={colors} size={10} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {deckCountDisplay && (
              <span className="text-xs text-zinc-500">{deckCountDisplay}</span>
            )}
            {!commander.owned && (
              <span className="text-[10px] text-fuchsia-400 font-medium">
                Unowned
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  // Full card mode: vertical tile with art
  return (
    <button
      onClick={handleClick}
      {...triggerProps}
      className={cn(
        'relative w-full rounded-xl overflow-hidden',
        'bg-zinc-900 transition-all group',
        'border-2',
        selected
          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
          : commander.owned
            ? 'border-zinc-700/50 hover:border-zinc-600'
            : 'border-fuchsia-500/60 hover:border-fuchsia-400',
        'hover:scale-[1.02] hover:shadow-lg'
      )}
    >
      {/* Art crop */}
      <div className="aspect-[4/3] w-full relative bg-zinc-800">
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
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs text-zinc-600">No image</span>
          </div>
        )}
        
        {/* Ownership badge - magenta for unowned */}
        {!commander.owned && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-fuchsia-500/90 text-[10px] font-semibold text-white">
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
      
      {/* Info section */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-zinc-200 leading-tight line-clamp-2">
            {commander.display_name}
          </h3>
          <ColourPips colours={colors} size={12} />
        </div>
        
        {deckCountDisplay && (
          <p className="text-xs text-zinc-500 mt-1">
            {deckCountDisplay}
          </p>
        )}
      </div>
    </button>
  )
}
