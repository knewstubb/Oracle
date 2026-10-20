import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  BadgeSkeleton,
  CardRowSkeleton,
  DeckTileSkeleton,
} from './skeletons'

describe('Shaped skeletons', () => {
  it('DeckTileSkeleton has deck-tile shape and loading label', () => {
    render(<DeckTileSkeleton />)
    expect(screen.getByLabelText('Loading deck')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4)
  })

  it('CardRowSkeleton has row shape and loading label', () => {
    render(<CardRowSkeleton />)
    expect(screen.getByLabelText('Loading card row')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
  })

  it('BadgeSkeleton has pill shape and loading label', () => {
    render(<BadgeSkeleton />)
    expect(screen.getByLabelText('Loading badge')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  })
})
