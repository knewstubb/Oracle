'use client'

import { createPortal } from 'react-dom'

/**
 * Shared card hover preview component.
 * Renders a larger card image via portal with smart positioning —
 * flips horizontally/vertically to stay within the viewport.
 */

const IMG_WIDTH = 220
const IMG_HEIGHT = 308

interface CardHoverPreviewProps {
  scryfallId: string
  cardName: string
  /** Anchor position — where the trigger element is on screen */
  anchorX: number
  anchorY: number
  visible: boolean
}

export function CardHoverPreview({ scryfallId, cardName, anchorX, anchorY, visible }: CardHoverPreviewProps) {
  if (!visible || !scryfallId || typeof document === 'undefined') return null

  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  const url = `https://cards.scryfall.io/normal/front/${a}/${b}/${scryfallId}.jpg`

  const vw = window.innerWidth
  const vh = window.innerHeight

  // Horizontal: prefer left of anchor, flip right if it won't fit
  const fitsLeft = anchorX - IMG_WIDTH - 12 > 0
  const left = fitsLeft ? anchorX - IMG_WIDTH - 12 : anchorX + 12

  // Vertical: prefer top-aligned with anchor, shift up if it would overflow bottom
  let top = anchorY
  if (top + IMG_HEIGHT > vh - 16) {
    top = vh - IMG_HEIGHT - 16
  }
  if (top < 16) {
    top = 16
  }

  return createPortal(
    <div
      className="pointer-events-none"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 9999,
      }}
    >
      <img
        src={url}
        alt={cardName}
        width={IMG_WIDTH}
        height={IMG_HEIGHT}
        className="rounded-lg shadow-2xl shadow-black/60 block"
      />
    </div>,
    document.body
  )
}
