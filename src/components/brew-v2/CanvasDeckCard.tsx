'use client'

import { useState } from 'react'
import type { DeckCard } from '@/lib/brew-v2-types'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { categoryPrimaryColour, categorySecondaryColour, categoryInitial } from '@/lib/categoryColour'
import { GenericLandBadge } from '@/components/generic-land-badge'
import { CategoryTagEditor } from '@/components/CategoryTagEditor'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CanvasDeckCardProps {
  card: DeckCard
  position: { x: number; y: number }
  viewDensity: 'card' | 'name'
  zoomLevel?: number
  pointerProps: { onPointerDown: (e: React.PointerEvent) => void }
  isDragging: boolean
  isSelected?: boolean
  cardZIndex?: number
  dragOffset: { x: number; y: number } | null
  onDiscuss: (cardName: string) => void
  /** Resolved art URL for generic land slots (from useGenericLandPreferences) */
  genericLandArtUrl?: string | null
  /** Available category options for the tag editor */
  availableCategories?: string[]
  /** Callback when categories are changed via the editor */
  onCategoryChange?: (cardName: string, updated: StructuredCategories) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_VIEW_WIDTH = 180
const CARD_VIEW_HEIGHT = 252 // 180 × (3.5/2.5) — MTG card aspect ratio
const NAME_VIEW_WIDTH = 168

/** Ownership status → dot colour */
const OWNERSHIP_DOT_COLOURS: Record<DeckCard['ownership_status'], string> = {
  original: '#2dd4bf',
  proxy: '#f97316',
  not_owned: '#6b7280',
  generic: '#818cf8',
}

// ---------------------------------------------------------------------------
// CanvasDeckCard — Phase 2 deck card rendered on the spatial canvas
// ---------------------------------------------------------------------------

/**
 * Renders a deck card on the brew canvas in either Card_View (180px, full-frame)
 * or Name_View (168px, compact row). Positioned via CSS translate3d from
 * canvasPositions (free-form) or computed position (piled).
 *
 * - In Card_View: category tag above art, name overlay on dark scrim
 * - In Name_View: ownership dot + name + right-aligned CMC + category text
 * - Drag via useCanvasDrag; in free-form mode, drag repositions without changing category
 * - "Discuss" action fires on double-click
 *
 * Requirements: 7.1, 7.2, 7.3, 10.2, 10.3, 13.1
 */
export function CanvasDeckCard({
  card,
  position,
  viewDensity,
  zoomLevel,
  pointerProps,
  isDragging,
  isSelected,
  cardZIndex,
  dragOffset,
  onDiscuss,
  genericLandArtUrl,
  availableCategories,
  onCategoryChange,
}: CanvasDeckCardProps) {
  const [isEditingCategories, setIsEditingCategories] = useState(false)

  const finalX = position.x + (dragOffset?.x ?? 0)
  const finalY = position.y + (dragOffset?.y ?? 0)

  const width = viewDensity === 'card' ? CARD_VIEW_WIDTH : NAME_VIEW_WIDTH

  return (
    <>
      <div
        className={`absolute touch-none select-none group ${isSelected ? 'ring-2 ring-[#378ADD] ring-offset-1 ring-offset-transparent rounded-lg' : ''}`}
        style={{
          width,
          transform: `translate3d(${finalX}px, ${finalY}px, 0)`,
          opacity: 1,
          zIndex: isDragging ? 9999 : (cardZIndex ?? 1),
          cursor: dragOffset ? 'grabbing' : 'grab',
        }}
        data-testid={`deck-card-${card.card_name}`}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onDiscuss(card.card_name)
        }}
        {...pointerProps}
      >
        {viewDensity === 'card' ? (
          <CardView card={card} hasDragOffset={!!dragOffset} genericLandArtUrl={genericLandArtUrl} zoomLevel={zoomLevel} />
        ) : (
          <NameView card={card} hasDragOffset={!!dragOffset} genericLandArtUrl={genericLandArtUrl} />
        )}

        {/* Discuss button — visible on hover */}
        <button
          type="button"
          className="absolute top-0.5 right-0.5 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-[rgba(0,0,0,0.7)] text-white text-[9px] leading-none hover:bg-[rgba(55,138,221,0.8)] transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onDiscuss(card.card_name)
          }}
          aria-label={`Discuss ${card.card_name}`}
          title="Discuss with Oracle"
        >
          💬
        </button>

        {/* Edit Categories button — visible on hover when editing is available */}
        {availableCategories && onCategoryChange && (
          <button
            type="button"
            className="absolute top-0.5 right-7 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-[rgba(0,0,0,0.7)] text-white text-[9px] leading-none hover:bg-[rgba(55,138,221,0.8)] transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setIsEditingCategories(true)
            }}
            aria-label={`Edit categories for ${card.card_name}`}
            title="Edit Categories"
            data-testid={`edit-categories-${card.card_name}`}
          >
            ✏️
          </button>
        )}
      </div>

      {/* Category editing dialog */}
      {availableCategories && onCategoryChange && (
        <Dialog open={isEditingCategories} onOpenChange={setIsEditingCategories}>
          <DialogContent className="sm:max-w-[320px]" data-testid={`category-dialog-${card.card_name}`}>
            <DialogHeader>
              <DialogTitle className="text-sm">Edit Categories</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {card.card_name}
              </DialogDescription>
            </DialogHeader>
            <CategoryTagEditor
              primaryCategory={card.primary_category}
              additionalCategories={card.additional_categories}
              availableCategories={availableCategories}
              onChange={(updated) => {
                onCategoryChange(card.card_name, updated)
                setIsEditingCategories(false)
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Card_View — 180×252 full-frame with category ring
// ---------------------------------------------------------------------------

function CardView({ card, hasDragOffset, genericLandArtUrl, zoomLevel }: { card: DeckCard; hasDragOffset: boolean; genericLandArtUrl?: string | null; zoomLevel?: number }) {
  const [imgError, setImgError] = useState(false)

  // Border + bar colour based on ownership status (matching mockups exactly)
  const ownershipStyles: Record<string, { border: string; barBg: string }> = {
    original: { border: '#4a4a4a', barBg: '#4a4a4a' },         // dark grey
    proxy: { border: '#f97316', barBg: '#f97316' },             // orange
    generic: { border: '#4a4a4a', barBg: '#4a4a4a' },           // dark grey (same as owned)
    not_owned: { border: '#ec4899', barBg: '#ec4899' },         // magenta/pink
    unknown: { border: '#eab308', barBg: '#eab308' },           // yellow (over-allocated)
  }
  const style = ownershipStyles[card.ownership_status] ?? ownershipStyles.unknown

  const imageUrl = card.is_generic_land && genericLandArtUrl
    ? genericLandArtUrl
    : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.card_name)}&format=image&version=normal`

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{
        width: CARD_VIEW_WIDTH,
        border: `3px solid ${style.border}`,
        boxShadow: hasDragOffset ? '0 12px 32px rgba(0,0,0,0.45)' : '0 4px 12px rgba(0,0,0,0.3)',
        backgroundColor: '#1a1a2a',
      }}
    >
      {/* Full-frame card image */}
      {!imgError ? (
        <img
          src={imageUrl}
          alt={card.card_name}
          className="w-full object-cover"
          style={{ aspectRatio: '488/680' }}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full flex items-center justify-center bg-[#1a1a1a]" style={{ aspectRatio: '488/680' }}>
          <span className="text-[8px] text-[rgba(255,255,255,0.5)] text-center px-1 leading-tight">
            {card.card_name}
          </span>
        </div>
      )}

      {/* Bottom bar — category label with ownership-coloured background */}
      <div
        className="flex items-center justify-center py-1.5"
        style={{ backgroundColor: style.barBg }}
      >
        <span
          className="text-[9px] font-bold uppercase tracking-wider text-white"
          style={{
            transform: zoomLevel && zoomLevel < 1 ? `scale(${1 / zoomLevel})` : undefined,
            transformOrigin: 'center',
          }}
        >
          {card.primary_category.toUpperCase()}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Name_View — 168px wide: ownership dot + name + CMC + category
// ---------------------------------------------------------------------------

function NameView({ card, hasDragOffset, genericLandArtUrl }: { card: DeckCard; hasDragOffset: boolean; genericLandArtUrl?: string | null }) {
  const dotColour = OWNERSHIP_DOT_COLOURS[card.ownership_status]

  // Border colour based on ownership
  const ownershipBorderColours: Record<string, string> = {
    original: 'rgba(74, 74, 74, 0.6)',
    proxy: 'rgba(249, 115, 22, 0.6)',
    not_owned: 'rgba(236, 72, 153, 0.6)',
    generic: 'rgba(74, 74, 74, 0.6)',
  }
  const borderColour = ownershipBorderColours[card.ownership_status] ?? 'rgba(255, 255, 255, 0.08)'

  return (
    <div
      className="rounded px-2 py-1.5"
      style={{
        background: 'rgba(30, 30, 40, 0.9)',
        border: `1px solid ${borderColour}`,
        boxShadow: hasDragOffset
          ? '0 4px 12px rgba(0,0,0,0.35)'
          : '0 1px 4px rgba(0,0,0,0.25)',
      }}
    >
      {/* Row 1: ownership dot + name + generic badge + CMC */}
      <div className="flex items-center gap-1.5">
        {/* Ownership dot */}
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: dotColour }}
          aria-label={`Ownership: ${card.ownership_status}`}
        />

        {/* Card name — truncated */}
        <span className="text-[10px] font-medium text-[rgba(255,255,255,0.9)] truncate flex-1 leading-tight">
          {card.card_name}
        </span>

        {/* Generic land badge */}
        {card.is_generic_land && (
          <GenericLandBadge
            landType={card.card_name}
            artUrl={genericLandArtUrl}
            className="text-[8px] px-1 py-0 shrink-0"
          />
        )}

        {/* CMC — right-aligned */}
        <span className="text-[9px] text-[rgba(255,255,255,0.5)] shrink-0 tabular-nums">
          {card.cmc}
        </span>
      </div>

      {/* Row 2: category text */}
      <div className="mt-0.5 pl-3.5">
        <span className="text-[8px] uppercase tracking-wide text-[rgba(255,255,255,0.4)]">
          {card.primary_category}
        </span>
      </div>
    </div>
  )
}
