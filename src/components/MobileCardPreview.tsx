'use client'

import { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { CardImage } from '@/components/CardImage'

interface MobileCardPreviewProps {
  cardName: string
  scryfallId?: string | null
  isOpen: boolean
  onClose: () => void
}

/**
 * Full-screen modal for viewing card images on mobile.
 * Tapping the backdrop or X button closes it.
 */
export function MobileCardPreview({
  cardName,
  scryfallId,
  isOpen,
  onClose,
}: MobileCardPreviewProps) {
  // Close on escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    // Prevent body scroll while open
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Card preview: ${cardName}`}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        aria-label="Close preview"
      >
        <X className="size-6" />
      </button>

      {/* Card image */}
      <div
        className="relative max-h-[80vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <CardImage
          scryfallId={scryfallId ?? undefined}
          cardName={cardName}
          width={336}
          height={469}
          className="rounded-xl shadow-2xl"
          priority
        />
        {/* Card name below image */}
        <p className="mt-3 text-center text-lg font-medium text-white">
          {cardName}
        </p>
      </div>
    </div>
  )
}
