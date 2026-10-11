import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommanderSuggestionCard } from './CommanderSuggestionCard'

const getCardInfoMock = vi.fn()

vi.mock('@/components/CardHoverPreview', () => ({
  getCardInfo: (...args: unknown[]) => getCardInfoMock(...args),
}))

describe('CommanderSuggestionCard', () => {
  beforeEach(() => {
    getCardInfoMock.mockReset()
  })

  it('renders the commander art built from the resolved scryfall id', async () => {
    getCardInfoMock.mockResolvedValue({
      scryfallId: 'abc12345-6789-0000-0000-000000000000',
      canBeCommander: true,
    })

    render(<CommanderSuggestionCard commanderName="Atraxa, Praetors' Voice" />)

    const img = await screen.findByAltText("Atraxa, Praetors' Voice")
    expect(img).toHaveAttribute(
      'src',
      'https://cards.scryfall.io/normal/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
    )
  })

  it('shows the placeholder when the card has no scryfall id', async () => {
    getCardInfoMock.mockResolvedValue({ scryfallId: null, canBeCommander: false })

    render(<CommanderSuggestionCard commanderName="Unknown Card" />)

    expect(await screen.findByText('No image')).toBeInTheDocument()
  })
})
