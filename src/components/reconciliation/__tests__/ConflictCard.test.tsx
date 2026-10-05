import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConflictCard } from '../ConflictCard'
import type { ConflictPrintingRow, ConflictInstance } from '@/types/import-reconciliation'

function makeInstance(overrides: Partial<ConflictInstance>): ConflictInstance {
  return {
    claimId: 1,
    deckCardsId: 10,
    deckId: 1,
    deckName: 'Test Deck',
    state: 'planned',
    selectedPrintingId: null,
    effectivePrintingId: 'printing-1',
    wishlisted: true,
    slotState: 'planned_unowned',
    canSleeve: false,
    alternateAvailable: false,
    alreadyClaimed: false,
    overAllocated: false,
    competingDemand: 1,
    resolved: false,
    claimedBy: [],
    ...overrides,
  }
}

function makeRow(overrides: Partial<ConflictPrintingRow>): ConflictPrintingRow {
  return {
    cardName: 'Sol Ring',
    printingId: 'printing-1',
    oracleId: 'oracle-1',
    setCode: '2XM',
    setName: 'Double Masters',
    collectorNumber: '270',
    finish: 'nonfoil',
    imageUriSmall: null,
    imageUriNormal: null,
    imageUriLarge: null,
    owned: 1,
    availableSupply: 0,
    ownedAnyPrinting: 1,
    freeProxies: 0,
    claimedBy: [],
    ownership: 'owned',
    printingMismatch: false,
    overAllocated: false,
    resolved: false,
    instances: [],
    alternatePrintings: [],
    ...overrides,
  }
}

describe('ConflictCard', () => {
  it('renders "Already claimed" for planned_claimed, not "Alternate printing available"', () => {
    const row = makeRow({
      instances: [
        makeInstance({
          claimId: 1,
          deckName: 'mURZAnary tactics',
          slotState: 'planned_claimed',
          alreadyClaimed: true,
          alternateAvailable: false,
        }),
      ],
    })

    render(<ConflictCard printing={row} onInstanceStateChange={vi.fn()} />)

    expect(screen.getAllByText('Already claimed').length).toBeGreaterThan(0)
    expect(screen.queryByText('Alternate printing available')).not.toBeInTheDocument()
  })

  it('renders "Alternate printing available" for planned_alt_available, not "Already claimed"', () => {
    const row = makeRow({
      instances: [
        makeInstance({
          claimId: 2,
          deckName: 'Big Butt',
          slotState: 'planned_alt_available',
          alreadyClaimed: false,
          alternateAvailable: true,
        }),
      ],
    })

    render(<ConflictCard printing={row} onInstanceStateChange={vi.fn()} />)

    expect(screen.getAllByText('Alternate printing available').length).toBeGreaterThan(0)
    expect(screen.queryByText('Already claimed')).not.toBeInTheDocument()
  })

  it('renders no descriptor for a plain planned_unowned instance', () => {
    const row = makeRow({
      ownership: 'unowned',
      instances: [
        makeInstance({
          claimId: 3,
          deckName: 'Wishlist Deck',
          slotState: 'planned_unowned',
        }),
      ],
    })

    render(<ConflictCard printing={row} onInstanceStateChange={vi.fn()} />)

    expect(screen.queryByText('Already claimed')).not.toBeInTheDocument()
    expect(screen.queryByText('Alternate printing available')).not.toBeInTheDocument()
  })

  it('shows "Sleeved (owned)" style resolution without a warning descriptor for sleeved_owned', () => {
    const row = makeRow({
      resolved: true,
      instances: [
        makeInstance({
          claimId: 4,
          deckName: 'mURZAnary tactics',
          state: 'sleeved',
          slotState: 'sleeved_owned',
          canSleeve: true,
          resolved: true,
        }),
      ],
    })

    render(<ConflictCard printing={row} onInstanceStateChange={vi.fn()} />)

    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.queryByText('Already claimed')).not.toBeInTheDocument()
    expect(screen.queryByText('Alternate printing available')).not.toBeInTheDocument()
  })

  it('labels other decks that also want the card when viewing one deck', () => {
    const row = makeRow({
      instances: [
        makeInstance({ claimId: 5, deckId: 2, deckName: 'Blight Curse Original' }),
        makeInstance({ claimId: 6, deckId: 1, deckName: 'Blight Curse Clone' }),
      ],
    })

    render(<ConflictCard printing={row} focusDeckId={1} onInstanceStateChange={vi.fn()} />)

    expect(screen.getByText('Also wanted by')).toBeInTheDocument()
    expect(screen.getByText('Blight Curse Original')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Sol Ring state for Blight Curse Original' })).toBeInTheDocument()
  })

  it('falls back to the Scryfall image when the card database has no image', () => {
    const id = 'd43ef6eb-99ed-45a6-aee1-e87d3780d094'
    const row = makeRow({ printingId: id, imageUriSmall: null, instances: [makeInstance({})] })

    const { container } = render(<ConflictCard printing={row} onInstanceStateChange={vi.fn()} />)

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      `https://cards.scryfall.io/small/front/d/4/${id}.jpg`
    )
  })
})
