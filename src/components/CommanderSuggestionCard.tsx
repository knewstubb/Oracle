'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCardInfo } from '@/components/CardHoverPreview'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommanderSuggestionCardProps {
  commanderName: string
  /** Brief pitch from Oracle about why this commander fits */
  pitch?: string
  /** Callback when user clicks to start a deck with this commander */
  onStartDeck?: (commanderName: string) => void
  /** Whether this card is in a compact inline mode */
  compact?: boolean
}

// ---------------------------------------------------------------------------
// CommanderSuggestionCard
// ---------------------------------------------------------------------------

/**
 * Visual card showing a commander suggestion during exploration.
 * Shows the commander's image, name, pitch, and a "Start Deck" action.
 */
export function CommanderSuggestionCard({
  commanderName,
  pitch,
  onStartDeck,
  compact = false,
}: CommanderSuggestionCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isHovered, setIsHovered] = useState(false)

  // Fetch card image on mount
  useEffect(() => {
    let cancelled = false
    
    getCardInfo(commanderName).then(info => {
      if (!cancelled && info.imageUrl) {
        setImageUrl(info.imageUrl)
      }
      if (!cancelled) setIsLoading(false)
    })
    
    return () => { cancelled = true }
  }, [commanderName])

  const handleStartDeck = useCallback(() => {
    onStartDeck?.(commanderName)
  }, [onStartDeck, commanderName])

  if (compact) {
    // Inline compact mode: small thumbnail + name + action
    return (
      <button
        onClick={handleStartDeck}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'inline-flex items-center gap-2 px-2 py-1.5 rounded-lg',
          'bg-zinc-800/60 border border-zinc-700/50',
          'hover:bg-zinc-700/60 hover:border-emerald-500/40',
          'transition-all cursor-pointer text-left'
        )}
      >
        {/* Thumbnail */}
        <div className="w-8 h-11 rounded overflow-hidden bg-zinc-900 shrink-0">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-3 h-3 animate-spin text-zinc-600" />
            </div>
          ) : imageUrl ? (
            <img 
              src={imageUrl} 
              alt={commanderName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-zinc-800" />
          )}
        </div>
        
        {/* Name */}
        <span className={cn(
          'text-sm font-medium truncate max-w-[140px]',
          isHovered ? 'text-emerald-400' : 'text-zinc-200'
        )}>
          {commanderName}
        </span>
        
        {/* Start indicator */}
        <Plus className={cn(
          'w-4 h-4 shrink-0 transition-colors',
          isHovered ? 'text-emerald-400' : 'text-zinc-500'
        )} />
      </button>
    )
  }

  // Full card mode: larger image with overlay
  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'relative w-[140px] rounded-lg overflow-hidden',
        'bg-zinc-900 border border-zinc-700/50',
        'hover:border-emerald-500/50 transition-all',
        'group cursor-pointer'
      )}
      onClick={handleStartDeck}
    >
      {/* Card image */}
      <div className="aspect-[5/7] w-full relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
          </div>
        ) : imageUrl ? (
          <img 
            src={imageUrl} 
            alt={commanderName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
            <span className="text-xs text-zinc-600">No image</span>
          </div>
        )}
        
        {/* Hover overlay */}
        <div className={cn(
          'absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent',
          'flex items-end justify-center pb-3',
          'opacity-0 group-hover:opacity-100 transition-opacity'
        )}>
          <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
            <Plus className="w-3 h-3" />
            Start Deck
          </span>
        </div>
      </div>
      
      {/* Name and pitch */}
      <div className="p-2">
        <h4 className="text-xs font-medium text-zinc-200 truncate">
          {commanderName}
        </h4>
        {pitch && (
          <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">
            {pitch}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CommanderSuggestionRow — horizontal scrollable row of suggestions
// ---------------------------------------------------------------------------

interface CommanderSuggestionRowProps {
  suggestions: Array<{ name: string; pitch?: string }>
  onStartDeck?: (commanderName: string) => void
}

/**
 * Horizontal row of commander suggestion cards for exploration flow.
 */
export function CommanderSuggestionRow({ suggestions, onStartDeck }: CommanderSuggestionRowProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="my-3">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {suggestions.map((s, i) => (
          <CommanderSuggestionCard
            key={`${s.name}-${i}`}
            commanderName={s.name}
            pitch={s.pitch}
            onStartDeck={onStartDeck}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Parse commander suggestions from message content
// ---------------------------------------------------------------------------

/**
 * Pattern to detect commander suggestions in Oracle responses.
 * Format: <commander name="Name">Optional pitch</commander>
 * or simpler: {{commander:Name|pitch}}
 */
const COMMANDER_BLOCK_PATTERN = /\{\{commander:([^|}\n]+)(?:\|([^}]*))?\}\}/g

export interface ParsedCommanderSuggestion {
  name: string
  pitch?: string
  startIndex: number
  endIndex: number
}

/**
 * Extract commander suggestion blocks from message content.
 */
export function parseCommanderSuggestions(content: string): ParsedCommanderSuggestion[] {
  const suggestions: ParsedCommanderSuggestion[] = []
  let match
  
  while ((match = COMMANDER_BLOCK_PATTERN.exec(content)) !== null) {
    suggestions.push({
      name: match[1].trim(),
      pitch: match[2]?.trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    })
  }
  
  return suggestions
}

/**
 * Remove commander suggestion blocks from content, returning plain text.
 */
export function stripCommanderSuggestions(content: string): string {
  return content.replace(COMMANDER_BLOCK_PATTERN, '').trim()
}
