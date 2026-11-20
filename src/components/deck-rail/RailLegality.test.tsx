import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RailLegalityView } from './RailLegality'

describe('RailLegalityView', () => {
  it('Legal: neutral check, headline and what was checked', () => {
    render(<RailLegalityView view={{ status: 'legal', bullets: [], subline: '100 cards · singleton · colour identity · no banned cards' }} />)
    expect(screen.getByText('Legal for Commander')).toBeInTheDocument()
    expect(screen.getByText('100 cards · singleton · colour identity · no banned cards')).toBeInTheDocument()
    expect(screen.getByTestId('rail-legality')).toHaveAttribute('data-state', 'legal')
  })
  it('Not legal: bordered banner with an icon, headline and one bullet per issue (including size bullets fed by props)', () => {
    render(<RailLegalityView view={{ status: 'not_legal', bullets: ['16 cards short of 100', '1 banned card: Mana Crypt'], subline: null }} />)
    const box = screen.getByTestId('rail-legality')
    expect(box).toHaveAttribute('data-state', 'not_legal')
    expect(box.className).toMatch(/\bborder\b/)
    expect(box.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('Not legal yet')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((l) => l.textContent)).toEqual(['16 cards short of 100', '1 banned card: Mana Crypt'])
  })
  it('Unverified: amber dot, "Legal so far" and the unchecked cards line', () => {
    render(<RailLegalityView view={{ status: 'unverified', bullets: [], subline: "4 cards couldn't be checked: Khalni Ambush, Find // Finality + 2 more. Nothing found illegal." }} />)
    expect(screen.getByText('Legal so far')).toBeInTheDocument()
    expect(screen.getByText(/4 cards couldn't be checked/)).toBeInTheDocument()
    expect(screen.getByTestId('rail-legality')).toHaveAttribute('data-state', 'unverified')
  })
})
