import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { FinishTag } from './FinishTag'

describe('FinishTag', () => {
  it('renders Foil with auto_awesome icon', () => {
    render(<FinishTag finish="foil" />)
    expect(screen.getByText('Foil')).toBeInTheDocument()
  })

  it('renders Etched with texture icon', () => {
    render(<FinishTag finish="etched" />)
    expect(screen.getByText('Etched')).toBeInTheDocument()
  })

  it('renders Nonfoil only when showNonfoil is true', () => {
    const { rerender } = render(<FinishTag finish="nonfoil" />)
    expect(screen.queryByText('Nonfoil')).not.toBeInTheDocument()

    rerender(<FinishTag finish="nonfoil" showNonfoil />)
    expect(screen.getByText('Nonfoil')).toBeInTheDocument()
  })
})
