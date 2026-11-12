import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ChatProposalCards, copyStillLine, receiptText, type ProposalGroup } from './ChatProposalCards'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const group: ProposalGroup = {
  deckId: 7,
  deckName: 'Korvold',
  proposals: [
    { proposalId: 'p1', cardName: 'Sol Ring', reason: 'Fast mana', category: 'Ramp', state: 'ready', ownershipLine: "You own it, it's in Prosper. Adding it makes a planned slot here and leaves the card in Prosper." },
    { proposalId: 'p2', cardName: 'Arcane Signet', state: 'ready' },
    { proposalId: 'p3', cardName: 'Cultivate', state: 'blocked', blockReason: 'in_deck', blockText: 'Cultivate is already in this deck.' },
  ],
}

function reply(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body }
}

describe('ChatProposalCards', () => {
  it('shows ready cards with Add, Not now, and blocked cards with a reason and no button', () => {
    render(<ChatProposalCards group={group} />)
    expect(screen.getByLabelText('Add Sol Ring to Korvold')).toBeTruthy()
    expect(screen.getByText('Cultivate is already in this deck.')).toBeTruthy()
    expect(screen.queryByLabelText('Add Cultivate to Korvold')).toBeNull()
    expect(screen.getByText('Add all (2)')).toBeTruthy()
  })

  it('sends nothing until Add is clicked', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ChatProposalCards group={group} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says Added only after the server replies, then offers Undo and undoes', async () => {
    let release: (v: unknown) => void = () => {}
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { release = r }))
      .mockResolvedValueOnce(reply(200, { undone: ['p1'], refused: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const changed = vi.fn()
    render(<ChatProposalCards group={group} onDeckChanged={changed} />)
    fireEvent.click(screen.getByLabelText('Add Sol Ring to Korvold'))
    expect(screen.queryByText('Added')).toBeNull()
    expect((screen.getByText('Adding…').closest('button') as HTMLButtonElement).disabled).toBe(true)
    release(reply(200, { added: [{ proposalId: 'p1', deckCardId: 1 }], skipped: [], deckCardCount: 60 }))
    await screen.findByText('Added')
    expect(screen.getByText("Added Sol Ring to Korvold. Your copy is still in Prosper.")).toBeTruthy()
    expect(changed).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Undo'))
    await screen.findByText('Removed again. Nothing else changed.')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/decks/7/chat-proposals/undo')
  })

  it('planned-slot wording when the card is not owned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { added: [{ proposalId: 'p2', deckCardId: 2 }], skipped: [], deckCardCount: 40 })))
    render(<ChatProposalCards group={group} />)
    fireEvent.click(screen.getByLabelText('Add Arcane Signet to Korvold'))
    await screen.findByText("Added Arcane Signet to Korvold. It's a planned slot; no copy was moved.")
  })

  it('warns when the deck passes 100 cards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { added: [{ proposalId: 'p2', deckCardId: 2 }], skipped: [], deckCardCount: 101 })))
    render(<ChatProposalCards group={group} />)
    fireEvent.click(screen.getByLabelText('Add Arcane Signet to Korvold'))
    await waitFor(() => expect(screen.getByText(/Deck now has 101 cards\./)).toBeTruthy())
  })

  it('Add all sends every ready id in one call with one receipt and one Undo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, {
      added: [{ proposalId: 'p1', deckCardId: 1 }],
      skipped: [{ proposalId: 'p2', blockReason: 'in_deck', blockText: 'Arcane Signet is already in this deck.' }],
      deckCardCount: 50,
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ChatProposalCards group={group} />)
    fireEvent.click(screen.getByText('Add all (2)'))
    await screen.findByText('Arcane Signet is already in this deck.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ proposalIds: ['p1', 'p2'] })
  })

  it('shows a retry message when the server fails, and never says Added', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(500, { error: 'x' })))
    render(<ChatProposalCards group={group} />)
    fireEvent.click(screen.getByLabelText('Add Sol Ring to Korvold'))
    await screen.findByText("Couldn't add Sol Ring. Try again.")
    expect(screen.queryByText('Added')).toBeNull()
  })

  it('shows expired and already-used messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(410, {})))
    render(<ChatProposalCards group={group} />)
    fireEvent.click(screen.getByLabelText('Add Sol Ring to Korvold'))
    await screen.findByText('This suggestion has expired. Ask me again.')
  })

  it('Not now hides the card and tells the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, {}))
    vi.stubGlobal('fetch', fetchMock)
    render(<ChatProposalCards group={group} />)
    fireEvent.click(screen.getAllByText('Not now')[0])
    expect(screen.queryByLabelText('Add Sol Ring to Korvold')).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/decks/7/chat-proposals/dismiss')
  })

  it('shows the refusal text when undo is refused', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(reply(200, { added: [{ proposalId: 'p1', deckCardId: 1 }], skipped: [], deckCardCount: 40 }))
      .mockResolvedValueOnce(reply(200, { undone: [], refused: [{ proposalId: 'p1', text: 'You have since changed that card, so I left it.' }] })))
    render(<ChatProposalCards group={group} />)
    fireEvent.click(screen.getByLabelText('Add Sol Ring to Korvold'))
    fireEvent.click(await screen.findByText('Undo'))
    await screen.findByText('You have since changed that card, so I left it.')
  })

  it('helper wording', () => {
    expect(copyStillLine("You own it, it's in Prosper. Adding it makes a planned slot here and leaves the card in Prosper.")).toBe('Your copy is still in Prosper.')
    expect(copyStillLine(undefined)).toBeNull()
    expect(receiptText('K', [group.proposals[1]], [], 1, 100)).not.toContain('Deck now')
  })
})
