'use client'

import { useCallback, useReducer, useRef, useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import type {
  BrewSessionState,
  CommittedCommander,
  CommanderOption,
  DecisionEntry,
  ArchivedItem,
  DeckCard,
} from '@/lib/brew-v2-types'
import type { ChatMessage } from '@/lib/debrief-types'
import { createSession, commitCommander } from '@/lib/brew-v2-session'
import { deckReducer, initialDeckState } from '@/lib/brew-v2-deck-state'
import {
  deserializeMessages,
  deserializeDecisionLog,
  deserializeDeckState,
} from '@/lib/brew-autosave-serializers'

import { DEFAULT_MODEL_ID } from '@/lib/ai-models'
import { useBrewAutosave } from '@/hooks/useBrewAutosave'

import { BrewTopbar } from '@/components/brew-v2/BrewTopbar'
import { BrewCanvas } from '@/components/brew-v2/BrewCanvas'
import { ChatPanel, type ChatPanelHandle } from '@/components/brew-v2/ChatPanel'
import { useCanvasPositions } from '@/components/brew-v2/useCanvasPositions'
import { getNextOpenPosition } from '@/components/brew-v2/canvas-utils'

// ---------------------------------------------------------------------------
// Brew Mode V2 Page — Canvas-First Layout
// ---------------------------------------------------------------------------

export default function BrewModePage() {
  const router = useRouter()

  // -------------------------------------------------------------------------
  // Session state — manages phase, decision log, commander, assessment cache
  // -------------------------------------------------------------------------
  const [session, setSession] = useState<BrewSessionState>(createSession)

  // -------------------------------------------------------------------------
  // Deck state — useReducer for deck cards, suggestions, generating status
  // -------------------------------------------------------------------------
  const [deckState, dispatchDeck] = useReducer(deckReducer, initialDeckState)

  // -------------------------------------------------------------------------
  // Canvas positions — manages position state and debounced persistence
  // -------------------------------------------------------------------------
  const { handlePositionUpdate, assignPositionsToNewCards } = useCanvasPositions({
    sessionId: session.sessionId,
    canvasPositions: deckState.canvasPositions,
    dispatchDeck,
  })

  // -------------------------------------------------------------------------
  // Chat state
  // -------------------------------------------------------------------------
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeTools, setActiveTools] = useState<Array<{name: string; status: 'running' | 'complete' | 'error'}>>([])
  const [selectedModelId, setSelectedModelId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('oracle-preferred-model') || DEFAULT_MODEL_ID
    }
    return DEFAULT_MODEL_ID
  })

  // -------------------------------------------------------------------------
  // Session loading state — show loading indicator during hydration
  // Validates: Requirement 7.4
  // -------------------------------------------------------------------------
  const [isHydrating, setIsHydrating] = useState(true)

  // -------------------------------------------------------------------------
  // Autosave — unified persistence hook for all session state
  // Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.1
  // -------------------------------------------------------------------------
  const { isSaving, lastSavedAt } = useBrewAutosave({
    sessionId: session.sessionId,
    messages,
    decisionLog: session.decisionLog,
    deckState,
    phase: session.phase,
    commander: session.commander,
  })

  // Persist model selection to localStorage
  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelId(modelId)
    localStorage.setItem('oracle-preferred-model', modelId)
  }, [])

  // -------------------------------------------------------------------------
  // Refs for ChatPanel
  // -------------------------------------------------------------------------
  const chatInputRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>
  const chatHandleRef = useRef<ChatPanelHandle>(null)

  // -------------------------------------------------------------------------
  // Session Loader — hydrate from URL sessionId or create new session
  // Validates: Requirements 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    async function loadOrCreateSession() {
      const params = new URLSearchParams(window.location.search)
      const urlSessionId = params.get('sessionId')

      if (urlSessionId) {
        // --- Existing session: fetch and hydrate ---
        try {
          const res = await fetch(`/api/brew/session?id=${encodeURIComponent(urlSessionId)}`)

          if (!res.ok) {
            // Session not found (404) or other error — create new session
            // Validates: Requirement 7.3
            if (!cancelled) await createNewSession()
            return
          }

          const data = await res.json()
          if (cancelled) return

          // Hydrate messages from conversation_json
          // Validates: Requirement 1.2
          const restoredMessages = deserializeMessages(data.conversation_json)
          setMessages(restoredMessages)

          // Hydrate decision log from decision_log_json
          // Validates: Requirement 2.2
          const restoredDecisionLog = deserializeDecisionLog(data.decision_log_json)

          // Hydrate deck state from skeleton_json
          // Validates: Requirements 3.2, 4.2
          const restoredDeckState = deserializeDeckState(data.skeleton_json)
          dispatchDeck({ type: 'setCanvasPositions', positions: restoredDeckState.canvasPositions })
          // Hydrate cards, suggestions, and archive by dispatching state
          for (const card of restoredDeckState.cards) {
            dispatchDeck({ type: 'addCard', card })
          }
          dispatchDeck({ type: 'setSuggestions', suggestions: restoredDeckState.suggestions })
          if (restoredDeckState.explorationArchive.length > 0) {
            dispatchDeck({ type: 'setArchive', items: restoredDeckState.explorationArchive })
          }

          // Hydrate phase + commander from status/commander_name/colour_identity
          // Validates: Requirements 5.2, 5.3, 5.4, 5.5
          let restoredPhase: 'exploring' | 'building' = 'exploring'
          let restoredCommander: CommittedCommander | null = null

          if (data.status === 'building' && data.commander_name) {
            // Reconstruct CommittedCommander — resolve artUrl from Scryfall
            // Validates: Requirement 5.3
            try {
              const scryfallRes = await fetch(
                `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(data.commander_name)}`,
                { headers: { 'User-Agent': 'The-Oracle/1.0' } }
              )

              if (scryfallRes.ok) {
                const scryfallCard = await scryfallRes.json()
                const artUrl =
                  scryfallCard.image_uris?.art_crop ??
                  scryfallCard.card_faces?.[0]?.image_uris?.art_crop ??
                  scryfallCard.image_uris?.normal ??
                  scryfallCard.card_faces?.[0]?.image_uris?.normal ??
                  ''

                // Derive archetype from the restored decision log
                const archetypeEntry = restoredDecisionLog.strategy.find(
                  (entry) => entry.key.toUpperCase() === 'ARCHETYPE'
                )

                restoredCommander = {
                  name: data.commander_name,
                  artUrl,
                  typeLine: scryfallCard.type_line ?? '',
                  colourIdentity: data.colour_identity
                    ? (data.colour_identity.includes(',')
                      ? data.colour_identity.split(',').filter(Boolean)
                      : data.colour_identity.split('').filter(Boolean))
                    : scryfallCard.color_identity ?? [],
                  archetype: archetypeEntry?.value ?? null,
                }
                restoredPhase = 'building'
              } else {
                // Scryfall lookup failed — fall back to exploring
                // Validates: Requirement 5.5
                console.warn(
                  `[session-loader] Failed to resolve commander "${data.commander_name}" from Scryfall — falling back to exploring phase`
                )
              }
            } catch (scryfallErr) {
              // Network error with Scryfall — fall back to exploring
              // Validates: Requirement 5.5
              console.warn(
                '[session-loader] Scryfall fetch failed during commander reconstruction',
                scryfallErr
              )
            }
          } else if (data.status === 'building' && !data.commander_name) {
            // Status is building but no commander name — inconsistent state, fall back
            console.warn('[session-loader] Session status is "building" but commander_name is null — falling back to exploring')
          }

          if (!cancelled) {
            setSession({
              phase: restoredPhase,
              sessionId: data.id,
              commander: restoredCommander,
              decisionLog: restoredDecisionLog,
              deckState: null,
              assessmentCache: new Map(),
            })
            setIsHydrating(false)
          }
        } catch (fetchErr) {
          // Network error fetching session — create new session
          // Validates: Requirement 7.3
          console.warn('[session-loader] Session fetch failed', fetchErr)
          if (!cancelled) await createNewSession()
        }
      } else {
        // --- No sessionId in URL: create new session ---
        await createNewSession()
      }
    }

    async function createNewSession() {
      try {
        const res = await fetch('/api/brew/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        })
        const data = res.ok ? await res.json() : null

        if (data?.sessionId && !cancelled) {
          setSession((prev) => ({ ...prev, sessionId: data.sessionId }))
          // Replace URL with sessionId param — no new history entry
          // Validates: Requirement 7.2
          const url = new URL(window.location.href)
          url.searchParams.set('sessionId', String(data.sessionId))
          history.replaceState(null, '', url.toString())
        }
      } catch {
        // Session creation failed — chat still functions without persistence
      } finally {
        if (!cancelled) setIsHydrating(false)
      }
    }

    loadOrCreateSession()

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Commander candidates — populated via structured tool output (SSE event)
  // No regex parsing needed — the model calls display_commander_candidates
  // which emits a structured `candidates` event with card names.
  // -------------------------------------------------------------------------
  const [candidateCards, setCandidateCards] = useState<CommanderOption[]>([])

  /** Flatten all decision log entries into a single array for the canvas */
  const decisionCards = useMemo<DecisionEntry[]>(() => {
    return [
      ...session.decisionLog.strategy,
      ...session.decisionLog.parameters,
      ...session.decisionLog.constraints,
    ]
  }, [session.decisionLog])

  // -------------------------------------------------------------------------
  // Assign canvas positions to Phase 1 cards as they appear
  // -------------------------------------------------------------------------

  const assignedPhase1Ref = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (session.phase !== 'exploring') return

    const allPhase1Items: Array<{ id: string; type: 'candidate' | 'decision' }> = [
      ...candidateCards.map((c) => ({ id: c.scryfallId, type: 'candidate' as const })),
    ]

    const needsPosition = allPhase1Items.filter(
      (item) => !deckState.canvasPositions[item.id] && !assignedPhase1Ref.current.has(item.id)
    )
    
    console.log('[position-assign] phase:', session.phase, 'total items:', allPhase1Items.length, 'needs position:', needsPosition.length, 'existing positions:', Object.keys(deckState.canvasPositions).length)
    
    if (needsPosition.length === 0) return

    const existing = Object.values(deckState.canvasPositions)
    let currentPositions = [...existing]

    for (const item of needsPosition) {
      const cardWidth = item.type === 'candidate' ? 168 : 152
      const cardHeight = item.type === 'candidate' ? 220 : 120

      const { x, y } = getNextOpenPosition(
        currentPositions,
        cardWidth,
        cardHeight,
        1200,
        16
      )

      currentPositions.push({ id: item.id, x, y, type: item.type, updatedAt: Date.now() })
      assignedPhase1Ref.current.add(item.id)
      handlePositionUpdate(item.id, { x, y })
    }
  }, [candidateCards, session.phase, deckState.canvasPositions, handlePositionUpdate])

  // -------------------------------------------------------------------------
  // Handlers — Commander commit (phase transition)
  // -------------------------------------------------------------------------

  const handleCommitCommander = useCallback((commander: CommanderOption) => {
    // Validate commander before committing — must be a Legendary Creature
    // (Quick client-side check: verify with Scryfall)
    fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commander.name)}`, {
      headers: { 'User-Agent': 'The-Oracle/1.0' },
    })
      .then(res => res.ok ? res.json() : null)
      .then(card => {
        if (!card) {
          console.warn(`[commit] Card "${commander.name}" not found on Scryfall — blocking commit`)
          return
        }

        const typeLine = (card.type_line ?? '').toLowerCase()
        const isLegendaryCreature = typeLine.includes('legendary') && typeLine.includes('creature')
        const canBeCommander = typeLine.includes('can be your commander')

        if (!isLegendaryCreature && !canBeCommander) {
          console.warn(`[commit] "${commander.name}" is not a valid commander (type: ${card.type_line}) — blocking commit`)
          // TODO: Show user-facing error toast
          return
        }

        // Enrich commander with Scryfall data
        const enrichedCommander: CommanderOption = {
          ...commander,
          colourIdentity: card.color_identity ?? [],
          artUrl: card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop ?? commander.artUrl,
        }

        // Summarize exploration conversation for building phase context
        const explorationSummary = messages
          .filter(m => m.role === 'assistant')
          .map(m => m.content)
          .join('\n---\n')
          .slice(0, 4000)

        const contextMessage: ChatMessage = {
          id: `system-context-${Date.now()}`,
          role: 'assistant',
          content: `Commander committed: **${enrichedCommander.name}**\n\nI'm now in deck-building mode. I can help you:\n• Suggest cards to add (click any [[Card Name]] to add it to the canvas)\n• Assign and reorganize categories\n• Evaluate cards for cuts\n• Discuss strategy and synergies\n\nWhat would you like to work on first?`,
          timestamp: Date.now(),
        }

        const explorationContext: ChatMessage = {
          id: `exploration-context-${Date.now()}`,
          role: 'user',
          content: `[SYSTEM CONTEXT — DO NOT DISPLAY] The user explored commander options and committed ${enrichedCommander.name}. Here's a summary of the exploration conversation for context:\n\n${explorationSummary}`,
          timestamp: Date.now() - 1,
        }

        // Reset chat with building phase context
        setMessages([explorationContext, contextMessage])

        // Transition to building phase with enriched commander
        setSession((prev) => commitCommander(prev, enrichedCommander))
      })
      .catch(err => {
        console.warn('[commit] Scryfall validation failed — committing anyway:', err)
        // Fallback: commit without validation (better UX than blocking)
        setSession((prev) => commitCommander(prev, commander))
      })
  }, [messages])

  // -------------------------------------------------------------------------
  // Skeleton generation — fires when phase transitions to 'building'
  // (Requirements 14.4, 14.5)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (session.phase !== 'building' || !session.sessionId) return

    // Avoid re-triggering if we already have cards (e.g. session resume)
    if (deckState.cards.length > 0) return

    let cancelled = false

    async function generateSkeleton() {
      dispatchDeck({ type: 'setGenerating', isGenerating: true })

      try {
        const res = await fetch('/api/brew/skeleton', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId }),
        })

        if (!res.ok || !res.body) {
          dispatchDeck({ type: 'setGenerating', isGenerating: false })
          return
        }

        // Read SSE stream
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (cancelled) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue

            const jsonStr = trimmed.slice(5).trim()
            if (!jsonStr) continue

            try {
              const event = JSON.parse(jsonStr)

              if (event.type === 'complete' && !cancelled) {
                // Populate deck cards
                const cards: DeckCard[] = event.cards ?? []
                for (const card of cards) {
                  dispatchDeck({ type: 'addCard', card })
                }

                // Assign canvas positions to newly added deck cards
                assignPositionsToNewCards(cards)

                // Set suggestions
                const suggestions: DeckCard[] = event.suggestions ?? []
                dispatchDeck({ type: 'setSuggestions', suggestions })
              }
              if (event.type === 'error') {
                console.error('[skeleton] SSE error:', event.message)
              }
            } catch {
              // Malformed JSON — skip this line
            }
          }
        }
      } catch {
        // Network error — silent failure, workspace remains empty
      } finally {
        if (!cancelled) {
          dispatchDeck({ type: 'setGenerating', isGenerating: false })
        }
      }
    }

    generateSkeleton()

    return () => {
      cancelled = true
    }
  }, [session.phase, session.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Handlers — Deck card actions
  // -------------------------------------------------------------------------

  const handleRemoveCard = useCallback((cardName: string) => {
    dispatchDeck({ type: 'removeCard', card_name: cardName })
  }, [])

  const handleDragReassign = useCallback((cardName: string, newCategory: string) => {
    dispatchDeck({ type: 'dragReassign', card_name: cardName, targetCategory: newCategory })
  }, [])

  const handleDiscussCard = useCallback((cardName: string) => {
    // Pre-fill chat input with the card name and focus it via imperative handle
    chatHandleRef.current?.prefill(cardName)
  }, [])

  const handleArchivePhase1 = useCallback((archivedItems: ArchivedItem[]) => {
    dispatchDeck({ type: 'setArchive', items: archivedItems })
  }, [])

  // -------------------------------------------------------------------------
  // Handlers — Add card from chat (click [[Card Name]] in building phase)
  // -------------------------------------------------------------------------

  const handleAddCardFromChat = useCallback((cardName: string) => {
    // Only allow adding cards during building phase
    if (session.phase !== 'building') return

    // Don't add duplicates
    if (deckState.cards.some(c => c.card_name === cardName)) return

    // Create a deck card entry (CMC will be enriched async)
    const newCard: DeckCard = {
      card_name: cardName,
      primary_category: 'Other',
      additional_categories: [],
      ownership_status: 'unknown',
      cmc: 0,
      type_line: '',
      oracle_text: '',
    }

    // Add card to deck state immediately (responsive UI)
    dispatchDeck({ type: 'addCard', card: newCard })

    // Assign position in the most open space
    const existing = Object.values(deckState.canvasPositions)
    const { x, y } = getNextOpenPosition(existing, 140, 195, 1200, 16)
    handlePositionUpdate(cardName, { x, y })

    // Enrich with Scryfall data async (CMC, type_line)
    fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`, {
      headers: { 'User-Agent': 'The-Oracle/1.0' },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          dispatchDeck({
            type: 'enrichCard',
            card_name: cardName,
            cmc: data.cmc ?? 0,
            type_line: data.type_line ?? '',
            oracle_text: data.oracle_text ?? '',
          })
        }
      })
      .catch(() => { /* non-critical — card still works without enrichment */ })
  }, [session.phase, deckState.cards, deckState.canvasPositions, handlePositionUpdate])

  // -------------------------------------------------------------------------
  // Handlers — Chat
  // -------------------------------------------------------------------------

  const handleSendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setIsStreaming(true)

    try {
      const res = await fetch('/api/brew/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId ?? 1,
          message: text,
          history: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          modelId: selectedModelId,
        }),
      })

      if (!res.ok || !res.body) {
        setIsStreaming(false)
        return
      }

      // Read SSE stream — parse SSE data events
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let messageCost: number | undefined
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE lines from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6)
            if (payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              if (parsed && typeof parsed === 'object') {
                if (parsed.type === 'text_delta' && typeof parsed.text === 'string') {
                  assistantContent += parsed.text
                } else if (parsed.type === 'decisions' && Array.isArray(parsed.entries)) {
                  // Inline decision extraction results from the server
                  setSession((prev) => {
                    const updatedLog = { ...prev.decisionLog }
                    for (const entry of parsed.entries) {
                      const sectionKey =
                        entry.section === 'Strategy' ? 'strategy'
                          : entry.section === 'Parameters' ? 'parameters'
                          : entry.section === 'Constraints' ? 'constraints'
                          : null
                      if (sectionKey) {
                        const decisionEntry = {
                          id: entry.id,
                          key: entry.key,
                          value: entry.value,
                          sourceQuote: entry.sourceQuote,
                          timestamp: Date.now(),
                        }
                        updatedLog[sectionKey] = [...updatedLog[sectionKey], decisionEntry]
                      }
                    }
                    return { ...prev, decisionLog: updatedLog }
                  })
                } else if (parsed.type === 'tool_status') {
                  setActiveTools(prev => {
                    const existing = prev.findIndex(t => t.name === parsed.tool_name)
                    if (existing >= 0) {
                      const updated = [...prev]
                      updated[existing] = { name: parsed.tool_name, status: parsed.status }
                      return updated
                    }
                    return [...prev, { name: parsed.tool_name, status: parsed.status }]
                  })
                } else if (parsed.type === 'error') {
                  console.warn('[brew-chat] Stream error:', parsed.error_message)
                } else if (parsed.type === 'cost' && typeof parsed.estimatedCost === 'number') {
                  messageCost = parsed.estimatedCost
                } else if (parsed.type === 'candidates' && Array.isArray(parsed.commanders)) {
                  // Structured commander candidates from display_commander_candidates tool
                  console.log('[brew-canvas] Received candidates SSE event:', parsed.commanders.length, 'commanders:', parsed.commanders.map((c: { name: string }) => c.name))
                  const newCandidates: CommanderOption[] = parsed.commanders.map((cmd: { name: string; color_identity?: string[] }) => ({
                    name: cmd.name,
                    artUrl: `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cmd.name)}&format=image&version=art_crop`,
                    colourIdentity: cmd.color_identity ?? [],
                    description: '',
                    owned: false,
                    scryfallId: cmd.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                  }))
                  setCandidateCards(prev => {
                    // Merge new candidates with existing (dedup by name)
                    const existingNames = new Set(prev.map(c => c.name))
                    const fresh = newCandidates.filter(c => !existingNames.has(c.name))
                    console.log('[brew-canvas] Adding', fresh.length, 'new candidates to canvas (existing:', prev.length, ')')
                    return [...prev, ...fresh]
                  })
                } else if (parsed.type === 'add_cards' && Array.isArray(parsed.cards)) {
                  // AI directly adding cards to the deck via add_cards_to_deck tool
                  console.log('[brew-canvas] Received add_cards SSE event:', parsed.cards.length, 'cards')
                  for (const cardData of parsed.cards as Array<{ name: string; category: string }>) {
                    // Skip duplicates
                    if (deckState.cards.some(c => c.card_name === cardData.name)) continue

                    const newCard: DeckCard = {
                      card_name: cardData.name,
                      primary_category: cardData.category || 'Other',
                      additional_categories: [],
                      ownership_status: 'unknown',
                      cmc: 0,
                      type_line: '',
                      oracle_text: '',
                    }
                    dispatchDeck({ type: 'addCard', card: newCard })

                    // Assign position
                    const existing = Object.values(deckState.canvasPositions)
                    const { x, y } = getNextOpenPosition(existing, 140, 195, 1200, 16)
                    handlePositionUpdate(cardData.name, { x, y })

                    // Enrich async
                    fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardData.name)}`, {
                      headers: { 'User-Agent': 'The-Oracle/1.0' },
                    })
                      .then(res => res.ok ? res.json() : null)
                      .then(data => {
                        if (data) {
                          dispatchDeck({
                            type: 'enrichCard',
                            card_name: cardData.name,
                            cmc: data.cmc ?? 0,
                            type_line: data.type_line ?? '',
                            oracle_text: data.oracle_text ?? '',
                          })
                        }
                      })
                      .catch(() => {})
                  }
                }
              }
              if (typeof parsed === 'string') {
                assistantContent += parsed
              }
            } catch {
              // Non-JSON line, skip
            }
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
        ...(messageCost !== undefined && { cost: messageCost }),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      // Network error — silent
    } finally {
      setIsStreaming(false)
      setActiveTools([])
    }
  }, [session, messages, selectedModelId])

  // -------------------------------------------------------------------------
  // Handlers — Navigation
  // -------------------------------------------------------------------------

  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  // -------------------------------------------------------------------------
  // Layout — Canvas-first: BrewCanvas (flex:1) | ChatPanel (220px)
  // -------------------------------------------------------------------------

  // Show loading indicator while session is being hydrated
  // Validates: Requirement 7.4
  if (isHydrating) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
          <p className="text-sm text-zinc-400">Restoring session…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Topbar — switches based on phase */}
      <BrewTopbar
        phase={session.phase}
        commander={session.commander}
        onBack={handleBack}
        selectedModelId={selectedModelId}
        onModelChange={handleModelChange}
        isStreaming={isStreaming}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt}
      />

      {/* Main content — flex row: Canvas (flex-1) + ChatPanel (fixed 220px) */}
      <div className="flex flex-1 min-h-0">
        <BrewCanvas
          phase={session.phase}
          commander={session.commander}
          candidateCards={candidateCards}
          decisionCards={[]}
          onCommit={handleCommitCommander}
          deckState={deckState}
          onDragReassign={handleDragReassign}
          onRemoveCard={handleRemoveCard}
          onDiscussCard={handleDiscussCard}
          canvasPositions={deckState.canvasPositions}
          onPositionUpdate={handlePositionUpdate}
          explorationArchive={deckState.explorationArchive}
          onArchivePhase1={handleArchivePhase1}
        />
        <ChatPanel
          messages={messages}
          onSend={handleSendMessage}
          inputRef={chatInputRef}
          handleRef={chatHandleRef}
          isStreaming={isStreaming}
          activeTools={activeTools}
          onCardClick={session.phase === 'building' ? handleAddCardFromChat : undefined}
        />
      </div>
    </div>
  )
}
