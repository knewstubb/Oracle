'use client'

import Link from 'next/link'
import { Check, BookOpen, ShoppingCart } from 'lucide-react'
import { CardImage } from '@/components/CardImage'

type ReadinessTier = 'green' | 'amber' | 'red'

interface DeckStatusCardProps {
  id: number
  name: string
  commanderName: string
  commanderScryfallId: string
  colourIdentity?: string[]
  tier: ReadinessTier
  message: string
  /** Link destination - defaults to deck page, can override for picklist */
  href?: string
}

const TIER_CONFIG: Record<ReadinessTier, {
  icon: typeof Check
  color: string
  borderColor: string
}> = {
  green: {
    icon: Check,
    color: '#34D399', // emerald-400
    borderColor: 'rgba(52, 211, 153, 0.5)',
  },
  amber: {
    icon: BookOpen,
    color: '#F59E0B', // amber-500
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  red: {
    icon: ShoppingCart,
    color: '#EF4444', // red-500
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
}

// Color identity pip colors
const PIP_COLORS: Record<string, string> = {
  W: '#F9FAF4',
  U: '#0E68AB',
  B: '#150B00',
  R: '#D3202A',
  G: '#00733E',
}

export function DeckStatusCard({
  id,
  name,
  commanderName,
  commanderScryfallId,
  colourIdentity,
  tier,
  message,
  href,
}: DeckStatusCardProps) {
  const config = TIER_CONFIG[tier]
  const Icon = config.icon
  const destination = href ?? `/decks/${id}`
  const isReady = tier === 'green'

  // Get first color for the pip (or default to gray for colorless)
  const primaryColor = colourIdentity?.[0]
  const pipColor = primaryColor ? PIP_COLORS[primaryColor] : '#71717A'

  return (
    <Link
      href={destination}
      className="flex items-center gap-3 rounded-xl bg-[var(--bg-surface)] px-3 py-2 transition-all hover:scale-[1.005]"
      style={{
        border: `1.5px solid ${config.borderColor}`,
      }}
    >
      {/* Commander art thumbnail - wider rectangle */}
      <div className="w-16 h-11 shrink-0 overflow-hidden rounded-md bg-muted">
        <CardImage
          scryfallId={commanderScryfallId}
          alt=""
          width={64}
          height={44}
          artCrop
          noPreview
          className="w-full h-full object-cover"
        />
      </div>

      {/* Deck info */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-[15px] font-semibold text-foreground leading-tight">
          {name}
        </p>
        <p className="truncate text-[12px] text-muted-foreground leading-tight mt-0.5">
          {commanderName}
        </p>
        {/* Action message for attention cards */}
        {!isReady && (
          <p className="mt-0.5 text-[12px] font-medium" style={{ color: config.color }}>
            {message}
          </p>
        )}
      </div>

      {/* Status icon */}
      <Icon
        className="size-6 shrink-0"
        style={{ color: config.color }}
        strokeWidth={isReady ? 2.5 : 1.5}
      />
    </Link>
  )
}
