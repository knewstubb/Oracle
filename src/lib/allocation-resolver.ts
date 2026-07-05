/**
 * Allocation Resolver — Pure deterministic function
 *
 * Computes which physical card printing is assigned to which deck slot.
 * No database access, no side effects, no randomness.
 *
 * Algorithm:
 * 1. For shared cards (2+ decks): apply overrides → sort by priority → assign originals until supply exhausted → proxy the rest
 * 2. For single-deck cards: assign original if owned, else proxy
 * 3. Printing selection: prefer matching scryfall_id, then most recent (last in list), then non-foil
 *
 * Validates: Requirements 2.1, 2.2, 7.1, 7.2, 7.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllocationInput {
  /** All deck slots: card_name → list of deck IDs that contain it */
  demandMap: Map<string, number[]>
  /** Collection: card_name → list of available printings */
  supplyMap: Map<string, PrintingSupply[]>
  /** Deck priority order (deck_id → priority number, lower = higher priority) */
  deckPriority: Map<number, number>
  /** Manual overrides: "card_name|deck_id" → 'pin_original' | 'pin_proxy' */
  overrides: Map<string, 'pin_original' | 'pin_proxy'>
  /** Optional: preferred scryfall_id per card-deck pair for printing selection */
  preferredPrintings?: Map<string, string> // "card_name|deck_id" → scryfall_id
}

export interface PrintingSupply {
  scryfallId: string
  setCode: string
  collectorNumber: string
  quantity: number
  /** Whether this printing is a foil (used for tie-breaking) */
  isFoil?: boolean
}

export interface AllocationOutput {
  /** Every card-deck pair gets a definitive role */
  allocations: AllocationRecord[]
  /** Cards where demand exceeds supply (informational) */
  proxyReport: ProxyReportEntry[]
}

export interface AllocationRecord {
  cardName: string
  deckId: number
  role: 'original' | 'proxy'
  scryfallId: string | null
  setCode: string | null
  collectorNumber: string | null
  priorityOverride: boolean
}

export interface ProxyReportEntry {
  cardName: string
  totalDemand: number
  totalSupply: number
  deficit: number
  proxyDecks: number[]
  originalDecks: number[]
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Compute allocation for all deck slots.
 *
 * Determinism guarantee: For the same input, the output is always identical.
 * No randomness, no timestamp-dependent ordering, no external state.
 */
export function computeAllocations(input: AllocationInput): AllocationOutput {
  const { demandMap, supplyMap, deckPriority, overrides, preferredPrintings } = input
  const allocations: AllocationRecord[] = []
  const proxyReport: ProxyReportEntry[] = []

  // Process each card in deterministic order (sorted by card name)
  const cardNames = Array.from(demandMap.keys()).sort()

  for (const cardName of cardNames) {
    const deckIds = demandMap.get(cardName)!
    const supply = supplyMap.get(cardName) || []
    const totalSupply = supply.reduce((sum, p) => sum + p.quantity, 0)

    // Build a mutable supply tracker: scryfallId → remaining quantity
    const supplyTracker = new Map<string, number>()
    for (const printing of supply) {
      supplyTracker.set(printing.scryfallId, (supplyTracker.get(printing.scryfallId) || 0) + printing.quantity)
    }

    const originalDecks: number[] = []
    const proxyDecks: number[] = []

    if (deckIds.length === 1) {
      // Single-deck card: check for override, then assign original if owned, else proxy
      const deckId = deckIds[0]
      const overrideKey = `${cardName}|${deckId}`
      const override = overrides.get(overrideKey)

      if (override === 'pin_original') {
        // Override: force original regardless of supply
        const printing = totalSupply > 0
          ? selectPrinting(cardName, deckId, supply, supplyTracker, preferredPrintings)
          : null
        allocations.push({
          cardName,
          deckId,
          role: 'original',
          scryfallId: printing?.scryfallId ?? null,
          setCode: printing?.setCode ?? null,
          collectorNumber: printing?.collectorNumber ?? null,
          priorityOverride: true,
        })
        originalDecks.push(deckId)
      } else if (override === 'pin_proxy') {
        // Override: force proxy regardless of supply
        allocations.push({
          cardName,
          deckId,
          role: 'proxy',
          scryfallId: null,
          setCode: null,
          collectorNumber: null,
          priorityOverride: true,
        })
        proxyDecks.push(deckId)
      } else if (totalSupply > 0) {
        const printing = selectPrinting(cardName, deckId, supply, supplyTracker, preferredPrintings)
        allocations.push({
          cardName,
          deckId,
          role: 'original',
          scryfallId: printing?.scryfallId ?? null,
          setCode: printing?.setCode ?? null,
          collectorNumber: printing?.collectorNumber ?? null,
          priorityOverride: false,
        })
        originalDecks.push(deckId)
      } else {
        allocations.push({
          cardName,
          deckId,
          role: 'proxy',
          scryfallId: null,
          setCode: null,
          collectorNumber: null,
          priorityOverride: false,
        })
        proxyDecks.push(deckId)
      }
    } else {
      // Shared card (2+ decks): apply overrides, then priority ordering
      const pinOriginal: number[] = []
      const pinProxy: number[] = []
      const unresolved: number[] = []

      for (const deckId of deckIds) {
        const key = `${cardName}|${deckId}`
        const override = overrides.get(key)
        if (override === 'pin_original') {
          pinOriginal.push(deckId)
        } else if (override === 'pin_proxy') {
          pinProxy.push(deckId)
        } else {
          unresolved.push(deckId)
        }
      }

      // Step 1: Process pin_original overrides (consume supply)
      for (const deckId of pinOriginal.sort((a, b) => a - b)) {
        const printing = selectPrinting(cardName, deckId, supply, supplyTracker, preferredPrintings)
        if (printing) {
          allocations.push({
            cardName,
            deckId,
            role: 'original',
            scryfallId: printing.scryfallId,
            setCode: printing.setCode,
            collectorNumber: printing.collectorNumber,
            priorityOverride: true,
          })
          originalDecks.push(deckId)
        } else {
          // Override wants original but no supply left — still honour the override
          // (design says: honour override, emit warning via proxy report)
          allocations.push({
            cardName,
            deckId,
            role: 'original',
            scryfallId: null,
            setCode: null,
            collectorNumber: null,
            priorityOverride: true,
          })
          originalDecks.push(deckId)
        }
      }

      // Step 2: Process pin_proxy overrides (forced proxy, no supply consumed)
      for (const deckId of pinProxy.sort((a, b) => a - b)) {
        allocations.push({
          cardName,
          deckId,
          role: 'proxy',
          scryfallId: null,
          setCode: null,
          collectorNumber: null,
          priorityOverride: true,
        })
        proxyDecks.push(deckId)
      }

      // Step 3: Sort remaining decks by priority (lower = higher priority), tie-break by deck ID ASC
      const sortedUnresolved = unresolved.sort((a, b) => {
        const prioA = deckPriority.get(a) ?? Number.MAX_SAFE_INTEGER
        const prioB = deckPriority.get(b) ?? Number.MAX_SAFE_INTEGER
        if (prioA !== prioB) return prioA - prioB
        return a - b // tie-break: deck ID ASC (oldest first)
      })

      // Step 4: Assign physical copies top-down until supply exhausted
      for (const deckId of sortedUnresolved) {
        const printing = selectPrinting(cardName, deckId, supply, supplyTracker, preferredPrintings)
        if (printing) {
          allocations.push({
            cardName,
            deckId,
            role: 'original',
            scryfallId: printing.scryfallId,
            setCode: printing.setCode,
            collectorNumber: printing.collectorNumber,
            priorityOverride: false,
          })
          originalDecks.push(deckId)
        } else {
          // Step 5: No supply left → proxy
          allocations.push({
            cardName,
            deckId,
            role: 'proxy',
            scryfallId: null,
            setCode: null,
            collectorNumber: null,
            priorityOverride: false,
          })
          proxyDecks.push(deckId)
        }
      }
    }

    // Build proxy report entry if there's a deficit
    const totalDemand = deckIds.length
    if (proxyDecks.length > 0) {
      proxyReport.push({
        cardName,
        totalDemand,
        totalSupply,
        deficit: Math.max(0, totalDemand - totalSupply),
        proxyDecks: proxyDecks.sort((a, b) => a - b),
        originalDecks: originalDecks.sort((a, b) => a - b),
      })
    }
  }

  return { allocations, proxyReport }
}

// ---------------------------------------------------------------------------
// Printing Selection
// ---------------------------------------------------------------------------

/**
 * Select the best available printing for a deck slot.
 * Returns null if no supply is available.
 *
 * Priority:
 * 1. Prefer the printing already in deck_cards (matching scryfall_id from preferredPrintings)
 * 2. If no match, prefer the most recently acquired (last in supply list)
 * 3. If tied, prefer non-foil over foil
 *
 * Consumes one unit from the supply tracker upon selection.
 */
function selectPrinting(
  cardName: string,
  deckId: number,
  supply: PrintingSupply[],
  supplyTracker: Map<string, number>,
  preferredPrintings?: Map<string, string>
): PrintingSupply | null {
  // Filter to printings that still have available quantity
  const available = supply.filter((p) => (supplyTracker.get(p.scryfallId) || 0) > 0)
  if (available.length === 0) return null

  const key = `${cardName}|${deckId}`
  const preferredId = preferredPrintings?.get(key)

  let selected: PrintingSupply | null = null

  // Priority 1: Prefer the printing already recorded in deck_cards
  if (preferredId) {
    const match = available.find((p) => p.scryfallId === preferredId)
    if (match) {
      selected = match
    }
  }

  // Priority 2: Prefer the most recently acquired (last in supply list among available)
  if (!selected) {
    // Among available, find the one that appears latest in the supply array
    // Tie-break: prefer non-foil
    const candidates = [...available]
    candidates.sort((a, b) => {
      // Later in original supply list = more recent
      const indexA = supply.indexOf(a)
      const indexB = supply.indexOf(b)
      if (indexA !== indexB) return indexB - indexA // higher index = more recent = first
      // Priority 3: non-foil preferred
      const foilA = a.isFoil ? 1 : 0
      const foilB = b.isFoil ? 1 : 0
      return foilA - foilB // non-foil (0) before foil (1)
    })
    selected = candidates[0]
  }

  // Consume one unit from supply tracker
  if (selected) {
    const remaining = supplyTracker.get(selected.scryfallId) || 0
    supplyTracker.set(selected.scryfallId, remaining - 1)
  }

  return selected
}
