'use client'

import Image from 'next/image'
import type { DeckCard } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardTooltipProps {
  card: DeckCard
  artUrl?: string
  visible: boolean
  anchorRect?: { top: number; left: number }
}

// ---------------------------------------------------------------------------
// Ownership Badge
// ---------------------------------------------------------------------------

function OwnershipBadge({ status }: { status: DeckCard['ownership_status'] }) {
  if (status === 'original') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-teal-400">
        <span className="inline-block h-[6px] w-[6px] rounded-full bg-teal-400" />
        Owned
      </span>
    )
  }
  if (status === 'proxy') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <span className="inline-block h-[6px] w-[6px] rounded-full bg-amber-400" />
        Proxy
      </span>
    )
  }
  if (status === 'generic') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-indigo-400">
        <span className="inline-block h-[6px] w-[6px] rounded-full bg-indigo-400" />
        Generic land
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className="inline-block h-[6px] w-[6px] rounded-full border border-[rgba(255,255,255,0.25)] bg-transparent" />
      Not owned
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CardTooltip({ card, artUrl, visible, anchorRect }: CardTooltipProps) {
  if (!visible) return null

  const style: React.CSSProperties = {
    position: 'absolute',
    // Position to the LEFT of the panel — tooltip's right edge aligns with panel's left edge
    right: '100%',
    marginRight: '8px',
    top: anchorRect?.top ?? 0,
  }

  return (
    <div
      className="pointer-events-none w-[220px] rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1a1a1a] p-3 shadow-xl"
      style={style}
    >
      {/* 1. Card art */}
      {artUrl && (
        <div className="mb-2 overflow-hidden rounded-md">
          <Image
            src={artUrl}
            alt={`${card.card_name} art`}
            width={194}
            height={143}
            className="w-full rounded-md object-cover"
          />
        </div>
      )}

      {/* 2. Card name */}
      <div className="text-sm font-medium text-[#d4d4d0]">
        {card.card_name}
      </div>

      {/* 3. Type line */}
      <div className="text-xs text-muted-foreground">
        {card.type_line}
      </div>

      {/* 4. Oracle text */}
      {card.oracle_text && (
        <div className="mt-1.5 whitespace-pre-wrap text-xs text-[#d4d4d0]">
          {card.oracle_text}
        </div>
      )}

      {/* 5. Ownership badge */}
      <div className="mt-2">
        <OwnershipBadge status={card.ownership_status} />
      </div>

      {/* 6. EDHREC % */}
      {card.edhrec_inclusion != null && (
        <div className="mt-1 text-xs text-muted-foreground">
          EDHREC: {card.edhrec_inclusion}%
        </div>
      )}

      {/* 7. Price */}
      {card.price_ck != null && (
        <div className="mt-0.5 text-xs text-muted-foreground">
          ${card.price_ck.toFixed(2)}
        </div>
      )}

      {/* 8. Hint text */}
      <div className="mt-2 text-[10px] italic text-muted-foreground">
        Click to see pros, cons &amp; deck fit
      </div>
    </div>
  )
}
