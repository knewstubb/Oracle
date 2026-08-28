'use client'

import { useCallback, useReducer, useRef, useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import type {
  BrewSessionState,
  CommittedCommander,
  CommanderOption,
  DecisionEntry,
  ArchivedItem,
  DeckCard,
  LeadershipType,
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
import { BrewChatView } from '@/components/brew-v2/BrewChatView'
import { CommanderDetailModal } from '@/components/brew-v2/CommanderDetailModal'
import { useCanvasPositions } from '@/components/brew-v2/useCanvasPositions'
import { getNextOpenPosition } from '@/components/brew-v2/canvas-utils'
import { useOracle } from '@/contexts/OracleContext'

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

/**
 * Extract front face name from DFC card name.
 * DFCs use " // " as separator: "Delver of Secrets // Insectile Aberration"
 */
function frontFace(name: string): string {
  const idx = name.indexOf(' // ')
  return idx === -1 ? name : name.substring(0, idx)
}

// ---------------------------------------------------------------------------
// Brew Mode V2 Page — Canvas-First Layout
// Redirects to /explore if no sessionId — /explore is the new entry point
// ---------------------------------------------------------------------------

export default function BrewModePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setContext, close: closeOracle } = useOracle()

  // -------------------------------------------------------------------------
  // Redirect to /explore if no sessionId — /explore is the new entry point
  // Only allow direct access to /new-deck with an existing session
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sessionId = searchParams.get('sessionId')
    const commander = searchParams.get('commander')
    
    // If no sessionId and no commander param, redirect to /explore
    if (!sessionId && !commander) {
      router.replace('/explore')
      return
    }
  }, [searchParams, router])

  // -------------------------------------------------------------------------
  // Close Oracle sidebar when entering brew flow — the brew has its own chat
  // -------------------------------------------------------------------------
  useEffect(() => {
    closeOracle()
  }, [closeOracle])

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
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  
  // -------------------------------------------------------------------------
  // Auto-commit state — for handling commander URL parameter
  // -------------------------------------------------------------------------
  const [pendingCommanderKey, setPendingCommanderKey] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // Oracle context — forge (no commander) or workbench (commander selected)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (session.committedCommander) {
      setContext({
        type: 'workbench',
        sessionId: session.sessionId,
        commanderName: session.committedCommander.name,
      })
    } else {
      setContext({ type: 'forge' })
    }
  }, [session.committedCommander, session.sessionId, setContext])
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

  // Handle collection mode changes
  const handleCollectionModeChange = useCallback((mode: import('@/lib/brew-v2-types').CollectionMode) => {
    setSession((prev) => ({ ...prev, collectionMode: mode }))
  }, [])

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
            // Reconstruct CommittedCommander — resolve artUrl from local DB
            // Validates: Requirement 5.3
            try {
              const cardRes = await fetch(
                `/api/cards?name=${encodeURIComponent(data.commander_name)}&action=full&fuzzy=true`
              )

              if (cardRes.ok) {
                const cardData = await cardRes.json()
                const artUrl = cardData.printing?.image_uri_art_crop ?? ''

                // Derive archetype from the restored decision log
                const archetypeEntry = restoredDecisionLog.strategy.find(
                  (entry) => entry.key.toUpperCase() === 'ARCHETYPE'
                )

                restoredCommander = {
                  name: cardData.name,
                  artUrl,
                  typeLine: cardData.type_line ?? '',
                  colourIdentity: data.colour_identity
                    ? (data.colour_identity.includes(',')
                      ? data.colour_identity.split(',').filter(Boolean)
                      : data.colour_identity.split('').filter(Boolean))
                    : cardData.color_identity?.split('').filter((c: string) => 'WUBRG'.includes(c)) ?? [],
                  archetype: archetypeEntry?.value ?? null,
                }
                restoredPhase = 'building'
              } else {
                // DB lookup failed — fall back to exploring
                // Validates: Requirement 5.5
                console.warn(
                  `[session-loader] Failed to resolve commander "${data.commander_name}" from DB — falling back to exploring phase`
                )
              }
            } catch (dbErr) {
              // Network error — fall back to exploring
              // Validates: Requirement 5.5
              console.warn(
                '[session-loader] DB fetch failed during commander reconstruction',
                dbErr
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
              deckId: data.deck_id ?? null,
              commander: restoredCommander,
              decisionLog: restoredDecisionLog,
              deckState: null,
              assessmentCache: new Map(),
              collectionMode: 'any',
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
          setSession((prev) => ({ 
            ...prev, 
            sessionId: data.sessionId,
            deckId: data.deckId ?? null,
          }))
          // Replace URL with sessionId param — no new history entry
          // Validates: Requirement 7.2
          const url = new URL(window.location.href)
          url.searchParams.set('sessionId', String(data.sessionId))
          
          // Check for commander URL param — store it for auto-commit effect
          const commanderKey = params.get('commander')
          if (commanderKey) {
            // Remove commander param from URL (it's a one-time trigger)
            url.searchParams.delete('commander')
            // Store the commander key to be processed by the auto-commit effect
            setPendingCommanderKey(decodeURIComponent(commanderKey))
          }
          
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
  }, [])  

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
    const currentPositions = [...existing]

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
    // Check if this is a partner pair
    const isPartnerPair = commander.partnerName && commander.leadershipType === 'partner'
    
    // Validate primary commander
    fetch(`/api/cards?name=${encodeURIComponent(frontFace(commander.name))}&action=validate-commander`)
      .then(res => res.json())
      .then(async result => {
        if (!result.valid) {
          console.warn(`[commit] "${commander.name}" is not a valid commander: ${result.reason} — blocking commit`)
          return
        }

        const card1 = result.card
        let card2: any = null
        let partnerColourIdentity: string[] = []

        // If partner pair, validate the second commander too
        if (isPartnerPair && commander.partnerName) {
          try {
            const partnerRes = await fetch(`/api/cards?name=${encodeURIComponent(frontFace(commander.partnerName))}&action=validate-commander`)
            const partnerResult = await partnerRes.json()
            
            if (!partnerResult.valid) {
              console.warn(`[commit] Partner "${commander.partnerName}" is not a valid commander: ${partnerResult.reason} — blocking commit`)
              return
            }
            
            card2 = partnerResult.card
            partnerColourIdentity = card2.color_identity?.split('').filter((c: string) => 'WUBRG'.includes(c)) ?? []
          } catch (err) {
            console.warn('[commit] Partner validation failed:', err)
            return
          }
        }

        // Merge colour identities for partners
        const card1Identity = card1.color_identity?.split('').filter((c: string) => 'WUBRG'.includes(c)) ?? []
        const combinedIdentity = isPartnerPair 
          ? [...new Set([...card1Identity, ...partnerColourIdentity])]
          : card1Identity

        // Enrich commander with DB data
        const enrichedCommander: CommanderOption = {
          ...commander,
          colourIdentity: combinedIdentity,
        }

        // Fetch art URLs and scryfall_id
        let commanderScryfallId: string | null = null
        try {
          const printing1 = await fetch(`/api/cards?name=${encodeURIComponent(card1.name)}&action=printing`).then(r => r.ok ? r.json() : null)
          if (printing1?.image_uri_art_crop) {
            enrichedCommander.artUrl = printing1.image_uri_art_crop
          }
          if (printing1?.scryfall_id) {
            commanderScryfallId = printing1.scryfall_id
            enrichedCommander.scryfallId = printing1.scryfall_id
          }
        } catch { /* non-critical */ }

        // Build partner data if applicable
        let partnerData: { name: string; artUrl: string; typeLine: string; scryfallId?: string } | undefined
        if (isPartnerPair && card2) {
          partnerData = {
            name: card2.name,
            artUrl: '',
            typeLine: card2.type_line ?? '',
            scryfallId: commander.partnerScryfallId,
          }
          
          // Fetch partner art URL
          try {
            const printing2 = await fetch(`/api/cards?name=${encodeURIComponent(card2.name)}&action=printing`).then(r => r.ok ? r.json() : null)
            if (printing2?.image_uri_art_crop) {
              partnerData.artUrl = printing2.image_uri_art_crop
            }
          } catch { /* non-critical */ }
        }

        // Summarize exploration conversation for building phase context
        const explorationSummary = messages
          .filter(m => m.role === 'assistant')
          .map(m => m.content)
          .join('\n---\n')
          .slice(0, 4000)

        const commanderDisplayName = isPartnerPair 
          ? `${enrichedCommander.name} & ${commander.partnerName}`
          : enrichedCommander.name

        const transitionMessage: ChatMessage = {
          id: `transition-${Date.now()}`,
          role: 'assistant',
          content: `**${commanderDisplayName}** locked in as commander${isPartnerPair ? 's' : ''}.\n\nI'm now in deck-building mode. Click any [[Card Name]] I mention to add it to the canvas. What would you like to work on first?`,
          timestamp: Date.now(),
        }

        const explorationContext: ChatMessage = {
          id: `exploration-context-${Date.now()}`,
          role: 'system',
          content: `[SYSTEM CONTEXT — DO NOT DISPLAY] The user committed ${commanderDisplayName} as commander${isPartnerPair ? 's' : ''}. Exploration summary:\n\n${explorationSummary}`,
          timestamp: Date.now() - 1,
        }

        // Preserve chat history, just add transition context
        setMessages(prev => [...prev, explorationContext, transitionMessage])

        // Create deck immediately and navigate to it
        try {
          // Update session to building status in DB first
          await fetch('/api/brew/session', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.sessionId,
              status: 'building',
              commanderName: commanderDisplayName,
              colourIdentity: combinedIdentity.join(''),
            }),
          })
          
          // Save session as draft deck with commander as initial card
          const saveRes = await fetch('/api/brew/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.sessionId,
              mode: 'draft',
              deckCards: [{
                card_name: enrichedCommander.name,
                primary_category: 'Commander',
                additional_categories: [],
                ownership_status: 'unknown',
                cmc: 0,
                type_line: card1.type_line ?? '',
                oracle_text: '',
                scryfall_id: commanderScryfallId,
              }],
              deckName: commanderDisplayName,
              commanderScryfallId,
            }),
          })
          
          if (saveRes.ok) {
            const saveData = await saveRes.json()
            const deckId = saveData.deckId
            
            if (deckId) {
              // Navigate to deck page
              router.push(`/decks/${deckId}`)
              return
            }
          }
        } catch (err) {
          console.warn('[commit] Failed to save deck:', err)
        }

        // Fallback: stay on brew page if deck creation failed
        setSession((prev) => commitCommander(prev, enrichedCommander, partnerData))
      })
      .catch(err => {
        console.warn('[commit] DB validation failed — committing anyway:', err)
        // Fallback: commit without validation (better UX than blocking)
        setSession((prev) => commitCommander(prev, commander))
      })
  }, [messages])

  /**
   * Handle commander selection from chat crown button.
   * Takes just the card name (or "Name1 & Name2" for partners) and constructs a CommanderOption to commit.
   */
  const handleCommitCommanderFromChat = useCallback((cardNameOrPair: string) => {
    // Check if this is a partner pair: "Name1 & Name2"
    const partnerMatch = cardNameOrPair.match(/^(.+?)\s*&\s*(.+)$/)
    
    if (partnerMatch) {
      // Partner pair — validate and commit both
      const [, name1, name2] = partnerMatch
      
      const commanderOption: CommanderOption = {
        name: name1.trim(),
        partnerName: name2.trim(),
        colourIdentity: [], // Will be resolved in handleCommitCommander
        artUrl: '',
        scryfallId: name1.trim().toLowerCase().replace(/[^a-z0-9]/g, '-'),
        partnerScryfallId: name2.trim().toLowerCase().replace(/[^a-z0-9]/g, '-'),
        leadershipType: 'partner',
        owned: false,
        description: '',
      }
      handleCommitCommander(commanderOption)
    } else {
      // Single commander
      const commanderOption: CommanderOption = {
        name: cardNameOrPair,
        colourIdentity: [], // Will be resolved in handleCommitCommander
        artUrl: '',
        scryfallId: cardNameOrPair.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        owned: false,
        description: '',
      }
      handleCommitCommander(commanderOption)
    }
  }, [handleCommitCommander])

  // -------------------------------------------------------------------------
  // Auto-commit effect — process pending commander from URL parameter
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!pendingCommanderKey || isHydrating) return
    
    let cancelled = false
    
    async function autoCommitCommander() {
      try {
        // Look up commander by canonical key or fuzzy name match
        const cardRes = await fetch(
          `/api/cards?name=${encodeURIComponent(pendingCommanderKey)}&action=full&fuzzy=true`
        )
        
        if (!cardRes.ok) {
          console.warn(`[auto-commit] Could not find commander: ${pendingCommanderKey}`)
          setPendingCommanderKey(null)
          return
        }
        
        const cardData = await cardRes.json()
        if (!cardData?.name || cancelled) {
          console.warn(`[auto-commit] Invalid card data for: ${pendingCommanderKey}`)
          setPendingCommanderKey(null)
          return
        }
        
        console.log('[auto-commit] Committing commander from URL:', cardData.name)
        
        // Add a welcome message acknowledging the commander
        setMessages([{
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: `Let's build **${cardData.name}**! I'll set up the deck and we can start brewing.`,
          timestamp: Date.now(),
        }])
        
        // Clear the pending key
        setPendingCommanderKey(null)
        
        // Use the chat-based commit which handles the full flow
        handleCommitCommanderFromChat(cardData.name)
      } catch (err) {
        console.error('[auto-commit] Failed:', err)
        setPendingCommanderKey(null)
      }
    }
    
    autoCommitCommander()
    
    return () => { cancelled = true }
  }, [pendingCommanderKey, isHydrating, handleCommitCommanderFromChat])

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
          body: JSON.stringify({ 
            sessionId: session.sessionId,
            collectionMode: session.collectionMode,
          }),
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
  // Handlers — Card name click (opens detail modal)
  // -------------------------------------------------------------------------

  const handleCardNameClick = useCallback((cardName: string) => {
    setSelectedCard(cardName)
  }, [])

  // -------------------------------------------------------------------------
  // Handlers — Add card from chat (click [[Card Name]] in building phase)
  // -------------------------------------------------------------------------

  const handleAddCardFromChat = useCallback((cardName: string) => {
    console.log('[handleAddCardFromChat] Called with:', cardName, 'phase:', session.phase)
    
    // Only allow adding cards during building phase
    if (session.phase !== 'building') {
      console.log('[handleAddCardFromChat] Rejected: not in building phase')
      return
    }

    // Don't add duplicates
    if (deckState.cards.some(c => c.card_name === cardName)) {
      console.log('[handleAddCardFromChat] Rejected: card already in deck')
      return
    }

    console.log('[handleAddCardFromChat] Adding card to deck')
    
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

    // Enrich with DB data async (CMC, type_line)
    fetch(`/api/cards?name=${encodeURIComponent(frontFace(cardName))}&action=enrich`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          dispatchDeck({
            type: 'enrichCard',
            card_name: cardName,
            cmc: data.cmc ?? 0,
            type_line: data.type_line ?? '',
            oracle_text: '',
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
          collectionMode: session.collectionMode,
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
                  const displayNames = parsed.commanders.map((c: { name: string; partner_name?: string }) => 
                    c.partner_name ? `${c.name} & ${c.partner_name}` : c.name
                  )
                  console.log('[brew-canvas] Received candidates SSE event:', parsed.commanders.length, 'commanders:', displayNames)
                  const newCandidates: CommanderOption[] = parsed.commanders.map((cmd: { 
                    name: string
                    partner_name?: string
                    color_identity?: string[]
                    leadership_type?: LeadershipType 
                  }) => ({
                    name: cmd.name,
                    artUrl: '', // Will be populated async from DB
                    colourIdentity: cmd.color_identity ?? [],
                    description: '',
                    owned: false,
                    scryfallId: cmd.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    partnerName: cmd.partner_name,
                    partnerScryfallId: cmd.partner_name?.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    leadershipType: cmd.leadership_type ?? (cmd.partner_name ? 'partner' : 'single'),
                  }))
                  setCandidateCards(prev => {
                    // Merge new candidates with existing (dedup by name)
                    const existingNames = new Set(prev.map(c => c.name))
                    const fresh = newCandidates.filter(c => !existingNames.has(c.name))
                    console.log('[brew-canvas] Adding', fresh.length, 'new candidates to canvas (existing:', prev.length, ')')
                    
                    // Fetch art URLs for new candidates from DB
                    for (const candidate of fresh) {
                      fetch(`/api/cards?name=${encodeURIComponent(frontFace(candidate.name))}&action=printing`)
                        .then(res => res.ok ? res.json() : null)
                        .then(printing => {
                          if (printing?.image_uri_art_crop) {
                            setCandidateCards(cards => 
                              cards.map(c => 
                                c.name === candidate.name 
                                  ? { ...c, artUrl: printing.image_uri_art_crop }
                                  : c
                              )
                            )
                          }
                        })
                        .catch(() => {})
                    }
                    
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

                    // Enrich async from DB
                    fetch(`/api/cards?name=${encodeURIComponent(frontFace(cardData.name))}&action=enrich`)
                      .then(res => res.ok ? res.json() : null)
                      .then(data => {
                        if (data) {
                          dispatchDeck({
                            type: 'enrichCard',
                            card_name: cardData.name,
                            cmc: data.cmc ?? 0,
                            type_line: data.type_line ?? '',
                            oracle_text: '',
                          })
                        }
                      })
                      .catch(() => {})
                  }
                } else if (parsed.type === 'commander_summary' && parsed.summary) {
                  // Structured commander summary from present_commander_summary tool
                  console.log('[brew-chat] Received commander_summary SSE event:', parsed.summary.name, 'owned:', parsed.summary.collection_status?.owned, 'image_uri:', parsed.summary.image_uri || '(empty)')
                  // Add the summary as a special message immediately so it appears inline
                  const summaryMsg: ChatMessage = {
                    id: `summary-${Date.now()}`,
                    role: 'assistant',
                    content: '', // Content rendered via commanderSummary field
                    timestamp: Date.now(),
                    commanderSummary: {
                      type: 'commander_summary',
                      ...parsed.summary,
                    },
                  }
                  setMessages((prev) => [...prev, summaryMsg])
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
          <p className="text-[length:var(--fs-md)] text-zinc-400">Restoring session…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
      {/* Topbar — minimal for exploration, full for building */}
      {session.phase === 'exploring' ? (
        <div className="flex-none flex items-center px-6 py-4 border-b border-zinc-800/50">
          <button
            onClick={handleBack}
            className="text-[14px] text-zinc-500 hover:text-white transition-colors"
          >
            ←
          </button>
          <h1 className="ml-4 text-[14px] font-medium text-emerald-400">
            {messages.length > 0 && messages[0].role === 'user' 
              ? inferDeckName(messages[0].content)
              : 'New Brew'}
          </h1>
        </div>
      ) : (
        <BrewTopbar
          phase={session.phase}
          commander={session.commander}
          onBack={handleBack}
          selectedModelId={selectedModelId}
          onModelChange={handleModelChange}
          isStreaming={isStreaming}
          isSaving={isSaving}
          lastSavedAt={lastSavedAt}
          collectionMode={session.collectionMode}
          onCollectionModeChange={handleCollectionModeChange}
        />
      )}

      {/* Main content — chat view for exploration (no candidates), canvas otherwise */}
      {session.phase === 'exploring' && candidateCards.length === 0 ? (
        <BrewChatView
          messages={messages}
          onSend={handleSendMessage}
          isStreaming={isStreaming}
          activeTools={activeTools}
          hasCommander={!!session.commander}
          onCommitCommander={handleCommitCommander}
          onAddCard={handleAddCardFromChat}
        />
      ) : (
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
      )}

      {/* Card detail modal — opens when card name is clicked */}
      <CommanderDetailModal
        cardName={selectedCard}
        onClose={() => setSelectedCard(null)}
        onSelectCommander={session.phase === 'building' ? undefined : handleCommitCommander}
        hideSelectButton={session.phase === 'building' || !!session.commander}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utils — Deck name inference
// ---------------------------------------------------------------------------

/** Infer a deck name from the user's first message */
function inferDeckName(message: string): string {
  // Common patterns: "I want to build a X deck", "build around X", "X commander"
  const patterns = [
    /(?:build|make|create|brew)\s+(?:a\s+)?(.+?)\s+deck/i,
    /(?:build|brew)\s+(?:around\s+)?(.+)/i,
    /(.+?)\s+(?:deck|commander|build)/i,
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      const name = match[1].trim()
      // Capitalize first letter of each word
      return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') + ' Deck'
    }
  }
  
  // Fallback: just use first few words
  const words = message.split(' ').slice(0, 3).join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
