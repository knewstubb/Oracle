'use client'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import type { ChatMessage } from '@/lib/debrief-types'
import type { CommanderOption } from '@/lib/brew-v2-types'
import { renderMessageContent, type CardLinkMode, type OwnershipStatus, type OwnershipLookupFn } from '@/lib/render-card-links'
import { CommanderDetailModal } from './CommanderDetailModal'
import { cardOwnershipData } from '@/components/CardHoverPreview'
import { autoBracketCardsSync } from '@/lib/auto-bracket-cards'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface BrewChatViewProps {
  messages: ChatMessage[]
  onSend: (text: string) => void
  isStreaming?: boolean
  activeTools?: ToolStatus[]
  /** Deck name for the topbar (updates as conversation progresses) */
  deckName?: string
  /** Whether a commander has been committed (determines button mode) */
  hasCommander?: boolean
  /** Callback to commit a commander (crown button) */
  onCommitCommander?: (commander: CommanderOption) => void
  /** Callback to add a card to the deck (plus button) */
  onAddCard?: (cardName: string) => void
}

// ---------------------------------------------------------------------------
// Suggestion chips for quick starts
// ---------------------------------------------------------------------------

const SUGGESTION_CHIPS = [
  { label: 'Gruul stompy', prompt: 'I want to build a Gruul deck that smashes face with big creatures' },
  { label: 'Artifact combo', prompt: 'Help me build an artifact-focused deck with powerful synergies' },
  { label: 'Graveyard value', prompt: 'I want a deck that gets value from the graveyard' },
  { label: 'Political control', prompt: 'Build me a political deck that controls the game through deals' },
  { label: 'Token swarm', prompt: 'I want to go wide with tokens and overwhelm opponents' },
  { label: 'Spellslinger', prompt: 'Help me build a spellslinger deck focused on instants and sorceries' },
]

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
// BrewChatView — Full-width centered chat experience
// ---------------------------------------------------------------------------

export function BrewChatView({ messages, onSend, isStreaming, activeTools, deckName, hasCommander, onCommitCommander, onAddCard }: BrewChatViewProps) {
  const [inputValue, setInputValue] = useState('')
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [ownershipCache, setOwnershipCache] = useState<Map<string, OwnershipStatus>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingLookups = useRef<Set<string>>(new Set())

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

  // Fetch ownership data for cards not yet in cache
  useEffect(() => {
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
        console.error('[BrewChatView] Ownership fetch error:', err)
      } finally {
        // Clear pending status
        cardsToFetch.forEach(name => pendingLookups.current.delete(name))
      }
    }
    
    fetchOwnership()
  }, [cardNamesInChat, ownershipCache])

  // Ownership lookup function to pass to renderMessageContent
  const ownershipLookup: OwnershipLookupFn = useCallback((cardName: string) => {
    return ownershipCache.get(cardName) ?? 'unknown'
  }, [ownershipCache])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // Auto-focus input on mount
  useEffect(() => {
    if (messages.length === 0) {
      textareaRef.current?.focus()
    } else {
      inputRef.current?.focus()
    }
  }, [messages.length])

  // Auto-resize textarea
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }, [])

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || isStreaming) return
    onSend(text)
    setInputValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [inputValue, isStreaming, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleSuggestionClick = useCallback((prompt: string) => {
    onSend(prompt)
  }, [onSend])

  // Determine card link mode based on phase
  const cardLinkMode: CardLinkMode = hasCommander ? 'add' : 'crown'
  
  // Handle card action (crown = select commander, plus = add to deck)
  const handleCardAction = useCallback((cardName: string) => {
    if (hasCommander) {
      // In building phase: add card to deck
      onAddCard?.(cardName)
    } else {
      // In exploring phase: select as commander
      onCommitCommander?.({
        name: cardName,
        colourIdentity: [], // Will be resolved from DB
        artUrl: '',
        scryfallId: cardName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        owned: false, // Will be resolved from collection
      })
    }
  }, [hasCommander, onCommitCommander, onAddCard])

  // Handle card name click — opens detail modal
  const handleCardNameClick = useCallback((cardName: string) => {
    setSelectedCard(cardName)
  }, [])

  // Handle selecting commander from modal
  const handleSelectCommanderFromModal = useCallback((cardName: string) => {
    onCommitCommander?.({
      name: cardName,
      colourIdentity: [], // Will be resolved from DB
      artUrl: '',
      scryfallId: cardName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      owned: false, // Will be resolved from collection
    })
  }, [onCommitCommander])

  const runningTools = activeTools?.filter(t => t.status === 'running') ?? []
  const isEmpty = messages.length === 0

  // Empty state — centered hero with input (Gemini-style)
  if (isEmpty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#0a0a0a]">
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {/* Hero section */}
          <div className="mb-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 blur-xl" />
                <ForgeIcon className="relative h-16 w-16 text-emerald-400" />
              </div>
            </div>
            <h1 className="mb-2 text-2xl font-medium text-white">The Forge</h1>
            <p className="text-[15px] text-zinc-400">
              Describe your dream deck — a commander, playstyle, or just a vibe.
            </p>
          </div>

          {/* Centered input */}
          <div className="w-full max-w-[600px]">
            <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/50 shadow-lg shadow-black/20 transition-all focus-within:border-emerald-500/50 focus-within:shadow-emerald-500/5">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                placeholder="I want a Gruul commander that..."
                rows={1}
                className="w-full resize-none bg-transparent px-5 py-4 text-[15px] text-white placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
                style={{ minHeight: '56px', maxHeight: '200px' }}
              />
              <div className="flex items-center justify-between border-t border-zinc-800/50 px-4 py-2">
                <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                  <span>to send</span>
                </div>
                <button
                  onClick={handleSend}
                  disabled={isStreaming || !inputValue.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-black transition-all hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <ArrowUpIcon />
                </button>
              </div>
            </div>

            {/* Suggestion chips */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => handleSuggestionClick(chip.prompt)}
                  disabled={isStreaming}
                  className="rounded-full border border-zinc-800 bg-zinc-900/30 px-4 py-2 text-[13px] text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800/50 hover:text-zinc-300 disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none pb-6 text-center text-[12px] text-zinc-600">
          Oracle uses AI and may make mistakes. Verify card legality before playing.
        </div>

        <CommanderDetailModal
          cardName={selectedCard}
          onClose={() => setSelectedCard(null)}
          onSelectCommander={handleSelectCommanderFromModal}
          hideSelectButton={hasCommander}
        />
      </div>
    )
  }

  // Conversation view — messages with input at bottom
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0a0a0a]">
      {/* Messages area — centered column, scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[700px] px-6 py-8">
          <div className="space-y-6">
            {messages
              .filter(msg => msg.role !== 'system' && !msg.content.startsWith('[SYSTEM CONTEXT'))
              .map((msg) => (
                <MessageBubble 
                  key={msg.id} 
                  message={msg} 
                  cardLinkMode={cardLinkMode}
                  onCardAction={handleCardAction}
                  onCardNameClick={handleCardNameClick}
                  ownershipLookup={ownershipLookup}
                />
              ))}
            {isStreaming && runningTools.length > 0 && (
              <ToolStatusIndicator tools={runningTools} />
            )}
            {isStreaming && runningTools.length === 0 && (
              <ThinkingIndicator />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input area — fixed at bottom */}
      <div className="flex-none border-t border-zinc-800/50 bg-[#0a0a0a] px-6 py-4">
        <div className="mx-auto max-w-[700px]">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition-all focus-within:border-emerald-500/50">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Ask about commanders, cards, or strategies..."
              className="flex-1 bg-transparent text-[14px] text-white placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !inputValue.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-black transition-all hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <ArrowUpIcon />
            </button>
          </div>
        </div>
      </div>

      <CommanderDetailModal
        cardName={selectedCard}
        onClose={() => setSelectedCard(null)}
        onSelectCommander={handleSelectCommanderFromModal}
        hideSelectButton={hasCommander}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble — renders user/assistant messages
// ---------------------------------------------------------------------------

function MessageBubble({ 
  message, 
  cardLinkMode, 
  onCardAction,
  onCardNameClick,
  ownershipLookup,
}: { 
  message: ChatMessage
  cardLinkMode: CardLinkMode
  onCardAction?: (cardName: string) => void
  onCardNameClick?: (cardName: string) => void
  ownershipLookup?: OwnershipLookupFn
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-zinc-800/60 px-5 py-3 text-[14px] text-zinc-100 leading-relaxed">
          {message.content}
        </div>
      </div>
    )
  }

  // Auto-bracket card names the AI forgot to wrap
  const processedContent = autoBracketCardsSync(message.content)
  
  return (
    <div className="text-[14px] text-zinc-300 leading-relaxed">
      {renderMessageContent(processedContent, cardLinkMode, onCardAction, onCardNameClick, ownershipLookup)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status Indicators
// ---------------------------------------------------------------------------

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 text-[13px] text-zinc-500">
      <div className="flex gap-1">
        <span className="size-2 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '0ms' }} />
        <span className="size-2 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '150ms' }} />
        <span className="size-2 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '300ms' }} />
      </div>
      <span>Thinking...</span>
    </div>
  )
}

function ToolStatusIndicator({ tools }: { tools: ToolStatus[] }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-zinc-500">
      <div className="flex gap-1">
        <span className="size-2 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '0ms' }} />
        <span className="size-2 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '150ms' }} />
        <span className="size-2 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '300ms' }} />
      </div>
      <span>
        {tools.length === 1
          ? `Searching ${formatToolName(tools[0].name)}...`
          : `Searching ${tools.map(t => formatToolName(t.name)).join(', ')}...`
        }
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ForgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14h16" />
      <path d="M6 14v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" />
      <path d="M8 14V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6" />
      <path d="M12 2v4" />
      <path d="M10 4h4" />
      <circle cx="5" cy="10" r="1" fill="currentColor" />
      <circle cx="19" cy="10" r="1" fill="currentColor" />
    </svg>
  )
}

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13V3M8 3L4 7M8 3L12 7" />
    </svg>
  )
}
