'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPrice } from '@/lib/collection-printing-utils'

/**
 * CardHoverPreview — High-performance card image hover preview.
 *
 * CRITICAL OPTIMIZATION: This component avoids React state entirely for
 * positioning updates. Instead, it uses refs and direct DOM manipulation
 * to achieve 60fps performance. React state updates on mousemove cause
 * expensive rerenders that tank performance.
 *
 * Architecture:
 * - A single persistent portal div is created on mount
 * - Mouse events update the DOM directly via refs (no setState)
 * - Image src is swapped directly on the img element
 * - Visibility is controlled via CSS class, not React conditionals
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMG_WIDTH = 260
const IMG_HEIGHT = 364  // 260 * (7/5) ratio for Magic cards
const INFO_BAR_HEIGHT = 28  // Height for ownership/price info bar
const FRAME_PADDING = 6     // Padding inside frame around card
const TOTAL_HEIGHT = IMG_HEIGHT + INFO_BAR_HEIGHT + FRAME_PADDING * 2
const VIEWPORT_PAD = 12

// Ownership colors (matching render-card-links.tsx)
const OWNERSHIP_COLORS = {
  owned: '#1D9E75',
  proxy: '#489ADE',
  unowned: '#EF44BF',
  unknown: '#888888',
}

// Dual-card mode constants (slightly smaller to fit both)
const DUAL_IMG_WIDTH = 260
const DUAL_IMG_HEIGHT = 364
const DUAL_GAP = 12
const DUAL_TOTAL_WIDTH = DUAL_IMG_WIDTH * 2 + DUAL_GAP

// ---------------------------------------------------------------------------
// Singleton portal container
// ---------------------------------------------------------------------------

let portalContainer: HTMLDivElement | null = null
let currentCardName: string | null = null // Track which card is shown to prevent stale images
const PORTAL_VERSION = 4 // Increment to force recreation after structural changes

// Global store for ownership data per card (populated by ChatPanel, consumed by hover preview)
export const cardOwnershipData = new Map<string, {
  status: 'owned' | 'proxy' | 'unowned' | 'unknown'
  quantity?: number
  available?: number
  priceUsd?: number | null
}>()

function getPortalContainer(): HTMLDivElement {
  if (typeof document === 'undefined') {
    throw new Error('Cannot create portal container on server')
  }
  
  // Check if existing portal is outdated (structure changed)
  const existingPortal = document.getElementById('card-hover-preview-portal') as HTMLDivElement | null
  if (existingPortal && existingPortal.dataset.version !== String(PORTAL_VERSION)) {
    existingPortal.remove()
    portalContainer = null
  }
  
  if (!portalContainer) {
    portalContainer = document.createElement('div')
    portalContainer.id = 'card-hover-preview-portal'
    portalContainer.dataset.version = String(PORTAL_VERSION)
    portalContainer.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: ${IMG_WIDTH + FRAME_PADDING * 2}px;
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 50ms ease-out;
      will-change: transform, opacity;
    `
    
    // Frame container with subtle border
    const frame = document.createElement('div')
    frame.id = 'card-hover-preview-frame'
    frame.style.cssText = `
      background: #1a1a1a;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.5);
      padding: ${FRAME_PADDING}px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `
    
    const img = document.createElement('img')
    img.id = 'card-hover-preview-img'
    img.alt = ''
    img.style.cssText = `
      width: ${IMG_WIDTH}px;
      aspect-ratio: 5/7;
      border-radius: 12px;
      display: block;
    `
    img.onerror = () => { 
      img.style.display = 'none'
      portalContainer!.style.opacity = '0'
    }
    img.onload = () => { 
      img.style.display = 'block'
      // Only show if we're still expecting this image
      if (currentCardName && img.alt === currentCardName) {
        portalContainer!.style.opacity = '1'
      }
    }
    
    // Info bar for ownership/price
    const infoBar = document.createElement('div')
    infoBar.id = 'card-hover-preview-info'
    infoBar.style.cssText = `
      height: ${INFO_BAR_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 500;
      color: #ffffff;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.05);
      padding: 0 10px;
    `
    
    frame.appendChild(img)
    frame.appendChild(infoBar)
    portalContainer.appendChild(frame)
    document.body.appendChild(portalContainer)
  }
  
  return portalContainer
}

// ---------------------------------------------------------------------------
// Dual-card portal container (for partner commanders)
// ---------------------------------------------------------------------------

let dualPortalContainer: HTMLDivElement | null = null
let currentPartnerNames: [string, string] | null = null

function getDualPortalContainer(): HTMLDivElement {
  if (typeof document === 'undefined') {
    throw new Error('Cannot create portal container on server')
  }
  
  if (!dualPortalContainer) {
    dualPortalContainer = document.createElement('div')
    dualPortalContainer.id = 'card-hover-preview-dual-portal'
    dualPortalContainer.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      display: flex;
      gap: ${DUAL_GAP}px;
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 50ms ease-out;
      will-change: transform, opacity;
    `
    
    // Create two image elements
    for (let i = 0; i < 2; i++) {
      const img = document.createElement('img')
      img.id = `card-hover-preview-dual-img-${i}`
      img.alt = ''
      img.dataset.loaded = 'false'
      img.style.cssText = `
        width: ${DUAL_IMG_WIDTH}px;
        aspect-ratio: 5/7;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
      `
      img.onerror = () => { 
        img.style.display = 'none'
      }
      img.onload = () => { 
        img.style.display = 'block'
        img.dataset.loaded = 'true'
        // Show container when both images are loaded
        const img0 = document.getElementById('card-hover-preview-dual-img-0') as HTMLImageElement | null
        const img1 = document.getElementById('card-hover-preview-dual-img-1') as HTMLImageElement | null
        if (img0?.dataset.loaded === 'true' && img1?.dataset.loaded === 'true') {
          dualPortalContainer!.style.opacity = '1'
        }
      }
      
      dualPortalContainer.appendChild(img)
    }
    
    document.body.appendChild(dualPortalContainer)
  }
  
  return dualPortalContainer
}

// ---------------------------------------------------------------------------
// Position calculation (pure function, no DOM access)
// ---------------------------------------------------------------------------

/**
 * Calculate position for hover preview.
 * 
 * Positioning strategy:
 * - Card appears diagonally (45°) from cursor
 * - Quadrant chosen based on cursor position relative to screen center:
 *   - Cursor in left half → card to the right
 *   - Cursor in right half → card to the left
 *   - Cursor in top half → card below
 *   - Cursor in bottom half → card above
 * - This ensures the card doesn't go off-screen and doesn't obscure content
 */
function calculatePosition(cursorX: number, cursorY: number, viewW: number, viewH: number): { left: number; top: number } {
  const GAP = 16 // Distance from cursor to card edge
  const totalWidth = IMG_WIDTH + FRAME_PADDING * 2
  
  // Determine horizontal position: left or right of cursor
  const cursorInLeftHalf = cursorX < viewW / 2
  let left: number
  if (cursorInLeftHalf) {
    // Card to the right of cursor
    left = cursorX + GAP
  } else {
    // Card to the left of cursor
    left = cursorX - totalWidth - GAP
  }
  
  // Determine vertical position: above or below cursor
  const cursorInTopHalf = cursorY < viewH / 2
  let top: number
  if (cursorInTopHalf) {
    // Card below cursor (diagonal down)
    top = cursorY + GAP
  } else {
    // Card above cursor (diagonal up)
    top = cursorY - TOTAL_HEIGHT - GAP
  }
  
  // Clamp to viewport bounds
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
  if (left + totalWidth > viewW - VIEWPORT_PAD) left = viewW - totalWidth - VIEWPORT_PAD
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD
  if (top + TOTAL_HEIGHT > viewH - VIEWPORT_PAD) top = viewH - TOTAL_HEIGHT - VIEWPORT_PAD

  return { left, top }
}

/**
 * Calculate position for dual-card hover preview (partner commanders).
 * Same positioning strategy as single card, but with wider container.
 */
function calculateDualPosition(cursorX: number, cursorY: number, viewW: number, viewH: number): { left: number; top: number } {
  const GAP = 16
  
  const cursorInLeftHalf = cursorX < viewW / 2
  let left: number
  if (cursorInLeftHalf) {
    left = cursorX + GAP
  } else {
    left = cursorX - DUAL_TOTAL_WIDTH - GAP
  }
  
  const cursorInTopHalf = cursorY < viewH / 2
  let top: number
  if (cursorInTopHalf) {
    top = cursorY + GAP
  } else {
    top = cursorY - DUAL_IMG_HEIGHT - GAP
  }
  
  // Clamp to viewport bounds
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
  if (left + DUAL_TOTAL_WIDTH > viewW - VIEWPORT_PAD) left = viewW - DUAL_TOTAL_WIDTH - VIEWPORT_PAD
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD
  if (top + DUAL_IMG_HEIGHT > viewH - VIEWPORT_PAD) top = viewH - DUAL_IMG_HEIGHT - VIEWPORT_PAD

  return { left, top }
}

// ---------------------------------------------------------------------------
// Scryfall ID cache — shared across all hover preview instances
// Cache version: increment to bust cache after fixing printing selection logic
// ---------------------------------------------------------------------------

const CACHE_VERSION = 2  // Bumped to clear old Secret Lair IDs
const scryfallIdCache = new Map<string, string | null>()
const pendingFetches = new Map<string, Promise<string | null>>()

// Clear cache on version change (runs once per page load)
const cacheVersionKey = `oracle-scryfall-cache-v${CACHE_VERSION}`
if (typeof window !== 'undefined' && !sessionStorage.getItem(cacheVersionKey)) {
  scryfallIdCache.clear()
  sessionStorage.setItem(cacheVersionKey, 'true')
}

/**
 * Fetch scryfall ID for a card name (with caching).
 * Used by useCardHoverPreviewByName hook.
 * Prefers standard printings over Secret Lair/promo variants.
 */
export async function getScryfallId(cardName: string): Promise<string | null> {
  // Check cache first
  if (scryfallIdCache.has(cardName)) {
    const cached = scryfallIdCache.get(cardName) ?? null
    return cached
  }
  
  // Check if fetch is already in progress
  if (pendingFetches.has(cardName)) {
    return pendingFetches.get(cardName)!
  }
  
  // Start fetch
  const fetchPromise = (async () => {
    try {
      // Use local API which resolves from DB (faster than Scryfall API)
      const res = await fetch(`/api/cards?name=${encodeURIComponent(cardName)}&action=scryfall_id`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      const id = data.scryfall_id || null
      scryfallIdCache.set(cardName, id)
      return id
    } catch {
      // Fallback: try Scryfall API directly with exact name match
      try {
        const res = await fetch(
          `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`,
          { headers: { 'User-Agent': 'TheOracle/1.0' } }
        )
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        
        // Reject Secret Lair (sld), Final Fantasy (fca), and promo sets
        if (data.set === 'sld' || data.set === 'fca' || data.promo === true) {
          // Try to find a non-promo printing via search
          const searchRes = await fetch(
            `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"+game:paper+-set:sld+-set:fca&unique=prints&order=released&dir=asc`,
            { headers: { 'User-Agent': 'TheOracle/1.0' } }
          )
          if (searchRes.ok) {
            const searchData = await searchRes.json()
            if (searchData.data?.[0]?.id) {
              const id = searchData.data[0].id
              scryfallIdCache.set(cardName, id)
              return id
            }
          }
        }
        
        const id = data.id || null
        scryfallIdCache.set(cardName, id)
        return id
      } catch {
        scryfallIdCache.set(cardName, null)
        return null
      }
    } finally {
      pendingFetches.delete(cardName)
    }
  })()
  
  pendingFetches.set(cardName, fetchPromise)
  return fetchPromise
}

// ---------------------------------------------------------------------------
// getCardInfo — returns scryfall_id + can_be_commander for commander validation
// ---------------------------------------------------------------------------

export interface CardInfo {
  scryfallId: string | null
  canBeCommander: boolean
}

// Cache for card info (separate from scryfall ID cache to avoid breaking existing code)
const cardInfoCache = new Map<string, CardInfo>()
const pendingCardInfoFetches = new Map<string, Promise<CardInfo>>()

/**
 * Fetch card info including can_be_commander flag.
 * Used by CardHoverLink to determine if crown icon should be shown.
 */
export async function getCardInfo(cardName: string): Promise<CardInfo> {
  // Check cache first
  if (cardInfoCache.has(cardName)) {
    return cardInfoCache.get(cardName)!
  }
  
  // Check if fetch is already in progress
  if (pendingCardInfoFetches.has(cardName)) {
    return pendingCardInfoFetches.get(cardName)!
  }
  
  // Start fetch
  const fetchPromise = (async (): Promise<CardInfo> => {
    try {
      // Use local API which now returns can_be_commander
      const url = `/api/cards?name=${encodeURIComponent(cardName)}&action=scryfall_id`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error('Not found')
      }
      const data = await res.json()
      const info: CardInfo = {
        scryfallId: data.scryfall_id || null,
        canBeCommander: data.can_be_commander ?? false,
      }
      cardInfoCache.set(cardName, info)
      // Also populate scryfall ID cache for consistency
      if (info.scryfallId) {
        scryfallIdCache.set(cardName, info.scryfallId)
      }
      return info
    } catch {
      // Card not found
      const info: CardInfo = { scryfallId: null, canBeCommander: false }
      cardInfoCache.set(cardName, info)
      return info
    } finally {
      pendingCardInfoFetches.delete(cardName)
    }
  })()
  
  pendingCardInfoFetches.set(cardName, fetchPromise)
  return fetchPromise
}

// ---------------------------------------------------------------------------
// Hook — useCardHoverPreview (high-performance, no React state for position)
// ---------------------------------------------------------------------------

export interface UseCardHoverPreviewOptions {
  /** Scryfall ID for image URL. If null/undefined, preview is disabled. */
  scryfallId?: string | null
  /** Card name for alt text */
  cardName: string
}

export interface CardHoverPreviewTriggerProps {
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

/**
 * Hook that manages hover state using direct DOM manipulation for 60fps performance.
 * NO React state is used for positioning — all updates go directly to the DOM.
 * 
 * Use this when you already have the scryfall ID.
 * For card name lookup, use useCardHoverPreviewByName instead.
 */
export function useCardHoverPreview({
  scryfallId,
  cardName,
}: UseCardHoverPreviewOptions): {
  triggerProps: CardHoverPreviewTriggerProps
} {
  const isActiveRef = useRef(false)
  
  const showPreview = useCallback((scryfallId: string, cardName: string, cursorX: number, cursorY: number) => {
    if (typeof document === 'undefined') return
    
    const container = getPortalContainer()
    const img = document.getElementById('card-hover-preview-img') as HTMLImageElement | null
    const infoBar = document.getElementById('card-hover-preview-info') as HTMLDivElement | null
    
    if (!img) {
      console.warn('[CardHoverPreview] img element not found in portal')
      return
    }
    
    // Build image URL
    const a = scryfallId.charAt(0)
    const b = scryfallId.charAt(1)
    const url = `https://cards.scryfall.io/large/front/${a}/${b}/${scryfallId}.jpg`
    
    // Calculate and apply position directly to DOM
    const { left, top } = calculatePosition(cursorX, cursorY, window.innerWidth, window.innerHeight)
    container.style.transform = `translate3d(${left}px, ${top}px, 0)`
    
    // If switching to a different card, hide until new image loads
    if (currentCardName !== cardName) {
      container.style.opacity = '0'
      currentCardName = cardName
    }
    
    // Update image (only if changed)
    if (img.src !== url) {
      img.src = url
      img.alt = cardName
      // Image will show via onload handler once loaded
    } else {
      // Same image already loaded, show immediately
      container.style.opacity = '1'
    }
    
    // Update info bar with ownership data
    if (infoBar) {
      const data = cardOwnershipData.get(cardName.toLowerCase())
      if (data) {
        const color = OWNERSHIP_COLORS[data.status]
        infoBar.style.display = 'flex'
        infoBar.style.borderLeft = `3px solid ${color}`
        infoBar.style.color = color
        
        if (data.status === 'owned' && data.quantity !== undefined) {
          const availText = data.available === data.quantity 
            ? `${data.quantity} owned (all available)`
            : `${data.quantity} owned, ${data.available} available`
          const priceText = data.priceUsd != null ? ` · ${formatPrice(data.priceUsd)}` : ''
          infoBar.textContent = availText + priceText
        } else if (data.status === 'proxy') {
          const priceText = data.priceUsd != null ? ` · ${formatPrice(data.priceUsd)}` : ''
          infoBar.textContent = 'Proxy only' + priceText
        } else if (data.status === 'unowned') {
          const priceText = data.priceUsd != null 
            ? formatPrice(data.priceUsd)
            : 'Price unknown'
          infoBar.textContent = priceText
        } else {
          infoBar.style.display = 'none'
        }
      } else {
        // No ownership data available — hide the info bar
        infoBar.style.display = 'none'
      }
    }
    
    isActiveRef.current = true
  }, [])
  
  const updatePosition = useCallback((cursorX: number, cursorY: number) => {
    if (typeof document === 'undefined' || !isActiveRef.current) return
    
    const container = getPortalContainer()
    const { left, top } = calculatePosition(cursorX, cursorY, window.innerWidth, window.innerHeight)
    container.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }, [])
  
  const hidePreview = useCallback(() => {
    if (typeof document === 'undefined') return
    
    const container = getPortalContainer()
    container.style.opacity = '0'
    isActiveRef.current = false
    currentCardName = null
  }, [])

  const onMouseEnter = useCallback((e: React.MouseEvent) => {
    if (!scryfallId) return
    showPreview(scryfallId, cardName, e.clientX, e.clientY)
  }, [scryfallId, cardName, showPreview])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!scryfallId || !isActiveRef.current) return
    updatePosition(e.clientX, e.clientY)
  }, [scryfallId, updatePosition])

  const onMouseLeave = useCallback(() => {
    hidePreview()
  }, [hidePreview])

  return {
    triggerProps: { onMouseEnter, onMouseMove, onMouseLeave },
  }
}

// ---------------------------------------------------------------------------
// Hook — useCardHoverPreviewByName (looks up scryfall ID from card name)
// ---------------------------------------------------------------------------

export interface UseCardHoverPreviewByNameOptions {
  /** Card name to look up */
  cardName: string
}

/**
 * Hook that manages hover state with automatic scryfall ID lookup from card name.
 * Prefetches the scryfall ID on mount for instant hover preview.
 * 
 * Use this when you only have the card name (e.g., from chat messages).
 */
export function useCardHoverPreviewByName({
  cardName,
}: UseCardHoverPreviewByNameOptions): {
  triggerProps: CardHoverPreviewTriggerProps
  scryfallId: string | null
} {
  const [scryfallId, setScryfallId] = useState<string | null>(() => {
    // Check cache synchronously for instant display
    return scryfallIdCache.get(cardName) ?? null
  })
  
  // Prefetch scryfall ID on mount
  useEffect(() => {
    getScryfallId(cardName).then(id => {
      if (id) setScryfallId(id)
    })
  }, [cardName])
  
  const { triggerProps } = useCardHoverPreview({ scryfallId, cardName })
  
  return { triggerProps, scryfallId }
}

// ---------------------------------------------------------------------------
// Hook — usePartnerHoverPreview (dual-card mode for partner commanders)
// ---------------------------------------------------------------------------

export interface UsePartnerHoverPreviewOptions {
  /** First card name */
  cardName1: string
  /** Second card name */
  cardName2: string
}

/**
 * Hook for partner commander hover preview.
 * Shows two cards side-by-side when hovering.
 * Prefetches both scryfall IDs on mount.
 */
export function usePartnerHoverPreview({
  cardName1,
  cardName2,
}: UsePartnerHoverPreviewOptions): {
  triggerProps: CardHoverPreviewTriggerProps
  scryfallId1: string | null
  scryfallId2: string | null
} {
  const [scryfallId1, setScryfallId1] = useState<string | null>(() => {
    return scryfallIdCache.get(cardName1) ?? null
  })
  const [scryfallId2, setScryfallId2] = useState<string | null>(() => {
    return scryfallIdCache.get(cardName2) ?? null
  })
  
  const isActiveRef = useRef(false)
  
  // Prefetch both scryfall IDs on mount
  useEffect(() => {
    getScryfallId(cardName1).then(id => {
      if (id) setScryfallId1(id)
    })
    getScryfallId(cardName2).then(id => {
      if (id) setScryfallId2(id)
    })
  }, [cardName1, cardName2])
  
  const showDualPreview = useCallback((id1: string, id2: string, name1: string, name2: string, cursorX: number, cursorY: number) => {
    if (typeof document === 'undefined') return
    
    const container = getDualPortalContainer()
    const img0 = document.getElementById('card-hover-preview-dual-img-0') as HTMLImageElement | null
    const img1 = document.getElementById('card-hover-preview-dual-img-1') as HTMLImageElement | null
    if (!img0 || !img1) return
    
    // Build image URLs (use large for better quality)
    const url1 = `https://cards.scryfall.io/large/front/${id1.charAt(0)}/${id1.charAt(1)}/${id1}.jpg`
    const url2 = `https://cards.scryfall.io/large/front/${id2.charAt(0)}/${id2.charAt(1)}/${id2}.jpg`
    
    // Calculate and apply position
    const { left, top } = calculateDualPosition(cursorX, cursorY, window.innerWidth, window.innerHeight)
    container.style.transform = `translate3d(${left}px, ${top}px, 0)`
    
    // Check if switching to different cards
    const newPair: [string, string] = [name1, name2]
    const pairChanged = !currentPartnerNames || 
      currentPartnerNames[0] !== newPair[0] || 
      currentPartnerNames[1] !== newPair[1]
    
    if (pairChanged) {
      container.style.opacity = '0'
      currentPartnerNames = newPair
      img0.dataset.loaded = 'false'
      img1.dataset.loaded = 'false'
    }
    
    // Update images (only if changed)
    if (img0.src !== url1) {
      img0.src = url1
      img0.alt = name1
    }
    if (img1.src !== url2) {
      img1.src = url2
      img1.alt = name2
    }
    
    // If both already loaded, show immediately
    if (!pairChanged && img0.dataset.loaded === 'true' && img1.dataset.loaded === 'true') {
      container.style.opacity = '1'
    }
    
    isActiveRef.current = true
  }, [])
  
  const updateDualPosition = useCallback((cursorX: number, cursorY: number) => {
    if (typeof document === 'undefined' || !isActiveRef.current) return
    
    const container = getDualPortalContainer()
    const { left, top } = calculateDualPosition(cursorX, cursorY, window.innerWidth, window.innerHeight)
    container.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }, [])
  
  const hideDualPreview = useCallback(() => {
    if (typeof document === 'undefined') return
    
    const container = getDualPortalContainer()
    container.style.opacity = '0'
    isActiveRef.current = false
    currentPartnerNames = null
  }, [])

  const onMouseEnter = useCallback((e: React.MouseEvent) => {
    if (!scryfallId1 || !scryfallId2) return
    showDualPreview(scryfallId1, scryfallId2, cardName1, cardName2, e.clientX, e.clientY)
  }, [scryfallId1, scryfallId2, cardName1, cardName2, showDualPreview])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!scryfallId1 || !scryfallId2 || !isActiveRef.current) return
    updateDualPosition(e.clientX, e.clientY)
  }, [scryfallId1, scryfallId2, updateDualPosition])

  const onMouseLeave = useCallback(() => {
    hideDualPreview()
  }, [hideDualPreview])

  return {
    triggerProps: { onMouseEnter, onMouseMove, onMouseLeave },
    scryfallId1,
    scryfallId2,
  }
}

// ---------------------------------------------------------------------------
// Legacy Component API — for backwards compatibility
// ---------------------------------------------------------------------------

export interface CardHoverPreviewProps {
  visible: boolean
  scryfallId: string | null
  cardName: string
  cursorX: number
  cursorY: number
}

/**
 * Legacy component API — maintained for backwards compatibility.
 * For new code, prefer the useCardHoverPreview hook directly.
 */
export function CardHoverPreview({ visible, scryfallId, cardName, cursorX, cursorY }: CardHoverPreviewProps) {
  const hasInitRef = useRef(false)
  
  useEffect(() => {
    if (typeof document === 'undefined') return
    
    const container = getPortalContainer()
    const img = document.getElementById('card-hover-preview-img') as HTMLImageElement | null
    const infoBar = document.getElementById('card-hover-preview-info') as HTMLDivElement | null
    
    if (visible && scryfallId) {
      const a = scryfallId.charAt(0)
      const b = scryfallId.charAt(1)
      const url = `https://cards.scryfall.io/large/front/${a}/${b}/${scryfallId}.jpg`
      
      // Calculate position
      const { left, top } = calculatePosition(cursorX, cursorY, window.innerWidth, window.innerHeight)
      container.style.transform = `translate3d(${left}px, ${top}px, 0)`
      
      // If switching to a different card, hide until new image loads
      if (currentCardName !== cardName) {
        container.style.opacity = '0'
        currentCardName = cardName
      }
      
      if (img && img.src !== url) {
        img.src = url
        img.alt = cardName
      } else {
        container.style.opacity = '1'
      }
      
      // Update info bar with ownership data
      if (infoBar) {
        const data = cardOwnershipData.get(cardName.toLowerCase())
        if (data) {
          const color = OWNERSHIP_COLORS[data.status]
          infoBar.style.display = 'flex'
          infoBar.style.borderLeft = `3px solid ${color}`
          infoBar.style.color = color
          
          if (data.status === 'owned' && data.quantity !== undefined) {
            const availText = data.available === data.quantity 
              ? `${data.quantity} owned (all available)`
              : `${data.quantity} owned, ${data.available} available`
            const priceText = data.priceUsd != null ? ` · ${formatPrice(data.priceUsd)}` : ''
            infoBar.textContent = availText + priceText
          } else if (data.status === 'proxy') {
            const priceText = data.priceUsd != null ? ` · ${formatPrice(data.priceUsd)}` : ''
            infoBar.textContent = 'Proxy only' + priceText
          } else if (data.status === 'unowned') {
            const priceText = data.priceUsd != null 
              ? formatPrice(data.priceUsd)
              : 'Price unknown'
            infoBar.textContent = priceText
          } else {
            infoBar.style.display = 'none'
          }
        } else {
          // No ownership data available — hide the info bar
          infoBar.style.display = 'none'
        }
      }
      
      hasInitRef.current = true
    } else if (hasInitRef.current) {
      container.style.opacity = '0'
      currentCardName = null
    }
  }, [visible, scryfallId, cardName, cursorX, cursorY])
  
  // This component doesn't render anything — the portal is managed imperatively
  return null
}

// Legacy exports for type compatibility
export interface CardHoverPreviewRenderProps {
  visible: boolean
  scryfallId: string | null
  cardName: string
  cursorX: number
  cursorY: number
}

// ---------------------------------------------------------------------------
// Image Preloading — for instant hover previews
// ---------------------------------------------------------------------------

/** Track which card images have been preloaded */
const preloadedImages = new Set<string>()
const pendingPreloads = new Set<string>()

/**
 * Preload a card image by scryfall ID.
 * Uses the browser's Image API to cache the image in memory.
 */
function preloadImageByScryfallId(scryfallId: string): void {
  if (preloadedImages.has(scryfallId) || pendingPreloads.has(scryfallId)) {
    return
  }
  
  pendingPreloads.add(scryfallId)
  
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  const url = `https://cards.scryfall.io/large/front/${a}/${b}/${scryfallId}.jpg`
  
  const img = new Image()
  img.onload = () => {
    preloadedImages.add(scryfallId)
    pendingPreloads.delete(scryfallId)
  }
  img.onerror = () => {
    pendingPreloads.delete(scryfallId)
  }
  img.src = url
}

/**
 * Preload card images for a list of card names.
 * Fetches scryfall IDs if not cached, then preloads the images.
 * 
 * @param cardNames - Array of card names to preload
 * @param options - Configuration options
 * @param options.maxConcurrent - Max concurrent preloads (default: 5)
 * @param options.delayBetween - Delay between batches in ms (default: 100)
 */
export async function preloadCardImages(
  cardNames: string[],
  options: { maxConcurrent?: number; delayBetween?: number } = {}
): Promise<void> {
  const { maxConcurrent = 5, delayBetween = 100 } = options
  
  // Filter out cards we've already preloaded or are pending
  const toPreload = cardNames.filter(name => {
    const cachedId = scryfallIdCache.get(name)
    if (cachedId && (preloadedImages.has(cachedId) || pendingPreloads.has(cachedId))) {
      return false
    }
    return true
  })
  
  if (toPreload.length === 0) return
  
  // Process in batches to avoid overwhelming the browser
  for (let i = 0; i < toPreload.length; i += maxConcurrent) {
    const batch = toPreload.slice(i, i + maxConcurrent)
    
    await Promise.all(
      batch.map(async (cardName) => {
        try {
          const scryfallId = await getScryfallId(cardName)
          if (scryfallId) {
            preloadImageByScryfallId(scryfallId)
          }
        } catch {
          // Ignore errors during preload — non-critical
        }
      })
    )
    
    // Small delay between batches to be nice to the network
    if (i + maxConcurrent < toPreload.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetween))
    }
  }
}

/**
 * Hook to preload card images when card names change.
 * Designed to be called in chat components with the list of card names
 * extracted from messages.
 * 
 * @param cardNames - Set or array of card names to preload
 */
export function usePreloadCardImages(cardNames: Set<string> | string[]): void {
  const namesArray = Array.isArray(cardNames) ? cardNames : Array.from(cardNames)
  
  useEffect(() => {
    if (namesArray.length === 0) return
    
    // Delay preloading slightly to prioritize UI rendering
    const timeoutId = setTimeout(() => {
      preloadCardImages(namesArray)
    }, 200)
    
    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesArray.join(',')])
}
