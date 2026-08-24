'use client'

import { useEffect, useState } from 'react'
import { X, Crown } from 'lucide-react'
import { formatPrice } from '@/lib/collection-printing-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CardData {
  name: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  power?: string
  toughness?: string
  color_identity?: string[]
  image_uri?: string
  price_usd?: number
  owned?: boolean
  quantity?: number
  in_decks?: string[]
}

export interface CommanderDetailModalProps {
  cardName: string | null
  onClose: () => void
  /** Called when "Select as Commander" is clicked */
  onSelectCommander?: (name: string) => void
  /** Hide the commander select button (e.g. if already in building phase) */
  hideSelectButton?: boolean
}

// ---------------------------------------------------------------------------
// CommanderDetailModal
// ---------------------------------------------------------------------------

export function CommanderDetailModal({ 
  cardName, 
  onClose, 
  onSelectCommander,
  hideSelectButton = false,
}: CommanderDetailModalProps) {
  const [cardData, setCardData] = useState<CardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle escape key - must be before any early returns
  useEffect(() => {
    if (!cardName) return // Don't add listener if modal is closed
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [cardName, onClose])

  // Fetch card data when cardName changes
  useEffect(() => {
    if (!cardName) {
      setCardData(null)
      return
    }

    setLoading(true)
    setError(null)

    // Fetch from local API which enriches with collection data
    fetch(`/api/cards?name=${encodeURIComponent(cardName)}&action=detail`)
      .then(res => {
        if (!res.ok) throw new Error('Card not found')
        return res.json()
      })
      .then(data => {
        setCardData(data)
        setLoading(false)
      })
      .catch(err => {
        // Fallback to Scryfall
        fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`)
          .then(res => res.json())
          .then(scryfall => {
            setCardData({
              name: scryfall.name,
              mana_cost: scryfall.mana_cost,
              type_line: scryfall.type_line,
              oracle_text: scryfall.oracle_text,
              power: scryfall.power,
              toughness: scryfall.toughness,
              color_identity: scryfall.color_identity,
              image_uri: scryfall.image_uris?.normal || scryfall.image_uris?.large,
              price_usd: parseFloat(scryfall.prices?.usd) || undefined,
            })
            setLoading(false)
          })
          .catch(() => {
            setError('Card not found')
            setLoading(false)
          })
      })
  }, [cardName])

  // Don't render if no card is selected - after all hooks!
  if (!cardName) return null

  const imageUrl = cardData?.image_uri || 
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=normal`

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-[480px] mx-4 bg-[#1a1a1a] rounded-2xl border border-[rgba(255,255,255,0.1)] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-[rgba(0,0,0,0.5)] text-white/60 hover:text-white hover:bg-[rgba(0,0,0,0.7)] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center h-[400px]">
            <div className="flex gap-1">
              <span className="size-2 rounded-full animate-pulse bg-[#2dd4a8]" style={{ animationDelay: '0ms' }} />
              <span className="size-2 rounded-full animate-pulse bg-[#2dd4a8]" style={{ animationDelay: '150ms' }} />
              <span className="size-2 rounded-full animate-pulse bg-[#2dd4a8]" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[400px] text-[rgba(255,255,255,0.5)]">
            {error}
          </div>
        ) : (
          <>
            {/* Card content */}
            <div className="flex gap-5 p-5">
              {/* Card image */}
              <div className="shrink-0">
                <img
                  src={imageUrl}
                  alt={cardName}
                  className="w-[180px] rounded-lg shadow-lg"
                  loading="lazy"
                />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 flex flex-col gap-2.5 py-1">
                {/* Name */}
                <h2 className="text-[22px] font-semibold text-white leading-tight pr-8">
                  {cardData?.name || cardName}
                </h2>

                {/* Mana cost */}
                {cardData?.mana_cost && (
                  <div
                    className="text-[20px] [&_.ms]:text-[20px]"
                    dangerouslySetInnerHTML={{ __html: formatManaCost(cardData.mana_cost) }}
                  />
                )}

                {/* Type line */}
                {cardData?.type_line && (
                  <p className="text-[15px] text-[#d4d4d0]">
                    {cardData.type_line}
                  </p>
                )}

                {/* Oracle text */}
                {cardData?.oracle_text && (
                  <div 
                    className="text-[14px] text-[#d4d4d0] leading-relaxed [&_.ms]:text-[14px] max-h-[120px] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: formatManaCost(cardData.oracle_text.replace(/\n/g, '<br/>')) }}
                  />
                )}

                {/* Power/Toughness */}
                {cardData?.power && cardData?.toughness && (
                  <p className="text-[15px] font-medium text-white">
                    {cardData.power}/{cardData.toughness}
                  </p>
                )}
              </div>
            </div>

            {/* Collection status + price */}
            <div className="px-5 pb-3 flex flex-wrap gap-2">
              {cardData?.owned ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium bg-[rgba(34,197,94,0.15)] text-[#22c55e]">
                  Owned ({cardData.quantity ?? 1})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.4)]">
                  Not in collection
                </span>
              )}
              {cardData?.in_decks && cardData.in_decks.length > 0 && (
                <span className="px-2 py-1 rounded text-[12px] font-medium bg-[rgba(55,138,221,0.15)] text-[#378ADD]">
                  In {cardData.in_decks.slice(0, 2).join(', ')}{cardData.in_decks.length > 2 ? ` +${cardData.in_decks.length - 2}` : ''}
                </span>
              )}
              {cardData?.price_usd != null && cardData.price_usd > 0 && (
                <span className="px-2 py-1 rounded text-[12px] font-medium bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.6)]">
                  {formatPrice(cardData.price_usd)}
                </span>
              )}
            </div>

            {/* Select as Commander button */}
            {!hideSelectButton && onSelectCommander && (
              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={() => {
                    onSelectCommander(cardName)
                    onClose()
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#fbbf24] py-3 text-[15px] font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f59e0b]"
                >
                  <Crown className="w-4 h-4" />
                  Select as Commander
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utility: Format mana cost to pips
// ---------------------------------------------------------------------------

function formatManaCost(text: string): string {
  return text.replace(/\{([^}]+)\}/g, (_match, symbol) => {
    const normalized = symbol.toLowerCase().replace('/', '')
    return `<i class="ms ms-${normalized} ms-cost"></i>`
  })
}
