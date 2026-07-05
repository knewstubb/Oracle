'use client'

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ChatMessage } from '@/lib/debrief-types'

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

export interface ChatPanelProps {
  messages: ChatMessage[]
  onSend: (text: string) => void
  inputRef: React.RefObject<HTMLInputElement>
  /** Optional ref to expose imperative control (prefill, focus) to the parent */
  handleRef?: React.Ref<ChatPanelHandle>
  isStreaming?: boolean
  /** Active tool calls to display as status indicators */
  activeTools?: ToolStatus[]
  /** Called when a [[Card Name]] link is clicked in chat (adds card to canvas) */
  onCardClick?: (cardName: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_WIDTH = 220
const MAX_WIDTH = 500

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
    'decision_extraction': 'decisions',
  }
  return map[name] || name.replace(/_/g, ' ')
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel({ messages, onSend, inputRef, handleRef, isStreaming, activeTools, onCardClick }: ChatPanelProps) {
  const [width, setWidth] = useState(MIN_WIDTH)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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
          .filter(msg => !msg.content.startsWith('[SYSTEM CONTEXT'))
          .map((msg) => (
          <MessageBubble key={msg.id} message={msg} onCardClick={onCardClick} />
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
            className="flex-1 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5 text-xs text-[#d4d4d0] placeholder:text-[rgba(255,255,255,0.2)] focus:border-[rgba(55,138,221,0.4)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !inputValue.trim()}
            className="flex items-center justify-center rounded-sm bg-[rgba(55,138,221,0.15)] px-1.5 py-1.5 text-xs text-[#378ADD] transition-colors hover:bg-[rgba(55,138,221,0.25)] disabled:opacity-30 disabled:cursor-not-allowed"
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
// Card Hover Link — shows Scryfall card image on hover
// ---------------------------------------------------------------------------

function CardHoverLink({ cardName, onCardClick }: { cardName: string; onCardClick?: (name: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const scryfallUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=large`

  const imgWidth = 220
  const imgHeight = 392
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800

  // Vertical: prefer below cursor, flip above if it won't fit
  const fitsBelow = pos.y + 16 + imgHeight < viewportHeight
  const top = fitsBelow ? pos.y + 16 : pos.y - imgHeight - 16

  // Horizontal: prefer right of cursor, flip left if it would overflow viewport
  const fitsRight = pos.x + 16 + imgWidth < viewportWidth
  const left = fitsRight ? pos.x + 16 : pos.x - imgWidth - 16

  return (
    <span
      className={`text-[#378ADD] inline ${onCardClick ? 'cursor-pointer hover:underline hover:bg-[rgba(55,138,221,0.1)] rounded px-0.5 -mx-0.5 transition-colors' : 'cursor-pointer hover:underline'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onClick={onCardClick ? () => onCardClick(cardName) : undefined}
    >
      {cardName}
      {onCardClick && <span className="text-[10px] text-[rgba(55,138,221,0.6)] ml-0.5">+</span>}
      {hovered && (
        <img
          src={scryfallUrl}
          alt={cardName}
          className="fixed z-[9999] w-[220px] rounded-lg shadow-2xl border border-[rgba(255,255,255,0.15)] pointer-events-none"
          style={{ top, left }}
          loading="lazy"
        />
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Inline content rendering — [[Card Name]] → hover link, **bold** → bold
// ---------------------------------------------------------------------------

function renderInlineContent(text: string, onCardClick?: (name: string) => void): React.ReactNode {
  // Split on [[Card Name]] patterns first (highest priority), then bold
  const parts = text.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*)/g)

  return parts.map((part, i) => {
    // Card link: [[Card Name]] — always render as hoverable regardless of context
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const cardName = part.slice(2, -2)
      return <CardHoverLink key={i} cardName={cardName} onCardClick={onCardClick} />
    }
    // Bold: **text** — may contain [[card]] inside, so recursively parse
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2)
      // Check if the bold text contains card links
      if (inner.includes('[[')) {
        return <strong key={i} className="font-semibold">{renderInlineContent(inner, onCardClick)}</strong>
      }
      return <strong key={i} className="font-semibold">{inner}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

function renderMessageContent(content: string, onCardClick?: (name: string) => void): React.ReactNode {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*[-•]\s+/.test(line)) {
      const bulletText = line.replace(/^\s*[-•]\s+/, '')
      elements.push(
        <div key={i} className="flex gap-1.5 pl-0.5">
          <span className="text-muted-foreground shrink-0">•</span>
          <span>{renderInlineContent(bulletText, onCardClick)}</span>
        </div>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />)
    } else {
      elements.push(<div key={i}>{renderInlineContent(line, onCardClick)}</div>)
    }
  }

  return <>{elements}</>
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function MessageBubble({ message, onCardClick }: { message: ChatMessage; onCardClick?: (name: string) => void }) {
  if (message.role === 'user') {
    return (
      <div className="text-xs bg-[rgba(55,138,221,0.08)] text-right py-1.5 px-2.5 rounded-md text-[#d4d4d0] leading-relaxed">
        {renderMessageContent(message.content)}
      </div>
    )
  }

  // assistant / system → oracle style (card links are clickable)
  return (
    <div className="text-xs bg-[rgba(255,255,255,0.03)] border-l-2 border-[#378ADD] pl-2.5 py-1.5 pr-2 rounded-r-md text-[#d4d4d0] leading-relaxed">
      {renderMessageContent(message.content, onCardClick)}
      {message.cost !== undefined && message.cost > 0 && (
        <div className="text-[10px] text-muted-foreground/50 mt-1">
          {message.cost < 0.01 ? `$${message.cost.toFixed(4)}` : `$${message.cost.toFixed(2)}`}
        </div>
      )}
    </div>
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
