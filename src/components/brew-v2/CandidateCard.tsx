'use client'

import { ColourPips } from '@/components/ColourPips'
import type { CommanderOption } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CandidateCardProps {
  commander: CommanderOption
  position: { x: number; y: number }
  onCommit: (commander: CommanderOption) => void
  pointerProps: { onPointerDown: (e: React.PointerEvent) => void }
  isDragging: boolean
  dragOffset: { x: number; y: number } | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_WIDTH = 168

/** MTG colour → gradient tone mapping for art placeholder */
const COLOUR_GRADIENT_MAP: Record<string, string> = {
  W: '#FFF8DC',
  U: '#0E68AB',
  B: '#150B00',
  R: '#D32029',
  G: '#00733E',
}

// ---------------------------------------------------------------------------
// CandidateCard — Phase 1 commander option rendered on the canvas
// ---------------------------------------------------------------------------

/**
 * CandidateCard is a spatial card object on the brew canvas representing a
 * commander option Oracle has surfaced. It replaces the old inline
 * CommanderOptionsCard rows with a true draggable canvas card.
 *
 * Anatomy (168px wide):
 * - Card art (90px height) with gradient placeholder
 * - Name overlay at bottom of art with dark scrim
 * - Colour identity pips (12px)
 * - 1-2 line description
 * - Ownership status indicator
 * - Full-width Commit button
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1
 */
export function CandidateCard({
  commander,
  position,
  onCommit,
  pointerProps,
  isDragging,
  dragOffset,
}: CandidateCardProps) {
  // Compute final position: base position + drag offset when actively dragged
  const finalX = position.x + (dragOffset ? dragOffset.x : 0)
  const finalY = position.y + (dragOffset ? dragOffset.y : 0)

  return (
    <div
      className="absolute select-none"
      style={{
        width: CARD_WIDTH,
        transform: `translate3d(${finalX}px, ${finalY}px, 0)`,
        opacity: isDragging && !dragOffset ? 0.4 : 1,
        zIndex: dragOffset ? 50 : 1,
        cursor: dragOffset ? 'grabbing' : 'grab',
      }}
      data-testid={`candidate-card-${commander.scryfallId}`}
      {...pointerProps}
    >
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: 'rgba(30, 30, 40, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: dragOffset
            ? '0 8px 24px rgba(0,0,0,0.4)'
            : '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Card Art — 90px height */}
        <CardArt commander={commander} />

        {/* Card body */}
        <div className="p-2 space-y-1.5">
          {/* Colour pips */}
          <ColourPips colours={commander.colourIdentity} size={12} />

          {/* Description — 1-2 lines */}
          <p
            className="text-xs leading-tight text-gray-300 line-clamp-2"
            title={commander.description}
          >
            {commander.description}
          </p>

          {/* Ownership status */}
          <OwnershipStatus owned={commander.owned} />

          {/* Commit button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCommit(commander)
            }}
            className="w-full flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110"
            style={{
              background: '#378ADD',
            }}
            aria-label={`Commit to ${commander.name}`}
          >
            <span aria-hidden="true">✓</span>
            <span>Commit</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Card art with gradient placeholder and name overlay scrim */
function CardArt({ commander }: { commander: CommanderOption }) {
  // Build a gradient from the commander's colour identity
  const gradientColours = commander.colourIdentity
    .map((c) => COLOUR_GRADIENT_MAP[c])
    .filter(Boolean)

  const gradient =
    gradientColours.length >= 2
      ? `linear-gradient(135deg, ${gradientColours.join(', ')})`
      : gradientColours.length === 1
        ? `linear-gradient(135deg, ${gradientColours[0]}, rgba(20,20,30,0.8))`
        : 'linear-gradient(135deg, #2a2a3a, #1a1a2a)'

  return (
    <div className="relative" style={{ height: 90 }}>
      {/* Gradient placeholder — shown until art loads */}
      <div
        className="absolute inset-0"
        style={{ background: gradient }}
        aria-hidden="true"
      />

      {/* Actual art image */}
      {commander.artUrl && (
        <img
          src={commander.artUrl}
          alt={`${commander.name} card art`}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      )}

      {/* Name overlay with dark gradient scrim at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 pt-4"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
        }}
      >
        <span className="text-xs font-semibold text-white leading-tight block truncate">
          {commander.name}
        </span>
      </div>
    </div>
  )
}

/** Ownership status indicator */
function OwnershipStatus({ owned }: { owned: boolean }) {
  if (owned) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: '#2dd4bf' }}
          aria-hidden="true"
        />
        <span className="text-xs" style={{ color: '#2dd4bf' }}>
          You own this
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full border"
        style={{ borderColor: 'rgba(255,255,255,0.3)' }}
        aria-hidden="true"
      />
      <span className="text-xs text-muted-foreground">Not in collection</span>
    </div>
  )
}
