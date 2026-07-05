import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RatingsSection } from './RatingsSection'
import type { AttributeScores, ContributingCards } from '@/lib/rating-engine'

const mockScores: AttributeScores = {
  consistency: 7,
  resilience: 5,
  interaction: 8,
  speed: 4,
}

const mockContributingCards: ContributingCards = {
  tutors: ['Demonic Tutor', 'Vampiric Tutor'],
  drawEngines: ['Rhystic Study'],
  recursion: ['Eternal Witness', 'Regrowth'],
  removal: ['Swords to Plowshares', 'Path to Exile', 'Beast Within'],
  counterspells: ['Counterspell', 'Swan Song'],
  boardWipes: ['Wrath of God'],
  fastMana: ['Sol Ring', 'Mana Crypt'],
}

describe('RatingsSection', () => {
  it('renders all four attribute labels', () => {
    render(
      <RatingsSection scores={mockScores} contributingCards={mockContributingCards} />
    )
    expect(screen.getByText('Consistency')).toBeInTheDocument()
    expect(screen.getByText('Resilience')).toBeInTheDocument()
    expect(screen.getByText('Interaction')).toBeInTheDocument()
    expect(screen.getByText('Speed')).toBeInTheDocument()
  })

  it('renders X/10 score labels for each attribute', () => {
    render(
      <RatingsSection scores={mockScores} contributingCards={mockContributingCards} />
    )
    expect(screen.getByText('7/10')).toBeInTheDocument()
    expect(screen.getByText('5/10')).toBeInTheDocument()
    expect(screen.getByText('8/10')).toBeInTheDocument()
    expect(screen.getByText('4/10')).toBeInTheDocument()
  })

  it('renders progressbars with correct aria values', () => {
    render(
      <RatingsSection scores={mockScores} contributingCards={mockContributingCards} />
    )
    const progressbars = screen.getAllByRole('progressbar')
    expect(progressbars).toHaveLength(4)

    // Consistency = 7
    expect(progressbars[0]).toHaveAttribute('aria-valuenow', '7')
    expect(progressbars[0]).toHaveAttribute('aria-valuemin', '1')
    expect(progressbars[0]).toHaveAttribute('aria-valuemax', '10')

    // Resilience = 5
    expect(progressbars[1]).toHaveAttribute('aria-valuenow', '5')

    // Interaction = 8
    expect(progressbars[2]).toHaveAttribute('aria-valuenow', '8')

    // Speed = 4
    expect(progressbars[3]).toHaveAttribute('aria-valuenow', '4')
  })

  it('clicking expand shows contributing cards', async () => {
    const user = userEvent.setup()
    render(
      <RatingsSection scores={mockScores} contributingCards={mockContributingCards} />
    )

    // Click the Consistency button to expand
    const consistencyButton = screen.getByRole('button', { name: /Consistency/i })
    await user.click(consistencyButton)

    // Should show tutor and draw engine cards
    expect(screen.getByText('Tutors (2)')).toBeInTheDocument()
    expect(screen.getByText('Demonic Tutor, Vampiric Tutor')).toBeInTheDocument()
    expect(screen.getByText('Draw Engines (1)')).toBeInTheDocument()
    expect(screen.getByText('Rhystic Study')).toBeInTheDocument()
  })

  it('clicking collapse hides contributing cards', async () => {
    const user = userEvent.setup()
    render(
      <RatingsSection scores={mockScores} contributingCards={mockContributingCards} />
    )

    // Expand Consistency
    const consistencyButton = screen.getByRole('button', { name: /Consistency/i })
    await user.click(consistencyButton)
    expect(screen.getByText('Tutors (2)')).toBeInTheDocument()

    // Collapse it
    await user.click(consistencyButton)
    expect(screen.queryByText('Tutors (2)')).not.toBeInTheDocument()
  })
})
