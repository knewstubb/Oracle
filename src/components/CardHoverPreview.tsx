'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'

/**
 * CardHoverPreview — Shared card image hover preview.
 *
 * Renders a larger card image via portal with smart viewport-aware positioning.
 * Supports two modes:
 *   - Anchor mode: positions relative to a fixed anchor point (default)
 *   - Cursor-following mode: X tracks the cursor, Y stays aligned to the row
 *
 * All hover behavior (delay, cursor tracking) is encapsulated in the
 * `useCardHoverPreview` hook — consumers just spread the trigger props
 * onto their element and render `<CardHoverPreview {...previewProps} />`.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMG_WIDTH = 220
const IMG_HEIGHT = 308
const VIEWPORT_PAD = 8
const DELAY_MS = 200

// ---------------------------------------------------------------------------
// Hook — useCardHoverPreview
// ---------------------------------------------------------------------------

export interface UseCardHoverPreviewOptions {
  /** Scryfall ID for image URL. If null/undefined, preview is disabled. */
  scryfallId?: string | null
  /** Card name for alt text and fallback URL */
  cardName: string
  /** Delay before showing (ms). Default: 200 */
  delay?: number
}

export interface CardHoverPreviewTriggerProps {
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export interface CardHoverPreviewRenderProps {
  visible: boolean
  scryfallId: string | null
  cardName: string
  cursorX: number
  anchorY: number
}

/**
 * Hook that manages hover state, delay, and cursor position for card preview.
 *
 * Usage:
 * ```tsx
 * const { triggerProps, previewProps } = useCardHoverPreview({
 *   scryfallId: card.scryfall_id,
 *   cardName: card.card_name,
 * })
 *
 * return (
 *   <div {...triggerProps}>
 *     {card.card_name}
 *     <CardHoverPreview {...previewProps} />
 *   </div>
 * )
 * ```
 */
export function useCardHoverPreview({
  scryfallId,
  cardName,
  delay = DELAY_MS,
}: UseCardHoverPreviewOptions): {
  triggerProps: CardHoverPreviewTriggerProps
  previewProps: CardHoverPreviewRenderProps
} {
  const [visible, setVisible] = useState(false)
  const [cursorX, setCursorX] = useState(0)
  const [anchorY, setAnchorY] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setCursorX(e.clientX)
    setAnchorY(rect.top)
    timeoutRef.current = setTimeout(() => setVisible(true), delay)
  }, [delay])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setCursorX(e.clientX)
    setAnchorY(rect.top)
  }, [])

  const onMouseLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setVisible(false)
  }, [])

  return {
    triggerProps: { onMouseEnter, onMouseMove, onMouseLeave },
    previewProps: {
      visible,
      scryfallId: scryfallId ?? null,
      cardName,
      cursorX,
      anchorY,
    },
  }
}

// ---------------------------------------------------------------------------
// Component — CardHoverPreview
// ---------------------------------------------------------------------------

export interface CardHoverPreviewProps {
  visible: boolean
  scryfallId: string | null
  cardName: string
  /** Cursor X position (preview centers horizontally around this) */
  cursorX: number
  /** Anchor Y position (row top — preview goes above or below) */
  anchorY: number
}

export function CardHoverPreview({ visible, scryfallId, cardName, cursorX, anchorY }: CardHoverPreviewProps) {
  if (!visible || !scryfallId || typeof document === 'undefined') return null

  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  const url = `https://cards.scryfall.io/normal/front/${a}/${b}/${scryfallId}.jpg`

  return createPortal(
    <CardPreviewPositioned url={url} cardName={cardName} cursorX={cursorX} anchorY={anchorY} />,
    document.body
  )
}

/**
 * Internal positioned preview — separated to allow useMemo on style calculation.
 */
function CardPreviewPositioned({ url, cardName, cursorX, anchorY }: {
  url: string
  cardName: string
  cursorX: number
  anchorY: number
}) {
  const style = useMemo((): React.CSSProperties => {
    if (typeof window === 'undefined') return {}

    const viewW = window.innerWidth
    const viewH = window.innerHeight

    // Horizontal: center on cursor, clamp to viewport
    let left = cursorX - IMG_WIDTH / 2
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
    if (left + IMG_WIDTH > viewW - VIEWPORT_PAD) left = viewW - IMG_WIDTH - VIEWPORT_PAD

    // Vertical: prefer above the row
    let top = anchorY - IMG_HEIGHT - 16
    if (top < VIEWPORT_PAD) {
      // Not enough space above — show below the row (assuming ~32px row height)
      top = anchorY + 40
    }
    if (top + IMG_HEIGHT > viewH - VIEWPORT_PAD) {
      top = viewH - IMG_HEIGHT - VIEWPORT_PAD
    }

    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${IMG_WIDTH}px`,
      zIndex: 9999,
      pointerEvents: 'none' as const,
    }
  }, [cursorX, anchorY])

  return (
    <div style={style}>
      <img
        src={url}
        alt={cardName}
        className="w-full rounded-xl shadow-2xl shadow-black/60"
        style={{ aspectRatio: '5/7' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    </div>
  )
}
