'use client'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { X, MessageSquarePlus, MessageSquare, Library, LayoutGrid, Sparkles, Wrench, Layers, History, Compass, ArrowRight, Crown } from 'lucide-react'
import { useOracle, type OracleContext, type NavigatePrompt } from '@/contexts/OracleContext'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { renderMessageContent, type CardLinkMode, type OwnershipStatus, type OwnershipLookupFn } from '@/lib/render-card-links'
import { cardOwnershipData, usePreloadCardImages } from '@/components/CardHoverPreview'
import { CommanderSuggestionRow, parseCommanderSuggestions, stripCommanderSuggestions } from '@/components/CommanderSuggestionCard'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { SessionHistoryPanel } from '@/components/SessionHistoryPanel'
import { autoBracketCardsSync } from '@/lib/auto-bracket-cards'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_WIDTH = 320
const MAX_WIDTH = 600

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OwnershipData {
  cardName: string
  status: OwnershipStatus
  quantity?: number
  available?: number
  priceUsd?: number | null
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ArrowUpIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Context display helpers
// ---------------------------------------------------------------------------

function getContextIcon(type: OracleContext['type']) {
  switch (type) {
    case 'collection': return <Library className="w-3.5 h-3.5" />
    case 'deck': return <Layers className="w-3.5 h-3.5" />
    case 'deck-list': return <LayoutGrid className="w-3.5 h-3.5" />
    case 'forge': return <Sparkles className="w-3.5 h-3.5" />
    case 'workbench': return <Wrench className="w-3.5 h-3.5" />
    case 'exploration': return <Compass className="w-3.5 h-3.5" />
    default: return <MessageSquare className="w-3.5 h-3.5" />
  }
}

function getContextLabel(context: OracleContext): string {
  switch (context.type) {
    case 'collection': return 'Collection'
    case 'deck': return context.deckName ?? 'Deck'
    case 'deck-list': return 'Exploring'  // deck-list is the start of exploration flow
    case 'forge': return 'Exploring'
    case 'workbench': return context.deckName ?? 'Workbench'
    case 'exploration': return 'Exploring'
    case 'commander-selection': return 'Exploring'
    default: return 'General'
  }
}

function getContextSubtitle(context: OracleContext): string | null {
  if (context.type === 'deck' || context.type === 'workbench') {
    return context.commanderName ?? null
  }
  return null
}

function getPlaceholderText(context: OracleContext, isStreaming: boolean): string {
  if (isStreaming) return 'Oracle is thinking...'
  
  switch (context.type) {
    case 'collection':
      return 'Ask about your collection...'
    case 'deck':
    case 'workbench':
      return 'Ask about this deck...'
    case 'deck-list':
      return 'Ask about your decks...'
    case 'forge':
    case 'exploration':
      return 'What do you want to build?'
    default:
      return 'Ask Oracle anything...'
  }
}

// ---------------------------------------------------------------------------
// OracleSidebar
// ---------------------------------------------------------------------------

export function OracleSidebar() {
  const {
    isOpen,
    width,
    messages,
    activeContext,
    activeSession,
    isStreaming,
    isLoadingHistory,
    isHistoryPanelOpen,
    close,
    setWidth,
    sendMessage,
    clearMessages,
    openHistoryPanel,
  } = useOracle()

  const router = useRouter()
  const queryClient = useQueryClient()
  const [inputValue, setInputValue] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [ownershipCache, setOwnershipCache] = useState<Map<string, OwnershipStatus>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pendingLookups = useRef<Set<string>>(new Set())

  // ---------------------------------------------------------------------------
  // Fetch legal commander names for quick build button validation
  // ---------------------------------------------------------------------------
  
  const { data: commanderNamesData } = useQuery({
    queryKey: ['commander-names'],
    queryFn: async () => {
      const res = await fetch('/api/commanders/names')
      if (!res.ok) return { names: [] }
      return res.json() as Promise<{ names: string[] }>
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })
  
  const commanderNamesSet = useMemo(() => {
    if (!commanderNamesData?.names) return new Set<string>()
    return new Set(commanderNamesData.names.map(n => n.toLowerCase()))
  }, [commanderNamesData])

  // ---------------------------------------------------------------------------
  // Navigation handler for deck-building prompts
  // ---------------------------------------------------------------------------
  
  const handleNavigate = useCallback((url: string) => {
    // Don't close the sidebar when navigating to commander selection
    // This preserves the chat context during the exploration flow
    const isCommanderSelectionNav = url.startsWith('/decks/new')
    if (!isCommanderSelectionNav) {
      close() // Close sidebar for other navigations
    }
    router.push(url)
  }, [close, router])

  // ---------------------------------------------------------------------------
  // Ownership lookup — extract card names from messages and fetch ownership
  // ---------------------------------------------------------------------------

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

  // Preload card images for instant hover previews
  usePreloadCardImages(cardNamesInChat)

  // Fetch ownership data for cards not yet in cache
  useEffect(() => {
    const cardsToFetch = Array.from(cardNamesInChat).filter(
      name => !ownershipCache.has(name.toLowerCase()) && !pendingLookups.current.has(name.toLowerCase())
    )
    
    if (cardsToFetch.length === 0) return
    
    // Mark as pending (lowercase for consistency)
    cardsToFetch.forEach(name => pendingLookups.current.add(name.toLowerCase()))
    
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
              // Store with lowercase key for consistent case-insensitive lookup
              next.set(item.cardName.toLowerCase(), item.status)
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
        } else {
          console.error('[OracleSidebar] Ownership fetch failed:', response.status)
        }
      } catch (err) {
        console.error('[OracleSidebar] Ownership fetch error:', err)
      } finally {
        cardsToFetch.forEach(name => pendingLookups.current.delete(name.toLowerCase()))
      }
    }
    
    fetchOwnership()
  }, [cardNamesInChat, ownershipCache])

  // Ownership lookup function for renderMessageContent
  const ownershipLookup: OwnershipLookupFn = useCallback((cardName: string) => {
    return ownershipCache.get(cardName.toLowerCase()) ?? 'unknown'
  }, [ownershipCache])

  // ---------------------------------------------------------------------------
  // Card action handling — add card to deck
  // ---------------------------------------------------------------------------

  const handleCardAction = useCallback(async (cardName: string) => {
    // In commander-selection context, clicking a card should navigate to select it
    if (activeContext.type === 'commander-selection') {
      // Navigate to /decks/new with commander param
      router.push(`/decks/new?commander=${encodeURIComponent(cardName)}`)
      return
    }
    
    // Only allow adding cards in deck context
    if (activeContext.type !== 'deck' || !activeContext.deckId) {
      toast.info('Open a deck to add cards')
      return
    }

    try {
      const res = await fetch(`/api/decks/${activeContext.deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardName,
          quantity: 1,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add card')
      }

      toast.success(`Added ${cardName}`)
      
      // Invalidate deck queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: deckKeys.detail(String(activeContext.deckId)) })
      queryClient.invalidateQueries({ queryKey: deckKeys.cardStatuses(String(activeContext.deckId)) })
    } catch (err) {
      console.error('[OracleSidebar] Failed to add card:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to add card')
    }
  }, [activeContext, queryClient, router])

  // ---------------------------------------------------------------------------
  // Auto-scroll and focus
  // ---------------------------------------------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    if (isOpen && !isHistoryPanelOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isHistoryPanelOpen])

  // ---------------------------------------------------------------------------
  // Resize handling
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = width
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)

      const handlePointerMove = (ev: PointerEvent) => {
        const delta = startX - ev.clientX
        const maxAllowed = Math.min(MAX_WIDTH, window.innerWidth * 0.6)
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
    [width, setWidth]
  )

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || isStreaming) return
    sendMessage(text)
    setInputValue('')
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }, [inputValue, isStreaming, sendMessage])

  // ---------------------------------------------------------------------------
  // New chat
  // ---------------------------------------------------------------------------

  const handleNewChatClick = useCallback(() => {
    setShowClearConfirm(true)
  }, [])

  const handleNewChatConfirm = useCallback(() => {
    clearMessages()
    setShowClearConfirm(false)
    setOwnershipCache(new Map())
  }, [clearMessages])

  // ---------------------------------------------------------------------------
  // Start deck from commander suggestion
  // ---------------------------------------------------------------------------

  const handleStartDeck = useCallback(async (commanderName: string) => {
    try {
      // Create a new deck with this commander
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${commanderName} Deck`,
          format: 'commander',
          commanderName,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create deck')
      }

      const data = await res.json()
      const deckId = data.deck?.id ?? data.id

      toast.success(`Created deck for ${commanderName}`)
      
      // Invalidate deck list queries
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      
      // Navigate to the new deck
      if (deckId) {
        window.location.href = `/decks/${deckId}`
      }
    } catch (err) {
      console.error('[OracleSidebar] Failed to create deck:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to create deck')
    }
  }, [queryClient])

  // ---------------------------------------------------------------------------
  // Determine card link mode based on context
  // ---------------------------------------------------------------------------

  const cardLinkMode: CardLinkMode = 
    activeContext.type === 'deck' || activeContext.type === 'workbench'
      ? 'add'
      : activeContext.type === 'commander-selection'
      ? 'crown'
      : 'none'

  // Check if we're in exploration context (for commander suggestions)
  const isExplorationContext = 
    activeContext.type === 'exploration' || 
    activeContext.type === 'forge' || 
    activeContext.type === 'deck-list' ||
    activeContext.type === 'general' ||
    activeContext.type === 'commander-selection'

  // Extract commander suggestions from the last assistant message for quick action buttons
  // Validates against the actual ref_commanders table for accuracy
  const quickBuildCommanders = useMemo(() => {
    if (!isExplorationContext) return []
    
    // Find the last assistant message
    let lastAssistantMsg: { content: string; navigatePrompt?: NavigatePrompt } | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        lastAssistantMsg = messages[i]
        break
      }
    }
    if (!lastAssistantMsg) return []
    
    // If there's already a navigatePrompt with a specific commander, don't show redundant buttons
    if (lastAssistantMsg.navigatePrompt?.commanderName) return []
    
    const content = lastAssistantMsg.content
    const mentionedCards: string[] = []
    
    // Extract from [[Card Name]] brackets
    const bracketPattern = /\[\[([^\]]+)\]\]/g
    let match
    while ((match = bracketPattern.exec(content)) !== null) {
      mentionedCards.push(match[1])
    }
    
    // Also extract from **Bold Text** that looks like "Name, Title" (common commander format)
    // This catches cases where AI uses bold instead of brackets
    const boldPattern = /\*\*([A-Z][^*]+,\s+[^*]+)\*\*/g
    while ((match = boldPattern.exec(content)) !== null) {
      const name = match[1].trim()
      // Don't add if already extracted from brackets
      if (!mentionedCards.some(m => m.toLowerCase() === name.toLowerCase())) {
        mentionedCards.push(name)
      }
    }
    
    // Filter to only legal commanders using the ref_commanders table
    const validCommanders = mentionedCards.filter(name => 
      commanderNamesSet.has(name.toLowerCase())
    )
    
    // Deduplicate and limit to 3
    const unique = [...new Set(validCommanders)]
    return unique.slice(0, 3)
  }, [isExplorationContext, messages, commanderNamesSet])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null

  const contextLabel = getContextLabel(activeContext)
  const contextSubtitle = getContextSubtitle(activeContext)
  const sessionName = activeSession?.sessionName
  const placeholderText = getPlaceholderText(activeContext, isStreaming)

  return (
    <>
      {/* Backdrop for mobile */}
      <div 
        className="fixed inset-x-0 top-[110px] bottom-0 bg-black/50 z-40 md:hidden"
        onClick={close}
      />
      
      {/* Sidebar */}
      <aside
        ref={panelRef}
        className={cn(
          // Mobile: fixed overlay below header (nav + page header = ~110px)
          'fixed right-0 top-[110px] bottom-0 z-50 flex flex-col',
          // Desktop: static in flex flow, full height
          'md:!static md:!top-auto md:!bottom-auto md:z-auto md:h-full',
          'bg-[rgba(24,24,27,0.95)] backdrop-blur-md border-l border-zinc-800/60',
          'shadow-2xl md:shadow-none'
        )}
        style={{ width, flexShrink: 0 }}
      >
        {/* Resize handle */}
        <div
          onPointerDown={handlePointerDown}
          className="absolute left-0 top-0 z-10 h-full w-[4px] cursor-col-resize select-none hover:bg-emerald-500/40 transition-colors"
        />

        {/* Header */}
        <div className="flex flex-col border-b border-zinc-800/60">
          {/* Top row: Session name + actions */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                onClick={openHistoryPanel}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors shrink-0"
                aria-label="Session history"
                title="Session history"
              >
                <History className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-zinc-200 truncate">
                {sessionName || 'New conversation'}
              </span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={handleNewChatClick}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                aria-label="New chat"
                title="New chat"
              >
                <MessageSquarePlus className="w-4 h-4" />
              </button>
              <button
                onClick={close}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                aria-label="Close Oracle"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Context bar */}
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <div className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
              'bg-zinc-800/80 text-zinc-400'
            )}>
              {getContextIcon(activeContext.type)}
              <span>{contextLabel}</span>
            </div>
            {contextSubtitle && (
              <span className="text-xs text-zinc-500 truncate">
                {contextSubtitle}
              </span>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {isLoadingHistory ? (
            <LoadingState />
          ) : messages.length === 0 ? (
            <EmptyState context={activeContext} onSuggestionClick={sendMessage} />
          ) : (
            messages
              .filter(msg => msg.role !== 'system')
              .filter(msg => !(msg.role === 'assistant' && msg.content === ''))
              .map((msg, idx, arr) => (
                <MessageBubble 
                  key={msg.id} 
                  message={msg}
                  cardLinkMode={cardLinkMode}
                  onCardAction={handleCardAction}
                  ownershipLookup={ownershipLookup}
                  onStartDeck={handleStartDeck}
                  isExplorationContext={isExplorationContext}
                  onNavigate={handleNavigate}
                  isStreaming={isStreaming && msg.role === 'assistant' && idx === arr.length - 1}
                />
              ))
          )}
          {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.content === '') && (
            <ThinkingIndicator />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-zinc-800/60 px-3 py-2">
          {/* Quick build buttons when commanders are suggested */}
          {quickBuildCommanders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickBuildCommanders.map((name) => (
                <button
                  key={name}
                  onClick={() => handleStartDeck(name)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium',
                    'bg-amber-500/15 border border-amber-500/30 text-amber-400',
                    'hover:bg-amber-500/25 hover:border-amber-500/50 transition-colors'
                  )}
                >
                  <Crown className="w-3 h-3" />
                  Build {name.split(',')[0]}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-2.5 py-1.5 transition-all focus-within:border-emerald-500/50 focus-within:bg-zinc-900/80">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                // Auto-resize
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={isStreaming}
              placeholder={placeholderText}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
              style={{ minHeight: '22px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !inputValue.trim()}
              className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500 text-black transition-all hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              aria-label="Send message"
            >
              <ArrowUpIcon />
            </button>
          </div>
          <div className="text-[10px] text-zinc-600 mt-1 text-center">
            <kbd className="px-1 py-0.5 bg-zinc-800/50 rounded text-zinc-500">⌘⇧O</kbd> to toggle
          </div>
        </div>

        {/* Session history panel */}
        <SessionHistoryPanel />

        {/* New chat confirmation dialog */}
        {showClearConfirm && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mx-4 max-w-sm shadow-xl">
              <p className="text-sm text-zinc-200 mb-4">
                Start a new conversation? Current chat will be saved to history.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 text-sm rounded-md text-zinc-400 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNewChatConfirm}
                  className="px-3 py-1.5 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                >
                  New Chat
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    navigatePrompt?: NavigatePrompt
  }
  cardLinkMode: CardLinkMode
  onCardAction?: (name: string) => void
  ownershipLookup?: OwnershipLookupFn
  onStartDeck?: (commanderName: string) => void
  isExplorationContext?: boolean
  onNavigate?: (url: string) => void
  isStreaming?: boolean
}

function MessageBubble({ 
  message, 
  cardLinkMode, 
  onCardAction, 
  ownershipLookup,
  onStartDeck,
  isExplorationContext,
  onNavigate,
  isStreaming,
}: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-zinc-700/50 px-3 py-2 text-sm text-zinc-100 leading-relaxed">
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant message — check for commander suggestions
  const commanderSuggestions = isExplorationContext 
    ? parseCommanderSuggestions(message.content)
    : []
  const rawTextContent = commanderSuggestions.length > 0
    ? stripCommanderSuggestions(message.content)
    : message.content
  
  // Auto-bracket card names that the AI forgot to wrap
  // Only apply when not streaming to avoid flickering
  const textContent = isStreaming 
    ? rawTextContent 
    : autoBracketCardsSync(rawTextContent)

  return (
    <div className="text-sm text-zinc-300 leading-relaxed">
      {renderMessageContent(textContent, cardLinkMode, onCardAction, undefined, ownershipLookup)}
      {/* Streaming indicator — shows while text is still arriving */}
      {isStreaming && message.content.length > 0 && (
        <span className="inline-flex items-center gap-1 ml-1 text-zinc-500">
          <span className="w-1 h-1 rounded-full animate-pulse bg-emerald-400" />
        </span>
      )}
      {/* Done indicator — shows when streaming completes (message has content and not streaming) */}
      {!isStreaming && message.content.length > 0 && !message.navigatePrompt && commanderSuggestions.length === 0 && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-800/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-zinc-500">Done</span>
        </div>
      )}
      {commanderSuggestions.length > 0 && (
        <CommanderSuggestionRow 
          suggestions={commanderSuggestions}
          onStartDeck={onStartDeck}
        />
      )}
      {message.navigatePrompt && (
        <button
          onClick={() => onNavigate?.(message.navigatePrompt!.url)}
          className={cn(
            'mt-3 flex items-center gap-2 w-full px-3 py-2.5 rounded-lg',
            message.navigatePrompt.commanderName
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/50'
              : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:border-emerald-500/50',
            'transition-all text-sm font-medium'
          )}
        >
          {message.navigatePrompt.commanderName ? (
            <Crown className="w-4 h-4" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span className="flex-1 text-left">{message.navigatePrompt.label}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LoadingState
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-32 gap-2">
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full animate-pulse bg-emerald-400/60" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full animate-pulse bg-emerald-400/60" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full animate-pulse bg-emerald-400/60" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-zinc-500">Loading conversation...</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ context, onSuggestionClick }: { context: OracleContext; onSuggestionClick?: (text: string) => void }) {
  const suggestions = getSuggestions(context)
  const isExploration = context.type === 'forge' || context.type === 'exploration' || context.type === 'commander-selection'

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center mb-3',
        isExploration ? 'bg-amber-500/15' : 'bg-emerald-500/15'
      )}>
        {isExploration ? (
          <Compass className={cn('w-5 h-5', 'text-amber-400')} />
        ) : (
          <MessageSquare className="w-5 h-5 text-emerald-400" />
        )}
      </div>
      <h3 className="text-sm font-medium text-zinc-100 mb-1">
        {isExploration ? 'Start exploring' : 'Ask Oracle'}
      </h3>
      <p className="text-xs text-zinc-500 mb-4 max-w-[220px]">
        {isExploration 
          ? 'Tell me what kind of deck you want to build.'
          : 'I can help with deckbuilding, card suggestions, and more.'
        }
      </p>
      {suggestions.length > 0 && (
        <div className="space-y-1.5 w-full max-w-[260px]">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick?.(s)}
              className={cn(
                'w-full text-left text-xs px-3 py-2 rounded-md transition-colors',
                'text-zinc-400 hover:text-zinc-200',
                'bg-zinc-800/40 hover:bg-zinc-800/70'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function getSuggestions(context: OracleContext): string[] {
  switch (context.type) {
    case 'collection':
      return [
        'What commanders could I build?',
        'Find cards I own but never use',
        'What staples am I missing?',
      ]
    case 'deck':
    case 'workbench':
      return [
        'What cards should I cut?',
        'Suggest better removal options',
        'What are the key cards for this deck?',
      ]
    case 'deck-list':
      return [
        'Compare my decks',
        'Which deck needs the most work?',
        'Find shared expensive cards',
      ]
    case 'commander-selection':
      return [
        'I want to build aristocrats',
        'Suggest a commander for landfall',
        'What plays well at bracket 3?',
      ]
    case 'forge':
    case 'exploration':
      return [
        'I want to build aristocrats',
        'Suggest a unique commander',
        'What plays well at bracket 3?',
      ]
    default:
      return [
        'Help me build a new deck',
        'What commanders are popular?',
        'Explain partner commanders',
      ]
  }
}

// ---------------------------------------------------------------------------
// ThinkingIndicator
// ---------------------------------------------------------------------------

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400" style={{ animationDelay: '300ms' }} />
      </div>
      <span>Thinking...</span>
    </div>
  )
}
