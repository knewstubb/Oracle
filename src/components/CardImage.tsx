'use client'

import Image from 'next/image'
import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface CardImageProps {
  scryfallId: string
  alt: string
  width?: number
  height?: number
  className?: string
  priority?: boolean
  /** Disable the hover preview popover */
  noPreview?: boolean
  /** Use art_crop instead of normal card image */
  artCrop?: boolean
}

function getScryfallNormalUrl(scryfallId: string): string {
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  return `https://cards.scryfall.io/normal/front/${a}/${b}/${scryfallId}.jpg`
}

function getScryfallArtCropUrl(scryfallId: string): string {
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  return `https://cards.scryfall.io/art_crop/front/${a}/${b}/${scryfallId}.jpg`
}

function getScryfallLargeUrl(scryfallId: string): string {
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  return `https://cards.scryfall.io/large/front/${a}/${b}/${scryfallId}.jpg`
}

export function CardImage({
  scryfallId,
  alt,
  width = 200,
  height = 280,
  className,
  priority = false,
  noPreview = false,
  artCrop = false,
}: CardImageProps) {
  const [error, setError] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (error || !scryfallId) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground text-xs',
          className
        )}
        style={{ width, height }}
        role="img"
        aria-label={alt}
      >
        No image
      </div>
    )
  }

  const handleMouseEnter = () => {
    if (noPreview) return
    timeoutRef.current = setTimeout(() => setShowPreview(true), 200)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShowPreview(false)
  }

  return (
    <span
      className={cn('relative inline-block', className?.includes('h-full') && 'block h-full w-full')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Image
        src={artCrop ? getScryfallArtCropUrl(scryfallId) : getScryfallNormalUrl(scryfallId)}
        alt={alt}
        width={width}
        height={height}
        className={cn('object-cover', className)}
        loading={priority ? undefined : 'lazy'}
        priority={priority}
        placeholder="blur"
        blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI4MCIgZmlsbD0iIzk5OSIvPjwvc3ZnPg=="
        onError={() => setError(true)}
        unoptimized
      />
      {showPreview && (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 -translate-x-1/2 rounded-2xl shadow-2xl shadow-black/25 ring-1 ring-border"
          aria-hidden="true"
        >
          <Image
            src={getScryfallLargeUrl(scryfallId)}
            alt=""
            width={488}
            height={680}
            className="rounded-2xl"
            unoptimized
          />
        </span>
      )}
    </span>
  )
}
