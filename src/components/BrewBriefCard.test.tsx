import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrewBriefCard } from './BrewBriefCard'
import type { StrategyBrief } from '@/types/brew'

const baseBrief: StrategyBrief = {
  commanderName: 'Muldrotha, the Gravetide',
  colourIdentity: ['U', 'B', 'G'],
  primaryWinCondition: 'Infinite combo via Spore Frog loop',
  secondaryWinCondition: 'Value grind with recurring permanents',
  targetBracket: 3,
  knownIncludes: ['Spore Frog', 'Glacial Chasm', 'Seal of Primordium'],
  playstyleDescription: 'Grindy recursion engine with combo finish',
  budgetPreference: 'budget',
  budgetCeiling: 150,
}

describe('BrewBriefCard', () => {
  it('renders the commander name', () => {
    render(<BrewBriefCard brief={baseBrief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
  })

  it('renders colour pips for colour identity', () => {
    const { container } = render(
      <BrewBriefCard brief={baseBrief} onConfirm={() => {}} onEdit={() => {}} />
    )
    const pipsWrapper = container.querySelector('[role="img"]')
    expect(pipsWrapper).toHaveAttribute('aria-label', 'Blue, Black, Green')
  })

  it('displays primary and secondary win conditions', () => {
    render(<BrewBriefCard brief={baseBrief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Infinite combo via Spore Frog loop')).toBeInTheDocument()
    expect(screen.getByText('Value grind with recurring permanents')).toBeInTheDocument()
  })

  it('shows target bracket formatted as "Bracket X"', () => {
    render(<BrewBriefCard brief={baseBrief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Bracket 3')).toBeInTheDocument()
  })

  it('renders known includes as chips', () => {
    render(<BrewBriefCard brief={baseBrief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Spore Frog')).toBeInTheDocument()
    expect(screen.getByText('Glacial Chasm')).toBeInTheDocument()
    expect(screen.getByText('Seal of Primordium')).toBeInTheDocument()
  })

  it('shows "None specified" when knownIncludes is empty', () => {
    const brief = { ...baseBrief, knownIncludes: [] }
    render(<BrewBriefCard brief={brief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('None specified')).toBeInTheDocument()
  })

  it('displays playstyle description', () => {
    render(<BrewBriefCard brief={baseBrief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Grindy recursion engine with combo finish')).toBeInTheDocument()
  })

  it('shows budget preference with ceiling when budget type', () => {
    render(<BrewBriefCard brief={baseBrief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Budget ($150)')).toBeInTheDocument()
  })

  it('shows "Collection only" for collection budget preference', () => {
    const brief = { ...baseBrief, budgetPreference: 'collection' as const }
    render(<BrewBriefCard brief={brief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Collection only')).toBeInTheDocument()
  })

  it('shows "Unrestricted" for unrestricted budget preference', () => {
    const brief = { ...baseBrief, budgetPreference: 'unrestricted' as const }
    render(<BrewBriefCard brief={brief} onConfirm={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Unrestricted')).toBeInTheDocument()
  })

  it('calls onConfirm when Confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<BrewBriefCard brief={baseBrief} onConfirm={onConfirm} onEdit={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onEdit when Edit button is clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<BrewBriefCard brief={baseBrief} onConfirm={() => {}} onEdit={onEdit} />)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
