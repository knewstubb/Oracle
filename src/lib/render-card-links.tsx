'use client'

import { useState, useEffect, useCallback } from 'react'
import { Crown, Plus } from 'lucide-react'
import { useCardHoverPreview, usePartnerHoverPreview, getCardInfo, type CardInfo } from '@/components/CardHoverPreview'

// ---------------------------------------------------------------------------
// CardHoverLink — renders a card name with hover preview
// Uses the global CardHoverPreview singleton for consistent positioning
// ---------------------------------------------------------------------------

/** Mode for the action button next to card names */
export type CardLinkMode = 
  | 'none'      // No action button, just hover preview
  | 'crown'     // Crown icon to select as commander
  | 'add'       // Plus icon to add to deck

/** Ownership status for coloring the + button */
export type OwnershipStatus = 'owned' | 'proxy' | 'unowned' | 'unknown'

/** Ownership lookup function signature */
export type OwnershipLookupFn = (cardName: string) => OwnershipStatus

// Ownership status colors (matching CardSlotBadge)
const OWNERSHIP_COLORS: Record<OwnershipStatus, { text: string; hover: string }> = {
  owned: { text: '#1D9E75', hover: 'rgba(29, 158, 117, 0.2)' },    // Green - signal-success
  proxy: { text: '#489ADE', hover: 'rgba(72, 154, 222, 0.2)' },    // Blue
  unowned: { text: '#EF44BF', hover: 'rgba(239, 68, 191, 0.2)' },  // Pink
  unknown: { text: '#378ADD', hover: 'rgba(55, 138, 221, 0.2)' },  // Default blue (loading/unknown)
}

// ---------------------------------------------------------------------------
// Card validation cache — shared across all CardHoverLink instances
// ---------------------------------------------------------------------------

// Cache for validated cards: CardInfo or null if not found
const cardInfoCache = new Map<string, CardInfo | null>()
const pendingValidations = new Map<string, Promise<CardInfo | null>>()

/**
 * Check if a name is a valid Magic card and get commander eligibility.
 * Uses the local API which returns scryfall_id and can_be_commander.
 */
async function validateAndGetCardInfo(cardName: string): Promise<CardInfo | null> {
  // Check cache first
  if (cardInfoCache.has(cardName)) {
    return cardInfoCache.get(cardName)!
  }
  
  // Check if validation is already in progress
  if (pendingValidations.has(cardName)) {
    return pendingValidations.get(cardName)!
  }
  
  // Start validation using getCardInfo
  const validationPromise = (async () => {
    const info = await getCardInfo(cardName)
    // If no scryfall ID, card doesn't exist
    if (!info.scryfallId) {
      cardInfoCache.set(cardName, null)
      return null
    }
    cardInfoCache.set(cardName, info)
    return info
  })()
  
  pendingValidations.set(cardName, validationPromise)
  validationPromise.finally(() => pendingValidations.delete(cardName))
  
  return validationPromise
}

// ---------------------------------------------------------------------------
// CardHoverLink Component
// ---------------------------------------------------------------------------

export interface CardHoverLinkProps {
  cardName: string
  /** Mode for the action button */
  mode?: CardLinkMode
  /** Called when the action button is clicked (crown or plus) */
  onAction?: (name: string) => void
  /** Called when the card name is clicked (opens detail modal) */
  onCardNameClick?: (name: string) => void
  /** Lookup function for ownership status (colors the + button) */
  ownershipLookup?: OwnershipLookupFn
  /** Custom className for the link text */
  className?: string
  // Legacy props for backward compatibility
  /** @deprecated Use mode='add' and onAction instead */
  onCardClick?: (name: string) => void
  /** @deprecated Use mode='add' instead */
  showAddIndicator?: boolean
}

export function CardHoverLink({ 
  cardName, 
  mode,
  onAction,
  onCardNameClick,
  ownershipLookup,
  className,
  // Legacy props
  onCardClick,
  showAddIndicator = false,
}: CardHoverLinkProps) {
  // Support legacy props
  const resolvedMode: CardLinkMode = mode ?? (onCardClick && showAddIndicator ? 'add' : 'none')
  const resolvedOnAction = onAction ?? onCardClick
  
  const [crownHovered, setCrownHovered] = useState(false)
  const [addHovered, setAddHovered] = useState(false)
  const [cardInfo, setCardInfo] = useState<CardInfo | null | undefined>(() => {
    // Check cache synchronously for instant render (undefined = loading, null = not found)
    return cardInfoCache.has(cardName) ? cardInfoCache.get(cardName) : undefined
  })
  
  // Get ownership status for coloring
  const ownershipStatus: OwnershipStatus = ownershipLookup ? ownershipLookup(cardName) : 'unknown'
  const ownershipColor = OWNERSHIP_COLORS[ownershipStatus]
  
  // Validate card and get info on mount
  useEffect(() => {
    let cancelled = false
    
    validateAndGetCardInfo(cardName).then(info => {
      if (!cancelled) setCardInfo(info)
    })
    
    return () => { cancelled = true }
  }, [cardName])
  
  // Derived state
  const isValidCard = cardInfo !== null
  const scryfallId = cardInfo?.scryfallId ?? null
  const canBeCommander = cardInfo?.canBeCommander ?? false
  
  // Always call the hook unconditionally (React rules of hooks)
  // Pass null scryfallId when card is invalid to disable hover
  const { triggerProps } = useCardHoverPreview({ 
    scryfallId: cardInfo === null ? null : scryfallId,
    cardName,
  })

  const handleActionClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (resolvedOnAction && isValidCard) {
      resolvedOnAction(cardName)
    }
  }, [resolvedOnAction, cardName, isValidCard])

  const handleNameClick = useCallback(() => {
    if (onCardNameClick && isValidCard) {
      onCardNameClick(cardName)
    }
  }, [onCardNameClick, cardName, isValidCard])

  // Style based on whether name click is enabled, card validity, and ownership
  const isClickable = onCardNameClick && isValidCard
  
  // Determine text color based on ownership status (only when ownershipLookup is provided)
  const getTextColor = () => {
    if (cardInfo === null) return 'rgba(255,255,255,0.6)' // Non-card: dimmed
    if (ownershipLookup) {
      // Use ownership-based color (including 'unknown' blue for loading state)
      return ownershipColor.text
    }
    return '#2dd4a8' // Default teal for cards without ownership lookup
  }
  
  const textColor = getTextColor()
  const cursorStyle = isClickable ? 'cursor-pointer' : cardInfo === null ? '' : 'cursor-default'
  const hoverStyle = cardInfo !== null ? 'hover:underline' : ''
  const linkClassName = className ?? `${cursorStyle} ${hoverStyle}`
  const linkStyle = { color: textColor }

  // For non-cards, render plain text without interaction
  if (cardInfo === null) {
    return <span className={linkClassName} style={linkStyle}>{cardName}</span>
  }

  // Get tooltip text based on ownership
  const getAddTooltip = () => {
    switch (ownershipStatus) {
      case 'owned': return `Add ${cardName} (owned)`
      case 'proxy': return `Add ${cardName} (proxy only)`
      case 'unowned': return `Add ${cardName} (not owned)`
      default: return `Add ${cardName} to deck`
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      {/* Card name — clickable to open modal, hoverable for preview */}
      <span 
        className={linkClassName}
        style={linkStyle}
        onClick={handleNameClick}
        {...triggerProps}
      >
        {cardName}
      </span>
      
      {/* Crown button — only shown for valid commanders */}
      {resolvedMode === 'crown' && resolvedOnAction && isValidCard && canBeCommander && (
        <span className="relative">
          <button
            type="button"
            onClick={handleActionClick}
            onMouseEnter={() => setCrownHovered(true)}
            onMouseLeave={() => setCrownHovered(false)}
            className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[rgba(251,191,36,0.2)] text-[#fbbf24] transition-colors cursor-pointer"
            aria-label={`Select ${cardName} as commander`}
          >
            <Crown className="w-3.5 h-3.5" />
          </button>
          {/* Tooltip */}
          {crownHovered && (
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded shadow-lg whitespace-nowrap z-[9999]">
              Add as Commander
            </span>
          )}
        </span>
      )}
      
      {/* Plus button — add to deck, colored by ownership status */}
      {resolvedMode === 'add' && resolvedOnAction && isValidCard && (
        <span className="relative">
          <button
            type="button"
            onClick={handleActionClick}
            onMouseEnter={() => setAddHovered(true)}
            onMouseLeave={() => setAddHovered(false)}
            className="inline-flex items-center justify-center w-5 h-5 rounded transition-colors cursor-pointer"
            style={{ 
              color: ownershipColor.text,
              backgroundColor: addHovered ? ownershipColor.hover : 'transparent',
            }}
            aria-label={getAddTooltip()}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {/* Tooltip with ownership status */}
          {addHovered && (
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded shadow-lg whitespace-nowrap z-[9999]">
              {getAddTooltip()}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// PartnerHoverLink — renders partner commander pair "A & B" with dual hover
// ---------------------------------------------------------------------------

export interface PartnerHoverLinkProps {
  /** First commander name */
  cardName1: string
  /** Second commander name */
  cardName2: string
  /** Mode for the action button */
  mode?: CardLinkMode
  /** Called when the action button is clicked — passes "Name1 & Name2" */
  onAction?: (partnerPair: string) => void
  /** Called when the partner names are clicked (opens detail modal for first commander) */
  onCardNameClick?: (name: string) => void
  /** Lookup function for ownership status (colors the + button) */
  ownershipLookup?: OwnershipLookupFn
}

/**
 * Partner commander link component.
 * Displays "Name1 & Name2" as a single hoverable unit.
 * Hovering shows both cards side-by-side.
 * Crown button commits both as commanders.
 */
export function PartnerHoverLink({
  cardName1,
  cardName2,
  mode,
  onAction,
  onCardNameClick,
  ownershipLookup,
}: PartnerHoverLinkProps) {
  const [crownHovered, setCrownHovered] = useState(false)
  const [addHovered, setAddHovered] = useState(false)
  const [cardInfo1, setCardInfo1] = useState<CardInfo | null | undefined>(() => 
    cardInfoCache.has(cardName1) ? cardInfoCache.get(cardName1) : undefined
  )
  const [cardInfo2, setCardInfo2] = useState<CardInfo | null | undefined>(() => 
    cardInfoCache.has(cardName2) ? cardInfoCache.get(cardName2) : undefined
  )
  
  // Get ownership status for both cards — use the "worst" status for the pair
  const getPartnerOwnershipStatus = (): OwnershipStatus => {
    if (!ownershipLookup) return 'unknown'
    const status1 = ownershipLookup(cardName1)
    const status2 = ownershipLookup(cardName2)
    // Priority: unowned > proxy > owned > unknown
    if (status1 === 'unowned' || status2 === 'unowned') return 'unowned'
    if (status1 === 'proxy' || status2 === 'proxy') return 'proxy'
    if (status1 === 'owned' && status2 === 'owned') return 'owned'
    return 'unknown'
  }
  const ownershipStatus = getPartnerOwnershipStatus()
  const ownershipColor = OWNERSHIP_COLORS[ownershipStatus]
  
  // Validate both cards on mount
  useEffect(() => {
    let cancelled = false
    validateAndGetCardInfo(cardName1).then(info => { if (!cancelled) setCardInfo1(info) })
    validateAndGetCardInfo(cardName2).then(info => { if (!cancelled) setCardInfo2(info) })
    return () => { cancelled = true }
  }, [cardName1, cardName2])
  
  // Use partner hover preview hook
  const { triggerProps, scryfallId1, scryfallId2 } = usePartnerHoverPreview({
    cardName1,
    cardName2,
  })
  
  const bothValid = cardInfo1 !== null && cardInfo2 !== null
  const bothCanBeCommander = (cardInfo1?.canBeCommander ?? false) && (cardInfo2?.canBeCommander ?? false)
  const bothIdsLoaded = scryfallId1 && scryfallId2
  
  const handleActionClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (onAction && bothValid) {
      // Pass the partner pair as "Name1 & Name2"
      onAction(`${cardName1} & ${cardName2}`)
    }
  }, [onAction, cardName1, cardName2, bothValid])

  const handleNameClick = useCallback(() => {
    // Click opens modal for first commander
    if (onCardNameClick && bothValid) {
      onCardNameClick(cardName1)
    }
  }, [onCardNameClick, cardName1, bothValid])

  // Style based on validity and ownership
  const isClickable = onCardNameClick && bothValid
  
  // Determine text color based on ownership status (only when ownershipLookup is provided)
  const getTextColor = () => {
    if (!bothValid) return 'rgba(255,255,255,0.6)' // Invalid: dimmed
    if (ownershipLookup) {
      // Use ownership-based color (including 'unknown' blue for loading state)
      return ownershipColor.text
    }
    return '#2dd4a8' // Default teal
  }
  
  const textColor = getTextColor()
  const cursorStyle = isClickable ? 'cursor-pointer' : bothValid ? 'cursor-default' : ''
  const hoverStyle = bothValid ? 'hover:underline' : ''
  const linkClassName = `${cursorStyle} ${hoverStyle}`
  const linkStyle = { color: textColor }

  // If either card is invalid, render as plain text
  if (cardInfo1 === null || cardInfo2 === null) {
    return <span className={linkClassName} style={linkStyle}>{cardName1} &amp; {cardName2}</span>
  }

  return (
    <span className="inline-flex items-center gap-1">
      {/* Partner names — single hoverable unit */}
      <span 
        className={linkClassName}
        style={linkStyle}
        onClick={handleNameClick}
        {...(bothIdsLoaded ? triggerProps : {})}
      >
        {cardName1} &amp; {cardName2}
      </span>
      
      {/* Crown button — only shown if both partners can be commanders */}
      {mode === 'crown' && onAction && bothValid && bothCanBeCommander && (
        <span className="relative">
          <button
            type="button"
            onClick={handleActionClick}
            onMouseEnter={() => setCrownHovered(true)}
            onMouseLeave={() => setCrownHovered(false)}
            className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[rgba(251,191,36,0.2)] text-[#fbbf24] transition-colors cursor-pointer"
            aria-label={`Select ${cardName1} & ${cardName2} as partner commanders`}
          >
            <Crown className="w-3.5 h-3.5" />
          </button>
          {/* Tooltip */}
          {crownHovered && (
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded shadow-lg whitespace-nowrap z-[9999]">
              Add as Partner Commanders
            </span>
          )}
        </span>
      )}
      
      {/* Plus button — add both to deck (for building phase) */}
      {mode === 'add' && onAction && bothValid && (
        <span className="relative">
          <button
            type="button"
            onClick={handleActionClick}
            onMouseEnter={() => setAddHovered(true)}
            onMouseLeave={() => setAddHovered(false)}
            className="inline-flex items-center justify-center w-5 h-5 rounded transition-colors cursor-pointer"
            style={{ 
              color: ownershipColor.text,
              backgroundColor: addHovered ? ownershipColor.hover : 'transparent',
            }}
            aria-label={`Add ${cardName1} & ${cardName2} to deck`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {/* Tooltip with ownership status */}
          {addHovered && (
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded shadow-lg whitespace-nowrap z-[9999]">
              Add {cardName1} & {cardName2} ({ownershipStatus === 'unknown' ? 'to deck' : ownershipStatus})
            </span>
          )}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// renderInlineContent — parses [[Card Name]] and **bold** syntax
// ---------------------------------------------------------------------------

/**
 * Parse inline content and render:
 * - [[Card Name]] → CardHoverLink with hover preview
 * - **text** → bold text (supports nested [[card]] inside)
 * - *text* → italic text (optional, for OracleChat compatibility)
 * 
 * @param text - The text to parse
 * @param mode - Mode for action buttons: 'none', 'crown', or 'add'
 * @param onAction - Callback when action button is clicked
 * @param onCardNameClick - Callback when card name is clicked (opens detail modal)
 * @param ownershipLookup - Optional function to look up card ownership status
 * @returns React nodes with card links and formatting applied
 */
export function renderInlineContent(
  text: string, 
  mode: CardLinkMode = 'none',
  onAction?: (name: string) => void,
  onCardNameClick?: (name: string) => void,
  ownershipLookup?: OwnershipLookupFn
): React.ReactNode {
  // First, detect partner pairs: [[Name1]] & [[Name2]] or [[Name1]] and [[Name2]]
  // Replace them with a placeholder to prevent the regular split from breaking them up
  const partnerPattern = /\[\[([^\]]+)\]\]\s*(?:&|and)\s*\[\[([^\]]+)\]\]/gi
  const partnerMatches: Array<{ full: string; name1: string; name2: string }> = []
  let partnerIndex = 0
  
  const textWithPartnerPlaceholders = text.replace(partnerPattern, (match, name1, name2) => {
    partnerMatches.push({ full: match, name1, name2 })
    return `__PARTNER_${partnerIndex++}__`
  })
  
  // Split on [[Card Name]], **bold**, *italic*, and partner placeholders
  const parts = textWithPartnerPlaceholders.split(/(__PARTNER_\d+__|\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\*[^*]+\*)/g)

  return parts.map((part, i) => {
    // Partner pair placeholder
    if (part.startsWith('__PARTNER_') && part.endsWith('__')) {
      const idx = parseInt(part.slice(10, -2), 10)
      const partner = partnerMatches[idx]
      if (partner) {
        return (
          <PartnerHoverLink
            key={i}
            cardName1={partner.name1}
            cardName2={partner.name2}
            mode={mode}
            onAction={onAction}
            onCardNameClick={onCardNameClick}
            ownershipLookup={ownershipLookup}
          />
        )
      }
    }
    
    // Card link: [[Card Name]]
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const cardName = part.slice(2, -2)
      return (
        <CardHoverLink 
          key={i} 
          cardName={cardName} 
          mode={mode}
          onAction={onAction}
          onCardNameClick={onCardNameClick}
          ownershipLookup={ownershipLookup}
        />
      )
    }

    // Bold: **text** — may contain [[card]] or partners inside, so recursively parse
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2)
      if (inner.includes('[[')) {
        return (
          <strong key={i} className="font-medium text-[#d4d4d0]">
            {renderInlineContent(inner, mode, onAction, onCardNameClick, ownershipLookup)}
          </strong>
        )
      }
      return <strong key={i} className="font-medium text-[#d4d4d0]">{inner}</strong>
    }

    // Italic: *text* (single asterisk)
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      const inner = part.slice(1, -1)
      return <em key={i}>{inner}</em>
    }

    // Plain text
    return <span key={i}>{part}</span>
  })
}

// ---------------------------------------------------------------------------
// renderMessageContent — full message parsing with line breaks and bullets
// ---------------------------------------------------------------------------

/**
 * Parse message content with block-level formatting:
 * - Bullet points: "- text" or "• text"
 * - Empty lines: paragraph breaks
 * - Inline: [[Card Name]] and **bold**
 * 
 * @param content - The full message content
 * @param mode - Mode for action buttons: 'none', 'crown', or 'add'
 * @param onAction - Callback when action button is clicked
 * @param onCardNameClick - Callback when card name is clicked (opens detail modal)
 * @param ownershipLookup - Optional function to look up card ownership status
 * @returns React nodes with full formatting applied
 */
export function renderMessageContent(
  content: string,
  mode: CardLinkMode = 'none',
  onAction?: (name: string) => void,
  onCardNameClick?: (name: string) => void,
  ownershipLookup?: OwnershipLookupFn
): React.ReactNode {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Bullet point: "- text" or "• text"
    if (/^\s*[-•]\s+/.test(line)) {
      const bulletText = line.replace(/^\s*[-•]\s+/, '')
      elements.push(
        <div key={i} className="flex gap-1.5 pl-0.5">
          <span className="text-[rgba(255,255,255,0.3)] shrink-0">•</span>
          <span>{renderInlineContent(bulletText, mode, onAction, onCardNameClick, ownershipLookup)}</span>
        </div>
      )
    }
    // Empty line = spacing
    else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    }
    // Regular text line
    else {
      elements.push(<div key={i}>{renderInlineContent(line, mode, onAction, onCardNameClick, ownershipLookup)}</div>)
    }
  }

  return <>{elements}</>
}
