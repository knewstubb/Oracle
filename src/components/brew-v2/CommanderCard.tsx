'use client'

import { useState } from 'react'
import type { CommittedCommander } from '@/lib/brew-v2-types'
import { MaterialIcon } from '@/components/ui/material-icon'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CommanderCardProps {
  commander: CommittedCommander
  /** Whether this is a partner commander (affects nothing visually, both get crowns) */
  isPartner?: boolean
  /** Pointer props for drag handling */
  pointerProps: { onPointerDown: (e: React.PointerEvent) => void }
  /** Whether the card is currently being dragged */
  isDragging: boolean
  /** Drag offset when being dragged */
  dragOffset: { x: number; y: number } | null
  /** Callback when user wants to discuss the commander */
  onDiscuss?: (cardName: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_WIDTH = 180
const PARTNER_CARD_WIDTH = 140 // Slightly smaller for partners to fit both
const PARTNER_GAP = 8

// ---------------------------------------------------------------------------
// SingleCommanderCard — internal component for one commander with crown
// ---------------------------------------------------------------------------

function SingleCommanderCard({
  name,
  isDragging,
  dragOffset,
  onDiscuss,
  width = CARD_WIDTH,
  label = 'COMMANDER',
}: {
  name: string
  isDragging: boolean
  dragOffset: { x: number; y: number } | null
  onDiscuss?: (cardName: string) => void
  width?: number
  label?: string
}) {
  const [imgError, setImgError] = useState(false)
  const imageUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`

  return (
    <div
      className="flex flex-col items-center touch-none select-none group"
      style={{ width }}
    >
      {/* Crown icon */}
      <div 
        className="flex items-center justify-center mb-1"
        style={{ 
          color: '#d4af37', // Gold
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
        }}
      >
        <MaterialIcon 
          name="crown" 
          filled 
          className="text-[20px]"
        />
      </div>

      {/* Card frame */}
      <div
        className="rounded-lg overflow-hidden flex flex-col relative"
        style={{
          width,
          border: '3px solid #4a4a4a',
          backgroundColor: '#1a1a2a',
          boxShadow: isDragging || dragOffset
            ? '0 12px 32px rgba(0,0,0,0.5)'
            : '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        {/* Card image */}
        {!imgError ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div 
            className="w-full flex items-center justify-center bg-[#1a1a1a]" 
            style={{ aspectRatio: '488 / 680' }}
          >
            <span className="text-[10px] text-[rgba(255,255,255,0.5)] text-center px-2 leading-tight">
              {name}
            </span>
          </div>
        )}

        {/* Bottom bar — label */}
        <div
          className="flex items-center justify-center py-1"
          style={{ backgroundColor: '#3a3a3a' }}
        >
          <span className="text-[8px] font-medium uppercase tracking-wider text-white">
            {label}
          </span>
        </div>

        {/* Discuss button — visible on hover */}
        {onDiscuss && (
          <button
            type="button"
            className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-[rgba(0,0,0,0.7)] text-white text-[10px] leading-none hover:bg-[rgba(55,138,221,0.8)] transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onDiscuss(name)
            }}
            aria-label={`Discuss ${name}`}
            title="Discuss with Oracle"
          >
            💬
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CommanderCard — renders commander(s) with crown icon(s)
// ---------------------------------------------------------------------------

/**
 * Renders commander card(s) on the brew canvas.
 * 
 * Visual treatment:
 * - Single commander: one card with crown
 * - Partner commanders: two cards side-by-side, both with crowns
 * - Material Icons crown positioned above each card
 * - Standard card component styling (same as CanvasDeckCard)
 * - Dark border (owned style)
 * - Draggable, hover preview, discuss action
 */
export function CommanderCard({
  commander,
  pointerProps,
  isDragging,
  dragOffset,
  onDiscuss,
}: CommanderCardProps) {
  // Partner commander: render two cards side-by-side
  if (commander.partner) {
    return (
      <div
        className="flex gap-2 touch-none select-none"
        style={{ 
          cursor: dragOffset ? 'grabbing' : 'grab',
          gap: PARTNER_GAP,
        }}
        {...pointerProps}
      >
        <SingleCommanderCard
          name={commander.name}
          isDragging={isDragging}
          dragOffset={dragOffset}
          onDiscuss={onDiscuss}
          width={PARTNER_CARD_WIDTH}
          label="COMMANDER"
        />
        <SingleCommanderCard
          name={commander.partner.name}
          isDragging={isDragging}
          dragOffset={dragOffset}
          onDiscuss={onDiscuss}
          width={PARTNER_CARD_WIDTH}
          label="PARTNER"
        />
      </div>
    )
  }

  // Single commander
  return (
    <div
      style={{ cursor: dragOffset ? 'grabbing' : 'grab' }}
      {...pointerProps}
    >
      <SingleCommanderCard
        name={commander.name}
        isDragging={isDragging}
        dragOffset={dragOffset}
        onDiscuss={onDiscuss}
        width={CARD_WIDTH}
        label="COMMANDER"
      />
    </div>
  )
}
