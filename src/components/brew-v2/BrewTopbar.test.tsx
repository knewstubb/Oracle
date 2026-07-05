import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrewTopbar } from './BrewTopbar'
import type { CommittedCommander } from '@/lib/brew-v2-types'

describe('BrewTopbar', () => {
  const mockOnBack = vi.fn()

  beforeEach(() => {
    mockOnBack.mockClear()
  })

  describe('ExplorationTopbar (phase = exploring)', () => {
    it('renders back navigation button with "Decks" text', () => {
      render(<BrewTopbar phase="exploring" onBack={mockOnBack} />)
      const backBtn = screen.getByRole('button', { name: /decks/i })
      expect(backBtn).toBeInTheDocument()
    })

    it('calls onBack when back button is clicked', () => {
      render(<BrewTopbar phase="exploring" onBack={mockOnBack} />)
      fireEvent.click(screen.getByRole('button', { name: /decks/i }))
      expect(mockOnBack).toHaveBeenCalledTimes(1)
    })

    it('renders "New brew" title', () => {
      render(<BrewTopbar phase="exploring" onBack={mockOnBack} />)
      expect(screen.getByText('New brew')).toBeInTheDocument()
    })

    it('renders blue "Brew" badge', () => {
      render(<BrewTopbar phase="exploring" onBack={mockOnBack} />)
      const badge = screen.getByText('Brew')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-blue-600/20')
      expect(badge.className).toContain('text-blue-400')
    })

    it('renders "Exploring" phase label', () => {
      render(<BrewTopbar phase="exploring" onBack={mockOnBack} />)
      expect(screen.getByText('Exploring')).toBeInTheDocument()
    })

    it('renders green "Session active" indicator', () => {
      render(<BrewTopbar phase="exploring" onBack={mockOnBack} />)
      expect(screen.getByText('Session active')).toBeInTheDocument()
    })
  })

  describe('BuildingTopbar (phase = building)', () => {
    const commander: CommittedCommander = {
      name: 'Muldrotha, the Gravetide',
      artUrl: 'https://example.com/art.jpg',
      typeLine: 'Legendary Creature — Elemental Avatar',
      colourIdentity: ['B', 'U', 'G'],
      archetype: 'Graveyard Value',
    }

    it('renders commander name instead of "New brew"', () => {
      render(<BrewTopbar phase="building" commander={commander} onBack={mockOnBack} />)
      expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
      expect(screen.queryByText('New brew')).not.toBeInTheDocument()
    })

    it('renders blue "Brew" badge', () => {
      render(<BrewTopbar phase="building" commander={commander} onBack={mockOnBack} />)
      const badge = screen.getByText('Brew')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-blue-600/20')
    })

    it('renders archetype in metadata strip', () => {
      render(<BrewTopbar phase="building" commander={commander} onBack={mockOnBack} />)
      expect(screen.getByText('Graveyard Value')).toBeInTheDocument()
    })

    it('renders colour pips for the commander identity', () => {
      render(<BrewTopbar phase="building" commander={commander} onBack={mockOnBack} />)
      const pips = screen.getByRole('img', { name: /blue, black, green/i })
      expect(pips).toBeInTheDocument()
    })

    it('renders green "Session active" indicator', () => {
      render(<BrewTopbar phase="building" commander={commander} onBack={mockOnBack} />)
      expect(screen.getByText('Session active')).toBeInTheDocument()
    })

    it('falls back to ExplorationTopbar when phase is building but no commander provided', () => {
      render(<BrewTopbar phase="building" commander={null} onBack={mockOnBack} />)
      expect(screen.getByText('New brew')).toBeInTheDocument()
    })
  })
})
