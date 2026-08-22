'use client'

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ChatMessage, CommanderSummaryContext } from '@/lib/debrief-types'
import { renderMessageContent, type CardLinkMode, type OwnershipStatus, type OwnershipLookupFn } from '@/lib/render-card-links'
import { autoBracketCardsSync } from '@/lib/auto-bracket-cards'
import { cardOwnershipData } from '@/components/CardHoverPreview'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Imperative handle for controlling ChatPanel input from the parent */
export interface ChatPanelHandle {
  /** Set the input value and focus the input field */
  prefill: (text: string) => void
  /** Focus the input field */
  focus: () => void
}

export interface ToolStatus {
  name: string
  status: 'running' | 'complete' | 'error'
}

/** Ownership data for a card from the collection API */
interface OwnershipData {
  cardName: string
  status: OwnershipStatus
  quantity?: number
  available?: number
  priceUsd?: number | null
}

export interface ChatPanelProps {
  messages: ChatMessage[]
  onSend: (text: string) => void
  inputRef: React.RefObject<HTMLInputElement>
  /** Optional ref to expose imperative control (prefill, focus) to the parent */
  handleRef?: React.Ref<ChatPanelHandle>
  isStreaming?: boolean
  /** Active tool calls to display as status indicators */
  activeTools?: ToolStatus[]
  /** Mode for card link buttons: 'crown' to select commander, 'add' to add to deck */
  cardLinkMode?: CardLinkMode
  /** Called when a card action button is clicked (crown or plus) */
  onCardAction?: (cardName: string) => void
  /** Called when a card name is clicked (opens detail modal) */
  onCardNameClick?: (cardName: string) => void
  /** @deprecated Use cardLinkMode='add' and onCardAction instead */
  onCardClick?: (cardName: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_WIDTH = 220
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 560

// ---------------------------------------------------------------------------
// Tool name formatting
// ---------------------------------------------------------------------------

function formatToolName(name: string): string {
  const map: Record<string, string> = {
    'collection_lookup': 'your collection',
    'deck_context': 'deck state',
    'scryfall_search': 'card data',
    'mtg_commander_recommend': 'EDHREC data',
    'mtg_combos_search': 'combos',
    'mtg_commander_deck': 'commander legality',
    'mtg_commander_brackets': 'bracket data',
    'mtg_ruling_search': 'card rulings',
    'mtg_rules_search': 'rules',
    'mtg_cardtypes_get': 'card types',
    'mtg_top_commanders': 'popular commanders',
    'decision_extraction': 'decisions',
  }
  return map[name] || name.replace(/_/g, ' ')
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel({ messages, onSend, inputRef, handleRef, isStreaming, activeTools, cardLinkMode, onCardAction, onCardNameClick, onCardClick }: ChatPanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [inputValue, setInputValue] = useState('')
  const [ownershipCache, setOwnershipCache] = useState<Map<string, OwnershipStatus>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pendingLookups = useRef<Set<string>>(new Set())

  // Resolve mode and action (support legacy onCardClick prop)
  const resolvedMode: CardLinkMode = cardLinkMode ?? (onCardClick ? 'add' : 'none')
  const resolvedOnAction = onCardAction ?? onCardClick

  // Extract all card names from messages for ownership lookup
  const cardNamesInChat = useMemo(() => {
    const names = new Set<string>()
    const cardPattern = /\[\[([^\]]+)\]\]/g
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        let match
        while ((match = cardPattern.exec(msg.content)) !== null) {
          names.add(match[1])
        }
      }
    }
    return names
  }, [messages])

  // Fetch ownership data for cards not yet in cache (only when mode is 'add')
  useEffect(() => {
    if (resolvedMode !== 'add') return
    
    const cardsToFetch = Array.from(cardNamesInChat).filter(
      name => !ownershipCache.has(name) && !pendingLookups.current.has(name)
    )
    
    if (cardsToFetch.length === 0) return
    
    // Mark as pending
    cardsToFetch.forEach(name => pendingLookups.current.add(name))
    
    // Batch fetch ownership data (with details for hover preview)
    const fetchOwnership = async () => {
      try {
        const response = await fetch('/api/collection/ownership-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardNames: cardsToFetch, includeDetails: true }),
        })
        
        if (response.ok) {
          const data = await response.json() as { results: OwnershipData[] }
          setOwnershipCache(prev => {
            const next = new Map(prev)
            for (const item of data.results) {
              next.set(item.cardName, item.status)
              // Also populate global store for hover preview
              cardOwnershipData.set(item.cardName.toLowerCase(), {
                status: item.status,
                quantity: item.quantity,
                available: item.available,
                priceUsd: item.priceUsd,
              })
            }
            return next
          })
        }
      } catch (err) {
        console.error('[ChatPanel] Ownership fetch error:', err)
      } finally {
        // Clear pending status
        cardsToFetch.forEach(name => pendingLookups.current.delete(name))
      }
    }
    
    fetchOwnership()
  }, [cardNamesInChat, ownershipCache, resolvedMode])

  // Ownership lookup function to pass to renderMessageContent
  const ownershipLookup: OwnershipLookupFn = useCallback((cardName: string) => {
    return ownershipCache.get(cardName) ?? 'unknown'
  }, [ownershipCache])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // -------------------------------------------------------------------------
  // Imperative handle — allows parent to pre-fill input (e.g., "Discuss" action)
  // -------------------------------------------------------------------------

  useImperativeHandle(handleRef, () => ({
    prefill: (text: string) => {
      setInputValue(text)
      setTimeout(() => {
        ;(inputRef as React.RefObject<HTMLInputElement>).current?.focus()
      }, 0)
    },
    focus: () => {
      ;(inputRef as React.RefObject<HTMLInputElement>).current?.focus()
    },
  }))

  // -------------------------------------------------------------------------
  // Resize handle logic (pointer-based)
  // -------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = width

      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)

      const handlePointerMove = (ev: PointerEvent) => {
        const delta = startX - ev.clientX
        const maxAllowed = Math.min(MAX_WIDTH, window.innerWidth * 0.5)
        const newWidth = Math.max(MIN_WIDTH, Math.min(maxAllowed, startWidth + delta))
        setWidth(newWidth)
      }

      const handlePointerUp = () => {
        target.removeEventListener('pointermove', handlePointerMove)
        target.removeEventListener('pointerup', handlePointerUp)
      }

      target.addEventListener('pointermove', handlePointerMove)
      target.addEventListener('pointerup', handlePointerUp)
    },
    [width]
  )

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || isStreaming) return
    onSend(text)
    setInputValue('')
  }, [inputValue, isStreaming, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  // -------------------------------------------------------------------------
  // Active tool status
  // -------------------------------------------------------------------------

  const runningTools = activeTools?.filter(t => t.status === 'running') ?? []

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={panelRef}
      className="relative flex h-full flex-col border-l border-[rgba(255,255,255,0.06)] bg-[#141414]"
      style={{ width, minWidth: MIN_WIDTH }}
    >
      {/* Resize handle — thin strip on left edge */}
      <div
        onPointerDown={handlePointerDown}
        className="absolute left-0 top-0 z-10 h-full w-[4px] cursor-col-resize select-none hover:bg-[rgba(55,138,221,0.3)] transition-colors"
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages
          .filter(msg => msg.role !== 'system' && !msg.content.startsWith('[SYSTEM CONTEXT'))
          .map((msg) => (
          <MessageBubble key={msg.id} message={msg} cardLinkMode={resolvedMode} onCardAction={resolvedOnAction} onCardNameClick={onCardNameClick} ownershipLookup={resolvedMode === 'add' ? ownershipLookup : undefined} />
        ))}
        {/* Tool status indicator */}
        {isStreaming && runningTools.length > 0 && (
          <ToolStatusIndicator tools={runningTools} />
        )}
        {/* Thinking indicator */}
        {isStreaming && runningTools.length === 0 && (
          <ThinkingIndicator />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-[rgba(255,255,255,0.06)] px-2 py-1.5">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={isStreaming ? 'Oracle is thinking…' : 'Message…'}
            className="flex-1 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5 text-[length:var(--fs-sm)] text-[#d4d4d0] placeholder:text-[rgba(255,255,255,0.2)] focus:border-[rgba(55,138,221,0.4)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !inputValue.trim()}
            className="flex items-center justify-center rounded-sm bg-[rgba(55,138,221,0.15)] px-1.5 py-1.5 text-[length:var(--fs-sm)] text-[#378ADD] transition-colors hover:bg-[rgba(55,138,221,0.25)] disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <ArrowUpIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function MessageBubble({ message, cardLinkMode, onCardAction, onCardNameClick, ownershipLookup }: { message: ChatMessage; cardLinkMode: CardLinkMode; onCardAction?: (name: string) => void; onCardNameClick?: (name: string) => void; ownershipLookup?: OwnershipLookupFn }) {
  // Render commander summary card if present
  if (message.commanderSummary) {
    return <CommanderSummaryCard summary={message.commanderSummary} />
  }

  if (message.role === 'user') {
    return (
      <div className="text-[length:var(--fs-sm)] bg-[rgba(55,138,221,0.08)] text-right py-1.5 px-2.5 rounded-md text-[#d4d4d0] leading-relaxed">
        {renderMessageContent(message.content)}
      </div>
    )
  }

  // assistant / system → oracle style (card links have crown/plus buttons)
  // Apply auto-bracketing to ensure card names are properly wrapped
  const processedContent = autoBracketCardsSync(message.content)
  
  return (
    <div className="text-[length:var(--fs-sm)] bg-[rgba(255,255,255,0.03)] border-l-2 border-[#378ADD] pl-2.5 py-1.5 pr-2 rounded-r-md text-[#d4d4d0] leading-relaxed">
      {renderMessageContent(processedContent, cardLinkMode, onCardAction, onCardNameClick, ownershipLookup)}
      {message.cost !== undefined && message.cost > 0 && (
        <div className="text-[length:var(--fs-xs)] text-muted-foreground/50 mt-1">
          {message.cost < 0.01 ? `$${message.cost.toFixed(4)}` : `$${message.cost.toFixed(2)}`}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CommanderSummaryCard — structured commander presentation
// ---------------------------------------------------------------------------

function CommanderSummaryCard({ summary }: { summary: CommanderSummaryContext }) {
  const { collection_status } = summary

  // Always use Scryfall URL for consistent image loading
  const imageUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(summary.name)}&format=image&version=normal`

  // Color identity to background gradient
  const colorMap: Record<string, string> = {
    W: '#f9fafb',
    U: '#3b82f6',
    B: '#1f2937',
    R: '#ef4444',
    G: '#22c55e',
  }
  const borderColor = summary.color_identity.length === 1
    ? colorMap[summary.color_identity[0]] ?? '#6b7280'
    : summary.color_identity.length > 1
      ? '#d4af37' // Gold for multicolor
      : '#6b7280' // Gray for colorless

  return (
    <div
      className="rounded-lg border overflow-hidden bg-[rgba(255,255,255,0.02)]"
      style={{ borderColor: `${borderColor}40`, borderWidth: 2 }}
    >
      {/* Card layout: image left, details right */}
      <div className="flex gap-3 p-2">
        {/* Card image — always shown */}
        <div className="shrink-0">
          <img
            src={imageUrl}
            alt={summary.name}
            className="w-[100px] rounded-md shadow-md"
            loading="lazy"
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Name + Mana cost */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[length:var(--fs-md)] font-semibold text-[#d4d4d0] leading-tight">
              {summary.name}
            </h3>
            {summary.mana_cost && (
              <span
                className="shrink-0 text-[length:var(--fs-sm)]"
                dangerouslySetInnerHTML={{ __html: formatManaCost(summary.mana_cost) }}
              />
            )}
          </div>

          {/* Tagline */}
          <p className="text-[length:var(--fs-sm)] text-[rgba(255,255,255,0.5)] italic leading-snug">
            {summary.tagline}
          </p>

          {/* Type line */}
          <p className="text-[length:var(--fs-xs)] text-[rgba(255,255,255,0.4)]">
            {summary.type_line}
          </p>

          {/* Collection status badge */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {collection_status.owned ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(34,197,94,0.15)] text-[#22c55e]">
                <CheckIcon />
                Owned ({collection_status.quantity})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.4)]">
                Not in collection
              </span>
            )}

            {/* In decks */}
            {collection_status.in_decks.length > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(55,138,221,0.15)] text-[#378ADD]">
                In {collection_status.in_decks.length} deck{collection_status.in_decks.length > 1 ? 's' : ''}
              </span>
            )}

            {/* Proxy conflicts */}
            {collection_status.proxy_conflicts.length > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(251,191,36,0.15)] text-[#fbbf24]">
                Proxy in {collection_status.proxy_conflicts.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Analysis section */}
      <div className="px-3 py-2 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.01)]">
        <p className="text-[length:var(--fs-sm)] text-[#d4d4d0] leading-relaxed">
          {summary.analysis}
        </p>
      </div>
    </div>
  )
}

/** Format mana cost string to mana-font pips */
function formatManaCost(manaCost: string): string {
  // Convert {W} to mana-font icons
  return manaCost.replace(/\{([^}]+)\}/g, (_match, symbol) => {
    const normalized = symbol.toLowerCase().replace('/', '')
    return `<i class="ms ms-${normalized} ms-cost"></i>`
  })
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Thinking Indicator
// ---------------------------------------------------------------------------

function ThinkingIndicator() {
  return (
    <div className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border-l-2 border-[rgba(55,138,221,0.4)]">
      <div className="flex gap-1">
        <span className="size-1.5 rounded-full animate-pulse bg-[#378ADD]" style={{ animationDelay: '0ms' }} />
        <span className="size-1.5 rounded-full animate-pulse bg-[#378ADD]" style={{ animationDelay: '150ms' }} />
        <span className="size-1.5 rounded-full animate-pulse bg-[#378ADD]" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-[11px] text-muted-foreground">Thinking…</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tool Status Indicator
// ---------------------------------------------------------------------------

function ToolStatusIndicator({ tools }: { tools: ToolStatus[] }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border-l-2 border-[rgba(55,138,221,0.4)]">
      <div className="flex gap-1">
        <span className="size-1.5 rounded-full animate-pulse bg-[#378ADD]" style={{ animationDelay: '0ms' }} />
        <span className="size-1.5 rounded-full animate-pulse bg-[#378ADD]" style={{ animationDelay: '150ms' }} />
        <span className="size-1.5 rounded-full animate-pulse bg-[#378ADD]" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-[11px] text-muted-foreground">
        {tools.length === 1
          ? `Looking up ${formatToolName(tools[0].name)}…`
          : `Looking up ${tools.map(t => formatToolName(t.name)).join(', ')}…`
        }
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ArrowUpIcon (minimal send icon)
// ---------------------------------------------------------------------------

function ArrowUpIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6 10V2M6 2L3 5M6 2L9 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
