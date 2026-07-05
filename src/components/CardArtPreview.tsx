'use client'

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'

interface CardArtPreviewProps {
  /** Scryfall printing ID used to construct the image URL */
  scryfallId: string
  /** Card name for alt text */
  cardName: string
  /** The trigger element (typically the card name in a list row) */
  children: ReactNode
}

/** Offset from cursor/element to avoid overlapping the trigger */
const OFFSET_X = 16
const OFFSET_Y = 8
/** Preview image dimensions */
const PREVIEW_WIDTH = 244
const PREVIEW_HEIGHT = 340

function getScryfallNormalUrl(scryfallId: string): string {
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  return `https://cards.scryfall.io/normal/front/${a}/${b}/${scryfallId}.jpg`
}

/**
 * CardArtPreview — a portal-based tooltip that shows a static card art image
 * when the user hovers or keyboard-focuses the wrapped trigger element.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 *
 * - Shows on mouseenter (list view only — grid view should not render this component)
 * - Shows on keyboard focus
 * - Dismisses on mouseleave / blur
 * - Contains ONLY a static image (no interactive content)
 * - Uses React Portal for positioning outside the DOM hierarchy
 * - aria-hidden on preview (decorative)
 */
export function CardArtPreview({ scryfallId, cardName, children }: CardArtPreviewProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setPortalRoot(document.body)
  }, [])

  const computePosition = useCallback((clientX: number, clientY: number) => {
    // Position to the right of cursor, clamped to viewport
    let left = clientX + OFFSET_X
    let top = clientY + OFFSET_Y

    // Clamp to prevent overflow off the right edge
    if (left + PREVIEW_WIDTH > window.innerWidth - 8) {
      left = clientX - PREVIEW_WIDTH - OFFSET_X
    }
    // Clamp to prevent overflow off the bottom edge
    if (top + PREVIEW_HEIGHT > window.innerHeight - 8) {
      top = window.innerHeight - PREVIEW_HEIGHT - 8
    }
    // Clamp top to avoid going above viewport
    if (top < 8) {
      top = 8
    }

    setPosition({ top, left })
  }, [])

  const computePositionFromElement = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Position to the right of the element
    let left = rect.right + OFFSET_X
    let top = rect.top

    // Clamp to prevent overflow off the right edge
    if (left + PREVIEW_WIDTH > window.innerWidth - 8) {
      left = rect.left - PREVIEW_WIDTH - OFFSET_X
    }
    // Clamp to prevent overflow off the bottom edge
    if (top + PREVIEW_HEIGHT > window.innerHeight - 8) {
      top = window.innerHeight - PREVIEW_HEIGHT - 8
    }
    // Clamp top
    if (top < 8) {
      top = 8
    }

    setPosition({ top, left })
  }, [])

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      computePosition(e.clientX, e.clientY)
      setVisible(true)
    },
    [computePosition]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (visible) {
        computePosition(e.clientX, e.clientY)
      }
    },
    [visible, computePosition]
  )

  const handleMouseLeave = useCallback(() => {
    setVisible(false)
  }, [])

  const handleFocus = useCallback(() => {
    computePositionFromElement()
    setVisible(true)
  }, [computePositionFromElement])

  const handleBlur = useCallback(() => {
    setVisible(false)
  }, [])

  // Don't render preview if no scryfallId
  if (!scryfallId) {
    return <>{children}</>
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        tabIndex={0}
        className="inline-block outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm"
      >
        {children}
      </span>

      {visible &&
        portalRoot &&
        createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-[9999] rounded-xl shadow-2xl shadow-black/40 ring-1 ring-white/10"
            style={{
              top: position.top,
              left: position.left,
              width: PREVIEW_WIDTH,
              height: PREVIEW_HEIGHT,
            }}
          >
            <Image
              src={getScryfallNormalUrl(scryfallId)}
              alt={cardName}
              width={PREVIEW_WIDTH}
              height={PREVIEW_HEIGHT}
              className="rounded-xl object-cover"
              unoptimized
              priority
            />
          </div>,
          portalRoot
        )}
    </>
  )
}
